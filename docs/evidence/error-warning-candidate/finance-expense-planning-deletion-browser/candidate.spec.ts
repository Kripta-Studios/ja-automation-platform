import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const problemCode = 'FINANCE_EXPENSE_PLANNING_RECORD_UNAVAILABLE';

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

function auditCount(db: DatabaseSync, expenseId: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(expenseId) as {
      count: number;
    }
  ).count;
}

async function createQaProject(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable client fixture unavailable');
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  const marker = randomUUID();
  const name = `Expense planning deletion browser ${marker}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form
    .locator('[name="costCenterCode"]')
    .fill(`QA-EPDEL-${parseInt(marker.slice(0, 8), 16)}`);
  await form.locator('[name="startDate"]').fill(today);
  await form.locator('[name="initialWorkersStartOn"]').fill(today);
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createProject'),
  );
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  expect((await pending).status()).toBeLessThan(400);
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const projectId = (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string })
    .id;
  return { projectId, workerId };
}

async function createQaDraft(owner: Page, db: DatabaseSync, projectId: string, workerId: string) {
  const marker = randomUUID();
  const description = `QA planning deletion ${marker}`;
  await owner.goto(portal(`/expenses?project=${projectId}&lang=en`));
  await owner.locator('[data-expense-primary-cta]').first().click();
  const form = owner.locator('form[action="?/createExpense"]');
  await expect(form).toBeVisible();
  await form.locator('[name="workerId"]').selectOption(workerId);
  await form.locator('[name="projectId"]').selectOption(projectId);
  await form.locator('[name="spentOn"]').fill(today);
  await form.locator('[name="category"]').selectOption('hotel');
  await form.locator('[name="amount"]').fill('12.34');
  await form.locator('[name="description"]').fill(description);
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createExpense'),
  );
  await form.getByRole('button', { name: 'Save draft' }).click();
  expect((await pending).status()).toBeLessThan(400);
  await expect
    .poll(() => db.prepare('SELECT id FROM expense WHERE description=?').get(description))
    .toBeTruthy();
  const expense = db
    .prepare('SELECT id,approval_state FROM expense WHERE description=?')
    .get(description) as { id: string; approval_state: string };
  expect(expense.approval_state).toBe('draft');
  return expense.id;
}

async function openPlanningForm(
  finance: Page,
  projectId: string,
  expenseId: string,
  locale: string,
) {
  await signIn(finance, 'finance');
  await finance.goto(
    portal(
      `/finance?view=commercial&project=${projectId}&expense=${expenseId}&lang=${locale}#expense-classification`,
    ),
  );
  const card = finance.locator(`[data-finance-expense-id="${expenseId}"]`);
  await expect(card).toBeVisible();
  const form = card.locator('form[data-finance-expense-planning]');
  if (!(await form.isVisible()))
    await card.getByRole('button', { name: /Classify|Review/ }).click();
  await expect(form).toBeVisible();
  await form.locator('[name="expectedReimbursementOn"]').fill(day(1));
  await form.locator('[name="expectedRecoveryOn"]').fill(day(2));
  return form;
}

async function deleteQaDraft(owner: Page, db: DatabaseSync, expenseId: string) {
  await owner.goto(portal(`/expenses?lang=en`));
  const form = owner.locator(`form[data-action="deleteDraft"][data-record-id="${expenseId}"]`);
  await expect(form).toBeVisible();
  owner.once('dialog', (dialog) => dialog.accept());
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/deleteDraft'),
  );
  await form.getByRole('button', { name: 'Delete' }).click();
  expect((await pending).status()).toBeLessThan(400);
  await expect
    .poll(() => db.prepare('SELECT id FROM expense WHERE id=?').get(expenseId))
    .toBeFalsy();
}

function noticeState(page: Page) {
  return page.evaluate((code) => {
    const notice = document.querySelector<HTMLElement>(
      `[data-ui="problem-notice"][data-problem-code="${code}"]`,
    );
    const wrapper = notice?.closest<HTMLElement>('[data-finance-problem]');
    const bounds = wrapper?.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const nav = document.querySelector<HTMLElement>('.bottom-nav');
    const safeTop =
      (header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
        ? header.getBoundingClientRect().bottom
        : 0) + 8;
    const safeBottom =
      nav && getComputedStyle(nav).position === 'fixed'
        ? nav.getBoundingClientRect().top - 16
        : innerHeight - 16;
    const remedy = notice?.querySelector<HTMLAnchorElement>('a');
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      recap:
        wrapper
          ?.querySelector('.finance-overview__attempted-recap')
          ?.textContent?.replace(/\s+/gu, ' ')
          .trim() ?? '',
      remedy: remedy
        ? {
            text: remedy.textContent?.trim() ?? '',
            path: new URL(remedy.href).pathname,
            view: new URL(remedy.href).searchParams.get('view'),
            lang: new URL(remedy.href).searchParams.get('lang'),
          }
        : null,
      focused: document.activeElement === wrapper || document.activeElement === notice,
      top: bounds ? Math.round(bounds.top) : null,
      bottom: bounds ? Math.round(bounds.bottom) : null,
      safeTop: Math.round(safeTop),
      safeBottom: Math.round(safeBottom),
      routeView: new URL(location.href).searchParams.get('view'),
      language: document.documentElement.lang,
      expenseCardCount: document.querySelectorAll('[data-finance-expense-id]').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, problemCode);
}

function save(name: string, data: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      data,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[qa-id]')
          : value,
      2,
    ) + '\n',
  );
}

test('deleting draft during Finance planning edit gives typed visible 404 and no write', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const height = width === 390 ? 844 : width === 430 ? 932 : 900;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const contexts = await Promise.all(
    [0, 1].map(() => browser.newContext({ viewport: { width, height } })),
  );
  const [owner, finance] = await Promise.all(contexts.map((context) => context.newPage()));
  const logs = { owner: diagnostics(owner), finance: diagnostics(finance) };
  try {
    const { projectId, workerId } = await createQaProject(owner, db);
    const expenseId = await createQaDraft(owner, db, projectId, workerId);
    const form = await openPlanningForm(finance, projectId, expenseId, locale);
    const attempted = {
      reimbursement: await form.locator('[name="expectedReimbursementOn"]').inputValue(),
      recovery: await form.locator('[name="expectedRecoveryOn"]').inputValue(),
    };
    await deleteQaDraft(owner, db, expenseId);
    const afterDeleteAudit = auditCount(db, expenseId);
    const pending = finance.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('?/setExpensePlanningDates'),
    );
    await form
      .getByRole('button', { name: /Save planning dates|Guardar fechas|Salvar datas/ })
      .click();
    const response = await pending;
    const body = await response.text();
    const network = {
      status: response.status(),
      codeInResponse: body.includes(problemCode),
      genericInResponse: body.includes('Check the submitted values'),
      valuesInResponse: body.includes(attempted.reimbursement) && body.includes(attempted.recovery),
    };
    expect(network).toEqual({
      status: 404,
      codeInResponse: true,
      genericInResponse: false,
      valuesInResponse: true,
    });
    await expect.poll(async () => (await noticeState(finance)).focused).toBe(true);
    const visible = await noticeState(finance);
    expect(visible).toMatchObject({ code: problemCode, routeView: 'commercial', overflow: false });
    expect(visible.recap).toContain(attempted.reimbursement);
    expect(visible.recap).toContain(attempted.recovery);
    expect(visible.remedy?.view).toBe('commercial');
    expect(visible.remedy?.lang).toBe(locale);
    expect(visible.top).toBeGreaterThanOrEqual((visible.safeTop ?? 0) - 2);
    expect(visible.bottom).toBeLessThanOrEqual((visible.safeBottom ?? height) + 2);
    expect(db.prepare('SELECT id FROM expense WHERE id=?').get(expenseId)).toBeUndefined();
    expect(auditCount(db, expenseId)).toBe(afterDeleteAudit);
    await finance.locator('[data-finance-problem]').screenshot({
      path: join(evidenceRoot, `${info.project.name}-${locale}-notice.png`),
    });
    await finance
      .locator(`[data-ui="problem-notice"][data-problem-code="${problemCode}"] a`)
      .first()
      .click();
    await expect(finance).toHaveURL(new RegExp(`/finance\\?view=commercial&project=${projectId}`));
    expect(await finance.locator('html').getAttribute('lang')).toBe(
      locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'pt-BR',
    );
    expect(db.prepare('SELECT id FROM expense WHERE id=?').get(expenseId)).toBeUndefined();
    expect(auditCount(db, expenseId)).toBe(afterDeleteAudit);
    expect(logs).toEqual({ owner: [], finance: [] });
    save(`${info.project.name}-${locale}-results.json`, {
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
      viewport: { width, height },
      locale,
      roles: ['owner', 'finance'],
      fixture: 'Owner UI created a QA draft; Finance held planning edit; Owner UI deleted draft',
      attempted,
      network,
      visible,
      noExpenseOrAuditWrite: true,
      review: { financeCommercialList: true, localePreserved: true },
      diagnostics: logs,
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    db.close();
  }
});
