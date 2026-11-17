import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  convertExact,
  crossRate,
  currencyMinorDigits,
  divideDecimals,
  formatDecimal,
  formatMinorPlain,
  impliedRate,
  isCurrency,
  money,
  parseMajorToMinor,
  parseRate,
  totalsByCurrency,
} from '@ja/money';
import { formatPortalMoney } from '../apps/portal/src/lib/i18n/format';

describe('curated currencies and minor units', () => {
  it('lists ten ISO codes with per-currency exponents', () => {
    expect(CURRENCIES).toEqual(['USD', 'EUR', 'MXN', 'BRL', 'CAD', 'GBP', 'CHF', 'ARS', 'CNY', 'JPY']);
    expect(currencyMinorDigits('JPY')).toBe(0);
    expect(currencyMinorDigits('MXN')).toBe(2);
    expect(isCurrency('MXN')).toBe(true);
    expect(isCurrency('mxn')).toBe(false);
    expect(isCurrency('XYZ')).toBe(false);
    expect(() => currencyMinorDigits('XYZ')).toThrow(RangeError);
  });

  it('parses typed major units exactly per currency', () => {
    expect(parseMajorToMinor('1234.5', 'USD')).toBe(123_450n);
    expect(parseMajorToMinor('1234,56', 'MXN')).toBe(123_456n);
    expect(parseMajorToMinor('1500', 'JPY')).toBe(1_500n);
    expect(parseMajorToMinor('1500.5', 'JPY')).toBeNull();
    expect(parseMajorToMinor('1.234', 'EUR')).toBeNull();
    expect(parseMajorToMinor('-1', 'EUR')).toBeNull();
    expect(parseMajorToMinor('10', 'XYZ')).toBeNull();
  });

  it('formats plain and localized amounts with the right decimals', () => {
    expect(formatMinorPlain(123_456n, 'MXN')).toBe('1234.56');
    expect(formatMinorPlain(-5n, 'USD')).toBe('-0.05');
    expect(formatMinorPlain(1_500n, 'JPY')).toBe('1500');
    expect(formatPortalMoney(1_500n, 'en', 'JPY')).toBe('¥1,500');
    expect(formatPortalMoney(123_456n, 'en', 'MXN')).toMatch(/1,234\.56/u);
    expect(formatPortalMoney(123_456n, 'es', 'EUR')).toMatch(/1\.234,56/u);
  });

  it('never mixes currencies in totals', () => {
    expect(
      totalsByCurrency([
        money('USD', 100n),
        money('MXN', 5_000n),
        money('USD', 250n),
        money('JPY', 1_000n),
      ]),
    ).toEqual([
      { currency: 'USD', minorUnits: 350n },
      { currency: 'MXN', minorUnits: 5_000n },
      { currency: 'JPY', minorUnits: 1_000n },
    ]);
  });
});

describe('exact conversion', () => {
  it('parses and prints exact decimal rates', () => {
    expect(parseRate('0.054400')).toEqual({ units: 544n, scale: 4 });
    expect(formatDecimal(parseRate('19.4210')!)).toBe('19.421');
    expect(parseRate('0')).toBeNull();
    expect(parseRate('1e3')).toBeNull();
    expect(parseRate('-1')).toBeNull();
  });

  it('converts between currencies with different exponents, rounding once half away from zero', () => {
    expect(convertExact(money('MXN', 100_000n), '0.0544', 'USD').target).toEqual(money('USD', 5_440n));
    expect(convertExact(money('USD', 1_000n), '151.37', 'JPY').target).toEqual(money('JPY', 1_514n));
    expect(convertExact(money('JPY', 1_500n), '0.006119', 'EUR').target).toEqual(money('EUR', 918n));
    // 0.005 rounds up, never banker's rounding
    expect(convertExact(money('USD', 1n), '0.5', 'EUR').target.minorUnits).toBe(1n);
    expect(() => convertExact(money('USD', 1n), '1', 'USD')).toThrow(RangeError);
    expect(() => convertExact(money('USD', 1n), '0', 'EUR')).toThrow(RangeError);
  });

  it('derives ECB cross rates exactly from EUR legs', () => {
    const legs = { USD: '1.0567', MXN: '19.4210', JPY: '163.42' };
    // MXN->USD = 1.0567 / 19.4210 = 0.05441017455...
    expect(formatDecimal(crossRate('MXN', 'USD', legs)!)).toBe('0.0544101746');
    expect(formatDecimal(crossRate('EUR', 'USD', legs)!)).toBe('1.0567');
    expect(formatDecimal(crossRate('USD', 'EUR', legs)!)).toBe('0.9463423867');
    expect(formatDecimal(crossRate('USD', 'JPY', legs)!)).toBe('154.6512728305');
    expect(crossRate('ARS', 'USD', legs)).toBeNull();
    expect(divideDecimals({ units: 2n, scale: 0 }, { units: 3n, scale: 0 }, 4)).toEqual({ units: 6667n, scale: 4 });
  });

  it('reports the implied rate of a manually typed amount', () => {
    expect(impliedRate(money('MXN', 100_000n), money('USD', 5_500n))).toBe('0.055');
    expect(impliedRate(money('USD', 1_000n), money('JPY', 1_500n))).toBe('150');
  });
});
