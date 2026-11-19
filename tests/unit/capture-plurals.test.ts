import { describe, expect, it } from 'vitest';
import { timeWeekText } from '../../apps/portal/src/lib/portal/sections/time-week-copy';
import { approvalQueueText } from '../../apps/portal/src/lib/portal/sections/approval-queue-copy';
import { navigationUxText } from '../../apps/portal/src/lib/portal/navigation-ux-copy';
import { expenseCopy } from '../../apps/portal/src/lib/portal/sections/expense-copy';
import { clockHoursFromMinutes } from '../../apps/portal/src/lib/portal/minute-hours';

describe('capture copy reads as sentences in every language', () => {
  it('week status counts days with singular and plural forms', () => {
    expect(timeWeekText('es', 'countSubmitted', { n: 1 })).toBe('1 día enviado');
    expect(timeWeekText('es', 'countEmpty', { n: 3 })).toBe('3 días sin horas');
    expect(timeWeekText('pt', 'countSubmitted', { n: 1 })).toBe('1 dia enviado');
    expect(timeWeekText('en', 'countNeedsChanges', { n: 1 })).toBe('1 day needs changes');
    expect(timeWeekText('en', 'countDraft', { n: 2 })).toBe('2 days not submitted');
  });
  it('never says "1 matching destinations" or "1 of your own entries need"', () => {
    expect(navigationUxText('en', 'sectionNavigator', 'resultCount', { count: 1 })).toBe(
      '1 matching destination',
    );
    expect(navigationUxText('es', 'sectionNavigator', 'resultCount', { count: 4 })).toBe(
      '4 destinos coincidentes',
    );
    expect(approvalQueueText('en', 'ownExcluded', { count: 1 })).toBe(
      '1 of your own entries needs another reviewer.',
    );
    expect(approvalQueueText('pt', 'ownExcluded', { count: 2 })).toBe(
      '2 registros seus precisam de outro revisor.',
    );
  });
  it('"Add several" offers Save & send N expenses', () => {
    expect(expenseCopy('en', 'saveSendAll', { n: 1 })).toBe('Save & send 1 expense');
    expect(expenseCopy('es', 'saveSendAll', { n: 3 })).toBe('Guardar y enviar 3 gastos');
    expect(expenseCopy('pt', 'saveOthers', { rows: 'Despesa 2', n: 1 })).toBe(
      'Remover Despesa 2 e salvar a outra',
    );
  });
  it('Home hours are H:MM', () => {
    expect(clockHoursFromMinutes(465)).toBe('7:45');
    expect(clockHoursFromMinutes(540)).toBe('9:00');
  });
});
