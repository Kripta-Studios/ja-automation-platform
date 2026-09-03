import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth';

async function pageMetrics(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const viewport = innerWidth;
    const visibleOverflow = [...document.querySelectorAll<HTMLElement>('*')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const box = element.getBoundingClientRect();
        return box.right > viewport + 1 || box.left < -1;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        left: Math.round(element.getBoundingClientRect().left),
        width: Math.round(element.getBoundingClientRect().width),
        right: Math.round(element.getBoundingClientRect().right),
      }));
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      visibleOverflow,
    };
  });
}

test('required viewport responsive remediation evidence', async ({ page }, testInfo) => {
  await signIn(page, 'owner');

  await page.goto(portal('/projects?view=team'));
  await expect(page.locator('[data-team-directory]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
  const projects = await pageMetrics(page);
  console.log('PROJECTS RESPONSIVE METRICS', JSON.stringify(projects));
  expect(projects.documentWidth).toBeLessThanOrEqual(projects.viewport + 1);
  expect(projects.bodyWidth).toBeLessThanOrEqual(projects.viewport + 1);
  await page.screenshot({
    path: testInfo.outputPath(`qa-remediation-projects-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.goto(portal('/reports'));
  await expect(page.getByRole('heading', { name: 'Daily and technical reports' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Submit', exact: true }).first();
  if (await submit.count()) {
    await expect
      .poll(() => submit.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBeGreaterThanOrEqual(44);
  }
  const reports = await pageMetrics(page);
  expect(reports.documentWidth).toBeLessThanOrEqual(reports.viewport + 1);
  expect(reports.bodyWidth).toBeLessThanOrEqual(reports.viewport + 1);
  await page.screenshot({
    path: testInfo.outputPath(`qa-remediation-reports-${testInfo.project.name}.png`),
    fullPage: true,
  });

  const sourceLink = page
    .locator('.report-history .record-card-link')
    .filter({ hasText: 'Remote support diagnostic package' })
    .first();
  if (await sourceLink.count()) {
    await sourceLink.click();
    await expect(page.getByRole('heading', { name: 'Modify report' })).toBeVisible();
    const plcGroup = page
      .locator('.report-detail-form [data-ui="field-group"][data-columns="3"]')
      .first();
    await expect(plcGroup).toBeVisible();
    const grid = await plcGroup.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns,
    );
    if ((page.viewportSize()?.width ?? 0) <= 1024) expect(grid.split(' ').length).toBe(1);
    const plc = await pageMetrics(page);
    expect(plc.documentWidth).toBeLessThanOrEqual(plc.viewport + 1);
    expect(plc.bodyWidth).toBeLessThanOrEqual(plc.viewport + 1);
    await page.screenshot({
      path: testInfo.outputPath(`qa-remediation-plc-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
});
