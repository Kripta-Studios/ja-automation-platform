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

function yearFor(testInfo: { project: { name: string } }, offset: number): number {
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
  return 2100 + projectIndex * 3 + offset;
}

async function createPack(
  page: import('@playwright/test').Page,
  periodStart: string,
  periodEnd: string,
): Promise<{ id: string; row: import('@playwright/test').Locator }> {
  const fixture = readE2EFixturePointer();
  await page.goto(portal('/accounting'));
  await expect(
    page.getByRole('heading', { name: 'Monthly Accounting Pack', exact: true }),
  ).toBeVisible();
  const form = page.locator('form[action="?/createAccountingPack"]');
  await form.locator('input[name="periodStart"]').fill(periodStart);
  await form.locator('input[name="periodEnd"]').fill(periodEnd);
  await form.getByRole('button', { name: 'Generate pack' }).click();
  await expect(page.locator('p.action-message[role="status"]')).toBeVisible();
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
function runBackgroundArtifactWorker(): { processed: number; failed: number } {
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
    const result = runArtifactJobs({
      principal,
      documentRoot: fixture.documentRoot,
      repository: { createInvoiceDraft: () => undefined },
      v3,
    });
    return result;
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
  const year = yearFor(testInfo, 1);
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-01-31`;
  const { id, row } = await createPack(page, periodStart, periodEnd);

  const actionStatus = page.locator('p.action-message[role="status"]');
  await expect.soft(actionStatus).toContainText(/queued|generating|pending/i);
  await expect.soft(actionStatus).not.toContainText(/\bready\b/i);
  await expect.soft(row).toContainText(/draft|queued|pending|generating/i);
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
  const year = yearFor(testInfo, 2);
  const periodStart = `${year}-02-01`;
  const periodEnd = `${year}-02-28`;
  const { id } = await createPack(page, periodStart, periodEnd);

  const worker = runBackgroundArtifactWorker();
  expect(worker.failed, 'durable artifact worker should process the fixture pack').toBe(0);

  for (const type of ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'] as const) {
    const response = await runUntilPackTerminal(page, id, type, 200);
    expect(response.status(), `${type} download`).toBe(200);
    expect((await response.body()).byteLength, `${type} bytes`).toBeGreaterThan(0);
    expect(response.headers()['content-disposition']).toMatch(
      new RegExp(
        `filename="[^"]*${year}-02[^"]*\\.${type === 'invoice_csv' || type === 'expense_csv' ? 'csv' : type}"`,
      ),
    );
  }
});

test('terminal failed Accounting Pack formats expose retry metadata and never return HTTP 500', async ({
  page,
}, testInfo) => {
  await signIn(page, 'finance');
  const year = yearFor(testInfo, 3);
  const periodStart = `${year}-03-01`;
  const periodEnd = `${year}-03-31`;
  const { id, row } = await createPack(page, periodStart, periodEnd);
  const fixture = readE2EFixturePointer();

  // This is failure injection in the test-owned worker process; the preview server remains the
  // real download/API implementation. Five deterministic attempts drive the durable job to its
  // terminal retry limit without a user-facing "Run due jobs" click.
  const originalChromiumPath = process.env.JA_CHROMIUM_PATH;
  process.env.JA_CHROMIUM_PATH = `${fixture.documentRoot}/missing-chromium`;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      runBackgroundArtifactWorker();
      if (attempt < 4) {
        // The real runner applies a five-minute retry delay. Move only this disposable fixture's
        // retry timestamp back to the due boundary between attempts so terminal failure is
        // observed deterministically within one browser test.
        const database = createDatabase(fixture.databasePath);
        try {
          database.sqlite
            .prepare('UPDATE job SET run_after=? WHERE idempotency_key=?')
            .run(new Date(0).toISOString(), `accounting-pack:${id}`);
        } finally {
          database.sqlite.close();
        }
      }
    }
  } finally {
    if (originalChromiumPath === undefined) delete process.env.JA_CHROMIUM_PATH;
    else process.env.JA_CHROMIUM_PATH = originalChromiumPath;
  }

  const database = createDatabase(fixture.databasePath);
  try {
    const job = database.sqlite
      .prepare('SELECT state,attempts FROM job WHERE kind=? AND idempotency_key=?')
      .get('accounting_pack', `accounting-pack:${id}`) as
      | { state: string; attempts: number }
      | undefined;
    expect(job).toEqual({ state: 'failed', attempts: 5 });
    const failure = database.sqlite
      .prepare(
        'SELECT outcome,error_code,finished_at FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?) ORDER BY started_at DESC LIMIT 1',
      )
      .get(`accounting-pack:${id}`) as
      | { outcome: string; error_code: string | null; finished_at: string | null }
      | undefined;
    expect(failure?.outcome).toBe('failure');
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

type LifecycleEntity = 'client' | 'project';

type LifecycleJourney = {
  entity: LifecycleEntity;
  id: string;
  label: string;
  updatedLabel: string;
};

const lifecycleEntityScope = (page: import('@playwright/test').Page, journey: LifecycleJourney) =>
  journey.entity === 'project'
    ? // The project test asserts the exact UUID route before entering this helper.
      page.locator('.project-page')
    : page.locator(`[data-entity-id="${journey.id}"]`);

const lifecycleActionForm = (
  page: import('@playwright/test').Page,
  journey: LifecycleJourney,
  action: 'update' | 'archive' | 'restore' | 'close',
) =>
  page.locator(
    `form[action="?/${action}${journey.entity === 'client' ? 'Client' : 'Project'}"]:has(input[name="${journey.entity}Id"][value="${journey.id}"])`,
  );

/**
 * Keep the eventual client/project lifecycle journey executable in the test body. The current
 * portal has no update/archive/restore/close actions for either entity, so these soft assertions
 * produce product RED while the guarded interactions document the user-visible contract that must
 * become real (including the post-restore active state). Each state assertion stays inside the
 * entity's URL/data-entity-id-bound scope so another record's status cannot satisfy the journey.
 */
async function exerciseLifecycleJourney(
  page: import('@playwright/test').Page,
  journey: LifecycleJourney,
): Promise<void> {
  const entityScope = lifecycleEntityScope(page, journey);
  await expect
    .soft(entityScope, `${journey.entity} UUID-bound entity scope must be rendered`)
    .toHaveCount(1);
  await expect
    .soft(
      entityScope.getByText(journey.label, { exact: true }),
      `${journey.entity} must be user-visible within its UUID-bound scope`,
    )
    .toHaveCount(1);
  const updateForm = lifecycleActionForm(page, journey, 'update');
  await expect.soft(updateForm, `${journey.entity} edit form must be reachable`).toHaveCount(1);
  if (await updateForm.count()) {
    const nameInput = updateForm.locator(
      `input[name="${journey.entity === 'client' ? 'displayName' : 'name'}"]`,
    );
    await expect.soft(nameInput, `${journey.entity} edit field must be visible`).toHaveCount(1);
    if (await nameInput.count()) {
      await nameInput.fill(journey.updatedLabel);
      await updateForm.getByRole('button', { name: /save|update/i }).click();
      await expect
        .soft(lifecycleEntityScope(page, journey).getByText(journey.updatedLabel, { exact: true }))
        .toBeVisible();
    }
  }

  const archiveForm = lifecycleActionForm(page, journey, 'archive');
  await expect.soft(archiveForm, `${journey.entity} archive action must be visible`).toHaveCount(1);
  if (await archiveForm.count()) {
    await archiveForm.getByRole('button', { name: /archive/i }).click();
    const archivedScope = lifecycleEntityScope(page, journey);
    await expect
      .soft(archivedScope.getByText(journey.updatedLabel, { exact: true }))
      .toHaveCount(0);
    await expect
      .soft(
        archivedScope.getByText('archived', { exact: true }),
        `${journey.entity} UUID-bound archive state`,
      )
      .toHaveCount(1);
  }

  // The eventual restore journey must be user-visible; direct fixture cleanup is not a substitute.
  const restoreForm = lifecycleActionForm(page, journey, 'restore');
  await expect
    .soft(restoreForm, `${journey.entity} restore action must be reachable after archive`)
    .toHaveCount(1);
  if (await restoreForm.count()) {
    await restoreForm.getByRole('button', { name: /restore/i }).click();
    const restoredScope = lifecycleEntityScope(page, journey);
    await expect.soft(restoredScope.getByText(journey.updatedLabel, { exact: true })).toBeVisible();
    await expect
      .soft(
        restoredScope.getByText('active', { exact: true }),
        `${journey.entity} UUID-bound entity must return active after restore`,
      )
      .toBeVisible();
  }

  const closeForm = lifecycleActionForm(page, journey, 'close');
  await expect.soft(closeForm, `${journey.entity} close action must be visible`).toHaveCount(1);
  if (await closeForm.count()) {
    await closeForm.getByRole('button', { name: /close/i }).click();
    await expect
      .soft(
        lifecycleEntityScope(page, journey).getByText('closed', { exact: true }),
        `${journey.entity} UUID-bound close state`,
      )
      .toBeVisible();
  }
}

test('owner can edit/archive/restore/close the deterministic client fixture', async ({
  page,
}, testInfo) => {
  const fixture = e2eLifecycleFixturesFor(testInfo.project.name);
  const pointer = readE2EFixturePointer();
  resetE2ELifecycleFixture(pointer.databasePath, fixture, 'client');
  await signIn(page, 'owner');
  await page.goto(portal(`/projects?view=clients&focus=${fixture.client.id}`));
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();

  // This proves the fixture is in the real management data before the missing lifecycle controls
  // are asserted; a missing seed would be setup failure rather than a product regression.
  await expect(
    page.locator(
      `form[action="?/createProject"] select[name="clientId"] option[value="${fixture.client.id}"]`,
    ),
  ).toHaveCount(1);
  await exerciseLifecycleJourney(page, {
    entity: 'client',
    id: fixture.client.id,
    label: fixture.client.displayName,
    updatedLabel: `${fixture.client.displayName} · Edited`,
  });
});

test('owner can edit/archive/restore/close the deterministic project fixture', async ({
  page,
}, testInfo) => {
  const fixture = e2eLifecycleFixturesFor(testInfo.project.name);
  const pointer = readE2EFixturePointer();
  // The project row is anchored to this project's Client fixture. Reset both rows so a preceding
  // Client journey cannot leave the project page pointing at an archived/closed client.
  resetE2ELifecycleFixture(pointer.databasePath, fixture, 'client');
  resetE2ELifecycleFixture(pointer.databasePath, fixture, 'project');
  await signIn(page, 'owner');
  await page.goto(portal(`/projects/${fixture.project.id}`));
  await expect(page).toHaveURL(portal(`/projects/${fixture.project.id}`));
  const projectPage = page.locator('.project-page');
  await expect(projectPage).toBeVisible();
  await expect(projectPage.getByRole('heading', { name: fixture.project.name })).toBeVisible();
  await expect(projectPage.getByText('active', { exact: true })).toBeVisible();

  await exerciseLifecycleJourney(page, {
    entity: 'project',
    id: fixture.project.id,
    label: fixture.project.name,
    updatedLabel: `${fixture.project.name} · Edited`,
  });
});

test('owner archive/restore keeps the account lifecycle reversible and discoverable', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const teamRoute = portal('/projects?view=team');
  await page.goto(teamRoute);
  const target = page.locator('.record-card').filter({ hasText: e2eArchiveTarget.name });
  await expect(target).toBeVisible();
  const updateStatusAction = await target
    .locator('form[action="?/updateUserStatus"]')
    .evaluate((form) => (form as HTMLFormElement).action);

  try {
    await target.getByLabel(`Status for ${e2eArchiveTarget.name}`).selectOption('archived');
    await target.getByRole('button', { name: 'Save access', exact: true }).click();
    await expect(page.getByText(e2eArchiveTarget.name, { exact: true })).toHaveCount(0);
    const restoreButton = page.getByRole('button', { name: /restore/i });
    await expect.soft(restoreButton).toHaveCount(1);
    // Keep the full eventual journey in the test even while the current product is RED because
    // it does not render a restore control after archiving.
    if (await restoreButton.count()) {
      await restoreButton.first().click();
      const restored = page.locator('.record-card').filter({ hasText: e2eArchiveTarget.name });
      await expect(restored).toBeVisible();
      await expect(restored.getByLabel(`Status for ${e2eArchiveTarget.name}`)).toHaveValue(
        'active',
      );
    }
  } finally {
    const restore = await page.request.post(updateStatusAction, {
      headers: { origin: new URL(page.url()).origin, referer: page.url() },
      form: { userId: e2eArchiveTarget.id, status: 'active' },
    });
    expect(restore.ok(), 'archive target cleanup/restore request').toBe(true);
  }
});
