import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('worker can find localized Help and download the quick-start PDF', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/'), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Account options' }).click();
  await expect(page.getByRole('menuitem', { name: /Help/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Help/ }).click();
  await expect(page.getByRole('heading', { name: 'Help and field guides' })).toBeVisible();

  await page.goto(portal('/help?lang=es'), { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Ayuda y guías de campo' })).toBeVisible();
  await expect(page.locator('.manual-card')).toHaveCount(2);
  const work = page.locator('.manual-card[data-manual-id="work-projects-reference"]');
  await expect(work.locator('h2')).toHaveText('Guía de trabajo y proyectos');
  await expect(work.locator('.role-badges')).toContainText('Trabajador');
  await expect(work.locator('.role-guidance')).toContainText('trabajo asignado');
  await expect(page.getByText('Revisión 2026-09-19')).toHaveCount(2);

  const response = await page.request.get(portal('/help/employee-field-guide/download?lang=es'));
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect(response.headers()['content-disposition']).toContain('employee-field-guide-ES-');
  expect((await response.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
});

test('worker cannot download the administration group by changing the manual id', async ({
  page,
}) => {
  await signIn(page, 'worker');
  for (const id of ['administration-finance-reference', 'owner-reference']) {
    const response = await page.request.get(portal(`/help/${id}/download`));
    expect(response.status()).toBe(404);
  }
});

test('Owner sees three grouped references and can download administration, finance and audit', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/help'), { waitUntil: 'networkidle' });
  const cards = page.locator('.manual-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute('data-manual-id', 'administration-finance-reference');
  await expect(cards.first().locator('h2')).toHaveText('Administration, finance and audit guide');
  await expect(cards.first().locator('.role-badges')).toContainText('Read-only auditor');
  const response = await page.request.get(
    portal('/help/administration-finance-reference/download'),
  );
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toContain(
    'administration-finance-reference-EN-',
  );
  expect((await response.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
});
