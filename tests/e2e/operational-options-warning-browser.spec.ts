import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type Assignment = { assignmentId: string; workerId: string; projectId: string; startsOn: string };
type Locale = 'es' | 'pt';

const unavailableProjectId = '00000000-0000-4000-8000-00000000abcd';
const routes = [
  { path: 'time', action: 'createTime', label: 'Log time' },
  { path: 'expenses', action: 'createExpense', label: 'Record expense' },
  { path: 'reports', action: 'createDailyReport', label: 'New daily report' },
] as const;
const localizedButtons = {
  es: ['Registrar horas', 'Registrar gasto', 'Nuevo informe diario'],
  pt: ['Registrar horas', 'Registrar despesa', 'Novo relatório diário'],
} as const;

function activeAssignment(db: DatabaseSync): Assignment {
  const row = db
    .prepare(
      `SELECT pm.id assignmentId,pm.user_id workerId,pm.project_id projectId,pm.starts_on startsOn
         FROM project_member pm
         JOIN user u ON u.id=pm.user_id
         JOIN project p ON p.id=pm.project_id
        WHERE pm.status='active' AND u.status='active'
          AND u.role IN ('worker','project_manager')
          AND p.status IN ('active','planned','paused')
        ORDER BY pm.starts_on,pm.id LIMIT 1`,
    )
    .get() as Assignment | undefined;
  if (!row) throw new Error('Disposable fixture needs an active worker assignment');
  return row;
}

async function openOperationalForm(
  page: Page,
  route: (typeof routes)[number],
  locale: Locale,
  extraQuery = '',
) {
  await page.goto(portal(`/${route.path}?lang=${locale}${extraQuery}`));
  const label = localizedButtons[locale][routes.indexOf(route)];
  await page.getByRole('button', { name: label, exact: true }).first().click();
  const form = page.locator(`form[action="?/${route.action}"]`);
  await expect(form).toBeVisible();
  return form;
}

test('Owner sees worker-empty guidance in all operational forms and reaches Team Directory', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const locale: Locale = testInfo.project.name === 'phone-390' ? 'es' : 'pt';
  await signIn(page, 'owner');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const people = db
    .prepare(
      "SELECT id,status FROM user WHERE role IN ('worker','project_manager') AND status='active'",
    )
    .all() as Array<{ id: string; status: string }>;
  expect(people.length).toBeGreaterThan(0);
  const disable = db.prepare("UPDATE user SET status='suspended' WHERE id=?");
  for (const person of people) disable.run(person.id);
  try {
    for (const route of routes) {
      const form = await openOperationalForm(page, route, locale);
      const notice = form.locator('[data-problem-code="OPERATIONAL_WORKER_OPTIONS_EMPTY"]');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute('data-kind', 'error');
      await expect(notice).toContainText(
        locale === 'es' ? 'No hay ningún trabajador activo' : 'Nenhum trabalhador ativo',
      );
      const review = notice.getByRole('link', {
        name:
          locale === 'es'
            ? 'Revisar trabajadores disponibles'
            : 'Revisar trabalhadores disponíveis',
      });
      const href = await review.getAttribute('href');
      if (!href) throw new Error('Worker review remedy must be a link');
      const destination = new URL(href, page.url());
      expect(destination.pathname).toBe(new URL(portal('/projects')).pathname);
      expect(destination.searchParams.get('view')).toBe('team');
      expect(destination.searchParams.get('lang')).toBe(locale);
      if (route.path === 'time') {
        await review.click();
        await expect(page.locator('[data-team-directory]')).toBeVisible();
        const specialists = page.locator('#team-panel-specialists');
        await expect(specialists).toBeVisible();
        await expect(specialists).toBeFocused();
        await expect
          .poll(async () => {
            const heading = await specialists.locator('h2').first().boundingBox();
            const header = await page.locator('.portal-layout > header').boundingBox();
            if (!heading || !header) return false;
            return heading.y >= header.y + header.height - 2;
          })
          .toBe(true);
      }
    }
  } finally {
    const restore = db.prepare('UPDATE user SET status=? WHERE id=?');
    for (const person of people) restore.run(person.status, person.id);
    db.close();
  }
});

test('Time explains date-specific assignment loss and keeps project in the review destination', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const locale: Locale = testInfo.project.name === 'phone-390' ? 'es' : 'pt';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const assignment = activeAssignment(db);
  db.close();
  const beforeAssignment = new Date(Date.parse(`${assignment.startsOn}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  await signIn(page, 'owner');
  const form = await openOperationalForm(
    page,
    routes[0],
    locale,
    `&project=${assignment.projectId}&date=${beforeAssignment}`,
  );
  await form.locator('select[name="workerId"]').selectOption(assignment.workerId);
  const notice = form.locator('[data-problem-code="OPERATIONAL_ASSIGNMENT_UNAVAILABLE_FOR_DATE"]');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    locale === 'es'
      ? 'No hay ninguna asignación que cubra a este trabajador en esta fecha.'
      : 'Nenhuma atribuição cobre este trabalhador nesta data.',
  );
  await expect(form.locator('input[name="workDate"]')).toHaveValue(beforeAssignment);
  await expect(form.locator('select[name="projectId"]')).toHaveValue(assignment.projectId);
  const review = notice.getByRole('link', {
    name: locale === 'es' ? 'Revisar asignaciones' : 'Revisar atribuições',
  });
  const href = await review.getAttribute('href');
  if (!href) throw new Error('Assignment review remedy must be a link');
  const destination = new URL(href, page.url());
  expect(destination.pathname).toBe(new URL(portal('/projects')).pathname);
  expect(destination.searchParams.get('action')).toBe('update-assignment');
  expect(destination.searchParams.get('project')).toBe(assignment.projectId);
  expect(destination.searchParams.get('worker')).toBe(assignment.workerId);
  expect(destination.searchParams.get('lang')).toBe(locale);
  expect(destination.hash).toBe('#project-assignment-list');
  // The entered worker/date make this form dirty; accept its leave confirmation
  // to exercise the remedy destination a person intentionally chose.
  page.once('dialog', (dialog) => void dialog.accept());
  await review.click();
  await expect(page.locator('#project-assignment-list')).toBeVisible();
  await expect(
    page.locator(`#project-assignment-list form[data-assignment-id="${assignment.assignmentId}"]`),
  ).toBeVisible();
});

test('Unselectable project shows one localized cause and does not trigger Expense lookups', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const locale: Locale = testInfo.project.name === 'phone-390' ? 'es' : 'pt';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const assignment = activeAssignment(db);
  db.close();
  await signIn(page, 'owner');
  const lookups: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      /\/api\/expenses\/(?:description-default|time-options|crew-workers)/u.test(request.url())
    )
      lookups.push(new URL(request.url()).pathname);
  });
  for (const route of routes) {
    const form = await openOperationalForm(
      page,
      route,
      locale,
      `&project=${unavailableProjectId}${route.path === 'time' ? `&date=${assignment.startsOn}` : ''}`,
    );
    if (route.path === 'time' || route.path === 'expenses')
      await form.locator('select[name="workerId"]').selectOption(assignment.workerId);
    const selected = form.locator('select[name="projectId"]');
    await expect(selected).toHaveValue(unavailableProjectId);
    await expect(selected.locator(`option[value="${unavailableProjectId}"]`)).toHaveAttribute(
      'disabled',
      '',
    );
    const notice = form.locator('[data-problem-code="OPERATIONAL_SELECTED_PROJECT_UNAVAILABLE"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      locale === 'es'
        ? 'El proyecto seleccionado no está disponible en este formulario.'
        : 'O projeto selecionado está indisponível neste formulário.',
    );
    await expect(
      form.locator('[data-problem-code="EXPENSE_LOOKUP_DESCRIPTION_SCOPE_DENIED"]'),
    ).toHaveCount(0);
  }
  await page.waitForTimeout(300);
  expect(lookups).toEqual([]);
});

test('Worker expense with a removed project keeps one warning and avoids a forbidden lookup', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'worker');
  const lookups: string[] = [];
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      /\/api\/expenses\/(?:description-default|time-options|crew-workers)/u.test(request.url())
    )
      lookups.push(new URL(request.url()).pathname);
  });
  page.on('response', (response) => {
    if (
      response.status() === 403 &&
      /\/api\/expenses\/(?:description-default|time-options|crew-workers)/u.test(response.url())
    )
      forbidden.push(new URL(response.url()).pathname);
  });
  await page.goto(portal(`/expenses?lang=en&project=${unavailableProjectId}`));
  await page.getByRole('button', { name: 'Record expense', exact: true }).first().click();
  const form = page.locator('form[action="?/createExpense"]');
  const warning = form.locator('[data-problem-code="OPERATIONAL_SELECTED_PROJECT_UNAVAILABLE"]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('The selected project is unavailable for this form.');
  await expect(form.locator('select[name="projectId"]')).toHaveValue(unavailableProjectId);
  await expect(form.locator('select[name="projectId"] option:checked')).toHaveAttribute(
    'disabled',
    '',
  );
  await expect(
    form.locator('[data-problem-code="EXPENSE_LOOKUP_DESCRIPTION_SCOPE_DENIED"]'),
  ).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(lookups).toEqual([]);
  expect(forbidden).toEqual([]);
});
