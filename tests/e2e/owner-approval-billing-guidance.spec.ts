import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator } from '@playwright/test';
import { PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

async function selectStep(sheet: Locator, index: number) {
  const desktop = sheet.locator('.billing-section__wizard-progress');
  if (await desktop.isVisible()) {
    await desktop.locator('li').nth(index).getByRole('button').click();
    return;
  }
  const mobile = sheet.locator('.billing-section__wizard-mobile-progress');
  if (!(await mobile.evaluate((node: HTMLDetailsElement) => node.open)))
    await mobile.locator('summary').click();
  await mobile.locator('li').nth(index).getByRole('button').click();
}

test('invoice period popup gives separate financial approval and sale rate recovery before save', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  const errors: string[] = [];
  const posts: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const ruleId = await sheet
    .getByRole('combobox', { name: 'Project and billing stream' })
    .inputValue();
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const rule = db.prepare('SELECT project_id FROM billing_rule WHERE id=?').get(ruleId) as {
    project_id: string;
  };
  db.close();
  await page.route('**/api/billing/readiness?**', async (route) => {
    await route.fulfill({
      json: {
        state: 'incomplete',
        streamType: 'labor',
        includedSourceCount: 1,
        excludedSourceCount: 2,
        hasPositiveFixedFee: false,
        hasPositiveDraftAmount: true,
        includedExpenseRows: [],
        includedExpenseSubtotalMinor: '0',
        reasons: [
          { code: 'pending_time_finance_review', sourceId: 'time-pending' },
          { code: 'missing_client_rate', sourceId: 'time-rate' },
        ],
        timeReadiness: {
          recordCount: 3,
          minutes: 180,
          groups: [
            { status: 'pending_finance_review', recordCount: 1, minutes: 60 },
            { status: 'missing_client_rate', recordCount: 1, minutes: 60 },
            { status: 'eligible', recordCount: 1, minutes: 60 },
          ],
          records: [
            {
              sourceId: 'time-pending',
              workDate: '2026-10-15',
              minutes: 60,
              status: 'pending_finance_review',
            },
            {
              sourceId: 'time-rate',
              workDate: '2026-10-16',
              minutes: 60,
              status: 'missing_client_rate',
            },
            { sourceId: 'time-ready', workDate: '2026-10-17', minutes: 60, status: 'eligible' },
          ],
        },
      },
    });
  });
  await selectStep(sheet, 3);
  const start = sheet.getByLabel('Period start', { exact: true });
  const end = sheet.getByLabel('Period end', { exact: true });
  await start.fill('2026-10-01');
  await end.fill('2026-10-31');
  await sheet.getByRole('button', { name: 'Check selected period', exact: true }).click();
  const dialog = page.locator('dialog[data-ui="guided-recovery"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('before saving the invoice draft for 2026-10-01 – 2026-10-31');
  await expect(dialog).toContainText('Time records: 3.');
  await expect(dialog).toContainText('Awaiting financial review: 1.');
  const finance = dialog.getByRole('link', { name: 'Review pending financial approvals' });
  const rate = dialog.getByRole('link', { name: 'Configure CLIENT SALE RATE' });
  for (const [link, expectedPath] of [
    [finance, '/approvals'],
    [rate, '/finance'],
  ] as const) {
    const href = new URL((await link.getAttribute('href'))!, 'https://example.test');
    expect(href.pathname).toBe(`/j-aautomation/app${expectedPath}`);
    expect(href.searchParams.get('project')).toBe(rule.project_id);
    expect(href.searchParams.get('from')).toBe('2026-10-01');
    expect(href.searchParams.get('to')).toBe('2026-10-31');
    const bounds = await link.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(
    new URL((await rate.getAttribute('href'))!, 'https://example.test').searchParams.get(
      'sourceRecord',
    ),
  ).toBe('time-rate');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(start).toHaveValue('2026-10-01');
  await expect(end).toHaveValue('2026-10-31');
  await expect(sheet.locator('[data-pending-time-finance-review] a')).toHaveAttribute(
    'href',
    /\/approvals\?stage=finance/u,
  );
  await expect(sheet.locator('[data-billing-missing-client-rate] a')).toHaveAttribute(
    'href',
    /\/finance\?view=commercial/u,
  );
  await selectStep(sheet, 11);
  await expect(sheet.getByRole('button', { name: 'Save invoice draft' })).toBeDisabled();
  await expect(sheet).not.toContainText('Save the draft now.');
  await page.unroute('**/api/billing/readiness?**');
  await page.route('**/api/billing/readiness?**', (route) =>
    route.fulfill({
      status: 409,
      json: {
        code: 'BILLING_READINESS_AMBIGUOUS_CLIENT_RATE',
        messageKey: 'problem.billing.readinessAmbiguousClientRate',
        params: {},
        fieldErrors: {},
        remedies: [{ id: 'review_client_rates' }],
        correlationId: 'fixture-rate-conflict',
      },
    }),
  );
  await sheet.getByRole('button', { name: 'Check selected period', exact: true }).click();
  await expect(dialog).toBeVisible();
  const conflicts = new URL(
    (await dialog.getByRole('link', { name: 'Configure CLIENT SALE RATE' }).getAttribute('href'))!,
    'https://example.test',
  );
  expect(conflicts.pathname).toBe('/j-aautomation/app/finance');
  expect(conflicts.searchParams.get('task')).toBe('Client labor rates');
  expect(conflicts.searchParams.get('project')).toBe(rule.project_id);
  expect(conflicts.searchParams.get('from')).toBe('2026-10-01');
  expect(conflicts.searchParams.get('to')).toBe('2026-10-31');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await selectStep(sheet, 3);
  await expect(start).toHaveValue('2026-10-01');
  await expect(end).toHaveValue('2026-10-31');
  await expect(sheet.locator('[data-billing-readiness-problem]')).not.toContainText('Retry');
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test('Owner approval explains and confirms combined review while PM retains operational review', async ({
  page,
  browser,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const id = randomUUID();
  try {
    const repository = new PortalRepository(db);
    const userId = (email: string) =>
      (db.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const managerId = userId(e2eCredentials.manager.email);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const project = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(info.project.name).client.id,
      name: `Combined approval browser ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-APPROVAL', 95, info.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-10-01',
      projectManagerId: managerId,
    });
    const fixture = { project_id: project.id, worker_id: userId(e2eCredentials.worker.email) };
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: fixture.worker_id,
      startsOn: '2026-10-01',
    });
    expect(
      db
        .prepare(
          "SELECT can_review,status,ends_on FROM project_member WHERE project_id=? AND user_id=? AND assignment_role='project_manager'",
        )
        .get(project.id, managerId),
    ).toMatchObject({ can_review: 1, status: 'active', ends_on: null });
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      fixture.project_id,
      fixture.worker_id,
      '2026-10-08',
      'regular',
      30,
      'submitted',
      'pending',
      now,
      now,
    );
    for (const role of ['owner', 'manager'] as const) {
      const rolePage =
        role === 'owner' ? page : await browser.newPage({ viewport: page.viewportSize()! });
      await signIn(rolePage, role);
      await rolePage.goto(portal(`/approvals?tab=time&project=${fixture.project_id}&lang=en`));
      const form = rolePage
        .locator('form[action="?/approveRecord"]')
        .filter({ has: rolePage.locator(`input[name="id"][value="${id}"]`) })
        .filter({ has: rolePage.locator('input[name="decision"][value="approved"]') });
      const button = form.getByRole('button', {
        name: role === 'owner' ? 'Approve including financial review' : 'Approve',
        exact: true,
      });
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (role === 'owner') {
        await expect(form).toContainText('operational and financial acceptance together');
        const dialogPromise = rolePage.waitForEvent('dialog');
        const clickPromise = button.click();
        const dialog = await dialogPromise;
        expect(dialog.message()).toContain('operational and financial acceptance together');
        await dialog.dismiss();
        await clickPromise;
        expect(
          db.prepare('SELECT approval_state,billability_state FROM time_entry WHERE id=?').get(id),
        ).toMatchObject({ approval_state: 'submitted', billability_state: 'pending' });
      } else {
        await expect(
          form.locator('[data-problem-code="WARNING_OPERATIONAL_APPROVAL_FINANCE_SEPARATE"]'),
        ).toBeVisible();
        await rolePage.close();
      }
    }
  } finally {
    db.close();
  }
});
