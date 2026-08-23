import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * A handler receives an execution envelope derived from the claimed database
 * row. The envelope is intentionally not a Principal and cannot be supplied
 * by a caller to obtain authority; the runner derives every field from the
 * deployment binding and fenced job/run pair.
 */
export type DurableJobExecutionContext = Readonly<{
  sqlite: DatabaseSync;
  jobId: string;
  runId: string;
  tenantId: string;
  deploymentId: string;
  requiredCapability: string;
  fenceVersion: number;
}>;

export type DurableJobCompletion = () => void | Promise<void>;

type DurableJobHandler = (
  payload: unknown,
  context: DurableJobExecutionContext,
) => void | Promise<void> | DurableJobCompletion;

type DurableSyncJobHandler = (
  payload: unknown,
  context: DurableJobExecutionContext,
) => void | (() => void);

export type DurableJobOutcome = Readonly<{
  jobId: string;
  jobRunId: string;
  outcome: 'succeeded' | 'retry_scheduled' | 'failed_terminal' | 'already_final';
  errorCode?:
    | 'HANDLER_UNAVAILABLE'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'LEASE_LOST'
    | 'PAYLOAD_INVALID'
    | 'HANDLER_FAILED';
  attempts: number;
}>;

type HandlerRegistry = Readonly<Record<string, DurableJobHandler>>;
type SyncHandlerRegistry = Readonly<Record<string, DurableSyncJobHandler>>;
type DurableJobErrorCode = NonNullable<DurableJobOutcome['errorCode']>;

const DURABLE_JOB_CAPABILITY_BY_KIND: Readonly<Record<string, string>> = Object.freeze({
  invoice_pdf: 'artifact.invoice.render',
  period_close_report: 'artifact.report.render',
  auto_draft: 'billing.draft.generate',
  accounting_pack_artifact_render: 'artifact.accounting_pack.render',
  temporary_upload_cleanup: 'storage.temporary.cleanup',
  localized_pdf_variant_render: 'artifact.localized_pdf.render',
  document_scan: 'document.scan',
  outbox_deliver: 'outbox.deliver',
  alert_dispatch: 'alert.dispatch',
  email_send: 'email.send',
  backup_verify: 'backup.verify',
});

type ClaimedJob = Readonly<{
  id: string;
  kind: string;
  attempts: number;
  max_attempts: number;
  payload_json: string;
  payload_sha256: string;
  tenant_id: string;
  deployment_id: string;
  correlation_id: string;
  required_capability: string;
  service_actor_id: string;
  fence_version: number;
  runId: string;
  leaseUntil: string;
}>;

type ServiceAuditExecution = Readonly<{
  jobId: string;
  runId: string;
  tenantId: string;
  deploymentId: string;
  correlationId: string;
  serviceActorId: string;
  capability: string;
}>;

/**
 * Append the immutable service provenance for a fenced phase transition.
 *
 * This deliberately bypasses the human-audit façade: the B5 audit trigger
 * validates the configured actor, job/run, capability, tenant, deployment and
 * active fence from the same connection before accepting the row.
 */
function recordServiceAudit(
  sqlite: DatabaseSync,
  execution: ServiceAuditExecution,
  action:
    | 'service_job.claim'
    | 'service_job.start'
    | 'service_job.succeed'
    | 'service_job.fail'
    | 'service_job.expire',
  details: Readonly<Record<string, unknown>> = {},
): void {
  const metadata = JSON.stringify({
    ...details,
    jobId: execution.jobId,
    jobRunId: execution.runId,
    serviceActorId: execution.serviceActorId,
    serviceCapability: execution.capability,
  });
  sqlite
    .prepare(
      `INSERT INTO audit_event(
         id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
         project_id,before_json,after_json,reason,correlation_id,metadata_json,
         audit_contract_version,actor_kind,service_actor_id,service_capability,
         job_id,job_run_id,tenant_id,deployment_id,provenance
       ) VALUES(?,NULL,?,'job_run',?,?,?,NULL,NULL,NULL,NULL,?,?,
         'B5-R4','service',?,?,?,?,?,?,'native')`,
    )
    .run(
      randomUUID(),
      action,
      execution.runId,
      now(),
      metadata,
      execution.correlationId,
      metadata,
      execution.serviceActorId,
      execution.capability,
      execution.jobId,
      execution.runId,
      execution.tenantId,
      execution.deploymentId,
    );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('PAYLOAD_INVALID');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  throw new Error('PAYLOAD_INVALID');
}

function payloadHash(payloadJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new Error('PAYLOAD_INVALID');
  }
  return createHash('sha256').update(canonicalJson(parsed)).digest('hex');
}

function now(): string {
  return new Date().toISOString();
}

function normalizeErrorCode(error: unknown): DurableJobErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message === 'HANDLER_UNAVAILABLE' ||
    message === 'DEPENDENCY_UNAVAILABLE' ||
    message === 'LEASE_LOST' ||
    message === 'PAYLOAD_INVALID' ||
    message === 'HANDLER_FAILED'
  )
    return message;
  return 'HANDLER_FAILED';
}

function activeBinding(
  sqlite: DatabaseSync,
  tenantId: string,
  deploymentId: string,
  capability: string,
): {
  service_actor_id: string;
  actor_version: number;
  capabilities_json: string;
  binding_version: number;
} {
  const binding = sqlite
    .prepare(
      `SELECT b.service_actor_id,s.version actor_version,s.capabilities_json,b.version binding_version
       FROM deployment_service_actor_binding b
       JOIN service_actor s ON s.id=b.service_actor_id
       WHERE b.singleton=1 AND b.tenant_id=? AND b.deployment_id=? AND s.status='active'`,
    )
    .get(tenantId, deploymentId) as
    | {
        service_actor_id: string;
        actor_version: number;
        capabilities_json: string;
        binding_version: number;
      }
    | undefined;
  if (!binding) throw new Error('DEPENDENCY_UNAVAILABLE');
  let capabilities: unknown;
  try {
    capabilities = JSON.parse(binding.capabilities_json);
  } catch {
    throw new Error('DEPENDENCY_UNAVAILABLE');
  }
  if (!Array.isArray(capabilities) || !capabilities.includes(capability))
    throw new Error('DEPENDENCY_UNAVAILABLE');
  return binding;
}

function deployment(sqlite: DatabaseSync): { tenantId: string; deploymentId: string } {
  const row = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string } | undefined;
  if (!row) throw new Error('DEPENDENCY_UNAVAILABLE');
  return { tenantId: row.tenant_id, deploymentId: row.deployment_id };
}

function claimDueJob(sqlite: DatabaseSync): ClaimedJob | null {
  const identity = deployment(sqlite);
  const timestamp = now();
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    // Expired claims are closed through the fenced job_run transition. Its
    // trigger projects the parent job back to queued before a new claim.
    const expired = sqlite
      .prepare(
        `SELECT j.id,j.active_job_run_id,r.tenant_id,r.deployment_id,r.correlation_id,
                r.service_actor_id,r.required_capability
         FROM job j JOIN job_run r ON r.id=j.active_job_run_id
         WHERE j.contract_version='b5-v1' AND j.state='claimed'
           AND j.lease_until IS NOT NULL AND j.lease_until<=?
         ORDER BY j.id LIMIT 1`,
      )
      .get(timestamp) as
      | {
          id: string;
          active_job_run_id: string;
          tenant_id: string;
          deployment_id: string;
          correlation_id: string;
          service_actor_id: string;
          required_capability: string;
        }
      | undefined;
    if (expired) {
      const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
      recordServiceAudit(
        sqlite,
        {
          jobId: expired.id,
          runId: expired.active_job_run_id,
          tenantId: expired.tenant_id,
          deploymentId: expired.deployment_id,
          correlationId: expired.correlation_id,
          serviceActorId: expired.service_actor_id,
          capability: expired.required_capability,
        },
        'service_job.expire',
        { outcome: 'retry_scheduled' },
      );
      const expiredRun = sqlite
        .prepare(
          `UPDATE job_run
           SET state='lease_expired',finished_at=?,outcome='retry_scheduled',
               error_code='LEASE_LOST',retry_run_after=?
           WHERE id=? AND state IN ('claimed','running')`,
        )
        .run(timestamp, retryAt, expired.active_job_run_id);
      if (expiredRun.changes !== 1) throw new Error('LEASE_LOST');
    }

    const job = sqlite
      .prepare(
        `SELECT id,kind,attempts,max_attempts,payload_json,payload_sha256,tenant_id,
                deployment_id,correlation_id,required_capability,fence_version
         FROM job
         WHERE contract_version='b5-v1' AND state='queued' AND run_after<=?
         ORDER BY run_after,id LIMIT 1`,
      )
      .get(timestamp) as
      | {
          id: string;
          kind: string;
          attempts: number;
          max_attempts: number;
          payload_json: string;
          payload_sha256: string | null;
          tenant_id: string | null;
          deployment_id: string | null;
          correlation_id: string | null;
          required_capability: string | null;
          fence_version: number;
        }
      | undefined;
    if (!job) {
      sqlite.exec('COMMIT');
      committed = true;
      return null;
    }
    if (
      !job.tenant_id ||
      !job.deployment_id ||
      !job.payload_sha256 ||
      !job.correlation_id ||
      !job.required_capability
    )
      throw new Error('DEPENDENCY_UNAVAILABLE');
    const expectedCapability = DURABLE_JOB_CAPABILITY_BY_KIND[job.kind];
    if (!expectedCapability || expectedCapability !== job.required_capability)
      throw new Error('DEPENDENCY_UNAVAILABLE');
    if (job.tenant_id !== identity.tenantId || job.deployment_id !== identity.deploymentId)
      throw new Error('DEPENDENCY_UNAVAILABLE');
    const binding = activeBinding(
      sqlite,
      identity.tenantId,
      identity.deploymentId,
      job.required_capability,
    );
    const runId = randomUUID();
    const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const nextFence = job.fence_version + 1;
    const changed = sqlite
      .prepare(
        `UPDATE job
         SET state='claimed',active_job_run_id=?,lease_until=?,attempts=attempts+1,
             fence_version=?,version=version+1,updated_at=?
         WHERE id=? AND contract_version='b5-v1' AND state='queued' AND fence_version=?`,
      )
      .run(runId, leaseUntil, nextFence, timestamp, job.id, job.fence_version);
    if (changed.changes !== 1) throw new Error('LEASE_LOST');
    sqlite
      .prepare(
        `INSERT INTO job_run(
           id,job_id,started_at,tenant_id,deployment_id,contract_version,kind,
           required_capability,service_actor_id,service_actor_version,
           service_actor_capabilities_json,configured_binding_version,correlation_id,
           payload_sha256,state,fence_version,fencing_token,lease_until
         ) VALUES(?,?,?,?,?,'b5-v1',?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        runId,
        job.id,
        timestamp,
        identity.tenantId,
        identity.deploymentId,
        job.kind,
        job.required_capability,
        binding.service_actor_id,
        binding.actor_version,
        binding.capabilities_json,
        binding.binding_version,
        job.correlation_id,
        job.payload_sha256,
        'claimed',
        nextFence,
        randomUUID(),
        leaseUntil,
      );
    recordServiceAudit(
      sqlite,
      {
        jobId: job.id,
        runId,
        tenantId: identity.tenantId,
        deploymentId: identity.deploymentId,
        correlationId: job.correlation_id,
        serviceActorId: binding.service_actor_id,
        capability: job.required_capability,
      },
      'service_job.claim',
      { kind: job.kind, fenceVersion: nextFence },
    );
    sqlite.exec('COMMIT');
    committed = true;
    return {
      id: job.id,
      kind: job.kind,
      attempts: job.attempts + 1,
      max_attempts: job.max_attempts,
      payload_json: job.payload_json,
      payload_sha256: job.payload_sha256,
      tenant_id: identity.tenantId,
      deployment_id: identity.deploymentId,
      correlation_id: job.correlation_id,
      required_capability: job.required_capability,
      service_actor_id: binding.service_actor_id,
      fence_version: nextFence,
      runId,
      leaseUntil,
    };
  } finally {
    if (!committed) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the claim failure.
      }
    }
  }
}

function startJob(sqlite: DatabaseSync, claimed: ClaimedJob): void {
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    const changed = sqlite
      .prepare(
        `UPDATE job_run SET state='running'
         WHERE id=? AND job_id=? AND contract_version='b5-v1'
           AND state='claimed' AND fence_version=?`,
      )
      .run(claimed.runId, claimed.id, claimed.fence_version);
    if (changed.changes !== 1) throw new Error('LEASE_LOST');
    recordServiceAudit(
      sqlite,
      {
        jobId: claimed.id,
        runId: claimed.runId,
        tenantId: claimed.tenant_id,
        deploymentId: claimed.deployment_id,
        correlationId: claimed.correlation_id,
        serviceActorId: claimed.service_actor_id,
        capability: claimed.required_capability,
      },
      'service_job.start',
      { kind: claimed.kind, fenceVersion: claimed.fence_version },
    );
    sqlite.exec('COMMIT');
    committed = true;
  } finally {
    if (!committed) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the start failure.
      }
    }
  }
}

function finishJob(
  sqlite: DatabaseSync,
  claimed: ClaimedJob,
  errorCode?: string,
): 'succeeded' | 'retry_scheduled' | 'failed_terminal' {
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    const current = sqlite
      .prepare(
        "SELECT attempts,max_attempts FROM job WHERE id=? AND active_job_run_id=? AND state='claimed'",
      )
      .get(claimed.id, claimed.runId) as { attempts: number; max_attempts: number } | undefined;
    if (!current) throw new Error('LEASE_LOST');
    const success = !errorCode;
    const terminal = !success && current.attempts >= current.max_attempts;
    const outcome = success ? 'succeeded' : terminal ? 'failed_terminal' : 'retry_scheduled';
    const nextRunAfter =
      terminal || success ? null : new Date(Date.now() + 5 * 60_000).toISOString();
    recordServiceAudit(
      sqlite,
      {
        jobId: claimed.id,
        runId: claimed.runId,
        tenantId: claimed.tenant_id,
        deploymentId: claimed.deployment_id,
        correlationId: claimed.correlation_id,
        serviceActorId: claimed.service_actor_id,
        capability: claimed.required_capability,
      },
      success ? 'service_job.succeed' : 'service_job.fail',
      {
        kind: claimed.kind,
        outcome,
        ...(errorCode ? { errorCode } : {}),
        fenceVersion: claimed.fence_version,
      },
    );
    const changed = sqlite
      .prepare(
        `UPDATE job_run
         SET state=?,finished_at=?,outcome=?,error_code=?,retry_run_after=?
         WHERE id=? AND job_id=? AND contract_version='b5-v1'
           AND state='running' AND fence_version=?`,
      )
      .run(
        success ? 'succeeded' : 'failed',
        now(),
        outcome,
        errorCode ?? null,
        nextRunAfter,
        claimed.runId,
        claimed.id,
        claimed.fence_version,
      );
    if (changed.changes !== 1) throw new Error('LEASE_LOST');
    sqlite.exec('COMMIT');
    committed = true;
    return outcome;
  } finally {
    if (!committed) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the completion failure.
      }
    }
  }
}

/** Claims only B5-v1 jobs bound to the active deployment service actor. */
export async function runDueConfiguredDurableJobs(
  sqlite: DatabaseSync,
  limit: number,
  handlers: HandlerRegistry = {},
): Promise<readonly DurableJobOutcome[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Job limit must be an integer from 1 to 100');
  const outcomes: DurableJobOutcome[] = [];
  for (let index = 0; index < limit; index += 1) {
    const claimed = claimDueJob(sqlite);
    if (!claimed) break;
    let failure: DurableJobErrorCode | undefined;
    let outcome: DurableJobOutcome['outcome'] = 'failed_terminal';
    let completion: DurableJobCompletion | undefined;
    try {
      startJob(sqlite, claimed);
      if (payloadHash(claimed.payload_json) !== claimed.payload_sha256)
        throw new Error('PAYLOAD_INVALID');
      const handler = handlers[claimed.kind];
      if (!handler) throw new Error('HANDLER_UNAVAILABLE');
      const payload = JSON.parse(claimed.payload_json) as unknown;
      const result = await handler(payload, {
        sqlite,
        jobId: claimed.id,
        runId: claimed.runId,
        tenantId: claimed.tenant_id,
        deploymentId: claimed.deployment_id,
        requiredCapability: claimed.required_capability,
        fenceVersion: claimed.fence_version,
      });
      if (typeof result === 'function') completion = result;
    } catch (error) {
      failure = normalizeErrorCode(error);
    }
    try {
      outcome = finishJob(sqlite, claimed, failure);
    } catch (error) {
      failure = normalizeErrorCode(error);
      outcome = 'failed_terminal';
    }
    if (!failure && outcome === 'succeeded' && completion) {
      // The job/run success transition is deliberately committed before an artifact
      // finalizer can mark its manifest ready.  This prevents a ready artifact from
      // preceding durable job success.  A finalizer failure is surfaced to the caller;
      // the variant remains recoverable through its fenced lifecycle.
      try {
        await completion();
      } catch {
        failure = 'HANDLER_FAILED';
      }
    }
    outcomes.push({
      jobId: claimed.id,
      jobRunId: claimed.runId,
      outcome,
      ...(failure ? { errorCode: failure } : {}),
      attempts: claimed.attempts,
    });
  }
  return outcomes;
}

/**
 * Synchronous adapter for legacy in-process schedulers. It uses exactly the
 * same claim/start/fence/finish contract as the async runner, while keeping
 * the historical `runDueJobs()` API synchronous for callers that execute
 * local handlers in a transaction loop.
 */
export function runDueConfiguredDurableJobsSync(
  sqlite: DatabaseSync,
  limit: number,
  handlers: SyncHandlerRegistry = {},
): readonly DurableJobOutcome[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Job limit must be an integer from 1 to 100');
  const outcomes: DurableJobOutcome[] = [];
  for (let index = 0; index < limit; index += 1) {
    const claimed = claimDueJob(sqlite);
    if (!claimed) break;
    let failure: DurableJobErrorCode | undefined;
    let outcome: DurableJobOutcome['outcome'] = 'failed_terminal';
    let completion: (() => void) | undefined;
    try {
      startJob(sqlite, claimed);
      if (payloadHash(claimed.payload_json) !== claimed.payload_sha256)
        throw new Error('PAYLOAD_INVALID');
      const handler = handlers[claimed.kind];
      if (!handler) throw new Error('HANDLER_UNAVAILABLE');
      const payload = JSON.parse(claimed.payload_json) as unknown;
      const result = handler(payload, {
        sqlite,
        jobId: claimed.id,
        runId: claimed.runId,
        tenantId: claimed.tenant_id,
        deploymentId: claimed.deployment_id,
        requiredCapability: claimed.required_capability,
        fenceVersion: claimed.fence_version,
      });
      if (typeof result === 'function') completion = result;
    } catch (error) {
      failure = normalizeErrorCode(error);
    }
    try {
      outcome = finishJob(sqlite, claimed, failure);
    } catch (error) {
      failure = normalizeErrorCode(error);
      outcome = 'failed_terminal';
    }
    if (!failure && outcome === 'succeeded' && completion) {
      try {
        completion();
      } catch {
        failure = 'HANDLER_FAILED';
      }
    }
    outcomes.push({
      jobId: claimed.id,
      jobRunId: claimed.runId,
      outcome,
      ...(failure ? { errorCode: failure } : {}),
      attempts: claimed.attempts,
    });
  }
  return outcomes;
}
