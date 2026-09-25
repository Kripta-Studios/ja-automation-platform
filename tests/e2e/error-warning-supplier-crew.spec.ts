import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const qaPortal = (path = '') => `http://127.0.0.1:4184/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-supplier-crew');
const workDate = new Date().toISOString().slice(0, 10);
const endDate = new Date(Date.parse(`${workDate}T00:00:00.000Z`) + 86_400_000)
  .toISOString()
  .slice(0, 10);

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

function seedCrew(viewport: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const owner = new PortalRepository(db.sqlite).principalFor(userId(e2eCredentials.owner.email));
    const repository = new PortalRepository(db.sqlite);
    const chiefId = userId(e2eCredentials.worker.email);
    const memberId = userId(e2eCredentials.worker2.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Crew warning ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-CREW-WARN', 73, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
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
        reason: 'Activate disposable crew QA project',
      });
    for (const workerId of [chiefId, memberId])
      repository.assignWorker(owner, { projectId, workerId, startsOn: workDate });
    return { databasePath, projectId, chiefId, memberId };
  } finally {
    db.sqlite.close();
  }
}

function setAssignmentStatus(
  databasePath: string,
  projectId: string,
  workerId: string,
  status: string,
) {
  const db = createDatabase(databasePath);
  try {
    db.sqlite
      .prepare(
        'UPDATE project_member SET status=?,version=version+1 WHERE project_id=? AND user_id=?',
      )
      .run(status, projectId, workerId);
  } finally {
    db.sqlite.close();
  }
}

function grantCount(databasePath: string, projectId: string): number {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM crew_leader_grant WHERE project_id=? AND status='active'",
        )
        .get(projectId) as { count: number }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

test('crew delegation explains invalid, stale, duplicate, and role failures', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const fixture = seedCrew(info.project.name);
  const trace: Array<Record<string, string | number | boolean>> = [];
  const failedPaths: Array<{ status: number; path: string }> = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedPaths.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  await qaSignIn(page, 'owner');
  await page.goto(qaPortal(`/crew?project=${fixture.projectId}&date=${workDate}&lang=${locale}`));
  let grant = page.locator('form[data-crew-operation="grant"]');
  await expect(grant).toBeVisible();

  await grant.locator('[name="chiefUserId"]').selectOption(fixture.chiefId);
  await grant.locator('[name="workerUserId"]').selectOption(fixture.chiefId);
  const samePersonResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/grant'),
  );
  await grant.getByRole('button').click();
  expect((await samePersonResponse).status()).toBe(200);
  let notice = page.locator('[data-crew-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'CREW_SAME_PERSON');
  await expect(grant.locator('[name="chiefUserId"]')).toHaveValue(fixture.chiefId);
  await expect(grant.locator('[name="workerUserId"]')).toHaveValue(fixture.chiefId);
  await expect(page.locator('[data-crew-problem]')).toBeFocused();
  trace.push({ step: 'same-person', code: 'CREW_SAME_PERSON', retained: true });

  await grant.locator('[name="workerUserId"]').selectOption(fixture.memberId);
  await grant.locator('[name="startsOn"]').fill(workDate);
  setAssignmentStatus(fixture.databasePath, fixture.projectId, fixture.memberId, 'inactive');
  try {
    const staleResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('?/grant'),
    );
    await grant.getByRole('button').click();
    expect((await staleResponse).status()).toBe(200);
    notice = page.locator('[data-crew-problem] [data-ui="problem-notice"]');
    await expect(notice).toHaveAttribute('data-problem-code', 'CREW_ASSIGNMENT_REQUIRED');
    await expect(grant.locator('[name="workerUserId"]')).toHaveValue(fixture.memberId);
    await expect(grant.locator('[name="startsOn"]')).toHaveValue(workDate);
    await expect(page.locator('[data-crew-problem]')).toBeFocused();
    trace.push({ step: 'assignment-changed', code: 'CREW_ASSIGNMENT_REQUIRED', retained: true });
  } finally {
    setAssignmentStatus(fixture.databasePath, fixture.projectId, fixture.memberId, 'active');
  }

  await page.goto(qaPortal(`/crew?project=${fixture.projectId}&date=${workDate}&lang=${locale}`));
  grant = page.locator('form[data-crew-operation="grant"]');
  await grant.locator('[name="chiefUserId"]').selectOption(fixture.chiefId);
  await grant.locator('[name="workerUserId"]').selectOption(fixture.memberId);
  await grant.locator('[name="startsOn"]').fill(workDate);
  const successResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/grant'),
  );
  await grant.getByRole('button').click();
  expect((await successResponse).status()).toBe(200);
  await expect.poll(() => grantCount(fixture.databasePath, fixture.projectId)).toBe(1);
  trace.push({ step: 'grant-success', created: true });

  await page.goto(qaPortal(`/crew?project=${fixture.projectId}&date=${workDate}&lang=${locale}`));
  grant = page.locator('form[data-crew-operation="grant"]');
  await grant.locator('[name="chiefUserId"]').selectOption(fixture.chiefId);
  await grant.locator('[name="workerUserId"]').selectOption(fixture.memberId);
  await grant.locator('[name="startsOn"]').fill(workDate);
  await grant.locator('[name="endsOn"]').fill(endDate);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const duplicateScroll = await page.evaluate(() => window.scrollY);
  const duplicateResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/grant'),
  );
  await grant.evaluate((element: HTMLFormElement) => element.submit());
  const duplicate = await duplicateResponse;
  expect(duplicate.status()).toBe(409);
  trace.push({
    step: 'duplicate-network',
    status: duplicate.status(),
    path: new URL(duplicate.url()).pathname,
    htmlResponse: duplicate.headers()['content-type']?.includes('text/html') ?? false,
  });
  notice = page.locator('[data-crew-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'CREW_DELEGATION_EXISTS');
  const reviewLink = notice.getByRole('link', {
    name: /Review current crew delegations|Revisar/i,
  });
  await expect(reviewLink).toBeVisible();
  const currentUrl = new URL(page.url());
  expect(currentUrl.searchParams.get('project')).toBe(fixture.projectId);
  expect(currentUrl.searchParams.get('date')).toBe(workDate);
  expect(currentUrl.searchParams.get('lang')).toBe(locale);
  await expect(page.locator('#crew-project')).toHaveValue(fixture.projectId);
  await expect(reviewLink).toHaveAttribute('href', new RegExp(fixture.projectId));
  const reviewUrl = new URL((await reviewLink.getAttribute('href')) ?? '', page.url());
  expect(reviewUrl.searchParams.get('project')).toBe(fixture.projectId);
  expect(reviewUrl.searchParams.get('date')).toBe(workDate);
  await expect(page.locator('[data-crew-problem]')).toBeFocused();
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - duplicateScroll),
  ).toBeLessThanOrEqual(150);
  await expect(page.locator('form[data-crew-operation="grant"] [name="chiefUserId"]')).toHaveValue(
    fixture.chiefId,
  );
  await expect(page.locator('form[data-crew-operation="grant"] [name="workerUserId"]')).toHaveValue(
    fixture.memberId,
  );
  await expect(page.locator('form[data-crew-operation="grant"] [name="startsOn"]')).toHaveValue(
    workDate,
  );
  await expect(page.locator('form[data-crew-operation="grant"] [name="endsOn"]')).toHaveValue(
    endDate,
  );
  expect(grantCount(fixture.databasePath, fixture.projectId)).toBe(1);
  trace.push({ step: 'duplicate-native', code: 'CREW_DELEGATION_EXISTS', retained: true });

  const managerPage = await page.context().newPage();
  await qaSignIn(managerPage, 'manager');
  const denied = await managerPage.evaluate(
    async ({ url, projectId, chiefId, memberId, startsOn }) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: new URLSearchParams({
          projectId,
          chiefUserId: chiefId,
          workerUserId: memberId,
          startsOn,
        }),
      });
      return { status: response.status, body: await response.text() };
    },
    {
      url: qaPortal('/crew?/grant'),
      projectId: fixture.projectId,
      chiefId: fixture.chiefId,
      memberId: fixture.memberId,
      startsOn: workDate,
    },
  );
  expect(denied.status).toBe(200);
  expect(denied.body).toContain('CREW_OWNER_ROLE_REQUIRED');
  await managerPage.close();
  trace.push({ step: 'manager-role', denied: true });

  expect(pageErrors).toEqual([]);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `crew-${info.project.name}-${locale}.png`),
    await page.locator('[data-crew-problem]').screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `crew-${info.project.name}-${locale}-trace.json`),
    `${JSON.stringify(trace, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `crew-${info.project.name}-${locale}-network.json`),
    `${JSON.stringify([...new Set(failedPaths.map((r) => `${r.status} ${r.path}`))].sort(), null, 2)}\n`,
  );
});
