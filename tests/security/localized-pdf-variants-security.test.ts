import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AccountingPackRevisionService,
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
    ['finance', 'finance_admin'],
    ['worker', 'worker'],
    ['pm', 'project_manager'],
    ['outsider', 'worker'],
    ['auditor', 'auditor_read_only'],
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
      '{"total":1210,"subtotal":1000}',
      'test-tenant',
      'test-deployment',
    );
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
  const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
  const worker: Principal = { userId: 'worker', role: 'worker', projectIds: new Set(['project']) };
  const pm: Principal = { userId: 'pm', role: 'project_manager', projectIds: new Set(['project']) };
  const outsider: Principal = { userId: 'outsider', role: 'worker', projectIds: new Set() };
  const auditor: Principal = {
    userId: 'auditor',
    role: 'auditor_read_only',
    projectIds: new Set(),
  };
  return { sqlite, repository, owner, finance, worker, pm, outsider, auditor };
}

function stepUpPrincipal(sqlite: DatabaseSync, principal: Principal, suffix: string): Principal {
  const now = new Date().toISOString();
  const sessionId = `localized-pdf-security-${principal.userId}-${suffix}`;
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      principal.userId,
      new Date(Date.now() + 3_600_000).toISOString(),
      now,
      now,
      now,
    );
  return { ...principal, sessionId };
}

function claimVariant(
  sqlite: DatabaseSync,
  repository: LocalizedPdfRepository,
  variant: Pick<LocalizedPdfVariant, 'variantId' | 'currentAttemptNumber'>,
  onClaim?: (execution: LocalizedPdfExecution) => void,
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
      onClaim?.(execution);
    },
  });
  expect(result).toMatchObject({ processed: 1, failed: 0 });
  if (!execution) throw new Error('B5 claim did not provide execution context');
  return execution;
}

describe('localized PDF variant authorization and integrity boundary', () => {
  it('does not let an assigned PM read a localized invoice even with a valid step-up', () => {
    const { sqlite, repository, owner, finance, pm, auditor } = fixture();
    try {
      const financeWithStepUp = stepUpPrincipal(sqlite, finance, 'finance');
      const pmWithStepUp = stepUpPrincipal(sqlite, pm, 'pm');
      const auditorWithStepUp = stepUpPrincipal(sqlite, auditor, 'auditor');
      const ownerWithStepUp = stepUpPrincipal(sqlite, owner, 'owner');
      sqlite
        .prepare(
          `INSERT INTO legal_entity(
             id,code,legal_name,currency,billing_address,company_identifiers,status,
             created_at,updated_at,version
           ) VALUES(?,?,?,?,?,?,?,?,?,1)`,
        )
        .run(
          'legacy',
          'LE-SECURITY',
          'Security Entity',
          'EUR',
          'Security address',
          'SECURITY-TAX',
          'active',
          new Date().toISOString(),
          new Date().toISOString(),
        );
      const accountingPack = new AccountingPackRevisionService(sqlite).createCanonicalRevision(
        financeWithStepUp,
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          currency: 'EUR',
          timezone: 'UTC',
          legacyLegalEntityId: 'legacy',
          idempotencyKey: 'security:localized-pdf:accounting-pack',
        },
      );
      expect(() =>
        repository.requestVariant(finance, {
          ownerType: 'invoice',
          ownerId: 'invoice',
          locale: 'en',
          templateVersion: 'invoice-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow('Recent step-up authentication is required');
      expect(() =>
        repository.requestVariant(pm, {
          ownerType: 'invoice',
          ownerId: 'invoice',
          locale: 'en',
          templateVersion: 'invoice-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow('Localized PDF administration required');
      expect(
        repository.listVariants(financeWithStepUp, { ownerType: 'invoice', ownerId: 'invoice' }),
      ).toEqual([]);

      const variant = repository.requestVariant(financeWithStepUp, {
        ownerType: 'invoice',
        ownerId: 'invoice',
        locale: 'en',
        templateVersion: 'invoice-v1',
        generationVersion: 'renderer-1',
      });
      const execution = claimVariant(sqlite, repository, variant);
      repository.completeVariant(variant.variantId, {
        attemptNumber: 1,
        contentSha256: 'f'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution,
      });
      const accountingVariant = repository.requestVariant(financeWithStepUp, {
        ownerType: 'accounting_pack_revision',
        ownerId: accountingPack.revisionId,
        locale: 'en',
        templateVersion: 'accounting-pack-v1',
        generationVersion: 'renderer-1',
      });
      const accountingExecution = claimVariant(sqlite, repository, accountingVariant);
      repository.completeVariant(accountingVariant.variantId, {
        attemptNumber: 1,
        contentSha256: 'a'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: accountingExecution,
      });

      expect(() =>
        repository.listVariants(pmWithStepUp, { ownerType: 'invoice', ownerId: 'invoice' }),
      ).toThrow(AccessDeniedError);
      expect(() =>
        repository.requestVariant(pmWithStepUp, {
          ownerType: 'invoice',
          ownerId: 'invoice',
          locale: 'es',
          templateVersion: 'invoice-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);
      expect(() => repository.resolveDownload(pmWithStepUp, variant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(() =>
        repository.listVariants(pmWithStepUp, {
          ownerType: 'accounting_pack_revision',
          ownerId: accountingPack.revisionId,
        }),
      ).toThrow(AccessDeniedError);
      expect(() => repository.resolveDownload(pmWithStepUp, accountingVariant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(repository.listVariants(pmWithStepUp)).toHaveLength(0);
      expect(
        repository.listVariants(financeWithStepUp, { ownerType: 'invoice', ownerId: 'invoice' }),
      ).toEqual([expect.objectContaining({ variantId: variant.variantId })]);
      expect(repository.resolveDownload(financeWithStepUp, variant.variantId).ownerId).toBe(
        'invoice',
      );
      expect(repository.resolveDownload(auditorWithStepUp, variant.variantId).ownerId).toBe(
        'invoice',
      );
      expect(repository.resolveDownload(ownerWithStepUp, variant.variantId).ownerId).toBe(
        'invoice',
      );
      expect(
        repository.listVariants(financeWithStepUp, {
          ownerType: 'accounting_pack_revision',
          ownerId: accountingPack.revisionId,
        }),
      ).toEqual([expect.objectContaining({ variantId: accountingVariant.variantId })]);
      expect(
        repository.resolveDownload(financeWithStepUp, accountingVariant.variantId).ownerId,
      ).toBe(accountingPack.revisionId);
      expect(
        repository.resolveDownload(auditorWithStepUp, accountingVariant.variantId).ownerId,
      ).toBe(accountingPack.revisionId);
      expect(repository.resolveDownload(ownerWithStepUp, accountingVariant.variantId).ownerId).toBe(
        accountingPack.revisionId,
      );
      expect(repository.listVariants(auditorWithStepUp)).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  });

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

  it('guards legacy period-report fallbacks by customer privacy marker and audience', () => {
    const { sqlite, repository, owner, pm } = fixture();
    try {
      const now = new Date().toISOString();
      const insertLegacyReport = (
        id: string,
        audience: 'customer' | 'internal',
        snapshot: object,
        periodStart = '2026-08-01',
        periodEnd = '2026-08-31',
      ) =>
        sqlite
          .prepare(
            `INSERT INTO period_report(
               id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
               created_by,created_at,updated_at
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            'project',
            periodStart,
            periodEnd,
            audience,
            'period_summary',
            'review',
            JSON.stringify(snapshot),
            'owner',
            now,
            now,
          );

      const insertLegacyQueuedVariant = (
        variantId: string,
        ownerId: string,
        snapshotJson: string,
      ): Pick<LocalizedPdfVariant, 'variantId' | 'currentAttemptNumber'> => {
        const identity = sqlite
          .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
          .get() as { tenant_id: string; deployment_id: string };
        sqlite
          .prepare(
            `INSERT INTO localized_pdf_variant(
               variant_id,owner_type,owner_id,owner_revision_id,tenant_id,deployment_id,
               locale,locale_tag,document_tag,template_version,generation_version,
               snapshot_json,snapshot_hash,snapshot_hash_kind,status,current_attempt_number,attempt_number,
               semantic_filename,storage_key,max_attempts,request_key,requested_by,requested_at,updated_at
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'legacy_verbatim','queued',1,1,?,?,?,?,?,?,?)`,
          )
          .run(
            variantId,
            'period_report_revision',
            ownerId,
            `${ownerId}:v1`,
            identity.tenant_id,
            identity.deployment_id,
            'en',
            'en-US',
            'period_report',
            'period-v1',
            'renderer-1',
            snapshotJson,
            'a'.repeat(64),
            `period-report-${ownerId}-legacy-en.pdf`,
            `localized/${ownerId}/legacy/en.pdf`,
            5,
            null,
            'owner',
            now,
            now,
          );
        return { variantId, currentAttemptNumber: 1 };
      };

      const preFixOwnerId = 'legacy-customer-pre-fix';
      const preFixUnsafeSnapshot = JSON.stringify({
        audience: 'customer',
        commercialSummary: { amountMinor: 1000 },
      });
      insertLegacyReport(
        preFixOwnerId,
        'customer',
        JSON.parse(preFixUnsafeSnapshot),
        '2026-09-01',
        '2026-09-30',
      );
      const preFixVariant = insertLegacyQueuedVariant(
        'legacy-customer-pre-fix-variant',
        preFixOwnerId,
        preFixUnsafeSnapshot,
      );
      const preFixExecution = claimVariant(sqlite, repository, preFixVariant);
      repository.completeVariant(preFixVariant.variantId, {
        attemptNumber: 1,
        contentSha256: 'b'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: preFixExecution,
      });

      const refreshedCustomerSnapshot = JSON.stringify({
        audience: 'customer',
        customerPrivacyVersion: '2026.08.24.customer-period-safe-v1',
        refreshSequence: 2,
      });
      sqlite
        .prepare(
          'UPDATE period_report SET snapshot_version=?,snapshot_json=?,updated_at=? WHERE id=?',
        )
        .run(2, refreshedCustomerSnapshot, new Date().toISOString(), preFixOwnerId);
      expect(() => repository.resolveDownload(owner, preFixVariant.variantId)).toThrow(
        /source revision is no longer current/,
      );

      const refreshedVariant = repository.requestVariant(owner, {
        ownerType: 'period_report_revision',
        ownerId: preFixOwnerId,
        locale: 'es',
        templateVersion: 'period-v1',
        generationVersion: 'renderer-1',
      });
      const refreshedExecution = claimVariant(sqlite, repository, refreshedVariant);
      repository.completeVariant(refreshedVariant.variantId, {
        attemptNumber: 1,
        contentSha256: 'f'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: refreshedExecution,
      });
      expect(repository.resolveDownload(owner, refreshedVariant.variantId).ownerId).toBe(
        preFixOwnerId,
      );
      expect(repository.resolveDownload(pm, refreshedVariant.variantId).ownerId).toBe(
        preFixOwnerId,
      );

      insertLegacyReport('legacy-customer', 'customer', {
        customerPrivacyVersion: '2026.08.24.customer-period-safe-v1',
        audience: 'customer',
      });
      const customerVariant = repository.requestVariant(owner, {
        ownerType: 'period_report_revision',
        ownerId: 'legacy-customer',
        locale: 'en',
        templateVersion: 'period-v1',
        generationVersion: 'renderer-1',
      });
      const customerExecution = claimVariant(sqlite, repository, customerVariant);
      repository.completeVariant(customerVariant.variantId, {
        attemptNumber: 1,
        contentSha256: 'c'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: customerExecution,
      });
      expect(repository.resolveDownload(owner, customerVariant.variantId).ownerId).toBe(
        'legacy-customer',
      );
      expect(repository.resolveDownload(pm, customerVariant.variantId).ownerId).toBe(
        'legacy-customer',
      );
      expect(
        repository.listVariants(pm, {
          ownerType: 'period_report_revision',
          ownerId: 'legacy-customer',
        }),
      ).toEqual([expect.objectContaining({ variantId: customerVariant.variantId })]);

      sqlite
        .prepare(
          'UPDATE period_report SET snapshot_version=?,snapshot_json=?,updated_at=? WHERE id=?',
        )
        .run(
          2,
          JSON.stringify({ audience: 'customer', commercialSummary: { amountMinor: 1000 } }),
          new Date().toISOString(),
          'legacy-customer',
        );
      const customerSelector = {
        ownerType: 'period_report_revision' as const,
        ownerId: 'legacy-customer',
      };
      expect(() =>
        repository.requestVariant(owner, {
          ...customerSelector,
          locale: 'es',
          templateVersion: 'period-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(/safe snapshot refresh/);
      expect(() =>
        repository.requestVariant(pm, {
          ...customerSelector,
          locale: 'pt',
          templateVersion: 'period-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);
      expect(() => repository.listVariants(owner, customerSelector)).toThrow(AccessDeniedError);
      expect(() => repository.listVariants(pm, customerSelector)).toThrow(AccessDeniedError);
      expect(() => repository.resolveDownload(owner, customerVariant.variantId)).toThrow(
        AccessDeniedError,
      );
      expect(() => repository.resolveDownload(pm, customerVariant.variantId)).toThrow(
        AccessDeniedError,
      );

      insertLegacyReport('legacy-internal', 'internal', { audience: 'internal' });
      const internalVariant = repository.requestVariant(owner, {
        ownerType: 'period_report_revision',
        ownerId: 'legacy-internal',
        locale: 'en',
        templateVersion: 'period-v1',
        generationVersion: 'renderer-1',
      });
      const internalExecution = claimVariant(sqlite, repository, internalVariant);
      repository.completeVariant(internalVariant.variantId, {
        attemptNumber: 1,
        contentSha256: 'd'.repeat(64),
        byteLength: 12,
        rendererVersion: 'renderer-1',
        execution: internalExecution,
      });
      expect(repository.resolveDownload(owner, internalVariant.variantId).ownerId).toBe(
        'legacy-internal',
      );
      const internalSelector = {
        ownerType: 'period_report_revision' as const,
        ownerId: 'legacy-internal',
      };
      expect(() =>
        repository.requestVariant(pm, {
          ...internalSelector,
          locale: 'es',
          templateVersion: 'period-v1',
          generationVersion: 'renderer-1',
        }),
      ).toThrow(AccessDeniedError);
      expect(() => repository.listVariants(pm, internalSelector)).toThrow(AccessDeniedError);
      expect(() => repository.resolveDownload(pm, internalVariant.variantId)).toThrow(
        AccessDeniedError,
      );
    } finally {
      sqlite.close();
    }
  });

  it('requires the same recent step-up for retrying a financial variant', () => {
    const { sqlite, repository, finance } = fixture();
    try {
      const financeWithStepUp = stepUpPrincipal(sqlite, finance, 'financial-retry');
      const variant = repository.requestVariant(financeWithStepUp, {
        ownerType: 'invoice',
        ownerId: 'invoice',
        locale: 'es',
        templateVersion: 'invoice-v1',
        generationVersion: 'renderer-1',
      });
      claimVariant(sqlite, repository, variant, (execution) => {
        repository.failVariant(variant.variantId, {
          attemptNumber: 1,
          errorCode: 'RENDER_FAILED',
          retryable: true,
          execution,
        });
      });

      expect(() => repository.retryVariant(finance, variant.variantId)).toThrow(
        'Recent step-up authentication is required',
      );
      expect(
        repository
          .listVariants(financeWithStepUp, { ownerType: 'invoice', ownerId: 'invoice' })
          .find((candidate) => candidate.variantId === variant.variantId),
      ).toMatchObject({
        status: 'failed',
        currentAttemptNumber: 1,
      });
      expect(repository.retryVariant(financeWithStepUp, variant.variantId)).toMatchObject({
        status: 'queued',
        currentAttemptNumber: 2,
      });
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

      expect(
        repository.listVariants(pm, { ownerType: 'daily_report', ownerId: 'daily' }),
      ).toHaveLength(2);

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
      sqlite.prepare("UPDATE project_member SET starts_on='2026-08-15',ends_on='2026-12-31'").run();
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
        .prepare(
          "UPDATE technical_report SET report_date='2026-08-20',version=version+1 WHERE id=?",
        )
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
