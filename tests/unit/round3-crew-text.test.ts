import { describe, expect, it } from 'vitest';
import { localeDecimalHoursFromMinutes } from '../../apps/portal/src/lib/portal/minute-hours';
import { parseHoursText } from '../../apps/portal/src/lib/portal/sections/time-hours';
import { timeWeekText } from '../../apps/portal/src/lib/portal/sections/time-week-copy';
import { hubText } from '../../apps/portal/src/lib/portal/project-hub-copy';
import { quickInvoiceWarningText } from '../../apps/portal/src/lib/portal/billing-quick-invoice-copy';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

describe('round 3 text: locale decimal hours (T49)', () => {
  it('uses the locale decimal separator on screen and still parses back', () => {
    expect(localeDecimalHoursFromMinutes(90, 'en')).toBe('1.5');
    expect(localeDecimalHoursFromMinutes(90, 'pt')).toBe('1,5');
    expect(localeDecimalHoursFromMinutes(90, 'es')).toBe('1,5');
    expect(localeDecimalHoursFromMinutes(480, 'pt')).toBe('8');
    expect(localeDecimalHoursFromMinutes(7290, 'pt')).toBe('121,5');
    for (const locale of ['en', 'es', 'pt'])
      expect(parseHoursText(localeDecimalHoursFromMinutes(560, locale))).toBe(560);
  });

  it('invoice warnings print hours with the locale separator', () => {
    const warning = { code: 'overtime_rate_missing', count: 1, minutes: 90 };
    const pt = quickInvoiceWarningText('pt', warning);
    if (pt !== null) expect(pt).not.toContain('1.5');
  });
});

describe('round 3 text: singular and plural', () => {
  it('time overview chips and scope read "1 weekend day", "1 entry"', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(timeWeekText(locale, 'ovWeekend', { n: 1 })).not.toMatch(/^1 \S+s\b/u);
      expect(timeWeekText(locale, 'ovMissing', { n: 1 })).toMatch(/^1 /u);
    }
    expect(timeWeekText('en', 'ovWeekend', { n: 1 })).toBe('1 weekend day');
    expect(timeWeekText('en', 'ovWeekend', { n: 2 })).toBe('2 weekend days');
    expect(timeWeekText('pt', 'ovWeekend', { n: 1 })).toBe('1 dia de fim de semana');
    expect(timeWeekText('es', 'ovScopeEntries', { n: 1 })).toBe('1 registro');
    expect(timeWeekText('es', 'ovScopeEntries', { n: 3 })).toBe('3 registros');
    expect(
      timeWeekText('en', 'ovScope', {
        range: 'Nov 2026',
        entries: timeWeekText('en', 'ovScopeEntries', { n: 1 }),
        groups: timeWeekText('en', 'ovScopeRows', { n: 1 }),
      }),
    ).toBe('Nov 2026 · 1 entry · 1 row');
  });

  it('record counts have singular labels in ES/PT', () => {
    expect(portalText('es', 'record')).toBe('registro');
    expect(portalText('pt', 'record')).toBe('registro');
    expect(portalText('pt', 'matching record')).toBe('registro correspondente');
    expect(portalText('es', 'entry')).toBe('registro');
    expect(portalText('pt', 'event')).toBe('evento');
  });

  it('End assignment offers a singular line for one later hour entry', () => {
    expect(hubText('en', 'endResolveLaterOne')).toMatch(/^1 hour entry /u);
    expect(hubText('pt', 'endResolveLaterOne')).toMatch(/^Há 1 registro de horas/u);
    expect(hubText('es', 'endResolveLaterNeeded')).not.toBe('endResolveLaterNeeded');
  });
});

describe('round 3 text: pt-BR wording (T78)', () => {
  it('the crew receipt split card has no pt-PT words', () => {
    const text = portalText(
      'pt',
      'Record crew hours above first. After an eligible time row is saved, add a receipt expense for one delegated worker. Then select that expense here and split its amount across at least two crew time rows. The receipt stays',
    );
    expect(text).not.toMatch(/comprovativo|guardar|continua a ser/u);
    expect(text).toContain('comprovante');
  });
});
