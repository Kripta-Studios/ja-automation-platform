import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  ReadinessError,
  ValidationError,
  type InvoiceCompositionSourceRef,
} from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
function setup(unit: 'hourly' | 'daily' | 'weekly' = 'hourly', combined = false) {
  const base = createB5LifecycleSecurityFixture();
  fixtures.push(base);
  const f = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'composition'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'composition'),
    worker: stepUpB5Principal(base.sqlite, base.worker, 'composition'),
  };
  const rate = f.v3.createClientLaborRate(f.finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: unit === 'hourly' ? 6001n : 0n,
    unitRateMinor: unit === 'hourly' ? undefined : 60001n,
    rateBasis: unit,
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
    code: 'COMP',
    legalName: 'Composition issuer',
    currency: 'EUR',
    billingAddress: 'Test address',
    companyIdentifiers: 'COMPOSITION',
  });
  const rule = f.repository.createBillingRule(f.finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    includeExpenses: combined,
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const scope = {
    projectId: f.project.id,
    billingRuleId: rule.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  };
  const ref = (type: 'time' | 'expense', id: string): InvoiceCompositionSourceRef => ({
    type,
    id,
    version: Number(
      f.sqlite
        .prepare(`SELECT version FROM ${type === 'time' ? 'time_entry' : 'expense'} WHERE id=?`)
        .get(id)!.version,
    ),
  });
  const time = (date = '2026-08-20', minutes = 60, approved = true, billable = true) => {
    const row = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: `Work ${date} ${minutes}`,
    });
    f.repository.submitTime(f.worker, row.id, row.version);
    if (approved) {
      f.repository.operationalApproveTime(f.manager, row.id, 'approved');
      f.repository.financeApproveTime(f.finance, row.id, billable);
    }
    return ref('time', row.id);
  };
  return { ...f, entity, rate, rule, scope, ref, time };
}

describe('explicit canonical invoice composition', () => {
  it('quotes exactly the chosen sources and performs no persistent preview writes', () => {
    const f = setup();
    const first = f.time('2026-08-20', 30);
    f.time('2026-08-21', 45, false);
    f.repository.assignWorker(f.owner, {
      projectId: f.project.id,
      workerId: f.outsider.userId,
      startsOn: '2026-08-01',
    });
    const unrated = f.repository.createTimeEntry(
      f.owner,
      {
        projectId: f.project.id,
        workDate: '2026-08-22',
        category: 'regular',
        minutes: 60,
        summary: 'Unchosen worker without client rate',
      },
      f.outsider.userId,
    );
    f.repository.submitTime(f.owner, unrated.id, unrated.version);
    f.repository.operationalApproveTime(f.manager, unrated.id, 'approved');
    f.repository.financeApproveTime(f.finance, unrated.id, true);
    const before = f.sqlite.prepare('SELECT count(*) count FROM audit_event').get();
    const quote = f.repository.invoiceCompositionPreview(f.finance, {
      ...f.scope,
      sources: [first],
    });
    expect(quote).toMatchObject({ state: 'ready', subtotalMinor: '3001', totalMinor: '3001' });
    expect(quote.lines).toHaveLength(1);
    expect(f.sqlite.prepare('SELECT count(*) count FROM invoice').get()).toEqual({ count: 0 });
    expect(f.sqlite.prepare('SELECT count(*) count FROM invoice_source').get()).toEqual({
      count: 0,
    });
    expect(f.sqlite.prepare('SELECT count(*) count FROM audit_event').get()).toEqual(before);
  });

  it('allows two invoices in the same rule/period, preserves selection and retries stably', () => {
    const f = setup();
    const first = f.time();
    const second = f.time('2026-08-21');
    const input = { ...f.scope, sources: [first], requestKey: 'composition-request-1' };
    const one = f.repository.createSelectedInvoiceDraft(f.finance, input);
    const two = f.repository.createSelectedInvoiceDraft(f.finance, {
      ...input,
      sources: [second],
      requestKey: 'composition-request-2',
    });
    expect(two.id).not.toBe(one.id);
    expect(f.repository.createSelectedInvoiceDraft(f.finance, input)).toMatchObject({
      id: one.id,
      created: false,
    });
    expect(() =>
      f.repository.createSelectedInvoiceDraft(f.finance, { ...input, sources: [second] }),
    ).toThrow(ConflictError);
    expect(() =>
      f.repository.createSelectedInvoiceDraft(f.finance, {
        ...input,
        requestKey: 'composition-request-3',
      }),
    ).toThrow(ReadinessError);
    expect(
      JSON.parse(
        String(
          f.sqlite.prepare('SELECT source_selection_json FROM invoice WHERE id=?').get(one.id)!
            .source_selection_json,
        ),
      ),
    ).toEqual([first]);
    expect(f.sqlite.prepare('SELECT count(*) count FROM invoice').get()).toEqual({ count: 2 });
  });

  it('does not let unrelated pending records block selection or stale its approval', () => {
    const f = setup();
    const chosen = f.time();
    const other = f.time('2026-08-21', 30, false);
    const draft = f.repository.createSelectedInvoiceDraft(f.finance, {
      ...f.scope,
      sources: [chosen],
      requestKey: 'unrelated-selection',
    });
    f.sqlite
      .prepare('UPDATE time_entry SET activity_summary=?,version=version+1 WHERE id=?')
      .run('Unchosen changed', other.id);
    expect(() => f.repository.approveInvoiceDraft(f.finance, draft.id)).not.toThrow();
    expect(f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(draft.id)).toEqual({
      state: 'approved',
    });
  });

  it('invalidates selected source or commercial configuration changes', () => {
    const f = setup();
    const chosen = f.time();
    const draft = f.repository.createSelectedInvoiceDraft(f.finance, {
      ...f.scope,
      sources: [chosen],
      requestKey: 'stale-selection',
    });
    expect(() =>
      f.sqlite
        .prepare('UPDATE time_entry SET activity_summary=?,version=version+1 WHERE id=?')
        .run('Chosen changed', chosen.id),
    ).toThrow('immutable');
    f.sqlite
      .prepare('UPDATE client_labor_rate SET hourly_rate_minor=7001,version=version+1 WHERE id=?')
      .run(f.rate.id);
    expect(() => f.repository.approveInvoiceDraft(f.finance, draft.id)).toThrow(ReadinessError);
  });

  it('atomically approves submitted Owner records and rejects a stale batch before any mutation', () => {
    const f = setup();
    const first = f.time('2026-08-20', 60, false);
    const second = f.time('2026-08-21', 60, false);
    const refs = [first, { ...second, version: second.version - 1 }];
    expect(() =>
      f.repository.approveInvoiceCompositionSources(f.owner, {
        projectId: f.project.id,
        sources: refs,
      }),
    ).toThrow(ConflictError);
    expect(
      f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(first.id),
    ).toEqual({ approval_state: 'submitted' });
    expect(
      f.repository.approveInvoiceCompositionSources(f.owner, {
        projectId: f.project.id,
        sources: [first, second],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          approvalState: 'approved',
          financeAccepted: true,
          version: 4,
        }),
      ]),
    );
  });

  it('retains Owner/Finance lifecycle separation, live authority and submission requirements', () => {
    const f = setup();
    const submitted = f.time('2026-08-20', 60, false);
    const input = { projectId: f.project.id, sources: [submitted] };
    expect(() => f.repository.approveInvoiceCompositionSources(f.finance, input)).toThrow(
      AccessDeniedError,
    );
    expect(() => f.repository.approveInvoiceCompositionSources(f.manager, input)).toThrow(
      AccessDeniedError,
    );
    expect(() => f.repository.invoiceCompositionSources(f.worker, f.scope)).toThrow(
      AccessDeniedError,
    );
    expect(() =>
      f.repository.invoiceCompositionSources({ ...f.worker, role: 'finance_admin' }, f.scope),
    ).toThrow(AccessDeniedError);
    expect(() => f.repository.invoiceCompositionSources(baseOwner(f), f.scope)).toThrow(
      AccessDeniedError,
    );
    f.repository.operationalApproveTime(f.manager, submitted.id, 'approved');
    const accepted = f.repository.approveInvoiceCompositionSources(f.owner, {
      ...input,
      sources: [f.ref('time', submitted.id)],
    });
    expect(accepted[0]).toMatchObject({ financeAccepted: true });
    const draft = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 30,
      summary: 'Unsubmitted',
    });
    expect(() =>
      f.repository.approveInvoiceCompositionSources(f.owner, {
        ...input,
        sources: [f.ref('time', draft.id)],
      }),
    ).toThrow(ConflictError);
  });

  it.each(['daily', 'weekly'] as const)('requires complete %s person groups', (unit) => {
    const f = setup(unit);
    const first = f.time('2026-08-20', 30);
    const second = f.time(unit === 'daily' ? '2026-08-20' : '2026-08-21', 45);
    expect(
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [first] }),
    ).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([
        { code: 'complete_client_billing_group_required', sourceId: first.id },
      ]),
    });
    expect(
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [first, second] }),
    ).toMatchObject({ state: 'ready', subtotalMinor: '60001' });
  });

  it('combines selected labor and legacy classified expenses without taking unchosen expenses', () => {
    const f = setup('hourly', true);
    const chosen = f.time();
    const createExpense = (amount: bigint, date: string) => {
      const row = f.repository.createExpense(f.worker, {
        projectId: f.project.id,
        spentOn: date,
        vendor: 'Travel vendor',
        category: 'travel',
        description: 'Customer reimbursable transport',
        currency: 'EUR',
        amountMinor: amount,
        whoPaid: 'worker',
        receiptRequired: false,
      });
      f.repository.submitExpense(f.worker, row.id, row.version);
      f.repository.operationalApproveExpense(f.manager, row.id, 'approved');
      // A supported historical classified source, with its original exact money.
      f.sqlite
        .prepare(
          "UPDATE expense SET commercial_classification_state='legacy_classified',client_treatment='reimbursable',billing_treatment='reimbursable_at_cost',finance_approved_by=?,finance_approved_at=? WHERE id=?",
        )
        .run(f.finance.userId, new Date().toISOString(), row.id);
      return f.ref('expense', row.id);
    };
    const expense = createExpense(12345n, '2026-08-20');
    createExpense(900n, '2026-08-21');
    const preview = f.repository.invoiceCompositionPreview(f.finance, {
      ...f.scope,
      sources: [chosen, expense],
    });
    expect(preview).toMatchObject({ state: 'ready', subtotalMinor: '18346' });
    expect(preview.lines).toHaveLength(2);
    const invoice = f.repository.createSelectedInvoiceDraft(f.finance, {
      ...f.scope,
      sources: [chosen, expense],
      requestKey: 'combined-selection',
    });
    expect(
      f.sqlite
        .prepare(
          'SELECT source_type,source_id FROM invoice_source WHERE invoice_id=? ORDER BY source_type',
        )
        .all(invoice.id),
    ).toEqual([
      { source_type: 'expense', source_id: expense.id },
      { source_type: 'time', source_id: chosen.id },
    ]);
  });

  it('requires complete minimum days, allocates one exact top-up, and stales on new group members', () => {
    const f = setup();
    f.sqlite
      .prepare('UPDATE project SET client_daily_minimum_minutes=120 WHERE id=?')
      .run(f.project.id);
    const first = f.time('2026-08-20', 30);
    const second = f.time('2026-08-20', 45);
    expect(
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [first] }).state,
    ).toBe('incomplete');
    const invoice = f.repository.createSelectedInvoiceDraft(f.finance, {
      ...f.scope,
      sources: [first, second],
      requestKey: 'minimum-selection',
    });
    expect(
      f.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(invoice.id),
    ).toEqual({ subtotal_minor: 12003 });
    expect(
      f.sqlite
        .prepare(
          "SELECT count(*) count FROM invoice_line WHERE invoice_id=? AND source_type='billing_adjustment'",
        )
        .get(invoice.id),
    ).toEqual({ count: 1 });
    f.time('2026-08-20', 15);
    expect(() => f.repository.approveInvoiceDraft(f.finance, invoice.id)).toThrow(ReadinessError);
    expect(() =>
      f.sqlite
        .prepare('UPDATE invoice SET source_selection_json=? WHERE id=?')
        .run('[]', invoice.id),
    ).toThrow('selection is immutable');
  });

  it('derives selected overtime after the full worked day, without fabricating actual hours', () => {
    const f = setup();
    f.repository.createProjectCommercialPolicy(f.finance, {
      projectId: f.project.id,
      effectiveFrom: '2026-08-01',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 60,
      travelClientBillable: true,
      customerSignoffRequired: false,
    });
    f.v3.createClientLaborRate(f.finance, {
      projectId: f.project.id,
      workerId: f.worker.userId,
      category: 'overtime',
      currency: 'EUR',
      hourlyRateMinor: 12002n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-08-01',
    });
    f.time('2026-08-20', 60);
    const chosen = f.time('2026-08-20', 30);
    const preview = f.repository.invoiceCompositionPreview(f.finance, {
      ...f.scope,
      sources: [chosen],
    });
    expect(preview).toMatchObject({ state: 'ready', subtotalMinor: '6001' });
    expect(f.sqlite.prepare('SELECT SUM(minutes) minutes FROM time_entry').get()).toEqual({
      minutes: 90,
    });
  });

  it('recalculates approved selections without pulling in later unchosen records', () => {
    const f = setup();
    const chosen = f.time();
    const draft = f.repository.createSelectedInvoiceDraft(f.finance, {
      ...f.scope,
      sources: [chosen],
      requestKey: 'recalculate-selection',
    });
    f.repository.approveInvoiceDraft(f.finance, draft.id);
    f.time('2026-08-21');
    f.sqlite
      .prepare('UPDATE client_labor_rate SET hourly_rate_minor=7001,version=version+1 WHERE id=?')
      .run(f.rate.id);
    const version = Number(
      f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(draft.id)!.version,
    );
    const replacement = f.repository.recalculateApprovedInvoice(
      f.finance,
      draft.id,
      version,
      'Refresh the selected approved sources',
    );
    expect(replacement.id).not.toBe(draft.id);
    expect(
      f.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(replacement.id),
    ).toEqual({ subtotal_minor: 7001 });
    expect(
      f.sqlite
        .prepare('SELECT source_id FROM invoice_source WHERE invoice_id=?')
        .all(replacement.id),
    ).toEqual([{ source_id: chosen.id }]);
    expect(
      JSON.parse(
        String(
          f.sqlite
            .prepare('SELECT source_selection_json FROM invoice WHERE id=?')
            .get(replacement.id)!.source_selection_json,
        ),
      )[0].id,
    ).toBe(chosen.id);
  });

  it('accepts PM-approved unclassified expenses as an explicit Owner decision and keeps classification blocked', () => {
    const f = setup('hourly', true);
    const expense = f.repository.createExpense(f.worker, {
      projectId: f.project.id,
      spentOn: '2026-08-20',
      vendor: 'Hotel',
      category: 'hotel',
      description: 'Real lodging',
      currency: 'EUR',
      amountMinor: 12345n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    f.repository.submitExpense(f.worker, expense.id, expense.version);
    f.repository.operationalApproveExpense(f.manager, expense.id, 'approved');
    const before = f.sqlite
      .prepare(
        'SELECT amount_minor,billing_amount_minor,commercial_classification_state FROM expense WHERE id=?',
      )
      .get(expense.id);
    expect(() =>
      f.repository.approveInvoiceCompositionSources(f.finance, {
        projectId: f.project.id,
        sources: [f.ref('expense', expense.id)],
      }),
    ).toThrow(ConflictError);
    const result = f.repository.approveInvoiceCompositionSources(f.owner, {
      projectId: f.project.id,
      sources: [f.ref('expense', expense.id)],
    });
    expect(result[0]).toMatchObject({ approvalState: 'approved', financeAccepted: true });
    expect(
      f.sqlite
        .prepare(
          'SELECT amount_minor,billing_amount_minor,commercial_classification_state FROM expense WHERE id=?',
        )
        .get(expense.id),
    ).toEqual(before);
    const audit = f.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE entity_id=? AND action='expense.finance_approve'",
      )
      .get(expense.id)!;
    expect(JSON.parse(String(audit.details_json))).toMatchObject({
      origin: 'invoice_composition',
      policyReconciliation: false,
      originalApprovedBy: f.manager.userId,
    });
    expect(
      f.repository
        .invoiceCompositionSources(f.owner, f.scope)
        .sources.find((source) => source.id === expense.id)?.blockers,
    ).toEqual(
      expect.arrayContaining([{ code: 'missing_expense_classification', sourceId: expense.id }]),
    );
    expect(
      f.repository
        .invoiceCompositionSources(f.owner, f.scope)
        .sources.find((source) => source.id === expense.id)?.blockers,
    ).not.toEqual(expect.arrayContaining([{ code: 'source_not_billable', sourceId: expense.id }]));
  });

  it('refreshes the same selected draft and retry identity, reprices exact money and rolls back failed refresh', () => {
    const f = setup();
    const chosen = f.time();
    const other = f.time('2026-08-21');
    const input = { ...f.scope, sources: [chosen], requestKey: 'refresh-selection' };
    const draft = f.repository.createSelectedInvoiceDraft(f.finance, input);
    const version = Number(
      f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(draft.id)!.version,
    );
    f.sqlite
      .prepare('UPDATE client_labor_rate SET hourly_rate_minor=7001,version=version+1 WHERE id=?')
      .run(f.rate.id);
    expect(() =>
      f.repository.refreshSelectedInvoiceDraft(f.finance, draft.id, version + 1),
    ).toThrow(ConflictError);
    const refreshed = f.repository.refreshSelectedInvoiceDraft(f.finance, draft.id, version);
    expect(refreshed).toMatchObject({ id: draft.id, created: false, refreshed: true });
    expect(f.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(draft.id)).toEqual(
      { subtotal_minor: 7001 },
    );
    expect(
      f.sqlite.prepare('SELECT source_id FROM invoice_source WHERE invoice_id=?').all(draft.id),
    ).toEqual([{ source_id: chosen.id }]);
    expect(f.repository.createSelectedInvoiceDraft(f.finance, input).id).toBe(draft.id);
    expect(
      f.repository
        .invoiceCompositionSources(f.finance, f.scope)
        .sources.find((source) => source.id === other.id)?.billingState,
    ).toBe('unlocked');
    expect(() =>
      f.sqlite.prepare('UPDATE invoice SET source_selection_json=NULL WHERE id=?').run(draft.id),
    ).toThrow('selection is immutable');
    const currentVersion = Number(
      f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(draft.id)!.version,
    );
    f.sqlite
      .prepare('UPDATE client_labor_rate SET effective_to=? WHERE id=?')
      .run('2026-08-19', f.rate.id);
    const preserved = f.sqlite
      .prepare('SELECT * FROM invoice_line WHERE invoice_id=?')
      .all(draft.id);
    expect(() =>
      f.repository.refreshSelectedInvoiceDraft(f.finance, draft.id, currentVersion),
    ).toThrow(ReadinessError);
    expect(f.sqlite.prepare('SELECT * FROM invoice_line WHERE invoice_id=?').all(draft.id)).toEqual(
      preserved,
    );
    expect(
      f.sqlite.prepare('SELECT source_id FROM invoice_source WHERE invoice_id=?').all(draft.id),
    ).toEqual([{ source_id: chosen.id }]);
  });

  it('keeps time and expense identities separate when their table-local IDs coincide', () => {
    const f = setup('hourly', true);
    const time = f.time();
    const created = f.repository.createExpense(f.worker, {
      projectId: f.project.id,
      spentOn: '2026-08-20',
      vendor: 'Travel',
      category: 'travel',
      description: 'Actual transport',
      currency: 'EUR',
      amountMinor: 12345n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    f.repository.submitExpense(f.worker, created.id, created.version);
    f.sqlite
      .prepare(
        "UPDATE expense SET id=?,client_treatment='reimbursable',billing_treatment='reimbursable_at_cost' WHERE id=?",
      )
      .run(time.id, created.id);
    const inventory = f.repository.invoiceCompositionSources(f.finance, f.scope);
    expect(
      inventory.sources.find((source) => source.type === 'time' && source.id === time.id)?.blockers,
    ).toEqual([]);
    expect(
      inventory.sources.find((source) => source.type === 'expense' && source.id === time.id)
        ?.blockers,
    ).toEqual(
      expect.arrayContaining([{ code: 'missing_expense_classification', sourceId: time.id }]),
    );
    expect(
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [time] }),
    ).toMatchObject({ state: 'ready', subtotalMinor: '6001' });
    f.repository.operationalApproveExpense(f.manager, time.id, 'approved');
    f.sqlite
      .prepare(
        "UPDATE expense SET commercial_classification_state='legacy_classified',finance_approved_by=?,finance_approved_at=? WHERE id=?",
      )
      .run(f.finance.userId, new Date().toISOString(), time.id);
    f.sqlite
      .prepare(
        "UPDATE time_entry SET approval_state='submitted',billability_state='pending',finance_approved_by=NULL,finance_approved_at=NULL,version=version+1 WHERE id=?",
      )
      .run(time.id);
    const expense = f.ref('expense', time.id);
    expect(
      f.repository
        .invoiceCompositionSources(f.finance, f.scope)
        .sources.find((source) => source.type === 'expense' && source.id === time.id)?.blockers,
    ).toEqual([]);
    expect(
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [expense] }),
    ).toMatchObject({ state: 'ready', subtotalMinor: '12345' });
  });

  it.each(['daily', 'weekly', 'minimum'] as const)(
    'excludes explicit nonbillable siblings from the complete %s commercial group',
    (group) => {
      const f = setup(group === 'minimum' ? 'hourly' : group);
      if (group === 'minimum')
        f.sqlite
          .prepare('UPDATE project SET client_daily_minimum_minutes=120 WHERE id=?')
          .run(f.project.id);
      const chosen = f.time('2026-08-20', 30);
      const excluded = f.time(group === 'weekly' ? '2026-08-21' : '2026-08-20', 45, true, false);
      const source = f.repository
        .invoiceCompositionSources(f.finance, f.scope)
        .sources.find((row) => row.id === chosen.id)!;
      expect(source.selectedDependencies).toEqual([chosen.id]);
      const preview = f.repository.invoiceCompositionPreview(f.finance, {
        ...f.scope,
        sources: [chosen],
      });
      expect(preview).toMatchObject({
        state: 'ready',
        subtotalMinor: group === 'minimum' ? '12003' : '60001',
      });
      expect(
        preview.lines.filter((line) => line.sourceType === 'time').map((line) => line.sourceId),
      ).toEqual([chosen.id]);
      expect(
        f.sqlite
          .prepare('SELECT billability_state,invoice_id FROM time_entry WHERE id=?')
          .get(excluded.id),
      ).toEqual({ billability_state: 'non_billable', invoice_id: null });
      expect(f.sqlite.prepare('SELECT SUM(minutes) minutes FROM time_entry').get()).toEqual({
        minutes: 75,
      });
    },
  );

  it('pairs known expense projections with their billing currency and preserves the original receipt money', () => {
    const f = setup('hourly', true);
    const row = f.repository.createExpense(f.worker, {
      projectId: f.project.id,
      spentOn: '2026-08-20',
      vendor: 'Foreign vendor',
      category: 'travel',
      description: 'Explicit historical conversion fixture',
      currency: 'USD',
      amountMinor: 10000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    f.repository.submitExpense(f.worker, row.id, row.version);
    f.repository.operationalApproveExpense(f.manager, row.id, 'approved');
    // Finance supplied this explicit historical projection; the composer derives no FX.
    f.sqlite
      .prepare(
        "UPDATE expense SET client_treatment='reimbursable',billing_treatment='reimbursable_at_cost',commercial_classification_state='legacy_classified',project_currency_amount_minor=9000,billing_amount_minor=9000,finance_approved_by=?,finance_approved_at=? WHERE id=?",
      )
      .run(f.finance.userId, new Date().toISOString(), row.id);
    const source = f.repository
      .invoiceCompositionSources(f.finance, f.scope)
      .sources.find((source) => source.type === 'expense' && source.id === row.id)!;
    expect(source).toMatchObject({
      amountMinor: '9000',
      currency: 'EUR',
      originalAmountMinor: '10000',
      originalCurrency: 'USD',
    });
    expect(
      f.repository.invoiceCompositionPreview(f.finance, {
        ...f.scope,
        sources: [f.ref('expense', row.id)],
      }),
    ).toMatchObject({ state: 'ready', subtotalMinor: '9000', currency: 'EUR' });
  });

  it('rejects empty, duplicated, stale and outside-project typed identities', () => {
    const f = setup();
    const chosen = f.time();
    expect(() =>
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [] }),
    ).toThrow(ValidationError);
    expect(() =>
      f.repository.invoiceCompositionPreview(f.finance, { ...f.scope, sources: [chosen, chosen] }),
    ).toThrow(ValidationError);
    expect(() =>
      f.repository.invoiceCompositionPreview(f.finance, {
        ...f.scope,
        sources: [{ ...chosen, version: 1 }],
      }),
    ).toThrow(ConflictError);
    expect(() =>
      f.repository.invoiceCompositionPreview(f.finance, {
        ...f.scope,
        projectId: 'other-project',
        sources: [chosen],
      }),
    ).toThrow(ValidationError);
  });
});
function baseOwner(f: ReturnType<typeof setup>) {
  return { ...f.owner, sessionId: undefined };
}
