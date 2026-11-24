/**
 * Plain labels for the Documents register (QA round 2, A7): the stored
 * artifact kind/sensitivity codes and raw byte counts are shown as words and
 * a human file size. Tuples are en-US, es-ES, pt-BR.
 */
import type { PortalLocale } from '../portal-i18n';

type Tuple = readonly [string, string, string];
const index = (locale: PortalLocale): 0 | 1 | 2 => (locale === 'es' ? 1 : locale === 'pt' ? 2 : 0);

const KINDS: Record<string, Tuple> = {
  receipt: ['Receipt', 'Recibo', 'Recibo'],
  report: ['Report file', 'Archivo de informe', 'Arquivo de relatório'],
  signed_timesheet: ['Signed timesheet', 'Hoja de horas firmada', 'Folha de horas assinada'],
  customer_signoff_evidence: ['Client sign-off', 'Firma del cliente', 'Aceite do cliente'],
  daily_attachment: ['Daily report attachment', 'Adjunto de informe diario', 'Anexo de relatório diário'],
  technical_attachment: ['Technical attachment', 'Adjunto técnico', 'Anexo técnico'],
  plc_backup_before: ['PLC backup · before', 'Copia PLC · antes', 'Backup PLC · antes'],
  plc_backup_after: ['PLC backup · after', 'Copia PLC · después', 'Backup PLC · depois'],
};
const SENSITIVITY: Record<string, Tuple> = {
  internal: ['Internal', 'Interno', 'Interno'],
  sensitive: ['Sensitive', 'Sensible', 'Sensível'],
  confidential: ['Confidential', 'Confidencial', 'Confidencial'],
  restricted: ['Restricted', 'Restringido', 'Restrito'],
  public: ['Public', 'Público', 'Público'],
};
const OTHER: Tuple = ['File', 'Archivo', 'Arquivo'];

export function documentKindText(kind: unknown, locale: PortalLocale): string {
  const raw = String(kind ?? '').trim();
  if (!raw) return OTHER[index(locale)];
  return (KINDS[raw] ?? null)?.[index(locale)] ?? raw.replaceAll('_', ' ');
}

export function documentSensitivityText(value: unknown, locale: PortalLocale): string {
  const raw = String(value ?? 'internal').trim() || 'internal';
  return SENSITIVITY[raw]?.[index(locale)] ?? raw.replaceAll('_', ' ');
}

const LOCALE_TAG: Record<PortalLocale, string> = { en: 'en-US', es: 'es-ES', pt: 'pt-BR' };

/** 51962 → "51 KB"; 2_400_000 → "2.3 MB" (binary units, localized digits). */
export function humanFileSize(bytes: unknown, locale: PortalLocale): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  const format = (amount: number, digits: number) =>
    new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: digits }).format(amount);
  if (value < 1024) return `${format(value, 0)} B`;
  if (value < 1024 * 1024) return `${format(Math.floor(value / 1024), 0)} KB`;
  return `${format(value / (1024 * 1024), 1)} MB`;
}
