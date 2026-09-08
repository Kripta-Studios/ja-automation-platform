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
  await expect(page.getByText('revisión 2026-09-08')).toHaveCount(1);

  const response = await page.request.get(portal('/help/employee-field-guide/download?lang=es'));
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect(response.headers()['content-disposition']).toContain('employee-field-guide-ES-');
  expect((await response.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
});

test('worker cannot download the Owner reference by changing the manual id', async ({ page }) => {
  await signIn(page, 'worker');
  const response = await page.request.get(portal('/help/owner-reference/download'));
  expect(response.status()).toBe(404);
});

test('Owner can download the detailed Owner and Finance reference', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/help'), { waitUntil: 'networkidle' });
  await expect(page.getByText('Owner and Finance user guide')).toBeVisible();
  const response = await page.request.get(portal('/help/owner-reference/download'));
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toContain('owner-reference-EN-');
  expect((await response.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
});
