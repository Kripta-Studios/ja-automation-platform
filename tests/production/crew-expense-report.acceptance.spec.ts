import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const reportId = process.env.JA_PROD_QA_REPORT_ID;
const timeId = process.env.JA_PROD_QA_TIME_ID;
const chiefState = process.env.JA_PRODUCTION_CHIEF_AUTH_STATE;
const ownerState = process.env.JA_PRODUCTION_OWNER_AUTH_STATE;
const workDate = '2026-09-24';

test.beforeAll(() => {
  for (const [name, value] of [
    ['JA_PROD_QA_PROJECT_ID', projectId],
    ['JA_PROD_QA_REPORT_ID', reportId],
    ['JA_PROD_QA_TIME_ID', timeId],
    ['JA_PRODUCTION_CHIEF_AUTH_STATE', chiefState],
    ['JA_PRODUCTION_OWNER_AUTH_STATE', ownerState],
  ]) {
    if (!value) throw new Error(`${name} is required for the guarded live journey`);
  }
});

test.describe('chief browser session', () => {
  test.use({ storageState: chiefState });

  test('iPhone and iPad chief can reach shared and per-worker controls without overflow', async ({
    page,
  }, testInfo) => {
    test.skip(
      !['iphone-webkit-390', 'ipad-webkit-768'].includes(testInfo.project.name),
      'WebKit phone and tablet check only',
    );
    const response = await page.goto(`${base}/crew?project=${projectId}&date=${workDate}`);
    expect(response?.status()).toBe(200);
    const entry = page.locator('form[action="?/createBatch"]');
    await expect(entry.locator('input[name="workerIds"]')).toHaveCount(2);
    await expect(entry.getByLabel('Hours per member')).toBeVisible();
    await entry.getByLabel('Different hours for each member').check();
    await expect(entry.locator('[name^="hours_"]')).toHaveCount(2);
    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    const box = await entry.getByRole('button', { name: 'Save 0 people' }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('saves shared and individual worker hours, then a shift-linked expense', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Live writes run once; other viewports are read-only');
    test.setTimeout(120_000);
    const marker = `QA CREW LIVE ${Date.now()}`;
    const crewUrl = `${base}/crew?project=${projectId}&date=${workDate}`;
    const response = await page.goto(crewUrl);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Log team hours' })).toBeVisible();
    const entry = page.locator('form[action="?/createBatch"]');
    const memberChecks = entry.locator('input[name="workerIds"]');
    await expect(memberChecks).toHaveCount(2);
    const workers = await memberChecks.evaluateAll((inputs) =>
      inputs.map((input) => ({
        id: (input as HTMLInputElement).value,
        name: input.parentElement?.textContent?.trim() ?? '',
      })),
    );
    expect(workers.every((worker) => worker.id && worker.name)).toBe(true);

    for (const worker of workers)
      await entry.locator(`input[name="workerIds"][value="${worker.id}"]`).check();
    await entry.getByLabel('Hours per member').fill('1.25');
    await entry.getByLabel('Work performed').fill(`${marker} shared`);
    await entry.getByRole('button', { name: 'Save 2 people' }).click();
    const shared = page.locator('.entry-list li').filter({ hasText: `${marker} shared` });
    await expect(shared).toHaveCount(2);
    for (const worker of workers)
      await expect(shared.filter({ hasText: worker.name })).toContainText('75 minutes');
    await page.reload();
    await expect(page.locator('.entry-list li').filter({ hasText: `${marker} shared` })).toHaveCount(2);

    const individual = page.locator('form[action="?/createBatch"]');
    await individual.getByLabel('Different hours for each member').check();
    for (const worker of workers)
      await individual.locator(`input[name="workerIds"][value="${worker.id}"]`).check();
    await individual.getByLabel(`Hours for ${workers[0]!.name}`).fill('0.5');
    await individual.getByLabel(`Hours for ${workers[1]!.name}`).fill('0.75');
    await individual.getByLabel('Work performed').fill(`${marker} individual`);
    await individual.getByRole('button', { name: 'Save 2 people' }).click();
    const individualRows = page.locator('.entry-list li').filter({ hasText: `${marker} individual` });
    await expect(individualRows).toHaveCount(2);
    await expect(individualRows.filter({ hasText: workers[0]!.name })).toContainText('30 minutes');
    await expect(individualRows.filter({ hasText: workers[1]!.name })).toContainText('45 minutes');
    await page.reload();
    await expect(page.locator('.entry-list li').filter({ hasText: `${marker} individual` })).toHaveCount(2);

    const firstRow = page
      .locator('.entry-list li')
      .filter({ hasText: `${marker} shared` })
      .filter({ hasText: workers[0]!.name });
    const timeHref = await firstRow.getByRole('link', { name: 'View time' }).getAttribute('href');
    expect(timeHref).toMatch(/\/crew\/time\/[0-9a-f-]{36}$/iu);
    const expenseLink = firstRow.getByRole('link', {
      name: `Add expense for ${workers[0]!.name}`,
    });
    const expenseHref = await expenseLink.getAttribute('href');
    const expenseQuery = new URL(expenseHref!, page.url()).searchParams;
    expect(expenseQuery.get('project')).toBe(projectId);
    expect(expenseQuery.get('worker')).toBe(workers[0]!.id);
    expect(expenseQuery.get('date')).toBe(workDate);
    expect(expenseQuery.get('timeEntry')).toBe(timeHref!.split('/').at(-1));
    await expenseLink.click();
    const expenseForm = page.locator('form[data-expense-entry-surface]');
    await expect(expenseForm).toBeVisible();
    await expect(expenseForm.locator('[name="projectId"]')).toHaveValue(projectId!);
    await expect(expenseForm.locator('[name="workerId"]')).toHaveValue(workers[0]!.id);
    await expect(expenseForm.locator('[name="spentOn"]')).toHaveValue(workDate);
    await expect(expenseForm.locator('[name="timeEntryId"]')).toHaveValue(
      expenseQuery.get('timeEntry')!,
    );
    await expenseForm.locator('[name="occurredTimeLocal"]').fill('14:35');
    await expenseForm.locator('[name="vendor"]').fill(marker);
    await expenseForm.locator('[name="amount"]').fill('1.25');
    await expenseForm.locator('[name="currency"]').selectOption('EUR');
    await expenseForm.locator('[name="description"]').fill(`${marker} shift parking`);
    await expenseForm.getByRole('button', { name: 'Save draft' }).click();
    const savedExpense = page.locator('[data-expense-record]').filter({ hasText: marker });
    await expect(savedExpense).toHaveCount(1);
    const expenseId = await savedExpense.getAttribute('data-expense-record');
    expect(expenseId).toMatch(/^[0-9a-f-]{36}$/iu);
    await page.goto(`${base}/expenses/${expenseId}?lang=en`);
    await expect(page.locator('main')).toContainText(marker);
    await expect(page.locator('main')).toContainText('14:35');
    await expect(page.getByRole('link', { name: 'Open time record' })).toHaveAttribute(
      'href',
      timeHref!,
    );
    await page.reload();
    await expect(page.getByRole('link', { name: 'Open time record' })).toHaveAttribute(
      'href',
      timeHref!,
    );
    await expect(page.locator('main')).not.toContainText(
      /worker compensation|internal cost|client rate|billing treatment/i,
    );

    await page.goto(crewUrl);
    const rows = page.locator('.entry-list li').filter({ hasText: `${marker} shared` });
    const secondTimeHref = await rows
      .filter({ hasText: workers[1]!.name })
      .getByRole('link', { name: 'View time' })
      .getAttribute('href');
    const secondTimeId = secondTimeHref?.split('/').at(-1);
    expect(secondTimeId).toMatch(/^[0-9a-f-]{36}$/iu);
    await rows
      .filter({ hasText: workers[0]!.name })
      .getByRole('link', { name: `Add expense for ${workers[0]!.name}` })
      .click();
    const receiptForm = page.locator('form[data-expense-entry-surface]');
    await expect(receiptForm).toBeVisible();
    await receiptForm.locator('[name="receipt"]').setInputFiles({
      name: 'qa-crew-receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l8x8AAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await receiptForm.locator('[name="occurredTimeLocal"]').fill('15:05');
    await receiptForm.locator('[name="vendor"]').fill(`${marker} shared receipt`);
    await receiptForm.locator('[name="amount"]').fill('3.00');
    await receiptForm.locator('[name="currency"]').selectOption('EUR');
    await receiptForm.locator('[name="description"]').fill(`${marker} shared parking receipt`);
    await receiptForm.getByRole('button', { name: 'Save draft' }).click();
    const receiptRow = page.locator('[data-expense-record]').filter({ hasText: `${marker} shared receipt` });
    await expect(receiptRow).toHaveCount(1);
    const receiptId = await receiptRow.getAttribute('data-expense-record');
    expect(receiptId).toMatch(/^[0-9a-f-]{36}$/iu);
    await page.goto(crewUrl);
    const allocation = page.locator('form[action="?/allocateReceipt"]');
    await expect(allocation).toBeVisible();
    await allocation.getByLabel('Receipt expense').selectOption(receiptId!);
    const firstTimeId = expenseQuery.get('timeEntry')!;
    await allocation.locator(`input[name="timeEntryIds"][value="${firstTimeId}"]`).check();
    await allocation.locator(`input[name="timeEntryIds"][value="${secondTimeId}"]`).check();
    await allocation.locator(`[name="amount_${firstTimeId}"]`).fill('2.00');
    await allocation.locator(`[name="amount_${secondTimeId}"]`).fill('1.00');
    await allocation.getByRole('button', { name: 'Save receipt allocation' }).click();
    await expect(page.getByRole('heading', { name: 'Saved receipt allocations' })).toBeVisible();
    const savedAllocation = page.locator('.grant-list li').filter({ hasText: `${marker} shared receipt` }).first();
    await expect(savedAllocation).toContainText('3.00 EUR · one expense');
    await expect(savedAllocation).toContainText(`${workers[0]!.name}: 2.00 EUR`);
    await expect(savedAllocation).toContainText(`${workers[1]!.name}: 1.00 EUR`);
    await page.reload();
    await expect(page.locator('.grant-list li').filter({ hasText: `${marker} shared receipt` }).first()).toContainText(
      '3.00 EUR · one expense',
    );
  });
});

test.describe('owner browser session', () => {
  test.use({ storageState: ownerState });

  test('project, time and report links keep the QA scope after navigation and reload', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Run this read-only link journey once');
    const response = await page.goto(`${base}/projects/${projectId}`);
    expect(response?.status()).toBe(200);
    await page.locator('.attention-grid').getByRole('link', { name: /Actual time/ }).click();
    await expect(page).toHaveURL(new RegExp(`/time\\?project=${projectId}`));
    await page.goBack();
    await page.locator('.attention-grid').getByRole('link', { name: /Reports/ }).click();
    await expect(page).toHaveURL(new RegExp(`/reports\\?project=${projectId}`));
    await page.goto(`${base}/time/${timeId}`);
    const report = page.locator(`a[href="${base}/reports/${reportId}"]`);
    await expect(report).toBeVisible();
    await report.click();
    await expect(page).toHaveURL(`${base}/reports/${reportId}`);
    await page.reload();
    await expect(page).toHaveURL(`${base}/reports/${reportId}`);
  });
});
