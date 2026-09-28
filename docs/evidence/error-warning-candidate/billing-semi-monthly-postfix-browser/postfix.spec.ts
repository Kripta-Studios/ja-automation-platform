import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'db135569882e49f323ff8391cd2de7bac0c7c64c';
const today = new Date().toISOString().slice(0, 10);

function writeResult(name: string, value: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      value,
      (_key, item) =>
        typeof item === 'string'
          ? item.replace(
              /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
              ':record',
            )
          : item,
      2,
    ) + '\n',
  );
}

function diagnostics(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    http: [] as string[],
  };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      result.http.push(
        `${response.status()} ${new URL(response.url()).pathname.replace(/\/[0-9a-f-]{36}/giu, '/:record')}`,
      );
  });
  return result;
}

async function decodeActionData(data: string): Promise<Record<string, unknown>> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return parse(data);
}

async function createProject(owner: Page, db: DatabaseSync) {
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable client unavailable');
  const name = `Billing split QA ${randomUUID()}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="costCenterCode"]').fill(`QA-SPLIT-${Date.now() % 100000000}`);
  await form.locator('[name="startDate"]').fill(today);
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  return (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string }).id;
}

async function openSetup(
  page: Page,
  role: 'finance' | 'owner',
  projectId: string,
  locale: string,
  authenticate = true,
) {
  if (authenticate) await signIn(page, role);
  await page.goto(portal(`/billing?view=setup&lang=${locale}`));
  const form = page.locator('form[action="?/createBillingRule"]');
  await expect(form).toBeVisible();
  await form.locator('[name="projectId"]').selectOption(projectId);
  await form.locator('[name="streamType"]').selectOption('labor');
  await form.locator('[name="cadenceType"]').selectOption('semi_monthly');
  await form.locator('[name="effectiveFrom"]').fill(today);
  await form.locator('[name="poNumberOverride"]').fill('QA SPLIT REVIEW');
  await form.locator('[name="paymentTermsDays"]').fill('31');
  const issuer = form.locator('[name="legalEntityId"]');
  if (!(await issuer.inputValue())) {
    const eligible = await issuer.locator('option:not([value=""])').first().getAttribute('value');
    if (!eligible) throw new Error('No eligible issuer for disposable project');
    await issuer.selectOption(eligible);
  }
  await expect(form.locator('[name="currency"]')).not.toHaveValue('');
  return form;
}

async function injectSplit(form: Locator, value: string) {
  await form.locator('[name="semiMonthlyRule"]').evaluate((select: HTMLSelectElement, choice) => {
    const option = new Option(choice === '' ? 'Old blank rule' : 'Old half-month rule', choice);
    select.add(option);
    select.value = choice;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

function snapshot(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[action="?/createBillingRule"]');
    const split = form?.querySelector<HTMLSelectElement>('[name="semiMonthlyRule"]');
    const notice = document.querySelector<HTMLElement>(
      '[data-problem-code="BILLING_SEMI_MONTHLY_RULE_INVALID"]',
    );
    const fieldError = form?.querySelector<HTMLElement>('[data-billing-recovery-error]');
    const target = document.activeElement;
    const box = notice?.getBoundingClientRect();
    const activeBox = target?.getBoundingClientRect();
    const control = (name: string) =>
      form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? null;
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      notice: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      noticeTop: box ? Math.round(box.top) : null,
      noticeBottom: box ? Math.round(box.bottom) : null,
      noticeVisible: Boolean(box && box.bottom > 0 && box.top < innerHeight),
      remedy: [...(notice?.querySelectorAll('a') ?? [])].map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute('href'),
      })),
      fieldError: fieldError?.textContent?.trim() ?? null,
      fieldInvalid: split?.getAttribute('aria-invalid') ?? null,
      splitOptions: [...(split?.options ?? [])].map((option) => ({
        value: option.value,
        disabled: option.disabled,
        selected: option.selected,
        text: option.textContent?.trim(),
      })),
      values: Object.fromEntries(
        [
          'projectId',
          'streamType',
          'cadenceType',
          'effectiveFrom',
          'legalEntityId',
          'currency',
          'paymentTermsDays',
          'poNumberOverride',
          'semiMonthlyRule',
        ].map((name) => [name, control(name)]),
      ),
      activeName: target?.getAttribute('name') ?? null,
      activeTag: target?.tagName.toLowerCase() ?? null,
      activeTop: activeBox ? Math.round(activeBox.top) : null,
      activeBottom: activeBox ? Math.round(activeBox.bottom) : null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      setupTabSelected:
        document
          .querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
          ?.textContent?.trim() ?? null,
      lang: document.documentElement.lang,
    };
  });
}

function counts(db: DatabaseSync, projectId: string) {
  return {
    billingRules: (
      db.prepare('SELECT COUNT(*) count FROM billing_rule WHERE project_id=?').get(projectId) as {
        count: number;
      }
    ).count,
    audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
  };
}

for (const scenario of [
  { project: 'phone-390', locale: 'en', role: 'finance', split: '1_15', native: false },
  { project: 'desktop', locale: 'es', role: 'owner', split: '', native: true },
] as const) {
  test(`Billing semi-monthly rule ${scenario.role} ${scenario.project}`, async ({
    browser,
    page,
  }, info) => {
    test.skip(info.project.name !== scenario.project);
    test.setTimeout(240_000);
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const owner = await ownerContext.newPage();
    const ownerDiagnostics = diagnostics(owner);
    const actorDiagnostics = diagnostics(page);
    const result: Record<string, unknown> = {
      candidateCommit,
      role: scenario.role,
      viewport: scenario.project,
      locale: scenario.locale,
      native: scenario.native,
      fixture: 'fresh disposable database; project created through Owner UI',
    };
    try {
      await signIn(owner, 'owner');
      const projectId = await createProject(owner, db);
      const form = await openSetup(page, scenario.role, projectId, scenario.locale);
      const supported = await form
        .locator('[name="semiMonthlyRule"]')
        .evaluate((select: HTMLSelectElement) => ({
          values: [...select.options].map((option) => option.value),
          help: document.getElementById('billing-semi-monthly-rule-help')?.textContent?.trim(),
        }));
      expect(supported.values).toEqual(['1_15_16_end']);
      await injectSplit(form, scenario.split);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const before = await page.evaluate(() => ({ scrollY: Math.round(scrollY) }));
      const noWriteBefore = counts(db, projectId);
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/createBillingRule'),
      );
      if (scenario.native) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          form.evaluate((element: HTMLFormElement) => element.submit()),
        ]);
      } else await form.getByRole('button', { name: 'Save billing stream' }).click();
      const response = await pending;
      await page.waitForLoadState('networkidle');
      const body = await response.text();
      const action = body.startsWith('{') ? JSON.parse(body) : null;
      const decoded = action?.data ? await decodeActionData(action.data) : null;
      await expect(
        page.locator('[data-problem-code="BILLING_SEMI_MONTHLY_RULE_INVALID"]'),
      ).toBeVisible();
      await expect(page.locator('[name="semiMonthlyRule"]')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      const after = await snapshot(page);
      const noWriteAfter = counts(db, projectId);
      await page
        .locator('[data-problem-code="BILLING_SEMI_MONTHLY_RULE_INVALID"]')
        .screenshot({
          path: join(
            evidenceRoot,
            `${scenario.role}-${scenario.project}-${scenario.locale}-notice.png`,
          ),
        });
      await page
        .locator('form[action="?/createBillingRule"] label')
        .filter({ has: page.locator('select[name="semiMonthlyRule"]') })
        .screenshot({
          path: join(
            evidenceRoot,
            `${scenario.role}-${scenario.project}-${scenario.locale}-field.png`,
          ),
        });
      result.supported = supported;
      result.before = before;
      result.response = {
        status: response.status(),
        contentType: response.headers()['content-type']?.split(';')[0] ?? '',
        type: action?.type ?? null,
        actionStatus: action?.status ?? null,
        code:
          decoded?.code ??
          (body.includes('BILLING_SEMI_MONTHLY_RULE_INVALID')
            ? 'BILLING_SEMI_MONTHLY_RULE_INVALID'
            : null),
        fieldErrors: decoded?.fieldErrors ?? null,
        remedies: decoded?.remedies ?? null,
        values: decoded?.values ?? null,
        generic: body.includes('Check the submitted values'),
      };
      result.after = after;
      result.noWrite = { before: noWriteBefore, after: noWriteAfter };
      result.diagnostics = { actor: actorDiagnostics, owner: ownerDiagnostics };
      writeResult(`results-${scenario.project}.json`, result);
      expect(after.code).toBe('BILLING_SEMI_MONTHLY_RULE_INVALID');
      expect(scenario.native ? response.status() : action?.status).toBe(400);
      expect(after.notice).toBeTruthy();
      expect(after.values.projectId).toBe(projectId);
      expect(after.values.cadenceType).toBe('semi_monthly');
      expect(after.values.semiMonthlyRule).toBe(scenario.split);
      expect(after.values.poNumberOverride).toBe('QA SPLIT REVIEW');
      expect(after.activeName).toBe('semiMonthlyRule');
      expect(after.activeTop).toBeGreaterThan(0);
      expect(after.activeBottom).toBeLessThan(after.viewportHeight);
      expect(after.fieldError).toBeTruthy();
      expect(after.remedy.some((remedy) => remedy.href?.includes('/billing?view=setup'))).toBe(
        true,
      );
      expect(after.setupTabSelected?.toLowerCase()).toContain(
        scenario.locale === 'es' ? 'configur' : 'configur',
      );
      expect(noWriteAfter).toEqual(noWriteBefore);
      expect(actorDiagnostics.pageErrors).toEqual([]);
      expect(actorDiagnostics.consoleErrors).toEqual([]);
    } finally {
      await ownerContext.close();
      db.close();
    }
  });
}

test('Auditor sees historical active split warning but no archived warning', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerContext.newPage();
  const auditorDiagnostics = diagnostics(page);
  try {
    await signIn(owner, 'owner');
    const projectId = await createProject(owner, db);
    const setupForm = await openSetup(owner, 'owner', projectId, 'en', false);
    await expect(setupForm.locator('[name="semiMonthlyRule"]')).toHaveValue('1_15_16_end');
    await setupForm.getByRole('button', { name: 'Save billing stream' }).click();
    await expect.poll(() => counts(db, projectId).billingRules).toBe(1);
    const ruleId = (
      db.prepare('SELECT id FROM billing_rule WHERE project_id=?').get(projectId) as { id: string }
    ).id;
    // Model a historical record from an older release in the disposable fixture only.
    db.prepare('UPDATE billing_rule SET semi_monthly_rule=? WHERE id=?').run('1_15', ruleId);
    await signIn(page, 'auditor');
    await page.goto(portal(`/billing?view=streams&project=${projectId}&lang=en`));
    const row = page.locator(`tr[data-billing-rule="${ruleId}"]`);
    await expect(row).toBeVisible();
    const warning = row.locator(
      '[data-problem-code="BILLING_SAVED_SEMI_MONTHLY_RULE_NOT_APPLIED"]',
    );
    await expect(warning).toBeVisible();
    const active = await warning.evaluate((notice: HTMLElement) => ({
      kind: notice.getAttribute('data-kind'),
      text: notice.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      links: [...notice.querySelectorAll('a')].map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute('href'),
      })),
    }));
    await warning.screenshot({ path: join(evidenceRoot, 'auditor-active-historical-warning.png') });
    expect(active.kind).toBe('warning');
    expect(active.text).toContain('Contact a finance administrator');
    expect(active.links.some((link) => link.href?.includes('view=setup'))).toBe(false);
    await expect(page.getByRole('tab', { name: 'Configure billing' })).toHaveCount(0);
    const before = counts(db, projectId);
    const denied = await page.evaluate(
      async (url) => {
        const form = new FormData();
        form.set('projectId', url.projectId);
        form.set('streamType', 'labor');
        form.set('cadenceType', 'semi_monthly');
        form.set('semiMonthlyRule', '1_15');
        const response = await fetch(url.action, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: form,
        });
        return { transportStatus: response.status, body: await response.json() };
      },
      { action: portal('/billing?/createBillingRule'), projectId },
    );
    const deniedData = await decodeActionData(denied.body.data);
    expect(denied.body).toMatchObject({ type: 'failure', status: 403 });
    expect(deniedData.code).toBe('BILLING_READ_ONLY_ROLE');
    expect(deniedData.remedies).toContainEqual({ id: 'contact_finance' });
    const afterDenied = counts(db, projectId);
    expect(afterDenied).toEqual(before);
    db.prepare('UPDATE billing_rule SET enabled=0 WHERE id=?').run(ruleId);
    await page.reload();
    await expect(
      page.locator('[data-problem-code="BILLING_SAVED_SEMI_MONTHLY_RULE_NOT_APPLIED"]'),
    ).toHaveCount(0);
    const archived = {
      warningCount: await page
        .locator('[data-problem-code="BILLING_SAVED_SEMI_MONTHLY_RULE_NOT_APPLIED"]')
        .count(),
      setupTabPresent: await page.getByRole('tab', { name: 'Configure billing' }).count(),
    };
    writeResult('results-auditor.json', {
      candidateCommit,
      role: 'auditor',
      fixture:
        'Owner created supported stream via UI; direct disposable DB edit modeled historical split, then archived state',
      active,
      denied: {
        transportStatus: denied.transportStatus,
        actionStatus: denied.body.status,
        code: deniedData.code,
        messageKey: deniedData.messageKey,
        remedies: deniedData.remedies,
        noWrite:
          afterDenied.billingRules === before.billingRules && afterDenied.audits === before.audits,
      },
      archived,
      diagnostics: auditorDiagnostics,
    });
    expect(auditorDiagnostics.pageErrors).toEqual([]);
    expect(auditorDiagnostics.consoleErrors).toEqual([]);
  } finally {
    await ownerContext.close();
    db.close();
  }
});
