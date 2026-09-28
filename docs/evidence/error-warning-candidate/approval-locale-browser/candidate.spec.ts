import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';

const evidenceRoot = import.meta.dirname;
const candidateHead = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim();

function diagnostics(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requests: Array<{ method: string; path: string; status: number }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const method = response.request().method();
    if (method !== 'GET' || response.status() >= 400)
      requests.push({ method, path: new URL(response.url()).pathname, status: response.status() });
  });
  return { pageErrors, consoleErrors, requests };
}

function writeResults(name: string, value: Record<string, unknown>) {
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(join(evidenceRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function geometry(page: Page) {
  return page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollY: Math.round(scrollY),
    active:
      document.activeElement?.hasAttribute('data-validation-summary') === true
        ? 'validation-summary'
        : (document.activeElement?.tagName.toLowerCase() ?? 'none'),
  }));
}

test('read-only auditor sees a specific approval access reason and a safe workspace route', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const observed = diagnostics(page);
  await signIn(page, 'auditor');
  const response = await page.goto(portal('/approvals?lang=en'));
  expect(response?.status()).toBe(403);
  const heading = page.getByRole('heading', { name: 'Access restricted', level: 1 });
  await expect(heading).toBeFocused();
  const headingText = await heading.textContent();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(
    'Approvals are available to owners, project managers, and finance administrators.',
  );
  await expect(alert).toContainText('contact an owner if you need this access');
  const remedy = alert.getByRole('link', { name: 'Open my workspace' });
  await expect(remedy).toHaveAttribute('href', '/j-aautomation/app/');
  const phone = await geometry(page);
  expect(phone.scrollWidth).toBe(390);
  await alert.screenshot({ path: join(evidenceRoot, 'auditor-access-390-en.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktop = await geometry(page);
  expect(desktop.scrollWidth).toBe(1440);
  await remedy.click();
  await expect(page).toHaveURL(/\/app\/finance\?view=overview/);
  const unexpectedConsoleErrors = observed.consoleErrors.filter(
    (message) => !/Failed to load resource.*403/i.test(message),
  );
  writeResults('auditor-results.json', {
    candidateHead,
    role: 'auditor_read_only',
    route: '/app/approvals',
    responseStatus: response?.status(),
    heading: headingText,
    remedy: '/app/ (role-specific landing page)',
    phone,
    desktop,
    pageErrors: observed.pageErrors,
    unexpectedConsoleErrors,
    requests: observed.requests,
  });
  expect(observed.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors).toEqual([]);
});

test('approval required-reason summary follows EN to ES to PT without a submission', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const observed = diagnostics(page);
  await signIn(page, 'manager');
  await page.goto(portal('/approvals?tab=time&lang=en'));
  const review = page
    .locator('details.approval-action-menu')
    .filter({
      has: page.locator(
        'form[action="?/approveRecord"] input[name="decision"][value="needs_changes"]',
      ),
    })
    .first();
  await expect(review).toBeVisible();
  const unrelatedReview = page
    .locator('details.approval-action-menu')
    .filter({
      has: page.locator(
        'form[action="?/approveRecord"] input[name="decision"][value="needs_changes"]',
      ),
    })
    .nth(1);
  await expect(unrelatedReview).not.toHaveAttribute('open', '');
  await review.locator('summary').click();
  const form = review.locator('form[action="?/approveRecord"]').filter({
    has: page.locator('input[name="decision"][value="needs_changes"]'),
  });
  const reason = form.locator('input[name="reason"]');
  const unsentRejectionReason = review
    .locator('form[action="?/approveRecord"]')
    .filter({ has: page.locator('input[name="decision"][value="rejected"]') })
    .locator('input[name="reason"]');
  await unsentRejectionReason.fill('QA unsent review note');
  const summary = form.locator('[data-validation-summary]');
  const tab = page.getByRole('tab', { name: /Time/ });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await reason.fill('');
  await form.getByRole('button', { name: 'Needs changes' }).click();
  await expect(summary).toContainText(
    'Please correct the following fields: Required change: Please complete this field.',
  );
  await summary.focus();
  const summaryNode = await summary.elementHandle();
  if (!summaryNode) throw new Error('Validation summary was not mounted');
  const sameSummaryId = await summary.getAttribute('id');
  const before = await geometry(page);
  await summary.screenshot({ path: join(evidenceRoot, 'required-reason-390-en.png') });

  const languages = [
    {
      option: 'ES',
      summary: 'Corrige los siguientes campos: Cambio requerido: Completa este campo.',
      inline: 'Completa este campo.',
      file: 'required-reason-390-es.png',
    },
    {
      option: 'PT-BR',
      summary: 'Corrija os seguintes campos: Alteração obrigatória: Preencha este campo.',
      inline: 'Preencha este campo.',
      file: 'required-reason-390-pt.png',
    },
  ] as const;
  const transitions: Array<Record<string, unknown>> = [];
  for (const language of languages) {
    const languageSelect = page.getByRole('combobox', { name: /^(Language|Idioma)$/ });
    await languageSelect.selectOption(language.option);
    await expect(summary).toHaveText(language.summary);
    await expect(form.locator('[data-validation-generated-error]')).toHaveText(language.inline);
    await expect(reason).toHaveValue('');
    await expect(unsentRejectionReason).toHaveValue('QA unsent review note');
    await expect(review).toHaveAttribute('open', '');
    await expect(unrelatedReview).not.toHaveAttribute('open', '');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
    expect(await summary.getAttribute('id')).toBe(sameSummaryId);
    const after = await geometry(page);
    expect(['select', 'validation-summary']).toContain(after.active);
    expect(await summary.evaluate((node, original) => node === original, summaryNode)).toBe(true);
    expect(after.scrollWidth).toBe(390);
    expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(24);
    await summary.screenshot({ path: join(evidenceRoot, language.file) });
    transitions.push({ locale: language.option, summary: await summary.textContent(), after });
  }
  const approvalPosts = observed.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/app/approvals'),
  );
  const signInPosts = observed.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/api/auth/sign-in/email'),
  );
  writeResults('locale-results.json', {
    candidateHead,
    role: 'project_manager',
    route: '/app/approvals?tab=time',
    viewport: { width: 390, height: 844 },
    before,
    transitions,
    summaryNodeRetained: true,
    reasonRetained: true,
    unsentRejectionReasonRetained: true,
    unrelatedReviewStayedClosed: true,
    openReviewActionsRetained: true,
    activeTabRetained: true,
    approvalPosts,
    fixtureSignInPosts: signInPosts.length,
    pageErrors: observed.pageErrors,
    consoleErrors: observed.consoleErrors,
  });
  expect(approvalPosts).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.consoleErrors).toEqual([]);
});
