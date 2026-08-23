import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

/**
 * Cross-migration contract tests deliberately use direct SQL.  The repository
 * tests exercise the happy path; these rows model a caller that has bypassed
 * the repository and attempts to substitute evidence, durable execution or an
 * owner snapshot at the SQLite boundary.
 */

const fixtures: B5LifecycleSecurityFixture[] = [];
const directories: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

type Sqlite = B5LifecycleSecurityFixture['sqlite'];

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function hash(value = 'b5-test'): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function expectSqliteFailure(action: () => unknown): void {
  expect(action).toThrow();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  throw new Error('unsupported test JSON');
}

function payloadHash(payload: string): string {
  // The SQLite B5 trigger hashes the exact persisted JSON bytes.  Keep this
  // helper separate from the runner's canonical payload hash so a test cannot
  // accidentally make a forged envelope look valid.
  return hash(payload);
}

function seedSeriesSubjectParents(sqlite: Sqlite): void {
  const now = new Date().toISOString();
  // These parent records model the existing v2 graph. Their command/evidence
  // parents are outside this focused test, so only construction disables FK
  // checks; the guards under test remain active for every attempted write.
  sqlite.exec('PRAGMA foreign_keys=OFF');
  try {
    sqlite
      .prepare(
        `INSERT INTO legal_entity_revision(
          revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
          legal_name,tax_identifier,registration_identifier,address_line1,address_line2,locality,
          region,postal_code,country_code,base_currency,timezone,effective_from,effective_to,
          revision_hash,created_at,created_by,command_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-legal-revision',
        'xm-legal-series',
        1,
        null,
        'test-tenant',
        'test-deployment',
        'XM Legal Entity',
        'XM-TAX',
        'XM-REG',
        'XM Street 1',
        null,
        'Madrid',
        'Madrid',
        '28001',
        'ES',
        'EUR',
        'Europe/Madrid',
        '2026-01-01',
        null,
        hash('xm-legal-revision'),
        now,
        'b5-owner',
        'xm-missing-command',
      );
    sqlite
      .prepare(
        `INSERT INTO report_definition(
          definition_id,family_id,display_name,authorization_contract,filter_contract_hash,
          query_version,column_schema_hash,semantic_filename_token,snapshot_mode,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-report-definition',
        'xm-family',
        'XM Report',
        'xm-authorize',
        hash('xm-filter'),
        'v1',
        hash('xm-columns'),
        'xm-report',
        'source_cut',
        now,
      );
    sqlite
      .prepare(
        `INSERT INTO report_template_version(
          template_version_id,definition_id,version_number,renderer_contract_hash,template_hash,
          required_formats,schema_hash,created_at
        ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-report-template',
        'xm-report-definition',
        1,
        hash('xm-renderer'),
        hash('xm-template'),
        '["pdf","xlsx"]',
        hash('xm-schema'),
        now,
      );
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON');
  }
}

type ArtifactKind = 'accounting' | 'report';

function seedSeriesAndRevision(sqlite: Sqlite, kind: ArtifactKind, suffix: string): string {
  const now = new Date().toISOString();
  const revisionId = `xm-${kind}-revision-${suffix}`;
  sqlite.exec('PRAGMA foreign_keys=OFF');
  try {
    if (kind === 'accounting') {
      sqlite
        .prepare(
          `INSERT INTO accounting_pack_series(
             series_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,
             period_start,period_end,tail_revision_id,current_authority_event_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          `xm-accounting-series-${suffix}`,
          'test-tenant',
          'test-deployment',
          'xm-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-02-01',
          '2026-02-28',
          null,
          null,
        );
      sqlite
        .prepare(
          `INSERT INTO accounting_pack_revision(
             revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
             legal_entity_revision_id,currency,timezone,period_start,period_end,source_cut_id,
             source_cut_hash,reconciliation_status,reconciliation_difference_minor,blocker_count,
             status,revision_hash,created_at,created_by,command_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          revisionId,
          `xm-accounting-series-${suffix}`,
          1,
          null,
          'test-tenant',
          'test-deployment',
          'xm-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-02-01',
          '2026-02-28',
          `xm-missing-cut-${suffix}`,
          hash(`xm-cut-${suffix}`),
          'CLEAN',
          0,
          0,
          'candidate',
          hash(`xm-accounting-revision-${suffix}`),
          now,
          'b5-owner',
          `xm-missing-command-${suffix}`,
        );
    } else {
      sqlite
        .prepare(
          `INSERT INTO period_report_series(
             series_id,definition_id,tenant_id,deployment_id,legal_entity_revision_id,currency,
             timezone,period_start,period_end,tail_revision_id,current_authority_event_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          `xm-report-series-${suffix}`,
          'xm-report-definition',
          'test-tenant',
          'test-deployment',
          'xm-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-02-01',
          '2026-02-28',
          null,
          null,
        );
      sqlite
        .prepare(
          `INSERT INTO period_report_revision(
             revision_id,series_id,definition_id,template_version_id,revision_number,
             predecessor_revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,
             timezone,period_start,period_end,source_manifest_id,source_manifest_hash,status,
             missing_activity_count,blocker_count,revision_hash,created_at,created_by,command_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          revisionId,
          `xm-report-series-${suffix}`,
          'xm-report-definition',
          'xm-report-template',
          1,
          null,
          'test-tenant',
          'test-deployment',
          'xm-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-02-01',
          '2026-02-28',
          `xm-missing-manifest-${suffix}`,
          hash(`xm-manifest-${suffix}`),
          'candidate',
          0,
          0,
          hash(`xm-report-revision-${suffix}`),
          now,
          'b5-owner',
          `xm-missing-report-command-${suffix}`,
        );
    }
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON');
  }
  return revisionId;
}

function insertArtifact(
  sqlite: Sqlite,
  kind: ArtifactKind,
  revisionId: string,
  artifactId: string,
  status: 'queued' | 'failed' = 'queued',
  attemptNumber = 1,
  generationVersion = 'xm-generation-v1',
): void {
  const now = new Date().toISOString();
  const table = kind === 'accounting' ? 'accounting_pack_artifact' : 'period_report_artifact';
  const semanticFilename = `${artifactId}.pdf`;
  sqlite
    .prepare(
      `INSERT INTO ${table}(
         artifact_id,revision_id,format,generation_version,status,current_attempt_number,
         semantic_filename,media_type,byte_length,content_sha256,storage_key,source_hash,
         renderer_version,ready_at,error_code,retryable,max_attempts
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      artifactId,
      revisionId,
      'pdf',
      generationVersion,
      status,
      attemptNumber,
      semanticFilename,
      null,
      null,
      null,
      `xm/${artifactId}.pdf`,
      hash(`xm-source-${artifactId}`),
      null,
      status === 'failed' ? now : null,
      status === 'failed' ? 'RENDER_FAILED' : null,
      status === 'failed' ? 1 : null,
      3,
    );
}

function insertClaimedRunningJob(
  sqlite: Sqlite,
  kind: 'accounting_pack_artifact_render' | 'period_close_report',
  artifactId: string,
  revisionId: string,
  format: string,
  generationVersion: string,
  requestedAttempt: number,
  suffix: string,
): { jobId: string; runId: string; fence: number; now: string } {
  const now = new Date().toISOString();
  const jobId = `xm-job-${suffix}`;
  const runId = `xm-run-${suffix}`;
  const fence = 1;
  const capability =
    kind === 'accounting_pack_artifact_render'
      ? 'artifact.accounting_pack.render'
      : 'artifact.report.render';
  const payload = JSON.stringify({
    artifactId,
    revisionId,
    format,
    generationVersion,
    requestedAttempt,
  });
  const payloadSha256 = payloadHash(payload);
  const binding = sqlite
    .prepare(
      `SELECT actor.id actor_id,actor.version actor_version,actor.capabilities_json,
              binding.version binding_version
       FROM deployment_service_actor_binding binding
       JOIN service_actor actor ON actor.id=binding.service_actor_id
       WHERE binding.singleton=1`,
    )
    .get() as {
    actor_id: string;
    actor_version: number;
    capabilities_json: string;
    binding_version: number;
  };
  sqlite
    .prepare(
      `INSERT INTO job(
         id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,
         version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,required_capability,
         active_job_run_id,fence_version,max_attempts,last_error_code
       ) VALUES(?,?,?,'queued',?,NULL,0,?,?,?,1,'test-tenant','test-deployment','b5-v1',?,?,?,NULL,0,5,NULL)`,
    )
    .run(
      jobId,
      kind,
      `${jobId}:key`,
      now,
      payload,
      now,
      now,
      payloadSha256,
      `${jobId}:correlation`,
      capability,
    );
  const leaseUntil = new Date(Date.now() + 60_000).toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    // active_job_run_id is a deferred FK; claim, create the run and start it
    // in one transaction so the envelope is never visible half-constructed.
    sqlite
      .prepare(
        `UPDATE job SET state='claimed',active_job_run_id=?,lease_until=?,attempts=1,
           fence_version=?,version=version+1,updated_at=? WHERE id=?`,
      )
      .run(runId, leaseUntil, fence, now, jobId);
    sqlite
      .prepare(
        `INSERT INTO job_run(
           id,job_id,started_at,tenant_id,deployment_id,contract_version,kind,required_capability,
           service_actor_id,service_actor_version,service_actor_capabilities_json,configured_binding_version,
           correlation_id,payload_sha256,state,fence_version,fencing_token,lease_until
         ) VALUES(?,?,?,?,?,'b5-v1',?,?,?,?,?,?,?,?, 'claimed',?,?,?)`,
      )
      .run(
        runId,
        jobId,
        now,
        'test-tenant',
        'test-deployment',
        kind,
        capability,
        binding.actor_id,
        binding.actor_version,
        binding.capabilities_json,
        binding.binding_version,
        `${jobId}:correlation`,
        payloadSha256,
        fence,
        `${runId}:fence`,
        leaseUntil,
      );
    sqlite.prepare(`UPDATE job_run SET state='running' WHERE id=?`).run(runId);
    sqlite.exec('COMMIT');
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original fixture failure.
    }
    throw error;
  }
  return { jobId, runId, fence, now };
}

function insertRetryDecision(
  sqlite: Sqlite,
  kind: ArtifactKind,
  artifactId: string,
  revisionId: string,
  generationVersion = 'xm-generation-v1',
): void {
  const table =
    kind === 'accounting' ? 'accounting_pack_retry_decision' : 'period_report_retry_decision';
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO ${table}(
         decision_id,artifact_id,owner_revision_id,format,generation_version,prior_attempt_number,
         next_attempt_number,decision_kind,failure_class,retryable,not_before,max_attempts,
         principal_id,scheduler_id,command_id,created_at,decision_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `xm-retry-${kind}-${artifactId}`,
      artifactId,
      revisionId,
      'pdf',
      generationVersion,
      1,
      2,
      'scheduler',
      'transient',
      1,
      now,
      3,
      null,
      'xm-scheduler',
      null,
      now,
      hash(`xm-retry-${kind}-${artifactId}`),
    );
}

function insertSourceCutAndEvidence(sqlite: Sqlite): void {
  const now = new Date().toISOString();
  const cutId = 'xm-source-cut';
  const cutBlob = Buffer.from(`xm-source-cut:${cutId}`);
  const cutHash = hash(cutBlob.toString());
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run('xm-source-cut-evidence', 'source_cut', 'xm-v1', cutId, cutBlob, cutHash, now);
  sqlite.exec('PRAGMA foreign_keys=OFF');
  try {
    sqlite
      .prepare(
        `INSERT INTO finance_source_cut(
           cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
           change_sequence_high_watermark,cut_hash,created_at,created_by,command_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        cutId,
        'test-tenant',
        'test-deployment',
        'xm-legal-revision',
        'EUR',
        '2026-02-01',
        '2026-02-28',
        1,
        cutHash,
        now,
        'b5-owner',
        'xm-missing-cut-command',
      );
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON');
  }
  const itemBlob = Buffer.from('xm-source-item');
  const itemHash = hash(itemBlob.toString());
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      'xm-source-item-evidence',
      'invoice_subject',
      'xm-v1',
      'xm-source-item',
      itemBlob,
      itemHash,
      now,
    );
}

function insertReportManifest(sqlite: Sqlite): void {
  const now = new Date().toISOString();
  const blob = Buffer.from('xm-report-evidence');
  const evidenceHash = hash(blob.toString());
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      'xm-report-evidence',
      'invoice_subject',
      'xm-v1',
      'xm-report-item',
      blob,
      evidenceHash,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO report_source_manifest(
         manifest_id,report_revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,
         timezone,period_start,period_end,change_sequence_high_watermark,manifest_hash,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'xm-report-manifest',
      'xm-report-manifest-revision',
      'test-tenant',
      'test-deployment',
      'xm-legal-revision',
      'EUR',
      'Europe/Madrid',
      '2026-02-01',
      '2026-02-28',
      1,
      hash('xm-report-manifest'),
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO report_source_manifest_item(
         id,manifest_id,section_id,item_kind,item_id,item_version,effective_at,evidence_type,
         evidence_id,evidence_hash,amount_minor,currency,item_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'xm-report-item',
      'xm-report-manifest',
      'hours',
      'invoice',
      'xm-invoice',
      1,
      now,
      'invoice_subject',
      'xm-report-evidence',
      evidenceHash,
      100,
      'EUR',
      hash('xm-report-item'),
    );
}

function insertScopedCommand(
  sqlite: Sqlite,
  id: string,
  targetKind: string,
  targetId: string,
  operation: string,
  principalId = 'b5-owner',
): { commandHash: string } {
  const now = new Date().toISOString();
  const requestBlob = Buffer.from(`${id}:request`);
  const commandBlob = Buffer.from(`${id}:command`);
  const requestHash = hash(requestBlob.toString());
  const commandHash = hash(commandBlob.toString());
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      `${id}:request-evidence`,
      'finance_request',
      'xm-v1',
      `${id}:request`,
      requestBlob,
      requestHash,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      `${id}:command-evidence`,
      'finance_command',
      'xm-v1',
      `${id}:command`,
      commandBlob,
      commandHash,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_command(
         command_id,request_hash,command_hash,tenant_id,deployment_id,operation,idempotency_key,
         principal_id,effective_at,target_kind,target_semantic_id,amount_minor,currency,payload_hash,
         session_id_hash,state,completed_at,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      requestHash,
      commandHash,
      'test-tenant',
      'test-deployment',
      operation,
      `${id}:idempotency`,
      principalId,
      now,
      targetKind,
      targetId,
      null,
      null,
      hash(`${id}:payload`),
      hash(`${id}:session`),
      'completed',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_command_target(
         command_id,target_kind,target_semantic_id,target_contract_version
       ) VALUES(?,?,?,?)`,
    )
    .run(
      id,
      targetKind,
      targetId,
      targetKind === 'accounting_pack_revision_snapshot'
        ? 'accounting-pack-revision-snapshot-v1'
        : targetKind === 'legal_entity_revision_bridge'
          ? 'legal-entity-revision-bridge-v1'
          : 'accounting-pack-legacy-run-bridge-v1',
    );
  return { commandHash };
}

function insertScopedAudit(
  sqlite: Sqlite,
  id: string,
  commandId: string,
  action: string,
  entityType: string,
  entityId: string,
  actorId = 'b5-owner',
): void {
  const now = new Date().toISOString();
  const command = sqlite
    .prepare(
      `SELECT command_hash,target_kind,target_semantic_id
       FROM finance_command WHERE command_id=?`,
    )
    .get(commandId) as {
    command_hash: string;
    target_kind: string;
    target_semantic_id: string;
  };
  const targetContractVersion =
    command.target_kind === 'accounting_pack_revision_snapshot'
      ? 'accounting-pack-revision-snapshot-v1'
      : command.target_kind === 'legal_entity_revision_bridge'
        ? 'legal-entity-revision-bridge-v1'
        : 'accounting-pack-legacy-run-bridge-v1';
  const details = JSON.stringify({
    command_id: commandId,
    command_hash: command.command_hash,
    target_kind: command.target_kind,
    target_semantic_id: command.target_semantic_id,
    target_contract_version: targetContractVersion,
  });
  sqlite
    .prepare(
      `INSERT INTO audit_event(
         id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
         audit_contract_version,actor_kind,tenant_id,deployment_id,correlation_id,provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      actorId,
      action,
      entityType,
      entityId,
      now,
      details,
      'B5-R4',
      'user',
      'test-tenant',
      'test-deployment',
      commandId,
      'native',
    );
}

function emptyAccountingPackSnapshotJson(): string {
  return JSON.stringify({
    schema_version: 'accounting-pack-snapshot-v1',
    period_start: '2026-01-01',
    period_end: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    invoice_count: 0,
    payment_count: 0,
    worker_cost_count: 0,
    expense_count: 0,
    source_item_count: 0,
    invoice_source_count: 0,
    source_mismatch_count: 0,
    approved_time_entry_count: 0,
    approved_expense_count: 0,
    net_minor: 1000,
    tax_minor: 200,
    gross_minor: 1200,
    collected_minor: 1500,
    outstanding_minor: 400,
    worker_cost_minor: 200,
    expense_cost_minor: 100,
    direct_cost_minor: 300,
    contribution_minor: 700,
    invoice_register: [],
    collections: [],
    worker_costs: [],
    expense_register: [],
    ledger: [],
    totals: {
      currency: 'EUR',
      net_minor: 1000,
      tax_minor: 200,
      gross_minor: 1200,
      collected_minor: 1500,
      outstanding_minor: 400,
      worker_cost_minor: 200,
      expense_cost_minor: 100,
      direct_cost_minor: 300,
      contribution_minor: 700,
    },
    totals_by_currency: [],
    source_reconciliation: {
      invoice_source_count: 0,
      source_mismatch_count: 0,
      approved_time_entry_count: 0,
      approved_expense_count: 0,
      source_item_count: 0,
    },
    exact_reconciliation: {
      invoice_count: 0,
      payment_count: 0,
      worker_cost_count: 0,
      expense_count: 0,
      source_item_count: 0,
      net_minor: 1000,
      tax_minor: 200,
      gross_minor: 1200,
      collected_minor: 1500,
      outstanding_minor: 400,
      worker_cost_minor: 200,
      expense_cost_minor: 100,
      direct_cost_minor: 300,
      contribution_minor: 700,
    },
  });
}

function emptyAccountingPackReconciliationJson(): string {
  return JSON.stringify({
    schema_version: 'accounting-pack-reconciliation-v1',
    period_start: '2026-01-01',
    period_end: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    invoice_count: 0,
    payment_count: 0,
    worker_cost_count: 0,
    expense_count: 0,
    source_item_count: 0,
    invoice_source_count: 0,
    source_mismatch_count: 0,
    approved_time_entry_count: 0,
    approved_expense_count: 0,
    net_minor: 1000,
    tax_minor: 200,
    gross_minor: 1200,
    collected_minor: 1500,
    outstanding_minor: 400,
    worker_cost_minor: 200,
    expense_cost_minor: 100,
    direct_cost_minor: 300,
    contribution_minor: 700,
    checks: {},
    reconciles: true,
  });
}

function seedEmptySnapshotSubject(
  sqlite: Sqlite,
  insertSnapshot = true,
  idPrefix = 'xm-sealed',
  seriesIdOverride?: string,
): {
  cutId: string;
  cutHash: string;
  revisionId: string;
  seriesId: string;
  batchId: string;
} {
  const now = new Date().toISOString();
  const cutId = `${idPrefix}-cut`;
  const revisionId = `${idPrefix}-revision`;
  const seriesId = seriesIdOverride ?? `${idPrefix}-series`;
  const batchId = `${idPrefix}-batch`;
  const cutBlob = Buffer.from(`${idPrefix}-cut-canonical`);
  const cutHash = hash(cutBlob.toString());
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(`${idPrefix}-cut-evidence`, 'source_cut', 'xm-v1', cutId, cutBlob, cutHash, now);
  sqlite.exec('PRAGMA foreign_keys=OFF');
  try {
    sqlite
      .prepare(
        `INSERT INTO finance_source_cut(
           cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
           change_sequence_high_watermark,cut_hash,created_at,created_by,command_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        cutId,
        'test-tenant',
        'test-deployment',
        'xm-legal-revision',
        'EUR',
        '2026-01-01',
        '2026-02-01',
        0,
        cutHash,
        now,
        'b5-owner',
        `${idPrefix}-cut-command`,
      );
    if (!seriesIdOverride) {
      sqlite
        .prepare(
          `INSERT INTO accounting_pack_series(
             series_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,
             period_start,period_end,tail_revision_id,current_authority_event_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          seriesId,
          'test-tenant',
          'test-deployment',
          'xm-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-01-01',
          '2026-02-01',
          null,
          null,
        );
    }
    const predecessor = sqlite
      .prepare(
        `SELECT revision_id,revision_number
         FROM accounting_pack_revision WHERE series_id=? ORDER BY revision_number DESC LIMIT 1`,
      )
      .get(seriesId) as { revision_id: string; revision_number: number } | undefined;
    const revisionNumber = (predecessor?.revision_number ?? 0) + 1;
    sqlite
      .prepare(
        `INSERT INTO accounting_pack_revision(
           revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
           legal_entity_revision_id,currency,timezone,period_start,period_end,source_cut_id,
           source_cut_hash,reconciliation_status,reconciliation_difference_minor,blocker_count,
           status,revision_hash,created_at,created_by,command_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        revisionId,
        seriesId,
        revisionNumber,
        predecessor?.revision_id ?? null,
        'test-tenant',
        'test-deployment',
        'xm-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-01-01',
        '2026-02-01',
        cutId,
        cutHash,
        'CLEAN',
        0,
        0,
        'candidate',
        hash(`${idPrefix}-revision`),
        now,
        'b5-owner',
        `${idPrefix}-revision-command`,
      );
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON');
  }
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_source_cut_batch(
         id,revision_id,cut_id,change_sequence_high_watermark,cut_hash
       ) VALUES(?,?,?,?,?)`,
    )
    .run(batchId, revisionId, cutId, 0, cutHash);
  if (!insertSnapshot) return { cutId, cutHash, revisionId, seriesId, batchId };
  const snapshotJson = emptyAccountingPackSnapshotJson();
  const reconciliationJson = emptyAccountingPackReconciliationJson();
  insertScopedCommand(
    sqlite,
    `${idPrefix}-snapshot-command`,
    'accounting_pack_revision_snapshot',
    revisionId,
    'accounting_pack_revision_snapshot.create',
  );
  insertScopedAudit(
    sqlite,
    `${idPrefix}-snapshot-audit`,
    `${idPrefix}-snapshot-command`,
    'accounting_pack_revision_snapshot.create',
    'accounting_pack_revision_snapshot',
    revisionId,
  );
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_revision_snapshot(
         revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
         source_cut_id,source_cut_hash,snapshot_json,snapshot_sha256,reconciliation_json,
         reconciliation_sha256,command_id,audit_event_id,created_at,schema_version,timezone,
         invoice_count,payment_count,worker_cost_count,expense_count,source_item_count,
         invoice_source_count,source_mismatch_count,approved_time_entry_count,approved_expense_count,
         net_minor,tax_minor,gross_minor,collected_minor,outstanding_minor,
         worker_cost_minor,expense_cost_minor,direct_cost_minor,contribution_minor
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      revisionId,
      'test-tenant',
      'test-deployment',
      'xm-legal-revision',
      'EUR',
      '2026-01-01',
      '2026-02-01',
      cutId,
      cutHash,
      snapshotJson,
      hash(snapshotJson),
      reconciliationJson,
      hash(reconciliationJson),
      `${idPrefix}-snapshot-command`,
      `${idPrefix}-snapshot-audit`,
      now,
      'accounting-pack-snapshot-v1',
      'Europe/Madrid',
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1000,
      200,
      1200,
      1500,
      400,
      200,
      100,
      300,
      700,
    );
  return { cutId, cutHash, revisionId, seriesId, batchId };
}

function insertLegacyLegalEntity(sqlite: Sqlite, id = 'xm-legacy-entity'): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO legal_entity(
         id,code,legal_name,currency,billing_address,company_identifiers,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, 'XM-LE', 'XM Legal Entity', 'EUR', 'XM Address', '{}', now, now, 1);
}

function insertLegalEntityRevisionBridge(
  sqlite: Sqlite,
  bridgeId: string,
  commandId: string,
  auditId: string,
  actorId: string,
): void {
  const manifest = JSON.stringify({
    schema_version: 'legal-entity-identity-manifest-v1',
    tenant_id: 'test-tenant',
    deployment_id: 'test-deployment',
    legacy_legal_entity_id: 'xm-legacy-entity',
    legacy_legal_entity_code: 'XM-LE',
    legacy_legal_entity_name: 'XM Legal Entity',
    legacy_legal_entity_version: 1,
    legacy_currency: 'EUR',
    canonical_revision_id: 'xm-legal-revision',
    canonical_revision_hash: hash('xm-legal-revision'),
    canonical_currency: 'EUR',
    canonical_timezone: 'Europe/Madrid',
  });
  insertScopedCommand(
    sqlite,
    commandId,
    'legal_entity_revision_bridge',
    bridgeId,
    'legal_entity_revision_bridge.create',
  );
  insertScopedAudit(
    sqlite,
    auditId,
    commandId,
    'legal_entity_revision_bridge.create',
    'legal_entity_revision_bridge',
    bridgeId,
    actorId,
  );
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO legal_entity_revision_bridge(
         bridge_id,tenant_id,deployment_id,legacy_legal_entity_id,canonical_revision_id,
         legacy_legal_entity_code,legacy_legal_entity_name,legacy_legal_entity_version,
         legacy_currency,canonical_revision_hash,canonical_currency,canonical_timezone,
         identity_manifest_version,identity_manifest_json,identity_manifest_sha256,
         command_id,audit_event_id,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      bridgeId,
      'test-tenant',
      'test-deployment',
      'xm-legacy-entity',
      'xm-legal-revision',
      'XM-LE',
      'XM Legal Entity',
      1,
      'EUR',
      hash('xm-legal-revision'),
      'EUR',
      'Europe/Madrid',
      'legal-entity-identity-manifest-v1',
      manifest,
      hash(manifest),
      commandId,
      auditId,
      now,
    );
}

function insertAccountingPackSnapshotRecord(
  sqlite: Sqlite,
  subject: Readonly<{ cutId: string; cutHash: string; revisionId: string }>,
  commandId: string,
  auditId: string,
): void {
  const snapshotJson = emptyAccountingPackSnapshotJson();
  const reconciliationJson = emptyAccountingPackReconciliationJson();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_revision_snapshot(
         revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
         source_cut_id,source_cut_hash,snapshot_json,snapshot_sha256,reconciliation_json,
         reconciliation_sha256,command_id,audit_event_id,created_at,schema_version,timezone,
         invoice_count,payment_count,worker_cost_count,expense_count,source_item_count,
         invoice_source_count,source_mismatch_count,approved_time_entry_count,approved_expense_count,
         net_minor,tax_minor,gross_minor,collected_minor,outstanding_minor,
         worker_cost_minor,expense_cost_minor,direct_cost_minor,contribution_minor
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      subject.revisionId,
      'test-tenant',
      'test-deployment',
      'xm-legal-revision',
      'EUR',
      '2026-01-01',
      '2026-02-01',
      subject.cutId,
      subject.cutHash,
      snapshotJson,
      hash(snapshotJson),
      reconciliationJson,
      hash(reconciliationJson),
      commandId,
      auditId,
      now,
      'accounting-pack-snapshot-v1',
      'Europe/Madrid',
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1000,
      200,
      1200,
      1500,
      400,
      200,
      100,
      300,
      700,
    );
}

describe('B5 cross-migration hardening SQL', () => {
  it('requires the complete evidence identity tuple for report and finance source items', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    insertReportManifest(value.sqlite);
    insertSourceCutAndEvidence(value.sqlite);

    const reportInsert = value.sqlite.prepare(
      `INSERT INTO report_source_manifest_item(
         id,manifest_id,section_id,item_kind,item_id,item_version,effective_at,evidence_type,
         evidence_id,evidence_hash,amount_minor,currency,item_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const now = new Date().toISOString();
    const reportBase = [
      'xm-report-forged',
      'xm-report-manifest',
      'hours',
      'invoice',
      'xm-forged-invoice',
      1,
      now,
      'invoice_subject',
      'xm-report-evidence',
      hash('not-the-report-evidence'),
      100,
      'EUR',
      hash('xm-report-forged'),
    ] as const;
    expectSqliteFailure(() => reportInsert.run(...reportBase));
    expectSqliteFailure(() =>
      reportInsert.run(
        'xm-report-forged-type',
        'xm-report-manifest',
        'hours',
        'invoice',
        'xm-forged-invoice-type',
        1,
        now,
        'source_cut',
        'xm-report-evidence',
        hash('xm-report-evidence'),
        100,
        'EUR',
        hash('xm-report-forged-type'),
      ),
    );

    const financeInsert = value.sqlite.prepare(
      `INSERT INTO finance_source_cut_item(
         id,cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_id,
         evidence_hash,amount_minor,currency,item_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const financeBase = [
      'xm-source-item-forged',
      'xm-source-cut',
      'invoice',
      'xm-source-item',
      1,
      now,
      'invoice_subject',
      'xm-source-item-evidence',
      hash('wrong-source-item-hash'),
      100,
      'EUR',
      hash('xm-source-item-forged'),
    ] as const;
    expectSqliteFailure(() => financeInsert.run(...financeBase));
    expectSqliteFailure(() =>
      financeInsert.run(
        'xm-source-item-forged-type',
        'xm-source-cut',
        'invoice',
        'xm-source-item-type',
        1,
        now,
        'source_cut',
        'xm-source-item-evidence',
        hash('xm-source-item'),
        100,
        'EUR',
        hash('xm-source-item-forged-type'),
      ),
    );
  });

  it('rejects duplicate report required_formats at the SQL boundary', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO report_template_version(
             template_version_id,definition_id,version_number,renderer_contract_hash,template_hash,
             required_formats,schema_hash,created_at
           ) VALUES(?,?,?,?,?,?,?,?)`,
        )
        .run(
          'xm-report-template-duplicates',
          'xm-report-definition',
          2,
          hash('xm-renderer-duplicates'),
          hash('xm-template-duplicates'),
          '["pdf","pdf"]',
          hash('xm-schema-duplicates'),
          new Date().toISOString(),
        ),
    );
  });

  it('requires a current B5 job/run envelope for accounting and period-report attempts', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    const accountingRevision = seedSeriesAndRevision(value.sqlite, 'accounting', 'attempt');
    const reportRevision = seedSeriesAndRevision(value.sqlite, 'report', 'attempt');
    insertArtifact(value.sqlite, 'accounting', accountingRevision, 'xm-accounting-attempt');
    insertArtifact(value.sqlite, 'report', reportRevision, 'xm-report-attempt');

    const accountingAttempt = value.sqlite.prepare(
      `INSERT INTO accounting_pack_artifact_attempt(
         id,artifact_id,attempt_number,job_id,job_run_id,manual_command_id,retry_decision_id,
         lease_fence,started_at,finished_at,outcome,failure_class,retryable,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const reportAttempt = value.sqlite.prepare(
      `INSERT INTO period_report_artifact_attempt(
         id,artifact_id,attempt_number,job_id,job_run_id,manual_command_id,retry_decision_id,
         lease_fence,started_at,finished_at,outcome,failure_class,retryable,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const now = new Date().toISOString();

    // A valid B5 envelope for the other artifact family cannot be reused.
    const wrongFamilyJob = insertClaimedRunningJob(
      value.sqlite,
      'period_close_report',
      'xm-report-attempt',
      reportRevision,
      'pdf',
      'xm-generation-v1',
      1,
      'wrong-family',
    );
    expectSqliteFailure(() =>
      accountingAttempt.run(
        'xm-accounting-wrong-family',
        'xm-accounting-attempt',
        1,
        wrongFamilyJob.jobId,
        wrongFamilyJob.runId,
        null,
        null,
        wrongFamilyJob.fence,
        now,
        null,
        null,
        null,
        null,
        now,
      ),
    );
    // Attempt rows are terminal immutable evidence. A caller cannot publish
    // an outcome-less row and later reinterpret it as a successful render.
    expectSqliteFailure(() =>
      accountingAttempt.run(
        'xm-accounting-open-attempt',
        'xm-accounting-attempt',
        1,
        validAccountingJob.jobId,
        validAccountingJob.runId,
        null,
        null,
        validAccountingJob.fence,
        now,
        null,
        null,
        null,
        null,
        now,
      ),
    );

    const validAccountingJob = insertClaimedRunningJob(
      value.sqlite,
      'accounting_pack_artifact_render',
      'xm-accounting-attempt',
      accountingRevision,
      'pdf',
      'xm-generation-v1',
      1,
      'accounting-valid',
    );
    expectSqliteFailure(() =>
      accountingAttempt.run(
        'xm-accounting-wrong-fence',
        'xm-accounting-attempt',
        1,
        validAccountingJob.jobId,
        validAccountingJob.runId,
        null,
        null,
        validAccountingJob.fence + 1,
        now,
        null,
        null,
        null,
        null,
        now,
      ),
    );

    const validReportJob = insertClaimedRunningJob(
      value.sqlite,
      'period_close_report',
      'xm-report-attempt',
      reportRevision,
      'pdf',
      'xm-generation-v1',
      1,
      'report-valid',
    );
    expectSqliteFailure(() =>
      reportAttempt.run(
        'xm-report-wrong-attempt',
        'xm-report-attempt',
        2,
        validReportJob.jobId,
        validReportJob.runId,
        null,
        null,
        validReportJob.fence,
        now,
        null,
        null,
        null,
        null,
        now,
      ),
    );
    expectSqliteFailure(() =>
      reportAttempt.run(
        'xm-report-forged-run',
        'xm-report-attempt',
        1,
        validReportJob.jobId,
        'xm-run-does-not-exist',
        null,
        null,
        validReportJob.fence,
        now,
        null,
        null,
        null,
        null,
        now,
      ),
    );
    expectSqliteFailure(() =>
      reportAttempt.run(
        'xm-report-open-attempt',
        'xm-report-attempt',
        1,
        validReportJob.jobId,
        validReportJob.runId,
        null,
        null,
        validReportJob.fence,
        now,
        null,
        null,
        null,
        null,
        now,
      ),
    );
  });

  it('rejects queued/running and failed/queued transitions without the current fenced attempt or retry decision', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    const accountingRevision = seedSeriesAndRevision(value.sqlite, 'accounting', 'transition');
    const reportRevision = seedSeriesAndRevision(value.sqlite, 'report', 'transition');
    insertArtifact(value.sqlite, 'accounting', accountingRevision, 'xm-accounting-transition');
    insertArtifact(value.sqlite, 'report', reportRevision, 'xm-report-transition');
    const accountingUpdate = value.sqlite.prepare(
      `UPDATE accounting_pack_artifact SET status=?,current_attempt_number=? WHERE artifact_id=?`,
    );
    const reportUpdate = value.sqlite.prepare(
      `UPDATE period_report_artifact SET status=?,current_attempt_number=? WHERE artifact_id=?`,
    );

    expectSqliteFailure(() => accountingUpdate.run('running', 1, 'xm-accounting-transition'));
    expectSqliteFailure(() => reportUpdate.run('running', 1, 'xm-report-transition'));

    const accountingRunningJob = insertClaimedRunningJob(
      value.sqlite,
      'accounting_pack_artifact_render',
      'xm-accounting-transition',
      accountingRevision,
      'pdf',
      'xm-generation-v1',
      1,
      'accounting-transition-valid',
    );
    const reportRunningJob = insertClaimedRunningJob(
      value.sqlite,
      'period_close_report',
      'xm-report-transition',
      reportRevision,
      'pdf',
      'xm-generation-v1',
      1,
      'report-transition-valid',
    );
    // A live, deployment-bound B5 job/run/fence is the only positive path.
    // The SQL guard derives this envelope from the payload; callers do not
    // supply an arbitrary claim object to the artifact row.
    expect(() => accountingUpdate.run('running', 1, 'xm-accounting-transition')).not.toThrow();
    expect(() => reportUpdate.run('running', 1, 'xm-report-transition')).not.toThrow();
    expect(accountingRunningJob.fence).toBe(1);
    expect(reportRunningJob.fence).toBe(1);

    // Seed failed rows through INSERT, then prove a caller cannot skip the
    // reviewed next-attempt decision or reuse the current attempt number.
    insertArtifact(
      value.sqlite,
      'accounting',
      accountingRevision,
      'xm-accounting-retry',
      'failed',
      1,
      'xm-generation-retry',
    );
    insertArtifact(
      value.sqlite,
      'report',
      reportRevision,
      'xm-report-retry',
      'failed',
      1,
      'xm-generation-retry',
    );
    expectSqliteFailure(() => accountingUpdate.run('queued', 1, 'xm-accounting-retry'));
    expectSqliteFailure(() => reportUpdate.run('queued', 1, 'xm-report-retry'));
    expectSqliteFailure(() => accountingUpdate.run('queued', 2, 'xm-accounting-retry'));
    expectSqliteFailure(() => reportUpdate.run('queued', 2, 'xm-report-retry'));

    insertRetryDecision(
      value.sqlite,
      'accounting',
      'xm-accounting-retry',
      accountingRevision,
      'xm-generation-retry',
    );
    insertRetryDecision(
      value.sqlite,
      'report',
      'xm-report-retry',
      reportRevision,
      'xm-generation-retry',
    );
    expect(() => accountingUpdate.run('queued', 2, 'xm-accounting-retry')).not.toThrow();
    expect(() => reportUpdate.run('queued', 2, 'xm-report-retry')).not.toThrow();
  });

  it('rejects integrity incidents whose owner, format, generation or attempt identity is substituted', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    const accountingRevision = seedSeriesAndRevision(value.sqlite, 'accounting', 'incident');
    const reportRevision = seedSeriesAndRevision(value.sqlite, 'report', 'incident');
    insertArtifact(value.sqlite, 'accounting', accountingRevision, 'xm-accounting-incident');
    insertArtifact(value.sqlite, 'report', reportRevision, 'xm-report-incident');

    const accountingIncident = value.sqlite.prepare(
      `INSERT INTO accounting_pack_integrity_incident(
         incident_id,artifact_id,owner_revision_id,format,generation_version,attempt_number,
         incident_kind,expected_hash,observed_hash,expected_length,observed_length,storage_key,
         detected_at,detected_by,command_id,incident_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const reportIncident = value.sqlite.prepare(
      `INSERT INTO period_report_integrity_incident(
         incident_id,artifact_id,owner_revision_id,format,generation_version,attempt_number,
         incident_kind,expected_hash,observed_hash,expected_length,observed_length,storage_key,
         detected_at,detected_by,command_id,incident_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const now = new Date().toISOString();
    const fields = {
      incidentKind: 'storage_verification_failed',
      expectedHash: hash('expected'),
      observedHash: hash('observed'),
      expectedLength: 100,
      observedLength: 90,
      storageKey: 'xm/incident.pdf',
    };
    const variants = [
      { owner: 'xm-other-owner', format: 'pdf', generation: 'xm-generation-v1', attempt: 1 },
      { owner: accountingRevision, format: 'json', generation: 'xm-generation-v1', attempt: 1 },
      { owner: accountingRevision, format: 'pdf', generation: 'xm-generation-v2', attempt: 1 },
      { owner: accountingRevision, format: 'pdf', generation: 'xm-generation-v1', attempt: 2 },
    ];
    for (const [index, variant] of variants.entries()) {
      expectSqliteFailure(() =>
        accountingIncident.run(
          `xm-accounting-incident-forged-${index}`,
          'xm-accounting-incident',
          variant.owner,
          variant.format,
          variant.generation,
          variant.attempt,
          fields.incidentKind,
          fields.expectedHash,
          fields.observedHash,
          fields.expectedLength,
          fields.observedLength,
          fields.storageKey,
          now,
          'b5-owner',
          null,
          hash(`xm-accounting-incident-forged-${index}`),
        ),
      );
    }
    for (const [index, variant] of variants.entries()) {
      expectSqliteFailure(() =>
        reportIncident.run(
          `xm-report-incident-forged-${index}`,
          'xm-report-incident',
          variant.owner === accountingRevision ? 'xm-other-owner' : variant.owner,
          variant.format,
          variant.generation,
          variant.attempt,
          fields.incidentKind,
          fields.expectedHash,
          fields.observedHash,
          fields.expectedLength,
          fields.observedLength,
          fields.storageKey,
          now,
          'b5-owner',
          null,
          hash(`xm-report-incident-forged-${index}`),
        ),
      );
    }
  });

  it('rejects a self-consistent localized snapshot that is not the canonical owner snapshot', () => {
    const value = fixture();
    const now = new Date().toISOString();
    const projectId = value.project.id;
    value.sqlite
      .prepare(
        `INSERT INTO invoice(
           id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
           created_at,updated_at,version,tenant_id,deployment_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-invoice-owner',
        projectId,
        null,
        'labor',
        'draft',
        'EUR',
        100,
        21,
        121,
        now,
        now,
        1,
        'test-tenant',
        'test-deployment',
      );
    const attackerSnapshot = JSON.stringify({ id: 'xm-invoice-owner', total_minor: 999999 });
    const attackerHash = hash(canonicalJson(JSON.parse(attackerSnapshot)));
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO localized_pdf_variant(
             variant_id,owner_type,owner_id,owner_revision_id,tenant_id,deployment_id,locale,locale_tag,
             document_tag,template_version,generation_version,snapshot_json,snapshot_hash,snapshot_hash_kind,
             status,current_attempt_number,attempt_number,semantic_filename,storage_key,max_attempts,
             request_key,requested_by,requested_at,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'canonical','queued',1,1,?,?,?,?,?,?,?)`,
        )
        .run(
          'xm-localized-forged-snapshot',
          'invoice',
          'xm-invoice-owner',
          'xm-invoice-owner:v1',
          'test-tenant',
          'test-deployment',
          'en',
          'en-US',
          'invoice',
          'template-v1',
          'generation-v1',
          attackerSnapshot,
          attackerHash,
          'invoice-xm-localized-forged.pdf',
          'localized-pdf/invoice/xm-invoice-owner/en-US/xm-localized-forged.pdf',
          5,
          null,
          'b5-owner',
          now,
          now,
        ),
    );
  });

  it('seals an empty source cut after canonical snapshot creation', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    const sealed = seedEmptySnapshotSubject(value.sqlite);
    const now = new Date().toISOString();
    const itemBlob = Buffer.from('xm-sealed-late-item');
    const itemEvidenceHash = hash(itemBlob.toString());
    value.sqlite
      .prepare(
        `INSERT INTO finance_hash_evidence(
           evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
         ) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-sealed-late-item-evidence',
        'invoice_subject',
        'xm-v1',
        'xm-sealed-late-item',
        itemBlob,
        itemEvidenceHash,
        now,
      );

    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO finance_source_cut_item(
             id,cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_id,
             evidence_hash,amount_minor,currency,item_hash
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'xm-sealed-late-item',
          sealed.cutId,
          'invoice',
          'xm-late-invoice',
          1,
          now,
          'invoice_subject',
          'xm-sealed-late-item-evidence',
          itemEvidenceHash,
          100,
          'EUR',
          hash('xm-sealed-late-item-row'),
        ),
    );
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO accounting_pack_source_cut_batch(
             id,revision_id,cut_id,change_sequence_high_watermark,cut_hash
           ) VALUES(?,?,?,?,?)`,
        )
        .run('xm-sealed-late-batch', sealed.revisionId, sealed.cutId, 1, sealed.cutHash),
    );
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO accounting_pack_source_cut_item(
             id,batch_id,source_cut_item_id,evidence_hash
           ) VALUES(?,?,?,?)`,
        )
        .run('xm-sealed-late-projection', sealed.batchId, 'xm-sealed-late-item', itemEvidenceHash),
    );
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM finance_source_cut_item').get(),
    ).toEqual({
      count: 0,
    });
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM accounting_pack_source_cut_batch').get(),
    ).toEqual({ count: 1 });
  });

  it('requires the native audit actor to equal the finance-command principal for all 0024 bridges', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    insertLegacyLegalEntity(value.sqlite);

    // Legal-entity bridge: command is otherwise valid, but the active human
    // recorded in the native audit event is not the command principal.
    expectSqliteFailure(() =>
      insertLegalEntityRevisionBridge(
        value.sqlite,
        'xm-actor-legal-bridge',
        'xm-actor-legal-command',
        'xm-actor-legal-audit',
        'b5-finance',
      ),
    );

    // Accounting-pack snapshot: keep the source cut and projection graph
    // coherent so only the actor/principal identity check is exercised.
    const snapshotSubject = seedEmptySnapshotSubject(value.sqlite, false);
    const mismatchedSnapshotSubject = seedEmptySnapshotSubject(
      value.sqlite,
      false,
      'xm-actor-mismatch',
      snapshotSubject.seriesId,
    );
    insertScopedCommand(
      value.sqlite,
      'xm-actor-snapshot-command',
      'accounting_pack_revision_snapshot',
      mismatchedSnapshotSubject.revisionId,
      'accounting_pack_revision_snapshot.create',
    );
    insertScopedAudit(
      value.sqlite,
      'xm-actor-snapshot-audit',
      'xm-actor-snapshot-command',
      'accounting_pack_revision_snapshot.create',
      'accounting_pack_revision_snapshot',
      mismatchedSnapshotSubject.revisionId,
      'b5-finance',
    );
    expectSqliteFailure(() =>
      insertAccountingPackSnapshotRecord(
        value.sqlite,
        mismatchedSnapshotSubject,
        'xm-actor-snapshot-command',
        'xm-actor-snapshot-audit',
      ),
    );

    // Legacy-run bridge: first create the canonical entity bridge and snapshot
    // with matching actors, then attack only the legacy bridge audit actor.
    insertLegalEntityRevisionBridge(
      value.sqlite,
      'xm-actor-valid-entity-bridge',
      'xm-actor-valid-entity-command',
      'xm-actor-valid-entity-audit',
      'b5-owner',
    );
    insertScopedCommand(
      value.sqlite,
      'xm-actor-valid-snapshot-command',
      'accounting_pack_revision_snapshot',
      snapshotSubject.revisionId,
      'accounting_pack_revision_snapshot.create',
    );
    insertScopedAudit(
      value.sqlite,
      'xm-actor-valid-snapshot-audit',
      'xm-actor-valid-snapshot-command',
      'accounting_pack_revision_snapshot.create',
      'accounting_pack_revision_snapshot',
      snapshotSubject.revisionId,
      'b5-owner',
    );
    insertAccountingPackSnapshotRecord(
      value.sqlite,
      snapshotSubject,
      'xm-actor-valid-snapshot-command',
      'xm-actor-valid-snapshot-audit',
    );
    const now = new Date().toISOString();
    const legacySnapshot = '{"legacy":true}';
    const legacyReconciliation = '{"differenceMinor":0}';
    value.sqlite
      .prepare(
        `INSERT INTO accounting_pack_run(
           id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,
           generated_by,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-actor-legacy-run',
        '2026-01-01',
        '2026-02-01',
        'xm-legacy-entity',
        'final',
        legacySnapshot,
        legacyReconciliation,
        'b5-owner',
        now,
        now,
      );
    insertScopedCommand(
      value.sqlite,
      'xm-actor-legacy-command',
      'accounting_pack_legacy_run_bridge',
      'xm-actor-legacy-bridge',
      'accounting_pack_legacy_run_bridge.create',
    );
    insertScopedAudit(
      value.sqlite,
      'xm-actor-legacy-audit',
      'xm-actor-legacy-command',
      'accounting_pack_legacy_run_bridge.create',
      'accounting_pack_legacy_run_bridge',
      'xm-actor-legacy-bridge',
      'b5-finance',
    );
    const snapshot = value.sqlite
      .prepare(
        `SELECT snapshot_sha256,reconciliation_sha256
         FROM accounting_pack_revision_snapshot WHERE revision_id=?`,
      )
      .get(snapshotSubject.revisionId) as {
      snapshot_sha256: string;
      reconciliation_sha256: string;
    };
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO accounting_pack_legacy_run_bridge(
             bridge_id,tenant_id,deployment_id,legacy_run_id,legacy_legal_entity_id,revision_id,
             legal_entity_revision_id,currency,period_start,period_end,source_cut_id,source_cut_hash,
             timezone,legacy_snapshot_sha256,legacy_reconciliation_sha256,snapshot_sha256,
             reconciliation_sha256,command_id,audit_event_id,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'xm-actor-legacy-bridge',
          'test-tenant',
          'test-deployment',
          'xm-actor-legacy-run',
          'xm-legacy-entity',
          snapshotSubject.revisionId,
          'xm-legal-revision',
          'EUR',
          '2026-01-01',
          '2026-02-01',
          snapshotSubject.cutId,
          snapshotSubject.cutHash,
          'Europe/Madrid',
          hash(legacySnapshot),
          hash(legacyReconciliation),
          snapshot.snapshot_sha256,
          snapshot.reconciliation_sha256,
          'xm-actor-legacy-command',
          'xm-actor-legacy-audit',
          now,
        ),
    );
  });

  it('rejects native audit writes by an inactive human actor', () => {
    const value = fixture();
    const now = new Date().toISOString();
    value.sqlite
      .prepare(
        `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        'xm-inactive-user',
        'XM Inactive User',
        'xm-inactive@example.test',
        'owner_admin',
        'suspended',
        now,
        now,
      );
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO audit_event(
             id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
             audit_contract_version,actor_kind,tenant_id,deployment_id,correlation_id,provenance
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'xm-inactive-audit',
          'xm-inactive-user',
          'lifecycle.transition',
          'client',
          value.client.id,
          now,
          '{}',
          'B5-R4',
          'user',
          'test-tenant',
          'test-deployment',
          'xm-inactive-audit-correlation',
          'native',
        ),
    );
  });

  it('migrates a realistic populated schema-18 database through schema 26 without losing legacy rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-xm-schema18-'));
    directories.push(directory);
    const dbPath = join(directory, 'app.db');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
    const migrationDirectory = resolve(process.cwd(), 'migrations');
    for (const file of readdirSync(migrationDirectory)
      .filter((candidate) => /^\d{4}_.+\.sql$/u.test(candidate))
      .sort()
      .filter((candidate) => Number(candidate.slice(0, 4)) <= 18))
      legacy.exec(readFileSync(join(migrationDirectory, file), 'utf8'));
    const now = new Date().toISOString();
    legacy
      .prepare(
        `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
         VALUES('xm-legacy-owner','XM Legacy Owner','xm-legacy-owner@example.test','owner_admin','active',?,?)`,
      )
      .run(now, now);
    legacy
      .prepare(
        `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at)
         VALUES('xm-legacy-client','XM-C-001','XM Legacy Client','XM Legacy Client','active','EUR','UTC',?,?)`,
      )
      .run(now, now);
    legacy
      .prepare(
        `INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at)
         VALUES('xm-legacy-project','XM-C-001-P-001','xm-legacy-client','XM Legacy Project','UTC','EUR','active','tm',?,?)`,
      )
      .run(now, now);
    legacy
      .prepare(
        `INSERT INTO invoice(
           id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
           created_at,updated_at,version
         ) VALUES('xm-legacy-invoice','xm-legacy-project',NULL,'labor','draft','EUR',0,0,0,?,?,1)`,
      )
      .run(now, now);
    legacy.close();

    const previousTenant = process.env.JA_TENANT_ID;
    const previousDeployment = process.env.JA_DEPLOYMENT_ID;
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    let migrated: ReturnType<typeof createDatabase>['sqlite'] | undefined;
    try {
      migrated = createDatabase(dbPath).sqlite;
      expect(
        (
          migrated.prepare('SELECT max(version) version FROM schema_migration').get() as {
            version: number;
          }
        ).version,
      ).toBe(27);
      expect(
        migrated.prepare('SELECT legal_name FROM client WHERE id=?').get('xm-legacy-client'),
      ).toEqual({
        legal_name: 'XM Legacy Client',
      });
      expect(
        migrated.prepare('SELECT name FROM project WHERE id=?').get('xm-legacy-project'),
      ).toEqual({
        name: 'XM Legacy Project',
      });
      expect(
        migrated.prepare('SELECT id FROM invoice WHERE id=?').get('xm-legacy-invoice'),
      ).toEqual({
        id: 'xm-legacy-invoice',
      });
      expect((migrated.prepare('PRAGMA foreign_key_check').all() as unknown[]).length).toBe(0);
      expect(
        migrated
          .prepare(
            `SELECT count(*) count FROM sqlite_master
             WHERE type='table' AND name IN('accounting_pack_revision_snapshot','localized_pdf_variant')`,
          )
          .get(),
      ).toEqual({ count: 2 });
    } finally {
      migrated?.close();
      if (previousTenant === undefined) delete process.env.JA_TENANT_ID;
      else process.env.JA_TENANT_ID = previousTenant;
      if (previousDeployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
      else process.env.JA_DEPLOYMENT_ID = previousDeployment;
    }
  });
});
