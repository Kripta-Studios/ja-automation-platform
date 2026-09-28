import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const evidenceDir = join(e2eRoot, 'docs/evidence/error-warning-candidate/owner-billing-management');

function database() {
  return new DatabaseSync(readE2EFixturePointer().databasePath);
}

function invoiceFixture() {
  const db = database();
  try {
    const draft = db
      .prepare(
        "SELECT id,version FROM invoice WHERE state='draft' AND length(id)=36 ORDER BY created_at LIMIT 1",
      )
      .get() as { id: string; version: number } | undefined;
    const issued = db
      .prepare(
        "SELECT id,version,pdf_status,pdf_storage_key,pdf_sha256,pdf_byte_length FROM invoice WHERE state='issued' AND length(id)=36 ORDER BY created_at LIMIT 1",
      )
      .get() as
      | {
          id: string;
          version: number;
          pdf_status: string | null;
          pdf_storage_key: string | null;
          pdf_sha256: string | null;
          pdf_byte_length: number | null;
        }
      | undefined;
    expect(draft).toBeDefined();
    expect(issued).toBeDefined();
    return { draft: draft!, issued: issued! };
  } finally {
    db.close();
  }
}

function isolatedIssuedInvoice(viewport: string) {
  const db = database();
  try {
    const source = db
      .prepare(
        "SELECT id FROM invoice WHERE state='issued' AND length(id)=36 ORDER BY created_at LIMIT 1",
      )
      .get() as { id: string } | undefined;
    expect(source).toBeDefined();
    const id = randomUUID();
    const number = `QA-WARN-${viewport}-${id.slice(0, 8)}`;
    const columns = (db.prepare('PRAGMA table_info(invoice)').all() as { name: string }[]).map(
      ({ name }) => name,
    );
    const overrides: Record<string, unknown> = {
      id,
      invoice_number: number,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      pdf_status: 'pending',
      pdf_storage_key: null,
      pdf_sha256: null,
      pdf_generated_at: null,
      pdf_byte_length: null,
      predecessor_subject_hash: null,
      invoice_subject_hash: null,
    };
    const quote = (column: string) => `"${column.replaceAll('"', '""')}"`;
    const selections = columns.map((column) =>
      Object.hasOwn(overrides, column) ? `? AS ${quote(column)}` : quote(column),
    );
    db.prepare(
      `INSERT INTO invoice (${columns.map(quote).join(',')}) SELECT ${selections.join(',')} FROM invoice WHERE id=?`,
    ).run(
      ...columns
        .filter((column) => Object.hasOwn(overrides, column))
        .map((column) => overrides[column]),
      source!.id,
    );
    return { id, number, pdf_status: 'pending' };
  } finally {
    db.close();
  }
}

async function openInvoice(page: Page, id: string, viewport: string) {
  if (viewport === 'phone-390') {
    await page.locator(`[data-billing-invoice-list] a[href="#invoice-${id}"]`).click();
  } else {
    const row = page.locator(`tr[data-invoice-row="${id}"]`);
    await expect(row).toBeVisible();
    await row.locator('td:last-child button').click();
  }
  await expect(page.locator('[data-ui="responsive-sheet"]')).toBeVisible();
}

function diagnostics(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function expectNativeFailure(
  page: Page,
  action: string,
  submit: () => Promise<void>,
  code: string,
) {
  const pending = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes(`?/${action}`),
  );
  await submit();
  const response = await pending;
  expect(response.status()).toBe(code.endsWith('_INVALID') ? 400 : 409);
  expect(await response.text()).toContain(code);
  return response;
}

async function saveNotice(notice: Locator, name: string, viewport: string, response: Response) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, `${name}-${viewport}.png`), await notice.screenshot());
  writeFileSync(
    join(evidenceDir, `${name}-${viewport}.json`),
    `${JSON.stringify(
      {
        code: name.replace(/_STORAGE_BLOCKED$/, ''),
        ...(name.endsWith('_STORAGE_BLOCKED') ? { scenario: 'sessionStorage denied' } : {}),
        viewport,
        responseStatus: response.status(),
        route: new URL(response.url()).pathname,
        method: response.request().method(),
        screenshot: `${name}-${viewport}.png`,
        scope: 'isolated problem notice only; no account or invoice details',
      },
      null,
      2,
    )}\n`,
  );
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Owner deletion blockers retain the invoice decision at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    const fixture = invoiceFixture();
    const observed = diagnostics(page);
    await signIn(page, 'owner');
    await page.goto(portal('/billing?view=invoices&lang=en'));
    await openInvoice(page, fixture.draft.id, viewport);
    const sheet = page.locator('[data-ui="responsive-sheet"]');
    const form = sheet.locator('form[action="?/deleteInvoice"]');
    await expect(form).toBeVisible();
    const reason = 'Review changed invoice before discarding';
    await form.locator('[name="reason"]').fill(reason);
    await form.locator('[name="version"]').evaluate((input: HTMLInputElement, version) => {
      input.value = String(version);
    }, fixture.draft.version + 99);
    const stale = await expectNativeFailure(
      page,
      'deleteInvoice',
      () => form.getByRole('button', { name: 'Discard draft' }).click(),
      'BILLING_DELETE_RECORD_CHANGED',
    );
    const staleNotice = page.locator('[data-problem-code="BILLING_DELETE_RECORD_CHANGED"]');
    await expect(staleNotice).toBeVisible();
    await expect(staleNotice).toContainText('changed while you reviewed it');
    await expect(staleNotice.getByRole('link', { name: 'Review invoice' })).toHaveAttribute(
      'href',
      /\/billing\?view=invoices$/,
    );
    await expect(page.locator('form[action="?/deleteInvoice"] [name="reason"]')).toHaveValue(
      reason,
    );
    await expect(staleNotice).toBeFocused();
    await saveNotice(staleNotice, 'BILLING_DELETE_RECORD_CHANGED', viewport, stale);

    const retainedDelete = page.locator('form[action="?/deleteInvoice"]');
    await retainedDelete.locator('[name="reason"]').evaluate((input: HTMLInputElement) => {
      input.minLength = 0;
    });
    await retainedDelete.locator('[name="reason"]').fill('  ');
    const invalidReason = await expectNativeFailure(
      page,
      'deleteInvoice',
      () => retainedDelete.getByRole('button', { name: 'Discard draft' }).click(),
      'BILLING_DELETE_REASON_INVALID',
    );
    const reasonNotice = page.locator('[data-problem-code="BILLING_DELETE_REASON_INVALID"]');
    await expect(reasonNotice).toBeVisible();
    await expect(reasonNotice).toContainText('3 to 2,000 characters');
    await expect(page.locator('form[action="?/deleteInvoice"] [name="reason"]')).toHaveValue('  ');
    await expect(page.locator('form[action="?/deleteInvoice"] [name="reason"]')).toBeFocused();
    await saveNotice(reasonNotice, 'BILLING_DELETE_REASON_INVALID', viewport, invalidReason);

    // The issued record has no discard control. Submit an isolated invalid command
    // to prove the server refuses it and the UI presents the safe correction path.
    await page.goto(portal('/billing?view=invoices&lang=en'));
    const issued = await expectNativeFailure(
      page,
      'deleteInvoice',
      async () => {
        await page.evaluate(
          ({ id, version }) => {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '?/deleteInvoice';
            for (const [name, value] of Object.entries({
              invoiceId: id,
              version: String(version),
              reason: 'Review issued history',
            })) {
              const input = document.createElement('input');
              input.name = name;
              input.value = value;
              form.append(input);
            }
            document.body.append(form);
            form.requestSubmit();
          },
          { id: fixture.issued.id, version: fixture.issued.version },
        );
      },
      'BILLING_DELETE_INVOICE_ISSUED',
    );
    const issuedNotice = page.locator('[data-problem-code="BILLING_DELETE_INVOICE_ISSUED"]');
    await expect(issuedNotice).toBeVisible();
    await expect(issuedNotice).toContainText('cannot be discarded');
    await expect(issuedNotice.getByRole('link', { name: 'Review invoice' })).toBeVisible();
    await expect(page.locator('form[action="?/deleteInvoice"]')).toHaveCount(0);
    await saveNotice(issuedNotice, 'BILLING_DELETE_INVOICE_ISSUED', viewport, issued);

    const db = database();
    try {
      expect(db.prepare('SELECT state FROM invoice WHERE id=?').get(fixture.draft.id)).toEqual({
        state: 'draft',
      });
      expect(db.prepare('SELECT state FROM invoice WHERE id=?').get(fixture.issued.id)).toEqual({
        state: 'issued',
      });
    } finally {
      db.close();
    }
    expect(observed.pageErrors).toEqual([]);
  });

  test(`Owner email PDF blockers preserve recipient at ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== viewport);
    const observed = diagnostics(page);
    const original = isolatedIssuedInvoice(viewport);
    const recipient = 'qa-recipient@example.test';
    await signIn(page, 'owner');
    expect(original.pdf_status).not.toBe('ready');
    for (const scenario of [
      {
        code: 'BILLING_EMAIL_PDF_NOT_READY',
        message: 'requires an issued invoice with a ready PDF',
        remedy: 'Review invoice',
        readyFixture: false,
      },
      {
        code: 'BILLING_EMAIL_PDF_TOO_LARGE',
        message: 'exceeds the 20 MB email limit',
        remedy: 'Contact a finance administrator',
        readyFixture: true,
      },
    ] as const) {
      if (scenario.readyFixture) {
        const db = database();
        try {
          db.prepare(
            'UPDATE invoice SET pdf_status=?,pdf_byte_length=?,pdf_storage_key=?,pdf_sha256=?,pdf_generated_at=? WHERE id=?',
          ).run(
            'ready',
            20 * 1024 * 1024 + 1,
            `qa-missing-invoice-${original.id}.pdf`,
            createHash('sha256').update(original.id).digest('hex'),
            new Date().toISOString(),
            original.id,
          );
        } finally {
          db.close();
        }
      }
      await page.goto(portal('/billing?view=invoices&lang=en'));
      await page.getByRole('searchbox', { name: 'Search: Billing' }).fill(original.number);
      await openInvoice(page, original.id, viewport);
      const sheet = page.locator('[data-ui="responsive-sheet"]');
      const panel = sheet.locator('details').filter({
        has: page.locator('form[action="?/emailInvoice"]'),
      });
      await panel.locator('summary').click();
      const form = panel.locator('form[action="?/emailInvoice"]');
      await form.locator('[name="recipient"]').fill(recipient);
      await form.locator('[name="emailChoice"]').selectOption('yes');
      if (!scenario.readyFixture) {
        // The UI already blocks a non-ready PDF. Enable the disposable button
        // only to exercise the authoritative server response; no email is queued.
        await form
          .getByRole('button', { name: 'Send by email' })
          .evaluate((button: HTMLButtonElement) => {
            button.disabled = false;
          });
      }
      const response = await expectNativeFailure(
        page,
        'emailInvoice',
        () => form.getByRole('button', { name: 'Send by email' }).click(),
        scenario.code,
      );
      const notice = page.locator(`[data-problem-code="${scenario.code}"]`);
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(scenario.message);
      await expect(notice.getByText(scenario.remedy)).toBeVisible();
      await expect(page.locator('form[action="?/emailInvoice"] [name="recipient"]')).toHaveValue(
        recipient,
      );
      await expect(notice).toBeFocused();
      await saveNotice(notice, scenario.code, viewport, response);
    }
    expect(observed.pageErrors).toEqual([]);
  });

  test(`Owner management invalid operation has a safe remedy at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    const observed = diagnostics(page);
    await signIn(page, 'owner');
    await page.goto(portal('/manage?type=expense&lang=es'));
    const form = page.locator('form[action^="?/manageRecord"]').last();
    await expect(form).toBeAttached();
    const recordId = await form.getAttribute('data-management-record-id');
    expect(recordId).toBeTruthy();
    await form.locator('xpath=ancestor::details/summary').click();
    await form.locator('[name="reason"]').fill('Revisar operación inválida');
    await form.locator('[name="confirmed"]').check();
    await form.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    const response = await expectNativeFailure(
      page,
      'manageRecord',
      async () => {
        await form.evaluate((element: HTMLFormElement) => {
          const invalid = document.createElement('button');
          invalid.type = 'submit';
          invalid.name = 'operation';
          invalid.value = 'archive';
          element.append(invalid);
          element.requestSubmit(invalid);
        });
      },
      'MANAGEMENT_OPERATION_INVALID',
    );
    const notice = page.locator(
      '[data-management-problem] [data-problem-code="MANAGEMENT_OPERATION_INVALID"]',
    );
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Esta operación no está disponible');
    await expect(
      notice.getByRole('link', { name: 'Revisar el registro actualizado' }),
    ).toHaveAttribute('href', new RegExp(`focus=${recordId}`));
    const retained = page.locator(`form[data-management-record-id="${recordId}"]`);
    await expect(retained.locator('[name="reason"]')).toHaveValue('Revisar operación inválida');
    await expect(notice).toBeFocused();
    if (before > 100) {
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 60);
    }
    await saveNotice(notice, 'MANAGEMENT_OPERATION_INVALID', viewport, response);
    expect(observed.pageErrors).toEqual([]);
    expect(
      observed.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
    ).toEqual([]);
  });

  for (const storageBlocked of [false, true]) {
    test(`Owner management changed record keeps its notice in view at ${viewport}${storageBlocked ? ' with session storage blocked' : ''}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== viewport);
      const observed = diagnostics(page);
      await signIn(page, 'owner');
      if (storageBlocked) {
        await page.addInitScript(() => {
          // Deny only this form's recovery key. Other app features also use
          // Storage and must be allowed to hydrate normally.
          for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
            const original = Storage.prototype[method];
            Object.defineProperty(Storage.prototype, method, {
              configurable: true,
              value: function (key: string, ...rest: string[]) {
                if (key.startsWith('management-form-scroll:'))
                  throw new DOMException(
                    'Management scroll storage blocked for QA',
                    'SecurityError',
                  );
                return (original as (...args: string[]) => unknown).apply(this, [key, ...rest]);
              },
            });
          }
        });
      }
      await page.goto(portal('/manage?type=expense&lang=en'));
      const form = page.locator('form[action^="?/manageRecord"]').last();
      await expect(form).toBeAttached();
      const recordId = await form.getAttribute('data-management-record-id');
      expect(recordId).toBeTruthy();
      await form.locator('xpath=ancestor::details/summary').click();
      const reason = 'Review updated record before discarding';
      await form.locator('[name="reason"]').fill(reason);
      await form.locator('[name="confirmed"]').check();
      await form.locator('[name="version"]').evaluate((input: HTMLInputElement) => {
        input.value = String(Number(input.value) + 99);
      });
      await form.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(100);
      const response = await expectNativeFailure(
        page,
        'manageRecord',
        () => form.getByRole('button', { name: 'Delete' }).click(),
        'ACTION_MANAGEMENT_CHANGED',
      );
      const retained = page.locator(`form[data-management-record-id="${recordId}"]`);
      const notice = retained.locator(
        '[data-management-inline-problem] [data-problem-code="ACTION_MANAGEMENT_CHANGED"]',
      );
      await expect(notice).toBeVisible();
      await expect(page.locator('[data-ui="problem-notice"]:visible')).toHaveCount(1);
      await expect(
        page.locator('[data-ui="problem-notice"][role="alert"][aria-live="assertive"]:visible'),
      ).toHaveCount(1);
      await expect(
        page.locator('[data-management-problem] [data-ui="problem-notice"]'),
      ).toBeHidden();
      await expect(notice).toContainText('This record changed');
      await expect(notice.getByRole('link', { name: 'Review updated record' })).toHaveAttribute(
        'href',
        new RegExp(`focus=${recordId}`),
      );
      await expect(retained.locator('[name="reason"]')).toHaveValue(reason);
      await expect(notice).toBeFocused();
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      await expect
        .poll(async () =>
          notice.evaluate((element) => {
            return element.getBoundingClientRect().top;
          }),
        )
        .toBeGreaterThanOrEqual(-2);
      await expect
        .poll(async () => notice.evaluate((element) => element.getBoundingClientRect().bottom))
        .toBeLessThanOrEqual(viewportHeight + 2);
      const after = await page.evaluate(() => window.scrollY);
      expect(after).toBeGreaterThan(100);
      expect(Math.abs(after - before)).toBeLessThan(500);
      const db = database();
      try {
        expect(db.prepare('SELECT 1 FROM expense WHERE id=?').get(recordId)).toBeDefined();
      } finally {
        db.close();
      }
      await saveNotice(
        notice,
        storageBlocked ? 'ACTION_MANAGEMENT_CHANGED_STORAGE_BLOCKED' : 'ACTION_MANAGEMENT_CHANGED',
        viewport,
        response,
      );
      expect(observed.pageErrors).toEqual([]);
    });
  }
}

test('Finance and worker permissions do not expose Owner management or approved deletion', async ({
  browser,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const fixture = invoiceFixture();
  const db = database();
  try {
    db.prepare("UPDATE invoice SET state='approved' WHERE id=?").run(fixture.draft.id);
  } finally {
    db.close();
  }
  const viewport =
    info.project.name === 'phone-390' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const finance = await browser.newPage({ viewport });
  const worker = await browser.newPage({ viewport });
  try {
    await signIn(finance, 'finance');
    const manage = await finance.goto(portal('/manage?type=expense&lang=en'));
    expect(manage?.status()).toBe(403);
    await finance.goto(portal('/billing?view=invoices&lang=en'));
    await openInvoice(finance, fixture.draft.id, info.project.name);
    await expect(finance.locator('form[action="?/deleteInvoice"]')).toHaveCount(0);
    await signIn(worker, 'worker');
    const workerManage = await worker.goto(portal('/manage?type=expense&lang=en'));
    expect(workerManage?.status()).toBe(403);
  } finally {
    await finance.close();
    await worker.close();
    const db = database();
    try {
      db.prepare("UPDATE invoice SET state='draft' WHERE id=?").run(fixture.draft.id);
    } finally {
      db.close();
    }
  }
});
