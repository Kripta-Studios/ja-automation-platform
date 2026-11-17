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
 * One-screen invoice with inline fixes (design S1/S2/S3/S8): "Approve & include" from any
 * pre-approval state, exact projected total, inline client rate, guarded create+approve+issue.
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
  it('projects the pending work exactly, writes nothing on preview, then approves drafts, submitted and returned entries with audit', () => {
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
    expect(approve[0]!.people![0]!.states).toEqual({ draft: 1, submitted: 1, returned: 1, financePending: 0 });
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
    expect(result.approved).toHaveLength(3);
    for (const id of [draft, submitted, returned])
      expect(f.sqlite.prepare('SELECT approval_state,finance_approved_at IS NOT NULL f FROM time_entry WHERE id=?').get(id)).toEqual({
        approval_state: 'approved',
        f: 1,
      });
    // Per-record lifecycle evidence plus one grouped event with the real actor.
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='time.approved' AND actor_id=?", owner.userId)).toBe(3);
    expect(count(f, "SELECT COUNT(*) n FROM approval_event WHERE entity_id=? AND from_state='needs_changes' AND to_state='submitted'", returned)).toBe(1);
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

  it('is all-or-nothing when a record changed since it was shown', () => {
    const { f, owner, worker, time, context } = setup();
    time('2026-08-04', 90, 'draft');
    const changed = time('2026-08-05', 60, 'draft');
    const preview = quickInvoicePreview(context(owner), { projectId: f.project.id, ...period });
    const version = (f.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(changed) as { version: number }).version;
    f.repository.updateTimeEntry(worker, { id: changed, version, minutes: 75 } as never);
    expect(() =>
      quickInvoiceIncludePending(context(owner), {
        projectId: f.project.id,
        ...period,
        sources: pendingRefs(preview),
        requestKey: 'inline-approve-stale',
      }),
    ).toThrow(ConflictError);
    expect(count(f, "SELECT COUNT(*) n FROM time_entry WHERE approval_state<>'draft'")).toBe(0);
  });

  it('allows Finance to approve on behalf (audited as Finance) and denies project managers and workers', () => {
    const { f, finance, worker, manager, time, context } = setup();
    time('2026-08-04', 90, 'draft');
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
    expect(count(f, "SELECT COUNT(*) n FROM time_entry WHERE approval_state<>'draft'")).toBe(0);

    const result = quickInvoiceIncludePending(context(finance), {
      projectId: f.project.id,
      ...period,
      sources,
      requestKey: 'inline-finance-approve',
    });
    expect(result.approved).toHaveLength(1);
    expect(count(f, "SELECT COUNT(*) n FROM audit_event WHERE action='time.submit' AND actor_id=?", finance.userId)).toBe(1);
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
