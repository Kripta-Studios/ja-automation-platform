import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '7e17795c4e763b950d8c8c5a494638262b492140';
const invalidSplit = '1_14_15_end';

function diagnostics(page: Page) {
  const result = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  return result;
}

function save(data: unknown) {
  writeFileSync(
    join(evidenceRoot, 'results.json'),
    JSON.stringify(
      data,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
          : value,
      2,
    ) + '\n',
  );
}

async function createProject(owner: Page, db: DatabaseSync) {
  const choice = db
    .prepare(
      `SELECT c.id client_id, c.currency, le.id issuer_id
         FROM client c JOIN legal_entity le ON le.currency=c.currency AND le.status='active'
        ORDER BY c.created_at, le.created_at LIMIT 1`,
    )
    .get() as { client_id: string; currency: string; issuer_id: string } | undefined;
  if (!choice) throw new Error('Disposable fixture needs a client and active matching issuer');
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const name = `QA semi-monthly split ${randomUUID()}`;
  await form.locator('[name="clientId"]').selectOption(choice.client_id);
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="costCenterCode"]').fill(`QA-SPLIT-${Date.now() % 100000000}`);
  await form.locator('[name="startDate"]').fill('2026-09-01');
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const row = db.prepare('SELECT id,currency FROM project WHERE name=?').get(name) as {
    id: string;
    currency: string;
  };
  expect(row.currency).toBe(choice.currency);
  return { projectId: row.id, issuerId: choice.issuer_id, currency: choice.currency };
}

async function fillStream(page: Page, projectId: string, issuerId: string, lang: string) {
  await page.goto(portal(`/billing?view=setup&lang=${lang}`));
  const form = page.locator('form[action="?/createBillingRule"]');
  await expect(form).toBeVisible();
  await form.locator('[name="projectId"]').selectOption(projectId);
  await form.locator('[name="streamType"]').selectOption('labor');
  await form.locator('[name="cadenceType"]').selectOption('semi_monthly');
  await form.locator('[name="effectiveFrom"]').fill('2026-10-01');
  await form.locator('[name="legalEntityId"]').selectOption(issuerId);
  await form.locator('[name="semiMonthlyRule"]').fill(invalidSplit);
  await form.locator('[name="paymentTermsDays"]').fill('30');
  await form.scrollIntoViewIfNeeded();
  return form;
}

async function visual(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[action="?/createBillingRule"]');
    const notice = document.querySelector<HTMLElement>('[data-problem-code]');
    const focus = document.activeElement;
    const focusBox = focus?.getBoundingClientRect();
    const noticeBox = notice?.getBoundingClientRect();
    const value = (name: string) => {
      const control = form?.elements.namedItem(name);
      return control instanceof HTMLInputElement || control instanceof HTMLSelectElement
        ? control.value
        : null;
    };
    return {
      routeView: new URL(location.href).searchParams.get('view'),
      locale: document.documentElement.lang,
      code: notice?.getAttribute('data-problem-code') ?? null,
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((a) => ({
        text: a.textContent?.trim() ?? '',
        pathname: new URL(a.href).pathname,
        search: new URL(a.href).search,
        hash: new URL(a.href).hash,
      })),
      fieldErrors: [...(form?.querySelectorAll('[aria-invalid="true"]') ?? [])].map((element) =>
        element.getAttribute('name'),
      ),
      values: {
        projectIdRetained: Boolean(value('projectId')),
        legalEntityIdRetained: Boolean(value('legalEntityId')),
        cadenceType: value('cadenceType'),
        semiMonthlyRule: value('semiMonthlyRule'),
        effectiveFrom: value('effectiveFrom'),
        paymentTermsDays: value('paymentTermsDays'),
      },
      formPresent: Boolean(form),
      focusedTag: focus?.tagName.toLowerCase() ?? null,
      focusedName: focus?.getAttribute('name') ?? null,
      focusTop: focusBox ? Math.round(focusBox.top) : null,
      noticeTop: noticeBox ? Math.round(noticeBox.top) : null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
    };
  });
}

function networkSummary(response: Awaited<ReturnType<Page['waitForResponse']>>, body: string) {
  let envelope: { type?: string; status?: number } | null = null;
  try {
    envelope = JSON.parse(body) as { type?: string; status?: number };
  } catch {
    // Native HTML response.
  }
  return {
    transportStatus: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    envelopeType: envelope?.type ?? null,
    actionStatus: envelope?.status ?? null,
    code: body.match(/ACTION_ERROR_INVALID|BILLING_[A-Z_]+/u)?.[0] ?? null,
    messageKey: body.match(/action\.error\.invalid|problem\.billing\.[A-Za-z]+/u)?.[0] ?? null,
    genericPhrase: body.includes('Check the submitted values'),
  };
}

test('Finance enhanced and Owner native invalid semi-monthly split baseline', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerContext.newPage();
  const financeErrors = diagnostics(page);
  const ownerErrors = diagnostics(owner);
  const result: Record<string, unknown> = {
    candidateCommit,
    fixture: 'fresh disposable DB and Owner UI-created project; fixture client and active issuer',
    cases: [],
  };
  const cases = result.cases as Array<Record<string, unknown>>;
  try {
    const { projectId, issuerId, currency } = await createProject(owner, db);
    await signIn(page, 'finance');
    const financeForm = await fillStream(page, projectId, issuerId, 'en');
    const financeBefore = { scrollY: await page.evaluate(() => Math.round(scrollY)) };
    const financePending = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createBillingRule'),
    );
    await financeForm.locator('button[type="submit"]').click();
    const financeResponse = await financePending;
    const financeNetwork = networkSummary(financeResponse, await financeResponse.text());
    await expect(page.locator('[data-problem-code]')).toBeVisible();
    const financeVisual = await visual(page);
    const ruleCount = () =>
      (
        db.prepare('SELECT COUNT(*) count FROM billing_rule WHERE project_id=?').get(projectId) as {
          count: number;
        }
      ).count;
    cases.push({
      role: 'financeAdmin',
      viewport: '390x844 EN',
      transport: 'enhanced',
      currency,
      before: financeBefore,
      network: financeNetwork,
      visible: financeVisual,
      savedRuleCount: ruleCount(),
    });
    await page.locator('[data-problem-code]').screenshot({
      path: join(evidenceRoot, 'finance-phone-390-en-notice.png'),
    });
    expect(financeNetwork.transportStatus).toBe(200);
    expect(financeNetwork.envelopeType).toBe('failure');
    expect(financeNetwork.actionStatus).toBe(400);
    expect(ruleCount()).toBe(0);

    const ownerForm = await fillStream(owner, projectId, issuerId, 'es');
    const ownerBefore = { scrollY: await owner.evaluate(() => Math.round(scrollY)) };
    const ownerPending = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createBillingRule'),
    );
    await ownerForm.evaluate((form) => (form as HTMLFormElement).submit());
    const ownerResponse = await ownerPending;
    const ownerNetwork = networkSummary(ownerResponse, await ownerResponse.text());
    await expect(owner.locator('[data-problem-code]')).toBeVisible();
    const ownerVisual = await visual(owner);
    cases.push({
      role: 'ownerAdmin',
      viewport: '1440x900 ES',
      transport: 'native',
      before: ownerBefore,
      network: ownerNetwork,
      visible: ownerVisual,
      savedRuleCount: ruleCount(),
    });
    await owner.locator('[data-problem-code]').screenshot({
      path: join(evidenceRoot, 'owner-desktop-1440-es-notice.png'),
    });
    expect(ownerNetwork.transportStatus).toBe(400);
    expect(ruleCount()).toBe(0);
    expect(financeErrors.pageErrors).toEqual([]);
    expect(financeErrors.consoleErrors).toEqual([]);
    expect(ownerErrors.pageErrors).toEqual([]);
    expect(ownerErrors.consoleErrors).toEqual([]);
    result.console = { finance: financeErrors, owner: ownerErrors };
  } finally {
    save(result);
    await ownerContext.close();
    db.close();
  }
});
