import { expect, test } from '@playwright/test';

const ownerState = process.env.JA_UI_OWNER_STATE;
const recordId = process.env.JA_UI_FINANCE_REVIEW_RECORD;
const projectId = process.env.JA_UI_FINANCE_REVIEW_PROJECT;
test.use({ storageState: ownerState || undefined });

test('an explicit Finance record search overrides saved queue search and pagination', async ({
  page,
}) => {
  test.skip(
    !ownerState || !recordId,
    'Requires an existing UI-authenticated Owner and a Finance queue record; no seeded fixture.',
  );
  const query = new URLSearchParams({ stage: 'finance', lang: 'en' });
  const ordinaryUrl = `/j-aautomation/app/approvals?${query}#finance-review`;
  await page.goto(ordinaryUrl, { waitUntil: 'networkidle' });
  const financeSearch = page.getByRole('searchbox', {
    name: 'Search Finance review',
    exact: true,
  });
  const pagination = page.getByRole('navigation', { name: 'Finance review pages', exact: true });
  if (await pagination.isVisible()) {
    await pagination.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pagination).toContainText('Page 2');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(pagination).toContainText('Page 2');
  }
  await financeSearch.fill('saved-finance-search-with-no-matching-record');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(financeSearch).toHaveValue('saved-finance-search-with-no-matching-record');
  await expect(page.locator('[data-finance-review-row]')).toHaveCount(0);

  query.set('q', recordId!);
  if (projectId) query.set('project', projectId);
  await page.goto(`/j-aautomation/app/approvals?${query}#finance-review`, {
    waitUntil: 'networkidle',
  });
  await expect(financeSearch).toHaveValue('');
  await expect(page.locator(`[data-finance-review-row="${recordId}"]`)).toBeVisible();
  await expect(page.locator('[data-finance-review-row]')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('q')).toBe(recordId);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(financeSearch).toHaveValue('');
  await expect(page.locator(`[data-finance-review-row="${recordId}"]`)).toBeVisible();
});
