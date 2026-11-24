export type ReceiptState = 'missing' | 'attached' | 'not_required';

/** One operational search contract for the register and its authorized export. */
export function expenseSearchMatches(
  row: Readonly<Record<string, unknown>>,
  query: string,
): boolean {
  const normalize = (value: unknown) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase();
  const needle = normalize(query).trim();
  return (
    !needle ||
    [
      'vendor',
      'project_number',
      'project_name',
      'client_name',
      'description',
      'spent_on',
      'worker_name',
      'category',
      'currency',
    ].some((field) => normalize(row[field]).includes(needle))
  );
}

/** Uses only the operational receipt metadata allowed to every expense reviewer. */
export function expenseReceiptState(row: Readonly<Record<string, unknown>>): ReceiptState {
  if (typeof row.receipt_document_id === 'string' && row.receipt_document_id.trim())
    return 'attached';
  return row.receipt_required === true || row.receipt_required === 1 || row.receipt_required === '1'
    ? 'missing'
    : 'not_required';
}

export const receiptStateLabels: Record<ReceiptState, string> = {
  missing: 'Required receipt missing',
  attached: 'Receipt attached',
  not_required: 'Receipt not required',
};

export type ReceiptFacts = {
  amount?: string;
  date?: string;
  /** ISO code printed on the receipt ("MXN", "R$", "€"); absent when unclear (bare "$"). */
  currency?: string;
};

/**
 * Currency printed on a receipt (T22: an MXN receipt was saved as USD, ~20x over).
 * Codes and unambiguous symbols only. A bare "$" is used by USD, MXN, CAD, ARS…,
 * so it never picks a currency: the form then asks the person to check it.
 */
export function receiptCurrencyFromText(text: string): string | undefined {
  const source = text.slice(0, 20_000);
  const counts = new Map<string, number>();
  const add = (code: string, weight = 1) => counts.set(code, (counts.get(code) ?? 0) + weight);
  for (const match of source.matchAll(/\b(USD|EUR|MXN|BRL|CAD|GBP|CHF|ARS|CNY|JPY|RMB)\b/gu))
    add(match[1] === 'RMB' ? 'CNY' : match[1]!, 2);
  for (const match of source.matchAll(/\b(MX\$|M\.N\.|US\$|U\$S|C\$|CA\$|R\$|AR\$)/gu)) {
    const symbol = match[1]!;
    add(
      symbol === 'MX$' || symbol === 'M.N.'
        ? 'MXN'
        : symbol === 'US$' || symbol === 'U$S'
          ? 'USD'
          : symbol === 'R$'
            ? 'BRL'
            : symbol === 'AR$'
              ? 'ARS'
              : 'CAD',
      2,
    );
  }
  for (const match of source.matchAll(/(R\$|€|£|¥)/gu)) {
    const symbol = match[1]!;
    if (symbol === 'R$') continue; // counted above
    add(symbol === '€' ? 'EUR' : symbol === '£' ? 'GBP' : 'JPY');
  }
  if (/pesos?\s+mexicanos?|moneda\s+nacional/iu.test(source)) add('MXN', 2);
  if (/\breais\b|\breal\s+brasileiro/iu.test(source)) add('BRL', 2);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return undefined;
  // Two currencies equally present (e.g. "USD 10 = MXN 200"): do not guess.
  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return undefined;
  return ranked[0]![0];
}

/** Normalize "1.234,56" / "1,234.56" / "12,50" / "12.5" into an exact "1234.56" decimal string. */
export function normalizeReceiptAmount(raw: string): string | undefined {
  const value = raw.replace(/[^\d.,]/gu, '');
  if (!/\d/u.test(value)) return undefined;
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);
  let whole = value;
  let fraction = '';
  if (decimalAt >= 0 && value.length - decimalAt - 1 >= 1 && value.length - decimalAt - 1 <= 2) {
    whole = value.slice(0, decimalAt);
    fraction = value.slice(decimalAt + 1);
  }
  whole = whole.replace(/[.,]/gu, '');
  if (!/^\d{1,9}$/u.test(whole) || !/^\d{0,2}$/u.test(fraction)) return undefined;
  const normalized = `${String(Number(whole))}${fraction ? `.${fraction.padEnd(2, '0')}` : ''}`;
  return /^0(\.0+)?$/u.test(normalized) ? undefined : normalized;
}

function validIsoDate(year: number, month: number, day: number, today: string): string | undefined {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined;
  const iso = date.toISOString().slice(0, 10);
  const oldest = new Date(`${today}T00:00:00Z`);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - 1);
  return iso <= today && iso >= oldest.toISOString().slice(0, 10) ? iso : undefined;
}

/**
 * Best-effort facts from receipt text (local OCR) or a file name. Only a
 * suggestion: the form shows it for the person to confirm and never saves it
 * on its own. Day-first dates are preferred for es/pt, month-first for en.
 */
export function receiptFactsFromText(
  text: string,
  options: { locale?: 'en' | 'es' | 'pt'; today: string },
): ReceiptFacts {
  const facts: ReceiptFacts = {};
  const source = text.slice(0, 20_000);
  const iso = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/u.exec(source);
  if (iso) facts.date = validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), options.today);
  if (!facts.date) {
    const local = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/u.exec(source);
    if (local) {
      const [a, b, y] = [Number(local[1]), Number(local[2]), Number(local[3])];
      const dayFirst = options.locale !== 'en' || a > 12;
      facts.date = dayFirst
        ? (validIsoDate(y, b, a, options.today) ?? validIsoDate(y, a, b, options.today))
        : (validIsoDate(y, a, b, options.today) ?? validIsoDate(y, b, a, options.today));
    }
  }
  const money = /(\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/gu;
  const totalLine =
    /\b(total(?:\s+a\s+pagar|\s+due|\s+geral)?|importe|valor\s+total|amount\s+due|grand\s+total|a\s+pagar)\b/iu;
  const lines = source.split(/\r?\n/u);
  for (const line of lines) {
    if (!totalLine.test(line) || /subtotal|sub-total/iu.test(line)) continue;
    const found = [...line.matchAll(money)].map((match) => normalizeReceiptAmount(match[1]!));
    const last = found.filter(Boolean).at(-1);
    if (last) facts.amount = last;
  }
  if (!facts.amount) {
    let best: { value: string; minor: bigint } | undefined;
    for (const match of source.matchAll(money)) {
      const value = normalizeReceiptAmount(match[1]!);
      if (!value) continue;
      const [w, f = ''] = value.split('.');
      const minor = BigInt(`${w}${f.padEnd(2, '0')}`);
      if (!best || minor > best.minor) best = { value, minor };
    }
    if (best) facts.amount = best.value;
  }
  const currency = receiptCurrencyFromText(source);
  if (currency) facts.currency = currency;
  return facts;
}

/** File names like "2026-11-14_hotel_89.90.jpg" or "recibo 12,50.png". */
export function receiptFactsFromFileName(name: string, today: string): ReceiptFacts {
  const stem = name.replace(/\.[a-z0-9]{2,5}$/iu, '');
  const facts: ReceiptFacts = {};
  const iso = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/u.exec(stem);
  if (iso) facts.date = validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), today);
  const rest = iso ? stem.replace(iso[0], ' ') : stem;
  const amount = /(?:^|[^\d])(\d{1,7}[.,]\d{2})(?!\d)/u.exec(rest);
  if (amount) facts.amount = normalizeReceiptAmount(amount[1]!);
  return facts;
}
