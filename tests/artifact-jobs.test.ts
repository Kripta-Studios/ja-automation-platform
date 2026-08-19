import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { runArtifactJobs } from '@ja/reporting';

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
            'accounting_pack',
            'auto_draft',
            'document_scan',
            'invoice_pdf',
            'period_close_report',
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
        recordDocumentScan: (actor, documentId, scanResult) => {
          calls.push(`scan:${actor.actor}:${documentId}:${scanResult}`);
        },
      },
    });

    expect(result).toEqual({ processed: 3, failed: 0, overdueMarked: 0 });
    expect(calls).toEqual([
      'draft:finance-service:rule-1:2026-08-01:2026-08-14',
      'scan:finance-service:document-1:clean',
    ]);
    expect(periodLocale).toBe('pt');
  });
});
