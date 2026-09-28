import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-closeout-qa');

async function signIn(page: Page, role: 'owner' | 'finance' | 'manager' | 'worker') {
  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

async function nativeSubmit(page: Page, action: string): Promise<number> {
  const response = page.waitForResponse(
    (result) => result.request().method() === 'POST' && result.url().includes(`?/${action}`),
  );
  await page.locator(`form[data-closeout-action="${action}"]`).evaluate((form: HTMLFormElement) => {
    form.submit();
  });
  return (await response).status();
}

async function visibleProblem(page: Page) {
  const geometry = () =>
    page.evaluate(() => {
      const notice = document.querySelector<HTMLElement>(
        '[data-closeout-problem] [data-ui="problem-notice"]',
      );
      const focusedSummary = document.querySelector<HTMLElement>('[data-validation-summary]:focus');
      const target = focusedSummary ?? notice;
      const header = document.querySelector<HTMLElement>('.portal-layout > header');
      return {
        top: target?.getBoundingClientRect().top ?? -1,
        bottom: target?.getBoundingClientRect().bottom ?? -1,
        focusedSummary: Boolean(focusedSummary),
        headerBottom: header?.getBoundingClientRect().bottom ?? 0,
        viewportBottom: innerHeight,
      };
    });
  await expect
    .poll(async () => (await geometry()).top - (await geometry()).headerBottom)
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(async () => (await geometry()).viewportBottom - (await geometry()).bottom)
    .toBeGreaterThanOrEqual(8);
  const result = await geometry();
  expect(result.bottom).toBeLessThanOrEqual(result.viewportBottom - 8);
  return result;
}

for (const viewport of ['phone-390', 'desktop']) {
  test(`closeout browser failures retain focus, scroll, and current draft at ${viewport}`, async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    mkdirSync(evidenceDirectory, { recursive: true });
    const project = e2eLifecycleFixturesFor(info.project.name).project;
    const url = portal(`/projects/${project.id}/closeout?lang=en`);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signIn(page, 'owner');
    await page.goto(url);
    await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Prepare closeout draft' }).click();
    await expect(page.getByRole('heading', { name: 'Customer audience preview' })).toBeVisible();

    const confirm = page.locator('form[data-closeout-action="confirmClient"]');
    await expect(confirm).toBeVisible();
    const invalidBefore = await page.evaluate(() => {
      window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight));
      return window.scrollY;
    });
    expect(await nativeSubmit(page, 'confirmClient')).toBe(400);
    const problem = page.locator('[data-closeout-problem] [data-ui="problem-notice"]');
    await expect(problem).toHaveAttribute(
      'data-problem-code',
      'CLOSEOUT_CONFIRMATION_CHECK_REQUIRED',
    );
    await expect(confirm.locator('input[name="confirmationChecked"]')).not.toBeChecked();
    await expect(confirm.locator('[data-validation-summary]')).toBeFocused();
    const invalidGeometry = await visibleProblem(page);
    const invalidAfter = await page.evaluate(() => window.scrollY);
    expect.soft(Math.abs(invalidAfter - invalidBefore)).toBeLessThan(200);
    expect.soft(invalidAfter).toBeGreaterThan(0);
    await problem.screenshot({
      path: join(evidenceDirectory, `candidate-closeout-${viewport}-invalid.png`),
    });

    await page.goto(url);
    const competingPage = await context.newPage();
    await competingPage.goto(url);
    await competingPage.locator('form[data-closeout-action="refresh"]').getByRole('button').click();
    await expect(competingPage.getByRole('status')).toContainText('Closeout draft refreshed');
    const staleBefore = await page.evaluate(() => {
      window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight));
      return window.scrollY;
    });
    expect(await nativeSubmit(page, 'refresh')).toBe(409);
    await expect(problem).toHaveAttribute('data-problem-code', 'CLOSEOUT_DRAFT_CHANGED');
    await expect(problem).toBeFocused();
    await expect(problem.locator('a[href*="/closeout"]')).toBeVisible();
    const staleGeometry = await visibleProblem(page);
    const staleAfter = await page.evaluate(() => window.scrollY);
    expect.soft(Math.abs(staleAfter - staleBefore)).toBeLessThan(200);
    expect.soft(staleAfter).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      info.project.use.viewport!.width,
    );
    await problem.screenshot({
      path: join(evidenceDirectory, `candidate-closeout-${viewport}-stale.png`),
    });
    writeFileSync(
      join(evidenceDirectory, `candidate-closeout-${viewport}.json`),
      `${JSON.stringify(
        {
          project: 'disposable lifecycle fixture',
          viewport,
          invalid: {
            http: 400,
            code: 'CLOSEOUT_CONFIRMATION_CHECK_REQUIRED',
            scrollBefore: invalidBefore,
            scrollAfter: invalidAfter,
            geometry: invalidGeometry,
          },
          stale: {
            http: 409,
            code: 'CLOSEOUT_DRAFT_CHANGED',
            scrollBefore: staleBefore,
            scrollAfter: staleAfter,
            geometry: staleGeometry,
          },
          pageErrors: errors,
        },
        null,
        2,
      )}\n`,
    );
    expect(errors).toEqual([]);
    await competingPage.close();
  });
}

for (const role of ['manager', 'worker'] as const) {
  test(`${role} sees a role-safe closeout denial in the browser`, async ({ page }) => {
    test.skip(!['phone-390', 'desktop'].includes(test.info().project.name));
    await signIn(page, role);
    const project = e2eLifecycleFixturesFor(test.info().project.name).project;
    const response = await page.goto(portal(`/projects/${project.id}/closeout?lang=en`));
    expect(response?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await expect(
      page.getByText('An active Finance or Owner role is required to manage closeout.'),
    ).toBeVisible();
    await expect(page.getByText('Contact an owner')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute(
      'href',
      '/j-aautomation/app/',
    );
  });
}

test('Finance can review closeout without changing it', async ({ page }) => {
  test.skip(!['phone-390', 'desktop'].includes(test.info().project.name));
  await signIn(page, 'finance');
  const project = e2eLifecycleFixturesFor(test.info().project.name).project;
  const response = await page.goto(portal(`/projects/${project.id}/closeout?lang=en`));
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customer audience preview' })).toBeVisible();
});
