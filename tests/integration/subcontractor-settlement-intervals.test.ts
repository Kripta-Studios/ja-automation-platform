import { afterEach, describe, expect, it } from 'vitest';
import { AssignmentExtrasRepository, PayBillingIntervalRepository } from '@ja/database';
import {
  payeeNextPeriod,
  settlementDetail,
  settlementOverview,
  settlementPeriod,
} from '../../apps/portal/src/lib/server/subcontractor-settlement.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

// Owner request 2026-11-25: settlement periods follow each person's pay interval, and the
// preview includes the worker-side per diem / allowance.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

const stamp = '2026-11-01T00:00:00.000Z';
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const principal = stepUpB5Principal(f.sqlite, f.finance, 'settlement');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'settlement');
  f.sqlite
    .prepare(
      `INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at)
       VALUES('pay-rule',?,?,'EUR',5500,'hourly','2026-01-01',?,?)`,
    )
    .run(f.worker.userId, f.project.id, stamp, stamp);
  for (const day of ['2026-11-16', '2026-11-17', '2026-11-18'])
    f.sqlite
      .prepare(
        `INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at)
         VALUES(?,?,?,?,'regular',540,'approved','billable',?,?)`,
      )
      .run(`time-${day}`, f.project.id, f.worker.userId, day, stamp, stamp);
  return { ...f, principal, owner };
}

describe('settlement periods by pay interval', () => {
  it('builds weekly, twice-a-month and monthly periods with previous and next', () => {
    expect(settlementPeriod('2026-11-18', 'weekly', '2026-11-26')).toMatchObject({
      start: '2026-11-16',
      end: '2026-11-22',
      interval: 'weekly',
      previous: '2026-11-09',
      next: '2026-11-23',
    });
    expect(settlementPeriod('2026-11-18', 'semi_monthly', '2026-11-26')).toMatchObject({
      start: '2026-11-16',
      end: '2026-11-30',
      previous: '2026-11-01',
      next: '2026-12-01',
    });
    // No day chosen: the last complete period.
    expect(settlementPeriod(null, 'monthly', '2026-11-26')).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-31',
      interval: 'monthly',
    });
  });

  it('opens a payee on the period its next pay covers, with its interval', () => {
    const f = fixture();
    const payee = `person:${f.worker.userId}` as const;
    expect(payeeNextPeriod(f.sqlite, payee, '2026-11-26')).toMatchObject({
      interval: 'weekly',
      start: '2026-11-16',
      end: '2026-11-22',
    });
    new PayBillingIntervalRepository(f.sqlite).setPersonInterval(f.owner, {
      userId: f.worker.userId,
      interval: 'monthly',
      expectedVersion: 0,
    });
    expect(payeeNextPeriod(f.sqlite, payee, '2026-11-26')).toMatchObject({
      interval: 'monthly',
      start: '2026-11-01',
      end: '2026-11-30',
    });
    const overview = settlementOverview(f, {
      start: '2026-11-16',
      end: '2026-11-22',
      q: '',
      status: 'all',
      limit: 25,
    });
    expect(overview.rows.find((row) => row.key === payee)?.interval).toBe('monthly');
  });

  it('adds the worker-side per diem to the preview estimate', () => {
    const f = fixture();
    const payee = `person:${f.worker.userId}` as const;
    const period = { start: '2026-11-16', end: '2026-11-22' };
    const before = settlementDetail(f, { payee, ...period });
    // 3 days × 9 h × 55.00 = 1485.00
    expect(before?.totals).toEqual([{ currency: 'EUR', minor: '148500' }]);
    expect(before?.extras).toEqual([]);
    const member = f.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(f.project.id, f.worker.userId) as { id: string };
    new AssignmentExtrasRepository(f.sqlite).set(f.owner, {
      projectMemberId: member.id,
      expectedVersion: 0,
      perDiemWorkerMinor: '3000',
    });
    const after = settlementDetail(f, { payee, ...period });
    expect(after?.extras).toEqual([
      expect.objectContaining({
        kind: 'per_diem',
        units: 3,
        rateMinor: '3000',
        amountMinor: '9000',
      }),
    ]);
    expect(after?.totals).toEqual([{ currency: 'EUR', minor: '157500' }]);
    expect(after?.workers[0]?.estimate).toEqual([{ currency: 'EUR', minor: '157500' }]);
  });
});
