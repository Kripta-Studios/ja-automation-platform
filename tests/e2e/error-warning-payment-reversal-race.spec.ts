import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-payment-reversal');

async function decodeActionData(serialized: string): Promise<unknown> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => unknown;
  };
  return parse(serialized);
}

function seedSettlement(viewport: string) {
  const pointer = readE2EFixturePointer();
  const database = createDatabase(pointer.databasePath);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const workerId = userId(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Worker payment reversal race ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-WORKER-REVERSAL', 88, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
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
        reason: 'Activate disposable worker payment reversal project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: today });

    // A finalized compensation source is fixture setup. The actual payment and
    // both competing reversals below are made through the browser interface.
    const ruleId = randomUUID();
    const settlementId = randomUUID();
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        `INSERT INTO compensation_rule(
          id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,
          created_at,updated_at,rule_type
        ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(ruleId, workerId, projectId, 'USD', 1000, 'hourly', today, now, now, 'Hourly');
    database.sqlite
      .prepare(
        `INSERT INTO compensation_settlement(
          id,worker_id,project_id,compensation_rule_id,period_start,period_end,
          source_basis,source_amount_minor,percentage_bps,amount_minor,currency,
          state,settled_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        settlementId,
        workerId,
        projectId,
        ruleId,
        today,
        today,
        'APPROVED_TIME',
        1000,
        null,
        1000,
        'USD',
        'settled',
        now,
        now,
        now,
      );
    return { databasePath: pointer.databasePath, projectId, settlementId, today };
  } finally {
    database.sqlite.close();
  }
}

function paymentEvents(databasePath: string, settlementId: string) {
  const database = createDatabase(databasePath);
  try {
    return database.sqlite
      .prepare(
        `SELECT id,event_type,reverses_event_id,idempotency_key
           FROM worker_compensation_payment_event WHERE settlement_id=? ORDER BY created_at,id`,
      )
      .all(settlementId) as Array<{
      id: string;
      event_type: string;
      reverses_event_id: string | null;
      idempotency_key: string;
    }>;
  } finally {
    database.sqlite.close();
  }
}

function diagnostics(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function expectNoticeClearOfFixedUi(page: Page, notice: Locator): Promise<void> {
  const noticeBounds = await notice.boundingBox();
  expect(noticeBounds).not.toBeNull();
  for (const fixed of await page.locator('.bottom-nav, [data-ui="toast"]').all()) {
    const fixedBounds = await fixed.boundingBox();
    if (!fixedBounds) continue;
    const overlaps =
      noticeBounds!.x < fixedBounds.x + fixedBounds.width &&
      noticeBounds!.x + noticeBounds!.width > fixedBounds.x &&
      noticeBounds!.y < fixedBounds.y + fixedBounds.height &&
      noticeBounds!.y + noticeBounds!.height > fixedBounds.y;
    expect(overlaps).toBe(false);
  }
}

async function dismissUnrelatedToastsForEvidence(page: Page): Promise<void> {
  for (const dismiss of await page.locator('[data-ui="toast-region"] .ui-toast-dismiss').all())
    await dismiss.click();
  await expect(page.locator('[data-ui="toast-region"]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

for (const viewport of ['phone-390', 'desktop']) {
  test(`Worker reversal rejects a stale changed command and permits an exact retry at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    const locale = viewport === 'desktop' ? 'es' : 'en';
    const fixture = seedSettlement(viewport);
    const firstDiagnostics = diagnostics(page);
    await signIn(page, 'finance');
    const href = portal(
      `/finance?view=economic&source=settlements&project=${fixture.projectId}&lang=${locale}#worker-payments`,
    );
    await page.goto(href);
    const payment = page.locator('form[data-finance-action="recordCompensationPayment"]');
    await expect(payment).toBeVisible();
    await payment.locator('[name="amount"]').fill('5.00');
    await payment.locator('[name="paidOn"]').fill(fixture.today);
    await payment.locator('[name="reference"]').fill('DISPOSABLE-BANK-PAYMENT');
    await payment
      .getByRole('button', { name: /Register actual payment|Registrar pago real/i })
      .click();
    await expect
      .poll(() => paymentEvents(fixture.databasePath, fixture.settlementId).length)
      .toBe(1);
    const original = paymentEvents(fixture.databasePath, fixture.settlementId)[0]!;
    expect(original.event_type).toBe('payment');

    await page.goto(href);
    const stale = await page.context().newPage();
    const staleDiagnostics = diagnostics(stale);
    const retryTab = await page.context().newPage();
    const retryDiagnostics = diagnostics(retryTab);
    const nativeTab = await page.context().newPage();
    const nativeDiagnostics = diagnostics(nativeTab);
    try {
      await stale.goto(href);
      await retryTab.goto(href);
      await nativeTab.goto(href);
      const firstForm = page.locator('form[data-finance-action="reverseCompensationPayment"]');
      const staleForm = stale.locator('form[data-finance-action="reverseCompensationPayment"]');
      const retryForm = retryTab.locator('form[data-finance-action="reverseCompensationPayment"]');
      const nativeForm = nativeTab.locator(
        'form[data-finance-action="reverseCompensationPayment"]',
      );
      await expect(firstForm).toBeVisible();
      await expect(staleForm).toBeVisible();
      await expect(retryForm).toBeVisible();
      await expect(nativeForm).toBeVisible();
      const firstReason = 'Bank returned the transfer';
      const staleReason = 'Different correction after opening';
      const nativeReason = 'Native correction after opening';
      await firstForm.locator('[name="reversedOn"]').fill(fixture.today);
      await firstForm.locator('[name="reason"]').fill(firstReason);
      await staleForm.locator('[name="reversedOn"]').fill(fixture.today);
      await staleForm.locator('[name="reason"]').fill(staleReason);
      await retryForm.locator('[name="reversedOn"]').fill(fixture.today);
      await retryForm.locator('[name="reason"]').fill(firstReason);
      await nativeForm.locator('[name="reversedOn"]').fill(fixture.today);
      await nativeForm.locator('[name="reason"]').fill(nativeReason);
      const staleKey = await staleForm.locator('[name="idempotencyKey"]').inputValue();
      await expect(retryForm.locator('[name="idempotencyKey"]')).toHaveValue(staleKey);
      await expect(nativeForm.locator('[name="idempotencyKey"]')).toHaveValue(staleKey);
      await firstForm.getByRole('button', { name: /Reverse payment|Revertir pago/i }).click();
      await expect
        .poll(
          () =>
            paymentEvents(fixture.databasePath, fixture.settlementId).filter(
              (event) => event.event_type === 'reversal',
            ).length,
        )
        .toBe(1);

      const conflictResponse = stale.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('?/reverseCompensationPayment'),
      );
      await staleForm.getByRole('button', { name: /Reverse payment|Revertir pago/i }).click();
      const conflict = await conflictResponse;
      const conflictResult = (await conflict.json()) as { status: number; data: string };
      expect(new URL(conflict.url()).searchParams.get('project')).toBe(fixture.projectId);
      expect(new URL(conflict.url()).searchParams.get('lang')).toBe(locale);
      expect(conflictResult.status).toBe(409);
      expect(JSON.stringify(conflictResult)).toContain('WORKER_PAYMENT_REVERSAL_RETRY_CONFLICT');
      const notice = staleForm.locator('[data-finance-problem]');
      await expect(notice.locator('[data-problem-code]')).toHaveAttribute(
        'data-problem-code',
        'WORKER_PAYMENT_REVERSAL_RETRY_CONFLICT',
      );
      await expect(notice).toContainText(
        locale === 'es'
          ? 'Esta solicitud de reversión ya se usó para otro pago, fecha o motivo.'
          : 'This reversal request was already used for a different payment, date, or reason.',
      );
      const remedy = notice.getByRole('link', {
        name: locale === 'es' ? 'Revisar pagos a trabajadores' : 'Review worker payments',
      });
      await expect(remedy).toHaveAttribute('href', /source=settlements.*#worker-payments$/);
      await expect(staleForm.locator('[name="reversedOn"]')).toHaveValue(fixture.today);
      await expect(staleForm.locator('[name="reason"]')).toHaveValue(staleReason);
      await expect(staleForm.locator('[name="idempotencyKey"]')).toHaveValue(staleKey);
      await expect(notice).toBeFocused();
      expect(
        await notice.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return bounds.top >= -2 && bounds.bottom <= window.innerHeight + 2;
        }),
      ).toBe(true);
      expect(new URL(stale.url()).searchParams.get('source')).toBe('settlements');
      expect(new URL(stale.url()).searchParams.get('project')).toBe(fixture.projectId);
      expect(new URL(stale.url()).searchParams.get('lang')).toBe(locale);
      expect(paymentEvents(fixture.databasePath, fixture.settlementId)).toHaveLength(2);

      await expectNoticeClearOfFixedUi(stale, notice);
      await dismissUnrelatedToastsForEvidence(stale);
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(
        join(evidenceDirectory, `changed-retry-${viewport}.png`),
        await notice.screenshot(),
      );

      // HTMLFormElement.submit bypasses SvelteKit enhancement and proves the
      // same typed recovery survives a full document POST/navigation.
      const nativeResponse = nativeTab.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('?/reverseCompensationPayment'),
      );
      await nativeForm.evaluate((form: HTMLFormElement) => form.submit());
      const nativeConflict = await nativeResponse;
      expect(nativeConflict.status()).toBe(409);
      expect(nativeConflict.headers()['content-type']).toContain('text/html');
      await nativeTab.waitForLoadState('domcontentloaded');
      const nativeUrl = new URL(nativeTab.url());
      expect(nativeUrl.searchParams.get('source')).toBe('settlements');
      expect(nativeUrl.searchParams.get('project')).toBe(fixture.projectId);
      expect(nativeUrl.searchParams.get('lang')).toBe(locale);
      const nativeNotice = nativeForm.locator('[data-finance-problem]');
      await expect(nativeNotice.locator('[data-problem-code]')).toHaveAttribute(
        'data-problem-code',
        'WORKER_PAYMENT_REVERSAL_RETRY_CONFLICT',
      );
      await expect(nativeNotice).toContainText(
        locale === 'es'
          ? 'Esta solicitud de reversión ya se usó para otro pago, fecha o motivo.'
          : 'This reversal request was already used for a different payment, date, or reason.',
      );
      await expect(
        nativeNotice.getByRole('link', {
          name: locale === 'es' ? 'Revisar pagos a trabajadores' : 'Review worker payments',
        }),
      ).toHaveAttribute('href', /source=settlements.*#worker-payments$/);
      await expect(nativeForm.locator('[name="reversedOn"]')).toHaveValue(fixture.today);
      await expect(nativeForm.locator('[name="reason"]')).toHaveValue(nativeReason);
      await expect(nativeForm.locator('[name="idempotencyKey"]')).toHaveValue(staleKey);
      await expect(nativeNotice).toBeFocused();
      expect(
        await nativeNotice.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return bounds.top >= -2 && bounds.bottom <= window.innerHeight + 2;
        }),
      ).toBe(true);
      expect(paymentEvents(fixture.databasePath, fixture.settlementId)).toHaveLength(2);
      await expectNoticeClearOfFixedUi(nativeTab, nativeNotice);
      await dismissUnrelatedToastsForEvidence(nativeTab);
      writeFileSync(
        join(evidenceDirectory, `native-changed-retry-${viewport}.png`),
        await nativeNotice.screenshot(),
      );

      const retryResponse = retryTab.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('?/reverseCompensationPayment'),
      );
      await retryForm.getByRole('button', { name: /Reverse payment|Revertir pago/i }).click();
      const retry = (await (await retryResponse).json()) as { type: string; data: string };
      expect(retry.type).toBe('success');
      expect(await decodeActionData(retry.data)).toMatchObject({
        success: true,
        messageKey: 'action.finance.compensationPaymentReversalAlreadyRecorded',
        messageParams: { idempotent: true },
      });
      expect(paymentEvents(fixture.databasePath, fixture.settlementId)).toHaveLength(2);
      writeFileSync(
        join(evidenceDirectory, `changed-retry-${viewport}-trace.json`),
        `${JSON.stringify(
          {
            viewport,
            locale,
            paymentCreatedInBrowser: true,
            staleConflict: 409,
            nativeConflict: 409,
            typedCode: 'WORKER_PAYMENT_REVERSAL_RETRY_CONFLICT',
            dateRetained: true,
            reasonRetained: true,
            focusAndVisibility: true,
            exactRetryIdempotent: true,
            reversalEvents: 1,
            consoleErrors:
              firstDiagnostics.consoleErrors.length +
              staleDiagnostics.consoleErrors.length +
              retryDiagnostics.consoleErrors.length +
              nativeDiagnostics.consoleErrors.length,
          },
          null,
          2,
        )}\n`,
      );
      expect(firstDiagnostics.pageErrors).toEqual([]);
      expect(firstDiagnostics.consoleErrors).toEqual([]);
      expect(staleDiagnostics.pageErrors).toEqual([]);
      expect(staleDiagnostics.consoleErrors).toEqual([]);
      expect(retryDiagnostics.pageErrors).toEqual([]);
      expect(retryDiagnostics.consoleErrors).toEqual([]);
      expect(nativeDiagnostics.pageErrors).toEqual([]);
      expect(nativeDiagnostics.consoleErrors).toEqual([]);
    } finally {
      await stale.close();
      await retryTab.close();
      await nativeTab.close();
    }
  });
}
