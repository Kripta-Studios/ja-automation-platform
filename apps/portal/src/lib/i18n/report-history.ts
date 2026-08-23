import type { PortalLocale } from './catalog';

/**
 * Audit actions emitted for report source records.  These values are persisted
 * action identifiers, not free-form copy, so the mapping is intentionally
 * closed: an unknown event returns null and the caller can preserve its
 * existing safe fallback instead of manufacturing a mixed-language label.
 */
export type ReportHistoryAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'submit'
  | 'approved'
  | 'needs_changes'
  | 'refresh'
  | 'pdf_ready';

export type ReportHistoryRecord = 'daily' | 'technical' | 'period';

type LocalizedLabel = Record<PortalLocale, string>;

const recordLabels: Record<ReportHistoryRecord, LocalizedLabel> = {
  daily: {
    en: 'Daily report',
    es: 'Informe diario',
    pt: 'Relatório diário',
  },
  technical: {
    en: 'Technical report',
    es: 'Informe técnico',
    pt: 'Relatório técnico',
  },
  period: {
    en: 'Period report',
    es: 'Informe del período',
    pt: 'Relatório do período',
  },
};

const actionLabels: Record<ReportHistoryAction, Record<PortalLocale, string>> = {
  create: { en: 'created', es: 'creado', pt: 'criado' },
  update: { en: 'updated', es: 'actualizado', pt: 'atualizado' },
  delete: { en: 'deleted', es: 'eliminado', pt: 'excluído' },
  submit: { en: 'submitted for review', es: 'enviado para revisión', pt: 'enviado para revisão' },
  approved: { en: 'approved', es: 'aprobado', pt: 'aprovado' },
  needs_changes: {
    en: 'returned for changes',
    es: 'devuelto para cambios',
    pt: 'devolvido para alterações',
  },
  refresh: { en: 'refreshed', es: 'actualizado', pt: 'atualizado' },
  pdf_ready: { en: 'PDF ready', es: 'PDF listo', pt: 'PDF pronto' },
};

const actionAliases: Record<string, ReportHistoryAction> = {
  create: 'create',
  create_offline: 'create',
  update: 'update',
  report_modified: 'update',
  delete: 'delete',
  report_deleted: 'delete',
  delete_draft: 'delete',
  submit: 'submit',
  submitted: 'submit',
  approve: 'approved',
  approved: 'approved',
  needs_changes: 'needs_changes',
  refresh: 'refresh',
  pdf_ready: 'pdf_ready',
};

const reportPrefixes: ReadonlyArray<readonly [string, ReportHistoryRecord]> = [
  ['daily_report', 'daily'],
  ['technical_report', 'technical'],
  ['period_report_revision', 'period'],
  ['period_report', 'period'],
  ['report.daily', 'daily'],
  ['report.technical', 'technical'],
  ['report.period', 'period'],
];

function parseReportHistoryAction(
  value: unknown,
): { record: ReportHistoryRecord; action: ReportHistoryAction } | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  for (const [prefix, record] of reportPrefixes) {
    const prefixWithSeparator = `${prefix}.`;
    if (!normalized.startsWith(prefixWithSeparator)) continue;
    const action = actionAliases[normalized.slice(prefixWithSeparator.length)];
    if (action) return { record, action };
  }
  return undefined;
}

/** Return a complete localized history label for a known report audit action. */
export function translateReportHistoryAction(locale: PortalLocale, value: unknown): string | null {
  const parsed = parseReportHistoryAction(value);
  if (!parsed) return null;
  const subject = recordLabels[parsed.record][locale];
  const action = actionLabels[parsed.action][locale];
  if (parsed.action === 'pdf_ready') return `${action} · ${subject}`;
  return `${subject} ${action}`;
}

export function isReportHistoryAction(value: unknown): boolean {
  return Boolean(parseReportHistoryAction(value));
}
