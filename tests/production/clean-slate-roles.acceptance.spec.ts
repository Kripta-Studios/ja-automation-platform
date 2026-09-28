import { expect, test, type Response } from '@playwright/test';

const base = '/j-aautomation/app';
const retainedProjectId = 'project-cp020-bbs-mexico';
const privateTerms = /(?:workerCompensation|compensationRuleId|payRateMinor|internalCostRate|customerChargeRate|worker_pay_rate|worker_compensation_rule)/iu;

async function expectOperationalResponsePrivateFieldsAbsent(response: Response | null): Promise<void> {
  expect(response).not.toBeNull();
  expect(await response!.text()).not.toMatch(privateTerms);
}

function state(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must point to an existing browser state`);
  return value;
}

test.describe('worker after the clean-slate cutover', () => {
  test.use({ storageState: state('JA_PRODUCTION_WORKER_AUTH_STATE') });

  test('session and operational sections load while finance stays server-denied', async ({ page }) => {
    for (const section of ['time', 'expenses', 'projects']) {
      const response = await page.goto(`${base}/${section}?lang=en`);
      expect(response?.status(), section).toBe(200);
      expect(page.url(), section).not.toContain('/login');
      await expectOperationalResponsePrivateFieldsAbsent(response);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main')).not.toContainText(
        /worker compensation rule|internal cost rate|customer charge rate/i,
      );
    }
    for (const path of [
      `${base}/finance?view=commercial&project=${retainedProjectId}`,
      `${base}/projects/${retainedProjectId}/calculation`,
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(403);
    }
  });
});

test.describe('finance after the clean-slate cutover', () => {
  test.use({ storageState: state('JA_PRODUCTION_FINANCE_AUTH_STATE') });

  test('session opens finance and the retained project calculation', async ({ page }) => {
    const finance = await page.goto(`${base}/finance?view=commercial&project=${retainedProjectId}&lang=en`);
    expect(finance?.status()).toBe(200);
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('main')).toBeVisible();

    const calculation = await page.goto(`${base}/projects/${retainedProjectId}/calculation?lang=en`);
    expect(calculation?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('chief after the clean-slate cutover', () => {
  test.use({ storageState: state('JA_PRODUCTION_CHIEF_AUTH_STATE') });

  test('session opens crew but cannot access project finance or another crew', async ({ page }) => {
    const crew = await page.goto(`${base}/crew?lang=en`);
    expect(crew?.status()).toBe(200);
    expect(page.url()).not.toContain('/login');
    await expectOperationalResponsePrivateFieldsAbsent(crew);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(
      /worker compensation rule|internal cost rate|customer charge rate/i,
    );

    for (const path of [
      `${base}/finance?view=commercial&project=${retainedProjectId}`,
      `${base}/projects/${retainedProjectId}/calculation`,
      `${base}/crew?project=${retainedProjectId}`,
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(403);
    }
  });
});
