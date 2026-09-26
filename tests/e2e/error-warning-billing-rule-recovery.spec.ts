import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-billing-rule-recovery');

async function signIn(page: Page) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials.owner.email);
  await page.getByLabel('Password').fill(e2eCredentials.owner.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

test('billing stream conflict explains disabled automatic issue and retains form state', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });

  await signIn(page);
  await page.goto(portal(`/billing?view=streams&lang=${locale}`));
  await page.waitForLoadState('networkidle');
  const editor = page.locator('.billing-section__rule-editor').first();
  await expect(editor).toBeAttached();
  await editor.locator(':scope > summary').click();
  let form = editor.locator('form[action*="/updateBillingRule"]');
  await expect(form).toBeVisible();
  await form.locator('[name="recipientEmail"]').fill('qa-billing@example.test');
  const streamId = await form.locator('[name="billingRuleId"]').inputValue();
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes('/updateBillingRule'),
  );
  // This known repository guard is reachable when a stale client submits an
  // option the server no longer permits, even though today's UI omits it.
  await form.evaluate((node: HTMLFormElement) => {
    const option = document.createElement('input');
    option.type = 'hidden';
    option.name = 'autoIssue';
    option.value = 'on';
    node.append(option);
    node.submit();
  });
  const failureResponse = await response;
  expect(failureResponse.status()).toBe(400);
  expect(await failureResponse.text()).toContain('BILLING_AUTOMATIC_ISSUANCE_DISABLED');

  form = page.locator(
    `form[action*="/updateBillingRule"]:has([name="billingRuleId"][value="${streamId}"])`,
  );
  await expect(form).toBeVisible();
  const notice = form.locator('xpath=preceding-sibling::*[1]');
  await expect(notice).toHaveAttribute('data-problem-code', 'BILLING_AUTOMATIC_ISSUANCE_DISABLED');
  await expect(notice).toContainText(
    locale === 'pt' ? 'emissão e o envio automáticos' : 'Automatic invoice issue and sending',
  );
  await expect(notice).toContainText(locale === 'pt' ? 'configuração' : 'billing');
  await expect(notice.locator('a[href*="view=setup"]')).toBeVisible();
  await expect(form.locator('[name="recipientEmail"]')).toHaveValue('qa-billing@example.test');
  await expect(page.locator('.billing-section__workspace [role="tab"]').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(notice).toBeFocused();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
  expect(consoleErrors).toEqual([]);

  mkdirSync(evidenceDirectory, { recursive: true });
  const prefix = `disabled-auto-issue-${info.project.name}-${locale}`;
  writeFileSync(join(evidenceDirectory, `${prefix}.png`), await notice.screenshot());
  writeFileSync(
    join(evidenceDirectory, `${prefix}-trace.json`),
    `${JSON.stringify({ build: 'e344f463cf5f3247d507667bdd827d5f16a6b84e140e93d0137bc370f7798c07', code: 'BILLING_AUTOMATIC_ISSUANCE_DISABLED', status: 400, retainedRecipient: true, streamId, scrollBefore, scrollAfter, focusedNotice: true, locale, viewport: info.project.name, consoleErrors }, null, 2)}\n`,
  );
});

test('archive explains an invoice approved after the stream form opened', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  const target = database.sqlite
    .prepare(
      `SELECT b.id AS ruleId,i.id AS invoiceId,i.state AS priorState
       FROM billing_rule b JOIN invoice i ON i.billing_rule_id=b.id
       WHERE b.enabled=1 AND i.state='draft' LIMIT 1`,
    )
    .get() as { ruleId: string; invoiceId: string; priorState: string } | undefined;
  database.sqlite.close();
  if (!target) throw new Error('Disposable fixture needs an active stream with a draft invoice');

  await signIn(page);
  await page.goto(
    portal(`/billing?view=streams&focus=${encodeURIComponent(target.ruleId)}&lang=${locale}`),
  );
  await page.waitForLoadState('networkidle');
  const editor = page.locator(`#billing-stream-${target.ruleId}`);
  await expect(editor).toBeVisible();
  let form = editor.locator('form[action*="/archiveBillingRule"]');
  await expect(form).toBeVisible();
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  const changed = createDatabase(databasePath);
  changed.sqlite.prepare("UPDATE invoice SET state='approved' WHERE id=?").run(target.invoiceId);
  changed.sqlite.close();
  try {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().includes('/archiveBillingRule'),
    );
    await form.evaluate((node: HTMLFormElement) => node.submit());
    const failureResponse = await response;
    expect(failureResponse.status()).toBe(409);
    expect(await failureResponse.text()).toContain(
      'BILLING_STREAM_APPROVED_INVOICE_BLOCKS_ARCHIVE',
    );
    form = page.locator(
      `form[action*="/archiveBillingRule"]:has([name="billingRuleId"][value="${target.ruleId}"])`,
    );
    await expect(form).toBeVisible();
    const notice = form.locator('xpath=preceding-sibling::*[1]');
    await expect(notice).toHaveAttribute(
      'data-problem-code',
      'BILLING_STREAM_APPROVED_INVOICE_BLOCKS_ARCHIVE',
    );
    await expect(notice).toContainText(locale === 'pt' ? 'fatura aprovada' : 'approved invoice');
    await expect(notice.locator('a[href*="view=invoices"]')).toBeVisible();
    await expect(notice).toBeFocused();
    await expect(page.locator('.billing-section__workspace [role="tab"]').nth(1)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
    expect(consoleErrors).toEqual([]);
    mkdirSync(evidenceDirectory, { recursive: true });
    const prefix = `approved-invoice-archive-${info.project.name}-${locale}`;
    writeFileSync(join(evidenceDirectory, `${prefix}.png`), await notice.screenshot());
    writeFileSync(
      join(evidenceDirectory, `${prefix}-trace.json`),
      `${JSON.stringify({ build: 'e344f463cf5f3247d507667bdd827d5f16a6b84e140e93d0137bc370f7798c07', code: 'BILLING_STREAM_APPROVED_INVOICE_BLOCKS_ARCHIVE', status: 409, ruleId: target.ruleId, scrollBefore, scrollAfter, focusedNotice: true, locale, viewport: info.project.name }, null, 2)}\n`,
    );
  } finally {
    const restored = createDatabase(databasePath);
    restored.sqlite
      .prepare('UPDATE invoice SET state=? WHERE id=?')
      .run(target.priorState, target.invoiceId);
    restored.sqlite.close();
  }
});

test('archive reviews a stream archived elsewhere after the form opened', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  const target = database.sqlite
    .prepare('SELECT id FROM billing_rule WHERE enabled=1 ORDER BY id LIMIT 1')
    .get() as { id: string } | undefined;
  database.sqlite.close();
  if (!target) throw new Error('Disposable fixture needs an active billing stream');

  await signIn(page);
  await page.goto(
    portal(`/billing?view=streams&focus=${encodeURIComponent(target.id)}&lang=${locale}`),
  );
  await page.waitForLoadState('networkidle');
  const editor = page.locator(`#billing-stream-${target.id}`);
  await expect(editor).toBeVisible();
  const form = editor.locator('form[action*="/archiveBillingRule"]');
  await expect(form).toBeVisible();
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  const changed = createDatabase(databasePath);
  changed.sqlite.prepare('UPDATE billing_rule SET enabled=0 WHERE id=?').run(target.id);
  changed.sqlite.close();
  try {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().includes('/archiveBillingRule'),
    );
    await form.evaluate((node: HTMLFormElement) => node.submit());
    const failureResponse = await response;
    expect(failureResponse.status()).toBe(404);
    expect(await failureResponse.text()).toContain('BILLING_ACTIVE_STREAM_UNAVAILABLE');
    const restoredForm = page.locator(
      `form[action*="/archiveBillingRule"]:has([name="billingRuleId"][value="${target.id}"])`,
    );
    await expect(restoredForm).toBeVisible();
    const notice = restoredForm.locator('xpath=preceding-sibling::*[1]');
    await expect(notice).toHaveAttribute('data-problem-code', 'BILLING_ACTIVE_STREAM_UNAVAILABLE');
    await expect(notice).toContainText(locale === 'pt' ? 'já foi arquivado' : 'already archived');
    await expect(notice.locator('a[href*="view=setup"]')).toBeVisible();
    await expect(notice).toBeFocused();
    await expect(page.locator('.billing-section__workspace [role="tab"]').nth(1)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const maxAfter = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(Math.abs(scrollAfter - Math.min(scrollBefore, maxAfter))).toBeLessThan(12);
    expect(consoleErrors).toEqual([]);
    mkdirSync(evidenceDirectory, { recursive: true });
    const prefix = `stale-stream-archive-${info.project.name}-${locale}`;
    writeFileSync(join(evidenceDirectory, `${prefix}.png`), await notice.screenshot());
    writeFileSync(
      join(evidenceDirectory, `${prefix}-trace.json`),
      `${JSON.stringify({ build: 'e344f463cf5f3247d507667bdd827d5f16a6b84e140e93d0137bc370f7798c07', code: 'BILLING_ACTIVE_STREAM_UNAVAILABLE', status: 404, ruleId: target.id, scrollBefore, scrollAfter, maxAfter, focusedNotice: true, locale, viewport: info.project.name }, null, 2)}\n`,
    );
  } finally {
    const restored = createDatabase(databasePath);
    restored.sqlite.prepare('UPDATE billing_rule SET enabled=1 WHERE id=?').run(target.id);
    restored.sqlite.close();
  }
});
