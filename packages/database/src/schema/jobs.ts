import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { lifecycle } from './shared.ts';

export const jobs = sqliteTable('job', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  state: text('state').notNull(),
  runAfter: text('run_after').notNull(),
  leaseUntil: text('lease_until'),
  attempts: integer('attempts').notNull().default(0),
  payloadJson: text('payload_json').notNull(),
  tenantId: text('tenant_id'),
  deploymentId: text('deployment_id'),
  contractVersion: text('contract_version').notNull(),
  payloadSha256: text('payload_sha256'),
  correlationId: text('correlation_id'),
  requiredCapability: text('required_capability'),
  activeJobRunId: text('active_job_run_id'),
  fenceVersion: integer('fence_version').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  lastErrorCode: text('last_error_code'),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});

export const outboxEvents = sqliteTable('outbox_event', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  payloadJson: text('payload_json').notNull(),
  availableAt: text('available_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  deliveredAt: text('delivered_at'),
  leaseUntil: text('lease_until'),
  lastError: text('last_error'),
  failedAt: text('failed_at'),
  createdAt: text('created_at').notNull(),
});

// The tables below are intentionally declared alongside the operational
// tables rather than hidden in generated output. This keeps Drizzle's model
// aligned with reviewed migrations 0001–0018 and makes schema review useful.

export const jobRuns = sqliteTable('job_run', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  outcome: text('outcome'),
  errorCode: text('error_code'),
  tenantId: text('tenant_id'),
  deploymentId: text('deployment_id'),
  contractVersion: text('contract_version').notNull(),
  kind: text('kind'),
  requiredCapability: text('required_capability'),
  serviceActorId: text('service_actor_id'),
  serviceActorVersion: integer('service_actor_version'),
  serviceActorCapabilitiesJson: text('service_actor_capabilities_json'),
  configuredBindingVersion: integer('configured_binding_version'),
  correlationId: text('correlation_id'),
  payloadSha256: text('payload_sha256'),
  state: text('state'),
  fenceVersion: integer('fence_version'),
  fencingToken: text('fencing_token'),
  leaseUntil: text('lease_until'),
  retryRunAfter: text('retry_run_after'),
});

export const scheduledJobs = sqliteTable('scheduled_job', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull().unique(),
  cronExpression: text('cron_expression').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  payloadJson: text('payload_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});
