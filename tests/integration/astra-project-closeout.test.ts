import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  delete process.env.JA_DOCUMENT_ROOT;
});
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}
function owner(value: B5LifecycleSecurityFixture) {
  return stepUpB5Principal(value.sqlite, value.owner, 'closeout');
}

function selectedCustomerPdf(
  value: B5LifecycleSecurityFixture,
  principal: ReturnType<typeof owner>,
  root: string,
  bytes: Buffer,
) {
  const reservation = value.v3.reserveUpload(principal, {
    projectId: value.project.id,
    originalFilename: 'approved-handover.pdf',
    artifactType: 'approved_customer_document',
    sensitivity: 'customer_private',
    description: 'Approved operational handover reference',
  });
  const path = join(root, reservation.storageKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  value.v3.finalizeUpload(principal, reservation.reservationId, {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mediaType: 'application/pdf',
    byteLength: bytes.byteLength,
  });
  return { ...reservation, path };
}

function storedZipEntries(bytes: Uint8Array): Map<string, Buffer> {
  const archive = Buffer.from(bytes);
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, archive.subarray(start, start + size));
    offset = start + size;
  }
  return entries;
}

function acceptedCustomerPeriod(
  value: B5LifecycleSecurityFixture,
  principal: ReturnType<typeof owner>,
  root: string,
) {
  const reportId = 'closeout-accepted-period';
  const periodBytes = Buffer.from('%PDF-1.7\nACCEPTED_PERIOD_CONTENT_MARKER\n%%EOF\n');
  const storageKey = `reports/${reportId}/accepted.pdf`;
  const timestamp = new Date().toISOString();
  mkdirSync(dirname(join(root, storageKey)), { recursive: true });
  writeFileSync(join(root, storageKey), periodBytes, { flag: 'wx' });
  const snapshotJson = '{}';
  const snapshotSha256 = createHash('sha256').update(snapshotJson).digest('hex');
  const periodSha256 = createHash('sha256').update(periodBytes).digest('hex');
  value.sqlite
    .prepare(
      `INSERT INTO period_report(
    id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
    pdf_storage_key,pdf_sha256,pdf_byte_length,snapshot_version,snapshot_sha256,created_by,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      reportId,
      value.project.id,
      '2026-08-01',
      '2026-08-31',
      'customer',
      'period',
      'approved',
      snapshotJson,
      storageKey,
      periodSha256,
      periodBytes.byteLength,
      1,
      snapshotSha256,
      principal.userId,
      timestamp,
      timestamp,
    );
  const evidence = selectedCustomerPdf(
    value,
    principal,
    root,
    Buffer.from('%PDF-1.7\nSIGNED_EVIDENCE_MARKER\n%%EOF\n'),
  );
  value.sqlite
    .prepare(
      "UPDATE document SET artifact_type='customer_signoff_evidence',sensitivity='customer_private',description=? WHERE id=?",
    )
    .run(
      JSON.stringify({
        kind: 'customer_signoff_evidence_binding_v1',
        periodReportId: reportId,
        snapshotVersion: 1,
        snapshotSha256,
      }),
      evidence.reservationId,
    );
  const bound = value.sqlite
    .prepare(
      'SELECT snapshot_version,snapshot_sha256,snapshot_json,pdf_storage_key,pdf_sha256,pdf_byte_length FROM period_report WHERE id=?',
    )
    .get(reportId) as {
    snapshot_version: number;
    snapshot_sha256: string;
    snapshot_json: string;
    pdf_storage_key: string;
    pdf_sha256: string;
    pdf_byte_length: number;
  };
  value.sqlite
    .prepare(
      `INSERT INTO customer_conformity(
    id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,
    signer_name,signer_identity,signed_at,signature_document_id,created_by,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'closeout-accepted-conformity',
      reportId,
      bound.snapshot_version,
      bound.snapshot_sha256,
      bound.snapshot_json,
      bound.pdf_storage_key,
      bound.pdf_sha256,
      bound.pdf_byte_length,
      'Client signer',
      'client@example.test',
      timestamp,
      evidence.reservationId,
      principal.userId,
      timestamp,
    );
  return { reportId, periodBytes };
}

describe('ASTRA project closeout revisions', () => {
  it('requires a live finance session, exact client confirmation, creates immutable pair bytes, and reopens only the latest final into a fresh draft', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-files-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    expect(() =>
      value.repository.prepareProjectCloseout(value.finance, { projectId: value.project.id }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.prepareProjectCloseout(value.worker, { projectId: value.project.id }),
    ).toThrow(AccessDeniedError);
    const principal = owner(value);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    });
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow(
      ConflictError,
    );
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    const artifacts = value.repository.finalizeProjectCloseoutRevision(
      principal,
      draft.id,
    ) as Array<Record<string, unknown>>;
    expect(artifacts).toHaveLength(2);
    expect(value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toEqual(
      artifacts,
    );
    const internal = artifacts.find((artifact) => artifact.audience === 'internal');
    expect(internal).toBeDefined();
    const download = value.repository.downloadProjectCloseoutArtifact(
      principal,
      String(internal?.id),
    );
    expect(download.bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(download.bytes.toString('utf8')).toContain('manifest.json');
    expect(download.bytes.toString('utf8')).toContain('closeout-summary.pdf');
    const before = createHash('sha256').update(download.bytes).digest('hex');
    value.sqlite
      .prepare("UPDATE project SET notes='later source edit' WHERE id=?")
      .run(value.project.id);
    expect(
      createHash('sha256')
        .update(
          value.repository.downloadProjectCloseoutArtifact(principal, String(internal?.id)).bytes,
        )
        .digest('hex'),
    ).toBe(before);
    expect(() =>
      value.repository.reopenProjectCloseout(value.finance, draft.id, 'finance cannot reopen'),
    ).toThrow(AccessDeniedError);
    value.repository.reopenProjectCloseout(
      principal,
      draft.id,
      'Correct technical handover evidence',
    );
    const next = value.sqlite
      .prepare(
        `SELECT r.id,r.revision_number,r.state,r.client_confirmation_hash,r.client_selection_json,
          r.internal_snapshot_json,s.current_draft_revision_id
        FROM project_closeout_revision r JOIN project_closeout_series s ON s.id=r.series_id
        WHERE r.series_id=(SELECT series_id FROM project_closeout_revision WHERE id=?)
        ORDER BY r.revision_number DESC LIMIT 1`,
      )
      .get(draft.id) as {
      id: string;
      revision_number: number;
      state: string;
      client_confirmation_hash: string | null;
      client_selection_json: string;
      internal_snapshot_json: string;
      current_draft_revision_id: string | null;
    };
    expect(next).toMatchObject({
      revision_number: 2,
      state: 'draft',
      client_confirmation_hash: null,
      current_draft_revision_id: next.id,
    });
    expect(JSON.parse(next.client_selection_json).documents).toEqual([]);
    expect(JSON.parse(next.internal_snapshot_json).project.status).toBe('active');
    expect(
      createHash('sha256')
        .update(
          value.repository.downloadProjectCloseoutArtifact(principal, String(internal?.id)).bytes,
        )
        .digest('hex'),
    ).toBe(before);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM project_closeout_reopen_event').get(),
    ).toEqual({ count: 1 });
    expect(() =>
      value.repository.prepareProjectCloseout(principal, { projectId: value.project.id }),
    ).toThrow(ConflictError);
    expect(() =>
      value.repository.reopenProjectCloseout(principal, draft.id, 'Repeated reopen'),
    ).toThrow(ConflictError);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM project_closeout_reopen_event').get(),
    ).toEqual({ count: 1 });

    const nextHash = value.sqlite
      .prepare('SELECT client_snapshot_sha256 FROM project_closeout_revision WHERE id=?')
      .get(next.id) as { client_snapshot_sha256: string };
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      next.id,
      nextHash.client_snapshot_sha256,
    );
    expect(value.repository.finalizeProjectCloseoutRevision(principal, next.id)).toHaveLength(2);
    value.sqlite.prepare("UPDATE project SET status='active' WHERE id=?").run(value.project.id);
    expect(() =>
      value.repository.reopenProjectCloseout(principal, next.id, 'Project is not closed'),
    ).toThrow(ConflictError);
    value.sqlite.prepare("UPDATE project SET status='closed' WHERE id=?").run(value.project.id);
    expect(() =>
      value.repository.reopenProjectCloseout(principal, draft.id, 'Older final reopen'),
    ).toThrow(ConflictError);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM project_closeout_reopen_event').get(),
    ).toEqual({ count: 1 });
  });

  it('rejects no-final and mutable-draft reopen attempts without appending reopen evidence', () => {
    const value = fixture();
    const principal = owner(value);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    });
    expect(() =>
      value.repository.reopenProjectCloseout(principal, draft.id, 'A draft is not final'),
    ).toThrow(ConflictError);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM project_closeout_reopen_event').get(),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
    ).toEqual({
      status: 'active',
    });
  });

  it('rolls back reopen evidence and project activation if next-draft creation fails', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-reopen-rollback-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const principal = owner(value);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    const artifacts = value.repository.finalizeProjectCloseoutRevision(
      principal,
      draft.id,
    ) as Array<{
      id: string;
      audience: string;
    }>;
    const internal = artifacts.find((artifact) => artifact.audience === 'internal')!;
    const finalBytes = value.repository.downloadProjectCloseoutArtifact(
      principal,
      internal.id,
    ).bytes;
    const triggerName = 'astra_reopen_draft_creation_failure';
    value.sqlite.exec(
      `CREATE TEMP TRIGGER ${triggerName} BEFORE INSERT ON project_closeout_revision
       WHEN NEW.revision_number=2
       BEGIN SELECT RAISE(ABORT, 'forced reopen draft failure'); END;`,
    );
    expect(() =>
      value.repository.reopenProjectCloseout(principal, draft.id, 'Force draft creation rollback'),
    ).toThrow();
    value.sqlite.exec(`DROP TRIGGER ${triggerName}`);
    expect(
      value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
    ).toEqual({
      status: 'closed',
    });
    expect(
      value.sqlite
        .prepare('SELECT current_draft_revision_id FROM project_closeout_series WHERE project_id=?')
        .get(value.project.id),
    ).toEqual({ current_draft_revision_id: null });
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM project_closeout_revision').get(),
    ).toEqual({ count: 1 });
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM project_closeout_reopen_event').get(),
    ).toEqual({ count: 0 });
    expect(value.repository.downloadProjectCloseoutArtifact(principal, internal.id).bytes).toEqual(
      finalBytes,
    );
  });

  it('rejects draft JSON or publication-confirmation tampering before package files or project closure', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-draft-integrity-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const principal = owner(value);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    const original = value.sqlite
      .prepare('SELECT client_snapshot_json FROM project_closeout_revision WHERE id=?')
      .get(draft.id) as { client_snapshot_json: string };
    value.sqlite
      .prepare(
        'UPDATE project_closeout_revision SET client_snapshot_json=\'{"tampered":true}\' WHERE id=?',
      )
      .run(draft.id);
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow(
      ConflictError,
    );
    value.sqlite
      .prepare(
        'UPDATE project_closeout_revision SET client_snapshot_json=?,client_confirmation_hash=? WHERE id=?',
      )
      .run(original.client_snapshot_json, 'f'.repeat(64), draft.id);
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow(
      ConflictError,
    );
    expect(
      value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
    ).toEqual({
      status: 'active',
    });
    expect(value.repository.projectCloseoutArtifacts(principal, draft.id)).toEqual([]);
    expect(existsSync(join(root, 'exports'))).toBe(false);
  });

  it('fails closed when the active account is demoted and leaves the project open when artifact publication fails', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-failure-'));
    roots.push(root);
    const principal = stepUpB5Principal(value.sqlite, value.finance, 'closeout-demotion');
    value.sqlite.prepare("UPDATE user SET status='suspended' WHERE id=?").run(principal.userId);
    expect(() =>
      value.repository.prepareProjectCloseout(principal, { projectId: value.project.id }),
    ).toThrow(AccessDeniedError);
    value.sqlite.prepare("UPDATE user SET status='active' WHERE id=?").run(principal.userId);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    const blocked = join(root, 'not-a-directory');
    writeFileSync(blocked, 'fixture');
    process.env.JA_DOCUMENT_ROOT = blocked;
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow();
    expect(
      value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
    ).toEqual({ status: 'active' });
    expect(value.repository.projectCloseoutArtifacts(principal, draft.id)).toEqual([]);
  });

  it('rejects a forged Finance principal when its persisted role does not match', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'closeout-forged');
    const forged = { ...finance, role: 'owner_admin' as const };
    expect(() =>
      value.repository.prepareProjectCloseout(forged, { projectId: value.project.id }),
    ).toThrow(AccessDeniedError);
  });

  it('retains legacy evidence separately without creating a customer artifact', () => {
    const value = fixture();
    const principal = owner(value);
    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        "INSERT INTO project_closeout(id,project_id,state,snapshot_json,document_manifest_json,created_by,created_at,updated_at) VALUES(?,?, 'final','{\"legacy\":true}','{\"files\":[]}',?,?,?)",
      )
      .run('legacy-closeout', value.project.id, principal.userId, timestamp, timestamp);
    const detail = value.repository.projectCloseoutDetail(principal, value.project.id) as {
      legacyEvidence: { id: string } | null;
      artifacts: unknown[];
    };
    expect(detail.legacyEvidence?.id).toBe('legacy-closeout');
    expect(detail.artifacts).toEqual([]);
  });

  it('does not treat an approved customer period report as accepted customer conformity', () => {
    const value = fixture();
    const principal = owner(value);
    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        `INSERT INTO period_report(
      id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
      pdf_storage_key,pdf_sha256,pdf_byte_length,snapshot_version,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'unaccepted-customer-period',
        value.project.id,
        '2026-08-01',
        '2026-08-31',
        'customer',
        'period',
        'approved',
        '{}',
        'reports/unaccepted-customer-period/source.pdf',
        'a'.repeat(64),
        24,
        1,
        principal.userId,
        timestamp,
        timestamp,
      );
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    }) as { client: { acceptedPeriodReferences: unknown[] } };
    expect(draft.client.acceptedPeriodReferences).toEqual([]);
  });

  it('includes only a current, signed and intact accepted period PDF and removes it after conformity invalidation', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-conformity-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const principal = owner(value);
    const accepted = acceptedCustomerPeriod(value, principal, root);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    }) as { id: string; clientSnapshotHash: string; client: Record<string, unknown> };
    expect(draft.client.acceptedPeriodReferences).toEqual([
      expect.objectContaining({ periodReportId: accepted.reportId }),
    ]);
    expect(JSON.stringify(draft.client)).not.toContain('storageKey');
    expect(JSON.stringify(draft.client)).not.toContain('customer_private');
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    const artifacts = value.repository.finalizeProjectCloseoutRevision(
      principal,
      draft.id,
    ) as Array<{ id: string; audience: string }>;
    const client = storedZipEntries(
      value.repository.downloadProjectCloseoutArtifact(
        principal,
        artifacts.find((item) => item.audience === 'client')!.id,
      ).bytes,
    );
    expect([...client.values()].some((entry) => entry.equals(accepted.periodBytes))).toBe(true);
    expect(
      [...client.values()].some((entry) =>
        entry.toString('utf8').includes('SIGNED_EVIDENCE_MARKER'),
      ),
    ).toBe(false);
    value.sqlite
      .prepare(
        'INSERT INTO customer_conformity_invalidation(id,conformity_id,reason,actor_id,occurred_at) VALUES(?,?,?,?,?)',
      )
      .run(
        'closeout-invalidation',
        'closeout-accepted-conformity',
        'Corrected source',
        principal.userId,
        new Date().toISOString(),
      );
    const next = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    }) as { client: { acceptedPeriodReferences: unknown[] } };
    expect(next.client.acceptedPeriodReferences).toEqual([]);
  });

  it('refreshes a stale draft in place, clearing its exact publication confirmation without changing final history', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-refresh-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const principal = owner(value);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
    });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    value.sqlite
      .prepare("UPDATE project SET notes='changed after review' WHERE id=?")
      .run(value.project.id);
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow(
      ConflictError,
    );
    const refreshed = value.repository.refreshProjectCloseoutDraft(principal, {
      revisionId: draft.id,
    });
    expect(refreshed.clientSnapshotHash).not.toBe(draft.clientSnapshotHash);
    expect(
      value.sqlite
        .prepare('SELECT state,client_confirmation_hash FROM project_closeout_revision WHERE id=?')
        .get(draft.id),
    ).toEqual({ state: 'draft', client_confirmation_hash: null });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      refreshed.clientSnapshotHash,
    );
    expect(value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toHaveLength(2);
  });

  it('puts only selected customer PDF bytes in the client ZIP, keeps the internal ZIP free of them, and emits a readable summary PDF', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-content-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const principal = owner(value);
    const source = Buffer.from('%PDF-1.7\nCLIENT_CLOSEOUT_CONTENT_MARKER\n%%EOF\n');
    const selected = selectedCustomerPdf(value, principal, root, source);
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
      clientDocumentIds: [selected.reservationId],
    });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    const artifacts = value.repository.finalizeProjectCloseoutRevision(
      principal,
      draft.id,
    ) as Array<{ id: string; audience: string }>;
    const client = storedZipEntries(
      value.repository.downloadProjectCloseoutArtifact(
        principal,
        artifacts.find((item) => item.audience === 'client')!.id,
      ).bytes,
    );
    const internal = storedZipEntries(
      value.repository.downloadProjectCloseoutArtifact(
        principal,
        artifacts.find((item) => item.audience === 'internal')!.id,
      ).bytes,
    );
    expect([...client.keys()]).toContain('documents/01-approved-handover.pdf');
    expect(client.get('documents/01-approved-handover.pdf')).toEqual(source);
    expect([...internal.keys()].some((name) => name.startsWith('documents/'))).toBe(false);
    const summary = client.get('closeout-summary.pdf')?.toString('utf8') ?? '';
    expect(summary).toContain('%PDF-1.4');
    expect(summary).toContain('B5 lifecycle fixture');
    expect(summary).toContain('%%EOF');
    expect(JSON.parse(client.get('manifest.json')!.toString('utf8')).files).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'closeout-summary.pdf' })]),
    );
  });

  it('fails closed on missing, tampered, traversal, or symlinked selected bytes without finalizing the project', () => {
    const value = fixture();
    const root = mkdtempSync(join(tmpdir(), 'ja-closeout-source-guards-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const principal = owner(value);
    const selected = selectedCustomerPdf(
      value,
      principal,
      root,
      Buffer.from('%PDF-1.7\nORIGINAL\n%%EOF\n'),
    );
    const draft = value.repository.prepareProjectCloseout(principal, {
      projectId: value.project.id,
      clientDocumentIds: [selected.reservationId],
    });
    value.repository.confirmProjectCloseoutClientPublication(
      principal,
      draft.id,
      draft.clientSnapshotHash,
    );
    unlinkSync(selected.path);
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow();
    expect(
      value.sqlite.prepare('SELECT status FROM project WHERE id=?').get(value.project.id),
    ).toEqual({ status: 'active' });
    expect(value.repository.projectCloseoutArtifacts(principal, draft.id)).toEqual([]);
    writeFileSync(selected.path, Buffer.from('%PDF-1.7\nTAMPERED\n%%EOF\n'));
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow();
    unlinkSync(selected.path);
    const external = join(root, 'external.pdf');
    writeFileSync(external, Buffer.from('%PDF-1.7\nEXTERNAL\n%%EOF\n'));
    symlinkSync(external, selected.path);
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow();
    unlinkSync(selected.path);
    value.sqlite
      .prepare("UPDATE document SET storage_key='../../outside.pdf' WHERE id=?")
      .run(selected.reservationId);
    expect(() => value.repository.finalizeProjectCloseoutRevision(principal, draft.id)).toThrow();
    expect(
      value.sqlite.prepare('SELECT state FROM project_closeout_revision WHERE id=?').get(draft.id),
    ).toEqual({ state: 'draft' });
  });
});
