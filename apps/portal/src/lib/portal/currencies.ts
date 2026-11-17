import { CURRENCIES, isCurrency, type Currency } from '@ja/billing-engine';

export { CURRENCIES, isCurrency, type Currency };

const intlLocale = (locale: string): string =>
  locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US';

/** Localized currency name ("Mexican Peso", "peso mexicano"); falls back to the code. */
export function currencyName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Picker label: "MXN · Mexican Peso". */
export function currencyOptionLabel(code: string, locale = 'en'): string {
  const name = currencyName(code, locale);
  return name && name !== code ? `${code} · ${name}` : code;
}

/** Curated list plus a legacy stored value (never drop a saved currency from the picker). */
export function currencyChoices(current?: string | null): string[] {
  const list: string[] = [...CURRENCIES];
  if (current && /^[A-Z]{3}$/u.test(current) && !list.includes(current)) list.push(current);
  return list;
}
