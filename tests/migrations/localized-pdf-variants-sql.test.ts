import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LocalizedPdfRepository,
  V3Repository,
  createDatabase,
  type LocalizedPdfVariant,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterAll(() => restoreIdentity?.());

const OWNER: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };

function fixture(): {
  sqlite: DatabaseSync;
  repository: LocalizedPdfRepository;
  owner: Principal;
} {
  const sqlite = createDatabase(':memory:').sqlite;
  const now = new Date().toISOString();
  for (const [id, role] of [
    ['owner', 'owner_admin'],
    ['worker', 'worker'],
  ] as const) {
    sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, id, `${id}@example.test`, role, 'active', now, now);
  }
  seedB5ServiceActorBinding(sqlite, 'owner');
  sqlite
    .prepare(
      'INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run('client', 'C-0001', 'SQL Client', 'SQL Client', 'active', 'EUR', 'UTC', now, now);
  const insertProject = sqlite.prepare(
    'INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  );
  insertProject.run(
    'project',
    'C-0001-P-001',
    'client',
    'SQL Project',
    'UTC',
    'EUR',
    'active',
    'tm',
    now,
    now,
  );
  insertProject.run(
    'project-alt',
    'C-0001-P-002',
    'client',
    'SQL Alternate Project',
    'UTC',
    'EUR',
    'active',
    'tm',
    now,
    now,
  );
  sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
         issued_at,created_at,updated_at,version,tenant_id,deployment_id,snapshot_json
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      1,
      'test-tenant',
      'test-deployment',
      '{"total":1210}',
    );
  sqlite
    .prepare(
      'INSERT INTO daily_report(id,project_id,worker_id,work_date,summary,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('daily', 'project', 'worker', '2026-08-22', 'Daily source', 'draft', now, now);
  sqlite
    .prepare(
      'INSERT INTO technical_report(id,project_id,author_id,system_name,change_summary,safety_related,approval_state,created_at,updated_at,report_date,report_date_provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'technical',
      'project',
      'worker',
      'PLC line',
      'Technical source',
      0,
      'draft',
      now,
      now,
      '2026-08-22',
      'native',
    );
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
  return { sqlite, repository, owner: OWNER };
}

function enqueue(
  sqlite: DatabaseSync,
  variant: LocalizedPdfVariant,
  payload: Record<string, unknown> = {
    variantId: variant.variantId,
    requestedAttempt: variant.currentAttemptNumber,
  },
): void {
  new V3Repository(sqlite).enqueueJob(
    'localized_pdf_variant_render',
    `sql-localized:${variant.variantId}:${variant.currentAttemptNumber}`,
    payload,
  );
}

function completeReady(
  sqlite: DatabaseSync,
  repository: LocalizedPdfRepository,
  variant: LocalizedPdfVariant,
): LocalizedPdfVariant {
  let completed: LocalizedPdfVariant | undefined;
  enqueue(sqlite, variant);
  const result = new V3Repository(sqlite).runDueJobs(1, {
    localized_pdf_variant_render: (_payload, context) => {
      repository.claimVariant(
        variant.variantId,
        { jobId: context.jobId, jobRunId: context.runId, leaseFence: context.fenceVersion },
        variant.currentAttemptNumber,
      );
      return () => {
        completed = repository.completeVariant(variant.variantId, {
          attemptNumber: variant.currentAttemptNumber,
          contentSha256: 'd'.repeat(64),
          byteLength: 32,
          rendererVersion: 'sql-renderer-1',
          execution: {
            jobId: context.jobId,
            jobRunId: context.runId,
            leaseFence: context.fenceVersion,
          },
        });
      };
    },
  });
  expect(result).toMatchObject({ processed: 1, failed: 0 });
  if (!completed) throw new Error('SQL test did not complete the variant');
  return completed;
}

function dropLocalizedRegistry(sqlite: DatabaseSync): void {
  sqlite.exec('PRAGMA foreign_keys=OFF');
  for (const row of sqlite
    .prepare(
      "SELECT type,name FROM sqlite_master WHERE (type='trigger' OR type='index') AND name LIKE 'localized_pdf_%'",
    )
    .all() as Array<{ type: string; name: string }>) {
    const safeName = row.name.replaceAll('"', '""');
    sqlite.exec(`DROP ${row.type.toUpperCase()} IF EXISTS "${safeName}"`);
  }
  for (const table of [
    'localized_pdf_retry_decision',
    'localized_pdf_integrity_incident',
    'localized_pdf_variant_attempt',
    'localized_pdf_variant',
  ])
    sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
  sqlite.exec('PRAGMA foreign_keys=ON');
}

describe('localized PDF SQL guards', () => {
  it('rejects forged payload, run and fence envelopes at queued to running', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'sql-v1',
        generationVersion: 'sql-renderer',
      });
      enqueue(sqlite, variant, { variantId: 'forged-variant', requestedAttempt: 1 });
      const result = new V3Repository(sqlite).runDueJobs(1, {
        localized_pdf_variant_render: (_payload, context) => {
          sqlite
            .prepare(
              `UPDATE localized_pdf_variant
               SET status='running',started_at=?,claimed_job_id=?,claimed_job_run_id=?,claimed_lease_fence=?,updated_at=?
               WHERE variant_id=?`,
            )
            .run(
              new Date().toISOString(),
              context.jobId,
              `${context.runId}-forged`,
              context.fenceVersion,
              new Date().toISOString(),
              variant.variantId,
            );
        },
      });
      expect(result).toMatchObject({ processed: 0, failed: 1 });
      expect(
        sqlite
          .prepare('SELECT status,claimed_job_id FROM localized_pdf_variant WHERE variant_id=?')
          .get(variant.variantId),
      ).toEqual({ status: 'queued', claimed_job_id: null });
    } finally {
      sqlite.close();
    }
  });

  it('rejects publication before the B5 run is successful, even with an attempt row', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'es',
        templateVersion: 'sql-v1',
        generationVersion: 'sql-renderer',
      });
      enqueue(sqlite, variant);
      const result = new V3Repository(sqlite).runDueJobs(1, {
        localized_pdf_variant_render: (_payload, context) => {
          repository.claimVariant(
            variant.variantId,
            { jobId: context.jobId, jobRunId: context.runId, leaseFence: context.fenceVersion },
            1,
          );
          const timestamp = new Date().toISOString();
          sqlite
            .prepare(
              `INSERT INTO localized_pdf_variant_attempt(
                 attempt_id,variant_id,attempt_number,job_id,job_run_id,lease_fence,
                 started_at,finished_at,outcome,created_at
               ) VALUES(?,?,?,?,?,?,?,?,'ready',?)`,
            )
            .run(
              'sql-before-success-attempt',
              variant.variantId,
              1,
              context.jobId,
              context.runId,
              context.fenceVersion,
              timestamp,
              timestamp,
              timestamp,
            );
          expect(() =>
            sqlite
              .prepare(
                `UPDATE localized_pdf_variant SET status='ready',media_type='application/pdf',
                   byte_length=32,content_sha256=?,renderer_version='sql-renderer',ready_at=?,finished_at=?
                 WHERE variant_id=?`,
              )
              .run('a'.repeat(64), timestamp, timestamp, variant.variantId),
          ).toThrow();
        },
      });
      expect(result).toMatchObject({ processed: 1, failed: 0 });
      expect(
        sqlite
          .prepare('SELECT status FROM localized_pdf_variant WHERE variant_id=?')
          .get(variant.variantId),
      ).toEqual({
        status: 'running',
      });
    } finally {
      sqlite.close();
    }
  });

  it('freezes daily and technical authorization subjects while allowing draft content edits', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const daily = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'sql-v1',
        generationVersion: 'sql-renderer',
      });
      sqlite.prepare('UPDATE daily_report SET summary=? WHERE id=?').run('Edited draft', 'daily');
      expect(() =>
        sqlite
          .prepare('UPDATE daily_report SET project_id=? WHERE id=?')
          .run('project-alt', 'daily'),
      ).toThrow();
      expect(() =>
        sqlite.prepare('UPDATE daily_report SET worker_id=? WHERE id=?').run('owner', 'daily'),
      ).toThrow();
      expect(() =>
        sqlite.prepare('UPDATE daily_report SET work_date=? WHERE id=?').run('2026-08-23', 'daily'),
      ).toThrow();
      expect(daily.ownerRevisionId).toBe('daily:v1');

      const technical = repository.requestVariant(owner, {
        ownerType: 'technical_report',
        ownerId: 'technical',
        locale: 'pt-BR',
        templateVersion: 'sql-v1',
        generationVersion: 'sql-renderer',
      });
      sqlite
        .prepare('UPDATE technical_report SET change_summary=? WHERE id=?')
        .run('Edited draft', 'technical');
      expect(() =>
        sqlite
          .prepare('UPDATE technical_report SET project_id=? WHERE id=?')
          .run('project-alt', 'technical'),
      ).toThrow();
      expect(() =>
        sqlite
          .prepare('UPDATE technical_report SET author_id=? WHERE id=?')
          .run('owner', 'technical'),
      ).toThrow();
      expect(() =>
        sqlite
          .prepare('UPDATE technical_report SET report_date=? WHERE id=?')
          .run('2026-08-23', 'technical'),
      ).toThrow();
      expect(technical.locale).toBe('pt');
    } finally {
      sqlite.close();
    }
  });

  it('normalizes legacy locale spellings and falls back to English during backfill', () => {
    const { sqlite } = fixture();
    try {
      const now = new Date().toISOString();
      const insert = sqlite.prepare(
        `INSERT INTO invoice(
           id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
           issued_at,created_at,updated_at,version,tenant_id,deployment_id,snapshot_json,
           pdf_storage_key,pdf_sha256,pdf_byte_length,pdf_generated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      insert.run(
        'legacy-es',
        'project',
        'INV-ES',
        'labor',
        'issued',
        'EUR',
        100,
        21,
        121,
        now,
        now,
        now,
        1,
        'test-tenant',
        'test-deployment',
        '{"locale":"es_ES"}',
        'legacy/es.pdf',
        'a'.repeat(64),
        12,
        now,
      );
      insert.run(
        'legacy-pt',
        'project',
        'INV-PT',
        'labor',
        'issued',
        'EUR',
        100,
        21,
        121,
        now,
        now,
        now,
        1,
        'test-tenant',
        'test-deployment',
        '{"locale":"PT_BR"}',
        'legacy/pt.pdf',
        'b'.repeat(64),
        12,
        now,
      );
      insert.run(
        'legacy-fallback',
        'project',
        'INV-EN',
        'labor',
        'issued',
        'EUR',
        100,
        21,
        121,
        now,
        now,
        now,
        1,
        'test-tenant',
        'test-deployment',
        '{"locale":"de-DE"}',
        'legacy/en.pdf',
        'c'.repeat(64),
        12,
        now,
      );
      dropLocalizedRegistry(sqlite);
      sqlite.exec(readFileSync('migrations/0023_localized_pdf_variants.sql', 'utf8'));
      expect(
        sqlite
          .prepare(
            `SELECT locale,locale_tag FROM localized_pdf_variant
             WHERE owner_id IN('legacy-es','legacy-pt','legacy-fallback') ORDER BY owner_id`,
          )
          .all(),
      ).toEqual([
        { locale: 'es', locale_tag: 'es-ES' },
        { locale: 'en', locale_tag: 'en-US' },
        { locale: 'pt', locale_tag: 'pt-BR' },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it('requires append-only tamper evidence for a ready to failed downgrade', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      const variant = repository.requestVariant(owner, {
        ownerType: 'invoice',
        ownerId: 'invoice',
        locale: 'en',
        templateVersion: 'sql-v1',
        generationVersion: 'sql-renderer',
      });
      const ready = completeReady(sqlite, repository, variant);
      const timestamp = new Date().toISOString();
      const downgrade = sqlite.prepare(
        `UPDATE localized_pdf_variant
         SET status='failed',error_code='ARTIFACT_INTEGRITY_FAILED',retryable=1,
             integrity_blocked=1,finished_at=?,updated_at=? WHERE variant_id=?`,
      );
      expect(() => downgrade.run(timestamp, timestamp, ready.variantId)).toThrow();

      const incident = sqlite.prepare(
        `INSERT INTO localized_pdf_integrity_incident(
           incident_id,variant_id,owner_type,owner_id,owner_revision_id,locale,
           template_version,generation_version,attempt_number,incident_kind,
           storage_key,detected_at,detected_by,incident_hash
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      incident.run(
        'sql-forged-incident',
        ready.variantId,
        ready.ownerType,
        ready.ownerId,
        ready.ownerRevisionId,
        ready.locale,
        ready.templateVersion,
        ready.generationVersion,
        ready.currentAttemptNumber,
        'forged',
        ready.storageKey,
        timestamp,
        'sql-test',
        'e'.repeat(64),
      );
      expect(() => downgrade.run(timestamp, timestamp, ready.variantId)).toThrow();

      incident.run(
        'sql-tamper-incident',
        ready.variantId,
        ready.ownerType,
        ready.ownerId,
        ready.ownerRevisionId,
        ready.locale,
        ready.templateVersion,
        ready.generationVersion,
        ready.currentAttemptNumber,
        'tamper',
        ready.storageKey,
        timestamp,
        'sql-test',
        'f'.repeat(64),
      );
      expect(() => downgrade.run(timestamp, timestamp, ready.variantId)).not.toThrow();
      expect(
        sqlite
          .prepare('SELECT status,integrity_blocked FROM localized_pdf_variant WHERE variant_id=?')
          .get(ready.variantId),
      ).toEqual({ status: 'failed', integrity_blocked: 1 });
    } finally {
      sqlite.close();
    }
  });
});
