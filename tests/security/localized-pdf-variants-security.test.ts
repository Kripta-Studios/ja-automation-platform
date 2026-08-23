import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  LocalizedPdfRepository,
  V3Repository,
  createDatabase,
  type LocalizedPdfExecution,
  type LocalizedPdfVariant,
} from '@ja/database';
import type { Principal } from '@ja/domain';
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
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-security-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  const now = new Date().toISOString();
  for (const [id, role] of [
    ['owner', 'owner_admin'],
    ['worker', 'worker'],
    ['pm', 'project_manager'],
    ['outsider', 'worker'],
    ['auditor', 'auditor_read_only'],
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
    .run(
      'client',
      'C-0001',
      'Security Client',
      'Security Client',
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
      'Security Project',
      'UTC',
      'EUR',
      'active',
      'tm',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO daily_report(
         id,project_id,worker_id,work_date,summary,approval_state,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run('daily', 'project', 'worker', '2026-08-22', 'Private source', 'draft', now, now);
  sqlite
    .prepare(
      'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('assignment-worker', 'project', 'worker', 'worker', '2026-01-01', '2026-12-31', now, now);
  sqlite
    .prepare(
      'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('assignment-pm', 'project', 'pm', 'project_manager', '2026-01-01', '2026-12-31', now, now);
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
  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const worker: Principal = { userId: 'worker', role: 'worker', projectIds: new Set(['project']) };
  const pm: Principal = { userId: 'pm', role: 'project_manager', projectIds: new Set(['project']) };
  const outsider: Principal = { userId: 'outsider', role: 'worker', projectIds: new Set() };
  const auditor: Principal = {
    userId: 'auditor',
    role: 'auditor_read_only',
    projectIds: new Set(),
  };
  return { sqlite, repository, owner, worker, pm, outsider, auditor };
}

function claimVariant(
  sqlite: DatabaseSync,
  repository: LocalizedPdfRepository,
  variant: LocalizedPdfVariant,
): LocalizedPdfExecution {
  const v3 = new V3Repository(sqlite);
  let execution: LocalizedPdfExecution | undefined;
  v3.enqueueJob(
    'localized_pdf_variant_render',
    `security-localized-pdf:${variant.variantId}:attempt:${variant.currentAttemptNumber}`,
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
    },
  });
  expect(result).toMatchObject({ processed: 1, failed: 0 });
  if (!execution) throw new Error('B5 claim did not provide execution context');
  return execution;
}

describe('localized PDF variant authorization and integrity boundary', () => {
  it('prevents IDOR reads/writes while allowing the owning worker and read-only auditor', () => {
    const { sqlite, repository, owner, worker, outsider, auditor } = fixture();
    try {
      const variant = repository.requestVariant(worker, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'c'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution,
      });
      expect(repository.resolveDownload(worker, variant.variantId).ownerId).toBe('daily');
      expect(
        repository.listVariants(auditor, { ownerType: 'daily_report', ownerId: 'daily' }),
      ).toHaveLength(1);
      expect(() => repository.resolveDownload(outsider, variant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(() => repository.retryVariant(outsider, variant.variantId)).toThrow(AccessDeniedError);
      expect(() =>
        repository.requestVariant(auditor, {
          ownerType: 'daily_report',
          ownerId: 'daily',
          locale: 'es',
          templateVersion: 'daily-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);
      expect(
        repository.listVariants(owner, { ownerType: 'daily_report', ownerId: 'daily' }),
      ).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it('rejects forged owners, unsupported locales and unsafe direct storage/status mutations', () => {
    const { sqlite, repository, owner } = fixture();
    try {
      expect(() =>
        repository.requestVariant(owner, {
          ownerType: 'invoice',
          ownerId: 'daily',
          locale: 'en',
          templateVersion: 'invoice-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);
      expect(() =>
        repository.requestVariant(owner, {
          ownerType: 'daily_report',
          ownerId: 'daily',
          locale: 'fr',
          templateVersion: 'daily-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow();
      const variant = repository.requestVariant(owner, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'pt-BR',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      expect(() =>
        sqlite
          .prepare("UPDATE localized_pdf_variant SET status='ready' WHERE variant_id=?")
          .run(variant.variantId),
      ).toThrow();
      expect(() =>
        sqlite
          .prepare(
            "UPDATE localized_pdf_variant SET storage_key='../escape.pdf' WHERE variant_id=?",
          )
          .run(variant.variantId),
      ).toThrow();
      expect(() =>
        sqlite
          .prepare(
            'INSERT INTO localized_pdf_integrity_incident(incident_id,variant_id,owner_type,owner_id,owner_revision_id,locale,template_version,generation_version,attempt_number,incident_kind,detected_at,detected_by,incident_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            'x',
            variant.variantId,
            'daily_report',
            'other',
            'other:v1',
            'pt',
            'daily-v1',
            'renderer-1',
            1,
            'forged',
            new Date().toISOString(),
            'test',
            'd'.repeat(64),
          ),
      ).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it('rechecks current and source-date assignments for PM/worker request, list, retry and download', () => {
    const { sqlite, repository, worker, pm } = fixture();
    try {
      const readyVariant = repository.requestVariant(worker, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'en',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      const readyExecution = claimVariant(sqlite, repository, readyVariant);
      repository.completeVariant(readyVariant.variantId, {
        attemptNumber: 1,
        contentSha256: 'e'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: readyExecution,
      });

      const failedVariant = repository.requestVariant(worker, {
        ownerType: 'daily_report',
        ownerId: 'daily',
        locale: 'es',
        templateVersion: 'daily-v1',
        generationVersion: 'renderer-1',
      });
      claimVariant(sqlite, repository, failedVariant, (execution) => {
        repository.failVariant(failedVariant.variantId, {
          attemptNumber: 1,
          errorCode: 'RENDER_FAILED',
          retryable: true,
          execution,
        });
      });

      expect(repository.listVariants(pm, { ownerType: 'daily_report', ownerId: 'daily' })).toHaveLength(
        2,
      );

      // Keep the captured principals' projectIds to prove that a stale/forged scope hint cannot
      // retain access after the SQLite assignment is no longer effective.
      sqlite
        .prepare("UPDATE project_member SET ends_on='2026-08-01' WHERE project_id='project'")
        .run();

      expect(() =>
        repository.requestVariant(pm, {
          ownerType: 'daily_report',
          ownerId: 'daily',
          locale: 'pt',
          templateVersion: 'daily-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);
      expect(() =>
        repository.listVariants(pm, { ownerType: 'daily_report', ownerId: 'daily' }),
      ).toThrow(AccessDeniedError);
      expect(repository.listVariants(pm)).toHaveLength(0);
      expect(() => repository.resolveDownload(pm, readyVariant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(() => repository.resolveDownload(worker, readyVariant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(() => repository.retryVariant(pm, failedVariant.variantId)).toThrow(AccessDeniedError);
      expect(() => repository.retryVariant(worker, failedVariant.variantId)).toThrow(
        AccessDeniedError,
      );
    } finally {
      sqlite.close();
    }
  });

  it('uses technical report_date, not created_at, for the source-date assignment check', () => {
    const { sqlite, repository, worker } = fixture();
    try {
      sqlite
        .prepare("UPDATE project_member SET starts_on='2026-08-15',ends_on='2026-12-31'")
        .run();
      sqlite
        .prepare(
          `INSERT INTO technical_report(
             id,project_id,author_id,system_name,change_summary,safety_related,approval_state,
             created_at,updated_at,report_date,report_date_provenance
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'technical-before-assignment',
          'project',
          'worker',
          'PLC line',
          'Historical report',
          0,
          'draft',
          '2026-08-22T10:00:00.000Z',
          '2026-08-22T10:00:00.000Z',
          '2026-08-01',
          'native',
        );
      expect(() =>
        repository.requestVariant(worker, {
          ownerType: 'technical_report',
          ownerId: 'technical-before-assignment',
          locale: 'en',
          templateVersion: 'technical-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);

      sqlite
        .prepare("UPDATE technical_report SET report_date='2026-08-20',version=version+1 WHERE id=?")
        .run('technical-before-assignment');
      expect(() =>
        repository.requestVariant(worker, {
          ownerType: 'technical_report',
          ownerId: 'technical-before-assignment',
          locale: 'en',
          templateVersion: 'technical-v1',
          generationVersion: 'renderer-1',
        }),
      ).not.toThrow();
    } finally {
      sqlite.close();
    }
  });
});
