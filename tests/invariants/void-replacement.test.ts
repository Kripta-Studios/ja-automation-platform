import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError } from '@ja/database';
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

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'quick-invoice');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'quick-invoice');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'quick-invoice');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 12345n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'QUICK',
    legalName: 'Quick issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'QUICK-ISSUER',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Quick issuer',
    taxIdentifier: 'QUICK-ISSUER',
    addressLine1: 'Madrid test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Quick invoice fixture authority',
    idempotencyKey: 'quick-issuer-revision',
  });
  f.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: f.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Quick invoice fixture authority',
    idempotencyKey: 'quick-issuer-assignment',
  });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'QUICK',
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
  const time = (date: string, minutes: number, approve = true) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes,
      summary: 'Quick invoice labor',
    });
    if (!approve) return row.id;
    f.repository.submitTime(worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return row.id;
  };
  const context = (principal: typeof finance) =>
    ({ sqlite: f.sqlite, repository: f.repository, v3: f.v3, principal }) as unknown as Parameters<
      typeof quickInvoicePreview
    >[0];
  return { f, finance, owner, worker, time, context };
}

const period = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };
type Setup = ReturnType<typeof setup>;

function issueQuick(s: Setup, requestKey: string) {
  const preview = quickInvoicePreview(s.context(s.finance), { projectId: s.f.project.id, ...period });
  expect(preview.state).toBe('ready');
  const created = quickInvoiceCreate(s.context(s.finance), {
    projectId: s.f.project.id,
    ...period,
    expectedTotalMinor: preview.totalMinor,
    requestKey,
  });
  if (!created.ok) throw new Error(`draft expected: ${created.reason}`);
  s.f.repository.issueReviewedInvoice(s.finance, created.invoiceId, preview.totalMinor);
  return { invoiceId: created.invoiceId, totalMinor: preview.totalMinor };
}

/** Invariant: a billable source is held by at most one non-void invoice. */
function assertNoDuplicateBilling(s: Setup) {
  const duplicates = s.f.sqlite
    .prepare(
      `SELECT s.source_type,s.source_id,COUNT(DISTINCT s.invoice_id) n
         FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
        WHERE i.state NOT IN ('void','superseded')
        GROUP BY s.source_type,s.source_id HAVING n>1`,
    )
    .all();
  expect(duplicates).toEqual([]);
  const pointerMismatch = s.f.sqlite
    .prepare(
      `SELECT t.id FROM time_entry t JOIN invoice i ON i.id=t.invoice_id
        WHERE i.state='void'
           OR NOT EXISTS(SELECT 1 FROM invoice_source s WHERE s.source_type='time' AND s.source_id=t.id AND s.invoice_id=t.invoice_id)`,
    )
    .all();
  expect(pointerMismatch).toEqual([]);
}

describe('void, replacement and credit notes', () => {
  it('issues a credit note from its own page with the negative confirmed total', () => {
    const s = setup();
    s.time('2026-08-20', 60);
    const original = issueQuick(s, 'credit-original');
    const credit = s.f.repository.createInvoiceAdjustment(s.finance, {
      originalInvoiceId: original.invoiceId,
      adjustmentType: 'credit',
      amountMinor: 1000n,
      reason: 'Goodwill credit',
      idempotencyKey: 'credit-note-1',
    });
    const total = String(
      s.f.sqlite.prepare('SELECT CAST(total_minor AS TEXT) t FROM invoice WHERE id=?').get(credit.id)!.t,
    );
    expect(total.startsWith('-')).toBe(true);
    // The total-changed guard still applies to negative totals.
    expect(() => s.f.repository.issueReviewedInvoice(s.finance, credit.id, '-1')).toThrow(ConflictError);
    const issued = s.f.repository.issueReviewedInvoice(s.finance, credit.id, total);
    expect(issued.issued).toBe(true);
    expect(s.f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(credit.id)).toEqual({ state: 'issued' });
  });

  it('releases the sources of a voided invoice so a replacement can bill them exactly once', () => {
    const s = setup();
    const t1 = s.time('2026-08-20', 90);
    const t2 = s.time('2026-08-21', 60);
    const original = issueQuick(s, 'void-original');
    const snapshotBefore = s.f.sqlite
      .prepare('SELECT snapshot_json,invoice_number,CAST(total_minor AS TEXT) total FROM invoice WHERE id=?')
      .get(original.invoiceId);
    const linksBefore = s.f.sqlite
      .prepare('SELECT source_link_id,source_type,source_id FROM invoice_source WHERE invoice_id=? ORDER BY source_link_id')
      .all(original.invoiceId);
    expect(linksBefore.length).toBeGreaterThanOrEqual(2);
    // While issued, nothing is offered again.
    expect(quickInvoicePreview(s.context(s.finance), { projectId: s.f.project.id, ...period }).state).not.toBe('ready');

    // A credit note on the same period must not block the replacement.
    const credit = s.f.repository.createInvoiceAdjustment(s.finance, {
      originalInvoiceId: original.invoiceId,
      adjustmentType: 'credit',
      amountMinor: 500n,
      reason: 'Partial credit before void',
      idempotencyKey: 'credit-before-void',
    });
    s.f.repository.issueReviewedInvoice(
      s.finance,
      credit.id,
      String(s.f.sqlite.prepare('SELECT CAST(total_minor AS TEXT) t FROM invoice WHERE id=?').get(credit.id)!.t),
    );
    // Finance may void (spec), with a mandatory, audited reason.
    s.f.v3.voidInvoice(s.finance, original.invoiceId, 'Wrong rate on the invoice', 'void-key-0001');
    const voided = s.f.sqlite
      .prepare('SELECT state,snapshot_json,invoice_number,CAST(total_minor AS TEXT) total FROM invoice WHERE id=?')
      .get(original.invoiceId) as Record<string, unknown>;
    expect(voided.state).toBe('void');
    expect({ snapshot_json: voided.snapshot_json, invoice_number: voided.invoice_number, total: voided.total }).toEqual(snapshotBefore);
    const archived = s.f.sqlite
      .prepare('SELECT source_link_id,source_type,source_id FROM invoice_void_source_release WHERE invoice_id=? ORDER BY source_link_id')
      .all(original.invoiceId);
    expect(archived).toEqual(linksBefore);
    expect(() => s.f.sqlite.prepare('DELETE FROM invoice_void_source_release').run()).toThrow(/immutable/);
    expect(() =>
      s.f.sqlite.prepare("UPDATE invoice_void_source_release SET released_at='x'").run(),
    ).toThrow(/immutable/);
    for (const id of [t1, t2])
      expect(s.f.sqlite.prepare('SELECT invoice_id,billing_status FROM time_entry WHERE id=?').get(id)).toEqual({
        invoice_id: null,
        billing_status: 'unlocked',
      });
    const audit = s.f.sqlite
      .prepare("SELECT actor_id,COALESCE(details_json,'')||COALESCE(reason,'') details_json FROM audit_event WHERE action='invoice.void' AND entity_id=?")
      .get(original.invoiceId) as { actor_id: string; details_json: string } | undefined;
    expect(audit?.actor_id).toBe(s.finance.userId);
    expect(String(audit?.details_json)).toContain('Wrong rate on the invoice');

    // Replacement: same project and dates, same work, a new number.
    const replacement = issueQuick(s, 'void-replacement');
    expect(replacement.invoiceId).not.toBe(original.invoiceId);
    expect(replacement.totalMinor).toBe(snapshotBefore!.total);
    for (const id of [t1, t2])
      expect(s.f.sqlite.prepare('SELECT invoice_id FROM time_entry WHERE id=?').get(id)).toEqual({
        invoice_id: replacement.invoiceId,
      });
    assertNoDuplicateBilling(s);
    // Nothing is offered a third time.
    expect(quickInvoicePreview(s.context(s.finance), { projectId: s.f.project.id, ...period }).state).not.toBe('ready');
    // A source can never be attached to two live invoices, even directly.
    expect(() =>
      s.f.sqlite
        .prepare(
          "INSERT INTO invoice_source(source_link_id,invoice_id,source_type,source_id,source_version) VALUES('dup-link',?,'time',?,1)",
        )
        .run(original.invoiceId, t1),
    ).toThrow();
  });

  it('keeps released history immutable and refuses releases from a live invoice', () => {
    const s = setup();
    s.time('2026-08-20', 60);
    const original = issueQuick(s, 'live-original');
    const event = s.f.sqlite.prepare("SELECT id FROM invoice_event LIMIT 1").get() as { id: string } | undefined;
    expect(() =>
      s.f.sqlite
        .prepare(
          `INSERT INTO invoice_void_source_release(source_link_id,invoice_id,source_type,source_id,void_event_id,actor_id,released_at)
           SELECT source_link_id,invoice_id,source_type,source_id,?,?,? FROM invoice_source WHERE invoice_id=? LIMIT 1`,
        )
        .run(event?.id ?? 'none', s.finance.userId, '2026-09-01T00:00:00Z', original.invoiceId),
    ).toThrow();
    // Issued sources still cannot be deleted or detached.
    expect(() => s.f.sqlite.prepare('DELETE FROM invoice_source WHERE invoice_id=?').run(original.invoiceId)).toThrow();
    expect(() =>
      s.f.sqlite.prepare("UPDATE time_entry SET invoice_id=NULL,billing_status='unlocked' WHERE invoice_id=?").run(original.invoiceId),
    ).toThrow(/immutable/);
  });

  it('lets only owner and finance void', () => {
    const s = setup();
    s.time('2026-08-20', 60);
    const original = issueQuick(s, 'void-rbac');
    expect(() => s.f.v3.voidInvoice(s.worker, original.invoiceId, 'Nope', 'void-key-worker')).toThrow();
    expect(s.f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(original.invoiceId)).toEqual({ state: 'issued' });
    s.f.v3.voidInvoice(s.owner, original.invoiceId, 'Owner void', 'void-key-owner');
    expect(s.f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(original.invoiceId)).toEqual({ state: 'void' });
  });
});

describe('milestone invoicing from New invoice', () => {
  it('offers an approved milestone of a milestone stream even when its due date is outside the dates', () => {
    const s = setup();
    const rule = s.f.repository.createBillingRule(s.finance, {
      projectId: s.f.project.id,
      legalEntityId: String(
        s.f.sqlite.prepare("SELECT id FROM legal_entity WHERE code='QUICK'").get()!.id,
      ),
      streamType: 'milestone',
      cadenceType: 'milestone',
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    }) as { id: string };
    const milestone = s.f.repository.createProjectMilestone(s.owner, {
      projectId: s.f.project.id,
      name: 'Manuals delivered',
      amountMinor: 100000n,
      dueOn: '2026-09-20',
    });
    s.f.repository.submitProjectMilestone(s.owner, milestone.id, milestone.version);
    s.f.repository.reviewProjectMilestone(s.owner, milestone.id, 'approved');
    const first = quickInvoicePreview(s.context(s.finance), {
      projectId: s.f.project.id,
      ...period,
      billingRuleId: rule.id,
    });
    expect(first.state).toBe('empty');
    expect(first.suggestedPeriod).toEqual({ start: '2026-09-20', end: '2026-09-20' });
    const input = {
      projectId: s.f.project.id,
      periodStart: first.suggestedPeriod!.start,
      periodEnd: first.suggestedPeriod!.end,
      billingRuleId: rule.id,
    };
    const ready = quickInvoicePreview(s.context(s.finance), input);
    expect(ready).toMatchObject({ state: 'ready' });
    expect(BigInt(ready.subtotalMinor)).toBe(100000n);
    const created = quickInvoiceCreate(s.context(s.finance), {
      ...input,
      expectedTotalMinor: ready.totalMinor,
      requestKey: 'milestone-create',
    });
    expect(created.ok).toBe(true);
  });
});

describe('draft details edits', () => {
  it('changes PO and payment terms on this draft only unless explicitly carried forward', () => {
    const s = setup();
    s.time('2026-08-20', 60);
    const preview = quickInvoicePreview(s.context(s.finance), { projectId: s.f.project.id, ...period });
    const created = quickInvoiceCreate(s.context(s.finance), {
      projectId: s.f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'draft-details',
    });
    if (!created.ok) throw new Error('draft expected');
    const ruleBefore = s.f.sqlite
      .prepare('SELECT version,payment_terms_days,po_number_override FROM billing_rule WHERE project_id=?')
      .get(s.f.project.id);
    const projectBefore = s.f.sqlite.prepare('SELECT version,po_number FROM project WHERE id=?').get(s.f.project.id);
    const version = Number(s.f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(created.invoiceId)!.version);
    s.f.repository.updateInvoiceDraftCustomizations(s.finance, created.invoiceId, {
      expectedVersion: version,
      purchaseNo: 'PO-DRAFT-ONLY',
      paymentTermsDays: 45,
    });
    expect(s.f.sqlite.prepare('SELECT version,payment_terms_days,po_number_override FROM billing_rule WHERE project_id=?').get(s.f.project.id)).toEqual(ruleBefore);
    expect(s.f.sqlite.prepare('SELECT version,po_number FROM project WHERE id=?').get(s.f.project.id)).toEqual(projectBefore);
    const draft = s.f.repository.invoicePreview(s.finance, created.invoiceId).invoice as Record<string, unknown>;
    expect(draft.purchase_no).toBe('PO-DRAFT-ONLY');
    expect(draft.payment_terms_days).toBe(45);
    expect(draft.source_settings_changed).toBe(false);
    // Explicit opt-in carries the value forward to the project defaults.
    const rule = s.f.sqlite.prepare('SELECT version FROM billing_rule WHERE project_id=?').get(s.f.project.id) as { version: number };
    const project = s.f.sqlite.prepare('SELECT version FROM project WHERE id=?').get(s.f.project.id) as { version: number };
    s.f.repository.updateInvoiceDraftCustomizations(s.finance, created.invoiceId, {
      expectedVersion: version + 1,
      expectedBillingRuleVersion: rule.version,
      expectedProjectVersion: project.version,
      purchaseNo: 'PO-FUTURE',
      paymentTermsDays: 60,
      applyToFutureInvoices: true,
    });
    const after = s.f.sqlite
      .prepare('SELECT b.payment_terms_days,COALESCE(b.po_number_override,p.po_number) po FROM billing_rule b JOIN project p ON p.id=b.project_id WHERE b.project_id=?')
      .get(s.f.project.id);
    expect(after).toEqual({ payment_terms_days: 60, po: 'PO-FUTURE' });
  });
});
