import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import { quickInvoicePreview } from '../../apps/portal/src/lib/server/billing-quick-invoice.ts';
import {
  quickInvoiceIncludePending,
  quickInvoiceIssue,
  quickInvoiceSetRate,
} from '../../apps/portal/src/lib/server/billing-quick-invoice-fixes.ts';

/**
 * One-screen invoice with inline fixes (design S1/S2/S3/S8): "Approve & include" for what the
 * worker submitted (drafts / returned entries stay with the worker), exact projected total, inline client rate, guarded create+approve+issue.
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

const pendingRefs = (preview: ReturnType<typeof quickInvoicePreview>) =>
  (preview.attention.find((item) => item.kind === 'approve')?.people ?? []).flatMap(
    (person) => person.sources ?? [],
  );

describe('S1/S2: Approve & include with an exact projected total', () => {
  it('projects the submitted work exactly, writes nothing on preview, approves only what the worker sent, with audit', () => {
    const { f, owner, time, context } = setup();
    time('2026-08-03', 60, 'approved');
    const draft = time('2026-08-04', 90, 'draft');
    const submitted = time('2026-08-05', 120, 'submitted');
    const returned = time('2026-08-06', 30, 'needs_changes');
    // The projection also surfaces the missing internal cost of the pending work: fix it inline.
    const first = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const cost = first.attention.find((item) => item.kind === 'workerCost');
    expect(cost?.people?.[0]?.workerId).toBe(f.worker.userId);
    expect(
      quickInvoiceSetRate(context(owner), {
        kind: cost!.payMissing ? 'pay' : 'cost',
        projectId: f.project.id,
        workerId: f.worker.userId,
        amount: '40',
        effectiveFrom: cost!.people![0]!.fromDate!,
        scope: 'project',
        alsoCost: Boolean(cost!.costMissing),
      }),
    ).toMatchObject({ changed: 1 });
    const invoices = count(f, 'SELECT COUNT(*) n FROM invoice');
    const audits = count(f, 'SELECT COUNT(*) n FROM audit_event');

    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.attention.some((item) => item.kind === 'workerCost')).toBe(false);
    // Grouped: one approval item, one row for the person, never one per record.
    const approve = preview.attention.filter((item) => item.kind === 'approve');
    expect(approve).toHaveLength(1);
    expect(approve[0]!.people).toHaveLength(1);
    // Only the submitted entry is offered (owner decision 2026-11-19); drafts and returned
    // entries are listed apart, as information, and never counted in the projection.
    expect(approve[0]!.people![0]!.states).toEqual({ draft: 0, submitted: 1, returned: 0, financePending: 0 });
    const unsent = preview.attention.find((item) => item.kind === 'unsent');
    expect(unsent).toMatchObject({ blocks: 'none', minutes: 120 });
    expect(unsent!.people![0]!.states).toMatchObject({ draft: 1, returned: 1 });
    expect(unsent!.people![0]!.sources).toBeUndefined();
    expect(preview.projected).toBeTruthy();
    expect(BigInt(preview.projected!.totalMinor)).toBeGreaterThan(BigInt(preview.totalMinor));
    expect(BigInt(preview.projected!.includedPendingMinor)).toBe(
      BigInt(preview.projected!.totalMinor) - BigInt(preview.totalMinor),
    );
    expect(count(f, 'SELECT COUNT(*) n FROM invoice')).toBe(invoices);
    expect(count(f, 'SELECT COUNT(*) n FROM audit_event')).toBe(audits);
    expect(count(f, "SELECT COUNT(*) n FROM time_entry WHERE approval_state='approved'")).toBe(1);

    const result = quickInvoiceIncludePending(context(owner), {
      projectId: f.project.id,
      ...period,
      sources: pendingRefs(preview),
      requestKey: 'inline-approve-1',
    });
    expect(result.approved).toHaveLength(1);
    expect(f.sqlite.prepare('SELECT approval_state,finance_approved_at IS NOT NULL f FROM time_entry WHERE id=?').get(submitted)).toEqual({
      approval_state: 'approved',
      f: 1,
    });
    expect(f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(draft)).toEqual({ approval_state: 'draft' });
    expect(f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(returned)).toEqual({ approval_state: 'needs_changes' });
    // Per-record lifecycle evidence plus one grouped event with the real actor.
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='time.approved' AND actor_id=?", owner.userId)).toBe(1);
    expect(
      count(
        f,
        "SELECT COUNT(*) n FROM audit_event WHERE action='invoice.approve_on_behalf' AND json_extract(metadata_json,'$.event')='invoice_prep.approve_on_behalf' AND actor_id=?",
        owner.userId,
      ),
    ).toBe(1);

    // The real total after approval is the projected one, to the cent.
    const after = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(after.totalMinor).toBe(preview.projected!.totalMinor);
    expect(after.attention.some((item) => item.kind === 'approve')).toBe(false);
    expect(after.attention.some((item) => item.kind === 'unsent')).toBe(true);

    // Idempotent retry: same key replays, nothing new.
    const auditsAfter = count(f, 'SELECT COUNT(*) n FROM audit_event');
    expect(
      quickInvoiceIncludePending(context(owner), {
        projectId: f.project.id,
        ...period,
        sources: pendingRefs(preview),
        requestKey: 'inline-approve-1',
      }),
    ).toMatchObject({ replayed: true });
    expect(count(f, 'SELECT COUNT(*) n FROM audit_event')).toBe(auditsAfter);
  });

  it('never approves drafts or returned entries on the worker’s behalf, even when sent directly', () => {
    const { f, owner, time } = setup();
    const draft = time('2026-08-04', 90, 'draft');
    const returned = time('2026-08-05', 60, 'needs_changes');
    const version = (id: string) =>
      (f.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(id) as { version: number }).version;
    const result = f.repository.approvePendingForInvoice(owner, {
      projectId: f.project.id,
      sources: [
        { type: 'time', id: draft, version: version(draft) },
        { type: 'time', id: returned, version: version(returned) },
      ],
      requestKey: 'inline-unsent-direct',
    });
    expect(result.approved).toHaveLength(0);
    expect(result.skipped.map((entry) => entry.reason)).toEqual(['not_submitted', 'not_submitted']);
    expect(count(f, "SELECT COUNT(*) n FROM time_entry WHERE approval_state='approved'")).toBe(0);
  });

  it('lets the owner approve & include his OWN draft hours in one step; other drafts stay out', () => {
    const { f, owner, finance, time, context } = setup();
    f.v3.createClientLaborRate(finance, {
      projectId: f.project.id,
      workerId: f.owner.userId,
      currency: 'EUR',
      hourlyRateMinor: 10000n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-08-01',
    });
    const others = time('2026-08-04', 90, 'draft');
    // The owner also works on site: an assignment row (the team screen only assigns workers/PMs).
    f.sqlite
      .prepare(
        "INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,created_at,updated_at) VALUES('owner-member',?,?,'worker','2026-01-01','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
      )
      .run(f.project.id, f.owner.userId);
    const own = f.repository.createTimeEntry(owner, {
      projectId: f.project.id,
      workDate: '2026-08-05',
      category: 'regular',
      minutes: 60,
      summary: 'Owner on site',
    });
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const approve = preview.attention.find((item) => item.kind === 'approve');
    expect(approve?.people?.map((person) => person.workerId)).toEqual([f.owner.userId]);
    expect(approve!.people![0]!.states).toMatchObject({ draft: 1 });
    const unsent = preview.attention.find((item) => item.kind === 'unsent');
    expect(unsent?.people?.map((person) => person.workerId)).toEqual([f.worker.userId]);
    const result = quickInvoiceIncludePending(context(owner), {
      projectId: f.project.id,
      ...period,
      sources: pendingRefs(preview),
      requestKey: 'inline-own-draft',
    });
    expect(result.skipped).toEqual([]);
    expect(result.approved).toEqual([expect.objectContaining({ id: own.id })]);
    expect(f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(own.id)).toEqual({ approval_state: 'approved' });
    expect(f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(others)).toEqual({ approval_state: 'draft' });
    expect(
      count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='invoice.approve_on_behalf' AND actor_id=?", owner.userId),
    ).toBe(1);
    // Sending another worker's draft directly is still refused.
    const version = (f.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(others) as { version: number }).version;
    expect(
      f.repository.approvePendingForInvoice(owner, {
        projectId: f.project.id,
        sources: [{ type: 'time', id: others, version }],
        requestKey: 'inline-other-draft',
      }).skipped,
    ).toEqual([expect.objectContaining({ reason: 'not_submitted' })]);
  });

  it('is all-or-nothing when a record changed since it was shown', () => {
    const { f, owner, time, context } = setup();
    time('2026-08-04', 90, 'submitted');
    const changed = time('2026-08-05', 60, 'submitted');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    f.repository.operationalApproveTime(f.manager, changed, 'needs_changes', 'Check the hours');
    expect(() =>
      quickInvoiceIncludePending(context(owner), {
        projectId: f.project.id,
        ...period,
        sources: pendingRefs(preview),
        requestKey: 'inline-approve-stale',
      }),
    ).toThrow(ConflictError);
    expect(count(f, "SELECT COUNT(*) n FROM time_entry WHERE approval_state='approved'")).toBe(0);
  });

  it('allows Finance to approve on behalf (audited as Finance) and denies project managers and workers', () => {
    const { f, finance, worker, manager, time, context } = setup();
    time('2026-08-04', 90, 'submitted');
    const preview = quickInvoicePreview(context(finance), { projectId: f.project.id, ...period });
    const sources = pendingRefs(preview);
    for (const denied of [manager, worker])
      expect(() =>
        quickInvoiceIncludePending(context(denied), {
          projectId: f.project.id,
          ...period,
          sources,
          requestKey: `inline-denied-${denied.role}`,
        }),
      ).toThrow(AccessDeniedError);
    expect(() =>
      f.repository.approvePendingForInvoice(manager, {
        projectId: f.project.id,
        sources,
        requestKey: 'inline-denied-repository',
      }),
    ).toThrow(AccessDeniedError);
    expect(count(f, "SELECT COUNT(*) n FROM time_entry WHERE approval_state='approved'")).toBe(0);

    const result = quickInvoiceIncludePending(context(finance), {
      projectId: f.project.id,
      ...period,
      sources,
      requestKey: 'inline-finance-approve',
    });
    expect(result.approved).toHaveLength(1);
    expect(
      count(
        f,
        "SELECT COUNT(*) n FROM audit_event WHERE json_extract(metadata_json,'$.actorRole')='finance_admin' AND json_extract(metadata_json,'$.event')='invoice_prep.approve_on_behalf'",
      ),
    ).toBe(1);
  });

  it('rejects records of another project (IDOR)', () => {
    const { f, owner, time, context } = setup();
    const id = time('2026-08-04', 90, 'draft');
    expect(() =>
      f.repository.approvePendingForInvoice(owner, {
        projectId: 'another-project',
        sources: [{ type: 'time', id, version: 1 }],
        requestKey: 'inline-idor-1',
      }),
    ).toThrow(AccessDeniedError);
    void context;
  });
});

describe('S3: inline client rate', () => {
  it('saves a dated person rate on the project from the oldest affected date and clears the item', () => {
    const { f, owner, time, context } = setup(false);
    time('2026-08-04', 60, 'approved');
    time('2026-08-10', 60, 'approved');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const rate = preview.attention.find((item) => item.kind === 'clientRate');
    expect(rate?.people?.[0]).toMatchObject({ workerId: f.worker.userId, fromDate: '2026-08-04' });
    const saved = quickInvoiceSetRate(context(owner), {
      kind: 'client',
      projectId: f.project.id,
      workerId: f.worker.userId,
      amount: '85,50',
      effectiveFrom: '2026-08-04',
      scope: 'project',
    });
    expect(saved).toMatchObject({ changed: 1, effectiveFrom: '2026-08-04', shifted: false });
    expect(
      f.sqlite
        .prepare("SELECT CAST(hourly_rate_minor AS TEXT) minor,effective_from FROM client_labor_rate WHERE project_id=? AND worker_id=?")
        .get(f.project.id, f.worker.userId),
    ).toEqual({ minor: '8550', effective_from: '2026-08-04' });
    expect(count(f, 'SELECT COUNT(*) n FROM assignment_rate_override WHERE client_labor_rate_id IS NOT NULL')).toBe(1);
    const after = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(after.attention.some((item) => item.kind === 'clientRate')).toBe(false);
    expect(after.state).toBe('ready');
    expect(after.totalMinor).toBe('17100');
  });
});

describe('S8: create + approve + issue in one request', () => {
  it('issues exactly the confirmed total, refuses a changed total and never bills twice', () => {
    const { f, owner, time, context } = setup();
    time('2026-08-04', 90, 'approved');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    expect(preview.state).toBe('ready');
    const before = count(f, 'SELECT COUNT(*) n FROM invoice');
    expect(
      quickInvoiceIssue(context(owner), {
        projectId: f.project.id,
        ...period,
        expectedTotalMinor: (BigInt(preview.totalMinor) + 1n).toString(),
        requestKey: 'inline-issue-wrong',
        locale: 'en',
      }),
    ).toMatchObject({ ok: false, reason: 'amount_changed' });
    expect(count(f, 'SELECT COUNT(*) n FROM invoice')).toBe(before);

    const issued = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'inline-issue-1',
      locale: 'en',
      purchaseNo: 'PO-777',
    });
    expect(issued).toMatchObject({ ok: true, state: 'issued', totalMinor: preview.totalMinor });
    if (!issued.ok) throw new Error('issued expected');
    expect(issued.number).toMatch(/^INL/);
    expect(String((f.repository.invoicePreview(owner, issued.invoiceId).invoice as Record<string, unknown>).purchase_no)).toBe('PO-777');

    const again = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'inline-issue-2',
      locale: 'en',
    });
    expect(again).toMatchObject({ ok: false, reason: 'already_invoiced', invoiceId: issued.invoiceId });
    expect(count(f, "SELECT COUNT(*) n FROM invoice WHERE state NOT IN ('void','cancelled','superseded')")).toBe(before + 1);
  });

  it('still records that the invoice was sent after the client paid (B5), keeping the payment state', () => {
    const { f, owner, finance, time, context } = setup();
    time('2026-08-04', 90, 'approved');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const issued = quickInvoiceIssue(context(owner), {
      projectId: f.project.id,
      ...period,
      expectedTotalMinor: preview.totalMinor,
      requestKey: 'inline-issue-pay-send',
      locale: 'en',
    });
    if (!issued.ok) throw new Error('issued expected');
    f.v3.recordInvoicePdf(finance, issued.invoiceId, 'invoices/INL-pay-send.pdf', 'c'.repeat(64), 4);
    f.repository.recordPayment(finance, {
      invoiceId: issued.invoiceId,
      amountMinor: BigInt(preview.totalMinor),
      currency: 'EUR',
      receivedAt: new Date().toISOString(),
      reference: 'Paid before it was marked sent',
      idempotencyKey: 'inline-pay-before-send',
    });
    expect(f.sqlite.prepare('SELECT state,sent_at FROM invoice WHERE id=?').get(issued.invoiceId)).toEqual({
      state: 'paid',
      sent_at: null,
    });
    expect(f.repository.sendInvoice(finance, issued.invoiceId, 'inline-send-after-pay')).toMatchObject({ sent: true });
    expect(
      f.sqlite.prepare('SELECT state,sent_at IS NOT NULL sent FROM invoice WHERE id=?').get(issued.invoiceId),
    ).toEqual({ state: 'paid', sent: 1 });
    expect(f.repository.sendInvoice(finance, issued.invoiceId, 'inline-send-after-pay-2')).toMatchObject({ sent: false });
  });

  it('a stream PO copied from the project follows the project when the project PO changes (B4)', () => {
    const { f, owner, finance } = setup();
    const rule = f.sqlite.prepare("SELECT id FROM billing_rule WHERE project_id=? AND stream_type='labor'").get(f.project.id) as { id: string };
    const version = () => (f.sqlite.prepare('SELECT version FROM project WHERE id=?').get(f.project.id) as { version: number }).version;
    f.repository.updateProject(owner, { projectId: f.project.id, version: version(), poNumber: 'Placeholder' });
    f.sqlite.prepare("UPDATE billing_rule SET po_number_override='Placeholder' WHERE id=?").run(rule.id);
    f.repository.updateProject(owner, { projectId: f.project.id, version: version(), poNumber: null });
    expect(f.sqlite.prepare('SELECT po_number_override FROM billing_rule WHERE id=?').get(rule.id)).toEqual({ po_number_override: null });
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='billing_rule.update' AND entity_id=?", rule.id)).toBe(1);
    // A stream with its own, different PO keeps it.
    f.sqlite.prepare("UPDATE billing_rule SET po_number_override='OWN-PO' WHERE id=?").run(rule.id);
    f.repository.updateProject(owner, { projectId: f.project.id, version: version(), poNumber: 'NEW' });
    expect(f.sqlite.prepare('SELECT po_number_override FROM billing_rule WHERE id=?').get(rule.id)).toEqual({ po_number_override: 'OWN-PO' });
    void finance;
  });

  it('is denied to project managers', () => {
    const { f, manager, time, context } = setup();
    time('2026-08-04', 90, 'approved');
    expect(() =>
      quickInvoiceIssue(context(manager), {
        projectId: f.project.id,
        ...period,
        expectedTotalMinor: '1',
        requestKey: 'inline-issue-pm',
        locale: 'en',
      }),
    ).toThrow(AccessDeniedError);
  });
});

void seedB5User;
