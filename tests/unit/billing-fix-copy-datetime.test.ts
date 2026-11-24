import { describe, expect, it } from 'vitest';
import {
  billingDateTime,
  billingFixText,
} from '../../apps/portal/src/lib/portal/billing-fix-copy';

describe('T64 billing registers: readable timestamps and codes', () => {
  it('never shows a raw ISO timestamp', () => {
    const text = billingDateTime('2026-11-23T09:13:29.150Z', 'en');
    expect(text).not.toContain('T09:13');
    expect(text).not.toContain('Z');
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/Nov/);
  });

  it('reads SQLite timestamps as UTC and keeps date-only values a calendar day', () => {
    expect(billingDateTime('2026-11-23 09:13:29', 'es')).toMatch(/2026/);
    expect(billingDateTime('2026-11-23 09:13:29', 'es')).not.toContain('09:13:29');
    expect(billingDateTime('2026-11-30', 'en')).toBe('Nov 30, 2026');
    expect(billingDateTime('2026-11-30', 'pt')).toContain('30');
  });

  it('returns empty or unreadable values unchanged', () => {
    expect(billingDateTime('', 'en')).toBe('');
    expect(billingDateTime(null, 'en')).toBe('');
    expect(billingDateTime('not a date', 'en')).toBe('not a date');
  });

  it('translates settlement codes in every language', () => {
    for (const locale of ['en', 'es', 'pt']) {
      expect(billingFixText(locale, 'settlementBasis_APPROVED_TIME')).not.toContain('_');
      expect(billingFixText(locale, 'settlementState_reviewed')).not.toBe('reviewed');
      expect(billingFixText(locale, 'packCountOne')).toMatch(/^1 /);
    }
    expect(
      billingFixText('es', 'confirmRegisterSettlementPayment', {
        amount: 'USD 120.00',
        name: 'Gabriel Lamoglia',
        date: '2026-11-23',
      }),
    ).toBe('¿Registrar el pago de USD 120.00 a Gabriel Lamoglia el 2026-11-23?');
  });
});
