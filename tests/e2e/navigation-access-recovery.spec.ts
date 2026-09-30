import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('global search keeps a billing tab selected through shallow navigation', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/billing?view=invoices&lang=en'), { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Configure billing', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'setup');
  await page.locator('#portal-global-search').fill('shallow navigation audit');
  await page.locator('form.global-search button[type="submit"]').click();
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'shallow navigation audit');
  const url = new URL(page.url());
  expect(url.searchParams.get('view')).toBe('setup');
  expect(url.searchParams.get('setup')).toBe('stream');
  expect(url.searchParams.get('lang')).toBe('en');
});

test('global search preserves the team tab and language, including repeated searches', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?view=team&lang=es'), { waitUntil: 'networkidle' });
  for (const query of ['navigation audit', 'second search']) {
    await page.locator('#portal-global-search').fill(query);
    await page.locator('form.global-search button[type="submit"]').click();
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === query);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/j-aautomation/app/projects');
    expect(url.searchParams.get('view')).toBe('team');
    expect(url.searchParams.get('lang')).toBe('es');
    expect(url.searchParams.getAll('q')).toEqual([query]);
    await expect(page.locator('[data-team-directory]')).toBeVisible();
  }
});

test('restore access asks to restore and restores a user created through the team form', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, 'owner');
  await page.goto(portal('/projects?view=team&lang=en'), { waitUntil: 'networkidle' });
  const suffix = randomUUID();
  const name = `Browser access audit ${suffix}`;
  await page.getByRole('button', { name: 'Create user', exact: true }).click();
  const form = page.locator('form[action*="createLocalPortalUser"]');
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Email', { exact: true }).fill(`access-${suffix}@example.test`);
  await form.getByLabel('Initial password').fill(`Audit!${randomUUID()}`);
  await form.getByRole('button', { name: 'Create user access', exact: true }).click();
  await page.getByLabel('Search team', { exact: true }).fill(name);
  const card = page
    .locator('[data-worker-id]')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Remove this team member access?');
    await dialog.accept();
  });
  await card.getByRole('button', { name: 'Remove access', exact: true }).click();
  await page.getByLabel('Include inactive specialists').check();
  await page.getByLabel('Search team', { exact: true }).fill(name);
  await expect(card.getByRole('button', { name: 'Restore access', exact: true })).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Restore this team member access?');
    await dialog.accept();
  });
  await card.getByRole('button', { name: 'Restore access', exact: true }).click();
  await page.getByLabel('Search team', { exact: true }).fill(name);
  await expect(card.getByRole('button', { name: 'Remove access', exact: true })).toBeVisible();
});

test('immediate assignment removal uses valid date limits and never defaults to a future end', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?action=remove-assignment&lang=en'), {
    waitUntil: 'networkidle',
  });
  const forms = page.locator('form[data-action="removeAssignment"]');
  await expect(forms.first()).toBeVisible();
  expect(await forms.count()).toBeGreaterThan(0);
  for (const form of await forms.all()) {
    const date = form.locator('input[name="endsOn"]');
    const minimum = await date.getAttribute('min');
    const maximum = await date.getAttribute('max');
    expect(maximum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (minimum && minimum > maximum!) {
      await expect(date).toBeDisabled();
      await expect(form).toContainText(
        'This future assignment will be cancelled before it starts.',
      );
    } else {
      await expect(date).toBeEnabled();
      const value = await date.inputValue();
      expect(!value || value <= maximum!).toBe(true);
      await expect(form).toContainText('Leave the end date blank to remove access today');
    }
  }
});
