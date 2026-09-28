import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';
import {
  seedSupplierPersonas,
  signInManualPersona,
} from '../../../../tests/e2e/manual-persona-fixture.js';

const evidenceRoot = import.meta.dirname;
const period = { from: '2026-09-01', to: '2026-09-30' };

function diagnostics(page: Page) {
  const result = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  return result;
}

function reportUrl(projectId: string, locale: string) {
  return portal(
    `/supplier?projectId=${projectId}&from=${period.from}&to=${period.to}&workspaceAction=report&lang=${locale}`,
  );
}

function state(db: DatabaseSync, id: string) {
  return db
    .prepare('SELECT approval_state,version,activity_summary FROM time_entry WHERE id=?')
    .get(id) as { approval_state: string; version: number; activity_summary: string };
}

function auditCount(db: DatabaseSync, id: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(id) as {
      count: number;
    }
  ).count;
}

async function createDraft(
  page: Page,
  db: DatabaseSync,
  projectId: string,
  locale: string,
  date: string,
) {
  const marker = `QA supplier stale ${randomUUID()}`;
  await page.goto(
    portal(
      `/supplier?projectId=${projectId}&from=${period.from}&to=${period.to}&workspaceAction=time&lang=${locale}`,
    ),
  );
  const form = page.locator('form[data-supplier-operation="createTimeBatch"]');
  await expect(form).toBeVisible();
  await form.locator('.batch-technician input[type="checkbox"]').first().check();
  await form.locator('[name="workDate"]').fill(date);
  await form.locator('[name="durationHours"]').fill('1');
  await form.locator('[name="summary"]').fill(marker);
  const pending = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/createTimeBatch'),
  );
  await form.locator('button.primary-button').click();
  expect((await pending).status()).toBeLessThan(400);
  await expect
    .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(marker))
    .toBeTruthy();
  const id = (
    db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(marker) as { id: string }
  ).id;
  expect(state(db, id)).toMatchObject({ approval_state: 'draft', version: 1 });
  return id;
}

function submitForm(page: Page, id: string) {
  return page
    .locator('form[data-supplier-operation="submitTime"]')
    .filter({ has: page.locator(`input[name="id"][value="${id}"]`) });
}

async function editDraft(
  page: Page,
  db: DatabaseSync,
  projectId: string,
  locale: string,
  id: string,
) {
  await page.goto(reportUrl(projectId, locale));
  const row = page.locator('article').filter({ has: submitForm(page, id) });
  await expect(row).toBeVisible();
  const details = row
    .locator('details')
    .filter({ has: page.locator('form[data-supplier-operation="updateTime"]') });
  await details.locator('summary').click();
  const form = details.locator('form[data-supplier-operation="updateTime"]');
  const newSummary = `Changed after open ${randomUUID()}`;
  await form.locator('textarea[name="summary"]').fill(newSummary);
  const pending = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/updateTime'),
  );
  await form.locator('button.primary-button').click();
  expect((await pending).status()).toBeLessThan(400);
  await expect.poll(() => state(db, id).version).toBe(2);
  expect(state(db, id).activity_summary).toBe(newSummary);
}

async function post(page: Page, form: Locator, action: string) {
  const pending = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes(`?/${action}`),
  );
  await form.locator('button.primary-button').click();
  const response = await pending;
  await page.waitForLoadState('networkidle');
  const body = await response.text();
  return {
    transportStatus: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    code: body.match(/ACTION_ERROR_CONFLICT|SUPPLIER_[A-Z_]+/u)?.[0] ?? null,
    genericPhrase: body.includes('This action conflicts with the current record state.'),
  };
}

async function visible(page: Page, action: string) {
  await expect(page.locator('#supplier-workspace [data-ui="problem-notice"]')).toBeVisible();
  return page.evaluate((action) => {
    const notice = document.querySelector<HTMLElement>(
      '#supplier-workspace [data-ui="problem-notice"]',
    );
    const bounds = notice?.getBoundingClientRect();
    const active = document.activeElement;
    const activeBox = active?.getBoundingClientRect();
    const batch = document.querySelector<HTMLFormElement>(
      'form[data-supplier-operation="submitTimeBatch"]',
    );
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll('a') ?? [])].map((a) => a.textContent?.trim()),
      focusedNotice: active === notice,
      activeTag: active?.tagName.toLowerCase() ?? null,
      activeTop: activeBox ? Math.round(activeBox.top) : null,
      activeBottom: activeBox ? Math.round(activeBox.bottom) : null,
      noticeTop: bounds ? Math.round(bounds.top) : null,
      noticeBottom: bounds ? Math.round(bounds.bottom) : null,
      headerBottom: Math.round(
        document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0,
      ),
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      workspace: new URL(location.href).searchParams.get('workspaceAction'),
      locale: new URL(location.href).searchParams.get('lang'),
      selectedCount: [
        ...document.querySelectorAll<HTMLInputElement>('.draft-selector input:checked'),
      ].length,
      selectedPayloadCount: JSON.parse(
        batch?.querySelector<HTMLInputElement>('input[name="entries"]')?.value ?? '[]',
      ).length,
      submittedFormPresent: Boolean(
        document.querySelector(`form[data-supplier-operation="${action}"]`),
      ),
    };
  }, action);
}

for (const scenario of [
  { name: 'phone-390', locale: 'en', width: 390 },
  { name: 'desktop', locale: 'pt', width: 1440 },
] as const) {
  test(`Supplier Coordinator stale Time submission baseline ${scenario.name}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== scenario.name);
    test.setTimeout(170_000);
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
    const diagA = diagnostics(page);
    const tabB = await page.context().newPage();
    const diagB = diagnostics(tabB);
    const results: Record<string, unknown> = {
      candidateCommit: 'a21d12d0383b149170da7a6d3faad70bde37a5b2',
      role: 'supplierCoordinator',
      viewport: `${scenario.width}x${scenario.name === 'desktop' ? 900 : 844}`,
      locale: scenario.locale,
      fixture:
        'fresh disposable database; role/grant scaffold; Time drafts created through rendered Supplier forms',
      cases: [],
    };
    const cases = results.cases as Array<Record<string, unknown>>;
    try {
      await signInManualPersona(page, 'supplierCoordinator');
      const changedId = await createDraft(page, db, projectId, scenario.locale, '2026-09-22');
      await page.goto(reportUrl(projectId, scenario.locale));
      const stale = submitForm(page, changedId);
      await expect(stale.locator('input[name="version"]')).toHaveValue('1');
      // This tab shares the authenticated browser context with Tab A.
      await editDraft(tabB, db, projectId, scenario.locale, changedId);
      const beforeChanged = {
        scrollY: await page.evaluate(() => Math.round(scrollY)),
        audits: auditCount(db, changedId),
      };
      const changedResponse = await post(page, stale, 'submitTime');
      const changedVisible = await visible(page, 'submitTime');
      expect(changedResponse.transportStatus).toBe(409);
      expect(changedVisible.code).toBe('ACTION_ERROR_CONFLICT');
      expect(state(db, changedId)).toMatchObject({ approval_state: 'draft', version: 2 });
      expect(auditCount(db, changedId)).toBe(beforeChanged.audits);
      await page.locator('#supplier-workspace [data-ui="problem-notice"]').screenshot({
        path: join(evidenceRoot, `changed-${scenario.name}-${scenario.locale}.png`),
      });
      cases.push({
        kind: 'changed-draft',
        before: beforeChanged,
        response: changedResponse,
        visible: changedVisible,
        unchanged: true,
      });

      const submittedId = await createDraft(tabB, db, projectId, scenario.locale, '2026-09-23');
      await page.goto(reportUrl(projectId, scenario.locale));
      const staleStatus = submitForm(page, submittedId);
      await expect(staleStatus).toBeVisible();
      await tabB.goto(reportUrl(projectId, scenario.locale));
      const successful = await post(tabB, submitForm(tabB, submittedId), 'submitTime');
      expect(successful.transportStatus).toBeLessThan(400);
      await expect.poll(() => state(db, submittedId).approval_state).toBe('submitted');
      const beforeStatus = {
        scrollY: await page.evaluate(() => Math.round(scrollY)),
        audits: auditCount(db, submittedId),
      };
      const statusResponse = await post(page, staleStatus, 'submitTime');
      const statusVisible = await visible(page, 'submitTime');
      expect(statusResponse.transportStatus).toBe(409);
      expect(statusVisible.code).toBe('ACTION_ERROR_CONFLICT');
      expect(auditCount(db, submittedId)).toBe(beforeStatus.audits);
      cases.push({
        kind: 'already-submitted',
        before: beforeStatus,
        response: statusResponse,
        visible: statusVisible,
        unchanged: true,
      });

      expect(diagA.pageErrors).toEqual([]);
      expect(diagA.consoleErrors).toEqual([]);
      expect(diagB.pageErrors).toEqual([]);
      expect(diagB.consoleErrors).toEqual([]);
      results.diagnostics = { tabA: diagA, tabB: diagB };
    } finally {
      db.close();
      await tabB.close().catch(() => {});
      writeFileSync(
        join(evidenceRoot, `results-${scenario.name}.json`),
        JSON.stringify(results, null, 2) + '\n',
      );
    }
  });
}
