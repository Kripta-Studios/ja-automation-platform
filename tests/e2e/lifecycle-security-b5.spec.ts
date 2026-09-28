import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('owner sees explicit non-destructive client/project lifecycle controls', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects'));
  for (const action of ['transitionClient', 'transitionProject']) {
    const form = page.locator(`[data-action='${action}']`).first();
    await expect(form).toBeVisible();
    await expect(form.locator('input[name="version"]')).toHaveValue(/^[1-9][0-9]*$/);
    await expect(form.locator('input[name="reason"]')).toHaveAttribute('required', '');
    await expect(form.getByRole('button')).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /archive|restore|close/i }).first()).toBeVisible();
});

test('report detail exposes delete-draft rather than legacy hard delete', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/reports'));
  const summary = `Lifecycle draft ${randomUUID()}`;
  await page.getByRole('button', { name: 'New daily report', exact: true }).click();
  const form = page.locator('form[data-report-entry-surface="daily"]');
  const project = form.locator('select[name="projectId"]');
  const projectId = await project
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
  if (!projectId) throw new Error('Fixture has no assigned project');
  await project.selectOption(projectId);
  await form.locator('input[name="workDate"]').fill('2026-08-24');
  await form.locator('textarea[name="summary"]').fill(summary);
  await form
    .locator('textarea[name="tasksCompleted"]')
    .fill('Prepared disposable lifecycle evidence');
  await form.getByRole('button', { name: 'Save daily report', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /draft saved/i })).toBeVisible();
  const reportLink = page.locator('a.report-register-link').filter({ hasText: summary });
  await expect(reportLink).toBeVisible();
  await reportLink.click();
  await expect(
    page.locator("[data-action='deleteDraft'][data-record-type][data-record-id]"),
  ).toBeVisible();
  await expect(page.locator('form[action*="deleteReport"]')).toHaveCount(0);
});
