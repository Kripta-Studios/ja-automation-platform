import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';

type BrowserRole = keyof typeof e2eCredentials;

const palette = (page: Page) => page.locator('[data-section-search-dialog]');
const searchInput = (page: Page) => palette(page).locator('[data-section-search-input]');
const taskResult = (page: Page, id: string) =>
  palette(page).locator(`[data-assistant-task="${id}"]`);

const businessMutations = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const requests: string[] = [];
  businessMutations.set(page, requests);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      request.method() !== 'GET' &&
      [...url.searchParams.keys()].some((key) => key.startsWith('/'))
    )
      requests.push(`${request.method()} ${url.pathname}${url.search}`);
  });
});
test.afterEach(({ page }) => {
  expect(
    businessMutations.get(page),
    'navigation search must not submit a business action',
  ).toEqual([]);
});

async function openSectionSearch(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  const trigger = page.locator('.section-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(palette(page)).toBeVisible();
  await expect(searchInput(page)).toBeFocused();
}

async function assertResultLabelsFit(page: Page): Promise<void> {
  const results = palette(page).locator('.section-result');
  const count = await results.count();
  for (let index = 0; index < count; index += 1) {
    const result = results.nth(index);
    await expect(result).toBeVisible();
    const dimensions = await result.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const label = element.querySelector('span');
      return {
        x: box.x,
        right: box.right,
        height: box.height,
        labelOverflow: label ? label.scrollWidth > label.clientWidth + 1 : false,
      };
    });
    expect(dimensions.height).toBeGreaterThanOrEqual(44);
    expect(dimensions.x).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(dimensions.labelOverflow).toBe(false);
  }
}

async function expectTaskInTopThree(page: Page, query: string, expectedId: string): Promise<void> {
  await searchInput(page).fill(query);
  const expected = taskResult(page, expectedId);
  await expect(expected).toBeVisible();
  const taskIds = await palette(page)
    .locator('[data-assistant-task]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-assistant-task')));
  expect(taskIds.slice(0, 3)).toContain(expectedId);
  await assertResultLabelsFit(page);
}

async function expectNoFinanceMutationTask(page: Page, query: string): Promise<void> {
  await searchInput(page).fill(query);
  for (const id of ['invoice-create', 'billing-tax', 'finance-compensation-create'])
    await expect(taskResult(page, id)).toHaveCount(0);
  await assertResultLabelsFit(page);
}

const routeByRole: Record<BrowserRole, string> = {
  owner: '/projects?lang=en',
  finance: '/finance?view=overview&lang=en',
  auditor: '/finance?view=overview&lang=en',
  manager: '/projects?lang=en',
  worker: '/time?lang=en',
  worker2: '/time?lang=en',
};

test('Owner discovers and opens invoice creation, tax setup and compensation settings', async ({
  page,
}, info) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'owner');
  await page.goto(portal(routeByRole.owner));
  await openSectionSearch(page);

  await expectTaskInTopThree(page, 'crear factura', 'invoice-create');
  await expectTaskInTopThree(page, 'impuestos', 'billing-tax');
  await expectTaskInTopThree(page, 'salario', 'finance-compensation-create');
  await expectTaskInTopThree(page, 'IVA', 'billing-tax');
  await expectTaskInTopThree(page, 'invite a worker', 'team-invite');
  await expect(palette(page).getByText(/artefacto privado/iu)).toHaveCount(0);

  await searchInput(page).fill('create invoice');
  await taskResult(page, 'invoice-create').click();
  await expect(palette(page)).not.toBeVisible();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('assistantSurface') === 'invoice-create',
  );
  await expect(page.locator('[data-invoice-composer]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('owner-invoice-search.png') });
});

test('Canonical owner keeps team invite searchable in standalone project chrome', async ({
  page,
}) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'owner');
  await page.goto(portal('/projects/project-cp008-ascension?lang=en'));
  await openSectionSearch(page);

  await expectTaskInTopThree(page, 'invite a worker', 'team-invite');
});

test('Owner record handoff loads authorized workspace results from sections and project detail', async ({
  page,
}) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'owner');

  for (const source of ['/projects?lang=en', '/projects/project-cp008-ascension?lang=en']) {
    await page.goto(portal(source));
    await openSectionSearch(page);
    await searchInput(page).fill('Body Shop');

    const handoff = palette(page).locator('[data-section-result-kind="record-search"]');
    const destination = new URL((await handoff.getAttribute('href'))!, page.url());
    expect(destination.pathname).toBe('/j-aautomation/app/');
    expect(destination.searchParams.get('q')).toBe('Body Shop');
    expect(destination.searchParams.get('lang')).toBe('en');

    await handoff.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname.replace(/\/$/, '') === '/j-aautomation/app' &&
        url.searchParams.get('q') === 'Body Shop' &&
        url.searchParams.get('lang') === 'en',
    );
    const results = page.locator('.search-results');
    await expect(results).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Search results' })).toBeVisible();
    await expect(
      results.locator('a.search-result').filter({ hasText: 'Body Shop Line 4' }),
    ).toBeVisible();
  }
});

test('Finance finds invoice, tax and salary destinations in English and Portuguese', async ({
  page,
}, info) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'finance');
  await page.goto(portal(routeByRole.finance));
  await openSectionSearch(page);

  await expectTaskInTopThree(page, 'invoice', 'invoice-create');
  await expectTaskInTopThree(page, 'criar fatura', 'invoice-create');
  await expectTaskInTopThree(page, 'imposto', 'billing-tax');
  await expectTaskInTopThree(page, 'salary', 'finance-compensation-create');
  await expectTaskInTopThree(page, 'salário', 'finance-compensation-create');

  await searchInput(page).fill('imposto');
  await taskResult(page, 'billing-tax').click();
  await expect(page).toHaveURL((url) => url.searchParams.get('setup') === 'tax');
  await page.screenshot({ path: info.outputPath('finance-tax-search.png') });
});

test('Worker sees own compensation and a separate role-scoped record search handoff', async ({
  page,
}, info) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'worker');
  await page.goto(portal(routeByRole.worker));
  await openSectionSearch(page);

  await expectTaskInTopThree(page, 'salary', 'pay-statement');
  await expectTaskInTopThree(page, 'salario', 'pay-statement');
  await expectTaskInTopThree(page, 'salário', 'pay-statement');
  await expectNoFinanceMutationTask(page, 'invoice');
  const recordHandoff = palette(page).locator('[data-section-result-kind="record-search"]');
  await expect(recordHandoff).toContainText('invoice');
  const target = new URL((await recordHandoff.getAttribute('href'))!, page.url());
  expect(target.searchParams.get('q')).toBe('invoice');
  expect(target.searchParams.get('lang')).toBe('en');

  await searchInput(page).fill('salary');
  await searchInput(page).press('ArrowDown');
  await expect(palette(page).locator('.section-result').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).not.toBeVisible();
  await expect(page.locator('.section-trigger')).toBeFocused();
  await page.screenshot({ path: info.outputPath('worker-section-search.png') });
});

test('Project manager gets only own compensation destinations', async ({ page }, info) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'manager');
  await page.goto(portal(routeByRole.manager));
  await openSectionSearch(page);

  await expectTaskInTopThree(page, 'compensación', 'pay-statement');
  await expectTaskInTopThree(page, 'salário', 'pay-statement');
  await expectNoFinanceMutationTask(page, 'impuestos');
  await expectNoFinanceMutationTask(page, 'invoice');
  await page.screenshot({ path: info.outputPath('manager-section-search.png') });
});

test('Auditor can discover economic review and receives no finance mutation tasks', async ({
  page,
}, info) => {
  test.skip(![360, 390, 768, 1440].includes(page.viewportSize()!.width));
  await signIn(page, 'auditor');
  await page.goto(portal(routeByRole.auditor));
  await openSectionSearch(page);

  await expectTaskInTopThree(page, 'compensation', 'finance-economic');
  await expectTaskInTopThree(page, 'compensación', 'finance-economic');
  await expectTaskInTopThree(page, 'salary', 'finance-economic');
  await expectNoFinanceMutationTask(page, 'IVA');
  await page.screenshot({ path: info.outputPath('auditor-section-search.png') });
});
