import type { DatabaseSync } from 'node:sqlite';
import {
  DURABLE_JOB_CAPABILITY_BY_KIND,
  capabilityForJobKind,
  jobPayloadHash,
  parseJobPayload,
  type DurableJobCapability,
  type DurableJobKind,
} from './job-contract.ts';

/** The runner-issued proof handed to a service-job handler. */
export type FencedJobExecution = Readonly<{
  jobId: string;
  runId: string;
  tenantId: string;
  deploymentId: string;
  requiredCapability: string;
  fenceVersion: number;
}>;

/**
 * A target is intentionally payload-shaped.  Most jobs have one target field
 * (`invoiceId`, `packId`, `documentId`, ...), while a few have more than one
 * field that must remain bound to the claimed payload.
 */
export type FencedJobPayloadTarget =
  | Readonly<{ key: string; value: unknown }>
  | Readonly<{ field: string; value: unknown }>
  | Readonly<Record<string, unknown>>;

export type FencedJobExecutionExpectation = Readonly<{
  kind: DurableJobKind | string;
  capability: DurableJobCapability | string;
  payloadTarget?: FencedJobPayloadTarget;
}>;

export type AuthorizedFencedJobExecution = Readonly<{
  jobId: string;
  runId: string;
  tenantId: string;
  deploymentId: string;
  kind: DurableJobKind;
  requiredCapability: DurableJobCapability;
  fenceVersion: number;
  serviceActorId: string;
  serviceActorVersion: number;
  serviceActorCapabilitiesJson: string;
  configuredBindingVersion: number;
  leaseUntil: string;
  payloadJson: string;
  payload: unknown;
  payloadSha256: string;
}>;

function reject(): never {
  throw new Error('FENCED_JOB_EXECUTION_INVALID');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function targetEntries(
  target: FencedJobPayloadTarget | undefined,
): readonly [string, unknown][] | undefined {
  if (target === undefined) return undefined;
  if (!isRecord(target)) reject();
  if ('key' in target || 'field' in target) {
    const key = 'key' in target ? target.key : target.field;
    if (typeof key !== 'string' || !key || !Object.prototype.hasOwnProperty.call(target, 'value'))
      reject();
    return [[key, target.value]];
  }
  return Object.entries(target);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  try {
    // Canonical JSON is also a strict deep comparison for the JSON-only job
    // payload contract.  It rejects undefined and executable values.
    return (
      JSON.stringify(left) !== undefined &&
      JSON.stringify(right) !== undefined &&
      jobPayloadHash({ value: left }) === jobPayloadHash({ value: right })
    );
  } catch {
    return false;
  }
}

function assertPayloadTarget(payload: unknown, target: FencedJobPayloadTarget | undefined): void {
  const entries = targetEntries(target);
  if (entries === undefined) return;
  if (!isRecord(payload)) reject();
  for (const [key, expected] of entries) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) reject();
    if (!sameJsonValue(payload[key], expected)) reject();
  }
}

function parseCapabilities(value: string, expected: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    reject();
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) reject();
  if (!parsed.includes(expected)) reject();
}

function assertProofShape(execution: FencedJobExecution): void {
  if (
    !execution ||
    typeof execution.jobId !== 'string' ||
    !execution.jobId ||
    typeof execution.runId !== 'string' ||
    !execution.runId ||
    typeof execution.tenantId !== 'string' ||
    !execution.tenantId ||
    typeof execution.deploymentId !== 'string' ||
    !execution.deploymentId ||
    typeof execution.requiredCapability !== 'string' ||
    !execution.requiredCapability ||
    !Number.isSafeInteger(execution.fenceVersion) ||
    execution.fenceVersion < 1
  )
    reject();
}

/**
 * Prove that a service handler is still operating on the exact claimed B5
 * job/run it was given.  This is read-only and must be called inside the
 * caller's transaction before any business write.  It deliberately carries
 * no Principal and therefore cannot be confused with a human authorization
 * path.
 */
export function assertFencedJobExecution(
  sqlite: DatabaseSync,
  execution: FencedJobExecution,
  expected: FencedJobExecutionExpectation,
): AuthorizedFencedJobExecution {
  assertProofShape(execution);
  if (!expected || typeof expected.kind !== 'string' || !expected.kind) reject();
  if (typeof expected.capability !== 'string' || !expected.capability) reject();
  const canonicalCapability = capabilityForJobKind(expected.kind);
  if (!canonicalCapability || canonicalCapability !== expected.capability) reject();
  if (execution.requiredCapability !== canonicalCapability) reject();

  const row = sqlite
    .prepare(
      `SELECT j.id,j.kind,j.contract_version AS job_contract,j.payload_json,j.payload_sha256,
              j.tenant_id,j.deployment_id,j.required_capability,j.state AS job_state,
              j.active_job_run_id,j.fence_version,j.lease_until AS job_lease_until,
              r.id AS run_id,r.job_id AS run_job_id,r.contract_version AS run_contract,
              r.kind AS run_kind,r.state AS run_state,r.tenant_id AS run_tenant_id,
              r.deployment_id AS run_deployment_id,r.required_capability AS run_capability,
              r.payload_sha256 AS run_payload_sha256,r.service_actor_id,
              r.service_actor_version,r.service_actor_capabilities_json,
              r.configured_binding_version,r.fence_version AS run_fence,
              r.lease_until AS run_lease_until,
              s.status AS actor_status,s.version AS actor_version,
              s.capabilities_json AS actor_capabilities,
              b.service_actor_id AS binding_actor_id,b.tenant_id AS binding_tenant_id,
              b.deployment_id AS binding_deployment_id,b.version AS binding_version,
              d.tenant_id AS identity_tenant_id,d.deployment_id AS identity_deployment_id
         FROM job j
         JOIN job_run r
           ON r.id=j.active_job_run_id AND r.id=? AND r.job_id=j.id
         JOIN deployment_identity d
           ON d.singleton=1 AND d.tenant_id=j.tenant_id AND d.deployment_id=j.deployment_id
         JOIN service_actor s ON s.id=r.service_actor_id
         JOIN deployment_service_actor_binding b
           ON b.singleton=1 AND b.service_actor_id=s.id
         WHERE j.id=?`,
    )
    .get(execution.runId, execution.jobId) as
    | {
        id: string;
        kind: string;
        job_contract: string;
        payload_json: string;
        payload_sha256: string | null;
        tenant_id: string | null;
        deployment_id: string | null;
        required_capability: string | null;
        job_state: string;
        active_job_run_id: string | null;
        fence_version: number;
        job_lease_until: string | null;
        run_id: string;
        run_job_id: string;
        run_contract: string | null;
        run_kind: string | null;
        run_state: string | null;
        run_tenant_id: string | null;
        run_deployment_id: string | null;
        run_capability: string | null;
        run_payload_sha256: string | null;
        service_actor_id: string | null;
        service_actor_version: number | null;
        service_actor_capabilities_json: string | null;
        configured_binding_version: number | null;
        run_fence: number | null;
        run_lease_until: string | null;
        actor_status: string;
        actor_version: number;
        actor_capabilities: string;
        binding_actor_id: string;
        binding_tenant_id: string;
        binding_deployment_id: string;
        binding_version: number;
        identity_tenant_id: string;
        identity_deployment_id: string;
      }
    | undefined;
  const now = Date.now();
  if (
    !row ||
    row.job_contract !== 'b5-v1' ||
    row.run_contract !== 'b5-v1' ||
    row.kind !== expected.kind ||
    row.run_kind !== expected.kind ||
    row.required_capability !== canonicalCapability ||
    row.run_capability !== canonicalCapability ||
    row.job_state !== 'claimed' ||
    row.run_state !== 'running' ||
    row.active_job_run_id !== execution.runId ||
    row.run_id !== execution.runId ||
    row.run_job_id !== execution.jobId ||
    row.tenant_id !== execution.tenantId ||
    row.deployment_id !== execution.deploymentId ||
    row.run_tenant_id !== execution.tenantId ||
    row.run_deployment_id !== execution.deploymentId ||
    row.identity_tenant_id !== execution.tenantId ||
    row.identity_deployment_id !== execution.deploymentId ||
    row.binding_tenant_id !== execution.tenantId ||
    row.binding_deployment_id !== execution.deploymentId ||
    row.service_actor_id === null ||
    row.service_actor_id !== row.binding_actor_id ||
    row.actor_status !== 'active' ||
    row.service_actor_version === null ||
    row.service_actor_version !== row.actor_version ||
    row.configured_binding_version === null ||
    row.configured_binding_version !== row.binding_version ||
    row.service_actor_capabilities_json === null ||
    row.service_actor_capabilities_json !== row.actor_capabilities ||
    row.payload_sha256 === null ||
    row.run_payload_sha256 !== row.payload_sha256 ||
    row.fence_version !== execution.fenceVersion ||
    row.run_fence !== execution.fenceVersion ||
    row.job_lease_until === null ||
    row.run_lease_until !== row.job_lease_until ||
    !Number.isFinite(Date.parse(row.job_lease_until)) ||
    Date.parse(row.job_lease_until) <= now
  )
    reject();

  parseCapabilities(row.actor_capabilities, canonicalCapability);
  const payload = parseJobPayload(row.payload_json);
  if (jobPayloadHash(row.payload_json) !== row.payload_sha256) reject();
  assertPayloadTarget(payload, expected.payloadTarget);

  return {
    jobId: row.id,
    runId: row.run_id,
    tenantId: execution.tenantId,
    deploymentId: execution.deploymentId,
    kind: expected.kind as DurableJobKind,
    requiredCapability: canonicalCapability,
    fenceVersion: execution.fenceVersion,
    serviceActorId: row.service_actor_id,
    serviceActorVersion: row.service_actor_version!,
    serviceActorCapabilitiesJson: row.service_actor_capabilities_json!,
    configuredBindingVersion: row.configured_binding_version!,
    leaseUntil: row.job_lease_until,
    payloadJson: row.payload_json,
    payload,
    payloadSha256: row.payload_sha256,
  };
}

/** Runtime assertion useful to callers that need to reject accidental map drift. */
export function isCanonicalDurableJobKind(kind: string): kind is DurableJobKind {
  return Object.prototype.hasOwnProperty.call(DURABLE_JOB_CAPABILITY_BY_KIND, kind);
}
