import { expect, test } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const evidenceRoot = resolve('docs/evidence/error-warning-export-qa');

test('My Pay checks a lost Generate response without duplicating artifacts or losing the period', async ({
  page,
}, info) => {
  test.skip(
    !['phone-390', 'desktop'].includes(info.project.name),
    'Focused uncertain-save evidence uses 390 and 1440 px.',
  );
  test.setTimeout(90_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const label = info.project.name === 'phone-390' ? 'phone-390' : 'desktop-1440';
  const month = info.project.name === 'phone-390' ? '06' : '07';
  const start = `2026-${month}-01`;
  const end = `2026-${month}-28`;
  const pageErrors: string[] = [];
  const failedResponses: Array<{ method: string; path: string; status: number }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      failedResponses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });

  await signIn(page, 'worker');
  await page.goto(portal(`/pay?start=${start}&end=${end}`));
  let postCount = 0;
  let upstreamStatus = 0;
  let lostStatusCheck = false;
  let holdStatusReads = true;
  let requestKeyPresent = false;
  await page.route('**/api/worker-statement?**', async (route) => {
    if (
      route.request().method() === 'GET' &&
      holdStatusReads &&
      new URL(route.request().url()).searchParams.get('periodStart') === start &&
      new URL(route.request().url()).searchParams.get('periodEnd') === end
    ) {
      if (new URL(route.request().url()).searchParams.has('requestKey')) lostStatusCheck = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.route('**/api/worker-statement', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    postCount += 1;
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    requestKeyPresent = typeof body.requestKey === 'string' && body.requestKey.length > 10;
    const upstream = await route.fetch();
    upstreamStatus = upstream.status();
    // The server committed the request, but the browser never receives the response.
    await route.abort('failed');
  });

  await page.getByRole('button', { name: 'Generate report' }).click();
  const notice = page.locator('.pay-export-actions [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'WORKER_STATEMENT_NETWORK_UNCERTAIN');
  await expect(notice).toContainText('Check the statement status before requesting again.');
  await expect(notice).toBeFocused();
  const noticeVisible = await notice.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
  });
  expect(noticeVisible).toBe(true);
  await expect(page.getByRole('button', { name: 'Generate report' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check statement status' })).toBeVisible();
  const statusLink = notice.getByRole('link', { name: 'Check statement status' });
  await expect(statusLink).toBeVisible();
  const href = await statusLink.getAttribute('href');
  expect(href).toContain(`start=${start}`);
  expect(href).toContain(`end=${end}`);
  await notice.screenshot({
    path: resolve(evidenceRoot, `${label}-worker-uncertain-notice-postfix.png`),
  });

  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  let artifactCount = 0;
  try {
    artifactCount = (
      database.sqlite
        .prepare(
          'SELECT count(*) count FROM worker_statement_artifact WHERE period_start=? AND period_end=?',
        )
        .get(start, end) as { count: number }
    ).count;
  } finally {
    database.sqlite.close();
  }
  expect(artifactCount).toBe(2);
  expect(postCount).toBe(1);
  expect(upstreamStatus).toBe(202);
  expect(requestKeyPresent).toBe(true);
  expect(lostStatusCheck).toBe(true);

  holdStatusReads = false;
  await statusLink.click();
  await expect(page).toHaveURL(new RegExp(`/pay\\?start=${start}&end=${end}`));
  const statusButton = page.getByRole('button', { name: 'Check statement status' });
  await statusButton.scrollIntoViewIfNeeded();
  const scrollBeforeStatusCheck = await page.evaluate(() => window.scrollY);
  await statusButton.click();
  await expect(page.getByText(/PDF · Queued|PDF · Ready/u)).toBeVisible();
  const scrollAfterStatusCheck = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterStatusCheck - scrollBeforeStatusCheck)).toBeLessThan(150);
  expect(postCount).toBe(1);
  const after = createDatabase(fixture.databasePath);
  try {
    const currentCount = (
      after.sqlite
        .prepare(
          'SELECT count(*) count FROM worker_statement_artifact WHERE period_start=? AND period_end=?',
        )
        .get(start, end) as { count: number }
    ).count;
    expect(currentCount).toBe(artifactCount);
  } finally {
    after.sqlite.close();
  }
  writeFileSync(
    resolve(evidenceRoot, `${label}-worker-uncertain-postfix.json`),
    JSON.stringify(
      {
        viewport: label,
        upstreamStatus,
        postCount,
        requestKeyPresent,
        statusCheckResponseLost: lostStatusCheck,
        artifactCount,
        statusLinkRetainedPeriod: true,
        noticeFocused: true,
        noticeVisible,
        scrollBeforeStatusCheck,
        scrollAfterStatusCheck,
        pageErrors,
        failedResponses,
      },
      null,
      2,
    ) + '\n',
  );
  expect(pageErrors).toEqual([]);
});
