import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

function seedDraft(viewport: string) {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  const monday = new Date(`${today}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  try {
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const workerId = userId(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Consequence warning ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-CONSEQUENCE', 89, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
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
        reason: 'Activate disposable consequence warning project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: today });
    repository.createTimeEntry(repository.principalFor(workerId), {
      projectId,
      workDate: today,
      category: 'regular',
      minutes: 60,
      summary: 'Consequence warning draft',
    });
    const projectNumber = (
      database.sqlite.prepare('SELECT project_number FROM project WHERE id=?').get(projectId) as {
        project_number: string;
      }
    ).project_number;
    return { projectId, projectNumber, weekStart: monday.toISOString().slice(0, 10) };
  } finally {
    database.sqlite.close();
  }
}

test('worker sees time submission and expense payer consequences before submitting', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const { projectId, projectNumber, weekStart } = seedDraft(info.project.name);
  const pageErrors: string[] = [];
  const businessPosts: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await signIn(page, 'worker');
  page.on('request', (request) => {
    if (request.method() === 'POST') businessPosts.push(request.url());
  });

  await page.goto(portal(`/time?lang=en&week=${weekStart}`));
  const weekWarning = page.locator('[data-problem-code="WARNING_TIME_WEEK_SUBMIT_ALL_DRAFTS"]');
  await expect(weekWarning).toBeVisible();
  await expect(weekWarning).toContainText('draft time entries');
  await expect(weekWarning.getByRole('link', { name: 'Review week drafts' })).toBeVisible();
  const record = page.locator('article.time-record').filter({ hasText: projectNumber });
  const submitWarning = record.locator('[data-problem-code="WARNING_TIME_SUBMIT_REVIEW"]');
  await expect(submitWarning).toBeVisible();
  await expect(submitWarning).toContainText('correction workflow');
  await expect(submitWarning.getByRole('link', { name: 'Review time draft' })).toBeVisible();
  await expect(record.getByRole('button', { name: 'Submit', exact: true })).toBeVisible();

  await page.goto(portal(`/expenses?lang=en&project=${projectId}`));
  await page.locator('[data-expense-primary-cta]').click();
  const form = page.locator('form[data-expense-entry-surface]');
  const payer = form.locator('select[name="whoPaid"]');
  const payerWarning = form.locator('[data-problem-code="WARNING_EXPENSE_PAYER_FACTS"]');
  await expect(payerWarning).toBeVisible();
  await expect(payerWarning).toContainText('amount, currency, payer and receipt');
  await expect(payerWarning).not.toContainText('customer billing');
  await expect(payerWarning).toContainText('Review who paid');
  await payer.selectOption('client');
  await expect(payer).toHaveValue('client');
  await expect(payerWarning).toBeVisible();
  expect(businessPosts).toEqual([]);
  expect(pageErrors).toEqual([]);
});
