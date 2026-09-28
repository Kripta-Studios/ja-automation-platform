import type { DatabaseSync } from 'node:sqlite';

type EnvironmentSnapshot = Readonly<{
  tenant: string | undefined;
  deployment: string | undefined;
}>;

export const B5_TEST_TENANT_ID = 'test-tenant';
export const B5_TEST_DEPLOYMENT_ID = 'test-deployment';

/**
 * Capabilities used by the production B5 scheduler.  Test databases must bind an
 * active actor explicitly; the production runner deliberately has no fallback actor.
 */
export const B5_TEST_SERVICE_CAPABILITIES = Object.freeze([
  'artifact.invoice.render',
  'artifact.report.render',
  'billing.draft.generate',
  'artifact.accounting_pack.render',
  'storage.temporary.cleanup',
  'artifact.localized_pdf.render',
  'artifact.worker_statement.render',
  'document.scan',
  'outbox.deliver',
  'alert.dispatch',
  'email.send',
  'backup.verify',
] as const);

/**
 * Install a disposable deployment anchor for B5 integration tests and return
 * an idempotent restore function. Production code remains fail-closed when
 * either identity variable is absent or malformed.
 */
export function installB5TestDeploymentIdentity(): () => void {
  const previous: EnvironmentSnapshot = {
    tenant: process.env.JA_TENANT_ID,
    deployment: process.env.JA_DEPLOYMENT_ID,
  };
  process.env.JA_TENANT_ID = B5_TEST_TENANT_ID;
  process.env.JA_DEPLOYMENT_ID = B5_TEST_DEPLOYMENT_ID;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (previous.tenant === undefined) delete process.env.JA_TENANT_ID;
    else process.env.JA_TENANT_ID = previous.tenant;
    if (previous.deployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
    else process.env.JA_DEPLOYMENT_ID = previous.deployment;
  };
}

/**
 * Install the same deployment-scoped service actor binding that production B5
 * execution requires.  This is intentionally an explicit test fixture operation;
 * createDatabase() remains fail-closed and never creates service credentials.
 */
export function seedB5ServiceActorBinding(
  sqlite: DatabaseSync,
  boundByUserId: string,
  capabilities: readonly string[] = B5_TEST_SERVICE_CAPABILITIES,
): void {
  const identity = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string } | undefined;
  if (!identity) throw new Error('B5 test deployment identity is missing');
  if (!capabilities.length) throw new Error('B5 test service actor needs a capability');
  const installedCapabilities = capabilities.filter(
    (capability) =>
      capability !== 'storage.temporary.cleanup' ||
      Boolean(sqlite.prepare('SELECT 1 FROM schema_migration WHERE version>=27').get()),
  );
  const now = new Date().toISOString();
  const actorId = 'test-b5-service-actor';
  sqlite
    .prepare(
      `INSERT INTO service_actor(
         id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      actorId,
      identity.tenant_id,
      identity.deployment_id,
      'B5 test service actor',
      'active',
      JSON.stringify(installedCapabilities),
      now,
      now,
      1,
    );
  sqlite
    .prepare(
      `INSERT INTO deployment_service_actor_binding(
         singleton,tenant_id,deployment_id,service_actor_id,bound_at,bound_by_user_id,version
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(1, identity.tenant_id, identity.deployment_id, actorId, now, boundByUserId, 1);
}
