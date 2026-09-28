import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-billing-readiness-api');

async function selectWizardStep(sheet: Locator, index: number): Promise<void> {
  const desktopSteps = sheet.locator('.billing-section__wizard-progress');
  if (await desktopSteps.isVisible()) {
    await desktopSteps.locator('li').nth(index).getByRole('button').click();
    return;
  }
  const mobileSteps = sheet.locator('.billing-section__wizard-mobile-progress');
  if (!(await mobileSteps.evaluate((details: HTMLDetailsElement) => details.open)))
    await mobileSteps.locator('summary').click();
  await mobileSteps.locator('li').nth(index).getByRole('button').click();
}

test('readiness explains a billing stream disabled after the invoice wizard opened', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const role = info.project.name === 'desktop' ? 'finance' : 'owner';
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });

  await signIn(page, role);
  await page.goto(portal(`/billing?lang=${locale}`));
  await page.getByRole('button', { name: /Create invoice|Crear factura/u }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await expect(sheet).toBeVisible();
  const ruleId = await sheet
    .getByRole('combobox', { name: /Project and billing stream|Proyecto y flujo de facturación/u })
    .inputValue();
  expect(ruleId).toBeTruthy();
  await selectWizardStep(sheet, 3);
  const periodStart = sheet.getByLabel(/Period start|Inicio del periodo/u);
  const periodEnd = sheet.getByLabel(/Period end|Fin del periodo/u);
  await periodStart.fill('2026-10-01');
  await periodEnd.fill('2026-10-31');
  const sheetBody = sheet.locator('.responsive-sheet-body');
  const scrollBefore = await sheetBody.evaluate((element) => element.scrollTop);

  // This disposable database change models a different user disabling the stream
  // while the first user's wizard and manually chosen dates remain open.
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const rule = db.prepare('SELECT enabled FROM billing_rule WHERE id=?').get(ruleId) as
      | { enabled: number }
      | undefined;
    expect(rule?.enabled).toBe(1);
    db.prepare('UPDATE billing_rule SET enabled=0 WHERE id=?').run(ruleId);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/billing/readiness') &&
        response.url().includes(`billingRuleId=${encodeURIComponent(ruleId)}`),
    );
    await sheet
      .getByRole('button', { name: /Check selected period|Comprobar periodo seleccionado/u })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(409);
    const requested = new URL(response.url());
    expect(requested.searchParams.get('periodStart')).toBe('2026-10-01');
    expect(requested.searchParams.get('periodEnd')).toBe('2026-10-31');
    const problem = (await response.json()) as {
      success: boolean;
      code: string;
      messageKey: string;
      remedies: Array<{ id: string }>;
      correlationId: string;
    };
    expect(problem).toMatchObject({
      success: false,
      code: 'BILLING_READINESS_STREAM_UNAVAILABLE',
      messageKey: 'problem.billing.readinessStreamUnavailable',
      remedies: [{ id: 'review_billing_setup' }],
    });
    expect(problem.correlationId).toMatch(/^[0-9a-f-]{36}$/u);

    const notice = sheet.locator('[data-billing-readiness-problem]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      locale === 'es'
        ? 'Esta línea de facturación ya no está disponible'
        : 'This billing stream is no longer available',
    );
    await expect(
      notice.getByRole('link', {
        name: /Review billing setup|Revisar la configuración de facturación/u,
      }),
    ).toHaveAttribute('href', /\/app\/billing\?view=setup$/u);
    await expect(notice).toBeFocused();
    await expect(periodStart).toHaveValue('2026-10-01');
    await expect(periodEnd).toHaveValue('2026-10-31');
    if (info.project.name === 'phone-390') {
      await expect(sheet.locator('.billing-section__wizard-mobile-progress summary')).toContainText(
        '4/12 · Period',
      );
    } else {
      await expect(
        sheet.locator('.billing-section__wizard-progress li[aria-current="step"]'),
      ).toContainText('Periodo');
    }
    expect(
      Math.abs((await sheetBody.evaluate((element) => element.scrollTop)) - scrollBefore),
    ).toBeLessThanOrEqual(120);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    mkdirSync(evidenceDirectory, { recursive: true });
    const name = `stale-stream-${info.project.name}-${locale}`;
    writeFileSync(join(evidenceDirectory, `${name}.png`), await notice.screenshot());
    writeFileSync(
      join(evidenceDirectory, `${name}-trace.json`),
      `${JSON.stringify({ role, locale, viewport: info.project.name, status: response.status(), code: problem.code, messageKey: problem.messageKey, remedy: problem.remedies[0]?.id, retainedDates: true, focusOnNotice: await notice.evaluate((element) => document.activeElement === element), pageErrors, consoleErrors }, null, 2)}\n`,
    );
  } finally {
    db.prepare('UPDATE billing_rule SET enabled=1 WHERE id=?').run(ruleId);
    db.close();
  }
});
