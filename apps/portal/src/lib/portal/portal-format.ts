export const money = (minor: unknown, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(minor ?? 0) / 100);

export const hours = (minutes: unknown): string => `${(Number(minutes ?? 0) / 60).toFixed(1)}h`;

export const categorySummary = (categories: Record<string, number>): string =>
  Object.entries(categories)
    .filter(([, minutes]) => minutes > 0)
    .map(([category, minutes]) => `${category.replaceAll('_', ' ')} ${hours(minutes)}`)
    .join(' · ');

export const shiftWeek = (value: string, days: number): string =>
  new Date(Date.parse(`${value}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export const formValue = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

export const formNumber = (formData: FormData, name: string): number | undefined => {
  const value = formValue(formData, name);
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export const formBoolean = (formData: FormData, name: string): boolean =>
  formData.get(name) === 'on';

export const decimalToMinor = (value: string): string | undefined => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return undefined;
  return `${match[1]}${(match[2] ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
};

export const compact = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== ''),
  );
