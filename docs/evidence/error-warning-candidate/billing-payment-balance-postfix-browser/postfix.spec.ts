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
      `SELECT id,invoice_number,total_minor FROM invoice
       WHERE state IN ('issued','sent','partially_paid','overdue')
         AND invoice_number IS NOT NULL AND total_minor>10000
         AND tenant_id IS NOT NULL AND deployment_id IS NOT NULL
         AND legal_entity_revision_id IS NOT NULL
       ORDER BY issued_at DESC,id LIMIT 1`,
    )
    .get() as { id: string; invoice_number: string; total_minor: number } | undefined;
  if (!row) throw new Error('Disposable fixture lacks an issued invoice');
  return row;
}

function paymentCount(db: DatabaseSync, invoiceId: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM payment WHERE invoice_id=?').get(invoiceId) as {
      count: number;
    }
  ).count;
}

function decimalToMinor(value: string) {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/u);
  if (!match) throw new Error('Unexpected money input max');
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
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

function displayedMinor(value: string | null) {
  return value?.replace(/\D/gu, '') ?? '';
}

async function openPaymentForm(
  page: Page,
  invoice: ReturnType<typeof issuedInvoice>,
  locale: string,
) {
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
  const paymentDetails = panel.locator('details.billing-section__action-panel').filter({
    has: page.locator('form[action="?/recordPayment"]'),
  });
  if (!(await paymentDetails.evaluate((el: HTMLDetailsElement) => el.open)))
    await paymentDetails.locator('summary').click();
  const form = panel.locator('form[action="?/recordPayment"]');
  await expect(form).toBeVisible();
  return form;
}

async function fillPayment(form: Locator, amount: string, reference: string) {
  await form.locator('input[name="amount"]').fill(amount);
  await form.locator('input[name="reference"]').fill(reference);
  await form.locator('input[name="idempotencyKey"]').evaluate((input: HTMLInputElement) => {
    input.value = `qa-balance-${crypto.randomUUID()}`;
  });
}

async function submitPayment(page: Page, form: Locator, native: boolean) {
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordPayment'),
  );
  if (native) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      form.evaluate((element: HTMLFormElement) => element.submit()),
    ]);
  } else
    await form
      .getByRole('button', { name: /Record payment|Registrar pagamento|Registrar pago/i })
      .click();
  const response = await pending;
  await page.waitForLoadState('networkidle');
  const body = await response.text();
  return {
    transportStatus: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    code: body.match(/BILLING_[A-Z_]+/u)?.[0] ?? null,
    genericPhrase: body.includes('Check the submitted values'),
    responseBody: body,
  };
}

async function visibleState(page: Page, reference: string) {
  const notice = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"]');
  await expect(notice).toBeVisible();
  await expect
    .poll(() => notice.evaluate((element) => document.activeElement === element))
    .toBe(true);
  const state = await page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>(
      '[data-billing-payment-problem] [data-ui="problem-notice"]',
    );
    const amount = document.querySelector<HTMLInputElement>(
      'form[action="?/recordPayment"] input[name="amount"]',
    );
    const reference = document.querySelector<HTMLInputElement>(
      'form[action="?/recordPayment"] input[name="reference"]',
    );
    const headerBottom =
      document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0;
    const box = notice?.getBoundingClientRect();
    return {
      code: notice?.getAttribute('data-problem-code'),
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedy: [...(notice?.querySelectorAll('a') ?? [])].map((link) => link.textContent?.trim()),
      remedyHref:
        notice
          ?.querySelector('a')
          ?.getAttribute('href')
          ?.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/iu, '/:record') ?? null,
      remedyHardReload: notice?.querySelector('a')?.hasAttribute('data-sveltekit-reload') ?? false,
      currentBalanceDisplay:
        notice?.querySelector('.ui-problem-notice__status')?.textContent?.trim() ?? null,
      focused:
        document.activeElement === notice
          ? 'notice'
          : document.activeElement === amount
            ? 'amount'
            : document.activeElement?.tagName.toLowerCase(),
      focusTop: box ? Math.round(box.top) : null,
      focusBottom: box ? Math.round(box.bottom) : null,
      headerBottom: Math.round(headerBottom),
      viewportHeight: innerHeight,
      scrollY: Math.round(scrollY),
      amount: amount?.value ?? null,
      referenceRetained: reference?.value ?? null,
      formMax: amount?.max ?? null,
    };
  });
  expect(state.referenceRetained).toBe(reference);
  return state;
}

async function reviewLedgerBehavior(page: Page, invoiceId: string) {
  const before = await page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    max:
      document.querySelector<HTMLInputElement>(
        'form[action="?/recordPayment"] input[name="amount"]',
      )?.max ?? null,
  }));
  const link = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"] a');
  await expect(link).toHaveAttribute('data-sveltekit-reload', '');
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForLoadState('networkidle');
  const after = await page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    hash: location.hash,
    max:
      document.querySelector<HTMLInputElement>(
        'form[action="?/recordPayment"] input[name="amount"]',
      )?.max ?? null,
    noticeStillPresent: Boolean(
      document.querySelector('[data-billing-payment-problem] [data-ui="problem-notice"]'),
    ),
    collectionTop: Math.round(
      document.querySelector('#invoice-collections')?.getBoundingClientRect().top ?? 0,
    ),
    drawerScrollTop: Math.round(document.querySelector('.responsive-sheet-body')?.scrollTop ?? 0),
  }));
  return {
    href: href?.replace(invoiceId, ':record') ?? null,
    freshDocument: before.timeOrigin !== after.timeOrigin,
    maxBefore: before.max,
    maxAfter: after.max,
    hashAfter: after.hash,
    noticeStillPresent: after.noticeStillPresent,
    collectionTop: after.collectionTop,
    drawerScrollTop: after.drawerScrollTop,
  };
}

test('stale invoice balance post-fix across roles and form modes', async ({ browser, page }) => {
  test.setTimeout(180_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const invoice = issuedInvoice(db);
  const financeDiagnostics = diagnostics(page);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerContext.newPage();
  const ownerDiagnostics = diagnostics(owner);
  const results: Record<string, unknown> = {
    candidateFingerprint: process.env.JA_QA_CANDIDATE ?? '06d87c1 plus frozen Billing diff',
    fixture:
      'new disposable database; seeded issued invoice; UI-created partial collections in two authorized roles',
    cases: [],
  };
  const cases = results.cases as Array<Record<string, unknown>>;
  try {
    await signIn(page, 'finance');
    await signIn(owner, 'owner');
    const financeForm = await openPaymentForm(page, invoice, 'en');
    const initialMax = await financeForm.locator('input[name="amount"]').getAttribute('max');
    if (!initialMax || decimalToMinor(initialMax) < 300n)
      throw new Error('Insufficient disposable invoice balance');
    const financeReference = `QA finance stale balance ${randomUUID()}`;
    await fillPayment(financeForm, initialMax, financeReference);
    const financeBefore = await page.evaluate(() => Math.round(scrollY));

    const ownerForm = await openPaymentForm(owner, invoice, 'es');
    await fillPayment(ownerForm, '1.00', `QA owner partial collection ${randomUUID()}`);
    const countBefore = paymentCount(db, invoice.id);
    const ownerSuccess = await submitPayment(owner, ownerForm, false);
    expect(ownerSuccess.transportStatus).toBe(200);
    expect(ownerSuccess.responseBody).toContain('action.billing.paymentRecorded');
    await expect.poll(() => paymentCount(db, invoice.id)).toBe(countBefore + 1);

    const financeResult = await submitPayment(page, financeForm, true);
    const financeVisible = await visibleState(page, financeReference);
    const financeBalanceMinor = decimalToMinor(initialMax) - 100n;
    expect(financeResult.transportStatus).toBe(409);
    expect(financeResult.code).toBe('BILLING_PAYMENT_EXCEEDS_BALANCE');
    expect(financeVisible.code).toBe('BILLING_PAYMENT_EXCEEDS_BALANCE');
    expect(financeVisible.amount).toBe(initialMax);
    expect(financeVisible.focused).toBe('notice');
    expect(financeVisible.focusTop).toBeGreaterThanOrEqual(financeVisible.headerBottom + 8);
    expect(financeVisible.focusBottom).toBeLessThanOrEqual(financeVisible.viewportHeight);
    expect(financeVisible.scrollY).toBe(financeBefore);
    expect(financeVisible.currentBalanceDisplay).toBeTruthy();
    expect(displayedMinor(financeVisible.currentBalanceDisplay)).toContain(
      financeBalanceMinor.toString(),
    );
    expect(paymentCount(db, invoice.id)).toBe(countBefore + 1);
    const financeNotice = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"]');
    await financeNotice.screenshot({ path: join(evidenceRoot, 'finance-phone-390-en-notice.png') });
    const financeRemedy = await reviewLedgerBehavior(page, invoice.id);
    expect(financeRemedy.freshDocument).toBe(true);
    expect(financeRemedy.maxAfter).toBe(
      `${financeBalanceMinor / 100n}.${String(financeBalanceMinor % 100n).padStart(2, '0')}`,
    );
    expect(financeRemedy.noticeStillPresent).toBe(false);
    expect(paymentCount(db, invoice.id)).toBe(countBefore + 1);
    cases.push({
      role: 'finance',
      viewport: '390x844',
      locale: 'en',
      mode: 'native',
      beforeScrollY: financeBefore,
      expectedCurrentBalanceMinor: financeBalanceMinor.toString(),
      response: { ...financeResult, responseBody: undefined },
      visible: {
        ...financeVisible,
        referenceRetained: financeVisible.referenceRetained === financeReference,
      },
      remedyBehavior: financeRemedy,
      paymentCountUnchanged: true,
    });

    const ownerFresh = await openPaymentForm(owner, invoice, 'es');
    const secondMax = await ownerFresh.locator('input[name="amount"]').getAttribute('max');
    if (!secondMax || decimalToMinor(secondMax) < 200n)
      throw new Error('No balance left for second race');
    const ownerReference = `QA owner stale balance ${randomUUID()}`;
    await fillPayment(ownerFresh, secondMax, ownerReference);
    const ownerBefore = await owner.evaluate(() => Math.round(scrollY));
    const financeFresh = await openPaymentForm(page, invoice, 'en');
    await fillPayment(financeFresh, '1.00', `QA finance partial collection ${randomUUID()}`);
    const countBeforeSecond = paymentCount(db, invoice.id);
    const financeSuccess = await submitPayment(page, financeFresh, false);
    expect(financeSuccess.transportStatus).toBe(200);
    expect(financeSuccess.responseBody).toContain('action.billing.paymentRecorded');
    await expect.poll(() => paymentCount(db, invoice.id)).toBe(countBeforeSecond + 1);

    const ownerResult = await submitPayment(owner, ownerFresh, false);
    const ownerVisible = await visibleState(owner, ownerReference);
    const ownerBalanceMinor = decimalToMinor(secondMax) - 100n;
    const ownerAction = JSON.parse(ownerResult.responseBody) as {
      type: string;
      status: number;
      data: string;
    };
    const ownerDecoded = await decodeActionData(ownerAction.data);
    expect(ownerResult.transportStatus).toBe(200);
    expect(ownerAction).toMatchObject({ type: 'failure', status: 409 });
    expect(ownerDecoded).toMatchObject({
      code: 'BILLING_PAYMENT_EXCEEDS_BALANCE',
      params: { remainingMinor: ownerBalanceMinor.toString() },
    });
    expect(ownerVisible.code).toBe('BILLING_PAYMENT_EXCEEDS_BALANCE');
    expect(ownerVisible.amount).toBe(secondMax);
    expect(ownerVisible.focused).toBe('notice');
    expect(ownerVisible.focusTop).toBeGreaterThanOrEqual(ownerVisible.headerBottom + 8);
    expect(ownerVisible.focusBottom).toBeLessThanOrEqual(ownerVisible.viewportHeight);
    expect(ownerVisible.scrollY).toBe(ownerBefore);
    expect(displayedMinor(ownerVisible.currentBalanceDisplay)).toContain(
      ownerBalanceMinor.toString(),
    );
    expect(paymentCount(db, invoice.id)).toBe(countBeforeSecond + 1);
    await owner
      .locator('[data-billing-payment-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'owner-desktop-1440-es-notice.png') });
    const ownerRemedy = await reviewLedgerBehavior(owner, invoice.id);
    expect(ownerRemedy.freshDocument).toBe(true);
    expect(ownerRemedy.maxAfter).toBe(
      `${ownerBalanceMinor / 100n}.${String(ownerBalanceMinor % 100n).padStart(2, '0')}`,
    );
    expect(ownerRemedy.noticeStillPresent).toBe(false);
    expect(paymentCount(db, invoice.id)).toBe(countBeforeSecond + 1);
    cases.push({
      role: 'owner',
      viewport: '1440x900',
      locale: 'es',
      mode: 'enhanced',
      beforeScrollY: ownerBefore,
      expectedCurrentBalanceMinor: ownerBalanceMinor.toString(),
      response: { ...ownerResult, responseBody: undefined },
      actionPayload: {
        type: ownerAction.type,
        status: ownerAction.status,
        code: ownerDecoded.code,
        messageKey: ownerDecoded.messageKey,
        params: ownerDecoded.params,
        remedies: ownerDecoded.remedies,
      },
      visible: {
        ...ownerVisible,
        referenceRetained: ownerVisible.referenceRetained === ownerReference,
      },
      remedyBehavior: ownerRemedy,
      paymentCountUnchanged: true,
    });
    expect(financeDiagnostics.pageErrors).toEqual([]);
    expect(financeDiagnostics.consoleErrors).toEqual([]);
    expect(ownerDiagnostics.pageErrors).toEqual([]);
    expect(ownerDiagnostics.consoleErrors).toEqual([]);
    results.diagnostics = { finance: financeDiagnostics, owner: ownerDiagnostics };
  } finally {
    db.close();
    await ownerContext.close();
    writeSanitizedResults(results);
  }
});
