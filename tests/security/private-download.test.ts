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
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
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

const { GET: genericDocumentGet } =
  await import('../../apps/portal/src/routes/app/api/documents/[id]/+server.ts');
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

describe('B5 private download boundary', () => {
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
    openPortalRepository.mockReturnValue({
      sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
      v3: value.v3,
      principal: value.owner,
    });

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
    openPortalRepository.mockReturnValue({
      sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
      v3: value.v3,
      principal: value.owner,
    });

    const response = await reportAttachmentGet({
      locals: { user: { id: value.owner.userId }, session: { id: 'owner-session' } },
      params: { id: report.id, documentId: attachment.reservationId },
    } as never);

    expect(response.status).toBe(409);
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='document.download'")
        .get(),
    ).toEqual({ count: 0 });
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
