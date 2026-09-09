import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal } from './auth.js';

const copies = {
  en: { lang: 'en-US', login: 'Sign in securely', projects: 'Projects' },
  es: { lang: 'es-ES', login: 'Iniciar sesión de forma segura', projects: 'Proyectos' },
  pt: { lang: 'pt-BR', login: 'Entrar com segurança', projects: 'Projetos' },
} as const;
const languageSelect = (page: Page) =>
  page
    .locator(
      'select:has(option[value="en"]):has(option[value="es"]):has(option[value="pt"]):visible',
    )
    .first();

async function login(page: Page, role: 'owner' | 'worker') {
  await page.locator('input[name="email"]').fill(e2eCredentials[role].email);
  await page.locator('input[name="password"]').fill(e2eCredentials[role].password);
  await page.locator('button.login-submit').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  await expect(page.locator('.locale-switcher select')).toBeVisible();
}
async function logout(page: Page) {
  await page.locator('button.account-trigger').click();
  await page.locator('button.account-signout').click();
  await page.waitForURL((url) => url.pathname.endsWith('/login'));
}

test('fresh login defaults to English despite browser language and saves anonymous choice', async ({
  browser,
  page: referencePage,
}) => {
  const context = await browser.newContext({
    locale: 'es-ES',
    viewport: referencePage.viewportSize()!,
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(portal('/login'));
    expect(await response!.text()).toMatch(/<html lang="en-US"/);
    await expect(page.locator('h2')).toHaveText(copies.en.login);
    await expect(languageSelect(page)).toHaveValue('en');
    for (const locale of ['pt', 'es', 'en'] as const) {
      await languageSelect(page).selectOption(locale);
      await expect(page.locator('h2')).toHaveText(copies[locale].login);
      await expect(page.locator('html')).toHaveAttribute('lang', copies[locale].lang);
      await page.goto(portal('/login'));
      await expect(page.locator('h2')).toHaveText(copies[locale].login);
      await expect(languageSelect(page)).toHaveValue(locale);
    }
    const cookie = (await context.cookies()).find((item) => item.name === 'ja.portal.locale');
    expect(cookie?.value).toBe('en');
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 86400);
  } finally {
    await context.close();
  }
});

for (const role of ['owner', 'worker'] as const) {
  test(`${role} migrates stale Spanish preference and retains each language through logout and login`, async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(120_000);
    await context.addCookies([
      {
        name: 'ja.portal.locale',
        value: 'es',
        domain: new URL(portal('/login')).hostname,
        path: '/',
      },
    ]);
    await context.addInitScript(() => {
      if (!localStorage.getItem('locale-regression-initialized')) {
        localStorage.setItem('ja.portal.locale', 'es');
        localStorage.setItem('ja-portal-locale', 'en');
        localStorage.setItem('locale-regression-initialized', 'yes');
      }
    });
    await page.goto(portal('/login'));
    await expect(page.locator('h2')).toHaveText(copies.en.login);
    await login(page, role);
    for (const locale of ['es', 'pt', 'en'] as const) {
      await languageSelect(page).selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', copies[locale].lang);
      await page.goto(portal('/projects'));
      await expect(page.locator('main h1')).toHaveText(copies[locale].projects);
      await expect(languageSelect(page)).toHaveValue(locale);
      const server = await page.request.get(portal('/projects'));
      expect(server.status()).toBe(200);
      expect(await server.text()).toContain(`<html lang="${copies[locale].lang}"`);
      await page.reload();
      await expect(languageSelect(page)).toHaveValue(locale);
      await logout(page);
      await expect(page.locator('h2')).toHaveText(copies[locale].login);
      await expect(languageSelect(page)).toHaveValue(locale);
      await login(page, role);
      await expect(languageSelect(page)).toHaveValue(locale);
    }
    await logout(page);
    const state = await context.storageState();
    const restarted = await browser.newContext({
      storageState: state,
      locale: 'pt-BR',
      viewport: page.viewportSize()!,
    });
    try {
      const newPage = await restarted.newPage();
      await newPage.goto(portal('/login'));
      await expect(newPage.locator('h2')).toHaveText(copies.en.login);
      await expect(languageSelect(newPage)).toHaveValue('en');
    } finally {
      await restarted.close();
    }
  });
}
