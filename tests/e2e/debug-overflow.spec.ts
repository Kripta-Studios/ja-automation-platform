import { test, expect } from '@playwright/test';
import { e2eCredentials, portal } from './auth';

test('find overflow', async ({ page }) => {
  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(e2eCredentials.worker.email);
  await page.getByLabel('Password').fill(e2eCredentials.worker.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL('**/app');
  await page.waitForTimeout(2000);
  const overflows = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth || rect.right > window.innerWidth) {
        res.push({ tag: el.tagName, className: el.className, id: el.id, width: rect.width, right: rect.right, innerWidth: window.innerWidth });
      }
    });
    return res;
  });
  console.log('OVERFLOWS:', overflows);
});
