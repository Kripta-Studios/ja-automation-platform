import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDatabase, PortalRepository } from '@ja/database';
import { signIn, portal, e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const today = () => new Date().toISOString().slice(0, 10);
function workerId() {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return String(
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email)!.id,
    );
  } finally {
    db.sqlite.close();
  }
}

for (const role of ['worker', 'manager', 'owner', 'finance'] as const) {
  test(`${role} creates and edits availability from calendar with correct ownership`, async ({
    page,
  }, testInfo) => {
    await signIn(page, role);
    const target = role === 'owner' || role === 'finance' ? workerId() : undefined;
    await page.goto(portal(`/profile?lang=en${target ? `&worker=${target}` : ''}`));
    const calendar = page.locator('[data-availability-calendar]');
    await expect(calendar).toBeVisible();
    const grid = calendar.locator('.calendar-grid');
    const button = grid.locator('[aria-current="date"]');
    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Starts', { exact: true })).toHaveValue(`${today()}T08:00`);
    if (target) await expect(dialog.locator('input[name=workerId]')).toHaveValue(target);
    const modalCheck = await new AxeBuilder({ page })
      .include('[data-ui="responsive-sheet"]')
      .analyze();
    expect(modalCheck.violations).toEqual([]);
    for (const control of await dialog
      .locator('input:not([type=hidden]), select, textarea, button')
      .all()) {
      const controlBox = await control.boundingBox();
      if (!controlBox) continue;
      expect(controlBox.height).toBeGreaterThanOrEqual(44);
      expect(controlBox.x).toBeGreaterThanOrEqual(0);
      expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
    const note = `Calendar ${role} ${randomUUID()}`;
    await dialog.getByLabel('Note', { exact: true }).fill(note);
    await dialog
      .getByRole('combobox', { name: 'Availability', exact: true })
      .selectOption('tentative');
    await dialog.getByRole('button', { name: 'Save availability', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const event = calendar.getByRole('button', { name: new RegExp(note) });
    await expect(event).toContainText('Tentative');
    await event.click();
    await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue(note);
    await dialog
      .getByRole('combobox', { name: 'Availability', exact: true })
      .selectOption('unavailable');
    await dialog.getByLabel('Ends', { exact: true }).fill(`${today()}T18:00`);
    await dialog.getByRole('button', { name: 'Save availability', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(event).toContainText('Unavailable');
    await event.click();
    await expect(dialog.getByLabel('Ends', { exact: true })).toHaveValue(`${today()}T18:00`);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(calendar.getByRole('button', { name: new RegExp(note) })).toContainText(
      'Unavailable',
    );
    const violations = await new AxeBuilder({ page })
      .include('[data-availability-calendar]')
      .analyze();
    expect(violations.violations).toEqual([]);
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (role === 'worker' || role === 'owner') {
      mkdirSync('docs/evidence/planning-calendar-20260919', { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        fullPage: true,
        path: `docs/evidence/planning-calendar-20260919/${role}-${testInfo.project.name}.png`,
      });
    }
    const db = createDatabase(readE2EFixturePointer().databasePath);
    try {
      const rows = db.sqlite
        .prepare(
          'SELECT worker_id,version,availability,ends_at FROM worker_availability WHERE note=?',
        )
        .all(note);
      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe(2);
      expect(rows[0].ends_at).toBe(`${today()}T18:00:00.000Z`);
      if (target) expect(rows[0].worker_id).toBe(target);
    } finally {
      db.sqlite.close();
    }
  });
}

for (const role of ['owner', 'finance', 'manager', 'worker', 'auditor'] as const) {
  test(`${role} planning and projects calendars respect role actions`, async ({
    page,
  }, testInfo) => {
    await signIn(page, role);
    await page.goto(portal('/planning?lang=en'));
    const calendar = page.locator('[data-ui=planning-calendar]').first();
    await expect(calendar).toBeVisible();
    await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
    await calendar.getByRole('button', { name: 'Previous month', exact: true }).click();
    await calendar.locator('[aria-current="date"]').click();
    const dayBox = await calendar.locator('.calendar-grid .calendar-day').first().boundingBox();
    expect(dayBox).not.toBeNull();
    expect(dayBox!.width).toBeGreaterThanOrEqual(40);
    expect(dayBox!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const form = page.locator('form[action="?/createPlanning"]');
    if (role === 'owner' || role === 'manager') {
      await expect(form.locator('input[name=startsAt]')).toHaveValue(`${today()}T08:00`);
      await expect(form.locator('input[name=endsAt]')).toHaveValue(`${today()}T16:00`);
    } else await expect(form).toHaveCount(0);
    await page.goto(portal('/projects?lang=en'));
    await page.locator('[data-project-calendar] summary').click();
    await expect(page.locator('[data-project-calendar] [data-ui=planning-calendar]')).toBeVisible();
    const violations = await new AxeBuilder({ page }).include('[data-project-calendar]').analyze();
    expect(violations.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (role === 'owner') {
      const db = createDatabase(readE2EFixturePointer().databasePath);
      const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
      try {
        const repo = new PortalRepository(db.sqlite);
        const owner = repo.principalFor(
          String(
            db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email)!
              .id,
          ),
        );
        const project = db.sqlite.prepare('SELECT * FROM project WHERE id=?').get(projectId)!;
        expect(project).toBeTruthy();
        repo.assignWorker(owner, { projectId, workerId: workerId(), startsOn: '2026-01-01' });
      } finally {
        db.sqlite.close();
      }
      await page.goto(portal(`/projects/${projectId}?tab=team&lang=en`));
      await expect(page.locator('[data-ui=planning-calendar]')).toBeVisible();
    }
  });
}

test('Owner publishes from a day and edits the published shift from its agenda', async ({
  page,
}, testInfo) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
  const id = randomUUID();
  const name = `Calendar specialist ${testInfo.project.name}`;
  try {
    const repo = new PortalRepository(db.sqlite);
    const timestamp = new Date().toISOString();
    db.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, name, `${id}@calendar.example.test`, 'worker', 'active', timestamp, timestamp);
    const owner = repo.principalFor(
      String(
        db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email)!.id,
      ),
    );
    repo.assignWorker(owner, { projectId, workerId: id, startsOn: '2026-01-01' });
  } finally {
    db.sqlite.close();
  }
  await signIn(page, 'owner');
  await page.goto(portal(`/planning?lang=en&project=${projectId}&worker=${id}`));
  await page.locator('[data-ui=planning-calendar] [aria-current=date]').click();
  const form = page.locator('form[action="?/createPlanning"]');
  await expect(form.locator('select[name=projectId]')).toHaveValue(projectId);
  await expect(form.locator('select[name=workerId]')).toHaveValue(id);
  await form.getByLabel('Planned hours', { exact: true }).fill('8');
  await expect(form.locator('input[name="plannedMinutes"]')).toHaveValue('480');
  await form.getByLabel('Site', { exact: true }).fill('Calendar original site');
  await form.getByRole('button', { name: 'Publish assignment', exact: true }).click();
  const agenda = page.locator('.calendar-agenda');
  await expect(agenda).toContainText(name);
  await agenda.getByRole('link', { name: new RegExp(name) }).click();
  const edit = page.locator('details[open] form[action^="?/manageCatalog&area="]');
  await expect(edit).toBeVisible();
  await expect(edit.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(
    'published',
  );
  await edit.getByLabel('Site', { exact: true }).fill('Calendar corrected site');
  await edit.getByLabel('Correction reason').fill('Correct shift location from calendar');
  await edit.getByLabel('I confirm this change to the selected record.').check();
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.management-feedback[role=status]')).toContainText('Changes saved');
  await page.goto(portal(`/planning?lang=en&project=${projectId}&worker=${id}`));
  await expect(page.locator('.record-card-link')).toContainText('Calendar corrected site');
  await expect(page.locator('.record-card-link')).toContainText(/published/i);
});

test('Manager edits a scoped colleague calendar and forged worker selection stays scoped', async ({
  page,
}) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  let managerId: string;
  let ownerId: string;
  try {
    const idFor = (email: string) =>
      String(db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email)!.id);
    managerId = idFor(e2eCredentials.manager.email);
    ownerId = idFor(e2eCredentials.owner.email);
  } finally {
    db.sqlite.close();
  }
  const colleagueId = workerId();
  await signIn(page, 'manager');
  await page.goto(portal(`/profile?lang=en&worker=${colleagueId}`));
  await expect(page.getByRole('combobox', { name: 'Inspect worker' })).toHaveValue(colleagueId);
  const calendar = page.locator('[data-availability-calendar]');
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
  const nextMonth = new Date(`${today()}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
  const date = nextMonth.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
    nextMonth,
  );
  await calendar.getByRole('button', { name: new RegExp(`^${label} · Events:`) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[name=workerId]')).toHaveValue(colleagueId);
  await expect(dialog.getByLabel('Starts', { exact: true })).toHaveValue(`${date}T08:00`);
  const note = `PM colleague calendar ${randomUUID()}`;
  await dialog.getByLabel('Note', { exact: true }).fill(note);
  await dialog.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(calendar.getByRole('button', { name: new RegExp(note) })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Inspect worker' })).toHaveValue(colleagueId);
  await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
  await calendar.getByRole('button', { name: new RegExp(`^${label} · Events:`) }).click();
  await expect(calendar.getByRole('button', { name: new RegExp(note) })).toBeVisible();
  await page.goto(portal(`/profile?lang=en&worker=${ownerId}`));
  await expect(page.getByRole('combobox', { name: 'Inspect worker' })).toHaveValue(managerId);
  await expect(page.locator('[data-availability-calendar]')).toBeVisible();
  await page.locator('[data-availability-calendar] [aria-current=date]').click();
  await expect(page.getByRole('dialog').locator('input[name=workerId]')).toHaveValue(managerId);
});

test('Manager without active project membership can still use own availability calendar', async ({
  page,
}) => {
  await signIn(page, 'manager');
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const managerId = String(
    db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.manager.email)!.id,
  );
  const memberships = db.sqlite
    .prepare('SELECT id,status FROM project_member WHERE user_id=?')
    .all(managerId) as { id: string; status: string }[];
  db.sqlite.prepare("UPDATE project_member SET status='inactive' WHERE user_id=?").run(managerId);
  try {
    const response = await page.goto(portal('/profile?lang=en'));
    expect(response?.status()).toBe(200);
    const calendar = page.locator('[data-availability-calendar]');
    await expect(calendar).toBeVisible();
    await calendar.locator('[aria-current=date]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[name=workerId]')).toHaveValue(managerId);
  } finally {
    const restore = db.sqlite.prepare('UPDATE project_member SET status=? WHERE id=?');
    for (const member of memberships) restore.run(member.status, member.id);
    db.sqlite.close();
  }
});
