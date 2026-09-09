import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

async function verifyForms(page: Page) {
  const controls = page.locator(
    'form:visible input:not([type=hidden]), form:visible select, form:visible textarea, form:visible button',
  );
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    if ((await control.evaluate((el) => el.tagName)) !== 'BUTTON') {
      expect(
        await control.evaluate((el) => Boolean(el.closest('label')?.textContent?.trim())),
      ).toBe(true);
    }
  }
}

test('Owner delegates installation; supplier adds technician and submits private operational hours', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  let supplierName = `Fornecedor ${randomUUID()}`;
  let existingSupplier = false;
  const technicianName = `Técnico ${randomUUID()}`;
  const note = `Installation verification ${randomUUID()}`;
  let ownerId: string;
  let coordinatorId: string;
  let externalId: string;
  let projectId: string;
  let projectName: string;
  let alternateProjectId: string;
  try {
    const user = (email: string) =>
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email)!.id as string;
    ownerId = user(e2eCredentials.owner.email);
    coordinatorId = user(e2eCredentials.worker.email);
    externalId = user(e2eCredentials.worker2.email);
    // Serial viewport scenarios share credential accounts. Keep their supplier identity
    // once canonical history exists, while each scenario uses new installations.
    const previousSupplier = db.sqlite
      .prepare(
        `SELECT s.name FROM supplier_user_profile_period p JOIN supplier s ON s.id=p.supplier_id
       WHERE p.user_id=? AND p.profile='external_technician' ORDER BY p.starts_at LIMIT 1`,
      )
      .get(externalId) as { name: string } | undefined;
    if (previousSupplier) {
      supplierName = previousSupplier.name;
      existingSupplier = true;
    }
    // Reset only this scenario's account capabilities between serial viewport runs.
    db.sqlite
      .prepare('DELETE FROM supplier_user_profile WHERE user_id IN (?,?)')
      .run(coordinatorId, externalId);
    const repository = new PortalRepository(db.sqlite);
    alternateProjectId = repository.createProject(repository.principalFor(ownerId), {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: `A alternate installation ${randomUUID()}`,
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      startDate: today,
      expectedMinutesPerDay: 480,
    }).id;
    projectName = `Supplier installation ${randomUUID()}`;
    projectId = repository.createProject(repository.principalFor(ownerId), {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: projectName,
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      startDate: today,
      expectedMinutesPerDay: 480,
    }).id;
  } finally {
    db.sqlite.close();
  }
  await signIn(page, 'owner');
  await page.goto(portal('/supplier?lang=en'));
  await verifyForms(page);
  await page.screenshot({ path: testInfo.outputPath('supplier-owner.png'), fullPage: false });
  const create = page.locator('form[action^="?/createSupplier"]');
  if (!existingSupplier) {
    await create.getByLabel('Name', { exact: true }).fill(supplierName);
    await create.getByRole('button').click();
    await expect(page.getByRole('status')).toHaveText('Changes saved.');
  }
  const profile = page.locator('form[action^="?/setProfile"]');
  await profile.locator('[name=userId]').selectOption(coordinatorId);
  await profile.locator('[name=supplierId]').selectOption({ label: supplierName });
  await profile.locator('[name=profile]').selectOption('supplier_coordinator');
  await profile.getByRole('button').click();
  await expect(page.getByRole('status')).toHaveText('Changes saved.');
  const grant = page.locator('form[action^="?/grant"]');
  await grant.locator('[name=supplierId]').selectOption({ label: supplierName });
  await grant.locator('[name=projectId]').selectOption(projectId);
  await grant.locator('[name=coordinatorId]').selectOption(coordinatorId);
  await grant.getByRole('button').click();
  await expect(page.getByRole('status')).toHaveText('Changes saved.');
  await grant.locator('[name=supplierId]').selectOption({ label: supplierName });
  await grant.locator('[name=projectId]').selectOption(alternateProjectId);
  await grant.locator('[name=coordinatorId]').selectOption(coordinatorId);
  await grant.getByRole('button').click();
  await expect(page.getByRole('status')).toHaveText('Changes saved.');
  // Existing login-enabled technician receives only operational capabilities.
  await profile.locator('[name=userId]').selectOption(externalId);
  await profile.locator('[name=supplierId]').selectOption({ label: supplierName });
  await profile.locator('[name=profile]').selectOption('external_technician');
  await profile.getByRole('button').click();
  await expect(page.getByRole('status')).toHaveText('Changes saved.');
  const assign = page.locator('form[action^="?/assignTechnician"]');
  await assign.locator('[name=workerId]').selectOption(externalId);
  await assign.locator('[name=projectId]').selectOption(projectId);
  await assign.getByRole('button').click();
  await expect(page.getByRole('status')).toHaveText('Changes saved.');
  const coordinatorContext = await browser.newContext({ viewport: page.viewportSize()! });
  const coordinator = await coordinatorContext.newPage();
  try {
    await signIn(coordinator, 'worker');
    await coordinatorContext.addCookies([
      { name: 'ja.portal.locale', value: 'pt', url: portal('') },
    ]);
    await coordinator.goto(portal(`/supplier?projectId=${projectId}`));
    await expect(
      coordinator.getByRole('heading', { name: 'Equipe do meu fornecedor' }),
    ).toBeVisible();
    await coordinator.goto(portal(`/supplier?projectId=${projectId}&lang=en`));
    await expect(coordinator.getByRole('heading', { name: 'My supplier team' })).toBeVisible();
    await expect(coordinator.locator('form[action^="?/setProfile"]')).toHaveCount(0);
    await verifyForms(coordinator);
    await coordinator.screenshot({
      path: testInfo.outputPath('supplier-team.png'),
      fullPage: false,
    });
    const add = coordinator.locator('form[action^="?/addTechnician"]');
    await add.getByLabel('Name', { exact: true }).fill(technicianName);
    await add.getByRole('button').click();
    await expect(coordinator.getByRole('status')).toHaveText('Changes saved.');
    const time = coordinator.locator('form[action^="?/createTime"]');
    await time.locator('[name=workerId]').selectOption({ label: technicianName });
    await time.getByLabel('Actual minutes').fill('120');
    await time.getByLabel('Work performed').fill(note);
    await time.getByRole('button').click();
    await expect(coordinator.getByRole('status')).toHaveText('Changes saved.');
    const entry = coordinator.locator('article').filter({ hasText: note });
    await entry.getByRole('button', { name: 'Submit to J&A' }).click();
    await expect(coordinator.locator('article').filter({ hasText: note })).toContainText(
      'Submitted',
    );
    await time.locator('[name=workerId]').selectOption(externalId);
    await time.getByLabel('Actual minutes').fill('30');
    await time.getByLabel('Work performed').fill(`External own record ${note}`);
    await time.getByRole('button').click();
    await expect(coordinator.getByRole('status')).toHaveText('Changes saved.');
    const persisted = createDatabase(readE2EFixturePointer().databasePath);
    let timeId: string;
    try {
      timeId = persisted.sqlite
        .prepare('SELECT id FROM time_entry WHERE activity_summary=?')
        .get(note)!.id as string;
    } finally {
      persisted.sqlite.close();
    }
    await page.goto(portal('/approvals'), { waitUntil: 'networkidle' });
    const approval = page.locator(`[data-approval-row="${timeId}"]`);
    await expect(approval).toContainText(technicianName);
    await approval
      .locator('form[action^="?/approveRecord"]')
      .getByRole('button', { name: 'Approve', exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: /decision recorded/i })).toBeVisible();
    // Direct URLs and forged Owner action remain forbidden for a live supplier session.
    for (const route of ['/pay', '/my-pay', '/expenses', '/api/worker-statement']) {
      const response = await coordinator.request.get(portal(route));
      expect(response.status()).toBe(403);
    }
    const forged = await coordinator.request.post(portal('/supplier?/setProfile'), {
      form: { userId: coordinatorId, profile: 'standard' },
      headers: { origin: new URL(portal('')).origin, accept: 'text/html' },
    });
    expect(forged.status()).toBe(403);
    await coordinator.goto(portal(`/supplier/report?projectId=${projectId}&lang=en`));
    await expect(coordinator.getByText(note, { exact: true })).toBeVisible();
    await expect(coordinator.getByText('Total actual minutes: 150')).toBeVisible();
    const printedReport = await coordinator.pdf({
      path: testInfo.outputPath('supplier-operational-report.pdf'),
      format: 'A4',
      printBackground: true,
    });
    expect(printedReport.subarray(0, 4).toString()).toBe('%PDF');
    const csv = await coordinator.request.get(
      portal(`/supplier/report.csv?projectId=${projectId}&lang=en`),
    );
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(note);
    expect(await csv.text()).toContain('Approved');
    expect(await csv.text()).not.toMatch(/rate_minor|payment|billability|currency|reimbursement/i);
    let coordinatorOwnTimeId: string;
    const snapshot = createDatabase(readE2EFixturePointer().databasePath);
    try {
      const row = snapshot.sqlite
        .prepare(
          'SELECT t.worker_id,r.recorded_by_user_id FROM time_entry t JOIN supplier_time_entry_recorder r ON r.time_entry_id=t.id WHERE t.activity_summary=?',
        )
        .get(note)!;
      const ownRepository = new PortalRepository(snapshot.sqlite);
      coordinatorOwnTimeId = ownRepository.createTimeEntry(
        ownRepository.principalFor(
          coordinatorId,
          String(
            snapshot.sqlite
              .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
              .get(coordinatorId)!.id,
          ),
        ),
        {
          projectId,
          workDate: today,
          category: 'work',
          minutes: 15,
          summary: `Coordinator own time ${note}`,
        },
      ).id;
      expect(row.recorded_by_user_id).toBe(coordinatorId);
      expect(row.worker_id).not.toBe(coordinatorId);
      expect(
        snapshot.sqlite.prepare('SELECT 1 FROM account WHERE user_id=?').get(row.worker_id),
      ).toBeUndefined();
    } finally {
      snapshot.sqlite.close();
    }
    expect((await coordinator.request.get(portal(`/time/${coordinatorOwnTimeId}`))).status()).toBe(
      200,
    );
    const externalContext = await browser.newContext({ viewport: page.viewportSize()! });
    try {
      const external = await externalContext.newPage();
      await signIn(external, 'worker2');
      await external.goto(portal(`/supplier/report?projectId=${projectId}&lang=en`));
      await expect(external.getByText(note, { exact: true })).toHaveCount(0);
      const detailDb = createDatabase(readE2EFixturePointer().databasePath);
      let ownId: string;
      try {
        ownId = detailDb.sqlite
          .prepare('SELECT id FROM time_entry WHERE activity_summary=?')
          .get(`External own record ${note}`)!.id as string;
      } finally {
        detailDb.sqlite.close();
      }
      for (const route of ['/time/__data.json', `/time/${ownId}/__data.json`]) {
        const response = await external.request.get(portal(route));
        expect(response.status()).toBe(200);
        expect(await response.text()).not.toMatch(
          /billability_state|invoice_id|client_rate_minor|compensation_amount_minor|internal_cost_minor/,
        );
      }
      await external.goto(portal(`/time/${ownId}?lang=en`));
      await expect(external.getByText('BILLABILITY', { exact: true })).toHaveCount(0);
      expect((await external.request.get(portal('/my-pay'))).status()).toBe(403);
    } finally {
      await externalContext.close();
    }
    await page.goto(portal(`/supplier?projectId=${projectId}&lang=en`));
    await page
      .locator('article')
      .filter({ hasText: supplierName })
      .filter({ hasText: projectName })
      .getByRole('button', { name: 'Revoke access' })
      .click();
    expect(
      (
        await coordinator.request.get(portal(`/supplier/report.csv?projectId=${projectId}`))
      ).status(),
    ).toBe(403);
    // Revocation also applies to the ordinary personal-time route, not just supplier APIs.
    expect((await coordinator.request.get(portal(`/time/${coordinatorOwnTimeId}`))).status()).toBe(
      404,
    );
    const ordinaryTime = await coordinator.request.get(portal('/time/__data.json'));
    expect(ordinaryTime.status()).toBe(200);
    expect(await ordinaryTime.text()).not.toContain(`Coordinator own time ${note}`);
    await coordinator.screenshot({
      path: testInfo.outputPath('supplier-report.png'),
      fullPage: false,
    });
  } finally {
    await coordinatorContext.close();
    // Shared login fixtures must retain their ordinary role for later locale/manual tests.
    // Keep the historical supplier periods and operational records as audit evidence.
    const cleanup = createDatabase(readE2EFixturePointer().databasePath);
    try {
      cleanup.sqlite
        .prepare('DELETE FROM supplier_user_profile WHERE user_id IN (?,?)')
        .run(coordinatorId, externalId);
    } finally {
      cleanup.sqlite.close();
    }
  }
});
