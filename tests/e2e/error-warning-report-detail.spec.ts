import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-report-detail');
const workDate = new Date().toISOString().slice(0, 10);

type ReportKind = 'daily' | 'technical';

function seedReport(viewport: string, kind: ReportKind) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const workerId = userId(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Report detail recovery ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-REPORT-DETAIL', kind === 'daily' ? 81 : 82, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
    }).id;
    const status = (
      db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable report-detail QA project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: workDate });
    const worker = repository.principalFor(workerId);
    const report =
      kind === 'daily'
        ? repository.createDailyReport(worker, {
            projectId,
            workDate,
            summary: 'Original shift summary',
            tasksCompleted: 'Verified the equipment',
            downtimeMinutes: 0,
            safetyRelated: false,
          })
        : repository.createTechnicalReport(worker, {
            projectId,
            reportDate: workDate,
            systemName: 'Disposable QA controller',
            changeSummary: 'Original technical change account',
            safetyRelated: false,
          });
    return { databasePath, reportId: report.id, projectId, workerId };
  } finally {
    db.sqlite.close();
  }
}

function reportVersion(databasePath: string, kind: ReportKind, id: string): number {
  const db = createDatabase(databasePath);
  try {
    const table = kind === 'daily' ? 'daily_report' : 'technical_report';
    return (
      db.sqlite.prepare(`SELECT version FROM ${table} WHERE id=?`).get(id) as {
        version: number;
      }
    ).version;
  } finally {
    db.sqlite.close();
  }
}

function changeReportVersion(databasePath: string, kind: ReportKind, id: string): void {
  const db = createDatabase(databasePath);
  try {
    const table = kind === 'daily' ? 'daily_report' : 'technical_report';
    db.sqlite.prepare(`UPDATE ${table} SET version=version+1 WHERE id=?`).run(id);
  } finally {
    db.sqlite.close();
  }
}

function submitOutsideBrowser(
  databasePath: string,
  kind: ReportKind,
  id: string,
  workerId: string,
) {
  const db = createDatabase(databasePath);
  try {
    const repository = new PortalRepository(db.sqlite);
    const worker = repository.principalFor(workerId);
    repository.submitReport(worker, kind, id, reportVersion(databasePath, kind, id));
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials.owner.email);
  await page.getByLabel('Password').fill(e2eCredentials.owner.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

function diagnosticsFor(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { pageErrors, consoleErrors, responses };
}

async function submitNative(page: Page): Promise<number> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/updateReport'),
  );
  await page.locator('form[data-report-autosave-form]').evaluate((form: HTMLFormElement) => {
    if (sessionStorage.getItem('__qaReportScrollActive') === 'yes') {
      const rows = JSON.parse(sessionStorage.getItem('__qaReportScrollEvents') ?? '[]') as Record<
        string,
        unknown
      >[];
      rows.push({
        event: 'before-form-submit',
        ms: Math.round(performance.now()),
        y: window.scrollY,
        height: document.documentElement.scrollHeight,
        successBannerHeight: document
          .querySelector('.action-message.success')
          ?.getBoundingClientRect().height,
      });
      sessionStorage.setItem('__qaReportScrollEvents', JSON.stringify(rows));
    }
    form.submit();
  });
  return (await responsePromise).status();
}

async function setControl(page: Page, name: string, value: string) {
  await page
    .locator(`form[data-report-autosave-form] [name="${name}"]`)
    .evaluate((control: HTMLInputElement | HTMLTextAreaElement, next) => {
      // Set the user's pending value without starting the independent autosave timer.
      control.value = next;
    }, value);
}

async function rememberViewportScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(0, Math.min(480, document.documentElement.scrollHeight - innerHeight));
    return window.scrollY;
  });
}

async function capture(
  page: Page,
  name: string,
  diagnostic: ReturnType<typeof diagnosticsFor>,
  steps: Array<Record<string, string | number | boolean>>,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${name}.png`),
    await page.locator('[data-report-problem] [data-ui="problem-notice"]').screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-network.json`),
    `${JSON.stringify([...new Set(diagnostic.responses.map((r) => `${r.status} ${r.path}`))].sort(), null, 2)}\n`,
  );
  expect(diagnostic.pageErrors).toEqual([]);
  expect(
    diagnostic.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
}

for (const kind of ['daily', 'technical'] as const) {
  test(`${kind} direct report edit retains native failures and explains stale state`, async ({
    page,
  }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(120_000);
    const locale = info.project.name === 'desktop' ? 'pt' : 'en';
    const fixture = seedReport(info.project.name, kind);
    const diagnostic = diagnosticsFor(page);
    const steps: Array<Record<string, string | number | boolean>> = [];
    if (kind === 'technical' && info.project.name === 'desktop') {
      await page.addInitScript(() => {
        const key = '__qaReportScrollEvents';
        const sample = (event: string) => {
          if (sessionStorage.getItem('__qaReportScrollActive') !== 'yes') return;
          const rows = JSON.parse(sessionStorage.getItem(key) ?? '[]') as Record<string, unknown>[];
          if (rows.length > 100) return;
          const notice = document.querySelector('[data-report-problem]');
          const summary = document.querySelector('[data-validation-summary]');
          rows.push({
            event,
            ms: Math.round(performance.now()),
            y: window.scrollY,
            htmlTop: document.documentElement.scrollTop,
            bodyTop: document.body?.scrollTop ?? 0,
            height: document.documentElement.scrollHeight,
            viewport: window.innerHeight,
            visualOffset: window.visualViewport?.offsetTop ?? 0,
            active: document.activeElement?.tagName ?? '',
            activeRole: document.activeElement?.getAttribute('role') ?? '',
            noticeTop: notice?.getBoundingClientRect().top ?? null,
            summaryTop: summary?.getBoundingClientRect().top ?? null,
            successBannerHeight:
              document.querySelector('.action-message.success')?.getBoundingClientRect().height ??
              null,
          });
          sessionStorage.setItem(key, JSON.stringify(rows));
        };
        window.addEventListener('scroll', () => sample('scroll'));
        window.addEventListener('pagehide', () => sample('pagehide'));
        document.addEventListener('DOMContentLoaded', () => {
          sample('dom-ready');
          for (const delay of [0, 25, 100, 250, 500])
            window.setTimeout(() => sample(`timer-${delay}`), delay);
          if (document.body) {
            const observer = new MutationObserver(() => sample('mutation'));
            observer.observe(document.body, { childList: true, subtree: true });
            window.setTimeout(() => observer.disconnect(), 700);
          }
        });
        window.addEventListener('load', () => sample('load'));
      });
    }
    await signIn(page);
    const url = portal(`/reports/${fixture.reportId}?lang=${locale}`);
    await page.goto(url);
    const form = page.locator('form[data-report-autosave-form]');
    await expect(form).toBeVisible();

    if (kind === 'technical') {
      await expect(form.locator('[name="reportDate"]')).toHaveValue(workDate);
      await setControl(page, 'problemSymptom', 'Retained symptom narrative');
      await setControl(page, 'diagnosisRootCause', 'Retained root cause narrative');
      await setControl(page, 'changePerformed', 'Retained change narrative');
      expect(await submitNative(page)).toBe(200);
      await expect(page.locator('.action-message.success')).toBeVisible();
      await expect.poll(() => reportVersion(fixture.databasePath, kind, fixture.reportId)).toBe(2);
      steps.push({ step: 'technical-success', saved: true });
    }

    // A native POST bypasses browser constraint validation, exercising the server's field contract.
    if (kind === 'daily') {
      await setControl(page, 'summary', 'Retained daily summary after invalid input');
      await setControl(page, 'downtimeMinutes', '1441');
    } else {
      await setControl(page, 'problemSymptom', '');
      await setControl(page, 'diagnosisRootCause', 'Retained root cause after invalid input');
    }
    const invalidScroll = await rememberViewportScroll(page);
    if (kind === 'technical' && info.project.name === 'desktop')
      await page.evaluate(() => {
        sessionStorage.setItem('__qaReportScrollEvents', '[]');
        sessionStorage.setItem('__qaReportScrollActive', 'yes');
        sessionStorage.setItem(
          '__qaReportScrollEvents',
          JSON.stringify([
            {
              event: 'after-set-scroll',
              ms: Math.round(performance.now()),
              y: window.scrollY,
              height: document.documentElement.scrollHeight,
              successBannerHeight: document
                .querySelector('.action-message.success')
                ?.getBoundingClientRect().height,
            },
          ]),
        );
      });
    expect(await submitNative(page)).toBe(400);
    let notice = page.locator('[data-report-problem] [data-ui="problem-notice"]');
    await expect(notice).toHaveAttribute('data-problem-code', 'REPORT_FIELDS_INVALID');
    await expect(notice.locator('a[href="#modify-report-form"]')).toBeVisible();
    await expect(form.locator('[data-validation-summary]')).toBeFocused();
    await expect(
      form.locator(kind === 'daily' ? '[name="summary"]' : '[name="diagnosisRootCause"]'),
    ).toHaveValue(
      kind === 'daily'
        ? 'Retained daily summary after invalid input'
        : 'Retained root cause after invalid input',
    );
    const invalidScrollAfter = await page.evaluate(() => window.scrollY);
    const invalidMaxScrollAfter = await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    );
    await page.waitForTimeout(250);
    const invalidScrollSettled = await page.evaluate(() => window.scrollY);
    if (kind === 'technical' && info.project.name === 'desktop') {
      const scrollEvents = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('__qaReportScrollEvents') ?? '[]'),
      );
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(
        join(evidenceDirectory, 'desktop-pt-scroll-diagnostic.json'),
        `${JSON.stringify(scrollEvents, null, 2)}\n`,
      );
      await page.evaluate(() => sessionStorage.removeItem('__qaReportScrollActive'));
    }
    expect.soft(Math.abs(invalidScrollAfter - invalidScroll)).toBeLessThan(12);
    expect.soft(Math.abs(invalidScrollSettled - invalidScroll)).toBeLessThan(12);
    steps.push({
      step: 'invalid-native',
      code: 'REPORT_FIELDS_INVALID',
      retained: true,
      scrollBefore: invalidScroll,
      scrollAfter: invalidScrollAfter,
      scrollSettled: invalidScrollSettled,
      maxScrollAfter: invalidMaxScrollAfter,
    });

    await page.goto(url);
    await expect(form).toBeVisible();
    if (kind === 'daily') await setControl(page, 'summary', 'Retained daily stale edit');
    else {
      await setControl(page, 'problemSymptom', 'Retained stale symptom');
      await setControl(page, 'diagnosisRootCause', 'Retained stale diagnosis');
      await setControl(page, 'changePerformed', 'Retained stale change');
    }
    changeReportVersion(fixture.databasePath, kind, fixture.reportId);
    const staleScroll = await rememberViewportScroll(page);
    expect(await submitNative(page)).toBe(409);
    notice = page.locator('[data-report-problem] [data-ui="problem-notice"]');
    await expect(notice).toHaveAttribute('data-problem-code', 'REPORT_DRAFT_CHANGED');
    await expect(notice.locator(`a[href$="/reports/${fixture.reportId}"]`)).toBeVisible();
    await expect(notice).toBeFocused();
    await expect(
      form.locator(kind === 'daily' ? '[name="summary"]' : '[name="changePerformed"]'),
    ).toHaveValue(kind === 'daily' ? 'Retained daily stale edit' : 'Retained stale change');
    const staleScrollAfter = await page.evaluate(() => window.scrollY);
    const staleMaxScrollAfter = await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    );
    await page.waitForTimeout(250);
    const staleScrollSettled = await page.evaluate(() => window.scrollY);
    expect.soft(Math.abs(staleScrollAfter - staleScroll)).toBeLessThan(12);
    expect.soft(Math.abs(staleScrollSettled - staleScroll)).toBeLessThan(12);
    steps.push({
      step: 'stale-native',
      code: 'REPORT_DRAFT_CHANGED',
      retained: true,
      scrollBefore: staleScroll,
      scrollAfter: staleScrollAfter,
      scrollSettled: staleScrollSettled,
      maxScrollAfter: staleMaxScrollAfter,
    });

    if (kind === 'daily') {
      await page.goto(url);
      await expect(form).toBeVisible();
      await setControl(page, 'summary', 'Retained daily text after submission');
      submitOutsideBrowser(fixture.databasePath, kind, fixture.reportId, fixture.workerId);
      const stateScroll = await rememberViewportScroll(page);
      expect(await submitNative(page)).toBe(409);
      notice = page.locator('[data-report-problem] [data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute('data-problem-code', 'REPORT_CORRECTION_REQUIRED');
      await expect(notice.locator('li')).toBeVisible();
      await expect(notice.locator('a[href="#report-correction-title"]')).toHaveCount(0);
      await expect(notice).toBeFocused();
      await expect(form).toHaveCount(0);
      await expect(page.getByText('Retained daily text after submission')).toBeVisible();
      const stateScrollAfter = await page.evaluate(() => window.scrollY);
      const stateMaxScrollAfter = await page.evaluate(
        () => document.documentElement.scrollHeight - innerHeight,
      );
      await page.waitForTimeout(250);
      const stateScrollSettled = await page.evaluate(() => window.scrollY);
      expect.soft(Math.abs(stateScrollAfter - stateScroll)).toBeLessThan(12);
      expect.soft(Math.abs(stateScrollSettled - stateScroll)).toBeLessThan(12);
      steps.push({
        step: 'submitted-while-editing',
        code: 'REPORT_CORRECTION_REQUIRED',
        retained: true,
        scrollBefore: stateScroll,
        scrollAfter: stateScrollAfter,
        scrollSettled: stateScrollSettled,
        maxScrollAfter: stateMaxScrollAfter,
      });
    }

    await capture(page, `${kind}-${info.project.name}-${locale}`, diagnostic, steps);
  });
}
