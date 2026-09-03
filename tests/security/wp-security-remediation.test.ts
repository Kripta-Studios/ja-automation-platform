import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import { createDatabase, V3AccessDeniedError } from '@ja/database';
import { assertRecentStepUp as assertCoreRecentStepUp } from '../../packages/database/src/core/authorization.js';
import {
  assertRecentStepUp,
  servePrivateArtifact,
} from '../../apps/portal/src/lib/server/private-artifact-access.js';
import { sensitiveExportResponse } from '../../apps/portal/src/lib/server/sensitive-export-response.js';
import { assertRegularPrivateFile } from '../../apps/portal/src/lib/server/report-attachment-route.js';
import { readSource } from '../fixtures/b5-lifecycle-security-fixture.js';

const directories: string[] = [];
const databases: ReturnType<typeof createDatabase>['sqlite'][] = [];

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  delete process.env.JA_DOCUMENT_ROOT;
  delete process.env.JA_OFFLINE_ENABLED;
  delete process.env.NODE_ENV;
});

function principal(sessionId?: string): Principal {
  return {
    userId: 'worker',
    role: 'worker',
    projectIds: new Set(['project-1']),
    ...(sessionId ? { sessionId } : {}),
  };
}

function seedStepUpDatabase(): ReturnType<typeof createDatabase>['sqlite'] {
  const directory = mkdtempSync(join(tmpdir(), 'ja-wp-security-'));
  directories.push(directory);
  process.env.JA_TENANT_ID = 'test-tenant';
  process.env.JA_DEPLOYMENT_ID = 'test-deployment';
  process.env.JA_MIGRATIONS_PATH = resolve('migrations');
  const database = createDatabase(join(directory, 'app.db'));
  databases.push(database.sqlite);
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('worker','Worker','worker@example.test','worker','active',1,?,?)",
    )
    .run(now, now);
  database.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'worker-session',
      'worker-token',
      'worker',
      new Date(Date.now() + 60 * 60_000).toISOString(),
      now,
      now,
      null,
    );
  return database.sqlite;
}

describe('WP-SEC step-up and private artifact boundaries', () => {
  it('authorizes a live session without a second password confirmation', () => {
    const sqlite = seedStepUpDatabase();
    expect(() => assertRecentStepUp(sqlite, principal())).toThrow(
      'Confirm your identity to continue',
    );
    expect(() => assertRecentStepUp(sqlite, principal('worker-session'))).not.toThrow();

    sqlite
      .prepare('UPDATE session SET expires_at=? WHERE id=?')
      .run(new Date(Date.now() - 1).toISOString(), 'worker-session');
    expect(() => assertRecentStepUp(sqlite, principal('worker-session'))).toThrow(
      'Confirm your identity to continue',
    );
  });

  it('keeps the canonical database guard fail-closed outside a live session', () => {
    process.env.NODE_ENV = 'test';
    const sqlite = seedStepUpDatabase();
    expect(() => assertCoreRecentStepUp(sqlite, principal(), V3AccessDeniedError)).toThrow(
      'Recent step-up authentication is required',
    );
    expect(() =>
      assertCoreRecentStepUp(sqlite, principal('worker-session'), V3AccessDeniedError),
    ).not.toThrow();

    sqlite
      .prepare('UPDATE session SET expires_at=? WHERE id=?')
      .run(new Date(Date.now() - 1).toISOString(), 'worker-session');
    expect(() =>
      assertCoreRecentStepUp(sqlite, principal('worker-session'), V3AccessDeniedError),
    ).toThrow('Recent step-up authentication is required');
  });

  it('keeps an owner login privileged until the session expires', () => {
    const sqlite = seedStepUpDatabase();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'owner-session',
        'owner-token',
        'owner',
        new Date(Date.now() + 60 * 60_000).toISOString(),
        now,
        now,
        null,
      );
    const owner: Principal = {
      userId: 'owner',
      role: 'owner_admin',
      projectIds: new Set(),
      sessionId: 'owner-session',
    };
    expect(() => assertCoreRecentStepUp(sqlite, owner, V3AccessDeniedError)).not.toThrow();
    sqlite
      .prepare('UPDATE session SET expires_at=? WHERE id=?')
      .run(new Date(Date.now() - 1).toISOString(), 'owner-session');
    expect(() => assertCoreRecentStepUp(sqlite, owner, V3AccessDeniedError)).toThrow(
      'Recent step-up authentication is required',
    );
  });

  it('allows an authorized operational report download without repeated step-up', async () => {
    const sqlite = seedStepUpDatabase();
    const reportId = 'period-report-1';
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at,version)
         VALUES('client-1','C-001','Client 1','Client 1','active','USD','UTC',?,?,1)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at,version)
         VALUES('project-1','P-001','client-1','Project 1','UTC','USD','active','tm',?,?,1)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO period_report(
           id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
           pdf_storage_key,pdf_sha256,pdf_byte_length,created_by,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        reportId,
        'project-1',
        '2026-08-01',
        '2026-08-15',
        'customer',
        'period',
        'review',
        '{}',
        'reports/period-report.pdf',
        'a'.repeat(64),
        32,
        'worker',
        now,
        now,
      );
    const root = mkdtempSync(join(tmpdir(), 'ja-wp-security-docs-'));
    directories.push(root);
    process.env.JA_DOCUMENT_ROOT = root;
    const bytes = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n', 'ascii');
    mkdirSync(join(root, 'reports'), { recursive: true });
    writeFileSync(join(root, 'reports', 'period-report.pdf'), bytes);

    const response = await servePrivateArtifact({
      sqlite,
      principal: principal('worker-session'),
      kind: 'period_report',
      id: reportId,
      requireStepUp: false,
      loadMetadata: () => ({
        storageKey: 'reports/period-report.pdf',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
        mediaType: 'application/pdf',
        filename: 'period-report.pdf',
      }),
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it('fails closed for an unreviewed report audience', async () => {
    const sqlite = seedStepUpDatabase();
    const now = new Date().toISOString();
    // Simulate a legacy/corrupt value that bypassed today's CHECK constraint;
    // authorization must remain fail-closed even if persistent data is bad.
    sqlite.exec('PRAGMA ignore_check_constraints=ON');
    sqlite
      .prepare(
        `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at,version)
         VALUES('client-1','C-001','Client 1','Client 1','active','USD','UTC',?,?,1)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at,version)
         VALUES('project-1','P-001','client-1','Project 1','UTC','USD','active','tm',?,?,1)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO period_report(
           id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
           created_by,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'period-report-unreviewed',
        'project-1',
        '2026-08-01',
        '2026-08-15',
        'partner',
        'period',
        'review',
        '{}',
        'worker',
        now,
        now,
      );
    sqlite.exec('PRAGMA ignore_check_constraints=OFF');

    const response = await servePrivateArtifact({
      sqlite,
      principal: principal('worker-session'),
      kind: 'period_report',
      id: 'period-report-unreviewed',
      requireStepUp: false,
      loadMetadata: () => {
        throw new Error('metadata must not be loaded before authorization');
      },
    });
    expect(response.status).toBe(404);
  });

  it('uses the shared verified no-follow reader for generic document downloads', () => {
    const source = readSource('apps/portal/src/routes/app/api/documents/[id]/+server.ts');
    expect(source).toContain('assertRegularPrivateFile');
    expect(source).not.toMatch(/\breadFile\s*\(/u);
    expect(source).toContain('authorizeDocument');
  });

  it('does not require a second password confirmation before restricted export bytes are returned', () => {
    process.env.NODE_ENV = 'production';
    const sqlite = seedStepUpDatabase();
    expect(() =>
      sensitiveExportResponse({
        sqlite,
        principal: { ...principal('worker-session'), role: 'finance_admin' },
        auditEntityType: 'document',
        auditEntityId: 'worker-statement:worker:2026-08-01:2026-08-31',
        exportKind: 'worker_compensation_statement',
        format: 'csv',
        filename: 'worker-statement.csv',
        bytes: Uint8Array.from([1, 2, 3]),
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).not.toThrow();
    expect(() =>
      sensitiveExportResponse({
        sqlite,
        principal: { ...principal(), role: 'finance_admin' },
        auditEntityType: 'document',
        auditEntityId: 'worker-statement:worker:2026-08-01:2026-08-31',
        exportKind: 'worker_compensation_statement',
        format: 'csv',
        filename: 'worker-statement.csv',
        bytes: Uint8Array.from([1, 2, 3]),
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow('Confirm your identity to continue');
  });

  it('uses shared exclusive private-file publication for offline attachment writes', () => {
    const source = readSource('apps/portal/src/routes/app/api/sync/attachment/+server.ts');
    expect(source).toContain('writePrivateFileExclusive');
    expect(source).not.toMatch(/\b(?:mkdir|writeFile)\s*\(/u);
  });

  it('verifies an EEXIST winner before document or receipt metadata can be finalized', () => {
    for (const path of [
      'apps/portal/src/lib/server/actions/document-actions.ts',
      'apps/portal/src/lib/server/actions/expense-actions.ts',
    ]) {
      const source = readSource(path);
      expect(source, path).toContain('assertRegularPrivateFile');
      expect(source, path).toMatch(/code !== 'EEXIST'[\s\S]*assertRegularPrivateFile/u);
    }
  });

  it('uses descriptor-relative Linux walking with a fail-closed portable fallback', () => {
    const source = readSource('apps/portal/src/lib/server/private-artifact-access.ts');
    expect(source).toContain('/proc/self/fd/');
    expect(source).toContain('O_DIRECTORY');
    expect(source).toContain('O_NOFOLLOW');
    expect(source).toContain('assertNoSymlinkParents');
  });

  it('uses the no-symlink private remover for rejected offline receipts', () => {
    const source = readSource('apps/portal/src/routes/app/api/sync/+server.ts');
    expect(source).toContain('removePrivateFileIfPresent');
    expect(source).not.toMatch(/\bunlink\s*\(/u);
  });

  it('keeps generic attachment reads protected against symlinks and hash/length mismatch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-wp-security-reader-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-wp-security-reader-outside-'));
    directories.push(root, outside);
    mkdirSync(join(root, 'reports'), { recursive: true });
    const bytes = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n', 'ascii');
    writeFileSync(join(root, 'reports', 'good.pdf'), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    await expect(
      assertRegularPrivateFile(root, 'reports/good.pdf', hash, bytes.byteLength, 'application/pdf'),
    ).resolves.toSatisfy((value) => Buffer.from(value).equals(bytes));
    await expect(
      assertRegularPrivateFile(
        root,
        'reports/good.pdf',
        'b'.repeat(64),
        bytes.byteLength,
        'application/pdf',
      ),
    ).rejects.toThrow(/integrity/u);

    writeFileSync(join(outside, 'secret.pdf'), bytes);
    try {
      symlinkSync(join(outside, 'secret.pdf'), join(root, 'reports', 'linked.pdf'));
    } catch {
      return;
    }
    await expect(
      assertRegularPrivateFile(
        root,
        'reports/linked.pdf',
        hash,
        bytes.byteLength,
        'application/pdf',
      ),
    ).rejects.toThrow(/unavailable|integrity|symlink/u);
  });
});

describe('WP-SEC disabled offline contract', () => {
  it('exposes disabled identity and sync endpoints instead of issuing offline state', async () => {
    process.env.JA_OFFLINE_ENABLED = 'false';
    const { GET: identityGet } =
      await import('../../apps/portal/src/routes/app/api/offline/identity/+server.js');
    const { POST: verifyPost } =
      await import('../../apps/portal/src/routes/app/api/offline/identity/verify/+server.js');
    const { POST: syncPost } = await import('../../apps/portal/src/routes/app/api/sync/+server.js');
    const { POST: attachmentPost } =
      await import('../../apps/portal/src/routes/app/api/sync/attachment/+server.js');
    const locals = {
      user: { id: 'worker', role: 'worker' },
      session: { id: 'worker-session' },
    };
    const identity = await identityGet({ locals, cookies: {} } as never);
    expect(identity.status).toBe(503);
    await expect(identity.json()).resolves.toMatchObject({ offlineEnabled: false });
    const verify = await verifyPost({
      locals,
      request: new Request('http://localhost', { method: 'POST', body: '{}' }),
    } as never);
    expect(verify.status).toBe(503);
    await expect(verify.json()).resolves.toMatchObject({ offlineEnabled: false, valid: false });
    const sync = await syncPost({
      locals,
      request: new Request('http://localhost', { method: 'POST', body: '{}' }),
    } as never);
    expect(sync.status).toBe(503);
    await expect(sync.json()).resolves.toMatchObject({ offlineEnabled: false });
    const attachment = await attachmentPost({
      locals,
      request: new Request('http://localhost', { method: 'POST', body: '{}' }),
    } as never);
    expect(attachment.status).toBe(503);
    await expect(attachment.json()).resolves.toMatchObject({ offlineEnabled: false });
  });

  it('serves a no-op service worker when offline is explicitly disabled', () => {
    process.env.JA_OFFLINE_ENABLED = 'false';
    const source = readSource('apps/portal/src/routes/app/service-worker.js/+server.ts');
    expect(source).toContain('OFFLINE_ENABLED=false');
    expect(source).toContain('JA_OFFLINE_ENABLED');
  });

  it('applies session-bound step-up to every restricted finance export route', () => {
    for (const path of [
      'apps/portal/src/routes/app/api/projects/[id]/finance-export/+server.ts',
      'apps/portal/src/routes/app/api/invoice-collection-ledger/[format]/+server.ts',
      'apps/portal/src/routes/app/api/worker-statement/[format]/+server.ts',
    ]) {
      const source = readSource(path);
      expect(source, path).toContain('assertRecentStepUp');
    }
  });

  it('keeps the legacy Worker Statement format GET read-only', () => {
    const source = readSource(
      'apps/portal/src/routes/app/api/worker-statement/[format]/+server.ts',
    );
    expect(source).toContain('listWorkerStatementArtifacts');
    expect(source).toContain('artifactDownloadLocation');
    expect(source).toContain('assertRecentStepUp');
    for (const mutatingBoundary of [
      'buildWorkerStatementSnapshot',
      'requestWorkerStatementArtifact',
      'requestWorkerStatementArtifacts',
      'enqueueJob',
      'sensitiveExportResponse',
      'recordAuditEvent',
    ])
      expect(source, `legacy Worker Statement GET must not call ${mutatingBoundary}`).not.toContain(
        mutatingBoundary,
      );
  });

  it('does not exempt internal period reports from step-up', () => {
    const source = readSource('apps/portal/src/routes/app/api/reports/[id]/pdf/+server.ts');
    expect(source).toContain('subject.audience');
    expect(source).not.toContain('requireStepUp: false');
  });
});
