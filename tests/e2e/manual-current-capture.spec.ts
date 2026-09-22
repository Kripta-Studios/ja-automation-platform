import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readManualSourceIdentity } from '../../scripts/manual-source-identity.js';
import { portal } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import {
  seedSupplierPersonas,
  signInManualPersona,
  type ManualPersonaAccount,
} from './manual-persona-fixture.js';

type Persona =
  | 'owner'
  | 'finance'
  | 'manager'
  | 'auditor'
  | 'worker'
  | 'supplier-coordinator'
  | 'external-technician';
type Locale = 'en' | 'es' | 'pt';
type Capture = {
  persona: Persona;
  locale: Locale;
  key: string;
  role: Persona;
  route: string;
  path: string;
  sha256: string;
  capturedAt: string;
  viewport: { width: number; height: number };
};

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const documentLanguages = { en: 'en-US', es: 'es-ES', pt: 'pt-BR' } as const;
const navigatorLabels = {
  en: 'Go to section',
  es: 'Ir a una sección',
  pt: 'Ir para uma seção',
} as const;
const personas: ReadonlyArray<{ persona: Persona; account: ManualPersonaAccount }> = [
  { persona: 'owner', account: 'owner' },
  { persona: 'finance', account: 'finance' },
  { persona: 'manager', account: 'manager' },
  { persona: 'auditor', account: 'auditor' },
  { persona: 'worker', account: 'worker' },
  { persona: 'supplier-coordinator', account: 'supplierCoordinator' },
  { persona: 'external-technician', account: 'worker2' },
];

function urlFor(route: string, locale: Locale) {
  const url = new URL(portal(route));
  url.searchParams.set('lang', locale);
  return url;
}

test('capture fresh synthetic manuals for seven personas and the Spanish worker guide', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'This run includes desktop and phone screenshots.');
  test.setTimeout(420_000);
  const pointer = readE2EFixturePointer();
  const root = process.cwd();
  const identity = readManualSourceIdentity(root);
  const screenshots: Capture[] = [];
  const checks: Array<{ name: string; status: 'passed'; httpStatus?: number }> = [];
  let supplierProjectId: string | undefined;

  async function navigate(page: Page, route: string, locale: Locale) {
    const requested = urlFor(route, locale);
    const response = await page.goto(requested.toString(), { waitUntil: 'networkidle' });
    expect(response?.status(), `${route} ${locale}`).toBe(200);
    await expect(page.locator('html'), `${route} must render in ${locale}`).toHaveAttribute(
      'lang',
      documentLanguages[locale],
    );
    await expect(page.locator('main').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const url = new URL(page.url());
    checks.push({
      name: `navigation:${url.pathname}${url.search}`,
      status: 'passed',
      httpStatus: 200,
    });
    return url;
  }

  async function capture(
    page: Page,
    persona: Persona,
    locale: Locale,
    key: string,
    url: URL,
    target?: Locator,
  ) {
    const path = `docs/manuals/screenshots/current/${persona}/${locale}/${key}.png`;
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    if (target) await target.screenshot({ path: resolve(root, path) });
    else await page.screenshot({ path: resolve(root, path), fullPage: false });
    screenshots.push({
      persona,
      locale,
      key,
      role: persona,
      route: `${url.pathname.replace(/^\/j-aautomation/, '')}${url.search}`,
      path,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(root, path)))
        .digest('hex'),
      capturedAt: new Date().toISOString(),
      viewport: page.viewportSize()!,
    });
    checks.push({ name: `capture:${persona}:${locale}:${key}`, status: 'passed' });
  }

  for (const { persona, account } of personas) {
    if (persona === 'supplier-coordinator')
      supplierProjectId = seedSupplierPersonas(pointer.databasePath);
    const locales: Locale[] = persona === 'worker' ? ['en', 'es', 'pt'] : ['en', 'pt'];
    for (const locale of locales) {
      const context = await browser.newContext({
        viewport: desktop,
        deviceScaleFactor: 1,
        locale: documentLanguages[locale],
      });
      const page = await context.newPage();
      try {
        const publicUrl = new URL(`http://127.0.0.1:4173/j-aautomation/${locale}`);
        const publicResponse = await page.goto(publicUrl.toString(), { waitUntil: 'networkidle' });
        expect(publicResponse?.status()).toBe(200);
        await expect(page.locator('h1')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await capture(page, persona, locale, 'public-home', publicUrl);
        await signInManualPersona(page, account);
        for (const [key, route] of [
          ['home', ''],
          ['help', '/help'],
          ['profile', '/profile'],
        ] as const) {
          const url = await navigate(page, route, locale);
          await capture(page, persona, locale, key, url);
          if (key === 'home') {
            await page
              .getByRole('button', {
                name: navigatorLabels[locale],
                exact: true,
              })
              .click();
            const navigator = page.locator('dialog[open]');
            await expect(navigator).toBeVisible();
            await capture(page, persona, locale, 'section-navigator', url, navigator);
            await page.keyboard.press('Escape');
          }
        }
        if (persona === 'owner' || persona === 'manager') {
          const url = await navigate(page, '/planning', locale);
          const calendar = page.locator('[data-ui=planning-calendar]').first();
          await expect(calendar).toBeVisible();
          await capture(page, persona, locale, 'planning-month', url, calendar);
          await calendar.locator('[aria-current=date]').click();
          const form = page.locator('form[action="?/createPlanning"]');
          await expect(form).toBeVisible();
          await capture(page, persona, locale, 'planning-editor', url, form);
        }
        if (['owner', 'finance', 'manager', 'worker'].includes(persona)) {
          const url = await navigate(page, '/profile', locale);
          const calendar = page.locator('[data-availability-calendar]');
          await expect(calendar).toBeVisible();
          await capture(page, persona, locale, 'availability-month', url, calendar);
          await calendar.locator('[aria-current=date]').click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await capture(page, persona, locale, 'availability-editor', url, dialog);
        }
        if (persona === 'worker') {
          const url = await navigate(page, '/projects', locale);
          const calendar = page.locator('[data-project-calendar]');
          await calendar.locator('summary').click();
          await expect(calendar.locator('[data-ui=planning-calendar]')).toBeVisible();
          await capture(page, persona, locale, 'projects-month', url, calendar);
        }
        if (persona === 'worker') {
          const url = await navigate(page, '/expenses', locale);
          await capture(
            page,
            persona,
            locale,
            'register-filters',
            url,
            page.locator('.expense-filters'),
          );
        }
        if (persona === 'owner') {
          const url = await navigate(page, '/projects', locale);
          await page.locator('.workspace-actions-disclosure > summary').click();
          await capture(
            page,
            persona,
            locale,
            'project-actions',
            url,
            page.locator('nav.project-workflow-actions'),
          );
        }
        if (persona === 'finance') {
          const url = await navigate(page, '/finance', locale);
          await capture(page, persona, locale, 'finance', url);
          const configUrl = await navigate(page, '/finance?view=commercial', locale);
          await page.locator('.workspace-task-switcher').scrollIntoViewIfNeeded();
          await capture(page, persona, locale, 'configuration-task', configUrl);
        }
        if (persona === 'auditor') {
          const url = await navigate(page, '/audit', locale);
          await capture(page, persona, locale, 'audit', url);
        }
        if (persona === 'supplier-coordinator') {
          const url = await navigate(page, `/supplier?projectId=${supplierProjectId}`, locale);
          await capture(page, persona, locale, 'supplier-team', url);
        }
        if (persona === 'external-technician') {
          const url = await navigate(page, '/time', locale);
          await capture(page, persona, locale, 'time', url);
          await capture(
            page,
            persona,
            locale,
            'register-filters',
            url,
            page.locator('.time-filters'),
          );
        }
        if (persona === 'worker') {
          const url = await navigate(page, '/time', locale);
          await page.locator('[data-time-primary-cta]').click();
          const form = page.locator('form[data-time-entry-surface]');
          await expect(form.locator('[name="workDate"]')).not.toHaveValue('');
          await form.locator('[name="startTime"]').fill('09:00');
          await form.locator('[name="endTime"]').fill('17:00');
          await form.locator('[name="breakMinutes"]').fill('30');
          await expect(form.locator('output')).toHaveText('7 h 30 min');
          await capture(page, persona, locale, 'time-entry', url, form);
          await form.locator('select[name="projectId"]').click();
          await capture(
            page,
            persona,
            locale,
            'project-picker',
            url,
            page.locator('.searchable-select-popover:popover-open'),
          );
        }
        await page.setViewportSize(phone);
        const url = await navigate(page, '', locale);
        await capture(page, persona, locale, 'home-phone', url);
      } finally {
        await context.close();
      }
    }
  }

  expect(readManualSourceIdentity(root).sourceDigest).toBe(identity.sourceDigest);
  expect(screenshots.filter((capture) => capture.key === 'home')).toHaveLength(15);
  const manifest = {
    ...identity,
    capturedAt: new Date().toISOString(),
    environment: 'synthetic',
    scope: 'Real authenticated synthetic portal screens for seven personas in EN/PT-BR.',
    screenshots,
    checks,
  };
  mkdirSync(resolve(root, 'docs/manuals/validation'), { recursive: true });
  writeFileSync(
    resolve(root, 'docs/manuals/validation/current-capture.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
});
