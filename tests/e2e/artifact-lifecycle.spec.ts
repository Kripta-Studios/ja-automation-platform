import { expect, test } from '@playwright/test';
import { createDatabase, V3Repository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import {
  e2eArchiveTarget,
  e2eCredentials,
  e2eLifecycleFixturesFor,
  portal,
  resetE2ELifecycleFixture,
  signIn,
} from './auth.js';
import { readE2EFixturePointer } from './environment.js';

function periodFor(
  testInfo: { project: { name: string } },
  offset: number,
): { start: string; end: string; yearMonth: string } {
  const projects = [
    'phone-360',
    'phone-390',
    'phone-430',
    'tablet-768',
    'tablet-1024',
    'laptop-1280',
    'desktop',
    'wide-1920',
  ];
  const projectIndex = Math.max(0, projects.indexOf(testInfo.project.name));
  // Keep each viewport/test pair isolated while remaining inside the supported business-date
  // range.  2101+ dates used to make a valid form submission disappear from the accounting
  // register on some browser/runtime combinations; these deterministic periods are after the
  // seeded August 2026 source data and do not depend on wall-clock time.
  const monthIndex = 8 + projectIndex * 4 + offset; // September 2026 onward.
  const startDate = new Date(Date.UTC(2026, monthIndex, 1));
  const endDate = new Date(Date.UTC(2026, monthIndex + 1, 0));
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, yearMonth: start.slice(0, 7) };
}

async function stepUpFinance(page: import('@playwright/test').Page): Promise<void> {
  const response = await page.request.post(portal('/api/step-up'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { password: e2eCredentials.finance.password },
  });
  expect(response.ok(), 'Accounting mutations require a session-bound step-up').toBe(true);
}

function withClock<T>(iso: string, work: () => T): T {
  const realDate = globalThis.Date;
  const fixedTime = realDate.parse(iso);
  const clockDate = new Proxy(realDate, {
    construct(target, args) {
      return Reflect.construct(target, args.length === 0 ? [fixedTime] : args);
    },
    get(target, property, receiver) {
      if (property === 'now') return () => fixedTime;
      return Reflect.get(target, property, receiver);
    },
  }) as DateConstructor;
  globalThis.Date = clockDate;
  try {
    return work();
  } finally {
    globalThis.Date = realDate;
  }
}

async function createPack(
  page: import('@playwright/test').Page,
  periodStart: string,
  periodEnd: string,
): Promise<{ id: string; row: import('@playwright/test').Locator }> {
  const fixture = readE2EFixturePointer();
  await page.goto(portal('/accounting'));
  await expect(page.getByRole('heading', { name: 'Accounting', exact: true })).toBeVisible();
  const form = page.locator('form[action="?/createAccountingPack"]');
  await expect(form).toHaveCount(1);
  await form.locator('input[name="periodStart"]').fill(periodStart);
  await form.locator('input[name="periodEnd"]').fill(periodEnd);
  const actionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('createAccountingPack'),
  );
  await form.getByRole('button', { name: 'Generate pack' }).click();
  const response = await actionResponse;
  expect(response.status(), 'accounting pack creation action must not fail').toBe(200);
  const row = page.locator('.invoice-row').filter({ hasText: `${periodStart} → ${periodEnd}` });
  await expect(row).toBeVisible();
  // The pack ID is deliberately obtained from the disposable fixture database rather than a
  // download link. A pending pack must not expose an actionable ready link before its format is
  // registered, so the test fixture is the truthful non-ready identifier source.
  const database = createDatabase(fixture.databasePath);
  try {
    const pack = database.sqlite
      .prepare('SELECT id FROM accounting_pack_run WHERE period_start=? AND period_end=?')
      .get(periodStart, periodEnd) as { id: string } | undefined;
    if (!pack?.id) throw new Error(`Accounting Pack fixture row is missing: ${periodStart}`);
    return { id: pack.id, row };
  } finally {
    database.sqlite.close();
  }
}

/**
 * Exercise the same durable runner used by the production timer, without making an ordinary user
 * click the finance diagnostic action. The test owns the disposable DB/document paths, while the
 * worker contract and artifact handlers remain the real package implementations.
 */
function runBackgroundArtifactWorker(clock?: string): { processed: number; failed: number } {
  const run = () => {
    const fixture = readE2EFixturePointer();
    const database = createDatabase(fixture.databasePath);
    try {
      const user = database.sqlite
        .prepare("SELECT id FROM user WHERE email=? AND status='active'")
        .get(e2eCredentials.finance.email) as { id: string } | undefined;
      if (!user?.id) throw new Error('Finance E2E fixture user is missing');
      const principal = {
        userId: user.id,
        role: 'finance_admin' as const,
        projectIds: new Set<string>(),
      };
      const v3 = new V3Repository(database.sqlite);
      return runArtifactJobs({
        principal,
        documentRoot: fixture.documentRoot,
        repository: { createInvoiceDraft: () => undefined },
        v3,
      });
    } finally {
      database.sqlite.close();
    }
  };
  return clock ? withClock(clock, run) : run();
}

function accountingPackJob(packId: string): { state: string; attempts: number } | undefined {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return database.sqlite
      .prepare('SELECT state,attempts FROM job WHERE kind=? AND idempotency_key=?')
      .get('accounting_pack_artifact_render', `accounting-pack:${packId}`) as
      | { state: string; attempts: number }
      | undefined;
  } finally {
    database.sqlite.close();
  }
}

async function runUntilPackTerminal(
  page: import('@playwright/test').Page,
  packId: string,
  type: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
  expectedStatus: number,
): Promise<import('@playwright/test').APIResponse> {
  let response: import('@playwright/test').APIResponse | undefined;
  await expect
    .poll(
      async () => {
        response = await page.request.get(portal(`/api/accounting-pack/${packId}/${type}`));
        return response.status();
      },
      { timeout: 10_000 },
    )
    .toBe(expectedStatus);
  if (!response) throw new Error(`No response received for ${type}`);
  return response;
}

test('Accounting Pack creation is queued and a pending format never becomes an HTTP 500', async ({
  page,
}, testInfo) => {
  await signIn(page, 'finance');
  await stepUpFinance(page);
  const period = periodFor(testInfo, 0);
  const { start: periodStart, end: periodEnd } = period;
  const { id, row } = await createPack(page, periodStart, periodEnd);

  await expect.soft(row).toContainText(/draft|queued|pending|generating/i);
  await expect.soft(row).not.toContainText(/\bready\b/i);
  await expect.soft(row.getByRole('link', { name: 'PDF', exact: true })).toHaveCount(0);

  const response = await page.request.get(portal(`/api/accounting-pack/${id}/pdf`));
  expect.soft([404, 409]).toContain(response.status());
  expect.soft(response.status(), 'pending/absent output must never be an HTTP 500').not.toBe(500);
  expect
    .soft(await response.text())
    .toMatch(/pending|queued|not ready|not generated|not found|export/i);
});

test('processed Accounting Pack formats download independently with business filenames', async ({
  page,
}, testInfo) => {
  await signIn(page, 'finance');
  await stepUpFinance(page);
  const period = periodFor(testInfo, 1);
  const { start: periodStart, end: periodEnd, yearMonth } = period;
  const { id } = await createPack(page, periodStart, periodEnd);

  const worker = runBackgroundArtifactWorker();
  expect(
    worker.processed,
    'durable artifact worker should process the fixture pack',
  ).toBeGreaterThan(0);
  expect(accountingPackJob(id)).toEqual({ state: 'succeeded', attempts: 1 });

  for (const type of ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'] as const) {
    const response = await runUntilPackTerminal(page, id, type, 200);
    expect(response.status(), `${type} download`).toBe(200);
    expect((await response.body()).byteLength, `${type} bytes`).toBeGreaterThan(0);
    expect(response.headers()['content-disposition']).toMatch(
      new RegExp(
        `filename="[^"]*${yearMonth}[^"]*\\.${type === 'invoice_csv' || type === 'expense_csv' ? 'csv' : type}"`,
      ),
    );
  }
});

test('terminal failed Accounting Pack formats expose retry metadata and never return HTTP 500', async ({
  page,
}, testInfo) => {
  await signIn(page, 'finance');
  await stepUpFinance(page);
  const period = periodFor(testInfo, 2);
  const { start: periodStart, end: periodEnd } = period;
  const { id, row } = await createPack(page, periodStart, periodEnd);
  const fixture = readE2EFixturePointer();

  // This is failure injection in the test-owned worker process; the preview server remains the
  // real download/API implementation. Five deterministic attempts drive the durable job to its
  // terminal retry limit without a user-facing "Run due jobs" click.
  const originalChromiumPath = process.env.JA_CHROMIUM_PATH;
  const originalRequirePdf = process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
  process.env.JA_CHROMIUM_PATH = `${fixture.documentRoot}/missing-chromium`;
  process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = 'true';
  try {
    const baseTime = Date.now();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // The real runner applies a five-minute retry delay. Advance only the disposable worker
      // clock between attempts so the B5 job guards and immutable job history remain exercised.
      const clock = new Date(baseTime + attempt * 5 * 60_000 + 1).toISOString();
      runBackgroundArtifactWorker(clock);
    }
  } finally {
    if (originalChromiumPath === undefined) delete process.env.JA_CHROMIUM_PATH;
    else process.env.JA_CHROMIUM_PATH = originalChromiumPath;
    if (originalRequirePdf === undefined) delete process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
    else process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = originalRequirePdf;
  }

  const database = createDatabase(fixture.databasePath);
  try {
    const job = database.sqlite
      .prepare('SELECT state,attempts FROM job WHERE kind=? AND idempotency_key=?')
      .get('accounting_pack_artifact_render', `accounting-pack:${id}`) as
      | { state: string; attempts: number }
      | undefined;
    expect(job).toEqual({ state: 'dead_letter', attempts: 5 });
    const failure = database.sqlite
      .prepare(
        'SELECT outcome,error_code,finished_at FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?) ORDER BY started_at DESC LIMIT 1',
      )
      .get(`accounting-pack:${id}`) as
      | { outcome: string; error_code: string | null; finished_at: string | null }
      | undefined;
    expect(failure?.outcome).toBe('failed_terminal');
    expect(failure?.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(failure?.error_code).toMatch(/chromium|browser|pdf|executable|renderer/i);
  } finally {
    database.sqlite.close();
  }

  await expect.soft(row).toContainText(/draft|queued|pending|generating|failed/i);
  const response = await page.request.get(portal(`/api/accounting-pack/${id}/pdf`));
  expect
    .soft(response.status(), 'failed format download must be intentional, never HTTP 500')
    .not.toBe(500);
  expect.soft([404, 409]).toContain(response.status());
  expect
    .soft(await response.text())
    .toMatch(/failed|retry|pending|not ready|not generated|not found|export/i);
});

async function submitLifecycleTransition(
  form: import('@playwright/test').Locator,
  reason: string,
): Promise<void> {
  await expect(form).toHaveCount(1);
  const status = await form.locator('input[name="status"]').inputValue();
  expect(status, 'lifecycle form must carry an explicit target status').toBeTruthy();
  await form.locator('input[name="reason"]').fill(reason);
  await form.getByRole('button', { name: /close|archive|restore|begin/i }).click();
}

test('owner can archive and restore the deterministic client fixture', async ({
  page,
}, testInfo) => {
  const fixture = e2eLifecycleFixturesFor(testInfo.project.name);
  const pointer = readE2EFixturePointer();
  resetE2ELifecycleFixture(pointer.databasePath, fixture, 'client');
  try {
    await signIn(page, 'owner');
    await page.goto(portal(`/projects?view=clients&focus=${fixture.client.id}`));
    await expect(
      page.getByRole('heading', { name: 'Client contacts', exact: true, level: 1 }),
    ).toBeVisible();

    const client = page.locator(`[data-client-id="${fixture.client.id}"]`);
    await expect(client).toHaveCount(1);
    await expect(client).toContainText(fixture.client.displayName);
    await expect(client).toContainText(/active/i);

    const archive = client.locator(
      `form[action="?/transitionClient"]:has(input[name="clientId"][value="${fixture.client.id}"])`,
    );
    await submitLifecycleTransition(archive, 'E2E reversible client lifecycle archive');
    await expect(client).toContainText(/archived/i);

    const restore = client.locator(
      `form[action="?/transitionClient"]:has(input[name="clientId"][value="${fixture.client.id}"])`,
    );
    await submitLifecycleTransition(restore, 'E2E reversible client lifecycle restore');
    await expect(client).toContainText(/active/i);
    await expect(client).toContainText(fixture.client.displayName);
  } finally {
    resetE2ELifecycleFixture(pointer.databasePath, fixture, 'client');
  }
});

test('owner can edit and complete the reversible project lifecycle fixture', async ({
  page,
}, testInfo) => {
  const fixture = e2eLifecycleFixturesFor(testInfo.project.name);
  const pointer = readE2EFixturePointer();
  resetE2ELifecycleFixture(pointer.databasePath, fixture, 'client');
  resetE2ELifecycleFixture(pointer.databasePath, fixture, 'project');
  try {
    await signIn(page, 'owner');
    await page.goto(portal(`/projects/${fixture.project.id}`));
    await expect(page).toHaveURL(portal(`/projects/${fixture.project.id}`));
    const projectDetail = page.locator('[data-project-detail]');
    await expect(projectDetail).toBeVisible();
    await expect(projectDetail.getByRole('heading', { name: fixture.project.name })).toBeVisible();
    await expect(
      projectDetail.getByRole('button', { name: 'Edit project', exact: true }),
    ).toBeVisible();

    await projectDetail.getByRole('button', { name: 'Edit project', exact: true }).click();
    const edit = page.locator(
      `form[action="?/updateProject"]:has(input[name="projectId"][value="${fixture.project.id}"])`,
    );
    await expect(edit).toBeVisible();
    const editedName = `${fixture.project.name} · Edited`;
    await edit.locator('input[name="name"]').fill(editedName);
    await edit.locator('input[name="costCenterCode"]').fill(`E2E-${testInfo.project.name}`);
    await edit.getByRole('button', { name: /save|update/i }).click();
    await expect(projectDetail.getByRole('heading', { name: editedName })).toBeVisible();

    // Lifecycle controls intentionally live on the management list, while project configuration
    // edits live on the UUID-bound detail route above.
    await page.goto(portal('/projects'));
    const row = page.locator('article.project-list-link').filter({
      has: page.locator(`a[href$="/projects/${fixture.project.id}"]`),
    });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(editedName);
    await expect(row).toContainText(/active/i);

    const beginClose = row.locator(
      `form[action="?/transitionProject"]:has(input[name="projectId"][value="${fixture.project.id}"])`,
    );
    await submitLifecycleTransition(beginClose, 'E2E project close requested');
    await expect(row).toContainText(/closing/i);

    const close = row.locator(
      `form[action="?/transitionProject"]:has(input[name="projectId"][value="${fixture.project.id}"])`,
    );
    await submitLifecycleTransition(close, 'E2E project close completed');
    await expect(row).toContainText(/closed/i);

    const archive = row.locator(
      `form[action="?/transitionProject"]:has(input[name="projectId"][value="${fixture.project.id}"])`,
    );
    await submitLifecycleTransition(archive, 'E2E project lifecycle archive');
    await expect(row).toContainText(/archived/i);

    const restore = row.locator(
      `form[action="?/transitionProject"]:has(input[name="projectId"][value="${fixture.project.id}"])`,
    );
    await submitLifecycleTransition(restore, 'E2E project lifecycle restore');
    // Restore returns to the last safe pre-archive state (closed), not an invented active state.
    await expect(row).toContainText(/closed/i);
  } finally {
    resetE2ELifecycleFixture(pointer.databasePath, fixture, 'project');
    resetE2ELifecycleFixture(pointer.databasePath, fixture, 'client');
  }
});

test('owner archive/restore keeps the account lifecycle reversible and discoverable', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const teamRoute = portal('/projects?view=team');
  await page.goto(teamRoute);
  const target = page.locator('.record-card').filter({ hasText: e2eArchiveTarget.name });
  await expect(target).toBeVisible();
  const statusForm = target.locator('form[action="?/updateUserStatus"]');
  const updateStatusAction = await statusForm.evaluate((form) => (form as HTMLFormElement).action);

  try {
    await target.locator('summary.worker-manage-toggle').click();
    await expect(statusForm).toBeVisible();
    const status = target.getByLabel(`Status for ${e2eArchiveTarget.name}`);
    await expect(status).toHaveValue('active');
    await status.selectOption('archived');
    await target.getByRole('button', { name: 'Update status', exact: true }).click();
    await expect(target.getByLabel(`Status for ${e2eArchiveTarget.name}`)).toHaveValue('archived');

    // The current account contract uses the same authorized status form for restoration; there is
    // no separate stale "Restore" button. The record remains discoverable for owner management.
    // Form submissions reload the management list and close the details disclosure, so reopen the
    // bounded editor before selecting the restoration state.
    await target.locator('summary.worker-manage-toggle').click();
    await expect(statusForm).toBeVisible();
    await target.getByLabel(`Status for ${e2eArchiveTarget.name}`).selectOption('active');
    await target.getByRole('button', { name: 'Update status', exact: true }).click();
    await expect(target.getByLabel(`Status for ${e2eArchiveTarget.name}`)).toHaveValue('active');
  } finally {
    const restore = await page.request.post(updateStatusAction, {
      headers: { origin: new URL(page.url()).origin, referer: page.url() },
      form: { userId: e2eArchiveTarget.id, status: 'active' },
    });
    expect(restore.ok(), 'archive target cleanup/restore request').toBe(true);
  }
});
