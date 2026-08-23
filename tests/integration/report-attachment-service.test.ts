import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PortalRepository,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  V3Repository,
  createDatabase,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const restoreDeploymentIdentities: Array<() => void> = [];
const originalScannerEnvironment = {
  node: process.env.NODE_ENV,
  required: process.env.JA_MALWARE_SCANNER_REQUIRED,
  url: process.env.JA_MALWARE_SCANNER_URL,
};

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
  if (originalScannerEnvironment.node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalScannerEnvironment.node;
  if (originalScannerEnvironment.required === undefined)
    delete process.env.JA_MALWARE_SCANNER_REQUIRED;
  else process.env.JA_MALWARE_SCANNER_REQUIRED = originalScannerEnvironment.required;
  if (originalScannerEnvironment.url === undefined) delete process.env.JA_MALWARE_SCANNER_URL;
  else process.env.JA_MALWARE_SCANNER_URL = originalScannerEnvironment.url;
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: 'owner_admin' | 'finance_admin' | 'project_manager' | 'worker' | 'auditor_read_only',
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@attachments.test`, role, 'active', 1, now, now);
}

type AttachmentFixture = Readonly<{
  sqlite: ReturnType<typeof createDatabase>['sqlite'];
  repository: PortalRepository;
  v3: V3Repository;
  owner: Principal;
  finance: Principal;
  manager: Principal;
  worker: Principal;
  auditor: Principal;
  outsider: Principal;
  projectId: string;
  alternateProjectId: string;
  clientId: string;
}>;

function fixture(): AttachmentFixture {
  const directory = mkdtempSync(join(tmpdir(), 'ja-report-attachment-service-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  databases.push(sqlite);
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  seedUser(sqlite, 'owner', 'owner_admin');
  seedUser(sqlite, 'finance', 'finance_admin');
  seedUser(sqlite, 'manager', 'project_manager');
  seedUser(sqlite, 'worker', 'worker');
  seedUser(sqlite, 'auditor', 'auditor_read_only');
  seedUser(sqlite, 'outsider', 'worker');
  seedB5ServiceActorBinding(sqlite, 'owner');

  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
  const auditor: Principal = {
    userId: 'auditor',
    role: 'auditor_read_only',
    projectIds: new Set(),
  };
  const client = repository.createClient(owner, {
    legalName: 'Report Attachment Client',
    displayName: 'Report Attachment Client',
    currency: 'EUR',
    timezone: 'UTC',
    billingAddress: '1 Report Way',
    billingEmail: 'reports@example.com',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Report Attachment Project',
    timezone: 'UTC',
    currency: 'EUR',
    billingModel: 'tm',
    expectedMinutesPerDay: 600,
  });
  const alternateProject = repository.createProject(owner, {
    clientId: client.id,
    name: 'Alternate Attachment Project',
    timezone: 'UTC',
    currency: 'EUR',
    billingModel: 'tm',
  });
  for (const projectId of [project.id, alternateProject.id]) {
    repository.assignWorker(owner, {
      projectId,
      workerId: 'manager',
      startsOn: '2020-01-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId,
      workerId: 'worker',
      startsOn: '2020-01-01',
    });
  }
  const manager = repository.principalFor('manager');
  const worker = repository.principalFor('worker');
  const outsider: Principal = { userId: 'outsider', role: 'worker', projectIds: new Set() };
  return {
    sqlite,
    repository,
    v3,
    owner,
    finance,
    manager,
    worker,
    auditor,
    outsider,
    projectId: project.id,
    alternateProjectId: alternateProject.id,
    clientId: client.id,
  };
}

function createDaily(
  value: AttachmentFixture,
  principal: Principal = value.worker,
  date = '2026-08-22',
) {
  return value.repository.createDailyReport(principal, {
    projectId: value.projectId,
    workDate: date,
    summary: 'Daily field report',
    tasksCompleted: 'Completed commissioning tasks',
    downtimeMinutes: 0,
    safetyRelated: false,
  });
}

function createTechnical(
  value: AttachmentFixture,
  principal: Principal = value.worker,
  projectId = value.projectId,
  date = '2026-08-22',
  systemName = 'PLC System A',
) {
  return value.repository.createTechnicalReport(principal, {
    projectId,
    reportDate: date,
    systemName,
    changeSummary: 'Technical change record',
    safetyRelated: false,
  });
}

function pdfHash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

const scannerPolicyCases = [
  {
    name: 'production URL without explicit flag',
    node: 'production',
    required: undefined,
    url: 'https://scanner.test/scan',
    expected: true,
  },
  {
    name: 'production explicit flag without URL',
    node: 'production',
    required: 'true',
    url: undefined,
    expected: true,
  },
  {
    name: 'production without scanner configuration',
    node: 'production',
    required: undefined,
    url: undefined,
    expected: false,
  },
  {
    name: 'production whitespace URL without explicit flag',
    node: 'production',
    required: undefined,
    url: '   ',
    expected: false,
  },
  {
    name: 'non-production URL and explicit flag',
    node: 'test',
    required: 'true',
    url: 'https://scanner.test/scan',
    expected: false,
  },
  {
    name: 'non-production explicit flag without URL',
    node: 'test',
    required: 'true',
    url: undefined,
    expected: false,
  },
] as const;

function configureScannerPolicy(testCase: (typeof scannerPolicyCases)[number]): void {
  process.env.NODE_ENV = testCase.node;
  delete process.env.JA_MALWARE_SCANNER_REQUIRED;
  delete process.env.JA_MALWARE_SCANNER_URL;
  if (testCase.required !== undefined) process.env.JA_MALWARE_SCANNER_REQUIRED = testCase.required;
  if (testCase.url !== undefined) process.env.JA_MALWARE_SCANNER_URL = testCase.url;
}

describe('CORE-07 report attachment repository service', () => {
  it('enforces report/date/project RBAC, links daily evidence, and protects finalized history', () => {
    const value = fixture();
    const report = createDaily(value);
    const documentsBeforeInvalidNames = (
      value.sqlite.prepare('SELECT count(*) count FROM document').get() as { count: number }
    ).count;
    for (const originalFilename of ['.', '..'])
      expect(() =>
        value.v3.reserveReportAttachment(value.worker, {
          reportType: 'daily',
          reportId: report.id,
          attachmentKind: 'daily_attachment',
          originalFilename,
        }),
      ).toThrow(V3ValidationError);
    expect(
      (value.sqlite.prepare('SELECT count(*) count FROM document').get() as { count: number })
        .count,
    ).toBe(documentsBeforeInvalidNames);
    expect(value.sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
      count: 0,
    });
    const workerReservation = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'daily',
      reportId: report.id,
      attachmentKind: 'daily_attachment',
      originalFilename: 'daily evidence.pdf',
    });
    expect(workerReservation).toMatchObject({
      reportType: 'daily',
      reportId: report.id,
      projectId: value.projectId,
      attachmentKind: 'daily_attachment',
      systemReferenceSnapshot: null,
    });

    expect(() =>
      value.v3.reserveReportAttachment(value.finance, {
        reportType: 'daily',
        reportId: report.id,
        attachmentKind: 'daily_attachment',
        originalFilename: 'finance-forbidden.pdf',
      }),
    ).toThrow(V3AccessDeniedError);
    expect(() =>
      value.v3.reserveReportAttachment(value.auditor, {
        reportType: 'daily',
        reportId: report.id,
        attachmentKind: 'daily_attachment',
        originalFilename: 'auditor-forbidden.pdf',
      }),
    ).toThrow(V3AccessDeniedError);
    expect(() =>
      value.v3.reserveReportAttachment(value.outsider, {
        reportType: 'daily',
        reportId: report.id,
        attachmentKind: 'daily_attachment',
        originalFilename: 'outsider-forbidden.pdf',
      }),
    ).toThrow(V3AccessDeniedError);

    const ownerReservation = value.v3.reserveReportAttachment(value.owner, {
      reportType: 'daily',
      reportId: report.id,
      attachmentKind: 'daily_attachment',
      originalFilename: 'owner-temporary.pdf',
    });
    expect(value.v3.cancelReportAttachment(value.owner, ownerReservation.reservationId)).toEqual(
      expect.objectContaining({ documentId: ownerReservation.reservationId, cancelled: true }),
    );

    expect(
      value.v3.finalizeReportAttachment(value.worker, workerReservation.reservationId, {
        sha256: pdfHash('a'),
        mediaType: 'application/pdf',
        byteLength: 128,
      }),
    ).toEqual({
      documentId: workerReservation.reservationId,
      state: 'committed',
      scanStatus: 'not_scanned',
    });
    expect(
      value.sqlite
        .prepare(
          "SELECT action,entity_type,entity_id FROM audit_event WHERE action='document.upload_finalized' AND entity_id=?",
        )
        .get(workerReservation.reservationId),
    ).toEqual({
      action: 'document.upload_finalized',
      entity_type: 'document',
      entity_id: workerReservation.reservationId,
    });
    expect(value.v3.listReportAttachments(value.worker, 'daily', report.id)).toEqual([
      expect.objectContaining({
        report_id: report.id,
        document_id: workerReservation.reservationId,
        attachment_kind: 'daily_attachment',
        state: 'committed',
        scan_status: 'not_scanned',
      }),
    ]);
    expect(
      value.v3.authorizeReportAttachment(
        value.worker,
        'daily',
        report.id,
        workerReservation.reservationId,
      ),
    ).toMatchObject({
      storageKey: workerReservation.storageKey,
      mediaType: 'application/pdf',
      attachmentKind: 'daily_attachment',
    });
    expect(
      value.v3.authorizeReportAttachment(
        value.finance,
        'daily',
        report.id,
        workerReservation.reservationId,
      ),
    ).toMatchObject({ attachmentKind: 'daily_attachment' });
    expect(
      value.v3.authorizeReportAttachment(
        value.auditor,
        'daily',
        report.id,
        workerReservation.reservationId,
      ),
    ).toMatchObject({ attachmentKind: 'daily_attachment' });

    value.repository.submitReport(value.worker, 'daily', report.id, 1);
    value.repository.reviewReport(value.manager, 'daily', report.id, 'approved');
    expect(() =>
      value.v3.reserveReportAttachment(value.worker, {
        reportType: 'daily',
        reportId: report.id,
        attachmentKind: 'daily_attachment',
        originalFilename: 'approved-forbidden.pdf',
      }),
    ).toThrow(V3ConflictError);

    const correction = value.repository.createCorrectionDraft(value.manager, {
      recordType: 'daily_report',
      originalId: report.id,
      requestId: 'daily-attachment-correction-1',
      reason: 'Add missing daily evidence',
      patch: { summary: 'Corrected daily field report' },
    });
    expect(
      value.v3.reserveReportAttachment(value.manager, {
        reportType: 'daily',
        reportId: correction.id,
        attachmentKind: 'daily_attachment',
        originalFilename: 'correction-evidence.pdf',
      }),
    ).toMatchObject({ reportId: correction.id, attachmentKind: 'daily_attachment' });

    value.sqlite
      .prepare(
        "UPDATE project_member SET ends_on='2026-08-21' WHERE project_id=? AND user_id='worker'",
      )
      .run(value.projectId);
    expect(() => value.v3.listReportAttachments(value.worker, 'daily', report.id)).toThrow(
      V3AccessDeniedError,
    );
    expect(value.v3.listReportAttachments(value.manager, 'daily', report.id)).toHaveLength(1);
  });

  it('derives technical system identity and maintains PLC before/after supersession lineage', () => {
    const value = fixture();
    const report = createTechnical(value);
    const before = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'technical',
      reportId: report.id,
      attachmentKind: 'plc_backup_before',
      originalFilename: 'plc-before-v1.zip',
    });
    expect(before.systemReferenceSnapshot).toBe('PLC System A');
    value.v3.finalizeReportAttachment(value.worker, before.reservationId, {
      sha256: pdfHash('b'),
      mediaType: 'application/zip',
      byteLength: 256,
    });
    const after = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'technical',
      reportId: report.id,
      attachmentKind: 'plc_backup_after',
      originalFilename: 'plc-after-v1.zip',
    });
    value.v3.finalizeReportAttachment(value.worker, after.reservationId, {
      sha256: pdfHash('c'),
      mediaType: 'application/zip',
      byteLength: 256,
    });
    const genericA = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'technical',
      reportId: report.id,
      attachmentKind: 'technical_attachment',
      originalFilename: 'technical-a.pdf',
    });
    value.v3.finalizeReportAttachment(value.worker, genericA.reservationId, {
      sha256: pdfHash('d'),
      mediaType: 'application/pdf',
      byteLength: 100,
    });
    const genericB = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'technical',
      reportId: report.id,
      attachmentKind: 'technical_attachment',
      originalFilename: 'technical-b.pdf',
    });
    value.v3.finalizeReportAttachment(value.worker, genericB.reservationId, {
      sha256: pdfHash('e'),
      mediaType: 'application/pdf',
      byteLength: 100,
    });

    const replacement = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'technical',
      reportId: report.id,
      attachmentKind: 'plc_backup_before',
      originalFilename: 'plc-before-v2.zip',
      supersedesDocumentId: before.reservationId,
    });
    expect(replacement.supersedesDocumentId).toBe(before.reservationId);
    value.v3.finalizeReportAttachment(value.worker, replacement.reservationId, {
      sha256: pdfHash('f'),
      mediaType: 'application/zip',
      byteLength: 512,
    });
    expect(() =>
      value.v3.reserveReportAttachment(value.worker, {
        reportType: 'technical',
        reportId: report.id,
        attachmentKind: 'plc_backup_before',
        originalFilename: 'plc-before-branch.zip',
        supersedesDocumentId: before.reservationId,
      }),
    ).toThrow(V3ConflictError);

    const beforeCount = (
      value.sqlite
        .prepare("SELECT count(*) count FROM document WHERE artifact_type='plc_backup'")
        .get() as { count: number }
    ).count;
    expect(() =>
      value.v3.reserveReportAttachment(value.worker, {
        reportType: 'technical',
        reportId: report.id,
        attachmentKind: 'plc_backup_before',
        originalFilename: 'plc-before-illegal-root.zip',
      }),
    ).toThrow();
    expect(
      (
        value.sqlite
          .prepare("SELECT count(*) count FROM document WHERE artifact_type='plc_backup'")
          .get() as { count: number }
      ).count,
    ).toBe(beforeCount);

    expect(value.v3.listReportAttachments(value.manager, 'technical', report.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: replacement.reservationId,
          supersedes_id: before.reservationId,
          system_reference_snapshot: 'PLC System A',
        }),
        expect.objectContaining({
          document_id: genericA.reservationId,
          attachment_kind: 'technical_attachment',
        }),
        expect.objectContaining({
          document_id: genericB.reservationId,
          attachment_kind: 'technical_attachment',
        }),
      ]),
    );
    expect(
      value.sqlite
        .prepare(
          "SELECT action,entity_type,entity_id FROM audit_event WHERE action IN('report.attachment_link','report.attachment_supersede') AND entity_id=? ORDER BY action",
        )
        .all(replacement.reservationId),
    ).toEqual([
      {
        action: 'report.attachment_link',
        entity_type: 'document',
        entity_id: replacement.reservationId,
      },
      {
        action: 'report.attachment_supersede',
        entity_type: 'document',
        entity_id: replacement.reservationId,
      },
    ]);

    const alternateReport = createTechnical(value, value.owner, value.alternateProjectId);
    expect(() =>
      value.v3.reserveReportAttachment(value.owner, {
        reportType: 'technical',
        reportId: alternateReport.id,
        attachmentKind: 'plc_backup_before',
        originalFilename: 'cross-project-forgery.zip',
        supersedesDocumentId: before.reservationId,
      }),
    ).toThrow(V3ConflictError);
  });

  it.each(scannerPolicyCases)(
    'uses the same fail-closed scanner policy for generic and report finalize/authorize: $name',
    (testCase) => {
      const value = fixture();
      const report = createDaily(value);
      configureScannerPolicy(testCase);

      const genericReservation = value.v3.reserveUpload(value.owner, {
        projectId: value.projectId,
        originalFilename: 'generic-scanner-policy.pdf',
        artifactType: 'report',
      });
      const reportReservation = value.v3.reserveReportAttachment(value.worker, {
        reportType: 'daily',
        reportId: report.id,
        attachmentKind: 'daily_attachment',
        originalFilename: 'report-scanner-policy.pdf',
      });

      expect(
        value.v3.finalizeUpload(value.owner, genericReservation.reservationId, {
          sha256: pdfHash('c'),
          mediaType: 'application/pdf',
          byteLength: 32,
        }),
      ).toEqual({ created: true });
      expect(
        value.v3.finalizeReportAttachment(value.worker, reportReservation.reservationId, {
          sha256: pdfHash('d'),
          mediaType: 'application/pdf',
          byteLength: 33,
        }),
      ).toEqual({
        documentId: reportReservation.reservationId,
        state: testCase.expected ? 'quarantined' : 'committed',
        scanStatus: testCase.expected ? 'pending' : 'not_scanned',
      });

      expect(
        value.sqlite
          .prepare('SELECT state,scan_status FROM document WHERE id=?')
          .get(genericReservation.reservationId),
      ).toEqual({
        state: testCase.expected ? 'quarantined' : 'committed',
        scan_status: testCase.expected ? 'pending' : 'not_scanned',
      });
      expect(
        value.sqlite.prepare("SELECT count(*) count FROM job WHERE kind='document_scan'").get(),
      ).toEqual({ count: testCase.expected ? 2 : 0 });

      if (testCase.expected) {
        expect(() =>
          value.v3.authorizeDocument(value.owner, genericReservation.reservationId),
        ).toThrow(/document not found/i);
        expect(() =>
          value.v3.authorizeReportAttachment(
            value.worker,
            'daily',
            report.id,
            reportReservation.reservationId,
          ),
        ).toThrow(/not ready/i);
      } else {
        expect(
          value.v3.authorizeDocument(value.owner, genericReservation.reservationId),
        ).toMatchObject({ storageKey: genericReservation.storageKey });
        expect(
          value.v3.authorizeReportAttachment(
            value.worker,
            'daily',
            report.id,
            reportReservation.reservationId,
          ),
        ).toMatchObject({ storageKey: reportReservation.storageKey });
      }
    },
  );

  it('keeps scanner-required attachments quarantined and allows safe rejection cancellation', () => {
    const value = fixture();
    const report = createDaily(value);
    process.env.NODE_ENV = 'production';
    process.env.JA_MALWARE_SCANNER_REQUIRED = 'true';
    process.env.JA_MALWARE_SCANNER_URL = 'https://scanner.test/scan';
    const reservation = value.v3.reserveReportAttachment(value.worker, {
      reportType: 'daily',
      reportId: report.id,
      attachmentKind: 'daily_attachment',
      originalFilename: 'scanner-required.pdf',
    });
    const auditCapable = value.v3 as unknown as {
      audit: (...args: unknown[]) => void;
    };
    const originalAudit = auditCapable.audit;
    auditCapable.audit = (...args: unknown[]) => {
      if (args[1] === 'document.upload_finalized')
        throw new Error('forced finalization audit failure');
      return originalAudit.apply(value.v3, args);
    };
    expect(() =>
      value.v3.finalizeReportAttachment(value.worker, reservation.reservationId, {
        sha256: pdfHash('7'),
        mediaType: 'application/pdf',
        byteLength: 80,
      }),
    ).toThrow('forced finalization audit failure');
    auditCapable.audit = originalAudit;
    expect(
      value.sqlite
        .prepare('SELECT state,scan_status FROM document WHERE id=?')
        .get(reservation.reservationId),
    ).toEqual({ state: 'temporary', scan_status: 'not_scanned' });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM report_document_link WHERE document_id=?')
        .get(reservation.reservationId),
    ).toEqual({ count: 1 });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM job WHERE idempotency_key=?')
        .get(`document-scan:${reservation.reservationId}`),
    ).toEqual({ count: 0 });
    expect(
      value.v3.finalizeReportAttachment(value.worker, reservation.reservationId, {
        sha256: pdfHash('8'),
        mediaType: 'application/pdf',
        byteLength: 80,
      }),
    ).toEqual({
      documentId: reservation.reservationId,
      state: 'quarantined',
      scanStatus: 'pending',
    });
    expect(() =>
      value.v3.authorizeReportAttachment(
        value.worker,
        'daily',
        report.id,
        reservation.reservationId,
      ),
    ).toThrow(/not ready/i);
    expect(value.v3.cancelReportAttachment(value.worker, reservation.reservationId)).toEqual(
      expect.objectContaining({ cancelled: true }),
    );
    expect(value.sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
      count: 0,
    });
    expect(
      value.sqlite.prepare('SELECT 1 FROM document WHERE id=?').get(reservation.reservationId),
    ).toBe(undefined);
  });
});
