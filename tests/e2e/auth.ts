import { hashPassword } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

// These credentials exist only in the disposable E2E database. They exercise
// the same Better Auth credential flow used by a real invited account; they are
// never shown in the portal and are not valid production credentials.
export const e2eCredentials = {
  owner: { email: 'antonny.luty@j-aautomation.com', password: 'antonny.luty' },
  finance: { email: 'finance@demo.jaautomation.local', password: 'finance' },
  auditor: { email: 'auditor@demo.jaautomation.local', password: 'auditor' },
  manager: { email: 'pm@demo.jaautomation.local', password: 'pm' },
  worker: { email: 'worker@demo.jaautomation.local', password: 'worker' },
  worker2: { email: 'rafael@demo.jaautomation.local', password: 'rafael' },
} as const;

export const e2eArchiveTarget = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Archive Target',
  email: 'archive-target@demo.jaautomation.local',
} as const;

// These rows are disposable lifecycle fixtures. Each Playwright project gets a
// deterministic, valid UUID pair so one viewport's edit/archive journey cannot
// mutate the entity used by another viewport. The row is also reset immediately
// before its owning test, which makes retries deterministic without resetting a
// shared row that another project may be using concurrently.
export const e2eLifecycleProjectNames = [
  'phone-360',
  'phone-390',
  'phone-430',
  'tablet-768',
  'tablet-1024',
  'laptop-1280',
  'desktop',
  'wide-1920',
] as const;

export type E2ELifecycleFixture = ReturnType<typeof makeE2ELifecycleFixture>;

function lifecycleFixtureId(series: '01' | '02', index: number): string {
  return `00000000-0000-4000-8000-00000000${series}${String(index).padStart(2, '0')}`;
}

function makeE2ELifecycleFixture(projectName: string, index: number) {
  const suffix = String(index).padStart(2, '0');
  return {
    client: {
      id: lifecycleFixtureId('01', index),
      clientNumber: `C-99${suffix}`,
      legalName: `Lifecycle Client ${projectName} Ltd.`,
      displayName: `Lifecycle Client · ${projectName}`,
      currency: 'USD',
      timezone: 'America/New_York',
      billingEmail: `lifecycle-client-${projectName}@demo.jaautomation.local`,
      paymentTermsDays: 30,
    },
    project: {
      id: lifecycleFixtureId('02', index),
      projectNumber: `C-99${suffix}-P-${suffix}`,
      name: `Lifecycle Project · ${projectName}`,
      description: `Disposable ${projectName} client/project lifecycle fixture.`,
      timezone: 'America/New_York',
      currency: 'USD',
      billingModel: 'tm',
      siteName: `Lifecycle Test Site · ${projectName}`,
      country: 'US',
      expectedMinutesPerDay: 600,
      poNumber: `LIFE-99${suffix}`,
      startDate: '2026-08-01',
    },
  } as const;
}

export const e2eLifecycleFixturesByProject = Object.fromEntries(
  e2eLifecycleProjectNames.map((projectName, index) => [
    projectName,
    makeE2ELifecycleFixture(projectName, index + 1),
  ]),
) as Record<(typeof e2eLifecycleProjectNames)[number], E2ELifecycleFixture>;

export function e2eLifecycleFixturesFor(projectName: string): E2ELifecycleFixture {
  const fixture =
    e2eLifecycleFixturesByProject[projectName as keyof typeof e2eLifecycleFixturesByProject];
  if (!fixture) throw new Error(`No isolated lifecycle fixture is defined for ${projectName}`);
  return fixture;
}

export const portal = (value = '') => `http://127.0.0.1:4174/j-aautomation/app${value}`;

/**
 * Sign in through the real Better Auth form used by every authenticated E2E flow.
 * Keeping this in the fixture-owned file makes role coverage explicit at each call site.
 */
export async function signIn(page: Page, role: keyof typeof e2eCredentials): Promise<void> {
  const credentials = e2eCredentials[role];
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  const application = new URL(portal(''));
  await page.waitForURL((url) => {
    const isApplicationRoute =
      url.origin === application.origin &&
      (url.pathname === application.pathname ||
        url.pathname.startsWith(`${application.pathname}/`));
    return isApplicationRoute && url.pathname !== `${application.pathname}/login`;
  });
  await page.waitForLoadState('networkidle');
}

export async function seedE2ECredentialAccounts(databasePath: string): Promise<void> {
  const database = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    // The auditor is intentionally created only in the disposable browser fixture.  It is not a
    // production/demo account and therefore does not expand the application's normal seed data.
    const auditor = e2eCredentials.auditor;
    const auditorExists = database.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(auditor.email) as { id: string } | undefined;
    if (!auditorExists) {
      database.sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
           VALUES(?,?,?,1,'auditor_read_only','active',0,?,?)`,
        )
        .run(randomUUID(), 'E2E Read-only Auditor', auditor.email, now, now);
    }
    for (const account of Object.values(e2eCredentials)) {
      const user = database.sqlite
        .prepare("SELECT id FROM user WHERE email=? AND status='active'")
        .get(account.email) as { id: string } | undefined;
      if (!user) throw new Error(`E2E seed user is missing: ${account.email}`);
      const password = await hashPassword(account.password);
      database.sqlite
        .prepare(
          `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?)
           ON CONFLICT(provider_id,account_id) DO UPDATE SET
             issuer=excluded.issuer,
             user_id=excluded.user_id,
             password=excluded.password,
             updated_at=excluded.updated_at`,
        )
        .run(randomUUID(), 'local:credential', user.id, 'credential', user.id, password, now, now);
    }
    database.sqlite
      .prepare(
        `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
         VALUES(?,?,?,1,'worker','active',0,?,?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           email=excluded.email,
           status='active',
           updated_at=excluded.updated_at`,
      )
      .run(e2eArchiveTarget.id, e2eArchiveTarget.name, e2eArchiveTarget.email, now, now);
    for (const fixture of Object.values(e2eLifecycleFixturesByProject)) {
      database.sqlite
        .prepare(
          `INSERT INTO client(
             id,client_number,legal_name,display_name,status,currency,timezone,billing_email,
             payment_terms_days,version,created_at,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)
           ON CONFLICT(id) DO UPDATE SET
             client_number=excluded.client_number,
             legal_name=excluded.legal_name,
             display_name=excluded.display_name,
             status='active',
             currency=excluded.currency,
             timezone=excluded.timezone,
             billing_email=excluded.billing_email,
             payment_terms_days=excluded.payment_terms_days,
             version=1,
             updated_at=excluded.updated_at`,
        )
        .run(
          fixture.client.id,
          fixture.client.clientNumber,
          fixture.client.legalName,
          fixture.client.displayName,
          'active',
          fixture.client.currency,
          fixture.client.timezone,
          fixture.client.billingEmail,
          fixture.client.paymentTermsDays,
          now,
          now,
        );
      database.sqlite
        .prepare(
          `INSERT INTO project(
             id,project_number,client_id,name,timezone,currency,status,billing_model,description,
             site_name,country,expected_minutes_per_day,po_number,start_date,version,created_at,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
           ON CONFLICT(id) DO UPDATE SET
             project_number=excluded.project_number,
             client_id=excluded.client_id,
             name=excluded.name,
             timezone=excluded.timezone,
             currency=excluded.currency,
             status='active',
             billing_model=excluded.billing_model,
             description=excluded.description,
             site_name=excluded.site_name,
             country=excluded.country,
             expected_minutes_per_day=excluded.expected_minutes_per_day,
             po_number=excluded.po_number,
             start_date=excluded.start_date,
             version=1,
             updated_at=excluded.updated_at`,
        )
        .run(
          fixture.project.id,
          fixture.project.projectNumber,
          fixture.client.id,
          fixture.project.name,
          fixture.project.timezone,
          fixture.project.currency,
          'active',
          fixture.project.billingModel,
          fixture.project.description,
          fixture.project.siteName,
          fixture.project.country,
          fixture.project.expectedMinutesPerDay,
          fixture.project.poNumber,
          fixture.project.startDate,
          now,
          now,
        );
    }
  } finally {
    database.sqlite.close();
  }
}

export function resetE2ELifecycleFixture(
  databasePath: string,
  fixture: E2ELifecycleFixture,
  entity: 'client' | 'project',
): void {
  const database = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    if (entity === 'client') {
      const result = database.sqlite
        .prepare(
          `UPDATE client
           SET client_number=?, legal_name=?, display_name=?, status='active', currency=?,
             timezone=?, billing_email=?, payment_terms_days=?, version=1, updated_at=?
           WHERE id=?`,
        )
        .run(
          fixture.client.clientNumber,
          fixture.client.legalName,
          fixture.client.displayName,
          fixture.client.currency,
          fixture.client.timezone,
          fixture.client.billingEmail,
          fixture.client.paymentTermsDays,
          now,
          fixture.client.id,
        );
      if (result.changes !== 1)
        throw new Error(`Lifecycle client fixture is missing: ${fixture.client.id}`);
      return;
    }
    const result = database.sqlite
      .prepare(
        `UPDATE project
         SET project_number=?, client_id=?, name=?, timezone=?, currency=?, status='active',
           billing_model=?, description=?, site_name=?, country=?, expected_minutes_per_day=?,
           po_number=?, start_date=?, version=1, updated_at=?
         WHERE id=?`,
      )
      .run(
        fixture.project.projectNumber,
        fixture.client.id,
        fixture.project.name,
        fixture.project.timezone,
        fixture.project.currency,
        fixture.project.billingModel,
        fixture.project.description,
        fixture.project.siteName,
        fixture.project.country,
        fixture.project.expectedMinutesPerDay,
        fixture.project.poNumber,
        fixture.project.startDate,
        now,
        fixture.project.id,
      );
    if (result.changes !== 1)
      throw new Error(`Lifecycle project fixture is missing: ${fixture.project.id}`);
  } finally {
    database.sqlite.close();
  }
}
