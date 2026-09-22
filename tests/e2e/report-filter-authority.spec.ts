import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

const requiredViewportProjects = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

test('report filters authoritatively control sign-off and generated records', async ({
  page,
}, testInfo) => {
  test.skip(!requiredViewportProjects.has(testInfo.project.name), 'Required viewport matrix only.');

  await signIn(page, 'owner');
  await page.goto(`${portal('/reports')}?view=signoff`);
  await page.waitForLoadState('networkidle');

  const filters = page.locator('form.report-register-filters');
  const search = filters.locator('input[name="q"]');
  const status = filters.locator('select[name="status"]');
  const signoffRegister = page.locator('.report-signoff-register');
  const generatedRegister = page.locator('.report-period-register');
  const signoffCards = signoffRegister.locator('.report-signoff-card');
  const generatedCards = generatedRegister.locator('.report-period-card');

  await expect(filters).toBeVisible();
  await expect(filters.locator('select[name="worker"]')).toHaveCount(0);
  await expect(signoffRegister.locator('.record-browser__controls')).toHaveCount(0);
  await expect(generatedRegister.locator('.record-browser__controls')).toHaveCount(0);
  const initialSignoffCount = await signoffCards.count();
  const initialGeneratedCount = await generatedCards.count();
  expect(initialSignoffCount).toBeGreaterThan(0);
  expect(initialGeneratedCount).toBeGreaterThan(0);

  const firstSignoffState = await signoffCards.first().getAttribute('data-conformity-state');
  if (!firstSignoffState) throw new Error('Sign-off fixture row has no conformity state.');
  await status.selectOption(firstSignoffState);
  await expect(signoffCards).not.toHaveCount(0);
  for (const stateValue of await signoffCards.evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-conformity-state')),
  ))
    expect(stateValue).toBe(firstSignoffState);

  await page.getByRole('tab', { name: 'Daily', exact: true }).click();
  await expect(status).toHaveValue('');
  const worker = filters.locator('select[name="worker"]');
  await expect(worker).toHaveCount(1);
  const workerId = await worker
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
  if (!workerId) throw new Error('Report fixture has no worker filter option.');
  if (
    !(await filters
      .locator('.ui-disclosure')
      .evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await filters.locator('.ui-disclosure > summary').click();
  await worker.selectOption(workerId);
  await page.getByRole('tab', { name: 'Client Sign-off', exact: true }).click();
  await expect(status).toHaveValue('');
  await expect(filters.locator('select[name="worker"]')).toHaveCount(0);
  await expect(page.locator('[data-filter-summary]')).not.toContainText('Worker:');
  await status.selectOption(firstSignoffState);

  await page.locator('[data-filter-summary]').getByRole('link', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'signoff');
  await expect(search).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(signoffCards).toHaveCount(initialSignoffCount);

  const generatedProject = (await generatedCards.first().locator('strong').textContent())
    ?.split('·')[0]
    ?.trim();
  const generatedState = await generatedCards.first().getAttribute('data-period-state');
  if (!generatedProject || !generatedState)
    throw new Error('Generated report fixture row lacks searchable project/status data.');
  await search.fill(generatedProject);
  await status.selectOption(generatedState);
  await expect(generatedCards).not.toHaveCount(0);
  for (const card of await generatedCards.all()) {
    await expect(card).toContainText(generatedProject);
    await expect(card).toHaveAttribute('data-period-state', generatedState);
  }

  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === generatedProject);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(search).toHaveValue(generatedProject);
  await expect(status).toHaveValue(generatedState);
  await expect(generatedCards).not.toHaveCount(0);

  await search.fill('no-report-can-match-this-value');
  await expect(signoffRegister.locator('.report-empty')).toHaveCount(1);
  await expect(generatedRegister.locator('.report-empty')).toHaveCount(1);
  await expect(signoffRegister.getByText('No matching records.', { exact: true })).toHaveCount(1);
  await expect(generatedRegister.getByText('No matching records.', { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-filter-summary]')).toContainText('0 matching records');
  await expect(signoffRegister.getByRole('button', { name: /Previous|Next/ })).toHaveCount(0);
  await expect(generatedRegister.getByRole('button', { name: /Previous|Next/ })).toHaveCount(0);

  await page.locator('[data-filter-summary]').getByRole('link', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(generatedCards).toHaveCount(initialGeneratedCount);

  await page.getByRole('tab', { name: 'Daily', exact: true }).click();
  const generatedCount = generatedRegister.locator('.report-period-register-header > span');
  const generatedTotal = await generatedCount.textContent();
  if (
    !(await filters
      .locator('.ui-disclosure')
      .evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await filters.locator('.ui-disclosure > summary').click();
  await worker.selectOption(workerId);
  await expect(generatedCards).toHaveCount(0);
  await expect(generatedCount).toHaveText('0');
  await expect(generatedRegister.getByText('No matching records.', { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-filter-summary]')).toContainText('Worker:');

  await search.fill('no-field-report-can-match-this-value');
  const dailyRegister = page.locator('[data-report-tab="daily"] .report-register');
  await expect(dailyRegister.getByText('No matching records.', { exact: true })).toHaveCount(1);
  await expect(dailyRegister.getByText('No daily reports recorded.', { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
  const technicalRegister = page.locator('[data-report-tab="technical"] .report-register');
  await expect(technicalRegister.getByText('No matching records.', { exact: true })).toHaveCount(1);
  await expect(
    technicalRegister.getByText('No technical reports recorded.', { exact: true }),
  ).toHaveCount(0);

  await page.locator('[data-filter-summary]').getByRole('link', { name: 'Clear filters' }).click();
  await expect(worker).toHaveValue('');
  await expect(search).toHaveValue('');
  await expect(generatedCards).toHaveCount(initialGeneratedCount);
  await expect(generatedCount).toHaveText(generatedTotal ?? '');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});
