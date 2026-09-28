import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const evidenceDir = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/duplicate-private-upload-browser',
);

function database() {
  return new DatabaseSync(readE2EFixturePointer().databasePath);
}

async function decodeActionData(serialized: string): Promise<unknown> {
  // SvelteKit serializes enhanced form data with devalue. Resolve its pinned
  // dependency through Kit so the test reads the same contract the browser does.
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => unknown;
  };
  return parse(serialized);
}

function projectFor(form: Locator) {
  return form
    .locator('select[name="projectId"]')
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  const watchPage = (candidate: Page) => {
    candidate.on('pageerror', (error) => errors.push(error.message));
    candidate.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        errors.push(message.text());
    });
  };
  watchPage(page);
  page.context().on('page', watchPage);
  return errors;
}

async function postFor(page: Page, action: string, submit: () => Promise<void>): Promise<Response> {
  const pending = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await submit();
  return pending;
}

async function saveNotice(notice: Locator, kind: string, viewport: string, facts: object) {
  mkdirSync(evidenceDir, { recursive: true });
  const filename = `${kind}-${viewport}`;
  writeFileSync(join(evidenceDir, `${filename}.png`), await notice.screenshot());
  writeFileSync(
    join(evidenceDir, `${filename}.json`),
    `${JSON.stringify({ ...facts, viewport, screenshot: `${filename}.png` }, null, 2)}\n`,
  );
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Worker duplicate receipt explains a safe next step at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    const errors = watchConsole(page);
    const unique = randomUUID();
    const vendor = `Duplicate receipt QA ${unique}`;
    const bytes = Buffer.from(`%PDF-1.4\n% private receipt QA ${unique}\n%%EOF\n`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    await signIn(page, 'worker');

    const submit = async (filename: string) => {
      await page.goto(portal('/expenses?lang=en'));
      await page.locator('[data-expense-primary-cta]').click();
      const form = page.locator('form[data-expense-entry-surface]').first();
      const project = await projectFor(form);
      expect(project).toBeTruthy();
      await form.locator('select[name="projectId"]').selectOption(project!);
      await form.locator('input[name="spentOn"]').fill(new Date().toISOString().slice(0, 10));
      await form.locator('select[name="category"]').selectOption('meals');
      await form.locator('input[name="vendor"]').fill(vendor);
      await form.locator('input[name="amount"]').fill('12.34');
      await form.locator('[name="description"]').fill('Synthetic receipt duplicate check');
      await form.locator('select[name="currency"]').selectOption('USD');
      await form.locator('select[name="whoPaid"]').selectOption('worker');
      await form.locator('input[name="receipt"]').setInputFiles({
        name: filename,
        mimeType: 'application/pdf',
        buffer: bytes,
      });
      const preview = form.getByRole('link', { name: `Download PDF: ${filename}` });
      await expect(preview).toBeVisible();
      if (filename === 'first-receipt.pdf') {
        const previewUrl = await preview.getAttribute('href');
        expect(previewUrl).toMatch(/^blob:/);
        const [download] = await Promise.all([page.waitForEvent('download'), preview.click()]);
        expect(download.suggestedFilename()).toBe(filename);
        expect(readFileSync(await download.path())).toEqual(bytes);
      }
      const scrollBefore = await page.evaluate(() => window.scrollY);
      const sheetScrollBefore = await page
        .locator('.expense-entry-sheet')
        .evaluate((node) => node.scrollTop);
      const response = await postFor(page, 'createExpense', () =>
        form.getByRole('button', { name: 'Save draft', exact: true }).click(),
      );
      return { response, project, scrollBefore, sheetScrollBefore };
    };

    expect((await submit('first-receipt.pdf')).response.status()).toBe(200);
    const second = await submit('renamed-receipt.pdf');
    // Enhanced SvelteKit actions use HTTP 200 and carry the failure status in
    // the action envelope. Native document actions below use HTTP 409 directly.
    expect(second.response.status()).toBe(200);
    const actionResult = (await second.response.json()) as {
      type: string;
      status: number;
      data: string;
    };
    expect(actionResult).toMatchObject({ type: 'failure', status: 409 });
    const actionData = await decodeActionData(actionResult.data);
    expect(actionData).toMatchObject({
      code: 'EXPENSE_RECEIPT_DUPLICATE_CONTENT',
      messageKey: 'problem.expense.receiptDuplicateContent',
      remedies: [{ id: 'review_expenses' }],
    });
    const notice = page.locator('[data-problem-code="EXPENSE_RECEIPT_DUPLICATE_CONTENT"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('matches existing private content');
    await expect(notice).toContainText('No new expense was saved');
    await expect(notice).not.toContainText('first-receipt.pdf');
    await expect(notice.getByRole('link', { name: 'Review expenses list' })).toBeVisible();
    await expect(page.locator('input[name="vendor"]')).toHaveValue(vendor);
    await expect(page.locator('input[name="amount"]')).toHaveValue('12.34');
    await expect(page.locator('select[name="projectId"]')).toHaveValue(second.project!);
    await expect(page.locator('[data-operational-form-error]')).toBeFocused();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const sheetScrollAfter = await page
      .locator('.expense-entry-sheet')
      .evaluate((node) => node.scrollTop);
    const db = database();
    let documentCount = 0;
    let expenseCount = 0;
    try {
      documentCount = (
        db.prepare('SELECT count(*) AS n FROM document WHERE sha256=?').get(hash) as { n: number }
      ).n;
      expenseCount = (
        db.prepare('SELECT count(*) AS n FROM expense WHERE vendor=?').get(vendor) as { n: number }
      ).n;
    } finally {
      db.close();
    }
    expect(documentCount).toBe(1);
    expect(expenseCount).toBe(1);
    expect(errors).toEqual([]);
    await saveNotice(notice, 'expense-receipt-duplicate', viewport, {
      role: 'worker',
      code: 'EXPENSE_RECEIPT_DUPLICATE_CONTENT',
      transportStatus: second.response.status(),
      actionStatus: actionResult.status,
      method: second.response.request().method(),
      route: new URL(second.response.url()).pathname,
      documentCount,
      expenseCount,
      scrollBefore: second.scrollBefore,
      scrollAfter,
      sheetScrollBefore: second.sheetScrollBefore,
      sheetScrollAfter,
      focus: '[data-operational-form-error]',
      pdfPreview: 'clicked blob download; original filename and bytes verified',
      accountDetails: 'redacted',
    });
  });

  test(`Owner duplicate private document preserves form and privacy at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    const errors = watchConsole(page);
    const unique = randomUUID();
    const bytes = Buffer.from(`Synthetic private document QA ${unique}\n`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const description = `Synthetic duplicate document ${unique}`;
    await signIn(page, 'owner');

    const submit = async (filename: string) => {
      await page.goto(portal('/documents?lang=en'));
      await page.locator('.document-upload-panel details.ui-disclosure summary').click();
      const form = page.locator('form[action="?/uploadPrivateDocument"]');
      const project = await projectFor(form);
      expect(project).toBeTruthy();
      await form.locator('[name="projectId"]').selectOption(project!);
      await form.locator('[name="artifactType"]').fill('Browser QA evidence');
      await form.locator('[name="artifactClassification"]').selectOption('finance');
      await form.locator('[name="sensitivity"]').selectOption('sensitive');
      await form.locator('[name="description"]').fill(description);
      await form.locator('[name="file"]').setInputFiles({
        name: filename,
        mimeType: 'text/plain',
        buffer: bytes,
      });
      await form.scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => window.scrollY);
      const response = await postFor(page, 'uploadPrivateDocument', () =>
        form.getByRole('button', { name: 'Upload and register hash', exact: true }).click(),
      );
      return { response, project, scrollBefore };
    };

    expect([200, 303]).toContain((await submit('first-private.txt')).response.status());
    const second = await submit('renamed-private.txt');
    expect(second.response.status()).toBe(409);
    expect(await second.response.text()).toContain('DOCUMENT_DUPLICATE_CONTENT');
    const notice = page.locator(
      '.document-upload-panel [data-problem-code="DOCUMENT_DUPLICATE_CONTENT"]',
    );
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('same content is already stored');
    await expect(notice).toContainText('No new document was saved');
    await expect(notice).not.toContainText('first-private.txt');
    await expect(notice.getByRole('link', { name: 'Review documents' })).toBeVisible();
    const form = page.locator('form[action="?/uploadPrivateDocument"]');
    await expect(form.locator('[name="projectId"]')).toHaveValue(second.project!);
    await expect(form.locator('[name="artifactType"]')).toHaveValue('Browser QA evidence');
    await expect(form.locator('[name="artifactClassification"]')).toHaveValue('finance');
    await expect(form.locator('[name="sensitivity"]')).toHaveValue('sensitive');
    await expect(form.locator('[name="description"]')).toHaveValue(description);
    await expect(notice).toBeFocused();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    // A small upward correction keeps the focused notice clear of the sticky
    // toolbar while preserving the user's place near the upload form.
    expect(Math.abs(scrollAfter - second.scrollBefore)).toBeLessThan(100);
    const noticePosition = await notice.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const header = document.querySelector('header, [role="banner"]')?.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, headerBottom: header?.bottom ?? 0 };
    });
    expect(noticePosition.top).toBeGreaterThanOrEqual(noticePosition.headerBottom);
    const db = database();
    let documentCount = 0;
    try {
      documentCount = (
        db.prepare('SELECT count(*) AS n FROM document WHERE sha256=?').get(hash) as { n: number }
      ).n;
    } finally {
      db.close();
    }
    expect(documentCount).toBe(1);
    expect(errors).toEqual([]);
    await saveNotice(notice, 'document-duplicate', viewport, {
      role: 'owner',
      code: 'DOCUMENT_DUPLICATE_CONTENT',
      responseStatus: second.response.status(),
      method: second.response.request().method(),
      route: new URL(second.response.url()).pathname,
      documentCount,
      scrollBefore: second.scrollBefore,
      scrollAfter,
      noticePosition,
      focus: '[data-ui="problem-notice"]',
      accountDetails: 'redacted',
    });
  });
}
