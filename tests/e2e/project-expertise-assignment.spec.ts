import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type ExpertiseMatch = {
  skill_id: string;
  skill_name: string;
  worker_id: string;
  other_worker_id: string;
};

test('owner filters active workers by expertise and assignment persists', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const projectName = `Expertise assignment ${testInfo.project.name} ${randomUUID()}`;
  try {
    const match = db
      .prepare(
        `SELECT s.id skill_id,s.name skill_name,ws.worker_id,u2.id other_worker_id
           FROM skill s
           JOIN worker_skill ws ON ws.skill_id=s.id
           JOIN user u ON u.id=ws.worker_id AND u.status='active' AND u.role='worker'
           JOIN user u2 ON u2.status='active' AND u2.role='worker' AND u2.id<>u.id
          WHERE NOT EXISTS
            (SELECT 1 FROM worker_skill other WHERE other.skill_id=s.id AND other.worker_id=u2.id)
          ORDER BY s.code,u.name,u2.name LIMIT 1`,
      )
      .get() as ExpertiseMatch | undefined;
    if (!match) throw new Error('E2E fixture needs two workers with different expertise');

    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const createForm = page.locator('form[action="?/createProject"]');
    const clientId = await createForm
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!clientId) throw new Error('E2E fixture needs an active client');
    await createForm.locator('[name="clientId"]').selectOption(clientId);
    await createForm.locator('[name="name"]').fill(projectName);
    await createForm.locator('[name="costCenterCode"]').fill(`QA-EXP-${testInfo.project.name}`);
    await createForm.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(
        () =>
          (
            db.prepare('SELECT id FROM project WHERE name=?').get(projectName) as
              | { id?: string }
              | undefined
          )?.id,
      )
      .toBeTruthy();
    const created = db.prepare('SELECT id FROM project WHERE name=?').get(projectName) as {
      id: string;
    };

    await page.goto(portal(`/projects?action=assign-worker&project=${created.id}`));
    const form = page.locator(
      '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
    );
    await expect(form).toBeVisible();
    await expect(form.getByText('Expertise', { exact: true })).toBeVisible();
    const workerSelect = form.locator('select[name="workerId"]');
    await workerSelect.selectOption(match.other_worker_id);
    const expertiseSelect = form.getByLabel('Filter workers by expertise');
    await expertiseSelect.selectOption(match.skill_id);
    await expect(workerSelect).toHaveValue('');
    await expect(workerSelect.locator(`option[value="${match.worker_id}"]`)).toHaveCount(1);
    await expect(workerSelect.locator(`option[value="${match.other_worker_id}"]`)).toHaveCount(0);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Expected a configured browser viewport');
    for (const control of [expertiseSelect, workerSelect]) {
      const box = await control.boundingBox();
      expect(box, 'Expertise and worker controls must be visible').not.toBeNull();
      expect(box!.height, 'Select controls must be touch sized').toBeGreaterThanOrEqual(44);
      expect(box!.x, 'Select controls must not clip left').toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, 'Select controls must not clip right').toBeLessThanOrEqual(
        viewport.width,
      );
    }
    await workerSelect.selectOption(match.worker_id);
    await form.locator('select[name="projectId"]').selectOption(created.id);
    await form.locator('input[name="startsOn"]').fill('2026-09-23');
    await form.getByRole('button', { name: 'Assign', exact: true }).click();

    await expect
      .poll(
        () =>
          (
            db
              .prepare(
                `SELECT COUNT(*) count FROM project_member
                WHERE project_id=? AND user_id=? AND status='active'`,
              )
              .get(created.id, match.worker_id) as { count: number }
          ).count,
      )
      .toBe(1);
    await page.goto(portal(`/projects/${created.id}`));
    await expect(page.locator('main')).toContainText(projectName);
    await page.getByRole('tab', { name: 'Team' }).click();
    const workerName = (
      db.prepare('SELECT name FROM user WHERE id=?').get(match.worker_id) as { name: string }
    ).name;
    await expect(page.locator('main')).toContainText(workerName);
  } finally {
    db.close();
  }
});
