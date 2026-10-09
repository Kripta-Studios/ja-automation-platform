import { expect, test, type Locator } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

async function centered(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const desired = scrollY + bounds.top + bounds.height / 2 - innerHeight / 2;
        const attainable = Math.max(
          0,
          Math.min(desired, document.documentElement.scrollHeight - innerHeight),
        );
        return Math.abs(scrollY - attainable);
      }),
    )
    .toBeLessThan(28);
}

test('project contact shows its details and links to its exact client record and authorized editor', async ({
  browser,
}, info) => {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const db = database.sqlite;
  try {
    const repository = new PortalRepository(db);
    const userId = (role: keyof typeof e2eCredentials) =>
      String(db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials[role].email)!.id);
    const owner = repository.principalFor(userId('owner'));
    const clientId = e2eLifecycleFixturesFor(info.project.name).client.id;
    const contact = repository.createClientContact(owner, {
      clientId,
      name: `Mayer ${info.project.name}`,
      phone: '+1 614 555 0123',
      email: 'mayer.onsite@example.test',
      role: 'Plant supervisor',
      company: 'Junkers Ohio',
      location: 'Ohio, Gate 3',
      notes: 'Call before arrival.\nMeet at the reception desk.',
      contactType: 'onsite',
      isPrimary: true,
    });
    const project = repository.createProject(owner, {
      clientId,
      name: `Onsite contact navigation ${info.project.name}`,
      costCenterCode: e2eCostCenter('QA-CONTACT', 93, info.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-01-01',
      projectManagerId: userId('manager'),
      onsiteContactId: contact.id,
    });
    expect(db.prepare('SELECT status FROM project WHERE id=?').get(project.id)?.status).toBe(
      'active',
    );
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: userId('worker'),
      startsOn: '2026-01-01',
    });
    let phone = '+1 614 555 0123';
    for (const role of ['owner', 'finance', 'manager', 'auditor'] as const) {
      const context = await browser.newContext({ viewport: info.project.use.viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await signIn(page, role);
        await page.goto(portal(`/projects/${project.id}?tab=overview&lang=en`));
        const details = page.locator('[data-project-site-contact]');
        for (const value of [
          'Plant supervisor',
          'Junkers Ohio',
          'Ohio, Gate 3',
          'mayer.onsite@example.test',
          phone,
          'Call before arrival.',
          'Meet at the reception desk.',
        ])
          await expect(details).toContainText(value);
        await expect(details.getByRole('link', { name: phone, exact: true })).toHaveAttribute(
          'href',
          `tel:${phone}`,
        );
        await expect(
          details.getByRole('link', { name: 'mayer.onsite@example.test' }),
        ).toHaveAttribute('href', 'mailto:mayer.onsite@example.test');
        const link = details.getByRole('link', { name: `Mayer ${info.project.name}`, exact: true });
        await expect(link).toHaveAttribute(
          'href',
          `/j-aautomation/app/projects?view=clients&client=${clientId}&lang=en#client-contact-${contact.id}`,
        );
        await details.scrollIntoViewIfNeeded();
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        for (const anchor of await details.locator('a').all())
          expect(
            await anchor.evaluate((element) => getComputedStyle(element).textDecorationLine),
          ).toContain('underline');
        for (const item of await details.locator('a,p').all()) {
          const box = await item.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
        }
        await page.screenshot({ path: info.outputPath(`site-contact-${role}.png`) });
        await link.click();
        const card = page.locator(`#client-contact-${contact.id}`);
        await centered(card);
        await expect(card).toContainText(`Mayer ${info.project.name}`);
        await expect(card).toContainText(phone);
        const canEdit = role === 'owner' || role === 'finance';
        await expect(card.getByRole('button', { name: 'Edit contact', exact: true })).toHaveCount(
          canEdit ? 1 : 0,
        );
        await page.goto(portal(`/projects/${project.id}?tab=overview&lang=en`));
        const editLink = page
          .locator('[data-project-site-contact]')
          .getByRole('link', { name: 'Edit contact', exact: true });
        await expect(editLink).toHaveCount(canEdit ? 1 : 0);
        if (canEdit) {
          await editLink.click();
          const editor = page.locator(`#client-contact-edit-${contact.id}`);
          await expect(editor).toBeVisible();
          await expect(editor.locator('[name="phone"]')).toHaveValue(phone);
          await expect(editor.locator('[name="name"]')).toBeInViewport();
          if (role === 'owner') {
            phone = '+1 614 555 0456';
            await editor.locator('[name="phone"]').fill(phone);
            await editor.getByRole('button', { name: 'Update contact', exact: true }).click();
            await expect(editor.locator('[name="phone"]')).toHaveValue(phone);
            await page.goto(portal(`/projects/${project.id}?tab=overview&lang=en`));
            await expect(page.locator('[data-project-site-contact]')).toContainText(phone);
          }
        }
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
    const context = await browser.newContext({ viewport: info.project.use.viewport });
    try {
      const page = await context.newPage();
      await signIn(page, 'worker');
      const response = await page.goto(portal(`/projects/${project.id}?tab=overview&lang=en`));
      const payload = await response!.text();
      expect(payload).not.toContain('mayer.onsite@example.test');
      expect(payload).not.toContain('Meet at the reception desk.');
      await expect(page.locator('[data-project-site-contact]')).toContainText('Not configured');
      await expect(page.locator('[data-project-site-contact] a')).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    db.close();
  }
});
