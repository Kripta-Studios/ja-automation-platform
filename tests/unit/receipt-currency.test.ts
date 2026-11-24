import { describe, expect, it } from 'vitest';
import {
  receiptCurrencyFromText,
  receiptFactsFromText,
} from '../../apps/portal/src/lib/portal/expense-evidence';

describe('receipt currency (T22)', () => {
  it('reads the currency code or an unambiguous symbol printed on the receipt', () => {
    expect(receiptCurrencyFromText('OXXO\nTOTAL MXN 1,250.00\nGracias')).toBe('MXN');
    expect(receiptCurrencyFromText('Restaurante\nTotal $ 450.00 M.N.')).toBe('MXN');
    expect(receiptCurrencyFromText('Total a pagar MX$ 89.90')).toBe('MXN');
    expect(receiptCurrencyFromText('IMPORTE 89,90 pesos mexicanos')).toBe('MXN');
    expect(receiptCurrencyFromText('Valor total R$ 2.940,00')).toBe('BRL');
    expect(receiptCurrencyFromText('Gesamt 12,50 €')).toBe('EUR');
    expect(receiptCurrencyFromText('Amount due US$ 35.50')).toBe('USD');
    expect(receiptCurrencyFromText('TOTAL USD 35.50')).toBe('USD');
  });

  it('does not guess from a bare "$" or from two equally present currencies', () => {
    expect(receiptCurrencyFromText('TOTAL $ 1,250.00')).toBeUndefined();
    expect(receiptCurrencyFromText('USD 10.00 = MXN 200.00')).toBeUndefined();
    expect(receiptCurrencyFromText('no currency here 12.00')).toBeUndefined();
  });

  it('returns the currency together with the amount', () => {
    expect(
      receiptFactsFromText('TACOS EL PASTOR\nTOTAL MXN 1,250.00', {
        locale: 'es',
        today: '2026-11-23',
      }),
    ).toMatchObject({ amount: '1250.00', currency: 'MXN' });
  });
});
