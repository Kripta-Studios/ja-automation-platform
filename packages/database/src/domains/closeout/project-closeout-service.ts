import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { assertSafeStorageKey } from '../../core/storage-key.ts';
import { V3Repository } from '../../v3-repository.ts';

type FailureFactory = (message: string) => Error;
type CloseoutDeps = Readonly<{
  sqlite: DatabaseSync;
  assertActive: (principal: Principal) => void;
  assertLiveSession: (principal: Principal) => void;
  audit: (
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
  ) => void;
  accessDenied: FailureFactory;
  conflict: FailureFactory;
  validation: FailureFactory;
}>;

type Audience = 'internal' | 'client';
type SourceDocument = Readonly<{
  id: string;
  storage_key: string;
  sha256: string;
  byte_length: number;
  media_type: string;
  safe_filename: string | null;
  original_filename: string | null;
  artifact_type: string;
  sensitivity: string;
  scan_status: string | null;
  artifact_classification?: string;
}>;
type RevisionRow = Readonly<{
  id: string;
  series_id: string;
  project_id: string;
  revision_number: number;
  state: string;
  internal_snapshot_json: string;
  client_snapshot_json: string;
  internal_snapshot_sha256: string;
  client_snapshot_sha256: string;
  client_confirmation_hash: string | null;
  created_by: string;
  finalized_by: string | null;
  finalized_at: string | null;
}>;
type AcceptedPeriodReference = Readonly<{
  conformityId: string;
  periodReportId: string;
  periodStart: string;
  periodEnd: string;
  snapshotVersion: number;
  snapshotSha256: string;
  sha256: string;
  byteLength: number;
  filename: string;
}>;
type AcceptedPeriodSource = Readonly<
  AcceptedPeriodReference & { storageKey: string; evidence: SourceDocument }
>;
type ClientSourceManifest = Readonly<{
  documents: readonly Record<string, unknown>[];
  acceptedPeriodReferences: readonly Record<string, unknown>[];
}>;

const MAX_SOURCE_COUNT = 40;
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MONEY_PATTERN =
  /(?:\b(?:EUR|USD|GBP|CAD|AUD|JPY|CHF|BRL)\b|[€$£]|R\$|\b(?:rate|compensation|margin|expense|invoice|payment|revenue|cost|salary|tarifa|margen|gasto|factura|pago|receita|custo)\b|\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b)/iu;
const CLIENT_ARTIFACT_TYPES = new Set([
  'customer_period_pdf',
  'customer_report_pdf',
  'technical_reference',
  'system_reference',
  'backup_reference',
  'approved_customer_document',
]);

function isoNow(): string {
  return new Date().toISOString();
}
function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
    .join(',')}}`;
}
function safeArchiveName(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/\0\r\n]+/gu, '-')
    .replace(/[^A-Za-z0-9._ -]+/gu, '-')
    .replace(/^[-. ]+|[-. ]+$/gu, '')
    .slice(0, 100);
  return cleaned || fallback;
}
function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  return /[",\r\n]/u.test(raw) ? `"${raw.replace(/"/gu, '""')}"` : raw;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}
function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0, 0);
  return out;
}
/** Deterministic STORE ZIP: no dependency and no hidden partial writer state. */
function zip(entries: readonly { name: string; bytes: Buffer }[]): Buffer {
  let offset = 0;
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.bytes);
    const size = entry.bytes.byteLength;
    locals.push(
      Buffer.concat([
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0),
        name,
        entry.bytes,
      ]),
    );
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += 30 + name.length + size;
  }
  const centralBytes = Buffer.concat(central);
  return Buffer.concat([
    ...locals,
    centralBytes,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);
}
function simplePdf(title: string, lines: readonly string[]): Buffer {
  const clean = (value: string) =>
    value
      .replace(/[()\\]/gu, '')
      .replace(/[\r\n]+/gu, ' ')
      .slice(0, 105);
  const body = [
    `BT /F1 14 Tf 72 740 Td (${clean(title)}) Tj`,
    '/F1 9 Tf 0 -28 Td',
    ...lines.slice(0, 34).map((line) => `(${clean(line)}) Tj 0 -15 Td`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const positions = [0];
  objects.forEach((object, index) => {
    positions.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${positions
    .slice(1)
    .map((p) => `${String(p).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'utf8');
}

export class ProjectCloseoutService {
  private readonly deps: CloseoutDeps;
  constructor(deps: CloseoutDeps) {
    this.deps = deps;
  }
  private get sqlite() {
    return this.deps.sqlite;
  }
  private assertWriter(principal: Principal): void {
    this.deps.assertActive(principal);
    this.deps.assertLiveSession(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw this.deps.accessDenied('Finance role required');
    const persisted = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (
      !persisted ||
      persisted.status !== 'active' ||
      persisted.role !== principal.role ||
      !['owner_admin', 'finance_admin'].includes(persisted.role)
    )
      throw this.deps.accessDenied('Active Finance role required');
  }
  private sourceDocuments(projectId: string, ids: readonly string[]): SourceDocument[] {
    if (ids.length > MAX_SOURCE_COUNT || new Set(ids).size !== ids.length)
      throw this.deps.validation('Customer attachment selection is invalid');
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    const rows = this.sqlite
      .prepare(
        `SELECT id,storage_key,sha256,byte_length,media_type,safe_filename,original_filename,artifact_type,sensitivity,scan_status,artifact_classification FROM document WHERE project_id=? AND id IN (${marks}) AND state='committed' ORDER BY id`,
      )
      .all(projectId, ...ids) as SourceDocument[];
    if (rows.length !== ids.length)
      throw this.deps.validation('A selected customer document is unavailable');
    let bytes = 0;
    for (const row of rows) {
      if (
        row.artifact_classification !== 'standard' ||
        !CLIENT_ARTIFACT_TYPES.has(row.artifact_type) ||
        row.media_type !== 'application/pdf' ||
        !['customer_private', 'operational'].includes(row.sensitivity) ||
        !['clean', 'not_scanned'].includes(row.scan_status ?? '')
      )
        throw this.deps.validation(`Document ${row.id} is not authorized for customer closeout`);
      if (
        !/^[a-f0-9]{64}$/u.test(row.sha256) ||
        !Number.isSafeInteger(row.byte_length) ||
        row.byte_length < 1
      )
        throw this.deps.validation(`Document ${row.id} has invalid integrity metadata`);
      assertSafeStorageKey(row.storage_key, () =>
        this.deps.validation(`Document ${row.id} has an unsafe storage key`),
      );
      bytes += row.byte_length;
    }
    if (bytes > MAX_SOURCE_BYTES)
      throw this.deps.validation('Customer attachment selection exceeds the 100 MB closeout limit');
    return rows;
  }
  /** Only an active, signed customer-conformity record authorizes a period PDF for handover. */
  /**
   * A customer PDF enters a closeout only through its current, active conformity
   * and its independently verified signed-copy evidence.  An approved report by
   * itself is operational review, not customer handover authority.
   */
  private acceptedPeriodReferences(
    principal: Principal,
    projectId: string,
  ): AcceptedPeriodSource[] {
    const rows = this.sqlite
      .prepare(
        `SELECT c.id conformity_id,c.period_report_id,r.period_start,r.period_end,
      c.snapshot_version,c.snapshot_sha256,c.report_pdf_storage_key,c.report_pdf_sha256,c.report_pdf_byte_length,
      COALESCE(c.signature_document_id,attachment.signature_document_id) evidence_document_id,
      evidence.storage_key evidence_storage_key,evidence.sha256 evidence_sha256,evidence.byte_length evidence_byte_length,
      evidence.media_type evidence_media_type,evidence.safe_filename evidence_safe_filename,evidence.original_filename evidence_original_filename,
      evidence.artifact_type evidence_artifact_type,evidence.sensitivity evidence_sensitivity,evidence.scan_status evidence_scan_status
      FROM customer_conformity c JOIN period_report r ON r.id=c.period_report_id
      LEFT JOIN customer_conformity_evidence_attachment attachment ON attachment.conformity_id=c.id
      JOIN document evidence ON evidence.id=COALESCE(c.signature_document_id,attachment.signature_document_id)
      LEFT JOIN customer_conformity_invalidation invalidation ON invalidation.conformity_id=c.id
      WHERE r.project_id=? AND r.audience='customer' AND r.state IN('approved','final')
        AND c.snapshot_version=r.snapshot_version AND c.snapshot_sha256=r.snapshot_sha256 AND c.snapshot_json=r.snapshot_json
        AND c.report_pdf_storage_key=r.pdf_storage_key AND c.report_pdf_sha256=r.pdf_sha256 AND c.report_pdf_byte_length=r.pdf_byte_length
        AND invalidation.id IS NULL ORDER BY r.period_start,c.created_at,c.id`,
      )
      .all(projectId) as Array<{
      conformity_id: string;
      period_report_id: string;
      period_start: string;
      period_end: string;
      snapshot_version: number;
      snapshot_sha256: string;
      report_pdf_storage_key: string;
      report_pdf_sha256: string;
      report_pdf_byte_length: number;
      evidence_document_id: string;
      evidence_storage_key: string;
      evidence_sha256: string;
      evidence_byte_length: number;
      evidence_media_type: string;
      evidence_safe_filename: string | null;
      evidence_original_filename: string | null;
      evidence_artifact_type: string;
      evidence_sensitivity: string;
      evidence_scan_status: string | null;
    }>;
    const conformityRepository = new V3Repository(this.sqlite);
    return rows.map((row) => {
      if (
        !Number.isSafeInteger(row.snapshot_version) ||
        row.snapshot_version < 1 ||
        !/^[a-f0-9]{64}$/u.test(row.snapshot_sha256) ||
        !/^[a-f0-9]{64}$/u.test(row.report_pdf_sha256) ||
        !Number.isSafeInteger(row.report_pdf_byte_length) ||
        row.report_pdf_byte_length < 1
      )
        throw this.deps.conflict('Accepted customer conformity source is invalid');
      assertSafeStorageKey(row.report_pdf_storage_key, () =>
        this.deps.conflict('Accepted customer conformity path is unsafe'),
      );
      const conformity = conformityRepository.getCustomerConformityForPeriodReport(
        principal,
        row.period_report_id,
      );
      if (
        !conformity ||
        !('snapshotVersion' in conformity) ||
        conformity.id !== row.conformity_id ||
        conformity.status !== 'active' ||
        conformity.signatureEvidenceStatus !== 'verified' ||
        conformity.snapshotVersion !== row.snapshot_version ||
        conformity.snapshotSha256 !== row.snapshot_sha256 ||
        conformity.reportPdfStorageKey !== row.report_pdf_storage_key ||
        conformity.reportPdfSha256 !== row.report_pdf_sha256 ||
        conformity.reportPdfByteLength !== row.report_pdf_byte_length
      )
        throw this.deps.conflict('Accepted customer conformity evidence is unavailable or stale');
      const evidence: SourceDocument = {
        id: row.evidence_document_id,
        storage_key: row.evidence_storage_key,
        sha256: row.evidence_sha256,
        byte_length: row.evidence_byte_length,
        media_type: row.evidence_media_type,
        safe_filename: row.evidence_safe_filename,
        original_filename: row.evidence_original_filename,
        artifact_type: row.evidence_artifact_type,
        sensitivity: row.evidence_sensitivity,
        scan_status: row.evidence_scan_status,
      };
      if (
        evidence.artifact_type !== 'customer_signoff_evidence' ||
        evidence.media_type !== 'application/pdf' ||
        !['customer_private', 'sensitive'].includes(evidence.sensitivity) ||
        !['clean', 'not_scanned'].includes(evidence.scan_status ?? '') ||
        !/^[a-f0-9]{64}$/u.test(evidence.sha256) ||
        !Number.isSafeInteger(evidence.byte_length) ||
        evidence.byte_length < 1
      )
        throw this.deps.conflict('Accepted customer conformity evidence is invalid');
      assertSafeStorageKey(evidence.storage_key, () =>
        this.deps.conflict('Accepted customer conformity evidence path is unsafe'),
      );
      return {
        conformityId: row.conformity_id,
        periodReportId: row.period_report_id,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        snapshotVersion: row.snapshot_version,
        snapshotSha256: row.snapshot_sha256,
        storageKey: row.report_pdf_storage_key,
        sha256: row.report_pdf_sha256,
        byteLength: row.report_pdf_byte_length,
        filename: safeArchiveName(`${row.period_start}-${row.period_end}.pdf`, 'period-report.pdf'),
        evidence,
      };
    });
  }
  private systemBackupRegister(projectId: string) {
    return this.sqlite
      .prepare(
        `SELECT report.id report_id,report.report_date,report.system_name,report.validation_result,report.open_risk,
      link.id link_id,link.attachment_kind,link.system_reference_snapshot,document.id document_id,
      document.safe_filename,document.original_filename,document.media_type,document.sha256,document.byte_length
      FROM technical_report report LEFT JOIN report_document_link link ON link.report_type='technical' AND link.report_id=report.id
      LEFT JOIN document ON document.id=link.document_id AND document.project_id=report.project_id AND document.state='committed'
      WHERE report.project_id=? AND report.approval_state='approved' ORDER BY report.report_date,report.id,link.created_at,link.id`,
      )
      .all(projectId);
  }
  private snapshots(principal: Principal, projectId: string, selected: SourceDocument[]) {
    const project = this.sqlite
      .prepare(
        'SELECT id,project_number,name,client_id,currency,status,site_name,country,start_date,actual_end_date,notes FROM project WHERE id=?',
      )
      .get(projectId) as Record<string, unknown> | undefined;
    if (!project) throw this.deps.validation('Project not found');
    const time = this.sqlite
      .prepare(
        "SELECT COALESCE(sum(minutes),0) minutes, count(*) entries FROM time_entry WHERE project_id=? AND approval_state='approved'",
      )
      .get(projectId) as { minutes: number; entries: number };
    const reports = this.sqlite
      .prepare(
        "SELECT id,report_date,system_name,validation_result,open_risk FROM technical_report WHERE project_id=? AND approval_state='approved' ORDER BY report_date,id",
      )
      .all(projectId);
    const invoices = this.sqlite
      .prepare(
        'SELECT id,invoice_number,state,currency,CAST(subtotal_minor AS TEXT) subtotal_minor,CAST(tax_minor AS TEXT) tax_minor,CAST(total_minor AS TEXT) total_minor,issued_at,due_at,voided_at,version FROM invoice WHERE project_id=? ORDER BY created_at,id',
      )
      .all(projectId);
    const payments = this.sqlite
      .prepare(
        'SELECT payment.id,payment.invoice_id,payment.currency,CAST(payment.amount_minor AS TEXT) amount_minor,payment.received_at,payment.reference FROM payment JOIN invoice ON invoice.id=payment.invoice_id WHERE invoice.project_id=? ORDER BY payment.received_at,payment.id',
      )
      .all(projectId);
    const reversals = this.sqlite
      .prepare(
        'SELECT reversal.id,reversal.invoice_id,reversal.original_payment_id,CAST(reversal.amount_minor AS TEXT) amount_minor,reversal.currency,reversal.effective_at,reversal.reason_code,reversal.reason_text,reversal.reversal_hash FROM invoice_payment_reversal_event reversal JOIN invoice ON invoice.id=reversal.invoice_id WHERE invoice.project_id=? ORDER BY reversal.created_at,reversal.id',
      )
      .all(projectId);
    const adjustments = this.sqlite
      .prepare(
        'SELECT adjustment.id,adjustment.original_invoice_id,adjustment.adjustment_invoice_id,adjustment.adjustment_type,adjustment.currency,CAST(adjustment.amount_minor AS TEXT) amount_minor,adjustment.effective_at,adjustment.adjustment_hash,adjustment.prior_adjustment_hash FROM invoice_adjustment adjustment JOIN invoice original ON original.id=adjustment.original_invoice_id WHERE original.project_id=? ORDER BY adjustment.effective_at,adjustment.id',
      )
      .all(projectId);
    const expenses = this.sqlite
      .prepare(
        "SELECT id,currency,CAST(amount_minor AS TEXT) amount_minor,approval_state,spent_on,description,version FROM expense WHERE project_id=? AND approval_state='approved' ORDER BY spent_on,id",
      )
      .all(projectId);
    const expenseSummary = this.sqlite
      .prepare(
        "SELECT currency,CAST(COALESCE(sum(amount_minor),0) AS TEXT) total_minor,count(*) entries FROM expense WHERE project_id=? AND approval_state='approved' GROUP BY currency ORDER BY currency",
      )
      .all(projectId);
    const documents = this.sqlite
      .prepare(
        'SELECT id,safe_filename,original_filename,artifact_type,sensitivity,media_type,sha256,byte_length,state FROM document WHERE project_id=? ORDER BY created_at,id',
      )
      .all(projectId);
    const periodSources = this.acceptedPeriodReferences(principal, projectId);
    const periodReferences = periodSources.map(
      ({ storageKey: _storageKey, evidence: _evidence, ...reference }) => reference,
    );
    const systemBackupRegister = this.systemBackupRegister(projectId);
    const sourceManifest: ClientSourceManifest = {
      documents: selected.map((d) => ({
        documentId: d.id,
        storageKey: d.storage_key,
        sha256: d.sha256,
        byteLength: d.byte_length,
        mediaType: d.media_type,
        artifactType: d.artifact_type,
        sensitivity: d.sensitivity,
        scanStatus: d.scan_status,
      })),
      acceptedPeriodReferences: periodSources.map(
        ({ evidence, filename: _filename, ...reference }) => ({
          ...reference,
          evidenceDocumentId: evidence.id,
          evidenceStorageKey: evidence.storage_key,
          evidenceSha256: evidence.sha256,
          evidenceByteLength: evidence.byte_length,
          evidenceMediaType: evidence.media_type,
          evidenceArtifactType: evidence.artifact_type,
          evidenceSensitivity: evidence.sensitivity,
          evidenceScanStatus: evidence.scan_status,
        }),
      ),
    };
    const sourceSnapshot = {
      project,
      approvedTime: { minutes: time.minutes, entries: time.entries },
      technicalReports: reports,
      systemBackupRegister,
      invoiceRegister: invoices,
      paymentCollectionStatus: payments,
      paymentReversals: reversals,
      invoiceAdjustments: adjustments,
      expenseEntries: expenses,
      expenseTotals: expenseSummary,
      documentIndex: documents,
      sourceManifest,
    };
    const sourceSnapshotHash = hash(stable(sourceSnapshot));
    const internal = {
      version: 1,
      sourceSnapshotHash,
      project,
      approvedTime: { minutes: time.minutes, entries: time.entries },
      technicalReports: reports,
      systemBackupRegister,
      expenseSummary: { entries: expenses, totals: expenseSummary },
      invoiceRegister: invoices,
      paymentCollectionStatus: payments,
      paymentReversals: reversals,
      invoiceAdjustments: adjustments,
      documentIndex: documents,
      sourceManifest,
      generatedAt: isoNow(),
    };
    const client = {
      version: 1,
      sourceSnapshotHash,
      project: {
        projectNumber: project.project_number,
        name: project.name,
        siteName: project.site_name,
        country: project.country,
        status: project.status,
        startDate: project.start_date,
        actualEndDate: project.actual_end_date,
      },
      technicalReports: (reports as Record<string, unknown>[]).map(
        ({ id, report_date, system_name, validation_result, open_risk }) => ({
          id,
          reportDate: report_date,
          systemName: system_name,
          validationResult: validation_result,
          openRisk: open_risk,
        }),
      ),
      systemBackupRegister: (systemBackupRegister as Record<string, unknown>[]).map(
        ({ report_id, system_name, attachment_kind, system_reference_snapshot }) => ({
          reportId: report_id,
          systemName: system_name,
          attachmentKind: attachment_kind,
          systemReference: system_reference_snapshot,
        }),
      ),
      acceptedPeriodReferences: periodReferences,
      selectedDocuments: selected.map((d) => ({
        filename: d.safe_filename ?? d.original_filename ?? 'document.pdf',
        sha256: d.sha256,
        byteLength: d.byte_length,
        mediaType: d.media_type,
      })),
      publicationWarning:
        'Review confirms this exact snapshot. Pattern scanning cannot prove confidentiality.',
      generatedAt: isoNow(),
    };
    const clientText = stable(client);
    if (MONEY_PATTERN.test(clientText))
      throw this.deps.validation(
        'Client snapshot contains a recognized monetary pattern and needs review before publication',
      );
    return {
      internal,
      client,
      sourceManifest,
      internalHash: hash(stable(internal)),
      clientHash: hash(clientText),
    };
  }
  prepare(
    principal: Principal,
    input: Readonly<{ projectId: string; clientDocumentIds?: readonly string[] }>,
  ) {
    this.assertWriter(principal);
    const selected = this.sourceDocuments(input.projectId, input.clientDocumentIds ?? []);
    const snapshot = this.snapshots(principal, input.projectId, selected);
    const timestamp = isoNow();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      let series = this.sqlite
        .prepare(
          'SELECT id,current_draft_revision_id FROM project_closeout_series WHERE project_id=?',
        )
        .get(input.projectId) as
        | { id: string; current_draft_revision_id: string | null }
        | undefined;
      if (series?.current_draft_revision_id)
        throw this.deps.conflict('A closeout draft is already active');
      if (!series) {
        series = { id: newId(), current_draft_revision_id: null };
        this.sqlite
          .prepare(
            'INSERT INTO project_closeout_series(id,project_id,current_draft_revision_id,created_at,updated_at) VALUES(?,?,?,?,?)',
          )
          .run(series.id, input.projectId, null, timestamp, timestamp);
      }
      const next = this.sqlite
        .prepare(
          'SELECT COALESCE(max(revision_number),0)+1 revision FROM project_closeout_revision WHERE series_id=?',
        )
        .get(series.id) as { revision: number };
      const id = newId();
      this.sqlite
        .prepare(
          "INSERT INTO project_closeout_revision(id,series_id,revision_number,state,internal_snapshot_json,client_snapshot_json,client_selection_json,internal_snapshot_sha256,client_snapshot_sha256,created_by,created_at,updated_at) VALUES(?,?,?,'draft',?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          series.id,
          next.revision,
          stable(snapshot.internal),
          stable(snapshot.client),
          stable(snapshot.sourceManifest),
          snapshot.internalHash,
          snapshot.clientHash,
          principal.userId,
          timestamp,
          timestamp,
        );
      this.sqlite
        .prepare(
          'UPDATE project_closeout_series SET current_draft_revision_id=?,updated_at=? WHERE id=?',
        )
        .run(id, timestamp, series.id);
      this.deps.audit(principal, 'project_closeout.prepare', 'project_closeout_revision', id, {
        projectId: input.projectId,
        revision: next.revision,
        clientSnapshotHash: snapshot.clientHash,
        selectedDocumentCount: selected.length,
      });
      this.sqlite.exec('COMMIT');
      return {
        id,
        revision: next.revision,
        state: 'draft' as const,
        internal: snapshot.internal,
        client: snapshot.client,
        clientSnapshotHash: snapshot.clientHash,
      };
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  /** Refreshes only the mutable active draft; finalized revisions and their bytes are never touched. */
  refresh(
    principal: Principal,
    input: Readonly<{ revisionId: string; clientDocumentIds?: readonly string[] }>,
  ) {
    this.assertWriter(principal);
    const current = this.row(input.revisionId);
    if (current.state !== 'draft')
      throw this.deps.conflict('Only an active closeout draft can be refreshed');
    const previous = this.sourceManifest(current);
    const selectedIds =
      input.clientDocumentIds === undefined
        ? previous.documents.map((item) => String(item.documentId ?? ''))
        : [...input.clientDocumentIds];
    const selected = this.sourceDocuments(current.project_id, selectedIds);
    const snapshot = this.snapshots(principal, current.project_id, selected);
    const timestamp = isoNow();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const active = this.sqlite
        .prepare('SELECT current_draft_revision_id FROM project_closeout_series WHERE id=?')
        .get(current.series_id) as { current_draft_revision_id: string | null } | undefined;
      if (!active || active.current_draft_revision_id !== current.id)
        throw this.deps.conflict('Closeout draft changed concurrently');
      const result = this.sqlite
        .prepare(
          `UPDATE project_closeout_revision SET
        internal_snapshot_json=?,client_snapshot_json=?,client_selection_json=?,internal_snapshot_sha256=?,client_snapshot_sha256=?,
        client_confirmation_hash=NULL,client_confirmed_by=NULL,client_confirmed_at=NULL,updated_at=?
        WHERE id=? AND state='draft'`,
        )
        .run(
          stable(snapshot.internal),
          stable(snapshot.client),
          stable(snapshot.sourceManifest),
          snapshot.internalHash,
          snapshot.clientHash,
          timestamp,
          current.id,
        );
      if (result.changes !== 1) throw this.deps.conflict('Closeout draft changed concurrently');
      this.deps.audit(
        principal,
        'project_closeout.prepare',
        'project_closeout_revision',
        current.id,
        {
          projectId: current.project_id,
          revision: current.revision_number,
          clientSnapshotHash: snapshot.clientHash,
          selectedDocumentCount: selected.length,
          refreshed: true,
        },
      );
      this.sqlite.exec('COMMIT');
      return {
        id: current.id,
        revision: current.revision_number,
        state: 'draft' as const,
        internal: snapshot.internal,
        client: snapshot.client,
        clientSnapshotHash: snapshot.clientHash,
      };
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  confirmClientPublication(principal: Principal, revisionId: string, exactSnapshotHash: string) {
    this.assertWriter(principal);
    const row = this.sqlite
      .prepare('SELECT id,state,client_snapshot_sha256 FROM project_closeout_revision WHERE id=?')
      .get(revisionId) as { id: string; state: string; client_snapshot_sha256: string } | undefined;
    if (!row || row.state !== 'draft')
      throw this.deps.conflict('An active closeout draft is required');
    if (
      !/^[a-f0-9]{64}$/u.test(exactSnapshotHash) ||
      exactSnapshotHash !== row.client_snapshot_sha256
    )
      throw this.deps.conflict(
        'Client publication confirmation is stale; review the exact current snapshot',
      );
    const confirmation = this.sqlite
      .prepare(
        "UPDATE project_closeout_revision SET client_confirmation_hash=?,client_confirmed_by=?,client_confirmed_at=?,updated_at=? WHERE id=? AND state='draft' AND client_snapshot_sha256=?",
      )
      .run(exactSnapshotHash, principal.userId, isoNow(), isoNow(), revisionId, exactSnapshotHash);
    if (confirmation.changes !== 1)
      throw this.deps.conflict(
        'Client publication confirmation is stale; review the exact current snapshot',
      );
    this.deps.audit(
      principal,
      'project_closeout.client_publication_confirm',
      'project_closeout_revision',
      revisionId,
      { clientSnapshotHash: exactSnapshotHash },
    );
  }
  private row(revisionId: string): RevisionRow {
    const row = this.sqlite
      .prepare(
        'SELECT r.*,s.project_id FROM project_closeout_revision r JOIN project_closeout_series s ON s.id=r.series_id WHERE r.id=?',
      )
      .get(revisionId) as RevisionRow | undefined;
    if (!row) throw this.deps.validation('Closeout revision not found');
    return row;
  }
  private readSource(root: string, source: SourceDocument): Buffer {
    assertSafeStorageKey(source.storage_key, () =>
      this.deps.validation('Selected document path is unsafe'),
    );
    const target = resolve(root, source.storage_key);
    const rel = relative(root, target);
    if (!rel || rel.startsWith('..') || rel.includes('\\'))
      throw this.deps.validation('Selected document path escaped storage root');
    let cursor = root;
    for (const segment of source.storage_key.split('/')) {
      cursor = resolve(cursor, segment);
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || (!stat.isFile() && cursor === target))
        throw this.deps.conflict(`Selected document ${source.id} has an unsafe storage path`);
    }
    const fd = openSync(target, constants.O_RDONLY | 0x20000); // O_NOFOLLOW on Linux; parent path checks above cover portable fallback.
    let bytes: Buffer;
    try {
      bytes = readFileSync(fd);
    } finally {
      closeSync(fd);
    }
    if (bytes.byteLength !== source.byte_length || hash(bytes) !== source.sha256)
      throw this.deps.conflict(`Selected document ${source.id} failed integrity verification`);
    return bytes;
  }
  private assertSelectedDocumentSource(
    projectId: string,
    item: Record<string, unknown>,
  ): SourceDocument {
    const source = this.sourceDocuments(projectId, [String(item.documentId ?? '')])[0];
    if (
      !source ||
      source.storage_key !== String(item.storageKey ?? '') ||
      source.sha256 !== String(item.sha256 ?? '') ||
      source.byte_length !== Number(item.byteLength) ||
      source.media_type !== String(item.mediaType ?? '') ||
      source.artifact_type !== String(item.artifactType ?? '') ||
      source.sensitivity !== String(item.sensitivity ?? '') ||
      source.scan_status !== String(item.scanStatus ?? '')
    )
      throw this.deps.conflict('Selected customer document source changed; prepare a fresh draft');
    return source;
  }
  private assertAcceptedPeriodReference(
    principal: Principal,
    projectId: string,
    item: Record<string, unknown>,
  ): AcceptedPeriodSource {
    const expected = this.acceptedPeriodReferences(principal, projectId).find(
      (reference) => reference.conformityId === String(item.conformityId ?? ''),
    );
    if (
      !expected ||
      expected.periodReportId !== String(item.periodReportId ?? '') ||
      expected.snapshotVersion !== Number(item.snapshotVersion) ||
      expected.snapshotSha256 !== String(item.snapshotSha256 ?? '') ||
      expected.storageKey !== String(item.storageKey ?? '') ||
      expected.sha256 !== String(item.sha256 ?? '') ||
      expected.byteLength !== Number(item.byteLength) ||
      expected.evidence.id !== String(item.evidenceDocumentId ?? '') ||
      expected.evidence.storage_key !== String(item.evidenceStorageKey ?? '') ||
      expected.evidence.sha256 !== String(item.evidenceSha256 ?? '') ||
      expected.evidence.byte_length !== Number(item.evidenceByteLength) ||
      expected.evidence.media_type !== String(item.evidenceMediaType ?? '') ||
      expected.evidence.artifact_type !== String(item.evidenceArtifactType ?? '') ||
      expected.evidence.sensitivity !== String(item.evidenceSensitivity ?? '') ||
      expected.evidence.scan_status !== String(item.evidenceScanStatus ?? '')
    )
      throw this.deps.conflict(
        'Accepted customer conformity source changed; prepare a fresh draft',
      );
    return expected;
  }
  private sourceManifest(row: RevisionRow): ClientSourceManifest {
    try {
      const parsed = JSON.parse(
        (
          this.sqlite
            .prepare('SELECT client_selection_json FROM project_closeout_revision WHERE id=?')
            .get(row.id) as { client_selection_json: string }
        ).client_selection_json,
      ) as Record<string, unknown>;
      if (!Array.isArray(parsed.documents) || !Array.isArray(parsed.acceptedPeriodReferences))
        throw new Error('invalid source manifest');
      return {
        documents: parsed.documents as Record<string, unknown>[],
        acceptedPeriodReferences: parsed.acceptedPeriodReferences as Record<string, unknown>[],
      };
    } catch {
      throw this.deps.conflict('Closeout draft source manifest is invalid');
    }
  }
  private package(
    principal: Principal,
    row: RevisionRow,
    audience: Audience,
  ): { bytes: Buffer; filename: string } {
    const snapshot = JSON.parse(
      audience === 'internal' ? row.internal_snapshot_json : row.client_snapshot_json,
    ) as Record<string, unknown>;
    const root = resolve(
      process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
    );
    const entries: { name: string; bytes: Buffer }[] = [];
    const clientDocuments = (snapshot.selectedDocuments ?? []) as Array<Record<string, unknown>>;
    const documentIndex =
      audience === 'internal'
        ? ((snapshot.documentIndex ?? []) as Array<Record<string, unknown>>)
        : clientDocuments;
    const sourceManifest = this.sourceManifest(row);
    if (audience === 'client')
      for (const [index, item] of sourceManifest.documents.entries()) {
        const source = this.assertSelectedDocumentSource(row.project_id, item);
        const filename = safeArchiveName(
          String(clientDocuments[index]?.filename ?? 'document.pdf'),
          'document.pdf',
        );
        entries.push({
          name: `documents/${String(index + 1).padStart(2, '0')}-${filename}`,
          bytes: this.readSource(root, source),
        });
      }
    if (audience === 'client') {
      const reports = (snapshot.acceptedPeriodReferences ?? []) as Array<Record<string, unknown>>;
      for (const [index, report] of sourceManifest.acceptedPeriodReferences.entries()) {
        const accepted = this.assertAcceptedPeriodReference(principal, row.project_id, report);
        const source: SourceDocument = {
          id: accepted.conformityId,
          storage_key: accepted.storageKey,
          sha256: accepted.sha256,
          byte_length: accepted.byteLength,
          media_type: 'application/pdf',
          safe_filename: null,
          original_filename: null,
          artifact_type: 'customer_period_pdf',
          sensitivity: 'customer_private',
          scan_status: null,
        };
        this.readSource(root, accepted.evidence);
        entries.push({
          name: `period-reports/${String(index + 1).padStart(2, '0')}-${safeArchiveName(String(reports[index]?.filename ?? accepted.filename), 'period-report.pdf')}`,
          bytes: this.readSource(root, source),
        });
      }
    }
    const periodReferences = (snapshot.acceptedPeriodReferences ?? []) as Array<
      Record<string, unknown>
    >;
    const indexCsv =
      [
        'kind,id,filename,sha256,byte_length',
        ...documentIndex.map((item) =>
          [
            'document',
            item.id ?? '',
            item.filename ?? item.safe_filename ?? item.original_filename,
            item.sha256,
            item.byteLength ?? item.byte_length,
          ]
            .map(csvCell)
            .join(','),
        ),
        ...periodReferences.map((item) =>
          [
            'accepted_period_pdf',
            item.periodReportId ?? '',
            item.filename ?? `${item.periodStart ?? ''}-${item.periodEnd ?? ''}.pdf`,
            item.sha256,
            item.byteLength,
          ]
            .map(csvCell)
            .join(','),
        ),
      ].join('\n') + '\n';
    const project = (snapshot.project ?? {}) as Record<string, unknown>;
    const reportLines =
      audience === 'internal'
        ? [
            `Project: ${String(project.project_number ?? project.projectNumber ?? '')} ${String(project.name ?? '')}`,
            `Approved time: ${String((snapshot.approvedTime as Record<string, unknown> | undefined)?.minutes ?? 0)} minutes`,
            ...(Array.isArray(snapshot.technicalReports)
              ? snapshot.technicalReports.map((report) => {
                  const item = report as Record<string, unknown>;
                  return `Technical ${String(item.id ?? '')}: ${String(item.system_name ?? item.systemName ?? '')}; validation ${String(item.validation_result ?? item.validationResult ?? '')}; risk ${String(item.open_risk ?? item.openRisk ?? '')}`;
                })
              : []),
            ...(Array.isArray(snapshot.invoiceRegister)
              ? snapshot.invoiceRegister.map((invoice) => {
                  const item = invoice as Record<string, unknown>;
                  return `Invoice ${String(item.invoice_number ?? '')}: ${String(item.currency ?? '')} ${String(item.total_minor ?? '')} minor units; ${String(item.state ?? '')}`;
                })
              : []),
            ...(Array.isArray(snapshot.paymentCollectionStatus)
              ? snapshot.paymentCollectionStatus.map((payment) => {
                  const item = payment as Record<string, unknown>;
                  return `Payment ${String(item.reference ?? '')}: ${String(item.currency ?? '')} ${String(item.amount_minor ?? '')} minor units`;
                })
              : []),
            ...documentIndex.map(
              (item) =>
                `Document ${String(item.id ?? '')}: ${String(item.safe_filename ?? item.original_filename ?? '')}`,
            ),
            'This internal package is a finalized historical snapshot.',
          ]
        : [
            `Project: ${String(project.projectNumber ?? '')} ${String(project.name ?? '')}`,
            ...(Array.isArray(snapshot.technicalReports)
              ? snapshot.technicalReports.map((report) => {
                  const item = report as Record<string, unknown>;
                  return `Technical ${String(item.reportDate ?? '')}: ${String(item.systemName ?? '')}; validation ${String(item.validationResult ?? '')}; risk ${String(item.openRisk ?? '')}`;
                })
              : []),
            ...periodReferences.map(
              (item) =>
                `Accepted period ${String(item.periodStart ?? '')} to ${String(item.periodEnd ?? '')}: ${String(item.filename ?? '')}`,
            ),
            ...clientDocuments.map((item) => `Authorized document: ${String(item.filename ?? '')}`),
            'Validation and open-risk summaries are in closeout.json.',
            'This export is for authorized staff handover.',
          ];
    entries.unshift(
      { name: 'closeout.json', bytes: Buffer.from(stable(snapshot)) },
      { name: 'document-index.csv', bytes: Buffer.from(indexCsv) },
      {
        name: 'closeout-summary.pdf',
        bytes: simplePdf(
          `J&A project closeout ${audience} revision ${row.revision_number}`,
          reportLines,
        ),
      },
    );
    const manifest = {
      schemaVersion: 1,
      audience,
      revisionId: row.id,
      revisionNumber: row.revision_number,
      files: entries.map((entry) => ({
        name: entry.name,
        sha256: hash(entry.bytes),
        byteLength: entry.bytes.byteLength,
      })),
    };
    entries.push({ name: 'manifest.json', bytes: Buffer.from(stable(manifest)) });
    const bytes = zip(entries);
    if (bytes.byteLength > MAX_SOURCE_BYTES + 2 * 1024 * 1024)
      throw this.deps.validation('Closeout package exceeds the size limit');
    return { bytes, filename: `ja-project-closeout-${audience}-r${row.revision_number}.zip` };
  }
  private assertCurrentDraftSources(principal: Principal, row: RevisionRow): void {
    const sourceManifest = this.sourceManifest(row);
    const documents = sourceManifest.documents.map((item) =>
      this.assertSelectedDocumentSource(row.project_id, item),
    );
    for (const period of sourceManifest.acceptedPeriodReferences)
      this.assertAcceptedPeriodReference(principal, row.project_id, period);
    const current = this.snapshots(principal, row.project_id, documents);
    const client = JSON.parse(row.client_snapshot_json) as { sourceSnapshotHash?: string };
    if (
      client.sourceSnapshotHash !==
      (current.client as { sourceSnapshotHash?: string }).sourceSnapshotHash
    )
      throw this.deps.conflict('Closeout source snapshot changed; prepare a fresh draft');
  }
  /**
   * Draft rows remain mutable while they are being prepared, so their stored
   * snapshot hashes and the explicit publication confirmation must be checked
   * before their bytes are assembled or finalized.
   */
  private assertDraftSnapshotIntegrity(row: RevisionRow): void {
    try {
      const internal = JSON.parse(row.internal_snapshot_json) as unknown;
      const client = JSON.parse(row.client_snapshot_json) as unknown;
      if (
        hash(stable(internal)) !== row.internal_snapshot_sha256 ||
        hash(stable(client)) !== row.client_snapshot_sha256 ||
        row.client_confirmation_hash !== row.client_snapshot_sha256
      )
        throw new Error('snapshot hash mismatch');
    } catch {
      throw this.deps.conflict(
        'Closeout draft snapshot or client publication confirmation changed; prepare a fresh draft',
      );
    }
  }
  finalize(principal: Principal, revisionId: string) {
    this.assertWriter(principal);
    const current = this.row(revisionId);
    if (current.state === 'final') return this.artifacts(principal, revisionId);
    if (current.state !== 'draft' || !current.client_confirmation_hash)
      throw this.deps.conflict(
        'Draft requires exact client publication confirmation before finalization',
      );
    this.assertDraftSnapshotIntegrity(current);
    this.assertCurrentDraftSources(principal, current);
    const internal = this.package(principal, current, 'internal');
    const client = this.package(principal, current, 'client');
    const root = resolve(
      process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
    );
    const published: string[] = [];
    const newlyWritten: string[] = [];
    const artifactRows = [
      ['internal', internal],
      ['client', client],
    ] as const;
    try {
      for (const [audience, artifact] of artifactRows) {
        const key = `exports/project-closeouts/${current.series_id}/r${current.revision_number}/${audience}-${hash(artifact.bytes).slice(0, 16)}.zip`;
        const path = resolve(root, key);
        mkdirSync(dirname(path), { recursive: true });
        const temp = `${path}.${newId()}.tmp`;
        try {
          writeFileSync(temp, artifact.bytes, { flag: 'wx' });
          try {
            linkSync(temp, path);
            newlyWritten.push(path);
          } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST')
              throw error;
            this.readSource(root, {
              id: `${current.id}-${audience}`,
              storage_key: key,
              sha256: hash(artifact.bytes),
              byte_length: artifact.bytes.byteLength,
              media_type: 'application/zip',
              safe_filename: null,
              original_filename: null,
              artifact_type: '',
              sensitivity: '',
              scan_status: null,
            });
          }
          published.push(path);
        } finally {
          try {
            unlinkSync(temp);
          } catch {
            /* temporary file may already be absent */
          }
        }
      }
      this.sqlite.exec('BEGIN IMMEDIATE');
      const active = this.sqlite
        .prepare('SELECT current_draft_revision_id FROM project_closeout_series WHERE id=?')
        .get(current.series_id) as { current_draft_revision_id: string | null } | undefined;
      if (!active || active.current_draft_revision_id !== revisionId)
        throw this.deps.conflict('Closeout draft changed concurrently');
      const finalCurrent = this.row(revisionId);
      if (
        finalCurrent.state !== 'draft' ||
        finalCurrent.internal_snapshot_sha256 !== current.internal_snapshot_sha256 ||
        finalCurrent.client_snapshot_sha256 !== current.client_snapshot_sha256 ||
        finalCurrent.client_confirmation_hash !== current.client_confirmation_hash
      )
        throw this.deps.conflict('Closeout draft changed concurrently');
      this.assertDraftSnapshotIntegrity(finalCurrent);
      this.assertWriter(principal);
      this.assertCurrentDraftSources(principal, finalCurrent);
      const result = this.sqlite
        .prepare(
          "UPDATE project_closeout_revision SET state='final',finalized_by=?,finalized_at=?,updated_at=? WHERE id=? AND state='draft' AND internal_snapshot_sha256=? AND client_snapshot_sha256=? AND client_confirmation_hash=?",
        )
        .run(
          principal.userId,
          isoNow(),
          isoNow(),
          revisionId,
          current.internal_snapshot_sha256,
          current.client_snapshot_sha256,
          current.client_confirmation_hash,
        );
      if (result.changes !== 1) throw this.deps.conflict('Closeout draft changed concurrently');
      for (const [index, item] of artifactRows.entries()) {
        const path = published[index];
        if (!path) throw this.deps.conflict('Closeout artifact write did not complete');
        const [audience, artifact] = item;
        const key = relative(root, path).replaceAll('\\', '/');
        this.sqlite
          .prepare(
            'INSERT INTO project_closeout_artifact(id,revision_id,audience,storage_key,semantic_filename,media_type,sha256,byte_length,created_at) VALUES(?,?,?,?,?,?,?, ?,?)',
          )
          .run(
            newId(),
            revisionId,
            audience,
            key,
            artifact.filename,
            'application/zip',
            hash(artifact.bytes),
            artifact.bytes.byteLength,
            isoNow(),
          );
      }
      this.sqlite
        .prepare(
          'UPDATE project_closeout_series SET current_draft_revision_id=NULL,updated_at=? WHERE id=?',
        )
        .run(isoNow(), current.series_id);
      this.sqlite
        .prepare(
          "UPDATE project SET status='closed',actual_end_date=COALESCE(actual_end_date,date('now')),updated_at=?,version=version+1 WHERE id=? AND status NOT IN ('archived','closed')",
        )
        .run(isoNow(), current.project_id);
      this.deps.audit(
        principal,
        'project_closeout.finalize',
        'project_closeout_revision',
        revisionId,
        { revision: current.revision_number, audiences: ['internal', 'client'] },
      );
      this.sqlite.exec('COMMIT');
      return this.artifacts(principal, revisionId);
    } catch (error) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        /* no transaction was opened */
      }
      for (const file of newlyWritten) {
        try {
          unlinkSync(file);
        } catch {
          /* cleanup failure must not finalize the revision */
        }
      }
      throw error;
    }
  }
  reopen(principal: Principal, revisionId: string, reason: string): void {
    this.deps.assertActive(principal);
    this.deps.assertLiveSession(principal);
    if (principal.role !== 'owner_admin') throw this.deps.accessDenied('Owner role required');
    const persisted = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (!persisted || persisted.status !== 'active' || persisted.role !== 'owner_admin')
      throw this.deps.accessDenied('Active Owner role required');
    const clean = reason.trim();
    if (clean.length < 1 || clean.length > 2000)
      throw this.deps.validation('Reopen reason is required');
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const row = this.sqlite
        .prepare(
          `SELECT r.*,s.project_id,s.current_draft_revision_id,p.status project_status
          FROM project_closeout_revision r
          JOIN project_closeout_series s ON s.id=r.series_id
          JOIN project p ON p.id=s.project_id
          WHERE r.id=?`,
        )
        .get(revisionId) as
        | (RevisionRow & { current_draft_revision_id: string | null; project_status: string })
        | undefined;
      if (!row || row.state !== 'final')
        throw this.deps.conflict('A final closeout revision is required');
      const latest = this.sqlite
        .prepare(
          'SELECT revision_number FROM project_closeout_revision WHERE series_id=? ORDER BY revision_number DESC LIMIT 1',
        )
        .get(row.series_id) as { revision_number: number } | undefined;
      if (!latest || latest.revision_number !== row.revision_number)
        throw this.deps.conflict('Only the latest final closeout revision can be reopened');
      const alreadyReopened = this.sqlite
        .prepare('SELECT id FROM project_closeout_reopen_event WHERE revision_id=? LIMIT 1')
        .get(row.id);
      if (alreadyReopened)
        throw this.deps.conflict('This final closeout revision has already been reopened');
      if (row.current_draft_revision_id)
        throw this.deps.conflict('A closeout draft is already active');
      if (row.project_status !== 'closed')
        throw this.deps.conflict('Only a closed project can be reopened');
      const timestamp = isoNow();
      const activated = this.sqlite
        .prepare(
          "UPDATE project SET status='active',updated_at=?,version=version+1 WHERE id=? AND status='closed'",
        )
        .run(timestamp, row.project_id);
      if (activated.changes !== 1)
        throw this.deps.conflict('Project closeout changed concurrently');
      // Snapshot after activation so the next draft reflects the active project state.
      const snapshot = this.snapshots(principal, row.project_id, []);
      const next = this.sqlite
        .prepare(
          'SELECT COALESCE(max(revision_number),0)+1 revision FROM project_closeout_revision WHERE series_id=?',
        )
        .get(row.series_id) as { revision: number };
      const draftId = newId();
      this.sqlite
        .prepare(
          "INSERT INTO project_closeout_revision(id,series_id,revision_number,state,internal_snapshot_json,client_snapshot_json,client_selection_json,internal_snapshot_sha256,client_snapshot_sha256,created_by,created_at,updated_at) VALUES(?,?,?,'draft',?,?,?,?,?,?,?,?)",
        )
        .run(
          draftId,
          row.series_id,
          next.revision,
          stable(snapshot.internal),
          stable(snapshot.client),
          stable(snapshot.sourceManifest),
          snapshot.internalHash,
          snapshot.clientHash,
          principal.userId,
          timestamp,
          timestamp,
        );
      const pointer = this.sqlite
        .prepare(
          'UPDATE project_closeout_series SET current_draft_revision_id=?,updated_at=? WHERE id=? AND current_draft_revision_id IS NULL',
        )
        .run(draftId, timestamp, row.series_id);
      if (pointer.changes !== 1) throw this.deps.conflict('Closeout draft changed concurrently');
      this.sqlite
        .prepare(
          'INSERT INTO project_closeout_reopen_event(id,series_id,revision_id,reopened_by,reopened_at,reason) VALUES(?,?,?,?,?,?)',
        )
        .run(newId(), row.series_id, row.id, principal.userId, timestamp, clean);
      this.deps.audit(
        principal,
        'project_closeout.reopen',
        'project_closeout_revision',
        revisionId,
        { reason: clean, nextDraftRevisionId: draftId, nextRevision: next.revision },
      );
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  artifacts(principal: Principal, revisionId: string) {
    this.assertWriter(principal);
    return this.sqlite
      .prepare(
        'SELECT id,audience,storage_key,semantic_filename,media_type,sha256,byte_length,created_at FROM project_closeout_artifact WHERE revision_id=? ORDER BY audience',
      )
      .all(revisionId);
  }
  detail(principal: Principal, projectId: string) {
    this.assertWriter(principal);
    const series = this.sqlite
      .prepare(
        'SELECT id,current_draft_revision_id FROM project_closeout_series WHERE project_id=?',
      )
      .get(projectId) as { id: string; current_draft_revision_id: string | null } | undefined;
    const revisions = series
      ? this.sqlite
          .prepare(
            'SELECT id,revision_number,state,internal_snapshot_json,client_snapshot_json,client_snapshot_sha256,client_confirmation_hash,created_at,finalized_at FROM project_closeout_revision WHERE series_id=? ORDER BY revision_number DESC',
          )
          .all(series.id)
      : [];
    const artifacts = series
      ? this.sqlite
          .prepare(
            'SELECT a.id,a.revision_id,a.audience,a.semantic_filename,a.sha256,a.byte_length FROM project_closeout_artifact a JOIN project_closeout_revision r ON r.id=a.revision_id WHERE r.series_id=? ORDER BY r.revision_number DESC,a.audience',
          )
          .all(series.id)
      : [];
    const legacy = this.sqlite
      .prepare(
        'SELECT id,state,snapshot_json,document_manifest_json,created_at,updated_at FROM project_closeout WHERE project_id=?',
      )
      .get(projectId);
    return { series, revisions, artifacts, legacyEvidence: legacy ?? null };
  }
  download(principal: Principal, artifactId: string) {
    this.assertWriter(principal);
    const row = this.sqlite
      .prepare(
        'SELECT a.*,s.project_id FROM project_closeout_artifact a JOIN project_closeout_revision r ON r.id=a.revision_id JOIN project_closeout_series s ON s.id=r.series_id WHERE a.id=?',
      )
      .get(artifactId) as
      | (Record<string, unknown> & { storage_key: string; sha256: string; byte_length: number })
      | undefined;
    if (!row) throw this.deps.validation('Closeout artifact not found');
    const root = resolve(
      process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
    );
    assertSafeStorageKey(row.storage_key, () =>
      this.deps.validation('Closeout artifact path is unsafe'),
    );
    const bytes = this.readSource(root, {
      id: artifactId,
      storage_key: row.storage_key,
      sha256: row.sha256,
      byte_length: row.byte_length,
      media_type: 'application/zip',
      safe_filename: null,
      original_filename: null,
      artifact_type: '',
      sensitivity: '',
      scan_status: null,
    });
    this.deps.audit(
      principal,
      'project_closeout.download',
      'project_closeout_artifact',
      artifactId,
      { sha256: row.sha256, byteLength: row.byte_length },
    );
    return { row, bytes };
  }
}
