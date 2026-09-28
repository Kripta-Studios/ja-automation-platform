import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PortalRepository, V3Repository } from '@ja/database';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

function selectedProjectId(): string {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const project = db
      .prepare(
        "SELECT id FROM project WHERE status IN ('active','planned') ORDER BY created_at,id LIMIT 1",
      )
      .get() as { id: string } | undefined;
    if (!project) throw new Error('E2E fixture requires an active project');
    return project.id;
  } finally {
    db.close();
  }
}

test('finance can open the canonical per-person calculation explanation at every required width', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const projectId = selectedProjectId();
  await signIn(page, 'owner');
  await page.goto(portal(`/finance?view=economic&project=${projectId}`));
  const explanationLink = page.locator('[data-project-calculation-link]');
  await expect(explanationLink).toBeVisible();
  const linkBox = await explanationLink.boundingBox();
  expect(linkBox).not.toBeNull();
  expect(linkBox!.height).toBeGreaterThanOrEqual(40);
  expect(linkBox!.x).toBeGreaterThanOrEqual(0);
  expect(linkBox!.x + linkBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await explanationLink.click();
  await expect(page.locator('[data-project-calculation-page]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How this project is calculated' })).toBeVisible();
  await expect(page.locator('[data-calculation-canonical-note]')).toBeVisible();
  await expect(page.locator('[data-calculation-reconciliation]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.reload();
  await expect(page.locator('[data-project-calculation-page]')).toBeVisible();
});

test('owner sees the exact canonical mixed-rate amount in the browser at key widths', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'owner');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const repository = new PortalRepository(db);
    const ownerRow = db
      .prepare("SELECT id FROM user WHERE email='owner@demo.jaautomation.test'")
      .get() as { id: string };
    const session = db
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(ownerRow.id) as { id: string };
    const owner = repository.principalFor(ownerRow.id, session.id);
    const workerRow = db
      .prepare("SELECT id FROM user WHERE email='worker@demo.jaautomation.test'")
      .get() as { id: string };
    const managerRow = db
      .prepare("SELECT id FROM user WHERE email='pm@demo.jaautomation.test'")
      .get() as { id: string };
    const client = db
      .prepare("SELECT id FROM client WHERE currency='USD' AND status='active' ORDER BY id LIMIT 1")
      .get() as { id: string };
    const marker = `Calculation numeric ${testInfo.project.name} ${randomUUID()}`;
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: marker,
      costCenterCode: e2eCostCenter('QA-CALC', 7, testInfo.project.name),
      timezone: 'America/New_York',
      currency: 'USD',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    const date = '2026-09-24';
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: managerRow.id,
      startsOn: '2026-01-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: workerRow.id,
      startsOn: '2026-01-01',
    });
    const manager = repository.principalFor(managerRow.id);
    const worker = repository.principalFor(workerRow.id);
    const v3 = new V3Repository(db);
    v3.createClientLaborRate(owner, {
      projectId: project.id,
      workerId: worker.userId,
      currency: 'USD',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-01-01',
    });
    v3.createCompensationRule(owner, {
      workerId: worker.userId,
      projectId: project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 3_000n,
      effectiveFrom: '2026-01-01',
    });
    v3.createInternalCostRule(owner, {
      workerId: worker.userId,
      projectId: project.id,
      currency: 'USD',
      hourlyRateMinor: 3_000n,
      effectiveFrom: '2026-01-01',
    });
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: date,
      category: 'regular',
      minutes: 480,
      summary: 'Browser numeric calculation source',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(owner, time.id, true);
    await page.goto(
      portal(`/projects/${project.id}/calculation?periodStart=${date}&periodEnd=${date}`),
    );
    await expect(
      page.locator('[data-calculation-total="operational-source-revenue"]'),
    ).toContainText('USD 440.00');
    await expect(page.locator('[data-calculation-total="worker-compensation"]')).toContainText(
      'USD 240.00',
    );
    await expect(page.locator('[data-calculation-reconciliation]')).toContainText(
      'Source rows reconcile exactly',
    );
    await expect(page.locator('[data-calculation-person]')).toContainText('USD 440.00');
  } finally {
    db.close();
  }
});

test('worker cannot load any per-person compensation explanation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const projectId = selectedProjectId();
  await signIn(page, 'worker');
  const response = await page.goto(portal(`/projects/${projectId}/calculation`));
  expect(response?.status()).toBe(403);
  await expect(page.locator('[data-project-calculation-page]')).toHaveCount(0);
});
