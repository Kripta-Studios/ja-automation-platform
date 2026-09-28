import { expect, test } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('project people search keeps selections and collapsed cards fit their heading', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en&action=new-project'));

  const card = page.locator('section[data-ui="section-card"].record-list.full', {
    has: page.getByRole('heading', { name: 'Authorized projects' }),
  });
  const disclosure = card.locator(':scope > details.ui-disclosure');
  await expect(disclosure).not.toHaveAttribute('open');
  expect((await card.boundingBox())!.height).toBeLessThan(150);
  await disclosure.locator(':scope > summary').click();
  await expect(disclosure).toHaveAttribute('open');
  expect((await card.boundingBox())!.height).toBeGreaterThan(150);

  const picker = page.locator('.project-people-picker');
  await expect(picker).toBeVisible();
  await expect(page.locator('select[name="projectManagerId"] option').last()).toContainText(' — ');
  const first = picker.locator('.project-people-picker__choice:visible').first();
  const workerName = (await first.locator('span').textContent())!.trim();
  const workerId = await first.locator('input').getAttribute('value');
  const search = picker.locator('input[type="search"]');
  await first.locator('input').check();
  await search.fill(workerName.slice(0, Math.max(3, Math.floor(workerName.length / 2))));
  await expect(picker.locator(`input[value="${workerId}"]`)).toBeVisible();
  await search.fill('no-such-worker-20260924');
  await expect(picker.locator('.project-people-picker__choice:visible')).toHaveCount(0);
  await search.clear();
  await expect(picker.locator(`input[value="${workerId}"]`)).toBeChecked();
});

test('finance reimbursement card opens the pending queue with payment actions', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/finance?lang=en&view=economic'));
  await page
    .locator('.finance-overview__attention')
    .getByRole('link', { name: /Reimbursement review/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('reimbursement')).toBe('pending');
  await expect.poll(() => new URL(page.url()).hash).toBe('#finance-reimbursements');
  await expect(page.locator('#finance-reimbursements')).toBeInViewport();
  const rows = page.locator('#finance-reimbursements .finance-overview__reimbursement');
  for (let index = 0; index < (await rows.count()); index += 1) {
    await expect(rows.nth(index).getByRole('button', { name: 'Mark reimbursed' })).toBeVisible();
  }
});

test('Log time offers only projects assigned to the selected worker on the work date', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));
  await page.getByRole('button', { name: 'Log time' }).click();

  const form = page.locator('form[data-time-entry-surface]');
  const workerSelect = form.locator('select[name="workerId"]');
  const projectSelect = form.locator('select[name="projectId"]');
  await form.locator('input[name="workDate"]').fill('2026-08-25');

  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    for (const email of ['worker@demo.jaautomation.test', 'maya@demo.jaautomation.test']) {
      const worker = db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as {
        id: string;
      };
      await workerSelect.selectOption(worker.id);
      const actual = await projectSelect
        .locator('option:not([value=""])')
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value).sort(),
        );
      const expected = (
        db.sqlite
          .prepare(
            `SELECT DISTINCT pm.project_id AS id FROM project_member pm
               JOIN project p ON p.id=pm.project_id
              WHERE pm.user_id=? AND pm.status='active'
                AND pm.starts_on<='2026-08-25'
                AND (pm.ends_on IS NULL OR pm.ends_on>='2026-08-25')
                AND p.status IN ('active','planned','paused')`,
          )
          .all(worker.id) as Array<{ id: string }>
      ).map((row) => row.id);
      expect(actual.length).toBeGreaterThan(0);
      expect(actual.every((id) => expected.includes(id))).toBe(true);
    }
  } finally {
    db.sqlite.close();
  }
});

test('attention cards land on the actionable filtered register', async ({ page }) => {
  await signIn(page, 'worker');
  for (const [section, card, target] of [
    ['time', '.time-status-strip', '#time-records'],
    ['expenses', '.expense-status-strip', '#expense-records'],
    ['reports', '.report-attention', '#report-panel-daily'],
  ] as const) {
    await page.goto(portal(`/${section}?lang=en`));
    await page
      .locator(card)
      .getByRole('link', { name: /Needs attention/ })
      .click();
    await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('attention');
    await expect.poll(() => new URL(page.url()).hash).toBe(target);
    await expect(page.locator(target)).toBeInViewport();
  }
});

test('report work date stays paired with its date control', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports?lang=en&view=daily'));
  await page.locator('[data-report-primary-cta]').click();
  const label = page.locator('.report-entry-grid label:has(input[name="workDate"])');
  const textBox = await label.locator('span').boundingBox();
  const inputBox = await label.locator('input').boundingBox();
  expect(textBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(inputBox!.y).toBeGreaterThanOrEqual(textBox!.y + textBox!.height);
  expect(Math.abs(inputBox!.x - textBox!.x)).toBeLessThan(12);
  expect(inputBox!.width).toBeLessThanOrEqual((await label.boundingBox())!.width + 1);
});
