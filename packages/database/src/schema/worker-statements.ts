import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Durable Worker compensation statement artifacts.  The reviewed additive migration owns the
 * SQL transition guards; keeping this declaration here makes the persistence contract visible to
 * schema consumers without allowing a Drizzle push to alter production.
 */
export const workerStatementArtifacts = sqliteTable(
  'worker_statement_artifact',
  {
    artifactId: text('artifact_id').primaryKey(),
    workerId: text('worker_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    deploymentId: text('deployment_id').notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    format: text('format').notNull(),
    templateVersion: text('template_version').notNull(),
    generationVersion: text('generation_version').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    snapshotHash: text('snapshot_hash').notNull(),
    status: text('status').notNull(),
    currentAttemptNumber: integer('current_attempt_number').notNull().default(1),
    semanticFilename: text('semantic_filename').notNull(),
    mediaType: text('media_type'),
    byteLength: integer('byte_length'),
    contentSha256: text('content_sha256'),
    storageKey: text('storage_key').notNull(),
    rendererVersion: text('renderer_version'),
    readyAt: text('ready_at'),
    errorCode: text('error_code'),
    retryable: integer('retryable', { mode: 'boolean' }),
    integrityBlocked: integer('integrity_blocked', { mode: 'boolean' }).notNull().default(false),
    maxAttempts: integer('max_attempts').notNull().default(5),
    requestKey: text('request_key'),
    requestedBy: text('requested_by').notNull(),
    requestedAt: text('requested_at').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    claimedJobId: text('claimed_job_id'),
    claimedJobRunId: text('claimed_job_run_id'),
    claimedLeaseFence: integer('claimed_lease_fence'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('worker_statement_artifact_request_key_uq')
      .on(table.tenantId, table.deploymentId, table.requestKey)
      .where(sql`${table.requestKey} IS NOT NULL`),
    uniqueIndex('worker_statement_artifact_active_identity_uq')
      .on(
        table.tenantId,
        table.deploymentId,
        table.workerId,
        table.periodStart,
        table.periodEnd,
        table.format,
        table.templateVersion,
        table.generationVersion,
        table.snapshotHash,
      )
      .where(sql`${table.status} IN ('queued','running','ready')`),
    index('worker_statement_artifact_worker_idx').on(
      table.tenantId,
      table.deploymentId,
      table.workerId,
      table.periodStart,
      table.periodEnd,
      table.status,
    ),
    index('worker_statement_artifact_status_idx').on(table.status, table.updatedAt),
  ],
);

export const workerStatementArtifactAttempts = sqliteTable(
  'worker_statement_artifact_attempt',
  {
    attemptId: text('attempt_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    jobId: text('job_id'),
    jobRunId: text('job_run_id'),
    leaseFence: integer('lease_fence'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    outcome: text('outcome'),
    failureClass: text('failure_class'),
    retryable: integer('retryable', { mode: 'boolean' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('worker_statement_artifact_attempt_uq').on(table.artifactId, table.attemptNumber),
    index('worker_statement_artifact_attempt_job_idx').on(table.jobId, table.jobRunId),
  ],
);

export const workerStatementRetryDecisions = sqliteTable(
  'worker_statement_retry_decision',
  {
    decisionId: text('decision_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    priorAttemptNumber: integer('prior_attempt_number').notNull(),
    nextAttemptNumber: integer('next_attempt_number').notNull(),
    failureCode: text('failure_code').notNull(),
    failureClass: text('failure_class').notNull(),
    retryable: integer('retryable', { mode: 'boolean' }).notNull(),
    requestedBy: text('requested_by').notNull(),
    requestedAt: text('requested_at').notNull(),
    decisionHash: text('decision_hash').notNull(),
  },
  (table) => [
    uniqueIndex('worker_statement_retry_decision_attempt_uq').on(
      table.artifactId,
      table.nextAttemptNumber,
    ),
    uniqueIndex('worker_statement_retry_decision_hash_uq').on(table.decisionHash),
  ],
);

export const workerStatementIntegrityIncidents = sqliteTable(
  'worker_statement_integrity_incident',
  {
    incidentId: text('incident_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    incidentKind: text('incident_kind').notNull(),
    expectedHash: text('expected_hash'),
    observedHash: text('observed_hash'),
    expectedLength: integer('expected_length'),
    observedLength: integer('observed_length'),
    storageKey: text('storage_key'),
    detectedAt: text('detected_at').notNull(),
    detectedBy: text('detected_by').notNull(),
    incidentHash: text('incident_hash').notNull(),
  },
  (table) => [
    uniqueIndex('worker_statement_integrity_incident_hash_uq').on(table.incidentHash),
    index('worker_statement_integrity_incident_artifact_idx').on(
      table.artifactId,
      table.detectedAt,
    ),
  ],
);
