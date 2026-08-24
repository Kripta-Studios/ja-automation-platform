import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck, recordAuditEvent } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const CONTRACT = resolve(MIGRATIONS, 'contracts/ja-b5-migration-contract-v1.json');
const LEGACY_FIXTURE = resolve(ROOT, 'tests/fixtures/b5-migration-legacy-fixture.sql');
const databases: DatabaseSync[] = [];
const directories: string[] = [];
let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // Preserve the original test failure if an upgrade closed a handle.
    }
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

afterAll(() => restoreIdentity?.());

function fresh(): DatabaseSync {
  const sqlite = createDatabase(':memory:').sqlite;
  databases.push(sqlite);
  return sqlite;
}

function copyMigrationTree(maxVersion: number): string {
  const directory = mkdtempSync(join(tmpdir(), 'ja-temporary-cleanup-migrations-'));
  directories.push(directory);
  mkdirSync(join(directory, 'contracts'));
  copyFileSync(CONTRACT, join(directory, 'contracts/ja-b5-migration-contract-v1.json'));
  for (const file of readdirSync(MIGRATIONS).filter((candidate) =>
    /^\d{4}_.+\.sql$/u.test(candidate),
  )) {
    if (Number(file.slice(0, 4)) <= maxVersion)
      copyFileSync(join(MIGRATIONS, file), join(directory, file));
  }
  return directory;
}

function buildLegacyDatabase(path: string): void {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  for (const file of readdirSync(MIGRATIONS)
    .filter(
      (candidate) => /^\d{4}_.+\.sql$/u.test(candidate) && Number(candidate.slice(0, 4)) <= 18,
    )
    .sort())
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  sqlite.exec(readFileSync(LEGACY_FIXTURE, 'utf8'));
  sqlite.close();
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function insertServiceActor(
  sqlite: DatabaseSync,
  id: string,
  capabilities: readonly string[],
  deploymentId = 'test-deployment',
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO service_actor(
         id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      'test-tenant',
      deploymentId,
      `Cleanup actor ${id}`,
      'active',
      JSON.stringify(capabilities),
      now,
      now,
      1,
    );
}

function insertJob(
  sqlite: DatabaseSync,
  id: string,
  kind: string,
  requiredCapability: string,
  tenantId = 'test-tenant',
  deploymentId = 'test-deployment',
): void {
  const now = new Date().toISOString();
  const payload =
    kind === 'temporary_upload_cleanup' ? '{"olderThan":"2026-08-22T00:00:00.000Z"}' : '{}';
  sqlite
    .prepare(
      `INSERT INTO job(
         id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,
         version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,required_capability,
         active_job_run_id,fence_version,max_attempts,last_error_code
       ) VALUES(?,?,?,?,?,NULL,0,?,?,?,?,?,?,?,?,?,?,NULL,0,5,NULL)`,
    )
    .run(
      id,
      kind,
      `${id}-key`,
      'queued',
      now,
      payload,
      now,
      now,
      1,
      tenantId,
      deploymentId,
      'b5-v1',
      hash(payload),
      `${id}-correlation`,
      requiredCapability,
    );
}

describe('CE-CORE16-M1 temporary upload cleanup migration', () => {
  it('registers migration 27 and accepts only the exact new actor/job pair', () => {
    const sqlite = fresh();
    expect(sqlite.prepare('SELECT max(version) version FROM schema_migration').get()).toEqual({
      version: 30,
    });
    expect(
      sqlite
        .prepare(
          'SELECT migration_version,migration_name FROM migration_contract_metadata WHERE migration_version=27',
        )
        .get(),
    ).toEqual({
      migration_version: 27,
      migration_name: 'client_essential_temporary_upload_cleanup',
    });

    insertServiceActor(sqlite, 'cleanup-actor', ['document.scan', 'storage.temporary.cleanup']);
    expect(() =>
      sqlite
        .prepare(
          'UPDATE service_actor SET capabilities_json=\'["document.scan","storage.temporary.cleanup","backup.verify"]\',version=version+1 WHERE id=\'cleanup-actor\'',
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      insertServiceActor(sqlite, 'unknown-actor', ['storage.temporary.unknown']),
    ).toThrow();
    expect(() =>
      insertServiceActor(sqlite, 'all-old-capabilities-actor', [
        'artifact.invoice.render',
        'artifact.report.render',
        'billing.draft.generate',
        'artifact.accounting_pack.render',
        'artifact.localized_pdf.render',
        'document.scan',
        'outbox.deliver',
        'alert.dispatch',
        'email.send',
        'backup.verify',
        'storage.temporary.cleanup',
      ]),
    ).not.toThrow();
    expect(() =>
      insertServiceActor(sqlite, 'cross-actor', ['storage.temporary.cleanup'], 'other-deployment'),
    ).toThrow();

    insertJob(sqlite, 'cleanup-job', 'temporary_upload_cleanup', 'storage.temporary.cleanup');
    const oldPairs = [
      ['invoice_pdf', 'artifact.invoice.render'],
      ['period_close_report', 'artifact.report.render'],
      ['auto_draft', 'billing.draft.generate'],
      ['accounting_pack_artifact_render', 'artifact.accounting_pack.render'],
      ['localized_pdf_variant_render', 'artifact.localized_pdf.render'],
      ['document_scan', 'document.scan'],
      ['outbox_deliver', 'outbox.deliver'],
      ['alert_dispatch', 'alert.dispatch'],
      ['email_send', 'email.send'],
      ['backup_verify', 'backup.verify'],
    ] as const;
    for (const [index, [kind, capability]] of oldPairs.entries())
      insertJob(sqlite, `old-job-${index}`, kind, capability);
    expect(() =>
      insertJob(sqlite, 'wrong-capability-job', 'temporary_upload_cleanup', 'document.scan'),
    ).toThrow();
    expect(() =>
      insertJob(sqlite, 'wrong-kind-job', 'invoice_pdf', 'storage.temporary.cleanup'),
    ).toThrow();
    expect(() =>
      insertJob(
        sqlite,
        'cross-job',
        'temporary_upload_cleanup',
        'storage.temporary.cleanup',
        'other-tenant',
      ),
    ).toThrow();
    expect(() =>
      insertJob(
        sqlite,
        'unknown-kind-job',
        'temporary_upload_unknown',
        'storage.temporary.cleanup',
      ),
    ).toThrow();
    expect(sqlite.prepare("SELECT state FROM job WHERE id='cleanup-job'").get()).toEqual({
      state: 'queued',
    });
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('preserves populated 26 rows, old pairs and quarantined legacy jobs through 26 to 27', () => {
    const v26Migrations = copyMigrationTree(26);
    const allMigrations = copyMigrationTree(27);
    const directory = mkdtempSync(join(tmpdir(), 'ja-temporary-cleanup-upgrade-'));
    directories.push(directory);
    const dbPath = join(directory, 'app.db');
    buildLegacyDatabase(dbPath);
    const previous = process.env.JA_MIGRATIONS_PATH;
    let sqlite: DatabaseSync | undefined;
    try {
      process.env.JA_MIGRATIONS_PATH = v26Migrations;
      sqlite = createDatabase(dbPath).sqlite;
      databases.push(sqlite);
      insertServiceActor(sqlite, 'old-actor', ['document.scan']);
      const metadataBefore = sqlite
        .prepare('SELECT * FROM migration_contract_metadata ORDER BY migration_version')
        .all();
      const cutoverBefore = sqlite.prepare('SELECT * FROM finance_v2_cutover').all();
      sqlite.close();
      databases.splice(databases.indexOf(sqlite), 1);

      process.env.JA_MIGRATIONS_PATH = allMigrations;
      sqlite = createDatabase(dbPath).sqlite;
      databases.push(sqlite);
      expect(sqlite.prepare('SELECT max(version) version FROM schema_migration').get()).toEqual({
        version: 27,
      });
      expect(sqlite.prepare('SELECT count(*) count FROM job').get()).toEqual({ count: 1 });
      expect(
        sqlite
          .prepare(
            'SELECT * FROM migration_contract_metadata WHERE migration_version<=26 ORDER BY migration_version',
          )
          .all(),
      ).toEqual(metadataBefore);
      expect(sqlite.prepare('SELECT * FROM finance_v2_cutover').all()).toEqual(cutoverBefore);
      expect(
        sqlite.prepare("SELECT contract_version,state FROM job WHERE id='legacy-job'").get(),
      ).toEqual({
        contract_version: 'legacy',
        state: 'queued',
      });
      expect(
        sqlite.prepare("SELECT capabilities_json FROM service_actor WHERE id='old-actor'").get(),
      ).toEqual({
        capabilities_json: '["document.scan"]',
      });
      expect(() =>
        sqlite!
          .prepare("UPDATE job SET state='succeeded',version=version+1 WHERE id='legacy-job'")
          .run(),
      ).toThrow();
      expect(() => sqlite!.prepare("DELETE FROM job WHERE id='legacy-job'").run()).toThrow();

      insertJob(sqlite, 'new-cleanup-job', 'temporary_upload_cleanup', 'storage.temporary.cleanup');
      expect(sqlite.prepare('SELECT count(*) count FROM job').get()).toEqual({ count: 2 });
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      if (sqlite) {
        try {
          sqlite.close();
        } catch {
          // Preserve the upgrade failure.
        }
      }
      if (previous === undefined) delete process.env.JA_MIGRATIONS_PATH;
      else process.env.JA_MIGRATIONS_PATH = previous;
    }
  });

  it('registers export retry as a user action without granting forged service provenance', () => {
    const sqlite = fresh();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        'audit-user',
        'Audit User',
        'audit-user@example.test',
        'finance_admin',
        'active',
        1,
        now,
        now,
      );
    expect(
      sqlite
        .prepare(
          `SELECT contract_version,action,entity_type,actor_kind,owner_packet,data_classification
           FROM audit_action_registry WHERE action='accounting_pack.export_retry'`,
        )
        .get(),
    ).toEqual({
      contract_version: 'B5-R4',
      action: 'accounting_pack.export_retry',
      entity_type: 'accounting_pack_run',
      actor_kind: 'user',
      owner_packet: 'CE-CORE13/16',
      data_classification: 'restricted',
    });

    expect(() =>
      recordAuditEvent(
        sqlite,
        { userId: 'audit-user', correlationId: 'accounting-retry-correlation' },
        'accounting_pack.export_retry',
        'accounting_pack_run',
        'pack-retry-1',
        { retry: true },
      ),
    ).not.toThrow();
    expect(
      sqlite
        .prepare(
          `SELECT actor_id,actor_kind,service_actor_id,service_capability
           FROM audit_event WHERE action='accounting_pack.export_retry'`,
        )
        .get(),
    ).toEqual({
      actor_id: 'audit-user',
      actor_kind: 'user',
      service_actor_id: null,
      service_capability: null,
    });

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO audit_event(
             id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
             audit_contract_version,actor_kind,service_actor_id,service_capability,
             tenant_id,deployment_id,correlation_id,provenance
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'forged-retry-audit',
          null,
          'accounting_pack.export_retry',
          'accounting_pack_run',
          'pack-retry-forged',
          now,
          '{}',
          'B5-R4',
          'service',
          null,
          'storage.temporary.cleanup',
          'test-tenant',
          'test-deployment',
          'forged-retry-correlation',
          'native',
        ),
    ).toThrow();
    expect(
      sqlite
        .prepare(
          "SELECT count(*) count FROM audit_event WHERE action='accounting_pack.export_retry'",
        )
        .get(),
    ).toEqual({
      count: 1,
    });
    expect(integrityCheck(sqlite)).toBe('ok');
  });
});
