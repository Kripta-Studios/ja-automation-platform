import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DigitalWorkersRepository, createFieldCapture } from '@ja/database';
import { createBackup } from '../../deployment/scripts/backup.mjs';
import { restoreBackup } from '../../deployment/scripts/restore.mjs';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';
const fixtures: B5LifecycleSecurityFixture[] = [];
const originalRoot = process.env.JA_DOCUMENT_ROOT;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  if (originalRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
  else process.env.JA_DOCUMENT_ROOT = originalRoot;
});
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const root = join(f.directory, 'documents');
  mkdirSync(root, { recursive: true });
  process.env.JA_DOCUMENT_ROOT = root;
  return {
    ...f,
    root,
    owner: stepUpB5Principal(f.sqlite, f.owner, 'dw-evidence'),
    manager: stepUpB5Principal(f.sqlite, f.manager, 'dw-evidence'),
    worker: stepUpB5Principal(f.sqlite, f.worker, 'dw-evidence'),
    digital: new DigitalWorkersRepository(f.sqlite),
  };
}
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function document(
  f: ReturnType<typeof fixture>,
  artifactClassification: 'standard' | 'finance' = 'standard',
) {
  const bytes = Buffer.from(
    `%PDF-1.7\nPRIVATE HANDOVER EVIDENCE ${artifactClassification}\n%%EOF\n`,
  );
  const reserved = f.v3.reserveUpload(f.owner, {
    projectId: f.project.id,
    originalFilename: 'handover.pdf',
    artifactType: 'approved_customer_document',
    artifactClassification,
    sensitivity: 'customer_private',
    description: 'Reviewed handover reference',
  });
  const path = join(f.root, reserved.storageKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  f.v3.finalizeUpload(f.owner, reserved.reservationId, {
    sha256: hash(bytes),
    mediaType: 'application/pdf',
    byteLength: bytes.length,
  });
  return { id: reserved.reservationId, path, bytes };
}
it('accepts current authorized private evidence and rejects changed, missing, scanner-blocked or financial references', () => {
  const f = fixture(),
    doc = document(f);
  const item = f.digital.saveWorkItem(f.manager, {
    projectId: f.project.id,
    kind: 'handover',
    title: 'Customer handover',
    ownerId: f.manager.userId,
    evidenceRefs: [{ type: 'document', id: doc.id }],
    requestKey: 'document-evidence-save',
  });
  const state = () =>
    f.digital
      .listWorkspace(f.manager)
      .workItems.find((row) => row.id === item.id)!
      .evidenceRefs.find((ref) => ref.id === doc.id)?.state;
  expect(state()).toBe('current');
  f.digital.updateWorkItem(f.manager, {
    id: item.id,
    expectedVersion: 1,
    status: 'ready_for_review',
    reason: 'Ready for evidence review',
    requestKey: `ready-${item.id}`,
  });
  writeFileSync(doc.path, Buffer.from('different bytes'));
  expect(state()).toBe('missing');
  expect(() =>
    f.digital.updateWorkItem(f.manager, {
      id: item.id,
      expectedVersion: 2,
      status: 'accepted',
      reason: 'Reviewed',
      requestKey: 'document-evidence-invalid',
    }),
  ).toThrow(/Current handover/);
  writeFileSync(doc.path, doc.bytes);
  const privateDoc = document(f, 'finance');
  expect(() =>
    f.digital.saveWorkItem(f.manager, {
      projectId: f.project.id,
      kind: 'handover',
      title: 'Unauthorized reference',
      ownerId: f.worker.userId,
      evidenceRefs: [{ type: 'document', id: privateDoc.id }],
      requestKey: 'reject-private-reference-on-create',
    }),
  ).toThrow(/Authorized evidence reference required/);
  f.digital.updateWorkItem(f.owner, {
    id: item.id,
    expectedVersion: 2,
    evidenceRefs: [
      { type: 'document', id: doc.id },
      { type: 'document', id: privateDoc.id, note: 'Private pay reference' },
    ],
    reason: 'Finance evidence retained privately',
    requestKey: 'private-reference-add',
  });
  const publicView = f.digital
    .listWorkspace(f.manager)
    .workItems.find((row) => row.id === item.id)!;
  expect(publicView.evidenceRefs.map((ref) => ref.id)).toEqual([doc.id]);
  expect(JSON.stringify(publicView)).not.toContain('Private pay reference');
  f.digital.updateWorkItem(f.manager, {
    id: item.id,
    expectedVersion: 3,
    evidenceRefs: [
      { type: 'document', id: doc.id },
      { type: 'external', id: 'site-note', note: 'Public site note' },
    ],
    reason: 'Add operational note',
    requestKey: 'preserve-private-reference',
  });
  expect(
    f.digital
      .listWorkspace(f.owner)
      .workItems.find((row) => row.id === item.id)!
      .evidenceRefs.map((ref) => ref.id),
  ).toEqual([privateDoc.id, doc.id, 'site-note']);
  f.sqlite.prepare("UPDATE document SET scan_status='pending' WHERE id=?").run(doc.id);
  expect(state()).toBeUndefined();
  f.sqlite.prepare("UPDATE document SET scan_status='not_scanned' WHERE id=?").run(doc.id);
  expect(state()).toBe('current');
  const accepted = f.digital.updateWorkItem(f.manager, {
    id: item.id,
    expectedVersion: 4,
    status: 'accepted',
    reason: 'Checked the current document and handover facts',
    requestKey: 'document-evidence-accept',
  });
  expect(accepted.status).toBe('accepted');
});
it('binds customer acceptance to the current report PDF and available signed evidence', () => {
  const f = fixture(),
    doc = document(f),
    reportId = 'digital-evidence-report',
    stamp = new Date().toISOString();
  const snapshot = '{}',
    reportBytes = Buffer.from('%PDF-1.7\nCURRENT REPORT\n%%EOF\n'),
    reportKey = `reports/${reportId}/report.pdf`;
  mkdirSync(dirname(join(f.root, reportKey)), { recursive: true });
  writeFileSync(join(f.root, reportKey), reportBytes);
  f.sqlite
    .prepare(
      `INSERT INTO period_report(id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,pdf_storage_key,pdf_sha256,pdf_byte_length,snapshot_version,snapshot_sha256,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      reportId,
      f.project.id,
      '2026-08-01',
      '2026-08-31',
      'customer',
      'period',
      'approved',
      snapshot,
      reportKey,
      hash(reportBytes),
      reportBytes.length,
      1,
      hash(snapshot),
      f.owner.userId,
      stamp,
      stamp,
    );
  f.sqlite
    .prepare(
      "UPDATE document SET artifact_type='customer_signoff_evidence',description=? WHERE id=?",
    )
    .run(
      JSON.stringify({
        kind: 'customer_signoff_evidence_binding_v1',
        periodReportId: reportId,
        snapshotVersion: 1,
        snapshotSha256: hash(snapshot),
      }),
      doc.id,
    );
  f.sqlite
    .prepare(
      `INSERT INTO customer_conformity(id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,signer_name,signer_identity,signed_at,signature_document_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'digital-evidence-conformity',
      reportId,
      1,
      hash(snapshot),
      snapshot,
      reportKey,
      hash(reportBytes),
      reportBytes.length,
      'Fixture customer',
      'customer@example.test',
      stamp,
      doc.id,
      f.owner.userId,
      stamp,
    );
  const item = f.digital.saveWorkItem(f.manager, {
    projectId: f.project.id,
    kind: 'handover',
    title: 'Accepted customer report',
    ownerId: f.manager.userId,
    evidenceRefs: [{ type: 'customer_conformity', id: 'digital-evidence-conformity' }],
    requestKey: 'conformity-evidence-save',
  });
  const state = () =>
    f.digital.listWorkspace(f.manager).workItems.find((row) => row.id === item.id)!.evidenceRefs[0]!
      .state;
  expect(state()).toBe('current');
  f.digital.updateWorkItem(f.manager, {
    id: item.id,
    expectedVersion: 1,
    status: 'ready_for_review',
    reason: 'Ready for evidence review',
    requestKey: `ready-${item.id}`,
  });
  unlinkSync(doc.path);
  expect(state()).toBe('stale');
  writeFileSync(doc.path, doc.bytes);
  const revised = Buffer.from('%PDF-1.7\nNEW REPORT PDF\n%%EOF\n');
  writeFileSync(join(f.root, reportKey), revised);
  f.v3.invalidateCustomerConformity(f.owner, {
    conformityId: 'digital-evidence-conformity',
    reason: 'New report revision requested',
  });
  f.sqlite
    .prepare(
      'UPDATE period_report SET pdf_sha256=?,pdf_byte_length=?,snapshot_version=snapshot_version+1 WHERE id=?',
    )
    .run(hash(revised), revised.length, reportId);
  expect(state()).toBe('stale');
  expect(() =>
    f.digital.updateWorkItem(f.manager, {
      id: item.id,
      expectedVersion: 2,
      status: 'accepted',
      reason: 'Old acceptance does not cover replaced PDF',
      requestKey: 'conformity-stale-accept',
    }),
  ).toThrow(/Current handover/);
});
it('backs up and restores durable work, capture retries and private evidence together', async () => {
  const f = fixture(),
    doc = document(f);
  f.digital.saveWorkItem(f.owner, {
    projectId: f.project.id,
    kind: 'evidence',
    title: 'Persisted follow-up',
    ownerId: f.worker.userId,
    requestKey: 'backup-workitem',
  });
  createFieldCapture(f.sqlite, f.repository, f.worker, {
    projectId: f.project.id,
    workDate: '2026-10-11',
    requestKey: 'backup_capture_12345',
    workSummary: 'Actual work only',
    time: { minutes: 23, category: 'service' },
  });
  const tables = [
    'digital_work_item',
    'digital_work_item_event',
    'digital_work_request',
    'capture_request',
  ];
  const rows = Object.fromEntries(
    tables.map((table) => [table, f.sqlite.prepare(`SELECT * FROM ${table}`).all()]),
  );
  const backup = await createBackup({
    databasePath: join(f.directory, 'app.db'),
    documentRoot: f.root,
    backupRoot: join(f.directory, 'backups'),
  });
  const target = join(f.directory, 'restored');
  await restoreBackup({
    backupPath: backup.path,
    databasePath: join(target, 'app.db'),
    documentRoot: join(target, 'documents'),
  });
  const restored = new DatabaseSync(join(target, 'app.db'));
  try {
    for (const table of tables)
      expect(restored.prepare(`SELECT * FROM ${table}`).all()).toEqual(rows[table]);
    expect(restored.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
    expect(restored.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    restored.close();
  }
  const stored = f.sqlite.prepare('SELECT storage_key FROM document WHERE id=?').get(doc.id)!;
  expect(readFileSync(join(target, 'documents', String(stored.storage_key)))).toEqual(doc.bytes);
});
