import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-workforce-planning');
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

function seedProject(viewport: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const idFor = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(idFor(e2eCredentials.owner.email));
    const managerId = idFor(e2eCredentials.manager.email);
    const workerId = idFor(e2eCredentials.worker.email);
    const worker2Id = idFor(e2eCredentials.worker2.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Workforce warning ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-WORKFORCE-WARN', 88, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
      projectManagerId: managerId,
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
        reason: 'Activate disposable workforce warning project',
      });
    for (const memberId of [managerId, workerId]) {
      const exists = db.sqlite
        .prepare('SELECT 1 FROM project_member WHERE project_id=? AND user_id=?')
        .get(projectId, memberId);
      if (!exists)
        repository.assignWorker(owner, { projectId, workerId: memberId, startsOn: today });
    }
    return { databasePath, projectId, managerId, workerId, worker2Id };
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
  const errors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.request().method() === 'POST')
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { errors, responses };
}

async function nativeSubmit(page: Page, selector: string, action: string): Promise<number> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await page.locator(selector).evaluate((form: HTMLFormElement) => form.submit());
  return (await responsePromise).status();
}

async function saveEvidence(
  page: Page,
  prefix: string,
  noticeSelector: string,
  diagnostics: ReturnType<typeof diagnosticsFor>,
  steps: Array<Record<string, string | number | boolean>>,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${prefix}.png`),
    await page.locator(noticeSelector).screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `${prefix}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${prefix}-network.json`),
    `${JSON.stringify(diagnostics.responses, null, 2)}\n`,
  );
  expect(diagnostics.errors).toEqual([]);
}

async function fillPlan(page: Page, projectId: string, workerId: string, date: string) {
  const form = page.locator('form[data-workforce-operation="createPlanning"]');
  await expect(form).toBeVisible();
  await form.locator('[name="projectId"]').selectOption(projectId);
  await form.locator('[name="workerId"]').selectOption(workerId);
  await form.locator('[name="startsAt"]').fill(`${date}T08:00`);
  await form.locator('[name="endsAt"]').fill(`${date}T16:00`);
  await form.getByLabel(/Planned hours|Horas planificadas|Horas planejadas/i).fill('8');
  await form.locator('[name="site"]').fill('Retained QA site');
  return form;
}

async function openCreateSkill(page: Page) {
  await page.locator('#planning-skills > details.ui-disclosure > summary').click();
  await page.locator('#planning-skills details.admin-details').first().locator('summary').click();
}

test('manager planning retains invalid and changed-overlap entries with role-safe denial', async ({
  page,
  browser,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const fixture = seedProject(info.project.name);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const planDay = (offset: number) => day(offset + (info.project.name === 'desktop' ? 30 : 0));
  const diagnostics = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'manager');
  const url = portal(`/planning?project=${fixture.projectId}&lang=${locale}`);
  await page.goto(url);
  let form = await fillPlan(page, fixture.projectId, fixture.workerId, planDay(4));
  await form.locator('[name="plannedMinutes"]').evaluate((control: HTMLInputElement) => {
    control.value = '0';
  });
  await form.scrollIntoViewIfNeeded();
  const invalidScroll = await page.evaluate(() => window.scrollY);
  expect(
    await nativeSubmit(page, 'form[data-workforce-operation="createPlanning"]', 'createPlanning'),
  ).toBe(400);
  let notice = page.locator('#planning-create-form [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'ACTION_VALIDATION_PLANNING_FIELDS');
  form = page.locator('form[data-workforce-operation="createPlanning"]');
  await expect(form.locator('[name="site"]')).toHaveValue('Retained QA site');
  await expect(form.locator('[name="workerId"]')).toHaveValue(fixture.workerId);
  await expect(form.locator('input[inputmode="decimal"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[data-field-error-for]')).toHaveCount(1);
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  expect
    .soft(Math.abs((await page.evaluate(() => window.scrollY)) - invalidScroll))
    .toBeLessThan(12);
  steps.push({
    step: 'planning-invalid-native',
    code: 'ACTION_VALIDATION_PLANNING_FIELDS',
    retained: true,
  });

  await page.goto(url);
  form = await fillPlan(page, fixture.projectId, fixture.workerId, planDay(5));
  const successForm = await form.evaluate((element: HTMLFormElement) => {
    const data = new FormData(element);
    return {
      valid: element.checkValidity(),
      startsAt: String(data.get('startsAt') ?? ''),
      endsAt: String(data.get('endsAt') ?? ''),
      plannedMinutes: String(data.get('plannedMinutes') ?? ''),
      workerSelected: Boolean(data.get('workerId')),
    };
  });
  const successResponsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createPlanning'),
      { timeout: 5_000 },
    )
    .catch(() => null);
  await form.locator('button').last().click();
  const successResponse = await successResponsePromise;
  const db = createDatabase(fixture.databasePath);
  try {
    const saved = db.sqlite
      .prepare('SELECT starts_at startsAt,site FROM planning_assignment WHERE project_id=?')
      .all(fixture.projectId) as Array<{ startsAt: string; site: string }>;
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(
      join(evidenceDirectory, `planning-${info.project.name}-success-diagnostic.json`),
      `${JSON.stringify({ form: successForm, responseStatus: successResponse?.status() ?? null, saved }, null, 2)}\n`,
    );
    await expect
      .poll(() =>
        db.sqlite
          .prepare('SELECT count(*) n FROM planning_assignment WHERE project_id=? AND starts_at=?')
          .get(fixture.projectId, `${planDay(5)}T08:00:00.000Z`),
      )
      .toEqual({ n: 1 });
  } finally {
    db.sqlite.close();
  }
  steps.push({ step: 'planning-success', saved: true });

  await page.goto(url);
  form = await fillPlan(page, fixture.projectId, fixture.workerId, planDay(6));
  const competitor = createDatabase(fixture.databasePath);
  try {
    const repository = new PortalRepository(competitor.sqlite);
    repository.createPlanningAssignment(repository.principalFor(fixture.managerId), {
      projectId: fixture.projectId,
      workerId: fixture.workerId,
      startsAt: `${planDay(6)}T08:00:00.000Z`,
      endsAt: `${planDay(6)}T16:00:00.000Z`,
      plannedMinutes: 480,
    });
  } finally {
    competitor.sqlite.close();
  }
  await form.scrollIntoViewIfNeeded();
  const conflictScroll = await page.evaluate(() => window.scrollY);
  expect(
    await nativeSubmit(page, 'form[data-workforce-operation="createPlanning"]', 'createPlanning'),
  ).toBe(409);
  notice = page.locator('#planning-create-form [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'PLANNING_WORKER_OVERLAP');
  await expect(
    page.locator('form[data-workforce-operation="createPlanning"] [name="workerId"]'),
  ).toHaveValue(fixture.workerId);
  await expect(
    page.locator('form[data-workforce-operation="createPlanning"] [name="site"]'),
  ).toHaveValue('Retained QA site');
  await expect(page.locator('#planning-create-form [data-validation-summary]')).toBeFocused();
  const conflictScrollAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(conflictScrollAfter - conflictScroll)).toBeLessThan(12);
  steps.push({
    step: 'planning-overlap-native',
    code: 'PLANNING_WORKER_OVERLAP',
    retained: true,
    scrollBefore: conflictScroll,
    scrollAfter: conflictScrollAfter,
  });

  const denied = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(denied, 'worker');
    await denied.goto(portal('/planning?lang=en'));
    await expect(denied.locator('form[data-workforce-operation="createPlanning"]')).toHaveCount(0);
    const response = await denied.evaluate(
      async ({ projectId, workerId, date }) => {
        const result = await fetch('?/createPlanning', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({
            projectId,
            workerId,
            startsAt: `${date}T08:00`,
            endsAt: `${date}T16:00`,
            plannedMinutes: '480',
          }),
        });
        return { http: result.status, body: await result.json() };
      },
      { projectId: fixture.projectId, workerId: fixture.workerId, date: planDay(7) },
    );
    expect(JSON.stringify(response.body)).toContain('PLANNING_ACCESS_REQUIRED');
    expect(JSON.stringify(response.body)).toContain('contact_project_owner');
    diagnostics.responses.push({ status: response.http, path: '/j-aautomation/app/planning' });
    steps.push({ step: 'worker-role-denied', code: 'PLANNING_ACCESS_REQUIRED' });
  } finally {
    await denied.close();
  }
  await saveEvidence(
    page,
    `planning-${info.project.name}-${locale}`,
    '#planning-create-form [data-ui="problem-notice"]',
    diagnostics,
    steps,
  );
});

test('owner skill catalog retains invalid and duplicate code with manager denial', async ({
  page,
  browser,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const diagnostics = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'owner');
  const url = portal(`/planning?lang=${locale}`);
  await page.goto(url);
  await openCreateSkill(page);
  let form = page.locator('form[data-workforce-operation="createSkill"]');
  await form.locator('[name="code"]').fill('X');
  await form.locator('[name="name"]').fill('Retained skill name');
  await form.scrollIntoViewIfNeeded();
  expect(
    await nativeSubmit(page, 'form[data-workforce-operation="createSkill"]', 'createSkill'),
  ).toBe(400);
  let notice = page.locator('#planning-skills [data-ui="problem-notice"]').first();
  await expect(notice).toHaveAttribute('data-problem-code', 'ACTION_VALIDATION_SKILL_FIELDS');
  form = page.locator('form[data-workforce-operation="createSkill"]');
  await expect(form.locator('[name="name"]')).toHaveValue('Retained skill name');
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  steps.push({
    step: 'skill-invalid-native',
    code: 'ACTION_VALIDATION_SKILL_FIELDS',
    retained: true,
  });

  const successCode = `QAS${randomUUID().slice(0, 8)}`.toUpperCase();
  await page.goto(url);
  await openCreateSkill(page);
  form = page.locator('form[data-workforce-operation="createSkill"]');
  await form.locator('[name="code"]').fill(successCode);
  await form.locator('[name="name"]').fill('Saved browser expertise');
  await form.locator('button').click();
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    await expect
      .poll(() => db.sqlite.prepare('SELECT name FROM skill WHERE code=?').get(successCode))
      .toEqual({ name: 'Saved browser expertise' });
  } finally {
    db.sqlite.close();
  }
  steps.push({ step: 'skill-success', saved: true });

  const duplicateCode = `QAD${randomUUID().slice(0, 8)}`.toUpperCase();
  await page.goto(url);
  await openCreateSkill(page);
  form = page.locator('form[data-workforce-operation="createSkill"]');
  await form.locator('[name="code"]').fill(duplicateCode);
  await form.locator('[name="name"]').fill('Retained duplicate expertise');
  const competitor = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const ownerId = (
      competitor.sqlite
        .prepare('SELECT id FROM user WHERE email=?')
        .get(e2eCredentials.owner.email) as { id: string }
    ).id;
    const repository = new PortalRepository(competitor.sqlite);
    repository.createSkill(repository.principalFor(ownerId), {
      code: duplicateCode,
      name: 'Concurrent expertise',
    });
  } finally {
    competitor.sqlite.close();
  }
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(
    await nativeSubmit(page, 'form[data-workforce-operation="createSkill"]', 'createSkill'),
  ).toBe(409);
  notice = page.locator('#planning-skills [data-ui="problem-notice"]').first();
  await expect(notice).toHaveAttribute('data-problem-code', 'SKILL_CODE_EXISTS');
  form = page.locator('form[data-workforce-operation="createSkill"]');
  await expect(form.locator('[name="code"]')).toHaveValue(duplicateCode);
  await expect(form.locator('[name="name"]')).toHaveValue('Retained duplicate expertise');
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
  steps.push({
    step: 'skill-duplicate-native',
    code: 'SKILL_CODE_EXISTS',
    retained: true,
    scrollBefore,
    scrollAfter,
  });

  const denied = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(denied, 'manager');
    await denied.goto(portal('/planning?lang=en'));
    await expect(denied.locator('form[data-workforce-operation="createSkill"]')).toHaveCount(0);
    const response = await denied.evaluate(
      async (code) => {
        const result = await fetch('?/createSkill', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({ code, name: 'Unauthorized skill' }),
        });
        return { http: result.status, body: await result.json() };
      },
      `QAX${randomUUID().slice(0, 8)}`.toUpperCase(),
    );
    expect(JSON.stringify(response.body)).toContain('SKILL_ADMIN_ACCESS_REQUIRED');
    diagnostics.responses.push({ status: response.http, path: '/j-aautomation/app/planning' });
    steps.push({ step: 'manager-role-denied', code: 'SKILL_ADMIN_ACCESS_REQUIRED' });
  } finally {
    await denied.close();
  }
  await saveEvidence(
    page,
    `skill-${info.project.name}-${locale}`,
    '#planning-skills [data-ui="problem-notice"]',
    diagnostics,
    steps,
  );
});

test('worker availability sheet retains invalid and stale edits with ownership denial', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const diagnostics = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  const databasePath = readE2EFixturePointer().databasePath;
  const setup = createDatabase(databasePath);
  let workerId = '';
  let worker2Id = '';
  let staleId = '';
  try {
    const idFor = (email: string) =>
      (setup.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    workerId = idFor(e2eCredentials.worker.email);
    worker2Id = idFor(e2eCredentials.worker2.email);
    const repository = new PortalRepository(setup.sqlite);
    staleId = repository.setWorkerAvailability(repository.principalFor(workerId), {
      workerId,
      startsAt: `${today}T08:00:00.000Z`,
      endsAt: `${today}T10:00:00.000Z`,
      availability: 'tentative',
      note: 'Original editable availability',
    }).id;
  } finally {
    setup.sqlite.close();
  }
  await signIn(page, 'worker');
  const url = portal(`/profile?lang=${locale}`);
  await page.goto(url);
  await page
    .locator('[data-availability-calendar]')
    .getByRole('button', { name: /Add availability|Adicionar disponibilidade/i })
    .click();
  let dialog = page.getByRole('dialog');
  let form = dialog.locator('form.availability-editor');
  await form.locator('input[type="datetime-local"][name="startsAt"]').fill(`${day(3)}T08:00`);
  await form.locator('input[type="datetime-local"][name="endsAt"]').fill(`${day(3)}T16:00`);
  await form.locator('[name="availability"]').selectOption('unavailable');
  await form.locator('[name="note"]').fill('Saved availability from browser');
  await form.locator('button').last().click();
  await expect(dialog).toBeHidden();
  steps.push({ step: 'availability-success-enhanced', saved: true });

  await page
    .locator('[data-availability-calendar]')
    .getByRole('button', { name: /Add availability|Adicionar disponibilidade/i })
    .click();
  dialog = page.getByRole('dialog');
  form = dialog.locator('form.availability-editor');
  await form.locator('input[type="datetime-local"][name="startsAt"]').fill(`${day(4)}T12:00`);
  await form.locator('input[type="datetime-local"][name="endsAt"]').fill(`${day(4)}T11:00`);
  await form.locator('[name="note"]').fill('Retained invalid availability note');
  expect(await nativeSubmit(page, 'form.availability-editor', 'setAvailability')).toBe(400);
  dialog = page.getByRole('dialog');
  form = dialog.locator('form.availability-editor');
  let notice = dialog.locator('[data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute(
    'data-problem-code',
    'ACTION_VALIDATION_AVAILABILITY_FIELDS',
  );
  await expect(form.locator('[name="note"]')).toHaveValue('Retained invalid availability note');
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  steps.push({
    step: 'availability-invalid-native',
    code: 'ACTION_VALIDATION_AVAILABILITY_FIELDS',
    retained: true,
  });

  await page.goto(url);
  await page
    .locator('[data-availability-calendar] .agenda-event')
    .filter({ hasText: 'Original editable availability' })
    .click();
  dialog = page.getByRole('dialog');
  form = dialog.locator('form.availability-editor');
  await expect(form.locator('[name="id"]')).toHaveValue(staleId);
  await form.locator('[name="note"]').fill('Retained stale availability note');
  const competitor = createDatabase(databasePath);
  try {
    competitor.sqlite
      .prepare('UPDATE worker_availability SET version=version+1 WHERE id=?')
      .run(staleId);
  } finally {
    competitor.sqlite.close();
  }
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(await nativeSubmit(page, 'form.availability-editor', 'setAvailability')).toBe(409);
  dialog = page.getByRole('dialog');
  form = dialog.locator('form.availability-editor');
  notice = dialog.locator('[data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'AVAILABILITY_CHANGED');
  await expect(form.locator('[name="note"]')).toHaveValue('Retained stale availability note');
  await expect(notice).toBeFocused();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
  steps.push({
    step: 'availability-stale-native',
    code: 'AVAILABILITY_CHANGED',
    retained: true,
    scrollBefore,
    scrollAfter,
  });

  const denial = await page.evaluate(
    async ({ targetId, date }) => {
      const response = await fetch('?/setAvailability', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: new URLSearchParams({
          workerId: targetId,
          startsAt: `${date}T08:00:00.000Z`,
          endsAt: `${date}T10:00:00.000Z`,
          availability: 'available',
        }),
      });
      return { http: response.status, body: await response.json() };
    },
    { targetId: worker2Id, date: day(5) },
  );
  expect(JSON.stringify(denial.body)).toContain('AVAILABILITY_OWNERSHIP_REQUIRED');
  diagnostics.responses.push({ status: denial.http, path: '/j-aautomation/app/profile' });
  steps.push({ step: 'other-worker-role-denied', code: 'AVAILABILITY_OWNERSHIP_REQUIRED' });
  await saveEvidence(
    page,
    `availability-${info.project.name}-${locale}`,
    '[role="dialog"] [data-ui="problem-notice"]',
    diagnostics,
    steps,
  );
});
