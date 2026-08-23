import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: ReturnType<typeof createDatabase>['sqlite'][] = [];
const restoreDeploymentIdentities: (() => void)[] = [];
const originalScannerEnv = {
  node: process.env.NODE_ENV,
  required: process.env.JA_MALWARE_SCANNER_REQUIRED,
  url: process.env.JA_MALWARE_SCANNER_URL,
};

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // Keep cleanup idempotent if a test closed the handle before failing.
    }
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
  if (originalScannerEnv.node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalScannerEnv.node;
  if (originalScannerEnv.required === undefined) delete process.env.JA_MALWARE_SCANNER_REQUIRED;
  else process.env.JA_MALWARE_SCANNER_REQUIRED = originalScannerEnv.required;
  if (originalScannerEnv.url === undefined) delete process.env.JA_MALWARE_SCANNER_URL;
  else process.env.JA_MALWARE_SCANNER_URL = originalScannerEnv.url;
});

describe('controlled audit detail', () => {
  it('stores redacted metadata with project, before/after, reason and correlation fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-audit-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const v3 = new V3Repository(sqlite);
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','owner@example.com','owner_admin','active',1,?,?)",
      )
      .run(now, now);
    const principal: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    v3.createInvitation(principal, {
      email: 'worker@example.com',
      role: 'worker',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const row = sqlite
      .prepare(
        'SELECT project_id,before_json,after_json,reason,correlation_id,metadata_json FROM audit_event WHERE action=? ORDER BY occurred_at DESC LIMIT 1',
      )
      .get('invitation.create') as Record<string, string | null>;
    expect(row.correlation_id).toBeTruthy();
    expect(row.project_id).toBeNull();
    expect(row.before_json).toBeNull();
    expect(row.after_json).toBeNull();
    expect(row.reason).toBeNull();
    expect(row.metadata_json).not.toContain('token');
  });

  it('quarantines required-scan documents until an explicit clean decision', () => {
    process.env.NODE_ENV = 'production';
    process.env.JA_MALWARE_SCANNER_REQUIRED = 'true';
    delete process.env.JA_MALWARE_SCANNER_URL;
    const directory = mkdtempSync(join(tmpdir(), 'ja-scan-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','owner-scan@example.com','owner_admin','active',1,?,?)",
      )
      .run(now, now);
    seedB5ServiceActorBinding(sqlite, 'owner');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const document = repository.registerPrivateDocument(owner, {
      sha256: 'a'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 3,
      storageKey: 'reports/scan-test.pdf',
      originalFilename: 'scan-test.pdf',
      artifactType: 'report',
      artifactClassification: 'standard',
      sensitivity: 'customer_private',
    });
    expect(() => v3.authorizeDocument(owner, document.id)).toThrow(/Document not found/);
    const service: Principal = { ...owner, isServiceActor: true };
    expect(
      v3.runDueJobs(1, {
        document_scan: (payload, execution) => {
          const documentId = (payload as { documentId: string }).documentId;
          v3.recordDocumentScan(service, documentId, 'clean', 'test-scanner', execution);
        },
      }),
    ).toEqual({ processed: 1, failed: 0, overdueMarked: 0 });
    expect(v3.authorizeDocument(owner, document.id)).toEqual(
      expect.objectContaining({ sha256: 'a'.repeat(64), byteLength: 3 }),
    );
  });
});
