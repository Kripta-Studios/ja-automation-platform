import { error } from '@sveltejs/kit';
import { isRealIsoDate } from './iso-date';

export function requiredExportPeriod(url: URL): Readonly<{
  periodStart: string;
  periodEnd: string;
}> {
  const starts = url.searchParams.getAll('periodStart');
  const ends = url.searchParams.getAll('periodEnd');
  if (starts.length !== 1 || ends.length !== 1) error(400, 'One complete period is required');
  const periodStart = starts[0];
  const periodEnd = ends[0];
  if (!periodStart || !periodEnd || !isRealIsoDate(periodStart) || !isRealIsoDate(periodEnd))
    error(400, 'Period dates must be valid ISO calendar dates');
  if (periodStart > periodEnd) error(400, 'Period start must not follow period end');
  return { periodStart, periodEnd };
}

export function semanticFilenamePart(value: unknown, fallback: string): string {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 80);
  return cleaned || fallback;
}
