import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const requiredViewports = ['phone-360', 'phone-390', 'tablet-768', 'desktop'];

test('owner searches and filters the real Planning Published assignments list', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.includes(info.project.name));
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const repo = new PortalRepository(db.sqlite);
  const idFor = (email: string) =>
    (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
  const today = new Date().toISOString().slice(0, 10);
  const workDate = new Date(
    Date.now() + (20 + requiredViewports.indexOf(info.project.name)) * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const reference = `Published filter ${randomUUID()}`;
  try {
    await signIn(page, 'owner');
    const ownerId = idFor(e2eCredentials.owner.email);
    const session = db.sqlite
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(ownerId) as { id: string };
    const owner = repo.principalFor(ownerId, session.id);
    const projectId = repo.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(info.project.name).client.id,
      name: reference,
      costCenterCode: e2eCostCenter('QA-PUB', 12, info.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    const workerId = idFor(e2eCredentials.worker.email);
    const otherWorkerId = idFor(e2eCredentials.worker2.email);
    for (const selected of [workerId, otherWorkerId]) {
      repo.assignWorker(owner, { projectId, workerId: selected, startsOn: today });
      repo.createPlanningAssignment(owner, {
        projectId,
        workerId: selected,
        startsAt: `${workDate}T08:00:00.000Z`,
        endsAt: `${workDate}T10:00:00.000Z`,
        plannedMinutes: 120,
      });
    }
    await page.goto(portal('/planning?lang=en#published-assignments'));
    const assignments = page.locator('#published-assignments');
    await expect(assignments.getByRole('heading', { name: 'Published assignments' })).toBeVisible();
    const filters = assignments.locator('[data-assignment-filters]');
    const rows = assignments.locator('[data-planning-assignment-row]');
    await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(2);
    const fullCount = await rows.count();
    const search = filters.locator('[data-assignment-search]');

    await filters.locator('[data-assignment-project-filter]').selectOption(projectId);
    await expect(rows).toHaveCount(2);
    await filters.locator('[data-assignment-worker-filter]').selectOption(workerId);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-project-id', projectId);
    await expect(rows.first()).toHaveAttribute('data-worker-id', workerId);
    await search.fill(reference);
    await expect(rows).toHaveCount(1);
    await search.fill('no-such-published-assignment-qa');
    await expect(rows).toHaveCount(0);
    await expect(assignments.locator('[data-assignment-filter-empty]')).toBeVisible();
    await filters.locator('[data-assignment-clear-filters]').click();
    await expect(search).toHaveValue('');
    await expect(filters.locator('[data-assignment-project-filter]')).toHaveValue('');
    await expect(filters.locator('[data-assignment-worker-filter]')).toHaveValue('');
    await expect(rows).toHaveCount(fullCount);
    await expect(filters.locator('[data-assignment-clear-filters]')).toBeDisabled();

    const viewport = page.viewportSize()!;
    for (const control of [
      search,
      filters.locator('[data-assignment-project-filter]'),
      filters.locator('[data-assignment-worker-filter]'),
      filters.locator('[data-assignment-clear-filters]'),
    ]) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  } finally {
    db.sqlite.close();
  }
});
