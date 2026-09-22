/** Stable identities for deterministic business-artifact renderers. */
export const INVOICE_TEMPLATE_VERSION = '2026.09.02.2' as const;
export const ACCOUNTING_PACK_PDF_TEMPLATE_VERSION = '2026.09.22.1' as const;
export const ACCOUNTING_PACK_DATA_TEMPLATE_VERSION = '2026.09.02.2' as const;

export const PERIOD_REPORT_TEMPLATE_VERSION = '2026.09.22.1' as const;
export const WORKER_STATEMENT_TEMPLATE_VERSION = '2026.09.22.1' as const;
export const FIELD_REPORT_TEMPLATE_VERSION = '2026.09.22.1' as const;
export const SPREADSHEET_TEMPLATE_VERSION = '2026.09.22.1' as const;

export type LocalizedPdfOwnerType =
  | 'invoice'
  | 'period_report_revision'
  | 'accounting_pack_revision'
  | 'daily_report'
  | 'technical_report';

export function localizedPdfTemplateVersion(ownerType: LocalizedPdfOwnerType): string {
  switch (ownerType) {
    case 'invoice':
      return INVOICE_TEMPLATE_VERSION;
    case 'period_report_revision':
      return PERIOD_REPORT_TEMPLATE_VERSION;
    case 'accounting_pack_revision':
      return ACCOUNTING_PACK_PDF_TEMPLATE_VERSION;
    case 'daily_report':
    case 'technical_report':
      return FIELD_REPORT_TEMPLATE_VERSION;
  }
}

export type AccountingPackVersionedExportType =
  | 'pdf'
  | 'xlsx'
  | 'invoice_csv'
  | 'expense_csv'
  | 'json';

export function accountingPackExportTemplateVersion(
  exportType: AccountingPackVersionedExportType,
): string {
  if (exportType === 'xlsx') return SPREADSHEET_TEMPLATE_VERSION;
  if (exportType === 'pdf') return ACCOUNTING_PACK_PDF_TEMPLATE_VERSION;
  return ACCOUNTING_PACK_DATA_TEMPLATE_VERSION;
}

export function localizedPdfRendererVersion(
  ownerType: LocalizedPdfOwnerType,
  templateVersion = localizedPdfTemplateVersion(ownerType),
): string {
  return `localized-pdf-${ownerType}-${templateVersion}`;
}

export function workerStatementRendererVersion(
  templateVersion = WORKER_STATEMENT_TEMPLATE_VERSION,
): string {
  return `worker-statement-${templateVersion}`;
}
