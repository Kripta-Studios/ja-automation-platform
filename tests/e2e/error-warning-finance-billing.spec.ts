import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type Diagnostics = ReturnType<typeof diagnosticsFor>;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-finance-billing');
const qaPortal = (path = '') => `http://127.0.0.1:4184/j-aautomation/app${path}`;

async function qaSignIn(page: Page, role: keyof typeof e2eCredentials) {
  await page.goto(qaPortal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (url) =>
      url.origin === 'http://127.0.0.1:4184' &&
      url.pathname.startsWith('/j-aautomation/app') &&
      !url.pathname.endsWith('/login'),
  );
  await page.waitForLoadState('networkidle');
}

function diagnosticsFor(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { pageErrors, consoleErrors, responses };
}

async function saveEvidence(
  page: Page,
  name: string,
  trace: Array<Record<string, string | number | boolean>>,
  diagnostics: Diagnostics,
  target: string,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  // The sticky chrome overlaps the notice's first lines when Playwright scrolls
  // it into view. Remove only the chrome from this finished test page so the
  // evidence captures the notice without account identity or an obscured title.
  if (target === '[data-approval-problem]' || target.startsWith('[data-closeout-problem]'))
    await page
      .getByRole('banner')
      .first()
      .evaluate((element) => element.remove());
  const screenshot = await page.locator(target).screenshot({
    mask: [page.locator('input[name="reason"], input[name="reference"]')],
  });
  writeFileSync(join(evidenceDirectory, `${name}.png`), screenshot);
  writeFileSync(
    join(evidenceDirectory, `${name}-trace.json`),
    `${JSON.stringify(trace, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-network.json`),
    `${JSON.stringify([...new Set(diagnostics.responses.map((r) => `${r.status} ${r.path}`))].sort(), null, 2)}\n`,
  );
  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
}

function seedSubmittedTime(viewport: string, role: 'owner' | 'manager') {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const findUser = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(findUser(e2eCredentials.owner.email));
    const workerId = findUser(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Finance billing warning ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-FIN-BILL-WARN', role === 'owner' ? 71 : 72, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-09-01',
      projectManagerId: findUser(e2eCredentials.manager.email),
    }).id;
    const status = (
      db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable approval QA project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: '2026-09-01' });
    const worker = repository.principalFor(workerId);
    const ids = ['success', 'stale', 'permission'].map((kind, index) => {
      const entry = repository.createTimeEntry(worker, {
        projectId,
        workDate: `2026-09-${String(19 + index).padStart(2, '0')}`,
        category: 'regular',
        minutes: 60,
        summary: `Disposable ${kind} approval QA`,
      });
      repository.submitTime(worker, entry.id, entry.version);
      return entry.id;
    });
    return { databasePath, projectId, successId: ids[0]!, staleId: ids[1]!, permissionId: ids[2]! };
  } finally {
    db.sqlite.close();
  }
}

function approveOutsideBrowser(databasePath: string, id: string) {
  const db = createDatabase(databasePath);
  try {
    const ownerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    new PortalRepository(db.sqlite).operationalApproveTime(
      new PortalRepository(db.sqlite).principalFor(ownerId),
      id,
      'approved',
    );
  } finally {
    db.sqlite.close();
  }
}

function timeState(databasePath: string, id: string) {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(id) as {
        approval_state: string;
      }
    ).approval_state;
  } finally {
    db.sqlite.close();
  }
}

async function submitApproval(page: Page, form: ReturnType<Page['locator']>) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/approveRecord'),
  );
  await form
    .getByRole('button', { name: /Needs changes|Necesita cambios|Precisa de alterações/i })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = (await response.json()) as { type: string; status: number; data: unknown };
  expect(result.type).toBe('failure');
  return result;
}

async function openInvoice(page: Page, invoiceId: string): Promise<void> {
  const card = page.locator(`[data-table-region-cards] article[data-row="${invoiceId}"]`);
  if (await card.isVisible()) {
    await card.locator('a[data-card-action]').click();
    return;
  }
  const row = page.locator(`tr[data-invoice-row="${invoiceId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Manage|Gerenciar/i }).click();
}

for (const role of ['owner', 'manager'] as const) {
  test(`${role} approval recovery, stale review, and role boundary`, async ({ page }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(120_000);
    const locale = info.project.name === 'desktop' ? 'es' : 'en';
    const fixture = seedSubmittedTime(info.project.name, role);
    const diagnostics = diagnosticsFor(page);
    const trace: Array<Record<string, string | number | boolean>> = [];
    await qaSignIn(page, role);
    await page.goto(qaPortal(`/approvals?tab=time&project=${fixture.projectId}&lang=${locale}`));
    const tab = page.getByRole('tab', { name: /Time|Horas|Tempo/i });
    await expect(tab).toHaveAttribute('aria-selected', 'true');

    // The normal decision is allowed and records a visible confirmation.
    const success = page.locator(`[data-approval-row="${fixture.successId}"]`);
    await expect(success).toBeVisible();
    await success.locator('form[action="?/approveRecord"]').first().getByRole('button').click();
    await expect.poll(() => timeState(fixture.databasePath, fixture.successId)).toBe('approved');
    await expect(success).toHaveCount(0);
    trace.push({ step: 'approval-success', state: 'approved' });

    const stale = page.locator(`[data-approval-row="${fixture.staleId}"]`);
    await expect(stale).toBeVisible();
    await stale.locator('details.approval-action-menu summary').click();
    const form = stale.locator('form[action="?/approveRecord"]').nth(1);
    const reason = form.locator('input[name="reason"]');
    await form.getByRole('button').click();
    await expect(reason).toHaveAttribute('required', '');
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.activeElement instanceof HTMLInputElement
            ? document.activeElement.name
            : document.activeElement?.tagName.toLowerCase(),
        ),
      )
      .toBe('reason');
    trace.push({ step: 'invalid-reason', fieldFocused: true });
    await reason.fill('Review current source before approval');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    approveOutsideBrowser(fixture.databasePath, fixture.staleId);
    const result = await submitApproval(page, form);
    expect(JSON.stringify(result.data)).toContain('APPROVAL_RECORD_NOT_SUBMITTED');
    const notice = page.locator('[data-approval-problem]');
    await expect(notice).toBeFocused();
    await expect(notice).toContainText(
      locale === 'es' ? 'Este registro ya no está enviado' : 'This record is no longer submitted',
    );
    await expect(
      notice.getByRole('link', { name: /Review updated record|Revisar/i }),
    ).toBeVisible();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=time/);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore),
    ).toBeLessThanOrEqual(150);
    trace.push({
      step: 'stale-approval',
      code: 'APPROVAL_RECORD_NOT_SUBMITTED',
      tabRetained: true,
    });

    // A worker cannot decide another worker's record through a crafted action POST.
    const browser = page.context().browser();
    if (!browser) throw new Error('Browser context required for independent worker sign-in');
    const workerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    try {
      const workerPage = await workerContext.newPage();
      await qaSignIn(workerPage, 'worker');
      const permission = await workerPage.evaluate(
        async ({ url, id }) => {
          const response = await fetch(url, {
            method: 'POST',
            headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
            body: new URLSearchParams({ type: 'time', id, decision: 'approved' }),
          });
          return { status: response.status, body: await response.text() };
        },
        { url: qaPortal('/approvals?/approveRecord'), id: fixture.permissionId },
      );
      expect(permission.status).toBe(200);
      expect(permission.body).toContain('APPROVAL_REVIEW_PERMISSION_REQUIRED');
      expect(timeState(fixture.databasePath, fixture.permissionId)).toBe('submitted');
    } finally {
      await workerContext.close();
    }
    trace.push({ step: 'worker-permission', unchanged: true });

    await saveEvidence(
      page,
      `approval-${role}-${info.project.name}-${locale}`,
      trace,
      diagnostics,
      '[data-approval-problem]',
    );
  });
}

function issuedInvoice() {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const invoice = db.sqlite
      .prepare(
        `SELECT id,invoice_number,total_minor,state FROM invoice
         WHERE state IN ('issued','sent','partially_paid')
           AND invoice_number IS NOT NULL AND total_minor>10000
           AND tenant_id IS NOT NULL AND deployment_id IS NOT NULL
           AND legal_entity_revision_id IS NOT NULL
         ORDER BY issued_at DESC,id LIMIT 1`,
      )
      .get() as
      | { id: string; invoice_number: string; total_minor: number; state: string }
      | undefined;
    if (!invoice) throw new Error('Disposable database lacks an issued payment QA invoice');
    return { databasePath, ...invoice };
  } finally {
    db.sqlite.close();
  }
}

function paymentCount(databasePath: string, invoiceId: string): number {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite.prepare('SELECT COUNT(*) count FROM payment WHERE invoice_id=?').get(invoiceId) as {
        count: number;
      }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

function setInvoiceState(databasePath: string, invoiceId: string, state: string) {
  const db = createDatabase(databasePath);
  try {
    db.sqlite
      .prepare('UPDATE invoice SET state=?,version=version+1 WHERE id=?')
      .run(state, invoiceId);
  } finally {
    db.sqlite.close();
  }
}

for (const role of ['finance', 'owner'] as const) {
  test(`${role} invoice payment recovery and stale state`, async ({ page }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(120_000);
    const locale = info.project.name === 'desktop' ? 'pt' : 'en';
    const invoice = issuedInvoice();
    const diagnostics = diagnosticsFor(page);
    const trace: Array<Record<string, string | number | boolean>> = [];
    await qaSignIn(page, role);
    await page.goto(qaPortal(`/billing?view=invoices&stage=outstanding&lang=${locale}`));
    await page
      .getByRole('form', { name: /Filter billing|Filtrar faturamento/i })
      .locator('input[type="search"]')
      .fill(invoice.invoice_number);
    await openInvoice(page, invoice.id);
    const panel = page.locator('[data-ui="responsive-sheet"]');
    await expect(panel).toBeVisible();
    await panel
      .locator('details.billing-section__action-panel')
      .filter({
        has: page.locator('form[action="?/recordPayment"]'),
      })
      .locator('summary')
      .click();
    let form = panel.locator('form[action="?/recordPayment"]');
    await form.locator('input[name="reference"]').fill(`QA payment ${randomUUID()}`);
    await form.getByRole('button').click();
    await expect(form.locator('input[name="amount"]')).toBeFocused();
    trace.push({ step: 'invalid-amount', fieldFocused: true });

    const beforePaymentCount = paymentCount(invoice.databasePath, invoice.id);
    await form.locator('input[name="amount"]').fill('1.00');
    await form.locator('input[name="idempotencyKey"]').evaluate((input: HTMLInputElement) => {
      input.value = `qa-payment-${crypto.randomUUID()}`;
    });
    const successResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('?/recordPayment'),
    );
    const successScrollBefore = await page.evaluate(() => window.scrollY);
    await form.getByRole('button').click();
    expect((await successResponse).status()).toBe(200);
    await expect
      .poll(() => paymentCount(invoice.databasePath, invoice.id))
      .toBe(beforePaymentCount + 1);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - successScrollBefore),
    ).toBeLessThanOrEqual(150);
    trace.push({ step: 'payment-success', paymentAdded: true, scrollRetained: true });

    await page.goto(qaPortal(`/billing?view=invoices&stage=outstanding&lang=${locale}`));
    await page
      .getByRole('form', { name: /Filter billing|Filtrar faturamento/i })
      .locator('input[type="search"]')
      .fill(invoice.invoice_number);
    await openInvoice(page, invoice.id);
    await panel
      .locator('details.billing-section__action-panel')
      .filter({
        has: page.locator('form[action="?/recordPayment"]'),
      })
      .locator('summary')
      .click();
    form = panel.locator('form[action="?/recordPayment"]');
    await form.locator('input[name="amount"]').fill('2.00');
    await form.locator('input[name="reference"]').fill('QA stale payment reference');
    await form.locator('input[name="idempotencyKey"]').evaluate((input: HTMLInputElement) => {
      input.value = `qa-stale-payment-${crypto.randomUUID()}`;
    });
    const existingCount = paymentCount(invoice.databasePath, invoice.id);
    setInvoiceState(invoice.databasePath, invoice.id, 'void');
    try {
      const conflictResponse = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/recordPayment'),
      );
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        form.evaluate((element: HTMLFormElement) => element.submit()),
      ]);
      expect((await conflictResponse).status()).toBeGreaterThanOrEqual(400);
      await page.waitForLoadState('networkidle');
      const notice = page.locator('[data-ui="billing-section"] [data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute('data-problem-code', 'BILLING_PAYMENT_BLOCKED');
      await expect(notice).toBeFocused();
      await expect(notice).toContainText(
        locale === 'pt' ? 'O pagamento não pode ser registrado' : 'The payment cannot be recorded',
      );
      await expect(notice).not.toContainText(/problem\.|\{\w+\}/);
      await expect(
        notice.getByRole('link', { name: /Review invoice ledger|Revisar/i }),
      ).toBeVisible();
      await expect(
        page.locator('form[action="?/recordPayment"] input[name="reference"]'),
      ).toHaveValue('QA stale payment reference');
      await expect(page.locator('form[action="?/recordPayment"] input[name="amount"]')).toHaveValue(
        '2.00',
      );
      await expect(
        page.locator('form[action="?/recordPayment"] button[type="submit"]'),
      ).toBeDisabled();
      expect(paymentCount(invoice.databasePath, invoice.id)).toBe(existingCount);
      trace.push({ step: 'stale-payment', code: 'BILLING_PAYMENT_BLOCKED', unchanged: true });
    } finally {
      setInvoiceState(invoice.databasePath, invoice.id, 'partially_paid');
    }
    await saveEvidence(
      page,
      `payment-${role}-${info.project.name}-${locale}`,
      trace,
      diagnostics,
      '[data-ui="billing-section"] [data-ui="problem-notice"]',
    );
  });
}

test('reused payment key blocks a different amount and preserves the draft', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const invoice = issuedInvoice();
  const diagnostics = diagnosticsFor(page);
  const trace: Array<Record<string, string | number | boolean>> = [];
  const reusedKey = `qa-payment-reuse-${randomUUID()}`;
  await qaSignIn(page, 'finance');
  await page.goto(qaPortal('/billing?view=invoices&stage=outstanding'));
  await page
    .getByRole('form', { name: /Filter billing/i })
    .locator('input[type="search"]')
    .fill(invoice.invoice_number);
  await openInvoice(page, invoice.id);
  await page
    .locator('[data-ui="responsive-sheet"] details.billing-section__action-panel')
    .filter({ has: page.locator('form[action="?/recordPayment"]') })
    .locator('summary')
    .click();
  let form = page.locator('[data-ui="responsive-sheet"] form[action="?/recordPayment"]');
  await form.locator('input[name="amount"]').fill('1.00');
  await form.locator('input[name="reference"]').fill('QA original payment');
  await form.locator('input[name="idempotencyKey"]').evaluate((input: HTMLInputElement, key) => {
    input.value = key;
  }, reusedKey);
  const before = paymentCount(invoice.databasePath, invoice.id);
  const firstResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordPayment'),
  );
  await form.getByRole('button', { name: 'Record payment' }).click();
  expect((await firstResponse).status()).toBe(200);
  await expect.poll(() => paymentCount(invoice.databasePath, invoice.id)).toBe(before + 1);
  trace.push({ step: 'first-payment', added: true });

  await page.goto(qaPortal('/billing?view=invoices&stage=outstanding'));
  await page
    .getByRole('form', { name: /Filter billing/i })
    .locator('input[type="search"]')
    .fill(invoice.invoice_number);
  await openInvoice(page, invoice.id);
  await page
    .locator('[data-ui="responsive-sheet"] details.billing-section__action-panel')
    .filter({ has: page.locator('form[action="?/recordPayment"]') })
    .locator('summary')
    .click();
  form = page.locator('[data-ui="responsive-sheet"] form[action="?/recordPayment"]');
  await form.locator('input[name="amount"]').fill('2.00');
  await form.locator('input[name="reference"]').fill('QA changed payment');
  await form.locator('input[name="idempotencyKey"]').evaluate((input: HTMLInputElement, key) => {
    input.value = key;
  }, reusedKey);
  const conflictResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordPayment'),
  );
  await form.getByRole('button', { name: 'Record payment' }).click();
  const result = await conflictResponse;
  expect(result.status()).toBe(200);
  await expect(result.json()).resolves.toMatchObject({ type: 'failure', status: 409 });
  const notice = page.locator('[data-billing-payment-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'BILLING_IDEMPOTENCY_REUSED');
  await expect(notice).toBeFocused();
  await expect(form.locator('input[name="amount"]')).toHaveValue('2.00');
  await expect(form.locator('input[name="reference"]')).toHaveValue('QA changed payment');
  await expect(form.getByRole('button', { name: 'Record payment' })).toBeDisabled();
  expect(paymentCount(invoice.databasePath, invoice.id)).toBe(before + 1);
  trace.push({ step: 'reused-key-conflict', code: 'BILLING_IDEMPOTENCY_REUSED', unchanged: true });
  await saveEvidence(
    page,
    `payment-key-reuse-${info.project.name}`,
    trace,
    diagnostics,
    '[data-billing-payment-problem] [data-ui="problem-notice"]',
  );
});

test('Finance example explains invalid numbers and payer conflict in ES/PT', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'phone-390' ? 'es' : 'pt';
  const diagnostics = diagnosticsFor(page);
  const trace: Array<Record<string, string | number | boolean>> = [];
  await qaSignIn(page, 'finance');
  await page.goto(qaPortal(`/finance/preview?lang=${locale}`));
  let form = page.locator('form[data-commercial-example]');
  await form.locator('[name="workHours"]').fill('25');
  const invalidResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/finance/preview'),
  );
  await form.locator('button[type="submit"]').click();
  const invalidResult = await invalidResponse;
  expect(invalidResult.status()).toBe(200);
  await expect(invalidResult.json()).resolves.toMatchObject({ type: 'failure', status: 400 });
  let notice = page.locator('[data-finance-preview-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'FINANCE_PREVIEW_INVALID_FIELDS');
  await expect(form.locator('[name="workHours"]')).toHaveValue('25');
  await expect(form.locator('[name="workHours"]')).toHaveAttribute('aria-invalid', 'true');
  trace.push({ step: 'invalid-work-hours', code: 'FINANCE_PREVIEW_INVALID_FIELDS' });

  form = page.locator('form[data-commercial-example]');
  await form.locator('[name="workHours"]').fill('8');
  await form.locator('[name="expenseTreatment"]').selectOption('customer_direct');
  await form.locator('[name="workerAdvancedExpense"]').selectOption('yes');
  await form.evaluate((element) => {
    element.addEventListener(
      'submit',
      () => {
        (window as Window & { __qaPreviewSubmitScroll?: number }).__qaPreviewSubmitScroll =
          window.scrollY;
      },
      { once: true },
    );
  });
  const conflictResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/finance/preview'),
  );
  await form.locator('button[type="submit"]').click();
  const conflictResult = await conflictResponse;
  expect(conflictResult.status()).toBe(200);
  await expect(conflictResult.json()).resolves.toMatchObject({ type: 'failure', status: 400 });
  const scrollAfterResponse = await page.evaluate(() => window.scrollY);
  notice = page.locator('[data-finance-preview-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'FINANCE_PREVIEW_PAYER_CONFLICT');
  await expect(notice).toContainText(
    locale === 'es'
      ? 'Un gasto pagado directamente por el cliente'
      : 'Uma despesa paga diretamente pelo cliente',
  );
  await expect(notice).not.toContainText(/problem\.|\{\w+\}/);
  await expect(form.locator('[name="expenseTreatment"]')).toHaveValue('customer_direct');
  await expect(form.locator('[name="workerAdvancedExpense"]')).toHaveValue('yes');
  await expect(form.locator('[name="sellRate"]')).toHaveValue('120');
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  await page.waitForTimeout(250);
  const scrollAtSubmit = await page.evaluate(
    () => (window as Window & { __qaPreviewSubmitScroll?: number }).__qaPreviewSubmitScroll,
  );
  expect(scrollAtSubmit).toBeDefined();
  const scrollGeometry = await page.evaluate(() => ({
    afterFocus: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  trace.push({
    step: 'payer-conflict-scroll',
    atSubmit: scrollAtSubmit!,
    afterResponse: scrollAfterResponse,
    afterFocus: scrollGeometry.afterFocus,
    scrollHeight: scrollGeometry.scrollHeight,
    viewportHeight: scrollGeometry.viewportHeight,
  });
  expect(
    Math.abs(scrollGeometry.afterFocus - scrollAtSubmit!),
    `preview scroll: submit=${scrollAtSubmit}, response=${scrollAfterResponse}, focus+250ms=${scrollGeometry.afterFocus}, scrollHeight=${scrollGeometry.scrollHeight}, viewportHeight=${scrollGeometry.viewportHeight}`,
  ).toBeLessThanOrEqual(150);
  trace.push({ step: 'payer-conflict', code: 'FINANCE_PREVIEW_PAYER_CONFLICT', retained: true });

  const browser = page.context().browser();
  if (!browser) throw new Error('Browser context required for independent worker sign-in');
  const workerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  try {
    const workerPage = await workerContext.newPage();
    await qaSignIn(workerPage, 'worker');
    const denied = await workerPage.request.get(qaPortal(`/finance/preview?lang=${locale}`));
    expect(denied.status()).toBe(403);
  } finally {
    await workerContext.close();
  }
  trace.push({ step: 'worker-role-denied', status: 403 });
  await saveEvidence(
    page,
    `finance-preview-${info.project.name}-${locale}`,
    trace,
    diagnostics,
    '[data-finance-preview-problem]',
  );
});

function seedCloseoutDocument(projectId: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const ownerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const id = randomUUID();
    const now = new Date().toISOString();
    db.sqlite
      .prepare(
        `INSERT INTO document
        (id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
         safe_filename,artifact_type,sensitivity,scan_status,artifact_classification,
         classification_provenance,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        projectId,
        ownerId,
        randomUUID().replaceAll('-', '').padEnd(64, '0'),
        'application/pdf',
        128,
        'committed',
        `qa/closeout/${id}.pdf`,
        'qa-reference.pdf',
        'technical_reference',
        'operational',
        'clean',
        'standard',
        'native',
        now,
        now,
      );
    return { databasePath, id };
  } finally {
    db.sqlite.close();
  }
}

function closeoutDocumentState(databasePath: string, id: string, state: string) {
  const db = createDatabase(databasePath);
  try {
    db.sqlite.prepare('UPDATE document SET state=?,version=version+1 WHERE id=?').run(state, id);
  } finally {
    db.sqlite.close();
  }
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`closeout exact review and recovery ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(150_000);
    const locale = viewport === 'phone-390' ? 'en' : 'pt';
    const project = e2eLifecycleFixturesFor(viewport).project;
    const document = seedCloseoutDocument(project.id);
    const diagnostics = diagnosticsFor(page);
    const trace: Array<Record<string, string | number | boolean>> = [];
    const path = `/projects/${project.id}/closeout?lang=${locale}`;
    await qaSignIn(page, 'owner');
    await page.goto(qaPortal(path));
    let prepare = page.locator('form[data-closeout-action="prepare"]');
    await prepare.locator(`input[name="documentId"][value="${document.id}"]`).check();
    closeoutDocumentState(document.databasePath, document.id, 'quarantined');
    try {
      const unavailableResponse = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/prepare'),
      );
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        prepare.evaluate((element: HTMLFormElement) => element.submit()),
      ]);
      expect((await unavailableResponse).status()).toBe(409);
      await expect(
        page.locator('[data-closeout-problem] [data-ui="problem-notice"]'),
      ).toHaveAttribute('data-problem-code', 'CLOSEOUT_DOCUMENT_UNAVAILABLE');
      await expect(
        page.locator('[data-closeout-problem] [data-ui="problem-notice"]'),
      ).toBeFocused();
      await expect(
        page.locator('form[data-closeout-action="prepare"] input[type="checkbox"][disabled]'),
      ).toBeChecked();
      await expect(page.locator('form[data-closeout-action="prepare"]')).toContainText(document.id);
      trace.push({ step: 'document-became-unavailable', retained: true });
    } finally {
      closeoutDocumentState(document.databasePath, document.id, 'committed');
    }

    await page.goto(qaPortal(path));
    prepare = page.locator('form[data-closeout-action="prepare"]');
    await prepare.getByRole('button').click();
    await expect(page.locator('form[data-closeout-action="confirmClient"]')).toBeVisible();
    trace.push({ step: 'draft-prepared', visible: true });

    const browser = page.context().browser();
    if (!browser) throw new Error('Browser context required for finance and worker roles');
    const financeContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const workerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    try {
      const financePage = await financeContext.newPage();
      const financeDiagnostics = diagnosticsFor(financePage);
      await qaSignIn(financePage, 'finance');
      await financePage.goto(qaPortal(path));
      const financeRefresh = financePage.locator('form[data-closeout-action="refresh"]');
      const initialHash = await financePage
        .locator('form[data-closeout-action="confirmClient"] input[name="clientSnapshotHash"]')
        .inputValue();
      const ownerRefreshResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/refresh'),
      );
      await page.locator('form[data-closeout-action="refresh"] button').click();
      await expect((await ownerRefreshResponse).json()).resolves.toMatchObject({ type: 'success' });
      await expect
        .poll(() =>
          page
            .locator('form[data-closeout-action="confirmClient"] input[name="clientSnapshotHash"]')
            .inputValue(),
        )
        .not.toBe(initialHash);
      const staleRefreshResponse = financePage.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/refresh'),
      );
      await financeRefresh.getByRole('button').click();
      expect((await staleRefreshResponse).status()).toBe(200);
      await expect(
        financePage.locator('[data-closeout-problem] [data-ui="problem-notice"]'),
      ).toHaveAttribute('data-problem-code', 'CLOSEOUT_DRAFT_CHANGED');
      trace.push({ step: 'stale-refresh', code: 'CLOSEOUT_DRAFT_CHANGED' });

      await financePage.goto(qaPortal(path));
      let confirm = financePage.locator('form[data-closeout-action="confirmClient"]');
      await confirm
        .locator('input[name="confirmationChecked"]')
        .evaluate((element: HTMLInputElement) => element.removeAttribute('required'));
      const invalidResponse = financePage.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/confirmClient'),
      );
      await confirm.getByRole('button').click();
      expect((await invalidResponse).status()).toBe(200);
      await expect(
        financePage.locator('[data-closeout-problem] [data-ui="problem-notice"]'),
      ).toHaveAttribute('data-problem-code', 'CLOSEOUT_CONFIRMATION_CHECK_REQUIRED');
      await expect(confirm.locator('input[name="confirmationChecked"]')).not.toBeChecked();
      trace.push({ step: 'confirmation-required', code: 'CLOSEOUT_CONFIRMATION_CHECK_REQUIRED' });

      confirm = financePage.locator('form[data-closeout-action="confirmClient"]');
      const staleHash = await confirm.locator('input[name="clientSnapshotHash"]').inputValue();
      await confirm.locator('input[name="confirmationChecked"]').check();
      const ownerSecondRefreshResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/refresh'),
      );
      await page.locator('form[data-closeout-action="refresh"] button').click();
      await expect((await ownerSecondRefreshResponse).json()).resolves.toMatchObject({
        type: 'success',
      });
      await expect
        .poll(() =>
          page
            .locator('form[data-closeout-action="confirmClient"] input[name="clientSnapshotHash"]')
            .inputValue(),
        )
        .not.toBe(staleHash);
      const staleConfirmResponse = financePage.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/confirmClient'),
      );
      await confirm.getByRole('button').click();
      expect((await staleConfirmResponse).status()).toBe(200);
      await expect(
        financePage.locator('[data-closeout-problem] [data-ui="problem-notice"]'),
      ).toHaveAttribute('data-problem-code', 'CLOSEOUT_CLIENT_CONFIRMATION_STALE');
      await expect(
        financePage.locator(
          'form[data-closeout-action="confirmClient"] input[name="confirmationChecked"]',
        ),
      ).not.toBeChecked();
      trace.push({ step: 'stale-client-confirmation', requiresFreshCheck: true });

      const workerPage = await workerContext.newPage();
      await qaSignIn(workerPage, 'worker');
      const denied = await workerPage.request.get(qaPortal(path));
      expect(denied.status()).toBe(403);
      const deniedAction = await workerPage.evaluate(
        async (url) => {
          const response = await fetch(url, {
            method: 'POST',
            headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
            body: new URLSearchParams(),
          });
          return { status: response.status, body: await response.text() };
        },
        qaPortal(`/projects/${project.id}/closeout?/prepare`),
      );
      expect(deniedAction.body).toContain('CLOSEOUT_FINANCE_ROLE_REQUIRED');
      expect(deniedAction.body).toContain('contact_owner');
      trace.push({ step: 'worker-denied', status: denied.status() });
      expect(financeDiagnostics.pageErrors).toEqual([]);
      expect(
        financeDiagnostics.consoleErrors.filter(
          (message) => !message.startsWith('Failed to load resource:'),
        ),
      ).toEqual([]);
    } finally {
      await financeContext.close();
      await workerContext.close();
    }

    await page.goto(qaPortal(path));
    await page
      .locator('form[data-closeout-action="confirmClient"] input[name="confirmationChecked"]')
      .check();
    await page.locator('form[data-closeout-action="confirmClient"] button').click();
    await expect(page.locator('form[data-closeout-action="finalize"]')).toBeVisible();
    await page.locator('form[data-closeout-action="finalize"] button').click();
    let reopen = page.locator('form[data-closeout-action="reopen"]');
    await expect(reopen).toBeVisible();
    await reopen.locator('input[name="reason"]').fill(' ');
    const reasonResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('?/reopen'),
    );
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      reopen.evaluate((element: HTMLFormElement) => element.submit()),
    ]);
    expect((await reasonResponse).status()).toBe(400);
    await expect(
      page.locator('[data-closeout-problem] [data-ui="problem-notice"]'),
    ).toHaveAttribute('data-problem-code', 'CLOSEOUT_REOPEN_REASON_REQUIRED');
    reopen = page.locator('form[data-closeout-action="reopen"]');
    await expect(reopen.locator('input[name="reason"]')).toHaveValue(' ');
    await expect(reopen.locator('[data-validation-summary]')).toBeFocused();
    trace.push({ step: 'reopen-reason-invalid', retained: true });
    await saveEvidence(
      page,
      `closeout-${viewport}-${locale}`,
      trace,
      diagnostics,
      '[data-closeout-problem] [data-ui="problem-notice"]',
    );
  });
}
