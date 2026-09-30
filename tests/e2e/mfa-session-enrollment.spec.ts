import { createHmac, randomUUID } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

function authenticatorCode(uri: string): string {
  const encoded = new URL(uri).searchParams.get('secret')!;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...encoded]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function logout(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Account options', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Log out/ }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/login'));
  await page.waitForLoadState('networkidle');
}

test('password Worker manages optional MFA by live session and recovery codes remain single use', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const suffix = randomUUID();
  const name = `Browser MFA Worker ${suffix}`;
  const email = `mfa-${suffix}@example.test`;
  const password = `Audit!${randomUUID()}`;
  await signIn(page, 'owner');
  await page.goto(portal('/projects?view=team&lang=en'), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create user', exact: true }).click();
  const create = page.locator('form[action*="createLocalPortalUser"]');
  await create.locator('[name="name"]').fill(name);
  await create.locator('[name="email"]').fill(email);
  await create.getByLabel('Initial password').fill(password);
  await create.locator('[name="role"]').selectOption('worker');
  await create.getByRole('button', { name: 'Create user access', exact: true }).click();
  await page.getByLabel('Search team', { exact: true }).fill(name);
  await expect(
    page
      .locator('[data-worker-id]')
      .filter({ has: page.getByRole('heading', { name, exact: true }) }),
  ).toBeVisible();
  const workerContext = await browser.newContext({ viewport: info.project.use.viewport });
  const worker = await workerContext.newPage();
  const privateMaterial = info.outputPath('mfa-material.private.json');
  const privateState = info.outputPath('mfa-session.private.json');
  let uri = '';
  let recoveryCodes: string[] = [];
  async function checkpoint() {
    writeFileSync(privateMaterial, JSON.stringify({ email, password, uri, recoveryCodes }), {
      mode: 0o600,
    });
    chmodSync(privateMaterial, 0o600);
    await workerContext.storageState({ path: privateState });
    chmodSync(privateState, 0o600);
  }
  async function login() {
    await worker.goto(portal('/login?lang=en'), { waitUntil: 'networkidle' });
    await worker.getByLabel('Work email').fill(email);
    await worker.getByLabel('Password', { exact: true }).fill(password);
    await worker.getByRole('button', { name: 'Continue to workspace', exact: true }).click();
    await worker.waitForURL((url) => !url.pathname.endsWith('/login'));
    await worker.waitForLoadState('networkidle');
  }
  async function enroll() {
    await worker.getByRole('button', { name: 'Enable MFA', exact: true }).click();
    await expect(worker.locator('code.security-uri')).toBeVisible();
    uri = await worker.locator('code.security-uri').innerText();
    recoveryCodes = (await worker.getByLabel('One-time recovery codes').innerText()).split(' · ');
    expect(recoveryCodes).toHaveLength(10);
    await checkpoint();
    await worker.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(uri));
    await worker.getByRole('button', { name: 'Verify MFA', exact: true }).click();
    await expect(worker.getByRole('button', { name: 'Disable MFA', exact: true })).toBeVisible();
    await expect(worker.getByRole('button', { name: 'Enable MFA', exact: true })).toHaveCount(0);
    await checkpoint();
  }
  try {
    await login();
    await worker.goto(portal('/profile?lang=en'), { waitUntil: 'networkidle' });
    await enroll();
    await logout(worker);
    await login();
    await expect(worker).toHaveURL(/\/login\/two-factor/);
    await expect(
      worker.getByText(
        'You enabled MFA for this account. Enter your authenticator code to sign in.',
        { exact: true },
      ),
    ).toBeVisible();
    const verifyButton = worker.getByRole('button', { name: 'Verify and continue', exact: true });
    await worker.getByLabel('Six-digit code').fill('123456');
    await workerContext.setOffline(true);
    await verifyButton.click();
    await expect(worker.getByRole('alert')).toHaveText(
      'We could not confirm verification. Check your connection and try again. Your code is still in the form.',
    );
    await expect(worker.getByRole('alert')).toBeFocused();
    await expect(worker.getByLabel('Six-digit code')).toHaveValue('123456');
    await expect(verifyButton).toBeEnabled();
    await workerContext.setOffline(false);
    await worker.route(
      '**/app/api/auth/two-factor/verify-totp',
      (route) =>
        route.fulfill({
          status: 429,
          headers: { 'retry-after': '2' },
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many authentication attempts' }),
        }),
      { times: 1 },
    );
    await verifyButton.click();
    await expect(worker.getByRole('alert')).toHaveText(
      'Too many verification attempts. Wait before trying again. Your code is still in the form.',
    );
    await expect(worker.getByRole('alert')).toBeFocused();
    await expect(verifyButton).toBeDisabled();
    await expect(worker.getByLabel('Six-digit code')).toHaveValue('123456');
    await expect(verifyButton).toBeEnabled({ timeout: 5000 });
    await worker.getByLabel('Six-digit code').fill(authenticatorCode(uri));
    await worker.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    await worker.waitForURL((url) => !url.pathname.includes('/two-factor'));
    await worker.waitForLoadState('networkidle');
    await checkpoint();
    await logout(worker);
    await login();
    await worker.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
    await worker.getByLabel('Recovery code', { exact: true }).fill(recoveryCodes[0]!);
    await worker.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    await worker.waitForURL((url) => !url.pathname.includes('/two-factor'));
    await worker.waitForLoadState('networkidle');
    await checkpoint();
    await logout(worker);
    await login();
    await worker.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
    await worker.getByLabel('Recovery code', { exact: true }).fill(recoveryCodes[0]!);
    const rejected = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/two-factor/verify-backup-code'),
    );
    await worker.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    expect((await rejected).status()).toBe(401);
    await expect(worker.getByRole('alert')).toHaveText('The code was not accepted.');
    await expect(worker).toHaveURL(/\/login\/two-factor/);
    await worker.getByRole('button', { name: 'Use authenticator code', exact: true }).click();
    await worker.getByLabel('Six-digit code').fill(authenticatorCode(uri));
    await worker.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    await worker.waitForURL((url) => !url.pathname.includes('/two-factor'));
    await worker.goto(portal('/profile?lang=en'), { waitUntil: 'networkidle' });
    await worker.getByRole('button', { name: 'Disable MFA', exact: true }).click();
    await expect(worker.getByRole('button', { name: 'Enable MFA', exact: true })).toBeVisible();
    const previousUri = uri;
    await enroll();
    expect(uri).not.toBe(previousUri);
    await worker.getByRole('button', { name: 'Disable MFA', exact: true }).click();
    await expect(worker.getByRole('button', { name: 'Enable MFA', exact: true })).toBeVisible();
  } finally {
    await checkpoint();
    await workerContext.close();
  }
});
