import type { DatabaseSync } from 'node:sqlite';
import { newId } from '@ja/domain';
import { crossRate, formatDecimal, isCurrency, parseRate } from '@ja/money';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';

/**
 * European Central Bank euro foreign exchange reference rates.
 * 1 EUR = rate QUOTE, published on TARGET business days around 16:00 CET.
 * Rates are stored as the exact decimal text ECB publishes (never floats).
 */
export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_HISTORY_90D_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

/** Business days after which a proposed rate is flagged as stale. */
export const FX_STALE_BUSINESS_DAYS = 5;

export type EcbDay = Readonly<{ date: string; rates: Readonly<Record<string, string>> }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Parse an ECB eurofxref XML document (daily or historical) into days of exact rates. */
export function parseEcbXml(xml: string): EcbDay[] {
  if (typeof xml !== 'string' || !xml.includes('Cube')) throw new Error('FX_SOURCE_INVALID');
  const days: EcbDay[] = [];
  const dayPattern = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/gu;
  const ratePattern = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/gu;
  for (const day of xml.matchAll(dayPattern)) {
    const rates: Record<string, string> = {};
    for (const rate of day[2]!.matchAll(ratePattern)) {
      const parsed = parseRate(rate[2]!);
      if (!parsed || rate[1] === 'EUR') continue;
      rates[rate[1]!] = formatDecimal(parsed);
    }
    if (Object.keys(rates).length) days.push({ date: day[1]!, rates });
  }
  if (!days.length) throw new Error('FX_SOURCE_EMPTY');
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Store parsed days. Idempotent: an identical (date, quote, rate) is ignored; a
 * different value for an existing (date, quote) is never overwritten (append-only)
 * and is reported as a conflict.
 */
export function storeEcbRates(
  sqlite: DatabaseSync,
  days: readonly EcbDay[],
  fetchedAt: string,
): { inserted: number; unchanged: number; conflicts: number; latestDate: string | null } {
  const existing = sqlite.prepare(
    'SELECT rate_decimal FROM exchange_rate WHERE rate_date=? AND quote_currency=?',
  );
  const insert = sqlite.prepare(
    "INSERT INTO exchange_rate(rate_date,base_currency,quote_currency,rate_decimal,source,fetched_at) VALUES(?,'EUR',?,?,'ECB',?)",
  );
  let inserted = 0;
  let unchanged = 0;
  let conflicts = 0;
  let latestDate = null as string | null;
  for (const day of days) {
    if (!ISO_DATE.test(day.date)) continue;
    if (latestDate === null || day.date > latestDate) latestDate = day.date;
    for (const [quote, rate] of Object.entries(day.rates)) {
      const row = existing.get(day.date, quote) as { rate_decimal: string } | undefined;
      if (row) {
        if (row.rate_decimal === rate) unchanged += 1;
        else conflicts += 1;
        continue;
      }
      insert.run(day.date, quote, rate, fetchedAt);
      inserted += 1;
    }
  }
  return { inserted, unchanged, conflicts, latestDate };
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Number of Mon–Fri days in (from, to]. 0 when to <= from. */
export function businessDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let cursor = addDays(from, 1); cursor <= to; cursor = addDays(cursor, 1))
    if (!isWeekend(new Date(`${cursor}T00:00:00Z`))) count += 1;
  return count;
}

/** Local date/time parts in Europe/Berlin (ECB publication time zone). */
function berlinParts(now: Date): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Latest date ECB is expected to have published by `now` (after 16:30 CET, weekdays). */
export function expectedLatestEcbDate(now: Date): string {
  const local = berlinParts(now);
  let candidate = local.minutes >= 16 * 60 + 30 ? local.date : addDays(local.date, -1);
  while (isWeekend(new Date(`${candidate}T00:00:00Z`))) candidate = addDays(candidate, -1);
  return candidate;
}

export function latestStoredRateDate(sqlite: DatabaseSync): string | null {
  return (
    (sqlite.prepare('SELECT MAX(rate_date) d FROM exchange_rate').get() as { d: string | null })
      .d ?? null
  );
}

export type FxRefreshConfig = Readonly<{
  enabled: boolean;
  dailyUrl: string;
  historyUrl: string;
}>;

/**
 * JA_FX_FETCH_ENABLED=false disables fetching (default: enabled only when
 * NODE_ENV=production; tests never reach the network). JA_FX_SOURCE_URL overrides
 * the daily document URL; JA_FX_HISTORY_URL the 90-day document URL.
 */
export function fxRefreshConfig(env: Readonly<Record<string, string | undefined>>): FxRefreshConfig {
  const flag = env.JA_FX_FETCH_ENABLED?.trim().toLowerCase();
  const enabled =
    flag === undefined || flag === ''
      ? env.NODE_ENV === 'production' && !env.VITEST
      : !['0', 'false', 'no', 'off'].includes(flag);
  const dailyUrl = env.JA_FX_SOURCE_URL?.trim() || ECB_DAILY_URL;
  const historyUrl =
    env.JA_FX_HISTORY_URL?.trim() ||
    (dailyUrl.endsWith('eurofxref-daily.xml')
      ? dailyUrl.replace(/eurofxref-daily\.xml$/u, 'eurofxref-hist-90d.xml')
      : dailyUrl);
  return { enabled, dailyUrl, historyUrl };
}

/** Scheduled refresh is due when the expected ECB day is missing and no attempt ran in the last hour. */
export function exchangeRateRefreshDue(sqlite: DatabaseSync, now = new Date()): boolean {
  const expected = expectedLatestEcbDate(now);
  const latest = latestStoredRateDate(sqlite);
  if (latest && latest >= expected) return false;
  const lastAttempt = (
    sqlite.prepare('SELECT MAX(attempted_at) at FROM exchange_rate_fetch').get() as {
      at: string | null;
    }
  ).at;
  return !lastAttempt || Date.parse(lastAttempt) < now.getTime() - 60 * 60_000;
}

export type FxRefreshResult = Readonly<{
  outcome: 'succeeded' | 'failed' | 'disabled';
  inserted: number;
  latestDate: string | null;
  errorCode?: string;
}>;

type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Fetch, parse and store ECB rates. Network or parse failures are logged as a
 * failed attempt and returned (never thrown) so callers can retry later
 * without blocking other work. The request carries no personal data.
 */
export async function refreshExchangeRates(
  sqlite: DatabaseSync,
  options: Readonly<{
    trigger: 'scheduled' | 'on_demand';
    config: FxRefreshConfig;
    fetchImpl?: FetchLike;
    actor?: Readonly<{ userId: string; correlationId?: string }> | null;
    now?: () => Date;
  }>,
): Promise<FxRefreshResult> {
  if (!options.config.enabled) return { outcome: 'disabled', inserted: 0, latestDate: null };
  const now = options.now ?? (() => new Date());
  const latest = latestStoredRateDate(sqlite);
  const expected = expectedLatestEcbDate(now());
  const url =
    !latest || businessDaysBetween(latest, expected) > 1
      ? options.config.historyUrl
      : options.config.dailyUrl;
  let days: EcbDay[];
  try {
    const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const response = await fetchImpl(url, {
      headers: { accept: 'application/xml,text/xml', 'user-agent': 'portal-fx-rates/1' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`FX_HTTP_${response.status}`);
    days = parseEcbXml(await response.text());
  } catch (error) {
    const code =
      error instanceof Error && /^FX_[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : 'FX_NETWORK_UNAVAILABLE';
    logAttempt(sqlite, options.trigger, 'failed', null, 0, code, now());
    return { outcome: 'failed', inserted: 0, latestDate: latest, errorCode: code };
  }
  const attemptedAt = now().toISOString();
  return runImmediateTransaction(sqlite, 'exchange-rates', () => {
    const stored = storeEcbRates(sqlite, days, attemptedAt);
    logAttempt(sqlite, options.trigger, 'succeeded', stored.latestDate, stored.inserted, null, now());
    recordAuditEvent(sqlite, options.actor ?? null, 'exchange_rate.refresh', 'exchange_rate', 'ECB', {
      trigger: options.trigger,
      inserted: stored.inserted,
      unchanged: stored.unchanged,
      conflicts: stored.conflicts,
      latestDate: stored.latestDate,
      source: 'ECB',
    });
    return { outcome: 'succeeded' as const, inserted: stored.inserted, latestDate: stored.latestDate };
  });
}

function logAttempt(
  sqlite: DatabaseSync,
  trigger: 'scheduled' | 'on_demand',
  outcome: 'succeeded' | 'failed',
  latestDate: string | null,
  inserted: number,
  errorCode: string | null,
  at: Date,
): void {
  sqlite
    .prepare(
      'INSERT INTO exchange_rate_fetch(id,attempted_at,trigger_kind,outcome,latest_rate_date,inserted_count,error_code) VALUES(?,?,?,?,?,?,?)',
    )
    .run(newId(), at.toISOString(), trigger, outcome, latestDate, inserted, errorCode);
}

export type RateProposal = Readonly<{
  from: string;
  to: string;
  /** 1 `from` = rate `to` (exact decimal text, 10 decimals max). */
  rate: string;
  rateDate: string;
  source: 'ECB';
  stale: boolean;
  businessDaysOld: number;
}>;

/**
 * ECB cross rate for a document date: the latest published day on or before
 * `documentDate`. Null when either currency is not published by ECB (e.g. ARS)
 * or no rate is stored yet: the user then enters the rate manually.
 */
export function proposeExchangeRate(
  sqlite: DatabaseSync,
  from: string,
  to: string,
  documentDate: string,
  today = new Date().toISOString().slice(0, 10),
): RateProposal | null {
  if (!isCurrency(from) || !isCurrency(to) || from === to || !ISO_DATE.test(documentDate))
    return null;
  const quotes = [from, to].filter((code) => code !== 'EUR');
  const placeholders = quotes.map(() => '?').join(',');
  const day = sqlite
    .prepare(
      `SELECT rate_date FROM exchange_rate WHERE rate_date<=? AND quote_currency IN (${placeholders})
        GROUP BY rate_date HAVING COUNT(*)=? ORDER BY rate_date DESC LIMIT 1`,
    )
    .get(documentDate, ...quotes, quotes.length) as { rate_date: string } | undefined;
  if (!day) return null;
  const rows = sqlite
    .prepare(
      `SELECT quote_currency,rate_decimal FROM exchange_rate WHERE rate_date=? AND quote_currency IN (${placeholders})`,
    )
    .all(day.rate_date, ...quotes) as Array<{ quote_currency: string; rate_decimal: string }>;
  const legs = Object.fromEntries(rows.map((row) => [row.quote_currency, row.rate_decimal]));
  const rate = crossRate(from, to, legs, 10);
  if (!rate) return null;
  const reference = documentDate < today ? documentDate : today;
  const businessDaysOld = businessDaysBetween(day.rate_date, reference);
  return {
    from,
    to,
    rate: formatDecimal(rate),
    rateDate: day.rate_date,
    source: 'ECB',
    stale: businessDaysOld > FX_STALE_BUSINESS_DAYS,
    businessDaysOld,
  };
}

export function lastExchangeRateFetch(sqlite: DatabaseSync): {
  attemptedAt: string;
  outcome: string;
  latestRateDate: string | null;
  errorCode: string | null;
} | null {
  const row = sqlite
    .prepare(
      'SELECT attempted_at,outcome,latest_rate_date,error_code FROM exchange_rate_fetch ORDER BY attempted_at DESC LIMIT 1',
    )
    .get() as
    | { attempted_at: string; outcome: string; latest_rate_date: string | null; error_code: string | null }
    | undefined;
  return row
    ? {
        attemptedAt: row.attempted_at,
        outcome: row.outcome,
        latestRateDate: row.latest_rate_date,
        errorCode: row.error_code,
      }
    : null;
}
