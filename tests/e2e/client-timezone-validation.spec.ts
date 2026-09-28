import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const evidenceDir = join(process.cwd(), 'docs/evidence/error-warning-candidate/client-timezone');

for (const role of ['owner', 'finance'] as const) {
  test(`${role} corrects a rejected client timezone without losing the form`, async ({
    page,
  }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(90_000);

    const name = `QA timezone ${role} ${info.project.name} ${randomUUID().slice(0, 8)}`;
    const clientCode = `QA-TZ-${randomUUID().slice(0, 12)}`;
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const count = () =>
      (
        database.prepare('SELECT COUNT(*) AS count FROM client WHERE legal_name=?').get(name) as {
          count: number;
        }
      ).count;
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const httpErrors: { status: number; path: string }[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
    });

    try {
      expect(count()).toBe(0);
      await signIn(page, role);
      await page.goto(portal('/projects?lang=en&action=new-client'));
      const form = page.locator(
        '[data-project-workflow="new-client"] form[action="?/createClient"]',
      );
      await expect(form).toBeVisible();
      await form.locator('[name="legalName"]').fill(name);
      await form.locator('[name="displayName"]').fill(name);
      await form.locator('[name="clientCode"]').fill(clientCode);
      await form.locator('[name="currency"]').selectOption('EUR');
      await form.locator('[name="timezone"]').fill('Invalid/QA');
      await form.locator('[name="billingEmail"]').fill('qa-timezone@example.test');
      await form.locator('[name="billingAddress"]').fill('QA address, Madrid, Spain');
      await form.locator('[name="paymentTermsDays"]').fill('45');
      await form.locator('[name="notes"]').fill('Disposable browser validation record');

      const rejected = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('/createClient'),
      );
      await form.getByRole('button', { name: 'Create client' }).click();
      const rejectedResponse = await rejected;
      expect(rejectedResponse.status()).toBe(400);
      expect(await rejectedResponse.text()).toContain('CLIENT_TIMEZONE_INVALID');
      const notice = page.locator('[data-problem-code="CLIENT_TIMEZONE_INVALID"]');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('Enter a valid time zone');
      await expect(form.locator('[name="timezone"]')).toHaveValue('Invalid/QA');
      await expect(form.locator('[name="timezone"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.locator('[name="legalName"]')).toHaveValue(name);
      await expect(form.locator('[name="displayName"]')).toHaveValue(name);
      await expect(form.locator('[name="clientCode"]')).toHaveValue(clientCode);
      await expect(form.locator('[name="currency"]')).toHaveValue('EUR');
      await expect(form.locator('[name="billingEmail"]')).toHaveValue('qa-timezone@example.test');
      await expect(form.locator('[name="billingAddress"]')).toHaveValue(
        'QA address, Madrid, Spain',
      );
      await expect(form.locator('[name="paymentTermsDays"]')).toHaveValue('45');
      await expect(form.locator('[name="notes"]')).toHaveValue(
        'Disposable browser validation record',
      );
      const summary = form.locator('[data-validation-summary]');
      await expect(summary).toBeVisible();
      await expect(summary).toBeFocused();
      await expect
        .poll(() =>
          summary.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
          }),
        )
        .toBe(true);
      await expect(summary).toContainText('Timezone');
      await expect(form.locator('[data-field-error-for]')).toContainText('valid time zone');
      expect(count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(pageErrors).toEqual([]);
      expect(
        httpErrors.filter(
          ({ status, path }) =>
            !(status === 503 && path === '/j-aautomation/app/api/offline/identity') &&
            !(status === 400 && path === '/j-aautomation/app/projects'),
        ),
      ).toEqual([]);
      expect(
        consoleErrors.filter(
          (line) =>
            !/^Failed to load resource: the server responded with a status of (?:400 \(Bad Request\)|503 \(Service Unavailable\))$/u.test(
              line,
            ),
        ),
      ).toEqual([]);

      mkdirSync(evidenceDir, { recursive: true });
      const prefix = `${role}-${info.project.name}`;
      await page.screenshot({ path: join(evidenceDir, `${prefix}-invalid.png`) });
      writeFileSync(
        join(evidenceDir, `${prefix}-network.json`),
        JSON.stringify(
          {
            role,
            viewport: info.project.name,
            rejectedStatus: rejectedResponse.status(),
            rejectedCode: 'CLIENT_TIMEZONE_INVALID',
            fieldError: 'timezone',
            focused: 'validation summary',
            clientRowsAfterReject: count(),
            pageErrors: pageErrors.length,
            consoleErrors: consoleErrors.length,
            expectedOfflineIdentity503: httpErrors.filter(
              ({ status, path }) =>
                status === 503 && path === '/j-aautomation/app/api/offline/identity',
            ).length,
          },
          null,
          2,
        ) + '\n',
      );

      await form.locator('[name="timezone"]').fill('Europe/Madrid');
      const accepted = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('/createClient'),
      );
      await form.getByRole('button', { name: 'Create client' }).click();
      const acceptedResponse = await accepted;
      expect(acceptedResponse.status()).toBe(200);
      await expect(page.locator('[data-ui="toast"][data-variant="success"]')).toBeVisible();
      expect(count()).toBe(1);
      const saved = database
        .prepare('SELECT timezone FROM client WHERE legal_name=?')
        .get(name) as { timezone: string };
      expect(saved.timezone).toBe('Europe/Madrid');
      expect(pageErrors).toEqual([]);
      expect(
        httpErrors.filter(
          ({ status, path }) =>
            !(status === 503 && path === '/j-aautomation/app/api/offline/identity') &&
            !(status === 400 && path === '/j-aautomation/app/projects'),
        ),
      ).toEqual([]);
    } finally {
      database.close();
    }
  });
}

test('owner sees a typed duplicate client-code conflict and keeps the second form', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);

  const clientCode = `QA-DUP-${randomUUID().slice(0, 12)}`;
  const firstName = `QA first code ${info.project.name} ${randomUUID().slice(0, 8)}`;
  const secondName = `QA second code ${info.project.name} ${randomUUID().slice(0, 8)}`;
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const countByCode = () =>
    (
      database
        .prepare('SELECT COUNT(*) AS count FROM client WHERE client_code=?')
        .get(clientCode) as {
        count: number;
      }
    ).count;
  const pageErrors: string[] = [];
  const httpErrors: { status: number; path: string }[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400)
      httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
  });

  try {
    expect(countByCode()).toBe(0);
    await signIn(page, 'owner');
    await page.goto(portal('/projects?lang=en&action=new-client'));
    const form = page.locator('[data-project-workflow="new-client"] form[action="?/createClient"]');
    const fillClient = async (name: string) => {
      await expect(form).toBeVisible();
      await form.locator('[name="legalName"]').fill(name);
      await form.locator('[name="displayName"]').fill(name);
      await form.locator('[name="clientCode"]').fill(clientCode);
      await form.locator('[name="currency"]').selectOption('EUR');
      await form.locator('[name="timezone"]').fill('Europe/Madrid');
      await form.locator('[name="billingEmail"]').fill('qa-duplicate@example.test');
      await form.locator('[name="billingAddress"]').fill('QA address, Madrid, Spain');
      await form.locator('[name="paymentTermsDays"]').fill('45');
      await form.locator('[name="notes"]').fill('Disposable duplicate-code check');
    };

    await fillClient(firstName);
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/createClient'),
    );
    await form.getByRole('button', { name: 'Create client' }).click();
    expect((await created).status()).toBe(200);
    expect(countByCode()).toBe(1);

    await page.goto(portal('/projects?lang=en&action=new-client'));
    await fillClient(secondName);
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/createClient'),
    );
    await form.getByRole('button', { name: 'Create client' }).click();
    const response = await rejected;
    const body = await response.text();
    expect(response.status()).toBe(409);
    expect(body).toContain('CLIENT_CODE_ALREADY_USED');
    expect(body).not.toContain('client_client_code_unique');
    const notice = page.locator('[data-problem-code="CLIENT_CODE_ALREADY_USED"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('already used');
    await expect(form.locator('[name="clientCode"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('[name="clientCode"]')).toHaveValue(clientCode);
    await expect(form.locator('[name="legalName"]')).toHaveValue(secondName);
    await expect(form.locator('[name="displayName"]')).toHaveValue(secondName);
    await expect(form.locator('[name="currency"]')).toHaveValue('EUR');
    await expect(form.locator('[name="timezone"]')).toHaveValue('Europe/Madrid');
    await expect(form.locator('[name="billingEmail"]')).toHaveValue('qa-duplicate@example.test');
    await expect(form.locator('[name="billingAddress"]')).toHaveValue('QA address, Madrid, Spain');
    await expect(form.locator('[name="paymentTermsDays"]')).toHaveValue('45');
    await expect(form.locator('[name="notes"]')).toHaveValue('Disposable duplicate-code check');
    await expect(form.locator('[data-field-error-for]')).toContainText('already used');
    const summary = form.locator('[data-validation-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    const viewport = await summary.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        scrollY,
        summaryInViewport:
          bounds.top >= 0 && bounds.top < innerHeight && bounds.bottom <= innerHeight,
      };
    });
    expect(viewport.summaryInViewport).toBe(true);
    expect(viewport.scrollY).toBeGreaterThan(0);
    expect(countByCode()).toBe(1);
    expect(pageErrors).toEqual([]);
    expect(
      httpErrors.filter(
        ({ status, path }) =>
          !(status === 503 && path === '/j-aautomation/app/api/offline/identity') &&
          !(status === 409 && path === '/j-aautomation/app/projects'),
      ),
    ).toEqual([]);

    mkdirSync(evidenceDir, { recursive: true });
    const prefix = `duplicate-owner-${info.project.name}`;
    await page.screenshot({ path: join(evidenceDir, `${prefix}.png`) });
    writeFileSync(
      join(evidenceDir, `${prefix}.json`),
      JSON.stringify(
        {
          role: 'owner',
          viewport: info.project.name,
          createStatus: 200,
          rejectedStatus: response.status(),
          code: 'CLIENT_CODE_ALREADY_USED',
          fieldError: 'clientCode',
          focused: 'validation summary',
          summaryInViewport: viewport.summaryInViewport,
          scrollAfterReject: viewport.scrollY,
          clientRowsWithCode: countByCode(),
          rawSqlExposed: body.includes('client_client_code_unique'),
          pageErrors: pageErrors.length,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    database.close();
  }
});
