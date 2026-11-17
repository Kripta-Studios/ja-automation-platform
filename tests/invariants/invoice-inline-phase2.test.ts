import { afterEach, describe, expect, it } from 'vitest';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import {
  quickInvoiceCreate,
  quickInvoicePreview,
} from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';
import {
  quickInvoiceCorrectHours,
  quickInvoiceIssue,
  quickInvoiceSetRate,
  quickInvoiceSetTax,
  quickInvoiceUpdateClient,
} from '../../apps/portal/src/lib/server/billing-quick-invoice-fixes.ts';
import { saveClientRate } from '../../apps/portal/src/lib/server/rates-core.ts';

/**
 * Invoice inline phase 2 (design S6/S7/S9 + client tax ID + same-day rate replacement):
 * "this invoice only" overrides priced by the engine and frozen at issue, stream tax change,
 * atomic hour correction, client tax ID on the invoice.
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
  const ruleId = String(
    (f.sqlite.prepare('SELECT id FROM billing_rule WHERE project_id=?').get(f.project.id) as { id: string }).id,
  );
  return { f, finance, owner, worker, manager, time, context, entity, ruleId };
}


const issue = (
  ctx: ReturnType<ReturnType<typeof setup>['context']>,
  projectId: string,
  overrides: Parameters<typeof quickInvoicePreview>[1]['overrides'],
  key: string,
) => {
  const preview = quickInvoicePreview(ctx, { projectId, ...period, overrides });
  expect(preview.state).toBe('ready');
  const issued = quickInvoiceIssue(ctx, {
    projectId,
    ...period,
    overrides,
    expectedTotalMinor: preview.totalMinor,
    requestKey: key,
    locale: 'en',
  });
  if (!issued.ok) throw new Error(`issue failed: ${JSON.stringify(issued).slice(0, 300)}`);
  return { preview, issued };
};

describe('S6: invoice-only overrides', () => {
  it('prices a missing rate for this invoice only, never touches rates or hours, and freezes at issue', () => {
    const { f, owner, time, context } = setup(false);
    const entry = time('2026-08-04', 120, 'approved');
    const before = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(before.state).not.toBe('ready');
    expect(before.attention.some((item) => item.kind === 'clientRate')).toBe(true);
    const rates = count(f, 'SELECT COUNT(*) n FROM client_labor_rate');
    const overrides = { people: [{ workerId: f.worker.userId, rateMinor: '5000' }] };
    const { preview, issued } = issue(context(owner), f.project.id, overrides, 'phase2-rate-1');
    expect(preview.totalMinor).toBe('10000');
    expect(preview.overrides?.people).toEqual([
      { workerId: f.worker.userId, category: null, rateMinor: '5000', billedMinutes: null },
    ]);
    expect(preview.groups.find((group) => group.kind === 'labor')).toMatchObject({
      overrideRate: true,
      unitPriceMinor: '5000',
      minutes: 120,
    });
    expect(issued).toMatchObject({ state: 'issued', totalMinor: '10000' });
    expect(count(f, 'SELECT COUNT(*) n FROM client_labor_rate')).toBe(rates);
    expect(f.sqlite.prepare('SELECT minutes FROM time_entry WHERE id=?').get(entry)).toEqual({ minutes: 120 });
    const rows = f.sqlite
      .prepare('SELECT target_kind,worker_id,rate_minor,superseded_at FROM invoice_line_override WHERE invoice_id=?')
      .all(issued.invoiceId);
    expect(rows).toEqual([
      { target_kind: 'person', worker_id: f.worker.userId, rate_minor: 5000, superseded_at: null },
    ]);
    const line = f.sqlite
      .prepare("SELECT snapshot_json FROM invoice_line WHERE invoice_id=? AND source_type='time'")
      .get(issued.invoiceId) as { snapshot_json: string };
    expect(JSON.parse(line.snapshot_json)).toMatchObject({ overrideRateMinor: '5000' });
    expect(
      count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='invoice_line_override.create' AND entity_id=?", issued.invoiceId),
    ).toBe(1);
    // Immutable once issued: no new override, no supersede, no delete.
    expect(() =>
      f.sqlite
        .prepare(
          "INSERT INTO invoice_line_override(id,invoice_id,target_kind,worker_id,rate_minor,created_by,created_at) VALUES('x1',?,'person',?,1,?,'2026-08-31')",
        )
        .run(issued.invoiceId, f.worker.userId, owner.userId),
    ).toThrow(/unissued draft/);
    expect(() =>
      f.sqlite.prepare("UPDATE invoice_line_override SET superseded_at='2026-09-01' WHERE invoice_id=?").run(issued.invoiceId),
    ).toThrow(/append-only|frozen/);
    expect(() => f.sqlite.prepare('DELETE FROM invoice_line_override WHERE invoice_id=?').run(issued.invoiceId)).toThrow(
      /retained/,
    );
    // Duplicate billing stays impossible: the same work cannot be invoiced again.
    const again = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period, overrides });
    expect(again.state).not.toBe('ready');
  });

  it('bills fewer hours for this invoice only, keeps pay hours, and bounds write-ups', () => {
    const { f, owner, time, context } = setup();
    const ids = [time('2026-08-03', 60, 'approved'), time('2026-08-04', 60, 'approved'), time('2026-08-05', 60, 'approved')];
    const plain = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(plain.totalMinor).toBe('30000');
    const overrides = { people: [{ workerId: f.worker.userId, category: 'regular', billedMinutes: 120 }] };
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period, overrides });
    expect(preview.totalMinor).toBe('20000');
    expect(preview.groups.find((group) => group.kind === 'labor')).toMatchObject({
      minutes: 120,
      workedMinutes: 180,
      overrideHours: true,
    });
    expect(() =>
      quickInvoicePreview(context(owner), {
        projectId: f.project.id,
        ...period,
        overrides: { people: [{ workerId: f.worker.userId, billedMinutes: 271 }] },
      }),
    ).toThrow(/1.5/);
    const created = quickInvoiceCreate(context(owner), {
      projectId: f.project.id,
      ...period,
      overrides,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'phase2-hours-1',
    });
    expect(created).toMatchObject({ ok: true, totalMinor: '20000' });
    if (!created.ok) throw new Error('draft expected');
    expect(
      f.sqlite.prepare('SELECT billed_minutes,worked_minutes FROM invoice_line_override WHERE invoice_id=?').get(created.invoiceId),
    ).toEqual({ billed_minutes: 120, worked_minutes: 180 });
    for (const id of ids)
      expect(f.sqlite.prepare('SELECT minutes FROM time_entry WHERE id=?').get(id)).toEqual({ minutes: 60 });
    // A refresh of the selected draft keeps the override (engine reads it from the draft).
    const version = Number((f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(created.invoiceId) as { version: number }).version);
    f.repository.refreshSelectedInvoiceDraft(owner, created.invoiceId, version);
    expect(f.sqlite.prepare('SELECT CAST(total_minor AS TEXT) t FROM invoice WHERE id=?').get(created.invoiceId)).toEqual({ t: '20000' });
    // Approve + issue recompute the fingerprint from the stored overrides.
    f.repository.approveInvoiceDraft(owner, created.invoiceId);
    f.repository.issueInvoice(owner, created.invoiceId, 'en');
    expect(f.sqlite.prepare('SELECT state,CAST(total_minor AS TEXT) t FROM invoice WHERE id=?').get(created.invoiceId)).toEqual({
      state: 'issued',
      t: '20000',
    });
  });

  it('applies a tax and PO for this invoice only', () => {
    const { f, owner, time, context, entity } = setup();
    time('2026-08-04', 60, 'approved');
    const vat = f.repository.createTaxProfile(owner, {
      legalEntityId: entity.id,
      name: 'IVA 21',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'IVA', basisPoints: 2100 }],
    });
    const choice = quickInvoiceSetTax(context(owner), {
      projectId: f.project.id,
      ...period,
      scope: 'invoice',
      tax: { profileId: vat.id },
    });
    expect(choice).toMatchObject({ scope: 'invoice', taxProfileId: vat.id });
    const overrides = { tax: { mode: 'profile' as const, taxProfileId: vat.id }, purchaseNo: 'PO-ONCE' };
    const { preview, issued } = issue(context(owner), f.project.id, overrides, 'phase2-tax-1');
    expect(preview).toMatchObject({ subtotalMinor: '10000', taxMinor: '2100', totalMinor: '12100', taxProfileName: 'IVA 21', purchaseNo: 'PO-ONCE' });
    const snapshot = JSON.parse(
      String((f.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(issued.invoiceId) as { snapshot_json: string }).snapshot_json),
    );
    expect(snapshot.taxProfile).toMatchObject({ id: vat.id, name: 'IVA 21' });
    expect(snapshot.purchaseNo).toBe('PO-ONCE');
    // The stream itself is unchanged.
    expect(f.sqlite.prepare('SELECT tax_profile_id FROM billing_rule WHERE project_id=?').get(f.project.id)).toEqual({ tax_profile_id: null });
  });
});

describe('S7: change the stream tax from the invoice screen', () => {
  it('updates the stream in place without issued invoices and splits it after an issued one', () => {
    const { f, owner, time, context, entity, ruleId } = setup();
    const vat = f.repository.createTaxProfile(owner, {
      legalEntityId: entity.id,
      name: 'IVA 21',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'IVA', basisPoints: 2100 }],
    });
    time('2026-08-04', 60, 'approved');
    const inPlace = quickInvoiceSetTax(context(owner), { projectId: f.project.id, ...period, scope: 'fromPeriod', tax: { profileId: vat.id } });
    expect(inPlace).toMatchObject({ split: false, changed: true, ruleId });
    expect(f.sqlite.prepare('SELECT tax_profile_id,version FROM billing_rule WHERE id=?').get(ruleId)).toMatchObject({ tax_profile_id: vat.id });
    const { issued } = issue(context(owner), f.project.id, undefined, 'phase2-split-1');
    expect(issued.totalMinor).toBe('12100');
    // Back to no tax from September: issued August keeps its terms; the stream is split.
    const split = f.repository.changeBillingStreamTaxProfile(owner, { ruleId, taxProfileId: null, effectiveFrom: '2026-08-15' });
    expect(split).toMatchObject({ split: true, shifted: true, effectiveFrom: '2026-09-01' });
    expect(f.sqlite.prepare('SELECT effective_to,tax_profile_id FROM billing_rule WHERE id=?').get(ruleId)).toEqual({
      effective_to: '2026-08-31',
      tax_profile_id: vat.id,
    });
    expect(
      f.sqlite.prepare('SELECT effective_from,effective_to,tax_profile_id FROM billing_rule WHERE id=?').get(split.ruleId),
    ).toEqual({ effective_from: '2026-09-01', effective_to: null, tax_profile_id: null });
    expect(f.sqlite.prepare('SELECT state,CAST(total_minor AS TEXT) t FROM invoice WHERE id=?').get(issued.invoiceId)).toEqual({ state: 'issued', t: '12100' });
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='billing_rule.tax_profile_change'")).toBe(2);
  });
});

describe('S9: fix the worker record from the invoice', () => {
  it('corrects, submits and approves in one step with a reason; the invoice follows', () => {
    const { f, owner, finance, time, context } = setup();
    // Pay and internal cost, so corrected entries are priceable (the fixture has none).
    quickInvoiceSetRate(context(owner), {
      kind: 'pay',
      projectId: f.project.id,
      workerId: f.worker.userId,
      amount: '40',
      effectiveFrom: '2026-08-01',
      scope: 'project',
      alsoCost: true,
    });
    const approved = time('2026-08-04', 60, 'approved');
    const draft = time('2026-08-05', 90, 'draft');
    expect(() =>
      quickInvoiceCorrectHours(context(owner), {
        projectId: f.project.id,
        ...period,
        source: { type: 'time', id: approved, version: 4 },
        minutes: 45,
        reason: 'short',
        requestKey: 'phase2-fix-0',
      }),
    ).toThrow(/10 characters/);
    const version = (id: string) => Number((f.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(id) as { version: number }).version);
    const fixed = quickInvoiceCorrectHours(context(owner), {
      projectId: f.project.id,
      ...period,
      source: { type: 'time', id: approved, version: version(approved) },
      minutes: 45,
      reason: 'Lunch break was not deducted',
      requestKey: 'phase2-fix-1',
    });
    expect(fixed).toMatchObject({ fromMinutes: 60, toMinutes: 45, replayed: false });
    expect(f.sqlite.prepare('SELECT minutes,approval_state,finance_approved_at IS NOT NULL f FROM time_entry WHERE id=?').get(fixed.correctionId)).toEqual({
      minutes: 45,
      approval_state: 'approved',
      f: 1,
    });
    expect(f.sqlite.prepare('SELECT minutes FROM time_entry WHERE id=?').get(approved)).toEqual({ minutes: 60 });
    // Finance may fix a draft entry too (approved as recorded first, then corrected).
    const second = quickInvoiceCorrectHours(context(finance), {
      projectId: f.project.id,
      ...period,
      source: { type: 'time', id: draft, version: version(draft) },
      minutes: 60,
      reason: 'Worker logged the drive twice',
      requestKey: 'phase2-fix-2',
    });
    expect(second.toMinutes).toBe(60);
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.state).toBe('ready');
    // 45 min + 60 min at 100.00/h.
    expect(preview.totalMinor).toBe('17500');
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='time.correct_from_invoice'")).toBe(2);
  });
});

describe('Client tax ID and same-day rates', () => {
  it('saves the client tax ID inline and prints it on new invoices', () => {
    const { f, owner, time, context } = setup();
    time('2026-08-04', 60, 'approved');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.attention.some((item) => item.kind === 'clientDetails')).toBe(true);
    quickInvoiceUpdateClient(context(owner), {
      projectId: f.project.id,
      clientId: preview.client!.id,
      expectedVersion: preview.client!.version,
      taxId: 'B12345678',
    });
    const after = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(after.client?.taxId).toBe('B12345678');
    const { issued } = issue(context(owner), f.project.id, undefined, 'phase2-taxid-1');
    const snapshot = JSON.parse(
      String((f.sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(issued.invoiceId) as { snapshot_json: string }).snapshot_json),
    );
    expect(snapshot.client.taxId).toBe('B12345678');
  });

  it('replaces a client rate that starts the same day instead of refusing', () => {
    const { f, owner } = setup(false);
    const save = (amount: string) =>
      saveClientRate(f.sqlite, f.v3, owner, {
        projectId: f.project.id,
        workerId: f.worker.userId,
        amount,
        effectiveFrom: '2026-08-10',
      });
    expect(save('80')).toEqual({ changed: 1 });
    const rates = count(f, 'SELECT COUNT(*) n FROM client_labor_rate');
    expect(save('85,50')).toEqual({ changed: 1 });
    expect(count(f, 'SELECT COUNT(*) n FROM client_labor_rate')).toBe(rates);
    expect(
      f.sqlite
        .prepare("SELECT CAST(hourly_rate_minor AS TEXT) m FROM client_labor_rate WHERE worker_id=? AND effective_from='2026-08-10'")
        .get(f.worker.userId),
    ).toEqual({ m: '8550' });
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='client_rate.replace_same_day'")).toBe(1);
  });
});
