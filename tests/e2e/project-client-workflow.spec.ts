import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('project stores optional site contact, its own currency and client actual-work calendar', async ({
  page,
}, info) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?lang=en'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    const clientId = await form
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!clientId) throw new Error('Client fixture required');
    const client = db.prepare('SELECT currency FROM client WHERE id=?').get(clientId) as {
      currency: string;
    };
    await form.locator('[name="clientId"]').selectOption(clientId);
    await expect(form.locator('[name="currency"]')).toHaveValue(client.currency);
    const currency = client.currency === 'USD' ? 'EUR' : 'USD';
    await form.locator('[name="currency"]').selectOption(currency);
    const name = `Onsite workflow ${info.project.name} ${randomUUID()}`;
    await form.locator('[name="name"]').fill(name);
    await form.locator('[name="costCenterCode"]').fill(e2eCostCenter('CRM', 82, info.project.name));
    await form.locator('[name="startDate"]').fill('2026-10-01');
    await form.locator('[name="siteName"]').fill('Junkers Ohio');
    await form.locator('[name="siteLocation"]').fill('Ohio, Gate 3');
    await form.locator('[name="onsiteManager"]').fill('Onsite manager');
    await form.getByLabel('Create a new contact under this client', { exact: true }).check();
    await form.locator('[name="onsiteContactName"]').fill('Mayer');
    await form.locator('[name="onsiteContactRole"]').fill('Plant supervisor');
    const submit = form.getByRole('button', { name: 'Create project', exact: true });
    await submit.scrollIntoViewIfNeeded();
    expect(
      await submit.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === e || e.contains(hit);
      }),
    ).toBe(true);
    await submit.click();
    await expect(page).toHaveURL(/\/projects\/[^/?]+\?tab=work(?:&|$)/);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const project = db
      .prepare('SELECT id,currency,site_name,onsite_contact_id FROM project WHERE name=?')
      .get(name) as { id: string; currency: string; site_name: string; onsite_contact_id: string };
    expect(project).toMatchObject({ currency, site_name: 'Junkers Ohio' });
    expect(
      db
        .prepare('SELECT client_id,name,role FROM client_contact WHERE id=?')
        .get(project.onsite_contact_id),
    ).toMatchObject({ client_id: clientId, name: 'Mayer', role: 'Plant supervisor' });
    expect(db.prepare('SELECT currency FROM client WHERE id=?').get(clientId)).toEqual(client);
    await page.goto(portal(`/projects/${project.id}?lang=en`));
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(page.getByText('Ohio, Gate 3', { exact: true })).toBeVisible();
    await expect(page.getByText('Mayer', { exact: true })).toBeVisible();
    const worker = db
      .prepare(
        "SELECT id,name FROM user WHERE role='worker' AND status='active' ORDER BY name LIMIT 1",
      )
      .get() as { id: string; name: string };
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      project.id,
      worker.id,
      '2026-10-15',
      'regular',
      360,
      'approved',
      'pending',
      now,
      now,
    );
    await page.goto(
      portal(`/projects?view=clients&calendarMonth=2026-10&lang=en&focus=${clientId}`),
    );
    const clientName = db
      .prepare('SELECT display_name,legal_name FROM client WHERE id=?')
      .get(clientId) as { display_name: string | null; legal_name: string };
    await page
      .locator('#client-directory-filters input')
      .fill(clientName.display_name || clientName.legal_name);
    const calendar = page.locator(`#client-work-calendar-${clientId}`);
    await calendar.scrollIntoViewIfNeeded();
    await calendar.locator('button').filter({ hasText: /^15\s/ }).click();
    await expect(calendar).toContainText(name);
    await expect(calendar).toContainText(worker.name);
    await expect(calendar).toContainText('6');
    const day = calendar.locator('button[aria-pressed="true"]');
    const box = await day.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  } finally {
    db.close();
  }
});

test('project and worker filters remain reachable in expenses and reports', async ({ page }) => {
  await signIn(page, 'owner');
  for (const route of ['/expenses?lang=en', '/reports?lang=en']) {
    await page.goto(portal(route));
    const filters = page.locator(
      route.startsWith('/expenses') ? '#expense-register-filters' : '.report-register-filters',
    );
    await expect(filters.locator('select[name="project"]')).toBeVisible();
    await expect(filters.locator('select[name="worker"]')).toBeVisible();
    for (const input of await filters
      .locator('select[name="project"],select[name="worker"]')
      .all()) {
      const box = await input.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  }
});
