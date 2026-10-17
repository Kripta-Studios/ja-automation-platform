import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import {
  createDatabase,
  LocalizedPdfRepository,
  PortalRepository,
  V3Repository,
} from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { chromium, expect, test, type Locator, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const widths = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

function receiptPng(description: string): Buffer {
  const chunk = (kind: string, bytes: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind), bytes]);
    let crc = 0xffffffff;
    for (const value of body) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const colour = createHash('sha256').update(description).digest();
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('tEXt', Buffer.from(`Description\0Disposable E2E receipt: ${description}`)),
    chunk('IDAT', deflateSync(Buffer.from([0, colour[0]!, colour[1]!, colour[2]!, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function usable(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const label = await control.evaluate((element) =>
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement
      ? [...(element.labels ?? [])].map((item) => item.innerText.trim()).join(' ')
      : element.textContent?.trim(),
  );
  expect(label).toBeTruthy();
}

async function action(page: Page, name: string, click: () => Promise<void>): Promise<void> {
  const response = page.waitForResponse(
    (item) =>
      item.request().method() === 'POST' && new URL(item.url()).searchParams.has(`/${name}`),
  );
  const [result] = await Promise.all([response, click()]);
  expect(result.status()).toBeLessThan(400);
  await page.waitForLoadState('networkidle');
}

async function role(page: Page, name: keyof typeof e2eCredentials): Promise<void> {
  // Stop protected background polling before clearing a real authenticated session.
  await page.goto('about:blank');
  await page.context().clearCookies();
  await signIn(page, name);
}

function artifactWorker() {
  const pointer = readE2EFixturePointer();
  const previousDocumentRoot = process.env.JA_DOCUMENT_ROOT;
  process.env.JA_DOCUMENT_ROOT = pointer.documentRoot;
  const database = createDatabase(pointer.databasePath);
  const errors: Array<{ kind: string; message: string; stack?: string }> = [];
  const actualV3 = new V3Repository(database.sqlite);
  const v3 = new Proxy(actualV3, {
    get(target, property) {
      if (property === 'runDueJobs')
        return (limit: number, handlers: Parameters<V3Repository['runDueJobs']>[1]) => {
          const observed = Object.fromEntries(
            Object.entries(handlers ?? {}).map(([kind, handler]) => [
              kind,
              (...args: Parameters<typeof handler>) => {
                try {
                  return handler(...args);
                } catch (error) {
                  const detail = {
                    kind,
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                  };
                  errors.push(detail);
                  console.log('[artifact-job-error]', JSON.stringify(detail));
                  throw error;
                }
              },
            ]),
          );
          return target.runDueJobs(limit, observed);
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    const result = runArtifactJobs({
      documentRoot: pointer.documentRoot,
      repository: new PortalRepository(database.sqlite),
      v3,
      localizedPdf: new LocalizedPdfRepository(database.sqlite),
    });
    return { ...result, errors };
  } finally {
    database.sqlite.close();
    if (previousDocumentRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previousDocumentRoot;
  }
}

// One test, one browser, one page: every required viewport is exercised sequentially.
// The users/client come from the disposable E2E fixture; project rows are created through UI.
test('new project opens from the dashboard and lands in its project workspace', async ({
  page,
}, info) => {
  const unexpectedErrors: string[] = [];
  page.on('pageerror', (e) => unexpectedErrors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') unexpectedErrors.push(message.text());
  });
  page.on('response', (r) => {
    if (r.status() === 401) unexpectedErrors.push(`401 ${r.url()}`);
    if (r.status() >= 500) unexpectedErrors.push(`${r.status()} ${r.url()}`);
  });
  page.setDefaultTimeout(15_000);
  await signIn(page, 'owner');
  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto(portal('/?lang=en'));
    await page.getByRole('link', { name: 'New project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await expect(form).toBeVisible();
    for (const [field, label] of [
      ['clientId', 'Client'],
      ['name', 'Name'],
      ['costCenterCode', 'Cost center code'],
    ] as const) {
      const control = form.locator(`[name="${field}"]`);
      await expect(
        form.getByRole(field === 'clientId' ? 'combobox' : 'textbox', {
          name: label,
          exact: field !== 'costCenterCode',
        }),
      ).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    const name = `Journey audit ${viewport.width} ${randomUUID()}`;
    await form.locator('[name="clientId"]').selectOption('00000000-0000-4000-8000-000000000107');
    await form.locator('[name="name"]').fill(name);
    await form
      .locator('[name="costCenterCode"]')
      .fill(`AUD-${viewport.width}${randomUUID().replace(/\D/g, '').slice(0, 5)}`);
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[^/?]+/);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(form).toHaveCount(0);
    await info.attach(`project-workspace-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }
  expect(unexpectedErrors).toEqual([]);
});

test('two people submit actual work, Owner selects and approves it, then issues a real PDF', async ({
  browser,
}, info) => {
  test.setTimeout(900_000);
  let activeBrowser = browser;
  let page = await activeBrowser.newPage();
  page.setDefaultTimeout(15_000);
  const pointer = readE2EFixturePointer();
  // Only read fixture identities and final persisted results; all business setup uses visible forms.
  const db = new DatabaseSync(pointer.databasePath);
  const errors: string[] = [];
  function observe(browserPage: Page) {
    browserPage.on('pageerror', (error) => errors.push(error.message));
    browserPage.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    browserPage.on('response', (response) => {
      if (response.status() === 401) {
        const detail = { url: response.url(), page: browserPage.url() };
        console.log('[audit-unexpected-401]', JSON.stringify(detail));
        errors.push(`401 ${detail.url} from ${detail.page}`);
      }
      if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
    });
  }
  observe(page);
  try {
    const workers = (['worker', 'worker2'] as const).map((name) => {
      const user = db
        .prepare('SELECT id,name FROM user WHERE email=?')
        .get(e2eCredentials[name].email) as { id: string; name: string };
      expect(user).toBeTruthy();
      return { ...user, role: name };
    });
    const manager = db
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.manager.email) as { id: string };
    for (const [index, viewport] of widths.entries()) {
      await page.setViewportSize(viewport);
      const workDate = `2026-10-${String(index + 1).padStart(2, '0')}`;
      const name = `Invoice journey ${viewport.width} ${randomUUID()}`;
      await role(page, 'owner');
      await page.goto(portal('/?lang=en'));
      await page.getByRole('link', { name: 'New project', exact: true }).click();
      const creation = page.locator('form[action="?/createProject"]');
      await creation
        .locator('[name="clientId"]')
        .selectOption('00000000-0000-4000-8000-000000000107');
      await creation.getByRole('textbox', { name: /^Name\b/u }).fill(name);
      await creation.locator('#project-create-context > summary').click();
      await creation.locator('[name="projectManagerId"]').selectOption(manager.id);
      await creation.locator('[name="costCenterCode"]').fill(`JNY-${Date.now()}${index}`);
      await creation.locator('[name="startDate"]').fill('2026-10-01');
      const people = creation.locator('#project-create-people');
      await people.locator(':scope > summary').click();
      await people.getByText('Project defaults for people (optional)', { exact: true }).click();
      await people.getByLabel('Save default rates, pay and expense terms for this project').check();
      await people.getByLabel('Terms effective from', { exact: true }).fill('2026-10-01');
      for (const [label, amount] of [
        ['Customer hourly rate (USD)', '50.00'],
        ['Internal hourly cost (USD)', '20.00'],
        ['Worker compensation rate (USD)', '18.00'],
      ]) {
        await usable(page, people.getByLabel(label, { exact: true }));
        await people.getByLabel(label, { exact: true }).fill(amount);
      }
      await people.getByText('Worker assignments (optional)', { exact: true }).click();
      for (const [workerIndex, worker] of workers.entries()) {
        await people.getByRole('button', { name: 'Add worker assignment' }).click();
        const row = people.locator('tbody tr').nth(workerIndex);
        await row.getByRole('combobox', { name: 'Worker', exact: true }).selectOption(worker.id);
        await row.getByLabel('Starts on', { exact: true }).fill('2026-10-01');
        await usable(page, row.getByRole('combobox', { name: 'Worker', exact: true }));
        if (workerIndex === 1) {
          await row.getByLabel('Terms source').selectOption('override');
          await row.getByLabel('Customer hourly rate (USD)', { exact: true }).fill('75.00');
          await row.getByLabel('Internal hourly cost (USD)', { exact: true }).fill('30.00');
          await row.getByLabel('Worker compensation rate (USD)', { exact: true }).fill('25.00');
        }
      }
      await action(page, 'createProject', () =>
        creation.getByRole('button', { name: 'Create project', exact: true }).click(),
      );
      await expect(page).toHaveURL(/\/projects\/[^/?]+\?tab=work(?:&|$)/);
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      const projectId = new URL(page.url()).pathname.split('/').at(-1)!;
      expect(
        db
          .prepare(
            "SELECT COUNT(*) n FROM project_member WHERE project_id=? AND assignment_role='worker'",
          )
          .get(projectId),
      ).toEqual({ n: 2 });

      await page.goto(portal(`/projects/${projectId}?tab=billing&lang=en`));
      const setup = page.locator('form[action*="?/saveBillingSetup"]');
      await setup.getByLabel('Configuration effective from').fill('2026-10-01');
      await setup.getByRole('button', { name: 'Continue', exact: true }).click();
      const issuer = setup.getByRole('combobox', {
        name: 'Invoice issuer (J&A Automation)',
        exact: true,
      });
      const issuerOption = await issuer
        .locator('option')
        .evaluateAll((items) =>
          items
            .find((item) => item.textContent?.includes('J&A Automation LLC (USD)'))
            ?.getAttribute('value'),
        );
      expect(issuerOption, 'USD issuer must be available').toBeTruthy();
      await issuer.selectOption(issuerOption!);
      const tax = setup.getByRole('combobox', { name: 'Labor tax profile', exact: true });
      const zeroTax = await tax
        .locator('option')
        .evaluateAll((items) =>
          items
            .find((item) => item.textContent?.includes('Zero Tax Profile'))
            ?.getAttribute('value'),
        );
      expect(zeroTax).toBeTruthy();
      await tax.selectOption(zeroTax!);
      await setup.getByRole('button', { name: 'Continue', exact: true }).click();
      for (const worker of workers)
        await expect(
          setup
            .locator('.person-terms')
            .filter({ has: page.getByRole('heading', { name: worker.name, exact: true }) }),
        ).toBeVisible();
      await setup.getByRole('button', { name: 'Continue', exact: true }).click();
      await action(page, 'saveBillingSetup', () =>
        setup.getByRole('button', { name: 'Save billing setup', exact: true }).click(),
      );
      await expect(
        page.getByRole('button', { name: 'Review billing setup', exact: true }),
      ).toBeVisible();

      for (const worker of workers) {
        await role(page, worker.role);
        await page.goto(portal(`/projects/${projectId}?lang=en`));
        await expect(page.locator('[data-invoice-composer]')).toHaveCount(0);
        await page.goto(portal(`/time?project=${projectId}&lang=en`));
        await page.locator('[data-time-primary-cta]').click();
        const time = page.locator('form[data-time-entry-surface]').first();
        await time.locator('[name="projectId"]').selectOption(projectId);
        await time.locator('[name="workDate"]').fill(workDate);
        await time.locator('[name="category"]').selectOption('regular');
        await time.getByLabel('Add start and end times').check();
        await time.locator('[name="startTime"]').fill('08:00');
        await time.locator('[name="endTime"]').fill('10:00');
        const summary = `${name} actual work ${worker.name}`;
        await time.locator('[name="summary"]').fill(summary);
        await usable(page, time.getByRole('button', { name: 'Save draft', exact: true }));
        await action(page, 'createTime', () =>
          time.getByRole('button', { name: 'Save draft', exact: true }).click(),
        );
        await expect(
          page.getByRole('status').filter({ hasText: /Time draft saved/i }),
        ).toBeVisible();
        await page.goto(portal(`/time?from=${workDate}&to=${workDate}&lang=en`));
        const timeRecord = page.locator('.time-record').filter({ hasText: summary });
        await action(page, 'submitTime', () =>
          timeRecord
            .locator('form[action*="/submitTime"]')
            .getByRole('button', { name: 'Submit', exact: true })
            .click(),
        );

        await page.goto(portal(`/expenses?project=${projectId}&lang=en`));
        await page.locator('[data-expense-primary-cta]').click();
        const expense = page.locator('form[data-expense-entry-surface]').first();
        await expense.locator('[name="projectId"]').selectOption(projectId);
        await expense.locator('[name="spentOn"]').fill(workDate);
        await expense.locator('[name="category"]').selectOption('meals');
        await expense.locator('.expense-optional-details > summary').click();
        const vendor = `Journey receipt ${viewport.width} ${worker.name}`;
        await expense.locator('[name="vendor"]').fill(vendor);
        await expense.locator('[name="amount"]').fill('24.50');
        await expense.locator('[name="currency"]').selectOption('USD');
        await expense.locator('[name="whoPaid"]').selectOption('worker');
        await expense
          .locator('[name="description"]')
          .fill('Disposable browser journey meal receipt');
        await expense.locator('[name="paymentMethod"]').fill('Cash');
        await expense.locator('[name="receipt"]').setInputFiles({
          name: 'journey-receipt.png',
          mimeType: 'image/png',
          buffer: receiptPng(vendor),
        });
        await usable(page, expense.getByRole('button', { name: 'Save draft', exact: true }));
        await action(page, 'createExpense', () =>
          expense.getByRole('button', { name: 'Save draft', exact: true }).click(),
        );
        await expect(
          page.getByRole('status').filter({ hasText: /Expense draft saved/i }),
        ).toBeVisible();
        const expenseRecord = page.locator('[data-expense-record]').filter({ hasText: vendor });
        await action(page, 'submitExpense', () =>
          expenseRecord.getByRole('button', { name: 'Submit', exact: true }).click(),
        );
        if (worker.role === 'worker') {
          await page.goto(portal(`/reports?project=${projectId}&lang=en`));
          await page.locator('[data-report-primary-cta]').click();
          const report = page.locator('form[data-report-entry-surface="daily"]');
          await report.locator('[name="projectId"]').selectOption(projectId);
          await report.locator('[name="workDate"]').fill(workDate);
          await report.locator('[name="siteShift"]').fill('Fixture morning shift');
          await report.locator('[name="summary"]').fill(`${name} daily report`);
          await report
            .locator('[name="tasksCompleted"]')
            .fill('Recorded actual work and the meal receipt.');
          await usable(
            page,
            report.getByRole('button', { name: 'Save daily report', exact: true }),
          );
          await report.getByRole('button', { name: 'Save daily report', exact: true }).click();
          await expect(page.getByText('Daily report draft saved', { exact: true })).toBeVisible();
        }
      }

      await role(page, 'owner');
      await page.goto(portal(`/projects/${projectId}?tab=work&lang=en`));
      let composer = page.locator('[data-invoice-composer]');
      await expect(composer.locator('.composer-records > .composer-record')).toHaveCount(4);
      for (const label of await composer.locator('.composer-select').all())
        await usable(page, label);
      await usable(page, composer.getByRole('combobox', { name: 'Worker', exact: true }));
      await expect(
        composer.locator('.composer-records > .composer-record input:checked'),
      ).toHaveCount(0);
      await expect(
        composer.getByRole('button', { name: 'Calculate invoice', exact: true }),
      ).toBeDisabled();
      // Missing issuance prerequisites are resolved through their real form surfaces below.
      if (
        await composer
          .getByRole('link', { name: 'Review issuing company details', exact: true })
          .count()
      ) {
        await composer
          .getByRole('link', { name: 'Review issuing company details', exact: true })
          .click();
        await page.getByText('Create issuing legal entity revision', { exact: true }).click();
        const revision = page.locator('[data-canonical-revision-form]');
        await revision.locator('[name="legacyLegalEntityId"]').selectOption(issuerOption!);
        for (const [field, value] of Object.entries({
          effectiveFrom: '2026-01-01',
          legalName: 'E2E J&A Issuer',
          addressLine1: '1 Fixture Street',
          locality: 'Miami',
          postalCode: '33101',
          countryCode: 'US',
          baseCurrency: 'USD',
          timezone: 'America/New_York',
          reason: 'Disposable E2E issuer details for browser journey',
        }))
          await revision.locator(`[name="${field}"]`).fill(value);
        await action(page, 'createCanonicalLegalEntityRevision', () =>
          revision.locator('button[type="submit"]').click(),
        );
        await page.goto(portal(`/projects/${projectId}?tab=work&lang=en`));
        await composer.getByRole('button', { name: 'Show records', exact: true }).click();
      }
      const authority = composer
        .locator('form')
        .filter({ has: page.locator('[name="legalEntityRevisionId"]') });
      if (await authority.count()) {
        await expect(authority.locator('[name="effectiveTo"]')).toHaveValue('');
        await authority.locator('[name="legalEntityRevisionId"]').selectOption({ index: 1 });
        await authority.locator('[name="effectiveFrom"]').fill('2026-10-01');
        await authority
          .locator('[name="reason"]')
          .fill('Disposable E2E reviewed issuer assignment');
        await authority
          .getByRole('button', { name: 'Save issuing authority', exact: true })
          .click();
        await expect(authority).toHaveCount(0);
      }
      const numbering = composer
        .locator('form')
        .filter({ has: page.locator('[name="accountantApprovedAt"]') });
      if (await numbering.count()) {
        await numbering.locator('[name="prefix"]').fill('E2E-JOURNEY');
        await numbering.locator('[name="effectiveFrom"]').fill('2026-01-01');
        await numbering.locator('[name="accountantApprovedAt"]').fill('2026-01-01T09:00');
        await numbering.locator('button[type="submit"]').click();
        await expect(numbering).toHaveCount(0);
      }
      await usable(
        page,
        composer.getByRole('button', { name: 'Select visible records', exact: true }),
      );
      await composer.getByRole('button', { name: 'Select visible records', exact: true }).click();
      await expect(
        composer.locator('.composer-records > .composer-record input:checked'),
      ).toHaveCount(4);
      await composer.getByRole('button', { name: /Approve selected pending records/ }).click();
      await expect(
        composer.getByRole('button', { name: /Approve selected pending records/ }),
      ).toHaveCount(0);
      for (let expenseIndex = 0; expenseIndex < 2; expenseIndex++) {
        await composer
          .getByRole('button', { name: 'Apply configured expense conditions', exact: true })
          .first()
          .click();
        await expect(
          composer.getByRole('button', {
            name: 'Apply configured expense conditions',
            exact: true,
          }),
        ).toHaveCount(1 - expenseIndex);
      }
      await composer.getByRole('button', { name: 'Calculate invoice', exact: true }).click();
      await expect(
        composer.getByRole('button', { name: 'Save invoice draft', exact: true }),
      ).toBeVisible();
      await expect(composer.locator('dl')).toContainText('299.00');
      await info.attach(`calculated-selection-${viewport.width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await composer.getByRole('button', { name: 'Save invoice draft', exact: true }).click();
      await expect(
        composer.getByRole('heading', { name: 'Draft saved for this client', exact: true }),
      ).toBeVisible();

      const invoice = db
        .prepare(
          'SELECT id,state,total_minor FROM invoice WHERE project_id=? ORDER BY created_at DESC LIMIT 1',
        )
        .get(projectId) as { id: string; state: string; total_minor: number };
      expect(invoice).toMatchObject({ state: 'draft', total_minor: 29900 });
      await usable(
        page,
        composer.getByRole('button', { name: 'Approve and issue invoice', exact: true }),
      );
      await composer
        .getByRole('button', { name: 'Approve and issue invoice', exact: true })
        .click();
      await expect(
        composer.getByRole('heading', { name: 'Invoice issued', exact: true }),
      ).toBeVisible();
      const ownerStorage = await page.context().storageState();
      await activeBrowser.close();
      expect(activeBrowser.isConnected()).toBe(false);
      // The real job renderer launches Chromium synchronously. The UI browser is closed first.
      const runs = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = artifactWorker();
        runs.push(result);
        const jobEvidence = db
          .prepare(
            'SELECT j.id,j.kind,j.state,j.last_error_code,r.outcome,r.error_code FROM job j LEFT JOIN job_run r ON r.job_id=j.id ORDER BY j.created_at,r.started_at',
          )
          .all();
        await info.attach(`artifact-job-evidence-${viewport.width}-${attempt}`, {
          body: JSON.stringify(jobEvidence),
          contentType: 'application/json',
        });
        const unexpectedFailures = db
          .prepare(
            "SELECT j.kind,r.error_code FROM job_run r JOIN job j ON j.id=r.job_id WHERE r.outcome<>'succeeded'",
          )
          .all();
        expect(unexpectedFailures, JSON.stringify(runs)).toEqual([]);
        expect(result.failed, JSON.stringify(runs)).toBe(0);
        if (db.prepare('SELECT pdf_sha256 FROM invoice WHERE id=?').get(invoice.id)?.pdf_sha256)
          break;
      }
      await info.attach(`artifact-worker-${viewport.width}`, {
        body: JSON.stringify(runs),
        contentType: 'application/json',
      });
      expect(
        db
          .prepare(
            "SELECT COUNT(*) n FROM job_run r JOIN job j ON j.id=r.job_id WHERE j.kind='invoice_pdf' AND json_extract(j.payload_json,'$.invoiceId')=? AND r.outcome='succeeded'",
          )
          .get(invoice.id),
      ).toEqual({ n: 1 });
      activeBrowser = await chromium.launch({
        executablePath: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH,
        args:
          process.getuid?.() === 0
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : undefined,
      });
      page = await activeBrowser.newPage({ storageState: ownerStorage, viewport });
      page.setDefaultTimeout(15_000);
      observe(page);
      await page.goto(portal(`/billing/invoices/${invoice.id}?lang=en`));
      const download = page.getByRole('link', { name: 'Download PDF', exact: true }).last();
      await expect(download).toBeVisible({ timeout: 30_000 });
      const pdfHref = await download.getAttribute('href');
      const pdf = await page.request.get(new URL(pdfHref!, page.url()).toString());
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()['content-type']).toMatch(/^application\/pdf/);
      expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
      await info.attach(`issued-invoice-${viewport.width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.goto(portal(`/projects/${projectId}?tab=work&lang=en`));
      composer = page.locator('[data-invoice-composer]');
      if (index === 0) {
        // Add fresh actual sources in the same period, then save disjoint selected drafts.
        for (const worker of workers) {
          await role(page, worker.role);
          await page.goto(portal(`/time?project=${projectId}&lang=en`));
          await page.locator('[data-time-primary-cta]').click();
          const time = page.locator('form[data-time-entry-surface]').first();
          await time.locator('[name="projectId"]').selectOption(projectId);
          await time.locator('[name="workDate"]').fill('2026-10-07');
          await time.locator('[name="category"]').selectOption('regular');
          await time.getByLabel('Add start and end times').check();
          await time.locator('[name="startTime"]').fill('11:00');
          await time.locator('[name="endTime"]').fill('12:00');
          const summary = `${name} extra ${worker.name}`;
          await time.locator('[name="summary"]').fill(summary);
          await action(page, 'createTime', () =>
            time.getByRole('button', { name: 'Save draft', exact: true }).click(),
          );
          await page.goto(portal('/time?from=2026-10-07&to=2026-10-07&lang=en'));
          await action(page, 'submitTime', () =>
            page
              .locator('.time-record')
              .filter({ hasText: summary })
              .getByRole('button', { name: 'Submit', exact: true })
              .click(),
          );
        }
        await role(page, 'owner');
        await page.goto(portal(`/projects/${projectId}?tab=work&lang=en`));
        await expect(composer.locator('.composer-records > .composer-record')).toHaveCount(6);
        for (const [workerIndex, worker] of workers.entries()) {
          await composer
            .getByRole('combobox', { name: 'Worker', exact: true })
            .selectOption(worker.id);
          await composer
            .getByRole('button', { name: 'Select visible records', exact: true })
            .click();
          await expect(
            composer.locator('.composer-records > .composer-record input:checked'),
          ).toHaveCount(1);
          await composer.getByRole('button', { name: /Approve selected pending records/ }).click();
          await expect(
            composer.getByRole('button', { name: /Approve selected pending records/ }),
          ).toHaveCount(0);
          await composer.getByRole('button', { name: 'Calculate invoice', exact: true }).click();
          await expect(
            composer.getByRole('button', { name: 'Save invoice draft', exact: true }),
          ).toBeVisible();
          await expect(composer.locator('dl')).toContainText(workerIndex === 0 ? '50.00' : '75.00');
          await composer.getByRole('button', { name: 'Save invoice draft', exact: true }).click();
          await expect(
            composer.getByRole('heading', { name: 'Draft saved for this client', exact: true }),
          ).toBeVisible();
          await composer
            .getByRole('button', { name: 'Prepare another invoice', exact: true })
            .click();
          await expect(
            composer.getByRole('button', { name: 'Show records', exact: true }),
          ).toBeEnabled();
        }
        expect(
          db
            .prepare(
              'SELECT state,total_minor FROM invoice WHERE project_id=? ORDER BY total_minor',
            )
            .all(projectId),
        ).toEqual([
          { state: 'draft', total_minor: 5000 },
          { state: 'draft', total_minor: 7500 },
          { state: 'issued', total_minor: 29900 },
        ]);
        expect(
          db
            .prepare(
              'SELECT source_id,COUNT(*) n FROM invoice_source WHERE invoice_id IN (SELECT id FROM invoice WHERE project_id=?) GROUP BY source_id HAVING COUNT(*)>1',
            )
            .all(projectId),
        ).toEqual([]);
      }
      await role(page, 'finance');
      await page.goto(portal(`/projects/${projectId}?tab=work&lang=en`));
      await expect(
        page.locator('[data-invoice-composer] .composer-records > .composer-record'),
      ).toHaveCount(index === 0 ? 6 : 4);
      await expect(
        page.locator('[data-invoice-composer] .composer-records > .composer-record input:enabled'),
      ).toHaveCount(0);
      await role(page, 'manager');
      await page.goto(portal(`/projects/${projectId}?lang=en`));
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.locator('[data-invoice-composer]')).toHaveCount(0);
      await page.goto(portal(`/reports?project=${projectId}&lang=en`));
      await expect(page.getByText(`${name} daily report`, { exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  } catch (error) {
    if (!page.isClosed()) {
      await info.attach('failed-journey-screen', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      await info.attach('failed-journey-html', {
        body: await page.content(),
        contentType: 'text/html',
      });
    }
    throw error;
  } finally {
    await activeBrowser.close();
    db.close();
  }
});

test('late whole-period readiness cannot open a repair dialog after browser Back', async ({
  browser,
}, info) => {
  test.setTimeout(60_000);
  const activeBrowser = browser.isConnected()
    ? browser
    : await chromium.launch({
        executablePath: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH,
        args:
          process.getuid?.() === 0
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : undefined,
      });
  const page = await activeBrowser.newPage();
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const invoices = () => db.prepare('SELECT COUNT(*) count FROM invoice').get();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const requestCaptured = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let completed!: () => void;
  const requestCompleted = new Promise<void>((resolve) => {
    completed = resolve;
  });
  const posts: string[] = [];
  const pageErrors: string[] = [];
  const navigationPrompts: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', async (dialog) => {
    navigationPrompts.push(dialog.type());
    expect(['confirm', 'beforeunload']).toContain(dialog.type());
    await dialog.accept();
  });
  try {
    await signIn(page, 'owner');
    const project = db
      .prepare(
        "SELECT p.id,p.name FROM project p WHERE p.status='active' AND EXISTS(SELECT 1 FROM billing_rule r WHERE r.project_id=p.id AND r.enabled=1) ORDER BY p.id LIMIT 1",
      )
      .get() as { id: string; name: string };
    await page.goto(portal(`/projects/${project.id}?tab=work&lang=en`));
    await page.getByRole('tab', { name: 'Team and conditions', exact: true }).click();
    const spaMarker = randomUUID();
    await page.evaluate((marker) => {
      (window as unknown as { journeySpaMarker: string }).journeySpaMarker = marker;
    }, spaMarker);
    const before = invoices();
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    await page.route('**/api/billing/readiness?**', async (route) => {
      captured();
      await held;
      try {
        await route.fulfill({
          json: {
            state: 'incomplete',
            streamType: 'labor',
            includedSourceCount: 0,
            excludedSourceCount: 1,
            hasPositiveFixedFee: false,
            hasPositiveDraftAmount: false,
            includedExpenseRows: [],
            includedExpenseSubtotalMinor: '0',
            reasons: [
              { code: 'pending_time_finance_review', sourceId: 'delayed-readiness-source' },
            ],
            timeReadiness: {
              recordCount: 1,
              minutes: 60,
              groups: [{ status: 'pending_finance_review', recordCount: 1, minutes: 60 }],
              records: [
                {
                  sourceId: 'delayed-readiness-source',
                  workDate: '2026-10-01',
                  minutes: 60,
                  status: 'pending_finance_review',
                },
              ],
            },
          },
        });
      } finally {
        completed();
      }
    });
    await page.getByRole('link', { name: 'Open Billing', exact: true }).click();
    await expect(page).toHaveURL(/\/billing\?project=/);
    await page.waitForLoadState('networkidle');
    expect(
      await page.evaluate(
        () => (window as unknown as { journeySpaMarker?: string }).journeySpaMarker,
      ),
    ).toBe(spaMarker);
    await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
    await page.getByRole('button', { name: /^Whole period or milestone/ }).click();
    const legacy = page.locator('form.billing-section__invoice-wizard');
    await expect(legacy).toBeVisible();
    // Project-scoped entry already carries its stream and opens the period step.
    await expect(legacy.locator('.billing-section__wizard-mobile-progress')).toContainText('2/3');
    await legacy.getByRole('button', { name: 'Check selected period', exact: true }).click();
    await requestCaptured;
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}`));
    await expect(
      page.getByRole('tab', { name: 'Team and conditions', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      await page.evaluate(
        () => (window as unknown as { journeySpaMarker?: string }).journeySpaMarker,
      ),
    ).toBe(spaMarker);
    expect(navigationPrompts).not.toContain('beforeunload');
    release();
    await requestCompleted;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
    await expect(page.locator('dialog[data-ui="guided-recovery"]')).not.toBeVisible();
    await page
      .locator('.attention-grid')
      .getByRole('link', { name: /Reports/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/reports\\?project=${project.id}`));
    expect(posts).toEqual([]);
    expect(invoices()).toEqual(before);
    expect(pageErrors).toEqual([]);
  } catch (error) {
    if (!page.isClosed()) {
      console.log(
        '[late-readiness-failed-ui]',
        JSON.stringify({
          url: page.url(),
          buttons: await page.locator('button').allTextContents(),
        }),
      );
      await info.attach('late-readiness-failed-screen', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      await info.attach('late-readiness-failed-html', {
        body: await page.content(),
        contentType: 'text/html',
      });
    }
    throw error;
  } finally {
    release();
    try {
      if (!page.isClosed()) await page.unroute('**/api/billing/readiness?**');
    } finally {
      db.close();
      await activeBrowser.close();
    }
  }
});
