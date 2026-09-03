import { expect, test } from '@playwright/test';
import { e2eCredentials } from './auth';

const portal = (value: string) => `http://127.0.0.1:4174/j-aautomation/app${value}`;

async function signIn(page: import('@playwright/test').Page, role: keyof typeof e2eCredentials) {
  const credentials = e2eCredentials[role];
  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await expect(page).toHaveURL(portal(''));
  await page.waitForLoadState('networkidle');
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const result = await page.evaluate(() => {
    const offenders = [...document.querySelectorAll<HTMLElement>('*')]
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter(({ right }) => right > innerWidth + 1)
      .slice(-12);
    return {
      innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      offenders,
      layout: [
        ...document.querySelectorAll<HTMLElement>(
          '.portal-layout > main, .worker-form, .entry-panel, .record-list, .record-card',
        ),
      ]
        .map((element) => ({
          className: element.className,
          width: Math.round(element.getBoundingClientRect().width),
          right: Math.round(element.getBoundingClientRect().right),
          display: getComputedStyle(element).display,
          gridTemplateColumns: getComputedStyle(element).gridTemplateColumns,
        }))
        .filter(({ right }) => right > innerWidth + 1),
    };
  });
  if (result.bodyScrollWidth > result.innerWidth + 1)
    console.log(`[horizontal-overflow] ${JSON.stringify(result)}`);
  expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.innerWidth + 1);
}

const workerCommercialKeyPattern =
  /(?:client(?:Bill(?:ability)?|Billing|Rate|Treatment)|billing(?:Rate|Treatment)|tax(?:Profile|Rate|Amount)|internal(?:Cost|Rate)|contribution|margin|markup|overtime(?:Rate|Multiplier|Threshold)|travel(?:Billable|Billing))/i;

async function expectWorkerOperationalSurface(
  page: import('@playwright/test').Page,
  route: string,
): Promise<void> {
  const controls = await page
    .locator('input:not([type="hidden"]), select, textarea')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute('name') ?? '',
        id: element.getAttribute('id') ?? '',
        ariaLabel: element.getAttribute('aria-label') ?? '',
        label: element.closest('label')?.textContent?.trim() ?? '',
      })),
    );
  expect(
    controls.filter((control) =>
      workerCommercialKeyPattern.test(
        `${control.name} ${control.id} ${control.ariaLabel} ${control.label}`,
      ),
    ),
    'worker forms must contain operational inputs only',
  ).toEqual([]);

  const semanticLabels = await page
    .locator('h1, h2, h3, .portal-kicker, .metric span, .detail-grid span, [role="tab"]')
    .allTextContents();
  expect(
    semanticLabels.filter((label) => workerCommercialKeyPattern.test(label)),
    'worker headings and status labels must not expose commercial configuration',
  ).toEqual([]);

  const response = await page.request.get(portal(route));
  expect(response.status(), `worker ${route} projection must be readable`).toBe(200);
  const html = await response.text();
  expect(
    html.match(
      /(?:client(?:Bill(?:ability)?|Billing|Rate|Treatment)|billing(?:Rate|Treatment)|tax(?:Profile|Rate|Amount)|internal(?:Cost|Rate)|contribution|markup|overtime(?:Rate|Multiplier|Threshold)|travel(?:Billable|Billing))/gi,
    ),
    `worker ${route} server projection must not serialize Finance-only fields`,
  ).toBeNull();
}

async function expectPhoneControlsUsable(
  page: import('@playwright/test').Page,
  root: import('@playwright/test').Locator = page.locator('body'),
): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const metrics = await root
    .locator('button, input:not([type="hidden"]), select, textarea')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const inactiveSurface = element.closest('[inert], [aria-hidden="true"]');
          return (
            !inactiveSurface &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0
          );
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            name: element.getAttribute('name') ?? element.textContent?.trim() ?? '',
            left: box.left,
            right: box.right,
            width: box.width,
            height: box.height,
          };
        }),
    );
  expect(metrics).not.toEqual([]);
  expect(metrics.filter(({ left, right }) => left < -1 || right > viewportWidth + 1)).toEqual([]);
  expect(
    metrics.filter(({ height }) => height < 40),
    'phone controls must retain a usable touch target',
  ).toEqual([]);
}

function captureRuntimeErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) =>
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      response.status() >= 400 &&
      (url.pathname.startsWith('/j-aautomation/app') || url.pathname.startsWith('/api/'))
    )
      errors.push(`response: ${response.status()} ${response.url()}`);
  });
  return errors;
}

test('critical portal surfaces render without runtime errors', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('requestfailed', (request) =>
    browserErrors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400)
      browserErrors.push(`RESPONSE ${response.status()} ${response.url()}`);
  });
  const loginResponse = await page.goto(portal('/login'), { waitUntil: 'networkidle' });
  expect(loginResponse).not.toBeNull();
  const csp = loginResponse?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).not.toContain("'unsafe-inline'");
  expect(loginResponse?.headers()['x-correlation-id']).toMatch(/^[A-Za-z0-9._:-]{8,96}$/);
  await expect(
    page.getByRole('heading', { name: 'Run every project with confidence.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0);
  await expect(page.getByText(/password none|use the demo/i)).toHaveCount(0);
  expect((await page.request.get(portal('/demo-login'))).status()).toBe(404);

  if (testInfo.project.name === 'phone-390') {
    await signIn(page, 'worker');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText(/10 H EXPECTED/i)).toHaveCount(0);
    await expectWorkerOperationalSurface(page, '/');
    await expectPhoneControlsUsable(page);
    await page.screenshot({ path: testInfo.outputPath('worker-today-390.png'), fullPage: true });
    for (const [route, heading, shot] of [
      ['/time', 'Time entries', 'worker-time-390.png'],
      ['/reports', 'Daily and technical reports', 'worker-reports-390.png'],
      ['/expenses', 'Expenses and receipts', 'worker-expense-390.png'],
    ] as const) {
      await page.goto(portal(route));
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expectWorkerOperationalSurface(page, route);
      await expectPhoneControlsUsable(page);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(shot), fullPage: true });
    }
  } else {
    await signIn(page, 'owner');
    await expect(page.getByRole('heading', { name: 'Field operations overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reports', exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`admin-dashboard-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.goto(portal('/?q=Body%20Shop'));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
    await expect(page.getByText(/Body Shop Line 4/).first()).toBeVisible();
    await page.locator('a.search-result').filter({ hasText: 'Body Shop Line 4' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Body Shop Line 4/ })).toBeVisible();
    await expect(page.getByText('Contribution', { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`project-detail-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.goto(portal('/billing'));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Invoice register' })).toBeVisible();
    await page.getByRole('link', { name: 'Preview' }).first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Separate billing treatment')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`invoice-preview-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page);
  }
  expect(browserErrors).toEqual([]);
});

test('portal language switcher translates navigation without changing data routes', async ({
  page,
}) => {
  await page.goto(portal('/login'));
  await signIn(page, 'worker');
  await page.waitForLoadState('networkidle');
  await page.goto(portal('/?lang=pt'));
  await expect(page.locator('#portal-navigation .nav-label', { hasText: 'Hoje' })).toBeVisible();
  await expect(page.locator('#portal-navigation .nav-label', { hasText: 'Projetos' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('combobox', { name: 'Idioma' })).toHaveValue('pt');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('es');
  await expect(page.locator('#portal-navigation .nav-label', { hasText: 'Hoy' })).toBeVisible();
  await expect(page.locator('#portal-navigation .nav-label', { hasText: 'Proyectos' })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/lang=es/);
});

test('account menu exposes profile, activity and session controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto(portal('/login'));
  await signIn(page, 'worker');
  await page.getByRole('button', { name: 'Account options' }).click();
  const menu = page.getByRole('menu', { name: 'Account options' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Profile & security/ })).toHaveAttribute(
    'href',
    '/j-aautomation/app/profile',
  );
  await expect(menu.getByRole('menuitem', { name: /Notifications/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Log out/ })).toBeVisible();
});

test('worker phone flow records operational truth without commercial configuration', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390');
  const errors = captureRuntimeErrors(page);
  await signIn(page, 'worker');

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText(/10 H EXPECTED/i)).toHaveCount(0);
  await expectWorkerOperationalSurface(page, '/');
  await expectPhoneControlsUsable(page);
  await expectNoHorizontalOverflow(page);

  await page.goto(portal('/time'));
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Time entries', exact: true })).toBeVisible();
  await expectWorkerOperationalSurface(page, '/time');
  await expect(page.locator('button[data-time-primary-cta]')).toHaveText('Log time');
  await page.locator('button[data-time-primary-cta]').click();
  const timeForm = page.locator('form[data-time-entry-surface]').first();
  await expect(timeForm).toBeVisible();
  await expect(timeForm.locator('label')).toHaveCount(6);
  await expect(timeForm.locator('option[value="overtime"]')).toHaveCount(0);
  await expectPhoneControlsUsable(page, timeForm);

  await timeForm.locator('select[name="projectId"]').selectOption({ index: 1 });
  await timeForm.locator('input[name="workDate"]').fill('2026-08-24');
  await timeForm.locator('select[name="category"]').selectOption('travel');
  await expect(timeForm.locator('input[name="activityCode"]')).toBeVisible();
  await expect(timeForm.getByText('Travel operational detail')).toBeVisible();
  await timeForm.locator('input[name="activityCode"]').fill('Airport to site transfer');
  await timeForm.locator('input[name="minutes"]').fill('45');
  await timeForm
    .locator('textarea[name="summary"]')
    .fill('Travelled from the airport to the commissioning site.');
  await expectWorkerOperationalSurface(page, '/time');
  await timeForm.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Time draft saved')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(portal('/expenses'));
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('heading', { name: 'Expenses and receipts', exact: true }),
  ).toBeVisible();
  await expectWorkerOperationalSurface(page, '/expenses');
  await page.locator('[data-expense-primary-cta]').click();
  const expenseForm = page.locator('form[data-expense-entry-surface]').first();
  await expect(expenseForm).toBeVisible();
  await expect(expenseForm.locator('input[name="clientTreatment"]')).toHaveCount(0);
  await expect(expenseForm.locator('select[name="billingTreatment"]')).toHaveCount(0);
  await expectPhoneControlsUsable(page, expenseForm);
  await expenseForm.locator('select[name="projectId"]').selectOption({ index: 1 });
  await expenseForm.locator('input[name="spentOn"]').fill('2026-08-24');
  await expenseForm.locator('select[name="category"]').selectOption('hotel');
  await expenseForm.locator('input[name="vendor"]').fill('WP09 Worker Phone Receipt');
  await expenseForm.locator('input[name="amount"]').fill('24.50');
  await expenseForm.locator('select[name="currency"]').selectOption('USD');
  await expenseForm.locator('select[name="whoPaid"]').selectOption('worker');
  await expenseForm
    .locator('textarea[name="description"]')
    .fill('Operational receipt submitted from the worker phone flow.');
  await expenseForm.locator('input[name="paymentMethod"]').fill('Cash');
  await expenseForm.locator('input[name="receipt"]').setInputFiles({
    name: 'wp09-worker-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expectWorkerOperationalSurface(page, '/expenses');
  let expensePostData = '';
  const expenseRequestListener = (request: import('@playwright/test').Request): void => {
    if (request.method() === 'POST' && request.url().includes('?/createExpense'))
      expensePostData = request.postData() ?? '';
  };
  page.on('request', expenseRequestListener);
  await expenseForm.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Expense draft saved')).toBeVisible();
  page.off('request', expenseRequestListener);
  expect(expensePostData).not.toMatch(workerCommercialKeyPattern);
  const createdExpense = page.locator('[data-expense-record]').filter({
    hasText: 'WP09 Worker Phone Receipt',
  });
  await expect(createdExpense).toHaveCount(1);
  const submitExpense = createdExpense.locator('form[action="?/submitExpense"]');
  await expect(submitExpense).toBeVisible();
  await submitExpense.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Expense submitted')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(portal('/reports'));
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expectWorkerOperationalSurface(page, '/reports');
  await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Technical / PLC', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New daily report', exact: true }).click();
  const dailyForm = page.locator('form[data-report-entry-surface="daily"]');
  await expect(dailyForm).toBeVisible();
  await expectPhoneControlsUsable(page, dailyForm);
  await dailyForm.locator('select[name="projectId"]').selectOption({ index: 1 });
  await dailyForm.locator('input[name="workDate"]').fill('2026-08-24');
  await dailyForm.locator('input[name="siteShift"]').fill('Line 4 · first shift');
  await dailyForm
    .locator('textarea[name="summary"]')
    .fill('Recorded the commissioning travel and site handover context.');
  await dailyForm
    .locator('textarea[name="tasksCompleted"]')
    .fill('Logged the operational transfer and confirmed the site arrival.');
  await dailyForm.getByRole('button', { name: 'Save daily report' }).click();
  await expect(page.getByText('Daily report draft saved')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
  await page.getByRole('button', { name: 'New technical report', exact: true }).click();
  const technicalForm = page.locator('form[data-report-entry-surface="technical"]');
  await expect(technicalForm).toBeVisible();
  await expectPhoneControlsUsable(page, technicalForm);
  await technicalForm.locator('select[name="projectId"]').selectOption({ index: 1 });
  await technicalForm.locator('input[name="systemName"]').fill('Line 4 PLC station');
  await technicalForm
    .locator('textarea[name="problemSymptom"]')
    .fill('The station sequence stopped intermittently.');
  await technicalForm
    .locator('textarea[name="diagnosisRootCause"]')
    .fill('The completion signal was shorter than the configured debounce.');
  await technicalForm
    .locator('textarea[name="changePerformed"]')
    .fill('Adjusted the debounce and documented validation completed during the shift.');
  await technicalForm.getByRole('button', { name: 'Save PLC report' }).click();
  await expect(page.getByText('PLC report draft saved')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(portal('/pay'));
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'My Pay', exact: true })).toBeVisible();
  await expectWorkerOperationalSurface(page, '/pay');
  await expect(
    page.getByText('This view contains only your own time', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Alex Rivera', { exact: true })).toBeVisible();
  for (const otherWorker of ['Rafael Santos', 'Maya Chen', 'Daniel Brooks', 'Elena Costa'])
    await expect(page.getByText(otherWorker, { exact: true })).toHaveCount(0);
  await expectPhoneControlsUsable(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('worker-client-essential-phone-390.png'),
    fullPage: true,
  });

  expect(errors).toEqual([]);
});

test('worker can create an offline time draft and sync it once online', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto(portal('/login'));
  await signIn(page, 'worker');
  await page.goto(portal('/time'));
  // Prime every worker-safe route before taking the browser offline. The
  // service worker may serve these cached shells while all API calls remain
  // intentionally uncached.
  await page.goto(portal('/reports'));
  await page.goto(portal('/expenses'));
  await page.goto(portal('/time'));
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.context().setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  const time = page.locator('form[action="?/createTime"]');
  await time.locator('select[name="projectId"]').selectOption({ index: 1 });
  await time.locator('input[name="workDate"]').fill('2026-08-19');
  await time.locator('select[name="category"]').selectOption('regular');
  await time.locator('input[name="minutes"]').fill('45');
  await time
    .locator('textarea[name="summary"]')
    .fill('Offline field draft for reconnect verification.');
  await time.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Offline — saved on this device')).toBeVisible();
  await expect(page.getByText(/1 queued/)).toBeVisible();
  await page.context().setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByText(/1 synced/)).toBeVisible({ timeout: 15_000 });

  await page.goto(portal('/reports'));
  await page.waitForLoadState('networkidle');
  await page.context().setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  const daily = page.locator('form[action="?/createDailyReport"]');
  await daily.locator('select[name="projectId"]').selectOption({ index: 1 });
  await daily.locator('input[name="workDate"]').fill('2026-08-24');
  await daily.locator('textarea[name="summary"]').fill('Offline daily report draft.');
  await daily.locator('textarea[name="tasksCompleted"]').fill('Offline task record.');
  await daily.getByRole('button', { name: 'Save daily report' }).click();
  await expect(page.getByText('Offline — saved on this device')).toBeVisible();

  const technical = page.locator('details').nth(1);
  await technical.locator('summary').click();
  const technicalForm = technical.locator('form[action="?/createTechnicalReport"]');
  await technicalForm.locator('select[name="projectId"]').selectOption({ index: 1 });
  await technicalForm.locator('input[name="systemName"]').fill('Offline PLC station');
  await technicalForm
    .locator('textarea[name="problemSymptom"]')
    .fill('Offline station sequence symptom.');
  await technicalForm
    .locator('textarea[name="diagnosisRootCause"]')
    .fill('Offline root-cause diagnosis.');
  await technicalForm
    .locator('textarea[name="changePerformed"]')
    .fill('Offline technical change performed.');
  await technicalForm.getByRole('button', { name: 'Save PLC report' }).click();
  await expect(page.getByText('Offline — saved on this device')).toBeVisible();

  await page.context().setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByText(/2 synced/)).toBeVisible({ timeout: 20_000 });

  await page.goto(portal('/expenses'));
  await page.waitForLoadState('networkidle');
  await page.context().setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  const offlineExpense = page.locator('form[action="?/createExpense"]');
  await offlineExpense.locator('select[name="projectId"]').selectOption({ index: 1 });
  await offlineExpense.locator('input[name="spentOn"]').fill('2026-08-24');
  await offlineExpense.locator('input[name="vendor"]').fill('Offline hotel');
  await offlineExpense.locator('input[name="amount"]').fill('18.75');
  await offlineExpense.locator('textarea[name="description"]').fill('Offline receipt queue test.');
  await offlineExpense.locator('select[name="clientTreatment"]').selectOption('reimbursable');
  await offlineExpense.locator('input[name="receipt"]').setInputFiles({
    name: 'offline-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await offlineExpense.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Offline — saved on this device')).toBeVisible();
  await expect(page.getByText(/1 queued/)).toBeVisible();

  await page.context().setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByText(/1 synced/)).toBeVisible({ timeout: 20_000 });
  const offlineState = await page.evaluate(async () => {
    const request = indexedDB.open('ja-portal-user-cache', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['mutations', 'attachments'], 'readonly');
    const mutations = await new Promise<number>((resolve, reject) => {
      const count = transaction.objectStore('mutations').count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
    const attachments = await new Promise<number>((resolve, reject) => {
      const count = transaction.objectStore('attachments').count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
    database.close();
    return { mutations, attachments };
  });
  expect(offlineState).toEqual({ mutations: 0, attachments: 0 });
});
