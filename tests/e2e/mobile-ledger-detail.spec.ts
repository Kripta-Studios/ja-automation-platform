import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';

const partialPaymentReferencePrefix = 'Responsive ledger partial payment';
const partialReversalReasonPrefix = 'Responsive ledger partial reversal';

function minorToDecimal(minor: bigint): string {
  const whole = minor / 100n;
  const fraction = (minor % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

function decimalToMinor(value: string): bigint {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/u);
  if (!match) throw new Error(`Unexpected decimal amount: ${value}`);
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
}

function dateInputValue(value: string, context: string): string {
  const normalized = value.trim();
  const iso = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/u);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dayFirst = normalized.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/u);
  if (dayFirst) {
    return `${dayFirst[3]}-${dayFirst[2]!.padStart(2, '0')}-${dayFirst[1]!.padStart(2, '0')}`;
  }

  throw new Error(`Expected a real ${context} date, received: ${value}`);
}

function actionResponseExcerpt(body: string): string {
  const compact = body.replace(/\s+/gu, ' ');
  const anchors = ['messageKey', 'success', 'Payment reversal', 'Payment recorded'];
  const anchor = anchors
    .map((value) => compact.indexOf(value))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (anchor === undefined) return compact.slice(-1200);
  return compact.slice(Math.max(0, anchor - 300), anchor + 900);
}

function expectActionSuccessResponse(body: string, action: string, messageKey: string): void {
  const hasSuccess = /(?:success|&quot;success&quot;)\s*[:=]\s*(?:true|!0)/iu.test(body);
  const hasMessageKey = body.includes(messageKey);
  expect(
    { success: hasSuccess, messageKey: hasMessageKey },
    `${action} action response must contain success=true and ${messageKey}; response excerpt: ${actionResponseExcerpt(body)}`,
  ).toEqual({ success: true, messageKey: true });
}

async function actualIssueDate(row: Locator): Promise<string> {
  const issuedOn = await row.getAttribute('data-invoice-issued-on');
  if (issuedOn) return dateInputValue(issuedOn, 'actual issue');
  const label = row
    .locator('.billing-section__invoice-dates span')
    .filter({ hasText: /^Actual issue$/u });
  await expect(label, 'the issued fixture invoice must expose its actual issue date').toHaveCount(
    1,
  );
  const displayedDate = await label.locator('xpath=..').locator('strong').innerText();
  return dateInputValue(displayedDate, 'actual issue');
}

async function paymentReceivedDate(payment: Locator): Promise<string> {
  const displayedDetails = await payment.locator('small').first().innerText();
  return dateInputValue(displayedDetails, 'payment received');
}

async function stepUpFinance(page: Page): Promise<void> {
  const response = await page.request.post(portal('/api/step-up'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { password: e2eCredentials.finance.password },
  });
  expect(response.ok(), 'the payment/reversal helper requires a real Finance step-up').toBe(true);
}

function paymentHistory(row: Locator): Locator {
  return row.locator('details.billing-section__payment-history');
}

async function expectPersistedReversal(history: Locator, reason: string): Promise<void> {
  await expect(history.getByText('Immutable reversal history', { exact: true })).toBeVisible();
  const reversalRow = history
    .locator('.billing-section__reversal-table tbody tr')
    .filter({ hasText: reason });
  await expect(reversalRow).toHaveCount(1);
  await expect(reversalRow).toContainText(reason);
}

async function openInvoicePaymentHistory(row: Locator): Promise<Locator> {
  const history = paymentHistory(row);
  const isOpen = await history.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await history.locator('summary').click();
  }
  await expect(history).toBeVisible();
  return history;
}

/**
 * Establish the ledger state through the same authorized Finance forms a user
 * operates. The reference/reason values make retries idempotent at the test
 * level: an existing active payment is completed with its reversal, while a
 * fully reversed prior attempt remains immutable and a fresh payment is
 * recorded for that viewport. Each required phone width owns its own stable
 * reference so the two evidence runs cannot accidentally consume each other.
 */
async function ensurePartialPaymentAndReversal(
  page: Page,
  viewportWidth: number,
): Promise<{ paymentReference: string; reversalReason: string }> {
  const paymentReference = `${partialPaymentReferencePrefix} · ${viewportWidth}px`;
  const reversalReason = `${partialReversalReasonPrefix} · ${viewportWidth}px`;
  await page.goto(portal('/billing'), { waitUntil: 'networkidle' });
  await stepUpFinance(page);

  const invoiceRow = page
    .locator('tr[data-invoice-row][data-invoice-issued-on]:not([data-invoice-issued-on=""])')
    .filter({
      has: page.locator(
        '[data-invoice-status="issued"], [data-invoice-status="sent"], [data-invoice-status="partially_paid"], [data-invoice-status="overdue"]',
      ),
    })
    .first();
  await expect(invoiceRow).toBeVisible();
  const invoiceRowId = await invoiceRow.getAttribute('data-invoice-row');
  expect(invoiceRowId, 'the issued fixture invoice must expose a stable row id').toBeTruthy();
  const issuedOn = await actualIssueDate(invoiceRow);
  await invoiceRow.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.locator('[data-ui="responsive-sheet"]')).toBeVisible();
  const managedInvoice = page.locator(`[data-invoice-row="${invoiceRowId}"]`);

  let history = await openInvoicePaymentHistory(managedInvoice);
  let payment = history
    .locator('.billing-section__payment-row')
    .filter({
      hasText: paymentReference,
    })
    .last();
  let recordedNewPayment = false;
  const existingPaymentIsActive =
    (await payment.count()) > 0 &&
    (await payment.locator('form[action="?/reversePayment"]').count()) > 0;
  const existingReversalIsPresent =
    (await history.getByText(reversalReason, { exact: true }).count()) > 0;
  let paymentReceivedOn = existingPaymentIsActive ? await paymentReceivedDate(payment) : issuedOn;

  if (!existingPaymentIsActive) {
    const paymentForm = managedInvoice.locator('form[action="?/recordPayment"]');
    const amountInput = paymentForm.locator('input[name="amount"]');
    const maxText = await amountInput.getAttribute('max');
    const maximumMinor = decimalToMinor(maxText ?? '0');
    expect(
      maximumMinor,
      'the issued fixture invoice must allow a partial payment',
    ).toBeGreaterThanOrEqual(2n);
    const paymentMinor = maximumMinor < 200n ? maximumMinor : 200n;

    await paymentForm.locator('input[name="amount"]').fill(minorToDecimal(paymentMinor));
    await paymentForm.locator('input[name="receivedOn"]').fill(issuedOn);
    await paymentForm.locator('input[name="reference"]').fill(paymentReference);
    const paymentResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/recordPayment'),
    );
    await paymentForm.getByRole('button', { name: 'Record payment', exact: true }).click();
    const paymentResponse = await paymentResponsePromise;
    expect(paymentResponse.status(), 'record payment action must persist successfully').toBe(200);
    expectActionSuccessResponse(
      await paymentResponse.text(),
      'record payment',
      'action.billing.paymentRecorded',
    );
    await expect(page.getByRole('status').filter({ hasText: 'Payment recorded' })).toBeVisible();

    const refreshedTableRow = page.locator(`tr[data-invoice-row="${invoiceRowId}"]`);
    await expect(refreshedTableRow).toBeVisible();
    await refreshedTableRow.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.locator('[data-ui="responsive-sheet"]')).toBeVisible();
    const refreshedInvoiceRow = page.locator(`[data-invoice-row="${invoiceRowId}"]`);
    history = await openInvoicePaymentHistory(refreshedInvoiceRow);
    payment = history
      .locator('.billing-section__payment-row')
      .filter({
        hasText: paymentReference,
      })
      .last();
    await expect(payment).toBeVisible();
    paymentReceivedOn = await paymentReceivedDate(payment);
    recordedNewPayment = true;
  } else if (existingReversalIsPresent) {
    await expectPersistedReversal(history, reversalReason);
    return { paymentReference, reversalReason };
  }

  const reversalForm = payment.locator('form[action="?/reversePayment"]');
  if ((await reversalForm.count()) > 0) {
    const maximumMinor = decimalToMinor(
      (await reversalForm.locator('input[name="amount"]').getAttribute('max')) ?? '0',
    );
    expect(
      maximumMinor,
      'the payment must retain a positive reversible balance',
    ).toBeGreaterThanOrEqual(2n);
    const reversalMinor = maximumMinor / 2n;
    await stepUpFinance(page);
    await reversalForm.locator('input[name="amount"]').fill(minorToDecimal(reversalMinor));
    await reversalForm.locator('input[name="effectiveOn"]').fill(paymentReceivedOn);
    await reversalForm.locator('input[name="reason"]').fill(reversalReason);
    const reversalResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/reversePayment'),
    );
    await reversalForm.getByRole('button', { name: 'Reverse payment', exact: true }).click();
    const reversalResponse = await reversalResponsePromise;
    expect(reversalResponse.status(), 'reverse payment action must persist successfully').toBe(200);
    expectActionSuccessResponse(
      await reversalResponse.text(),
      'reverse payment',
      'action.billing.paymentReversed',
    );
    await expect(
      page.getByRole('status').filter({ hasText: 'Payment reversal recorded.' }),
    ).toBeVisible();
    const refreshedTableRow = page.locator(`tr[data-invoice-row="${invoiceRowId}"]`);
    await expect(refreshedTableRow).toBeVisible();
    await refreshedTableRow.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.locator('[data-ui="responsive-sheet"]')).toBeVisible();
    const refreshedInvoiceRow = page.locator(`[data-invoice-row="${invoiceRowId}"]`);
    history = await openInvoicePaymentHistory(refreshedInvoiceRow);
    await expectPersistedReversal(history, reversalReason);
  }
  expect(recordedNewPayment || existingPaymentIsActive).toBe(true);
  return { paymentReference, reversalReason };
}

test('Finance mobile ledger cards retain reconciliation detail', async ({ page }, testInfo) => {
  test.skip(
    !new Set(['phone-360', 'phone-390']).has(testInfo.project.name),
    'The finance ledger card contract is represented at the required 360/390px phone viewports.',
  );

  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) =>
    runtimeErrors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );

  await signIn(page, 'finance');
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const ledgerState = await ensurePartialPaymentAndReversal(page, viewportWidth);
  await page.goto(portal('/ledger'), { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Collections / Ledger', exact: true }),
  ).toHaveCount(1);
  const section = page.locator('[data-ui="collections-ledger-section"]');
  await expect(section).toBeVisible();
  await expect(
    section.getByRole('heading', { level: 2, name: 'Invoice / cost ledger', exact: true }),
  ).toBeVisible();

  const tableRegion = section.locator(
    '[data-ui="table-region"][data-mobile-representation="cards"]',
  );
  await expect(tableRegion).toBeVisible();
  const cards = tableRegion.locator('[data-table-region-cards] > article[data-row]');
  await expect(cards.first()).toBeVisible();

  const requiredLabels = [
    'Invoice',
    'Client',
    'Project',
    'Stream',
    'Actual issue',
    'Due on',
    'Invoiced',
    'Gross',
    'Reversals',
    'Net collected',
    'Outstanding',
    'Direct cost',
    'Contribution',
    'Sources',
    'Status',
    'Timeline',
  ];
  const cardDetails = await cards.evaluateAll(
    (elements, labels) =>
      elements.map((element) => ({
        labels: [...element.querySelectorAll<HTMLElement>('[data-label]')].map(
          (field) => field.getAttribute('data-label')?.trim() ?? '',
        ),
        values: labels.map(
          (label) =>
            element
              .querySelector<HTMLElement>(`[data-label="${label}"] .ui-table-region-card-value`)
              ?.textContent?.trim() ?? '',
        ),
        right: element.getBoundingClientRect().right,
      })),
    requiredLabels,
  );
  expect(cardDetails.length).toBeGreaterThan(0);
  for (const card of cardDetails) {
    for (const label of requiredLabels) expect(card.labels).toContain(label);
    expect(card.values.every((value) => value.length > 0)).toBe(true);
    expect(card.values.at(-1)).toMatch(/Payment|Reversal|No payment or reversal events recorded/u);
    expect(card.values.at(-1)).toContain(ledgerState.paymentReference);
    expect(card.values.at(-1)).toContain(ledgerState.reversalReason);
  }

  for (const label of requiredLabels) {
    const field = cards.first().locator(`[data-label="${label}"]`);
    await expect(field).toHaveCount(1);
    await expect(field).toBeVisible();
    await expect(field.locator('[data-card-semantic-label]')).toHaveText(label);
    await expect(field.locator('.ui-table-region-card-value')).not.toHaveText('');
  }

  const search = section.getByLabel('Search ledger', { exact: true });
  const status = section.getByRole('combobox', { name: 'Collection status', exact: true });
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(status).toBeFocused();

  const clearFilters = section.getByRole('button', { name: 'Clear filters', exact: true });
  await expect(clearFilters).toBeVisible();
  const touchTarget = await clearFilters.boundingBox();
  expect(touchTarget).not.toBeNull();
  expect(touchTarget?.width).toBeGreaterThanOrEqual(44);
  expect(touchTarget?.height).toBeGreaterThanOrEqual(44);

  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(cardDetails.every((card) => card.right <= dimensions.viewportWidth + 1)).toBe(true);
  expect(runtimeErrors).toEqual([]);
});
