import { createDatabase, PortalRepository, SupplierWorkforceRepository } from '@ja/database';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';

export const coordinatorCredentials = {
  email: 'manual-coordinator@demo.jaautomation.test',
  password: e2eCredentials.worker.password,
};
export type ManualPersonaAccount = keyof typeof e2eCredentials | 'supplierCoordinator';

export async function signInManualPersona(
  page: Page,
  account: ManualPersonaAccount,
): Promise<void> {
  if (account !== 'supplierCoordinator') return signIn(page, account);
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(coordinatorCredentials.email);
  await page.getByLabel('Password').fill(coordinatorCredentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  const application = new URL(portal(''));
  await page.waitForURL(
    (url) =>
      url.origin === application.origin &&
      (url.pathname === application.pathname ||
        url.pathname.startsWith(`${application.pathname}/`)) &&
      url.pathname !== `${application.pathname}/login`,
  );
  await page.waitForLoadState('networkidle');
}

/** Seed delegated personas only in the disposable E2E database before real sign-in. */
export function seedSupplierPersonas(databasePath: string): string {
  const database = createDatabase(databasePath);
  try {
    const idFor = (email: string) =>
      String(database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email)!.id);
    const ownerId = idFor(e2eCredentials.owner.email);
    let coordinatorId = (
      database.sqlite
        .prepare('SELECT id FROM user WHERE email=?')
        .get(coordinatorCredentials.email) as { id: string } | undefined
    )?.id;
    if (!coordinatorId) {
      coordinatorId = randomUUID();
      const now = new Date().toISOString();
      database.sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
           VALUES(?,?,?,1,'worker','active',0,?,?)`,
        )
        .run(
          coordinatorId,
          'Synthetic manual supplier coordinator',
          coordinatorCredentials.email,
          now,
          now,
        );
      const credential = database.sqlite
        .prepare("SELECT password FROM account WHERE user_id=? AND provider_id='credential'")
        .get(idFor(e2eCredentials.worker.email)) as { password: string };
      database.sqlite
        .prepare(
          `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
           VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
        )
        .run(randomUUID(), coordinatorId, coordinatorId, credential.password, now, now);
    }
    const technicianId = idFor(e2eCredentials.worker2.email);
    const projectName = 'Manual role guides synthetic installation';
    const existingProject = database.sqlite
      .prepare('SELECT id FROM project WHERE name=?')
      .get(projectName) as { id: string } | undefined;
    const coordinatorProfile = database.sqlite
      .prepare('SELECT supplier_id,profile FROM supplier_user_profile WHERE user_id=?')
      .get(coordinatorId) as { supplier_id: string; profile: string } | undefined;
    const technicianProfile = database.sqlite
      .prepare('SELECT supplier_id,profile FROM supplier_user_profile WHERE user_id=?')
      .get(technicianId) as { supplier_id: string; profile: string } | undefined;
    if (coordinatorProfile || technicianProfile) {
      if (
        !coordinatorProfile ||
        !technicianProfile ||
        coordinatorProfile.supplier_id !== technicianProfile.supplier_id ||
        coordinatorProfile.profile !== 'supplier_coordinator' ||
        technicianProfile.profile !== 'external_technician'
      )
        throw new Error('Disposable supplier persona fixture has a partial or unexpected profile');
      if (!existingProject) throw new Error('Supplier persona project is missing');
      return existingProject.id;
    }
    const owner = new PortalRepository(database.sqlite).principalFor(ownerId);
    const repository = new PortalRepository(database.sqlite);
    const client = database.sqlite
      .prepare('SELECT id,currency FROM client ORDER BY created_at LIMIT 1')
      .get() as {
      id: string;
      currency: string;
    };
    const projectId = repository.createProject(owner, {
      clientId: client.id,
      name: projectName,
      timezone: 'UTC',
      currency: client.currency,
      billingModel: 'tm',
      startDate: '2026-01-01',
      expectedMinutesPerDay: 480,
    }).id;
    const suppliers = new SupplierWorkforceRepository(database.sqlite);
    const supplier = suppliers.createSupplier(owner, { name: `Manual capture ${randomUUID()}` });
    const timestamp = new Date().toISOString();
    const profile = database.sqlite.prepare(
      'INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,?,?,?,?)',
    );
    const period = database.sqlite.prepare(
      'INSERT INTO supplier_user_profile_period(id,user_id,supplier_id,profile,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,NULL,?)',
    );
    for (const [userId, kind] of [
      [coordinatorId, 'supplier_coordinator'],
      [technicianId, 'external_technician'],
    ] as const) {
      profile.run(userId, supplier.id, kind, timestamp, timestamp);
      period.run(randomUUID(), userId, supplier.id, kind, timestamp, timestamp);
    }
    suppliers.grantProject(owner, {
      supplierId: supplier.id,
      projectId,
      coordinatorId,
      startsOn: '2026-01-01',
    });
    suppliers.assignTechnician(owner, {
      workerId: technicianId,
      projectId,
      startsOn: '2026-01-01',
    });
    return projectId;
  } finally {
    database.sqlite.close();
  }
}
