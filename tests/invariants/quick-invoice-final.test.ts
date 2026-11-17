import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError, recordCurrencyConversion, AssignmentExpensePolicyRepository } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import { quickInvoicePreview } from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';
import {
  expensePolicyWindow,
  quickInvoiceIssue,
  quickInvoiceSetExpenseTreatment,
  quickInvoiceIncludePending,
  quickInvoiceSetupBilling,
  quickInvoiceSetupExpenseBilling,
} from '../../apps/portal/src/lib/server/billing-quick-invoice-fixes.ts';

/**
 * Final billing regression (2026-11-17): expense terms next to issued labor invoices (F1),
 * the inline billing setup also sets the issuing company (F2), one audited conversion for
 * billing and reimbursement (F4), and a stream starting mid-month suggests a billable period (F5).
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };

function setup(options: { issuer?: boolean; rule?: boolean } = {}) {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'final-billing');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'final-billing');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'final-billing');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 10000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'FINAL',
    legalName: 'Final issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'FINAL-ISSUER',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Final issuer',
    taxIdentifier: 'FINAL-ISSUER',
    addressLine1: 'Madrid test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Final billing fixture authority',
    idempotencyKey: 'final-issuer-revision',
  });
  if (options.issuer !== false)
    f.v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: f.project.id,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Final billing fixture authority',
      idempotencyKey: 'final-issuer-assignment',
    });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'FIN',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00Z',
  });
  if (options.rule !== false)
    f.repository.createBillingRule(finance, {
      projectId: f.project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });
  const time = (date: string, minutes: number) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: 'Final billing labor',
    });
    f.repository.submitTime(worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  const expense = (date: string, currency: string, amountMinor: bigint, category = 'hotel', vendor = 'Hotel') =>
    f.repository.createExpense(worker, {
      projectId: f.project.id,
      spentOn: date,
      vendor,
      category,
      description: 'Worker paid stay',
      currency,
      amountMinor,
      whoPaid: 'worker',
      receiptRequired: false,
    });
  const context = (principal: typeof finance) =>
    ({ sqlite: f.sqlite, repository: f.repository, v3: f.v3, principal }) as unknown as Parameters<
      typeof quickInvoicePreview
    >[0];
  const version = (id: string) =>
    (f.sqlite.prepare('SELECT version FROM expense WHERE id=?').get(id) as { version: number }).version;
  return { f, finance, owner, worker, entity, revision, time, expense, context, version };
}

function issueLabor(env: ReturnType<typeof setup>, key: string) {
  const preview = quickInvoicePreview(env.context(env.owner), { projectId: env.f.project.id, ...period });
  expect(preview.state).toBe('ready');
  const issued = quickInvoiceIssue(env.context(env.owner), {
    projectId: env.f.project.id,
    ...period,
    expectedTotalMinor: preview.totalMinor,
    requestKey: key,
    locale: 'en',
  });
  if (!issued.ok) throw new Error(`issue failed: ${issued.reason}`);
  return issued;
}

describe('F1 expense terms after issued labor invoices', () => {
  it('classifies an expense dated inside an issued labor-only period, from the earliest un-invoiced expense', () => {
    const env = setup();
    const { f, owner, time, expense, context, version } = env;
    time('2026-08-03', 480);
    const issued = issueLabor(env, 'final-f1-labor');
    const before = f.sqlite.prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY id').all(issued.invoiceId);
    const early = expense('2026-08-05', 'EUR', 3100n);
    const late = expense('2026-08-12', 'EUR', 4500n);
    quickInvoiceSetExpenseTreatment(context(owner), {
      projectId: f.project.id,
      source: { type: 'expense', id: late.id, version: version(late.id) },
      treatment: 'reimbursable',
      markupBps: 0,
      requestKey: 'final-f1-classify',
    });
    const policy = f.sqlite
      .prepare('SELECT effective_from,payer,category FROM assignment_expense_policy')
      .all() as Array<{ effective_from: string; payer: string; category: string }>;
    // Starts at the earliest un-invoiced expense of that kind (Aug 5), inside the invoiced labor period.
    expect(policy).toEqual([{ effective_from: '2026-08-05', payer: 'worker', category: 'hotel' }]);
    expect(f.sqlite.prepare("SELECT commercial_classification_state s FROM expense WHERE id=?").get(late.id)).toEqual({
      s: 'classified',
    });
    void early;
    // The issued labor invoice is untouched.
    expect(f.sqlite.prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY id').all(issued.invoiceId)).toEqual(before);
  });

  it('never opens expense terms over an expense that was already reimbursed', () => {
    const env = setup();
    const { f, finance, expense, context, owner } = env;
    const paid = expense('2026-08-05', 'EUR', 3100n);
    const later = expense('2026-08-20', 'EUR', 2000n);
    f.sqlite.prepare("UPDATE expense SET reimbursed_at='2026-08-25T00:00:00Z' WHERE id=?").run(paid.id);
    const window = expensePolicyWindow(context(owner), later.id);
    expect(window.effectiveFrom).toBe('2026-08-20');
    const member = f.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(f.project.id, f.worker.userId) as { id: string };
    expect(() =>
      new AssignmentExpensePolicyRepository(f.sqlite).create(finance, {
        projectMemberId: member.id,
        payer: 'worker',
        category: 'hotel',
        effectiveFrom: '2026-08-01',
        workerReimbursement: 'at_cost',
        clientRecovery: 'at_cost',
        reason: 'Would cover a reimbursed expense',
      }),
    ).toThrow(ConflictError);
  });
});

describe('F2 inline billing setup sets the issuing company', () => {
  it('creates the stream and the issuer assignment so the invoice can be issued', () => {
    const env = setup({ issuer: false, rule: false });
    const { f, owner, entity, time, context } = env;
    time('2026-08-03', 480);
    const before = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(before.attention.find((item) => item.kind === 'billingSetup')?.billingSetup?.legalEntities[0]).toMatchObject({
      id: entity.id,
      canIssue: true,
    });
    const result = quickInvoiceSetupBilling(context(owner), {
      projectId: f.project.id,
      legalEntityId: entity.id,
      tax: { none: true },
      cadence: 'manual',
      effectiveFrom: '2026-08-01',
    });
    expect(result.issuerAssigned).toBe(true);
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM project_legal_entity_assignment WHERE project_id=?').get(f.project.id),
    ).toEqual({ n: 1 });
    const issued = issueLabor(env, 'final-f2-issue');
    expect(issued.state).toBe('issued');
    // Never billed twice: the same dates now point to the issued invoice.
    expect(quickInvoicePreview(context(owner), { projectId: f.project.id, ...period }).state).toBe('existing');
  });

  it('offers the issuer picker when billing exists without an issuing company', () => {
    const env = setup({ issuer: false });
    const { f, owner, time, context } = env;
    time('2026-08-03', 480);
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const item = preview.attention.find((candidate) => candidate.kind === 'issuerAuthority');
    expect(item?.issuerAuthority?.legalEntities[0]?.id).toBe(env.entity.id);
  });
});

describe('F4 one audited conversion', () => {
  it('records the inline conversion and reimburses with the same amount', () => {
    const env = setup();
    const { f, owner, expense, context, version } = env;
    const usd = expense('2026-08-10', 'USD', 10000n);
    quickInvoiceSetExpenseTreatment(context(owner), {
      projectId: f.project.id,
      source: { type: 'expense', id: usd.id, version: version(usd.id) },
      treatment: 'reimbursable',
      markupBps: 0,
      requestKey: 'final-f4-inline',
      conversion: { rate: '0.9' },
    });
    const rows = f.sqlite
      .prepare("SELECT CAST(target_amount_minor AS TEXT) t,rate_decimal r FROM currency_conversion WHERE source_id=?")
      .all(usd.id);
    expect(rows).toEqual([{ t: '9000', r: '0.9' }]);
    expect(
      f.sqlite.prepare('SELECT billing_amount_minor b,reimbursement_amount_minor w FROM expense WHERE id=?').get(usd.id),
    ).toEqual({ b: 9000, w: 9000 });
  });

  it('uses an already confirmed conversion without retyping (prefilled on New invoice)', () => {
    const env = setup();
    const { f, owner, expense, context, version } = env;
    const usd = expense('2026-08-10', 'USD', 5310n);
    recordCurrencyConversion(f.sqlite, owner, {
      sourceKind: 'expense',
      sourceId: usd.id,
      targetCurrency: 'EUR',
      // An ECB-style cross rate with 10 decimals (the classification audit keeps no long text).
      rate: '0.5000000001',
      rateSource: 'manual',
      idempotencyKey: 'final-f4-stored',
      expectedCurrentId: null,
    });
    f.repository.createBillingRule(env.finance, {
      projectId: f.project.id,
      legalEntityId: env.entity.id,
      streamType: 'expense',
      cadenceType: 'custom',
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });
    quickInvoiceSetExpenseTreatment(context(owner), {
      projectId: f.project.id,
      source: { type: 'expense', id: usd.id, version: version(usd.id) },
      treatment: 'reimbursable',
      markupBps: 0,
      requestKey: 'final-f4-reuse',
    });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM currency_conversion WHERE source_id=?').get(usd.id)).toEqual({ n: 1 });
    expect(
      f.sqlite.prepare('SELECT billing_amount_minor b,reimbursement_amount_minor w FROM expense WHERE id=?').get(usd.id),
    ).toEqual({ b: 2655, w: 2655 });
  });
});

describe('F5 stream starting mid-month', () => {
  it('suggests the first billable period instead of blocking last month', () => {
    const env = setup({ rule: false });
    const { f, finance, owner, entity, time, context } = env;
    f.repository.createBillingRule(finance, {
      projectId: f.project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      currency: 'EUR',
      effectiveFrom: '2026-08-17',
    });
    time('2026-08-18', 480);
    const preview = quickInvoicePreview(context(owner), {
      projectId: f.project.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(preview.state).toBe('empty');
    expect(preview.suggestedPeriod).toEqual({ start: '2026-08-17', end: '2026-08-31' });
  });
});

describe('expenses on a labor-only project (post-final)', () => {
  it('offers a one-step expense stream from the earliest expense, next to an issued labor invoice', () => {
    const env = setup();
    const { f, owner, worker, time, expense, context, version } = env;
    time('2026-08-03', 480);
    issueLabor(env, 'postfix-labor');
    const labor = f.sqlite.prepare("SELECT * FROM billing_rule WHERE stream_type='labor'").get();
    const taxi = expense('2026-08-05', 'USD', 125050n, 'ground_transport', 'Taxi');
    const meal = expense('2026-08-12', 'EUR', 3100n, 'meals', 'Lunch');
    f.repository.submitExpense(worker, taxi.id, version(taxi.id));
    f.repository.submitExpense(worker, meal.id, version(meal.id));
    // A draft (not submitted) expense is not counted.
    expense('2026-08-02', 'EUR', 999n);

    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.state).toBe('existing');
    const item = preview.attention.find((entry) => entry.kind === 'expenseSetup');
    expect(item?.expenseSetup).toMatchObject({
      count: 2,
      effectiveFrom: '2026-08-05',
      totals: [
        { currency: 'EUR', amountMinor: '3100' },
        { currency: 'USD', amountMinor: '125050' },
      ],
    });

    const created = quickInvoiceSetupExpenseBilling(context(owner), { projectId: f.project.id });
    expect(created.effectiveFrom).toBe('2026-08-05');
    expect(
      f.sqlite.prepare("SELECT id,effective_from,effective_to,include_expenses FROM billing_rule WHERE stream_type='expense'").all(),
    ).toEqual([{ id: created.billingRuleId, effective_from: '2026-08-05', effective_to: null, include_expenses: 0 }]);
    // The labor stream is untouched and the offer is gone; a second click changes nothing.
    expect(f.sqlite.prepare("SELECT * FROM billing_rule WHERE stream_type='labor'").get()).toEqual(labor);
    const after = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(after.attention.some((entry) => entry.kind === 'expenseSetup')).toBe(false);
    expect(() => quickInvoiceSetupExpenseBilling(context(owner), { projectId: f.project.id })).toThrow(ConflictError);

    // Classify (USD converted at 0.9), approve and issue the expense invoice.
    const scope = { projectId: f.project.id, ...period, billingRuleId: created.billingRuleId };
    for (const [row, conversion] of [
      [taxi, { rate: '0.9' }],
      [meal, undefined],
    ] as const)
      quickInvoiceSetExpenseTreatment(context(owner), {
        projectId: f.project.id,
        source: { type: 'expense', id: row.id, version: version(row.id) },
        treatment: 'reimbursable',
        markupBps: 0,
        requestKey: `postfix-classify-${row.id}`,
        ...(conversion ? { conversion } : {}),
      });
    const pending = quickInvoicePreview(context(owner), scope);
    const sources = pending.attention.flatMap((entry) => entry.people ?? []).flatMap((person) => person.sources ?? []);
    quickInvoiceIncludePending(context(owner), { ...scope, sources, requestKey: 'postfix-approve' });
    const ready = quickInvoicePreview(context(owner), scope);
    expect(ready.state).toBe('ready');
    const issued = quickInvoiceIssue(context(owner), {
      ...scope,
      expectedTotalMinor: ready.totalMinor,
      requestKey: 'postfix-issue',
      locale: 'en',
    });
    if (!issued.ok) throw new Error(`issue failed: ${issued.reason}`);
    // Category in words (never the code); the foreign expense shows its original amount and rate.
    expect(
      f.sqlite.prepare('SELECT description FROM invoice_line WHERE invoice_id=? ORDER BY description').all(issued.invoiceId),
    ).toEqual([
      { description: '2026-08-05 · Taxi · Ground transport · USD 1,250.50 @ 0.90000' },
      { description: '2026-08-12 · Lunch · Meals' },
    ]);
  });

  it('never starts the expense stream inside dates an expense invoice already covers', () => {
    const env = setup();
    const { f, owner, worker, expense, context, version } = env;
    // An earlier, closed expense stream that billed expenses until Aug 10.
    const old = f.repository.createBillingRule(env.finance, {
      projectId: f.project.id,
      legalEntityId: env.entity.id,
      streamType: 'expense',
      cadenceType: 'custom',
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });
    f.sqlite.prepare("UPDATE billing_rule SET effective_to='2026-08-10' WHERE id=?").run(old.id);
    const before = expense('2026-08-06', 'EUR', 1000n);
    const later = expense('2026-08-14', 'EUR', 2000n);
    f.repository.submitExpense(worker, before.id, version(before.id));
    f.repository.submitExpense(worker, later.id, version(later.id));
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.attention.find((entry) => entry.kind === 'expenseSetup')?.expenseSetup).toMatchObject({
      count: 1,
      effectiveFrom: '2026-08-14',
    });
    expect(quickInvoiceSetupExpenseBilling(context(owner), { projectId: f.project.id }).effectiveFrom).toBe('2026-08-14');
  });

  it('is not offered to roles that cannot set up billing', () => {
    const env = setup();
    const { f, worker, expense, context, version } = env;
    const row = expense('2026-08-06', 'EUR', 1000n);
    f.repository.submitExpense(worker, row.id, version(row.id));
    expect(() => quickInvoiceSetupExpenseBilling(context(worker), { projectId: f.project.id })).toThrow();
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM billing_rule WHERE stream_type='expense'").get()).toEqual({ n: 0 });
  });
});
