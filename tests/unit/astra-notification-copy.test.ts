import { describe, expect, it } from 'vitest';
import {
  normalizeNotificationLocale,
  notificationCopy,
} from '../../apps/portal/src/lib/server/notification-copy.ts';

describe('ASTRA notification copy', () => {
  it('keeps the missing-time action scoped to one project and date', () => {
    expect(notificationCopy('missing_time', 'en')).toEqual({
      subject: 'Missing time entry reminder',
      body: expect.stringContaining('Submit time for this project/date'),
    });
  });

  it('provides the supported localized approval and financial copy', () => {
    expect(notificationCopy('approval_returned_expense', 'es').subject).toBe('Gasto devuelto');
    expect(notificationCopy('invoice_overdue', 'pt').subject).toBe('Fatura vencida');
    expect(notificationCopy('period_blocked', 'en').body).toMatch(/blocked/i);
  });

  it('falls back explicitly to English for an unsupported recipient locale or kind', () => {
    expect(normalizeNotificationLocale('fr')).toBe('en');
    expect(notificationCopy('future_kind', 'fr')).toEqual({
      subject: 'J&A Automation notification',
      body: 'Sign in to the J&A Automation portal to review the current record.',
    });
  });

  it('localizes the generic fallback for supported recipient locales', () => {
    expect(notificationCopy('future_kind', 'es')).toEqual({
      subject: 'Notificación de J&A Automation',
      body: 'Entra en el portal de J&A Automation para revisar el registro actual.',
    });
    expect(notificationCopy('future_kind', 'pt')).toEqual({
      subject: 'Notificação da J&A Automation',
      body: 'Entre no portal J&A Automation para rever o registo atual.',
    });
  });
});
