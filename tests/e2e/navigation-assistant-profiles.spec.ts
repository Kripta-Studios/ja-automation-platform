import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';
import { e2eFixtureToken, readE2EFixturePointer } from './environment.js';

type SupplierProfile = 'supplier_coordinator' | 'external_technician';
type ProfileRow = {
  supplier_id: string;
  profile: SupplierProfile;
  created_at: string;
  updated_at: string;
};

/**
 * Fixture-only permission projection, confined to this run's disposable database.
 * No periods, project grants, operational records or financial records are created.
 * The browser may only navigate/open forms; cleanup restores exactly worker2's
 * prior profile and deletes only the supplier row created by this test.
 * The assistant config uses one worker to avoid changing this shared persona
 * while another viewport is signed in.
 */
function installSupplierProfile(profile: SupplierProfile): () => void {
  const pointer = readE2EFixturePointer(undefined, { expectedToken: e2eFixtureToken });
  const db = new DatabaseSync(pointer.databasePath);
  const supplierId = randomUUID();
  let userId = '';
  let previous: ProfileRow | undefined;
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const worker = db
      .prepare("SELECT id FROM user WHERE email=? AND role='worker'")
      .get(e2eCredentials.worker2.email) as { id: string } | undefined;
    if (!worker) throw new Error('Disposable worker2 credential fixture is missing');
    userId = worker.id;
    previous = db
      .prepare(
        'SELECT supplier_id,profile,created_at,updated_at FROM supplier_user_profile WHERE user_id=?',
      )
      .get(userId) as ProfileRow | undefined;
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        "INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES(?,?,'active',?,?)",
      ).run(supplierId, `Navigation assistant profile fixture ${supplierId}`, now, now);
      db.prepare(
        `INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at)
        VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET supplier_id=excluded.supplier_id,
        profile=excluded.profile,created_at=excluded.created_at,updated_at=excluded.updated_at`,
      ).run(userId, supplierId, profile, now, now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
  return () => {
    const current = readE2EFixturePointer(undefined, { expectedToken: e2eFixtureToken });
    if (current.databasePath !== pointer.databasePath)
      throw new Error('Refusing to restore a different disposable fixture');
    const cleanup = new DatabaseSync(pointer.databasePath);
    try {
      cleanup.exec('PRAGMA foreign_keys=ON');
      cleanup.exec('BEGIN IMMEDIATE');
      try {
        const active = cleanup
          .prepare('SELECT supplier_id FROM supplier_user_profile WHERE user_id=?')
          .get(userId) as { supplier_id: string } | undefined;
        if (active?.supplier_id !== supplierId)
          throw new Error(
            'Another test changed the owned worker2 profile; refusing to overwrite it',
          );
        if (previous) {
          cleanup
            .prepare(
              `UPDATE supplier_user_profile SET supplier_id=?,profile=?,created_at=?,updated_at=?
            WHERE user_id=? AND supplier_id=?`,
            )
            .run(
              previous.supplier_id,
              previous.profile,
              previous.created_at,
              previous.updated_at,
              userId,
              supplierId,
            );
        } else {
          cleanup
            .prepare('DELETE FROM supplier_user_profile WHERE user_id=? AND supplier_id=?')
            .run(userId, supplierId);
        }
        cleanup.prepare('DELETE FROM supplier WHERE id=?').run(supplierId);
        cleanup.exec('COMMIT');
      } catch (error) {
        cleanup.exec('ROLLBACK');
        throw error;
      }
    } finally {
      cleanup.close();
    }
  };
}

const assistant = (page: Page) => page.locator('[data-navigation-assistant]');
const palette = (page: Page) => assistant(page).locator('dialog');
const task = (page: Page, id: string) => palette(page).locator(`[data-assistant-task="${id}"]`);

for (const scenario of [
  {
    profile: 'supplier_coordinator' as const,
    locale: 'es',
    launcher: 'Buscar una tarea',
    queryLabel: 'Describe tu tarea',
    query: 'registrar horas',
    timeTitle: 'Registrar horas',
    personnelTitle: 'Gestionar personal del proveedor',
    unsupportedNotice: 'Puedo ayudarte a encontrar páginas y formularios',
  },
  {
    profile: 'external_technician' as const,
    locale: 'pt',
    launcher: 'Encontrar uma tarefa',
    queryLabel: 'Descreva sua tarefa',
    query: 'registar horas',
    timeTitle: 'Registar horas',
    personnelTitle: '',
    unsupportedNotice: 'Posso ajudar você a encontrar páginas e formulários',
  },
]) {
  test(`${scenario.profile} has localized operational assistant tasks and no internal privileges`, async ({
    page,
  }, info) => {
    info.annotations.push({
      type: 'fixture-only permissions',
      description:
        'Temporary worker2 supplier profile in validated disposable SQLite fixture; restored in finally. No browser business saves or project grants.',
    });
    const restore = installSupplierProfile(scenario.profile);
    const businessActions: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        request.method() !== 'GET' &&
        [...url.searchParams.keys()].some((key) => key.startsWith('/'))
      )
        businessActions.push(`${request.method()} ${url.pathname}${url.search}`);
    });
    try {
      await signIn(page, 'worker2');
      await page.goto(portal(`/time?lang=${scenario.locale}`));
      await expect(assistant(page)).toHaveCount(1);
      const launcher = assistant(page).getByRole('button', {
        name: scenario.launcher,
        exact: true,
      });
      await expect(launcher).toBeVisible();
      const launcherBox = await launcher.boundingBox();
      expect(launcherBox).not.toBeNull();
      expect(launcherBox!.height).toBeGreaterThanOrEqual(44);
      expect(launcherBox!.x).toBeGreaterThanOrEqual(0);
      expect(launcherBox!.x + launcherBox!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width + 1,
      );
      await launcher.click();
      await expect(palette(page)).toBeVisible();
      await expect(palette(page).getByLabel(scenario.queryLabel)).toBeFocused();
      await expect(task(page, 'time-create')).toContainText(scenario.timeTitle);
      await expect(task(page, 'expense-create')).toBeVisible();
      await expect(task(page, 'report-daily')).toBeVisible();
      await expect(task(page, 'supplier-own-report')).toBeVisible();
      await expect(task(page, 'profile-security')).toBeVisible();
      for (const prefix of [
        'pay-',
        'project-',
        'finance-',
        'invoice-',
        'billing-',
        'ledger-',
        'accounting-',
        'crew-',
        'team-',
        'mailbox-',
      ]) {
        await expect(palette(page).locator(`[data-assistant-task^="${prefix}"]`)).toHaveCount(0);
      }
      await expect(task(page, 'management')).toHaveCount(0);
      await expect(task(page, 'notifications')).toHaveCount(0);
      if (scenario.profile === 'supplier_coordinator') {
        await expect(task(page, 'supplier-personnel')).toContainText(scenario.personnelTitle);
        await expect(task(page, 'supplier-time')).toBeVisible();
        await expect(task(page, 'supplier-report')).toBeVisible();
      } else {
        for (const id of ['supplier-personnel', 'supplier-time', 'supplier-report'])
          await expect(task(page, id)).toHaveCount(0);
      }
      await palette(page).screenshot({
        path: info.outputPath(`${scenario.profile}-task-palette.png`),
      });
      const query = palette(page).locator('[data-assistant-query]');
      await query.fill('create invoice');
      await expect(task(page, 'invoice-create')).toHaveCount(0);
      for (const prefix of ['finance-', 'invoice-', 'billing-', 'ledger-', 'accounting-'])
        await expect(palette(page).locator(`[data-assistant-task^="${prefix}"]`)).toHaveCount(0);
      await expect(palette(page).getByRole('status')).toContainText(scenario.unsupportedNotice);
      // The safe task list remains available; unsupported text must not launch its first item.
      await expect(task(page, 'time-create')).toBeVisible();
      const current = page.url();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(current);
      await expect(palette(page)).toBeVisible();
      await query.fill(scenario.query);
      await expect(task(page, 'time-create')).toBeVisible();
      await task(page, 'time-create').click();
      await expect(palette(page)).not.toBeVisible();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname.endsWith('/time') &&
          url.searchParams.get('lang') === scenario.locale &&
          url.searchParams.get('assistantSurface') === 'time-create',
      );
      const timeForm = page.locator('[data-assistant-target="time-create"]');
      await expect(timeForm).toBeVisible();
      await expect(timeForm.locator('[name="projectId"]')).toBeVisible();
      await expect(timeForm.locator('[name="summary"]')).toHaveValue('');
      await expect(assistant(page)).toHaveCount(1);
      await expect(
        assistant(page).getByRole('button', { name: scenario.launcher, exact: true }),
      ).toBeVisible();
      await timeForm.screenshot({ path: info.outputPath(`${scenario.profile}-time-form.png`) });
    } finally {
      restore();
      expect(
        businessActions,
        'assistant profile navigation must never submit a business action',
      ).toEqual([]);
    }
  });
}
