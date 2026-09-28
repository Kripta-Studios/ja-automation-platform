import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const releaseCommit = 'a21d12d0383b149170da7a6d3faad70bde37a5b2';

function diagnostics(page: Page) {
  const result = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  return result;
}

function writeSanitized(data: unknown) {
  writeFileSync(
    join(evidenceRoot, 'results.json'),
    JSON.stringify(
      data,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(
              /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
              ':record',
            )
          : value,
      2,
    ) + '\n',
  );
}

async function createOwnerProject(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  if (!clientId) throw new Error('Disposable client fixture is unavailable');
  const name = `Finance policy stale baseline ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-POLICY-${Date.now() % 100000000}`);
  await form.locator('input[name="startDate"]').fill('2026-09-01');
  await form.locator('input[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const project = db.prepare('SELECT id,status FROM project WHERE name=?').get(name) as {
    id: string;
    status: string;
  };
  const assignment = db
    .prepare(
      "SELECT id,starts_on,ends_on,status FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
    )
    .get(project.id, workerId) as {
    id: string;
    starts_on: string;
    ends_on: string | null;
    status: string;
  };
  expect(project.status).toBe('active');
  expect(assignment.ends_on).toBeNull();
  return { projectId: project.id, assignmentId: assignment.id };
}

async function openFinancePolicy(finance: Page, projectId: string) {
  await finance.goto(
    portal(
      `/finance?view=commercial&project=${projectId}&task=Person%20expense%20policies&lang=en#person-expense-policies`,
    ),
  );
  await expect(finance.locator('#finance-configuration-task')).toHaveValue(
    'Person expense policies',
  );
  const form = finance.locator('form[data-assignment-expense-policy-form]');
  await expect(form).toBeVisible();
  return form;
}

async function fillPolicy(
  finance: Page,
  assignmentId: string,
  effectiveFrom: string,
  category: string,
) {
  const form = finance.locator('form[data-assignment-expense-policy-form]');
  await form.locator('[name="projectMemberId"]').selectOption(assignmentId);
  await form.locator('[name="payer"]').selectOption('worker');
  await form.locator('[name="category"]').fill(category);
  await form.locator('[name="effectiveFrom"]').fill(effectiveFrom);
  await form.locator('[name="workerReimbursement"]').selectOption('at_cost');
  await form.locator('[name="clientRecovery"]').selectOption('included');
  await form.locator('[name="reason"]').fill('Disposable stale assignment policy review');
  return form;
}

async function post(finance: Page) {
  const pending = finance.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('?/createAssignmentExpensePolicy'),
  );
  await finance.locator('form[data-assignment-expense-policy-form] button[type="submit"]').click();
  const response = await pending;
  await finance.waitForLoadState('networkidle');
  const body = await response.text();
  return {
    status: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    code: body.match(/FINANCE_POLICY_[A-Z_]+/u)?.[0] ?? null,
    remedy: body.match(/review_assignment_policy/iu)?.[0] ?? null,
    genericPhrase: body.includes('Check the submitted values'),
  };
}

async function visual(finance: Page) {
  return finance.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>(
      'form[data-assignment-expense-policy-form]',
    );
    const problem = document.querySelector<HTMLElement>('[data-finance-problem]');
    const notice = problem?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const active = document.activeElement;
    const box = active?.getBoundingClientRect();
    const noticeBox = notice?.getBoundingClientRect();
    const selected = form?.querySelector<HTMLSelectElement>('[name="projectMemberId"]');
    const value = (name: string) =>
      form?.elements.namedItem(name) instanceof HTMLInputElement ||
      form?.elements.namedItem(name) instanceof HTMLTextAreaElement
        ? (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value
        : null;
    return {
      routeView: new URL(location.href).searchParams.get('view'),
      selectedTask:
        (document.querySelector('#finance-configuration-task') as HTMLSelectElement | null)
          ?.value ?? null,
      code: notice?.getAttribute('data-problem-code') ?? null,
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((a) => ({
        text: a.textContent?.trim(),
        pathname: new URL(a.href).pathname,
        search: new URL(a.href).search,
        hash: new URL(a.href).hash,
      })),
      selectedPersonRetained: Boolean(selected?.value),
      selectedPersonUnavailable: Boolean(selected?.selectedOptions[0]?.disabled),
      effectiveFrom: value('effectiveFrom'),
      effectiveTo: value('effectiveTo'),
      category: value('category'),
      reasonRetained: value('reason') === 'Disposable stale assignment policy review',
      formPresent: Boolean(form),
      focusedTag: active?.tagName.toLowerCase() ?? null,
      focusedName: active?.getAttribute('name') ?? null,
      focusedNotice: active === problem || active === notice,
      focusTop: box ? Math.round(box.top) : null,
      focusBottom: box ? Math.round(box.bottom) : null,
      noticeTop: noticeBox ? Math.round(noticeBox.top) : null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      headerBottom: Math.round(
        document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0,
      ),
    };
  });
}

test('Finance person expense policy after Owner changes assignment, native browser baseline', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const owner = await ownerContext.newPage();
  const financeErrors = diagnostics(page);
  const ownerErrors = diagnostics(owner);
  const results: Record<string, unknown> = {
    candidateCommit: releaseCommit,
    fixture: 'fresh disposable database, UI-created active project and worker assignment',
    roles: { form: 'financeAdmin', concurrentEdit: 'ownerAdmin' },
    viewports: { finance: '390x844 EN', owner: '1440x900 EN' },
    cases: [],
  };
  const cases = results.cases as Array<Record<string, unknown>>;
  try {
    const { projectId, assignmentId } = await createOwnerProject(owner, db);
    await signIn(page, 'finance');
    await openFinancePolicy(page, projectId);
    const category = `stale-${Date.now()}`;
    await fillPolicy(page, assignmentId, '2026-10-20', category);
    const before = {
      scrollY: await page.evaluate(() => Math.round(scrollY)),
      assignmentBounds: { startsOn: '2026-09-01', endsOn: null },
    };

    await owner.goto(portal('/projects?action=update-assignment&lang=en#project-assignment-list'));
    const assignment = owner
      .locator('form[action="?/updateAssignment"]')
      .filter({ has: owner.locator(`input[name="assignmentId"][value="${assignmentId}"]`) });
    await expect(assignment).toBeVisible();
    await assignment.locator('[name="endsOn"]').fill('2026-10-15');
    const ownerPending = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/updateAssignment'),
    );
    await assignment.getByRole('button', { name: 'Update assignment' }).click();
    expect((await ownerPending).status()).toBeLessThan(400);
    await expect
      .poll(
        () =>
          (
            db.prepare('SELECT ends_on FROM project_member WHERE id=?').get(assignmentId) as {
              ends_on: string;
            }
          ).ends_on,
      )
      .toBe('2026-10-15');

    const response = await post(page);
    const visible = await visual(page);
    const policyCount = (
      db
        .prepare(
          'SELECT COUNT(*) count FROM assignment_expense_policy WHERE project_member_id=? AND category=?',
        )
        .get(assignmentId, category) as { count: number }
    ).count;
    cases.push({
      kind: 'stale-outside-assignment',
      before,
      currentBounds: { startsOn: '2026-09-01', endsOn: '2026-10-15' },
      response,
      visible,
      policyCount,
    });
    if (await page.locator('[data-finance-problem] [data-ui="problem-notice"]').isVisible())
      await page
        .locator('[data-finance-problem] [data-ui="problem-notice"]')
        .screenshot({ path: join(evidenceRoot, 'outside-finance-phone-390-en.png') });
    expect(response.status).toBe(409);
    expect(response.code).toBe('FINANCE_POLICY_OUTSIDE_ASSIGNMENT');
    expect(policyCount).toBe(0);

    await openFinancePolicy(page, projectId);
    await fillPolicy(page, assignmentId, '2026-10-10', `end-required-${Date.now()}`);
    const requiredResponse = await post(page);
    const requiredVisible = await visual(page);
    cases.push({
      kind: 'bounded-assignment-no-policy-end',
      currentBounds: { startsOn: '2026-09-01', endsOn: '2026-10-15' },
      response: requiredResponse,
      visible: requiredVisible,
    });
    if (await page.locator('[data-finance-problem] [data-ui="problem-notice"]').isVisible())
      await page
        .locator('[data-finance-problem] [data-ui="problem-notice"]')
        .screenshot({ path: join(evidenceRoot, 'end-required-finance-phone-390-en.png') });
    expect(requiredResponse.status).toBe(400);
    expect(requiredResponse.code).toBe('FINANCE_POLICY_END_REQUIRED');

    const enhanced = await page
      .locator('form[data-assignment-expense-policy-form]')
      .evaluate(async (form) => {
        const response = await fetch((form as HTMLFormElement).action, {
          method: 'POST',
          body: new FormData(form as HTMLFormElement),
          headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
        });
        const body = await response.text();
        const envelope = JSON.parse(body) as { type?: string; status?: number };
        return {
          transportStatus: response.status,
          envelopeType: envelope.type ?? null,
          actionStatus: envelope.status ?? null,
          contentType: response.headers.get('content-type')?.split(';')[0] ?? '',
          code: body.match(/FINANCE_POLICY_[A-Z_]+/u)?.[0] ?? null,
          remedy: body.match(/review_assignment_policy/iu)?.[0] ?? null,
        };
      });
    cases.push({ kind: 'bounded-assignment-enhanced-envelope', response: enhanced });
    expect(enhanced.transportStatus).toBe(200);
    expect(enhanced.envelopeType).toBe('failure');
    expect(enhanced.actionStatus).toBe(400);
    expect(enhanced.code).toBe('FINANCE_POLICY_END_REQUIRED');

    expect(financeErrors.pageErrors).toEqual([]);
    expect(financeErrors.consoleErrors).toEqual([]);
    expect(ownerErrors.pageErrors).toEqual([]);
    expect(ownerErrors.consoleErrors).toEqual([]);
    results.console = { finance: financeErrors, owner: ownerErrors };
  } finally {
    writeSanitized(results);
    await ownerContext.close();
    db.close();
  }
});
