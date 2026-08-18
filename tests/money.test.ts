import { describe, expect, it } from 'vitest';
import { applyBasisPoints, divideRounded, hourlyRateForMinutes, money, toJson } from '@ja/money';
describe('exact money', () => {
  it('rounds half away from zero', () => {
    expect(divideRounded(1n, 2n)).toBe(1n);
    expect(divideRounded(-1n, 2n)).toBe(-1n);
  });
  it('calculates minute rates and taxes with integers', () => {
    const subtotal = hourlyRateForMinutes(money('USD', 10_001n), 90);
    expect(subtotal.minorUnits).toBe(15_002n);
    expect(applyBasisPoints(subtotal, 725).minorUnits).toBe(1_088n);
    expect(toJson(subtotal).minorUnits).toBe('15002');
  });
});
