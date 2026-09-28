import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { e2eDatabasePath } from './environment.js';
import { e2eCredentials, portal, signIn } from './auth.js';

test('Worker sees localized notices and opens the authorized project', async ({ page }) => {
  await signIn(page, 'worker');
  const { sqlite } = createDatabase(e2eDatabasePath);
  let projectId = '';
  let notificationId = randomUUID();
  try {
    const source = sqlite
      .prepare(
        `SELECT u.id user_id,p.id project_id FROM user u
      JOIN project_member pm ON pm.user_id=u.id JOIN project p ON p.id=pm.project_id
      WHERE u.email=? AND pm.status='active' AND p.status='active'
        AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
      ORDER BY p.id LIMIT 1`,
      )
      .get(e2eCredentials.worker.email) as { user_id: string; project_id: string } | undefined;
    if (!source) throw new Error('Disposable worker needs an active project');
    projectId = source.project_id;
    sqlite
      .prepare(
        'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
      )
      .run(
        notificationId,
        source.user_id,
        'missing_time',
        `missing-time:${projectId}:${source.user_id}:2026-09-01`,
        new Date().toISOString(),
      );
    notificationId = (
      sqlite
        .prepare('SELECT id FROM notification WHERE user_id=? AND kind=? AND subject_id=?')
        .get(
          source.user_id,
          'missing_time',
          `missing-time:${projectId}:${source.user_id}:2026-09-01`,
        ) as { id: string }
    ).id;
  } finally {
    sqlite.close();
  }
  await page.goto(portal('/notifications?lang=es'));
  const notice = page
    .getByRole('link')
    .filter({ hasText: 'Recordatorio de horas pendientes' })
    .first();
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('href', `/j-aautomation/app/projects/${projectId}`);
  await notice.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await page.goto(portal(`/notifications/${notificationId}?lang=es`));
  await expect(
    page.getByRole('heading', { name: 'Recordatorio de horas pendientes' }),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/j-aautomation/app/projects/' + projectId + '"]'),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('notification-detail.png'),
    fullPage: true,
  });
});
