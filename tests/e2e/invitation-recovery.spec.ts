import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

const messages = {
  en: {
    offline:
      'You are offline. Reconnect and try again. Your name and password are still in the form.',
    network:
      'We could not confirm activation. Check your connection and try again. If you already activated the account, return to sign in.',
    success: 'Account activated. You can sign in now.',
    temporary:
      'Activation is temporarily unavailable. Please try again. Your name and password are still in the form.',
    limited:
      'Too many activation attempts. Wait before trying again. Your name and password are still in the form.',
    unavailable:
      'This invitation could not be activated. It may have expired or already been used. Return to sign in if you activated it, or ask an owner for a new invitation.',
  },
  es: {
    offline:
      'Estás sin conexión. Vuelve a conectarte e inténtalo de nuevo. Tu nombre y contraseña siguen en el formulario.',
    network:
      'No pudimos confirmar la activación. Comprueba la conexión e inténtalo de nuevo. Si ya activaste la cuenta, vuelve a iniciar sesión.',
    success: 'Cuenta activada. Ya puedes iniciar sesión.',
    temporary:
      'La activación no está disponible temporalmente. Inténtalo de nuevo. Tu nombre y contraseña siguen en el formulario.',
    limited:
      'Demasiados intentos de activación. Espera antes de intentarlo de nuevo. Tu nombre y contraseña siguen en el formulario.',
    unavailable:
      'No se pudo activar esta invitación. Puede haber caducado o haberse usado. Si ya activaste la cuenta, vuelve a iniciar sesión; si no, pide al propietario una nueva invitación.',
  },
  pt: {
    offline:
      'Você está sem conexão. Reconecte-se e tente novamente. Seu nome e senha continuam no formulário.',
    network:
      'Não foi possível confirmar a ativação. Verifique a conexão e tente novamente. Se já ativou a conta, volte para entrar.',
    success: 'Conta ativada. Você já pode entrar.',
    temporary:
      'A ativação está temporariamente indisponível. Tente novamente. Seu nome e senha continuam no formulário.',
    limited:
      'Muitas tentativas de ativação. Aguarde antes de tentar novamente. Seu nome e senha continuam no formulário.',
    unavailable:
      'Não foi possível ativar este convite. Ele pode ter expirado ou já ter sido usado. Se já ativou a conta, volte para entrar; caso contrário, peça um novo convite ao proprietário.',
  },
} as const;

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`invitation retains offline and network-failed inputs, activates on retry, and explains reuse in ${locale}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await signIn(page, 'owner');
    await page.goto(portal('/projects?view=team&lang=en'), { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Access method', exact: true })
      .selectOption({ label: 'Invitation link' });
    const invitation = page.locator('form[action="?view=team&/createInvitation"]');
    await invitation
      .locator('[name="email"]')
      .fill(`invitation-recovery-${randomUUID()}@example.test`);
    await invitation.locator('[name="role"]').selectOption('worker');
    await invitation.locator('[name="emailChoice"]').selectOption('no');
    await invitation.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const link = page.locator('[data-invitation-result] a');
    await expect(link).toBeVisible();
    const url = new URL((await link.getAttribute('href'))!, page.url());
    url.searchParams.set('lang', locale);
    await page.goto(url.toString(), { waitUntil: 'networkidle' });
    const name = 'UI invitation recovery';
    const password = `Audit!${randomUUID()}`;
    const nameInput = page.locator('input[autocomplete="name"]');
    const passwordInput = page.locator('input[autocomplete="new-password"]');
    const submit = page.locator('form button');
    await nameInput.fill(name);
    await passwordInput.fill(password);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.setOffline(true);
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText(messages[locale].offline);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(submit).toBeEnabled();
    await expect(nameInput).toHaveValue(name);
    await expect(passwordInput).toHaveValue(password);
    await context.setOffline(false);

    await page.route('**/app/api/invitations/accept', (route) => route.abort(), { times: 1 });
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText(messages[locale].network);
    await expect(submit).toBeEnabled();
    await expect(nameInput).toHaveValue(name);
    await expect(passwordInput).toHaveValue(password);
    await page.route(
      '**/app/api/invitations/accept',
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Activation temporarily unavailable' }),
        }),
      { times: 1 },
    );
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText(messages[locale].temporary);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(submit).toBeEnabled();
    await expect(nameInput).toHaveValue(name);
    await expect(passwordInput).toHaveValue(password);
    await page.route(
      '**/app/api/invitations/accept',
      (route) =>
        route.fulfill({
          status: 429,
          headers: { 'retry-after': '2' },
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many authentication attempts' }),
        }),
      { times: 1 },
    );
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText(messages[locale].limited);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(submit).toBeDisabled();
    await expect(nameInput).toHaveValue(name);
    await expect(passwordInput).toHaveValue(password);
    await expect(submit).toBeEnabled({ timeout: 5000 });
    let accepted = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith('/api/invitations/accept'),
      );
      await submit.click();
      const response = await pending;
      if (response.status() === 503) {
        await expect(page.getByRole('alert')).toHaveText(messages[locale].temporary);
        await expect(page.getByRole('alert')).toBeFocused();
        await expect(submit).toBeEnabled();
        await expect(nameInput).toHaveValue(name);
        await expect(passwordInput).toHaveValue(password);
        continue;
      }
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ accepted: true });
      accepted = true;
      break;
    }
    expect(accepted, 'activation must eventually commit after manual UI retries').toBe(true);
    await expect(page.getByRole('status')).toHaveText(messages[locale].success);
    await expect(submit).toBeDisabled();

    await page.reload({ waitUntil: 'networkidle' });
    await nameInput.fill(name);
    await passwordInput.fill(password);
    const reused = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/invitations/accept'),
    );
    await submit.click();
    expect((await reused).status()).toBe(400);
    await expect(page.getByRole('alert')).toHaveText(messages[locale].unavailable);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(submit).toBeEnabled();
    await expect(nameInput).toHaveValue(name);
    await expect(passwordInput).toHaveValue(password);
    expect(errors).toEqual([]);
  });
}
