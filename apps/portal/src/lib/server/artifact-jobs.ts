import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Principal } from '@ja/domain';
import {
  accountingPackArtifacts,
  invoicePdf,
  periodReportPdf,
  REPORT_TEMPLATE_VERSION,
  type ReportLocale,
} from '@ja/reporting';

function safeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').includes('..'))
    throw new Error('Unsafe artifact key');
}

function writeArtifact(
  root: string,
  storageKey: string,
  bytes: Uint8Array,
): { sha256: string; byteLength: number } {
  safeKey(storageKey);
  const target = resolve(root, storageKey);
  const rel = relative(root, target);
  if (rel.split(/[\\/]/).includes('..') || rel.startsWith('\\'))
    throw new Error('Artifact path escaped private root');
  mkdirSync(resolve(target, '..'), { recursive: true });
  let existing: Uint8Array | undefined;
  try {
    writeFileSync(target, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    existing = readFileSync(target);
  }
  const persisted = existing ?? bytes;
  return {
    sha256: createHash('sha256').update(persisted).digest('hex'),
    byteLength: persisted.byteLength,
  };
}

export function runArtifactJobs(context: {
  repository: {
    createInvoiceDraft: (
      principal: Principal,
      billingRuleId: string,
      periodStart: string,
      periodEnd: string,
    ) => unknown;
  };
  v3: {
    runDueJobs: (
      limit: number,
      handlers: Readonly<Record<string, (payload: unknown) => void>>,
    ) => { processed: number; failed: number; overdueMarked: number };
    invoiceSnapshot: (principal: Principal, invoiceId: string) => Readonly<Record<string, unknown>>;
    recordInvoicePdf: (
      principal: Principal,
      invoiceId: string,
      storageKey: string,
      sha256: string,
      byteLength: number,
    ) => void;
    refreshPeriodReports: (
      principal: Principal,
      input: Readonly<{
        projectId: string;
        periodStart: string;
        periodEnd: string;
        reportLocale?: ReportLocale;
      }>,
    ) => readonly {
      id: string;
      audience: 'customer' | 'internal';
      snapshot: Readonly<Record<string, unknown>>;
    }[];
    recordPeriodReportPdf: (
      principal: Principal,
      reportId: string,
      storageKey: string,
      sha256: string,
      byteLength: number,
    ) => void;
    accountingPackSnapshot: (
      principal: Principal,
      packId: string,
    ) => Readonly<Record<string, unknown>>;
    recordAccountingPackExport: (
      principal: Principal,
      packId: string,
      exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
      storageKey: string,
      sha256: string,
      byteLength: number,
    ) => { id: string; created: boolean };
    recordDocumentScan: (
      principal: Principal,
      documentId: string,
      result: 'clean' | 'rejected',
      provider: string,
    ) => void;
  };
  principal: Principal;
}): { processed: number; failed: number; overdueMarked: number } {
  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  return context.v3.runDueJobs(20, {
    invoice_pdf: (payload) => {
      const invoiceId =
        typeof payload === 'object' && payload !== null && 'invoiceId' in payload
          ? String(payload.invoiceId)
          : '';
      if (!invoiceId) throw new Error('Invoice PDF job has no invoice id');
      const snapshot = context.v3.invoiceSnapshot(context.principal, invoiceId);
      const bytes = invoicePdf(snapshot as Parameters<typeof invoicePdf>[0]);
      const key = `invoices/${invoiceId}/${REPORT_TEMPLATE_VERSION}.pdf`;
      const metadata = writeArtifact(root, key, bytes);
      context.v3.recordInvoicePdf(
        context.principal,
        invoiceId,
        key,
        metadata.sha256,
        metadata.byteLength,
      );
    },
    period_close_report: (payload) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const projectId = String(values.projectId ?? '');
      const periodStart = String(values.periodStart ?? '');
      const periodEnd = String(values.periodEnd ?? '');
      const reportLocale: ReportLocale =
        values.reportLocale === 'pt' || values.reportLocale === 'es' ? values.reportLocale : 'en';
      if (!projectId || !periodStart || !periodEnd)
        throw new Error('Period report job has incomplete period data');
      const reports = context.v3.refreshPeriodReports(context.principal, {
        projectId,
        periodStart,
        periodEnd,
        reportLocale,
      });
      for (const report of reports) {
        const bytes = periodReportPdf(report.snapshot as Parameters<typeof periodReportPdf>[0]);
        const key = `reports/${report.id}/${REPORT_TEMPLATE_VERSION}.pdf`;
        const metadata = writeArtifact(root, key, bytes);
        context.v3.recordPeriodReportPdf(
          context.principal,
          report.id,
          key,
          metadata.sha256,
          metadata.byteLength,
        );
      }
    },
    auto_draft: (payload) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const billingRuleId = String(values.billingRuleId ?? '');
      const periodStart = String(values.periodStart ?? '');
      const periodEnd = String(values.periodEnd ?? '');
      if (!billingRuleId || !periodStart || !periodEnd)
        throw new Error('Automatic draft job has incomplete period data');
      context.repository.createInvoiceDraft(
        context.principal,
        billingRuleId,
        periodStart,
        periodEnd,
      );
    },
    accounting_pack: (payload) => {
      const packId =
        typeof payload === 'object' && payload !== null && 'packId' in payload
          ? String(payload.packId)
          : '';
      if (!packId) throw new Error('Accounting Pack job has no pack id');
      const snapshot = context.v3.accountingPackSnapshot(context.principal, packId) as {
        periodStart: string;
        periodEnd: string;
        invoiceRegister: readonly Record<string, unknown>[];
        collections: readonly Record<string, unknown>[];
        workerCosts: readonly Record<string, unknown>[];
        expenseRegister: readonly Record<string, unknown>[];
        totals: Record<string, unknown>;
        totalsByCurrency?: readonly Record<string, unknown>[];
        locale?: ReportLocale | string;
      };
      const artifacts = accountingPackArtifacts(snapshot);
      for (const artifact of artifacts) {
        const key = `accounting-packs/${packId}/${artifact.type}-${REPORT_TEMPLATE_VERSION}.${artifact.extension}`;
        const metadata = writeArtifact(root, key, artifact.bytes);
        context.v3.recordAccountingPackExport(
          context.principal,
          packId,
          artifact.type,
          key,
          metadata.sha256,
          metadata.byteLength,
        );
      }
    },
    document_scan: (payload) => {
      const documentId =
        typeof payload === 'object' && payload !== null && 'documentId' in payload
          ? String(payload.documentId)
          : '';
      if (!documentId) throw new Error('Document scan job has no document id');
      const result = process.env.JA_MALWARE_SCANNER_RESULT;
      if (result !== 'clean' && result !== 'rejected')
        throw new Error('Malware scanner decision is unavailable');
      context.v3.recordDocumentScan(
        context.principal,
        documentId,
        result,
        process.env.JA_MALWARE_SCANNER_PROVIDER ?? 'configured-scanner',
      );
    },
  });
}
