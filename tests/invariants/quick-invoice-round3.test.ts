import { afterEach, describe, expect, it } from 'vitest';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import { quickInvoicePreview } from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';
import {
  quickInvoiceIssue,
  quickInvoiceSetRate,
} from '../../apps/portal/src/lib/server/billing-quick-invoice-fixes.ts';
import { setAssignmentPurchaseOrder } from '../../apps/portal/src/lib/server/assignment-po.ts';
import { exactExpenseConversion } from '../../apps/portal/src/lib/server/expense-conversion.ts';

/**
 * Billing round 3 (2026-11-17): exact line rounding, one invoice per assignment PO with the
 * worker named on every line, project rate from the earliest un-invoiced work, and issued
 * invoices that never change afterwards.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };
const count = (f: B5LifecycleSecurityFixture, sql: string, ...args: string[]) =>
  Number((f.sqlite.prepare(sql).get(...args) as { n: number }).n);

function setup(withRate = true) {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'inline-invoice');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'inline-invoice');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'inline-invoice');
  const manager = stepUpB5Principal(f.sqlite, f.manager, 'inline-invoice');
  if (withRate)
    f.v3.createClientLaborRate(finance, {
      projectId: f.project.id,
      workerId: f.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 10000n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-08-01',
    });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'INLINE',
    legalName: 'Inline issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'INLINE-ISSUER',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Inline issuer',
    taxIdentifier: 'INLINE-ISSUER',
    addressLine1: 'Madrid test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Inline invoice fixture authority',
    idempotencyKey: 'inline-issuer-revision',
  });
  f.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: f.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Inline invoice fixture authority',
    idempotencyKey: 'inline-issuer-assignment',
  });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'INL',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00Z',
  });
  f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  /** draft | submitted | needs_changes | approved */
  const time = (date: string, minutes: number, state: string) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: 'Inline invoice labor',
    });
    if (state === 'draft') return row.id;
    f.repository.submitTime(worker, row.id, row.version);
    if (state === 'submitted') return row.id;
    if (state === 'needs_changes') {
      f.repository.operationalApproveTime(f.manager, row.id, 'needs_changes', 'Check the hours');
      return row.id;
    }
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  const context = (principal: typeof finance) =>
    ({ sqlite: f.sqlite, repository: f.repository, v3: f.v3, principal }) as unknown as Parameters<
      typeof quickInvoicePreview
    >[0];
  return { f, finance, owner, worker, manager, time, context };
}


const member = (f: B5LifecycleSecurityFixture, workerId: string) =>
  f.sqlite.prepare('SELECT id,version FROM project_member WHERE project_id=? AND user_id=?').get(f.project.id, workerId) as {
    id: string;
    version: number;
  };

function secondWorker(env: ReturnType<typeof setup>) {
  const { f, owner, finance } = env;
  f.repository.assignWorker(owner, { projectId: f.project.id, workerId: 'b5-outsider', startsOn: '2026-01-01' });
  const other = stepUpB5Principal(f.sqlite, f.repository.principalFor('b5-outsider'), 'round3');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: 'b5-outsider',
    currency: 'EUR',
    hourlyRateMinor: 10000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const time = (date: string, minutes: number) => {
    const row = f.repository.createTimeEntry(other, { projectId: f.project.id, workDate: date, category: 'regular', minutes, summary: 'Commissioning' });
    f.repository.submitTime(other, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  return { other, time };
}

const snapshotOf = (f: B5LifecycleSecurityFixture, invoiceId: string) => ({
  invoice: f.sqlite
    .prepare('SELECT state,invoice_number,subtotal_minor,tax_minor,total_minor,snapshot_json,calculation_hash FROM invoice WHERE id=?')
    .get(invoiceId),
  lines: f.sqlite.prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY rowid').all(invoiceId),
});

describe('exact rounding per line group', () => {
  it('prices the summed minutes of a person once (no +0.01), and the issued invoice never changes afterwards', () => {
    const env = setup();
    const { f, owner, time, context } = env;
    // 9:20 + 9:20 + 9:05 at 100.00/h: per entry 933.33+933.33+908.33 = 2774.99; exact 27.75 h = 2775.00.
    time('2026-08-03', 560, 'approved');
    time('2026-08-04', 560, 'approved');
    time('2026-08-05', 545, 'approved');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.totalMinor).toBe('277500');
    const issued = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'round3-rounding',
      locale: 'en',
    });
    if (!issued.ok) throw new Error(`issued expected: ${issued.reason}`);
    const lines = f.sqlite
      .prepare("SELECT CAST(subtotal_minor AS TEXT) amount,description FROM invoice_line WHERE invoice_id=? AND source_type='time'")
      .all(issued.invoiceId) as Array<{ amount: string; description: string }>;
    expect(lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)).toBe(277500n);
    // Every labor line names the worker.
    for (const line of lines) expect(line.description).toContain(" · B5 Worker · regular");
    const before = snapshotOf(f, issued.invoiceId);
    // Later configuration (PO per assignment, a new project rate) never touches the issued invoice.
    const m = member(f, f.worker.userId);
    setAssignmentPurchaseOrder(context(owner), { projectId: f.project.id, assignmentId: m.id, version: m.version, poNumber: 'PO-AFTER' });
    expect(() =>
      f.sqlite.prepare('UPDATE invoice_line SET subtotal_minor=subtotal_minor+1 WHERE invoice_id=?').run(issued.invoiceId),
    ).toThrow();
    expect(snapshotOf(f, issued.invoiceId)).toEqual(before);
  });
});

describe('one invoice per assignment PO', () => {
  it('splits the preview, issues both in one action with each PO and the worker on every line', () => {
    const env = setup();
    const { f, owner, time, context } = env;
    const { time: otherTime } = secondWorker(env);
    time('2026-08-03', 480, 'approved');
    otherTime('2026-08-03', 450);
    const a = member(f, f.worker.userId);
    const b = member(f, 'b5-outsider');
    setAssignmentPurchaseOrder(context(owner), { projectId: f.project.id, assignmentId: a.id, version: a.version, poNumber: '1722812' });
    setAssignmentPurchaseOrder(context(owner), { projectId: f.project.id, assignmentId: b.id, version: b.version, poNumber: '1722815' });
    expect(
      f.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE action='assignment.po_update'").get(),
    ).toEqual({ n: 2 });
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.state).toBe('ready');
    expect(preview.split?.parts.map((part) => [part.purchaseNo, part.totalMinor])).toEqual([
      ['1722812', '80000'],
      ['1722815', '75000'],
    ]);
    expect(JSON.stringify(preview.split)).not.toContain('"refs"');
    const invoices = Number((f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get() as { n: number }).n);
    // A changed split (e.g. stale screen) creates nothing.
    expect(
      quickInvoiceIssue(context(owner), {
        projectId: f.project.id,
        ...period,
        expectedTotalMinor: preview.split!.totalMinor,
        expectedSplit: 'stale',
        requestKey: 'round3-split-stale',
        locale: 'en',
      }),
    ).toMatchObject({ ok: false, reason: 'amount_changed' });
    expect(Number((f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get() as { n: number }).n)).toBe(invoices);
    const issued = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.split!.totalMinor,
      expectedSplit: preview.split!.signature,
      requestKey: 'round3-split',
      locale: 'en',
    });
    if (!issued.ok) throw new Error(`issued expected: ${issued.reason}`);
    expect(issued.invoices?.map((invoice) => invoice.purchaseNo)).toEqual(['1722812', '1722815']);
    for (const invoice of issued.invoices ?? []) {
      expect(f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(invoice.invoiceId)).toEqual({ state: 'issued' });
      const po = invoice.purchaseNo!;
      for (const line of f.sqlite
        .prepare("SELECT description FROM invoice_line WHERE invoice_id=? AND source_type='time'")
        .all(invoice.invoiceId) as Array<{ description: string }>)
        expect(line.description).toContain(`PO ${po}`);
    }
    // Nothing is billed twice.
    expect(quickInvoicePreview(context(owner), { projectId: f.project.id, ...period }).state).not.toBe('ready');
  });
});

describe('Save as this project\'s rate', () => {
  it('saves a project rate from the earliest un-invoiced work even when another person is already invoiced later', () => {
    const env = setup(false);
    const { f, owner, finance, context } = env;
    const { time: otherTime } = secondWorker(env);
    // The other person (own rate) is invoiced for August first.
    otherTime('2026-08-20', 60);
    const first = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const issued = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: first.totalMinor,
      requestKey: 'round3-rate-first',
      locale: 'en',
    });
    if (!issued.ok) throw new Error(`issued expected: ${issued.reason}`);
    const before = snapshotOf(f, issued.invoiceId);
    // A late entry of the worker without any rate, dated inside the issued period.
    const row = f.repository.createTimeEntry(env.worker, { projectId: f.project.id, workDate: '2026-08-10', category: 'regular', minutes: 120, summary: 'Late entry' });
    f.repository.submitTime(env.worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const item = preview.attention.find((entry) => entry.kind === 'clientRate');
    expect(item?.people?.[0]).toMatchObject({ workerId: f.worker.userId, fromDate: '2026-08-10' });
    const saved = quickInvoiceSetRate(context(owner), {
      kind: 'client',
      projectId: f.project.id,
      workerId: f.worker.userId,
      amount: '90',
      effectiveFrom: '2026-08-10',
      scope: 'project',
      appliesTo: 'project',
    });
    expect(saved).toMatchObject({ effectiveFrom: '2026-08-10', shifted: false });
    expect(
      f.sqlite
        .prepare('SELECT worker_id,effective_from,CAST(hourly_rate_minor AS TEXT) minor FROM client_labor_rate WHERE project_id=? AND worker_id IS NULL')
        .all(f.project.id),
    ).toEqual([{ worker_id: null, effective_from: '2026-08-10', minor: '9000' }]);
    const after = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(after.attention.some((entry) => entry.kind === 'clientRate')).toBe(false);
    expect(after.state).toBe('ready');
    expect(after.totalMinor).toBe('18000');
    expect(snapshotOf(f, issued.invoiceId)).toEqual(before);
  });
});

describe('exact expense conversion entry', () => {
  it('converts with the typed rate once (integer math) or takes the typed amount', () => {
    expect(exactExpenseConversion(2000, 'EUR', 'USD', { rate: '1,0834' })).toEqual({
      projectCurrencyAmountMinor: 2167,
      rate: '1.0834',
      rateBps: 10834,
    });
    expect(exactExpenseConversion(2000, 'EUR', 'USD', { rate: '1.08345678' })).toMatchObject({
      projectCurrencyAmountMinor: 2167,
      rateBps: null,
    });
    expect(exactExpenseConversion(2000, 'EUR', 'USD', { convertedAmount: '21,70', rate: '9' })).toEqual({
      projectCurrencyAmountMinor: 2170,
      rate: null,
      rateBps: null,
    });
    expect(() => exactExpenseConversion(2000, 'EUR', 'USD', {})).toThrow();
    expect(() => exactExpenseConversion(2000, 'EUR', 'USD', { rate: '0' })).toThrow();
  });
});

describe('replacement invoice after a void', () => {
  it('links the new invoice to the voided original with an audit row', () => {
    const env = setup();
    const { f, owner, finance, time, context } = env;
    time('2026-08-04', 120, 'approved');
    const first = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const original = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: first.totalMinor,
      requestKey: 'round3-original',
      locale: 'en',
    });
    if (!original.ok) throw new Error('issued expected');
    f.v3.voidInvoice(finance, original.invoiceId, 'Wrong rate on the invoice', 'round3-void-0001');
    const again = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const replacement = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: again.totalMinor,
      requestKey: 'round3-replacement',
      locale: 'en',
      replacesInvoiceId: original.invoiceId,
    });
    if (!replacement.ok) throw new Error(`replacement expected: ${replacement.reason}`);
    expect(
      f.sqlite.prepare('SELECT voided_invoice_id FROM invoice_replacement_link WHERE replacement_invoice_id=?').get(replacement.invoiceId),
    ).toEqual({ voided_invoice_id: original.invoiceId });
    expect(
      f.sqlite
        .prepare("SELECT json_extract(metadata_json,'$.replacesInvoiceId') replaces FROM audit_event WHERE action='invoice.replacement_link' AND entity_id=?")
        .get(replacement.invoiceId),
    ).toEqual({ replaces: original.invoiceId });
  });
});
