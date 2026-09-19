import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import {
  seedSupplierPersonas,
  signInManualPersona,
  type ManualPersonaAccount,
} from './manual-persona-fixture.js';

const guides = {
  owner: 'owner-reference',
  finance: 'finance-reference',
  manager: 'project-manager-reference',
  auditor: 'auditor-reference',
  worker: 'worker-reference',
  'supplier-coordinator': 'supplier-coordinator-reference',
  'external-technician': 'external-technician-reference',
} as const;
type Persona = keyof typeof guides;
const allGuides = Object.values(guides);

test('seven role guides have localized PDF assets and enforce role-scoped downloads', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  const pointer = readE2EFixturePointer();
  const personas: Array<{ persona: Persona; account: ManualPersonaAccount }> = [
    { persona: 'owner', account: 'owner' },
    { persona: 'finance', account: 'finance' },
    { persona: 'manager', account: 'manager' },
    { persona: 'auditor', account: 'auditor' },
    { persona: 'worker', account: 'worker' },
    { persona: 'supplier-coordinator', account: 'supplierCoordinator' },
    { persona: 'external-technician', account: 'worker2' },
  ];
  const checks: Array<{ persona: Persona; locale: 'en' | 'pt'; guide: string; status: number }> =
    [];
  for (const { persona, account } of personas) {
    if (persona === 'supplier-coordinator') seedSupplierPersonas(pointer.databasePath);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signInManualPersona(page, account);
      for (const locale of ['en', 'pt'] as const) {
        const help = await page.goto(portal(`/help?lang=${locale}`));
        expect(help?.status()).toBe(200);
        const allowed = persona === 'owner' ? allGuides : [guides[persona]];
        for (const guide of allowed) {
          const link = page.locator(`a[href*="/help/${guide}/download"]`);
          await expect(link, `${persona} ${locale} ${guide} visible in Help`).toBeVisible();
          const response = await page.request.get(portal(`/help/${guide}/download?lang=${locale}`));
          expect(response.status(), `${persona} ${locale} ${guide}`).toBe(200);
          expect(response.headers()['content-type']).toContain('application/pdf');
          expect(response.headers()['content-disposition']).toMatch(/attachment.*\.pdf/i);
          expect(response.headers()['x-help-manual-language']).toBe(locale);
          expect((await response.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
          checks.push({ persona, locale, guide, status: 200 });
        }
        if (persona !== 'owner') {
          const foreign = persona === 'worker' ? guides.finance : guides.owner;
          await expect(page.locator(`a[href*="/help/${foreign}/download"]`)).toHaveCount(0);
          const response = await page.request.get(
            portal(`/help/${foreign}/download?lang=${locale}`),
          );
          expect(response.status(), `${persona} must not download ${foreign}`).toBe(404);
          checks.push({ persona, locale, guide: foreign, status: 404 });
        }
      }
    } finally {
      await context.close();
    }
  }
  const unauthenticated = await browser.newContext();
  try {
    const response = await unauthenticated.request.get(
      portal(`/help/${guides.owner}/download?lang=pt`),
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(401);
  } finally {
    await unauthenticated.close();
  }
  await info.attach('role-guide-downloads.json', {
    body: JSON.stringify({ checks }, null, 2),
    contentType: 'application/json',
  });
  expect(checks.filter((check) => check.status === 200)).toHaveLength(26);
  expect(checks.filter((check) => check.status === 404)).toHaveLength(12);
});

test('Help retries a transient PDF outage and offers an actionable PT recovery after a persistent outage', async ({
  page,
}, info) => {
  await signIn(page, 'worker');
  const path = '/help/worker-reference/download';
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(path)) requests.push(request.method());
  });

  await page.goto(portal('/help?lang=en'));
  let transientAttempts = 0;
  await page.route(`**${path}?lang=en`, async (route) => {
    transientAttempts++;
    if (transientAttempts === 1)
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'Temporarily unavailable',
      });
    else await route.continue();
  });
  const download = page.waitForEvent('download');
  await page.locator(`a[href*="${path}"]`).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
  expect(transientAttempts).toBe(2);
  await expect(page.locator('[role=alert]')).toHaveCount(0);

  await page.unroute(`**${path}?lang=en`);
  await page.goto(portal('/help?lang=pt'));
  let persistentAttempts = 0;
  await page.route(`**${path}?lang=pt`, async (route) => {
    persistentAttempts++;
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'Temporarily unavailable',
    });
  });
  await page.locator(`a[href*="${path}"]`).click();
  await expect(page.getByRole('alert')).toContainText(
    'O PDF continua indisponível após as tentativas. Tente novamente ou contate o suporte.',
  );
  expect(persistentAttempts).toBe(3);
  const retry = page.getByRole('button', { name: 'Tentar baixar novamente' });
  await expect(retry).toBeVisible();
  await retry.scrollIntoViewIfNeeded();
  const screenshotPath = resolve(
    `docs/evidence/manuals-i18n-20260919/help-recovery-${info.project.name}-pt.png`,
  );
  mkdirSync(resolve('docs/evidence/manuals-i18n-20260919'), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });
  for (const target of [page.locator(`a[href*="${path}"]`), retry]) {
    const box = await target.boundingBox();
    expect(box, 'Help download and retry controls must have a clickable box').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Help never extends beyond the viewport',
  ).toBe(true);
  await retry.click();
  await expect.poll(() => persistentAttempts).toBe(6);
  await expect(page.getByRole('alert')).toContainText('contate o suporte');
  expect(requests.every((method) => method === 'GET')).toBe(true);
});

test('Help explains an expired session and offers sign-in without retrying a 401', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await signIn(page, 'worker');
  const path = '/help/worker-reference/download';
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(path)) requests.push(request.method());
  });
  await page.goto(portal('/help?lang=pt'));
  await page.context().clearCookies();
  await page.locator(`a[href*="${path}"]`).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Sua sessão terminou. Entre novamente para baixar este guia.');
  await expect(alert.locator('a[href$="/app/login"]')).toBeVisible();
  expect(requests).toEqual(['GET']);
});

test('Owner Help keeps all seven role guides readable and tappable at 390px', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-390');
  await signIn(page, 'owner');
  await page.goto(portal('/help?lang=pt'));
  await expect(page.getByRole('heading', { name: 'Ajuda e guias de campo' })).toBeVisible();
  const guides = page.locator('.manual-card[data-manual-id$="-reference"]');
  await expect(guides).toHaveCount(7);
  for (const id of allGuides) {
    const card = page.locator(`.manual-card[data-manual-id="${id}"]`);
    await expect(card.locator('h2')).toBeVisible();
    const download = card.locator('a.download');
    await expect(download).toHaveText('Baixar PDF');
    const box = await download.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await guides.first().scrollIntoViewIfNeeded();
  const screenshotPath = resolve('docs/evidence/manuals-i18n-20260919/help-owner-390-pt.png');
  mkdirSync(resolve('docs/evidence/manuals-i18n-20260919'), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });
});
