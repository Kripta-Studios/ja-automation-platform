import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { createDatabase, integrityCheck } from '@ja/database';
import { createBackup } from '../scripts/backup.mjs';
import { restoreBackup } from '../scripts/restore.mjs';
import {
  createFilesystemContinuityTransport,
  replicateBackup,
  runRemoteRestoreDrill,
} from '../scripts/continuity-backup.mjs';

const TENANT_ID = 'client-essential-tenant';
const DEPLOYMENT_ID = 'client-essential-deployment';
const NOW = '2026-08-22T10:00:00.000Z';

function plainRow(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : value;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertInside(root, candidate, label) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const remainder = relative(rootPath, candidatePath);
  assert.ok(
    remainder && !remainder.startsWith('..') && !isAbsolute(remainder),
    `${label} escaped its private root: ${candidatePath}`,
  );
}

async function assertNoSymlinkFiles(root) {
  const entries = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const candidate = join(current, entry.name);
      assertInside(root, candidate, 'restored artifact');
      if (entry.isDirectory()) await visit(candidate);
      else {
        const stats = await lstat(candidate);
        assert.equal(stats.isSymbolicLink(), false, `restored artifact is a symlink: ${candidate}`);
        assert.equal(stats.isFile(), true, `restored artifact is not a regular file: ${candidate}`);
        entries.push(candidate);
      }
    }
  }
  await visit(root);
  return entries;
}

function seedClientEssentialTruth(sqlite, artifacts) {
  sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,role,status,email_verified,mfa_enrolled,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      'owner',
      'Essential Owner',
      'owner@client-essential.test',
      'owner_admin',
      'active',
      1,
      1,
      NOW,
      NOW,
    );

  sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,role,status,email_verified,mfa_enrolled,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      'worker',
      'Essential Worker',
      'worker@client-essential.test',
      'worker',
      'active',
      1,
      0,
      NOW,
      NOW,
    );

  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,
         created_at,updated_at,version,billing_email,payment_terms_days
       ) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`,
    )
    .run(
      'client',
      'CE-0001',
      'Client Essential Industries',
      'Client Essential',
      'active',
      'EUR',
      'Europe/Madrid',
      NOW,
      NOW,
      'finance@client-essential.test',
      30,
    );

  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,
         created_at,updated_at,version,description,site_name,country,project_manager_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`,
    )
    .run(
      'project',
      'CE-0001-P-001',
      'client',
      'PLC Commissioning',
      'Europe/Madrid',
      'EUR',
      'active',
      'tm',
      NOW,
      NOW,
      'Commissioning and acceptance work',
      'Madrid Plant',
      'ES',
      'owner',
    );

  sqlite
    .prepare(
      `INSERT INTO project_member(
         id,project_id,user_id,assignment_role,starts_on,created_at,updated_at,version,status
       ) VALUES(?,?,?,?,?,?,?,1,'active')`,
    )
    .run('assignment', 'project', 'worker', 'worker', '2026-08-01', NOW, NOW);

  sqlite
    .prepare(
      `INSERT INTO technical_report(
         id,project_id,author_id,system_name,controller,change_summary,safety_related,
         validation,rollback_plan,approval_state,created_at,updated_at,version,
         plant_site,area_line,station_machine,system_type,plc_platform,report_date,
         report_date_provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`,
    )
    .run(
      'technical-report',
      'project',
      'worker',
      'PLC line 1',
      'S7-1500',
      'Commissioning backup captured before acceptance',
      0,
      'Validated',
      'Restore the recorded PLC backup',
      'approved',
      NOW,
      NOW,
      'Madrid Plant',
      'Line 1',
      'Station 1',
      'PLC',
      'Siemens',
      '2026-08-22',
      'native',
    );

  const invoiceSnapshot = JSON.stringify({
    schema: 'client-essential-invoice-v1',
    invoiceId: 'invoice-issued',
    invoiceNumber: 'CE-2026-0001',
    projectId: 'project',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    currency: 'EUR',
    subtotalMinor: 120000,
    taxMinor: 25200,
    totalMinor: 145200,
    sourceRows: [{ type: 'time', id: 'time-source', minutes: 480 }],
  });

  sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
         issued_at,snapshot_json,created_at,updated_at,version,period_start,period_end,due_at,
         calculation_hash,source_lock_at,tenant_id,deployment_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`,
    )
    .run(
      'invoice-issued',
      'project',
      'CE-2026-0001',
      'labor',
      'issued',
      'EUR',
      120000,
      25200,
      145200,
      NOW,
      invoiceSnapshot,
      NOW,
      NOW,
      '2026-08-01',
      '2026-08-31',
      '2026-09-30',
      digest(Buffer.from(invoiceSnapshot)),
      NOW,
      TENANT_ID,
      DEPLOYMENT_ID,
    );

  sqlite
    .prepare(
      `INSERT INTO invoice_line(
         id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,
         subtotal_minor,source_type,source_id,snapshot_json,tax_minor,line_number,line_kind,
         unit_amount_minor,net_amount_minor,tax_bps,tax_amount_minor,gross_amount_minor,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'invoice-line',
      'invoice-issued',
      'Commissioning labor',
      8,
      1,
      15000,
      120000,
      'time',
      'time-source',
      JSON.stringify({ sourceId: 'time-source', minutes: 480, rateMinor: 15000 }),
      25200,
      1,
      'labor',
      15000,
      120000,
      2100,
      25200,
      145200,
      NOW,
    );

  for (const artifact of artifacts) {
    sqlite
      .prepare(
        `INSERT INTO document(
           id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
           created_at,updated_at,version,original_filename,description,sensitive,artifact_type,
           software_version,sensitivity,safe_filename,scan_status,scanned_at,scan_provider,
           artifact_metadata_json,artifact_classification,classification_provenance
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        artifact.id,
        'project',
        'worker',
        artifact.sha256,
        artifact.mediaType,
        artifact.byteLength,
        'committed',
        artifact.storageKey,
        NOW,
        NOW,
        1,
        artifact.originalFilename,
        artifact.description,
        1,
        artifact.artifactType,
        artifact.softwareVersion,
        'customer_private',
        artifact.safeFilename,
        'clean',
        NOW,
        'client-essential-restore-drill',
        JSON.stringify({ sha256: artifact.sha256, byteLength: artifact.byteLength }),
        artifact.classification,
        'native',
      );
  }

  const invoice = plainRow(
    sqlite
      .prepare(
        `SELECT id,state,invoice_number,total_minor,snapshot_json,source_lock_at,tenant_id,deployment_id
       FROM invoice WHERE id='invoice-issued'`,
      )
      .get(),
  );
  assert.deepEqual(invoice, {
    id: 'invoice-issued',
    state: 'issued',
    invoice_number: 'CE-2026-0001',
    total_minor: 145200,
    snapshot_json: invoiceSnapshot,
    source_lock_at: NOW,
    tenant_id: TENANT_ID,
    deployment_id: DEPLOYMENT_ID,
  });
  assert.throws(
    () =>
      sqlite
        .prepare("UPDATE invoice SET total_minor=1,snapshot_json='{}' WHERE id='invoice-issued'")
        .run(),
    /immutable/u,
    'issued invoice truth must remain immutable before backup',
  );
  return { invoiceSnapshot };
}

const previousTenant = process.env.JA_TENANT_ID;
const previousDeployment = process.env.JA_DEPLOYMENT_ID;
const root = await mkdtemp(join(tmpdir(), 'ja-client-essential-restore-'));
let sourceSqlite;
let restoredSqlite;

try {
  process.env.JA_TENANT_ID = TENANT_ID;
  process.env.JA_DEPLOYMENT_ID = DEPLOYMENT_ID;

  const databasePath = join(root, 'source', 'jaautomation.sqlite');
  const documentRoot = join(root, 'source', 'files');
  const backupRoot = join(root, 'backups');
  const restoredDatabasePath = join(root, 'restored', 'jaautomation.sqlite');
  const restoredDocumentRoot = join(root, 'restored', 'files');
  await mkdir(join(documentRoot, 'receipts'), { recursive: true });
  await mkdir(join(documentRoot, 'plc-backups'), { recursive: true });

  const receiptBytes = Buffer.from(
    '%PDF-1.7\n% client-essential receipt\nReceipt total: EUR 42.50\n%%EOF\n',
    'utf8',
  );
  const plcBytes = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x43, 0x45, 0x2d, 0x50, 0x4c, 0x43,
  ]);
  const artifacts = [
    {
      id: 'receipt-document',
      bytes: receiptBytes,
      sha256: digest(receiptBytes),
      byteLength: receiptBytes.byteLength,
      mediaType: 'application/pdf',
      storageKey: 'receipts/CE-2026-0001-receipt.pdf',
      originalFilename: 'site-receipt.pdf',
      safeFilename: 'site-receipt.pdf',
      description: 'Private worker receipt for the issued billing period',
      artifactType: 'receipt',
      classification: 'receipt',
      softwareVersion: null,
    },
    {
      id: 'plc-backup-document',
      bytes: plcBytes,
      sha256: digest(plcBytes),
      byteLength: plcBytes.byteLength,
      mediaType: 'application/zip',
      storageKey: 'plc-backups/PLC-line-1-2026-08-22.zip',
      originalFilename: 'PLC-line-1-2026-08-22.zip',
      safeFilename: 'PLC-line-1-2026-08-22.zip',
      description: 'Private PLC backup captured by the technical report',
      artifactType: 'plc_backup',
      classification: 'confidential',
      softwareVersion: 'TIA Portal 19',
    },
  ];
  for (const artifact of artifacts)
    await writeFile(join(documentRoot, artifact.storageKey), artifact.bytes);

  sourceSqlite = createDatabase(databasePath).sqlite;
  const { invoiceSnapshot } = seedClientEssentialTruth(sourceSqlite, artifacts);
  sourceSqlite.close();
  sourceSqlite = undefined;

  const created = await createBackup({ databasePath, documentRoot, backupRoot });
  assert.equal(created.manifest.documents.length, artifacts.length);
  assert.deepEqual(
    created.manifest.documents,
    artifacts
      .map((artifact) => ({
        path: artifact.storageKey,
        sha256: artifact.sha256,
        byteLength: artifact.byteLength,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    'backup manifest must record every private artifact hash and byte length',
  );

  const restored = await restoreBackup({
    backupPath: created.path,
    databasePath: restoredDatabasePath,
    documentRoot: restoredDocumentRoot,
  });
  assert.equal(restored.integrity, 'ok');
  assert.equal(restored.foreignKeys, 1);
  assert.equal(restored.documentCount, artifacts.length);
  assertInside(root, restored.databasePath, 'restored database');
  assertInside(root, restored.documentRoot, 'restored document root');

  restoredSqlite = new DatabaseSync(restored.databasePath);
  restoredSqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  assert.equal(integrityCheck(restoredSqlite), 'ok');
  assert.deepEqual(restoredSqlite.prepare('PRAGMA foreign_key_check').all(), []);
  const restoredInvoice = plainRow(
    restoredSqlite
      .prepare(
        `SELECT id,state,invoice_number,total_minor,snapshot_json,source_lock_at,tenant_id,deployment_id
       FROM invoice WHERE id='invoice-issued'`,
      )
      .get(),
  );
  assert.deepEqual(restoredInvoice, {
    id: 'invoice-issued',
    state: 'issued',
    invoice_number: 'CE-2026-0001',
    total_minor: 145200,
    snapshot_json: invoiceSnapshot,
    source_lock_at: NOW,
    tenant_id: TENANT_ID,
    deployment_id: DEPLOYMENT_ID,
  });
  const restoredRows = restoredSqlite
    .prepare(
      `SELECT id,sha256,byte_length,storage_key,artifact_type,artifact_classification
       FROM document ORDER BY id`,
    )
    .all()
    .map(plainRow);
  assert.deepEqual(
    restoredRows,
    artifacts
      .map((artifact) => ({
        id: artifact.id,
        sha256: artifact.sha256,
        byte_length: artifact.byteLength,
        storage_key: artifact.storageKey,
        artifact_type: artifact.artifactType,
        artifact_classification: artifact.classification,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
  restoredSqlite.close();
  restoredSqlite = undefined;

  const restoredFiles = await assertNoSymlinkFiles(restoredDocumentRoot);
  assert.equal(restoredFiles.length, artifacts.length);
  for (const artifact of artifacts) {
    const bytes = await readFile(join(restoredDocumentRoot, artifact.storageKey));
    assert.equal(bytes.equals(artifact.bytes), true, `${artifact.id} bytes changed during restore`);
    assert.equal(digest(bytes), artifact.sha256, `${artifact.id} hash changed during restore`);
    assert.equal(
      bytes.byteLength,
      artifact.byteLength,
      `${artifact.id} length changed during restore`,
    );
  }

  const remoteTransport = createFilesystemContinuityTransport(join(root, 'remote-continuity'));
  const continuityKey = Buffer.alloc(32, 0x2a);
  const remoteBackup = await replicateBackup({
    backupPath: created.path,
    backupId: 'client-essential-encrypted-restore',
    transport: remoteTransport,
    env: {
      JA_BACKUP_REMOTE_ENABLED: 'true',
      JA_BACKUP_REMOTE_RETENTION_DAYS: '30',
      JA_BACKUP_REMOTE_NAMESPACE: 'client-essential',
      JA_DEPLOYMENT_ID: DEPLOYMENT_ID,
      JA_BACKUP_ENCRYPTION_KEY: continuityKey.toString('hex'),
    },
    encryptionKey: continuityKey,
    now: new Date(NOW),
  });
  assert.equal(remoteBackup.status, 'READY');
  const remoteRestoredDatabasePath = join(root, 'remote-restored', 'jaautomation.sqlite');
  const remoteRestoredDocumentRoot = join(root, 'remote-restored', 'files');
  const remoteDrill = await runRemoteRestoreDrill({
    transport: remoteTransport,
    env: {
      JA_BACKUP_REMOTE_ENABLED: 'true',
      JA_BACKUP_REMOTE_RETENTION_DAYS: '30',
      JA_BACKUP_REMOTE_NAMESPACE: 'client-essential',
      JA_DEPLOYMENT_ID: DEPLOYMENT_ID,
      JA_BACKUP_ENCRYPTION_KEY: continuityKey.toString('hex'),
    },
    encryptionKey: continuityKey,
    backupId: 'client-essential-encrypted-restore',
    databasePath: remoteRestoredDatabasePath,
    documentRoot: remoteRestoredDocumentRoot,
    tempRoot: root,
  });
  assert.equal(remoteDrill.status, 'PASS');
  assert.equal(remoteDrill.restored.documentCount, artifacts.length);
  const remoteRestoredSqlite = new DatabaseSync(remoteDrill.restored.databasePath);
  const remoteInvoice = plainRow(
    remoteRestoredSqlite
      .prepare(
        `SELECT id,state,invoice_number,total_minor,snapshot_json,source_lock_at,tenant_id,deployment_id
       FROM invoice WHERE id='invoice-issued'`,
      )
      .get(),
  );
  remoteRestoredSqlite.close();
  assert.deepEqual(remoteInvoice, {
    id: 'invoice-issued',
    state: 'issued',
    invoice_number: 'CE-2026-0001',
    total_minor: 145200,
    snapshot_json: invoiceSnapshot,
    source_lock_at: NOW,
    tenant_id: TENANT_ID,
    deployment_id: DEPLOYMENT_ID,
  });
  for (const artifact of artifacts) {
    const bytes = await readFile(join(remoteRestoredDocumentRoot, artifact.storageKey));
    assert.equal(bytes.equals(artifact.bytes), true, `${artifact.id} changed in encrypted restore`);
  }

  const maliciousBackup = join(root, 'malicious-backup');
  await cp(created.path, maliciousBackup, { recursive: true, force: false, errorOnExist: true });
  const maliciousManifestPath = join(maliciousBackup, 'manifest.json');
  const maliciousManifest = JSON.parse(await readFile(maliciousManifestPath, 'utf8'));
  maliciousManifest.database.path = '../outside.sqlite';
  await writeFile(maliciousManifestPath, `${JSON.stringify(maliciousManifest, null, 2)}\n`, 'utf8');
  await assert.rejects(
    restoreBackup({
      backupPath: maliciousBackup,
      databasePath: join(root, 'malicious-restore', 'jaautomation.sqlite'),
      documentRoot: join(root, 'malicious-restore', 'files'),
    }),
    /safe relative path|unsafe path segment|escapes/u,
    'restore must reject a manifest database path that escapes the backup root',
  );

  console.log(
    `client-essential backup/restore drill: ok (invoice=issued, private_artifacts=${artifacts.length}, encrypted_remote=pass, integrity=ok, foreign_keys=1)`,
  );
} finally {
  try {
    restoredSqlite?.close();
  } catch {
    // The assertion failure is the useful signal; cleanup remains best effort.
  }
  try {
    sourceSqlite?.close();
  } catch {
    // The assertion failure is the useful signal; cleanup remains best effort.
  }
  if (previousTenant === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousTenant;
  if (previousDeployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousDeployment;
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
