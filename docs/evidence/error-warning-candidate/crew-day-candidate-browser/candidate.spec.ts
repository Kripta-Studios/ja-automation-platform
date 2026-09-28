import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';
import { auditCount, observe, portal, signIn } from '../project-finance-export-candidate-browser/browser-support.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '4bed1de';
const staleProject = '00000000-0000-4000-8000-ffffffffffff';
const day = '2026-09-27';
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const region = document.querySelector<HTMLElement>('[data-crew-filter-problem]');
    const notice = region?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const summary = region?.querySelector<HTMLElement>('[data-ui="validation-summary"]');
    const target = summary ?? notice;
    const rect = target?.getBoundingClientRect();
    const project = document.querySelector<HTMLSelectElement>('#crew-project');
    const date = document.querySelector<HTMLInputElement>('#crew-date');
    const params = new URLSearchParams(location.search);
    return {
      locale: document.documentElement.lang,
      width: innerWidth, height: innerHeight, scrollY: Math.round(scrollY),
      query: Object.fromEntries(['project', 'date', 'lang', 'viewportScrollY'].map((key) => [key, params.getAll(key)])),
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      remedy: notice?.querySelector('li')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      summaryPresent: Boolean(summary),
      summaryText: summary?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      summaryLinks: [...(summary?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href')),
      focusIsTarget: document.activeElement === target,
      focusedId: document.activeElement?.id ?? null,
      targetTop: rect?.top ?? null, targetBottom: rect?.bottom ?? null,
      headerBottom: document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? null,
      projectValue: project?.value ?? null,
      projectUnavailableOption: project?.selectedOptions[0]?.disabled ?? false,
      projectError: document.querySelector('#crew-project-error')?.textContent?.trim() ?? null,
      dateValue: date?.value ?? null, dateType: date?.type ?? null,
      dateError: document.querySelector('#crew-date-error')?.textContent?.trim() ?? null,
      crewEntriesCount: document.querySelectorAll('#crew-entries').length,
      crewHoursCount: document.querySelectorAll('#crew-hours').length,
      crewAssignCount: document.querySelectorAll('#crew-assign').length,
      errorPageText: !region && !project ? document.querySelector('main')?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 400) ?? null : null,
    };
  });
}

async function firstProject(page: Page) {
  const response = await page.goto(portal(`/crew?date=${day}&lang=en`));
  expect(response?.status()).toBe(200);
  return page.locator('#crew-project').inputValue();
}

for (const roleCase of [
  { width: 390, height: 844, locale: 'en' },
  { width: 1440, height: 900, locale: 'es' },
  { width: 390, height: 844, locale: 'pt' },
]) {
  test(`Owner ${roleCase.width} ${roleCase.locale}: typed Crew day filter problems`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const diagnostics = observe(page);
    await signIn(page, 'owner');
    const project = await firstProject(page);
    expect(project).toBeTruthy();
    const before = auditCount();
    const scenarios = [] as unknown[];
    for (const scenario of [
      { name: 'invalid calendar', query: `project=${project}&date=2026-02-30`, code: 'CREW_DAY_DATE_INVALID', date: '2026-02-30', project },
      { name: 'invalid text', query: `project=${project}&date=not-a-date`, code: 'CREW_DAY_DATE_INVALID', date: 'not-a-date', project },
      { name: 'duplicate date', query: `project=${project}&date=${day}&date=2026-09-28`, code: 'CREW_DAY_DATE_DUPLICATE', date: day, project },
      { name: 'duplicate project', query: `project=${project}&project=${staleProject}&date=${day}`, code: 'CREW_DAY_PROJECT_DUPLICATE', date: day, project },
      { name: 'stale project', query: `project=${staleProject}&date=${day}`, code: 'CREW_DAY_PROJECT_UNAVAILABLE_OWNER', date: day, project: staleProject },
      { name: 'combined malformed duplicate', query: `project=${project}&date=not-a-date&date=${day}`, code: 'CREW_DAY_DATE_DUPLICATE', date: 'not-a-date', project },
      { name: 'multi field', query: `project=${staleProject}&project=${project}&date=not-a-date&date=${day}`, code: 'CREW_DAY_PROJECT_DUPLICATE', date: 'not-a-date', project: staleProject },
    ]) {
      const response = await page.goto(portal(`/crew?${scenario.query}&lang=${roleCase.locale}`));
      await expect(page.locator(`[data-crew-filter-problem] [data-problem-code="${scenario.code}"]`)).toBeVisible();
      await page.waitForTimeout(100);
      const ui = await snapshot(page);
      scenarios.push({ name: scenario.name, status: response?.status(), ui });
      if (scenario.name === 'combined malformed duplicate')
        await page.locator('[data-crew-filter-problem]').screenshot({ path: join(evidenceRoot, `owner-${roleCase.width}-${roleCase.locale}-combined.png`) });
      if (scenario.name === 'multi field')
        await page.locator('[data-crew-filter-problem]').screenshot({ path: join(evidenceRoot, `owner-${roleCase.width}-${roleCase.locale}-multi-field.png`) });
      expect(response?.status()).toBe(200);
      expect(ui.code).toBe(scenario.code);
      expect(ui.projectValue).toBe(scenario.project);
      expect(ui.dateValue).toBe(scenario.date);
      expect(ui.crewEntriesCount).toBe(0);
      expect(ui.crewHoursCount).toBe(0);
      expect(ui.crewAssignCount).toBe(0);
      expect(ui.focusIsTarget).toBe(true);
      expect(ui.targetTop).toBeGreaterThanOrEqual(0);
      expect(ui.targetBottom).toBeLessThanOrEqual(roleCase.height);
      if (scenario.name === 'stale project') {
        expect(ui.projectUnavailableOption).toBe(true);
        expect(ui.remedyHref).toContain('/projects');
      }
      if (scenario.name === 'combined malformed duplicate') {
        expect(ui.dateType).toBe('text');
        expect(ui.dateError).toMatch(/(?:YYYY|AAAA)-MM-DD/u);
      }
      if (scenario.name === 'multi field') {
        expect(ui.summaryPresent).toBe(true);
        expect(ui.summaryLinks).toEqual(['#crew-filter-project', '#crew-filter-date']);
        expect(ui.projectUnavailableOption).toBe(true);
      }
    }
    const after = auditCount();
    writeFileSync(join(evidenceRoot, `owner-${roleCase.width}-${roleCase.locale}-results.json`), redact({ candidateCommit, role: 'owner', ...roleCase, scenarios, audits: { before, after }, diagnostics }) + '\n');
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  });
}

test('Owner native GET correction retains project, date, scroll, and allows valid retry', async ({ page }) => {
  test.setTimeout(150_000);
  const diagnostics = observe(page);
  await signIn(page, 'owner');
  const project = await firstProject(page);
  const before = auditCount();
  await page.goto(portal(`/crew?project=${project}&date=2026-09-31&lang=en`));
  const form = page.locator('[data-crew-filter-form]');
  await form.locator('[name="date"]').fill('not-a-date');
  const startScroll = await page.evaluate(() => { window.scrollTo(0, 300); return Math.round(scrollY); });
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('date') === 'not-a-date'),
    form.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator('[data-problem-code="CREW_DAY_DATE_INVALID"]')).toBeVisible();
  await page.waitForTimeout(250);
  const invalid = await snapshot(page);
  await page.locator('[data-crew-filter-problem]').screenshot({ path: join(evidenceRoot, 'owner-390-native-invalid.png') });
  await form.locator('[name="date"]').fill(day);
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('date') === day),
    form.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator('[data-crew-filter-problem]')).toHaveCount(0);
  const corrected = await snapshot(page);
  const after = auditCount();
  writeFileSync(join(evidenceRoot, 'owner-390-native-results.json'), redact({ candidateCommit, role: 'owner', startScroll, invalid, corrected, audits: { before, after }, diagnostics }) + '\n');
  expect(invalid.projectValue).toBe(project);
  expect(invalid.dateValue).toBe('not-a-date');
  expect(invalid.focusIsTarget).toBe(true);
  expect(invalid.targetTop).toBeGreaterThanOrEqual(0);
  expect(invalid.targetBottom).toBeLessThanOrEqual(844);
  expect(corrected.code).toBeNull();
  expect(corrected.projectValue).toBe(project);
  expect(corrected.dateValue).toBe(day);
  expect(corrected.crewAssignCount).toBe(1);
  expect(after).toBe(before);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});

test('Finance cannot see Crew day form or rows', async ({ page }) => {
  const diagnostics = observe(page);
  await signIn(page, 'finance');
  const response = await page.goto(portal(`/crew?project=${staleProject}&date=not-a-date&lang=en`));
  const ui = await snapshot(page);
  writeFileSync(join(evidenceRoot, 'finance-denied-results.json'), redact({ candidateCommit, role: 'finance', status: response?.status(), ui, diagnostics }) + '\n');
  expect(response?.status()).toBe(403);
  expect(ui.crewEntriesCount).toBe(0);
  expect(ui.crewHoursCount).toBe(0);
  expect(ui.crewAssignCount).toBe(0);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});

test('Chief sees a role-safe stale delegation problem after Owner revokes via UI', async ({ browser, page }) => {
  test.setTimeout(180_000);
  const diagnostics = observe(page);
  await signIn(page, 'owner');
  await firstProject(page);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const knownWorkers = (['worker', 'worker2'] as const).map((role) => {
    const row = db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials[role].email) as { id: string } | undefined;
    return { role, id: row?.id ?? '' };
  });
  db.close();
  const projects = await page.locator('#crew-project option[value]:not([value=""])').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );
  let grant: { project: string; chief: 'worker' | 'worker2'; chiefId: string; team: string } | null = null;
  for (const project of projects) {
    await page.goto(portal(`/crew?project=${project}&date=${day}&lang=en`));
    const form = page.locator('[data-crew-operation="grant"]');
    if (!await form.count()) continue;
    const choices = await form.locator('[name="chiefUserId"] option[value]:not([value=""])').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    const chief = knownWorkers.find((worker) => choices.includes(worker.id));
    const team = choices.find((id) => id !== chief?.id);
    if (chief && team) {
      grant = { project, chief: chief.role, chiefId: chief.id, team };
      await form.locator('[name="chiefUserId"]').selectOption(chief.id);
      await form.locator('[name="workerUserId"]').selectOption(team);
      await form.locator('[name="startsOn"]').fill(day);
      await Promise.all([
        page.waitForResponse((response) => response.url().includes('/crew?/grant') && response.request().method() === 'POST'),
        form.locator('button[type="submit"]').click(),
      ]);
      await expect(page.locator('#crew-delegations .grant-list li')).toHaveCount(1);
      break;
    }
  }
  if (!grant) {
    writeFileSync(join(evidenceRoot, 'chief-fixture-gap-results.json'), redact({ candidateCommit, reason: 'No Crew project had two active candidate workers including a login-capable E2E worker.', projectsInspected: projects.length, diagnostics }) + '\n');
    test.skip(true, 'Disposable fixture has no UI-grantable login-capable chief');
    return;
  }
  const chiefContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const chiefPage = await chiefContext.newPage();
  const chiefDiagnostics = observe(chiefPage);
  await signIn(chiefPage, grant.chief);
  const validResponse = await chiefPage.goto(portal(`/crew?project=${grant.project}&date=${day}&lang=pt`));
  expect(validResponse?.status()).toBe(200);
  const valid = await snapshot(chiefPage);
  expect(valid.code).toBeNull();
  expect(valid.crewHoursCount).toBe(1);
  const beforeInvalid = auditCount();
  const invalidResponse = await chiefPage.goto(portal(`/crew?project=${grant.project}&date=not-a-date&lang=pt`));
  await expect(chiefPage.locator('[data-problem-code="CREW_DAY_DATE_INVALID"]')).toBeVisible();
  const invalid = await snapshot(chiefPage);
  expect(invalidResponse?.status()).toBe(200);
  expect(invalid.projectValue).toBe(grant.project);
  expect(invalid.dateValue).toBe('not-a-date');
  expect(invalid.focusIsTarget).toBe(true);
  expect(invalid.crewHoursCount).toBe(0);
  expect(auditCount()).toBe(beforeInvalid);
  await chiefPage.locator('#crew-date').fill(day);
  await chiefPage.locator('[data-crew-filter-form] button[type="submit"]').click();
  await expect(chiefPage.locator('#crew-hours')).toBeVisible();
  const corrected = await snapshot(chiefPage);
  // The chief keeps this form open while the Owner removes the delegation.
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/crew?/revoke') && response.request().method() === 'POST'),
    page.locator('#crew-delegations [data-crew-operation="revoke"] button').click(),
  ]);
  await expect(page.locator('#crew-delegations .grant-list')).toContainText('revoked');
  const beforeStale = auditCount();
  const afterRevokeDb = new DatabaseSync(readE2EFixturePointer().databasePath);
  const grantRows = afterRevokeDb.prepare('SELECT status FROM crew_leader_grant WHERE project_id=? AND chief_user_id=?').all(grant.project, grant.chiefId) as { status: string }[];
  afterRevokeDb.close();
  const chiefResponses: Array<{ status: number; type: string }> = [];
  const chiefRequests: Array<{ method: string; type: string }> = [];
  chiefPage.on('response', (response) => {
    if (response.url().includes('/app/crew?')) chiefResponses.push({ status: response.status(), type: response.request().resourceType() });
  });
  chiefPage.on('request', (request) => {
    if (request.url().includes('/app/crew?')) chiefRequests.push({ method: request.method(), type: request.resourceType() });
  });
  const formBeforeSubmit = await chiefPage.locator('[data-crew-filter-form]').evaluate((form) => ({
    valid: (form as HTMLFormElement).checkValidity(),
    action: (form as HTMLFormElement).getAttribute('action'),
    date: (form as HTMLFormElement).querySelector<HTMLInputElement>('[name="date"]')?.value,
  }));
  await chiefPage.locator('[data-crew-filter-form] button[type="submit"]').click();
  await chiefPage.waitForTimeout(300);
  const stalePreassert = await snapshot(chiefPage);
  const requestsAfterSubmit = [...chiefRequests];
  const responsesAfterSubmit = [...chiefResponses];
  await chiefPage.locator('[data-crew-filter-form]').screenshot({ path: join(evidenceRoot, 'chief-390-pt-stale-after-same-value-submit.png') });
  const freshResponse = await chiefPage.goto(portal(`/crew?project=${grant.project}&date=${day}&lang=pt`));
  await expect(chiefPage.locator('[data-problem-code="CREW_DAY_PROJECT_UNAVAILABLE_CHIEF"]')).toBeVisible();
  const fresh = await snapshot(chiefPage);
  await chiefPage.locator('[data-crew-filter-problem]').screenshot({ path: join(evidenceRoot, 'chief-390-pt-fresh-stale-notice.png') });
  writeFileSync(join(evidenceRoot, 'chief-stale-diagnostic.json'), redact({ candidateCommit, grantRows, formBeforeSubmit, requestsAfterSubmit, responsesAfterSubmit, stalePreassert, freshStatus: freshResponse?.status(), fresh, diagnostics, chiefDiagnostics }) + '\n');
  expect(stalePreassert.code).toBe('CREW_DAY_PROJECT_UNAVAILABLE_CHIEF');
  await expect(chiefPage.locator('[data-problem-code="CREW_DAY_PROJECT_UNAVAILABLE_CHIEF"]')).toBeVisible();
  const stale = await snapshot(chiefPage);
  await chiefPage.locator('[data-crew-filter-problem]').screenshot({ path: join(evidenceRoot, 'chief-390-pt-stale.png') });
  const afterStale = auditCount();
  writeFileSync(join(evidenceRoot, 'chief-390-pt-results.json'), redact({ candidateCommit, role: grant.chief, scenario: 'Owner granted and revoked via UI; Chief retained form then submitted', valid, invalid, corrected, stale, audits: { beforeInvalid, beforeStale, afterStale }, diagnostics, chiefDiagnostics }) + '\n');
  expect(stale.projectValue).toBe(grant.project);
  expect(stale.projectUnavailableOption).toBe(true);
  expect(stale.dateValue).toBe(day);
  expect(stale.crewHoursCount).toBe(0);
  expect(stale.crewEntriesCount).toBe(0);
  expect(stale.focusIsTarget).toBe(true);
  expect(stale.remedyHref).toBeNull();
  expect(afterStale).toBe(beforeStale);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(chiefDiagnostics.pageErrors).toEqual([]);
  expect(chiefDiagnostics.consoleErrors).toEqual([]);
  await chiefContext.close();
});
