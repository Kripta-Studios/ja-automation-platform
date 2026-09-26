import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-project-detail');
const today = new Date().toISOString().slice(0, 10);

function seedProject(viewport: string, scenario: 'owner' | 'manager') {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Project detail warning ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-PROJECT-DETAIL', scenario === 'owner' ? 83 : 84, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
      projectManagerId: userId(e2eCredentials.manager.email),
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
        reason: 'Activate disposable project-detail QA project',
      });
    repository.assignWorker(owner, {
      projectId,
      workerId: userId(e2eCredentials.worker.email),
      startsOn: today,
    });
    const milestoneIds = ['success', 'stale'].map(
      (kind) =>
        repository.createProjectMilestone(owner, {
          projectId,
          name: `Disposable ${kind} milestone`,
          amountMinor: 12_000n,
          dueOn: today,
        }).id,
    );
    return {
      databasePath,
      projectId,
      successMilestoneId: milestoneIds[0]!,
      staleMilestoneId: milestoneIds[1]!,
    };
  } finally {
    db.sqlite.close();
  }
}

function bumpVersion(databasePath: string, table: 'project' | 'project_milestone', id: string) {
  const db = createDatabase(databasePath);
  try {
    db.sqlite.prepare(`UPDATE ${table} SET version=version+1 WHERE id=?`).run(id);
  } finally {
    db.sqlite.close();
  }
}

function milestoneState(databasePath: string, id: string): string {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite.prepare('SELECT approval_state FROM project_milestone WHERE id=?').get(id) as {
        approval_state: string;
      }
    ).approval_state;
  } finally {
    db.sqlite.close();
  }
}

function milestoneVersion(databasePath: string, id: string): string {
  const db = createDatabase(databasePath);
  try {
    return String(
      (
        db.sqlite.prepare('SELECT version FROM project_milestone WHERE id=?').get(id) as {
          version: number;
        }
      ).version,
    );
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
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

async function nativeSubmit(page: Page, action: string): Promise<number> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await page
    .locator(`form[action*="?/${action}"]`)
    .first()
    .evaluate((form: HTMLFormElement) => form.submit());
  return (await responsePromise).status();
}

async function writeEvidence(
  page: Page,
  name: string,
  diagnostic: ReturnType<typeof diagnosticsFor>,
  steps: Array<Record<string, string | number | boolean>>,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${name}.png`),
    await page.locator('[data-project-problem] [data-ui="problem-notice"]').first().screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-network.json`),
    `${JSON.stringify([...new Set(diagnostic.responses.map((r) => `${r.status} ${r.path}`))].sort(), null, 2)}\n`,
  );
  expect(diagnostic.pageErrors).toEqual([]);
  expect(
    diagnostic.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
}

test('owner project edit and commercial terms retain native failures', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const fixture = seedProject(info.project.name, 'owner');
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const diagnostic = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'owner');
  const projectUrl = portal(`/projects/${fixture.projectId}?tab=billing&lang=${locale}`);
  await page.goto(projectUrl);

  const personForm = page.locator('form[action*="?/savePersonTerms"]').first();
  await expect(personForm).toHaveCount(1);
  await personForm.locator('[name="customerHourlyRate"]').evaluate((control: HTMLInputElement) => {
    control.value = 'invalid-rate';
  });
  expect(await nativeSubmit(page, 'savePersonTerms')).toBe(400);
  let notice = page.locator('[data-project-problem] [data-ui="problem-notice"]').first();
  await expect(notice).toHaveAttribute('data-problem-code', 'PROJECT_PERSON_TERMS_INVALID');
  await expect(page.getByRole('tab', { name: /Billing|Faturamento|Facturación/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page
      .locator('form[action*="?/savePersonTerms"]')
      .first()
      .locator('[name="customerHourlyRate"]'),
  ).toHaveValue('invalid-rate');
  await expect(notice).toBeFocused();
  steps.push({
    step: 'person-invalid-native',
    code: 'PROJECT_PERSON_TERMS_INVALID',
    retained: true,
  });

  await page.goto(projectUrl);
  const setupForm = page.locator('form[action*="?/saveBillingSetup"]');
  await expect(setupForm).toBeVisible();
  await setupForm.locator('[name="paymentTermsDays"]').evaluate((control: HTMLInputElement) => {
    control.value = '999';
  });
  expect(await nativeSubmit(page, 'saveBillingSetup')).toBe(400);
  notice = page.locator('[data-project-problem] [data-ui="problem-notice"]').first();
  await expect(notice).toHaveAttribute('data-problem-code', 'PROJECT_BILLING_SETUP_INVALID');
  await expect(page.getByRole('tab', { name: /Billing|Faturamento|Facturación/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel(/Payment terms|Condições de pagamento/i)).toHaveValue('999');
  if (locale === 'pt')
    await expect(page.locator('#billing-setup-paymentTermsDays-error')).toContainText(
      'O prazo de pagamento deve ser de 0 a 365 dias.',
    );
  await expect(notice).toBeFocused();
  steps.push({
    step: 'billing-invalid-native',
    code: 'PROJECT_BILLING_SETUP_INVALID',
    retained: true,
  });

  await page.goto(portal(`/projects/${fixture.projectId}?tab=overview&lang=${locale}`));
  await page.locator('[data-project-edit-cta]').click();
  const sheet = page.locator('.project-edit-sheet');
  const editForm = sheet.locator('form[action*="?/updateProject"]');
  await expect(editForm).toBeVisible();
  await editForm.locator('[name="name"]').evaluate((control: HTMLInputElement) => {
    control.value = 'Retained project edit after stale save';
  });
  bumpVersion(fixture.databasePath, 'project', fixture.projectId);
  const sheetScroll = await sheet.locator('.responsive-sheet-body').evaluate((body) => {
    body.scrollTop = Math.min(420, body.scrollHeight - body.clientHeight);
    return body.scrollTop;
  });
  expect(sheetScroll).toBeGreaterThan(100);
  expect(await nativeSubmit(page, 'updateProject')).toBe(409);
  notice = sheet.locator('[data-project-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'PROJECT_DETAIL_CHANGED');
  await expect(sheet).toBeVisible();
  await expect(editForm.locator('[name="name"]')).toHaveValue(
    'Retained project edit after stale save',
  );
  await expect(notice).toBeFocused();
  expect(
    Math.abs(
      (await sheet.locator('.responsive-sheet-body').evaluate((body) => body.scrollTop)) -
        sheetScroll,
    ),
  ).toBeLessThan(12);
  steps.push({
    step: 'project-stale-native',
    code: 'PROJECT_DETAIL_CHANGED',
    retained: true,
    sheetScroll,
  });
  await writeEvidence(page, `owner-${info.project.name}-${locale}`, diagnostic, steps);
});

test('manager milestone success, stale conflict, and worker role denial', async ({
  page,
  browser,
}: {
  page: Page;
  browser: Browser;
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const fixture = seedProject(info.project.name, 'manager');
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const diagnostic = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'manager');
  await page.goto(portal(`/projects/${fixture.projectId}?tab=overview&lang=${locale}`));
  const successForm = page.locator(
    `.compact-record:has(input[name="id"][value="${fixture.successMilestoneId}"]) form`,
  );
  await expect(successForm).toBeVisible();
  await successForm.getByRole('button').click();
  await expect
    .poll(() => milestoneState(fixture.databasePath, fixture.successMilestoneId))
    .toBe('submitted');
  steps.push({ step: 'milestone-success', state: 'submitted' });

  const staleForm = page.locator(
    `.compact-record:has(input[name="id"][value="${fixture.staleMilestoneId}"]) form`,
  );
  await expect(staleForm).toBeVisible();
  bumpVersion(fixture.databasePath, 'project_milestone', fixture.staleMilestoneId);
  // Playwright scrolls an offscreen button into view before clicking it. Measure
  // after that positioning so the comparison uses the actual submit location.
  await staleForm.getByRole('button').scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/submitMilestone'),
  );
  await staleForm.getByRole('button').click();
  expect((await responsePromise).status()).toBe(200);
  const notice = page.locator('[data-project-problem] [data-ui="problem-notice"]').first();
  await expect(notice).toHaveAttribute('data-problem-code', 'PROJECT_MILESTONE_CHANGED');
  await expect(notice).toBeFocused();
  await expect(page.getByRole('tab', { name: /Overview|Resumen|Visão geral/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(12);
  steps.push({
    step: 'milestone-stale-enhanced',
    code: 'PROJECT_MILESTONE_CHANGED',
    retained: true,
  });
  const workerPage = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(workerPage, 'worker');
    await workerPage.goto(portal(`/projects/${fixture.projectId}?tab=overview&lang=${locale}`));
    await expect(
      workerPage.getByRole('tab', { name: /Billing|Faturamento|Facturación/i }),
    ).toHaveCount(0);
    const denied = await workerPage.evaluate(
      async ({ id, version }) => {
        const body = new FormData();
        body.set('id', id);
        body.set('version', version);
        const response = await fetch('?/submitMilestone&tab=overview', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body,
        });
        const result = (await response.json()) as {
          type?: string;
          status?: number;
          data?: unknown;
        };
        return { status: response.status, result };
      },
      {
        id: fixture.staleMilestoneId,
        version: milestoneVersion(fixture.databasePath, fixture.staleMilestoneId),
      },
    );
    expect(denied.result.type).toBe('failure');
    expect(denied.result.status).toBe(403);
    expect(JSON.stringify(denied.result.data)).toContain('PROJECT_MILESTONE_ROLE_REQUIRED');
    expect(JSON.stringify(denied.result.data)).toContain('contact_owner');
    steps.push({ step: 'worker-role-denied', code: 'PROJECT_MILESTONE_ROLE_REQUIRED' });
  } finally {
    await workerPage.close();
  }
  await writeEvidence(page, `manager-${info.project.name}-${locale}`, diagnostic, steps);
});
