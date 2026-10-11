import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials } from './auth.js';

const portal = (path = '') => `http://127.0.0.1:5174/j-aautomation/app${path}`;
type Role = keyof typeof e2eCredentials;
const workspaceRoles: readonly Role[] = ['worker', 'manager', 'finance', 'owner', 'auditor'];

test.describe.configure({ timeout: 90_000 });

async function signIn(page: Page, role: Role) {
  await page.goto(portal('/login?lang=en'));
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (url) => url.pathname.startsWith('/j-aautomation/app') && !url.pathname.endsWith('/login'),
  );
}

async function expectWorkflowAxe(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, `${label}: ${JSON.stringify(result.violations, null, 2)}`).toEqual([]);
}

async function expectKeyboardFocus(page: Page, label: string, allowEmpty = false) {
  const firstMainControl = page
    .locator(
      'main a[href], main button, main input:not([type="hidden"]), main select, main textarea, main summary',
    )
    .first();
  if (allowEmpty && (await firstMainControl.count()) === 0) {
    await expect(page.getByText('No finance cases are open yet.', { exact: true })).toBeVisible();
    return;
  }

  await expect(
    firstMainControl,
    `${label}: main content should have a keyboard target`,
  ).toBeVisible();
  await expect(firstMainControl).toHaveAccessibleName(/\S/u);
  await firstMainControl.focus();
  await expect(firstMainControl).toBeFocused();
  await page.keyboard.press('Tab');

  const focused = page.locator(':focus');
  await expect(focused, `${label}: Tab should move focus to a visible control`).toBeVisible();
  const visibleFocus = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    const outline = Number.parseFloat(style.outlineWidth);
    const shadow = style.boxShadow !== 'none' && /\d+px/u.test(style.boxShadow);
    return (style.outlineStyle !== 'none' && outline >= 2) || shadow;
  });
  expect(visibleFocus, `${label}: keyboard focus should be visibly indicated`).toBe(true);
}

test('digital workers workspace is role-scoped, keyboard reachable, and passes axe in main content', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/app/workflow') && response.status() >= 500)
      runtimeErrors.push(`${response.status()} ${response.url()}`);
  });

  for (const role of workspaceRoles) {
    await page.context().clearCookies();
    await signIn(page, role);
    await page.goto(portal('/workflow?lang=en'));
    await expect(page.getByRole('heading', { name: 'Digital workers', exact: true })).toBeVisible();

    if (role === 'worker') {
      await expect(
        page.getByRole('heading', { name: 'Finish your work', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Open work capture', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open case', exact: true })).toHaveCount(0);
    } else if (role === 'manager') {
      await expect(
        page.getByRole('heading', { name: 'Needs your decision', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Team follow-up', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open case', exact: true })).toHaveCount(0);
      await expect(page.locator('form[action="?/openCase"]')).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('heading', { name: 'Ready to invoice', exact: true }),
      ).toBeVisible();
      if (role === 'auditor') {
        await expect(page.getByText('Read-only view', { exact: true })).toBeVisible();
        await expect(page.locator('form[action="?/openCase"]')).toHaveCount(0);
        await expect(page.locator('form[action="?/saveWorkItem"]')).toHaveCount(0);
      } else {
        await expect(page.getByRole('button', { name: 'Open case', exact: true })).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Save follow-up', exact: true }),
        ).toBeVisible();
      }
    }

    const label = `${role} /workflow`;
    await expectKeyboardFocus(page, label, role === 'auditor');
    await expectWorkflowAxe(page, label);
  }

  expect(
    runtimeErrors,
    'workflow routes should not produce uncaught errors or server failures',
  ).toEqual([]);
});

test('worker can reach capture by keyboard; a project manager cannot open worker capture', async ({
  page,
}) => {
  await signIn(page, 'worker');
  await page.goto(portal('/workflow?lang=en'));
  const captureLink = page.getByRole('link', { name: 'Open work capture', exact: true });
  await captureLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/workflow\/capture/u);
  await expect(page.getByRole('heading', { name: 'Finish today', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toBeVisible();
  await expect(page.getByLabel('Work date')).toBeVisible();
  await expect(page.getByLabel('What work happened?')).toBeVisible();
  await expectKeyboardFocus(page, 'worker /workflow/capture');
  await expectWorkflowAxe(page, 'worker /workflow/capture');

  await page.context().clearCookies();
  await signIn(page, 'manager');
  const denied = await page.goto(portal('/workflow/capture?lang=en'));
  expect(denied?.status()).toBe(403);
  await expect(page.getByRole('heading', { name: 'Finish today', exact: true })).toHaveCount(0);
});
