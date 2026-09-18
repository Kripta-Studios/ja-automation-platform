import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

const requiredViewportProjects = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

test('period generator owns its project scope and offers only approved technical reports', async ({
  page,
}, testInfo) => {
  test.skip(!requiredViewportProjects.has(testInfo.project.name), 'Required viewport matrix only.');

  await signIn(page, 'finance');
  await page.goto(portal('/reports'));
  await page.waitForLoadState('networkidle');

  // Regression: choosing a project in a field-report form must not preselect the period generator.
  await page.getByRole('button', { name: 'New daily report', exact: true }).first().click();
  const dailyForm = page.locator('form[data-report-entry-surface="daily"]');
  const dailyProject = dailyForm.locator('select[name="projectId"]');
  const firstProjectId = await dailyProject
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
  if (!firstProjectId) throw new Error('The report fixture has no selectable project.');
  await dailyProject.selectOption(firstProjectId);
  await dailyForm.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.locator('details.report-generator > summary').click();
  await page.locator('[data-report-generator-cta]').click();
  const generator = page.locator('form[action="?/generatePeriodReports"]');
  await expect(generator).toBeVisible();

  const project = generator.locator('select[name="projectId"]');
  await expect(project).toHaveValue('');
  await expect(project).toHaveAttribute('required', '');

  const lineOption = project.locator('option', {
    hasText: 'Body Shop Line 4 Controls Upgrade',
  });
  await expect(lineOption).toHaveCount(1);
  const lineProjectId = await lineOption.getAttribute('value');
  if (!lineProjectId) throw new Error('The approved technical-report project has no value.');
  await project.selectOption(lineProjectId);

  const periodStart = generator.locator('input[name="periodStart"]');
  const periodEnd = generator.locator('input[name="periodEnd"]');
  await periodStart.fill('2026-08-01');
  await periodEnd.fill('2026-08-31');
  await generator
    .locator('select[name="contentMode"]')
    .selectOption('hours_activity_selected_technical');

  const technicalReports = generator.locator('input[name="technicalReportIds"]');
  await expect(technicalReports).toHaveCount(1);
  const technicalRows = await technicalReports.evaluateAll((inputs) =>
    inputs.map((input) => ({
      approvalState: input.getAttribute('data-approval-state'),
      projectId: input.getAttribute('data-project-id'),
      reportDate: input.getAttribute('data-report-date'),
    })),
  );
  expect(technicalRows).toEqual([
    expect.objectContaining({
      approvalState: expect.stringMatching(/^(approved|locked)$/u),
      projectId: lineProjectId,
      reportDate: expect.stringMatching(/^2026-08-/u),
    }),
  ]);

  await technicalReports.first().check();
  await periodEnd.fill('2026-08-10');
  await expect(technicalReports).toHaveCount(0);
  await periodEnd.fill('2026-08-31');
  await expect(technicalReports).toHaveCount(1);
  await expect(technicalReports.first()).not.toBeChecked();

  await technicalReports.first().check();
  const alternateProjectId = await project
    .locator('option')
    .evaluateAll(
      (options, current) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .find((value) => value && value !== current),
      lineProjectId,
    );
  if (!alternateProjectId) throw new Error('The report fixture has no alternate project.');
  await project.selectOption(alternateProjectId);
  await project.selectOption(lineProjectId);
  await expect(technicalReports).toHaveCount(1);
  await expect(technicalReports.first()).not.toBeChecked();

  await periodStart.fill('2026-08-20');
  await periodEnd.fill('2026-08-10');
  expect(await periodEnd.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  expect(await periodEnd.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe(
    '',
  );
});

test('report guidance is localized and role-safe for every audience', async ({
  browser,
}, testInfo) => {
  test.skip(!requiredViewportProjects.has(testInfo.project.name), 'Required viewport matrix only.');

  const cases = [
    { role: 'worker' as const, title: 'Your report workflow', privacy: 'your own compensation' },
    {
      role: 'manager' as const,
      title: 'Project review workflow',
      privacy: 'Other workers’ compensation stays restricted',
    },
    {
      role: 'finance' as const,
      title: 'Finance report workflow',
      privacy: 'customer report never includes money',
    },
    { role: 'owner' as const, title: 'Owner report workflow', privacy: 'separate internal report' },
    {
      role: 'auditor' as const,
      title: 'Read-only audit view',
      privacy: 'Customer reports contain no money',
    },
  ];

  for (const audience of cases) {
    const context = await browser.newContext({ viewport: testInfo.project.use.viewport });
    const page = await context.newPage();
    await signIn(page, audience.role);
    await page.goto(portal('/reports'));
    const guidance = page.getByLabel(audience.title);
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText(audience.privacy);
    if (audience.role === 'worker') {
      await page.goto(`${portal('/reports')}?lang=es`);
      await expect(page.getByLabel('Tu flujo de informes')).toContainText(
        'tu propia remuneración aparece por separado en Mi pago',
      );
      await page.goto(`${portal('/reports')}?lang=pt`);
      await expect(page.getByLabel('Seu fluxo de relatórios')).toContainText(
        'sua própria remuneração fica separada em Meu pagamento',
      );
    }
    await context.close();
  }
});
