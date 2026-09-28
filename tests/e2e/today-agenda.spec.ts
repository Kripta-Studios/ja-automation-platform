import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn, portal, e2eCredentials } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('Worker Today separates the complete UTC agenda, upcoming work and an honest empty state', async ({
  page,
}, info) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const date = new Date();
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const iso = (days: number, hours: number) =>
    new Date(midnight + (days * 24 + hours) * 3_600_000).toISOString();
  const source = db.sqlite
    .prepare(
      `SELECT u.id worker_id, pm.project_id FROM user u
    JOIN project_member pm ON pm.user_id=u.id
    JOIN project p ON p.id=pm.project_id
    WHERE u.email=? AND pm.status='active' AND p.status='active'
      AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
    ORDER BY p.id LIMIT 1`,
    )
    .get(e2eCredentials.worker.email, iso(-1, 0).slice(0, 10), iso(9, 0).slice(0, 10)) as
    | { worker_id: string; project_id: string }
    | undefined;
  if (!source) {
    db.sqlite.close();
    throw new Error('Worker agenda requires an effective disposable project assignment');
  }
  const existing = db.sqlite
    .prepare('SELECT id,status FROM planning_assignment WHERE worker_id=?')
    .all(source.worker_id) as Array<{ id: string; status: string }>;
  const ids: string[] = [];
  const insert = (site: string, from: string, to: string) => {
    const id = randomUUID();
    ids.push(id);
    db.sqlite
      .prepare(
        `INSERT INTO planning_assignment
      (id,project_id,worker_id,starts_at,ends_at,planned_minutes,status,site,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,120,'published',?,?,?,?)`,
      )
      .run(
        id,
        source.project_id,
        source.worker_id,
        from,
        to,
        site,
        source.worker_id,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    return id;
  };
  try {
    // The browser suite is serial; restore the baseline in finally for later journeys.
    db.sqlite
      .prepare("UPDATE planning_assignment SET status='cancelled' WHERE worker_id=?")
      .run(source.worker_id);
    const past = insert('Agenda past record', iso(-1, 8), iso(-1, 10));
    const overnight = insert('Agenda overnight site', iso(-1, 22), iso(0, 2));
    const morning = insert('Agenda morning site', iso(0, 8), iso(0, 10));
    const afternoon = insert('Agenda afternoon site', iso(0, 14), iso(0, 16));
    for (let day = 1; day <= 7; day += 1)
      insert(`Agenda upcoming ${day}`, iso(day, 8), iso(day, 10));

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signIn(page, 'worker');
    await page.goto(portal('/?lang=en'));
    const agenda = page.locator('[data-worker-agenda]');
    const today = page.locator('[data-today-assignments]');
    const upcoming = page.locator('[data-upcoming-assignments]');
    await expect(agenda.getByRole('heading', { name: 'Your workday' })).toBeVisible();
    await expect(today.locator('[data-agenda-assignment]')).toHaveCount(3);
    expect(
      await today
        .locator('[data-agenda-assignment]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-agenda-assignment'))),
    ).toEqual([overnight, morning, afternoon]);
    await expect(agenda.locator(`[data-agenda-assignment="${past}"]`)).toHaveCount(0);
    await expect(today.locator('.agenda-interval').first()).toContainText('22:00');
    await expect(today.locator('.agenda-interval').first()).toContainText('02:00 UTC');
    await expect(upcoming.locator('[data-agenda-assignment]')).toHaveCount(5);
    await expect(upcoming).toContainText('Showing 5 of 7');
    await upcoming.getByRole('button', { name: 'Show more assignments' }).click();
    await expect(upcoming.locator('[data-agenda-assignment]')).toHaveCount(7);
    await expect(upcoming).toContainText('Showing 7 of 7');
    const projectLink = today.getByRole('link', { name: 'Open project' }).first();
    await expect(projectLink).toHaveAttribute(
      'href',
      `/j-aautomation/app/projects/${source.project_id}?lang=en`,
    );
    await projectLink.focus();
    await expect(projectLink).toBeFocused();
    for (const control of await agenda.locator('a,button').all()) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
    const firstCard = today.locator('[data-agenda-assignment]').first();
    const contentBox = await firstCard.locator('.agenda-assignment-content').boundingBox();
    const linkBox = await projectLink.boundingBox();
    if (page.viewportSize()!.width <= 600)
      expect(linkBox!.y).toBeGreaterThanOrEqual(contentBox!.y + contentBox!.height);
    expect(
      (await new AxeBuilder({ page }).include('[data-worker-agenda]').analyze()).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`worker-agenda-${info.project.name}.png`),
      fullPage: true,
    });
    for (const [locale, heading] of [
      ['es', 'Tu jornada'],
      ['pt', 'Sua jornada'],
    ]) {
      await page.goto(portal(`/?lang=${locale}`));
      await expect(agenda.getByRole('heading', { name: heading })).toBeVisible();
      await expect(today.locator('[data-agenda-assignment]')).toHaveCount(3);
      await expect(today.locator('.agenda-interval').first()).toContainText('UTC');
    }

    db.sqlite
      .prepare("UPDATE planning_assignment SET status='cancelled' WHERE worker_id=?")
      .run(source.worker_id);
    await page.goto(portal('/?lang=en'));
    await expect(today).toContainText('No published assignment for today.');
    await expect(upcoming).toContainText('No upcoming assignments published.');
    await today.locator('summary').click();
    await expect(
      today.locator(`a[href="/j-aautomation/app/projects/${source.project_id}?lang=en"]`),
    ).toBeVisible();
    await expect(agenda.getByRole('link', { name: 'Log actual time', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    for (const id of ids) db.sqlite.prepare('DELETE FROM planning_assignment WHERE id=?').run(id);
    for (const row of existing)
      db.sqlite
        .prepare('UPDATE planning_assignment SET status=? WHERE id=?')
        .run(row.status, row.id);
    db.sqlite.close();
  }
});
