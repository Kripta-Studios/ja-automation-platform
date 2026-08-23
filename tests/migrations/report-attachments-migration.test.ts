import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const CONTRACT = resolve(MIGRATIONS, 'contracts/ja-b5-migration-contract-v1.json');
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
      // A test that exercises an upgrade may close an intermediate handle.
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
  const directory = mkdtempSync(join(tmpdir(), 'ja-report-attachment-migrations-'));
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

function seedBase(sqlite: DatabaseSync): void {
  const now = new Date().toISOString();
  const insertUser = sqlite.prepare(
    `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?)`,
  );
  insertUser.run('owner', 'Owner', 'owner@attachments.test', 'owner_admin', 'active', 1, now, now);
  insertUser.run('worker', 'Worker', 'worker@attachments.test', 'worker', 'active', 1, now, now);
  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'client',
      'C-ATT-001',
      'Attachment Client',
      'Attachment Client',
      'active',
      'EUR',
      'UTC',
      now,
      now,
    );
  const insertProject = sqlite.prepare(
    `INSERT INTO project(
       id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
  );
  insertProject.run(
    'project',
    'C-ATT-001-P-001',
    'client',
    'Attachment Project',
    'UTC',
    'EUR',
    'active',
    'time_materials',
    now,
    now,
  );
  insertProject.run(
    'project-alt',
    'C-ATT-001-P-002',
    'client',
    'Attachment Alternate Project',
    'UTC',
    'EUR',
    'active',
    'time_materials',
    now,
    now,
  );
  sqlite
    .prepare(
      `INSERT INTO daily_report(
         id,project_id,worker_id,work_date,summary,approval_state,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run('daily', 'project', 'worker', '2026-08-23', 'Daily work', 'draft', now, now, 1);
  sqlite
    .prepare(
      `INSERT INTO technical_report(
         id,project_id,author_id,system_name,change_summary,safety_related,approval_state,
         created_at,updated_at,version,report_date,report_date_provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'technical',
      'project',
      'worker',
      'PLC System A',
      'Technical change',
      0,
      'draft',
      now,
      now,
      1,
      '2026-08-23',
      'native',
    );
}

function insertDocument(
  sqlite: DatabaseSync,
  id: string,
  state: 'temporary' | 'quarantined' | 'committed' | 'rejected',
  projectId = 'project',
  supersedesId: string | null = null,
  scanStatus: 'not_scanned' | 'pending' | 'clean' | 'rejected' = state === 'temporary'
    ? 'not_scanned'
    : state === 'quarantined'
      ? 'pending'
      : state === 'rejected'
        ? 'rejected'
        : 'clean',
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO document(
         id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
         created_at,updated_at,version,supersedes_id,scan_status,
         artifact_classification,classification_provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      projectId,
      'worker',
      id.padEnd(64, '0').slice(0, 64),
      'application/pdf',
      10,
      state,
      `reports/${id}.pdf`,
      now,
      now,
      1,
      supersedesId,
      scanStatus,
      'standard',
      'native',
    );
}

function link(
  sqlite: DatabaseSync,
  values: {
    id: string;
    reportType: 'daily' | 'technical';
    reportId: string;
    documentId: string;
    projectId?: string;
    attachmentKind:
      | 'daily_attachment'
      | 'technical_attachment'
      | 'plc_backup_before'
      | 'plc_backup_after';
    systemReferenceSnapshot?: string | null;
    createdBy?: string;
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO report_document_link(
         id,report_type,report_id,document_id,project_id,attachment_kind,
         system_reference_snapshot,created_by,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      values.id,
      values.reportType,
      values.reportId,
      values.documentId,
      values.projectId ?? 'project',
      values.attachmentKind,
      values.systemReferenceSnapshot ?? null,
      values.createdBy ?? 'worker',
      new Date().toISOString(),
    );
}

describe('CORE-07 report attachment migration', () => {
  it('creates the strict link table and reviewed audit identities on a fresh database', () => {
    const sqlite = fresh();
    expect(
      (
        sqlite.prepare('SELECT max(version) version FROM schema_migration').get() as {
          version: number;
        }
      ).version,
    ).toBe(27);
    expect(
      (
        sqlite
          .prepare("SELECT strict FROM pragma_table_list WHERE name='report_document_link'")
          .get() as {
          strict: number;
        }
      ).strict,
    ).toBe(1);
    expect(
      sqlite
        .prepare(
          `SELECT action,entity_type,actor_kind,owner_packet,data_classification
           FROM audit_action_registry
           WHERE action IN('report.attachment_link','report.attachment_supersede')
           ORDER BY action`,
        )
        .all(),
    ).toEqual([
      {
        action: 'report.attachment_link',
        entity_type: 'document',
        actor_kind: 'user',
        owner_packet: 'CE-CORE07',
        data_classification: 'confidential',
      },
      {
        action: 'report.attachment_supersede',
        entity_type: 'document',
        actor_kind: 'user',
        owner_packet: 'CE-CORE07',
        data_classification: 'confidential',
      },
    ]);
    expect(sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
      count: 0,
    });
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('preserves populated schema-25 reports/documents while applying migration 26', () => {
    const v25 = copyMigrationTree(25);
    const v26 = copyMigrationTree(26);
    const previous = process.env.JA_MIGRATIONS_PATH;
    const directory = mkdtempSync(join(tmpdir(), 'ja-report-attachment-upgrade-'));
    directories.push(directory);
    const dbPath = join(directory, 'app.db');
    let sqlite: DatabaseSync | undefined;
    try {
      process.env.JA_MIGRATIONS_PATH = v25;
      sqlite = createDatabase(dbPath).sqlite;
      databases.push(sqlite);
      seedBase(sqlite);
      insertDocument(sqlite, 'existing-doc', 'committed');
      sqlite.close();
      databases.splice(databases.indexOf(sqlite), 1);
      process.env.JA_MIGRATIONS_PATH = v26;
      sqlite = createDatabase(dbPath).sqlite;
      databases.push(sqlite);
      expect(
        (
          sqlite.prepare('SELECT max(version) version FROM schema_migration').get() as {
            version: number;
          }
        ).version,
      ).toBe(26);
      expect(
        sqlite.prepare("SELECT id,project_id,state FROM document WHERE id='existing-doc'").get(),
      ).toEqual({
        id: 'existing-doc',
        project_id: 'project',
        state: 'committed',
      });
      expect(
        sqlite
          .prepare("SELECT id,project_id,approval_state FROM daily_report WHERE id='daily'")
          .get(),
      ).toEqual({
        id: 'daily',
        project_id: 'project',
        approval_state: 'draft',
      });
      expect(sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
        count: 0,
      });
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      if (sqlite) {
        try {
          sqlite.close();
        } catch {
          // The database may already be closed after a failed reopen.
        }
      }
      if (previous === undefined) delete process.env.JA_MIGRATIONS_PATH;
      else process.env.JA_MIGRATIONS_PATH = previous;
    }
  });

  it('enforces report/project/type/state/system and document scope at the SQLite boundary', () => {
    const sqlite = fresh();
    seedBase(sqlite);
    insertDocument(sqlite, 'daily-temp', 'temporary');
    link(sqlite, {
      id: 'daily-link',
      reportType: 'daily',
      reportId: 'daily',
      documentId: 'daily-temp',
      attachmentKind: 'daily_attachment',
    });

    insertDocument(sqlite, 'technical-temp', 'temporary');
    expect(() =>
      link(sqlite, {
        id: 'wrong-kind',
        reportType: 'daily',
        reportId: 'daily',
        documentId: 'technical-temp',
        attachmentKind: 'technical_attachment',
      }),
    ).toThrow();
    expect(() =>
      link(sqlite, {
        id: 'wrong-system',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'technical-temp',
        attachmentKind: 'technical_attachment',
        systemReferenceSnapshot: 'Invented PLC',
      }),
    ).toThrow();
    expect(() =>
      link(sqlite, {
        id: 'wrong-project',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'technical-temp',
        projectId: 'project-alt',
        attachmentKind: 'technical_attachment',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE daily_report SET approval_state='approved',version=version+1 WHERE id='daily'",
        )
        .run(),
    ).toThrow();
    sqlite
      .prepare(
        "UPDATE document SET state='committed',scan_status='clean',version=version+1 WHERE id='daily-temp'",
      )
      .run();
    sqlite
      .prepare(
        "UPDATE daily_report SET approval_state='approved',version=version+1 WHERE id='daily'",
      )
      .run();
    expect(() =>
      link(sqlite, {
        id: 'closed-report',
        reportType: 'daily',
        reportId: 'daily',
        documentId: 'technical-temp',
        attachmentKind: 'daily_attachment',
      }),
    ).toThrow();
    expect(() =>
      link(sqlite, {
        id: 'rejected-document',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'technical-temp',
        attachmentKind: 'technical_attachment',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).not.toThrow();
    expect(sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
      count: 2,
    });
  });

  it('requires the link creator to own the linked document', () => {
    const sqlite = fresh();
    seedBase(sqlite);
    insertDocument(sqlite, 'owner-scoped-document', 'temporary');
    expect(() =>
      link(sqlite, {
        id: 'owner-mismatch-link',
        reportType: 'daily',
        reportId: 'daily',
        documentId: 'owner-scoped-document',
        attachmentKind: 'daily_attachment',
        createdBy: 'owner',
      }),
    ).toThrow();
    expect(() =>
      link(sqlite, {
        id: 'owner-match-link',
        reportType: 'daily',
        reportId: 'daily',
        documentId: 'owner-scoped-document',
        attachmentKind: 'daily_attachment',
        createdBy: 'worker',
      }),
    ).not.toThrow();
    expect(
      sqlite
        .prepare('SELECT created_by FROM report_document_link WHERE id=?')
        .get('owner-match-link'),
    ).toEqual({ created_by: 'worker' });
  });

  it('lets scanner rejection unwind a link before rejected-document cleanup', () => {
    const sqlite = fresh();
    seedBase(sqlite);
    insertDocument(sqlite, 'scanner-doc', 'quarantined');
    link(sqlite, {
      id: 'scanner-link',
      reportType: 'technical',
      reportId: 'technical',
      documentId: 'scanner-doc',
      attachmentKind: 'technical_attachment',
      systemReferenceSnapshot: 'PLC System A',
    });
    expect(() =>
      sqlite.prepare("DELETE FROM technical_report WHERE id='technical'").run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE technical_report SET project_id='project-alt',version=version+1 WHERE id='technical'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE document SET state='rejected',scan_status='rejected',version=version+1 WHERE id='scanner-doc'",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      sqlite.prepare("DELETE FROM report_document_link WHERE id='scanner-link'").run(),
    ).not.toThrow();
    expect(() => sqlite.prepare("DELETE FROM document WHERE id='scanner-doc'").run()).not.toThrow();
    expect(sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
      count: 0,
    });
  });

  it('enforces scanner-required and scanner-disabled attachment lifecycles', () => {
    const sqlite = fresh();
    seedBase(sqlite);
    // A configured scanner finalizes the upload as quarantined/pending first;
    // the link may exist while scanning, but approval must wait for the clean
    // committed result.
    insertDocument(sqlite, 'daily-pending', 'quarantined');
    link(sqlite, {
      id: 'daily-pending-link',
      reportType: 'daily',
      reportId: 'daily',
      documentId: 'daily-pending',
      attachmentKind: 'daily_attachment',
    });
    insertDocument(sqlite, 'technical-pending', 'quarantined');
    link(sqlite, {
      id: 'technical-pending-link',
      reportType: 'technical',
      reportId: 'technical',
      documentId: 'technical-pending',
      attachmentKind: 'technical_attachment',
      systemReferenceSnapshot: 'PLC System A',
    });
    insertDocument(sqlite, 'invalid-committed', 'committed', 'project', null, 'pending');
    expect(() =>
      link(sqlite, {
        id: 'invalid-committed-link',
        reportType: 'daily',
        reportId: 'daily',
        documentId: 'invalid-committed',
        attachmentKind: 'daily_attachment',
      }),
    ).toThrow();
    insertDocument(sqlite, 'invalid-quarantined', 'quarantined', 'project', null, 'clean');
    expect(() =>
      link(sqlite, {
        id: 'invalid-quarantined-link',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'invalid-quarantined',
        attachmentKind: 'technical_attachment',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).toThrow();
    insertDocument(sqlite, 'invalid-temporary-pending', 'temporary', 'project', null, 'pending');
    expect(() =>
      link(sqlite, {
        id: 'invalid-temporary-pending-link',
        reportType: 'daily',
        reportId: 'daily',
        documentId: 'invalid-temporary-pending',
        attachmentKind: 'daily_attachment',
      }),
    ).toThrow();
    insertDocument(sqlite, 'invalid-rejected', 'rejected');
    expect(() =>
      link(sqlite, {
        id: 'invalid-rejected-link',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'invalid-rejected',
        attachmentKind: 'technical_attachment',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE daily_report SET approval_state='approved',version=version+1 WHERE id='daily'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE technical_report SET approval_state='approved',version=version+1 WHERE id='technical'",
        )
        .run(),
    ).toThrow();
    sqlite
      .prepare(
        "UPDATE document SET state='committed',scan_status='clean',version=version+1 WHERE id='daily-pending'",
      )
      .run();
    sqlite
      .prepare(
        "UPDATE document SET state='committed',scan_status='clean',version=version+1 WHERE id='technical-pending'",
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE daily_report SET approval_state='approved',version=version+1 WHERE id='daily'",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE technical_report SET approval_state='approved',version=version+1 WHERE id='technical'",
        )
        .run(),
    ).not.toThrow();

    // With scanning disabled, finalizeUpload produces committed/not_scanned.
    // That state is a valid attachment and must not make an otherwise valid
    // report impossible to approve.
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO daily_report(
           id,project_id,worker_id,work_date,summary,approval_state,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run('daily-disabled', 'project', 'worker', '2026-08-24', 'Scanner disabled', 'draft', now, now, 1);
    insertDocument(sqlite, 'disabled-daily', 'committed', 'project', null, 'not_scanned');
    link(sqlite, {
      id: 'disabled-daily-link',
      reportType: 'daily',
      reportId: 'daily-disabled',
      documentId: 'disabled-daily',
      attachmentKind: 'daily_attachment',
    });
    expect(() =>
      sqlite
        .prepare(
          "UPDATE daily_report SET approval_state='approved',version=version+1 WHERE id='daily-disabled'",
        )
        .run(),
    ).not.toThrow();

    // Generic technical attachments are a collection: more than one
    // technical_attachment is valid for one report/system.
    sqlite
      .prepare(
        `INSERT INTO technical_report(
           id,project_id,author_id,system_name,change_summary,safety_related,approval_state,
           created_at,updated_at,version,report_date,report_date_provenance
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'technical-disabled',
        'project',
        'worker',
        'PLC System A',
        'Scanner-disabled attachments',
        0,
        'draft',
        now,
        now,
        1,
        '2026-08-24',
        'native',
      );
    insertDocument(sqlite, 'disabled-technical-a', 'committed', 'project', null, 'not_scanned');
    insertDocument(sqlite, 'disabled-technical-b', 'committed', 'project', null, 'not_scanned');
    link(sqlite, {
      id: 'disabled-technical-link-a',
      reportType: 'technical',
      reportId: 'technical-disabled',
      documentId: 'disabled-technical-a',
      attachmentKind: 'technical_attachment',
      systemReferenceSnapshot: 'PLC System A',
    });
    link(sqlite, {
      id: 'disabled-technical-link-b',
      reportType: 'technical',
      reportId: 'technical-disabled',
      documentId: 'disabled-technical-b',
      attachmentKind: 'technical_attachment',
      systemReferenceSnapshot: 'PLC System A',
    });
    expect(() =>
      sqlite
        .prepare(
          "UPDATE technical_report SET approval_state='approved',version=version+1 WHERE id='technical-disabled'",
        )
        .run(),
    ).not.toThrow();
  });

  it('allows temporary cancellation and valid supersession, then preserves committed history', () => {
    const sqlite = fresh();
    seedBase(sqlite);
    insertDocument(sqlite, 'temporary-doc', 'temporary');
    link(sqlite, {
      id: 'temporary-link',
      reportType: 'daily',
      reportId: 'daily',
      documentId: 'temporary-doc',
      attachmentKind: 'daily_attachment',
    });
    sqlite.prepare("DELETE FROM report_document_link WHERE id='temporary-link'").run();
    expect(sqlite.prepare('SELECT count(*) count FROM report_document_link').get()).toEqual({
      count: 0,
    });

    insertDocument(sqlite, 'before-v1', 'committed');
    link(sqlite, {
      id: 'before-link',
      reportType: 'technical',
      reportId: 'technical',
      documentId: 'before-v1',
      attachmentKind: 'plc_backup_before',
      systemReferenceSnapshot: 'PLC System A',
    });
    insertDocument(sqlite, 'before-v2', 'temporary', 'project', 'before-v1');
    link(sqlite, {
      id: 'before-link-v2',
      reportType: 'technical',
      reportId: 'technical',
      documentId: 'before-v2',
      attachmentKind: 'plc_backup_before',
      systemReferenceSnapshot: 'PLC System A',
    });
    expect(() =>
      sqlite
        .prepare(
          "UPDATE document SET state='quarantined',scan_status='pending',version=version+1 WHERE id='before-v2'",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE document SET state='committed',scan_status='clean',version=version+1 WHERE id='before-v2'",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      sqlite.prepare("UPDATE document SET state='temporary' WHERE id='before-v2'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("DELETE FROM report_document_link WHERE id='before-link'").run(),
    ).toThrow();
    expect(() => sqlite.prepare("DELETE FROM document WHERE id='before-v1'").run()).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE document SET project_id='project-alt' WHERE id='before-v2'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE document SET supersedes_id=NULL WHERE id='before-v2'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("DELETE FROM technical_report WHERE id='technical'").run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE technical_report SET project_id='project-alt',version=version+1 WHERE id='technical'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE technical_report SET system_name='Invented System',version=version+1 WHERE id='technical'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE report_document_link SET attachment_kind='technical_attachment' WHERE id='before-link-v2'",
        )
        .run(),
    ).toThrow();

    insertDocument(sqlite, 'before-root-branch', 'temporary', 'project', 'before-v1');
    expect(() =>
      link(sqlite, {
        id: 'before-link-branch',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'before-root-branch',
        attachmentKind: 'plc_backup_before',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).toThrow();
    insertDocument(sqlite, 'before-second-root', 'temporary');
    expect(() =>
      link(sqlite, {
        id: 'before-link-second-root',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'before-second-root',
        attachmentKind: 'plc_backup_before',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).toThrow();
    insertDocument(sqlite, 'after-root', 'temporary');
    expect(() =>
      link(sqlite, {
        id: 'after-link-root',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'after-root',
        attachmentKind: 'plc_backup_after',
        systemReferenceSnapshot: 'PLC System A',
      }),
    ).not.toThrow();

    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('suspended','Suspended','suspended@attachments.test','worker','suspended',1,?,?)",
      )
      .run(new Date().toISOString(), new Date().toISOString());
    insertDocument(sqlite, 'inactive-creator-doc', 'temporary');
    expect(() =>
      link(sqlite, {
        id: 'inactive-creator-link',
        reportType: 'technical',
        reportId: 'technical',
        documentId: 'inactive-creator-doc',
        attachmentKind: 'technical_attachment',
        systemReferenceSnapshot: 'PLC System A',
        createdBy: 'suspended',
      }),
    ).toThrow();

    insertDocument(sqlite, 'unlinked-committed', 'committed');
    expect(() =>
      sqlite.prepare("DELETE FROM document WHERE id='unlinked-committed'").run(),
    ).not.toThrow();
    expect(integrityCheck(sqlite)).toBe('ok');
  });
});
