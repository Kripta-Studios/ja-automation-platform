import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';
import { e2eDatabasePath } from './environment.js';

function fixtureUser(role: keyof typeof e2eCredentials): string {
  const db = createDatabase(e2eDatabasePath);
  try {
    return String(
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials[role].email)!.id,
    );
  } finally {
    db.sqlite.close();
  }
}

function availabilityFixture() {
  const db = createDatabase(e2eDatabasePath);
  const ids = Array.from({ length: 12 }, () => randomUUID());
  const marker = `Register ${randomUUID()}`;
  try {
    const workerId = fixtureUser('worker');
    for (const [index, id] of ids.entries()) {
      const date = `2098-01-${String(index + 1).padStart(2, '0')}`;
      db.sqlite
        .prepare(
          "INSERT INTO worker_availability(id,worker_id,starts_at,ends_at,availability,note,created_at,updated_at) VALUES(?,?,?,?,'available',?,?,?)",
        )
        .run(id, workerId, `${date}T08:00:00Z`, `${date}T16:00:00Z`, marker, date, date);
    }
  } finally {
    db.sqlite.close();
  }
  return {
    ids,
    marker,
    cleanup: () => {
      const cleanup = createDatabase(e2eDatabasePath);
      try {
        for (const id of ids)
          cleanup.sqlite.prepare('DELETE FROM worker_availability WHERE id=?').run(id);
      } finally {
        cleanup.sqlite.close();
      }
    },
  };
}

function registerKey(user: string, route: string, label: string, context = ''): string {
  const url = new URL(portal(route));
  return `ja-record-browser:${user}:${url.pathname}${url.search}:${label}:${context}`;
}

async function savePreferences(page: Page, key: string, state: Record<string, unknown>) {
  await page.evaluate(({ key, state }) => sessionStorage.setItem(key, JSON.stringify(state)), {
    key,
    state,
  });
}

test('management SPA tabs restore their own search, sort and page without leaking state', async ({
  page,
}) => {
  const fixture = availabilityFixture();
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/manage?area=planning_assignment'));
    const tabs = page.getByRole('navigation', { name: 'Management areas' });
    const browser = page.locator('.record-browser');
    const search = browser.getByRole('searchbox', { name: 'Search: Records' });
    const sort = browser.getByRole('combobox', { name: 'Sort by' });
    const marker = randomUUID();
    await page.evaluate((value) => Reflect.set(window, '__recordBrowserSpaMarker', value), marker);
    await search.fill('Planning-only saved query');
    await sort.selectOption('oldest');

    await tabs.getByRole('link', { name: 'Availability', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(sort).toHaveValue('priority');
    await search.fill(fixture.marker);
    await sort.selectOption('newest');
    await browser.getByRole('button', { name: 'Next →' }).click();
    await expect(browser.getByRole('status').first()).toHaveText('9–12 / 12');

    await tabs.getByRole('link', { name: 'Documents', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(sort).toHaveValue('priority');
    await search.fill('Documents-only saved query');
    await tabs.getByRole('link', { name: 'Planning', exact: true }).click();
    await expect(search).toHaveValue('Planning-only saved query');
    await expect(sort).toHaveValue('oldest');
    await tabs.getByRole('link', { name: 'Availability', exact: true }).click();
    await expect(search).toHaveValue(fixture.marker);
    await expect(sort).toHaveValue('newest');
    await expect(browser.getByRole('status').first()).toHaveText('9–12 / 12');
    expect(await page.evaluate(() => Reflect.get(window, '__recordBrowserSpaMarker'))).toBe(marker);
  } finally {
    fixture.cleanup();
  }
});

test('focused management records override only hiding filters and keep saved ordering', async ({
  page,
}) => {
  const fixture = availabilityFixture();
  try {
    await signIn(page, 'owner');
    const owner = fixtureUser('owner');
    const route = `/manage?area=worker_availability&focus=${fixture.ids.at(-1)}&lang=en`;
    const preferences = {
      search: 'Hidden by this query',
      status: 'unavailable',
      order: 'oldest',
      page: 0,
    };
    await savePreferences(page, registerKey(owner, route, 'Records'), preferences);
    await page.goto(portal(route));
    const browser = page.locator('.record-browser');
    const search = browser.getByRole('searchbox', { name: 'Search: Records' });
    const target = page.locator(`form:has(input[name="id"][value="${fixture.ids.at(-1)}"])`);
    await expect(target).toBeVisible();
    await expect(browser.getByRole('button', { name: '← Previous' })).toBeEnabled();
    await expect(search).toHaveValue('');
    await expect(browser.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('');
    await expect(browser.getByRole('combobox', { name: 'Sort by' })).toHaveValue('oldest');
    // The focus request is consumed once; it must not lock the user's later searches.
    await search.fill('Another deliberate query with no match');
    await expect(search).toHaveValue('Another deliberate query with no match');
    await expect(target).toHaveCount(0);

    const missingRoute = `/manage?area=worker_availability&focus=${randomUUID()}&lang=en`;
    await savePreferences(page, registerKey(owner, missingRoute, 'Records'), preferences);
    await page.goto(portal(missingRoute));
    await expect(search).toHaveValue(preferences.search);
    await expect(browser.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(
      preferences.status,
    );
    await expect(browser.getByRole('combobox', { name: 'Sort by' })).toHaveValue(preferences.order);
    await expect(page.locator('.management-records article')).toHaveCount(0);
  } finally {
    fixture.cleanup();
  }
});

test('billing stream preferences stay scoped to project and signed-in user', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  const project = page
    .getByRole('form', { name: 'Filter billing' })
    .getByRole('combobox', { name: 'Project', exact: true });
  const projectIds = await project
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
  expect(projectIds.length).toBeGreaterThan(1);
  const streamTab = page.getByRole('tab', { name: 'Billing streams', exact: true });
  const invoiceTab = page.getByRole('tab', { name: 'Invoices', exact: true });
  const search = page.getByRole('searchbox', { name: 'Search: Billing streams', exact: true });
  await project.selectOption(projectIds[0]!);
  await streamTab.click();
  await search.fill('First project only');
  await invoiceTab.click();
  await project.selectOption(projectIds[1]!);
  await streamTab.click();
  await expect(search).toHaveValue('');
  await search.fill('Second project only');
  await invoiceTab.click();
  await project.selectOption(projectIds[0]!);
  await streamTab.click();
  await expect(search).toHaveValue('First project only');

  await page.context().clearCookies();
  await signIn(page, 'finance');
  await page.goto(portal('/billing?lang=en'));
  await project.selectOption(projectIds[0]!);
  await streamTab.click();
  await expect(search).toHaveValue('');
  await search.fill('Finance user only');
  // Both people use the same sessionStorage and route, but separate identities.
  const stored = await page.evaluate(() =>
    Object.entries(sessionStorage).filter(([key]) => key.startsWith('ja-record-browser:')),
  );
  const ownerId = fixtureUser('owner');
  const financeId = fixtureUser('finance');
  expect(
    stored.some(
      ([key, value]) => key.includes(`:${ownerId}:`) && value.includes('First project only'),
    ),
  ).toBe(true);
  expect(
    stored.some(
      ([key, value]) => key.includes(`:${financeId}:`) && value.includes('Finance user only'),
    ),
  ).toBe(true);
});

test('controlled notification paging preserves server order and resets on its parent filter', async ({
  page,
}) => {
  await signIn(page, 'worker');
  const worker = fixtureUser('worker');
  const ids = Array.from({ length: 12 }, () => randomUUID());
  const db = createDatabase(e2eDatabasePath);
  try {
    for (const [index, id] of ids.entries()) {
      const date = `2099-01-${String(index + 1).padStart(2, '0')}T08:00:00Z`;
      db.sqlite
        .prepare(
          'INSERT INTO notification(id,user_id,kind,subject_id,read_at,created_at) VALUES(?,?,?,?,?,?)',
        )
        .run(
          id,
          worker,
          'missing_time',
          `missing-time:register-${id}`,
          index % 2 ? date : null,
          date,
        );
    }
  } finally {
    db.sqlite.close();
  }
  try {
    const route = '/notifications?lang=en';
    const key = registerKey(worker, route, 'Notifications');
    const saved = {
      search: 'Should never filter this parent-controlled list',
      status: 'read',
      order: 'oldest',
      page: 6,
    };
    await savePreferences(page, key, saved);
    await page.goto(portal(route));
    const rows = page.locator('.notification-row');
    const idsOnPage = () =>
      rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-notification-id')));
    await expect.poll(idsOnPage).toEqual([...ids].reverse().slice(0, 10));
    await expect(page.locator('.notification-inbox .record-browser__controls')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Notifications: Pages' })
      .getByRole('button', { name: 'Next →' })
      .click();
    await expect.poll(async () => (await idsOnPage()).slice(0, 2)).toEqual([ids[1], ids[0]]);
    await page
      .getByRole('navigation', { name: 'Notification filters' })
      .getByRole('link', { name: /^Unread/ })
      .click();
    await expect
      .poll(async () => (await idsOnPage()).slice(0, 6))
      .toEqual(ids.filter((_, index) => index % 2 === 0).reverse());
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), key)).toEqual(
      saved,
    );
  } finally {
    const cleanup = createDatabase(e2eDatabasePath);
    try {
      for (const id of ids) cleanup.sqlite.prepare('DELETE FROM notification WHERE id=?').run(id);
    } finally {
      cleanup.sqlite.close();
    }
  }
});
