import type { AssistantRecord, AssistantRecordKind } from './types';

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

const labelFields: Record<AssistantRecordKind, readonly string[]> = {
  project: ['name', 'project_name', 'projectName', 'number', 'project_number'],
  invoice: ['invoice_number', 'invoiceNumber', 'number', 'client_name'],
  time: ['work_date', 'workDate', 'date', 'project_name', 'worker_name', 'category'],
  expense: ['description', 'expense_date', 'expenseDate', 'date', 'project_name', 'category'],
  report: ['title', 'report_date', 'reportDate', 'date', 'project_name', 'type'],
};

/** Only inspect known, already-authorized page projections. Never crawl arbitrary nested data. */
export function assistantRecordsFromPage(
  data: unknown,
  kind: AssistantRecordKind,
  pathname = '',
): readonly AssistantRecord[] {
  const source = object(data);
  if (!source) return [];
  const candidates: unknown[] = [];
  const addList = (value: unknown) => {
    if (Array.isArray(value)) candidates.push(...value);
  };
  if (kind === 'project') {
    addList(source.projects);
    candidates.push(source.project, object(source.overview)?.project);
  } else if (kind === 'invoice') {
    addList(source.invoices);
    candidates.push(source.invoice);
  } else if (kind === 'report') {
    addList(source.reports);
    candidates.push(object(source.detail)?.report);
  }
  const section = text(source.section);
  const matchingSection =
    (kind === 'time' && section === 'time') ||
    (kind === 'expense' && section === 'expenses') ||
    (kind === 'report' && section === 'reports');
  if (matchingSection) addList(source.records);
  // A generic `record` is ambiguous outside its known detail route.
  if (
    (kind === 'time' && /\/app\/(?:crew\/)?time\/[^/]+\/?$/.test(pathname)) ||
    (kind === 'expense' && /\/app\/expenses\/[^/]+\/?$/.test(pathname))
  ) {
    candidates.push(source.record);
  }
  const records = new Map<string, AssistantRecord>();
  for (const value of candidates) {
    const row = object(value);
    if (!row) continue;
    // IDs come from the projection itself, never from prose or an unrelated foreign key.
    const id = text(row.id);
    if (!id || id.length > 200 || [...id].some((character) => character.charCodeAt(0) < 32))
      continue;
    const parts = labelFields[kind].map((field) => text(row[field])).filter(Boolean);
    const label = [...new Set(parts)].slice(0, 3).join(' · ');
    records.set(id, { id, kind, label: label ? `${label} · ${id}` : id });
  }
  return [...records.values()];
}
