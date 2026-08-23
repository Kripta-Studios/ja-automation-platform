import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseReportAttachmentMetadata,
  validateReportAttachmentFile,
} from '../../apps/portal/src/lib/server/report-attachment-route.js';

const source = (path: string): string => readFileSync(resolve(path), 'utf8');

describe('CORE-07 report attachment route boundary', () => {
  it('keeps the multipart field allowlist and reserves before reading file bytes', () => {
    const route = source('apps/portal/src/routes/app/api/reports/[id]/attachments/+server.ts');
    expect(route).toContain('parseReportAttachmentMetadata(form)');
    expect(route).toContain('reserveReportAttachment');
    expect(route.indexOf('reserveReportAttachment')).toBeLessThan(
      route.indexOf('validateReportAttachmentFile(file)'),
    );
    expect(route).toContain('finalizeReportAttachment');
    expect(route).toContain('cancelReportAttachment');
    expect(route).toContain('writePrivateFileExclusive');
    expect(route).toContain('removePrivateFileIfPresent');
    expect(route).not.toContain("form.get('projectId')");
    expect(route).not.toContain("form.get('systemName')");
  });

  it('rejects unknown fields, forged report type, unsafe names, and signature mismatches', async () => {
    const form = new FormData();
    form.set('attachmentKind', 'daily_attachment');
    form.set('version', '1');
    form.set('reportType', 'technical');
    expect(() => parseReportAttachmentMetadata(form)).toThrow(/unknown report attachment field/i);

    const validPdf = new File([Buffer.from('%PDF-1.7\n', 'ascii')], 'evidence.pdf', {
      type: 'application/pdf',
    });
    await expect(validateReportAttachmentFile(validPdf)).resolves.toHaveLength(validPdf.size);
    await expect(
      validateReportAttachmentFile(
        new File([Buffer.from('%PDF-1.7\n', 'ascii')], '../escape.pdf', {
          type: 'application/pdf',
        }),
      ),
    ).rejects.toThrow(/filename/i);
    await expect(
      validateReportAttachmentFile(
        new File([Buffer.from('not a pdf', 'utf8')], 'evidence.pdf', {
          type: 'application/pdf',
        }),
      ),
    ).rejects.toThrow(/content/i);
  });

  it('re-authorizes downloads and hardens the private response', () => {
    const route = source(
      'apps/portal/src/routes/app/api/reports/[id]/attachments/[documentId]/+server.ts',
    );
    expect(route).toContain('authorizeReportAttachment');
    expect(route).toContain('assertRegularPrivateFile');
    expect(route).toContain("'cache-control': 'private, no-store'");
    expect(route).toContain("'content-disposition': contentDispositionFilename");
    expect(route).toContain("'x-content-type-options': 'nosniff'");
    expect(route).toContain('reportAttachmentTypeForId');
  });

  it('keeps cancellation scoped to the v3-returned storage key', () => {
    const route = source(
      'apps/portal/src/routes/app/api/reports/[id]/attachments/[documentId]/cancel/+server.ts',
    );
    expect(route).toContain('cancelReportAttachment');
    expect(route).toContain('cancelled.storageKey');
    expect(route).toContain('removePrivateFileIfPresent');
    expect(route).toContain('reportAttachmentTypeForId');
    expect(route).toContain('report_type=? AND report_id=? AND document_id=?');
  });
});

describe('CORE-07 report detail attachment UX', () => {
  it('renders both report kinds, readable metadata, and correction guidance', () => {
    const page = source('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    for (const marker of [
      'Report attachments',
      'Evidence type',
      'Uploader',
      'SHA-256',
      'Version',
      'Predecessor',
      'Download unavailable until this file is clean and ready.',
      'approved or finalized',
      'plc_backup_before',
      'plc_backup_after',
      'data-report-attachment-upload',
    ])
      expect(page).toContain(marker);
    expect(page).toContain("['clean', 'not_scanned'].includes");
    expect(page).toContain("['temporary', 'quarantined', 'rejected'].includes");
    expect(page).toContain('attachmentCanEdit');
    expect(page).toContain("data.user.role === 'project_manager'");
    expect(page).toContain("data.user.role === 'worker'");
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('@media (max-width: 640px)');
  });

  it('enriches only v3-authorized attachment ids with hash, notes, version and uploader', () => {
    const pageServer = source('apps/portal/src/routes/app/reports/[id]/+page.server.ts');
    expect(pageServer).toContain('listReportAttachments');
    expect(pageServer).toContain('WHERE d.id IN (${placeholders})');
    expect(pageServer).toContain('sha256');
    expect(pageServer).toContain('uploader_name');
    expect(pageServer).toContain('notes:');
  });
});
