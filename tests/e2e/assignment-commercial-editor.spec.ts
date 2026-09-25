import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('owner configures one assigned person’s separate customer, pay, and cost rules in Finance', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  test.setTimeout(120_000);
  const databasePath = readE2EFixturePointer().databasePath;
  const today = new Date().toISOString().slice(0, 10);
  const setup = createDatabase(databasePath);
  let projectId: string;
  let workerId: string;
  let assignmentId: string;
  let ownerId: string;
  try {
    const owner = setup.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.owner.email) as { id: string };
    const worker = setup.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.worker.email) as { id: string };
    ownerId = owner.id;
    workerId = worker.id;
    const repository = new PortalRepository(setup.sqlite);
    const principal = repository.principalFor(ownerId);
    projectId = repository.createProject(principal, {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: `Person commercial ${randomUUID()}`,
      costCenterCode: e2eCostCenter('PERSON', 1, testInfo.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    repository.assignWorker(principal, { projectId, workerId, startsOn: today });
    assignmentId = String(
      (
        setup.sqlite
          .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
          .get(projectId, workerId) as { id: string }
      ).id,
    );
  } finally {
    setup.sqlite.close();
  }

  await signIn(page, 'owner');
  const termsDb = createDatabase(databasePath);
  let clientId: string;
  let payId: string;
  let costId: string;
  try {
    const session = termsDb.sqlite
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(ownerId) as { id: string };
    const principal = new PortalRepository(termsDb.sqlite).principalFor(ownerId, session.id);
    const v3 = new V3Repository(termsDb.sqlite);
    clientId = v3.createClientLaborRate(principal, {
      projectId,
      workerId,
      currency: 'USD',
      hourlyRateMinor: 5_500n,
      effectiveFrom: today,
    }).id;
    payId = v3.createCompensationRule(principal, {
      projectId,
      workerId,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 3_000n,
      effectiveFrom: today,
    }).id;
    costId = v3.createInternalCostRule(principal, {
      projectId,
      workerId,
      currency: 'USD',
      hourlyRateMinor: 3_000n,
      effectiveFrom: today,
    }).id;
  } finally {
    termsDb.sqlite.close();
  }

  await page.goto(portal(`/finance?view=commercial&project=${projectId}`));
  const person = page.locator(`[data-commercial-person="${workerId}"]`);
  await expect(person).toBeVisible();
  await person.getByText('Configure this person').click();
  const references = person.locator('form[action*="setAssignmentCommercialRuleReferences"]');
  await references.locator('[name="clientBillRuleId"]').selectOption(clientId);
  await references.locator('[name="workerCompensationRuleId"]').selectOption(payId);
  await references.locator('[name="internalCostRuleId"]').selectOption(costId);
  await references.getByRole('button', { name: 'Save person rules' }).click();
  const check = createDatabase(databasePath);
  try {
    await expect
      .poll(() =>
        check.sqlite
          .prepare(
            'SELECT client_bill_rule_id,worker_compensation_rule_id,internal_cost_rule_id FROM project_member WHERE id=?',
          )
          .get(assignmentId),
      )
      .toMatchObject({
        client_bill_rule_id: clientId,
        worker_compensation_rule_id: payId,
        internal_cost_rule_id: costId,
      });
  } finally {
    check.sqlite.close();
  }
  await page.goto(portal(`/finance?view=commercial&project=${projectId}`));
  const saved = page.locator(`[data-commercial-person="${workerId}"]`);
  await saved.getByText('Configure this person').click();
  await expect(saved.locator('[name="clientBillRuleId"]')).toHaveValue(clientId);
  await expect(saved.locator('[name="workerCompensationRuleId"]')).toHaveValue(payId);
  await expect(saved.locator('[name="internalCostRuleId"]')).toHaveValue(costId);
  const fallback = saved.locator('form[action*="setAssignmentCommercialFallback"]');
  await fallback.locator('[name="allowGlobalCompensation"]').selectOption('yes');
  await fallback.locator('[name="allowGlobalInternalCost"]').selectOption('no');
  await fallback.getByRole('button', { name: 'Save fallback options' }).click();
  const flags = createDatabase(databasePath);
  try {
    await expect
      .poll(() =>
        flags.sqlite
          .prepare(
            'SELECT allow_global_compensation_fallback,allow_global_internal_cost_fallback FROM project_member WHERE id=?',
          )
          .get(assignmentId),
      )
      .toMatchObject({
        allow_global_compensation_fallback: 1,
        allow_global_internal_cost_fallback: 0,
      });
  } finally {
    flags.sqlite.close();
  }
});
