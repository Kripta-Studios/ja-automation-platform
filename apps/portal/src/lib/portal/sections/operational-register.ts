import type { PortalRow } from '../portal-data';

export const OPERATIONAL_REGISTER_PAGE_SIZE = 8;

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

export function operationalNewestFirst<T extends PortalRow>(
  rows: readonly T[],
  fields: readonly string[],
): T[] {
  return [...rows].sort((left, right) => {
    const byDate = operationalDate(right, fields).localeCompare(operationalDate(left, fields));
    return byDate || String(right.id ?? '').localeCompare(String(left.id ?? ''));
  });
}

export function operationalOldestFirst<T extends PortalRow>(
  rows: readonly T[],
  fields: readonly string[],
): T[] {
  return [...rows].sort((left, right) => {
    const byDate = operationalDate(left, fields).localeCompare(operationalDate(right, fields));
    return byDate || String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
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
