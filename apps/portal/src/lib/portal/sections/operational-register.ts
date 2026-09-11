import type { PortalRow } from '../portal-data';

export const OPERATIONAL_REGISTER_PAGE_SIZE = 8;
export type OperationalOrder = 'newest' | 'oldest' | 'name' | 'status';

/** Match the words people type, regardless of accents stored in a name or project. */
export function operationalSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase();
}

export function operationalMatches(
  row: PortalRow,
  query: string,
  fields: readonly string[],
): boolean {
  const needle = operationalSearchText(query).trim();
  return !needle || fields.some((field) => operationalSearchText(row[field]).includes(needle));
}

export function operationalDate(row: PortalRow, fields: readonly string[]): string {
  for (const field of fields) {
    const value = String(row[field] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function operationalField(row: PortalRow, fields: readonly string[]): string {
  for (const field of fields) {
    const value = String(row[field] ?? '').trim();
    if (value) return value;
  }
  return '';
}

/** Order an authorized projection without mutating the repository-owned input. */
export function operationalSort<T extends PortalRow>(
  rows: readonly T[],
  order: OperationalOrder,
  dateFields: readonly string[],
  nameFields: readonly string[],
  statusFields: readonly string[],
): T[] {
  return [...rows].sort((left, right) => {
    const leftDate = operationalDate(left, dateFields);
    const rightDate = operationalDate(right, dateFields);
    const leftName = operationalSearchText(operationalField(left, nameFields));
    const rightName = operationalSearchText(operationalField(right, nameFields));
    const leftStatus = operationalSearchText(operationalField(left, statusFields));
    const rightStatus = operationalSearchText(operationalField(right, statusFields));
    const byId = String(left.id ?? '').localeCompare(String(right.id ?? ''));
    if (order === 'oldest')
      return leftDate.localeCompare(rightDate) || leftName.localeCompare(rightName) || byId;
    if (order === 'name')
      return leftName.localeCompare(rightName) || leftDate.localeCompare(rightDate) || byId;
    if (order === 'status')
      return leftStatus.localeCompare(rightStatus) || leftDate.localeCompare(rightDate) || byId;
    return rightDate.localeCompare(leftDate) || leftName.localeCompare(rightName) || byId;
  });
}

/** Match a literal lifecycle state or a named composite used by an attention counter. */
export function operationalStatusMatches(
  rowStatus: unknown,
  filter: string,
  attentionStates: readonly string[],
): boolean {
  if (!filter) return true;
  const state = String(rowStatus ?? '');
  return filter === 'attention' ? attentionStates.includes(state) : state === filter;
}

export function operationalNewestFirst<T extends PortalRow>(
  rows: readonly T[],
  fields: readonly string[],
): T[] {
  return operationalSort(rows, 'newest', fields, [], []);
}

export function operationalOldestFirst<T extends PortalRow>(
  rows: readonly T[],
  fields: readonly string[],
): T[] {
  return operationalSort(rows, 'oldest', fields, [], []);
}

export function operationalPage<T>(
  rows: readonly T[],
  page: number,
  size = OPERATIONAL_REGISTER_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { current, totalPages, rows: rows.slice((current - 1) * size, current * size) };
}

export function readOperationalRegisterState<T extends Record<string, unknown>>(
  key: string,
): T | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function writeOperationalRegisterState(key: string, value: Record<string, unknown>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Register navigation remains fully usable if a browser disables session storage.
  }
}
