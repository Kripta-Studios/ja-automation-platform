import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const workDate = new Date().toISOString().slice(0, 10);

type Notice = {
  id: string;
  user_id: string;
  read_at: string | null;
  created_at: string;
};

function database() {
  return createDatabase(readE2EFixturePointer().databasePath);
}

function seedDailyDraft(viewport: string) {
  const db = database();
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const ownerId = userId(e2eCredentials.owner.email);
    const financeId = userId(e2eCredentials.finance.email);
    const managerId = userId(e2eCredentials.manager.email);
    const workerId = userId(e2eCredentials.worker.email);
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(ownerId);
    const project = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Repeat report edit QA ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-REPEAT-REPORT', 93, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
      projectManagerId: managerId,
      initialWorkerIds: [workerId],
    });
    const status = db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(project.id) as {
      status: string;
    };
    if (status.status !== 'active')
      repository.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Activate disposable repeated-report-edit QA project',
      });
    const report = repository.createDailyReport(repository.principalFor(workerId), {
      projectId: project.id,
      workDate,
      summary: 'Original daily draft',
      tasksCompleted: 'Checked disposable QA equipment',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    return { reportId: report.id, recipientIds: [ownerId, financeId, managerId] };
  } finally {
    db.sqlite.close();
  }
}

function snapshot(reportId: string) {
  const db = database();
  try {
    const report = db.sqlite
      .prepare('SELECT version,summary FROM daily_report WHERE id=?')
      .get(reportId) as { version: number; summary: string };
    const notices = db.sqlite
      .prepare(
        "SELECT id,user_id,read_at,created_at FROM notification WHERE kind='report_modified' AND subject_id=? ORDER BY user_id",
      )
      .all(reportId) as Notice[];
    const audit = db.sqlite
      .prepare(
        "SELECT COUNT(*) count FROM audit_event WHERE action='report.report_modified' AND entity_id=?",
      )
      .get(reportId) as { count: number };
    return { report, notices, auditCount: audit.count };
  } finally {
    db.sqlite.close();
  }
}

function markNoticesRead(notices: Notice[]) {
  const db = database();
  try {
    const repository = new PortalRepository(db.sqlite);
    for (const notice of notices)
      repository.markNotificationRead(repository.principalFor(notice.user_id), notice.id);
  } finally {
    db.sqlite.close();
  }
}

async function saveFromForm(page: Page, summary: string) {
  const form = page.locator('form[data-report-autosave-form]');
  await expect(form).toBeVisible();
  await form.locator('[name="summary"]').fill(summary);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes('?/updateReport'),
  );
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('.action-message.success')).toContainText('Changes saved');
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`A second daily report edit saves and refreshes reviewer notices at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    const { reportId, recipientIds } = seedDailyDraft(viewport);
    const pageErrors: string[] = [];
    const serverErrors: Array<{ status: number; path: string }> = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (response.status() >= 500 && path !== '/j-aautomation/app/api/offline/identity')
        serverErrors.push({ status: response.status(), path });
    });
    await signIn(page, 'worker');
    await page.goto(portal(`/reports/${reportId}?lang=en`));

    await saveFromForm(page, 'First browser edit');
    await expect.poll(() => snapshot(reportId).report.version).toBe(2);
    const first = snapshot(reportId);
    expect(first.report.summary).toBe('First browser edit');
    expect(first.notices.map((notice) => notice.user_id).sort()).toEqual(recipientIds.sort());
    expect(first.notices).toHaveLength(3);
    markNoticesRead(first.notices);
    expect(snapshot(reportId).notices.every((notice) => Boolean(notice.read_at))).toBe(true);

    await page.waitForTimeout(20);
    await saveFromForm(page, 'Second browser edit');
    await expect.poll(() => snapshot(reportId).report.version).toBe(3);
    const second = snapshot(reportId);
    expect(second.report.summary).toBe('Second browser edit');
    expect(second.auditCount).toBe(2);
    expect(second.notices).toHaveLength(3);
    expect(second.notices.map((notice) => notice.id)).toEqual(
      first.notices.map((notice) => notice.id),
    );
    expect(second.notices.every((notice) => notice.read_at === null)).toBe(true);
    for (const notice of second.notices) {
      const previous = first.notices.find((item) => item.id === notice.id);
      expect(previous).toBeDefined();
      expect(notice.created_at >= previous!.created_at).toBe(true);
    }
    await expect(page.locator('form[data-report-autosave-form] [name="version"]')).toHaveValue('3');
    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });
}
