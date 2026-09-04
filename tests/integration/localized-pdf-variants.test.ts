import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  LocalizedPdfRepository,
  PortalRepository,
  V3Repository,
  createDatabase,
  integrityCheck,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import type { LocalizedPdfExecution, LocalizedPdfVariant } from '@ja/database';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterAll(() => restoreIdentity?.());

afterEach(() => {
  for (const directory of directories.splice(0)) {
    // The database handles are closed by each test before cleanup.
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Keep cleanup best-effort after an assertion failure.
    }
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  const now = new Date().toISOString();
  for (const [id, role] of [
    ['owner', 'owner_admin'],
    ['finance', 'finance_admin'],
    ['worker', 'worker'],
  ] as const) {
    sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        id,
        id,
        role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.test`,
        role,
        'active',
        now,
        now,
      );
  }
  seedB5ServiceActorBinding(sqlite, 'owner');
  sqlite
    .prepare(
      'INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'client',
      'C-0001',
      'Localized Client',
      'Localized Client',
      'active',
      'EUR',
      'UTC',
      now,
      now,
    );
  sqlite
    .prepare(
      'INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'project',
      'C-0001-P-001',
      'client',
      'Localized Project',
      'UTC',
      'EUR',
      'active',
      'tm',
      now,
      now,
    );
  sqlite
    .prepare(
      'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('assignment-worker', 'project', 'worker', 'worker', '2026-01-01', '2026-12-31', now, now);
  sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
         issued_at,created_at,updated_at,snapshot_json,tenant_id,deployment_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'invoice',
      'project',
      'INV-0001',
      'labor',
      'issued',
      'EUR',
      1000,
      210,
      1210,
      now,
      now,
      now,
      '{"total":1210,"subtotal":1000,"locale":"pt-BR"}',
      'test-tenant',
      'test-deployment',
    );
  sqlite
    .prepare(
      `INSERT INTO daily_report(
         id,project_id,worker_id,work_date,summary,approval_state,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run('daily', 'project', 'worker', '2026-08-22', 'Field handover', 'draft', now, now);
  sqlite
    .prepare(
      `INSERT INTO technical_report(
         id,project_id,author_id,system_name,change_summary,safety_related,approval_state,created_at,updated_at,report_date,report_date_provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'technical',
      'project',
      'worker',
      'PLC line',
      'Timing investigation',
      0,
      'draft',
      now,
      now,
      '2026-08-22',
      'native',
    );
  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
  const worker: Principal = { userId: 'worker', role: 'worker', projectIds: new Set(['project']) };
  const repository = new LocalizedPdfRepository(sqlite, {
    verify: (_storageKey, expected) =>
      expected
        ? {
            exists: true,
            byteLength: expected.byteLength,
            contentSha256: expected.contentSha256,
            mediaType: 'application/pdf',
            magicValid: true,
          }
        : { exists: false, byteLength: null, contentSha256: null },
  });
  return { sqlite, repository, owner, finance, worker };
}

function stepUpPrincipal(sqlite: DatabaseSync, principal: Principal, suffix: string): Principal {
  const timestamp = new Date().toISOString();
  const sessionId = `localized-pdf-${principal.userId}-${suffix}`;
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      principal.userId,
      new Date(Date.now() + 60 * 60_000).toISOString(),
      timestamp,
      timestamp,
      timestamp,
    );
  return { ...principal, sessionId };
}

/** Claim through the real B5 runner so repository transitions never use forged execution IDs. */
function claimVariant(
  sqlite: DatabaseSync,
  repository: LocalizedPdfRepository,
  variant: LocalizedPdfVariant,
  afterClaim?: (execution: LocalizedPdfExecution) => void,
): LocalizedPdfExecution {
  const v3 = new V3Repository(sqlite);
  let execution: LocalizedPdfExecution | undefined;
  v3.enqueueJob(
    'localized_pdf_variant_render',
    `test-localized-pdf:${variant.variantId}:attempt:${variant.currentAttemptNumber}`,
    { variantId: variant.variantId, requestedAttempt: variant.currentAttemptNumber },
  );
  const result = v3.runDueJobs(1, {
    localized_pdf_variant_render: (payload, context) => {
      const values = payload as { variantId?: unknown; requestedAttempt?: unknown };
      execution = {
        jobId: context.jobId,
        jobRunId: context.runId,
        leaseFence: context.fenceVersion,
      };
      repository.claimVariant(String(values.variantId), execution, Number(values.requestedAttempt));
      afterClaim?.(execution);
    },
  });
  expect(result).toMatchObject({ processed: 1, failed: 0 });
  if (!execution) throw new Error('B5 claim did not provide execution context');
  return execution;
}

/** Build an expired B5 run explicitly so lease recovery is exercised against terminal job state. */
function claimAndExpireVariant(
  sqlite: DatabaseSync,
  repository: LocalizedPdfRepository,
  variant: LocalizedPdfVariant,
): LocalizedPdfExecution {
  const v3 = new V3Repository(sqlite);
  const job = v3.enqueueJob(
    'localized_pdf_variant_render',
    `test-expired-localized-pdf:${variant.variantId}:attempt:${variant.currentAttemptNumber}`,
    { variantId: variant.variantId, requestedAttempt: variant.currentAttemptNumber },
  );
  const runId = `expired-run-${variant.variantId}`;
  const startedAt = '2020-01-01T00:00:00.000Z';
  const leaseUntil = '2020-01-01T00:05:00.000Z';
  const identity = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string };
  const jobRow = sqlite.prepare('SELECT * FROM job WHERE id=?').get(job.id) as Record<
    string,
    unknown
  >;
  const binding = sqlite
    .prepare(
      `SELECT b.service_actor_id,s.version actor_version,s.capabilities_json,b.version binding_version
       FROM deployment_service_actor_binding b JOIN service_actor s ON s.id=b.service_actor_id
       WHERE b.singleton=1`,
    )
    .get() as {
    service_actor_id: string;
    actor_version: number;
    capabilities_json: string;
    binding_version: number;
  };
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite
      .prepare(
        `UPDATE job SET state='claimed',active_job_run_id=?,lease_until=?,attempts=attempts+1,
           fence_version=1,version=version+1,updated_at=?
         WHERE id=? AND state='queued' AND fence_version=0`,
      )
      .run(runId, leaseUntil, startedAt, job.id);
    sqlite
      .prepare(
        `INSERT INTO job_run(
           id,job_id,started_at,tenant_id,deployment_id,contract_version,kind,required_capability,
           service_actor_id,service_actor_version,service_actor_capabilities_json,
           configured_binding_version,correlation_id,payload_sha256,state,fence_version,
           fencing_token,lease_until
         ) VALUES(?,?,?,?,?,'b5-v1',?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        runId,
        job.id,
        startedAt,
        identity.tenant_id,
        identity.deployment_id,
        jobRow.kind,
        jobRow.required_capability,
        binding.service_actor_id,
        binding.actor_version,
        binding.capabilities_json,
        binding.binding_version,
        jobRow.correlation_id,
        jobRow.payload_sha256,
        'claimed',
        1,
        `fence-${runId}`,
        leaseUntil,
      );
    sqlite.prepare("UPDATE job_run SET state='running' WHERE id=? AND state='claimed'").run(runId);
    sqlite.exec('COMMIT');
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original fixture error.
    }
    throw error;
  }
  const execution = { jobId: job.id, jobRunId: runId, leaseFence: 1 };
  repository.claimVariant(variant.variantId, execution, variant.currentAttemptNumber);
  sqlite
    .prepare(
      `UPDATE job_run SET state='lease_expired',finished_at=?,outcome='retry_scheduled',
         error_code='LEASE_LOST',retry_run_after=? WHERE id=? AND state='running'`,
    )
    .run('2020-01-01T00:06:00.000Z', '2099-01-01T00:00:00.000Z', runId);
  return execution;
}

describe('localized PDF variants', () => {
  it('migrates the strict variant/attempt/incident registry and preserves database integrity', () => {
    const { sqlite } = fixture();
    try {
      expect(integrityCheck(sqlite)).toBe('ok');
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'localized_pdf%'",
          )
          .all(),
      ).toHaveLength(4);
      expect(
        (
          sqlite.prepare('SELECT max(version) version FROM schema_migration').get() as {
            version: number;
          }
        ).version,
      ).toBe(35);
    } finally {
      sqlite.close();
    }
  });

  it('creates technical reports with an explicit native business date', () => {
    const { sqlite, owner } = fixture();
    try {
      const report = new PortalRepository(sqlite).createTechnicalReport(owner, {
        projectId: 'project',
        reportDate: '2026-08-22',
        systemName: 'PLC line',
        changeSummary: 'Recorded a timing investigation.',
        safetyRelated: false,
      });
      expect(
        sqlite
          .prepare('SELECT report_date,report_date_provenance FROM technical_report WHERE id=?')
          .get(report.id),
      ).toEqual({ report_date: '2026-08-22', report_date_provenance: 'native' });
      expect(() =>
        new PortalRepository(sqlite).createTechnicalReport(owner, {
          projectId: 'project',
          reportDate: 'not-a-date',
          systemName: 'PLC line',
          changeSummary: 'Invalid date must be rejected.',
          safetyRelated: false,
        }),
      ).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it('backfills a populated legacy invoice PDF as unverifiable without fabricating readiness', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const generatedAt = new Date().toISOString();
      sqlite
        .prepare(
          `UPDATE invoice
           SET pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,pdf_generated_at=?
           WHERE id=?`,
        )
        .run('../unsafe/legacy-invoice.pdf', 'c'.repeat(64), 128, generatedAt, 'invoice');

      sqlite.exec(`
        DROP TRIGGER IF EXISTS localized_pdf_owner_subject_guard;
        DROP TRIGGER IF EXISTS localized_pdf_owner_update_guard;
        DROP TRIGGER IF EXISTS localized_pdf_variant_attempt_insert_guard;
        DROP TRIGGER IF EXISTS localized_pdf_variant_attempt_no_update;
        DROP TRIGGER IF EXISTS localized_pdf_variant_attempt_no_delete;
        DROP TRIGGER IF EXISTS localized_pdf_variant_incident_subject_guard;
        DROP TRIGGER IF EXISTS localized_pdf_integrity_incident_no_update;
        DROP TRIGGER IF EXISTS localized_pdf_integrity_incident_no_delete;
        DROP TRIGGER IF EXISTS localized_pdf_retry_no_update;
        DROP TRIGGER IF EXISTS localized_pdf_retry_no_delete;
        DROP TRIGGER IF EXISTS localized_pdf_retry_subject_guard;
        DROP TRIGGER IF EXISTS localized_pdf_ready_manifest_guard;
        DROP TRIGGER IF EXISTS localized_pdf_variant_no_delete;
        DROP TRIGGER IF EXISTS localized_pdf_variant_nonqueued_insert_guard;
        DROP INDEX IF EXISTS localized_pdf_variant_active_identity_uq;
        DROP INDEX IF EXISTS localized_pdf_variant_request_key_uq;
        DROP INDEX IF EXISTS localized_pdf_variant_owner_idx;
        DROP INDEX IF EXISTS localized_pdf_variant_status_idx;
        DROP INDEX IF EXISTS localized_pdf_variant_attempt_uq;
        DROP INDEX IF EXISTS localized_pdf_integrity_variant_idx;
        DROP INDEX IF EXISTS localized_pdf_retry_variant_idx;
        DROP TABLE IF EXISTS localized_pdf_retry_decision;
        DROP TABLE localized_pdf_integrity_incident;
        DROP TABLE localized_pdf_variant_attempt;
        DROP TABLE localized_pdf_variant;
      `);
      sqlite.exec(
        readFileSync(resolve(process.cwd(), 'migrations/0023_localized_pdf_variants.sql'), 'utf8'),
      );

      const row = sqlite
        .prepare(
          `SELECT owner_type,locale,locale_tag,snapshot_hash_kind,status,storage_key,
                  content_sha256,byte_length,error_code,retryable,integrity_blocked,semantic_filename
           FROM localized_pdf_variant WHERE variant_id=?`,
        )
        .get('legacy-invoice:invoice') as Record<string, unknown>;
      expect(row).toMatchObject({
        owner_type: 'invoice',
        locale: 'pt',
        locale_tag: 'pt-BR',
        snapshot_hash_kind: 'legacy_verbatim',
        status: 'failed',
        storage_key: expect.stringMatching(/^localized-pdf\/quarantine\/legacy\/invoice\//u),
        content_sha256: null,
        byte_length: null,
        error_code: 'LEGACY_ARTIFACT_UNVERIFIABLE',
        retryable: 1,
        integrity_blocked: 1,
      });
      expect(String(row.semantic_filename)).toMatch(
        /^invoice-.*-pt-BR-template-legacy-generation-legacy\.pdf$/u,
      );
      expect(sqlite.prepare('SELECT count(*) n FROM localized_pdf_variant_attempt').get()).toEqual({
        n: 1,
      });
      expect(
        sqlite
          .prepare('SELECT pdf_storage_key,pdf_sha256,pdf_byte_length FROM invoice WHERE id=?')
          .get('invoice'),
      ).toEqual({
        pdf_storage_key: '../unsafe/legacy-invoice.pdf',
        pdf_sha256: 'c'.repeat(64),
        pdf_byte_length: 128,
      });
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          'legacy-invoice-download-session',
          'legacy-invoice-download-token',
          owner.userId,
          new Date(Date.now() + 60 * 60_000).toISOString(),
          now,
          now,
          now,
        );
      expect(() =>
        repository.resolveDownload(
          { ...owner, sessionId: 'legacy-invoice-download-session' },
          'legacy-invoice:invoice',
        ),
      ).toThrow(ConflictError);
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      sqlite.close();
    }
  });

  it('coexists in en/es/pt, derives a canonical snapshot, and is idempotent per identity', () => {
    const { sqlite, repository, finance, worker } = fixture();
    try {
      const financeWithStepUp = stepUpPrincipal(sqlite, finance, 'coexistence');
      // Issued planning/cash-flow dates are part of the immutable historical
      // invoice record after migration 0034. Localized rendering must consume
      // the sealed row rather than mutating it as test setup.
      expect(() =>
        sqlite
          .prepare('UPDATE invoice SET planned_issue_on=?,expected_collection_on=? WHERE id=?')
          .run('2026-09-01', '2026-09-30', 'invoice'),
      ).toThrow(/immutable/i);
      const variants = ['en', 'es', 'pt'].map((locale) =>
        repository.requestVariant(financeWithStepUp, {
          ownerType: 'invoice',
          ownerId: 'invoice',
          locale,
          templateVersion: 'invoice-v3',
          generationVersion: 'renderer-1',
        }),
      );
      expect(variants.map((variant) => variant.locale)).toEqual(['en', 'es', 'pt']);
      expect(new Set(variants.map((variant) => variant.snapshotHash)).size).toBe(1);
      expect(variants.every((variant) => variant.snapshotHashKind === 'canonical')).toBe(true);
      const invoiceSnapshot = JSON.parse(variants[0].snapshotJson) as Record<string, unknown>;
      expect(invoiceSnapshot).not.toHaveProperty('planned_issue_on');
      expect(invoiceSnapshot).not.toHaveProperty('expected_collection_on');
      expect(
        variants.every((variant) => variant.storageKey.includes('localized-pdf/invoice')),
      ).toBe(true);
      const duplicate = repository.requestVariant(financeWithStepUp, {
        ownerType: 'invoice',
        ownerId: 'invoice',
        locale: 'pt-BR',
        templateVersion: 'invoice-v3',
        generationVersion: 'renderer-1',
      });
      expect(duplicate.variantId).toBe(variants[2].variantId);
      expect(
        repository.listVariants(finance, { ownerType: 'invoice', ownerId: 'invoice' }),
      ).toHaveLength(3);

      const firstDaily = repository.requestVariant(worker, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      sqlite
        .prepare('UPDATE daily_report SET summary=?,version=version+1 WHERE id=?')
        .run('Revised handover', 'daily');
      const secondDaily = repository.requestVariant(worker, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      expect(secondDaily.variantId).not.toBe(firstDaily.variantId);
      expect(secondDaily.snapshotHash).not.toBe(firstDaily.snapshotHash);
    } finally {
      sqlite.close();
    }
  });

  it('isolates a failed locale, appends attempts, retries with the next number, and locks ready identity', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'es',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      claimVariant(sqlite, repository, variant, (execution) => {
        repository.failVariant(variant.variantId, {
          attemptNumber: 1,
          errorCode: 'RENDER_FAILED',
          execution,
        });
      });
      const failed = repository.listVariants(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
      })[0];
      expect(failed.status).toBe('failed');
      expect(failed.currentAttemptNumber).toBe(1);
      expect(sqlite.prepare('SELECT count(*) n FROM localized_pdf_variant_attempt').get()).toEqual({
        n: 1,
      });
      const retried = repository.retryVariant(owner, variant.variantId);
      expect(retried.status).toBe('queued');
      expect(retried.currentAttemptNumber).toBe(2);
      const secondExecution = claimVariant(sqlite, repository, retried);
      const ready = repository.completeVariant(variant.variantId, {
        attemptNumber: 2,
        contentSha256: 'a'.repeat(64),
        byteLength: 32,
        rendererVersion: 'renderer-2',
        execution: secondExecution,
      });
      expect(ready.status).toBe('ready');
      expect(() =>
        sqlite
          .prepare('UPDATE localized_pdf_variant SET owner_id=? WHERE variant_id=?')
          .run('other', variant.variantId),
      ).toThrow();
      expect(() => sqlite.prepare('DELETE FROM localized_pdf_variant_attempt').run()).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it('blocks integrity/path mismatches and keeps the failed locale unavailable', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'technical_report',
        ownerId: 'technical',
        locale: 'en',
        templateVersion: 'technical-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      const failed = repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'b'.repeat(64),
        byteLength: 10,
        storageKey: '../unsafe.pdf',
        rendererVersion: 'renderer-1',
        execution,
      });
      expect(failed.status).toBe('failed');
      expect(failed.integrityBlocked).toBe(true);
      expect(
        sqlite.prepare('SELECT count(*) n FROM localized_pdf_integrity_incident').get(),
      ).toEqual({ n: 1 });
      expect(() => repository.resolveDownload(owner, variant.variantId)).toThrow(ConflictError);
    } finally {
      sqlite.close();
    }
  });

  it('persists the durable execution binding and rejects stale completion fences', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      expect(() =>
        repository.completeVariant(variant.variantId, {
          attemptNumber: 1,
          contentSha256: 'd'.repeat(64),
          byteLength: 16,
          rendererVersion: 'renderer-1',
          execution: { ...execution, leaseFence: execution.leaseFence + 1 },
        }),
      ).toThrow(ConflictError);
      const ready = repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'd'.repeat(64),
        byteLength: 16,
        rendererVersion: 'renderer-1',
        execution,
      });
      expect(ready.status).toBe('ready');
      expect(
        sqlite
          .prepare(
            'SELECT job_id,job_run_id,lease_fence FROM localized_pdf_variant_attempt WHERE variant_id=?',
          )
          .get(variant.variantId),
      ).toEqual({
        job_id: execution.jobId,
        job_run_id: execution.jobRunId,
        lease_fence: execution.leaseFence,
      });
    } finally {
      sqlite.close();
    }
  });

  it('rejects forged execution envelopes and stale attempt claims without failing the retry', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'pt',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      expect(() =>
        repository.claimVariant(
          variant.variantId,
          { jobId: 'forged-job', jobRunId: 'forged-run', leaseFence: 1 },
          2,
        ),
      ).toThrow(ConflictError);
      expect(
        sqlite
          .prepare(
            'SELECT status,current_attempt_number FROM localized_pdf_variant WHERE variant_id=?',
          )
          .get(variant.variantId),
      ).toEqual({ status: 'queued', current_attempt_number: 1 });
      const execution = claimVariant(sqlite, repository, variant);
      expect(() =>
        repository.completeVariant(variant.variantId, {
          attemptNumber: 1,
          contentSha256: 'a'.repeat(64),
          byteLength: 16,
          rendererVersion: 'renderer-1',
          execution: { ...execution, jobId: 'forged-job' },
        }),
      ).toThrow(ConflictError);
      expect(
        sqlite
          .prepare('SELECT status FROM localized_pdf_variant WHERE variant_id=?')
          .get(variant.variantId),
      ).toEqual({ status: 'running' });
    } finally {
      sqlite.close();
    }
  });

  it('keeps non-retryable failures terminal and records the immutable decision', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'es',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      claimVariant(sqlite, repository, variant, (execution) => {
        repository.failVariant(variant.variantId, {
          attemptNumber: 1,
          errorCode: 'PERMANENT_RENDER_ERROR',
          retryable: false,
          execution,
        });
      });
      expect(() => repository.retryVariant(owner, variant.variantId)).toThrow(ConflictError);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO localized_pdf_retry_decision(
               decision_id,variant_id,prior_attempt_number,next_attempt_number,
               failure_code,failure_class,retryable,requested_by,requested_at,decision_hash
             ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            'forged-retry-decision',
            variant.variantId,
            1,
            2,
            'PERMANENT_RENDER_ERROR',
            'forged',
            1,
            'owner',
            new Date().toISOString(),
            '1'.repeat(64),
          ),
      ).toThrow();
      expect(
        sqlite
          .prepare('SELECT status,retryable FROM localized_pdf_variant WHERE variant_id=?')
          .get(variant.variantId),
      ).toEqual({ status: 'failed', retryable: 0 });
      expect(
        sqlite
          .prepare(
            "SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='localized_pdf_retry_decision'",
          )
          .get(),
      ).toEqual({ n: 1 });
    } finally {
      sqlite.close();
    }
  });

  it('recovers an abandoned running claim into a fenced retryable attempt', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'pt',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimAndExpireVariant(sqlite, repository, variant);
      const recoveryReference = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const recovered = repository.recoverAbandonedRunning(recoveryReference, 5 * 60 * 1000);
      expect(recovered).toHaveLength(1);
      expect(recovered[0]).toMatchObject({
        status: 'failed',
        errorCode: 'LEASE_EXPIRED',
        retryable: true,
      });
      expect(
        sqlite
          .prepare(
            'SELECT job_id,job_run_id,lease_fence,outcome,failure_class FROM localized_pdf_variant_attempt WHERE variant_id=?',
          )
          .get(variant.variantId),
      ).toEqual({
        job_id: execution.jobId,
        job_run_id: execution.jobRunId,
        lease_fence: execution.leaseFence,
        outcome: 'failed',
        failure_class: 'lease_expired',
      });
      expect(repository.retryVariant(owner, variant.variantId).currentAttemptNumber).toBe(2);
    } finally {
      sqlite.close();
    }
  });

  it('reconciles a running variant after its durable job exhausts all retries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'es',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const v3 = new V3Repository(sqlite);
      let claimedExecution: LocalizedPdfExecution | undefined;
      v3.enqueueJob(
        'localized_pdf_variant_render',
        `test-dead-letter-localized-pdf:${variant.variantId}:attempt:1`,
        { variantId: variant.variantId, requestedAttempt: 1 },
      );

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const result = v3.runDueJobs(1, {
          localized_pdf_variant_render: (_payload, context) => {
            if (attempt === 1) {
              claimedExecution = {
                jobId: context.jobId,
                jobRunId: context.runId,
                leaseFence: context.fenceVersion,
              };
              repository.claimVariant(variant.variantId, claimedExecution, 1);
            }
            throw new Error('HANDLER_FAILED');
          },
        });
        expect(result).toMatchObject({ processed: 0, failed: 1 });
        if (attempt < 5) vi.advanceTimersByTime(6 * 60 * 1000);
      }

      if (!claimedExecution) throw new Error('First durable attempt did not claim the variant');
      expect(
        sqlite.prepare('SELECT state,attempts FROM job WHERE id=?').get(claimedExecution.jobId),
      ).toEqual({ state: 'dead_letter', attempts: 5 });
      expect(
        sqlite
          .prepare('SELECT status FROM localized_pdf_variant WHERE variant_id=?')
          .get(variant.variantId),
      ).toEqual({ status: 'running' });

      vi.advanceTimersByTime(60 * 60 * 1000);
      const recovered = repository.recoverAbandonedRunning(new Date(), 5 * 60 * 1000);
      expect(recovered).toHaveLength(1);
      expect(recovered[0]).toMatchObject({
        status: 'failed',
        errorCode: 'DURABLE_JOB_DEAD_LETTER',
        retryable: true,
      });
      expect(
        sqlite
          .prepare(
            `SELECT job_id,job_run_id,lease_fence,outcome,failure_class
             FROM localized_pdf_variant_attempt WHERE variant_id=?`,
          )
          .get(variant.variantId),
      ).toEqual({
        job_id: claimedExecution.jobId,
        job_run_id: claimedExecution.jobRunId,
        lease_fence: claimedExecution.leaseFence,
        outcome: 'failed',
        failure_class: 'durable_job_dead_letter',
      });
      expect(repository.retryVariant(owner, variant.variantId).currentAttemptNumber).toBe(2);
    } finally {
      sqlite.close();
      vi.useRealTimers();
    }
  });

  it('scopes integrity incidents to the current attempt after a valid retry', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'technical_report',
        ownerId: 'technical',
        locale: 'en',
        templateVersion: 'technical-v1',
        generationVersion: 'renderer-1',
      });
      const firstExecution = claimVariant(sqlite, repository, variant);
      repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'e'.repeat(64),
        byteLength: 12,
        storageKey: '../bad.pdf',
        rendererVersion: 'renderer-1',
        execution: firstExecution,
      });
      const retried = repository.retryVariant(owner, variant.variantId);
      const secondExecution = claimVariant(sqlite, repository, retried);
      repository.completeVariant(variant.variantId, {
        attemptNumber: 2,
        contentSha256: 'f'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: secondExecution,
      });
      expect(() => repository.resolveDownload(owner, variant.variantId)).not.toThrow();
      const audit = sqlite
        .prepare(
          `SELECT action,entity_type,entity_id,details_json,tenant_id,deployment_id
           FROM audit_event WHERE action='artifact.access' AND entity_id=? ORDER BY occurred_at DESC LIMIT 1`,
        )
        .get('technical') as {
        action: string;
        entity_type: string;
        entity_id: string;
        details_json: string;
        tenant_id: string;
        deployment_id: string;
      };
      expect(audit).toMatchObject({
        action: 'artifact.access',
        entity_type: 'document',
        entity_id: 'technical',
        tenant_id: 'test-tenant',
        deployment_id: 'test-deployment',
      });
      expect(JSON.parse(audit.details_json)).toMatchObject({
        artifactType: 'localized_pdf',
        variantId: variant.variantId,
        ownerType: 'technical_report',
        ownerId: 'technical',
        actorUserId: 'owner',
        outcome: 'authorized',
      });
      const auditCount = (
        sqlite
          .prepare("SELECT count(*) n FROM audit_event WHERE action='artifact.access'")
          .get() as { n: number }
      ).n;
      const unauthorized: Principal = {
        userId: 'worker',
        role: 'project_manager',
        projectIds: new Set(),
      };
      expect(() => repository.resolveDownload(unauthorized, variant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(() => repository.resolveDownload(owner, 'missing-localized-pdf-variant')).toThrow(
        AccessDeniedError,
      );
      expect(
        (
          sqlite
            .prepare("SELECT count(*) n FROM audit_event WHERE action='artifact.access'")
            .get() as { n: number }
        ).n,
      ).toBe(auditCount);
      expect(
        sqlite.prepare('SELECT count(*) n FROM localized_pdf_integrity_incident').get(),
      ).toEqual({ n: 1 });
    } finally {
      sqlite.close();
    }
  });

  it('requires the current session step-up and records blocked access without leaking the artifact', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { sqlite, repository, owner } = fixture();
    try {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 60 * 60_000).toISOString();
      sqlite
        .prepare(
          'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(
          'owner-download-session',
          'owner-download-token',
          'owner',
          new Date(Date.now() - 1).toISOString(),
          now,
          now,
        );
      const sessionOwner: Principal = { ...owner, sessionId: 'owner-download-session' };
      const requestOwner = stepUpPrincipal(sqlite, owner, 'request');
      const variant = repository.requestVariant(requestOwner, {
        ownerType: 'invoice',
        ownerId: 'invoice',
        locale: 'en',
        templateVersion: 'invoice-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'a'.repeat(64),
        byteLength: 16,
        rendererVersion: 'renderer-1',
        execution,
      });

      expect(() => repository.resolveDownload(sessionOwner, variant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(
        sqlite
          .prepare(
            "SELECT action,entity_type,entity_id,details_json FROM audit_event WHERE action='artifact.access' ORDER BY rowid DESC LIMIT 1",
          )
          .get(),
      ).toMatchObject({
        action: 'artifact.access',
        entity_type: 'invoice',
        entity_id: 'invoice',
      });
      const blockedDetails = JSON.parse(
        (
          sqlite
            .prepare(
              "SELECT details_json FROM audit_event WHERE action='artifact.access' ORDER BY rowid DESC LIMIT 1",
            )
            .get() as { details_json: string }
        ).details_json,
      ) as Record<string, unknown>;
      expect(blockedDetails).toMatchObject({
        variantId: variant.variantId,
        locale: 'en',
        localeTag: 'en-US',
        outcome: 'blocked',
        reason: 'step_up_required',
      });

      sqlite
        .prepare('UPDATE session SET expires_at=? WHERE id=?')
        .run(future, sessionOwner.sessionId);
      expect(repository.resolveDownload(sessionOwner, variant.variantId)).toMatchObject({
        variantId: variant.variantId,
      });
      const authorizedDetails = JSON.parse(
        (
          sqlite
            .prepare(
              "SELECT details_json FROM audit_event WHERE action='artifact.access' ORDER BY rowid DESC LIMIT 1",
            )
            .get() as { details_json: string }
        ).details_json,
      ) as Record<string, unknown>;
      expect(authorizedDetails).toMatchObject({ outcome: 'authorized', actorUserId: 'owner' });
    } finally {
      sqlite.close();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('requires a storage verifier before publishing a ready artifact', () => {
    const { sqlite, owner } = fixture();
    try {
      const repository = new LocalizedPdfRepository(sqlite, {
        verify: () => ({ exists: false, byteLength: 16, contentSha256: 'd'.repeat(64) }),
      });
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      const result = repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'd'.repeat(64),
        byteLength: 16,
        rendererVersion: 'renderer-1',
        execution,
      });
      expect(result.status).toBe('failed');
      expect(result.integrityBlocked).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it('re-verifies bytes at download time and persists a current-attempt incident', () => {
    const { sqlite, owner } = fixture();
    let available = true;
    try {
      const repository = new LocalizedPdfRepository(sqlite, {
        verify: (_storageKey, expected) =>
          available && expected
            ? {
                exists: true,
                byteLength: expected.byteLength,
                contentSha256: expected.contentSha256,
                mediaType: 'application/pdf',
                magicValid: true,
              }
            : { exists: false, byteLength: null, contentSha256: null },
      });
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'es',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: '9'.repeat(64),
        byteLength: 22,
        rendererVersion: 'renderer-1',
        execution,
      });
      available = false;
      expect(() => repository.resolveDownload(owner, variant.variantId)).toThrow(ConflictError);
      expect(
        sqlite
          .prepare(
            'SELECT attempt_number,incident_kind FROM localized_pdf_integrity_incident WHERE variant_id=?',
          )
          .get(variant.variantId),
      ).toEqual({ attempt_number: 1, incident_kind: 'storage_verification_failed' });
      expect(
        sqlite
          .prepare('SELECT status,integrity_blocked FROM localized_pdf_variant WHERE variant_id=?')
          .get(variant.variantId),
      ).toEqual({ status: 'failed', integrity_blocked: 1 });
      const integrityAudit = sqlite
        .prepare(
          "SELECT action,entity_type,entity_id,details_json FROM audit_event WHERE action='artifact.access' ORDER BY occurred_at DESC LIMIT 1",
        )
        .get() as { action: string; entity_type: string; entity_id: string; details_json: string };
      expect(integrityAudit).toMatchObject({
        action: 'artifact.access',
        entity_type: 'document',
        entity_id: 'daily',
      });
      expect(JSON.parse(integrityAudit.details_json)).toMatchObject({
        variantId: variant.variantId,
        outcome: 'integrity',
        reason: 'storage_verification_failed',
      });
    } finally {
      sqlite.close();
    }
  });

  it('rejects a ready manifest with a missing finished timestamp', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      const timestamp = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO localized_pdf_variant_attempt(
             attempt_id,variant_id,attempt_number,job_id,job_run_id,lease_fence,
             started_at,finished_at,outcome,created_at
           ) VALUES(?,?,?,?,?,?,?,?,'ready',?)`,
        )
        .run(
          'manual-ready-attempt',
          variant.variantId,
          1,
          execution.jobId,
          execution.jobRunId,
          execution.leaseFence,
          timestamp,
          timestamp,
          timestamp,
        );
      expect(() =>
        sqlite
          .prepare(
            `UPDATE localized_pdf_variant
             SET status='ready',media_type='application/pdf',byte_length=1,
                 content_sha256=?,renderer_version='renderer',ready_at=?,finished_at=NULL
             WHERE variant_id=?`,
          )
          .run('a'.repeat(64), timestamp, variant.variantId),
      ).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it('prevents source deletion while a localized artifact references it', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      expect(() => sqlite.prepare('DELETE FROM daily_report WHERE id=?').run('daily')).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it('enriches daily report render snapshots at claim without mutating the persisted owner snapshot', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const persisted = JSON.parse(variant.snapshotJson) as Record<string, unknown>;
      expect(persisted).not.toHaveProperty('project_number');
      expect(persisted).not.toHaveProperty('worker_name');
      expect(persisted.project_id).toBe('project');
      expect(persisted.summary).toBe('Field handover');

      const v3 = new V3Repository(sqlite);
      let claimedSnapshot = '';
      v3.enqueueJob(
        'localized_pdf_variant_render',
        `test-localized-pdf:${variant.variantId}:attempt:${variant.currentAttemptNumber}`,
        { variantId: variant.variantId, requestedAttempt: variant.currentAttemptNumber },
      );
      const result = v3.runDueJobs(1, {
        localized_pdf_variant_render: (payload, context) => {
          const values = payload as { variantId?: unknown; requestedAttempt?: unknown };
          const claim = repository.claimVariant(
            String(values.variantId),
            {
              jobId: context.jobId,
              jobRunId: context.runId,
              leaseFence: context.fenceVersion,
            },
            Number(values.requestedAttempt),
          );
          claimedSnapshot = claim.variant.snapshotJson;
        },
      });
      expect(result).toMatchObject({ processed: 1, failed: 0 });
      const claimed = JSON.parse(claimedSnapshot) as Record<string, unknown>;
      expect(claimed.project_number).toBe('C-0001-P-001');
      expect(claimed.project_name).toBe('Localized Project');
      expect(claimed.client_name).toBe('Localized Client');
      expect(claimed.worker_name).toBe('worker');

      const stored = sqlite
        .prepare('SELECT snapshot_json FROM localized_pdf_variant WHERE variant_id=?')
        .get(variant.variantId) as { snapshot_json: string };
      expect(JSON.parse(stored.snapshot_json)).not.toHaveProperty('project_number');
      expect(JSON.parse(stored.snapshot_json)).not.toHaveProperty('worker_name');
    } finally {
      sqlite.close();
    }
  });
});
