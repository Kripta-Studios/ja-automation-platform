import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  ExpenseInvoiceSettingsRepository,
  clientExpenseInvoiceSetting,
  projectExpenseArrangement,
} from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import { quickInvoiceCreate, quickInvoicePreview } from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';
import { quickInvoiceSetExpenseTreatment } from '../../apps/portal/src/lib/server/billing-quick-invoice-fixes.ts';

/**
 * Expenses on the same invoice or on a separate invoice (owner request 2026-11-26): a client
 * default, the project's own choice (its billing streams), and the choice on New invoice. A
 * separate choice creates the hours draft and the expense draft together; no expense is ever
 * on two invoices and expenses left out stay open.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };

function setup(options: { include?: boolean } = {}) {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'expense-invoices');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'expense-invoices');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'expense-invoices');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 10000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'EXPI',
    legalName: 'Expense invoices issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'EXPI-ISSUER',
  });
  const tax = f.repository.createTaxProfile(finance, {
    legalEntityId: entity.id,
    name: 'IVA 21',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'IVA', basisPoints: 2100 }],
  }) as { id: string };
  const labor = f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'monthly',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
    paymentTermsDays: 45,
    taxProfileId: tax.id,
    ...(options.include ? { includeExpenses: true } : {}),
  });
  const time = (date: string, minutes: number) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: 'Expense invoice labor',
    });
    f.repository.submitTime(worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  const version = (id: string) =>
    (f.sqlite.prepare('SELECT version FROM expense WHERE id=?').get(id) as { version: number }).version;
  const context = (principal: typeof finance) =>
    ({ sqlite: f.sqlite, repository: f.repository, v3: f.v3, principal }) as unknown as Parameters<
      typeof quickInvoicePreview
    >[0];
  /** A sent expense, decided as reimbursable at cost and approved. */
  const expense = (date: string, amountMinor: bigint, vendor = 'Hotel') => {
    const row = f.repository.createExpense(worker, {
      projectId: f.project.id,
      spentOn: date,
      vendor,
      category: 'hotel',
      description: 'Worker paid stay',
      currency: 'EUR',
      amountMinor,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    f.repository.submitExpense(worker, row.id, version(row.id));
    quickInvoiceSetExpenseTreatment(context(owner), {
      projectId: f.project.id,
      source: { type: 'expense', id: row.id, version: version(row.id) },
      treatment: 'reimbursable',
      markupBps: 0,
      requestKey: `expinv-classify-${row.id}`,
    });
    f.repository.operationalApproveExpense(f.manager, row.id, 'approved');
    f.repository.financeApproveExpense(finance, row.id);
    return row.id;
  };
  const settings = new ExpenseInvoiceSettingsRepository(f.sqlite, f.repository);
  const clientId = (f.sqlite.prepare('SELECT client_id FROM project WHERE id=?').get(f.project.id) as { client_id: string })
    .client_id;
  return { f, finance, owner, worker, entity, labor, tax, time, expense, context, settings, clientId };
}

type Env = ReturnType<typeof setup>;

const rules = (env: Env) =>
  env.f.sqlite
    .prepare(
      `SELECT stream_type,include_expenses,effective_from,effective_to,enabled,tax_profile_id,cadence_type,
              currency,payment_terms_days,legal_entity_id
         FROM billing_rule WHERE project_id=? ORDER BY stream_type,effective_from`,
    )
    .all(env.f.project.id);

const expenseHolders = (env: Env, expenseId: string) =>
  env.f.sqlite
    .prepare(
      `SELECT s.invoice_id FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
        WHERE s.source_type='expense' AND s.source_id=? AND i.state NOT IN ('void','cancelled','superseded')`,
    )
    .all(expenseId) as Array<{ invoice_id: string }>;

describe('expense invoice setting: precedence', () => {
  it('uses the project streams first, then the client default, then the same invoice', () => {
    const env = setup();
    const { f, settings, owner, clientId } = env;
    // Labor-only stream, nothing set: same invoice (default).
    expect(projectExpenseArrangement(f.sqlite, f.project.id)).toMatchObject({
      streams: 'labor_only',
      mode: 'same',
      source: 'default',
    });
    // Client default applies while the project has not chosen.
    settings.setClientMode(owner, { clientId, mode: 'separate', expectedVersion: 0 });
    expect(clientExpenseInvoiceSetting(f.sqlite, clientId)).toMatchObject({ mode: 'separate', version: 1 });
    expect(projectExpenseArrangement(f.sqlite, f.project.id)).toMatchObject({ mode: 'separate', source: 'client' });
    // The project's own choice wins over the client default.
    settings.setProjectMode(owner, { projectId: f.project.id, mode: 'same' });
    expect(projectExpenseArrangement(f.sqlite, f.project.id)).toMatchObject({
      streams: 'same',
      mode: 'same',
      source: 'project',
    });
    // A stale version is refused; saving the same value writes nothing.
    expect(() => settings.setClientMode(owner, { clientId, mode: 'same', expectedVersion: 0 })).toThrow(ConflictError);
    settings.setClientMode(owner, { clientId, mode: 'separate', expectedVersion: 1 });
    expect(clientExpenseInvoiceSetting(f.sqlite, clientId)?.version).toBe(1);
    // Both changes are audited.
    expect(
      f.sqlite
        .prepare(
          "SELECT action FROM audit_event WHERE action IN ('client.expense_invoice_set','project.expense_invoice_set') ORDER BY rowid",
        )
        .all(),
    ).toEqual([{ action: 'client.expense_invoice_set' }, { action: 'project.expense_invoice_set' }]);
  });

  it('only Owner and Finance change the setting', () => {
    const env = setup();
    const { f, settings, worker, clientId } = env;
    expect(() => settings.setClientMode(worker, { clientId, mode: 'separate', expectedVersion: 0 })).toThrow(
      AccessDeniedError,
    );
    expect(() => settings.setProjectMode(f.manager, { projectId: f.project.id, mode: 'separate' })).toThrow(
      AccessDeniedError,
    );
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM billing_rule WHERE stream_type='expense'").get()).toEqual({ n: 0 });
  });
});

describe('expense invoice setting: the expense stream is created automatically', () => {
  it('copies currency, tax profile, interval, issuer and terms of the labor stream', () => {
    const env = setup();
    const { f, settings, owner } = env;
    const change = settings.setProjectMode(owner, { projectId: f.project.id, mode: 'separate' });
    expect(change).toMatchObject({ changed: true, before: 'labor_only', effectiveFrom: '2026-08-01' });
    const [expense, labor] = rules(env) as Array<Record<string, unknown>>;
    expect(expense).toMatchObject({ stream_type: 'expense', effective_from: '2026-08-01', effective_to: null, enabled: 1 });
    for (const key of ['tax_profile_id', 'cadence_type', 'currency', 'payment_terms_days', 'legal_entity_id'])
      expect(expense![key], key).toEqual(labor![key]);
    // Choosing it again changes nothing.
    expect(settings.setProjectMode(owner, { projectId: f.project.id, mode: 'separate' }).changed).toBe(false);
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM billing_rule WHERE stream_type='expense'").get()).toEqual({ n: 1 });
  });

  it('switches a combined project after its last invoice, never inside billed dates', () => {
    const env = setup({ include: true });
    const { f, settings, owner, time, expense, context } = env;
    time('2026-08-03', 480);
    const hotel = expense('2026-08-04', 12000n);
    // August: one combined draft with the hours and the hotel.
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.state).toBe('ready');
    const combined = quickInvoiceCreate(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'expinv-combined-aug',
    });
    if (!combined.ok) throw new Error(combined.reason);
    expect(expenseHolders(env, hotel)).toEqual([{ invoice_id: combined.invoiceId }]);
    const change = settings.setProjectMode(owner, { projectId: f.project.id, mode: 'separate' });
    expect(change.effectiveFrom).toBe('2026-09-01');
    expect(rules(env)).toMatchObject([
      { stream_type: 'expense', effective_from: '2026-09-01', effective_to: null },
      { stream_type: 'labor', include_expenses: 1, effective_from: '2026-08-01', effective_to: '2026-08-31' },
      { stream_type: 'labor', include_expenses: 0, effective_from: '2026-09-01', effective_to: null },
    ]);
    // Back to the same invoice: the expense stream stops (it never billed), labor carries them again.
    settings.setProjectMode(owner, { projectId: f.project.id, mode: 'same' });
    expect(projectExpenseArrangement(f.sqlite, f.project.id).streams).toBe('same');
    expect(expenseHolders(env, hotel)).toEqual([{ invoice_id: combined.invoiceId }]);
  });
});

describe('New invoice: expenses on a separate invoice', () => {
  it('creates two drafts (hours; expenses) together, each exactly as previewed, no expense twice', () => {
    const env = setup();
    const { f, owner, time, expense, context, settings, clientId } = env;
    settings.setClientMode(owner, { clientId, mode: 'separate', expectedVersion: 0 });
    time('2026-08-03', 480);
    const hotel = expense('2026-08-04', 12000n);
    const taxi = expense('2026-08-05', 3000n, 'Taxi');
    const input = { projectId: f.project.id, ...period, expenseInvoice: 'setting' as const };
    const preview = quickInvoicePreview(context(owner), input);
    expect(preview.expenseChoice).toMatchObject({
      separate: true,
      setting: 'separate',
      source: 'client',
      openCount: 2,
      changesSetting: true,
      changeFrom: '2026-08-01',
    });
    // The preview did not write anything: no expense stream yet.
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM billing_rule WHERE stream_type='expense'").get()).toEqual({ n: 0 });
    expect(preview.state).toBe('ready');
    expect(preview.groups.some((group) => group.kind === 'expense')).toBe(false);
    expect(preview.companion).toMatchObject({ state: 'ready', billingRuleId: null, sourceCount: 2 });
    const created = quickInvoiceCreate(context(owner), {
      ...input,
      expectedTotalMinor: preview.totalMinor,
      expectedCompanionTotalMinor: preview.companion!.totalMinor,
      requestKey: 'expinv-two-drafts',
    });
    if (!created.ok) throw new Error(created.reason);
    expect(created.invoiceIds).toHaveLength(2);
    expect(created.companion?.totalMinor).toBe(preview.companion!.totalMinor);
    const invoices = f.sqlite
      .prepare(
        `SELECT i.id,i.state,i.stream_type,CAST(i.total_minor AS TEXT) total,
                (SELECT COUNT(*) FROM invoice_source s WHERE s.invoice_id=i.id AND s.source_type='expense') expenses,
                (SELECT COUNT(*) FROM invoice_source s WHERE s.invoice_id=i.id AND s.source_type='time') hours
           FROM invoice i WHERE i.project_id=? ORDER BY i.stream_type`,
      )
      .all(f.project.id);
    expect(invoices).toEqual([
      { id: created.companion!.invoiceId, state: 'draft', stream_type: 'expense', total: preview.companion!.totalMinor, expenses: 2, hours: 0 },
      { id: created.invoiceId, state: 'draft', stream_type: 'labor', total: preview.totalMinor, expenses: 0, hours: 1 },
    ]);
    for (const id of [hotel, taxi]) expect(expenseHolders(env, id)).toEqual([{ invoice_id: created.companion!.invoiceId }]);
    // The choice is now the project's own setting (audited), and nothing is left to bill.
    expect(projectExpenseArrangement(f.sqlite, f.project.id)).toMatchObject({ streams: 'separate', source: 'project' });
    expect(
      f.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE action='project.expense_invoice_set'").get(),
    ).toEqual({ n: 1 });
    const again = quickInvoicePreview(context(owner), input);
    expect(again.state).toBe('existing');
    expect(again.companion?.state ?? 'existing').toBe('existing');
    const expenseRule = (f.sqlite.prepare("SELECT id FROM billing_rule WHERE stream_type='expense'").get() as { id: string }).id;
    const direct = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period, billingRuleId: expenseRule });
    expect(direct.state).toBe('existing');
  });

  it('keeps one draft when expenses stay on the same invoice', () => {
    const env = setup();
    const { f, owner, time, expense, context } = env;
    time('2026-08-03', 480);
    const hotel = expense('2026-08-04', 12000n);
    const input = { projectId: f.project.id, ...period, expenseInvoice: 'same' as const };
    const preview = quickInvoicePreview(context(owner), input);
    expect(preview.expenseChoice).toMatchObject({ separate: false, changesSetting: true, stayOpen: false });
    expect(preview.companion).toBeNull();
    expect(preview.groups.some((group) => group.kind === 'expense')).toBe(true);
    const created = quickInvoiceCreate(context(owner), {
      ...input,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'expinv-one-draft',
    });
    if (!created.ok) throw new Error(created.reason);
    expect(created.invoiceIds).toBeUndefined();
    expect(expenseHolders(env, hotel)).toEqual([{ invoice_id: created.invoiceId }]);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()).toEqual({ n: 1 });
  });

  it('leaves expenses that are left out open, and a changed expense total creates nothing', () => {
    const env = setup();
    const { f, owner, time, expense, context, settings } = env;
    settings.setProjectMode(owner, { projectId: f.project.id, mode: 'separate' });
    time('2026-08-03', 480);
    const hotel = expense('2026-08-04', 12000n);
    const input = {
      projectId: f.project.id,
      ...period,
      expenseInvoice: 'setting' as const,
      leaveOut: { hours: [], expenses: [f.worker.userId] },
    };
    const preview = quickInvoicePreview(context(owner), input);
    expect(preview.companion?.state).toBe('empty');
    // Expected an expense invoice that cannot be made: nothing is created.
    const refused = quickInvoiceCreate(context(owner), {
      ...input,
      expectedTotalMinor: preview.totalMinor,
      expectedCompanionTotalMinor: '12000',
      requestKey: 'expinv-refused',
    });
    expect(refused.ok).toBe(false);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()).toEqual({ n: 0 });
    const created = quickInvoiceCreate(context(owner), {
      ...input,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'expinv-hours-only',
    });
    if (!created.ok) throw new Error(created.reason);
    expect(expenseHolders(env, hotel)).toEqual([]);
    // The hotel is still billable on its own invoice.
    const later = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period, expenseInvoice: 'setting' });
    expect(later.companion).toMatchObject({ state: 'ready', sourceCount: 1, totalMinor: expect.any(String) });
  });

  it('cannot switch dates that are already invoiced; the choice says from when it can', () => {
    const env = setup({ include: true });
    const { f, owner, time, expense, context } = env;
    time('2026-08-03', 480);
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const first = quickInvoiceCreate(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'expinv-first',
    });
    if (!first.ok) throw new Error(first.reason);
    const late = expense('2026-08-20', 5000n);
    const separate = quickInvoicePreview(context(owner), {
      projectId: f.project.id,
      ...period,
      expenseInvoice: 'separate',
    });
    expect(separate.expenseChoice).toMatchObject({ separate: false, changesSetting: false, blockedFrom: '2026-09-01' });
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM billing_rule WHERE stream_type='expense'").get()).toEqual({ n: 0 });
    expect(expenseHolders(env, late)).toEqual([]);
  });

  it('numbers the expense invoice with the project numbering, like the hours invoice', () => {
    const env = setup();
    const { f, owner, time, expense, context, settings, entity } = env;
    f.repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: entity.id,
      prefix: 'EXP',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00Z',
    });
    settings.setProjectMode(owner, { projectId: f.project.id, mode: 'separate' });
    time('2026-08-03', 480);
    expense('2026-08-04', 12000n);
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period, expenseInvoice: 'setting' });
    expect(preview.companion?.state).toBe('ready');
    const prefix = (value: string | null | undefined) => (value ?? '').replace(/\d+$/u, '');
    expect(prefix(preview.companion?.provisionalNumber)).toBe(prefix(preview.provisionalNumber));
  });
});
