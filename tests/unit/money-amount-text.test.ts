import { describe, expect, it } from 'vitest';
import { canonicalMoneyAmountText } from '../../packages/database/src/domains/billing/money-amount-text';

describe('T56 typed money amounts (milestones)', () => {
  it.each([
    ['50000', '50000'],
    ['50,000', '50000'],
    ['50.000', '50000'],
    ['1,234,567.89', '1234567.89'],
    ['1.234.567,89', '1234567.89'],
    ['2.940,00', '2940.00'],
    ['2,940.00', '2940.00'],
    ['50 000', '50000'],
    ['1234,5', '1234.5'],
    ['1234.56', '1234.56'],
    ['0,99', '0.99'],
    ['007', '7'],
  ])('reads %s as %s', (raw, expected) => {
    expect(canonicalMoneyAmountText(raw)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.2.3,4.5', '12,34,56', '1,2345', '1.234,567', '1,23.45', '=1+1'])(
    'refuses %s',
    (raw) => {
      expect(canonicalMoneyAmountText(raw)).toBeNull();
    },
  );
});
