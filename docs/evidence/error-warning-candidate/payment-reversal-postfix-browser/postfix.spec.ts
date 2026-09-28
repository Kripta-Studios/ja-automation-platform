import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const today = new Date().toISOString().slice(0, 10);

function diagnostics(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    failedRequests: [] as string[],
  };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      result.failedRequests.push(
        `${response.status()} ${new URL(response.url()).pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/iu, '/:record')}`,
      );
  });
  return result;
}

function writeSanitizedResults(results: Record<string, unknown>) {
  writeFileSync(
    join(evidenceRoot, 'results.json'),
    JSON.stringify(
      results,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(
              /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
              ':record',
            )
          : value,
      2,
    ) + '\n',
  );
}

async function decodeActionData(data: string): Promise<Record<string, unknown>> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return parse(data);
}

function issuedInvoice(db: DatabaseSync) {
  const row = db
    .prepare(
      `SELECT id,invoice_number FROM invoice
       WHERE state IN ('issued','sent','partially_paid','overdue')
         AND invoice_number IS NOT NULL AND total_minor>10000
         AND tenant_id IS NOT NULL AND deployment_id IS NOT NULL
         AND legal_entity_revision_id IS NOT NULL
       ORDER BY issued_at DESC,id LIMIT 1`,
    )
    .get() as { id: string; invoice_number: string } | undefined;
  if (!row) throw new Error('Disposable fixture lacks an issued invoice');
  return row;
}

function createdPayment(db: DatabaseSync, invoiceId: string, reference: string) {
  return db
    .prepare('SELECT id FROM payment WHERE invoice_id=? AND reference=?')
    .get(invoiceId, reference) as { id: string } | undefined;
}

function reversalCount(db: DatabaseSync, paymentId: string) {
  return (
    db
      .prepare(
        'SELECT COUNT(*) count FROM invoice_payment_reversal_event WHERE original_payment_id=?',
      )
      .get(paymentId) as { count: number }
  ).count;
}

async function openInvoice(page: Page, invoice: ReturnType<typeof issuedInvoice>, locale: string) {
  await page.goto(portal(`/billing?view=invoices&stage=outstanding&lang=${locale}`));
  await page
    .getByRole('form', { name: /Filter billing|Filtrar faturamento|Filtrar facturación/i })
    .locator('input[type="search"]')
    .fill(invoice.invoice_number);
  const card = page.locator(`[data-table-region-cards] article[data-row="${invoice.id}"]`);
  if (await card.isVisible()) await card.locator('a[data-card-action]').click();
  else
    await page
      .locator(`tr[data-invoice-row="${invoice.id}"]`)
      .getByRole('button', { name: /Manage|Gerenciar|Gestionar/i })
      .click();
  const panel = page.locator('[data-ui="responsive-sheet"]');
  await expect(panel).toBeVisible();
  return panel;
}

async function createPayment(
  page: Page,
  db: DatabaseSync,
  invoice: ReturnType<typeof issuedInvoice>,
) {
  const panel = await openInvoice(page, invoice, 'en');
  const details = panel
    .locator('details.billing-section__action-panel')
    .filter({ has: page.locator('form[action="?/recordPayment"]') });
  await details.locator('summary').click();
  const form = details.locator('form[action="?/recordPayment"]');
  const reference = `QA reversal baseline ${randomUUID()}`;
  await form.locator('input[name="amount"]').fill('10.00');
  await form.locator('input[name="reference"]').fill(reference);
  await form.locator('input[name="idempotencyKey"]').evaluate((input: HTMLInputElement) => {
    input.value = `qa-reversal-source-${crypto.randomUUID()}`;
  });
  const pending = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/recordPayment'),
  );
  await form.getByRole('button', { name: /Record payment/i }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('action.billing.paymentRecorded');
  await expect.poll(() => createdPayment(db, invoice.id, reference)).toBeTruthy();
  return createdPayment(db, invoice.id, reference)!.id;
}

async function openReversal(
  page: Page,
  invoice: ReturnType<typeof issuedInvoice>,
  paymentId: string,
  locale: string,
) {
  const panel = await openInvoice(page, invoice, locale);
  const history = panel.locator('details.billing-section__payment-history');
  if (!(await history.evaluate((el: HTMLDetailsElement) => el.open)))
    await history.locator('summary').click();
  const form = history.locator(
    `article.billing-section__payment-row:has(form input[name="paymentId"][value="${paymentId}"]) form[action="?/reversePayment"]`,
  );
  await expect(form).toBeVisible();
  return form;
}

async function fillReversal(form: Locator, amount: string, reason: string) {
  await form.locator('[name="amount"]').fill(amount);
  await form.locator('[name="effectiveOn"]').fill(today);
  await form.locator('[name="reason"]').fill(reason);
}

async function postReversal(page: Page, form: Locator, native: boolean) {
  const pending = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/reversePayment'),
  );
  if (native) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      form.evaluate((el: HTMLFormElement) => el.submit()),
    ]);
  } else
    await form
      .getByRole('button', { name: /Reverse payment|Reverter pagamento|Revertir pago/i })
      .click();
  const response = await pending;
  await page.waitForLoadState('networkidle');
  const body = await response.text();
  return {
    transportStatus: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    actionStatus: body.match(/"status":(\d+)/u)?.[1] ?? null,
    code: body.match(/BILLING_[A-Z_]+/u)?.[0] ?? null,
  };
}

async function enhancedReversalProbe(page: Page, paymentId: string) {
  const result = await page.evaluate(
    async ({ paymentId, actionUrl }) => {
      const form = [
        ...document.querySelectorAll<HTMLFormElement>('form[action="?/reversePayment"]'),
      ].find(
        (item) =>
          item.querySelector<HTMLInputElement>('input[name="paymentId"]')?.value === paymentId,
      );
      if (!form) throw new Error('Retained reversal form is unavailable');
      const response = await fetch(actionUrl, {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: new FormData(form),
      });
      return { transportStatus: response.status, body: await response.json() };
    },
    { paymentId, actionUrl: portal('/billing?/reversePayment') },
  );
  const data = await decodeActionData(result.body.data);
  return {
    transportStatus: result.transportStatus,
    type: result.body.type,
    actionStatus: result.body.status,
    code: data.code,
    messageKey: data.messageKey,
    params: data.params,
    remedies: data.remedies,
  };
}

async function problemState(page: Page, paymentId: string, reason: string) {
  const notice = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"]');
  await expect(notice).toBeVisible();
  const state = await page.evaluate((paymentId) => {
    const notice = document.querySelector<HTMLElement>(
      '[data-billing-payment-problem] [data-ui="problem-notice"]',
    );
    const form = [
      ...document.querySelectorAll<HTMLFormElement>('form[action="?/reversePayment"]'),
    ].find(
      (item) =>
        item.querySelector<HTMLInputElement>('input[name="paymentId"]')?.value === paymentId,
    );
    const amount = form?.querySelector<HTMLInputElement>('[name="amount"]');
    const reasonInput = form?.querySelector<HTMLInputElement>('[name="reason"]');
    const noticeBox = notice?.getBoundingClientRect();
    const activeBox = document.activeElement?.getBoundingClientRect();
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll('a') ?? [])].map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute('href'),
        hardReload: link.hasAttribute('data-sveltekit-reload'),
      })),
      currentReversibleDisplay:
        notice?.querySelector('.ui-problem-notice__status')?.textContent?.trim() ?? null,
      amount: amount?.value ?? null,
      max: amount?.max ?? null,
      reason: reasonInput?.value ?? null,
      focused:
        document.activeElement === amount
          ? 'amount'
          : document.activeElement === notice
            ? 'notice'
            : document.activeElement?.tagName.toLowerCase(),
      activeTop: activeBox ? Math.round(activeBox.top) : null,
      activeBottom: activeBox ? Math.round(activeBox.bottom) : null,
      noticeTop: noticeBox ? Math.round(noticeBox.top) : null,
      noticeBottom: noticeBox ? Math.round(noticeBox.bottom) : null,
      headerBottom: Math.round(
        document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0,
      ),
      scrollY: Math.round(scrollY),
      drawerScrollTop: Math.round(document.querySelector('.responsive-sheet-body')?.scrollTop ?? 0),
      viewportHeight: innerHeight,
      urlHasInvoiceFilter: location.search.includes('view=invoices'),
      locale: new URL(location.href).searchParams.get('lang'),
    };
  }, paymentId);
  expect(state.reason).toBe(reason);
  return state;
}

async function remedyBehavior(page: Page, invoiceId: string, paymentId: string) {
  const before = await page.evaluate(() => performance.timeOrigin);
  const link = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"] a').first();
  await expect(link).toHaveAttribute('data-sveltekit-reload', '');
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForLoadState('networkidle');
  const after = await page.evaluate(
    ({ before, href }) => ({
      href,
      freshDocument: before !== performance.timeOrigin,
      path: location.pathname,
      search: location.search,
      hash: location.hash,
      drawerOpen: Boolean(document.querySelector('[data-ui="responsive-sheet"]')),
      noticePresent: Boolean(
        document.querySelector('[data-billing-payment-problem] [data-ui="problem-notice"]'),
      ),
    }),
    { before, href },
  );
  const history = page.locator(
    '[data-ui="responsive-sheet"] details.billing-section__payment-history',
  );
  if (!(await history.evaluate((el: HTMLDetailsElement) => el.open)))
    await history.locator('summary').click();
  const form = history.locator(
    `article.billing-section__payment-row:has(form input[name="paymentId"][value="${paymentId}"]) form[action="?/reversePayment"]`,
  );
  await expect(form).toBeVisible();
  return {
    ...after,
    href: after.href?.replace(invoiceId, ':invoice') ?? null,
    maxAfter: await form.locator('input[name="amount"]').getAttribute('max'),
  };
}

test('reversal positive and remaining amount browser post-fix', async ({ browser, page }) => {
  test.setTimeout(180_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const invoice = issuedInvoice(db);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerContext.newPage();
  const financeDiagnostics = diagnostics(page);
  const ownerDiagnostics = diagnostics(owner);
  const results: Record<string, unknown> = {
    candidateFingerprint: process.env.JA_QA_CANDIDATE ?? 'f1be29ff plus held reversal diff',
    fixture:
      'fresh disposable database; seeded issued invoice; payment created via rendered form; blocked reversal forms submitted natively',
    cases: [],
  };
  const cases = results.cases as Array<Record<string, unknown>>;
  try {
    await signIn(page, 'finance');
    await signIn(owner, 'owner');
    const paymentId = await createPayment(page, db, invoice);
    expect(reversalCount(db, paymentId)).toBe(0);

    const invalid = await openReversal(page, invoice, paymentId, 'en');
    const invalidReason = `QA over-remaining reversal ${randomUUID()}`;
    await fillReversal(invalid, '99.00', invalidReason);
    await invalid.scrollIntoViewIfNeeded();
    const beforeInvalid = await page.evaluate(() => ({
      window: Math.round(scrollY),
      drawer: Math.round(document.querySelector('.responsive-sheet-body')?.scrollTop ?? 0),
    }));
    const invalidResult = await postReversal(page, invalid, true);
    const invalidVisible = await problemState(page, paymentId, invalidReason);
    const invalidEnhanced = await enhancedReversalProbe(page, paymentId);
    expect(invalidResult.transportStatus).toBe(409);
    expect(invalidResult.code).toBe('BILLING_REVERSAL_EXCEEDS_REMAINING');
    expect(invalidEnhanced).toMatchObject({
      transportStatus: 200,
      type: 'failure',
      actionStatus: 409,
      code: 'BILLING_REVERSAL_EXCEEDS_REMAINING',
      params: { remainingMinor: '1000', currency: 'USD' },
    });
    expect(invalidVisible.code).toBe('BILLING_REVERSAL_EXCEEDS_REMAINING');
    expect(invalidVisible.wording).toContain('This reversal exceeds the amount still available');
    expect(invalidVisible.currentReversibleDisplay).toContain('10.00');
    expect(invalidVisible.amount).toBe('99.00');
    expect(invalidVisible.focused).toBe('notice');
    expect(invalidVisible.noticeTop).toBeGreaterThanOrEqual(invalidVisible.headerBottom + 8);
    expect(invalidVisible.noticeBottom).toBeLessThanOrEqual(invalidVisible.viewportHeight);
    expect(invalidVisible.scrollY).toBe(beforeInvalid.window);
    expect(invalidVisible.remedies[0]?.hardReload).toBe(true);
    expect(reversalCount(db, paymentId)).toBe(0);
    await page
      .locator('[data-billing-payment-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'finance-phone-390-en-over-remaining.png') });
    const invalidRemedy = await remedyBehavior(page, invoice.id, paymentId);
    expect(invalidRemedy.freshDocument).toBe(true);
    expect(invalidRemedy.maxAfter).toBe('10.00');
    expect(invalidRemedy.noticePresent).toBe(false);
    expect(invalidRemedy.search).toContain('view=invoices');
    expect(invalidRemedy.search).toContain(`invoice=${invoice.id}`);
    expect(invalidRemedy.hash).toBe('#invoice-collections');
    expect(reversalCount(db, paymentId)).toBe(0);
    cases.push({
      role: 'finance',
      viewport: '390x844',
      locale: 'en',
      mode: 'native',
      kind: 'over-remaining',
      beforeScroll: beforeInvalid,
      response: invalidResult,
      enhancedProbe: invalidEnhanced,
      visible: { ...invalidVisible, reason: undefined },
      reasonRetained: true,
      remedyBehavior: invalidRemedy,
      reversalCount: 0,
    });

    const zero = await openReversal(page, invoice, paymentId, 'en');
    const zeroReason = `QA zero reversal ${randomUUID()}`;
    await fillReversal(zero, '0.00', zeroReason);
    await zero.scrollIntoViewIfNeeded();
    const beforeZero = await page.evaluate(() => ({
      window: Math.round(scrollY),
      drawer: Math.round(document.querySelector('.responsive-sheet-body')?.scrollTop ?? 0),
    }));
    const zeroResult = await postReversal(page, zero, true);
    const zeroVisible = await problemState(page, paymentId, zeroReason);
    const zeroEnhanced = await enhancedReversalProbe(page, paymentId);
    expect(zeroResult.transportStatus).toBe(400);
    expect(zeroResult.code).toBe('BILLING_REVERSAL_POSITIVE_REQUIRED');
    expect(zeroEnhanced).toMatchObject({
      transportStatus: 200,
      type: 'failure',
      actionStatus: 400,
      code: 'BILLING_REVERSAL_POSITIVE_REQUIRED',
    });
    expect(zeroVisible.code).toBe('BILLING_REVERSAL_POSITIVE_REQUIRED');
    expect(zeroVisible.wording).toContain('greater than zero');
    expect(zeroVisible.amount).toBe('0.00');
    expect(zeroVisible.focused).toBe('amount');
    expect(zeroVisible.activeTop).toBeGreaterThanOrEqual(zeroVisible.headerBottom);
    expect(zeroVisible.activeBottom).toBeLessThanOrEqual(zeroVisible.viewportHeight);
    expect(zeroVisible.scrollY).toBe(beforeZero.window);
    expect(reversalCount(db, paymentId)).toBe(0);
    await page
      .locator('[data-billing-payment-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'finance-phone-390-en-zero.png') });
    cases.push({
      role: 'finance',
      viewport: '390x844',
      locale: 'en',
      mode: 'native',
      kind: 'zero',
      beforeScroll: beforeZero,
      response: zeroResult,
      enhancedProbe: zeroEnhanced,
      visible: { ...zeroVisible, reason: undefined },
      reasonRetained: true,
      reversalCount: 0,
    });

    // The separate two-role race is opt-in so the known-rule baseline stays deterministic.
    if (process.env.JA_REVERSAL_RACE === '1') {
      const stale = await openReversal(page, invoice, paymentId, 'en');
      const staleReason = `QA finance stale reversal ${randomUUID()}`;
      await fillReversal(stale, '10.00', staleReason);
      const ownerForm = await openReversal(owner, invoice, paymentId, 'pt');
      const ownerReason = `QA owner partial reversal ${randomUUID()}`;
      await fillReversal(ownerForm, '4.00', ownerReason);
      const sameKey =
        (await stale.locator('[name="idempotencyKey"]').inputValue()) ===
        (await ownerForm.locator('[name="idempotencyKey"]').inputValue());
      expect(sameKey).toBe(true);
      const ownerSuccess = await postReversal(owner, ownerForm, false);
      expect(ownerSuccess.transportStatus).toBe(200);
      await expect.poll(() => reversalCount(db, paymentId)).toBe(1);
      const staleBefore = await page.evaluate(() => ({
        window: Math.round(scrollY),
        drawer: Math.round(document.querySelector('.responsive-sheet-body')?.scrollTop ?? 0),
      }));
      const staleResult = await postReversal(page, stale, false);
      const staleVisible = await problemState(page, paymentId, staleReason);
      expect(staleResult.transportStatus).toBe(200);
      expect(staleResult.actionStatus).toBe('409');
      expect(staleVisible.code).toBe('BILLING_IDEMPOTENCY_REUSED');
      expect(staleVisible.amount).toBe('10.00');
      expect(reversalCount(db, paymentId)).toBe(1);
      await page
        .locator('[data-billing-payment-problem] [data-ui="problem-notice"]')
        .screenshot({ path: join(evidenceRoot, 'finance-phone-390-en-stale-key.png') });
      const staleRemedy = await remedyBehavior(page, invoice.id, paymentId);
      cases.push({
        role: 'finance',
        viewport: '390x844',
        locale: 'en',
        mode: 'enhanced',
        kind: 'stale-two-role',
        otherRole: 'owner',
        otherRoleViewport: '1440x900',
        otherRoleLocale: 'pt',
        sameRenderedKey: sameKey,
        ownerSuccess,
        beforeScroll: staleBefore,
        response: staleResult,
        visible: { ...staleVisible, reason: undefined },
        reasonRetained: true,
        remedyBehavior: staleRemedy,
        reversalCount: 1,
      });
    }

    expect(financeDiagnostics.pageErrors).toEqual([]);
    expect(financeDiagnostics.consoleErrors).toEqual([]);
    expect(ownerDiagnostics.pageErrors).toEqual([]);
    expect(ownerDiagnostics.consoleErrors).toEqual([]);
    results.diagnostics = { finance: financeDiagnostics, owner: ownerDiagnostics };
  } finally {
    db.close();
    if (!owner.isClosed()) await ownerContext.close().catch(() => {});
    writeSanitizedResults(results);
  }
});
