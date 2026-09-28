import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const base = '/j-aautomation/app';
const statePath = process.env.JA_LIVE_QA_STATE_PATH ?? '/tmp/jaqa-lifecycle-state.json';
const financeState = process.env.JA_PRODUCTION_FINANCE_AUTH_STATE;
const managerId = process.env.JA_LIVE_QA_MANAGER_ID;

type JourneyState = {
  marker: string;
  clientId?: string;
  projectId?: string;
  projectManagerId?: string;
  billingSetupSaved?: boolean;
  createdAt: string;
};

function readState(): JourneyState {
  if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, 'utf8')) as JourneyState;
  const createdAt = new Date().toISOString();
  const state = { marker: `QA LIVE LIFECYCLE ${createdAt.replace(/[^0-9]/gu, '')}`, createdAt };
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' });
  return state;
}

function saveState(state: JourneyState): void {
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

test.use({ storageState: financeState ?? '' });

test.beforeAll(() => {
  if (!financeState || !existsSync(financeState))
    throw new Error(
      'JA_PRODUCTION_FINANCE_AUTH_STATE must name the existing Finance test-account state',
    );
  if (!managerId || !/^[0-9a-f-]{36}$/iu.test(managerId))
    throw new Error('JA_LIVE_QA_MANAGER_ID must name the designated Project Manager test account');
});

test('Finance test account creates a resumable QA client and project with optional fields blank', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const state = readState();
  const response = await page.goto(`${base}/projects?lang=en`);
  expect(response?.status()).toBe(200);

  if (!state.clientId) {
    const existing = page.locator('[data-client-id]').filter({ hasText: state.marker });
    if (await existing.count()) {
      await expect(existing).toHaveCount(1);
      state.clientId = (await existing.getAttribute('data-client-id')) ?? undefined;
      saveState(state);
    }
  }
  if (!state.clientId) {
    const newClient = page.getByRole('button', { name: 'New Client', exact: true });
    if (!(await newClient.isVisible()))
      await page.locator('.workspace-actions-disclosure > summary').click();
    await newClient.click();
    const form = page.locator('form[action="?/createClient"]');
    await form.locator('[name="legalName"]').fill(state.marker);
    await form.locator('[name="displayName"]').fill(state.marker);
    await form.locator('[name="currency"]').selectOption('EUR');
    await form.locator('[name="timezone"]').fill('Europe/Madrid');
    await form.locator('[name="billingEmail"]').fill('qa-lifecycle@example.test');
    await form.locator('[name="billingAddress"]').fill('QA Test Street 1, Madrid');
    await form.getByRole('button', { name: 'Create client', exact: true }).click();
    const card = page.locator('[data-client-id]').filter({ hasText: state.marker });
    await expect(card).toHaveCount(1);
    state.clientId = (await card.getAttribute('data-client-id')) ?? undefined;
    expect(state.clientId).toBeTruthy();
    saveState(state);
  }
  await page.goto(`${base}/projects?lang=en`);
  await expect(page.locator(`[data-client-id="${state.clientId}"]`)).toHaveCount(1);

  if (!state.projectId) {
    await page.getByRole('searchbox', { name: 'Search: Project' }).fill(state.marker);
    const existing = page.locator('.project-list-link').filter({ hasText: state.marker });
    if (await existing.count()) {
      await expect(existing).toHaveCount(1);
      const href = await existing.locator('a[href*="/projects/"]').first().getAttribute('href');
      state.projectId = href?.split('/').at(-1);
      saveState(state);
    }
  }
  if (!state.projectId) {
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await form.locator('[name="clientId"]').selectOption(state.clientId!);
    await form.locator('[name="name"]').fill(state.marker);
    await form.locator('[name="costCenterCode"]').fill('QA-LIVE-LIFECYCLE');
    await form.locator('[name="projectAlias"]').fill('QA lifecycle');
    const managerOption = form.locator(`[name="projectManagerId"] option[value="${managerId}"]`);
    await expect(managerOption).toHaveCount(1);
    state.projectManagerId = managerId;
    expect(state.projectManagerId).toBeTruthy();
    await form.locator('[name="projectManagerId"]').selectOption(state.projectManagerId!);
    for (const field of [
      'plannedEndDate',
      'revenueBudgetMinor',
      'poCapMinor',
      'laborBudgetMinutes',
      'expenseBudgetMinor',
      'travelBudgetMinor',
    ])
      await expect(form.locator(`[name="${field}"]`)).toHaveValue('');
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.locator('[data-project-setup-next]')).toBeVisible();
    await page.goto(`${base}/projects?lang=en`);
    await page.getByRole('searchbox', { name: 'Search: Project' }).fill(state.marker);
    const row = page.locator('.project-list-link').filter({ hasText: state.marker });
    await expect(row).toHaveCount(1);
    const href = await row.locator('a[href*="/projects/"]').first().getAttribute('href');
    expect(href).toMatch(/\/projects\/[^/]+$/u);
    state.projectId = href?.split('/').at(-1);
    saveState(state);
  }

  await page.goto(`${base}/projects/${state.projectId}?lang=en`);
  await expect(page.locator('main')).toContainText(state.marker);
  await page.reload();
  await expect(page.locator('main')).toContainText('QA-LIVE-LIFECYCLE');
  await expect(page.locator('[data-project-edit-cta]')).toHaveCount(0);
});

test('Finance test account checks billing readiness and saves combined setup when configured', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const state = readState();
  if (!state.projectId) throw new Error('Create the QA project before configuring billing');
  await page.goto(`${base}/projects/${state.projectId}?tab=billing&lang=en`);
  const setup = page.getByRole('region', { name: 'Project billing setup' });
  await expect(setup).toBeVisible();
  await expect(setup.locator('[name="mode"]')).toHaveValue('combined');
  if (!state.billingSetupSaved) {
    await setup.getByRole('button', { name: 'Continue' }).click();
    const issuerOptions = await setup.getByLabel('Issuing legal entity').locator('option').count();
    const taxOptions = await setup.getByLabel('Labor tax profile').locator('option').count();
    if (issuerOptions === 1 || taxOptions === 1) {
      await expect(
        setup.getByText(
          'An active issuing entity and tax profile in the project currency are required before invoices can be configured.',
        ),
      ).toBeVisible();
      await expect(setup.getByRole('button', { name: 'Continue' })).toBeDisabled();
      test.info().annotations.push({
        type: 'BLOCKED',
        description:
          'No active test issuing legal entity and tax profile exist after clean-slate cleanup; combined setup remains unsaved.',
      });
      return;
    }
    await setup.getByLabel('Issuing legal entity').selectOption({ index: 1 });
    await setup.getByLabel('Labor tax profile').selectOption({ index: 1 });
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Save billing setup' }).click();
    await expect(setup.getByText('Billing setup saved')).toBeVisible();
    state.billingSetupSaved = true;
    saveState(state);
  }
  await page.reload();
  await expect(setup.locator('[name="mode"]')).toHaveValue('combined');
});

test('Project Manager test session sees only its scoped project assignment controls', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const state = readState();
  if (!state.projectId) throw new Error('Create the QA project before checking manager access');
  const managerState = process.env.JA_PRODUCTION_MANAGER_AUTH_STATE;
  if (!managerState || !existsSync(managerState))
    throw new Error(
      'JA_PRODUCTION_MANAGER_AUTH_STATE must point to the private Project Manager test session',
    );
  const context = await browser.newContext({
    baseURL: process.env.JA_PRODUCTION_ACCEPTANCE_ORIGIN,
    storageState: managerState,
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${base}/projects/${state.projectId}?tab=team&lang=en`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toContainText(state.marker);
    const expectAssignment = process.env.JA_LIVE_QA_EXPECT_PM_ASSIGNMENT === '1';
    if (expectAssignment)
      await expect(page.getByRole('link', { name: 'Assign worker' })).toBeVisible();
    else await expect(page.getByRole('link', { name: 'Assign worker' })).toHaveCount(0);
    const assignmentResponse = await page.goto(
      `${base}/projects?action=assign-worker&project=${state.projectId}&lang=en`,
    );
    expect(assignmentResponse?.status()).toBe(200);
    if (expectAssignment) await expect(page.locator('form[action="?/assignWorker"]')).toBeVisible();
    else await expect(page.locator('form[action="?/assignWorker"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
