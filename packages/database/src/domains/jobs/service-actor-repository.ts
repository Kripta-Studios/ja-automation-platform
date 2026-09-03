import type { DatabaseSync } from 'node:sqlite';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { DURABLE_JOB_CAPABILITIES, type DurableJobCapability } from './job-contract.ts';

export {
  DURABLE_JOB_CAPABILITY_BY_KIND,
  DURABLE_JOB_CAPABILITIES,
  type DurableJobCapability,
  type DurableJobKind,
} from './job-contract.ts';

/**
 * The only capabilities a deployment service actor may receive.  Keep this
 * registry alongside the runner's kind contract so provisioning cannot grant
 * an arbitrary capability string that no durable job can use.
 */
/**
 * Reporting already defines this future durable job, but the current
 * persistence guards (0019/0027) reject both literals. Keep the exact pair
 * visible until the additive persistence migration widens those guards and
 * the runner/repository enqueue contract can be updated atomically.
 */
export const NEXT_MIGRATION_DURABLE_JOB_CAPABILITY_BY_KIND = Object.freeze({} as const);

const DEPLOYMENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/u;
const ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,119}$/u;

export type ServiceActorProvisionInput = Readonly<{
  tenantId: string;
  deploymentId: string;
  actorId: string;
  name: string;
  boundByUserId: string;
  capabilities?: readonly string[];
  rotate?: boolean;
  now?: () => string;
}>;

export type ServiceActorProvisionResult = Readonly<{
  created: boolean;
  rotated: boolean;
  actorId: string;
  previousActorId: string | null;
  bindingVersion: number;
  actorVersion: number;
  capabilities: readonly DurableJobCapability[];
}>;

type IdentityRow = Readonly<{ tenant_id: string; deployment_id: string }>;
type BindingRow = Readonly<{
  tenant_id: string;
  deployment_id: string;
  service_actor_id: string;
  bound_at: string;
  bound_by_user_id: string;
  version: number;
  actor_status: 'active' | 'disabled';
  actor_name: string;
  actor_version: number;
  actor_capabilities_json: string;
}>;

function invalid(message: string): never {
  throw new Error(message);
}

function validateIdentityPart(value: string, field: 'tenantId' | 'deploymentId'): string {
  if (typeof value !== 'string' || !DEPLOYMENT_ID_PATTERN.test(value))
    invalid(`INVALID_${field === 'tenantId' ? 'TENANT' : 'DEPLOYMENT'}_ID`);
  return value;
}

function validateActorId(value: string): string {
  if (typeof value !== 'string' || !ACTOR_ID_PATTERN.test(value))
    invalid('INVALID_SERVICE_ACTOR_ID');
  return value;
}

function validateName(value: string): string {
  if (typeof value !== 'string') invalid('INVALID_SERVICE_ACTOR_NAME');
  const name = value.trim();
  if (name.length < 1 || name.length > 120 || name !== value) invalid('INVALID_SERVICE_ACTOR_NAME');
  return name;
}

function validateBinder(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim())
    invalid('INVALID_SERVICE_ACTOR_BINDER');
  return value;
}

function normalizeCapabilities(
  input: readonly string[] | undefined,
): readonly DurableJobCapability[] {
  const values = input === undefined ? [...DURABLE_JOB_CAPABILITIES] : [...input];
  if (!values.length) invalid('INVALID_SERVICE_ACTOR_CAPABILITIES');
  const allowed = new Set<string>(DURABLE_JOB_CAPABILITIES);
  const seen = new Set<string>();
  for (const value of values) {
    if (
      typeof value !== 'string' ||
      value !== value.trim() ||
      !allowed.has(value) ||
      seen.has(value)
    )
      invalid('INVALID_SERVICE_ACTOR_CAPABILITIES');
    seen.add(value);
  }
  // Store capabilities in one canonical order. This makes replay checks
  // deterministic even when an operator supplied the same set in another order.
  return Object.freeze(DURABLE_JOB_CAPABILITIES.filter((capability) => seen.has(capability)));
}

function parseStoredCapabilities(value: string): readonly DurableJobCapability[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    invalid('SERVICE_ACTOR_CAPABILITIES_CORRUPT');
  }
  if (!Array.isArray(parsed)) invalid('SERVICE_ACTOR_CAPABILITIES_CORRUPT');
  const normalized = normalizeCapabilities(parsed as string[]);
  if (!sameCapabilities(normalized, DURABLE_JOB_CAPABILITIES))
    invalid('SERVICE_ACTOR_CAPABILITIES_CORRUPT');
  return normalized;
}

function validateTimestamp(value: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    invalid('INVALID_SERVICE_ACTOR_TIMESTAMP');
  return value;
}

function nextTimestamp(now: () => string, previous?: string): string {
  const candidate = validateTimestamp(now());
  if (!previous || candidate !== previous) return candidate;
  const previousMilliseconds = Date.parse(previous);
  return new Date(previousMilliseconds + 1).toISOString();
}

function readIdentity(sqlite: DatabaseSync, input: ServiceActorProvisionInput): IdentityRow {
  const identity = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as IdentityRow | undefined;
  if (!identity) invalid('DEPLOYMENT_IDENTITY_MISSING');
  if (identity.tenant_id !== input.tenantId || identity.deployment_id !== input.deploymentId)
    invalid('DEPLOYMENT_IDENTITY_MISMATCH');
  return identity;
}

function readBinding(sqlite: DatabaseSync): BindingRow | undefined {
  return sqlite
    .prepare(
      `SELECT b.tenant_id,b.deployment_id,b.service_actor_id,b.bound_at,b.bound_by_user_id,b.version,
              s.status actor_status,s.name actor_name,s.version actor_version,
              s.capabilities_json actor_capabilities_json
         FROM deployment_service_actor_binding b
         LEFT JOIN service_actor s ON s.id=b.service_actor_id
        WHERE b.singleton=1`,
    )
    .get() as BindingRow | undefined;
}

function assertBinder(sqlite: DatabaseSync, boundByUserId: string): void {
  const binder = sqlite.prepare('SELECT id,role,status FROM user WHERE id=?').get(boundByUserId) as
    | { id: string; role: string; status: string }
    | undefined;
  if (
    !binder ||
    binder.status !== 'active' ||
    !['owner_admin', 'finance_admin'].includes(binder.role)
  )
    invalid('SERVICE_ACTOR_BINDER_UNAVAILABLE');
}

function sameCapabilities(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function actorIdAlreadyExists(
  sqlite: DatabaseSync,
  actorId: string,
  tenantId: string,
  deploymentId: string,
): boolean {
  if (sqlite.prepare('SELECT 1 FROM user WHERE id=?').get(actorId))
    invalid('SERVICE_ACTOR_ID_CONFLICT');
  const existing = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM service_actor WHERE id=?')
    .get(actorId) as { tenant_id: string; deployment_id: string } | undefined;
  if (!existing) return false;
  if (existing.tenant_id !== tenantId || existing.deployment_id !== deploymentId)
    invalid('SERVICE_ACTOR_ID_CONFLICT');
  return true;
}

/**
 * Provision or rotate the deployment-scoped service actor binding.
 *
 * The database trigger is the final guard, but validation is deliberately
 * performed before any write so malformed operator input fails closed without
 * partially creating an actor. Rotation retains the old actor as disabled
 * history and advances the singleton binding version.
 */
export function provisionServiceActor(
  sqlite: DatabaseSync,
  input: ServiceActorProvisionInput,
): ServiceActorProvisionResult {
  validateIdentityPart(input.tenantId, 'tenantId');
  validateIdentityPart(input.deploymentId, 'deploymentId');
  const actorId = validateActorId(input.actorId);
  const name = validateName(input.name);
  const boundByUserId = validateBinder(input.boundByUserId);
  const capabilities = normalizeCapabilities(input.capabilities);
  if (!sameCapabilities(capabilities, DURABLE_JOB_CAPABILITIES))
    invalid('INVALID_SERVICE_ACTOR_CAPABILITIES');
  const rotate = input.rotate === true;
  const clock = input.now ?? (() => new Date().toISOString());

  return runImmediateTransaction(sqlite, 'service-actor', () => {
    const identity = readIdentity(sqlite, input);
    assertBinder(sqlite, boundByUserId);
    const existingBinding = readBinding(sqlite);
    const timestamp = nextTimestamp(clock, existingBinding?.bound_at);
    const capabilitiesJson = JSON.stringify(capabilities);

    if (!existingBinding) {
      if (rotate) invalid('SERVICE_ACTOR_BINDING_MISSING');
      if (actorIdAlreadyExists(sqlite, actorId, identity.tenant_id, identity.deployment_id))
        invalid('SERVICE_ACTOR_ID_CONFLICT');
      sqlite
        .prepare(
          `INSERT INTO service_actor(
             id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
           ) VALUES(?,?,?,?,?,?,?,?,1)`,
        )
        .run(
          actorId,
          identity.tenant_id,
          identity.deployment_id,
          name,
          'active',
          capabilitiesJson,
          timestamp,
          timestamp,
        );
      sqlite
        .prepare(
          `INSERT INTO deployment_service_actor_binding(
             singleton,tenant_id,deployment_id,service_actor_id,bound_at,bound_by_user_id,version
           ) VALUES(?,?,?,?,?,?,1)`,
        )
        .run(1, identity.tenant_id, identity.deployment_id, actorId, timestamp, boundByUserId);
      return {
        created: true,
        rotated: false,
        actorId,
        previousActorId: null,
        bindingVersion: 1,
        actorVersion: 1,
        capabilities,
      };
    }

    if (
      existingBinding.tenant_id !== identity.tenant_id ||
      existingBinding.deployment_id !== identity.deployment_id ||
      existingBinding.actor_status === undefined ||
      !existingBinding.actor_capabilities_json
    )
      invalid('SERVICE_ACTOR_BINDING_CORRUPT');
    const currentCapabilities = parseStoredCapabilities(existingBinding.actor_capabilities_json);

    if (!rotate) {
      if (
        existingBinding.service_actor_id !== actorId ||
        existingBinding.actor_status !== 'active' ||
        existingBinding.actor_name !== name ||
        existingBinding.bound_by_user_id !== boundByUserId ||
        !sameCapabilities(currentCapabilities, capabilities)
      )
        invalid('SERVICE_ACTOR_ALREADY_BOUND');
      return {
        created: false,
        rotated: false,
        actorId,
        previousActorId: null,
        bindingVersion: existingBinding.version,
        actorVersion: existingBinding.actor_version,
        capabilities,
      };
    }

    // Replay of the same rotation request is a no-op. A new actor id is the
    // rotation identity; changing its name/capability/binder is a conflict.
    if (existingBinding.service_actor_id === actorId) {
      if (
        existingBinding.actor_status !== 'active' ||
        existingBinding.actor_name !== name ||
        existingBinding.bound_by_user_id !== boundByUserId ||
        !sameCapabilities(currentCapabilities, capabilities)
      )
        invalid('SERVICE_ACTOR_ROTATION_CONFLICT');
      return {
        created: false,
        rotated: false,
        actorId,
        previousActorId: null,
        bindingVersion: existingBinding.version,
        actorVersion: existingBinding.actor_version,
        capabilities,
      };
    }
    if (existingBinding.actor_status !== 'active') invalid('SERVICE_ACTOR_BINDING_CORRUPT');
    if (actorIdAlreadyExists(sqlite, actorId, identity.tenant_id, identity.deployment_id))
      invalid('SERVICE_ACTOR_ID_CONFLICT');

    const activeRuns = sqlite
      .prepare(
        `SELECT 1 FROM job_run
          WHERE service_actor_id=? AND contract_version='b5-v1' AND state IN ('claimed','running')
          LIMIT 1`,
      )
      .get(existingBinding.service_actor_id);
    if (activeRuns) invalid('SERVICE_ACTOR_ROTATION_BUSY');

    sqlite
      .prepare(
        "UPDATE service_actor SET status='disabled',updated_at=?,version=version+1 WHERE id=? AND status='active' AND version=?",
      )
      .run(timestamp, existingBinding.service_actor_id, existingBinding.actor_version);
    sqlite
      .prepare(
        `INSERT INTO service_actor(
           id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?,?,?,1)`,
      )
      .run(
        actorId,
        identity.tenant_id,
        identity.deployment_id,
        name,
        'active',
        capabilitiesJson,
        timestamp,
        timestamp,
      );
    const updated = sqlite
      .prepare(
        `UPDATE deployment_service_actor_binding
            SET tenant_id=?,deployment_id=?,service_actor_id=?,bound_at=?,bound_by_user_id=?,version=version+1
          WHERE singleton=1 AND tenant_id=? AND deployment_id=? AND service_actor_id=? AND version=?`,
      )
      .run(
        identity.tenant_id,
        identity.deployment_id,
        actorId,
        timestamp,
        boundByUserId,
        identity.tenant_id,
        identity.deployment_id,
        existingBinding.service_actor_id,
        existingBinding.version,
      );
    if (Number(updated.changes) !== 1) invalid('SERVICE_ACTOR_ROTATION_CONFLICT');
    return {
      created: true,
      rotated: true,
      actorId,
      previousActorId: existingBinding.service_actor_id,
      bindingVersion: existingBinding.version + 1,
      actorVersion: 1,
      capabilities,
    };
  });
}

export type ConfiguredServiceActor = Readonly<{
  id: string;
  tenantId: string;
  deploymentId: string;
  name: string;
  version: number;
  bindingVersion: number;
  boundByUserId: string;
  capabilities: readonly DurableJobCapability[];
}>;

/** Resolve the active singleton actor for the current deployment. */
export function resolveConfiguredServiceActor(
  sqlite: DatabaseSync,
  expectedIdentity?: Readonly<{ tenantId: string; deploymentId: string }>,
): ConfiguredServiceActor {
  const identity = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as IdentityRow | undefined;
  if (!identity) invalid('DEPLOYMENT_IDENTITY_MISSING');
  if (
    expectedIdentity &&
    (identity.tenant_id !== expectedIdentity.tenantId ||
      identity.deployment_id !== expectedIdentity.deploymentId)
  )
    invalid('DEPLOYMENT_IDENTITY_MISMATCH');
  const binding = readBinding(sqlite);
  if (
    !binding ||
    binding.tenant_id !== identity.tenant_id ||
    binding.deployment_id !== identity.deployment_id ||
    binding.actor_status !== 'active' ||
    !binding.actor_capabilities_json
  )
    invalid('SERVICE_ACTOR_BINDING_UNAVAILABLE');
  const capabilities = parseStoredCapabilities(binding.actor_capabilities_json);
  if (!capabilities.length) invalid('SERVICE_ACTOR_BINDING_UNAVAILABLE');
  return {
    id: binding.service_actor_id,
    tenantId: identity.tenant_id,
    deploymentId: identity.deployment_id,
    name: binding.actor_name,
    version: binding.actor_version,
    bindingVersion: binding.version,
    boundByUserId: binding.bound_by_user_id,
    capabilities,
  };
}
