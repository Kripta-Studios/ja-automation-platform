import { createDatabase } from '@ja/database';
import { expect, test, type Page } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eDatabasePath } from './environment.js';

async function visibleControlsFit(page: Page, selector: string) {
  for (const control of await page.locator(selector).all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, await control.evaluate((el) => el.outerHTML)).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
  }
}

test('Finance records customer follow-up without declaring customer acceptance', async ({
  page,
}) => {
  await signIn(page, 'finance');
  const { sqlite } = createDatabase(e2eDatabasePath);
  let report: {
    id: string;
    project_id: string;
    period_start: string;
    period_end: string;
    state: string;
  };
  try {
    report = sqlite
      .prepare(
        `SELECT id,project_id,period_start,period_end,state
      FROM period_report WHERE audience='customer' AND length(snapshot_sha256)=64 ORDER BY created_at,id LIMIT 1`,
      )
      .get() as typeof report;
    if (!report) throw new Error('Disposable fixture requires a customer period report');
  } finally {
    sqlite.close();
  }
  const query = new URLSearchParams({
    project: report.project_id,
    from: report.period_start,
    to: report.period_end,
    lang: 'es',
  });
  await page.goto(portal(`/reports/review?${query}`));
  await expect(
    page.getByRole('heading', {
      name: 'Revisión del período y seguimiento del cliente',
      exact: true,
    }),
  ).toBeVisible();
  const card = page.locator(`[data-period-review-report="${report.id}"]`);
  await expect(card).toBeVisible();
  await card.locator('select[name="eventType"]').selectOption('returned');
  const responsible = card.locator('select[name="responsibleUserId"]');
  const staffId = await responsible.locator('option').nth(1).getAttribute('value');
  expect(staffId).toBeTruthy();
  await responsible.selectOption(staffId!);
  await card
    .locator('textarea[name="reason"]')
    .fill(`Customer requested clearer scope: ${test.info().project.name}`);
  await card.locator('input[name="nextFollowUpOn"]').fill('2026-09-30');
  await visibleControlsFit(
    page,
    '[data-period-review] input:not([type="hidden"]), [data-period-review] select, [data-period-review] button',
  );
  await card.getByRole('button', { name: 'Registrar evento', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Seguimiento registrado.' }),
  ).toBeVisible();
  await expect(card.locator('.latest-event')).toContainText('Devuelto');
  const check = createDatabase(e2eDatabasePath);
  try {
    expect(
      (
        check.sqlite.prepare('SELECT state FROM period_report WHERE id=?').get(report.id) as {
          state: string;
        }
      ).state,
    ).toBe(report.state);
    const event = check.sqlite
      .prepare(
        'SELECT event_type,reason FROM period_report_followup_event WHERE period_report_id=? ORDER BY sequence_no DESC LIMIT 1',
      )
      .get(report.id) as { event_type: string; reason: string };
    expect(event.event_type).toBe('returned');
    expect(event.reason).toContain(test.info().project.name);
  } finally {
    check.sqlite.close();
  }
  await page.screenshot({ path: test.info().outputPath('period-followup.png'), fullPage: true });
});

test('Owner previews, confirms and downloads immutable closeout packages, then reopens', async ({
  page,
}) => {
  await signIn(page, 'owner');
  const project = e2eLifecycleFixturesFor(test.info().project.name).project;
  await page.goto(portal(`/projects/${project.id}/closeout?lang=en`));
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare closeout draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Customer audience preview', exact: true }),
  ).toBeVisible();
  await visibleControlsFit(
    page,
    '[data-closeout-page] button, [data-closeout-page] input:not([type="hidden"]):not([type="checkbox"])',
  );
  await page
    .getByRole('checkbox', {
      name: 'I confirm publication of this exact client snapshot after reviewing the selected content.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Confirm client publication', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize both packages', exact: true }).click();
  const links = page.locator('a[href*="/app/api/projects/closeout/artifact/"]');
  await expect(links).toHaveCount(2);
  const packages: Array<{ href: string; bytes: Buffer }> = [];
  for (const link of await links.all()) {
    const href = (await link.getAttribute('href'))!;
    const response = await page.request.get(new URL(href, portal()).toString());
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    const bytes = await response.body();
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
    packages.push({ href, bytes });
  }
  await page.screenshot({ path: test.info().outputPath('closeout-packages.png'), fullPage: true });
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Authorized return visit for additional commissioning');
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  for (const item of packages) {
    const response = await page.request.get(new URL(item.href, portal()).toString());
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(item.bytes);
  }
  const { sqlite } = createDatabase(e2eDatabasePath);
  try {
    expect(
      (
        sqlite.prepare('SELECT status FROM project WHERE id=?').get(project.id) as {
          status: string;
        }
      ).status,
    ).toBe('active');
  } finally {
    sqlite.close();
  }
});

test('Worker is denied staff follow-up and closeout packages', async ({ page }) => {
  await signIn(page, 'worker');
  const project = e2eLifecycleFixturesFor(test.info().project.name).project;
  for (const path of ['/reports/review', `/projects/${project.id}/closeout`]) {
    const response = await page.request.get(portal(path));
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain('client_snapshot_json');
  }
  const { sqlite } = createDatabase(e2eDatabasePath);
  let artifactId: string;
  try {
    const artifact = sqlite
      .prepare(
        `SELECT a.id FROM project_closeout_artifact a
      JOIN project_closeout_revision r ON r.id=a.revision_id
      JOIN project_closeout_series s ON s.id=r.series_id
      WHERE s.project_id=? ORDER BY a.id LIMIT 1`,
      )
      .get(project.id) as { id: string };
    if (!artifact) throw new Error('Owner workflow must produce a private closeout artifact');
    artifactId = artifact.id;
  } finally {
    sqlite.close();
  }
  const download = await page.request.get(portal(`/api/projects/closeout/artifact/${artifactId}`));
  expect(download.status()).toBe(403);
});
