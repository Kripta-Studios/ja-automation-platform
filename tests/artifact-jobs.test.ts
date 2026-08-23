import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { runArtifactJobs, writeArtifact } from '../packages/reporting/src/artifact-jobs.ts';

const roots: string[] = [];
const originalScannerResult = process.env.JA_MALWARE_SCANNER_RESULT;

afterEach(() => {
  if (originalScannerResult === undefined) delete process.env.JA_MALWARE_SCANNER_RESULT;
  else process.env.JA_MALWARE_SCANNER_RESULT = originalScannerResult;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('shared artifact job orchestration', () => {
  it('uses one handler contract for interactive and durable adapters', () => {
    process.env.JA_MALWARE_SCANNER_RESULT = 'clean';
    const root = mkdtempSync(join(tmpdir(), 'ja-artifact-jobs-'));
    roots.push(root);
    const temporaryUpload = join(root, 'uploads', 'temporary.bin');
    mkdirSync(join(root, 'uploads'), { recursive: true });
    writeFileSync(temporaryUpload, 'temporary');
    const principal = { actor: 'finance-service' };
    const calls: string[] = [];
    let periodLocale: string | undefined;
    const result = runArtifactJobs({
      principal,
      documentRoot: root,
      repository: {
        createInvoiceDraft: (actor, billingRuleId, periodStart, periodEnd) => {
          calls.push(`draft:${actor.actor}:${billingRuleId}:${periodStart}:${periodEnd}`);
        },
      },
      v3: {
        runDueJobs: (_limit, handlers) => {
          expect(Object.keys(handlers).sort()).toEqual([
            'accounting_pack_artifact_render',
            'auto_draft',
            'document_scan',
            'invoice_pdf',
            'period_close_report',
            'temporary_upload_cleanup',
          ]);
          handlers.auto_draft({
            billingRuleId: 'rule-1',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-14',
          });
          handlers.period_close_report({
            projectId: 'project-1',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-14',
            reportLocale: 'pt',
          });
          handlers.document_scan({ documentId: 'document-1' });
          handlers.temporary_upload_cleanup(
            { olderThan: '2026-08-01T00:00:00.000Z' },
            {
              jobId: 'cleanup-job',
              runId: 'cleanup-run',
              tenantId: 'tenant',
              deploymentId: 'deployment',
              requiredCapability: 'storage.temporary.cleanup',
              fenceVersion: 1,
            },
          );
          return { processed: 3, failed: 0, overdueMarked: 0 };
        },
        invoiceSnapshot: () => ({}),
        recordInvoicePdf: () => undefined,
        refreshPeriodReports: (_actor, input) => {
          periodLocale = input.reportLocale;
          return [];
        },
        recordPeriodReportPdf: () => undefined,
        accountingPackSnapshot: () => ({
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          invoiceRegister: [],
          collections: [],
          workerCosts: [],
          expenseRegister: [],
          totals: {},
        }),
        recordAccountingPackExport: () => ({ id: 'export-1', created: true }),
        cleanupTemporaryUploadReservationsFromJob: (execution, olderThan, removeFile) => {
          expect(execution.requiredCapability).toBe('storage.temporary.cleanup');
          expect(olderThan).toBe('2026-08-01T00:00:00.000Z');
          removeFile('uploads/temporary.bin');
          calls.push('cleanup:1');
          return 1;
        },
        recordDocumentScan: (actor, documentId, scanResult) => {
          calls.push(`scan:${actor.actor}:${documentId}:${scanResult}`);
        },
      },
    });

    expect(result).toEqual({ processed: 3, failed: 0, overdueMarked: 0 });
    expect(calls).toEqual([
      'draft:finance-service:rule-1:2026-08-01:2026-08-14',
      'scan:finance-service:document-1:clean',
      'cleanup:1',
    ]);
    expect(existsSync(temporaryUpload)).toBe(false);
    expect(periodLocale).toBe('pt');
  });

  it('rejects symlinked roots and nested artifact parents without writing outside the root', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-artifact-symlink-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-artifact-symlink-outside-'));
    roots.push(root, outside);
    const linkedRoot = join(root, 'linked-root');
    try {
      symlinkSync(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }

    expect(() =>
      writeArtifact(linkedRoot, 'reports/report.pdf', Uint8Array.from([1, 2, 3])),
    ).toThrow(/real directory|symlink/u);
    expect(existsSync(join(outside, 'reports', 'report.pdf'))).toBe(false);

    const safeRoot = mkdtempSync(join(tmpdir(), 'ja-artifact-symlink-parent-'));
    const nestedOutside = mkdtempSync(join(tmpdir(), 'ja-artifact-symlink-nested-outside-'));
    roots.push(safeRoot, nestedOutside);
    const linkedParent = join(safeRoot, 'reports');
    try {
      symlinkSync(nestedOutside, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    expect(() => writeArtifact(safeRoot, 'reports/report.pdf', Uint8Array.from([4, 5, 6]))).toThrow(
      /real directory|symlink/u,
    );
    expect(existsSync(join(nestedOutside, 'report.pdf'))).toBe(false);
  });
});
