import { test, expect } from '@playwright/test';
import { e2eCredentials, portal } from './auth';

test('find overflow 2', async ({ page }) => {
  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(e2eCredentials.worker.email);
  await page.getByLabel('Password').fill(e2eCredentials.worker.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL('**/app');
  await page.waitForTimeout(2000);
  const elements = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('header, header *').forEach(el => {
      const rect = el.getBoundingClientRect();
      res.push({ tag: el.tagName, className: el.className, text: el.innerText.substring(0,20).replace(/\n/g, ' '), width: rect.width, left: rect.left, right: rect.right });
    });
    return res;
  });
  console.log('HEADER CHILDREN:', elements);
});
