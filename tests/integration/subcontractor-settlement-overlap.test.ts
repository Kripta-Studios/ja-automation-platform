import { afterEach, describe, expect, it } from 'vitest';
import { V3ConflictError } from '@ja/database';
import {
  approveSettlement,
  settlementDetail,
  settlementOverview,
  SettlementActionError,
} from '../../apps/portal/src/lib/server/subcontractor-settlement.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

// T02 (audit 2026-11-22, decision D7): hours already paid through a monthly compensation
// settlement must never be offered again as payable in the weekly subcontractor settlement.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

const stamp = '2026-11-01T00:00:00.000Z';
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const principal = stepUpB5Principal(f.sqlite, f.finance, 'settlement');
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
  return { ...f, principal };
}

function settleMonth(f: ReturnType<typeof fixture>) {
  f.sqlite
    .prepare(
      `INSERT INTO compensation_settlement(id,worker_id,project_id,compensation_rule_id,period_start,period_end,source_basis,source_amount_minor,amount_minor,currency,state,settled_at,created_at,updated_at)
       VALUES('month',?,?,'pay-rule','2026-11-01','2026-11-30','APPROVED_TIME',1620,148500,'EUR','settled',?,?,?)`,
    )
    .run(f.worker.userId, f.project.id, stamp, stamp, stamp);
  f.sqlite
    .prepare(
      `INSERT INTO worker_compensation_payment_event(id,settlement_id,event_type,payee_kind,payee_user_id,amount_minor,currency,paid_on,reference,created_by,created_at,idempotency_key)
       VALUES('pay-1','month','payment','person',?,148500,'EUR','2026-11-30','November',?,?,'k-1')`,
    )
    .run(f.worker.userId, f.finance.userId, stamp);
}

const week = { start: '2026-11-16', end: '2026-11-22' };

describe('subcontractor settlement vs compensation settlements (T02)', () => {
  it('shows an internal worker read-only and refuses to approve him weekly', () => {
    const f = fixture();
    const overview = settlementOverview(f, { ...week, q: '', status: 'all', limit: 25 });
    const row = overview.rows.find((candidate) => candidate.key === `person:${f.worker.userId}`);
    expect(row).toMatchObject({ kind: 'person', payable: false });
    expect(() => approveSettlement(f, { payee: `person:${f.worker.userId}`, ...week })).toThrow(
      SettlementActionError,
    );
    expect(f.sqlite.prepare('SELECT COUNT(*) count FROM compensation_settlement').get()).toEqual({
      count: 0,
    });
  });

  it('matches a paid monthly settlement to the week by entry date (paid, not draft)', () => {
    const f = fixture();
    settleMonth(f);
    const detail = settlementDetail(f, { payee: `person:${f.worker.userId}`, ...week });
    expect(detail?.status).toBe('paid');
    expect(detail?.coveredByLongerPeriod).toBe(true);
  });

  it('refuses to settle hours that an overlapping settled period already covers', () => {
    const f = fixture();
    f.sqlite
      .prepare(
        `INSERT INTO compensation_settlement(id,worker_id,project_id,compensation_rule_id,period_start,period_end,source_basis,source_amount_minor,amount_minor,currency,state,settled_at,created_at,updated_at)
         VALUES('month',?,?,'pay-rule','2026-11-01','2026-11-30','APPROVED_TIME',1620,148500,'EUR','settled',?,?,?)`,
      )
      .run(f.worker.userId, f.project.id, stamp, stamp, stamp);
    expect(() =>
      f.v3.settleCompensation(f.principal, {
        workerId: f.worker.userId,
        projectId: f.project.id,
        periodStart: week.start,
        periodEnd: week.end,
      }),
    ).toThrow(V3ConflictError);
    expect(() =>
      f.v3.settleCompensation(f.principal, {
        workerId: f.worker.userId,
        projectId: f.project.id,
        periodStart: week.start,
        periodEnd: week.end,
      }),
    ).toThrow(/already settled in 2026-11-01 to 2026-11-30/);
  });
});
