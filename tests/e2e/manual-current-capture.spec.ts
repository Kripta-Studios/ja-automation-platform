import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readManualSourceIdentity } from '../../scripts/manual-source-identity.js';
import { e2eCredentials, portal, signIn } from './auth.js';
import { e2eDatabasePath, readE2EFixturePointer } from './environment.js';

test('capture current manuals from authenticated synthetic application screens', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'The capture explicitly includes desktop and phone.');
  test.setTimeout(240_000);
  readE2EFixturePointer();
  const root = process.cwd();
  const identity = readManualSourceIdentity(root);
  const { sqlite } = createDatabase(e2eDatabasePath);
  let projectId: string, periodId: string, invoiceId: string;
  try {
    projectId = (
      sqlite
        .prepare(
          `SELECT p.id FROM project p JOIN project_member pm ON pm.project_id=p.id
      JOIN user u ON u.id=pm.user_id WHERE u.email=? AND pm.status='active' AND p.status='active'
      ORDER BY p.id LIMIT 1`,
        )
        .get(e2eCredentials.worker.email) as { id: string }
    ).id;
    periodId = (
      sqlite
        .prepare(
          "SELECT id FROM period_report WHERE audience='customer' AND length(snapshot_sha256)=64 ORDER BY created_at,id LIMIT 1",
        )
        .get() as { id: string }
    ).id;
    invoiceId = (
      sqlite.prepare('SELECT id FROM invoice ORDER BY id LIMIT 1').get() as { id: string }
    ).id;
  } finally {
    sqlite.close();
  }
  const common = [
    ['projects', '/projects'],
    ['time', '/time'],
    ['reports', '/reports'],
    ['expenses', '/expenses'],
    ['documents', '/documents'],
    ['profile', '/profile'],
    ['help', '/help'],
    ['notifications', '/notifications'],
  ];
  const routes = {
    owner: [
      ['today', ''],
      ...common,
      ['clients', '/projects?view=clients'],
      ['team', '/projects?view=team'],
      ['planning', '/planning'],
      ['project-detail', `/projects/${projectId}`],
      ['approvals', '/approvals'],
      ['billing', '/billing'],
      ['invoice-detail', `/billing/invoices/${invoiceId}`],
      ['finance', '/finance'],
      ['economic', '/finance?view=economic'],
      ['commercial', '/finance?view=commercial'],
      ['ledger', '/ledger'],
      ['accounting', '/accounting'],
      ['audit', '/audit'],
      ['preview', '/finance/preview'],
      ['cash', '/finance/cash'],
      ['period-review', '/reports/review'],
      ['period-detail', `/reports/period/${periodId}`],
      ['closeout', `/projects/${projectId}/closeout`],
      ['supplier', '/supplier'],
    ],
    worker: [
      ['home', ''],
      ...common,
      ['pay', '/pay'],
      ['project-detail', `/projects/${projectId}`],
    ],
  } as const;
  const screenshots: Array<{
    key: string;
    role: string;
    route: string;
    path: string;
    sha256: string;
    viewport: { width: number; height: number };
  }> = [];
  const checks: Array<{ name: string; status: string; httpStatus?: number }> = [];
  for (const role of ['owner', 'worker'] as const) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await signIn(page, role);
    for (const [key, route] of routes[role]) {
      const response = await page.goto(portal(route), { waitUntil: 'networkidle' });
      expect(response?.status(), `${role} ${route}`).toBe(200);
      await expect(page.locator('main').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const path = `docs/manuals/screenshots/current/${role}/${key}.png`;
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      await page.screenshot({ path: resolve(root, path), fullPage: false });
      screenshots.push({
        key,
        role,
        route: `/app${route}`,
        path,
        sha256: createHash('sha256')
          .update(readFileSync(resolve(root, path)))
          .digest('hex'),
        viewport: { width: 1440, height: 900 },
      });
      checks.push({ name: `navigation:${role}:/app${route}`, status: 'passed', httpStatus: 200 });
      if (role === 'worker' && ['time', 'expenses', 'reports'].includes(key)) {
        const selector =
          key === 'time'
            ? '[data-time-primary-cta]'
            : key === 'expenses'
              ? '[data-expense-primary-cta]'
              : '[data-report-primary-cta]';
        await page.locator(selector).first().click();
        await expect(page.getByRole('dialog').first()).toBeVisible();
        const formPath = `docs/manuals/screenshots/current/${role}/${key}-form.png`;
        await page.screenshot({ path: resolve(root, formPath), fullPage: false });
        screenshots.push({
          key: `${key}-form`,
          role,
          route: `/app${route}`,
          path: formPath,
          sha256: createHash('sha256')
            .update(readFileSync(resolve(root, formPath)))
            .digest('hex'),
          viewport: { width: 1440, height: 900 },
        });
        checks.push({ name: `form-open:${role}:/app${route}`, status: 'passed' });
      }
    }
    if (role === 'worker')
      for (const route of [
        '/billing',
        '/finance',
        '/approvals',
        '/accounting',
        '/audit',
        '/finance/preview',
        '/finance/cash',
      ]) {
        const response = await page.goto(portal(route));
        expect(response?.status(), `worker must be denied ${route}`).toBe(403);
        checks.push({ name: `denied:worker:/app${route}`, status: 'passed', httpStatus: 403 });
      }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [key, route] of role === 'owner'
      ? [
          ['cash-phone', '/finance/cash'],
          ['period-review-phone', '/reports/review'],
        ]
      : [
          ['time-phone', '/time'],
          ['expenses-phone', '/expenses'],
        ]) {
      const response = await page.goto(portal(route), { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);
      const path = `docs/manuals/screenshots/current/${role}/${key}.png`;
      await page.screenshot({ path: resolve(root, path), fullPage: false });
      screenshots.push({
        key,
        role,
        route: `/app${route}`,
        path,
        sha256: createHash('sha256')
          .update(readFileSync(resolve(root, path)))
          .digest('hex'),
        viewport: { width: 390, height: 844 },
      });
      checks.push({
        name: `navigation:phone:${role}:/app${route}`,
        status: 'passed',
        httpStatus: 200,
      });
    }
    await context.close();
  }
  // Supplier captures are produced by the dedicated supplier workflow fixture.
  // Keep those approved synthetic screens in the shared manual manifest so the
  // role-specific Owner and Worker guides remain reproducible without creating
  // supplier accounts in this read-only navigation pass.
  for (const capture of [
    {
      key: 'supplier-team',
      role: 'worker',
      route: '/app/supplier',
      path: 'docs/manuals/screenshots/current/supplier/team.png',
      viewport: { width: 1440, height: 900 },
    },
    {
      key: 'supplier-report',
      role: 'worker',
      route: '/app/supplier/report',
      path: 'docs/manuals/screenshots/current/supplier/report.png',
      viewport: { width: 1440, height: 900 },
    },
  ] as const) {
    screenshots.push({
      ...capture,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(root, capture.path)))
        .digest('hex'),
    });
    checks.push({ name: `supplier-capture:${capture.route}`, status: 'passed' });
  }
  expect(readManualSourceIdentity(root).sourceDigest).toBe(identity.sourceDigest);
  const manifest = {
    ...identity,
    capturedAt: new Date().toISOString(),
    environment: 'synthetic',
    scope:
      'Authenticated navigation, authorization denials and screenshot evidence; full functional lifecycle tests are recorded separately.',
    screenshots,
    checks,
  };
  mkdirSync(resolve(root, 'docs/manuals/validation'), { recursive: true });
  writeFileSync(
    resolve(root, 'docs/manuals/validation/current-capture.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
});
