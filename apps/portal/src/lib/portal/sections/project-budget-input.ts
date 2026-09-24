/** Project budgets are stored as integral minor units and minutes. */
export function minorToProjectAmount(value: string): string {
  if (!/^\d+$/.test(value)) return '';
  const minor = BigInt(value);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}

export function projectAmountToMinor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(trimmed);
  if (!match) return '';
  return String(BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')));
}

export function minutesToProjectHours(value: string): string {
  if (!/^\d+$/.test(value)) return '';
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes)) return '';
  return String(Number((minutes / 60).toFixed(4)));
}

export function projectHoursToMinutes(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\d+(?:[.,]\d{1,4})?$/.test(trimmed)) return '';
  const minutes = Math.round(Number(trimmed.replace(',', '.')) * 60);
  return Number.isSafeInteger(minutes) ? String(minutes) : '';
}
