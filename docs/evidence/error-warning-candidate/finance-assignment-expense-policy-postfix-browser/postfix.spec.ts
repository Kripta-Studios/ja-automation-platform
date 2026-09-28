import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const releaseCommit = '86031e6';
const productDiffSha256 = '8d056f82141d18eabd22850260150c48583d7495299a51c4284ece3cfe618780';

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
      selectedPersonLabel: selected?.selectedOptions[0]?.textContent?.trim() ?? null,
      payer: (form?.elements.namedItem('payer') as HTMLSelectElement | null)?.value ?? null,
      workerReimbursement:
        (form?.elements.namedItem('workerReimbursement') as HTMLSelectElement | null)?.value ??
        null,
      clientRecovery:
        (form?.elements.namedItem('clientRecovery') as HTMLSelectElement | null)?.value ?? null,
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
      noticeBottom: noticeBox ? Math.round(noticeBox.bottom) : null,
      warning:
        form
          ?.querySelector<HTMLElement>(
            '[data-problem-code="WARNING_FINANCE_POLICY_ASSIGNMENT_WINDOW"]',
          )
          ?.textContent?.replace(/\s+/gu, ' ')
          .trim() ?? null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      headerBottom: Math.round(
        document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0,
      ),
    };
  });
}

test('Finance person expense policy after Owner changes assignment, post-fix browser', async ({
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
    productDiffSha256,
    fixture: 'fresh disposable database, UI-created active project and worker assignment',
    roles: { form: 'financeAdmin', concurrentEdit: 'ownerAdmin' },
    viewports: { finance: '390x844 EN', owner: '1440x900 PT for concurrent assignment edit' },
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
      warning: await page
        .locator(
          'form[data-assignment-expense-policy-form] [data-problem-code="WARNING_FINANCE_POLICY_ASSIGNMENT_WINDOW"]',
        )
        .textContent(),
    };
    expect(before.warning).toContain('2026-09-01');

    await owner.goto(portal('/projects?action=update-assignment&lang=pt#project-assignment-list'));
    const assignment = owner
      .locator('form[action="?/updateAssignment"]')
      .filter({ has: owner.locator(`input[name="assignmentId"][value="${assignmentId}"]`) });
    await expect(assignment).toBeVisible();
    await assignment.locator('[name="endsOn"]').fill('2026-10-15');
    const ownerPending = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/updateAssignment'),
    );
    await assignment.locator('button').last().click();
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

    const auditBeforeFailure = (
      db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }
    ).count;

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
    expect(
      (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
    ).toBe(auditBeforeFailure);
    expect(visible.code).toBe('FINANCE_POLICY_OUTSIDE_ASSIGNMENT');
    expect(visible.wording).toContain('2026-10-15');
    expect(visible.wording).toContain('2026-09-01');
    expect(visible.reasonRetained).toBe(true);
    expect(visible.selectedPersonRetained).toBe(true);
    expect(visible.category).toBe(category);
    expect(visible.effectiveFrom).toBe('2026-10-20');
    expect(visible.routeView).toBe('commercial');
    expect(visible.selectedTask).toBe('Person expense policies');
    expect(visible.focusedNotice).toBe(true);
    expect(visible.noticeTop).toBeGreaterThanOrEqual(visible.headerBottom - 2);
    expect(visible.noticeBottom).toBeLessThanOrEqual(visible.viewportHeight);
    expect(visible.remedies.some((item) => item.hash === '#assignment-history')).toBe(true);
    const outsideEnhanced = await page
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
          code: body.match(/FINANCE_POLICY_[A-Z_]+/u)?.[0] ?? null,
          remedy: body.match(/review_assignment_policy/iu)?.[0] ?? null,
        };
      });
    expect(outsideEnhanced).toMatchObject({
      transportStatus: 200,
      envelopeType: 'failure',
      actionStatus: 409,
      code: 'FINANCE_POLICY_OUTSIDE_ASSIGNMENT',
      remedy: 'review_assignment_policy',
    });
    cases.push({ kind: 'stale-outside-assignment-enhanced-envelope', response: outsideEnhanced });
    const assignmentLink = page
      .locator('[data-finance-problem] [data-ui="problem-notice"] a')
      .first();
    await assignmentLink.click();
    await expect(page).toHaveURL(/\/projects\?project=.*#assignment-history/u);
    await expect(page.locator('#assignment-history')).toBeVisible();
    const historyFocused = await page.evaluate(
      () => document.activeElement?.id === 'assignment-history',
    );
    cases.push({
      kind: 'assignment-remedy-navigation',
      historyVisible: true,
      historyFocused,
      currentEndDateVisible: (await page.locator('#assignment-history').textContent())?.includes(
        '2026-10-15',
      ),
    });
    expect(cases.at(-1)?.currentEndDateVisible).toBe(true);
    expect(historyFocused).toBe(true);

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
    expect(requiredVisible.code).toBe('FINANCE_POLICY_END_REQUIRED');
    expect(requiredVisible.wording).toContain('2026-10-15');
    expect(requiredVisible.selectedPersonRetained).toBe(true);
    expect(requiredVisible.effectiveFrom).toBe('2026-10-10');
    expect(requiredVisible.effectiveTo).toBe('');
    expect(requiredVisible.reasonRetained).toBe(true);
    expect(requiredVisible.focusedNotice).toBe(true);
    expect(requiredVisible.noticeTop).toBeGreaterThanOrEqual(requiredVisible.headerBottom - 2);
    expect(requiredVisible.noticeBottom).toBeLessThanOrEqual(requiredVisible.viewportHeight);
    expect(requiredVisible.remedies.some((item) => item.hash === '#assignment-history')).toBe(true);

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
    const finalPolicyCount = (
      db
        .prepare('SELECT COUNT(*) count FROM assignment_expense_policy WHERE project_member_id=?')
        .get(assignmentId) as { count: number }
    ).count;
    expect(finalPolicyCount).toBe(0);
    expect(
      (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
    ).toBe(auditBeforeFailure);
    results.finalPolicyCount = finalPolicyCount;

    await owner.goto(
      portal(
        `/finance?view=commercial&project=${projectId}&task=Person%20expense%20policies&lang=pt#person-expense-policies`,
      ),
    );
    await expect(owner.locator('form[data-assignment-expense-policy-form]')).toBeVisible();
    await fillPolicy(owner, assignmentId, '2026-10-10', `owner-pt-${Date.now()}`);
    const ownerPolicyResponse = await post(owner);
    const ownerPolicyVisible = await visual(owner);
    expect(ownerPolicyResponse).toMatchObject({ status: 400, code: 'FINANCE_POLICY_END_REQUIRED' });
    expect(ownerPolicyVisible.code).toBe('FINANCE_POLICY_END_REQUIRED');
    expect(ownerPolicyVisible.wording).toContain('2026-10-15');
    expect(ownerPolicyVisible.wording).toContain('atribuição');
    expect(ownerPolicyVisible.focusedNotice).toBe(true);
    expect(ownerPolicyVisible.noticeTop).toBeGreaterThanOrEqual(
      ownerPolicyVisible.headerBottom - 2,
    );
    expect(ownerPolicyVisible.noticeBottom).toBeLessThanOrEqual(ownerPolicyVisible.viewportHeight);
    expect(ownerPolicyVisible.reasonRetained).toBe(true);
    expect(ownerPolicyVisible.selectedPersonRetained).toBe(true);
    expect(ownerPolicyVisible.effectiveFrom).toBe('2026-10-10');
    cases.push({
      kind: 'owner-desktop-portuguese-bounded-policy',
      response: ownerPolicyResponse,
      visible: ownerPolicyVisible,
    });
    await owner.locator('[data-finance-problem] [data-ui="problem-notice"]').screenshot({
      path: join(evidenceRoot, 'end-required-owner-desktop-pt.png'),
    });
    expect(
      (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
    ).toBe(auditBeforeFailure);
    expect(
      (
        db
          .prepare('SELECT COUNT(*) count FROM assignment_expense_policy WHERE project_member_id=?')
          .get(assignmentId) as { count: number }
      ).count,
    ).toBe(0);

    await openFinancePolicy(page, projectId);
    await fillPolicy(page, assignmentId, '2026-10-10', `removed-${Date.now()}`);
    const staleRemovalScroll = await page.evaluate(() => Math.round(scrollY));
    await owner.goto(portal('/projects?action=remove-assignment&lang=en#project-assignment-list'));
    const removal = owner
      .locator('form[action="?/removeAssignment"]')
      .filter({ has: owner.locator(`input[name="assignmentId"][value="${assignmentId}"]`) });
    await expect(removal).toBeVisible();
    await removal.locator('[name="endsOn"]').fill('2026-09-26');
    await removal.locator('[name="reason"]').fill('Disposable stale policy assignment removal');
    const removalPending = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/removeAssignment'),
    );
    await removal.locator('button.danger').click();
    expect((await removalPending).status()).toBeLessThan(400);
    await expect
      .poll(
        () =>
          (
            db.prepare('SELECT status FROM project_member WHERE id=?').get(assignmentId) as {
              status: string;
            }
          ).status,
      )
      .not.toBe('active');
    const auditAfterRemoval = (
      db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }
    ).count;
    const removedResponse = await post(page);
    const removedVisible = await visual(page);
    expect(removedResponse).toMatchObject({
      status: 409,
      code: 'FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE',
    });
    expect(removedVisible.code).toBe('FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE');
    expect(removedVisible.wording).toContain('2026-09-26');
    expect(removedVisible.selectedPersonRetained).toBe(true);
    expect(removedVisible.selectedPersonUnavailable).toBe(true);
    expect(removedVisible.reasonRetained).toBe(true);
    expect(removedVisible.effectiveFrom).toBe('2026-10-10');
    expect(removedVisible.focusedNotice).toBe(true);
    expect(removedVisible.noticeTop).toBeGreaterThanOrEqual(removedVisible.headerBottom - 2);
    expect(removedVisible.noticeBottom).toBeLessThanOrEqual(removedVisible.viewportHeight);
    expect(removedVisible.remedies.some((item) => item.hash === '#assignment-history')).toBe(true);
    expect(
      (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
    ).toBe(auditAfterRemoval);
    expect(
      (
        db
          .prepare('SELECT COUNT(*) count FROM assignment_expense_policy WHERE project_member_id=?')
          .get(assignmentId) as { count: number }
      ).count,
    ).toBe(0);
    cases.push({
      kind: 'removed-assignment-stale-policy',
      before: { scrollY: staleRemovalScroll, auditAfterRemoval },
      response: removedResponse,
      visible: removedVisible,
      policyCount: 0,
    });
    await page
      .locator('[data-finance-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'removed-finance-phone-390-en.png') });

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
