import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('projectless worker sees a cause and safe remedy before operational forms', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'worker');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const worker = db
    .prepare('SELECT id FROM user WHERE email=?')
    .get(e2eCredentials.worker.email) as {
    id: string;
  };
  const memberships = db
    .prepare('SELECT id,status FROM project_member WHERE user_id=?')
    .all(worker.id) as Array<{ id: string; status: string }>;
  db.prepare("UPDATE project_member SET status='inactive' WHERE user_id=?").run(worker.id);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResources: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResources.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  try {
    const unavailableProjectId = '00000000-0000-4000-8000-00000000abcd';
    await page.goto(portal('/time?lang=en'));
    await page.getByRole('button', { name: 'Log time', exact: true }).first().click();
    const time = page.locator('form[action="?/createTime"]');
    await expect(
      time.locator('[data-problem-code="OPERATIONAL_PROJECT_OPTIONS_EMPTY"]'),
    ).toBeVisible();
    await expect(
      time.locator('[data-problem-code="OPERATIONAL_PROJECT_OPTIONS_EMPTY"]'),
    ).toHaveAttribute('data-kind', 'error');
    await expect(
      time.locator('[data-problem-code="OPERATIONAL_PROJECT_OPTIONS_EMPTY"]'),
    ).toContainText('Access, assignment dates, or project status may need review');
    await expect(
      time.locator('[data-problem-code="OPERATIONAL_PROJECT_OPTIONS_EMPTY"]'),
    ).toContainText('Contact the project owner');

    await page.goto(portal('/expenses?lang=en'));
    await page.getByRole('button', { name: 'Record expense', exact: true }).first().click();
    const expense = page.locator('form[action="?/createExpense"]');
    await expect(
      expense.locator('[data-problem-code="OPERATIONAL_PROJECT_OPTIONS_EMPTY"]'),
    ).toBeVisible();

    await page.goto(portal('/reports?lang=en'));
    await page.getByRole('button', { name: 'New daily report', exact: true }).first().click();
    await expect(
      page.locator(
        'form[action="?/createDailyReport"] [data-problem-code="OPERATIONAL_PROJECT_OPTIONS_EMPTY"]',
      ),
    ).toBeVisible();

    for (const [route, button, action] of [
      ['time', 'Log time', 'createTime'],
      ['expenses', 'Record expense', 'createExpense'],
      ['reports', 'New daily report', 'createDailyReport'],
    ] as const) {
      await page.goto(portal(`/${route}?lang=en&project=${unavailableProjectId}`));
      await page.getByRole('button', { name: button, exact: true }).first().click();
      const selected = page.locator(`form[action="?/${action}"] select[name="projectId"]`);
      await expect(selected).toHaveValue(unavailableProjectId);
      await expect(selected.locator(`option[value="${unavailableProjectId}"]`)).toHaveAttribute(
        'disabled',
        '',
      );
    }
    expect(pageErrors).toEqual([]);
    expect(
      failedResources.every(
        ({ status, path }) =>
          (status === 503 && path.endsWith('/api/offline/identity')) ||
          (status === 403 &&
            ['/api/expenses/crew-workers', '/api/expenses/description-default'].some((route) =>
              path.endsWith(route),
            )),
      ),
    ).toBe(true);
    expect(
      consoleErrors.every((message) =>
        /server responded with a status of (?:403 \(Forbidden\)|503 \(Service Unavailable\))/u.test(
          message,
        ),
      ),
    ).toBe(true);
  } finally {
    const restore = db.prepare('UPDATE project_member SET status=? WHERE id=?');
    for (const member of memberships) restore.run(member.status, member.id);
    db.close();
  }
});

test('manager with no project scope gets a role-safe planning warning', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'manager');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const manager = db
    .prepare('SELECT id FROM user WHERE email=?')
    .get(e2eCredentials.manager.email) as { id: string };
  const memberships = db
    .prepare('SELECT id,status FROM project_member WHERE user_id=?')
    .all(manager.id) as Array<{ id: string; status: string }>;
  db.prepare("UPDATE project_member SET status='inactive' WHERE user_id=?").run(manager.id);
  try {
    await page.goto(portal('/planning?lang=es'));
    const form = page.locator('#planning-create-form');
    const warning = form.locator('[data-problem-code="PLANNING_PROJECT_OPTIONS_EMPTY"]');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute('data-kind', 'error');
    await expect(warning).toContainText('No hay ningún proyecto disponible para planificar.');
    await expect(warning).toContainText('responsable del proyecto');
    await expect(warning.locator('a')).toHaveCount(0);
  } finally {
    const restore = db.prepare('UPDATE project_member SET status=? WHERE id=?');
    for (const member of memberships) restore.run(member.status, member.id);
    db.close();
  }
});

test('availability date order uses a localized rule without a network submission', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const locale = testInfo.project.name === 'phone-390' ? 'es' : 'pt';
  const expected =
    locale === 'es'
      ? 'El fin de la disponibilidad debe ser posterior al inicio.'
      : 'O fim da disponibilidade deve ser posterior ao início.';
  await signIn(page, 'worker');
  await page.goto(portal(`/profile?lang=${locale}`));
  await page.locator('[data-availability-calendar] button.secondary-button').first().click();
  const form = page.getByRole('dialog').locator('form.availability-editor');
  const start = form.locator('input[type="datetime-local"][name="startsAt"]');
  const end = form.locator('input[type="datetime-local"][name="endsAt"]');
  await start.fill('2026-10-02T09:00');
  await end.fill('2026-10-01T09:00');
  let postCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('setAvailability')) postCount += 1;
  });
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[data-field-error-for]')).toContainText(expected);
  await expect(end).toBeFocused();
  await expect(start).toHaveValue('2026-10-02T09:00');
  await expect(end).toHaveValue('2026-10-01T09:00');
  await end.fill('2026-10-02T09:00');
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[data-field-error-for]')).toContainText(expected);
  await expect(end).toHaveValue('2026-10-02T09:00');
  expect(postCount).toBe(0);
});
