import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

for (const role of ['owner', 'manager'] as const) {
  test(`${role} retains planning details when selecting workers and recovering from an invalid interval`, async ({
    page,
  }, testInfo) => {
    test.skip(!['desktop', 'phone-390'].includes(testInfo.project.name));
    const db = createDatabase(readE2EFixturePointer().databasePath);
    try {
      const repo = new PortalRepository(db.sqlite);
      const idFor = (email: string) =>
        String(db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email)!.id);
      const workerId = idFor(e2eCredentials.worker.email);
      const owner = repo.principalFor(idFor(e2eCredentials.owner.email));
      const today = new Date().toISOString().slice(0, 10);
      const dayOffset =
        14 + (testInfo.project.name === 'desktop' ? 2 : 0) + (role === 'manager' ? 1 : 0);
      const workDate = new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
      const projectId = repo.createProject(owner, {
        clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
        name: `Planning draft retention ${randomUUID()}`,
        costCenterCode: e2eCostCenter(
          'QA-DRAFT',
          role === 'owner' ? 12 : 13,
          testInfo.project.name,
        ),
        currency: 'USD',
        timezone: 'UTC',
        billingModel: 'tm',
        startDate: today,
      }).id;
      repo.assignWorker(owner, { projectId, workerId, startsOn: today });
      repo.assignWorker(owner, {
        projectId,
        workerId: idFor(e2eCredentials.manager.email),
        startsOn: today,
      });

      await signIn(page, role);
      await page.goto(portal(`/planning?project=${projectId}&lang=en`));
      const form = page.locator('#planning-create-form');
      await expect(form.locator('select[name="projectId"]')).toHaveValue(projectId);
      await form.locator('input[name="startsAt"]').fill(`${workDate}T08:00`);
      await form.locator('input[name="endsAt"]').fill(`${workDate}T07:00`);
      await form.getByLabel('Planned hours (optional)', { exact: true }).fill('2');
      const site = 'Fictional planning bench';
      const expertise = 'Fictional instrumentation expertise';
      await form.locator('input[name="site"]').fill(site);
      await form.locator('input[name="requiredSkill"]').fill(expertise);
      const worker = form.locator(`input[name="workerIds"][value="${workerId}"]`);
      await worker.check();
      await worker.uncheck();
      await worker.check();
      await expect(form.locator('input[name="site"]')).toHaveValue(site);
      await expect(form.locator('input[name="requiredSkill"]')).toHaveValue(expertise);
      await expect(form.locator('input[name="plannedMinutes"]')).toHaveValue('120');

      await form.getByRole('button', { name: 'Publish assignment', exact: true }).click();
      await expect(form.locator('[data-ui="problem-notice"]')).toBeVisible();
      await expect(form.locator('input[name="site"]')).toHaveValue(site);
      await expect(form.locator('input[name="requiredSkill"]')).toHaveValue(expertise);
      await expect(worker).toBeChecked();
      expect(
        db.sqlite
          .prepare('SELECT COUNT(*) count FROM planning_assignment WHERE project_id=?')
          .get(projectId)!.count,
      ).toBe(0);

      await form.locator('input[name="endsAt"]').fill(`${workDate}T10:00`);
      await worker.uncheck();
      await worker.check();
      await expect(form.locator('input[name="site"]')).toHaveValue(site);
      await expect(form.locator('input[name="requiredSkill"]')).toHaveValue(expertise);
      await form.getByRole('button', { name: 'Publish assignment', exact: true }).click();
      await expect
        .poll(() =>
          db.sqlite
            .prepare(
              'SELECT site,required_skill,planned_minutes FROM planning_assignment WHERE project_id=?',
            )
            .get(projectId),
        )
        .toEqual({ site, required_skill: expertise, planned_minutes: 120 });
      expect(
        db.sqlite
          .prepare('SELECT COUNT(*) count FROM time_entry WHERE project_id=?')
          .get(projectId)!.count,
      ).toBe(0);
    } finally {
      db.sqlite.close();
    }
  });
}
