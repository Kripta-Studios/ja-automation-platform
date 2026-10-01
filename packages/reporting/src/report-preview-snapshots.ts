import type { ReportLocale } from './report-i18n.ts';

const text = (row: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && typeof value !== 'object' && String(value) !== '')
      return String(value);
  }
  return undefined;
};

/** Identical normalization for authorized HTML previews and durable localized PDF jobs. */
export function reportPreviewSnapshot(
  kind: 'daily_report' | 'technical_report' | 'period_report_revision',
  row: Record<string, unknown>,
  locale: ReportLocale,
) {
  const project = row.project && typeof row.project === 'object' && !Array.isArray(row.project)
    ? row.project as Record<string, unknown>
    : { number: text(row, 'project_number'), name: text(row, 'project_name'), clientName: text(row, 'client_name') };
  const common = { ...row, locale, project };
  if (kind === 'period_report_revision')
    return {
      ...common,
      periodStart: text(row, 'periodStart', 'period_start') ?? '1970-01-01',
      periodEnd: text(row, 'periodEnd', 'period_end') ?? '1970-01-01',
    };
  if (kind === 'daily_report')
    return {
      ...common,
      date: text(row, 'date', 'workDate', 'work_date') ?? '1970-01-01',
      summary: text(row, 'summary') ?? '',
    };
  return {
    ...common,
    date: text(row, 'date', 'reportDate', 'report_date', 'createdAt', 'created_at') ?? '1970-01-01',
    system: text(row, 'system', 'systemName', 'system_name') ?? '',
    site: text(row, 'site', 'plantSite', 'plant_site') ?? '',
    area: text(row, 'area', 'areaLine', 'area_line') ?? '',
    station: text(row, 'station', 'stationMachine', 'station_machine') ?? '',
    changeSummary: text(row, 'changeSummary', 'change_summary') ?? '',
  };
}
