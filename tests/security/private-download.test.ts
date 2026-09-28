import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Principal } from '@ja/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const roots: string[] = [];
const openPortalRepository = vi.fn();

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../apps/portal/src/lib/server/portal-repository.js')
  >()),
  openPortalRepository,
}));

const { documentActions } =
  await import('../../apps/portal/src/lib/server/actions/document-actions.ts');

const { GET: genericDocumentGet } =
  await import('../../apps/portal/src/routes/app/api/documents/[id]/+server.ts');
const { GET: compatibilityDocumentGet } =
  await import('../../apps/portal/src/routes/app/documents/[id]/+server.ts');
const { GET: reportAttachmentGet } =
  await import('../../apps/portal/src/routes/app/api/reports/[id]/attachments/[documentId]/+server.ts');

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  delete process.env.JA_DOCUMENT_ROOT;
  vi.clearAllMocks();
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function downloadContext(value: B5LifecycleSecurityFixture, principal: Principal) {
  return {
    sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
    v3: value.v3,
    principal,
  };
}

describe('B5 private download boundary', () => {
  it.each([
    ['API', genericDocumentGet, '/app/api/documents/private-id'],
    ['compatibility', compatibilityDocumentGet, '/app/documents/private-id'],
  ] as const)(
    '%s route logs unexpected failures without disclosing details',
    async (_name, get, url) => {
      openPortalRepository.mockImplementation(() => {
        throw new Error('internal storage detail');
      });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await get({
          locals: {
            user: { id: 'test-user' },
            session: { id: 'test-session' },
            correlationId: 'document-failure-reference',
          },
          params: { id: 'private-id' },
          url: new URL(`http://localhost${url}`),
        } as never);
        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body).toMatchObject({
          error: 'Document is unavailable',
          code: 'DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE',
          messageKey: 'problem.document.downloadServiceUnavailable',
          params: { correlationId: 'document-failure-reference' },
          fieldErrors: {},
          remedies: [{ id: 'retry_download' }],
          correlationId: 'document-failure-reference',
        });
        expect(JSON.stringify(body)).not.toContain('internal storage detail');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(log).toHaveBeenCalledWith(
          'Unexpected private document download failure',
          expect.objectContaining({ correlationId: 'document-failure-reference' }),
        );
      } finally {
        log.mockRestore();
      }
    },
  );

  it.each([
    ['API', genericDocumentGet, '/app/api/documents/'],
    ['compatibility', compatibilityDocumentGet, '/app/documents/'],
  ] as const)(
    '%s route rejects a revoked but present session before revealing a valid document',
    async (_name, get, prefix) => {
      const value = fixture();
      const liveOwner = stepUpB5Principal(value.sqlite, value.owner, 'revoked-document');
      const root = mkdtempSync(join(tmpdir(), 'ja-revoked-document-'));
      roots.push(root);
      process.env.JA_DOCUMENT_ROOT = root;
      mkdirSync(join(root, 'reports'), { recursive: true });
      const bytes = Buffer.from('%PDF-1.7\nprivate\n%%EOF\n', 'ascii');
      writeFileSync(join(root, 'reports', 'private.pdf'), bytes);
      const document = value.repository.registerPrivateDocument(value.owner, {
        projectId: value.project.id,
        sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
        mediaType: 'application/pdf',
        byteLength: bytes.byteLength,
        storageKey: 'reports/private.pdf',
        originalFilename: 'private.pdf',
        artifactType: 'report',
        artifactClassification: 'standard',
        sensitivity: 'customer_private',
      });
      openPortalRepository.mockReturnValue(downloadContext(value, liveOwner));
      value.sqlite.prepare('DELETE FROM session WHERE id=?').run(liveOwner.sessionId);
      const authorize = vi.spyOn(value.v3, 'authorizeDocument');
      const audit = vi.spyOn(value.v3, 'recordDocumentDownload');
      try {
        const response = await get({
          locals: {
            user: { id: liveOwner.userId },
            session: { id: liveOwner.sessionId },
            correlationId: 'revoked-document-reference',
          },
          params: { id: document.id },
          url: new URL(`http://localhost${prefix}${document.id}`),
        } as never);
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({
          error: 'Unauthorized',
          code: 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED',
          messageKey: 'problem.document.downloadSignInRequired',
          remedies: [{ id: 'sign_in_again' }],
          correlationId: 'revoked-document-reference',
        });
        expect(authorize).not.toHaveBeenCalled();
        expect(audit).not.toHaveBeenCalled();
        expect(
          value.sqlite
            .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
            .get(),
        ).toEqual({ count: 0 });
      } finally {
        authorize.mockRestore();
        audit.mockRestore();
      }
    },
  );

  it.each([
    ['API', genericDocumentGet, '/app/api/documents/'],
    ['compatibility', compatibilityDocumentGet, '/app/documents/'],
  ] as const)(
    '%s route returns the same typed 404 for unknown, forbidden, and scan-pending documents',
    async (_name, get, prefix) => {
      const value = fixture();
      const liveOwner = stepUpB5Principal(value.sqlite, value.owner, 'document-404-owner');
      const liveOutsider = stepUpB5Principal(value.sqlite, value.outsider, 'document-404-outsider');
      const document = value.repository.registerPrivateDocument(value.owner, {
        projectId: value.project.id,
        sha256: 'a'.repeat(64),
        mediaType: 'application/pdf',
        byteLength: 5,
        storageKey: 'reports/role-restricted.pdf',
        originalFilename: 'role-restricted.pdf',
        artifactType: 'report',
        artifactClassification: 'standard',
        sensitivity: 'customer_private',
      });
      const request = (id: string, principal: typeof value.owner | typeof value.outsider) => ({
        locals: {
          user: { id: principal.userId },
          session: { id: 'test-session' },
          correlationId: 'document-download-test',
        },
        params: { id },
        url: new URL(`http://localhost${prefix}${id}`),
      });
      openPortalRepository.mockImplementation(() => downloadContext(value, liveOutsider));
      const forbidden = await get(request(document.id, value.outsider) as never);
      const unknown = await get(request('unknown-document', value.outsider) as never);
      expect(forbidden.status).toBe(404);
      expect(await forbidden.json()).toEqual(await unknown.json());

      value.sqlite.prepare("UPDATE document SET scan_status='pending' WHERE id=?").run(document.id);
      openPortalRepository.mockImplementation(() => downloadContext(value, liveOwner));
      const pending = await get(request(document.id, value.owner) as never);
      const hidden = await get(request('unknown-document', value.owner) as never);
      expect(pending.status).toBe(404);
      expect(await pending.json()).toEqual(await hidden.json());
      expect(pending.headers.get('cache-control')).toBe('private, no-store');
      expect(pending.headers.get('x-content-type-options')).toBe('nosniff');

      const signedOut = await get({
        ...request(document.id, value.owner),
        locals: { correlationId: 'document-download-test' },
      } as never);
      expect(signedOut.status).toBe(401);
      expect(await signedOut.json()).toMatchObject({
        error: 'Unauthorized',
        code: 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED',
        messageKey: 'problem.document.downloadSignInRequired',
        params: {},
        fieldErrors: {},
        remedies: [{ id: 'sign_in_again' }],
        correlationId: 'document-download-test',
      });
      expect(openPortalRepository).toHaveBeenCalledTimes(4);
    },
  );

  it.each([
    ['API', genericDocumentGet, '/app/api/documents/'],
    ['compatibility', compatibilityDocumentGet, '/app/documents/'],
  ] as const)(
    '%s route distinguishes authorized missing/integrity failures and keeps successful file headers',
    async (_name, get, prefix) => {
      const value = fixture();
      const liveOwner = stepUpB5Principal(value.sqlite, value.owner, 'document-contract');
      const root = mkdtempSync(join(tmpdir(), 'ja-document-contract-'));
      roots.push(root);
      process.env.JA_DOCUMENT_ROOT = root;
      mkdirSync(join(root, 'reports'), { recursive: true });
      const bytes = Buffer.from('%PDF-1.7\nverified\n%%EOF\n', 'ascii');
      const file = join(root, 'reports', 'verified.pdf');
      const document = value.repository.registerPrivateDocument(value.owner, {
        projectId: value.project.id,
        sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
        mediaType: 'application/pdf',
        byteLength: bytes.byteLength,
        storageKey: 'reports/verified.pdf',
        originalFilename: 'verified.pdf',
        artifactType: 'report',
        artifactClassification: 'standard',
        sensitivity: 'customer_private',
      });
      openPortalRepository.mockReturnValue(downloadContext(value, liveOwner));
      const request = () => ({
        locals: {
          user: { id: value.owner.userId },
          session: { id: 'test-session' },
          correlationId: 'verified-reference',
        },
        params: { id: document.id },
        url: new URL(`http://localhost${prefix}${document.id}`),
      });
      const missing = await get(request() as never);
      expect(missing.status).toBe(409);
      expect(await missing.json()).toMatchObject({
        error: 'Document is unavailable',
        code: 'DOCUMENT_DOWNLOAD_FILE_MISSING',
        messageKey: 'problem.document.downloadFileMissing',
        remedies: [{ id: 'review_documents' }],
        correlationId: 'verified-reference',
      });
      writeFileSync(file, Buffer.from('%PDF-1.7\nchanged\n%%EOF\n', 'ascii'));
      const integrity = await get(request() as never);
      expect(integrity.status).toBe(409);
      expect(await integrity.json()).toMatchObject({
        error: 'Document is unavailable',
        code: 'DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED',
        messageKey: 'problem.document.downloadIntegrityBlocked',
        remedies: [{ id: 'review_documents' }],
      });
      expect(
        value.sqlite
          .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
          .get(),
      ).toEqual({ count: 0 });
      writeFileSync(file, bytes);
      const expiredAudit = vi
        .spyOn(value.v3, 'recordDocumentDownload')
        .mockImplementationOnce(() => {
          throw new AccessDeniedError('Live authenticated session required');
        });
      try {
        const expired = await get(request() as never);
        expect(expired.status).toBe(401);
        expect(await expired.json()).toMatchObject({
          error: 'Unauthorized',
          code: 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED',
          messageKey: 'problem.document.downloadSignInRequired',
          remedies: [{ id: 'sign_in_again' }],
        });
        expect(expiredAudit).toHaveBeenCalledOnce();
      } finally {
        expiredAudit.mockRestore();
      }
      const auditFailure = vi
        .spyOn(value.v3, 'recordDocumentDownload')
        .mockImplementationOnce(() => {
          throw new V3ConflictError('internal audit conflict');
        });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const blocked = await get(request() as never);
        expect(blocked.status).toBe(503);
        const body = await blocked.json();
        expect(body).toMatchObject({
          error: 'Document is unavailable',
          code: 'DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE',
          messageKey: 'problem.document.downloadServiceUnavailable',
          params: { correlationId: 'verified-reference' },
          remedies: [{ id: 'retry_download' }],
          correlationId: 'verified-reference',
        });
        expect(JSON.stringify(body)).not.toContain('internal audit conflict');
        expect(auditFailure).toHaveBeenCalledOnce();
        expect(log).toHaveBeenCalledWith(
          'Unexpected private document download failure',
          expect.objectContaining({ correlationId: 'verified-reference' }),
        );
      } finally {
        auditFailure.mockRestore();
        log.mockRestore();
      }
      expect(
        value.sqlite
          .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
          .get(),
      ).toEqual({ count: 0 });
      const success = await get(request() as never);
      expect(success.status).toBe(200);
      expect(success.headers.get('content-type')).toBe('application/pdf');
      expect(success.headers.get('content-disposition')).toMatch(/^attachment;/u);
      expect(success.headers.get('cache-control')).toBe('private, no-store');
      expect(Buffer.from(await success.arrayBuffer())).toEqual(bytes);
      expect(
        value.sqlite
          .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
          .get(),
      ).toEqual({ count: 1 });
    },
  );

  it.each(['owner', 'finance', 'manager', 'worker'] as const)(
    'validates finance classification through the real upload action for %s',
    async (role) => {
      const value = fixture();
      const root = mkdtempSync(join(tmpdir(), 'ja-classified-upload-'));
      roots.push(root);
      process.env.JA_DOCUMENT_ROOT = root;
      openPortalRepository.mockReturnValue({
        v3: value.v3,
        principal: value[role],
        sqlite: { close: vi.fn() },
      });
      const form = new FormData();
      form.set('projectId', value.project.id);
      form.set('artifactType', 'payroll');
      form.set('description', 'Finance private evidence');
      form.set('artifactClassification', 'finance');
      form.set(
        'file',
        new File(['%PDF-1.7\nfinance evidence\n%%EOF\n'], 'payroll.pdf', {
          type: 'application/pdf',
        }),
      );
      const result = await documentActions.uploadPrivateDocument({
        locals: {},
        params: { section: 'documents' },
        request: new Request('http://localhost/app/documents', { method: 'POST', body: form }),
      } as never);
      const row = value.sqlite
        .prepare(
          "SELECT id,artifact_classification,state FROM document WHERE description='Finance private evidence'",
        )
        .get() as { id: string; artifact_classification: string; state: string } | undefined;
      if (role === 'manager' || role === 'worker') {
        expect(result).toMatchObject({ status: 403 });
        expect(row).toBeUndefined();
      } else {
        expect(result).toMatchObject({ success: true });
        expect(row).toMatchObject({ artifact_classification: 'finance', state: 'committed' });
        for (const principal of [value.manager, value.worker]) {
          expect(() => value.v3.authorizeDocument(principal, row!.id)).toThrow();
          expect(value.repository.listDocuments(principal)).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: row!.id })]),
          );
        }
      }
    },
  );

  it('keeps repository object-scope authorization non-disclosing', () => {
    const value = fixture();
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: 'd'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/b5-private.pdf',
      originalFilename: 'b5-private.pdf',
      artifactType: 'report',
      artifactClassification: 'standard',
      sensitivity: 'customer_private',
    });
    expect(() => value.v3.authorizeDocument(value.outsider, document.id)).toThrow();
  });

  it('keeps finance-classified files out of operational listings and generic downloads', async () => {
    const value = fixture();
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: 'f'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/private-finance.pdf',
      originalFilename: 'private-finance.pdf',
      artifactType: 'payroll',
      artifactClassification: 'finance',
      sensitivity: 'sensitive',
    });
    for (const principal of [value.manager, value.worker]) {
      expect(value.repository.listDocuments(principal)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: document.id })]),
      );
      expect(value.repository.listDocuments(principal, value.project.id)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: document.id })]),
      );
      expect(() => value.v3.authorizeDocument(principal, document.id)).toThrow();
      openPortalRepository.mockReturnValue(
        downloadContext(
          value,
          stepUpB5Principal(value.sqlite, principal, `finance-classified-${principal.userId}`),
        ),
      );
      const request = {
        locals: { user: { id: principal.userId }, session: { id: 'test-session' } },
        params: { id: document.id },
        url: new URL(`http://localhost/app/api/documents/${document.id}`),
      };
      expect((await genericDocumentGet(request as never)).status).toBe(404);
    }
    for (const principal of [value.owner, value.finance]) {
      expect(value.repository.listDocuments(principal)).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: document.id })]),
      );
      expect(value.v3.authorizeDocument(principal, document.id).filename).toBe(
        'private-finance.pdf',
      );
    }
  });

  it('records a document download only after the caller reports verified bytes', () => {
    const value = fixture();
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: 'e'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/b5-audit-order.pdf',
      originalFilename: 'b5-audit-order.pdf',
      artifactType: 'report',
      artifactClassification: 'standard',
      sensitivity: 'customer_private',
    });
    value.v3.authorizeDocument(value.owner, document.id);
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 0 });
    value.v3.recordDocumentDownload(value.owner, document.id);
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 1 });
  });

  it('returns conflict for a symlinked generic document and records no successful download audit', async () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-generic-document-route-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-generic-document-outside-'));
    roots.push(root, outside);
    process.env.JA_DOCUMENT_ROOT = root;
    const bytes = Buffer.from('%PDF-1.7\nroute\n%%EOF\n', 'ascii');
    writeFileSync(join(outside, 'private.pdf'), bytes);
    try {
      symlinkSync(outside, join(root, 'reports'), 'junction');
    } catch {
      return;
    }
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/pdf',
      byteLength: bytes.byteLength,
      storageKey: 'reports/private.pdf',
      originalFilename: 'private.pdf',
      artifactType: 'report',
      artifactClassification: 'standard',
      sensitivity: 'customer_private',
    });
    openPortalRepository.mockReturnValue(
      downloadContext(value, stepUpB5Principal(value.sqlite, value.owner, 'symlink-download')),
    );

    const response = await genericDocumentGet({
      locals: { user: { id: value.owner.userId }, session: { id: 'owner-session' } },
      params: { id: document.id },
      url: new URL(`http://localhost/app/api/documents/${document.id}`),
    } as never);

    expect(response.status).toBe(409);
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('returns conflict for a symlinked report attachment and records no successful download audit', async () => {
    const value = fixture();
    const report = value.repository.createDailyReport(value.owner, {
      projectId: value.project.id,
      workDate: '2026-09-04',
      summary: 'Attachment integrity route fixture',
      tasksCompleted: 'Prepared evidence',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const bytes = Buffer.from('%PDF-1.7\nreport attachment\n%%EOF\n', 'ascii');
    const attachment = value.v3.reserveReportAttachment(value.owner, {
      reportType: 'daily',
      reportId: report.id,
      attachmentKind: 'daily_attachment',
      originalFilename: 'private.pdf',
    });
    value.v3.finalizeReportAttachment(value.owner, attachment.reservationId, {
      sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/pdf',
      byteLength: bytes.byteLength,
    });
    const root = mkdtempSync(join(tmpdir(), 'ja-report-attachment-route-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-report-attachment-outside-'));
    roots.push(root, outside);
    process.env.JA_DOCUMENT_ROOT = root;
    const keySegments = attachment.storageKey.split('/');
    const outsideTarget = join(outside, ...keySegments.slice(1));
    mkdirSync(join(outside, ...keySegments.slice(1, -1)), { recursive: true });
    writeFileSync(outsideTarget, bytes);
    try {
      symlinkSync(outside, join(root, keySegments[0]!), 'junction');
    } catch {
      return;
    }
    const principal = stepUpB5Principal(value.sqlite, value.owner, 'symlink-download');
    openPortalRepository.mockReturnValue({
      sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
      v3: value.v3,
      principal,
    });

    const response = await reportAttachmentGet({
      locals: { user: { id: value.owner.userId }, session: { id: principal.sessionId } },
      params: { id: report.id, documentId: attachment.reservationId },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'REPORT_ATTACHMENT_DOWNLOAD_UNAVAILABLE',
      messageKey: 'problem.reportAttachment.downloadUnavailable',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'contact_report_owner' }],
      correlationId: expect.any(String),
      error: 'Report attachment is unavailable',
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('still serves verified PDF bytes and records one successful attachment download', async () => {
    const value = fixture();
    const report = value.repository.createDailyReport(value.owner, {
      projectId: value.project.id,
      workDate: '2026-09-04',
      summary: 'Verified download fixture',
      tasksCompleted: 'Prepared evidence',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const bytes = Buffer.from('%PDF-1.7\nverified attachment\n%%EOF\n', 'ascii');
    const attachment = value.v3.reserveReportAttachment(value.owner, {
      reportType: 'daily',
      reportId: report.id,
      attachmentKind: 'daily_attachment',
      originalFilename: 'verified.pdf',
    });
    value.v3.finalizeReportAttachment(value.owner, attachment.reservationId, {
      sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/pdf',
      byteLength: bytes.byteLength,
    });
    const root = mkdtempSync(join(tmpdir(), 'ja-report-attachment-verified-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const path = attachment.storageKey.split('/');
    mkdirSync(join(root, ...path.slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...path), bytes);
    const principal = stepUpB5Principal(value.sqlite, value.owner, 'verified-download');
    openPortalRepository.mockReturnValue({
      sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
      v3: value.v3,
      principal,
    });

    const response = await reportAttachmentGet({
      locals: { user: { id: value.owner.userId }, session: { id: principal.sessionId } },
      params: { id: report.id, documentId: attachment.reservationId },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('verified.pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 1 });
  });

  it('returns an uncertain service failure when the mandatory audit fails after file verification', async () => {
    const value = fixture();
    const report = value.repository.createDailyReport(value.owner, {
      projectId: value.project.id,
      workDate: '2026-09-04',
      summary: 'Audit failure download fixture',
      tasksCompleted: 'Prepared evidence',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const bytes = Buffer.from('%PDF-1.7\nverified before audit\n%%EOF\n', 'ascii');
    const attachment = value.v3.reserveReportAttachment(value.owner, {
      reportType: 'daily',
      reportId: report.id,
      attachmentKind: 'daily_attachment',
      originalFilename: 'verified.pdf',
    });
    value.v3.finalizeReportAttachment(value.owner, attachment.reservationId, {
      sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/pdf',
      byteLength: bytes.byteLength,
    });
    const root = mkdtempSync(join(tmpdir(), 'ja-report-attachment-audit-failure-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const path = attachment.storageKey.split('/');
    mkdirSync(join(root, ...path.slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...path), bytes);
    const principal = stepUpB5Principal(value.sqlite, value.owner, 'audit-failure-download');
    const auditFailure = new V3ConflictError('private audit state detail');
    const recordReportAttachmentDownload = vi.fn(() => {
      throw auditFailure;
    });
    openPortalRepository.mockReturnValue({
      sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
      v3: {
        authorizeReportAttachment: value.v3.authorizeReportAttachment.bind(value.v3),
        recordReportAttachmentDownload,
      },
      principal,
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await reportAttachmentGet({
        locals: {
          user: { id: value.owner.userId },
          session: { id: principal.sessionId },
          correlationId: 'audit-download-ref',
        },
        params: { id: report.id, documentId: attachment.reservationId },
      } as never);

      expect(recordReportAttachmentDownload).toHaveBeenCalledOnce();
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body).toMatchObject({
        code: 'REPORT_ATTACHMENT_DOWNLOAD_UNEXPECTED',
        messageKey: 'problem.reportAttachment.downloadUnexpected',
        params: { correlationId: 'audit-download-ref' },
        remedies: [{ id: 'review_report' }],
        correlationId: 'audit-download-ref',
      });
      expect(JSON.stringify(body)).not.toContain(auditFailure.message);
      expect(log).toHaveBeenCalledWith('Report attachment download audit failed', {
        correlationId: 'audit-download-ref',
        error: auditFailure,
      });
      expect(
        value.sqlite
          .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      log.mockRestore();
    }
  });

  it('returns a typed private 401 without opening the repository', async () => {
    const response = await reportAttachmentGet({
      locals: { correlationId: 'download-session-ref' },
      params: { id: 'report', documentId: 'attachment' },
    } as never);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'REPORT_ATTACHMENT_SIGN_IN_REQUIRED',
      messageKey: 'problem.reportAttachment.signInRequired',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'sign_in_again' }],
      correlationId: 'download-session-ref',
      error: 'Unauthorized',
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('rejects a revoked database session before report lookup or file access', async () => {
    const value = fixture();
    const report = value.repository.createDailyReport(value.owner, {
      projectId: value.project.id,
      workDate: '2026-09-04',
      summary: 'Revoked session download fixture',
      tasksCompleted: 'Prepared report',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const principal = stepUpB5Principal(value.sqlite, value.owner, 'revoked-download');
    value.sqlite.prepare('DELETE FROM session WHERE id=?').run(principal.sessionId);
    const authorizeReportAttachment = vi.fn();
    openPortalRepository.mockReturnValue({
      sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
      v3: { authorizeReportAttachment },
      principal,
    });

    const response = await reportAttachmentGet({
      locals: {
        user: { id: value.owner.userId },
        session: { id: principal.sessionId },
        correlationId: 'revoked-download-ref',
      },
      params: { id: report.id, documentId: 'attachment-id' },
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'REPORT_ATTACHMENT_SIGN_IN_REQUIRED',
      messageKey: 'problem.reportAttachment.signInRequired',
      remedies: [{ id: 'sign_in_again' }],
      correlationId: 'revoked-download-ref',
      error: 'Unauthorized',
    });
    expect(authorizeReportAttachment).not.toHaveBeenCalled();
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('gives missing and inaccessible report attachments the same role-safe 404', async () => {
    const value = fixture();
    const report = value.repository.createDailyReport(value.owner, {
      projectId: value.project.id,
      workDate: '2026-09-04',
      summary: 'Role-safe download fixture',
      tasksCompleted: 'Prepared report',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const principal = stepUpB5Principal(value.sqlite, value.owner, 'role-safe-download');
    const responses = [];
    for (const cause of [
      new V3NotFoundError('private missing report detail'),
      new V3AccessDeniedError('private project membership detail'),
    ]) {
      openPortalRepository.mockReturnValue({
        sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
        v3: {
          authorizeReportAttachment: () => {
            throw cause;
          },
        },
        principal,
      });
      const response = await reportAttachmentGet({
        locals: {
          user: { id: value.owner.userId },
          session: { id: principal.sessionId },
          correlationId: 'same-download-ref',
        },
        params: { id: report.id, documentId: 'unknown-attachment' },
      } as never);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      responses.push(await response.json());
    }

    expect(responses[0]).toEqual(responses[1]);
    expect(responses[0]).toMatchObject({
      success: false,
      code: 'REPORT_ATTACHMENT_DOWNLOAD_NOT_FOUND',
      messageKey: 'problem.reportAttachment.downloadNotFound',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'review_report' }],
      correlationId: 'same-download-ref',
      error: 'Report attachment not found',
    });
    expect(JSON.stringify(responses[0])).not.toMatch(/membership|private|unknown-attachment/i);
  });

  it.each([
    [
      new V3ValidationError('Report attachment is not ready'),
      'REPORT_ATTACHMENT_DOWNLOAD_NOT_READY',
      'problem.reportAttachment.downloadNotReady',
      'review_attachments',
    ],
    [
      new V3ConflictError('Report attachment integrity metadata is invalid'),
      'REPORT_ATTACHMENT_DOWNLOAD_UNAVAILABLE',
      'problem.reportAttachment.downloadUnavailable',
      'contact_report_owner',
    ],
  ] as const)(
    'explains a blocked download without exposing technical detail: %s',
    async (cause, code, messageKey, remedy) => {
      const value = fixture();
      const report = value.repository.createDailyReport(value.owner, {
        projectId: value.project.id,
        workDate: '2026-09-04',
        summary: 'Blocked download fixture',
        tasksCompleted: 'Prepared report',
        downtimeMinutes: 0,
        safetyRelated: false,
      });
      const principal = stepUpB5Principal(value.sqlite, value.owner, 'blocked-download');
      openPortalRepository.mockReturnValue({
        sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
        v3: {
          authorizeReportAttachment: () => {
            throw cause;
          },
        },
        principal,
      });
      const response = await reportAttachmentGet({
        locals: { user: { id: value.owner.userId }, session: { id: principal.sessionId } },
        params: { id: report.id, documentId: 'attachment' },
      } as never);

      expect(response.status).toBe(409);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body).toMatchObject({
        success: false,
        code,
        messageKey,
        params: {},
        fieldErrors: {},
        remedies: [{ id: remedy }],
        correlationId: expect.any(String),
        error:
          code === 'REPORT_ATTACHMENT_DOWNLOAD_NOT_READY'
            ? 'Report attachment is not ready'
            : 'Report attachment is unavailable',
      });
      if (code === 'REPORT_ATTACHMENT_DOWNLOAD_UNAVAILABLE')
        expect(JSON.stringify(body)).not.toContain(cause.message);
    },
  );

  it('logs an unexpected startup failure with the reference while hiding its detail', async () => {
    openPortalRepository.mockImplementation(() => {
      throw new Error('private database path');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await reportAttachmentGet({
        locals: {
          user: { id: 'owner' },
          session: { id: 'session' },
          correlationId: 'download-startup-ref',
        },
        params: { id: 'report', documentId: 'attachment' },
      } as never);
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(body).toMatchObject({
        success: false,
        code: 'REPORT_ATTACHMENT_DOWNLOAD_UNEXPECTED',
        messageKey: 'problem.reportAttachment.downloadUnexpected',
        params: { correlationId: 'download-startup-ref' },
        remedies: [{ id: 'review_report' }],
        correlationId: 'download-startup-ref',
      });
      expect(JSON.stringify(body)).not.toContain('private database path');
      expect(log).toHaveBeenCalledWith('Unexpected report attachment download failure', {
        correlationId: 'download-startup-ref',
        error: expect.any(Error),
      });
    } finally {
      log.mockRestore();
    }
  });

  it('provides the one server-owned private document download route', () => {
    expect(
      existsSync(
        resolve(process.cwd(), 'apps/portal/src/routes/app/api/documents/[id]/+server.ts'),
      ),
    ).toBe(true);
  });

  it('keeps generated root documents ignored without excluding source download routes', () => {
    const ignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8');
    expect(ignore).toContain('/documents/');
    expect(ignore).not.toMatch(/^documents\/$/mu);
  });
});
