import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-billing-ledger-pack');

function issuedInvoice() {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const invoice = db.sqlite
      .prepare(
        `SELECT id,invoice_number FROM invoice
        WHERE state IN ('issued','sent','partially_paid') AND invoice_number IS NOT NULL
          AND total_minor>10000 AND legal_entity_revision_id IS NOT NULL
        ORDER BY issued_at DESC,id LIMIT 1`,
      )
      .get() as { id: string; invoice_number: string } | undefined;
    if (!invoice) throw new Error('Disposable fixture needs an issued invoice');
    return { databasePath, ...invoice };
  } finally {
    db.sqlite.close();
  }
}

function createdPayment(databasePath: string, invoiceId: string, reference: string) {
  const db = createDatabase(databasePath);
  try {
    return db.sqlite
      .prepare('SELECT id FROM payment WHERE invoice_id=? AND reference=? LIMIT 1')
      .get(invoiceId, reference) as { id: string } | undefined;
  } finally {
    db.sqlite.close();
  }
}

function reversalCount(databasePath: string, paymentId: string) {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite
        .prepare(
          'SELECT COUNT(*) count FROM invoice_payment_reversal_event WHERE original_payment_id=?',
        )
        .get(paymentId) as { count: number }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

function packCount(databasePath: string, periodStart: string, periodEnd: string) {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite
        .prepare(
          'SELECT COUNT(*) count FROM accounting_pack_run WHERE period_start=? AND period_end=?',
        )
        .get(periodStart, periodEnd) as { count: number }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

async function openInvoice(page: Page, invoiceId: string) {
  const card = page.locator(`[data-table-region-cards] article[data-row="${invoiceId}"]`);
  if (await card.isVisible()) {
    await card.locator('a[data-card-action]').click();
    return;
  }
  const row = page.locator(`tr[data-invoice-row="${invoiceId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Manage|Gerenciar/iu }).click();
}

function diagnostics(page: Page) {
  const errors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { errors, responses };
}

function saveEvidence(
  name: string,
  screenshot: Buffer,
  steps: Array<Record<string, string | number | boolean>>,
  network: Array<{ status: number; path: string }>,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(join(evidenceDirectory, `${name}.png`), screenshot);
  writeFileSync(
    join(evidenceDirectory, `${name}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-network.json`),
    `${JSON.stringify(network, null, 2)}\n`,
  );
}

test('payment reversal shows amount blocker, keeps entry, then saves an allowed reversal', async ({
  page,
  browser,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const fixture = issuedInvoice();
  const diagnostic = diagnostics(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'finance');
  await page.goto(portal(`/billing?view=invoices&stage=outstanding&lang=${locale}`));
  await page
    .getByRole('form', { name: /Filter billing|Filtrar faturamento/iu })
    .locator('input[type="search"]')
    .fill(fixture.invoice_number);
  await openInvoice(page, fixture.id);
  let panel = page.locator('[data-ui="responsive-sheet"]');
  await expect(panel).toBeVisible();
  await panel
    .locator('details.billing-section__action-panel')
    .filter({ has: page.locator('form[action="?/recordPayment"]') })
    .locator('summary')
    .click();
  const paymentForm = panel.locator('form[action="?/recordPayment"]');
  await paymentForm.locator('[name="amount"]').fill('10.00');
  const reference = `Disposable reversal source ${randomUUID()}`;
  await paymentForm.locator('[name="reference"]').fill(reference);
  await paymentForm.locator('[name="idempotencyKey"]').evaluate((input: HTMLInputElement) => {
    input.value = `qa-reverse-source-${crypto.randomUUID()}`;
  });
  let post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordPayment'),
  );
  await paymentForm.locator('button[type="submit"]').click();
  expect((await post).status()).toBe(200);
  await expect.poll(() => createdPayment(fixture.databasePath, fixture.id, reference)).toBeTruthy();
  const paymentId = createdPayment(fixture.databasePath, fixture.id, reference)!.id;
  steps.push({ step: 'payment-source-success', saved: true });

  await page.goto(portal(`/billing?view=invoices&stage=outstanding&lang=${locale}`));
  await page
    .getByRole('form', { name: /Filter billing|Filtrar faturamento/iu })
    .locator('input[type="search"]')
    .fill(fixture.invoice_number);
  await openInvoice(page, fixture.id);
  panel = page.locator('[data-ui="responsive-sheet"]');
  const history = panel.locator('details.billing-section__payment-history');
  await history.locator('summary').click();
  let reversal = history.locator(
    `article.billing-section__payment-row:has(form input[name="paymentId"][value="${paymentId}"]) form[action="?/reversePayment"]`,
  );
  await expect(reversal).toBeVisible();
  await reversal.locator('[name="amount"]').fill('99.00');
  await reversal.locator('[name="effectiveOn"]').fill(new Date().toISOString().slice(0, 10));
  await reversal.locator('[name="reason"]').fill('Retained reversal reason');
  await reversal.scrollIntoViewIfNeeded();
  const invalidScroll = await page.evaluate(() => window.scrollY);
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/reversePayment'),
  );
  await reversal.evaluate((form: HTMLFormElement) => form.submit());
  expect((await post).status()).toBe(400);
  const notice = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'BILLING_PAYMENT_AMOUNT_INVALID');
  await expect.soft(notice.getByRole('link')).toHaveAttribute('href', /#invoice-collections/u);
  reversal = page.locator(
    `form[action="?/reversePayment"]:has(input[name="paymentId"][value="${paymentId}"])`,
  );
  await expect(reversal.locator('[name="amount"]')).toHaveValue('99.00');
  await expect(reversal.locator('[name="reason"]')).toHaveValue('Retained reversal reason');
  await expect(reversal.locator('[name="amount"]')).toBeFocused();
  const invalidAfter = await page.evaluate(() => window.scrollY);
  expect
    .soft(
      Math.abs(invalidAfter - invalidScroll),
      `reversal native scroll before=${invalidScroll} after=${invalidAfter}`,
    )
    .toBeLessThan(12);
  steps.push({
    step: 'reverse-invalid-native',
    code: 'BILLING_PAYMENT_AMOUNT_INVALID',
    retained: true,
    scrollBefore: invalidScroll,
    scrollAfter: invalidAfter,
  });
  const screenshot = await notice.screenshot();

  await reversal.locator('[name="amount"]').fill('1.00');
  const before = reversalCount(fixture.databasePath, paymentId);
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/reversePayment'),
  );
  await reversal.locator('button[type="submit"]').click();
  expect((await post).status()).toBe(200);
  await expect.poll(() => reversalCount(fixture.databasePath, paymentId)).toBe(before + 1);
  steps.push({ step: 'reverse-enhanced-success', saved: true });

  const worker = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(worker, 'worker');
    const denied = await worker.evaluate(
      async ({ paymentId, date, key }) => {
        const response = await fetch('/j-aautomation/app/billing?/reversePayment', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({
            paymentId,
            amount: '1.00',
            effectiveOn: date,
            reasonCode: 'bank_return',
            reason: 'Worker may not reverse',
            idempotencyKey: key,
          }),
        });
        const result = (await response.json()) as {
          type?: string;
          status?: number;
          data?: unknown;
        };
        return { transportStatus: response.status, result };
      },
      { paymentId, date: new Date().toISOString().slice(0, 10), key: `qa-denied-${randomUUID()}` },
    );
    expect(denied.transportStatus).toBe(200);
    expect(denied.result.type).toBe('failure');
    expect(denied.result.status).toBe(403);
    expect(JSON.stringify(denied.result.data)).toContain('BILLING_FINANCE_REQUIRED');
    steps.push({ step: 'worker-denied', code: 'BILLING_FINANCE_REQUIRED' });
  } finally {
    await worker.close();
  }
  expect(diagnostic.errors).toEqual([]);
  saveEvidence(`reversal-${info.project.name}-${locale}`, screenshot, steps, diagnostic.responses);
});

test('accounting pack invalid dates keep values and focus', async ({ page, browser }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const databasePath = readE2EFixturePointer().databasePath;
  const diagnostic = diagnostics(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'finance');
  await page.goto(portal(`/accounting?lang=${locale}`));
  await page.locator('#accounting-generate details.ui-disclosure summary').click();
  let form = page.locator('form[action="?/createAccountingPack"]');
  await expect(form).toBeVisible();
  await form.locator('[name="periodStart"]').fill('2026-09-20');
  await form.locator('[name="periodEnd"]').fill('2026-09-01');
  await form.locator('[name="reportLocale"]').selectOption(locale);
  await form.scrollIntoViewIfNeeded();
  const beforeGeometry = await page.evaluate(() => ({
    scroll: window.scrollY,
    max: document.documentElement.scrollHeight - window.innerHeight,
  }));
  const scrollBefore = beforeGeometry.scroll;
  await page.evaluate(() => sessionStorage.removeItem('qa-pack-scroll-events'));
  await page.addInitScript(() => {
    const started = performance.now();
    const sample = (phase: string) => {
      try {
        const key = 'qa-pack-scroll-events';
        const events = JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<{
          phase: string;
          ms: number;
          scroll: number;
          max: number;
        }>;
        if (events.length >= 40) return;
        events.push({
          phase,
          ms: Math.round(performance.now() - started),
          scroll: Math.round(window.scrollY),
          max: Math.round((document.documentElement?.scrollHeight ?? 0) - window.innerHeight),
        });
        sessionStorage.setItem(key, JSON.stringify(events));
      } catch {
        // Browser diagnostics must not affect the form action.
      }
    };
    sample('document-start');
    const observer = new MutationObserver(() => {
      if (!document.querySelector('#accounting-generate [data-ui="problem-notice"]')) return;
      sample('notice-visible');
      observer.disconnect();
    });
    const observeNotice = () => {
      if (document.documentElement)
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) observeNotice();
    else document.addEventListener('readystatechange', observeNotice, { once: true });
    document.addEventListener('DOMContentLoaded', () => sample('dom-content-loaded'));
    window.addEventListener('load', () => sample('load'));
    window.addEventListener('scroll', () => sample('scroll'), { passive: true });
    for (const delay of [0, 50, 180, 300, 600])
      window.setTimeout(() => sample(`timer-${delay}`), delay);
  });
  const post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createAccountingPack'),
  );
  await form.evaluate((node: HTMLFormElement) => node.submit());
  const invalidResponse = await post;
  expect(invalidResponse.status()).toBe(400);
  const postedViewportScrollY = new URLSearchParams(invalidResponse.request().postData() ?? '').get(
    'viewportScrollY',
  );
  const notice = page.locator('#accounting-generate [data-ui="problem-notice"]');
  await expect.soft(notice).toHaveAttribute('data-problem-code', 'BILLING_PERIOD_END_BEFORE_START');
  form = page.locator('form[action="?/createAccountingPack"]');
  await expect(form.locator('[name="periodStart"]')).toHaveValue('2026-09-20');
  await expect(form.locator('[name="periodEnd"]')).toHaveValue('2026-09-01');
  await expect(form.locator('[name="reportLocale"]')).toHaveValue(locale);
  await expect.soft(form.locator('[name="periodEnd"]')).toBeFocused();
  const afterGeometry = await page.evaluate(() => ({
    scroll: window.scrollY,
    max: document.documentElement.scrollHeight - window.innerHeight,
    activeName: document.activeElement?.getAttribute('name') ?? '',
  }));
  await page.waitForTimeout(700);
  const settledGeometry = await page.evaluate(() => {
    const events = JSON.parse(sessionStorage.getItem('qa-pack-scroll-events') ?? '[]') as Array<{
      phase: string;
      ms: number;
      scroll: number;
      max: number;
    }>;
    sessionStorage.removeItem('qa-pack-scroll-events');
    return { scroll: window.scrollY, events };
  });
  const scrollAfter = afterGeometry.scroll;
  expect.soft(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
  expect.soft(Math.abs(settledGeometry.scroll - scrollBefore)).toBeLessThan(12);
  steps.push({
    step: 'pack-period-invalid-native',
    code: (await notice.getAttribute('data-problem-code')) ?? '',
    retained: true,
    scrollBefore,
    scrollAfter,
    maxBefore: beforeGeometry.max,
    maxAfter: afterGeometry.max,
    activeName: afterGeometry.activeName,
    postedViewportScrollY: postedViewportScrollY ?? 'missing',
    settledScroll: settledGeometry.scroll,
  });
  steps.push({ step: 'pack-scroll-timeline', events: JSON.stringify(settledGeometry.events) });
  const screenshot = await notice.screenshot();

  const validStart = info.project.name === 'desktop' ? '2026-06-01' : '2026-07-01';
  const validEnd = info.project.name === 'desktop' ? '2026-06-30' : '2026-07-31';
  const before = packCount(databasePath, validStart, validEnd);
  await form.locator('[name="periodStart"]').fill(validStart);
  await form.locator('[name="periodEnd"]').fill(validEnd);
  const successPost = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createAccountingPack'),
  );
  await form.locator('button[type="submit"]').click();
  expect((await successPost).status()).toBe(200);
  await expect.poll(() => packCount(databasePath, validStart, validEnd)).toBe(before + 1);
  steps.push({ step: 'pack-create-enhanced-success', saved: true });

  const worker = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(worker, 'worker');
    const denied = await worker.evaluate(
      async ({ start, end }) => {
        const response = await fetch('/j-aautomation/app/accounting?/createAccountingPack', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({ periodStart: start, periodEnd: end, reportLocale: 'en' }),
        });
        return {
          transportStatus: response.status,
          result: (await response.json()) as { type?: string; status?: number; data?: unknown },
        };
      },
      { start: validStart, end: validEnd },
    );
    expect(denied.transportStatus).toBe(200);
    expect(denied.result.type).toBe('failure');
    expect(denied.result.status).toBe(403);
    expect(JSON.stringify(denied.result.data)).toContain('BILLING_FINANCE_REQUIRED');
    steps.push({ step: 'worker-pack-denied', code: 'BILLING_FINANCE_REQUIRED' });
  } finally {
    await worker.close();
  }

  expect(diagnostic.errors).toEqual([]);
  saveEvidence(`pack-${info.project.name}-${locale}`, screenshot, steps, diagnostic.responses);
});
