import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PortalRepository } from '@ja/database';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type ExpertiseMatch = {
  skill_id: string;
  worker_id: string;
  other_worker_id: string;
};

test('owner creates a project with two people selected by expertise', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const name = `People at create ${testInfo.project.name} ${randomUUID()}`;
  try {
    const match = db
      .prepare(
        `SELECT s.id skill_id,ws.worker_id,u2.id other_worker_id
           FROM skill s
           JOIN worker_skill ws ON ws.skill_id=s.id
           JOIN user u ON u.id=ws.worker_id AND u.status='active' AND u.role='worker'
           JOIN user u2 ON u2.status='active' AND u2.role='worker' AND u2.id<>u.id
          WHERE NOT EXISTS
            (SELECT 1 FROM worker_skill other WHERE other.skill_id=s.id AND other.worker_id=u2.id)
          ORDER BY s.code,u.name,u2.name LIMIT 1`,
      )
      .get() as ExpertiseMatch | undefined;
    if (!match) throw new Error('E2E fixture requires workers with distinct expertise');

    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    const clientId = await form
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!clientId) throw new Error('E2E fixture requires an active client');
    await form.locator('[name="clientId"]').selectOption(clientId);
    await form.locator('[name="name"]').fill(name);
    await form.locator('[name="costCenterCode"]').fill(`QA-PEOPLE-${testInfo.project.name}`);
    await form.locator('[name="startDate"]').fill('2026-09-23');
    await form.locator('[name="initialWorkersStartOn"]').fill('2026-09-24');
    const first = form.locator(`[name="initialWorkerId"][value="${match.worker_id}"]`);
    const second = form.locator(`[name="initialWorkerId"][value="${match.other_worker_id}"]`);
    await first.check();
    await second.check();
    await form.getByLabel('Filter workers by expertise').selectOption(match.skill_id);
    await expect(first).toBeVisible();
    await expect(second).toBeHidden();
    await expect(second).toBeChecked();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Expected configured viewport');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const filterBox = await form.getByLabel('Filter workers by expertise').boundingBox();
    expect(filterBox).not.toBeNull();
    expect(filterBox!.height).toBeGreaterThanOrEqual(44);
    expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(viewport.width);

    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(
        () =>
          (
            db.prepare('SELECT id FROM project WHERE name=?').get(name) as
              | { id: string }
              | undefined
          )?.id,
      )
      .toBeTruthy();
    const created = db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string };
    expect(
      db
        .prepare(
          `SELECT user_id,starts_on FROM project_member
            WHERE project_id=? AND assignment_role='worker' ORDER BY user_id`,
        )
        .all(created.id),
    ).toEqual(
      [match.worker_id, match.other_worker_id]
        .sort()
        .map((user_id) => ({ user_id, starts_on: '2026-09-24' })),
    );
    expect(
      db.prepare('SELECT COUNT(*) count FROM client_labor_rate WHERE project_id=?').get(created.id),
    ).toEqual({ count: 0 });
    await expect(page.locator('[data-project-setup-next]')).toBeVisible();
    await expect(
      page
        .locator('[data-project-setup-next]')
        .getByRole('link', { name: 'Configure per-person rates and expenses' }),
    ).toHaveAttribute('href', new RegExp(`project=${created.id}`));
  } finally {
    db.close();
  }
});

test('invalid selected worker displays a row error without creating a project', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const name = `Invalid project people ${randomUUID()}`;
  const inactiveId = randomUUID();
  try {
    const timestamp = new Date().toISOString();
    db.prepare(
      'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      inactiveId,
      'Inactive QA worker',
      `${inactiveId}@example.test`,
      'worker',
      'suspended',
      timestamp,
      timestamp,
    );
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await form.locator('[name="name"]').fill(name);
    await form.locator('[name="costCenterCode"]').fill('QA-INVALID-PEOPLE');
    await form.evaluate((element, id) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'initialWorkerId';
      input.value = id;
      element.appendChild(input);
    }, inactiveId);
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.locator('[data-project-field-errors]')).toContainText(
      'Selected worker 1 is not an active workforce member',
    );
    await expect(form.locator('[name="name"]')).toHaveValue(name);
    expect(db.prepare('SELECT COUNT(*) count FROM project WHERE name=?').get(name)).toEqual({
      count: 0,
    });
  } finally {
    db.close();
  }
});

test('changing client after a failed save uses the newly selected client defaults', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const name = `Client retry defaults ${randomUUID()}`;
  try {
    const clients = db
      .prepare("SELECT id,currency,timezone FROM client WHERE status='active' ORDER BY id")
      .all() as { id: string; currency: string; timezone: string }[];
    const originalClient = clients[0];
    if (!originalClient) throw new Error('E2E fixture requires an active client');
    const owner = db.prepare("SELECT id FROM user WHERE role='owner_admin' LIMIT 1").get() as {
      id: string;
    };
    const nextCurrency = originalClient.currency === 'EUR' ? 'USD' : 'EUR';
    const nextTimezone =
      originalClient.timezone === 'Europe/Madrid' ? 'America/New_York' : 'Europe/Madrid';
    const repository = new PortalRepository(db);
    const client = repository.createClient(repository.principalFor(owner.id), {
      legalName: `QA Client Retry ${randomUUID()}`,
      displayName: 'QA Client Retry',
      currency: nextCurrency as 'EUR' | 'USD',
      timezone: nextTimezone,
      billingEmail: 'qa-client-retry@example.test',
      billingAddress: 'Calle de Prueba 1, Madrid',
    });
    const nextClient = { id: client.id, currency: nextCurrency, timezone: nextTimezone };

    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await form.locator('[name="clientId"]').selectOption(originalClient.id);
    await form.locator('[name="name"]').fill('X');
    await form.locator('[name="costCenterCode"]').fill('QA-CLIENT-RETRY');
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.locator('[data-project-field-errors]')).toContainText('Name');
    await form.locator('[name="clientId"]').selectOption(nextClient.id);
    await expect(form.locator('[name="currency"]')).toHaveValue(nextClient.currency);
    await expect(form.locator('[name="timezone"]')).toHaveValue(nextClient.timezone);
    await form.locator('[name="name"]').fill(name);
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name))
      .toBeTruthy();
    expect(
      db.prepare('SELECT client_id,currency,timezone FROM project WHERE name=?').get(name),
    ).toEqual({
      client_id: nextClient.id,
      currency: nextClient.currency,
      timezone: nextClient.timezone,
    });
  } finally {
    db.close();
  }
});

test('worker assignment outside project dates shows an error and saves nothing', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const name = `Invalid assignment date ${randomUUID()}`;
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await form.locator('[name="name"]').fill(name);
    await form.locator('[name="costCenterCode"]').fill('QA-DATE-BOUNDARY');
    await form.locator('[name="startDate"]').fill('2026-09-24');
    await form.locator('[name="plannedEndDate"]').fill('2026-09-30');
    await form.locator('[name="initialWorkersStartOn"]').fill('2026-10-01');
    const worker = form.locator('[name="initialWorkerId"]').first();
    await worker.check();
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.locator('[data-project-field-errors]')).toContainText(
      'Worker assignment start date must be within project dates',
    );
    await expect(worker).toBeChecked();
    expect(db.prepare('SELECT COUNT(*) count FROM project WHERE name=?').get(name)).toEqual({
      count: 0,
    });
  } finally {
    db.close();
  }
});
