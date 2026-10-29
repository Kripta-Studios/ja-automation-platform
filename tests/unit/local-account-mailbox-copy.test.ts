import { describe, expect, it } from 'vitest';
import { portalText, renderPortalMessage } from '../../apps/portal/src/lib/portal-i18n';

describe('mailbox creation messages', () => {
  it.each(['en', 'es', 'pt'] as const)('renders account and mailbox outcomes in %s', (locale) => {
    for (const key of [
      'problem.access.localMailboxEmail',
      'problem.access.localMailboxExists',
      'problem.access.localMailboxUnavailable',
      'problem.access.localMailboxPending',
      'action.access.localAccount.withMailbox',
    ]) {
      const rendered = renderPortalMessage(locale, key, { email: 'person@j-aautomation.com' });
      expect(rendered).not.toBe(key);
      expect(rendered).not.toContain('{email}');
      if (key.endsWith('Pending')) expect(rendered).toContain('person@j-aautomation.com');
    }
    expect(portalText(locale, 'Create a mailbox for this user')).toBe(
      locale === 'en'
        ? 'Create a mailbox for this user'
        : locale === 'es'
          ? 'Crear un buzón de correo para este usuario'
          : 'Criar uma caixa de correio para este usuário',
    );
  });
});
