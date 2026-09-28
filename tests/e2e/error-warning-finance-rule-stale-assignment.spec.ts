import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Response } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const evidenceDirectory = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/finance-rule-stale-assignment',
);

type Assignment = {
  id: string;
  projectId: string;
  workerId: string;
  currency: string;
  effectiveFrom: string;
};

function database(): DatabaseSync {
  return new DatabaseSync(readE2EFixturePointer().databasePath);
}

function activeAssignment(): Assignment {
  const db = database();
  try {
    const row = db
      .prepare(
        `SELECT pm.id, p.id AS projectId, pm.user_id AS workerId,
                p.currency, pm.starts_on AS effectiveFrom
           FROM project_member pm
           JOIN project p ON p.id=pm.project_id
           JOIN user u ON u.id=pm.user_id
          WHERE pm.status='active' AND p.status='active' AND u.status='active'
            AND u.role IN ('worker','project_manager')
            AND pm.starts_on IS NOT NULL
            AND (pm.ends_on IS NULL OR pm.ends_on >= pm.starts_on)
          ORDER BY p.id, pm.id LIMIT 1`,
      )
      .get() as Assignment | undefined;
    if (!row) throw new Error('Finance stale-assignment fixture has no active project member');
    return row;
  } finally {
    db.close();
  }
}

function setAssignmentStatus(assignmentId: string, status: 'active' | 'inactive'): void {
  const db = database();
  try {
    const result = db
      .prepare('UPDATE project_member SET status=?, updated_at=? WHERE id=?')
      .run(status, new Date().toISOString(), assignmentId);
    if (result.changes !== 1) throw new Error('Finance fixture assignment disappeared');
  } finally {
    db.close();
  }
}

function ruleCount(projectId: string, workerId: string): number {
  const db = database();
  try {
    return (
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM compensation_rule WHERE project_id=? AND worker_id=?',
        )
        .get(projectId, workerId) as { count: number }
    ).count;
  } finally {
    db.close();
  }
}

for (const viewport of ['phone-390', 'desktop']) {
  test(`Finance recovers from an assignment removed while a pay rule is open at ${viewport}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== viewport);
    const assignment = activeAssignment();
    const beforeCount = ruleCount(assignment.projectId, assignment.workerId);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        runtimeErrors.push(message.text());
    });

    await signIn(page, 'finance');
    await page.goto(
      portal(
        `/finance?view=commercial&project=${encodeURIComponent(assignment.projectId)}&lang=es`,
      ),
    );
    await page.locator('#finance-configuration-task').selectOption('Worker compensation');
    const form = page.locator('form[action*="?/createCompensationRule"]');
    await form.locator('[name="workerId"]').selectOption(assignment.workerId);
    await form.locator('[name="projectId"]').selectOption(assignment.projectId);
    await form.locator('[name="currency"]').selectOption(assignment.currency);
    await form.locator('#finance-comp-rate').fill('12.34');
    await form.locator('[name="effectiveFrom"]').fill(assignment.effectiveFrom);
    await expect(form.locator('[name="rateMinor"]')).toHaveValue('1234');
    const scrollBefore = await page.evaluate(() => window.scrollY);

    setAssignmentStatus(assignment.id, 'inactive');
    try {
      const responsePromise = page.waitForResponse(
        (response: Response) =>
          response.request().method() === 'POST' &&
          response.url().includes('?/createCompensationRule'),
      );
      await form.locator('.form-actions button').click();
      const response = await responsePromise;
      expect(response.status()).toBe(409);
      expect(await response.text()).toContain('FINANCE_RULE_ASSIGNMENT_UNAVAILABLE');

      const notice = page.locator('[data-finance-problem]');
      await expect(notice.locator('[data-problem-code]')).toHaveAttribute(
        'data-problem-code',
        'FINANCE_RULE_ASSIGNMENT_UNAVAILABLE',
      );
      await expect(notice).toContainText(
        'Este trabajador no tiene una asignación activa al proyecto seleccionado',
      );
      await expect(notice).toContainText('Consultar al propietario del proyecto');
      await expect(page.locator('#finance-configuration-task')).toHaveValue('Worker compensation');

      const failedForm = page.locator('form[action*="?/createCompensationRule"]');
      await expect(failedForm.locator('[name="workerId"]')).toHaveValue(assignment.workerId);
      await expect(failedForm.locator('[name="projectId"]')).toHaveValue(assignment.projectId);
      await expect(failedForm.locator('[name="currency"]')).toHaveValue(assignment.currency);
      await expect(failedForm.locator('#finance-comp-rate')).toHaveValue('12.34');
      await expect(failedForm.locator('[name="rateMinor"]')).toHaveValue('1234');
      await expect(failedForm.locator('[name="effectiveFrom"]')).toHaveValue(
        assignment.effectiveFrom,
      );
      await expect(failedForm.locator('[name="projectId"]')).toBeFocused();
      await expect
        .poll(() =>
          failedForm.locator('[name="projectId"]').evaluate((element) => {
            const box = element.getBoundingClientRect();
            return box.top >= -2 && box.bottom <= window.innerHeight + 2;
          }),
        )
        .toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(
        Math.min(scrollBefore, 1),
      );
      expect(ruleCount(assignment.projectId, assignment.workerId)).toBe(beforeCount);
      expect(runtimeErrors).toEqual([]);

      // Capture only the synthetic notice, never the worker selector or form values.
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(
        join(evidenceDirectory, `${viewport}.png`),
        await notice.locator('[data-ui="problem-notice"]').screenshot(),
      );
      writeFileSync(
        join(evidenceDirectory, `${viewport}.json`),
        `${JSON.stringify(
          {
            viewport,
            role: 'finance',
            locale: 'es',
            responseStatus: response.status(),
            code: 'FINANCE_RULE_ASSIGNMENT_UNAVAILABLE',
            translatedCause: true,
            translatedRemedy: true,
            retainedWorkerProjectRateAndDate: true,
            focusedProjectFieldVisible: true,
            ruleRowsAdded: ruleCount(assignment.projectId, assignment.workerId) - beforeCount,
            runtimeErrors,
            screenshot: `${viewport}.png`,
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      setAssignmentStatus(assignment.id, 'active');
    }
  });
}
