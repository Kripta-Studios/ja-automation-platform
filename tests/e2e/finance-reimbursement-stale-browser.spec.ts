import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type PolicyKind = 'project' | 'person';
type Role = 'owner' | 'finance';
type Locale = 'en' | 'es' | 'pt';

const scenarios: ReadonlyArray<{
  viewport: 'phone-390' | 'desktop';
  role: Role;
  locale: Locale;
  kind: PolicyKind;
  instance: number;
}> = [
  { viewport: 'phone-390', role: 'finance', locale: 'en', kind: 'project', instance: 1 },
  { viewport: 'desktop', role: 'owner', locale: 'es', kind: 'project', instance: 1 },
  { viewport: 'phone-390', role: 'owner', locale: 'pt', kind: 'person', instance: 2 },
  { viewport: 'desktop', role: 'finance', locale: 'en', kind: 'person', instance: 2 },
];

const copy = {
  en: {
    conflict: 'The worker reimbursement policy changed.',
    separate: 'customer billing is separate',
    review: 'Review updated record',
  },
  es: {
    conflict: 'La política de reembolso al trabajador cambió.',
    separate: 'la facturación al cliente se gestiona por separado',
    review: 'Revisar el registro actualizado',
  },
  pt: {
    conflict: 'A política de reembolso ao trabalhador mudou.',
    separate: 'o faturamento do cliente é separado',
    review: 'Revisar o registro atualizado',
  },
} as const;

function seedProject(viewport: string, instance: number) {
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  try {
    const userId = (email: string) => {
      const user = database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as
        | { id: string }
        | undefined;
      if (!user) throw new Error('Disposable reimbursement fixture account is missing');
      return user.id;
    };
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Reimbursement stale browser ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-REIMBURSE-STALE', 91, viewport, instance),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-09-01',
    }).id;
    const project = database.sqlite
      .prepare('SELECT status FROM project WHERE id=?')
      .get(projectId) as {
      status: string;
    };
    if (project.status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable reimbursement browser fixture',
      });
    repository.assignWorker(owner, {
      projectId,
      workerId: userId(e2eCredentials.worker.email),
      startsOn: '2026-09-01',
    });
    const assignment = database.sqlite
      .prepare("SELECT id FROM project_member WHERE project_id=? AND status='active'")
      .get(projectId) as { id: string } | undefined;
    if (!assignment) throw new Error('Disposable reimbursement fixture assignment is missing');
    return { databasePath, projectId, assignmentId: assignment.id };
  } finally {
    database.sqlite.close();
  }
}

function policySnapshot(
  databasePath: string,
  kind: PolicyKind,
  recordId: string,
): { version: number; mode: string | null; audits: number } {
  const db = new DatabaseSync(databasePath);
  try {
    const row =
      kind === 'project'
        ? (db
            .prepare(
              'SELECT version,worker_expense_reimbursement_default AS mode FROM project WHERE id=?',
            )
            .get(recordId) as { version: number; mode: string | null })
        : (db
            .prepare(
              'SELECT version,worker_expense_reimbursement_override AS mode FROM project_member WHERE id=?',
            )
            .get(recordId) as { version: number; mode: string | null });
    const audit = db
      .prepare('SELECT COUNT(*) AS count FROM audit_event WHERE entity_type=? AND entity_id=?')
      .get(kind === 'project' ? 'project' : 'project_member', recordId) as { count: number };
    return { ...row, audits: audit.count };
  } finally {
    db.close();
  }
}

async function openPolicy(page: Page, projectId: string, locale: Locale) {
  const query = new URLSearchParams({
    view: 'commercial',
    project: projectId,
    task: 'Person expense policies',
    lang: locale,
  });
  await page.goto(portal(`/finance?${query}#person-expense-policies`));
  await expect(page.locator('#finance-configuration-task')).toHaveValue('Person expense policies');
}

function policyForm(page: Page, kind: PolicyKind, assignmentId: string): Locator {
  return kind === 'project'
    ? page.locator('form[data-project-reimbursement-form]')
    : page.locator(
        `form[data-worker-reimbursement-form]:has(input[name="projectMemberId"][value="${assignmentId}"])`,
      );
}

for (const scenario of scenarios) {
  test(`${scenario.role} ${scenario.kind} reimbursement race retains the stale form at ${scenario.viewport} ${scenario.locale}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== scenario.viewport);
    test.setTimeout(120_000);
    const fixture = seedProject(scenario.viewport, scenario.instance);
    const recordId = scenario.kind === 'project' ? fixture.projectId : fixture.assignmentId;
    const actionName =
      scenario.kind === 'project'
        ? 'setProjectReimbursementDefault'
        : 'setWorkerReimbursementOverride';
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        runtimeErrors.push(message.text());
    });

    await signIn(page, scenario.role);
    const writer = await page.context().newPage();
    try {
      // Both real browser tabs render the same version before either submits.
      await openPolicy(page, fixture.projectId, scenario.locale);
      await openPolicy(writer, fixture.projectId, scenario.locale);
      const staleForm = policyForm(page, scenario.kind, fixture.assignmentId);
      const writerForm = policyForm(writer, scenario.kind, fixture.assignmentId);
      await expect(staleForm).toBeVisible();
      await expect(writerForm).toBeVisible();
      const staleVersion = await staleForm.locator('[name="expectedVersion"]').inputValue();
      expect(await writerForm.locator('[name="expectedVersion"]').inputValue()).toBe(staleVersion);

      await staleForm.locator('[name="mode"]').selectOption('none');
      await staleForm
        .locator('[name="reason"]')
        .fill('Keep my reviewed worker reimbursement choice');
      await writerForm.locator('[name="mode"]').selectOption('at_cost');
      await writerForm.locator('[name="reason"]').fill('A second browser tab updated the policy');
      const writerResponse = writer.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes(`?/${actionName}`),
      );
      await writerForm.locator('button[type="submit"]').click();
      expect((await writerResponse).status()).toBe(200);
      const committed = policySnapshot(fixture.databasePath, scenario.kind, recordId);
      expect(committed.mode).toBe('at_cost');
      expect(committed.version).toBeGreaterThan(Number(staleVersion));

      await staleForm.locator('button[type="submit"]').scrollIntoViewIfNeeded();
      const beforeScroll = await page.evaluate(() => window.scrollY);
      const staleResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes(`?/${actionName}`),
      );
      await staleForm.locator('button[type="submit"]').click();
      const response = await staleResponse;
      expect(response.status()).toBe(409);
      expect(await response.text()).toContain('WORKER_REIMBURSEMENT_POLICY_CHANGED');

      const notice = page.locator('[data-finance-problem] [data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute(
        'data-problem-code',
        'WORKER_REIMBURSEMENT_POLICY_CHANGED',
      );
      await expect(notice).toContainText(copy[scenario.locale].conflict);
      await expect(notice).toContainText(copy[scenario.locale].separate);
      await expect(page.locator('[data-finance-problem]')).toBeFocused();
      await expect(page.locator('[data-finance-problem]')).toBeInViewport();
      await expect(page.locator('#finance-configuration-task')).toHaveValue(
        'Person expense policies',
      );
      await expect(staleForm.locator('[name="mode"]')).toHaveValue('none');
      await expect(staleForm.locator('[name="reason"]')).toHaveValue(
        'Keep my reviewed worker reimbursement choice',
      );
      expect(new URL(page.url()).searchParams.get('project')).toBe(fixture.projectId);
      expect(new URL(page.url()).searchParams.get('view')).toBe('commercial');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
      );
      // Focus may move the viewport to the explanation, but it must remain visible
      // below the sticky header and the form must retain the user's entries.
      const focusBounds = await page.locator('[data-finance-problem]').evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        const header = document.querySelector('.portal-layout > header');
        const safeTop = header?.getBoundingClientRect().bottom ?? 0;
        return { top, safeTop, scroll: window.scrollY };
      });
      expect(focusBounds.top).toBeGreaterThanOrEqual(focusBounds.safeTop - 2);
      expect(Math.abs(focusBounds.scroll - beforeScroll)).toBeLessThanOrEqual(24);

      const review = notice.getByRole('link', { name: copy[scenario.locale].review });
      await expect(review).toBeVisible();
      const href = await review.getAttribute('href');
      if (!href) throw new Error('Stale reimbursement remedy is not a link');
      const destination = new URL(href, page.url());
      expect(destination.pathname).toBe(new URL(portal('/finance')).pathname);
      expect(destination.searchParams.get('project')).toBe(fixture.projectId);
      expect(destination.searchParams.get('view')).toBe('commercial');
      expect(destination.searchParams.get('task')).toBe('Person expense policies');
      expect(destination.searchParams.get('lang')).toBe(scenario.locale);
      expect(destination.hash).toBe('#person-expense-policies');
      expect(policySnapshot(fixture.databasePath, scenario.kind, recordId)).toEqual(committed);
      expect(runtimeErrors).toEqual([]);

      await review.click();
      await expect(page.locator('#finance-configuration-task')).toHaveValue(
        'Person expense policies',
      );
      await expect(
        policyForm(page, scenario.kind, fixture.assignmentId).locator('[name="mode"]'),
      ).toHaveValue('at_cost');
      expect(policySnapshot(fixture.databasePath, scenario.kind, recordId)).toEqual(committed);
    } finally {
      await writer.close();
    }
  });
}
