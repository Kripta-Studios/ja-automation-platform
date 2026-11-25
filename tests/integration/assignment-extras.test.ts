import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AssignmentExtrasRepository,
  ConflictError,
  ValidationError,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

/**
 * Assignment extras (owner request 2026-11-25): per diem, safety allowance and overtime per
 * person, client side on invoices and worker side in My Pay / settlements. Everything is
 * optional; nothing set changes nothing.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

function setup() {
  const base = createB5LifecycleSecurityFixture();
  fixtures.push(base);
  const f = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'extras'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'extras'),
    worker: stepUpB5Principal(base.sqlite, base.worker, 'extras'),
  };
  f.v3.createClientLaborRate(f.finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 6000n,
    rateBasis: 'hourly',
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  f.v3.createInternalCostRule(f.finance, {
    workerId: f.worker.userId,
    projectId: f.project.id,
    currency: 'EUR',
    hourlyRateMinor: 1500n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  f.v3.createCompensationRule(f.finance, {
    workerId: f.worker.userId,
    projectId: f.project.id,
    currency: 'EUR',
    ruleType: 'Hourly',
    rateMinor: 2000n,
    overtimeMethod: 'NONE',
    travelMethod: 'BASE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(f.owner, {
    code: 'EXTR',
    legalName: 'Extras issuer',
    currency: 'EUR',
    billingAddress: 'Test address',
    companyIdentifiers: 'EXTRAS',
  });
  const rule = f.repository.createBillingRule(f.finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    includeExpenses: false,
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const member = f.sqlite
    .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
    .get(f.project.id, f.worker.userId) as { id: string };
  const time = (date: string, minutes = 480, category = 'regular') => {
    const row = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: date,
      category,
      minutes,
      summary: `Work ${date}`,
    });
    f.repository.submitTime(f.worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(f.finance, row.id, true);
    return row.id;
  };
  const extras = new AssignmentExtrasRepository(f.sqlite);
  const dryRun = (start: string, end: string) => {
    const result = f.repository.invoiceDraftDryRun(f.finance, rule.id, start, end);
    if (!result.ok) throw new Error(`Dry run blocked: ${JSON.stringify(result.reasons)}`);
    return result;
  };
  const extraLines = (
    lines: ReadonlyArray<{
      snapshotJson: string | null;
      subtotalMinor: string;
      description: string;
    }>,
  ) =>
    lines
      .map((line) => ({
        ...line,
        snapshot: JSON.parse(line.snapshotJson ?? '{}') as Record<string, unknown>,
      }))
      .filter((line) => typeof line.snapshot.extraKind === 'string');
  return { ...f, rule, member: member.id, time, extras, dryRun, extraLines };
}

describe('assignment extras', () => {
  it('saves optional extras as audited versions for Owner/Finance only', () => {
    const f = setup();
    expect(f.extras.get(f.owner, f.member)).toMatchObject({ extras: null, expenses: null });
    // Nothing chosen writes nothing.
    f.extras.set(f.owner, { projectMemberId: f.member, expectedVersion: 0 });
    expect(f.sqlite.prepare('SELECT count(*) count FROM assignment_extra').get()).toEqual({
      count: 0,
    });
    const saved = f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 0,
      perDiemClientMinor: '5000',
      perDiemWorkerMinor: '3000',
      allowanceBasis: 'month',
      allowanceClientMinor: '100000',
      allowanceWorkerMinor: '60000',
      overtimeClient: { method: 'multiplier', value: '15000' },
      overtimeWorker: { method: 'rate', value: '2500' },
    });
    expect(saved.extras).toMatchObject({
      version: 1,
      currency: 'EUR',
      perDiemClientMinor: '5000',
      allowanceBasis: 'month',
      overtimeClient: { method: 'multiplier', value: '15000' },
    });
    const audit = f.sqlite
      .prepare(
        "SELECT entity_id,details_json FROM audit_event WHERE action='assignment.extras_set'",
      )
      .all() as Array<{ entity_id: string; details_json: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.entity_id).toBe(f.member);
    expect(JSON.parse(audit[0]!.details_json)).toMatchObject({
      version: 1,
      before: null,
      after: { perDiemClientMinor: '5000', allowanceWorkerMinor: '60000' },
    });
    // Stale version, invalid amounts and missing allowance basis are refused.
    expect(() =>
      f.extras.set(f.owner, {
        projectMemberId: f.member,
        expectedVersion: 0,
        perDiemClientMinor: '1',
      }),
    ).toThrow(ConflictError);
    expect(() =>
      f.extras.set(f.owner, {
        projectMemberId: f.member,
        expectedVersion: 1,
        perDiemClientMinor: '1.5',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      f.extras.set(f.owner, {
        projectMemberId: f.member,
        expectedVersion: 1,
        allowanceClientMinor: '10',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      f.extras.set(f.owner, {
        projectMemberId: f.member,
        expectedVersion: 1,
        overtimeClient: { method: 'multiplier', value: '5000' },
      }),
    ).toThrow(ValidationError);
    // Workers and project managers never read or write extras (client rates, pay).
    expect(() => f.extras.get(f.worker, f.member)).toThrow(AccessDeniedError);
    expect(() => f.extras.get(f.manager, f.member)).toThrow(AccessDeniedError);
    expect(() =>
      f.extras.set(f.manager, { projectMemberId: f.member, expectedVersion: 1 }),
    ).toThrow(AccessDeniedError);
    // Clearing everything is a new version; the history stays.
    f.extras.set(f.finance, { projectMemberId: f.member, expectedVersion: 1 });
    expect(f.extras.get(f.owner, f.member).extras).toMatchObject({
      version: 2,
      perDiemClientMinor: null,
      overtimeClient: null,
    });
    expect(() => f.sqlite.prepare('DELETE FROM assignment_extra').run()).toThrow(/append-only/u);
  });

  it('reuses the assignment expense policy for the expense choice', () => {
    const f = setup();
    f.extras.set(f.owner, { projectMemberId: f.member, expectedVersion: 0, expenses: 'both' });
    expect(f.extras.get(f.owner, f.member).expenses).toBe('both');
    const policy = f.sqlite
      .prepare(
        'SELECT payer,worker_reimbursement,client_recovery FROM assignment_expense_policy WHERE project_member_id=?',
      )
      .get(f.member);
    expect(policy).toEqual({
      payer: 'worker',
      worker_reimbursement: 'at_cost',
      client_recovery: 'at_cost',
    });
    expect(
      f.sqlite
        .prepare("SELECT 1 FROM audit_event WHERE action='assignment.expense_policy_create'")
        .get(),
    ).toBeTruthy();
  });

  it('bills per diem per worked day once, and a monthly allowance once per month', () => {
    const f = setup();
    f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 0,
      perDiemClientMinor: '5000',
      perDiemWorkerMinor: '3000',
      allowanceBasis: 'month',
      allowanceClientMinor: '100000',
    });
    f.time('2026-08-03');
    f.time('2026-08-03', 60); // a second entry on the same day is still one day
    f.time('2026-08-04');
    const readiness = f.repository.billingReadiness(
      f.finance,
      f.rule.id,
      '2026-08-01',
      '2026-08-15',
    );
    expect(readiness.assignmentExtras).toEqual([
      expect.objectContaining({
        kind: 'allowance',
        basis: 'month',
        units: 1,
        amountMinor: '100000',
      }),
      expect.objectContaining({ kind: 'per_diem', basis: 'day', units: 2, amountMinor: '10000' }),
    ]);
    const first = f.repository.createInvoiceDraft(f.finance, f.rule.id, '2026-08-01', '2026-08-15');
    const lines = f.sqlite
      .prepare(
        'SELECT description,quantity_numerator,unit_price_minor,subtotal_minor,source_type,snapshot_json FROM invoice_line WHERE invoice_id=? ORDER BY rowid',
      )
      .all(first.id) as Array<Record<string, unknown>>;
    const extras = lines.filter((line) => String(line.snapshot_json).includes('extraKind'));
    expect(
      extras.map((line) => [line.quantity_numerator, line.unit_price_minor, line.subtotal_minor]),
    ).toEqual([
      [1, 100000, 100000],
      [2, 5000, 10000],
    ]);
    expect(extras.every((line) => line.source_type === 'billing_adjustment')).toBe(true);
    expect(String(extras[1]!.description)).toMatch(
      /^Per diem · .+ · 2 days \(2026-08-03 to 2026-08-04\)$/u,
    );
    // Worker pay amounts never reach the invoice.
    expect(JSON.stringify(extras)).not.toContain('3000');
    const invoice = f.sqlite
      .prepare('SELECT subtotal_minor FROM invoice WHERE id=?')
      .get(first.id) as { subtotal_minor: number };
    // 8h + 1h + 8h at 60.00 = 1020.00, + 100.00 per diem + 1000.00 allowance.
    expect(invoice.subtotal_minor).toBe(102000 + 10000 + 100000);
    expect(
      f.sqlite
        .prepare(
          "SELECT reason_code FROM invoice_commercial_source_manifest WHERE invoice_id=? AND source_type='minimum_top_up' ORDER BY reason_code",
        )
        .all(first.id),
    ).toEqual([{ reason_code: 'assignment_allowance' }, { reason_code: 'assignment_per_diem' }]);

    // A later invoice in the same month: new days get per diem, the month is not billed again.
    f.time('2026-08-20');
    const later = f.dryRun('2026-08-16', '2026-08-31');
    expect(
      f.extraLines(later.lines).map((line) => [line.snapshot.extraKind, line.snapshot.extraUnits]),
    ).toEqual([['per_diem', ['2026-08-20']]]);
    // A selected invoice over the whole month counts every approved day, but days already
    // on another live invoice are never billed twice.
    const lateId = f.sqlite
      .prepare("SELECT id,version FROM time_entry WHERE work_date='2026-08-20'")
      .get() as { id: string; version: number };
    const overlap = f.repository.invoiceDraftDryRun(
      f.finance,
      f.rule.id,
      '2026-08-01',
      '2026-08-31',
      [{ type: 'time', id: lateId.id, version: lateId.version }],
    );
    if (!overlap.ok) throw new Error(JSON.stringify(overlap.reasons));
    expect(f.extraLines(overlap.lines).map((line) => line.snapshot.extraUnits)).toEqual([
      ['2026-08-20'],
    ]);
  });

  it('treats extras as calculation inputs: a change after drafting makes the draft stale', () => {
    const f = setup();
    f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 0,
      perDiemClientMinor: '5000',
    });
    f.time('2026-08-03');
    const draft = f.repository.createInvoiceDraft(f.finance, f.rule.id, '2026-08-01', '2026-08-15');
    f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 1,
      perDiemClientMinor: '6000',
    });
    expect(() => f.repository.approveInvoiceDraft(f.finance, draft.id)).toThrow();
    // Rebuilding the draft picks up the new amount and approves.
    const rebuilt = f.repository.createInvoiceDraft(
      f.finance,
      f.rule.id,
      '2026-08-01',
      '2026-08-15',
    );
    expect(
      f.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(rebuilt.id),
    ).toEqual({
      subtotal_minor: 48000 + 6000,
    });
    f.repository.approveInvoiceDraft(f.finance, rebuilt.id);
    expect(f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(rebuilt.id)).toEqual({
      state: 'approved',
    });
  });

  it('lets one invoice leave out per diem, allowance and overtime for a person', () => {
    const f = setup();
    f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 0,
      perDiemClientMinor: '5000',
      allowanceBasis: 'day',
      allowanceClientMinor: '2000',
    });
    f.time('2026-08-03');
    f.time('2026-08-03', 60, 'overtime');
    // Without a choice, overtime is billed (here at the regular rate: overtime method NONE).
    const full = f.dryRun('2026-08-01', '2026-08-15');
    expect(full.totals.subtotalMinor).toBe(String(48000 + 6000 + 5000 + 2000));
    // Leaving components out of this invoice only:
    const leaveOut = {
      people: [
        { workerId: f.worker.userId, category: 'overtime', billedMinutes: 0 },
        { workerId: f.worker.userId, category: 'per_diem', billedMinutes: 0 },
      ],
    };
    const partial = f.repository.withInvoiceOverrides(leaveOut, () =>
      f.dryRun('2026-08-01', '2026-08-15'),
    );
    expect(partial.totals.subtotalMinor).toBe(String(48000 + 2000));
    expect(f.extraLines(partial.lines).map((line) => line.snapshot.extraKind)).toEqual([
      'allowance',
    ]);
    expect(partial.lines.filter((line) => line.sourceType === 'time')).toHaveLength(1);
    // The left-out per diem stays open: the next invoice of these dates still bills it.
    const draft = f.repository.withInvoiceOverrides(leaveOut, () =>
      f.repository.createInvoiceDraft(f.finance, f.rule.id, '2026-08-01', '2026-08-15'),
    );
    expect(
      f.sqlite
        .prepare(
          'SELECT category,billed_minutes FROM invoice_line_override WHERE invoice_id=? AND superseded_at IS NULL ORDER BY category',
        )
        .all(draft.id),
    ).toEqual([
      { category: 'overtime', billed_minutes: 0 },
      { category: 'per_diem', billed_minutes: 0 },
    ]);
    // Another invoice of that day: the allowance is on the draft, the per diem is still open.
    const next = f.repository.billingReadiness(f.finance, f.rule.id, '2026-08-03', '2026-08-03');
    expect(next.assignmentExtras.map((charge) => charge.kind)).toEqual(['per_diem']);
  });

  it('prices overtime from the assignment multiplier on both sides', () => {
    const f = setup();
    f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 0,
      overtimeClient: { method: 'multiplier', value: '15000' },
      overtimeWorker: { method: 'multiplier', value: '15000' },
    });
    f.time('2026-08-03', 480);
    f.time('2026-08-03', 120, 'overtime');
    const result = f.dryRun('2026-08-01', '2026-08-15');
    const overtime = result.lines.find(
      (line) =>
        line.sourceType === 'time' &&
        JSON.parse(line.snapshotJson ?? '{}').commercialCategory === 'overtime',
    );
    // 60.00 × 1.5 = 90.00 per hour; 2 h = 180.00.
    expect(overtime).toMatchObject({ unitPriceMinor: '9000', subtotalMinor: '18000' });
    const pay = f.v3.workerPay(f.worker, '2026-08-01', '2026-08-15');
    // 8 h × 20.00 + 2 h × 30.00.
    expect(pay.estimatedApprovedMinor).toBe(String(16000 + 6000));
  });

  it('pays worker extras in My Pay and settlements, a monthly allowance once', () => {
    const f = setup();
    f.extras.set(f.owner, {
      projectMemberId: f.member,
      expectedVersion: 0,
      perDiemClientMinor: '9000',
      perDiemWorkerMinor: '3000',
      allowanceBasis: 'month',
      allowanceWorkerMinor: '50000',
    });
    f.time('2026-08-03', 60);
    f.time('2026-08-12', 60);
    const week = f.v3.workerPay(f.worker, '2026-08-01', '2026-08-09');
    // 1 h × 20.00 + 1 day × 30.00 + the month's allowance (its first worked day is here).
    expect(week.estimatedApprovedMinor).toBe(String(2000 + 3000 + 50000));
    expect(week.extras).toEqual([
      expect.objectContaining({
        kind: 'allowance',
        basis: 'month',
        amountMinor: '50000',
        state: 'approved',
      }),
      expect.objectContaining({
        kind: 'per_diem',
        units: 1,
        amountMinor: '3000',
        state: 'approved',
      }),
    ]);
    // The worker sees their own pay, never the client side.
    expect(JSON.stringify(week)).not.toContain('9000');
    const second = f.v3.workerPay(f.worker, '2026-08-10', '2026-08-16');
    expect(second.estimatedApprovedMinor).toBe(String(2000 + 3000));

    const settledFirst = f.v3.settleCompensation(f.finance, {
      workerId: f.worker.userId,
      projectId: f.project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-09',
    });
    expect(settledFirst.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)).toBe(55000n);
    const settledSecond = f.v3.settleCompensation(f.finance, {
      workerId: f.worker.userId,
      projectId: f.project.id,
      periodStart: '2026-08-10',
      periodEnd: '2026-08-16',
    });
    expect(settledSecond.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)).toBe(5000n);
    // Retrying the first settlement is idempotent (same amounts, the month is still its own).
    expect(
      f.v3
        .settleCompensation(f.finance, {
          workerId: f.worker.userId,
          projectId: f.project.id,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-09',
        })
        .reduce((sum, row) => sum + BigInt(row.amountMinor), 0n),
    ).toBe(55000n);
    const audit = f.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='compensation.settle' ORDER BY rowid LIMIT 1",
      )
      .get() as { details_json: string };
    expect(JSON.parse(audit.details_json).assignmentExtras).toHaveLength(2);
  });

  it('changes nothing for people without extras', () => {
    const f = setup();
    f.time('2026-08-03');
    const before = f.dryRun('2026-08-01', '2026-08-15');
    expect(f.extraLines(before.lines)).toEqual([]);
    expect(
      f.repository.billingReadiness(f.finance, f.rule.id, '2026-08-01', '2026-08-15')
        .assignmentExtras,
    ).toEqual([]);
    expect(f.v3.workerPay(f.worker, '2026-08-01', '2026-08-15').extras).toEqual([]);
  });
});
