import type { PortalLocale } from '$lib/portal-i18n';

export const localizedPdfLocales = ['en', 'es', 'pt'] as const;
export type LocalizedPdfLocale = (typeof localizedPdfLocales)[number];

export const localizedPdfLocaleOptions: ReadonlyArray<{
  value: LocalizedPdfLocale;
  labelKey: 'English' | 'Spanish' | 'Portuguese';
}> = [
  { value: 'en', labelKey: 'English' },
  { value: 'es', labelKey: 'Spanish' },
  { value: 'pt', labelKey: 'Portuguese' },
];

export const localizedPdfOwnerTypes = [
  'invoice',
  'period_report_revision',
  'accounting_pack_revision',
  'daily_report',
  'technical_report',
] as const;
export type LocalizedPdfOwnerType = (typeof localizedPdfOwnerTypes)[number];

export type LocalizedPdfStatus = 'queued' | 'running' | 'ready' | 'failed';

/** The API deliberately exposes a read-only artifact envelope. UI code never derives finance. */
export type LocalizedPdfVariant = Readonly<{
  variantId: string;
  locale: LocalizedPdfLocale;
  status: LocalizedPdfStatus;
  retryable: boolean | null;
  errorCode: string | null;
  semanticFilename: string | null;
  [key: string]: unknown;
}>;

export function normalizeLocalizedPdfLocale(value: unknown): LocalizedPdfLocale {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'es' || normalized === 'es-es') return 'es';
  if (normalized === 'pt' || normalized === 'pt-br') return 'pt';
  return 'en';
}

export function localeFromPortalLocale(locale: PortalLocale): LocalizedPdfLocale {
  return normalizeLocalizedPdfLocale(locale);
}

export function normalizeLocalizedPdfVariant(value: unknown): LocalizedPdfVariant | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.variantId !== 'string' || candidate.variantId.length === 0) return null;
  const allowedStatuses: readonly LocalizedPdfStatus[] = ['queued', 'running', 'ready', 'failed'];
  const status = allowedStatuses.includes(candidate.status as LocalizedPdfStatus)
    ? (candidate.status as LocalizedPdfStatus)
    : null;
  if (!status) return null;
  const retryable =
    candidate.retryable === true || candidate.retryable === false ? candidate.retryable : null;
  return {
    ...candidate,
    variantId: candidate.variantId,
    locale: normalizeLocalizedPdfLocale(candidate.locale ?? candidate.localeTag),
    status,
    retryable,
    errorCode: typeof candidate.errorCode === 'string' ? candidate.errorCode : null,
    semanticFilename:
      typeof candidate.semanticFilename === 'string' ? candidate.semanticFilename : null,
  } as LocalizedPdfVariant;
}

export function mergeLocalizedPdfVariant(
  current: readonly LocalizedPdfVariant[],
  incoming: LocalizedPdfVariant,
): LocalizedPdfVariant[] {
  const byId = current.findIndex((item) => item.variantId === incoming.variantId);
  if (byId >= 0) return current.map((item, index) => (index === byId ? incoming : item));
  const byLocale = current.findIndex((item) => item.locale === incoming.locale);
  if (byLocale >= 0) return current.map((item, index) => (index === byLocale ? incoming : item));
  return [...current, incoming];
}

export function canRetryLocalizedPdf(
  variant: Pick<LocalizedPdfVariant, 'status' | 'retryable'>,
): boolean {
  return variant.status === 'failed' && variant.retryable === true;
}

function apiBase(base: string): string {
  return `${base.replace(/\/$/, '')}/app/api/localized-pdf`;
}

export function localizedPdfCollectionUrl(
  base: string,
  ownerType: LocalizedPdfOwnerType,
  ownerId: string,
): string {
  const query = new URLSearchParams({ ownerType, ownerId });
  return `${apiBase(base)}?${query.toString()}`;
}

export function localizedPdfRequestUrl(base: string): string {
  return apiBase(base);
}

export function localizedPdfRetryUrl(base: string, variantId: string): string {
  return `${apiBase(base)}/${encodeURIComponent(variantId)}/retry`;
}

export function localizedPdfDownloadUrl(base: string, variantId: string): string {
  return `${apiBase(base)}/${encodeURIComponent(variantId)}/download`;
}
