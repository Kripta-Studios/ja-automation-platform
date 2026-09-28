import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';
import { e2eCostCenter } from './project-cost-center.js';

function databaseValue<T>(sql: string, id: string): T {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return database.sqlite.prepare(sql).get(id) as T;
  } finally {
    database.sqlite.close();
  }
}

function seedActiveProject(viewport: string, instance: number) {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const ownerId = (
      database.sqlite
        .prepare('SELECT id FROM user WHERE email=?')
        .get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(ownerId);
    const name = `Lifecycle warning ${randomUUID()}`;
    const id = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name,
      costCenterCode: e2eCostCenter('QA-LIFECYCLE-WARN', 95, viewport, instance),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-09-01',
    }).id;
    const project = database.sqlite.prepare('SELECT status FROM project WHERE id=?').get(id) as {
      status: string;
    };
    if (project.status !== 'active') {
      repository.transitionProject(owner, {
        projectId: id,
        status: 'active',
        reason: 'Activate disposable lifecycle-warning project',
      });
    }
    return { id, name };
  } finally {
    database.sqlite.close();
  }
}

function projectStatus(id: string): string {
  return databaseValue<{ status: string }>('SELECT status FROM project WHERE id=?', id).status;
}

function timeState(id: string): string {
  return databaseValue<{ approval_state: string }>(
    'SELECT approval_state FROM time_entry WHERE id=?',
    id,
  ).approval_state;
}

async function expectWarningFits(page: Page, warning: Locator) {
  await expect(warning).toBeVisible();
  const bounds = await warning.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport!.width + 1,
  );
}

async function projectRow(page: Page, name: string) {
  const register = page.locator('#project-register');
  await expect(register).toBeVisible();
  const search = register.getByRole('searchbox').first();
  await search.fill(name);
  const row = register.locator('.project-list-link').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.locator('.project-row-actions summary').click();
  return row;
}

for (const scenario of [
  { viewport: 'phone-390', role: 'owner', locale: 'es', instance: 1 },
  { viewport: 'desktop', role: 'finance', locale: 'en', instance: 2 },
  { viewport: 'desktop', role: 'owner', locale: 'pt', instance: 3 },
] as const) {
  test(`${scenario.role} sees localized project Begin close and Close warnings, then submits at ${scenario.viewport} (${scenario.locale})`, async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== scenario.viewport);
    test.setTimeout(120_000);
    const fixture = seedActiveProject(info.project.name, scenario.instance);
    const posts: string[] = [];
    await signIn(page, scenario.role);
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('?/transitionProject'))
        posts.push(request.url());
    });
    await page.goto(portal(`/projects?lang=${scenario.locale}`));
    let row = await projectRow(page, fixture.name);
    const begin = row.locator('form[data-action="transitionProject"]').filter({
      has: page.locator('input[name="status"][value="closing"]'),
    });
    const warning = begin.locator('[data-problem-code="WARNING_PROJECT_LIFECYCLE_ASSIGNMENTS"]');
    await expectWarningFits(page, warning);
    await expect(warning).toHaveAttribute('data-kind', 'warning');
    await expect(warning).toContainText(fixture.name);
    await expect(warning).toContainText(
      scenario.locale === 'en'
        ? 'Closing'
        : scenario.locale === 'es'
          ? 'En cierre'
          : 'Em encerramento',
    );
    const projectLink = warning.locator('a[href$="' + fixture.id + '"]');
    await expect(projectLink).toBeVisible();
    const assignmentLink = warning.locator('a').last();
    await expect(assignmentLink).toHaveAttribute('href', /\/app\/projects(?:\?|#)/);
    const remedyPage = await context.newPage();
    const remedyResponse = await remedyPage.goto(
      new URL((await projectLink.getAttribute('href'))!, portal('/')).toString(),
    );
    expect(remedyResponse?.status()).toBe(200);
    await expect(remedyPage.locator('[data-project-detail]')).toBeVisible();
    const assignmentResponse = await remedyPage.goto(
      new URL((await assignmentLink.getAttribute('href'))!, portal('/')).toString(),
    );
    expect(assignmentResponse?.status()).toBe(200);
    await expect(remedyPage.locator('main')).toBeVisible();
    await expect(remedyPage.getByRole('heading', { name: 'Access restricted' })).toHaveCount(0);
    await remedyPage.close();
    expect(posts).toEqual([]);
    expect(projectStatus(fixture.id)).toBe('active');

    await begin.locator('input[name="reason"]').fill('Disposable browser lifecycle check');
    const beginResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/transitionProject'),
    );
    await begin
      .getByRole('button', { name: /Begin close|Iniciar cierre|Iniciar encerramento/i })
      .click();
    expect((await beginResponse).status()).toBeLessThan(400);
    await expect.poll(() => projectStatus(fixture.id)).toBe('closing');

    await page.goto(portal(`/projects?lang=${scenario.locale}`));
    row = await projectRow(page, fixture.name);
    const close = row.locator('form[data-action="transitionProject"]').filter({
      has: page.locator('input[name="status"][value="closed"]'),
    });
    const closeWarning = close.locator(
      '[data-problem-code="WARNING_PROJECT_LIFECYCLE_ASSIGNMENTS"]',
    );
    await expectWarningFits(page, closeWarning);
    await expect(closeWarning).toContainText(fixture.name);
    await expect(closeWarning).toContainText(
      scenario.locale === 'en' ? 'Closed' : scenario.locale === 'es' ? 'Cerrado' : 'Fechado',
    );
    await expect(closeWarning.locator('a[href$="' + fixture.id + '"]')).toBeVisible();
    expect(projectStatus(fixture.id)).toBe('closing');
    expect(posts).toHaveLength(1);
    await close.locator('input[name="reason"]').fill('Finish disposable browser lifecycle check');
    const closeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/transitionProject'),
    );
    await close
      .getByRole('button', { name: /Close project|Cerrar proyecto|Encerrar projeto/i })
      .click();
    expect((await closeResponse).status()).toBeLessThan(400);
    await expect.poll(() => projectStatus(fixture.id)).toBe('closed');
    expect(posts).toHaveLength(2);
  });
}

async function createSupplierDraft(
  page: Page,
  projectId: string,
  locale: string,
  date: string,
  marker: string,
) {
  await page.goto(
    portal(
      `/supplier?projectId=${projectId}&from=2026-09-01&to=2026-09-30&workspaceAction=time&lang=${locale}`,
    ),
  );
  const form = page.locator('form[data-supplier-operation="createTimeBatch"]');
  await expect(form).toBeVisible();
  await form.locator('.batch-technician input[type="checkbox"]').first().check();
  await form.locator('[name="workDate"]').fill(date);
  await form.locator('[name="durationHours"]').fill('1');
  await form.locator('[name="summary"]').fill(marker);
  const response = page.waitForResponse(
    (result) => result.request().method() === 'POST' && result.url().includes('?/createTimeBatch'),
  );
  await form.locator('button.primary-button').click();
  expect((await response).status()).toBeLessThan(400);
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const row = database.sqlite
      .prepare('SELECT id FROM time_entry WHERE activity_summary=?')
      .get(marker) as { id: string } | undefined;
    expect(row).toBeDefined();
    return row!.id;
  } finally {
    database.sqlite.close();
  }
}

for (const scenario of [
  { viewport: 'phone-390', locale: 'es' },
  { viewport: 'desktop', locale: 'pt' },
] as const) {
  test(`Supplier Coordinator reviews single and batch draft consequences before explicit submission at ${scenario.viewport} (${scenario.locale})`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== scenario.viewport);
    test.setTimeout(150_000);
    const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
    await signInManualPersona(page, 'supplierCoordinator');
    const ids: string[] = [];
    for (const [index, date] of ['2026-09-22', '2026-09-23', '2026-09-24'].entries()) {
      ids.push(
        await createSupplierDraft(
          page,
          projectId,
          scenario.locale,
          date,
          `Supplier warning ${randomUUID()} ${index}`,
        ),
      );
    }
    await page.goto(
      portal(
        `/supplier?projectId=${projectId}&from=2026-09-01&to=2026-09-30&workspaceAction=report&lang=${scenario.locale}`,
      ),
    );
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    const single = page.locator('form[data-supplier-operation="submitTime"]').filter({
      has: page.locator(`input[name="id"][value="${ids[0]}"]`),
    });
    const singleWarning = single.locator('[data-problem-code="WARNING_SUPPLIER_TIME_SUBMISSION"]');
    await expectWarningFits(page, singleWarning);
    await expect(singleWarning).toContainText('2026-09-22');
    await expect(singleWarning).toContainText(scenario.locale === 'es' ? 'corrección' : 'correção');
    await expect(singleWarning.locator('a')).toHaveAttribute('href', '#supplier-report');
    expect(ids.map(timeState)).toEqual(['draft', 'draft', 'draft']);
    expect(posts).toEqual([]);
    const singleResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/submitTime&'),
    );
    await single.locator('button.primary-button').click();
    expect((await singleResponse).status()).toBeLessThan(400);
    await expect.poll(() => timeState(ids[0]!)).toBe('submitted');

    await page.goto(
      portal(
        `/supplier?projectId=${projectId}&from=2026-09-01&to=2026-09-30&workspaceAction=report&lang=${scenario.locale}`,
      ),
    );
    const batch = page.locator('form[data-supplier-operation="submitTimeBatch"]');
    for (const id of ids.slice(1)) {
      await page
        .locator('article')
        .filter({
          has: page.locator(
            `form[data-supplier-operation="submitTime"] input[name="id"][value="${id}"]`,
          ),
        })
        .locator('.draft-selector input[type="checkbox"]')
        .check();
    }
    const batchWarning = batch.locator(
      '[data-problem-code="WARNING_SUPPLIER_TIME_BATCH_SUBMISSION"]',
    );
    await expectWarningFits(page, batchWarning);
    await expect(batchWarning).toContainText('2');
    await expect(batchWarning).toContainText('2026-09-23');
    await expect(batchWarning).toContainText('2026-09-24');
    await expect(batchWarning.locator('a')).toHaveAttribute('href', '#supplier-report');
    const selected = JSON.parse(
      await batch.locator('input[name="entries"]').inputValue(),
    ) as Array<{ id: string; version: number }>;
    expect(selected.map((entry) => entry.id).sort()).toEqual(ids.slice(1).sort());
    expect(ids.slice(1).map(timeState)).toEqual(['draft', 'draft']);
    expect(posts).toHaveLength(1);
    const batchResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/submitTimeBatch'),
    );
    await batch.locator('button.primary-button').click();
    expect((await batchResponse).status()).toBeLessThan(400);
    await expect.poll(() => ids.map(timeState)).toEqual(['submitted', 'submitted', 'submitted']);
    expect(posts).toHaveLength(2);
  });
}
