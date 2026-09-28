import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = join(import.meta.dirname, 'retest-85b696d');
const date = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const versionCode = 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED';

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

function assignment(db: DatabaseSync, id: string) {
  return db
    .prepare(
      `SELECT version,starts_on,ends_on,status,allow_global_compensation_fallback,
    allow_global_internal_cost_fallback FROM project_member WHERE id=?`,
    )
    .get(id) as {
    version: number;
    starts_on: string;
    ends_on: string | null;
    status: string;
    allow_global_compensation_fallback: number;
    allow_global_internal_cost_fallback: number;
  };
}

function auditCount(db: DatabaseSync, id: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(id) as {
      count: number;
    }
  ).count;
}

async function createQaProject(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable client fixture unavailable');
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  const marker = randomUUID();
  const name = `Commercial date race browser ${marker}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form
    .locator('[name="costCenterCode"]')
    .fill(`QA-DRACE-${parseInt(marker.slice(0, 8), 16)}`);
  await form.locator('[name="startDate"]').fill(date);
  await form.locator('[name="initialWorkersStartOn"]').fill(date);
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createProject'),
  );
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  expect((await pending).status()).toBeLessThan(400);
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const projectId = (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string })
    .id;
  const assignmentId = (
    db
      .prepare("SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active'")
      .get(projectId, workerId) as { id: string }
  ).id;
  return { projectId, assignmentId };
}

async function openFinanceForm(finance: Page, projectId: string, locale: string) {
  await signIn(finance, 'finance');
  await finance.goto(
    portal(
      `/finance?view=commercial&project=${projectId}&asOf=${date}&lang=${locale}#finance-rule-registers`,
    ),
  );
  const editor = finance.locator('.assignment-commercial-editor').first();
  await expect(editor).toBeVisible();
  if ((await editor.getAttribute('open')) === null) await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  return editor.locator('form[action*="?/setAssignmentCommercialFallback"]');
}

async function moveAssignmentDate(
  owner: Page,
  db: DatabaseSync,
  projectId: string,
  assignmentId: string,
) {
  await owner.goto(portal(`/projects?action=update-assignment&project=${projectId}&lang=en`));
  const form = owner.locator(
    `form[data-action="updateAssignment"][data-assignment-id="${assignmentId}"]`,
  );
  await expect(form).toBeVisible();
  await form.locator('[name="startsOn"]').fill(tomorrow);
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/updateAssignment'),
  );
  await form.getByRole('button', { name: 'Update assignment' }).click();
  const status = (await pending).status();
  expect(status).toBeLessThan(400);
  await expect.poll(() => assignment(db, assignmentId).starts_on).toBe(tomorrow);
  return { status };
}

async function globalNoticeState(page: Page) {
  return page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>(
      '[data-ui="problem-notice"][data-problem-code="FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED"]',
    );
    const bounds = notice?.getBoundingClientRect();
    const wrapperBounds = notice?.closest('[data-finance-problem]')?.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const nav = document.querySelector<HTMLElement>('.bottom-nav');
    const safeTop =
      (header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
        ? header.getBoundingClientRect().bottom
        : 0) + 8;
    const safeBottom =
      nav && getComputedStyle(nav).position === 'fixed'
        ? nav.getBoundingClientRect().top - 16
        : innerHeight - 16;
    const remedy = notice?.querySelector<HTMLAnchorElement>('a');
    const attemptedChoices = Array.from(
      notice
        ?.closest('[data-finance-problem]')
        ?.querySelectorAll<HTMLElement>('.finance-overview__attempted-recap dl > div') ?? [],
      (row) => ({
        label: row.querySelector('dt')?.textContent?.trim() ?? '',
        value: row.querySelector('dd')?.textContent?.trim() ?? '',
      }),
    );
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      attemptedChoices,
      remedy: remedy
        ? {
            text: remedy.textContent?.trim() ?? '',
            path: new URL(remedy.href).pathname,
            tab: new URL(remedy.href).searchParams.get('tab'),
            lang: new URL(remedy.href).searchParams.get('lang'),
            hash: new URL(remedy.href).hash,
          }
        : null,
      role: notice?.getAttribute('role') ?? null,
      focused:
        document.activeElement === notice || document.activeElement === notice?.parentElement,
      top: bounds ? Math.round(bounds.top) : null,
      bottom: bounds ? Math.round(bounds.bottom) : null,
      recapBottom: wrapperBounds ? Math.round(wrapperBounds.bottom) : null,
      safeTop: Math.round(safeTop),
      safeBottom: Math.round(safeBottom),
      scrollY: Math.round(scrollY),
      routeView: new URL(location.href).searchParams.get('view'),
      language: document.documentElement.lang,
      openAssignmentEditorCount: document.querySelectorAll('.assignment-commercial-editor').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

function save(name: string, data: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      data,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[qa-id]')
          : value,
      2,
    ) + '\n',
  );
}

test('assignment date change removes selected Finance person while stale commercial form is open', async ({
  browser,
}, info) => {
  test.setTimeout(150_000);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const height = width === 390 ? 844 : width === 430 ? 932 : 900;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const contexts = await Promise.all(
    [0, 1].map(() => browser.newContext({ viewport: { width, height } })),
  );
  const [owner, finance] = await Promise.all(contexts.map((context) => context.newPage()));
  const logs = { owner: diagnostics(owner), finance: diagnostics(finance) };
  try {
    const { projectId, assignmentId } = await createQaProject(owner, db);
    const before = assignment(db, assignmentId);
    const form = await openFinanceForm(finance, projectId, locale);
    const desiredInternalCost = before.allow_global_internal_cost_fallback ? 'no' : 'yes';
    await form.locator('[name="allowGlobalInternalCost"]').selectOption(desiredInternalCost);
    const attempted = await form.evaluate((node) =>
      Object.fromEntries(new FormData(node as HTMLFormElement).entries()),
    );
    const beforeAudit = auditCount(db, assignmentId);
    const ownerUpdate = await moveAssignmentDate(owner, db, projectId, assignmentId);
    const moved = assignment(db, assignmentId);
    expect(moved.version).toBe(before.version + 1);
    expect(moved.starts_on).toBe(tomorrow);
    expect(moved.status).toBe('active');
    const afterOwnerAudit = auditCount(db, assignmentId);
    expect(afterOwnerAudit).toBe(beforeAudit + 1);
    const pending = finance.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('?/setAssignmentCommercialFallback'),
    );
    await form.locator('button[type="submit"]').click();
    const response = await pending;
    const body = await response.text();
    const network = {
      status: response.status(),
      codeInResponse: body.includes(versionCode),
      genericInResponse: body.includes('Check the submitted values'),
    };
    expect(network).toEqual({ status: 409, codeInResponse: true, genericInResponse: false });
    await expect.poll(async () => (await globalNoticeState(finance)).focused).toBe(true);
    const visible = await globalNoticeState(finance);
    expect(visible).toMatchObject({ code: versionCode, routeView: 'commercial', overflow: false });
    expect(visible.text).toMatch(
      /not shown for the selected work date|no aparece para la fecha de trabajo seleccionada|não aparece para a data de trabalho selecionada/i,
    );
    expect(visible.openAssignmentEditorCount).toBe(0);
    const internalCostChoice = visible.attemptedChoices.find((choice) =>
      /internal cost|costo interno|custo interno/i.test(choice.label),
    );
    const expectedChoice =
      desiredInternalCost === 'yes'
        ? locale === 'en'
          ? 'On'
          : locale === 'es'
            ? 'Activado'
            : 'Ativado'
        : locale === 'en'
          ? 'Off'
          : locale === 'es'
            ? 'Desactivado'
            : 'Desativado';
    expect(internalCostChoice?.value).toBe(expectedChoice);
    expect(visible.remedy?.path).toContain(`/projects/${projectId}`);
    expect(visible.remedy?.tab).toBe('team');
    expect(visible.remedy?.hash).toBe('#team-title');
    expect(visible.top).toBeGreaterThanOrEqual((visible.safeTop ?? 0) - 2);
    expect(visible.bottom).toBeLessThanOrEqual((visible.safeBottom ?? height) + 2);
    expect(visible.recapBottom).toBeLessThanOrEqual((visible.safeBottom ?? height) + 2);
    expect(assignment(db, assignmentId)).toEqual(moved);
    expect(auditCount(db, assignmentId)).toBe(afterOwnerAudit);
    await finance.locator('[data-finance-problem]').screenshot({
      path: join(evidenceRoot, `${info.project.name}-${locale}-notice.png`),
    });
    const auditBeforeReview = auditCount(db, assignmentId);
    await finance
      .locator(
        '[data-ui="problem-notice"][data-problem-code="FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED"] a',
      )
      .first()
      .click();
    await expect(finance).toHaveURL(new RegExp(`/projects/${projectId}\\?tab=team`));
    await expect(finance.locator('#project-panel-team')).toBeVisible();
    await expect(finance.locator('#team-title')).toBeVisible();
    await expect(finance.locator('.team-list')).toContainText(tomorrow);
    const detailLanguage = await finance.locator('html').getAttribute('lang');
    expect(detailLanguage).toBe(locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'pt-BR');
    expect(assignment(db, assignmentId)).toEqual(moved);
    expect(auditCount(db, assignmentId)).toBe(auditBeforeReview);
    expect(logs).toEqual({ owner: [], finance: [] });
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    save(`${info.project.name}-${locale}-results.json`, {
      commit,
      viewport: { width, height },
      locale,
      roles: ['owner', 'finance'],
      fixture:
        'Owner UI moved one QA assignment start beyond Finance selected asOf while Finance form stayed open',
      originalStart: before.starts_on,
      movedStart: moved.starts_on,
      ownerUpdate,
      attempted: {
        internalCost: desiredInternalCost,
        expectedVersion: String(attempted.expectedVersion ?? ''),
      },
      network,
      visible,
      review: {
        openedProjectTeam: true,
        currentDateVisible: true,
        localePreserved: detailLanguage,
        noWrite: true,
      },
      assignmentUnchangedAfterFailure: true,
      diagnostics: logs,
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    db.close();
  }
});
