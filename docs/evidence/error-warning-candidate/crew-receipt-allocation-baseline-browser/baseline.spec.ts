import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const root = import.meta.dirname;
const productCommit = 'bcdd0fd9a9a1813751b256f5c9088f09778648a9';
const day = new Date().toISOString().slice(0, 10);

function writeSanitized(value: unknown, name: string) {
  writeFileSync(
    join(root, name),
    JSON.stringify(
      value,
      (_key, raw) =>
        typeof raw === 'string'
          ? raw.replace(
              /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
              ':record',
            )
          : raw,
      2,
    ) + '\n',
  );
}

function diagnostics(page: Page) {
  const result = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  return result;
}

function allocationState(db: DatabaseSync, expenseId: string) {
  const group = db
    .prepare(
      'SELECT id,total_minor,allocation_count FROM crew_shared_expense_allocation_group WHERE expense_id=?',
    )
    .get(expenseId) as { id: string; total_minor: number; allocation_count: number } | undefined;
  const allocations = group
    ? (db
        .prepare(
          'SELECT amount_minor FROM crew_shared_expense_allocation WHERE group_id=? ORDER BY amount_minor',
        )
        .all(group.id) as { amount_minor: number }[])
    : [];
  const audit = group
    ? (
        db
          .prepare(
            "SELECT COUNT(*) n FROM audit_event WHERE entity_type='crew_shared_expense_allocation_group' AND entity_id=?",
          )
          .get(group.id) as { n: number }
      ).n
    : 0;
  return {
    groupCount: (
      db
        .prepare('SELECT COUNT(*) n FROM crew_shared_expense_allocation_group WHERE expense_id=?')
        .get(expenseId) as { n: number }
    ).n,
    totalMinor: group?.total_minor ?? null,
    allocationCount: group?.allocation_count ?? 0,
    amountsMinor: allocations.map((row) => row.amount_minor),
    auditCount: audit,
  };
}

async function createProjectAndDelegations(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable client unavailable');
  const chiefId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  const workers = db
    .prepare(
      "SELECT id,name FROM user WHERE role='worker' AND status='active' AND id<>? ORDER BY id LIMIT 2",
    )
    .all(chiefId) as { id: string; name: string }[];
  expect(workers).toHaveLength(2);
  const name = `Crew shared receipt race ${randomUUID()}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="costCenterCode"]').fill(`QA-CREW-${Date.now() % 100000000}`);
  await form.locator('[name="startDate"]').fill(day);
  await form.locator('[name="initialWorkersStartOn"]').fill(day);
  for (const id of [chiefId, ...workers.map((worker) => worker.id)])
    await form.locator(`input[name="initialWorkerId"][value="${id}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const projectId = (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string })
    .id;

  await owner.goto(portal(`/crew?project=${projectId}&date=${day}&lang=en`));
  for (const worker of workers) {
    const grant = owner.locator('form[data-crew-operation="grant"]');
    await grant.locator('[name="chiefUserId"]').selectOption(chiefId);
    await grant.locator('[name="workerUserId"]').selectOption(worker.id);
    await grant.locator('[name="startsOn"]').fill(day);
    await grant.locator('button[type="submit"]').click();
    await expect(owner.locator('.grant-list li').filter({ hasText: worker.name })).toBeVisible();
  }
  return { projectId, workers };
}

async function createCrewTimeAndReceipt(
  chief: Page,
  db: DatabaseSync,
  projectId: string,
  workers: { id: string; name: string }[],
) {
  await signIn(chief, 'worker');
  await chief.goto(portal(`/crew?project=${projectId}&date=${day}&lang=en`));
  const summary = `Crew receipt race time ${randomUUID()}`;
  const batch = chief.locator('form[data-crew-operation="createBatch"]');
  await expect(batch).toBeVisible();
  for (const worker of workers)
    await batch.locator(`input[name="workerIds"][value="${worker.id}"]`).check();
  await batch.locator('[name="sharedHours"]').fill('2.5');
  await batch.locator('[name="summary"]').fill(summary);
  await batch.locator('button[type="submit"]').click();
  await expect
    .poll(
      () =>
        (
          db
            .prepare('SELECT COUNT(*) n FROM time_entry WHERE project_id=? AND activity_summary=?')
            .get(projectId, summary) as { n: number }
        ).n,
    )
    .toBe(2);
  const rows = db
    .prepare(
      'SELECT id,worker_id FROM time_entry WHERE project_id=? AND activity_summary=? ORDER BY worker_id',
    )
    .all(projectId, summary) as { id: string; worker_id: string }[];
  const expenseLink = chief.getByRole('link', { name: `Add expense for ${workers[0]!.name}` });
  await expect(expenseLink).toBeVisible();
  await expenseLink.click();
  const form = chief.locator('form[data-expense-entry-surface]').first();
  await expect(form).toBeVisible();
  const marker = `Shared crew parking ${randomUUID()}`;
  await form.locator('[name="category"]').selectOption('parking');
  await form.locator('[name="vendor"]').fill(marker);
  await form.locator('[name="amount"]').fill('12.50');
  await form.locator('[name="currency"]').selectOption('USD');
  await form.locator('[name="whoPaid"]').selectOption('worker');
  await form.locator('[name="description"]').fill('Synthetic shared crew receipt');
  await form.locator('input[name="receipt"]').setInputFiles({
    name: 'synthetic-crew-receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% synthetic crew receipt ${randomUUID()}\n%%EOF\n`),
  });
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM expense WHERE vendor=?').get(marker))
    .toBeTruthy();
  const expense = db
    .prepare(
      'SELECT id,receipt_document_id,time_entry_id,amount_minor,approval_state FROM expense WHERE vendor=?',
    )
    .get(marker) as {
    id: string;
    receipt_document_id: string;
    time_entry_id: string;
    amount_minor: number;
    approval_state: string;
  };
  expect(expense.amount_minor).toBe(1250);
  expect(expense.approval_state).toBe('draft');
  expect(expense.receipt_document_id).toBeTruthy();
  expect(expense.time_entry_id).toBeTruthy();
  return { expenseId: expense.id, rows };
}

async function fillAllocation(
  page: Page,
  expenseId: string,
  rows: { id: string }[],
  amounts: [string, string],
) {
  const form = page.locator('form[data-crew-operation="allocateReceipt"]');
  await expect(form).toBeVisible();
  await form.locator('[name="expenseId"]').selectOption(expenseId);
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i]!.id;
    await form.locator(`input[name="timeEntryIds"][value="${id}"]`).check();
    await form.locator(`input[name="amount_${id}"]`).fill(amounts[i]!);
  }
  return form;
}

async function view(page: Page, expenseId: string, rowIds: string[]) {
  return page.evaluate(
    ({ expenseId, rowIds }) => {
      const notice = document.querySelector<HTMLElement>(
        '[data-crew-problem] [data-ui="problem-notice"]',
      );
      const form = document.querySelector<HTMLFormElement>(
        'form[data-crew-operation="allocateReceipt"]',
      );
      const active = document.activeElement;
      const focusedBox = active?.getBoundingClientRect();
      const noticeBox = notice?.getBoundingClientRect();
      const remedy = [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((a) => ({
        label: a.textContent?.trim(),
        pathname: new URL(a.href).pathname,
        search: new URL(a.href).search,
        hash: new URL(a.href).hash,
      }));
      return {
        code: notice?.getAttribute('data-problem-code') ?? null,
        wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        remedy,
        formPresent: Boolean(form),
        receiptOptionPresent: Boolean(form?.querySelector(`option[value="${expenseId}"]`)),
        selectedReceipt:
          form?.querySelector<HTMLSelectElement>('[name="expenseId"]')?.value === expenseId,
        chosenRows: rowIds.map((id) =>
          Boolean(
            form?.querySelector<HTMLInputElement>(`input[name="timeEntryIds"][value="${id}"]`)
              ?.checked,
          ),
        ),
        amounts: rowIds.map(
          (id) =>
            form?.querySelector<HTMLInputElement>(`input[name="amount_${id}"]`)?.value ?? null,
        ),
        savedGroupVisible: Boolean(document.querySelector('#crew-receipts .grant-list')),
        focusedTag: active?.tagName.toLowerCase() ?? null,
        focusedNotice: active === notice || active === notice?.parentElement,
        focusTop: focusedBox ? Math.round(focusedBox.top) : null,
        noticeTop: noticeBox ? Math.round(noticeBox.top) : null,
        scrollY: Math.round(scrollY),
        viewportHeight: innerHeight,
        selectedProject:
          (document.querySelector('#crew-project') as HTMLSelectElement | null)?.value ===
          new URL(location.href).searchParams.get('project'),
        selectedDate: (document.querySelector('#crew-date') as HTMLInputElement | null)?.value,
        locale: new URL(location.href).searchParams.get('lang'),
      };
    },
    { expenseId, rowIds },
  );
}

for (const scenario of [
  { name: 'phone-390', locale: 'en' },
  { name: 'desktop', locale: 'es' },
] as const) {
  test(`Crew chief stale shared receipt allocation ${scenario.name}`, async ({
    page,
    browser,
  }, info) => {
    test.skip(info.project.name !== scenario.name);
    test.setTimeout(180_000);
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const owner = await ownerContext.newPage();
    const chiefA = page;
    const chiefErrors = diagnostics(chiefA);
    const ownerErrors = diagnostics(owner);
    const result: Record<string, unknown> = {
      productCommit,
      role: 'crewChief',
      viewport: scenario.name,
      locale: scenario.locale,
      fixture:
        'fresh disposable DB; project, delegations, time, receipt created through rendered UI',
      cases: [],
    };
    const cases = result.cases as Array<Record<string, unknown>>;
    try {
      const { projectId, workers } = await createProjectAndDelegations(owner, db);
      const { expenseId, rows } = await createCrewTimeAndReceipt(chiefA, db, projectId, workers);
      const url = portal(`/crew?project=${projectId}&date=${day}&lang=${scenario.locale}`);
      await chiefA.goto(url);
      const chiefB = await chiefA.context().newPage();
      const bErrors = diagnostics(chiefB);
      await chiefB.goto(url);
      await fillAllocation(chiefA, expenseId, rows, ['7.00', '5.50']);
      const before = await view(
        chiefA,
        expenseId,
        rows.map((row) => row.id),
      );
      await fillAllocation(chiefB, expenseId, rows, ['8.00', '4.50']);
      const savedPending = chiefB.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/allocateReceipt'),
      );
      await chiefB
        .locator('form[data-crew-operation="allocateReceipt"] button[type="submit"]')
        .click();
      const savedResponse = await savedPending;
      await expect(chiefB.locator('#crew-receipts .grant-list')).toBeVisible();
      const saved = allocationState(db, expenseId);
      expect(saved).toMatchObject({
        groupCount: 1,
        totalMinor: 1250,
        allocationCount: 2,
        amountsMinor: [450, 800],
        auditCount: 1,
      });

      const enhanced = await chiefA
        .locator('form[data-crew-operation="allocateReceipt"]')
        .evaluate(async (form) => {
          const response = await fetch((form as HTMLFormElement).action, {
            method: 'POST',
            body: new FormData(form as HTMLFormElement),
            headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
          });
          const text = await response.text();
          const envelope = JSON.parse(text) as { type?: string; status?: number };
          return {
            transportStatus: response.status,
            contentType: response.headers.get('content-type')?.split(';')[0] ?? '',
            envelopeType: envelope.type ?? null,
            actionStatus: envelope.status ?? null,
            code: text.match(/CREW_[A-Z_]+/u)?.[0] ?? null,
            remedy: text.match(/review_receipts/iu)?.[0] ?? null,
          };
        });
      expect(enhanced).toMatchObject({
        transportStatus: 200,
        envelopeType: 'failure',
        actionStatus: 409,
        code: 'CREW_RECEIPT_UNAVAILABLE',
      });
      const pending = chiefA.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/allocateReceipt'),
      );
      await chiefA
        .locator('form[data-crew-operation="allocateReceipt"]')
        .evaluate((form) => (form as HTMLFormElement).submit());
      const nativeResponse = await pending;
      await chiefA.waitForLoadState('networkidle');
      const nativeBody = await nativeResponse.text();
      const native = {
        status: nativeResponse.status(),
        contentType: nativeResponse.headers()['content-type']?.split(';')[0] ?? '',
        code: nativeBody.match(/CREW_[A-Z_]+/u)?.[0] ?? null,
        remedy: nativeBody.match(/review_receipts/iu)?.[0] ?? null,
      };
      const after = await view(
        chiefA,
        expenseId,
        rows.map((row) => row.id),
      );
      const finalState = allocationState(db, expenseId);
      cases.push({
        kind: 'allocated-after-open',
        before,
        savedResponse: {
          transportStatus: savedResponse.status(),
          contentType: savedResponse.headers()['content-type']?.split(';')[0] ?? '',
        },
        saved,
        enhanced,
        native,
        after,
        finalState,
      });
      expect(native).toMatchObject({ status: 409, code: 'CREW_RECEIPT_UNAVAILABLE' });
      expect(finalState).toEqual(saved);
      const notice = chiefA.locator('[data-crew-problem] [data-ui="problem-notice"]');
      if (await notice.isVisible())
        await notice.screenshot({
          path: join(root, `stale-${scenario.name}-${scenario.locale}.png`),
        });
      expect(chiefErrors.pageErrors).toEqual([]);
      expect(chiefErrors.consoleErrors).toEqual([]);
      expect(bErrors.pageErrors).toEqual([]);
      expect(bErrors.consoleErrors).toEqual([]);
      expect(ownerErrors.pageErrors).toEqual([]);
      expect(ownerErrors.consoleErrors).toEqual([]);
      result.console = { chiefA: chiefErrors, chiefB: bErrors, owner: ownerErrors };
    } finally {
      writeSanitized(result, `results-${scenario.name}.json`);
      await ownerContext.close();
      db.close();
    }
  });
}
