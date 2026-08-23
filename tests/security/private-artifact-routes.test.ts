import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { servePrivateArtifact } from '../../apps/portal/src/lib/server/private-artifact-access.js';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  delete process.env.JA_DOCUMENT_ROOT;
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function reportFixture(value: B5LifecycleSecurityFixture, reportId = 'private-report-1') {
  const now = new Date().toISOString();
  value.sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
         pdf_storage_key,pdf_sha256,pdf_byte_length,created_by,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      reportId,
      value.project.id,
      '2026-08-01',
      '2026-08-15',
      'customer',
      'period',
      'review',
      '{}',
      'reports/private-report.pdf',
      'a'.repeat(64),
      32,
      value.owner.userId,
      now,
      now,
    );
  const sessionId = 'private-download-session';
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      'private-download-token',
      value.worker.userId,
      new Date(Date.now() + 60 * 60_000).toISOString(),
      now,
      now,
      now,
    );
  return { reportId, sessionId };
}

function pdfBytes(): Buffer {
  return Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n', 'ascii');
}

function installFile(root: string, storageKey: string, bytes: Buffer): void {
  const target = join(root, storageKey.replaceAll('/', '\\'));
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, bytes);
}

describe('legacy private artifact download boundary', () => {
  it('authorizes by project before invoking metadata and emits hardened headers/audit', async () => {
    const value = fixture();
    const { reportId, sessionId } = reportFixture(value);
    const root = mkdtempSync(join(process.env.TEMP ?? process.env.TMP ?? '.', 'ja-private-route-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const bytes = pdfBytes();
    installFile(root, 'reports/private-report.pdf', bytes);
    const loadMetadata = vi.fn(() => ({
      storageKey: 'reports/private-report.pdf',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
      mediaType: 'application/pdf',
      filename: 'period résumé report.pdf',
    }));
    const principal = { ...value.worker, sessionId };
    const response = await servePrivateArtifact({
      sqlite: value.sqlite,
      principal,
      kind: 'period_report',
      id: reportId,
      loadMetadata,
    });
    expect(response.status).toBe(200);
    expect(loadMetadata).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''period%20r%C3%A9sum%C3%A9%20report.pdf",
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    const audit = value.sqlite
      .prepare(
        `SELECT action,entity_type,entity_id,tenant_id,deployment_id,details_json
         FROM audit_event WHERE action='artifact.access' ORDER BY occurred_at DESC LIMIT 1`,
      )
      .get() as Record<string, string>;
    expect(audit).toMatchObject({
      action: 'artifact.access',
      entity_type: 'period_report',
      entity_id: reportId,
      tenant_id: 'test-tenant',
      deployment_id: 'test-deployment',
    });
    expect(audit.details_json).toContain('"outcome":"authorized"');
  });

  it('conceals an out-of-scope object and never invokes the metadata loader', async () => {
    const value = fixture();
    const { reportId, sessionId } = reportFixture(value);
    const loadMetadata = vi.fn(() => {
      throw new Error('must not be called');
    });
    const response = await servePrivateArtifact({
      sqlite: value.sqlite,
      principal: { ...value.outsider, sessionId },
      kind: 'period_report',
      id: reportId,
      loadMetadata,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Private artifact not found' });
    expect(loadMetadata).not.toHaveBeenCalled();
    expect(
      value.sqlite
        .prepare("SELECT count(*) AS count FROM audit_event WHERE action='artifact.access'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('requires a recent step-up even outside production and rejects traversal/tamper', async () => {
    const value = fixture();
    const { reportId, sessionId } = reportFixture(value);
    const bytes = pdfBytes();
    const stale = new Date(Date.now() - 11 * 60_000).toISOString();
    value.sqlite.prepare('UPDATE session SET step_up_at=? WHERE id=?').run(stale, sessionId);
    const noStepUp = await servePrivateArtifact({
      sqlite: value.sqlite,
      principal: { ...value.worker, sessionId },
      kind: 'period_report',
      id: reportId,
      loadMetadata: () => ({
        storageKey: 'reports/private-report.pdf',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      }),
    });
    expect(noStepUp.status).toBe(403);

    value.sqlite
      .prepare('UPDATE session SET step_up_at=? WHERE id=?')
      .run(new Date().toISOString(), sessionId);
    const traversal = await servePrivateArtifact({
      sqlite: value.sqlite,
      principal: { ...value.worker, sessionId },
      kind: 'period_report',
      id: reportId,
      loadMetadata: () => ({
        storageKey: '../escape.pdf',
        sha256: 'a'.repeat(64),
        byteLength: bytes.byteLength,
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      }),
    });
    expect(traversal.status).toBe(409);

    const root = mkdtempSync(join(process.env.TEMP ?? process.env.TMP ?? '.', 'ja-private-route-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    installFile(root, 'reports/private-report.pdf', bytes);
    const tampered = await servePrivateArtifact({
      sqlite: value.sqlite,
      principal: { ...value.worker, sessionId },
      kind: 'period_report',
      id: reportId,
      loadMetadata: () => ({
        storageKey: 'reports/private-report.pdf',
        sha256: 'b'.repeat(64),
        byteLength: bytes.byteLength,
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      }),
    });
    expect(tampered.status).toBe(409);
    expect(
      value.sqlite
        .prepare(
          "SELECT details_json FROM audit_event WHERE action='artifact.access' ORDER BY occurred_at DESC LIMIT 1",
        )
        .get(),
    ).toMatchObject({ details_json: expect.stringContaining('"outcome":"integrity"') });
  });

  it('rejects a symlinked artifact instead of following it', async () => {
    const value = fixture();
    const { reportId, sessionId } = reportFixture(value);
    const root = mkdtempSync(join(process.env.TEMP ?? process.env.TMP ?? '.', 'ja-private-route-'));
    roots.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    mkdirSync(join(root, 'reports'), { recursive: true });
    const outside = join(root, 'outside.pdf');
    writeFileSync(outside, pdfBytes());
    try {
      symlinkSync(outside, join(root, 'reports', 'private-report.pdf'));
    } catch {
      return;
    }
    const response = await servePrivateArtifact({
      sqlite: value.sqlite,
      principal: { ...value.worker, sessionId },
      kind: 'period_report',
      id: reportId,
      loadMetadata: () => ({
        storageKey: 'reports/private-report.pdf',
        sha256: createHash('sha256').update(pdfBytes()).digest('hex'),
        byteLength: pdfBytes().byteLength,
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      }),
    });
    expect(response.status).toBe(409);
  });
});
