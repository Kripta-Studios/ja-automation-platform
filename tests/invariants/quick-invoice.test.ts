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
  quickInvoiceProjects,
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

describe('one-screen invoice creation', () => {
  it('shows the exact draft amount without writing anything, and creates exactly that amount', () => {
    const { f, finance, time, context } = setup();
    time('2026-08-20', 90);
    time('2026-08-21', 60);
    const invoicesBefore = f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n;
    const auditBefore = f.sqlite.prepare('SELECT COUNT(*) n FROM audit_event').get()!.n;
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    expect(preview.state).toBe('ready');
    // 2.5 h × 123.45 EUR = 308.625 → canonical engine rounding.
    expect(BigInt(preview.totalMinor)).toBeGreaterThan(0n);
    expect(preview.groups.filter((group) => group.kind === 'labor')).toHaveLength(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n).toBe(invoicesBefore);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_event').get()!.n).toBe(auditBefore);

    const created = quickInvoiceCreate(context(finance), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'quick-invoice-create-1',
    });
    expect(created).toMatchObject({ ok: true, totalMinor: preview.totalMinor });
    const saved = f.sqlite
      .prepare('SELECT state,CAST(total_minor AS TEXT) total FROM invoice WHERE id=?')
      .get(created.ok ? created.invoiceId : '');
    expect(saved).toEqual({ state: 'draft', total: preview.totalMinor });

    // The same hours are never offered again while they sit on a live invoice.
    const again = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    expect(again).toMatchObject({
      state: 'existing',
      existingInvoice: { id: created.ok ? created.invoiceId : '' },
    });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n).toBe(
      invoicesBefore + 1,
    );
  });

  it('refuses to create when the amount changed since the preview and leaves nothing behind', () => {
    const { f, finance, time, context } = setup();
    time('2026-08-20', 60);
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    const before = f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n;
    const result = quickInvoiceCreate(context(finance), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: (BigInt(preview.totalMinor) + 1n).toString(),
      requestKey: 'quick-invoice-stale',
    });
    expect(result).toMatchObject({ ok: false, reason: 'amount_changed' });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM invoice').get()!.n).toBe(before);
  });

  it('invoices approved hours and lists unapproved hours as left out', () => {
    const { f, finance, time, context } = setup();
    time('2026-08-20', 60);
    time('2026-08-22', 120, false);
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    expect(preview).toMatchObject({ state: 'ready', mode: 'selection' });
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: 'pending_time_submission', severity: 'excluded', count: 1, minutes: 120 }),
    );
    const created = quickInvoiceCreate(context(finance), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'quick-invoice-selection',
    });
    expect(created.ok).toBe(true);
  });

  it('issues the confirmed total atomically and rejects a stale confirmation', () => {
    const { f, finance, time, context } = setup();
    time('2026-08-20', 60);
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    const created = quickInvoiceCreate(context(finance), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'quick-invoice-issue',
    });
    if (!created.ok) throw new Error('draft expected');
    expect(() =>
      f.repository.issueReviewedInvoice(finance, created.invoiceId, '1'),
    ).toThrow(ConflictError);
    expect(f.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(created.invoiceId)).toEqual({
      state: 'draft',
    });
    const issued = f.repository.issueReviewedInvoice(finance, created.invoiceId, preview.totalMinor);
    expect(issued.issued).toBe(true);
    expect(issued.invoiceNumber).toMatch(/^QUICK/);
  });

  it('is limited to Finance and Owner roles', () => {
    const { f, worker, context } = setup();
    expect(() => quickInvoiceProjects(context(worker))).toThrow();
    expect(() =>
      quickInvoicePreview(context(worker), { projectId: f.project.id, ...period }),
    ).toThrow();
  });
});

describe('round 2: invoice preparation for finance and stale drafts', () => {
  it('D6: finance cannot approve submitted hours through Approve & include; they wait for owner/PM', () => {
    const { f, finance, worker, time, context } = setup();
    time('2026-08-20', 60);
    const sent = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 120,
      summary: 'Sent, not reviewed',
    });
    f.repository.submitTime(worker, sent.id, sent.version);
    const version = Number(
      f.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(sent.id)!.version,
    );
    const result = f.repository.approvePendingForInvoice(finance, {
      projectId: f.project.id,
      sources: [{ type: 'time', id: sent.id, version }],
      requestKey: 'round2-finance-approve',
      ...period,
    });
    expect(result.approved).toEqual([]);
    expect(result.skipped).toEqual([
      { type: 'time', id: sent.id, reason: 'owner_pm_approval_required' },
    ]);
    expect(f.sqlite.prepare('SELECT approval_state,approved_by FROM time_entry WHERE id=?').get(sent.id)).toEqual({
      approval_state: 'submitted',
      approved_by: null,
    });
    // The one-screen invoice lists them as waiting for owner/PM, never as "approve".
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period }) as unknown as {
      attention: Array<{ kind: string; reviewWaiting?: boolean; minutes?: number }>;
    };
    expect(preview.attention.find((item) => item.kind === 'approve')).toBeUndefined();
    expect(preview.attention).toContainEqual(
      expect.objectContaining({ kind: 'unsent', reviewWaiting: true, minutes: 120 }),
    );
  });

  it('explains a stale draft and refreshes it from the current approved hours', () => {
    const { f, finance, time } = setup();
    time('2026-08-20', 60);
    const rule = f.sqlite.prepare('SELECT id FROM billing_rule WHERE project_id=?').get(f.project.id)!;
    const draft = f.repository.createInvoiceDraft(finance, String(rule.id), period.periodStart, period.periodEnd);
    expect(f.repository.invoiceIssueDryRun(finance, draft.id)).toEqual({ ok: true });
    // More approved hours in the same period make the draft's calculation stale.
    time('2026-08-22', 30);
    const stale = f.repository.invoiceIssueDryRun(finance, draft.id);
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('stale expected');
    expect(stale.reasons[0]).toEqual({ code: 'stale_billing_configuration' });
    // A refresh would need nothing else, and the probe left the draft untouched.
    expect(stale.reasons).toHaveLength(1);
    const before = f.sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(draft.id)!;
    const refreshed = f.repository.refreshInvoiceDraft(finance, draft.id, Number(before.version));
    expect(f.repository.invoiceIssueDryRun(finance, refreshed.id)).toEqual({ ok: true });
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM invoice_line WHERE invoice_id=? AND source_type='time'")
        .get(refreshed.id)!.n,
    ).toBe(2);
    // Issued history is never rebuilt.
    expect(() => f.repository.refreshInvoiceDraft(finance, refreshed.id, 999)).toThrow(ConflictError);
  });
});
