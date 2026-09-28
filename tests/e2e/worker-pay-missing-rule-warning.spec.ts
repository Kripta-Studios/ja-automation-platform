import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-candidate/worker-pay');

function seedMissingRule(viewport: string) {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const workDate = new Date().toISOString().slice(0, 10);
  const role = viewport === 'desktop' ? 'worker2' : 'worker';
  try {
    const idFor = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(idFor(e2eCredentials.owner.email));
    const workerId = idFor(e2eCredentials[role].email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `My Pay missing-rule QA ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-PAY-WARNING', 94, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
    }).id;
    const status = (
      database.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable My Pay warning project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: workDate });
    const worker = repository.principalFor(workerId);
    repository.createTimeEntry(worker, {
      projectId,
      workDate,
      category: 'regular',
      minutes: 60,
      summary: 'First missing-rule warning record',
    });
    return { projectId, workerId, workDate, role } as const;
  } finally {
    database.sqlite.close();
  }
}

function addSecondMissingRule(projectId: string, workerId: string, workDate: string) {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const repository = new PortalRepository(database.sqlite);
    repository.createTimeEntry(repository.principalFor(workerId), {
      projectId,
      workDate,
      category: 'regular',
      minutes: 30,
      summary: 'Second missing-rule warning record',
    });
  } finally {
    database.sqlite.close();
  }
}

async function assertWarning(page: Page, count: 1 | 2) {
  const notice = page.locator(
    '[data-ui="problem-notice"][data-problem-code="WORKER_PAY_MISSING_COMPENSATION_RULE"]',
  );
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-kind', 'warning');
  await expect(notice).toContainText(
    count === 1
      ? '1 time record is excluded from your compensation estimate'
      : '2 time records are excluded from your compensation estimate',
  );
  await expect(notice).toContainText('no applicable rule');
  await expect(notice).toContainText(/currenc(?:y|ies)/u);
  await expect(notice.getByText('Contact Finance or an owner')).toBeVisible();
  await expect(notice.locator('a')).toHaveCount(0);
  const geometry = await notice.evaluate((element) => {
    const viewport = document.documentElement.clientWidth;
    const box = element.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - viewport,
      noticeLeft: box.left,
      noticeRight: box.right,
      viewport,
    };
  });
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.noticeLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.noticeRight).toBeLessThanOrEqual(geometry.viewport + 1);
  return notice;
}

test('Worker My Pay explains missing compensation rules and a role-safe remedy', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const fixture = seedMissingRule(info.project.name);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResponses.push({
        status: response.status(),
        path: new URL(response.url()).pathname,
      });
  });

  await signIn(page, fixture.role);
  await page.goto(portal(`/pay?lang=en&start=${fixture.workDate}&end=${fixture.workDate}`));
  const singular = await assertWarning(page, 1);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${info.project.name}-one.png`),
    await singular.screenshot(),
  );

  addSecondMissingRule(fixture.projectId, fixture.workerId, fixture.workDate);
  await page.reload();
  const plural = await assertWarning(page, 2);
  writeFileSync(
    join(evidenceDirectory, `${info.project.name}-many.png`),
    await plural.screenshot(),
  );
  expect(pageErrors).toEqual([]);
  // The E2E server deliberately disables offline identity. Its 503 resource errors
  // are unrelated to My Pay; require every failed request to be that endpoint.
  expect(
    failedResponses.every(
      (response) =>
        response.status === 503 && response.path === '/j-aautomation/app/api/offline/identity',
    ),
  ).toBe(true);
  expect(consoleErrors).toHaveLength(failedResponses.length);
  expect(
    consoleErrors.every(
      (message) =>
        message ===
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
    ),
  ).toBe(true);
});
