import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials } from '../../../../tests/e2e/auth.js';

const candidateCommit = process.env.JA_CANDIDATE_COMMIT ?? 'unconfirmed';
const evidenceRoot = import.meta.dirname;
const app = (path: string) => `http://127.0.0.1:4177/j-aautomation/app${path}`;
const redact = (value: unknown) =>
  JSON.stringify(
    value,
    (_key, item) =>
      typeof item === 'string'
        ? item
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
            .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[record]')
        : item,
    2,
  ) + '\n';

async function signIn(page: Page, role: 'auditor' | 'manager') {
  const account = e2eCredentials[role];
  await page.goto(app('/login'));
  await expect(page.getByLabel('Work email')).toBeVisible();
  await page.getByLabel('Work email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (target) =>
      (target.pathname === '/j-aautomation/app' ||
        target.pathname.startsWith('/j-aautomation/app/')) &&
      !target.pathname.endsWith('/login'),
  );
}

function observe(page: Page) {
  const observed = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    responses: [] as Array<{ method: string; path: string; status: number }>,
  };
  page.on('pageerror', (error) => observed.pageErrors.push(error.message.slice(0, 180)));
  page.on('console', (entry) => {
    if (entry.type() === 'error') observed.consoleErrors.push(entry.text().slice(0, 180));
  });
  page.on('response', (response) => {
    const method = response.request().method();
    if (method !== 'GET' || response.status() >= 400)
      observed.responses.push({
        method,
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
  return observed;
}

async function viewportState(page: Page) {
  return page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollY: Math.round(scrollY),
    focus: document.activeElement?.tagName.toLowerCase() ?? null,
    focusName: (document.activeElement as HTMLInputElement | null)?.name ?? null,
    language: document.documentElement.lang,
  }));
}

test('auditor receives a role-safe approval 403 and an accessible workspace remedy', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const output: Record<string, unknown> = {
    candidateCommit,
    role: 'auditor_read_only',
    route: '/approvals',
    checks: [],
  };
  const observed = observe(page);
  try {
    await signIn(page, 'auditor');
    const response = await page.goto(app('/approvals?lang=en'));
    expect(response?.status()).toBe(403);
    const alert = page.getByRole('alert');
    const heading = alert.getByRole('heading', { name: 'Access restricted', level: 1 });
    await expect(heading).toBeFocused();
    await expect(alert).toContainText(
      'Approvals are available to owners, project managers, and finance administrators.',
    );
    await expect(alert).toContainText('contact an owner if you need this access');
    const remedy = alert.getByRole('link', { name: 'Open my workspace' });
    await expect(remedy).toHaveAttribute('href', '/j-aautomation/app/');
    expect(await alert.locator('a').count()).toBe(1);
    expect(await alert.getByRole('link', { name: /settings|finance setup|admin/i }).count()).toBe(
      0,
    );
    const phone = await viewportState(page);
    expect(phone.viewport).toBe(390);
    expect(phone.scrollWidth).toBe(390);
    expect(phone.focus).toBe('h1');
    await alert.screenshot({ path: join(evidenceRoot, 'auditor-403-390-en.png') });
    await remedy.click();
    await expect(page).toHaveURL(/\/app\/finance\?view=overview/);
    const afterRemedy = await viewportState(page);
    (output.checks as unknown[]).push({
      status: response?.status(),
      phone,
      afterRemedy,
      safeLink: '/j-aautomation/app/',
    });
    expect(
      observed.responses.some((item) => item.status === 403 && item.path.endsWith('/approvals')),
    ).toBe(true);
    expect(
      observed.responses.filter(
        (item) => item.method === 'POST' && item.path.endsWith('/approvals'),
      ),
    ).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
    expect(
      observed.consoleErrors.filter((item) => !/Failed to load resource.*403/i.test(item)),
    ).toEqual([]);
  } finally {
    output.diagnostics = observed;
    writeFileSync(join(evidenceRoot, 'auditor-results.json'), redact(output));
  }
});

test('manager validation wording changes EN to ES to PT while review state and draft text remain', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const output: Record<string, unknown> = {
    candidateCommit,
    role: 'project_manager',
    route: '/approvals?tab=time',
    transitions: [],
  };
  const observed = observe(page);
  try {
    await signIn(page, 'manager');
    await page.goto(app('/approvals?tab=time&lang=en'));
    const review = page
      .locator('details.approval-action-menu')
      .filter({
        has: page.locator(
          'form[action="?/approveRecord"] input[name="decision"][value="needs_changes"]',
        ),
      })
      .first();
    const otherReview = page
      .locator('details.approval-action-menu')
      .filter({
        has: page.locator(
          'form[action="?/approveRecord"] input[name="decision"][value="needs_changes"]',
        ),
      })
      .nth(1);
    await expect(review).toBeVisible();
    await expect(otherReview).not.toHaveAttribute('open', '');
    await review.locator('summary').click();
    const needsChanges = review.locator('form[action="?/approveRecord"]').filter({
      has: page.locator('input[name="decision"][value="needs_changes"]'),
    });
    const rejected = review.locator('form[action="?/approveRecord"]').filter({
      has: page.locator('input[name="decision"][value="rejected"]'),
    });
    const reason = needsChanges.locator('input[name="reason"]');
    const unsentRejection = rejected.locator('input[name="reason"]');
    await unsentRejection.fill('Independent QA unsent note');
    await reason.fill('');
    await needsChanges.getByRole('button', { name: 'Needs changes' }).click();
    const summary = needsChanges.locator('[data-validation-summary]');
    const inline = needsChanges.locator('[data-validation-generated-error]');
    await expect(summary).toHaveText(
      'Please correct the following fields: Required change: Please complete this field.',
    );
    await expect(inline).toHaveText('Please complete this field.');
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await expect(review).toHaveAttribute('open', '');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
    const summaryId = await summary.getAttribute('id');
    const summaryNode = await summary.elementHandle();
    if (!summaryNode) throw new Error('Validation summary is missing');
    const before = await viewportState(page);
    expect(before.scrollWidth).toBe(390);
    (output.transitions as unknown[]).push({
      locale: 'en',
      summary: await summary.textContent(),
      inline: await inline.textContent(),
      before,
    });
    await summary.screenshot({ path: join(evidenceRoot, 'manager-validation-390-en.png') });

    for (const locale of [
      {
        value: 'es',
        summary: 'Corrige los siguientes campos: Cambio requerido: Completa este campo.',
        inline: 'Completa este campo.',
        file: 'manager-validation-390-es.png',
      },
      {
        value: 'pt',
        summary: 'Corrija os seguintes campos: Alteração obrigatória: Preencha este campo.',
        inline: 'Preencha este campo.',
        file: 'manager-validation-390-pt.png',
      },
    ] as const) {
      await page.locator('select:has(option[value="pt"])').first().selectOption(locale.value);
      await expect(summary).toHaveText(locale.summary);
      await expect(inline).toHaveText(locale.inline);
      await expect(reason).toHaveValue('');
      await expect(unsentRejection).toHaveValue('Independent QA unsent note');
      await expect(review).toHaveAttribute('open', '');
      await expect(otherReview).not.toHaveAttribute('open', '');
      await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
      expect(await summary.getAttribute('id')).toBe(summaryId);
      expect(await summary.evaluate((element, original) => element === original, summaryNode)).toBe(
        true,
      );
      const state = await viewportState(page);
      expect(state.scrollWidth).toBe(390);
      expect(Math.abs(state.scrollY - before.scrollY)).toBeLessThanOrEqual(24);
      expect(state.focus).toBe('input');
      expect(state.focusName).toBe('reason');
      (output.transitions as unknown[]).push({
        locale: locale.value,
        summary: await summary.textContent(),
        inline: await inline.textContent(),
        state,
      });
      await summary.screenshot({ path: join(evidenceRoot, locale.file) });
    }
    expect(
      observed.responses.filter(
        (item) => item.method === 'POST' && item.path.endsWith('/approvals'),
      ),
    ).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
    expect(observed.consoleErrors).toEqual([]);
    output.summaryNodeRetained = true;
    output.reviewStayedOpen = true;
    output.unsentValuesRetained = true;
    output.tabStayedTime = true;
  } finally {
    output.diagnostics = observed;
    writeFileSync(join(evidenceRoot, 'manager-results.json'), redact(output));
  }
});
