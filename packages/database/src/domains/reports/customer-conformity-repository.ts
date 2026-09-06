import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import { canonicalJson, sha256 } from '../../core/canonical-json.ts';
import { verifyPrivatePdfArtifact } from '../../core/private-pdf-proof.ts';

type ErrorFactory = (message: string) => never;

export type CustomerConformityInput = Readonly<{
  periodReportId: string;
  signatureDocumentId: string;
  signerName: string;
  signerIdentity?: string;
  signedAt: string;
}>;

export type CustomerConformity = Readonly<{
  id: string;
  periodReportId: string;
  snapshotVersion: number;
  snapshotSha256: string;
  snapshotJson: string;
  reportPdfStorageKey: string;
  reportPdfSha256: string;
  reportPdfByteLength: number;
  signatureDocumentId: string | null;
  signatureEvidenceStatus: 'verified' | 'missing' | 'unavailable';
  signerName: string;
  signerIdentity: string | null;
  signedAt: string;
  verifiedAt: string;
  status: 'active' | 'invalidated';
}>;

export type CustomerConformitySafeView = Readonly<{
  id: string;
  periodReportId: string;
  signerName: string;
  signerIdentity: string | null;
  signedAt: string;
  verifiedAt: string;
  signatureEvidenceStatus: 'verified' | 'missing' | 'unavailable';
  status: 'active' | 'invalidated';
}>;

export type CustomerConformityInvalidation = Readonly<{
  conformityId: string;
  reason: string;
  invalidatedAt: string;
}>;

type CustomerConformityRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  assertActive: (principal: Principal) => void;
  assertProjectAccess: (principal: Principal, projectId: string, allowAuditor?: boolean) => void;
  assertLiveSession: (principal: Principal) => void;
  audit: (
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ) => void;
  now: () => string;
  errors: Readonly<{
    accessDenied: ErrorFactory;
    conflict: ErrorFactory;
    validation: ErrorFactory;
  }>;
}>;

type CustomerConformityRow = Readonly<{
  id: string;
  period_report_id: string;
  project_id: string;
  snapshot_version: number;
  snapshot_sha256: string;
  snapshot_json: string;
  report_pdf_storage_key: string;
  report_pdf_sha256: string;
  report_pdf_byte_length: number;
  signer_name: string;
  signer_identity: string | null;
  signed_at: string;
  created_at: string;
  legacy_signature_document_id: string | null;
  signature_document_id: string | null;
  invalidated_at: string | null;
}>;

const CUSTOMER_PRIVACY_VERSION = '2026.08.24.customer-period-safe-v1';
const CUSTOMER_SIGNOFF_EVIDENCE_BINDING_KIND = 'customer_signoff_evidence_binding_v1';

function signatureEvidenceMatchesReport(
  description: string | null,
  report: Readonly<{ id: string; snapshotVersion: number; snapshotSha256: string }>,
): boolean {
  if (!description) return false;
  try {
    const value = JSON.parse(description) as Record<string, unknown>;
    return (
      value.kind === CUSTOMER_SIGNOFF_EVIDENCE_BINDING_KIND &&
      value.periodReportId === report.id &&
      value.snapshotVersion === report.snapshotVersion &&
      value.snapshotSha256 === report.snapshotSha256
    );
  } catch {
    return false;
  }
}

/**
 * Customer period reports are a deliberately closed projection.  Keep the
 * allowlist beside the conformity boundary so a future internal projection
 * field cannot become customer-visible by accident.  This validator is also
 * used by report refresh, making the persisted snapshot and the sign-off
 * boundary share one schema contract.
 */
const CUSTOMER_SNAPSHOT_FIELDS = Object.freeze({
  root: [
    'project',
    'periodStart',
    'periodEnd',
    'audience',
    'reportType',
    'locale',
    'dailyReports',
    'timeSummary',
    'technicalReports',
    'technicalChanges',
    'sourceCounts',
    'backupArtifacts',
    'customerPrivacyVersion',
  ],
  project: ['id', 'number', 'name', 'clientNumber', 'clientName'],
  dailyReport: ['id', 'date', 'workerDisplay', 'summary', 'safetyRelated', 'approvalState'],
  timeSummary: [
    'id',
    'version',
    'date',
    'workerDisplay',
    'category',
    'minutes',
    'activitySummary',
    'approvalState',
  ],
  technicalReport: [
    'id',
    'date',
    'workerDisplay',
    'system',
    'site',
    'area',
    'station',
    'changes',
    'safetyRelated',
    'validation',
    'validationResult',
    'openRisk',
    'approvalState',
  ],
  technicalChange: [
    'id',
    'date',
    'workerDisplay',
    'component',
    'changeMade',
    'productionImpact',
    'validation',
    'validationResult',
    'safetyImpact',
    'approvalState',
  ],
  sourceCounts: ['dailyReports', 'technicalReports', 'technicalChanges', 'timeEntries'],
  backupArtifact: ['filename', 'mediaType', 'description'],
} as const);

const FORBIDDEN_CUSTOMER_FIELD =
  /amount|money|minor|tax|rate|cost|margin|contribution|pay|compensation|invoice|collection|receivable|wip|revenue|profit|billing|commercial|finance|markup|salary|internal/iu;

function customerSnapshotValidationError(path: string, message: string): never {
  throw new Error(`Customer period snapshot ${path} ${message}`);
}

function assertCustomerObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return customerSnapshotValidationError(path, 'must be an object');
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_CUSTOMER_FIELD.test(key))
      customerSnapshotValidationError(
        `${path}.${key}`,
        'contains a forbidden monetary or confidential field',
      );
    if (!allowedKeys.has(key)) customerSnapshotValidationError(`${path}.${key}`, 'is not allowed');
  }
  return record;
}

function assertCustomerArray(value: unknown, path: string, allowed: readonly string[]): void {
  if (!Array.isArray(value)) return customerSnapshotValidationError(path, 'must be an array');
  value.forEach((entry, index) => {
    const rowPath = `${path}[${index}]`;
    const row = assertCustomerObject(entry, rowPath, allowed);
    for (const [key, fieldValue] of Object.entries(row)) {
      if (
        fieldValue !== null &&
        typeof fieldValue !== 'string' &&
        typeof fieldValue !== 'boolean' &&
        !(typeof fieldValue === 'number' && Number.isFinite(fieldValue))
      )
        customerSnapshotValidationError(
          `${rowPath}.${key}`,
          'must be a scalar value and cannot contain nested data',
        );
    }
  });
}

/** Validate the closed, zero-money customer report projection. */
export function assertCustomerPeriodSnapshotSafe(
  value: unknown,
): asserts value is Record<string, unknown> {
  const root = assertCustomerObject(value, '$', CUSTOMER_SNAPSHOT_FIELDS.root);
  if (root.audience !== 'customer')
    customerSnapshotValidationError('$.audience', 'must be customer');
  if (root.customerPrivacyVersion !== CUSTOMER_PRIVACY_VERSION)
    customerSnapshotValidationError('$.customerPrivacyVersion', 'is missing or unsupported');
  const project = assertCustomerObject(root.project, '$.project', CUSTOMER_SNAPSHOT_FIELDS.project);
  for (const field of ['id', 'number', 'name', 'clientNumber', 'clientName']) {
    if (typeof project[field] !== 'string' || !project[field].trim())
      customerSnapshotValidationError(`$.project.${field}`, 'must be a non-empty string');
  }
  for (const field of ['periodStart', 'periodEnd', 'reportType', 'locale']) {
    if (typeof root[field] !== 'string' || !root[field].trim())
      customerSnapshotValidationError(`$.${field}`, 'must be a non-empty string');
  }
  assertCustomerArray(root.dailyReports, '$.dailyReports', CUSTOMER_SNAPSHOT_FIELDS.dailyReport);
  assertCustomerArray(root.timeSummary, '$.timeSummary', CUSTOMER_SNAPSHOT_FIELDS.timeSummary);
  for (const [index, entry] of (root.timeSummary as unknown[]).entries()) {
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id.trim())
      customerSnapshotValidationError(`$.timeSummary[${index}].id`, 'must be a non-empty string');
    if (!Number.isSafeInteger(row.version) || Number(row.version) < 1)
      customerSnapshotValidationError(
        `$.timeSummary[${index}].version`,
        'must be a positive integer',
      );
  }
  assertCustomerArray(
    root.technicalReports,
    '$.technicalReports',
    CUSTOMER_SNAPSHOT_FIELDS.technicalReport,
  );
  assertCustomerArray(
    root.technicalChanges,
    '$.technicalChanges',
    CUSTOMER_SNAPSHOT_FIELDS.technicalChange,
  );
  const counts = assertCustomerObject(
    root.sourceCounts,
    '$.sourceCounts',
    CUSTOMER_SNAPSHOT_FIELDS.sourceCounts,
  );
  for (const field of CUSTOMER_SNAPSHOT_FIELDS.sourceCounts) {
    if (!Number.isSafeInteger(counts[field]) || Number(counts[field]) < 0)
      customerSnapshotValidationError(`$.sourceCounts.${field}`, 'must be a non-negative integer');
  }
  assertCustomerArray(
    root.backupArtifacts,
    '$.backupArtifacts',
    CUSTOMER_SNAPSHOT_FIELDS.backupArtifact,
  );
}

/** Parse, validate and canonicalize a persisted customer snapshot. */
export function canonicalCustomerPeriodSnapshot(snapshotJson: string): {
  value: Record<string, unknown>;
  json: string;
  sha256: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new Error('Customer period snapshot JSON is invalid');
  }
  assertCustomerPeriodSnapshotSafe(parsed);
  const json = canonicalJson(parsed);
  return { value: parsed, json, sha256: sha256(json) };
}

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== 'string' || value.length > 40 || value !== value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function mapConformity(
  row: CustomerConformityRow,
  signatureEvidenceStatus: CustomerConformity['signatureEvidenceStatus'],
): CustomerConformity {
  return {
    id: row.id,
    periodReportId: row.period_report_id,
    snapshotVersion: row.snapshot_version,
    snapshotSha256: row.snapshot_sha256,
    snapshotJson: row.snapshot_json,
    reportPdfStorageKey: row.report_pdf_storage_key,
    reportPdfSha256: row.report_pdf_sha256,
    reportPdfByteLength: row.report_pdf_byte_length,
    signatureDocumentId: row.signature_document_id,
    signatureEvidenceStatus,
    signerName: row.signer_name,
    signerIdentity: row.signer_identity,
    signedAt: row.signed_at,
    verifiedAt: row.created_at,
    status: row.invalidated_at === null ? 'active' : 'invalidated',
  };
}

function mapSafeConformity(
  row: CustomerConformityRow,
  signatureEvidenceStatus: CustomerConformitySafeView['signatureEvidenceStatus'],
): CustomerConformitySafeView {
  return {
    id: row.id,
    periodReportId: row.period_report_id,
    signerName: row.signer_name,
    signerIdentity: row.signer_identity,
    signedAt: row.signed_at,
    verifiedAt: row.created_at,
    signatureEvidenceStatus,
    status: row.invalidated_at === null ? 'active' : 'invalidated',
  };
}

export class CustomerConformityRepository {
  private readonly deps: CustomerConformityRepositoryDependencies;

  constructor(deps: CustomerConformityRepositoryDependencies) {
    this.deps = deps;
  }

  private assertFinanceWriter(principal: Principal): void {
    this.deps.assertActive(principal);
    if (!canManageBilling(principal))
      return this.deps.errors.accessDenied('Human Finance role required');
    this.deps.assertLiveSession(principal);
  }

  private assertInput(input: CustomerConformityInput): void {
    if (typeof input.periodReportId !== 'string' || !input.periodReportId.trim())
      return this.deps.errors.validation('Period report id is required');
    if (typeof input.signatureDocumentId !== 'string' || !input.signatureDocumentId.trim())
      return this.deps.errors.validation('Verified signed PDF evidence is required');
    if (typeof input.signerName !== 'string' || !input.signerName.trim())
      return this.deps.errors.validation('Signer name is required');
    if (input.signerName.trim().length > 200)
      return this.deps.errors.validation('Signer name is too long');
    if (input.signerIdentity !== undefined && input.signerIdentity.trim().length > 320)
      return this.deps.errors.validation('Signer identity is too long');
    if (!isIsoTimestamp(input.signedAt))
      return this.deps.errors.validation('Signed timestamp is invalid');
    if (Date.parse(input.signedAt) > Date.parse(this.deps.now()) + 5 * 60_000)
      return this.deps.errors.validation('Signed timestamp cannot be materially in the future');
  }

  private signatureEvidenceStatus(
    row: CustomerConformityRow,
  ): CustomerConformity['signatureEvidenceStatus'] {
    if (!row.signature_document_id) return 'missing';
    const document = this.deps.sqlite
      .prepare(
        `SELECT project_id,state,scan_status,artifact_type,sensitivity,media_type,
                storage_key,sha256,byte_length,description
           FROM document WHERE id=?`,
      )
      .get(row.signature_document_id) as
      | {
          project_id: string | null;
          state: string;
          scan_status: string | null;
          artifact_type: string | null;
          sensitivity: string | null;
          media_type: string;
          storage_key: string;
          sha256: string;
          byte_length: number;
          description: string | null;
        }
      | undefined;
    if (
      !document ||
      document.project_id !== row.project_id ||
      document.state !== 'committed' ||
      (document.scan_status !== 'clean' && document.scan_status !== 'not_scanned') ||
      document.artifact_type !== 'customer_signoff_evidence' ||
      !['customer_private', 'sensitive'].includes(document.sensitivity ?? '') ||
      document.media_type !== 'application/pdf' ||
      !/^[a-f0-9]{64}$/u.test(document.sha256) ||
      !Number.isSafeInteger(document.byte_length) ||
      document.byte_length <= 0 ||
      !signatureEvidenceMatchesReport(document.description, {
        id: row.period_report_id,
        snapshotVersion: row.snapshot_version,
        snapshotSha256: row.snapshot_sha256,
      })
    )
      return 'unavailable';
    try {
      verifyPrivatePdfArtifact({
        storageKey: document.storage_key,
        sha256: document.sha256,
        byteLength: document.byte_length,
        requiredPrefix: 'uploads/',
      });
      return 'verified';
    } catch {
      return 'unavailable';
    }
  }

  private selectRow(conformityId: string): CustomerConformityRow | undefined {
    return this.deps.sqlite
      .prepare(
        `SELECT c.id,c.period_report_id,r.project_id,c.snapshot_version,c.snapshot_sha256,
                c.snapshot_json,c.report_pdf_storage_key,c.report_pdf_sha256,
                c.report_pdf_byte_length,c.signer_name,c.signer_identity,c.signed_at,c.created_at,
                c.signature_document_id legacy_signature_document_id,
                COALESCE(c.signature_document_id,attachment.signature_document_id)
                  signature_document_id,
                invalidation.occurred_at invalidated_at
         FROM customer_conformity c
         JOIN period_report r ON r.id=c.period_report_id
         LEFT JOIN customer_conformity_evidence_attachment attachment
           ON attachment.conformity_id=c.id
         LEFT JOIN customer_conformity_invalidation invalidation
           ON invalidation.conformity_id=c.id
         WHERE c.id=?`,
      )
      .get(conformityId) as CustomerConformityRow | undefined;
  }

  recordCustomerConformity(
    principal: Principal,
    input: CustomerConformityInput,
  ): CustomerConformity {
    this.assertFinanceWriter(principal);
    this.assertInput(input);
    return this.deps.transaction(() => {
      const report = this.deps.sqlite
        .prepare(
          `SELECT id,project_id,audience,state,snapshot_version,snapshot_sha256,snapshot_json,
                  pdf_storage_key,pdf_sha256,pdf_byte_length
           FROM period_report WHERE id=?`,
        )
        .get(input.periodReportId) as
        | {
            id: string;
            project_id: string;
            audience: string;
            state: string;
            snapshot_version: number;
            snapshot_sha256: string | null;
            snapshot_json: string;
            pdf_storage_key: string | null;
            pdf_sha256: string | null;
            pdf_byte_length: number | null;
          }
        | undefined;
      if (!report) return this.deps.errors.validation('Customer period report not found');
      this.deps.assertProjectAccess(principal, report.project_id, true);
      if (report.audience !== 'customer')
        return this.deps.errors.validation('Customer period report required');
      let canonicalSnapshot: ReturnType<typeof canonicalCustomerPeriodSnapshot>;
      try {
        canonicalSnapshot = canonicalCustomerPeriodSnapshot(report.snapshot_json);
      } catch (error) {
        return this.deps.errors.validation(
          error instanceof Error ? error.message : 'Customer period snapshot is invalid',
        );
      }
      if (
        canonicalSnapshot.json !== report.snapshot_json ||
        canonicalSnapshot.sha256 !== report.snapshot_sha256
      )
        return this.deps.errors.conflict(
          'Customer period report snapshot is not the current canonical projection',
        );
      const pdfByteLength = Number(report.pdf_byte_length);
      if (!['approved', 'final'].includes(report.state))
        return this.deps.errors.conflict('Customer period report is not ready for sign-off');
      if (
        !Number.isInteger(report.snapshot_version) ||
        report.snapshot_version < 1 ||
        !report.snapshot_sha256 ||
        !report.snapshot_json.trim() ||
        !report.pdf_storage_key ||
        !report.pdf_sha256 ||
        !/^[a-f0-9]{64}$/.test(report.pdf_sha256) ||
        report.pdf_byte_length === null ||
        !Number.isSafeInteger(pdfByteLength) ||
        pdfByteLength <= 0 ||
        !report.pdf_storage_key.startsWith(`reports/${report.id}/`)
      )
        return this.deps.errors.conflict('Customer period report snapshot or PDF is not ready');
      try {
        verifyPrivatePdfArtifact({
          storageKey: report.pdf_storage_key,
          sha256: report.pdf_sha256,
          byteLength: pdfByteLength,
          requiredPrefix: `reports/${report.id}/`,
        });
      } catch {
        return this.deps.errors.conflict(
          'Customer period report PDF artifact failed integrity verification',
        );
      }
      const registeredDocument = this.deps.sqlite
        .prepare(
          `SELECT project_id,state,scan_status,artifact_type,media_type,sha256,byte_length
             FROM document WHERE storage_key=? ORDER BY created_at DESC LIMIT 1`,
        )
        .get(report.pdf_storage_key) as
        | {
            project_id: string | null;
            state: string;
            scan_status: string | null;
            artifact_type: string | null;
            media_type: string;
            sha256: string;
            byte_length: number;
          }
        | undefined;
      if (
        registeredDocument &&
        (registeredDocument.project_id !== report.project_id ||
          registeredDocument.state !== 'committed' ||
          (registeredDocument.scan_status !== 'clean' &&
            registeredDocument.scan_status !== 'not_scanned') ||
          registeredDocument.artifact_type !== 'report' ||
          registeredDocument.media_type !== 'application/pdf' ||
          registeredDocument.sha256 !== report.pdf_sha256 ||
          registeredDocument.byte_length !== pdfByteLength)
      )
        return this.deps.errors.conflict(
          'Customer period report PDF artifact is not authorized and ready',
        );

      // This is a separate, private signed-copy artifact.  It is deliberately
      // not inferred from signer metadata or from the rendered report PDF.
      const signatureDocument = this.deps.sqlite
        .prepare(
          `SELECT id,project_id,state,scan_status,artifact_type,sensitivity,media_type,
                  storage_key,sha256,byte_length,description
             FROM document WHERE id=?`,
        )
        .get(input.signatureDocumentId.trim()) as
        | {
            id: string;
            project_id: string | null;
            state: string;
            scan_status: string | null;
            artifact_type: string | null;
            sensitivity: string | null;
            media_type: string;
            storage_key: string;
            sha256: string;
            byte_length: number;
            description: string | null;
          }
        | undefined;
      if (
        !signatureDocument ||
        signatureDocument.project_id !== report.project_id ||
        signatureDocument.state !== 'committed' ||
        (signatureDocument.scan_status !== 'clean' &&
          signatureDocument.scan_status !== 'not_scanned') ||
        signatureDocument.artifact_type !== 'customer_signoff_evidence' ||
        !['customer_private', 'sensitive'].includes(signatureDocument.sensitivity ?? '') ||
        signatureDocument.media_type !== 'application/pdf' ||
        !/^[a-f0-9]{64}$/u.test(signatureDocument.sha256) ||
        !Number.isSafeInteger(signatureDocument.byte_length) ||
        signatureDocument.byte_length <= 0 ||
        !signatureEvidenceMatchesReport(signatureDocument.description, {
          id: report.id,
          snapshotVersion: report.snapshot_version,
          snapshotSha256: report.snapshot_sha256,
        })
      )
        return this.deps.errors.conflict(
          'Verified signed PDF evidence is missing, unavailable, or belongs to another project',
        );
      try {
        verifyPrivatePdfArtifact({
          storageKey: signatureDocument.storage_key,
          sha256: signatureDocument.sha256,
          byteLength: signatureDocument.byte_length,
          requiredPrefix: 'uploads/',
        });
      } catch {
        return this.deps.errors.conflict(
          'Verified signed PDF evidence failed integrity verification',
        );
      }

      const alreadyUsed = this.deps.sqlite
        .prepare(
          `SELECT 1 FROM customer_conformity WHERE signature_document_id=?
           UNION ALL
           SELECT 1 FROM customer_conformity_evidence_attachment WHERE signature_document_id=?
           LIMIT 1`,
        )
        .get(signatureDocument.id, signatureDocument.id);
      if (alreadyUsed)
        return this.deps.errors.conflict(
          'Verified signed PDF evidence is already bound to another conformity',
        );

      const active = this.deps.sqlite
        .prepare(
          `SELECT c.id FROM customer_conformity c
           LEFT JOIN customer_conformity_invalidation invalidation
             ON invalidation.conformity_id=c.id
           WHERE c.period_report_id=? AND c.snapshot_version=? AND c.snapshot_sha256=?
             AND invalidation.id IS NULL LIMIT 1`,
        )
        .get(report.id, report.snapshot_version, report.snapshot_sha256) as
        | { id: string }
        | undefined;
      if (active)
        return this.deps.errors.conflict(
          'An active customer conformity already exists for this report',
        );

      const id = newId();
      const createdAt = this.deps.now();
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO customer_conformity(
               id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,
               report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,
               signer_name,signer_identity,signed_at,signature_document_id,created_by,created_at
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            report.id,
            report.snapshot_version,
            report.snapshot_sha256,
            report.snapshot_json,
            report.pdf_storage_key,
            report.pdf_sha256,
            pdfByteLength,
            input.signerName.trim(),
            input.signerIdentity?.trim() || null,
            input.signedAt,
            signatureDocument.id,
            principal.userId,
            createdAt,
          );
      } catch (error) {
        if (error instanceof Error && /conformity|unique|constraint|snapshot/iu.test(error.message))
          return this.deps.errors.conflict('Customer conformity changed or already exists');
        throw error;
      }
      const created = this.selectRow(id);
      if (!created) return this.deps.errors.conflict('Customer conformity was not created');
      this.deps.audit(principal, 'customer_conformity.create', 'customer_conformity', id, {
        projectId: report.project_id,
        periodReportId: report.id,
        snapshotVersion: report.snapshot_version,
        snapshotSha256: report.snapshot_sha256,
        reportPdfStorageKey: report.pdf_storage_key,
        reportPdfSha256: report.pdf_sha256,
        reportPdfByteLength: report.pdf_byte_length,
        signatureDocumentId: signatureDocument.id,
        signatureDocumentSha256: signatureDocument.sha256,
        evidenceVerifiedAt: createdAt,
        evidenceVerifiedBy: principal.userId,
        signerName: input.signerName.trim(),
        signerIdentity: input.signerIdentity?.trim() || null,
        signedAt: input.signedAt,
      });
      return mapConformity(created, 'verified');
    });
  }

  attachLegacyCustomerConformityEvidence(
    principal: Principal,
    input: Readonly<{
      expectedPeriodReportId: string;
      conformityId: string;
      signatureDocumentId: string;
      reason: string;
    }>,
  ): CustomerConformity {
    this.assertFinanceWriter(principal);
    if (typeof input.expectedPeriodReportId !== 'string' || !input.expectedPeriodReportId.trim())
      return this.deps.errors.validation('Expected period report id is required');
    if (typeof input.conformityId !== 'string' || !input.conformityId.trim())
      return this.deps.errors.validation('Customer conformity id is required');
    if (typeof input.signatureDocumentId !== 'string' || !input.signatureDocumentId.trim())
      return this.deps.errors.validation('Verified signed PDF evidence is required');
    if (
      typeof input.reason !== 'string' ||
      !input.reason.trim() ||
      input.reason.trim().length > 2000
    )
      return this.deps.errors.validation('Evidence attachment reason is required');
    return this.deps.transaction(() => {
      const row = this.selectRow(input.conformityId);
      if (!row) return this.deps.errors.validation('Customer conformity not found');
      if (row.period_report_id !== input.expectedPeriodReportId.trim())
        return this.deps.errors.conflict(
          'Customer conformity does not belong to the requested period report',
        );
      this.deps.assertProjectAccess(principal, row.project_id, true);
      if (row.invalidated_at !== null)
        return this.deps.errors.conflict('Invalidated customer conformity cannot receive evidence');
      if (row.legacy_signature_document_id !== null || row.signature_document_id !== null)
        return this.deps.errors.conflict('Customer conformity already has signed-copy evidence');
      const document = this.deps.sqlite
        .prepare(
          `SELECT id,project_id,state,scan_status,artifact_type,sensitivity,media_type,
                  storage_key,sha256,byte_length,description FROM document WHERE id=?`,
        )
        .get(input.signatureDocumentId.trim()) as
        | {
            id: string;
            project_id: string | null;
            state: string;
            scan_status: string | null;
            artifact_type: string | null;
            sensitivity: string | null;
            media_type: string;
            storage_key: string;
            sha256: string;
            byte_length: number;
            description: string | null;
          }
        | undefined;
      if (
        !document ||
        document.project_id !== row.project_id ||
        document.state !== 'committed' ||
        (document.scan_status !== 'clean' && document.scan_status !== 'not_scanned') ||
        document.artifact_type !== 'customer_signoff_evidence' ||
        !['customer_private', 'sensitive'].includes(document.sensitivity ?? '') ||
        document.media_type !== 'application/pdf' ||
        !/^[a-f0-9]{64}$/u.test(document.sha256) ||
        !Number.isSafeInteger(document.byte_length) ||
        document.byte_length <= 0 ||
        !signatureEvidenceMatchesReport(document.description, {
          id: row.period_report_id,
          snapshotVersion: row.snapshot_version,
          snapshotSha256: row.snapshot_sha256,
        })
      )
        return this.deps.errors.conflict('Verified signed PDF evidence is unavailable');
      try {
        verifyPrivatePdfArtifact({
          storageKey: document.storage_key,
          sha256: document.sha256,
          byteLength: document.byte_length,
          requiredPrefix: 'uploads/',
        });
      } catch {
        return this.deps.errors.conflict(
          'Verified signed PDF evidence failed integrity verification',
        );
      }
      const alreadyUsed = this.deps.sqlite
        .prepare(
          `SELECT 1 FROM customer_conformity WHERE signature_document_id=?
           UNION ALL
           SELECT 1 FROM customer_conformity_evidence_attachment WHERE signature_document_id=?
           LIMIT 1`,
        )
        .get(document.id, document.id);
      if (alreadyUsed)
        return this.deps.errors.conflict(
          'Verified signed PDF evidence is already bound to another conformity',
        );
      const id = newId();
      const attachedAt = this.deps.now();
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO customer_conformity_evidence_attachment(
               id,conformity_id,signature_document_id,attached_by,attached_at,reason
             ) VALUES(?,?,?,?,?,?)`,
          )
          .run(id, row.id, document.id, principal.userId, attachedAt, input.reason.trim());
      } catch (error) {
        if (
          error instanceof Error &&
          /attachment|constraint|immutable|evidence/iu.test(error.message)
        )
          return this.deps.errors.conflict(
            'Customer conformity evidence changed or already exists',
          );
        throw error;
      }
      this.deps.audit(
        principal,
        'customer_conformity.evidence_attach',
        'customer_conformity_evidence_attachment',
        id,
        {
          conformityId: row.id,
          periodReportId: row.period_report_id,
          projectId: row.project_id,
          signatureDocumentId: document.id,
          signatureDocumentSha256: document.sha256,
          evidenceVerifiedAt: attachedAt,
          evidenceVerifiedBy: principal.userId,
          reason: input.reason.trim(),
        },
      );
      const attached = this.selectRow(row.id);
      if (!attached)
        return this.deps.errors.conflict('Customer conformity evidence was not attached');
      return mapConformity(attached, 'verified');
    });
  }

  getCustomerConformity(
    principal: Principal,
    conformityId: string,
  ): CustomerConformity | CustomerConformitySafeView {
    this.deps.assertActive(principal);
    if (typeof conformityId !== 'string' || !conformityId.trim())
      return this.deps.errors.validation('Customer conformity id is required');
    const row = this.selectRow(conformityId);
    if (!row) return this.deps.errors.validation('Customer conformity not found');
    if (principal.role === 'worker')
      return this.deps.errors.accessDenied('Customer conformity access denied');
    const full = canManageBilling(principal);
    this.deps.assertProjectAccess(principal, row.project_id, true);
    const signatureEvidenceStatus = this.signatureEvidenceStatus(row);
    return full
      ? mapConformity(row, signatureEvidenceStatus)
      : mapSafeConformity(row, signatureEvidenceStatus);
  }

  getCustomerConformityForPeriodReport(
    principal: Principal,
    periodReportId: string,
  ): CustomerConformity | CustomerConformitySafeView | null {
    this.deps.assertActive(principal);
    if (principal.role === 'worker')
      return this.deps.errors.accessDenied('Customer conformity access denied');
    if (typeof periodReportId !== 'string' || !periodReportId.trim())
      return this.deps.errors.validation('Period report id is required');
    const report = this.deps.sqlite
      .prepare('SELECT project_id FROM period_report WHERE id=?')
      .get(periodReportId) as { project_id: string } | undefined;
    if (!report) return this.deps.errors.validation('Customer period report not found');
    this.deps.assertProjectAccess(principal, report.project_id, true);
    const selected = this.deps.sqlite
      .prepare(
        `SELECT c.id
           FROM customer_conformity c
           LEFT JOIN customer_conformity_invalidation invalidation
             ON invalidation.conformity_id=c.id
          WHERE c.period_report_id=?
          ORDER BY (invalidation.id IS NULL) DESC,c.created_at DESC,c.id DESC
          LIMIT 1`,
      )
      .get(periodReportId) as { id: string } | undefined;
    if (!selected) return null;
    const row = this.selectRow(selected.id);
    if (!row) return this.deps.errors.conflict('Customer conformity record is incomplete');
    const signatureEvidenceStatus = this.signatureEvidenceStatus(row);
    return canManageBilling(principal)
      ? mapConformity(row, signatureEvidenceStatus)
      : mapSafeConformity(row, signatureEvidenceStatus);
  }

  invalidateCustomerConformity(
    principal: Principal,
    input: Readonly<{ conformityId: string; reason: string }>,
  ): CustomerConformityInvalidation {
    this.assertFinanceWriter(principal);
    if (typeof input.conformityId !== 'string' || !input.conformityId.trim())
      return this.deps.errors.validation('Customer conformity id is required');
    if (typeof input.reason !== 'string' || !input.reason.trim())
      return this.deps.errors.validation('Invalidation reason is required');
    if (input.reason.trim().length > 2000)
      return this.deps.errors.validation('Invalidation reason is too long');
    return this.deps.transaction(() => {
      const row = this.selectRow(input.conformityId);
      if (!row) return this.deps.errors.validation('Customer conformity not found');
      this.deps.assertProjectAccess(principal, row.project_id, true);
      if (row.invalidated_at !== null)
        return this.deps.errors.conflict('Customer conformity is already invalidated');
      const id = newId();
      const occurredAt = this.deps.now();
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO customer_conformity_invalidation(
               id,conformity_id,reason,actor_id,occurred_at
             ) VALUES(?,?,?,?,?)`,
          )
          .run(id, row.id, input.reason.trim(), principal.userId, occurredAt);
      } catch (error) {
        if (error instanceof Error && /invalidation|unique|constraint/iu.test(error.message))
          return this.deps.errors.conflict('Customer conformity invalidation already exists');
        throw error;
      }
      this.deps.audit(
        principal,
        'customer_conformity.invalidate',
        'customer_conformity_invalidation',
        id,
        {
          projectId: row.project_id,
          conformityId: row.id,
          reason: input.reason.trim(),
        },
      );
      return { conformityId: row.id, reason: input.reason.trim(), invalidatedAt: occurredAt };
    });
  }
}
