import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type Source = {
  id: string;
  projectId: string;
  projectName: string;
  projectCurrency: string;
  workerId: string;
  workerName: string;
  workDate: string;
};

type RuleEnd = { id: string; effectiveTo: string | null };

function sourceFixture(db: DatabaseSync): { source: Source; otherSource: Source } {
  const sources = db
    .prepare(
      `SELECT te.id, te.project_id AS projectId, p.name AS projectName,
              p.currency AS projectCurrency,
              te.worker_id AS workerId,
              te.work_date AS workDate, u.name AS workerName
         FROM time_entry te
         JOIN user u ON u.id=te.worker_id
         JOIN project p ON p.id=te.project_id
        WHERE te.approval_state='approved' AND te.finance_approved_at IS NOT NULL
          AND u.status='active' AND p.status='active'
          AND EXISTS(SELECT 1 FROM internal_cost_rule r WHERE r.worker_id=te.worker_id)
          AND EXISTS(SELECT 1 FROM compensation_rule r WHERE r.worker_id=te.worker_id)
        ORDER BY CASE WHEN p.currency <> 'USD' THEN 0 ELSE 1 END,
                 te.project_id, te.worker_id, te.work_date, te.id`,
    )
    .all() as Source[];
  const source = sources[0];
  const otherSource = sources.find(
    (candidate) =>
      candidate.projectId !== source?.projectId && candidate.workerId !== source?.workerId,
  );
  if (!source || !otherSource) throw new Error('Projection review needs sources on two projects');
  return { source, otherSource };
}

test('finance projection warning identifies the source and preselects only its project worker/date', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const databasePath = readE2EFixturePointer().databasePath;
  const db = new DatabaseSync(databasePath);
  const { source, otherSource } = sourceFixture(db);
  const costEnds = db
    .prepare('SELECT id,effective_to AS effectiveTo FROM internal_cost_rule WHERE worker_id=?')
    .all(source.workerId) as RuleEnd[];
  const compensationEnds = db
    .prepare('SELECT id,effective_to AS effectiveTo FROM compensation_rule WHERE worker_id=?')
    .all(source.workerId) as RuleEnd[];
  db.prepare('UPDATE internal_cost_rule SET effective_to=? WHERE worker_id=?').run(
    '2025-12-31',
    source.workerId,
  );
  db.prepare('UPDATE compensation_rule SET effective_to=? WHERE worker_id=?').run(
    '2025-12-31',
    source.workerId,
  );
  db.close();

  try {
    await signIn(page, 'finance');
    await page.goto(portal(`/finance?view=economic&project=${source.projectId}&lang=en`));
    const warning = page.locator('[data-finance-projection-warning]');
    const sourceReasons = warning.locator(`li[data-source-record-id="${source.id}"]`);
    const costReason = sourceReasons.filter({ hasText: 'Internal cost is missing' });
    const compensationReason = sourceReasons.filter({
      hasText: 'Worker compensation rule is missing',
    });
    await expect(costReason).toContainText(`Worker: ${source.workerName}`);
    await expect(costReason).toContainText(`Project: ${source.projectName}`);
    await expect(costReason).toContainText(`Work date: ${source.workDate}`);
    await expect(warning).not.toContainText(source.id);
    await expect(compensationReason).toContainText(`Worker: ${source.workerName}`);
    await expect(compensationReason).toContainText(`Work date: ${source.workDate}`);

    await page.goto(
      portal(
        `/projects/${source.projectId}/calculation?periodStart=${source.workDate}&periodEnd=${source.workDate}&lang=en`,
      ),
    );
    const calculationIssues = page.locator('.issues');
    await expect(calculationIssues).toContainText(source.workerName);
    await expect(
      calculationIssues
        .getByRole('link', {
          name: 'Open finance configuration: Internal loaded cost',
        })
        .first(),
    ).toBeVisible();
    await expect(
      calculationIssues
        .getByRole('link', {
          name: 'Open finance configuration: Worker compensation',
        })
        .first(),
    ).toBeVisible();
    await page.goto(portal(`/finance?view=economic&project=${source.projectId}&lang=en`));

    await costReason
      .getByRole('link', { name: 'Open finance configuration: Internal loaded cost' })
      .click();
    expect(new URL(page.url()).searchParams.get('project')).toBe(source.projectId);
    await expect(page.locator('#finance-configuration-task')).toHaveValue('Internal loaded cost');
    const costForm = page.locator('form[action*="?/createInternalCostRule"]');
    await expect(costForm.locator('[name="workerId"]')).toHaveValue(source.workerId);
    await expect(costForm.locator('[name="currency"]')).toHaveValue(source.projectCurrency);
    await expect(costForm.locator('[name="effectiveFrom"]')).toHaveValue(source.workDate);

    await page.goto(
      portal(
        `/finance?view=commercial&project=${source.projectId}&task=Worker%20compensation&sourceRecord=${otherSource.id}&lang=en`,
      ),
    );
    const otherProjectForm = page.locator('form[action*="?/createCompensationRule"]');
    await expect(otherProjectForm.locator('[name="workerId"]')).toHaveValue('');
    await expect(otherProjectForm.locator('[name="effectiveFrom"]')).toHaveValue('');

    await page.goto(portal(`/finance?view=economic&project=${source.projectId}&lang=en`));
    await sourceReasons
      .filter({ hasText: 'Worker compensation rule is missing' })
      .getByRole('link', { name: 'Open finance configuration: Worker compensation' })
      .click();
    await expect(page.locator('#finance-configuration-task')).toHaveValue('Worker compensation');
    const compensationForm = page.locator('form[action*="?/createCompensationRule"]');
    await expect(compensationForm.locator('[name="workerId"]')).toHaveValue(source.workerId);
    await expect(compensationForm.locator('[name="currency"]')).toHaveValue(source.projectCurrency);
    await expect(compensationForm.locator('[name="effectiveFrom"]')).toHaveValue(source.workDate);

    await page.goto(
      portal(
        `/finance?view=commercial&project=${source.projectId}&task=Client%20labor%20rate&sourceRecord=${source.id}&lang=en`,
      ),
    );
    const clientRateForm = page.locator('form[action*="?/createClientLaborRate"]');
    await expect(clientRateForm.locator('[name="workerId"]')).toHaveValue(source.workerId);
    await expect(clientRateForm.locator('[name="currency"]')).toHaveValue(source.projectCurrency);
    await expect(clientRateForm.locator('[name="effectiveFrom"]')).toHaveValue(source.workDate);
  } finally {
    const restore = new DatabaseSync(databasePath);
    const restoreCost = restore.prepare('UPDATE internal_cost_rule SET effective_to=? WHERE id=?');
    const restoreCompensation = restore.prepare(
      'UPDATE compensation_rule SET effective_to=? WHERE id=?',
    );
    for (const rule of costEnds) restoreCost.run(rule.effectiveTo, rule.id);
    for (const rule of compensationEnds) restoreCompensation.run(rule.effectiveTo, rule.id);
    restore.close();
  }
});

test('provisional project pay rules remain visible with worker and dates in each finance language', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const databasePath = readE2EFixturePointer().databasePath;
  const db = new DatabaseSync(databasePath);
  const rule = db
    .prepare(
      `SELECT cr.id, cr.project_id AS projectId, cr.effective_from AS effectiveFrom,
              cr.effective_to AS effectiveTo, cr.notes, u.name AS workerName
         FROM compensation_rule cr
         JOIN project p ON p.id=cr.project_id
         JOIN user u ON u.id=cr.worker_id
        WHERE p.status='active' AND u.status='active'
        ORDER BY cr.effective_from DESC LIMIT 1`,
    )
    .get() as
    | {
        id: string;
        projectId: string;
        effectiveFrom: string;
        effectiveTo: string | null;
        notes: string | null;
        workerName: string;
      }
    | undefined;
  if (!rule) throw new Error('Provisional rule warning needs a project pay rule');
  const otherProject = db
    .prepare('SELECT id FROM project WHERE id<>? AND status=? ORDER BY id LIMIT 1')
    .get(rule.projectId, 'active') as { id: string } | undefined;
  if (!otherProject) throw new Error('Provisional warning needs another active project');
  db.prepare('UPDATE compensation_rule SET notes=? WHERE id=?').run(
    'Owner-requested provisional estimate; confirm actual rate before final finance review.',
    rule.id,
  );
  db.close();

  try {
    await signIn(page, 'finance');
    for (const [locale, title] of [
      ['en', 'Provisional finance rates need confirmation'],
      ['es', 'Las tarifas financieras provisionales requieren confirmación'],
      ['pt', 'As taxas financeiras provisórias precisam de confirmação'],
    ] as const) {
      await page.goto(portal(`/finance?view=economic&project=${rule.projectId}&lang=${locale}`));
      const warning = page.locator('[data-provisional-finance-warning]');
      await expect(warning).toContainText(title);
      await expect(warning).toContainText(rule.workerName);
      await expect(warning).toContainText(rule.effectiveFrom);
      if (rule.effectiveTo) await expect(warning).toContainText(rule.effectiveTo);
      await expect(warning.getByRole('link')).toHaveCount(1);
    }
    await page.goto(portal(`/finance?view=economic&project=${otherProject.id}&lang=en`));
    await expect(page.locator('[data-provisional-finance-warning]')).toHaveCount(0);

    const workerContext = await browser.newContext();
    try {
      const workerPage = await workerContext.newPage();
      await signIn(workerPage, 'worker');
      await workerPage.goto(portal(`/finance?view=economic&project=${rule.projectId}&lang=en`));
      await expect(workerPage.locator('[data-provisional-finance-warning]')).toHaveCount(0);
    } finally {
      await workerContext.close();
    }
  } finally {
    const restore = new DatabaseSync(databasePath);
    restore.prepare('UPDATE compensation_rule SET notes=? WHERE id=?').run(rule.notes, rule.id);
    restore.close();
  }
});
