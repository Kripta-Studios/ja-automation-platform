import { describe, expect, it } from 'vitest';
import {
  formatPortalDate,
  formatPortalDuration,
  formatPortalMoney,
  formatPortalNumber,
} from './format';

describe('portal locale formatters', () => {
  it('formats dates with the requested document locale', () => {
    const value = new Date('2026-08-22T00:00:00.000Z');
    expect(formatPortalDate(value, 'es', { timeZone: 'UTC' })).toContain('22');
    expect(formatPortalDate(value, 'pt', { timeZone: 'UTC' })).toContain('22');
    expect(formatPortalDate(value, 'en', { timeZone: 'UTC' })).toMatch(/2026|22/);
  });

  it('formats numbers and money without binary-money arithmetic', () => {
    expect(formatPortalNumber(1234.5, 'es')).toMatch(/1[.\u00a0]234,5/);
    expect(formatPortalMoney(123450, 'es', 'EUR')).toContain('1.234,50');
    expect(formatPortalMoney(123450, 'pt', 'BRL')).toContain('1.234,50');
  });

  it('formats duration minutes consistently', () => {
    expect(formatPortalDuration(135, 'es')).toBe('2 h 15 min');
    expect(formatPortalDuration(135, 'pt')).toBe('2 h 15 min');
  });
});
