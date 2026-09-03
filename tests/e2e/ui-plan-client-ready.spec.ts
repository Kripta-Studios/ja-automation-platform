import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';

const SVELTEKIT_HISTORY_INITIALIZATION_WARNING =
  "Avoid using `history.pushState(...)` and `history.replaceState(...)` as these will conflict with SvelteKit's router. Use the `pushState` and `replaceState` imports from `$app/navigation` instead.";

async function expectNoOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className.toString().slice(0, 120),
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
          scrollWidth: element.scrollWidth,
        };
      })
      // A closed off-canvas navigation intentionally sits left of the viewport;
      // only right-edge escape can widen the document and break phone layout.
      .filter((element) => element.right > innerWidth + 1)
      .slice(0, 20),
  }));
  expect(widths.document, JSON.stringify(widths.offenders, null, 2)).toBeLessThanOrEqual(
    widths.viewport + 1,
  );
  expect(widths.body, JSON.stringify(widths.offenders, null, 2)).toBeLessThanOrEqual(
    widths.viewport + 1,
  );
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

test('UI_PLAN client-ready shell, directories and responsive project editor', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('UI_PLAN evidence requires an explicit viewport');
  const consoleProblems: string[] = [];
  const responseProblems: string[] = [];
  page.on('console', (message) => {
    const knownFrameworkInitializationWarning =
      message.type() === 'warning' && message.text() === SVELTEKIT_HISTORY_INITIALIZATION_WARNING;
    if (
      !knownFrameworkInitializationWarning &&
      (message.type() === 'error' || message.type() === 'warning')
    )
      consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    consoleProblems.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`,
    ),
  );
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      response.status() >= 400 &&
      (url.pathname.startsWith('/j-aautomation/app') || url.pathname.startsWith('/api/'))
    )
      responseProblems.push(`response ${response.status()}: ${url.pathname}${url.search}`);
  });

  const alias = await page.request.get(
    'http://127.0.0.1:4174/j-aautomation/login?lang=es&next=%2Fj-aautomation%2Fapp',
    { maxRedirects: 0 },
  );
  expect(alias.status()).toBe(307);
  expect(alias.headers().location).toBe(
    'http://127.0.0.1:4174/j-aautomation/app/login?lang=es&next=%2Fj-aautomation%2Fapp',
  );

  await signIn(page, 'owner');
  const lifecycle = e2eLifecycleFixturesFor(testInfo.project.name);

  const quickActions = page.getByRole('navigation', { name: 'Dashboard actions' });
  await expect(quickActions).toBeVisible();
  await expect(
    quickActions.getByRole('link', { name: 'New project', exact: true }),
  ).toHaveAttribute('href', /\/projects#new-project$/);
  await expect(quickActions.getByRole('link', { name: 'Log actual time' })).toHaveAttribute(
    'href',
    /\/time$/,
  );

  await page.keyboard.press('Control+K');
  const search = page.locator('#portal-global-search');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#portal-search-popover [role="group"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveAttribute('aria-expanded', 'false');

  await search.fill(lifecycle.project.projectNumber);
  await search.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('q') === lifecycle.project.projectNumber);
  const searchResults = page.locator('.search-results');
  await expect(searchResults).toBeVisible();
  await expect(searchResults).toContainText(lifecycle.project.projectNumber);
  await expect(searchResults.getByRole('group', { name: /Projects|Proyectos/u })).toBeVisible();

  const toast = page.locator('[data-ui="toast"]').first();
  if (await toast.count()) await expect(toast).toHaveCSS('pointer-events', 'none');
  const feedbackTexts = await page.locator('[data-ui="toast"], .action-message').allTextContents();
  const normalizedFeedback = feedbackTexts.map((value) => value.trim()).filter(Boolean);
  expect(new Set(normalizedFeedback).size).toBe(normalizedFeedback.length);

  await page.goto(portal('/projects?view=clients'));
  const clients = page.locator('[data-client-directory]');
  await expect(clients).toBeVisible();
  await expect(clients.locator('[data-client-id]').first()).toBeVisible();
  const clientSearch = clients.getByRole('searchbox', { name: 'Search clients' });
  const clientName = (
    await clients.locator('[data-client-id] > .ui-card-heading').first().textContent()
  )?.trim();
  if (!clientName) throw new Error('Client directory fixture has no searchable client name');
  await clientSearch.fill(clientName);
  await page.locator('.locale-switcher select').selectOption('es');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(clients.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveValue(clientName);
  await expect(clients.locator('[data-client-id]')).toHaveCount(1);
  await expect(clients).not.toContainText(/\b(?:active|inactive|needs_changes)\b/u);
  await expect(clients).not.toContainText(/Begin close|Close project|client rate|internal cost/i);
  await expectNoOverflow(page);

  await page.goto(portal('/projects?view=team'));
  const teamDirectory = page.locator('[data-team-directory]');
  await expect(teamDirectory).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Equipo', exact: true }).first()).toBeVisible();
  await expect(teamDirectory.locator('[data-worker-id]').first()).toBeVisible();
  await expect(
    teamDirectory.getByText('Horas planificadas', { exact: true }).first(),
  ).toBeVisible();
  await expect(teamDirectory.getByText('Horas reales', { exact: true }).first()).toBeVisible();
  const teamSearch = teamDirectory.getByRole('searchbox', { name: 'Buscar equipo' });
  const workerName = (
    await teamDirectory.locator('[data-worker-id] > .ui-card-heading').first().textContent()
  )?.trim();
  if (!workerName) throw new Error('Team directory fixture has no searchable worker name');
  await teamSearch.fill(workerName);
  await page.locator('.locale-switcher select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Team', exact: true }).first()).toBeVisible();
  await expect(teamDirectory.getByRole('searchbox', { name: 'Search team' })).toHaveValue(
    workerName,
  );
  await page.locator('.locale-switcher select').selectOption('es');
  await expect(teamDirectory.getByRole('searchbox', { name: 'Buscar equipo' })).toHaveValue(
    workerName,
  );
  await expect(teamDirectory).not.toContainText(
    /\b(?:owner_admin|finance_admin|project_manager|auditor_read_only|fully_allocated)\b/u,
  );
  await expect(teamDirectory).not.toContainText(
    /Begin close|Close project|client rate|internal cost|compensation/i,
  );
  await expectNoOverflow(page);

  await page.goto(portal('/time'));
  const timesheetRegion = page.locator('[data-mobile-representation="cards"]').first();
  await expect(timesheetRegion).toBeVisible();
  if (viewport.width < 1024) {
    await expect(timesheetRegion.locator('[data-table-region-cards]')).toBeVisible();
    await expect(timesheetRegion.locator('[data-table-region-desktop]')).toBeHidden();
  } else {
    await expect(timesheetRegion.locator('[data-table-region-desktop]')).toBeVisible();
  }
  await expectNoOverflow(page);

  if (viewport.width < 1024) {
    const mobile = page.locator('.bottom-nav');
    await expect(mobile.getByRole('link')).toHaveCount(4);
    const more = mobile.locator('.bottom-nav-more');
    await expect(more).toBeVisible();
    const targets = await mobile.locator('a,button').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
    await more.click();
    await expect(page.locator('#portal-navigation')).toHaveClass(/(?:^|\s)open(?:\s|$)/);
    await expect(page.locator('#portal-navigation .nav-label').first()).toBeVisible();
    await page.keyboard.press('Escape');
  }

  await page.goto(portal(`/projects/${lifecycle.project.id}`));
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  const editor = page.locator('.project-edit-sheet');
  await expect(editor).toBeVisible();
  const editorBox = await editor.boundingBox();
  if (!editorBox) throw new Error('Project editor has no rendered box');
  if (viewport.width <= 640) expect(editorBox.width).toBeGreaterThanOrEqual(viewport.width * 0.95);
  else if (viewport.width === 768) {
    expect(editorBox.width).toBeGreaterThanOrEqual(viewport.width * 0.55);
    expect(editorBox.width).toBeLessThanOrEqual(viewport.width * 0.65);
  }
  const actions = editor.locator('.sheet-form-actions');
  await expect(actions).toBeVisible();
  const overlap = await editor.evaluate((element) => {
    const lastField = element.querySelector<HTMLElement>('.edit-form-section:last-of-type');
    const footer = element.querySelector<HTMLElement>('.sheet-form-actions');
    if (!lastField || !footer) return false;
    const fieldBox = lastField.getBoundingClientRect();
    const footerBox = footer.getBoundingClientRect();
    return fieldBox.bottom > footerBox.top && fieldBox.top < footerBox.bottom;
  });
  expect(overlap).toBe(false);

  const projectForm = editor.locator('form[action="?/updateProject"]');
  const costCenter = projectForm.locator('input[name="costCenterCode"]');
  if (!(await costCenter.inputValue()).trim()) await costCenter.fill('E2E-COST-CENTER');
  await projectForm.getByRole('button', { name: /Save project|Guardar proyecto/u }).click();
  const successToast = page.locator('[data-ui="toast"][data-variant="success"]');
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('role', 'status');
  await expect(successToast).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-ui="toast"]')).toHaveCount(1);
  await expectNoAxeViolations(page);
  await successToast
    .getByRole('button', { name: /Dismiss notification|Cerrar notificación/u })
    .click();
  await expect(successToast).toHaveCount(0);
  await expect(page.locator('[data-project-action-message]')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Edit project|Editar proyecto/u, exact: true }).click();
  const reopenedForm = page.locator('.project-edit-sheet form[action="?/updateProject"]');
  await reopenedForm.locator('input[name="version"]').evaluate((input) => {
    (input as HTMLInputElement).value = '0';
  });
  const problemsBeforeExpectedRejection = consoleProblems.length;
  const responsesBeforeExpectedRejection = responseProblems.length;
  await reopenedForm.getByRole('button', { name: /Save project|Guardar proyecto/u }).click();
  const errorToast = page.locator('[data-ui="toast"][data-variant="danger"]');
  await expect(errorToast).toBeVisible();
  await expect(errorToast).toHaveAttribute('role', 'alert');
  await expect(errorToast).toHaveAttribute('aria-live', 'assertive');
  await expect(page.locator('[data-ui="toast"]')).toHaveCount(1);
  await expectNoAxeViolations(page);
  await errorToast
    .getByRole('button', { name: /Dismiss notification|Cerrar notificación/u })
    .click();
  await expect(errorToast).toHaveCount(0);
  await expect(page.locator('[data-project-action-message]')).toBeVisible();
  expect(consoleProblems.slice(problemsBeforeExpectedRejection)).toEqual([
    'error: Failed to load resource: the server responded with a status of 400 (Bad Request)',
  ]);
  expect(responseProblems.slice(responsesBeforeExpectedRejection)).toEqual([
    expect.stringMatching(/^response 400: \/j-aautomation\/app\/projects\?\/updateProject/u),
  ]);
  consoleProblems.splice(problemsBeforeExpectedRejection);
  responseProblems.splice(responsesBeforeExpectedRejection);

  await page.goto(portal('/projects?view=clients&lang=es'));
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoOverflow(page);
  expect(consoleProblems).toEqual([]);
  expect(responseProblems).toEqual([]);
});
