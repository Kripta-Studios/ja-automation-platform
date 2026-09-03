import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { privateDocumentResponse } from '../../apps/portal/src/lib/server/private-artifact-access.js';
import { assertRegularPrivateFile } from '../../apps/portal/src/lib/server/report-attachment-route.js';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function pdfBytes(): Buffer {
  return Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n', 'ascii');
}

describe('generic private document download hardening', () => {
  it('rejects traversal and an external destination even when bytes match the metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-private-document-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-private-document-outside-'));
    roots.push(root, outside);
    const bytes = pdfBytes();
    writeFileSync(join(outside, 'same.pdf'), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');

    await expect(
      assertRegularPrivateFile(
        root,
        '../ja-private-document-outside-placeholder/same.pdf',
        hash,
        bytes.byteLength,
        'application/pdf',
      ),
    ).rejects.toThrow(/path|storage/i);
    await expect(
      assertRegularPrivateFile(
        root,
        join(outside, 'same.pdf'),
        hash,
        bytes.byteLength,
        'application/pdf',
      ),
    ).rejects.toThrow(/path|storage/i);
  });

  it('rejects a symlinked parent directory instead of following it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-private-document-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-private-document-outside-'));
    roots.push(root, outside);
    const bytes = pdfBytes();
    mkdirSync(join(outside, 'reports'), { recursive: true });
    writeFileSync(join(outside, 'reports', 'same.pdf'), bytes);
    try {
      symlinkSync(join(outside, 'reports'), join(root, 'reports'), 'junction');
    } catch {
      // Some Windows test runners do not grant junction/symlink privileges.
      return;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    await expect(
      assertRegularPrivateFile(root, 'reports/same.pdf', hash, bytes.byteLength, 'application/pdf'),
    ).rejects.toThrow(/path|storage|unavailable|integrity|symlink|directory/i);
  });

  it('routes the legacy download through the descriptor-safe reader and shared private headers', () => {
    for (const path of [
      'apps/portal/src/routes/app/documents/[id]/+server.ts',
      'apps/portal/src/routes/app/api/documents/[id]/+server.ts',
    ]) {
      const route = readFileSync(path, 'utf8');
      expect(route).toContain('assertRegularPrivateFile');
      expect(route).toContain('privateDocumentResponse');
      expect(route).toContain("url.searchParams.get('view') === '1' ? 'inline' : 'attachment'");
      expect(route.indexOf('assertRegularPrivateFile')).toBeLessThan(
        route.indexOf('recordDocumentDownload'),
      );
      expect(route).not.toMatch(/\breadFile\s*\(/u);
    }
  });

  it('defaults generic document responses to attachment and permits explicit inline view', () => {
    const metadata = { mediaType: 'application/pdf', filename: 'private.pdf', sensitive: true };
    expect(
      privateDocumentResponse(pdfBytes(), metadata).headers.get('content-disposition'),
    ).toMatch(/^attachment;/u);
    expect(
      privateDocumentResponse(pdfBytes(), metadata, 'inline').headers.get('content-disposition'),
    ).toMatch(/^inline;/u);
  });

  it('records report attachment download only after descriptor-safe verification', () => {
    const route = readFileSync(
      'apps/portal/src/routes/app/api/reports/[id]/attachments/[documentId]/+server.ts',
      'utf8',
    );
    expect(route.indexOf('assertRegularPrivateFile')).toBeLessThan(
      route.indexOf('recordReportAttachmentDownload'),
    );
  });
});
