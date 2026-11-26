import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  PayBillingIntervalRepository,
  ValidationError,
  clientBillingInterval,
  effectivePayInterval,
  nextInvoicePeriod,
  nextOwnPayPeriod,
  nextPayPeriod,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

/** Pay and billing intervals (owner request 2026-11-25, migration 0094). */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

function setup() {
  const base = createB5LifecycleSecurityFixture();
  fixtures.push(base);
  const f = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'intervals'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'intervals'),
    worker: stepUpB5Principal(base.sqlite, base.worker, 'intervals'),
  };
  const member = f.sqlite
    .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
    .get(f.project.id, f.worker.userId) as { id: string };
  const time = (date: string, minutes = 480) => {
    const row = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: `Work ${date}`,
    });
    f.repository.submitTime(f.worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(f.finance, row.id, true);
    return row.id;
  };
  return { ...f, member: member.id, time, intervals: new PayBillingIntervalRepository(f.sqlite) };
}

const audits = (f: ReturnType<typeof setup>, action: string) =>
  f.sqlite.prepare('SELECT entity_type,entity_id FROM audit_event WHERE action=?').all(action);

describe('pay intervals', () => {
  it('saves a person default and an assignment override as audited versions', () => {
    const f = setup();
    expect(effectivePayInterval(f.sqlite, f.worker.userId, f.member)).toEqual({
      interval: null,
      anchorDate: null,
      source: 'none',
    });
    // Nothing chosen writes nothing.
    f.intervals.setPersonInterval(f.owner, {
      userId: f.worker.userId,
      interval: null,
      expectedVersion: 0,
    });
    expect(f.sqlite.prepare('SELECT count(*) count FROM pay_interval_setting').get()).toEqual({
      count: 0,
    });
    const person = f.intervals.setPersonInterval(f.finance, {
      userId: f.worker.userId,
      interval: 'monthly',
      expectedVersion: 0,
    });
    expect(person).toMatchObject({ interval: 'monthly', version: 1 });
    expect(effectivePayInterval(f.sqlite, f.worker.userId, f.member)).toMatchObject({
      interval: 'monthly',
      source: 'person',
    });
    f.intervals.setAssignmentInterval(f.owner, {
      projectMemberId: f.member,
      interval: 'every_14_days',
      anchorDate: '2026-11-02',
      expectedVersion: 0,
    });
    expect(effectivePayInterval(f.sqlite, f.worker.userId, f.member)).toEqual({
      interval: 'every_14_days',
      anchorDate: '2026-11-02',
      source: 'assignment',
    });
    // Back to "same as the person" keeps history.
    f.intervals.setAssignmentInterval(f.owner, {
      projectMemberId: f.member,
      interval: null,
      expectedVersion: 1,
    });
    expect(effectivePayInterval(f.sqlite, f.worker.userId, f.member).source).toBe('person');
    expect(f.sqlite.prepare('SELECT count(*) count FROM pay_interval_setting').get()).toEqual({
      count: 3,
    });
    expect(audits(f, 'worker.pay_interval_set')).toEqual([
      { entity_type: 'user', entity_id: f.worker.userId },
    ]);
    expect(audits(f, 'assignment.pay_interval_set')).toHaveLength(2);
    expect(() =>
      f.sqlite.prepare("UPDATE pay_interval_setting SET pay_interval='weekly'").run(),
    ).toThrow(/append-only/);
  });

  it('rejects stale versions, bad values and other roles', () => {
    const f = setup();
    f.intervals.setPersonInterval(f.owner, {
      userId: f.worker.userId,
      interval: 'weekly',
      expectedVersion: 0,
    });
    expect(() =>
      f.intervals.setPersonInterval(f.owner, {
        userId: f.worker.userId,
        interval: 'monthly',
        expectedVersion: 0,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      f.intervals.setPersonInterval(f.owner, {
        userId: f.worker.userId,
        interval: 'daily' as never,
        expectedVersion: 1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      f.intervals.setPersonInterval(f.worker, {
        userId: f.worker.userId,
        interval: 'monthly',
        expectedVersion: 1,
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      f.intervals.setAssignmentInterval(f.manager, {
        projectMemberId: f.member,
        interval: 'weekly',
        expectedVersion: 0,
      }),
    ).toThrow(AccessDeniedError);
  });

  it('finds the next pay period from settlements and open approved hours', () => {
    const f = setup();
    f.intervals.setPersonInterval(f.owner, {
      userId: f.worker.userId,
      interval: 'monthly',
      expectedVersion: 0,
    });
    // Nothing worked: the month in progress.
    expect(nextPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-25' }).period).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    f.time('2026-10-12');
    f.time('2026-11-03');
    // October hours not paid yet: October first.
    expect(nextPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-25' })).toMatchObject({
      interval: 'monthly',
      source: 'person',
      period: { start: '2026-10-01', end: '2026-10-31' },
      lastPaidEnd: null,
    });
    f.v3.createCompensationRule(f.finance, {
      workerId: f.worker.userId,
      projectId: f.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 2000n,
      overtimeMethod: 'NONE',
      travelMethod: 'BASE',
      effectiveFrom: '2026-01-01',
    });
    f.v3.settleCompensation(f.finance, {
      workerId: f.worker.userId,
      projectId: f.project.id,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });
    expect(nextPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-25' })).toMatchObject({
      period: { start: '2026-11-01', end: '2026-11-30' },
      lastPaidEnd: '2026-10-31',
    });
    // Unset interval: no period unless the screen passes its own fallback.
    const other = nextPayPeriod(f.sqlite, f.manager.userId, { today: '2026-11-25' });
    expect(other.period).toBeNull();
    expect(
      nextPayPeriod(f.sqlite, f.manager.userId, { today: '2026-11-25', fallback: 'weekly' }).period,
    ).toEqual({ start: '2026-11-23', end: '2026-11-29' });
  });

  it('My Pay follows an assignment override when it is the only interval set', () => {
    const f = setup();
    f.sqlite.prepare('UPDATE project_member SET ends_on=NULL WHERE id=?').run(f.member);
    expect(nextOwnPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-26' }).period).toBeNull();
    f.intervals.setAssignmentInterval(f.owner, {
      projectMemberId: f.member,
      interval: 'weekly',
      expectedVersion: 0,
    });
    expect(nextOwnPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-26' })).toMatchObject({
      interval: 'weekly',
      source: 'assignment',
      period: { start: '2026-11-23', end: '2026-11-29' },
    });
    // A monthly person default does not hide the weekly assignment pay that comes first.
    f.intervals.setPersonInterval(f.owner, {
      userId: f.worker.userId,
      interval: 'monthly',
      expectedVersion: 0,
    });
    expect(nextOwnPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-26' })).toMatchObject({
      interval: 'weekly',
      source: 'assignment',
    });
    // Without the override the person interval drives it.
    f.intervals.setAssignmentInterval(f.owner, {
      projectMemberId: f.member,
      interval: null,
      expectedVersion: 1,
    });
    expect(nextOwnPayPeriod(f.sqlite, f.worker.userId, { today: '2026-11-26' })).toMatchObject({
      interval: 'monthly',
      source: 'person',
      period: { start: '2026-11-01', end: '2026-11-30' },
    });
  });
});

describe('client billing interval', () => {
  it('saves the client default with cutoff day or two-week start, audited', () => {
    const f = setup();
    expect(clientBillingInterval(f.sqlite, f.client.id)).toBeNull();
    const saved = f.intervals.setClientInterval(f.owner, {
      clientId: f.client.id,
      cadence: 'monthly',
      monthlyCutoffDay: 25,
      expectedVersion: 0,
    });
    expect(saved).toMatchObject({
      cadence: 'monthly',
      monthlyCutoffDay: 25,
      anchorDate: null,
      version: 1,
    });
    expect(() =>
      f.intervals.setClientInterval(f.owner, {
        clientId: f.client.id,
        cadence: 'every_14_days',
        expectedVersion: 1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      f.intervals.setClientInterval(f.owner, {
        clientId: f.client.id,
        cadence: 'monthly',
        monthlyCutoffDay: 31,
        expectedVersion: 1,
      }),
    ).toThrow(ValidationError);
    f.intervals.setClientInterval(f.finance, {
      clientId: f.client.id,
      cadence: 'milestone',
      expectedVersion: 1,
    });
    expect(clientBillingInterval(f.sqlite, f.client.id)).toMatchObject({
      cadence: 'milestone',
      monthlyCutoffDay: null,
      version: 2,
    });
    expect(audits(f, 'client.billing_interval_set')).toHaveLength(2);
    expect(() =>
      f.intervals.setClientInterval(f.manager, {
        clientId: f.client.id,
        cadence: 'weekly',
        expectedVersion: 2,
      }),
    ).toThrow(AccessDeniedError);
  });

  it('finds the next invoice period of a billing stream', () => {
    const f = setup();
    const entity = f.repository.createLegalEntity(f.owner, {
      code: 'INTV',
      legalName: 'Interval issuer',
      currency: 'EUR',
      billingAddress: 'Test address',
      companyIdentifiers: 'INTV',
    });
    const rule = f.repository.createBillingRule(f.finance, {
      projectId: f.project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      includeExpenses: false,
      cadenceType: 'monthly',
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });
    const row = f.sqlite.prepare('SELECT * FROM billing_rule WHERE id=?').get(rule.id) as never;
    expect(nextInvoicePeriod(f.sqlite, row, '2026-11-25')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    f.time('2026-09-14');
    expect(nextInvoicePeriod(f.sqlite, row, '2026-11-25')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    const manual = { ...(row as object), cadence_type: 'manual' } as never;
    expect(nextInvoicePeriod(f.sqlite, manual, '2026-11-25')).toBeNull();
  });
});
