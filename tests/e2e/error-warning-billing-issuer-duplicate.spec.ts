import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const evidenceDir = join(e2eRoot, 'docs/evidence/error-warning-candidate/billing-issuer-duplicate');

async function decodeActionData(serialized: string): Promise<unknown> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => unknown;
  };
  return parse(serialized);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Owner duplicate invoice issuer keeps Spanish form context at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);

    const errors = watchErrors(page);
    const code = `QA-DUP-ISS-${randomUUID().slice(0, 8)}`.toUpperCase();
    const originalName = 'Disposable Original Issuer';
    const attemptedName = 'Disposable Duplicate Issuer';
    const attemptedAddress = 'Disposable address for conflict check';
    await signIn(page, 'owner');
    await page.goto(portal('/billing?view=setup&lang=es'));
    await page.locator('#billing-issuer-setup-action').click();

    let form = page.locator('form[action="?/createLegalEntity"]');
    await form.locator('[name="code"]').fill(code);
    await form.locator('[name="legalName"]').fill(originalName);
    await form.locator('[name="currency"]').selectOption('EUR');
    await form.locator('[name="billingAddress"]').fill('Disposable original address');
    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createLegalEntity'),
    );
    await form.locator('button[type="submit"]').click();
    expect((await firstResponse).status()).toBe(200);

    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    try {
      await expect
        .poll(
          () =>
            (
              db.prepare('SELECT COUNT(*) AS count FROM legal_entity WHERE code=?').get(code) as {
                count: number;
              }
            ).count,
        )
        .toBe(1);
      expect(
        db.prepare('SELECT legal_name FROM legal_entity WHERE code=?').get(code),
      ).toMatchObject({ legal_name: originalName });

      await page.goto(portal('/billing?view=setup&lang=es'));
      await page.locator('#billing-issuer-setup-action').click();
      form = page.locator('form[action="?/createLegalEntity"]');
      await form.locator('[name="code"]').fill(code);
      await form.locator('[name="legalName"]').fill(attemptedName);
      await form.locator('[name="currency"]').selectOption('EUR');
      await form.locator('[name="billingAddress"]').fill(attemptedAddress);
      const conflictResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/createLegalEntity'),
      );
      await form.locator('button[type="submit"]').click();
      const response = await conflictResponse;
      expect(response.status()).toBe(200);
      const envelope = (await response.json()) as { type: string; status: number; data: string };
      expect(envelope).toMatchObject({ type: 'failure', status: 409 });
      expect(await decodeActionData(envelope.data)).toMatchObject({
        code: 'BILLING_ISSUER_CODE_EXISTS',
        messageKey: 'problem.billing.issuerCodeExists',
        fieldErrors: { code: ['problem.billing.issuerCodeExists'] },
        remedies: [{ id: 'review_billing_setup' }],
        values: {
          code,
          legalName: attemptedName,
          currency: 'EUR',
          billingAddress: attemptedAddress,
        },
      });

      const notice = page.locator('[data-problem-code="BILLING_ISSUER_CODE_EXISTS"]');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('Ya hay una entidad emisora que usa este código');
      await expect(notice).not.toContainText('Legal entity code already exists');
      await expect(notice.getByRole('link')).toHaveAttribute('href', /view=setup/u);
      form = page.locator('form[action="?/createLegalEntity"]');
      const codeField = form.locator('[name="code"]');
      await expect(codeField).toHaveValue(code);
      await expect(codeField).toHaveAttribute('aria-invalid', 'true');
      await expect(codeField).toBeFocused();
      const codeFieldId = await codeField.getAttribute('id');
      const codeErrorId = await codeField.getAttribute('aria-describedby');
      expect(codeFieldId).toBeTruthy();
      expect(codeErrorId).toBeTruthy();
      const fieldError = form.locator(`[data-field-error-for="${codeFieldId}"]`);
      await expect(fieldError).toHaveAttribute('id', codeErrorId!);
      await expect(fieldError).toContainText('Ya hay una entidad emisora que usa este código');
      await expect(form.locator('[name="legalName"]')).toHaveValue(attemptedName);
      await expect(form.locator('[name="currency"]')).toHaveValue('EUR');
      await expect(form.locator('[name="billingAddress"]')).toHaveValue(attemptedAddress);
      const fieldBounds = await codeField.boundingBox();
      expect(fieldBounds).not.toBeNull();
      expect(fieldBounds!.y).toBeGreaterThanOrEqual(64);
      expect(fieldBounds!.y + fieldBounds!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height - 32,
      );
      expect(
        db.prepare('SELECT COUNT(*) AS count FROM legal_entity WHERE code=?').get(code),
      ).toMatchObject({ count: 1 });
      expect(
        db.prepare('SELECT legal_name FROM legal_entity WHERE code=?').get(code),
      ).toMatchObject({ legal_name: originalName });
      expect(errors).toEqual([]);

      mkdirSync(evidenceDir, { recursive: true });
      await notice.screenshot({ path: join(evidenceDir, `duplicate-${viewport}.png`) });
      writeFileSync(
        join(evidenceDir, `duplicate-${viewport}.json`),
        JSON.stringify(
          {
            viewport,
            locale: 'es',
            role: 'owner_admin',
            envelopeStatus: envelope.status,
            code: 'BILLING_ISSUER_CODE_EXISTS',
            field: 'code',
            remedy: 'review_billing_setup',
            retainedFields: ['code', 'legalName', 'currency', 'billingAddress'],
            focusedField: 'code',
            adjacentFieldErrorVisible: true,
            issuerRowsWithCode: 1,
            consoleErrors: 0,
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      db.close();
    }
  });
}
