import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalRepository, createDatabase, integrityCheck } from '@ja/database';
import type { Principal } from '@ja/domain';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const temporaryDirectories: string[] = [];
const previousEnvironment = {
  tenant: process.env.JA_TENANT_ID,
  deployment: process.env.JA_DEPLOYMENT_ID,
  migrations: process.env.JA_MIGRATIONS_PATH,
};

afterEach(() => {
  if (previousEnvironment.tenant === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousEnvironment.tenant;
  if (previousEnvironment.deployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousEnvironment.deployment;
  if (previousEnvironment.migrations === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousEnvironment.migrations;
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function migrationTree(maxVersion: number): string {
  const directory = mkdtempSync(join(tmpdir(), `ja-period-reapproval-v${maxVersion}-`));
  temporaryDirectories.push(directory);
  for (const file of readdirSync(MIGRATIONS).filter(
    (candidate) =>
      /^\d{4}_.+\.sql$/u.test(candidate) && Number(candidate.slice(0, 4)) <= maxVersion,
  ))
    copyFileSync(join(MIGRATIONS, file), join(directory, file));
  mkdirSync(join(directory, 'contracts'));
  copyFileSync(
    join(MIGRATIONS, 'contracts', 'ja-b5-migration-contract-v1.json'),
    join(directory, 'contracts', 'ja-b5-migration-contract-v1.json'),
  );
  return directory;
}

function seedSignedReport(sqlite: ReturnType<typeof createDatabase>['sqlite']) {
  const repository = new PortalRepository(sqlite);
  const now = '2026-08-25T08:00:00.000Z';
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run('reapproval-owner', 'Owner', 'owner@reapproval.test', 'owner_admin', 'active', now, now);
  const owner: Principal = {
    userId: 'reapproval-owner',
    role: 'owner_admin',
    projectIds: new Set(),
  };
  const client = repository.createClient(owner, {
    legalName: 'Reapproval Client SL',
    displayName: 'Reapproval Client',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    billingEmail: 'billing@reapproval.test',
    billingAddress: 'Calle Reapproval 1, Madrid',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Reapproval Project',
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    billingModel: 'tm',
    startDate: '2026-01-01',
  });
  const snapshotJson = '{}';
  const snapshotSha256 = createHash('sha256').update(snapshotJson).digest('hex');
  const pdfSha256 = 'c'.repeat(64);
  sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
         pdf_storage_key,pdf_sha256,created_by,created_at,updated_at,pdf_byte_length,
         snapshot_version,snapshot_sha256
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'reapproval-report',
      project.id,
      '2026-08-01',
      '2026-08-31',
      'customer',
      'customer_period',
      'approved',
      snapshotJson,
      'reports/reapproval-report/report.pdf',
      pdfSha256,
      owner.userId,
      now,
      now,
      100,
      1,
      snapshotSha256,
    );
  sqlite
    .prepare(
      `INSERT INTO customer_conformity(
         id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,
         report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,
         signer_name,signer_identity,signed_at,signature_document_id,created_by,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'reapproval-conformity',
      'reapproval-report',
      1,
      snapshotSha256,
      snapshotJson,
      'reports/reapproval-report/report.pdf',
      pdfSha256,
      100,
      'Customer Signer',
      'customer@reapproval.test',
      now,
      null,
      owner.userId,
      now,
    );
  return { projectId: project.id, snapshotSha256 };
}

describe('migration 0029 period report reapproval', () => {
  it('creates the split identity/state guards on a fresh database', () => {
    process.env.JA_TENANT_ID = 'reapproval-test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'reapproval-test-deployment';
    const { sqlite } = createDatabase(':memory:');
    try {
      expect(sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
        version: 30,
      });
      expect(
        sqlite
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='trigger'
              AND name IN(
                'period_report_customer_conformity_identity_guard',
                'period_report_customer_conformity_state_guard'
              ) ORDER BY name`,
          )
          .all(),
      ).toEqual([
        { name: 'period_report_customer_conformity_identity_guard' },
        { name: 'period_report_customer_conformity_state_guard' },
      ]);
      expect(integrityCheck(sqlite)).toBe('ok');
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it('migration 0030 makes each report version an immutable snapshot/PDF source binding', () => {
    process.env.JA_TENANT_ID = 'source-binding-test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'source-binding-test-deployment';
    const { sqlite } = createDatabase(':memory:');
    try {
      seedSignedReport(sqlite);
      expect(
        sqlite
          .prepare("SELECT name FROM pragma_table_info('period_report') WHERE name='approved_at'")
          .get(),
      ).toEqual({ name: 'approved_at' });
      expect(() =>
        sqlite
          .prepare(
            "UPDATE period_report SET snapshot_json='{} ',snapshot_sha256=? WHERE id='reapproval-report'",
          )
          .run('e'.repeat(64)),
      ).toThrow(/active conformity|source binding/i);
      expect(() =>
        sqlite
          .prepare(
            "UPDATE period_report SET pdf_storage_key='reports/reapproval-report/replaced.pdf' WHERE id='reapproval-report'",
          )
          .run(),
      ).toThrow(/active conformity|source binding/i);

      sqlite
        .prepare(
          `INSERT INTO customer_conformity_invalidation(
             id,conformity_id,reason,actor_id,occurred_at
           ) VALUES(?,?,?,?,?)`,
        )
        .run(
          'source-binding-invalidation',
          'reapproval-conformity',
          'Refresh exact source truth',
          'reapproval-owner',
          '2026-08-25T10:00:00.000Z',
        );
      expect(() =>
        sqlite
          .prepare(
            "UPDATE period_report SET snapshot_json='{} ',snapshot_sha256=? WHERE id='reapproval-report'",
          )
          .run('e'.repeat(64)),
      ).toThrow(/source binding/i);
      expect(() =>
        sqlite
          .prepare(
            "UPDATE period_report SET pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL WHERE id='reapproval-report'",
          )
          .run(),
      ).toThrow(/source binding/i);

      sqlite
        .prepare(
          `UPDATE period_report
              SET snapshot_version=2,snapshot_json=?,snapshot_sha256=?,
                  pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL,approved_at=NULL
            WHERE id='reapproval-report'`,
        )
        .run('{"revision":2}', 'd'.repeat(64));
      sqlite
        .prepare(
          `UPDATE period_report
              SET pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?
            WHERE id='reapproval-report'`,
        )
        .run('reports/reapproval-report/v2.pdf', 'f'.repeat(64), 200);
      expect(() =>
        sqlite
          .prepare(
            "UPDATE period_report SET pdf_storage_key='reports/reapproval-report/v2-replaced.pdf' WHERE id='reapproval-report'",
          )
          .run(),
      ).toThrow(/source binding/i);
      expect(() =>
        sqlite
          .prepare(
            `INSERT OR REPLACE INTO period_report(
               id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
               created_by,created_at,updated_at,snapshot_version
             ) SELECT id,project_id,period_start,period_end,audience,report_type,state,'{}',
                      created_by,created_at,updated_at,snapshot_version
                 FROM period_report WHERE id='reapproval-report'`,
          )
          .run(),
      ).toThrow(/constraint|foreign key|source binding/i);
      expect(integrityCheck(sqlite)).toBe('ok');
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it('upgrades populated 0028 data, blocks active conformity, and permits invalidated reapproval without weakening identity', () => {
    process.env.JA_TENANT_ID = 'reapproval-test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'reapproval-test-deployment';
    const v28 = migrationTree(28);
    const directory = mkdtempSync(join(tmpdir(), 'ja-period-reapproval-upgrade-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    process.env.JA_MIGRATIONS_PATH = v28;
    const initial = createDatabase(databasePath);
    const { projectId, snapshotSha256 } = seedSignedReport(initial.sqlite);
    initial.sqlite
      .prepare(
        `INSERT INTO customer_conformity_invalidation(
           id,conformity_id,reason,actor_id,occurred_at
         ) VALUES(?,?,?,?,?)`,
      )
      .run(
        'reapproval-invalidation',
        'reapproval-conformity',
        'Customer requested a corrected version',
        'reapproval-owner',
        '2026-08-25T09:00:00.000Z',
      );
    expect(() =>
      initial.sqlite
        .prepare("UPDATE period_report SET state='review' WHERE id='reapproval-report'")
        .run(),
    ).toThrow(/identity|conformity/i);
    initial.sqlite.close();

    process.env.JA_MIGRATIONS_PATH = MIGRATIONS;
    const upgraded = createDatabase(databasePath);
    try {
      expect(
        upgraded.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get(),
      ).toEqual({ version: 30 });
      expect(
        upgraded.sqlite
          .prepare(
            `SELECT project_id,state,snapshot_version,snapshot_sha256
               FROM period_report WHERE id='reapproval-report'`,
          )
          .get(),
      ).toEqual({
        project_id: projectId,
        state: 'approved',
        snapshot_version: 1,
        snapshot_sha256: snapshotSha256,
      });
      upgraded.sqlite
        .prepare("UPDATE period_report SET state='review' WHERE id='reapproval-report'")
        .run();
      upgraded.sqlite
        .prepare(
          `UPDATE period_report
              SET snapshot_version=2,snapshot_sha256=?,snapshot_json=?,
                  pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL
            WHERE id='reapproval-report'`,
        )
        .run('d'.repeat(64), '{"revision":2}');
      expect(
        upgraded.sqlite
          .prepare(
            `SELECT state,snapshot_version,snapshot_sha256,pdf_storage_key
               FROM period_report WHERE id='reapproval-report'`,
          )
          .get(),
      ).toEqual({
        state: 'review',
        snapshot_version: 2,
        snapshot_sha256: 'd'.repeat(64),
        pdf_storage_key: null,
      });
      expect(() =>
        upgraded.sqlite
          .prepare("UPDATE period_report SET project_id='changed' WHERE id='reapproval-report'")
          .run(),
      ).toThrow(/identity|conformity/i);
      expect(integrityCheck(upgraded.sqlite)).toBe('ok');
      expect(upgraded.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      upgraded.sqlite.close();
    }
  });

  it('continues to deny state changes while conformity is active after the upgrade', () => {
    process.env.JA_TENANT_ID = 'reapproval-test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'reapproval-test-deployment';
    const { sqlite } = createDatabase(':memory:');
    try {
      seedSignedReport(sqlite);
      expect(() =>
        sqlite
          .prepare("UPDATE period_report SET state='review' WHERE id='reapproval-report'")
          .run(),
      ).toThrow(/active conformity/i);
      expect(() =>
        sqlite
          .prepare("UPDATE period_report SET snapshot_version=2 WHERE id='reapproval-report'")
          .run(),
      ).toThrow(/active conformity/i);
      expect(
        sqlite
          .prepare("SELECT state,snapshot_version FROM period_report WHERE id='reapproval-report'")
          .get(),
      ).toEqual({ state: 'approved', snapshot_version: 1 });
    } finally {
      sqlite.close();
    }
  });
});
