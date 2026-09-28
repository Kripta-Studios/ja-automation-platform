import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const candidateCommit = 'bb999a9';
const origin = 'http://127.0.0.1:4174';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/billing-invoice-stream-prerequisite-browser',
);
const warningCode = 'WARNING_BILLING_INVOICE_NEEDS_ACTIVE_STREAM';

const cases = [
  {
    role: 'finance',
    locale: 'en',
    width: 390,
    height: 844,
    message:
      'An invoice draft needs an active billing stream for the selected project. Set up a stream below, then choose Create invoice again.',
  },
  {
    role: 'owner',
    locale: 'es',
    width: 1440,
    height: 900,
    message:
      'Un borrador de factura necesita un flujo de facturación activo para el proyecto seleccionado. Configura un flujo a continuación y vuelve a elegir Crear factura.',
  },
  {
    role: 'finance',
    locale: 'pt',
    width: 390,
    height: 844,
    message:
      'Um rascunho de fatura precisa de um fluxo de faturação ativo para o projeto selecionado. Configure um fluxo abaixo e volte a escolher Criar fatura.',
  },
] as const;

function seedProjectWithoutStream(instance = 0): { id: string; databasePath: string } {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const ownerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const managerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.manager.email) as {
        id: string;
      }
    ).id;
    const owner = new PortalRepository(db.sqlite).principalFor(ownerId);
    const id = new PortalRepository(db.sqlite).createProject(owner, {
      clientId: e2eLifecycleFixturesFor('phone-390').client.id,
      name: `QA invoice stream prerequisite ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-BILL-PREREQ', 94, 'phone-390', instance),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: new Date().toISOString().slice(0, 10),
      projectManagerId: managerId,
    }).id;
    expect(
      (
        db.sqlite
          .prepare('SELECT count(*) AS count FROM billing_rule WHERE project_id=?')
          .get(id) as {
          count: number;
        }
      ).count,
    ).toBe(0);
    return { id, databasePath };
  } finally {
    db.sqlite.close();
  }
}

function financialRowCounts(databasePath: string): { billingRules: number; invoices: number } {
  const db = createDatabase(databasePath);
  try {
    return {
      billingRules: (
        db.sqlite.prepare('SELECT count(*) AS count FROM billing_rule').get() as { count: number }
      ).count,
      invoices: (
        db.sqlite.prepare('SELECT count(*) AS count FROM invoice').get() as { count: number }
      ).count,
    };
  } finally {
    db.sqlite.close();
  }
}

function activeStreamCount(databasePath: string, projectId: string): number {
  const db = createDatabase(databasePath);
  try {
    return (
      db.sqlite
        .prepare('SELECT count(*) AS count FROM billing_rule WHERE project_id=? AND enabled=1')
        .get(projectId) as { count: number }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page, role: 'owner' | 'finance'): Promise<void> {
  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (url) => url.pathname.startsWith('/j-aautomation/app') && !url.pathname.endsWith('/login'),
  );
}

test('invoice prerequisite explains the blocked wizard and preserves project across roles and locales', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const project = seedProjectWithoutStream();
  const before = financialRowCounts(project.databasePath);
  const results: Array<Record<string, unknown>> = [];
  mkdirSync(evidenceDirectory, { recursive: true });

  for (const scenario of cases) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const billingWrites: Array<{ method: string; status: number }> = [];
    let clickedCreate = false;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (clickedCreate && response.request().method() !== 'GET')
        billingWrites.push({ method: response.request().method(), status: response.status() });
    });

    await signIn(page, scenario.role);
    await page.goto(portal(`/billing?lang=${scenario.locale}`));
    await page.waitForLoadState('networkidle');
    const projectFilter = page.locator('.billing-section__filters select').first();
    await expect(projectFilter.locator(`option[value="${project.id}"]`)).toHaveCount(1);
    await projectFilter.selectOption(project.id);
    expect(await projectFilter.inputValue()).toBe(project.id);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    clickedCreate = true;
    await page.locator('.billing-section__context button').click();
    const notice = page.locator(`[data-problem-code="${warningCode}"]`);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(scenario.message);
    await expect(page.locator('.billing-section__workspace [role="tab"]').last()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.locator('form[action="?/createBillingRule"] select[name="projectId"]'),
    ).toHaveValue(project.id);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-problem-code')))
      .toBe(warningCode);
    const remedy = notice.locator('a[href="#billing-new-stream-project"]');
    await expect(remedy).toBeVisible();
    const noticeBox = await notice.boundingBox();
    expect(noticeBox).not.toBeNull();
    expect(noticeBox!.y).toBeGreaterThanOrEqual(scenario.width === 390 ? 65 : 0);
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(
      scenario.height - (scenario.width === 390 ? 75 : 0),
    );
    const unobscured = await notice.evaluate((element) => {
      const title = element.querySelector('strong');
      const link = element.querySelector('a');
      const hit = (target: Element | null) => {
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        const found = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return found === target || target.contains(found);
      };
      return { title: hit(title), remedy: hit(link) };
    });
    expect(unobscured).toEqual({ title: true, remedy: true });
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBe(scenario.width);

    await notice.screenshot({
      path: join(
        evidenceDirectory,
        `post-save-fix-prerequisite-${scenario.role}-${scenario.locale}-${scenario.width}.png`,
      ),
    });
    await remedy.click();
    await expect(page.locator('#billing-new-stream-project')).toBeFocused();
    await expect(page.locator('#billing-new-stream-project')).toHaveValue(project.id);

    // Leaving the guided prerequisite clears its wording; returning to setup
    // does not attach the old selected-project reason to an unrelated action.
    const tabs = page.locator('.billing-section__workspace [role="tab"]');
    await tabs.nth(0).click();
    await tabs.nth(2).click();
    await expect(page.locator(`[data-problem-code="${warningCode}"]`)).toHaveCount(0);
    await page.locator('.billing-section__setup-actions button').nth(2).click();
    await expect(page.locator(`[data-problem-code="${warningCode}"]`)).toHaveCount(0);
    await page.locator('.billing-section__setup-actions button').first().click();
    await expect(page.locator(`[data-problem-code="${warningCode}"]`)).toHaveCount(0);
    await tabs.nth(0).click();
    const otherProjectId = await projectFilter
      .locator('option')
      .evaluateAll(
        (options, selectedId) =>
          options.map((option) => option.value).find((value) => value && value !== selectedId),
        project.id,
      );
    expect(otherProjectId).toBeTruthy();
    await projectFilter.selectOption(otherProjectId!);
    await page.locator('.billing-section__context button').click();
    await expect(page.locator('.billing-section__invoice-wizard')).toBeVisible();
    await expect(page.locator(`[data-problem-code="${warningCode}"]`)).toHaveCount(0);
    expect(billingWrites).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    results.push({
      role: scenario.role,
      locale: scenario.locale,
      width: scenario.width,
      warningCode,
      warningText: scenario.message,
      selectedProjectRetained: true,
      warningFocused: true,
      remedyFocusedProject: true,
      scrollBefore,
      scrollAfter,
      noticeWithinViewport: true,
      unobscured,
      manualNavigationClearsWarning: true,
      otherProjectOpensWizardWithoutStaleWarning: true,
      pageWidth,
      billingWrites,
      pageErrors,
      consoleErrors,
    });
    await context.close();
  }

  expect(financialRowCounts(project.databasePath)).toEqual(before);
  writeFileSync(
    join(evidenceDirectory, 'post-save-fix-prerequisite-results.json'),
    `${JSON.stringify({ candidateCommit, source: 'disposable-browser-fixture', financialRowsUnchanged: true, cases: results }, null, 2)}\n`,
  );
});

test('guided stream save removes the prerequisite only after the target gains an active stream', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const guidedCases = [
    { role: 'finance', locale: 'en', width: 390, height: 844, success: 'Billing stream saved.' },
    {
      role: 'owner',
      locale: 'es',
      width: 1440,
      height: 900,
      success: 'Flujo de facturación guardado.',
    },
  ] as const;
  const results: Array<Record<string, unknown>> = [];
  mkdirSync(evidenceDirectory, { recursive: true });

  for (const [index, scenario] of guidedCases.entries()) {
    const project = seedProjectWithoutStream(index + 1);
    const otherProject = index === 0 ? seedProjectWithoutStream(3) : null;
    const before = financialRowCounts(project.databasePath);
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const billingWrites: Array<{ operation: string; status: number }> = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().includes('createBillingRule'))
        billingWrites.push({ operation: 'createBillingRule', status: response.status() });
    });

    await signIn(page, scenario.role);
    await page.goto(portal(`/billing?lang=${scenario.locale}`));
    await page.waitForLoadState('networkidle');
    await page.locator('.billing-section__filters select').first().selectOption(project.id);
    await page.locator('.billing-section__context button').click();
    const warning = page.locator(`[data-problem-code="${warningCode}"]`);
    await expect(warning).toBeVisible();
    await expect(
      page.locator('form[action="?/createBillingRule"] select[name="projectId"]'),
    ).toHaveValue(project.id);
    const form = page.locator('form[action="?/createBillingRule"]');
    const saveStreamFor = async (projectId: string) => {
      await form.locator('select[name="projectId"]').selectOption(projectId);
      await expect(form.locator('select[name="legalEntityId"]')).not.toHaveValue('');
      await expect(form.locator('input[name="currency"]')).toHaveValue('USD');
      await form.locator('select[name="cadenceType"]').selectOption('manual');
      await form.locator('input[name="effectiveFrom"]').fill(new Date().toISOString().slice(0, 10));
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('createBillingRule'),
      );
      await form.locator('button[type="submit"]').click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      await page.waitForLoadState('networkidle');
    };

    if (otherProject) {
      await saveStreamFor(otherProject.id);
      await expect.poll(() => activeStreamCount(project.databasePath, otherProject.id)).toBe(1);
      expect(activeStreamCount(project.databasePath, project.id)).toBe(0);
      await expect(warning).toBeVisible();
      await warning.screenshot({
        path: join(evidenceDirectory, 'guided-stream-unrelated-save-warning-finance-en-390.png'),
      });
    }

    await saveStreamFor(project.id);
    await expect.poll(() => activeStreamCount(project.databasePath, project.id)).toBe(1);
    await expect(warning).toHaveCount(0);
    const success = page.locator('[data-ui="toast"][data-variant="success"]').filter({
      hasText: scenario.success,
    });
    await expect(success).toBeVisible();
    await expect(success).toHaveAttribute('role', 'status');
    await expect(success).toHaveAttribute('aria-live', 'polite');
    const focus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      connected: document.activeElement?.isConnected ?? false,
    }));
    expect(focus.connected).toBe(true);
    await success.screenshot({
      path: join(
        evidenceDirectory,
        `guided-stream-success-${scenario.role}-${scenario.locale}-${scenario.width}.png`,
      ),
    });

    await page.locator('.billing-section__context button').click();
    await expect(page.locator('.billing-section__invoice-wizard')).toBeVisible();
    await expect(warning).toHaveCount(0);
    expect(billingWrites).toEqual(
      Array.from({ length: otherProject ? 2 : 1 }, () => ({
        operation: 'createBillingRule',
        status: 200,
      })),
    );
    expect(financialRowCounts(project.databasePath)).toEqual({
      billingRules: before.billingRules + (otherProject ? 2 : 1),
      invoices: before.invoices,
    });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    results.push({
      role: scenario.role,
      locale: scenario.locale,
      width: scenario.width,
      successText: scenario.success,
      unrelatedStreamDidNotClearWarning: Boolean(otherProject),
      warningRemovedAfterTargetStream: true,
      successStatusAnnounced: true,
      focus,
      activeStreamCount: 1,
      invoiceCountUnchanged: true,
      billingWrites,
      pageErrors,
      consoleErrors,
    });
    await context.close();
  }

  writeFileSync(
    join(evidenceDirectory, 'guided-stream-save-results.json'),
    `${JSON.stringify({ candidateCommit, source: 'disposable-browser-fixture', cases: results }, null, 2)}\n`,
  );
});
