import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator } from '@playwright/test';
import { e2eDatabasePath } from './environment.js';
import { portal, signIn } from './auth.js';

function invoiceId(state: 'draft' | 'issued'): string {
  const db = new DatabaseSync(e2eDatabasePath, { readOnly: true });
  try {
    const invoice = db
      .prepare('SELECT id FROM invoice WHERE state=? ORDER BY created_at DESC LIMIT 1')
      .get(state) as { id: string } | undefined;
    if (!invoice)
      throw new Error(`A ${state} invoice is required from the invoice journey fixture`);
    return invoice.id;
  } finally {
    db.close();
  }
}

async function touchTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(43);
}

test('section navigation opens the same task finder without covering phone controls', async ({
  page,
}, info) => {
  await signIn(page, 'finance');
  await page.goto(portal('/billing?view=streams&lang=en'));
  if (page.viewportSize()!.width < 768)
    await expect(page.locator('[data-assistant-launcher]')).toBeHidden();
  else await expect(page.locator('[data-assistant-launcher]')).toBeVisible();
  await page.locator('.section-trigger').click();
  const current = page.locator('.section-result[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toBeVisible();
  await page.locator('.section-task-action').click();
  const assistant = page.locator('.assistant-dialog');
  await expect(assistant).toBeVisible();
  await expect(assistant.locator('input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(assistant).toBeHidden();
  await expect(page.locator('.section-trigger')).toBeFocused();
  await page.screenshot({ path: info.outputPath('phone-task-access.png') });
});

test('keyboard search skips recommendation links in the Tab sequence and announces empty results', async ({
  page,
}) => {
  await signIn(page, 'finance');
  await page.goto(portal('/finance?view=overview&lang=en'));
  const home = page.locator('.portal-home-link');
  await touchTarget(home);
  expect((await home.boundingBox())!.width).toBeGreaterThanOrEqual(43);
  const skip = page.locator('.skip-link').first();
  await skip.focus();
  const skipBounds = await skip.boundingBox();
  expect(skipBounds!.y).toBeGreaterThanOrEqual(0);
  const search = page.locator('#portal-global-search');
  await search.focus();
  const options = page.locator('#portal-search-popover [role="option"]');
  expect(await options.count()).toBeGreaterThan(0);
  for (const option of await options.all()) await expect(option).toHaveAttribute('tabindex', '-1');
  await search.press('ArrowDown');
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(options.first()).not.toBeFocused();
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('#portal-search-popover'))),
  ).toBe(false);
  await search.fill('zzzz-no-match-123');
  await expect(page.locator('[data-search-result-count]')).toHaveText('0 matches');
  await expect(page.locator('.search-popover-empty[role="status"]')).toBeVisible();
});

test('project basics show requirements and timezone suggestions without restricting custom zones', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?action=new-project&lang=en'));
  const form = page.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  await expect(form.locator('.project-required-mark')).toHaveCount(4);
  await expect(form.locator('[name="clientId"] option[value=""]')).toHaveText('Choose a client');
  const zone = form.locator('[name="timezone"]');
  await expect(zone).toHaveAttribute('list', 'project-site-timezones');
  await zone.fill('Pacific/Auckland');
  await expect(zone).toHaveValue('Pacific/Auckland');
  expect(await zone.evaluate((input) => (input as HTMLInputElement).validity.valid)).toBe(true);
  await expect(form.locator('[name="startDate"]')).not.toHaveAttribute('required');
  if (page.viewportSize()!.width < 641) {
    const bounds = await form.locator('[name="name"]').boundingBox();
    expect(bounds!.width).toBeGreaterThan(page.viewportSize()!.width - 100);
  }
  await page.screenshot({ path: info.outputPath('project-basics-round2.png') });
});

test('commercial shortcuts reach rules directly and source navigation retains Spanish', async ({
  page,
}) => {
  await signIn(page, 'finance');
  await page.goto(portal('/finance?view=commercial&lang=es'));
  const jumps = page.locator('.finance-commercial-jumps');
  await expect(jumps).toBeVisible();
  await jumps.locator('a[href="#finance-configuration"]').click();
  await expect(page.locator('#finance-configuration')).toBeFocused();
  await expect(page.locator('.finance-config-preview')).toHaveAttribute('href', /lang=es/);
  await expect(
    page.locator('#finance-configuration form:has(input[name="asOf"]) input[name="lang"]'),
  ).toHaveValue('es');
  await page.goto(portal('/finance?view=overview&lang=es'));
  await expect(page.locator('[data-project-calculation-link]')).toHaveAttribute('href', /lang=es/);
  await page.goto(portal('/billing?view=streams&lang=es'));
  const streams = page.locator('[data-billing-rule]');
  await expect(streams.first()).toBeVisible();
  const direct = page.locator('.billing-section__direct-draft-entry > summary');
  expect(await direct.count()).toBeGreaterThan(0);
  await expect(direct.first()).toContainText('Introducir un período directamente');
  const actionNames = await page
    .locator('.billing-section__stream-create-actions button.primary-button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(actionNames.every((name) => name && name.includes(' · '))).toBe(true);
  expect(new Set(actionNames).size).toBe(actionNames.length);
});

test('invoice page and editable fields have clear identities and usable touch controls', async ({
  page,
}, info) => {
  await signIn(page, 'finance');
  await page.goto(portal(`/billing/invoices/${invoiceId('draft')}?lang=en`));
  await expect(page.locator('.invoice-page-heading h1')).toBeVisible();
  await expect(page.locator('.invoice-page-heading h1')).toHaveCSS('color', 'rgb(247, 247, 245)');
  await expect(page).toHaveTitle(/Draft invoice/);
  await expect(page.locator('.detail-nav')).toHaveAttribute('aria-label', 'Invoice');
  await expect(page.locator('.detail-nav a[data-origin-back]')).toHaveAttribute('href', /lang=en/);
  const edits = page.locator('.invoice-document-shell button[data-invoice-edit]');
  expect(await edits.count()).toBeGreaterThan(0);
  for (const edit of await edits.all()) {
    await touchTarget(edit);
    expect(await edit.getAttribute('aria-label')).not.toContain('issuingAuthority');
  }
  const numbers = page.locator('[data-invoice-edit="invoiceNumber"]');
  await expect(numbers).toHaveCount(2);
  const labels = await numbers.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label')),
  );
  expect(new Set(labels).size).toBe(2);
  for (const link of await page.locator('.invoice-source-links a').all()) await touchTarget(link);
  await page.screenshot({ path: info.outputPath('invoice-edit-targets.png') });
});

test('issued invoice keeps edit controls absent and localized export controls remain usable', async ({
  page,
}) => {
  await signIn(page, 'finance');
  await page.goto(portal(`/billing/invoices/${invoiceId('issued')}?lang=en`));
  await expect(page.locator('.invoice-page-heading h1')).toBeVisible();
  await expect(page.locator('.invoice-page-heading h1')).toHaveCSS('color', 'rgb(247, 247, 245)');
  await expect(page.locator('[data-invoice-edit]')).toHaveCount(0);
  const panel = page.locator('.localized-pdf-panel');
  await expect(panel).toBeVisible();
  for (const control of await panel.locator('button:visible, select:visible').all())
    await touchTarget(control);
});

test('auditors see their access level before reviewing finance and ledger records', async ({
  page,
}) => {
  await signIn(page, 'auditor');
  await page.goto(portal('/finance?view=commercial&lang=en'));
  await expect(page.locator('[data-finance-read-only]')).toContainText('Read-only review');
  await expect(page.locator('.finance-overview form[method="POST"]')).toHaveCount(0);
  await page.goto(portal('/ledger?lang=en'));
  await expect(page.locator('[data-ledger-read-only]')).toContainText('Read-only review');
});

test('owner project URL search excludes nonmatching records and reset restores them', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en&status='));
  const rows = page.locator('.project-list-link[data-project-row]');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);
  const selectedId = await rows.first().getAttribute('data-project-row');
  const differentId = await rows.nth(1).getAttribute('data-project-row');
  await page.goto(portal(`/projects?lang=en&status=&q=${encodeURIComponent(selectedId!)}`));
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-project-row', selectedId!);
  await expect(page.locator(`[data-project-row="${differentId}"]`)).toHaveCount(0);
  await page.locator('.project-register-summary a').click();
  await expect.poll(() => rows.count()).toBeGreaterThan(1);
});

test('repeated financial actions identify their record and archived projects stay available', async ({
  page,
}) => {
  await signIn(page, 'finance');
  await page.goto(portal('/billing?view=invoices&lang=en'));
  const invoiceLinks = page.locator('a[aria-label^="Open invoice:"]:visible');
  expect(await invoiceLinks.count()).toBeGreaterThan(0);
  for (const link of await invoiceLinks.all())
    expect(await link.getAttribute('aria-label')).toMatch(/ · .* · .* · [a-zA-Z0-9-]{8}$/);
  await page.goto(portal('/finance?view=commercial&lang=en'));
  const expenseLinks = page.locator('a[aria-label^="Open expense ·"]');
  expect(await expenseLinks.count()).toBeGreaterThan(0);
  for (const link of await expenseLinks.all())
    expect(await link.getAttribute('aria-label')).toMatch(/ · .* · \d{4}-\d{2}-\d{2} · .+ · /);
  const personSummaries = page.locator('summary[aria-label^="Configure this person ·"]');
  expect(await personSummaries.count()).toBeGreaterThan(0);
  const names = await personSummaries.evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  );
  expect(new Set(names).size).toBe(names.length);
  for (const save of await page.locator('button[aria-label^="Save person rules ·"]').all())
    expect((await save.getAttribute('aria-label'))!.split(' · ')[1]).toBeTruthy();
  await page.goto(portal('/ledger?lang=en'));
  const timelines = page.locator('summary[aria-label^="View timeline ·"]');
  expect(await timelines.count()).toBeGreaterThan(0);
  for (const summary of await timelines.all())
    expect(
      (await summary.getAttribute('aria-label'))!.split(' · ').filter(Boolean).length,
    ).toBeGreaterThanOrEqual(3);
  await page.context().clearCookies();
  await signIn(page, 'owner');
  await page.goto(portal('/projects?view=clients&lang=en'));
  const history = page.locator('details[data-archived-project-history]');
  await expect(history).toBeVisible();
  await expect(history).toHaveJSProperty('open', false);
  await history.locator('summary').click();
  await expect(history.locator('a')).toBeVisible();
});
