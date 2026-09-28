import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Response } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type Persona = 'owner' | 'manager';
type Projects = Record<
  'source' | 'success' | 'invalid' | 'closing' | 'closed' | 'stale' | 'outside',
  string
>;

const startDate = '2026-10-01';
const endDate = '2026-10-15';
const persistEvidence = process.env.JA_ASSIGNMENT_QA_PERSIST_EVIDENCE === '1';
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-assignment');

function saveRedactedEvidence(filename: string, contents: Buffer | string): void {
  if (!persistEvidence) return;
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(join(evidenceDirectory, filename), contents);
}

function assignmentForm(page: Page) {
  const panel = page.locator('[data-project-workflow="assign-worker"]');
  return {
    panel,
    form: panel.locator('form[action="?/assignWorker"]'),
  };
}

function openUrl(projectId: string): string {
  return portal(
    `/projects?action=assign-worker&project=${encodeURIComponent(projectId)}#project-assignment`,
  );
}

function makeProjects(
  persona: Persona,
  viewport: string,
  scenario = persona === 'owner' ? 47 : 48,
): { projects: Projects; workerId: string; databasePath: string } {
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const owner = new PortalRepository(database.sqlite).principalFor(
      userId(e2eCredentials.owner.email),
    );
    const managerId = userId(e2eCredentials.manager.email);
    const workerId = userId(e2eCredentials.worker.email);
    const repository = new PortalRepository(database.sqlite);
    const clientId = e2eLifecycleFixturesFor(viewport).client.id;
    const names = [
      'source',
      'success',
      'invalid',
      'closing',
      'closed',
      'stale',
      'outside',
    ] as const;
    const projects = {} as Projects;
    for (const [index, name] of names.entries()) {
      projects[name] = repository.createProject(owner, {
        clientId,
        name: `Assignment warning ${persona} ${name} ${randomUUID()}`,
        costCenterCode: e2eCostCenter('QA-ASSIGN-WARNING', scenario, viewport, index + 1),
        currency: 'USD',
        timezone: 'UTC',
        billingModel: 'tm',
        startDate: '2026-09-01',
        ...(name === 'outside' ? {} : { projectManagerId: managerId }),
      }).id;
    }
    repository.assignWorker(owner, {
      projectId: projects.source,
      workerId,
      startsOn: new Date().toISOString().slice(0, 10),
    });
    const now = new Date().toISOString();
    const setStatus = database.sqlite.prepare(
      'UPDATE project SET status=?, updated_at=?, version=version+1 WHERE id=?',
    );
    setStatus.run('closing', now, projects.closing);
    setStatus.run('closed', now, projects.closed);
    return { projects, workerId, databasePath };
  } finally {
    database.sqlite.close();
  }
}

function setProjectStatus(databasePath: string, projectId: string, status: 'closing' | 'closed') {
  const database = createDatabase(databasePath);
  try {
    database.sqlite
      .prepare('UPDATE project SET status=?, updated_at=?, version=version+1 WHERE id=?')
      .run(status, new Date().toISOString(), projectId);
  } finally {
    database.sqlite.close();
  }
}

function countAssignments(databasePath: string, projectId: string, workerId: string): number {
  const database = createDatabase(databasePath);
  try {
    return (
      database.sqlite
        .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=? AND user_id=?')
        .get(projectId, workerId) as { count: number }
    ).count;
  } finally {
    database.sqlite.close();
  }
}

async function fillAssignment(page: Page, workerId: string) {
  const { form } = assignmentForm(page);
  await expect(form).toBeVisible();
  await form.locator('select[name="workerId"]').selectOption(workerId);
  await form.locator('input[name="startsOn"]').fill(startDate);
  await form.locator('input[name="endsOn"]').fill(endDate);
  return form;
}

function captureBrowserDiagnostics(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serviceResponses: { status: number; path: string }[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      serviceResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { consoleErrors, pageErrors, serviceResponses };
}

for (const persona of ['owner', 'manager'] as const) {
  test(`${persona} assignment form explains status and retains inputs after a status race`, async ({
    page,
  }, testInfo) => {
    test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
    if (persistEvidence)
      test.skip(
        !(
          (persona === 'owner' && testInfo.project.name === 'phone-390') ||
          (persona === 'manager' && testInfo.project.name === 'desktop')
        ),
      );
    const { projects, workerId, databasePath } = makeProjects(persona, testInfo.project.name);
    const diagnostics = captureBrowserDiagnostics(page);
    const redactedTrace: Array<Record<string, string | number | boolean>> = [];
    await signIn(page, persona);

    // The normal path should still work, with a short confirmation and one new row.
    await page.goto(openUrl(projects.success));
    let form = await fillAssignment(page, workerId);
    await expect(form.locator('select[name="projectId"]')).toHaveValue(projects.success);
    await form.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect.poll(() => countAssignments(databasePath, projects.success, workerId)).toBe(1);
    await expect(page.locator('body')).toContainText(/Assignment created|assigned/i);
    redactedTrace.push({ step: 'success', assignmentCreated: true });

    // Native required-field validation should be beside the field, keep the other
    // values, and focus the bad field or linked summary without a network request.
    await page.goto(openUrl(projects.invalid));
    form = await fillAssignment(page, workerId);
    await form.locator('input[name="startsOn"]').fill('');
    let actionRequests = 0;
    const countRequest = (request: { url(): string }) => {
      if (request.url().includes('?/assignWorker')) actionRequests += 1;
    };
    page.on('request', countRequest);
    await form.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(form.locator('input[name="startsOn"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('[data-field-error-for]')).toContainText(
      'Please complete this field.',
    );
    await expect(form.locator('select[name="workerId"]')).toHaveValue(workerId);
    await expect(form.locator('input[name="endsOn"]')).toHaveValue(endDate);
    expect(actionRequests).toBe(0);
    page.off('request', countRequest);
    redactedTrace.push({ step: 'invalid-required-date', fieldError: true, submitted: false });

    // A direct link to a lifecycle-blocked record keeps the selection visible.
    for (const [state, projectId] of [
      ['Closing', projects.closing],
      ['Closed', projects.closed],
    ] as const) {
      await page.goto(openUrl(projectId));
      const { panel, form: blockedForm } = assignmentForm(page);
      await expect(blockedForm).toBeVisible();
      await expect(blockedForm.locator('select[name="projectId"]')).toHaveValue(projectId);
      await expect(blockedForm.locator(`option[value="${projectId}"]`)).toHaveAttribute(
        'disabled',
        '',
      );
      const notice = panel.locator('[data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute(
        'data-problem-code',
        'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
      );
      await expect(notice).toContainText(state);
      await expect(notice).toContainText(
        'New assignments are allowed only for Active, Planned, or Paused projects.',
      );
      await expect(blockedForm.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
      const box = await notice.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
      redactedTrace.push({ step: `direct-link-${state.toLowerCase()}`, selectedUnavailable: true });
      if (persona === 'owner') {
        await expect(notice.getByRole('link', { name: 'Review project status' })).toHaveAttribute(
          'href',
          new RegExp(`/projects/${projectId}$`),
        );
        const recoveryProjectId = state === 'Closing' ? projects.invalid : projects.outside;
        await blockedForm.locator('select[name="projectId"]').selectOption(recoveryProjectId);
        await expect(
          blockedForm.getByRole('button', { name: 'Assign', exact: true }),
        ).toBeEnabled();
        await blockedForm.locator('select[name="workerId"]').selectOption(workerId);
        await blockedForm.locator('input[name="startsOn"]').fill(startDate);
        await blockedForm.getByRole('button', { name: 'Assign', exact: true }).click();
        await expect
          .poll(() => countAssignments(databasePath, recoveryProjectId, workerId))
          .toBe(1);
      } else {
        await expect(notice).toContainText('Contact the project owner about its status.');
        await expect(notice.getByRole('link', { name: /Review project status/ })).toHaveCount(0);
      }
    }

    // Change the database after the form is open. The backend must use current
    // state, and the failed native action must keep all entered values.
    await page.goto(openUrl(projects.stale));
    form = await fillAssignment(page, workerId);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    setProjectStatus(databasePath, projects.stale, 'closing');
    const responsePromise = page.waitForResponse((response: Response) =>
      response.url().includes('?/assignWorker'),
    );
    await form.getByRole('button', { name: 'Assign', exact: true }).click();
    const nativeResponse = await responsePromise;
    expect(nativeResponse.status()).toBe(409);
    const { panel: reopenedPanel, form: reopenedForm } = assignmentForm(page);
    await expect(reopenedForm).toBeVisible();
    await expect(reopenedPanel.locator('[data-ui="problem-notice"]')).toHaveAttribute(
      'data-problem-code',
      'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
    );
    await expect(reopenedPanel).toContainText('Current status: Closing');
    await expect(reopenedForm.locator('select[name="projectId"]')).toHaveValue(projects.stale);
    await expect(reopenedForm.locator('select[name="workerId"]')).toHaveValue(workerId);
    await expect(reopenedForm.locator('input[name="startsOn"]')).toHaveValue(startDate);
    await expect(reopenedForm.locator('input[name="endsOn"]')).toHaveValue(endDate);
    const maskedScreenshot = await reopenedPanel.screenshot({
      mask: [reopenedForm.locator('select[name="workerId"]')],
    });
    saveRedactedEvidence(`${persona}-${testInfo.project.name}-status-race.png`, maskedScreenshot);
    await testInfo.attach(`assignment-status-race-${persona}-${testInfo.project.name}`, {
      body: maskedScreenshot,
      contentType: 'image/png',
    });
    expect(countAssignments(databasePath, projects.stale, workerId)).toBe(0);
    const focusAndScroll = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName,
      scrollY: window.scrollY,
    }));
    expect.soft(focusAndScroll.activeTag, 'focus after conflict').not.toBe('BODY');
    expect
      .soft(focusAndScroll.scrollY, 'scroll after conflict')
      .toBeGreaterThanOrEqual(Math.min(scrollBefore, 1));
    redactedTrace.push({
      step: 'native-status-race',
      httpStatus: nativeResponse.status(),
      assignmentCreated: false,
      retainedProjectWorkerDates: true,
      focusedElement: focusAndScroll.activeTag ?? 'none',
      scrollY: focusAndScroll.scrollY,
    });

    // The enhanced SvelteKit transport must serialize the same typed problem.
    const enhanced = await page.request.post(portal('/projects?/assignWorker'), {
      headers: {
        'x-sveltekit-action': 'true',
        accept: 'application/json',
        origin: 'http://127.0.0.1:4174',
      },
      form: { projectId: projects.stale, workerId, startsOn: startDate, endsOn: endDate },
    });
    expect(enhanced.status()).toBe(200);
    const enhancedResult = (await enhanced.json()) as {
      type?: string;
      status?: number;
      data?: unknown;
    };
    expect(enhancedResult).toMatchObject({ type: 'failure', status: 409 });
    const enhancedBody = JSON.stringify(enhancedResult.data);
    expect(enhancedBody).toContain('PROJECT_ASSIGNMENT_BLOCKED_STATUS');
    expect(enhancedBody).toContain('problem.project.assignmentBlockedStatus');
    expect(enhancedBody).toContain('Closing');
    expect(enhancedBody).toContain(
      persona === 'owner' ? 'review_project_status' : 'contact_project_owner',
    );
    redactedTrace.push({
      step: 'enhanced-status-race',
      transportStatus: enhanced.status(),
      actionStatus: enhancedResult.status ?? 0,
      typedProblem: true,
    });
    await testInfo.attach(`assignment-redacted-trace-${persona}-${testInfo.project.name}`, {
      body: Buffer.from(JSON.stringify(redactedTrace, null, 2)),
      contentType: 'application/json',
    });
    saveRedactedEvidence(
      `${persona}-${testInfo.project.name}-trace.json`,
      `${JSON.stringify(redactedTrace, null, 2)}\n`,
    );
    const sanitizedServiceResponses = [
      ...new Set(diagnostics.serviceResponses.map((item) => `${item.status} ${item.path}`)),
    ]
      .sort()
      .map((item) => {
        const separator = item.indexOf(' ');
        return { status: Number(item.slice(0, separator)), path: item.slice(separator + 1) };
      });
    saveRedactedEvidence(
      `${persona}-${testInfo.project.name}-service-responses.json`,
      `${JSON.stringify(sanitizedServiceResponses, null, 2)}\n`,
    );
    await testInfo.attach(`assignment-diagnostics-${persona}-${testInfo.project.name}`, {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: 'application/json',
    });
    expect(diagnostics.pageErrors).toEqual([]);
    expect(
      diagnostics.consoleErrors.filter(
        (message) => !message.startsWith('Failed to load resource:'),
      ),
    ).toEqual([]);
  });
}

test('unpermitted assignment cannot expose owner settings or create a record', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const { projects, workerId, databasePath } = makeProjects('manager', testInfo.project.name, 49);
  await signIn(page, 'worker');
  await page.goto(openUrl(projects.outside));
  await expect(assignmentForm(page).panel).toHaveCount(0);
  const forbidden = await page.request.post(portal('/projects?/assignWorker'), {
    headers: {
      'x-sveltekit-action': 'true',
      accept: 'application/json',
      origin: 'http://127.0.0.1:4174',
    },
    form: { projectId: projects.outside, workerId, startsOn: startDate },
  });
  expect(forbidden.status()).toBe(200);
  const forbiddenResult = (await forbidden.json()) as {
    type?: string;
    status?: number;
    data?: unknown;
  };
  expect(forbiddenResult).toMatchObject({ type: 'failure', status: 403 });
  const body = JSON.stringify(forbiddenResult.data);
  expect(body).not.toContain('review_project_status');
  expect(body).not.toContain('Configure commercial terms');
  expect(countAssignments(databasePath, projects.outside, workerId)).toBe(0);
});

test('Closing assignment warning and permitted remedy read clearly in Spanish and Portuguese', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390');
  test.setTimeout(60_000);
  for (const [persona, scenario] of [
    ['owner', 50],
    ['manager', 51],
  ] as const) {
    const { projects } = makeProjects(persona, testInfo.project.name, scenario);
    const roleContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await roleContext.newPage();
    await signIn(page, persona);
    for (const [locale, sentence, remedy] of [
      [
        'es',
        'Las nuevas asignaciones solo se permiten',
        persona === 'owner'
          ? 'Revisar el estado del proyecto'
          : 'Consulta al propietario del proyecto',
      ],
      [
        'pt',
        'Novas atribuições só são permitidas',
        persona === 'owner' ? 'Revisar o estado do projeto' : 'Contate o proprietário do projeto',
      ],
    ] as const) {
      await page.goto(
        portal(`/projects?action=assign-worker&project=${projects.closing}&lang=${locale}`),
      );
      const notice = assignmentForm(page).panel.locator('[data-ui="problem-notice"]');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(sentence);
      await expect(notice).toContainText(remedy);
      await expect(notice).toContainText('Assignment warning');
      await expect(notice).not.toContainText(/problem\.|\{[a-z]+\}/i);
    }
    await roleContext.close();
  }
});
