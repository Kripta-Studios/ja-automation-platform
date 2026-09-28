# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: astra-notifications.spec.ts >> Worker sees localized notices and opens the authorized project
- Location: tests/e2e/astra-notifications.spec.ts:7:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByRole('link').filter({ hasText: 'Recordatorio de horas pendientes' }).first()
Expected: "/j-aautomation/app/projects/01a0cb07-70c7-72de-b34a-78ebf7cdb311"
Received: "/j-aautomation/app/notifications/3a64f580-1171-4b25-9654-0aedba5e808e?lang=es"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for getByRole('link').filter({ hasText: 'Recordatorio de horas pendientes' }).first()
    14 × locator resolved to <a class="record-card-link svelte-u2ysw5" href="/j-aautomation/app/notifications/3a64f580-1171-4b25-9654-0aedba5e808e?lang=es">…</a>
       - unexpected value "/j-aautomation/app/notifications/3a64f580-1171-4b25-9654-0aedba5e808e?lang=es"

```

```yaml
- link "Recordatorio de horas pendientes 22 sept 2026, 21:34 UTC Abrir registro →":
  - /url: /j-aautomation/app/notifications/3a64f580-1171-4b25-9654-0aedba5e808e?lang=es
  - strong: Recordatorio de horas pendientes
  - time: 22 sept 2026, 21:34 UTC
  - text: Abrir registro →
```

# Test source

```ts
  1  | import { randomUUID } from 'node:crypto';
  2  | import { createDatabase } from '@ja/database';
  3  | import { expect, test } from '@playwright/test';
  4  | import { e2eDatabasePath } from './environment.js';
  5  | import { e2eCredentials, portal, signIn } from './auth.js';
  6  | 
  7  | test('Worker sees localized notices and opens the authorized project', async ({ page }) => {
  8  |   await signIn(page, 'worker');
  9  |   const { sqlite } = createDatabase(e2eDatabasePath);
  10 |   let projectId = '';
  11 |   let notificationId = randomUUID();
  12 |   try {
  13 |     const source = sqlite
  14 |       .prepare(
  15 |         `SELECT u.id user_id,p.id project_id FROM user u
  16 |       JOIN project_member pm ON pm.user_id=u.id JOIN project p ON p.id=pm.project_id
  17 |       WHERE u.email=? AND pm.status='active' AND p.status='active'
  18 |         AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
  19 |       ORDER BY p.id LIMIT 1`,
  20 |       )
  21 |       .get(e2eCredentials.worker.email) as { user_id: string; project_id: string } | undefined;
  22 |     if (!source) throw new Error('Disposable worker needs an active project');
  23 |     projectId = source.project_id;
  24 |     sqlite
  25 |       .prepare(
  26 |         'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
  27 |       )
  28 |       .run(
  29 |         notificationId,
  30 |         source.user_id,
  31 |         'missing_time',
  32 |         `missing-time:${projectId}:${source.user_id}:2026-09-01`,
  33 |         new Date().toISOString(),
  34 |       );
  35 |     notificationId = (
  36 |       sqlite
  37 |         .prepare('SELECT id FROM notification WHERE user_id=? AND kind=? AND subject_id=?')
  38 |         .get(
  39 |           source.user_id,
  40 |           'missing_time',
  41 |           `missing-time:${projectId}:${source.user_id}:2026-09-01`,
  42 |         ) as { id: string }
  43 |     ).id;
  44 |   } finally {
  45 |     sqlite.close();
  46 |   }
  47 |   await page.goto(portal('/notifications?lang=es'));
  48 |   const notice = page
  49 |     .getByRole('link')
  50 |     .filter({ hasText: 'Recordatorio de horas pendientes' })
  51 |     .first();
  52 |   await expect(notice).toBeVisible();
> 53 |   await expect(notice).toHaveAttribute('href', `/j-aautomation/app/projects/${projectId}`);
     |                        ^ Error: expect(locator).toHaveAttribute(expected) failed
  54 |   await notice.click();
  55 |   await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  56 |   await page.goto(portal(`/notifications/${notificationId}?lang=es`));
  57 |   await expect(
  58 |     page.getByRole('heading', { name: 'Recordatorio de horas pendientes' }),
  59 |   ).toBeVisible();
  60 |   await expect(
  61 |     page.locator('a[href="/j-aautomation/app/projects/' + projectId + '"]'),
  62 |   ).toBeVisible();
  63 |   await page.screenshot({
  64 |     path: test.info().outputPath('notification-detail.png'),
  65 |     fullPage: true,
  66 |   });
  67 | });
  68 | 
```