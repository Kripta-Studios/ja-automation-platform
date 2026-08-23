import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountingPackRevisionError,
  AccountingPackRevisionService,
  createDatabase,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterAll(() => restoreIdentity?.());

afterEach(() => {
  for (const directory of directories.splice(0))
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Best-effort fixture cleanup.
    }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-service-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  const now = '2026-08-18T12:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
       VALUES(?,?,?,?,'active',1,?,?)`,
    )
    .run('owner', 'Owner', 'owner@example.test', 'owner_admin', now, now);
  sqlite
    .prepare(
      `INSERT INTO legal_entity(
         id,code,legal_name,currency,billing_address,company_identifiers,status,
         created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      'legacy',
      'LE-TEST',
      'Legacy Test Entity',
      'EUR',
      'Address',
      'TAX-TEST',
      'active',
      now,
      now,
    );
  const principal: Principal = {
    userId: 'owner',
    role: 'owner_admin',
    projectIds: new Set(),
  };
  const service = new AccountingPackRevisionService(sqlite);
  return { sqlite, service, principal };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    periodStart: '2026-01-01',
    periodEnd: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    legacyLegalEntityId: 'legacy',
    sourceItems: [
      {
        id: 'source-1',
        itemKind: 'invoice',
        sourceId: 'invoice-1',
        itemVersion: 1,
        effectiveAt: '2026-01-10T00:00:00.000Z',
        evidenceType: 'invoice_source',
        evidenceId: 'invoice-source-evidence-1',
        amountMinor: 1000,
        currency: 'EUR',
      },
    ],
    invoiceCount: 1,
    paymentCount: 0,
    workerCostCount: 1,
    expenseCount: 1,
    sourceItemCount: 1,
    invoiceSourceCount: 1,
    sourceMismatchCount: 0,
    approvedTimeEntryCount: 1,
    approvedExpenseCount: 1,
    netMinor: 1000,
    taxMinor: 200,
    grossMinor: 1200,
    collectedMinor: 0,
    outstandingMinor: 1200,
    workerCostMinor: 200,
    expenseCostMinor: 100,
    directCostMinor: 300,
    contributionMinor: 700,
    createdAt: '2026-01-01T00:00:00.000Z',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    idempotencyKey: 'test:accounting-pack:2026-01',
    ...overrides,
  };
}

describe('AccountingPackRevisionService', () => {
  it('creates one scoped immutable canonical revision with complete source evidence', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const result = service.createCanonicalRevision(principal, input());
      expect(result.revisionId).toMatch(/^fp-accounting-pack-revision-/u);
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_revision_snapshot').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_source_cut_item').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      const snapshot = sqlite
        .prepare('SELECT snapshot_json FROM accounting_pack_revision_snapshot WHERE revision_id=?')
        .get(result.revisionId) as { snapshot_json: string };
      expect(JSON.parse(snapshot.snapshot_json).gross_minor).toBe(1200);
    } finally {
      sqlite.close();
    }
  });

  it('is idempotent and never bridges a global legacy run implicitly', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(principal, input());
      const second = service.createCanonicalRevision(principal, input());
      expect(second.revisionId).toBe(first.revisionId);
      expect(second.idempotent).toBe(true);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(3);
      expect(second.legacyRunBridgeId).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it('appends a new immutable revision when the source cut changes', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(principal, input());
      const firstSnapshot = sqlite
        .prepare(
          'SELECT snapshot_sha256,snapshot_json FROM accounting_pack_revision_snapshot WHERE revision_id=?',
        )
        .get(first.revisionId);
      const second = service.createCanonicalRevision(
        principal,
        input({
          idempotencyKey: 'test:accounting-pack:2026-01:v2',
          sourceItems: [
            {
              id: 'source-1-v2',
              itemKind: 'invoice',
              sourceId: 'invoice-1',
              itemVersion: 2,
              effectiveAt: '2026-01-10T00:00:00.000Z',
              evidenceType: 'invoice_source',
              evidenceId: 'invoice-source-evidence-2',
              amountMinor: 1100,
              currency: 'EUR',
            },
          ],
          netMinor: 1100,
          taxMinor: 220,
          grossMinor: 1320,
          outstandingMinor: 1320,
          contributionMinor: 800,
        }),
      );
      expect(second.revisionId).not.toBe(first.revisionId);
      expect(
        sqlite
          .prepare(
            'SELECT revision_number,predecessor_revision_id FROM accounting_pack_revision WHERE revision_id=?',
          )
          .get(second.revisionId),
      ).toEqual({ revision_number: 2, predecessor_revision_id: first.revisionId });
      expect(
        sqlite
          .prepare(
            'SELECT snapshot_sha256,snapshot_json FROM accounting_pack_revision_snapshot WHERE revision_id=?',
          )
          .get(first.revisionId),
      ).toEqual(firstSnapshot);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back every write when source completeness or money equations are invalid', () => {
    const { sqlite, service, principal } = fixture();
    try {
      expect(() =>
        service.createCanonicalRevision(principal, input({ sourceItemCount: 2 })),
      ).toThrow(AccountingPackRevisionError);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
      expect(() =>
        service.createCanonicalRevision(principal, input({ contributionMinor: 999 })),
      ).toThrow(AccountingPackRevisionError);
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_revision_snapshot').get() as {
            count: number;
          }
        ).count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects non-finance principals before opening a financial write', () => {
    const { sqlite, service } = fixture();
    try {
      const worker: Principal = { userId: 'owner', role: 'worker', projectIds: new Set() };
      expect(() => service.createCanonicalRevision(worker, input())).toThrow(
        AccountingPackRevisionError,
      );
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
