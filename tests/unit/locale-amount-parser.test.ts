import { describe, expect, it } from 'vitest';
import {
  amountPattern,
  inputTextToMinor,
  normalizeAmountText,
} from '../../apps/portal/src/lib/portal/payment-money';

describe('locale amount parser (T56)', () => {
  it('accepts the formats the app displays in en, es and pt', () => {
    for (const [text, expected] of [
      ['2940', '2940'],
      ['2940,00', '2940,00'.replace(',', '.')],
      ['2940.5', '2940.5'],
      ['2.940,00', '2940.00'],
      ['2,940.00', '2940.00'],
      ['2 940,00', '2940.00'],
      ['2 940,00', '2940.00'],
      ['1.234.567,89', '1234567.89'],
      ['1,250', '1250'],
      ['0,50', '0.50'],
    ] as const)
      expect(normalizeAmountText(text, 'MXN'), text).toBe(expected);
  });

  it('rejects malformed text instead of guessing', () => {
    for (const text of ['', 'abc', '12,3456', '1.2.3', '2,94,0.00', '12,', '1.234,5.6', '-5'])
      expect(normalizeAmountText(text, 'USD'), text).toBeUndefined();
    expect(normalizeAmountText('1500,5', 'JPY')).toBeUndefined();
    expect(normalizeAmountText('1.500', 'JPY')).toBe('1500');
  });

  it('converts to exact minor units and the input pattern agrees', () => {
    expect(inputTextToMinor('2.940,00', 'MXN')).toBe(294000n);
    expect(inputTextToMinor('2,940.05', 'USD')).toBe(294005n);
    expect(inputTextToMinor('1.500', 'JPY')).toBe(1500n);
    const pattern = new RegExp(amountPattern('MXN'), 'v');
    for (const text of ['2.940,00', '2,940.00', '2940,00', '2940', '2 940,00'])
      expect(pattern.test(text), text).toBe(true);
    expect(pattern.test('2,94,0.00')).toBe(false);
  });
});
