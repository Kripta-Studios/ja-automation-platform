import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const directories: string[] = [];
let restoreDeploymentIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
});

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

afterAll(() => restoreDeploymentIdentity?.());

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function expectSqliteFailure(action: () => unknown): void {
  expect(action).toThrow();
}

function hash(): string {
  return 'a'.repeat(64);
}

function seedSeriesSubjectParents(sqlite: B5LifecycleSecurityFixture['sqlite']): void {
  const now = new Date().toISOString();
  // These rows model a legacy/direct-SQL graph whose command/evidence parents
  // are outside this focused pointer test.  Keep FK enforcement on for the
  // actual series INSERTs; disable it only while constructing those parents.
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
        'b5-legal-revision',
        'b5-legal-series',
        1,
        null,
        'test-tenant',
        'test-deployment',
        'B5 Legal Entity',
        'B5-TAX',
        'B5-REG',
        'B5 Street 1',
        null,
        'Madrid',
        'Madrid',
        '28001',
        'ES',
        'EUR',
        'Europe/Madrid',
        '2026-01-01',
        null,
        hash(),
        now,
        'b5-owner',
        'b5-missing-command',
      );
    sqlite
      .prepare(
        `INSERT INTO report_definition(
          definition_id,family_id,display_name,authorization_contract,filter_contract_hash,
          query_version,column_schema_hash,semantic_filename_token,snapshot_mode,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'b5-report-definition',
        'b5-family',
        'B5 Report',
        'b5-authorize',
        hash(),
        'v1',
        hash(),
        'b5-report',
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
      .run('b5-report-template', 'b5-report-definition', 1, hash(), hash(), '["pdf"]', hash(), now);
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON');
  }
}

function insertInvoice(sqlite: B5LifecycleSecurityFixture['sqlite'], id: string, state = 'draft') {
  const now = new Date().toISOString();
  const projectId = (
    sqlite.prepare('SELECT id FROM project ORDER BY id LIMIT 1').get() as { id: string }
  ).id;
  sqlite
    .prepare(
      `INSERT INTO invoice(
        id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
        created_at,updated_at,version
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      id,
      projectId,
      state === 'draft' ? null : `INV-${id}`,
      'labor',
      state,
      'EUR',
      0,
      0,
      0,
      now,
      now,
    );
}

function insertJobAndClaim(sqlite: B5LifecycleSecurityFixture['sqlite']) {
  const now = new Date().toISOString();
  const runId = 'b5-run-valid';
  const serviceBinding = sqlite
    .prepare(
      `SELECT actor.id AS actor_id,actor.version AS actor_version,
              actor.capabilities_json,binding.version AS binding_version
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
      ) VALUES('b5-job','invoice_pdf','b5-job-key','queued',?,NULL,0,'{}',?,?,1,
        'test-tenant','test-deployment','b5-v1',?,?,?,NULL,0,5,NULL)`,
    )
    .run(now, now, now, hash(), 'b5-correlation', 'artifact.invoice.render');
  const leaseUntil = new Date(Date.now() + 60_000).toISOString();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite
      .prepare(
        `UPDATE job
         SET state='claimed',active_job_run_id=?,lease_until=?,attempts=1,fence_version=1,version=2
         WHERE id='b5-job'`,
      )
      .run(runId, leaseUntil);
    sqlite
      .prepare(
        `INSERT INTO job_run(
          id,job_id,started_at,tenant_id,deployment_id,contract_version,kind,required_capability,
          service_actor_id,service_actor_version,service_actor_capabilities_json,configured_binding_version,
          correlation_id,payload_sha256,state,fence_version,fencing_token,lease_until
        ) VALUES(?,?,?,?,?,'b5-v1',?,?,?,?,?,?,?,?, 'claimed',1,?,?)`,
      )
      .run(
        runId,
        'b5-job',
        now,
        'test-tenant',
        'test-deployment',
        'invoice_pdf',
        'artifact.invoice.render',
        serviceBinding.actor_id,
        serviceBinding.actor_version,
        serviceBinding.capabilities_json,
        serviceBinding.binding_version,
        'b5-correlation',
        hash(),
        'fence-token-valid',
        leaseUntil,
      );
    sqlite.exec('COMMIT');
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
  return { now, runId };
}

function createPopulatedLegacyDatabase(): {
  directory: string;
  dbPath: string;
  sqlite: DatabaseSync;
} {
  const directory = mkdtempSync(join(tmpdir(), 'ja-b5-migration-legacy-'));
  const dbPath = join(directory, 'app.db');
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  const migrationDirectory = resolve(process.cwd(), 'migrations');
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
    .sort();
  for (const file of files.filter((file) => Number(file.slice(0, 4)) <= 18))
    sqlite.exec(readFileSync(join(migrationDirectory, file), 'utf8'));

  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
       VALUES('legacy-owner','Legacy Owner','legacy-owner@example.test','owner_admin','active',?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at)
       VALUES('legacy-client','C-LEGACY','Legacy Client','Legacy Client','active','EUR','UTC',?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at)
       VALUES('legacy-project','C-LEGACY-P-001','legacy-client','Legacy Project','UTC','EUR','active','tm',?,?)`,
    )
    .run(now, now);
  const insertInvoice = sqlite.prepare(
    `INSERT INTO invoice(
       id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
       created_at,updated_at,version
     ) VALUES(?,?,NULL,'labor','draft','EUR',0,0,0,?,?,1)`,
  );
  insertInvoice.run('inv', 'legacy-project', now, now);
  insertInvoice.run('inv:time', 'legacy-project', now, now);
  sqlite
    .prepare(
      `INSERT INTO invoice_source(invoice_id,source_type,source_id,source_version,locked_at)
       VALUES('inv','time','expense:é\r\nentry',1,NULL),
             ('inv:time','expense','é\r\nentry',1,NULL)`,
    )
    .run();
  return { directory, dbPath, sqlite };
}

describe('B5 migration adversarial SQL contract', () => {
  it('uses a framed collision-free source link ID for colon, Unicode and CRLF legacy values', () => {
    const legacy = createPopulatedLegacyDatabase();
    directories.push(legacy.directory);
    legacy.sqlite.close();

    const migrated = createDatabase(legacy.dbPath).sqlite;
    try {
      const links = migrated
        .prepare(
          `SELECT source_link_id,invoice_id,source_type,source_id
           FROM invoice_source ORDER BY invoice_id,source_type,source_id`,
        )
        .all() as Array<{
        source_link_id: string;
        invoice_id: string;
        source_type: string;
        source_id: string;
      }>;
      expect(links).toEqual([
        {
          source_link_id: 'legacy-source-v1:696E76:74696D65:657870656E73653AC3A90D0A656E747279',
          invoice_id: 'inv',
          source_type: 'time',
          source_id: 'expense:é\r\nentry',
        },
        {
          source_link_id: 'legacy-source-v1:696E763A74696D65:657870656E7365:C3A90D0A656E747279',
          invoice_id: 'inv:time',
          source_type: 'expense',
          source_id: 'é\r\nentry',
        },
      ]);
      expect(new Set(links.map((row) => row.source_link_id)).size).toBe(2);
    } finally {
      migrated.close();
    }
  });

  it('rejects update and delete of sources attached to issued invoices', () => {
    const value = fixture();
    insertInvoice(value.sqlite, 'issued-invoice');
    value.sqlite
      .prepare(
        `INSERT INTO invoice_source(source_link_id,invoice_id,source_type,source_id,source_version,locked_at)
         VALUES('issued-source','issued-invoice','time','issued-time',1,NULL)`,
      )
      .run();
    value.sqlite
      .prepare(
        `UPDATE invoice
         SET invoice_number='INV-issued-invoice',state='issued',issued_at=?,snapshot_json=?
         WHERE id='issued-invoice'`,
      )
      .run(new Date().toISOString(), '{}');

    expectSqliteFailure(() =>
      value.sqlite
        .prepare("UPDATE invoice_source SET source_version=2 WHERE source_link_id='issued-source'")
        .run(),
    );
    expectSqliteFailure(() =>
      value.sqlite.prepare("DELETE FROM invoice_source WHERE source_link_id='issued-source'").run(),
    );
  });

  it('rejects NULL job-run state and invalid terminal transitions', () => {
    const value = fixture();
    const { now, runId } = insertJobAndClaim(value.sqlite);
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO job_run(
            id,job_id,started_at,tenant_id,deployment_id,contract_version,kind,required_capability,
            service_actor_id,service_actor_version,service_actor_capabilities_json,configured_binding_version,
            correlation_id,payload_sha256,state,fence_version,fencing_token,lease_until
          ) VALUES(?,?,?,?,?,'b5-v1',?,?,?,?,?,?,?,?,NULL,1,?,?)`,
        )
        .run(
          'b5-run-null-state',
          'b5-job',
          now,
          'test-tenant',
          'test-deployment',
          'invoice_pdf',
          'artifact.invoice.render',
          'b5-service',
          1,
          '["artifact.invoice.render"]',
          1,
          'b5-correlation',
          hash(),
          'fence-token-null-state',
          new Date(Date.now() + 60_000).toISOString(),
        ),
    );

    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          "UPDATE job_run SET state='succeeded',finished_at=?,outcome='succeeded' WHERE id=?",
        )
        .run(new Date().toISOString(), runId),
    );
  });

  it('accepts the localized PDF job/capability pair and rejects mismatches', () => {
    const value = fixture();
    const lifecycleSql = readFileSync(
      resolve(process.cwd(), 'migrations/0019_lifecycle_security.sql'),
      'utf8',
    );
    expect(lifecycleSql).toContain("localized_pdf_variant_render' AND NEW.required_capability='artifact.localized_pdf.render'");
    const now = new Date().toISOString();
    const insert = value.sqlite.prepare(
      `INSERT INTO job(
        id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,
        version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,required_capability,
        active_job_run_id,fence_version,max_attempts,last_error_code
      ) VALUES(?,?,?,'queued',?,NULL,0,'{}',?,?,1,?,?, 'b5-v1',?,?,?,NULL,0,5,NULL)`,
    );
    expect(() =>
      insert.run(
        'b5-localized-ok',
        'localized_pdf_variant_render',
        'b5-localized-ok-key',
        now,
        now,
        now,
        'test-tenant',
        'test-deployment',
        hash(),
        'b5-localized-correlation',
        'artifact.localized_pdf.render',
      ),
    ).not.toThrow();
    expectSqliteFailure(() =>
      insert.run(
        'b5-localized-wrong',
        'localized_pdf_variant_render',
        'b5-localized-wrong-key',
        now,
        now,
        now,
        'test-tenant',
        'test-deployment',
        hash(),
        'b5-localized-wrong-correlation',
        'artifact.report.render',
      ),
    );
  });

  it('requires native audit provenance and an anchored tenant/deployment pair', () => {
    const value = fixture();
    const base = {
      id: 'audit-adversarial',
      actorId: 'b5-owner',
      action: 'lifecycle.transition',
      entityType: 'client',
      entityId: value.client.id,
      occurredAt: new Date().toISOString(),
      detailsJson: '{}',
      auditContractVersion: 'B5-R4',
      actorKind: 'user',
      correlationId: 'audit-adversarial-correlation',
    };
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO audit_event(
            id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
            audit_contract_version,actor_kind,tenant_id,deployment_id,correlation_id,provenance
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          base.id,
          base.actorId,
          base.action,
          base.entityType,
          base.entityId,
          base.occurredAt,
          base.detailsJson,
          base.auditContractVersion,
          base.actorKind,
          'foreign-tenant',
          'foreign-deployment',
          base.correlationId,
          'native',
        ),
    );
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO audit_event(
            id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
            audit_contract_version,actor_kind,tenant_id,deployment_id,correlation_id,provenance
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
        )
        .run(
          `${base.id}-null-provenance`,
          base.actorId,
          base.action,
          base.entityType,
          base.entityId,
          base.occurredAt,
          base.detailsJson,
          base.auditContractVersion,
          base.actorKind,
          'test-tenant',
          'test-deployment',
          `${base.correlationId}-null`,
        ),
    );
  });

  it('accepts only rows represented by the reviewed audit action registry', () => {
    const value = fixture();
    expect(
      value.sqlite
        .prepare(
          `SELECT 1 FROM audit_action_registry
           WHERE contract_version='B5-R4' AND action='client.create'
             AND entity_type='client' AND actor_kind='user'`,
        )
        .get(),
    ).toBeTruthy();
    expect(
      value.sqlite.prepare("SELECT 1 FROM audit_event WHERE action='client.create'").get(),
    ).toBeTruthy();
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO audit_action_registry(
            contract_version,action,entity_type,actor_kind,owner_packet,data_classification
          ) VALUES('B5-R4','unreviewed.action','client','user','attacker','internal')`,
        )
        .run(),
    );
  });

  it('records archived client/project states as migration-observed with no invented prior state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-migration-archived-'));
    directories.push(directory);
    const dbPath = join(directory, 'app.db');
    let sqlite = new DatabaseSync(dbPath);
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
    const migrationDirectory = resolve(process.cwd(), 'migrations');
    const files = readdirSync(migrationDirectory)
      .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
      .sort();
    for (const file of files.filter((file) => Number(file.slice(0, 4)) <= 18))
      sqlite.exec(readFileSync(join(migrationDirectory, file), 'utf8'));
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
         VALUES('archived-owner','Archived Owner','archived-owner@example.test','owner_admin','active',?,?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at)
         VALUES('archived-client','C-ARCH','Archived Client','Archived Client','archived','EUR','UTC',?,?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at)
         VALUES('archived-project','C-ARCH-P-001','archived-client','Archived Project','UTC','EUR','archived','tm',?,?)`,
      )
      .run(now, now);
    sqlite.close();

    let migrated: DatabaseSync | undefined;
    try {
      migrated = createDatabase(dbPath).sqlite;
      expect(
        migrated
          .prepare(
            `SELECT entity_type,entity_id,from_state,to_state,actor_user_id,provenance
             FROM entity_lifecycle_event WHERE entity_id IN('archived-client','archived-project')
             ORDER BY entity_type`,
          )
          .all(),
      ).toEqual([
        {
          entity_type: 'client',
          entity_id: 'archived-client',
          from_state: null,
          to_state: 'archived',
          actor_user_id: null,
          provenance: 'migration_observed',
        },
        {
          entity_type: 'project',
          entity_id: 'archived-project',
          from_state: null,
          to_state: 'archived',
          actor_user_id: null,
          provenance: 'migration_observed',
        },
      ]);
    } finally {
      migrated?.close();
    }
  });

  it('requires an approved/locked original and a draft correction', () => {
    const value = fixture();
    const original = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-01',
      category: 'regular',
      minutes: 60,
      summary: 'Original',
    }) as { id: string };
    const correction = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-01',
      category: 'regular',
      minutes: 30,
      summary: 'Correction',
    }) as { id: string };
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO record_correction_link(
            id,tenant_id,record_type,original_id,correction_id,request_id,request_payload_sha256,
            actor_user_id,reason,created_at,correlation_id
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'invalid-correction-link',
          'test-tenant',
          'time_entry',
          original.id,
          correction.id,
          'invalid-request',
          hash(),
          'b5-owner',
          'Original is still draft',
          new Date().toISOString(),
          'invalid-correction-correlation',
        ),
    );
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='approved',version=version+1 WHERE id=?")
      .run(original.id);
    expect(() =>
      value.sqlite
        .prepare(
          `INSERT INTO record_correction_link(
            id,tenant_id,record_type,original_id,correction_id,request_id,request_payload_sha256,
            actor_user_id,reason,created_at,correlation_id
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'valid-correction-link',
          'test-tenant',
          'time_entry',
          original.id,
          correction.id,
          'valid-request',
          hash(),
          'b5-owner',
          'Correct approved original',
          new Date().toISOString(),
          'valid-correction-correlation',
        ),
    ).not.toThrow();
  });

  it('binds a correction to the original project and user subject', () => {
    const value = fixture();
    const secondProject = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      name: 'B5 correction subject project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    value.repository.assignWorker(value.owner, {
      projectId: secondProject.id,
      workerId: 'b5-worker',
      startsOn: '2026-01-01',
    });
    const original = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-01',
      category: 'regular',
      minutes: 60,
      summary: 'Original subject',
    }) as { id: string };
    const foreignCorrection = value.repository.createTimeEntry(value.worker, {
      projectId: secondProject.id,
      workDate: '2026-08-01',
      category: 'regular',
      minutes: 30,
      summary: 'Foreign subject',
    }) as { id: string };
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='approved',version=version+1 WHERE id=?")
      .run(original.id);
    expectSqliteFailure(() =>
      value.sqlite
        .prepare(
          `INSERT INTO record_correction_link(
            id,tenant_id,record_type,original_id,correction_id,request_id,request_payload_sha256,
            actor_user_id,reason,created_at,correlation_id
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'foreign-subject-link',
          'test-tenant',
          'time_entry',
          original.id,
          foreignCorrection.id,
          'foreign-subject-request',
          hash(),
          'b5-owner',
          'Correction subject must remain within the original project',
          new Date().toISOString(),
          'foreign-subject-correlation',
        ),
    );
  });

  it('requires accounting and report series pointers to start null or reference a coherent subject', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);

    const insertAccountingSeries = value.sqlite.prepare(
      `INSERT INTO accounting_pack_series(
        series_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,
        period_start,period_end,tail_revision_id,current_authority_event_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    );
    expect(() =>
      insertAccountingSeries.run(
        'b5-pack-null',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-01-01',
        '2026-01-31',
        null,
        null,
      ),
    ).not.toThrow();
    expectSqliteFailure(() =>
      insertAccountingSeries.run(
        'b5-pack-dangling-tail',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-02-01',
        '2026-02-28',
        'missing-pack-revision',
        null,
      ),
    );
    expectSqliteFailure(() =>
      insertAccountingSeries.run(
        'b5-pack-dangling-authority',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-03-01',
        '2026-03-31',
        null,
        'missing-pack-authority',
      ),
    );

    const insertReportSeries = value.sqlite.prepare(
      `INSERT INTO period_report_series(
        series_id,definition_id,tenant_id,deployment_id,legal_entity_revision_id,currency,
        timezone,period_start,period_end,tail_revision_id,current_authority_event_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    );
    expect(() =>
      insertReportSeries.run(
        'b5-report-null',
        'b5-report-definition',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-01-01',
        '2026-01-31',
        null,
        null,
      ),
    ).not.toThrow();
    expectSqliteFailure(() =>
      insertReportSeries.run(
        'b5-report-dangling-tail',
        'b5-report-definition',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-02-01',
        '2026-02-28',
        'missing-report-revision',
        null,
      ),
    );
    expectSqliteFailure(() =>
      insertReportSeries.run(
        'b5-report-dangling-authority',
        'b5-report-definition',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-03-01',
        '2026-03-31',
        null,
        'missing-report-authority',
      ),
    );
  });

  it('rejects cross-series tail and authority pointers even when the referenced rows exist', () => {
    const value = fixture();
    seedSeriesSubjectParents(value.sqlite);
    const now = new Date().toISOString();
    const insertAccountingSeries = value.sqlite.prepare(
      `INSERT INTO accounting_pack_series(
        series_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,
        period_start,period_end,tail_revision_id,current_authority_event_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    );
    insertAccountingSeries.run(
      'b5-pack-source',
      'test-tenant',
      'test-deployment',
      'b5-legal-revision',
      'EUR',
      'Europe/Madrid',
      '2026-02-01',
      '2026-02-28',
      null,
      null,
    );
    const insertReportSeries = value.sqlite.prepare(
      `INSERT INTO period_report_series(
        series_id,definition_id,tenant_id,deployment_id,legal_entity_revision_id,currency,
        timezone,period_start,period_end,tail_revision_id,current_authority_event_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    );
    insertReportSeries.run(
      'b5-report-source',
      'b5-report-definition',
      'test-tenant',
      'test-deployment',
      'b5-legal-revision',
      'EUR',
      'Europe/Madrid',
      '2026-02-01',
      '2026-02-28',
      null,
      null,
    );

    value.sqlite.exec('PRAGMA foreign_keys=OFF');
    try {
      value.sqlite
        .prepare(
          `INSERT INTO accounting_pack_revision(
            revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
            legal_entity_revision_id,currency,timezone,period_start,period_end,source_cut_id,
            source_cut_hash,reconciliation_status,reconciliation_difference_minor,blocker_count,
            status,revision_hash,created_at,created_by,command_id
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'b5-pack-source-revision',
          'b5-pack-source',
          1,
          null,
          'test-tenant',
          'test-deployment',
          'b5-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-02-01',
          '2026-02-28',
          'b5-missing-cut',
          hash(),
          'CLEAN',
          0,
          0,
          'candidate',
          'b'.repeat(64),
          now,
          'b5-owner',
          'b5-missing-command',
        );
      value.sqlite
        .prepare(
          `INSERT INTO accounting_pack_authority_event(
            authority_event_id,series_id,revision_id,prior_authority_event_id,event_type,
            effective_at,reason,principal_id,command_id,event_hash,created_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'b5-pack-source-authority',
          'b5-pack-source',
          'b5-pack-source-revision',
          null,
          'finalize',
          now,
          'B5 source authority',
          'b5-owner',
          'b5-missing-command-authority',
          'c'.repeat(64),
          now,
        );
      value.sqlite
        .prepare(
          `INSERT INTO period_report_revision(
            revision_id,series_id,definition_id,template_version_id,revision_number,
            predecessor_revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,
            timezone,period_start,period_end,source_manifest_id,source_manifest_hash,status,
            missing_activity_count,blocker_count,revision_hash,created_at,created_by,command_id
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'b5-report-source-revision',
          'b5-report-source',
          'b5-report-definition',
          'b5-report-template',
          1,
          null,
          'test-tenant',
          'test-deployment',
          'b5-legal-revision',
          'EUR',
          'Europe/Madrid',
          '2026-02-01',
          '2026-02-28',
          'b5-missing-manifest',
          'd'.repeat(64),
          'candidate',
          0,
          0,
          'e'.repeat(64),
          now,
          'b5-owner',
          'b5-missing-report-command',
        );
      value.sqlite
        .prepare(
          `INSERT INTO period_report_authority_event(
            authority_event_id,series_id,revision_id,prior_authority_event_id,event_type,
            effective_at,reason,principal_id,command_id,event_hash,created_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'b5-report-source-authority',
          'b5-report-source',
          'b5-report-source-revision',
          null,
          'finalize',
          now,
          'B5 source authority',
          'b5-owner',
          'b5-missing-report-authority-command',
          'f'.repeat(64),
          now,
        );
    } finally {
      value.sqlite.exec('PRAGMA foreign_keys=ON');
    }

    expectSqliteFailure(() =>
      insertAccountingSeries.run(
        'b5-pack-cross-tail',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-03-01',
        '2026-03-31',
        'b5-pack-source-revision',
        null,
      ),
    );
    expectSqliteFailure(() =>
      insertAccountingSeries.run(
        'b5-pack-cross-authority',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-04-01',
        '2026-04-30',
        'b5-pack-source-revision',
        'b5-pack-source-authority',
      ),
    );
    expectSqliteFailure(() =>
      insertReportSeries.run(
        'b5-report-cross-tail',
        'b5-report-definition',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-03-01',
        '2026-03-31',
        'b5-report-source-revision',
        null,
      ),
    );
    expectSqliteFailure(() =>
      insertReportSeries.run(
        'b5-report-cross-authority',
        'b5-report-definition',
        'test-tenant',
        'test-deployment',
        'b5-legal-revision',
        'EUR',
        'Europe/Madrid',
        '2026-04-01',
        '2026-04-30',
        'b5-report-source-revision',
        'b5-report-source-authority',
      ),
    );
  });

  it('keeps finance series identities immutable and pointer updates CAS-bound', () => {
    const sql = readFileSync(resolve(process.cwd(), 'migrations/0020_finance_v2.sql'), 'utf8');
    for (const [series, pointer, deleteTrigger] of [
      ['expense_classification_series', 'expense_classification_series_pointer_guard', 'expense_classification_series_no_delete'],
      ['reimbursement_principal_series', 'reimbursement_principal_series_pointer_guard', 'reimbursement_principal_series_no_delete'],
      ['compensation_settlement_series_v2', 'compensation_settlement_series_pointer_guard', 'compensation_settlement_series_no_delete'],
      ['direct_cost_series', 'direct_cost_series_no_update', 'direct_cost_series_no_delete'],
    ]) {
      expect(sql).toContain(`CREATE TRIGGER ${deleteTrigger}`);
      expect(sql).toContain(`CREATE TRIGGER ${pointer}`);
    }
    expect(sql).toContain('invalid legal entity revision predecessor');
    expect(sql).toContain('invalid finance configuration revision predecessor');
  });

  it('keeps legacy finance snapshots immutable financial history', () => {
    const value = fixture();
    const now = new Date().toISOString();
    value.sqlite
      .prepare(
        `INSERT INTO finance_snapshot(
          id,project_id,as_of,cost_minor,revenue_minor,contribution_margin_minor,etc_minor,
          eac_minor,input_hash,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run('b5-finance-snapshot', value.project.id, '2026-08-01', 100, 200, 100, 150, 175, hash(), now);

    expectSqliteFailure(() =>
      value.sqlite
        .prepare('UPDATE finance_snapshot SET cost_minor=101 WHERE id=?')
        .run('b5-finance-snapshot'),
    );
    expectSqliteFailure(() =>
      value.sqlite.prepare('DELETE FROM finance_snapshot WHERE id=?').run('b5-finance-snapshot'),
    );
    expect(
      value.sqlite
        .prepare('SELECT cost_minor,revenue_minor FROM finance_snapshot WHERE id=?')
        .get('b5-finance-snapshot'),
    ).toEqual({ cost_minor: 100, revenue_minor: 200 });
  });

  it('rejects unbound artifact ready metadata while preserving the SQL hash boundary', () => {
    const accountingSql = readFileSync(
      resolve(process.cwd(), 'migrations/0021_accounting_pack_artifacts.sql'),
      'utf8',
    );
    const reportSql = readFileSync(resolve(process.cwd(), 'migrations/0022_report_registry.sql'), 'utf8');
    for (const sql of [accountingSql, reportSql]) {
      expect(sql).toContain("media_type='application/pdf'");
      expect(sql).toContain("media_type='application/json'");
      expect(sql).toContain("instr(lower(storage_key),'%2e')=0");
      expect(sql).toContain("instr(storage_key,':')=0");
      expect(sql).toContain("json_extract(j.payload_json,'$.requestedAttempt')=NEW.current_attempt_number");
      expect(sql).toContain("r.outcome='succeeded'");
      expect(sql).toContain('finished_at IS NOT NULL');
    }
    expect(accountingSql).toContain('accounting_pack_artifact_attempt_subject_guard');
    expect(reportSql).toContain('report_template_authority_subject_guard');
    expect(reportSql).toContain('report revision template is outside its definition');
  });

  it('registers private documents with the complete classified column set', () => {
    const value = fixture();
    expect(() =>
      value.repository.registerPrivateDocument(value.owner, {
        projectId: value.project.id,
        sha256: hash(),
        mediaType: 'application/pdf',
        byteLength: 12,
        storageKey: 'private/b5-document.pdf',
        originalFilename: 'b5-document.pdf',
        description: 'Private migration test document',
        artifactType: 'report',
        sensitivity: 'customer_private',
        artifactClassification: 'confidential',
      }),
    ).not.toThrow();
  });

  it('requires the current attempt, successful fenced job and integrity fields before ready', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/0021_accounting_pack_artifacts.sql'),
      'utf8',
    );
    expect(sql).toContain("status='ready'");
    expect(sql).toContain("source_hash NOT GLOB '*[^0-9a-f]*'");
    expect(sql).toContain('storage_key IS NOT NULL');
    expect(sql).toMatch(/job_run/u);
    const reportSql = readFileSync(
      resolve(process.cwd(), 'migrations/0022_report_registry.sql'),
      'utf8',
    );
    expect(reportSql).toContain("status='ready'");
    expect(reportSql).toContain("content_sha256 NOT GLOB '*[^0-9a-f]*'");
    expect(reportSql).toContain('storage_key IS NOT NULL');
    expect(reportSql).toMatch(/job_run/u);
  });

  it('keeps v2 finance history append-only while allowing only guarded projections', () => {
    const sql = readFileSync(resolve(process.cwd(), 'migrations/0020_finance_v2.sql'), 'utf8');
    for (const table of [
      'project_legal_entity_assignment',
      'expense_classification_revision',
      'reimbursement_principal_revision',
      'compensation_settlement_revision_v2',
      'invoice_event',
      'payment',
      'invoice_adjustment',
      'direct_cost_event',
      'expense_reimbursement_event_v2',
      'invoice_collection_allocation',
      'finance_source_cut',
      'finance_internal_cost_snapshot',
      'finance_snapshot',
    ]) {
      expect(sql).toContain(`BEFORE UPDATE ON ${table}`);
      expect(sql).toContain(`BEFORE DELETE ON ${table}`);
    }
  });

  it('pins the normative migration descriptor version and closed migration names', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/0019_lifecycle_security.sql'),
      'utf8',
    );
    expect(sql).toContain(
      "descriptor_version TEXT NOT NULL CHECK(descriptor_version='ja-migration-contract-v1')",
    );
    expect(sql).toContain(
      "migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN('lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry','localized_pdf_variants'))",
    );
  });
});
