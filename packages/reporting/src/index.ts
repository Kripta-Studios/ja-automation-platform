export type Readiness = {
  state: 'ready' | 'incomplete' | 'blocked' | 'already_closed';
  reasons: readonly { code: string; sourceId?: string }[];
};

export {
  INVOICE_TEMPLATE_ALIASES,
  INVOICE_TEMPLATE_REGISTRY,
  INVOICE_TEMPLATES,
  getInvoiceTemplate,
  getInvoiceTemplateRegistry,
  invoiceTemplateRegistry,
  renderInvoiceTemplate,
  resolveInvoiceTemplate,
  validateInvoiceTemplate,
  type InvoiceTemplateDefinition,
  type InvoiceTemplateId,
  type InvoiceTemplateSelector,
  type InvoiceTemplateSnapshot,
  type InvoiceTemplateVersion,
  type RenderedInvoiceTemplate,
} from '@ja/invoice-templates';

export { runArtifactJobs } from './artifact-jobs.ts';
export type {
  AccountingPackArtifactResult,
  AccountingPackExportType,
  ArtifactJobContext,
  ArtifactJobRepository,
  ArtifactJobV3,
} from './artifact-jobs.ts';
export {
  localizePdfJobPayload,
  runLocalizedPdfVariantJob,
  LOCALIZED_PDF_JOB_CAPABILITY,
  LOCALIZED_PDF_JOB_KIND,
  LOCALIZED_PDF_RENDERER_VERSION,
  type LocalizedPdfJobExecution,
  type LocalizedPdfJobPayload,
  type LocalizedPdfJobRepository,
  type LocalizedPdfJobResult,
  type LocalizedPdfJobVariant,
} from './localized-pdf-jobs.ts';

export {
  accountingPackArtifacts,
  accountingPackArtifactBuilders,
  accountingPackCsv,
  accountingPackPdf,
  accountingPackXlsx,
  dailyReportPdf,
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  invoicePdf,
  periodReportPdf,
  projectFinanceXlsx,
  renderAccountingPackArtifacts,
  technicalReportPdf,
  workerStatementCsv,
  workerStatementPdf,
  REPORT_LOCALES,
  REPORT_TEMPLATE_VERSION,
  toCsv,
  type AccountingPackArtifactBuildResult,
  type AccountingPackArtifactBuilder,
  type AccountingPackSourceSnapshot,
  type InvoiceCollectionLedgerRow,
  type ReportLocale,
  type WorkerStatementSnapshot,
} from './exports.ts';
export {
  formatReportDate,
  formatReportInteger,
  normalizeReportLocale,
  reportCopy,
  reportLocaleTag,
  translateCalculationBasis,
  translateCalculationType,
  translateReportBoolean,
  translateReportMetric,
  translateReportStatus,
  type ReportLocaleInput,
  type ReportCopy,
} from './report-i18n.ts';
export function periodReadiness(input: {
  closed: boolean;
  unsubmitted: number;
  unapproved: number;
  lockHeld: boolean;
}): Readiness {
  if (input.closed) return { state: 'already_closed', reasons: [{ code: 'period_closed' }] };
  if (input.lockHeld) return { state: 'blocked', reasons: [{ code: 'billing_lock_held' }] };
  const reasons = [];
  if (input.unsubmitted) reasons.push({ code: 'unsubmitted_records' });
  if (input.unapproved) reasons.push({ code: 'unapproved_records' });
  return reasons.length ? { state: 'incomplete', reasons } : { state: 'ready', reasons: [] };
}
