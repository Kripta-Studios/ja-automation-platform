/**
 * Reporting-local re-export of the dependency-neutral renderer identity contract.
 * Database enqueue sites and renderer workers therefore share one source without a package cycle.
 */
export {
  ACCOUNTING_PACK_DATA_TEMPLATE_VERSION,
  ACCOUNTING_PACK_PDF_TEMPLATE_VERSION,
  FIELD_REPORT_TEMPLATE_VERSION,
  INVOICE_TEMPLATE_VERSION,
  PERIOD_REPORT_TEMPLATE_VERSION,
  SPREADSHEET_TEMPLATE_VERSION,
  WORKER_STATEMENT_TEMPLATE_VERSION,
  accountingPackExportTemplateVersion,
  localizedPdfRendererVersion,
  localizedPdfTemplateVersion,
  workerStatementRendererVersion,
  type AccountingPackVersionedExportType,
  type LocalizedPdfOwnerType,
} from '@ja/domain';
