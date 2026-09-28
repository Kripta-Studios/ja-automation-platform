import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { PortalRepository } from '@ja/database';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

for (const role of ['owner', 'finance'] as const) {
  test(`${role} sees the missing issuer cause and permitted remedy before saving a billing stream`, async ({
    page,
  }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(90_000);

    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    try {
      const activeBrlIssuers = db
        .prepare(
          "SELECT COUNT(*) AS count FROM legal_entity WHERE currency='BRL' AND status='active'",
        )
        .get() as { count: number };
      expect(activeBrlIssuers.count).toBe(0);

      const repository = new PortalRepository(db);
      const ownerRow = db
        .prepare("SELECT id FROM user WHERE email='owner@demo.jaautomation.test'")
        .get() as { id: string } | undefined;
      if (!ownerRow) throw new Error('Owner fixture is required');
      const owner = repository.principalFor(ownerRow.id);
      const name = `Issuer missing ${role} ${info.project.name} ${randomUUID()}`;
      const client = repository.createClient(owner, {
        legalName: name,
        displayName: name,
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        billingEmail: 'billing@example.test',
        billingAddress: 'Disposable test address',
      });
      const project = repository.createProject(owner, {
        clientId: client.id,
        name,
        costCenterCode: e2eCostCenter(
          'QA-ISSUER-EMPTY',
          14,
          info.project.name,
          role === 'owner' ? 1 : 2,
        ),
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
        billingModel: 'tm',
        startDate: '2026-01-01',
      });

      const pageErrors: string[] = [];
      const posts: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/createBillingRule'))
          posts.push(request.url());
      });
      await signIn(page, role);
      await page.goto(portal('/billing?view=setup&lang=en'));
      const form = page.locator('form[action="?/createBillingRule"]');
      await expect(form).toBeVisible();
      await form.locator('[name="projectId"]').selectOption(project.id);
      await form.locator('[name="effectiveFrom"]').fill('2026-10-01');
      await form.locator('[name="recipientEmail"]').fill('qa-billing@example.test');

      const notice = page.locator(
        '[data-problem-code="BILLING_SETUP_NO_ACTIVE_ISSUER_FOR_CURRENCY"]',
      );
      await expect(notice).toHaveAttribute('role', 'alert');
      await expect(notice).toContainText(name);
      await expect(notice).toContainText('BRL');
      await expect(notice).toContainText('An owner must configure an active issuer');
      const issuer = form.locator('[name="legalEntityId"]');
      await expect(issuer.locator('option')).toHaveCount(1);
      await expect(issuer).toHaveAttribute('aria-describedby', 'billing-issuer-unavailable');
      if (role === 'owner') {
        await expect(notice.getByRole('link', { name: 'New invoice issuer' })).toHaveAttribute(
          'href',
          '#billing-issuer-setup-action',
        );
      } else {
        await expect(notice).toContainText('Contact an owner');
        await expect(notice.getByRole('link')).toHaveCount(0);
        await expect(page.locator('#billing-issuer-setup-action')).toBeDisabled();
      }

      await form.getByRole('button', { name: 'Save billing stream' }).click();
      await expect(issuer).toBeFocused();
      await expect(form.locator('[name="projectId"]')).toHaveValue(project.id);
      await expect(form.locator('[name="effectiveFrom"]')).toHaveValue('2026-10-01');
      await expect(form.locator('[name="recipientEmail"]')).toHaveValue('qa-billing@example.test');
      expect(posts).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    } finally {
      db.close();
    }
  });
}
