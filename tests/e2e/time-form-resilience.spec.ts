import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

const requiredViewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

async function openTimeForm(page: Page, role: 'worker' | 'owner' = 'worker'): Promise<Locator> {
  await signIn(page, role);
  await page.goto(portal('/time?lang=en&q='), { waitUntil: 'networkidle' });
  await page.locator('[data-time-primary-cta]').click();
  const form = page.locator('form[data-time-entry-surface]');
  const project = form.locator('[name="projectId"]');
  const projectId = await project.evaluate(
    (select: HTMLSelectElement) => Array.from(select.options).find((option) => option.value)?.value,
  );
  if (!projectId) throw new Error('The time fixture needs an authorized project.');
  await project.selectOption(projectId);
  if (role === 'owner') {
    const worker = form.locator('[name="workerId"]');
    const workerId = await worker.evaluate(
      (select: HTMLSelectElement) =>
        Array.from(select.options).find((option) => option.value)?.value,
    );
    if (!workerId) throw new Error('The owner fixture needs an available worker.');
    await worker.selectOption(workerId);
  }
  await form.locator('[name="startTime"]').fill('09:00');
  await form.locator('[name="endTime"]').fill('13:00');
  await form.locator('[name="breakMinutes"]').fill('15');
  await form.locator('[name="summary"]').fill('Preserve this actual operational activity.');
  await expect(form.locator('output')).toHaveText('3 h 45 min');
  return form;
}

test('time blocks duplicate writes, freezes the submitted interval and focuses network failure feedback', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  const form = await openTimeForm(page, 'owner');
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const error = sheet.locator('[data-operational-form-error]');
  let requests = 0;
  let release: (() => void) | undefined;
  let payload: URLSearchParams | undefined;
  await page.route('**/app/time?*/createTime', async (route) => {
    requests += 1;
    payload = new URLSearchParams(route.request().postData() ?? '');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', status: 500, error: { message: 'Synthetic failure' } }),
    });
  });
  await form.locator('button[type="submit"]').click();
  await expect(form).toHaveAttribute('aria-busy', 'true');
  for (const name of ['startTime', 'endTime', 'breakMinutes', 'summary'])
    await expect(form.locator(`[name="${name}"]`)).toBeDisabled();
  await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
  await expect.poll(() => requests).toBe(1);
  await expect.poll(() => Boolean(release)).toBe(true);
  expect(Object.fromEntries(payload!)).toMatchObject({
    startTime: '09:00',
    endTime: '13:00',
    breakMinutes: '15',
    minutes: '225',
    summary: 'Preserve this actual operational activity.',
  });
  release!();
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await expect(error).toHaveText(
    'We could not confirm the save. Check the register before submitting again.',
  );
  await expect(error).toBeFocused();
  for (const name of ['startTime', 'endTime', 'breakMinutes', 'summary'])
    await expect(form.locator(`[name="${name}"]`)).toBeEnabled();
  await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
  await expect(form.locator('[name="summary"]')).toHaveValue(
    'Preserve this actual operational activity.',
  );
  const accessibility = await new AxeBuilder({ page })
    .include('[data-ui="responsive-sheet"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.unroute('**/app/time?*/createTime');
  await page.route('**/app/time?*/createTime', (route) => route.abort('failed'));
  await form.locator('button[type="submit"]').click();
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await expect(error).toBeFocused();
  await expect(form.locator('output')).toHaveText('3 h 45 min');
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/time'));
  await error.scrollIntoViewIfNeeded();
  await sheet.screenshot({ path: info.outputPath('time-save-failure.png') });
});

test('time server validation focuses its field and removes the obsolete summary after correction', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  const form = await openTimeForm(page);
  const activity = form.locator('[name="summary"]');
  // Whitespace satisfies the native length requirement, but the real action trims and rejects it.
  await activity.fill('   ');
  await form.locator('button[type="submit"]').click();
  await expect(activity).toHaveAttribute('aria-invalid', 'true');
  await expect(activity).toBeFocused();
  await expect(form.locator('[data-validation-summary]')).toBeVisible();
  await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
  await activity.fill('Corrected operational activity.');
  await expect(activity).not.toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[data-validation-summary]')).toHaveCount(0);
  await expect(form.locator('[data-validation-generated-error]')).toHaveCount(0);
  await expect(activity).toBeFocused();
  await expect(form.locator('output')).toHaveText('3 h 45 min');
});

test('time cross-field interval corrections and reset clear only obsolete validation without moving focus', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  const form = await openTimeForm(page);
  const start = form.locator('[name="startTime"]');
  const end = form.locator('[name="endTime"]');
  const summary = form.locator('[data-validation-summary]');
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/createTime')) posts++;
  });
  await end.fill('08:00');
  await form.locator('button[type="submit"]').click();
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(end).toBeFocused();
  await expect(summary).toContainText('End time must be later on the same day');
  // Correct the dependency, without typing in the field carrying the error.
  await start.fill('07:00');
  await expect(end).not.toHaveAttribute('aria-invalid', 'true');
  await expect(summary).toHaveCount(0);
  await expect(start).toBeFocused();
  await expect(form.locator('output')).toHaveText('0 h 45 min');
  await form.locator('[name="summary"]').fill('');
  await form.locator('[name="projectId"]').selectOption('');
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[data-validation-generated-error]')).toHaveCount(2);
  await form.locator('[name="summary"]').fill('One corrected field, one still pending.');
  await expect(form.locator('[data-validation-generated-error]')).toHaveCount(1);
  await expect(summary).toBeVisible();
  await expect(form.locator('[name="summary"]')).toBeFocused();
  await form.evaluate((element: HTMLFormElement) => element.reset());
  await expect(summary).toHaveCount(0);
  await expect(form.locator('[data-validation-generated-error]')).toHaveCount(0);
  expect(posts).toBe(0);
});

test('time reports disabled offline mode without losing the local interval or attempting a POST', async ({
  page,
  context,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  const form = await openTimeForm(page);
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/createTime')) posts++;
  });
  await context.setOffline(true);
  try {
    await form.locator('button[type="submit"]').click();
    const error = page.locator('[data-operational-form-error]');
    await expect(error).toHaveText('Reconnect to save changes. Your entries are still here.');
    await expect(error).toBeFocused();
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
    await expect(form.locator('[name="endTime"]')).toHaveValue('13:00');
    await expect(form.locator('[name="breakMinutes"]')).toHaveValue('15');
    await expect(form.locator('[name="summary"]')).toHaveValue(
      'Preserve this actual operational activity.',
    );
    expect(posts).toBe(0);
  } finally {
    await context.setOffline(false);
  }
});
