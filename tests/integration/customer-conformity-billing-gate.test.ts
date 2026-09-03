import { createHash } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReadinessError } from '@ja/database';
import type { Principal } from '@ja/domain';
import { assertCustomerPeriodSnapshotSafe } from '../../packages/database/src/domains/reports/customer-conformity-repository.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const previousDocumentRoots = new WeakMap<object, string | undefined>();

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    closeB5LifecycleSecurityFixture(fixture);
    const previous = previousDocumentRoots.get(fixture);
    if (previous === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previous;
  }
});

type CustomerConformity = Readonly<{
  id: string;
  periodReportId: string;
  snapshotVersion: number;
  snapshotSha256: string;
  snapshotJson: string;
  reportPdfStorageKey: string;
  reportPdfSha256: string;
  reportPdfByteLength: number;
  signerName: string;
  signerIdentity: string | null;
  signedAt: string;
  status: 'active' | 'invalidated';
}>;

type CustomerConformityContract = B5LifecycleSecurityFixture['v3'] & {
  approvePeriodReport(
    principal: Principal,
    input: Readonly<{
      periodReportId: string;
      expectedSnapshotVersion: number;
      expectedSnapshotSha256: string;
    }>,
  ): Readonly<{
    id: string;
    state: 'approved';
    snapshotVersion: number;
    snapshotSha256: string;
    approvedAt: string;
    changed: boolean;
  }>;
  recordCustomerConformity(
    principal: Principal,
    input: Readonly<{
      periodReportId: string;
      signerName: string;
      signerIdentity?: string;
      signedAt: string;
    }>,
  ): CustomerConformity;
  getCustomerConformity(principal: Principal, conformityId: string): Record<string, unknown>;
  invalidateCustomerConformity(
    principal: Principal,
    input: Readonly<{ conformityId: string; reason: string }>,
  ): Readonly<{ conformityId: string; reason: string; invalidatedAt: string }>;
};

type BillingContract = B5LifecycleSecurityFixture['repository'] & {
  createInvoiceDraft(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ): Readonly<{ id: string; created: boolean; refreshed: boolean }>;
  approveInvoiceDraft(principal: Principal, invoiceId: string): void;
  issueInvoice(
    principal: Principal,
    invoiceId: string,
  ): Readonly<{ invoiceNumber: string; issued: boolean }>;
};

function fixture(): B5LifecycleSecurityFixture {
  const base = createB5LifecycleSecurityFixture();
  const value = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'customer-conformity-owner-default'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'customer-conformity-finance-default'),
  };
  fixtures.push(value);
  previousDocumentRoots.set(value, process.env.JA_DOCUMENT_ROOT);
  process.env.JA_DOCUMENT_ROOT = join(value.directory, 'documents');
  return value;
}

function withoutSession(principal: Principal): Principal {
  const { sessionId: _sessionId, ...rest } = principal;
  return rest;
}

function conformity(value: B5LifecycleSecurityFixture): CustomerConformityContract {
  // The test freezes the service seam before its implementation is wired into
  // V3Repository.  No test path uses direct SQL as a substitute for that API.
  return value.v3 as unknown as CustomerConformityContract;
}

function billing(value: B5LifecycleSecurityFixture): BillingContract {
  return value.repository as unknown as BillingContract;
}

function steppedUp(
  value: B5LifecycleSecurityFixture,
  principal: Principal,
  suffix: string,
): Principal {
  const now = new Date().toISOString();
  const sessionId = `customer-conformity-${principal.userId}-${suffix}`;
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      principal.userId,
      new Date(Date.now() + 3_600_000).toISOString(),
      now,
      now,
      now,
    );
  return { ...principal, sessionId };
}

function bindCanonicalLegalEntity(
  value: B5LifecycleSecurityFixture,
  legacyLegalEntityId: string,
  key: string,
) {
  const finance = steppedUp(value, value.finance, `canonical-${key}`);
  const revision = value.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId,
    effectiveFrom: '2026-01-01',
    legalName: `Customer conformity ${key} entity`,
    taxIdentifier: `ES${key.replace(/[^A-Z0-9]/giu, '').toUpperCase()}01`,
    addressLine1: 'Customer conformity billing address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Establish canonical legal-entity authority before invoice issue',
    idempotencyKey: `customer-conformity:${key}:canonical-revision`,
  });
  value.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: value.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Bind the sign-off invoice to its canonical project legal entity',
    idempotencyKey: `customer-conformity:${key}:canonical-assignment`,
  });
}

function customerReport(
  value: B5LifecycleSecurityFixture,
  state: 'review' | 'approved' | 'final' = 'approved',
  withPdf = true,
) {
  const hasRate = value.sqlite
    .prepare('SELECT 1 FROM client_labor_rate WHERE project_id=? AND worker_id=? LIMIT 1')
    .get(value.project.id, value.worker.userId);
  if (!hasRate)
    value.repository.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-01-01',
    });
  const hasInternalCost = value.sqlite
    .prepare('SELECT 1 FROM internal_cost_rule WHERE project_id=? AND worker_id=? LIMIT 1')
    .get(value.project.id, value.worker.userId);
  if (!hasInternalCost)
    value.repository.createInternalCostRule(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 4_000n,
      effectiveFrom: '2026-01-01',
    });
  const hasCompensation = value.sqlite
    .prepare('SELECT 1 FROM compensation_rule WHERE project_id=? AND worker_id=? LIMIT 1')
    .get(value.project.id, value.worker.userId);
  if (!hasCompensation)
    value.repository.createCompensationRule(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      rateMinor: 3_000n,
      rateBasis: 'hourly',
      effectiveFrom: '2026-01-01',
    });
  const hasApprovedLabor = value.sqlite
    .prepare(
      "SELECT 1 FROM time_entry WHERE project_id=? AND worker_id=? AND work_date BETWEEN '2026-08-01' AND '2026-08-31' AND finance_approved_at IS NOT NULL LIMIT 1",
    )
    .get(value.project.id, value.worker.userId);
  if (!hasApprovedLabor) {
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-10',
      category: 'regular',
      minutes: 60,
      summary: 'Customer report signed labor source',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');
    value.repository.financeApproveTime(value.finance, time.id, true);
  }
  const entity = value.repository.createLegalEntity(value.owner, {
    code: `B5-SIGNOFF-${state}`,
    legalName: `B5 Sign-off ${state} Entity`,
    currency: 'EUR',
    billingAddress: 'B5 sign-off billing address',
    companyIdentifiers: `B5-SIGNOFF-${state}`,
  });
  const tax = value.repository.createTaxProfile(value.finance, {
    name: `No tax sign-off ${state}`,
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const rule = value.repository.createBillingRule(value.finance, {
    projectId: value.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: tax.id,
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  const close = value.v3.closeBillingPeriod(
    steppedUp(value, value.finance, `close-${state}`),
    rule.id,
    '2026-08-01',
    '2026-08-31',
  );
  if (!close.closed) throw new Error(`Billing period did not close: ${JSON.stringify(close)}`);
  const refreshed = value.v3.refreshPeriodReports(value.finance, {
    projectId: value.project.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  });
  const report = refreshed.find((candidate) => candidate.audience === 'customer');
  if (!report) throw new Error('Customer period report was not created');

  const binding = value.sqlite
    .prepare('SELECT snapshot_version,snapshot_sha256 FROM period_report WHERE id=?')
    .get(report.id) as { snapshot_version: number; snapshot_sha256: string };
  if (state !== 'review') {
    conformity(value).approvePeriodReport(value.finance, {
      periodReportId: report.id,
      expectedSnapshotVersion: binding.snapshot_version,
      expectedSnapshotSha256: binding.snapshot_sha256,
    });
  }

  if (!withPdf) return { reportId: report.id, billingRuleId: rule.id };

  const pdf = recordCustomerPdf(value, report.id, 'client-signoff.pdf');
  if (state === 'final')
    value.sqlite
      .prepare("UPDATE period_report SET state='final',updated_at=? WHERE id=?")
      .run(new Date().toISOString(), report.id);
  return { reportId: report.id, billingRuleId: rule.id, ...pdf };
}

function reportBinding(value: B5LifecycleSecurityFixture, reportId: string) {
  return value.sqlite
    .prepare(
      'SELECT state,snapshot_version,snapshot_sha256,updated_at FROM period_report WHERE id=?',
    )
    .get(reportId) as {
    state: string;
    snapshot_version: number;
    snapshot_sha256: string;
    updated_at: string;
  };
}

function recordCustomerPdf(value: B5LifecycleSecurityFixture, reportId: string, filename: string) {
  const documentRoot = join(value.directory, 'documents');
  const storageKey = `reports/${reportId}/${filename}`;
  const bytes = Buffer.from('%PDF-1.7\nJ&A customer sign-off\n%%EOF\n', 'utf8');
  mkdirSync(dirname(join(documentRoot, storageKey)), { recursive: true });
  writeFileSync(join(documentRoot, storageKey), bytes, { flag: 'wx' });
  const reportPdfSha256 = createHash('sha256').update(bytes).digest('hex');
  const previousDocumentRoot = process.env.JA_DOCUMENT_ROOT;
  try {
    process.env.JA_DOCUMENT_ROOT = documentRoot;
    value.v3.recordPeriodReportPdf(
      steppedUp(value, value.finance, `pdf-${reportId}-${filename}`),
      reportId,
      storageKey,
      reportPdfSha256,
      bytes.length,
    );
  } finally {
    if (previousDocumentRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previousDocumentRoot;
  }
  return { storageKey, reportPdfSha256, byteLength: bytes.length, bytes, documentRoot };
}

function withDocumentRoot<T>(
  value: B5LifecycleSecurityFixture,
  work: (documentRoot: string) => T,
): T {
  const documentRoot = join(value.directory, 'documents');
  const previousDocumentRoot = process.env.JA_DOCUMENT_ROOT;
  try {
    process.env.JA_DOCUMENT_ROOT = documentRoot;
    return work(documentRoot);
  } finally {
    if (previousDocumentRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previousDocumentRoot;
  }
}

function expectNoCustomerMoneyOrConfidentiality(value: unknown): void {
  const forbidden = new Set([
    'commercialSummary',
    'commercialCalculation',
    'financialSummary',
    'amountMinor',
    'laborRevenueMinor',
    'expenseRevenueMinor',
    'internalCostMinor',
    'clientRateMinor',
    'contributionMinor',
    'contributionMarginMinor',
    'paidMinor',
    'receivableMinor',
    'snapshotSha256',
    'reportPdfSha256',
    'reportPdfStorageKey',
    'reportPdfByteLength',
  ]);
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object') return;
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      expect(forbidden.has(key), `forbidden customer field: ${key}`).toBe(false);
      visit(nested);
    }
  };
  visit(value);
}

function createSignoffPolicy(value: B5LifecycleSecurityFixture): void {
  value.repository.createProjectCommercialPolicy(value.finance, {
    projectId: value.project.id,
    effectiveFrom: '2026-01-01',
    overtimeEnabled: true,
    overtimeThresholdMinutes: 600,
    travelClientBillable: true,
    customerSignoffRequired: true,
  });
}

function mutateCustomerSnapshot(
  value: B5LifecycleSecurityFixture,
  reportId: string,
  mutate: (snapshot: Record<string, unknown>) => void,
): void {
  const current = value.sqlite
    .prepare('SELECT snapshot_json FROM period_report WHERE id=?')
    .get(reportId) as { snapshot_json: string };
  const snapshot = JSON.parse(current.snapshot_json) as Record<string, unknown>;
  mutate(snapshot);
  const snapshotJson = JSON.stringify(snapshot);
  const snapshotSha256 = createHash('sha256').update(snapshotJson).digest('hex');
  value.sqlite
    .prepare(
      `UPDATE period_report
          SET snapshot_version=snapshot_version+1,snapshot_json=?,snapshot_sha256=?,
              pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL,approved_at=NULL
        WHERE id=?`,
    )
    .run(snapshotJson, snapshotSha256, reportId);
}

function createCustomerInvoiceScenario(value: B5LifecycleSecurityFixture) {
  createSignoffPolicy(value);
  const report = customerReport(value, 'approved');
  const rule = value.sqlite
    .prepare('SELECT legal_entity_id FROM billing_rule WHERE id=?')
    .get(report.billingRuleId) as { legal_entity_id: string };
  value.repository.createInvoiceNumberPolicy(value.owner, {
    legalEntityId: rule.legal_entity_id,
    prefix: 'B5-ADV',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00.000Z',
  });
  const repo = billing(value);
  const draft = repo.createInvoiceDraft(
    value.finance,
    report.billingRuleId,
    '2026-08-01',
    '2026-08-31',
  );
  const finance = steppedUp(value, value.finance, 'adversarial-billing');
  repo.approveInvoiceDraft(finance, draft.id);
  const signed = conformity(value).recordCustomerConformity(finance, {
    periodReportId: report.reportId,
    signerName: 'Ana Client',
    signedAt: '2026-08-24T16:30:00.000Z',
  });
  return {
    ...report,
    repo,
    draft,
    finance,
    signed,
    pdfPath: join(report.documentRoot, report.storageKey),
  };
}

describe('Client Essential period report review approval lifecycle', () => {
  it('lets an in-scope PM approve customer operational truth and denies Worker, outsider PM and internal-report access', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'review', false);
    const binding = reportBinding(value, reportId);
    expect(() =>
      service.approvePeriodReport(value.worker, {
        periodReportId: reportId,
        expectedSnapshotVersion: binding.snapshot_version,
        expectedSnapshotSha256: binding.snapshot_sha256,
      }),
    ).toThrow(/approval role|access|denied/i);
    expect(() =>
      service.approvePeriodReport(
        { ...value.manager, projectIds: new Set<string>() },
        {
          periodReportId: reportId,
          expectedSnapshotVersion: binding.snapshot_version,
          expectedSnapshotSha256: binding.snapshot_sha256,
        },
      ),
    ).toThrow(/project access|project review|denied/i);

    const internal = value.v3
      .listPeriodReports(value.finance)
      .find(
        (candidate) =>
          String((candidate as { audience: string }).audience) === 'internal' &&
          String((candidate as { period_start: string }).period_start) === '2026-08-01',
      ) as { id: string; snapshot_version: number; snapshot_sha256: string } | undefined;
    expect(internal).toBeDefined();
    expect(() =>
      service.approvePeriodReport(value.manager, {
        periodReportId: internal!.id,
        expectedSnapshotVersion: internal!.snapshot_version,
        expectedSnapshotSha256: internal!.snapshot_sha256,
      }),
    ).toThrow(/internal report|finance access/i);

    const approved = service.approvePeriodReport(value.manager, {
      periodReportId: reportId,
      expectedSnapshotVersion: binding.snapshot_version,
      expectedSnapshotSha256: binding.snapshot_sha256,
    });
    expect(approved).toMatchObject({
      id: reportId,
      state: 'approved',
      snapshotVersion: binding.snapshot_version,
      snapshotSha256: binding.snapshot_sha256,
      changed: true,
    });
  });

  it.each(['finance', 'owner'] as const)(
    'authorizes %s and records one append-only audit event across an idempotent retry',
    (role) => {
      const value = fixture();
      const service = conformity(value);
      const { reportId } = customerReport(value, 'review', false);
      const binding = reportBinding(value, reportId);
      const principal = role === 'finance' ? value.finance : value.owner;
      const input = {
        periodReportId: reportId,
        expectedSnapshotVersion: binding.snapshot_version,
        expectedSnapshotSha256: binding.snapshot_sha256,
      };
      const firstApproval = service.approvePeriodReport(principal, input);
      expect(firstApproval.changed).toBe(true);
      recordCustomerPdf(value, reportId, `${role}-approval-stability.pdf`);
      expect(service.approvePeriodReport(principal, input)).toMatchObject({
        id: reportId,
        changed: false,
        approvedAt: firstApproval.approvedAt,
      });
      const audits = value.sqlite
        .prepare(
          `SELECT actor_id,details_json FROM audit_event
            WHERE action='lifecycle.transition' AND entity_type='project' AND entity_id=?
              AND json_extract(details_json,'$.entityType')='period_report'
              AND json_extract(details_json,'$.entityId')=?`,
        )
        .all(value.project.id, reportId) as Array<{ actor_id: string; details_json: string }>;
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actor_id).toBe(principal.userId);
      expect(JSON.parse(audits[0]!.details_json)).toMatchObject({
        projectId: value.project.id,
        entityType: 'period_report',
        entityId: reportId,
        previousState: 'review',
        state: 'approved',
        snapshotVersion: binding.snapshot_version,
        snapshotSha256: binding.snapshot_sha256,
      });
    },
  );

  it('denies invalid predecessor states and never treats stale bindings or final history as retries', () => {
    const value = fixture();
    const service = conformity(value);
    const draftReport = customerReport(value, 'review', false);
    const draftBinding = reportBinding(value, draftReport.reportId);
    value.sqlite
      .prepare("UPDATE period_report SET state='draft' WHERE id=?")
      .run(draftReport.reportId);
    expect(() =>
      service.approvePeriodReport(value.finance, {
        periodReportId: draftReport.reportId,
        expectedSnapshotVersion: draftBinding.snapshot_version,
        expectedSnapshotSha256: draftBinding.snapshot_sha256,
      }),
    ).toThrow(/cannot be approved from state draft/i);

    value.sqlite
      .prepare("UPDATE period_report SET state='review' WHERE id=?")
      .run(draftReport.reportId);
    service.approvePeriodReport(value.finance, {
      periodReportId: draftReport.reportId,
      expectedSnapshotVersion: draftBinding.snapshot_version,
      expectedSnapshotSha256: draftBinding.snapshot_sha256,
    });
    expect(() =>
      service.approvePeriodReport(value.finance, {
        periodReportId: draftReport.reportId,
        expectedSnapshotVersion: draftBinding.snapshot_version,
        expectedSnapshotSha256: 'b'.repeat(64),
      }),
    ).toThrow(/cannot be approved from state approved|changed/i);

    value.sqlite
      .prepare("UPDATE period_report SET state='final' WHERE id=?")
      .run(draftReport.reportId);
    expect(() =>
      service.approvePeriodReport(value.finance, {
        periodReportId: draftReport.reportId,
        expectedSnapshotVersion: draftBinding.snapshot_version,
        expectedSnapshotSha256: draftBinding.snapshot_sha256,
      }),
    ).toThrow(/cannot be approved from state final/i);
    expect(reportBinding(value, draftReport.reportId)).toMatchObject({ state: 'final' });
  });

  it('returns a changed approved snapshot to review and rejects the old approval binding', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'approved', false);
    const approved = reportBinding(value, reportId);
    value.sqlite
      .prepare('UPDATE project SET name=?,updated_at=? WHERE id=?')
      .run('B5 lifecycle fixture revised', new Date().toISOString(), value.project.id);
    value.v3.refreshPeriodReports(value.finance, {
      projectId: value.project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    });
    const refreshed = reportBinding(value, reportId);
    expect(refreshed.state).toBe('review');
    expect(refreshed.snapshot_version).toBeGreaterThan(approved.snapshot_version);
    expect(refreshed.snapshot_sha256).not.toBe(approved.snapshot_sha256);
    expect(() =>
      service.approvePeriodReport(value.finance, {
        periodReportId: reportId,
        expectedSnapshotVersion: approved.snapshot_version,
        expectedSnapshotSha256: approved.snapshot_sha256,
      }),
    ).toThrow(/snapshot changed/i);
  });

  it('requires this real approval command before stepped-up conformity can bind the exact PDF version', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'review', true);
    const binding = reportBinding(value, reportId);
    const finance = steppedUp(value, value.finance, 'approval-before-sign');
    expect(() =>
      service.recordCustomerConformity(finance, {
        periodReportId: reportId,
        signerName: 'Ana Client',
        signedAt: '2026-08-24T16:30:00.000Z',
      }),
    ).toThrow(/not ready for sign-off/i);

    service.approvePeriodReport(value.manager, {
      periodReportId: reportId,
      expectedSnapshotVersion: binding.snapshot_version,
      expectedSnapshotSha256: binding.snapshot_sha256,
    });
    expect(
      service.recordCustomerConformity(finance, {
        periodReportId: reportId,
        signerName: 'Ana Client',
        signedAt: '2026-08-24T16:30:00.000Z',
      }),
    ).toMatchObject({
      periodReportId: reportId,
      snapshotVersion: binding.snapshot_version,
      snapshotSha256: binding.snapshot_sha256,
      status: 'active',
    });
  });
});

describe('Client Essential CORE-07/10 customer conformity contract', () => {
  it.each(['approved', 'final'] as const)(
    'records only the exact current %s zero-money customer report snapshot and ready PDF',
    (state) => {
      const value = fixture();
      const service = conformity(value);
      const { reportId } = customerReport(value, state);
      const beforeRefresh = value.sqlite
        .prepare(
          'SELECT snapshot_version,snapshot_sha256,snapshot_json,pdf_storage_key,pdf_sha256,pdf_byte_length FROM period_report WHERE id=?',
        )
        .get(reportId) as Record<string, unknown>;
      expectNoCustomerMoneyOrConfidentiality(JSON.parse(String(beforeRefresh.snapshot_json)));
      if (state === 'approved') {
        value.v3.refreshPeriodReports(value.finance, {
          projectId: value.project.id,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        });
        const afterRefresh = value.sqlite
          .prepare(
            'SELECT snapshot_version,snapshot_sha256,snapshot_json,pdf_storage_key,pdf_sha256,pdf_byte_length FROM period_report WHERE id=?',
          )
          .get(reportId) as Record<string, unknown>;
        expect(afterRefresh).toEqual(beforeRefresh);
      }
      const report = beforeRefresh;

      const finance = steppedUp(value, value.finance, 'finance');
      expect(() =>
        service.recordCustomerConformity(withoutSession(value.finance), {
          periodReportId: reportId,
          signerName: 'Ana Client',
          signerIdentity: 'ana.client@example.test',
          signedAt: '2026-08-24T16:30:00.000Z',
        }),
      ).toThrow(/step.?up/i);

      const signed = service.recordCustomerConformity(finance, {
        periodReportId: reportId,
        signerName: 'Ana Client',
        signerIdentity: 'ana.client@example.test',
        signedAt: '2026-08-24T16:30:00.000Z',
      });
      expect(signed).toMatchObject({
        periodReportId: reportId,
        snapshotVersion: report.snapshot_version,
        snapshotSha256: report.snapshot_sha256,
        snapshotJson: report.snapshot_json,
        reportPdfStorageKey: report.pdf_storage_key,
        reportPdfSha256: report.pdf_sha256,
        reportPdfByteLength: report.pdf_byte_length,
        signerName: 'Ana Client',
        signerIdentity: 'ana.client@example.test',
        signedAt: '2026-08-24T16:30:00.000Z',
        status: 'active',
      });

      expect(() =>
        service.recordCustomerConformity(finance, {
          periodReportId: reportId,
          signerName: 'Changed signer',
          signedAt: '2026-08-24T16:31:00.000Z',
        }),
      ).toThrow(/active|duplicate|conformity|already/i);
      expect(() =>
        value.sqlite
          .prepare("UPDATE customer_conformity SET signer_name='Tampered' WHERE id=?")
          .run(signed.id),
      ).toThrow();
      expect(() =>
        value.sqlite.prepare('DELETE FROM customer_conformity WHERE id=?').run(signed.id),
      ).toThrow();

      const pmView = service.getCustomerConformity(value.manager, signed.id);
      expect(pmView).toMatchObject({ id: signed.id, periodReportId: reportId, status: 'active' });
      for (const key of [
        'snapshotJson',
        'snapshot_json',
        'snapshotSha256',
        'snapshot_sha256',
        'reportPdfStorageKey',
        'report_pdf_storage_key',
        'reportPdfSha256',
        'report_pdf_sha256',
        'reportPdfByteLength',
        'report_pdf_byte_length',
      ])
        expect(pmView).not.toHaveProperty(key);
      expect(() => service.getCustomerConformity(value.worker, signed.id)).toThrow(
        /access|denied|role|worker/i,
      );

      const owner = steppedUp(value, value.owner, 'owner');
      expect(() =>
        service.invalidateCustomerConformity(withoutSession(value.owner), {
          conformityId: signed.id,
          reason: 'Customer requested corrected activity wording',
        }),
      ).toThrow(/step.?up/i);
      const invalidated = service.invalidateCustomerConformity(owner, {
        conformityId: signed.id,
        reason: 'Customer requested corrected activity wording',
      });
      expect(invalidated).toMatchObject({
        conformityId: signed.id,
        reason: 'Customer requested corrected activity wording',
      });
      expect(
        value.sqlite
          .prepare(
            'SELECT reason,actor_id FROM customer_conformity_invalidation WHERE conformity_id=?',
          )
          .get(signed.id),
      ).toMatchObject({
        reason: 'Customer requested corrected activity wording',
        actor_id: value.owner.userId,
      });
      expect(() =>
        service.invalidateCustomerConformity(owner, {
          conformityId: signed.id,
          reason: 'Duplicate invalidation must not rewrite history',
        }),
      ).toThrow(/invalid|active|already|conflict/i);

      const stored = value.sqlite
        .prepare(
          'SELECT snapshot_version,snapshot_sha256,snapshot_json,report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,signer_name,signed_at FROM customer_conformity WHERE id=?',
        )
        .get(signed.id) as Record<string, unknown>;
      expect(stored).toMatchObject({
        snapshot_version: report.snapshot_version,
        snapshot_sha256: report.snapshot_sha256,
        snapshot_json: report.snapshot_json,
        report_pdf_storage_key: report.pdf_storage_key,
        report_pdf_sha256: report.pdf_sha256,
        report_pdf_byte_length: report.pdf_byte_length,
        signer_name: 'Ana Client',
        signed_at: '2026-08-24T16:30:00.000Z',
      });
    },
  );
});

describe('Client Essential customer sign-off security boundary', () => {
  it('requires current can_review membership for PM period-report approval', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'review', false);
    const binding = reportBinding(value, reportId);
    value.sqlite
      .prepare(
        "UPDATE project_member SET can_review=0 WHERE project_id=? AND user_id=? AND status='active'",
      )
      .run(value.project.id, value.manager.userId);
    expect(() =>
      service.approvePeriodReport(value.manager, {
        periodReportId: reportId,
        expectedSnapshotVersion: binding.snapshot_version,
        expectedSnapshotSha256: binding.snapshot_sha256,
      }),
    ).toThrow(/review|access/i);
  });

  it('returns assigned PM/Worker the customer approval binding without private artifact or commercial data', () => {
    const value = fixture();
    const generated = customerReport(value, 'approved');
    const financeRow = value.v3
      .listPeriodReports(value.finance)
      .find((row) => String(row.id) === generated.reportId) as Record<string, unknown> | undefined;
    expect(financeRow).toMatchObject({
      snapshot_version: expect.any(Number),
      snapshot_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      pdf_storage_key: generated.storageKey,
      pdf_sha256: generated.reportPdfSha256,
      pdf_byte_length: generated.byteLength,
    });
    for (const principal of [value.manager, value.worker]) {
      const rows = value.v3.listPeriodReports(principal) as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.audience).toBe('customer');
        expect(row.snapshot_version).toEqual(expect.any(Number));
        expect(row.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(row).not.toHaveProperty('pdf_storage_key');
        expect(row).not.toHaveProperty('pdf_sha256');
        expect(row).not.toHaveProperty('pdf_byte_length');
        expect(JSON.stringify(row)).not.toMatch(
          /amount|currency|rate|cost|margin|tax|billing|reimbursement|compensation|storage_key|pdf_sha256/i,
        );
      }
    }

    expect(value.v3.listPeriodReports({ ...value.manager, projectIds: new Set<string>() })).toEqual(
      [],
    );
    expect(value.v3.listPeriodReports({ ...value.worker, projectIds: new Set<string>() })).toEqual(
      [],
    );
  });

  it('fails closed on adversarial nested customer snapshot reads for PM and Worker', () => {
    const value = fixture();
    const { reportId } = customerReport(value, 'approved', false);
    mutateCustomerSnapshot(value, reportId, (snapshot) => {
      (snapshot.project as Record<string, unknown>).name = {
        description: 'safe-looking',
        amountMinor: 5000,
        currency: 'EUR',
      };
    });
    for (const principal of [value.manager, value.worker])
      expect(() => value.v3.periodReportSnapshot(principal, reportId)).toThrow(
        /regenerated from a safe snapshot/i,
      );
  });

  it('accepts only safe scalar time source IDs/versions in the zero-money allowlist', () => {
    const value = fixture();
    const { reportId } = customerReport(value, 'approved', false);
    const row = value.sqlite
      .prepare('SELECT snapshot_json FROM period_report WHERE id=?')
      .get(reportId) as { snapshot_json: string };
    const safe = JSON.parse(row.snapshot_json) as Record<string, unknown>;
    (safe.timeSummary as unknown[]).push({
      id: 'safe-time-id',
      version: 1,
      date: '2026-08-10',
      category: 'regular',
      minutes: 60,
      activitySummary: 'Safe operational truth',
      approvalState: 'approved',
    });
    expect(() => assertCustomerPeriodSnapshotSafe(safe)).not.toThrow();
    const malformed = structuredClone(safe) as Record<string, unknown>;
    ((malformed.timeSummary as Array<Record<string, unknown>>)[0] as Record<string, unknown>)[
      'version'
    ] = 1.5;
    expect(() => assertCustomerPeriodSnapshotSafe(malformed)).toThrow(/positive integer/i);
    const financial = structuredClone(safe) as Record<string, unknown>;
    ((financial.timeSummary as Array<Record<string, unknown>>)[0] as Record<string, unknown>)[
      'amountMinor'
    ] = 1;
    expect(() => assertCustomerPeriodSnapshotSafe(financial)).toThrow(/forbidden|not allowed/i);
  });

  it('rejects a hash-valid snapshot that only carries the privacy marker but adds finance fields', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'approved');
    const current = value.sqlite
      .prepare('SELECT snapshot_json FROM period_report WHERE id=?')
      .get(reportId) as { snapshot_json: string };
    const malicious = {
      ...(JSON.parse(current.snapshot_json) as Record<string, unknown>),
      commercialSummary: { amountMinor: 1 },
    };
    const snapshotJson = JSON.stringify(malicious);
    const snapshotSha256 = createHash('sha256').update(snapshotJson).digest('hex');
    // This models a tampered but database-hash-valid row. The application
    // boundary must still validate the closed customer projection schema.
    value.sqlite
      .prepare(
        `UPDATE period_report
            SET snapshot_version=snapshot_version+1,snapshot_json=?,snapshot_sha256=?,
                pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL,approved_at=NULL
          WHERE id=?`,
      )
      .run(snapshotJson, snapshotSha256, reportId);
    expect(() =>
      service.recordCustomerConformity(steppedUp(value, value.finance, 'malicious'), {
        periodReportId: reportId,
        signerName: 'Ana Client',
        signedAt: '2026-08-24T16:30:00.000Z',
      }),
    ).toThrow(/forbidden|monetary|confidential|not allowed|snapshot/i);
  });

  it('rejects monetary or confidential keys nested under otherwise permitted scalar fields', () => {
    const nestedFinancialObject = {
      amountMinor: 1,
      clientRate: 2,
      internalCost: 3,
      margin: 4,
      tax: 5,
    };
    const cases: ReadonlyArray<readonly [string, (snapshot: Record<string, unknown>) => void]> = [
      [
        'daily report summary',
        (snapshot) => {
          const rows = Array.isArray(snapshot.dailyReports) ? snapshot.dailyReports : [];
          if (rows.length === 0)
            rows.push({
              id: 'nested-daily',
              date: '2026-08-12',
              summary: 'Operational summary',
              safetyRelated: false,
              approvalState: 'approved',
            });
          (rows[0] as Record<string, unknown>).summary = nestedFinancialObject;
          snapshot.dailyReports = rows;
        },
      ],
      [
        'technical validation',
        (snapshot) => {
          const rows = Array.isArray(snapshot.technicalReports) ? snapshot.technicalReports : [];
          if (rows.length === 0)
            rows.push({
              id: 'nested-technical',
              date: '2026-08-12',
              system: 'PLC',
              site: null,
              area: null,
              station: null,
              changes: 'Operational change',
              safetyRelated: false,
              validation: 'Validated',
              validationResult: null,
              openRisk: null,
              approvalState: 'approved',
            });
          (rows[0] as Record<string, unknown>).validation = nestedFinancialObject;
          snapshot.technicalReports = rows;
        },
      ],
      [
        'backup description',
        (snapshot) => {
          const rows = Array.isArray(snapshot.backupArtifacts) ? snapshot.backupArtifacts : [];
          if (rows.length === 0)
            rows.push({
              filename: 'plc-backup.pdf',
              mediaType: 'application/pdf',
              description: 'Operational backup',
            });
          (rows[0] as Record<string, unknown>).description = nestedFinancialObject;
          snapshot.backupArtifacts = rows;
        },
      ],
    ];

    for (const [label, mutate] of cases) {
      const value = fixture();
      const service = conformity(value);
      const { reportId } = customerReport(value, 'approved');
      mutateCustomerSnapshot(value, reportId, mutate);
      expect(
        () =>
          service.recordCustomerConformity(steppedUp(value, value.finance, `nested-${label}`), {
            periodReportId: reportId,
            signerName: 'Ana Client',
            signedAt: '2026-08-24T16:30:00.000Z',
          }),
        label,
      ).toThrow(/forbidden|monetary|confidential|not allowed|nested|snapshot/i);
    }
  });

  it('requires a real report-bound PDF artifact and rejects missing, mismatched, wrong-report and quarantined files', () => {
    const value = fixture();
    const { reportId } = customerReport(value, 'approved', false);
    const bytes = Buffer.from('%PDF-1.7\nverified\n%%EOF\n', 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const missingKey = `reports/${reportId}/missing.pdf`;
    expect(() =>
      withDocumentRoot(value, () =>
        value.v3.recordPeriodReportPdf(
          steppedUp(value, value.finance, 'missing-pdf'),
          reportId,
          missingKey,
          digest,
          bytes.length,
        ),
      ),
    ).toThrow(/not ready|artifact|missing/i);

    const documentRoot = join(value.directory, 'documents');
    const mismatchedKey = `reports/${reportId}/mismatched.pdf`;
    mkdirSync(dirname(join(documentRoot, mismatchedKey)), { recursive: true });
    writeFileSync(join(documentRoot, mismatchedKey), bytes, { flag: 'wx' });
    expect(() =>
      withDocumentRoot(value, () =>
        value.v3.recordPeriodReportPdf(
          steppedUp(value, value.finance, 'mismatched-pdf'),
          reportId,
          mismatchedKey,
          'b'.repeat(64),
          bytes.length,
        ),
      ),
    ).toThrow(/proof|match/i);

    const wrongReportKey = `reports/not-${reportId}/wrong-report.pdf`;
    mkdirSync(dirname(join(documentRoot, wrongReportKey)), { recursive: true });
    writeFileSync(join(documentRoot, wrongReportKey), bytes, { flag: 'wx' });
    expect(() =>
      withDocumentRoot(value, () =>
        value.v3.recordPeriodReportPdf(
          steppedUp(value, value.finance, 'wrong-report-pdf'),
          reportId,
          wrongReportKey,
          digest,
          bytes.length,
        ),
      ),
    ).toThrow(/another report|binding/i);

    const reservation = value.v3.reserveUpload(value.finance, {
      projectId: value.project.id,
      originalFilename: 'quarantined-signoff.pdf',
      artifactType: 'report',
    });
    const quarantinedKey = `reports/${reportId}/quarantined.pdf`;
    // The upload APIs create the authoritative document row/state. Only the
    // storage-key seam is aligned here so the security test can exercise the
    // report-bound artifact lookup without inventing a second report API.
    value.sqlite
      .prepare('UPDATE document SET storage_key=? WHERE id=?')
      .run(quarantinedKey, reservation.reservationId);
    const quarantinedPath = join(documentRoot, quarantinedKey);
    mkdirSync(dirname(quarantinedPath), { recursive: true });
    writeFileSync(quarantinedPath, bytes, { flag: 'wx' });
    const previousScannerRequired = process.env.JA_MALWARE_SCANNER_REQUIRED;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.JA_MALWARE_SCANNER_REQUIRED = 'true';
    process.env.NODE_ENV = 'production';
    try {
      value.v3.finalizeUpload(value.finance, reservation.reservationId, {
        sha256: digest,
        mediaType: 'application/pdf',
        byteLength: bytes.length,
      });
    } finally {
      if (previousScannerRequired === undefined) delete process.env.JA_MALWARE_SCANNER_REQUIRED;
      else process.env.JA_MALWARE_SCANNER_REQUIRED = previousScannerRequired;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
    expect(
      value.sqlite
        .prepare('SELECT state,scan_status FROM document WHERE id=?')
        .get(reservation.reservationId),
    ).toMatchObject({ state: 'quarantined', scan_status: 'pending' });
    expect(() =>
      withDocumentRoot(value, () =>
        value.v3.recordPeriodReportPdf(
          steppedUp(value, value.finance, 'quarantined-pdf'),
          reportId,
          quarantinedKey,
          digest,
          bytes.length,
        ),
      ),
    ).toThrow(/authorized|ready|artifact/i);
  });

  it('rejects a prefix-only PDF that has no EOF marker before metadata is recorded', () => {
    const value = fixture();
    const { reportId } = customerReport(value, 'approved', false);
    const storageKey = `reports/${reportId}/prefix-only.pdf`;
    const bytes = Buffer.from('%PDF-1.7\nno trailer\n', 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const path = join(value.directory, 'documents', storageKey);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx' });

    expect(() =>
      withDocumentRoot(value, () =>
        value.v3.recordPeriodReportPdf(
          steppedUp(value, value.finance, 'prefix-only-pdf'),
          reportId,
          storageKey,
          digest,
          bytes.length,
        ),
      ),
    ).toThrow(/signature|EOF|artifact|PDF|ready/i);
    expect(
      value.sqlite
        .prepare('SELECT pdf_storage_key,pdf_sha256,pdf_byte_length FROM period_report WHERE id=?')
        .get(reportId),
    ).toEqual({ pdf_storage_key: null, pdf_sha256: null, pdf_byte_length: null });
  });

  it('rechecks the exact PDF bytes before sign-off when the file was mutated', () => {
    const value = fixture();
    const service = conformity(value);
    const report = customerReport(value, 'approved');
    const mutated = Buffer.from(report.bytes);
    mutated[9] = 'X'.charCodeAt(0);
    writeFileSync(join(report.documentRoot, report.storageKey), mutated, { flag: 'w' });

    expect(() =>
      service.recordCustomerConformity(steppedUp(value, value.finance, 'mutated-before-signoff'), {
        periodReportId: report.reportId,
        signerName: 'Ana Client',
        signedAt: '2026-08-24T16:30:00.000Z',
      }),
    ).toThrow(/integrity|proof|artifact|PDF|signature/i);
    expect(
      value.sqlite
        .prepare('SELECT report_pdf_storage_key FROM customer_conformity WHERE period_report_id=?')
        .get(report.reportId),
    ).toBeUndefined();
  });

  it('keeps service actors out of human principals and requires step-up for sign-off mutations', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'approved');
    expect(() => value.repository.principalFor('test-b5-service-actor')).toThrow(
      /active account required/i,
    );

    expect(() =>
      service.recordCustomerConformity(withoutSession(value.finance), {
        periodReportId: reportId,
        signerName: 'Ana Client',
        signedAt: '2026-08-24T16:30:00.000Z',
      }),
    ).toThrow(/recent step-up authentication is required/i);

    const signed = service.recordCustomerConformity(value.finance, {
      periodReportId: reportId,
      signerName: 'Ana Client',
      signedAt: '2026-08-24T16:30:00.000Z',
    });
    expect(() =>
      service.invalidateCustomerConformity(withoutSession(value.owner), {
        conformityId: signed.id,
        reason: 'Owner must step up before invalidating customer sign-off',
      }),
    ).toThrow(/recent step-up authentication is required/i);
    expect(
      service.invalidateCustomerConformity(value.owner, {
        conformityId: signed.id,
        reason: 'Authorized owner invalidation',
      }),
    ).toMatchObject({ conformityId: signed.id });
    expect(service.getCustomerConformity(value.owner, signed.id)).toMatchObject({
      status: 'invalidated',
    });
  });

  it.each(['mutate', 'delete'] as const)(
    'blocks invoice issue with customer_signoff_required when the signed PDF is %s afterward',
    (operation) => {
      const value = fixture();
      const scenario = createCustomerInvoiceScenario(value);
      if (operation === 'mutate') {
        const mutated = Buffer.from(scenario.bytes);
        mutated[9] = 'X'.charCodeAt(0);
        writeFileSync(scenario.pdfPath, mutated, { flag: 'w' });
      } else {
        unlinkSync(scenario.pdfPath);
      }

      let blocked: unknown;
      try {
        scenario.repo.issueInvoice(scenario.finance, scenario.draft.id);
      } catch (error) {
        blocked = error;
      }
      expect(blocked).toBeInstanceOf(ReadinessError);
      const reasons = (
        blocked as ReadinessError & {
          reasons: ReadonlyArray<{ code: string; sourceId?: string; deepLink?: string }>;
        }
      ).reasons;
      expect(reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'customer_signoff_required',
            sourceId: scenario.reportId,
          }),
        ]),
      );
      const signoffReason = reasons.find((reason) => reason.code === 'customer_signoff_required');
      expect(signoffReason?.deepLink).toMatch(/reports?\/period|sign.?off/i);
      expect(
        value.sqlite
          .prepare('SELECT state,issued_at FROM invoice WHERE id=?')
          .get(scenario.draft.id),
      ).toMatchObject({ state: 'approved', issued_at: null });
    },
  );

  it('invalidates the old binding before a changed refresh can create a strictly newer conformity', () => {
    const value = fixture();
    const service = conformity(value);
    const { reportId } = customerReport(value, 'approved');
    const first = service.recordCustomerConformity(steppedUp(value, value.finance, 'first-sign'), {
      periodReportId: reportId,
      signerName: 'Ana Client',
      signedAt: '2026-08-24T16:30:00.000Z',
    });
    const firstReport = value.sqlite
      .prepare('SELECT snapshot_version,snapshot_sha256 FROM period_report WHERE id=?')
      .get(reportId) as { snapshot_version: number; snapshot_sha256: string };
    service.invalidateCustomerConformity(steppedUp(value, value.owner, 'invalidate'), {
      conformityId: first.id,
      reason: 'Corrected approved daily activity',
    });

    const daily = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-12',
      summary: 'Corrected customer activity',
      tasksCompleted: 'Validated PLC handoff',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    value.repository.submitReport(value.worker, 'daily', daily.id, daily.version);
    value.repository.reviewReport(value.manager, 'daily', daily.id, 'approved');
    value.v3.refreshPeriodReports(value.finance, {
      projectId: value.project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    });
    const changedReport = value.sqlite
      .prepare(
        'SELECT state,snapshot_version,snapshot_sha256,pdf_storage_key FROM period_report WHERE id=?',
      )
      .get(reportId) as {
      state: string;
      snapshot_version: number;
      snapshot_sha256: string;
      pdf_storage_key: string | null;
    };
    expect(changedReport.snapshot_version).toBeGreaterThan(firstReport.snapshot_version);
    expect(changedReport.snapshot_sha256).not.toBe(firstReport.snapshot_sha256);
    expect(changedReport.pdf_storage_key).toBeNull();
    expect(changedReport.state).toBe('review');
    service.approvePeriodReport(value.manager, {
      periodReportId: reportId,
      expectedSnapshotVersion: changedReport.snapshot_version,
      expectedSnapshotSha256: changedReport.snapshot_sha256,
    });
    const secondPdf = recordCustomerPdf(value, reportId, 'client-signoff-v2.pdf');
    const second = service.recordCustomerConformity(
      steppedUp(value, value.finance, 'second-sign'),
      {
        periodReportId: reportId,
        signerName: 'Ana Client',
        signedAt: '2026-08-24T16:45:00.000Z',
      },
    );
    expect(second.id).not.toBe(first.id);
    expect(second.snapshotVersion).toBe(changedReport.snapshot_version);
    expect(second.snapshotVersion).toBeGreaterThan(first.snapshotVersion);
    expect(second.reportPdfStorageKey).toBe(secondPdf.storageKey);
    expect(second.status).toBe('active');
    expect(service.getCustomerConformity(value.owner, first.id)).toMatchObject({
      id: first.id,
      status: 'invalidated',
    });
  });
});

describe('Client Essential billing sign-off gate', () => {
  it('blocks invoice time added after sign-off until the exact refreshed source versions are signed', () => {
    const value = fixture();
    const service = conformity(value);
    const repo = billing(value);
    createSignoffPolicy(value);
    value.repository.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-01-01',
    });
    value.repository.createInternalCostRule(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 4_000n,
      effectiveFrom: '2026-01-01',
    });
    value.repository.createCompensationRule(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      rateMinor: 3_000n,
      rateBasis: 'hourly',
      effectiveFrom: '2026-01-01',
    });
    const timeA = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-10',
      category: 'regular',
      minutes: 60,
      summary: 'Signed source A',
    });
    value.repository.submitTime(value.worker, timeA.id, timeA.version);
    value.repository.operationalApproveTime(value.manager, timeA.id, 'approved');
    value.repository.financeApproveTime(value.finance, timeA.id, true);

    const report = customerReport(value, 'approved');
    const finance = steppedUp(value, value.finance, 'source-coverage');
    const first = service.recordCustomerConformity(finance, {
      periodReportId: report.reportId,
      signerName: 'Ana Client',
      signedAt: '2026-08-24T16:30:00.000Z',
    });
    const rule = value.sqlite
      .prepare('SELECT legal_entity_id FROM billing_rule WHERE id=?')
      .get(report.billingRuleId) as { legal_entity_id: string };
    bindCanonicalLegalEntity(value, rule.legal_entity_id, 'source-coverage');
    value.repository.createInvoiceNumberPolicy(value.owner, {
      legalEntityId: rule.legal_entity_id,
      prefix: 'B5-SRC',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });

    const timeB = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-11',
      category: 'regular',
      minutes: 60,
      summary: 'Unsigned source B',
    });
    value.repository.submitTime(value.worker, timeB.id, timeB.version);
    value.repository.operationalApproveTime(value.manager, timeB.id, 'approved');
    value.repository.financeApproveTime(value.finance, timeB.id, true);
    const draft = repo.createInvoiceDraft(
      value.finance,
      report.billingRuleId,
      '2026-08-01',
      '2026-08-31',
    );
    repo.approveInvoiceDraft(finance, draft.id);
    expect(() => repo.issueInvoice(finance, draft.id)).toThrow(ReadinessError);

    service.invalidateCustomerConformity(finance, {
      conformityId: first.id,
      reason: 'New approved billable source requires customer reapproval',
    });
    value.v3.refreshPeriodReports(value.finance, {
      projectId: value.project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    });
    const refreshed = reportBinding(value, report.reportId);
    service.approvePeriodReport(value.manager, {
      periodReportId: report.reportId,
      expectedSnapshotVersion: refreshed.snapshot_version,
      expectedSnapshotSha256: refreshed.snapshot_sha256,
    });
    recordCustomerPdf(value, report.reportId, 'client-signoff-source-v2.pdf');
    service.recordCustomerConformity(finance, {
      periodReportId: report.reportId,
      signerName: 'Ana Client',
      signedAt: '2026-08-24T17:00:00.000Z',
    });
    value.sqlite
      .prepare(
        "UPDATE invoice_source SET source_version=source_version+1 WHERE invoice_id=? AND source_type='time' AND source_id=?",
      )
      .run(draft.id, timeB.id);
    expect(() => repo.issueInvoice(finance, draft.id)).toThrow(ReadinessError);
    value.sqlite
      .prepare(
        "UPDATE invoice_source SET source_version=source_version-1 WHERE invoice_id=? AND source_type='time' AND source_id=?",
      )
      .run(draft.id, timeB.id);
    expect(repo.issueInvoice(finance, draft.id)).toMatchObject({ issued: true });
  });

  it('allows a draft, blocks issue with a structured deep-link reason, then issues after matching sign-off', () => {
    const value = fixture();
    const reports = conformity(value);
    const repo = billing(value);
    createSignoffPolicy(value);
    const { reportId } = customerReport(value);
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'B5-SIGNOFF',
      legalName: 'B5 Sign-off Entity',
      currency: 'EUR',
      billingAddress: 'B5 sign-off billing address',
      companyIdentifiers: 'B5-SIGNOFF-ID',
    });
    bindCanonicalLegalEntity(value, entity.id, 'structured-deep-link');
    const tax = value.repository.createTaxProfile(value.finance, {
      name: 'No tax sign-off profile',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const rule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    value.repository.createInvoiceNumberPolicy(value.owner, {
      legalEntityId: entity.id,
      prefix: 'B5-SO',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });

    // Draft generation remains a preview and must not require customer sign-off.
    const draft = repo.createInvoiceDraft(value.finance, rule.id, '2026-08-01', '2026-08-31');
    expect(draft).toMatchObject({ id: expect.any(String), created: true });

    const finance = steppedUp(value, value.finance, 'billing');
    repo.approveInvoiceDraft(finance, draft.id);
    let blocked: unknown;
    try {
      repo.issueInvoice(finance, draft.id);
    } catch (error) {
      blocked = error;
    }
    expect(blocked).toBeInstanceOf(ReadinessError);
    const reasons = (
      blocked as ReadinessError & {
        reasons: ReadonlyArray<{ code: string; sourceId?: string; deepLink?: string }>;
      }
    ).reasons;
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'customer_signoff_required', sourceId: reportId }),
      ]),
    );
    const signoffReason = reasons.find((reason) => reason.code === 'customer_signoff_required');
    expect(signoffReason?.deepLink).toMatch(/reports?\/period|sign.?off/i);
    expect(
      value.sqlite.prepare('SELECT state,issued_at FROM invoice WHERE id=?').get(draft.id),
    ).toMatchObject({ state: 'approved', issued_at: null });

    const service = reports;
    const signed = service.recordCustomerConformity(finance, {
      periodReportId: reportId,
      signerName: 'Ana Client',
      signerIdentity: 'ana.client@example.test',
      signedAt: '2026-08-24T16:30:00.000Z',
    });
    expect(signed.status).toBe('active');
    const issued = repo.issueInvoice(finance, draft.id);
    expect(issued).toMatchObject({ issued: true, invoiceNumber: expect.any(String) });
    const issuedSnapshot = value.sqlite
      .prepare(
        'SELECT state,invoice_number,issued_at,snapshot_json,calculation_hash FROM invoice WHERE id=?',
      )
      .get(draft.id) as Record<string, unknown>;
    expect(issuedSnapshot.state).toBe('issued');
    expect(issuedSnapshot.invoice_number).toEqual(issued.invoiceNumber);
    expect(issuedSnapshot.snapshot_json).toEqual(expect.any(String));
    expect(issuedSnapshot.calculation_hash).toEqual(expect.any(String));
    expect(repo.issueInvoice(finance, draft.id)).toEqual({
      invoiceNumber: issued.invoiceNumber,
      issued: false,
    });
    expect(
      value.sqlite
        .prepare('SELECT state,invoice_number,snapshot_json FROM invoice WHERE id=?')
        .get(draft.id),
    ).toMatchObject({
      state: 'issued',
      invoice_number: issued.invoiceNumber,
      snapshot_json: issuedSnapshot.snapshot_json,
    });
    expect(() =>
      value.sqlite.prepare("UPDATE invoice SET snapshot_json='{}' WHERE id=?").run(draft.id),
    ).toThrow(/immutable|issued|snapshot/i);
  });
});
