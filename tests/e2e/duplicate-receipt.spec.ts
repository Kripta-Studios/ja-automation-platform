import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eDatabasePath, e2eDocumentRoot } from './environment.js';

test('Worker duplicate receipt is controlled and original bytes remain private', async ({
  page,
}) => {
  await signIn(page, 'worker');
  const identity = randomUUID();
  const bytes = Buffer.from(`%PDF-1.4\n% Receipt regression ${identity}\n%%EOF\n`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const submit = async (name: string) => {
    await page.goto(portal('/expenses'));
    await page.locator('[data-expense-primary-cta]').click();
    const form = page.locator('form[data-expense-entry-surface]').first();
    const project = form.locator('select[name="projectId"]');
    const option = await project
      .locator('option')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value).find(Boolean));
    if (!option) throw new Error('No authorized expense project in fixture');
    await project.selectOption(option);
    await form.locator('input[name="spentOn"]').fill(new Date().toISOString().slice(0, 10));
    await form.locator('select[name="category"]').selectOption('meals');
    await form.locator('input[name="vendor"]').fill(`Duplicate regression ${identity}`);
    await form.locator('input[name="amount"]').fill('12.34');
    await form.locator('[name="description"]').fill('Receipt duplicate regression');
    await form.locator('select[name="currency"]').selectOption('USD');
    await form.locator('select[name="whoPaid"]').selectOption('worker');
    await form
      .locator('input[name="receipt"]')
      .setInputFiles({ name, mimeType: 'application/pdf', buffer: bytes });
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('createExpense'),
    );
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    return response;
  };
  expect((await submit('receipt.pdf')).status()).toBe(200);
  const { sqlite } = createDatabase(e2eDatabasePath);
  try {
    const original = sqlite
      .prepare('SELECT id,storage_key FROM document WHERE sha256=?')
      .get(hash) as { id: string; storage_key: string };
    expect(original).toBeTruthy();
    expect(readFileSync(resolve(e2eDocumentRoot, original.storage_key))).toEqual(bytes);
    expect((await submit('renamed.pdf')).status()).toBe(409);
    expect(sqlite.prepare('SELECT id,storage_key FROM document WHERE sha256=?').all(hash)).toEqual([
      original,
    ]);
    expect(readFileSync(resolve(e2eDocumentRoot, original.storage_key))).toEqual(bytes);
    expect(
      sqlite
        .prepare('SELECT count(*) n FROM expense WHERE vendor=?')
        .get(`Duplicate regression ${identity}`),
    ).toEqual({ n: 1 });
    await expect(page.locator('body')).not.toContainText('Internal Error');
  } finally {
    sqlite.close();
  }
});
