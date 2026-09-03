import { mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
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

type AccountingPackFixtureOptions = Readonly<{
  projectTimezone?: string;
  invoiceIssuedAt?: string;
}>;

function fixture(options: AccountingPackFixtureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-service-'));
  directories.push(directory);
  const databasePath = join(directory, 'app.db');
  const { sqlite } = createDatabase(databasePath);
  const projectTimezone = options.projectTimezone ?? 'Europe/Madrid';
  const invoiceIssuedAt = options.invoiceIssuedAt ?? '2026-01-10T00:00:00.000Z';
  const now = '2026-08-18T12:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
       VALUES(?,?,?,?,'active',1,?,?)`,
    )
    .run('owner', 'Owner', 'antonny.luty@j-aautomation.com', 'owner_admin', now, now);
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
  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'client-1',
      'CLIENT-001',
      'Client One',
      'Client One',
      'active',
      'EUR',
      projectTimezone,
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'project-1',
      'PROJECT-001',
      'client-1',
      'Project One',
      projectTimezone,
      'EUR',
      'active',
      'time_and_materials',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO billing_rule(
         id,project_id,legal_entity_id,stream_type,enabled,cadence_type,currency,
         auto_generate_draft,auto_issue,auto_send,effective_from,created_at,updated_at,version
       ) VALUES('billing-rule-1','project-1','legacy','labor',1,'monthly','EUR',0,0,0,
                '2026-01-01',?,?,1)`,
    )
    .run(now, now);
  for (const [id, subtotal, version] of [
    ['invoice-1', 1000, 1],
    ['invoice-2', 1100, 1],
  ] as const)
    sqlite
      .prepare(
        `INSERT INTO invoice(
           id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
           issued_at,snapshot_json,billing_rule_id,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        'project-1',
        id.toUpperCase(),
        'labor',
        'issued',
        'EUR',
        subtotal,
        Math.trunc(subtotal / 5),
        subtotal + Math.trunc(subtotal / 5),
        id === 'invoice-1' ? invoiceIssuedAt : '2025-12-10T00:00:00.000Z',
        '{}',
        'billing-rule-1',
        now,
        now,
        version,
      );
  const basePrincipal: Principal = {
    userId: 'owner',
    role: 'owner_admin',
    projectIds: new Set(),
  };
  const sessionId = 'accounting-pack-owner-session';
  const stepUpAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(sessionId, 'accounting-pack-owner-token', 'owner', expiresAt, now, now, stepUpAt);
  const principal: Principal = { ...basePrincipal, sessionId };
  const service = new AccountingPackRevisionService(sqlite);
  return { sqlite, service, principal, basePrincipal, sessionId, stepUpAt, databasePath };
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
    workerCostCount: 0,
    expenseCount: 0,
    sourceItemCount: 1,
    invoiceSourceCount: 0,
    sourceMismatchCount: 0,
    approvedTimeEntryCount: 0,
    approvedExpenseCount: 0,
    netMinor: 1000,
    taxMinor: 200,
    grossMinor: 1200,
    collectedMinor: 0,
    outstandingMinor: 1200,
    workerCostMinor: 0,
    expenseCostMinor: 0,
    directCostMinor: 0,
    contributionMinor: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    idempotencyKey: 'test:accounting-pack:2026-01',
    ...overrides,
  };
}

async function runConcurrentRevisions(
  databasePath: string,
  revisionInput: Readonly<Record<string, unknown>>,
): Promise<ReadonlyArray<{ revisionId: string; idempotent: boolean }>> {
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { createDatabase, AccountingPackRevisionService } = await import('@ja/database');
      const state = new Int32Array(workerData.shared);
      let database;
      try {
        database = createDatabase(workerData.databasePath);
        const principal = {
          userId: 'owner',
          role: 'owner_admin',
          projectIds: new Set(),
          sessionId: workerData.sessionId,
        };
        const service = new AccountingPackRevisionService(database.sqlite);
        Atomics.add(state, 0, 1);
        Atomics.notify(state, 0);
        while (Atomics.load(state, 0) < 2) Atomics.wait(state, 0, 1);
        const result = service.createCanonicalRevision(principal, workerData.input);
        parentPort.postMessage({ kind: 'result', result });
      } catch (error) {
        parentPort.postMessage({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        database?.sqlite.close();
      }
    })();
  `;
  const workers = [0, 1].map(
    () =>
      new Worker(source, {
        eval: true,
        execArgv: ['--experimental-strip-types'],
        workerData: {
          databasePath,
          input: revisionInput,
          sessionId: 'accounting-pack-owner-session',
          shared,
        },
      }),
  );
  try {
    return await Promise.all(
      workers.map(
        (worker) =>
          new Promise<{ revisionId: string; idempotent: boolean }>((resolve, reject) => {
            worker.once(
              'message',
              (message: {
                kind: string;
                result?: { revisionId: string; idempotent: boolean };
                message?: string;
              }) => {
                if (message.kind === 'result' && message.result) resolve(message.result);
                else
                  reject(new Error(message.message ?? 'Concurrent Accounting Pack worker failed'));
              },
            );
            worker.once('error', reject);
            worker.once('exit', (code) => {
              if (code !== 0) reject(new Error(`Concurrent Accounting Pack worker exited ${code}`));
            });
          }),
      ),
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

type FinalizedInvoiceChild = 'invoice_line' | 'invoice_source' | 'commercial_manifest';

/**
 * Some Accounting Pack tests intentionally inject legacy/corrupt child rows
 * to prove that the service rejects them defensively. Migration 0034 now
 * prevents those late inserts at the database boundary, so the fixture must
 * briefly emulate a pre-0034 database and restore the guard before invoking
 * production code. Legitimate draft/pre-issue writes are covered separately
 * by the migration suite.
 */
function seedLegacyFinalizedInvoiceChild(
  sqlite: DatabaseSync,
  kind: FinalizedInvoiceChild,
  insert: () => void,
): void {
  const configuration = {
    invoice_line: {
      trigger: 'client_essential_issued_invoice_line_no_insert',
      table: 'invoice_line',
      invoiceColumn: 'NEW.invoice_id',
      message: 'issued invoice lines are immutable',
    },
    invoice_source: {
      trigger: 'client_essential_issued_invoice_source_no_insert',
      table: 'invoice_source',
      invoiceColumn: 'NEW.invoice_id',
      message: 'issued invoice sources are immutable',
    },
    commercial_manifest: {
      trigger: 'client_essential_issued_invoice_commercial_manifest_no_insert',
      table: 'invoice_commercial_source_manifest',
      invoiceColumn: 'NEW.invoice_id',
      message: 'issued invoice commercial source manifest is immutable',
    },
  } as const;
  const guard = configuration[kind];
  sqlite.exec(`DROP TRIGGER ${guard.trigger}`);
  try {
    insert();
  } finally {
    sqlite.exec(`CREATE TRIGGER ${guard.trigger}
      BEFORE INSERT ON ${guard.table}
      WHEN EXISTS(
        SELECT 1 FROM invoice
        WHERE invoice.id=${guard.invoiceColumn}
          AND invoice.state IN('issued','sent','partially_paid','paid','overdue','void','credited')
      )
      BEGIN SELECT RAISE(ABORT,'${guard.message}'); END`);
  }
}

function emptyInput(overrides: Record<string, unknown> = {}) {
  return input({
    periodStart: '2026-02-02',
    periodEnd: '2026-02-28',
    sourceItems: [],
    invoiceCount: 0,
    paymentCount: 0,
    workerCostCount: 0,
    expenseCount: 0,
    sourceItemCount: 0,
    invoiceSourceCount: 0,
    approvedTimeEntryCount: 0,
    approvedExpenseCount: 0,
    netMinor: 0,
    taxMinor: 0,
    grossMinor: 0,
    collectedMinor: 0,
    outstandingMinor: 0,
    workerCostMinor: 0,
    expenseCostMinor: 0,
    directCostMinor: 0,
    contributionMinor: 0,
    createdAt: '2026-02-02T00:00:00.000Z',
    effectiveAt: '2026-02-02T00:00:00.000Z',
    ...overrides,
  });
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
      const commands = sqlite
        .prepare(
          `SELECT step_up_verified_at,step_up_expires_at
             FROM finance_command ORDER BY operation`,
        )
        .all() as Array<{ step_up_verified_at: string | null; step_up_expires_at: string | null }>;
      expect(commands).toHaveLength(3);
      expect(
        commands.every((command) => command.step_up_verified_at === '2026-08-18T12:00:00.000Z'),
      ).toBe(true);
      expect(commands.every((command) => command.step_up_expires_at !== null)).toBe(true);
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

  it('serializes concurrent same-key revisions across two SQLite connections', async () => {
    const { sqlite, databasePath } = fixture();
    try {
      // The main connection is intentionally not used for the writes. Each
      // worker opens its own SQLite handle and reaches the service at the same
      // barrier, exercising BEGIN IMMEDIATE plus the immutable idempotency
      // rows against one shared database file.
      const results = await runConcurrentRevisions(databasePath, input());
      expect(results).toHaveLength(2);
      expect(new Set(results.map((result) => result.revisionId)).size).toBe(1);
      expect(results.filter((result) => result.idempotent)).toHaveLength(1);
      expect(results.filter((result) => !result.idempotent)).toHaveLength(1);
      expect(
        (
          sqlite.prepare('SELECT COUNT(*) count FROM accounting_pack_revision').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      expect(
        (
          sqlite.prepare('SELECT COUNT(*) count FROM accounting_pack_revision_snapshot').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it('creates overlapping source cuts without colliding immutable source evidence', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(principal, input());
      const second = service.createCanonicalRevision(
        principal,
        input({
          periodEnd: '2026-01-31',
          idempotencyKey: 'test:accounting-pack:2026-01:overlap',
          sourceItems: [
            {
              id: 'source-1-overlap',
              itemKind: 'invoice',
              sourceId: 'invoice-1',
              itemVersion: 1,
              effectiveAt: '2026-01-10T00:00:00.000Z',
              evidenceType: 'invoice_source',
              evidenceId: 'invoice-source-evidence-1-overlap',
              amountMinor: 1000,
              currency: 'EUR',
            },
          ],
        }),
      );

      expect(second.revisionId).not.toBe(first.revisionId);
      expect(
        sqlite
          .prepare(
            `SELECT semantic_id FROM finance_hash_evidence
             WHERE evidence_type='invoice_source'
               AND contract_version='accounting-pack-source-item-v1'
             ORDER BY semantic_id`,
          )
          .all(),
      ).toEqual([
        { semantic_id: 'invoice:invoice-1:1:2026-01-01:2026-01-31:EUR' },
        { semantic_id: 'invoice:invoice-1:1:2026-01-01:2026-02-01:EUR' },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it('reuses the canonical semantic evidence owner when a retry supplies another evidence id', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(principal, input());
      const second = service.createCanonicalRevision(
        principal,
        input({
          idempotencyKey: 'test:accounting-pack:2026-01:semantic-retry',
          sourceItems: [
            {
              ...(input().sourceItems as readonly Record<string, unknown>[])[0],
              evidenceId: 'invoice-source-evidence-1-retry',
            },
          ],
        }),
      );

      expect(second.revisionId).not.toBe(first.revisionId);
      expect(
        sqlite
          .prepare(
            `SELECT evidence_id FROM finance_hash_evidence
              WHERE evidence_type='invoice_source'
                AND contract_version='accounting-pack-source-item-v1'`,
          )
          .all(),
      ).toEqual([{ evidence_id: 'invoice-source-evidence-1' }]);
      expect(
        sqlite
          .prepare(
            `SELECT DISTINCT evidence_id FROM finance_source_cut_item
              WHERE item_kind='invoice' AND item_id='invoice-1'`,
          )
          .all(),
      ).toEqual([{ evidence_id: 'invoice-source-evidence-1' }]);
    } finally {
      sqlite.close();
    }
  });

  it('reuses legacy unscoped source evidence while preserving its immutable bytes', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const legacyBlob = Buffer.from(
        '{"amount_minor":1000,"currency":"EUR","cut_period_end":"2026-02-01","cut_period_start":"2026-01-01","effective_at":"2026-01-10T00:00:00.000Z","evidence_id":"legacy-physical-evidence","evidence_type":"invoice_source","id":"source-1","item_id":"invoice-1","item_kind":"invoice","item_version":1,"payload":null,"schema_version":"accounting-pack-source-item-v1"}',
      );
      const legacyHash = createHash('sha256').update(legacyBlob).digest('hex');
      sqlite
        .prepare(
          `INSERT INTO finance_hash_evidence(
             evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
           ) VALUES('legacy-physical-evidence','invoice_source','accounting-pack-source-item-v1',
                    'invoice:invoice-1:1',?,?,?)`,
        )
        .run(legacyBlob, legacyHash, '2026-01-01T00:00:00.000Z');

      service.createCanonicalRevision(principal, input());
      expect(
        sqlite
          .prepare(
            `SELECT evidence_id,evidence_hash FROM finance_source_cut_item
              WHERE item_kind='invoice' AND item_id='invoice-1'`,
          )
          .get(),
      ).toEqual({ evidence_id: 'legacy-physical-evidence', evidence_hash: legacyHash });
    } finally {
      sqlite.close();
    }
  });

  it('recovers a concurrent semantic evidence insert without leaking a SQLite constraint', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const originalPrepare = sqlite.prepare.bind(sqlite);
      let injected = false;
      sqlite.prepare = ((sql: string) => {
        const statement = originalPrepare(sql);
        if (!sql.includes('INSERT INTO finance_hash_evidence')) return statement;
        return new Proxy(statement, {
          get(target, property) {
            if (property !== 'run') return Reflect.get(target, property, target);
            return (...values: unknown[]) => {
              if (!injected && values[1] === 'invoice_source') {
                injected = true;
                originalPrepare(
                  `INSERT INTO finance_hash_evidence(
                     evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,
                     evidence_hash,created_at
                   ) VALUES(?,?,?,?,?,?,?)`,
                ).run('race-canonical-owner', ...values.slice(1));
              }
              return target.run(...values);
            };
          },
        });
      }) as typeof sqlite.prepare;

      expect(() => service.createCanonicalRevision(principal, input())).not.toThrow();
      expect(
        sqlite
          .prepare(
            `SELECT evidence_id FROM finance_source_cut_item
              WHERE item_kind='invoice' AND item_id='invoice-1'`,
          )
          .get(),
      ).toEqual({ evidence_id: 'race-canonical-owner' });
    } finally {
      sqlite.close();
    }
  });

  it('rejects payments and reversals whose invoice is not included in the pack', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-15T12:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,created_at)
           VALUES('payment-cross-invoice','invoice-2',100,'EUR',?,?)`,
        )
        .run(now, now);

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:cross-invoice-payment',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-payment-cross-invoice',
                itemKind: 'payment',
                sourceId: 'payment-cross-invoice',
                itemVersion: 1,
                effectiveAt: now,
                evidenceType: 'payment_record',
                evidenceId: 'payment-cross-invoice-evidence',
                amountMinor: 100,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            paymentCount: 1,
            collectedMinor: 100,
          }),
        ),
      ).toThrow(/payment:payment-cross-invoice:invoice_not_in_pack/u);

      service.createCanonicalRevision(
        principal,
        input({ idempotencyKey: 'test:accounting-pack:cross-invoice-reversal-prerequisite' }),
      );
      const command = sqlite.prepare('SELECT command_id FROM finance_command LIMIT 1').get() as {
        command_id: string;
      };
      sqlite
        .prepare(
          `INSERT INTO invoice_payment_reversal_event(
             id,original_payment_id,invoice_id,currency,amount_minor,effective_at,reason_code,
             actor_id,command_id,created_at,reversal_payload_hash,reversal_hash
           ) VALUES('reversal-cross-invoice','payment-cross-invoice','invoice-2','EUR',50,?,
                    'correction','owner',?,?, 'reversal-payload-cross','reversal-hash-cross')`,
        )
        .run(now, command.command_id, now);
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:cross-invoice-reversal',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-reversal-cross-invoice',
                itemKind: 'payment_reversal',
                sourceId: 'reversal-cross-invoice',
                itemVersion: 1,
                effectiveAt: now,
                evidenceType: 'payment_reversal',
                evidenceId: 'reversal-cross-invoice-evidence',
                amountMinor: 50,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            paymentCount: 1,
            collectedMinor: -50,
          }),
        ),
      ).toThrow(/payment_reversal:reversal-cross-invoice:invoice_not_in_pack/u);
    } finally {
      sqlite.close();
    }
  });

  it('rejects omitted in-period collections for included invoices', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-15T12:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,created_at)
           VALUES('payment-omitted','invoice-1',100,'EUR',?,?)`,
        )
        .run(now, now);

      expect(() => service.createCanonicalRevision(principal, input())).toThrow(
        /payment:payment-omitted:missing_from_source_cut/u,
      );
    } finally {
      sqlite.close();
    }
  });

  it('rejects invoice linkage sources whose parent invoice is absent, draft, void, or cross-entity', () => {
    const { sqlite, service, principal } = fixture();
    try {
      seedLegacyFinalizedInvoiceChild(sqlite, 'invoice_source', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_source(
             source_link_id,invoice_id,source_type,source_id,source_version,source_hash,
             allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at,locked_at
           ) VALUES('link-cross-parent','invoice-2','time','time-cross-parent',1,'hash',
                    10,2,12,'2026-01-10T00:00:00.000Z','2026-01-10T00:00:00.000Z')`,
          )
          .run(),
      );

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:link-parent-not-in-pack',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-link-cross-parent',
                itemKind: 'invoice_source',
                sourceId: 'invoice-2:time:time-cross-parent',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'link-cross-parent-evidence',
                amountMinor: 10,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            invoiceSourceCount: 1,
          }),
        ),
      ).toThrow(/invoice_source:invoice-2:time:time-cross-parent:parent_invoice_not_in_pack/u);

      seedLegacyFinalizedInvoiceChild(sqlite, 'commercial_manifest', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_commercial_source_manifest(
             manifest_id,invoice_id,source_type,source_id,source_version,disposition,
             allocated_minor,reason_code,created_at,locked_at
           ) VALUES('manifest-cross-parent','invoice-2','expense','expense-cross-parent',1,
                    'included',10,'billable','2026-01-10T00:00:00.000Z',
                    '2026-01-10T00:00:00.000Z')`,
          )
          .run(),
      );
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:manifest-parent-not-in-pack',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-manifest-cross-parent',
                itemKind: 'commercial_manifest',
                sourceId: 'invoice-2:expense:expense-cross-parent',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'manifest-cross-parent-evidence',
                amountMinor: 10,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
          }),
        ),
      ).toThrow(
        /commercial_manifest:invoice-2:expense:expense-cross-parent:parent_invoice_not_in_pack/u,
      );
    } finally {
      sqlite.close();
    }
  });

  it('rejects invoice linkage sources owned by another project', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-10T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO project(
             id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
           ) VALUES('project-2','PROJECT-002','client-1','Project Two','Europe/Madrid','EUR',
                    'active','time_and_materials',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-cross-project','Worker','cross-project@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO expense(
             id,project_id,worker_id,spent_on,category,currency,amount_minor,
             project_currency_amount_minor,client_treatment,approval_state,created_at,updated_at,version
           ) VALUES('expense-cross-project','project-2','worker-cross-project','2026-01-10',
                    'travel','EUR',10,10,'reimbursable','approved',?,?,1)`,
        )
        .run(now, now);

      const cases = [
        {
          kind: 'invoice_source',
          childKind: 'invoice_source',
          insert: `INSERT INTO invoice_source(
                     source_link_id,invoice_id,source_type,source_id,source_version,source_hash,
                     allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at,locked_at
                   ) VALUES('link-cross-project','invoice-1','expense','expense-cross-project',1,
                            'hash',10,0,10,'${now}','${now}')`,
        },
        {
          kind: 'commercial_manifest',
          childKind: 'commercial_manifest',
          insert: `INSERT INTO invoice_commercial_source_manifest(
                     manifest_id,invoice_id,source_type,source_id,source_version,disposition,
                     allocated_minor,reason_code,created_at,locked_at
                   ) VALUES('manifest-cross-project','invoice-1','expense','expense-cross-project',1,
                            'included',10,'billable','${now}','${now}')`,
        },
      ] as const;

      for (const testCase of cases) {
        seedLegacyFinalizedInvoiceChild(sqlite, testCase.childKind, () => {
          sqlite.prepare(testCase.insert).run();
        });
        expect(() =>
          service.createCanonicalRevision(
            principal,
            input({
              idempotencyKey: `test:accounting-pack:${testCase.kind}:cross-project`,
              sourceItems: [
                ...(input().sourceItems as readonly Record<string, unknown>[]),
                {
                  id: `source-${testCase.kind}-cross-project`,
                  itemKind: testCase.kind,
                  sourceId: 'invoice-1:expense:expense-cross-project',
                  itemVersion: 1,
                  effectiveAt: now,
                  evidenceType: 'invoice_source',
                  evidenceId: `${testCase.kind}-cross-project-evidence`,
                  amountMinor: 10,
                  currency: 'EUR',
                },
              ],
              sourceItemCount: 2,
              invoiceSourceCount: testCase.kind === 'invoice_source' ? 1 : 0,
            }),
          ),
        ).toThrow(
          new RegExp(
            `${testCase.kind}:invoice-1:expense:expense-cross-project:source_project_mismatch`,
            'u',
          ),
        );
      }
    } finally {
      sqlite.close();
    }
  });

  it('rejects a caller legal-entity revision from another legacy entity series', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(principal, input());
      const firstEntityRevision = first.legalEntityRevisionId;
      sqlite
        .prepare(
          `INSERT INTO legal_entity(
             id,code,legal_name,currency,billing_address,company_identifiers,status,
             created_at,updated_at,version
           ) VALUES('legacy-other','LE-OTHER','Other Entity','EUR','Address','TAX-OTHER','active',?,?,1)`,
        )
        .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            legacyLegalEntityId: 'legacy-other',
            legalEntityRevisionId: firstEntityRevision,
            idempotencyKey: 'test:accounting-pack:cross-entity-revision',
          }),
        ),
      ).toThrow(/Legal entity revision series/u);
    } finally {
      sqlite.close();
    }
  });

  it('rejects an issued invoice bound to another legacy legal entity', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const canonical = service.createCanonicalRevision(principal, input());
      sqlite
        .prepare(
          `INSERT INTO legal_entity(
             id,code,legal_name,currency,billing_address,company_identifiers,status,
             created_at,updated_at,version
           ) VALUES('legacy-other','LE-OTHER','Other Entity','EUR','Address','TAX-OTHER','active',?,?,1)`,
        )
        .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      sqlite
        .prepare("UPDATE billing_rule SET legal_entity_id='legacy-other' WHERE id='billing-rule-1'")
        .run();
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            legalEntityRevisionId: canonical.legalEntityRevisionId,
            idempotencyKey: 'test:accounting-pack:canonical-revision-wrong-legacy-entity',
          }),
        ),
      ).toThrow(/invoice:invoice-1:parent_invoice_legal_entity_mismatch/u);
    } finally {
      sqlite.close();
    }
  });

  it('rejects changed effective bounds on an existing legal-entity revision', () => {
    const { sqlite, service, principal } = fixture();
    try {
      service.createCanonicalRevision(principal, input());
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            legalEntity: { effectiveTo: '2026-12-31T23:59:59.999Z' },
            idempotencyKey: 'test:accounting-pack:changed-effective-bound',
          }),
        ),
      ).toThrow(/Legal entity revision effective_to is not idempotent/u);
    } finally {
      sqlite.close();
    }
  });

  it('does not let a new revision attach another legacy entity to an owned canonical series', () => {
    const { sqlite, service, principal } = fixture();
    try {
      sqlite
        .prepare(
          `INSERT INTO legal_entity(
             id,code,legal_name,currency,billing_address,company_identifiers,status,
             created_at,updated_at,version
           ) VALUES('legacy-other','LE-OTHER','Other Entity','EUR','Address','TAX-OTHER','active',?,?,1)`,
        )
        .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      const other = service.createCanonicalRevision(
        principal,
        emptyInput({
          legacyLegalEntityId: 'legacy-other',
          idempotencyKey: 'test:accounting-pack:other-owned-series',
        }),
      );
      const ownedSeries = (
        sqlite
          .prepare('SELECT series_id FROM legal_entity_revision WHERE revision_id=?')
          .get(other.legalEntityRevisionId) as { series_id: string }
      ).series_id;

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            legalEntityRevisionId: 'caller-new-cross-entity-revision',
            legalEntity: { seriesId: ownedSeries },
            idempotencyKey: 'test:accounting-pack:new-revision-cross-entity-series',
          }),
        ),
      ).toThrow(/canonical series.*legacy legal entity|series.*owned by another legacy/u);
      expect(
        sqlite
          .prepare('SELECT revision_id FROM legal_entity_revision WHERE revision_id=?')
          .get('caller-new-cross-entity-revision'),
      ).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });

  it('selects the one legal-entity revision effective at the deterministic period cut', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(
        principal,
        input({
          periodEnd: '2026-01-10',
          legalEntity: { effectiveTo: '2026-01-15T00:00:00.000Z' },
          idempotencyKey: 'test:accounting-pack:entity-revision-first-window',
        }),
      );
      const entitySeries = (
        sqlite
          .prepare('SELECT series_id FROM legal_entity_revision WHERE revision_id=?')
          .get(first.legalEntityRevisionId) as { series_id: string }
      ).series_id;
      const second = service.createCanonicalRevision(
        principal,
        emptyInput({
          periodStart: '2026-01-15',
          periodEnd: '2026-02-01',
          legalEntityRevisionId: 'entity-revision-second-window',
          legalEntity: {
            seriesId: entitySeries,
            effectiveFrom: '2026-01-15T00:00:00.000Z',
          },
          idempotencyKey: 'test:accounting-pack:entity-revision-second-window',
        }),
      );

      const selected = service.createCanonicalRevision(
        principal,
        emptyInput({
          periodStart: '2026-01-15',
          periodEnd: '2026-02-01',
          idempotencyKey: 'test:accounting-pack:entity-revision-select-by-cut',
        }),
      );
      expect(selected.legalEntityRevisionId).toBe(second.legalEntityRevisionId);
      expect(selected.legalEntityRevisionId).not.toBe(first.legalEntityRevisionId);
    } finally {
      sqlite.close();
    }
  });

  it('rejects legal-entity effective-date gaps and overlaps at the period cut', () => {
    const gap = fixture();
    try {
      gap.service.createCanonicalRevision(
        gap.principal,
        input({
          periodEnd: '2026-01-10',
          legalEntity: { effectiveTo: '2026-01-15T00:00:00.000Z' },
          idempotencyKey: 'test:accounting-pack:entity-gap-prerequisite',
        }),
      );
      expect(() =>
        gap.service.createCanonicalRevision(
          gap.principal,
          emptyInput({
            periodStart: '2026-02-01',
            periodEnd: '2026-02-28',
            idempotencyKey: 'test:accounting-pack:entity-gap',
          }),
        ),
      ).toThrow(/effective.*gap|no legal-entity revision.*period cut/i);
    } finally {
      gap.sqlite.close();
    }

    const overlap = fixture();
    try {
      const first = overlap.service.createCanonicalRevision(
        overlap.principal,
        input({ idempotencyKey: 'test:accounting-pack:entity-overlap-prerequisite' }),
      );
      const entitySeries = (
        overlap.sqlite
          .prepare('SELECT series_id FROM legal_entity_revision WHERE revision_id=?')
          .get(first.legalEntityRevisionId) as { series_id: string }
      ).series_id;
      expect(() =>
        overlap.service.createCanonicalRevision(
          overlap.principal,
          emptyInput({
            legalEntityRevisionId: 'overlapping-entity-revision',
            legalEntity: {
              seriesId: entitySeries,
              effectiveFrom: '2026-01-15T00:00:00.000Z',
            },
            idempotencyKey: 'test:accounting-pack:entity-overlap',
          }),
        ),
      ).toThrow(/overlap|multiple legal-entity revisions.*period cut/i);
      expect(
        overlap.sqlite
          .prepare('SELECT revision_id FROM legal_entity_revision WHERE revision_id=?')
          .get('overlapping-entity-revision'),
      ).toBeUndefined();
    } finally {
      overlap.sqlite.close();
    }
  });

  it('rejects a caller revision id that is already owned by another pack series', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const first = service.createCanonicalRevision(principal, input());
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            revisionId: first.revisionId,
            seriesId: 'caller-forged-series',
            idempotencyKey: 'test:accounting-pack:caller-forged-series',
          }),
        ),
      ).toThrow(/Accounting pack revision series_id is not idempotent/u);
    } finally {
      sqlite.close();
    }
  });

  it('rejects over-settlement as an explicit negative outstanding conflict', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-15T12:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,created_at)
           VALUES('payment-over-settlement','invoice-1',1300,'EUR',?,?)`,
        )
        .run(now, now);
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:negative-outstanding',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-payment-over-settlement',
                itemKind: 'payment',
                sourceId: 'payment-over-settlement',
                itemVersion: 1,
                effectiveAt: now,
                evidenceType: 'payment_record',
                evidenceId: 'payment-over-settlement-evidence',
                amountMinor: 1300,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            paymentCount: 1,
            collectedMinor: 1300,
            outstandingMinor: -100,
          }),
        ),
      ).toThrow(/invoice:invoice-1:negative_outstanding_balance/u);
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
      sqlite
        .prepare(
          `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at)
           VALUES('payment-revision-v2','invoice-1',100,'EUR','2026-01-15T00:00:00.000Z',
                  'REVISION-V2','2026-01-15T00:00:00.000Z')`,
        )
        .run();
      const second = service.createCanonicalRevision(
        principal,
        input({
          idempotencyKey: 'test:accounting-pack:2026-01:v2',
          sourceItems: [
            ...(input().sourceItems as readonly Record<string, unknown>[]),
            {
              id: 'source-payment-v2',
              itemKind: 'payment',
              sourceId: 'payment-revision-v2',
              itemVersion: 1,
              effectiveAt: '2026-01-15T00:00:00.000Z',
              evidenceType: 'payment_record',
              evidenceId: 'payment-revision-v2-evidence',
              amountMinor: 100,
              currency: 'EUR',
            },
          ],
          sourceItemCount: 2,
          paymentCount: 1,
          collectedMinor: 100,
          outstandingMinor: 1100,
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

  it('rejects a null amount for a monetary authoritative source without partial writes', () => {
    const { sqlite, service, principal } = fixture();
    try {
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:null-authoritative-amount',
            sourceItems: [
              {
                id: 'source-null-amount',
                itemKind: 'invoice',
                sourceId: 'invoice-1',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'invoice-source-null-amount',
                amountMinor: null,
                currency: 'EUR',
              },
            ],
          }),
        ),
      ).toThrow(/amount_mismatch/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
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

  it('rejects a draft expense source instead of treating it as an approved source', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-1','Worker','worker@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO expense(
             id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
             approval_state,created_at,updated_at,version
           ) VALUES('expense-draft','project-1','worker-1','2026-01-12','travel','EUR',100,
                    'non_billable','draft',?,?,1)`,
        )
        .run(now, now);

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:draft-expense',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-draft-expense',
                itemKind: 'expense',
                sourceId: 'expense-draft',
                itemVersion: 1,
                effectiveAt: '2026-01-12T00:00:00.000Z',
                evidenceType: 'finance_change_event',
                evidenceId: 'draft-expense-evidence',
                amountMinor: 100,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            expenseCount: 1,
            approvedExpenseCount: 1,
          }),
        ),
      ).toThrow(/expense-draft:expense_not_approved/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects a draft expense direct-cost source instead of recognizing its cost', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-1','Worker','worker@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO expense(
             id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
             approval_state,created_at,updated_at,version
           ) VALUES('expense-direct-draft','project-1','worker-1','2026-01-12','travel','EUR',100,
                    'non_billable','draft',?,?,1)`,
        )
        .run(now, now);

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:draft-direct-cost',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-draft-direct-cost',
                itemKind: 'direct_cost',
                sourceId: 'expense:expense-direct-draft',
                itemVersion: 1,
                effectiveAt: '2026-01-12T00:00:00.000Z',
                evidenceType: 'direct_cost_event',
                evidenceId: 'draft-direct-cost-evidence',
                amountMinor: 100,
                currency: 'EUR',
                payload: { expenseId: 'expense-direct-draft' },
              },
            ],
            sourceItemCount: 2,
            expenseCostMinor: 100,
            directCostMinor: 100,
            contributionMinor: 900,
          }),
        ),
      ).toThrow(/expense:expense-direct-draft:expense_not_approved/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects a compensation source amount that differs from the canonical time rule amount', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-1','Worker','worker@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO project_member(
             id,project_id,user_id,assignment_role,starts_on,status,created_at,updated_at
           ) VALUES('member-compensation','project-1','worker-1','worker','2026-01-01','active',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO compensation_rule(
             id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at
           ) VALUES('compensation-rule-1','worker-1','project-1','EUR',25,'hourly','2026-01-01',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO internal_cost_rule(
             id,worker_id,project_id,currency,hourly_rate_minor,effective_from,created_at,updated_at
           ) VALUES('cost-compensation-1','worker-1','project-1','EUR',25,'2026-01-01',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO time_entry(
             id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
             created_at,updated_at,version
           ) VALUES('time-compensation-1','project-1','worker-1','2026-01-15','regular',480,'approved',
                    'billable',?,?,1)`,
        )
        .run(now, now);

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:forged-compensation-amount',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-time-compensation',
                itemKind: 'time',
                sourceId: 'time-compensation-1',
                itemVersion: 1,
                effectiveAt: '2026-01-15T00:00:00.000Z',
                evidenceType: 'finance_change_event',
                evidenceId: 'time-compensation-evidence',
                amountMinor: null,
                currency: 'EUR',
              },
              {
                id: 'source-compensation-forged',
                itemKind: 'compensation',
                sourceId: 'worker-1:project-1',
                itemVersion: 1,
                effectiveAt: '2026-02-01T00:00:00.000Z',
                evidenceType: 'settlement_revision',
                evidenceId: 'compensation-forged-evidence',
                amountMinor: 201,
                currency: 'EUR',
                payload: { sourceTimeIds: ['time-compensation-1'] },
              },
              {
                id: 'source-direct-cost-compensation',
                itemKind: 'direct_cost',
                sourceId: 'labor:worker-1:project-1',
                itemVersion: 1,
                effectiveAt: '2026-02-01T00:00:00.000Z',
                evidenceType: 'direct_cost_event',
                evidenceId: 'direct-cost-compensation-evidence',
                amountMinor: 200,
                currency: 'EUR',
                payload: { sourceTimeIds: ['time-compensation-1'] },
              },
            ],
            sourceItemCount: 4,
            workerCostCount: 1,
            approvedTimeEntryCount: 1,
            workerCostMinor: 200,
            directCostMinor: 200,
            contributionMinor: 800,
          }),
        ),
      ).toThrow(/compensation:worker-1:project-1:amount_mismatch/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects draft invoices as historical Accounting Pack sources', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO invoice(
             id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
             issued_at,snapshot_json,created_at,updated_at,version
           ) VALUES('invoice-draft','project-1','DRAFT-1','labor','draft','EUR',500,100,600,
                    NULL,'{}','2026-01-10T00:00:00.000Z',?,1)`,
        )
        .run(now);

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:draft-invoice',
            sourceItems: [
              {
                id: 'source-draft-invoice',
                itemKind: 'invoice',
                sourceId: 'invoice-draft',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_subject',
                evidenceId: 'draft-invoice-evidence',
                amountMinor: 500,
                currency: 'EUR',
              },
            ],
            invoiceCount: 1,
            sourceItemCount: 1,
            netMinor: 500,
            taxMinor: 100,
            grossMinor: 600,
            outstandingMinor: 600,
            contributionMinor: 500,
          }),
        ),
      ).toThrow(/invoice-draft:invoice_not_issued/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects forged or omitted persisted Accounting Pack detail rows', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const cases: Array<[string, unknown]> = [
        ['invoiceRegister', [{ invoiceId: 'invoice-forged', currency: 'EUR', netMinor: '1000' }]],
        ['collections', [{ paymentId: 'payment-forged', currency: 'EUR', amountMinor: '1' }]],
        [
          'workerCosts',
          [{ workerId: 'worker-forged', currency: 'EUR', internalLoadedLaborCostMinor: '1' }],
        ],
        [
          'expenseRegister',
          [{ expenseId: 'expense-forged', currency: 'EUR', projectCurrencyAmountMinor: '1' }],
        ],
        ['ledger', [{ invoiceId: 'invoice-forged', currency: 'EUR', subtotalMinor: '1000' }]],
        ['totalsByCurrency', [{ currency: 'EUR', totalInvoicedMinor: '1' }]],
      ];
      for (const [field, value] of cases) {
        expect(() =>
          service.createCanonicalRevision(
            principal,
            input({
              idempotencyKey: `test:accounting-pack:forged-detail:${field}`,
              [field]: value,
            }),
          ),
        ).toThrow(new RegExp(`${field}.*authoritative|authoritative.*${field}`, 'u'));
      }
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects altered financial values attached to real authoritative detail identities', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const cases: Array<[string, unknown]> = [
        [
          'invoiceRegister',
          [
            {
              invoiceId: 'invoice-1',
              version: 1,
              currency: 'EUR',
              netMinor: '999999',
              taxMinor: '200',
              grossMinor: '1200',
              issueDate: '2026-01-10T00:00:00.000Z',
            },
          ],
        ],
        [
          'ledger',
          [
            {
              invoiceId: 'invoice-1',
              version: 1,
              currency: 'EUR',
              subtotalMinor: '1000',
              taxMinor: '999999',
              totalMinor: '1200',
              issueDate: '2026-01-10T00:00:00.000Z',
            },
          ],
        ],
        [
          'totalsByCurrency',
          [
            {
              currency: 'EUR',
              totalInvoicedMinor: '1000',
              taxInvoicedMinor: '200',
              grossInvoicedMinor: '999999',
            },
          ],
        ],
      ];
      for (const [field, value] of cases)
        expect(() =>
          service.createCanonicalRevision(
            principal,
            input({
              idempotencyKey: `test:accounting-pack:altered-real-detail:${field}`,
              [field]: value,
            }),
          ),
        ).toThrow(/does not match authoritative Accounting Pack detail rows/u);

      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('treats date-only source fields as local business dates', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-1','Worker','worker@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO expense(
             id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
             approval_state,created_at,updated_at,version
           ) VALUES('expense-local-date','project-1','worker-1','2026-01-01','travel','EUR',100,
                    'non_billable','approved',?,?,1)`,
        )
        .run(now, now);

      const result = service.createCanonicalRevision(
        principal,
        input({
          idempotencyKey: 'test:accounting-pack:local-business-date',
          timezone: 'America/Los_Angeles',
          sourceItems: [
            ...(input().sourceItems as readonly Record<string, unknown>[]),
            {
              id: 'source-local-date-expense',
              itemKind: 'expense',
              sourceId: 'expense-local-date',
              itemVersion: 1,
              effectiveAt: '2026-01-01T00:00:00.000Z',
              evidenceType: 'finance_change_event',
              evidenceId: 'local-date-expense-evidence',
              amountMinor: 100,
              currency: 'EUR',
            },
            {
              id: 'source-local-date-direct-cost',
              itemKind: 'direct_cost',
              sourceId: 'expense:expense-local-date',
              itemVersion: 1,
              effectiveAt: '2026-01-01T00:00:00.000Z',
              evidenceType: 'direct_cost_event',
              evidenceId: 'local-date-direct-cost-evidence',
              amountMinor: 100,
              currency: 'EUR',
              payload: { expenseId: 'expense-local-date' },
            },
          ],
          sourceItemCount: 3,
          expenseCount: 1,
          approvedExpenseCount: 1,
          expenseCostMinor: 100,
          directCostMinor: 100,
          contributionMinor: 900,
        }),
      );

      expect(result.revisionId).toMatch(/^fp-accounting-pack-revision-/u);
    } finally {
      sqlite.close();
    }
  });

  it('resolves timestamp assignment boundaries in each project civil timezone', () => {
    const scenarios = [
      {
        name: 'madrid-next-day',
        projectTimezone: 'Europe/Madrid',
        invoiceIssuedAt: '2026-01-31T23:30:00.000Z',
        periodEnd: '2026-02-01',
        assignmentFrom: '2026-02-01',
        assignmentTo: '2026-02-02',
      },
      {
        name: 'america-previous-day',
        projectTimezone: 'America/Los_Angeles',
        invoiceIssuedAt: '2026-02-01T00:30:00.000Z',
        periodEnd: '2026-01-31',
        assignmentFrom: '2026-01-30',
        assignmentTo: '2026-01-31',
      },
    ] as const;

    for (const scenario of scenarios) {
      const { sqlite, service, principal } = fixture(scenario);
      try {
        const sourceItem = {
          ...(input().sourceItems as readonly Record<string, unknown>[])[0],
          effectiveAt: scenario.invoiceIssuedAt,
        };
        const bootstrap = service.createCanonicalRevision(
          principal,
          input({
            timezone: scenario.projectTimezone,
            periodEnd: scenario.periodEnd,
            sourceItems: [sourceItem],
            idempotencyKey: `test:accounting-pack:assignment-boundary:${scenario.name}:bootstrap`,
          }),
        );
        const identity = sqlite
          .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
          .get() as { tenant_id: string; deployment_id: string };
        const command = sqlite
          .prepare(
            "SELECT command_id FROM finance_command WHERE operation='legal_entity_revision.create'",
          )
          .get() as { command_id: string };
        sqlite
          .prepare(
            `INSERT INTO project_legal_entity_assignment(
               assignment_id,project_id,legal_entity_revision_id,tenant_id,deployment_id,
               effective_from,effective_to,created_at,command_id
             ) VALUES(?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            `assignment-${scenario.name}`,
            'project-1',
            bootstrap.legalEntityRevisionId,
            identity.tenant_id,
            identity.deployment_id,
            scenario.assignmentFrom,
            scenario.assignmentTo,
            '2026-01-01T00:00:00.000Z',
            command.command_id,
          );

        const resolved = service.createCanonicalRevision(
          principal,
          input({
            timezone: scenario.projectTimezone,
            periodEnd: scenario.periodEnd,
            sourceItems: [sourceItem],
            idempotencyKey: `test:accounting-pack:assignment-boundary:${scenario.name}:resolved`,
          }),
        );
        expect(resolved.legalEntityRevisionId).toBe(bootstrap.legalEntityRevisionId);
        expect(resolved.idempotent).toBe(false);
      } finally {
        sqlite.close();
      }
    }
  });

  it('uses the source project civil timezone for UTC-midnight period boundaries', () => {
    const { sqlite, service, principal } = fixture({
      projectTimezone: 'America/Los_Angeles',
      invoiceIssuedAt: '2026-02-01T00:30:00.000Z',
    });
    try {
      // This instant is 2026-01-31 16:30 in the project timezone, even though
      // it is already February 1 in UTC. The pack timezone is intentionally
      // different to prove that source ownership does not use a global slice.
      sqlite
        .prepare(
          `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,created_at)
           VALUES('payment-project-civil-boundary','invoice-1',100,'EUR',?,?)`,
        )
        .run('2026-02-01T00:30:00.000Z', '2026-02-01T00:30:00.000Z');

      const result = service.createCanonicalRevision(
        principal,
        input({
          timezone: 'UTC',
          periodEnd: '2026-01-31',
          sourceItems: [
            {
              ...(input().sourceItems as readonly Record<string, unknown>[])[0],
              effectiveAt: '2026-02-01T00:30:00.000Z',
            },
            {
              id: 'source-project-civil-boundary-payment',
              itemKind: 'payment',
              sourceId: 'payment-project-civil-boundary',
              itemVersion: 1,
              effectiveAt: '2026-02-01T00:30:00.000Z',
              evidenceType: 'payment_record',
              evidenceId: 'project-civil-boundary-payment-evidence',
              amountMinor: 100,
              currency: 'EUR',
            },
          ],
          sourceItemCount: 2,
          paymentCount: 1,
          collectedMinor: 100,
          outstandingMinor: 1100,
          idempotencyKey: 'test:accounting-pack:project-civil-boundary',
        }),
      );

      expect(result.revisionId).toMatch(/^fp-accounting-pack-revision-/u);
      expect(
        JSON.parse(
          (
            sqlite
              .prepare(
                'SELECT snapshot_json FROM accounting_pack_revision_snapshot WHERE revision_id=?',
              )
              .get(result.revisionId) as { snapshot_json: string }
          ).snapshot_json,
        ).payment_count,
      ).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it('fails closed when a timestamp source has no valid project timezone', () => {
    const { sqlite, service, principal } = fixture({ projectTimezone: 'Invalid/Project-Zone' });
    try {
      expect(() => service.createCanonicalRevision(principal, input())).toThrow(
        /project.*timezone|timezone.*invalid|source authority mismatch/i,
      );
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('resolves an active internal cost rule from the shipped schema for approved time', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-1','Worker','worker@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO project_member(
             id,project_id,user_id,assignment_role,starts_on,status,created_at,updated_at
           ) VALUES('member-1','project-1','worker-1','worker','2026-01-01','active',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO internal_cost_rule(
             id,worker_id,project_id,currency,hourly_rate_minor,effective_from,created_at,updated_at
           ) VALUES('cost-1','worker-1','project-1','EUR',25,'2026-01-01',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO time_entry(
             id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
             compensation_amount_minor,created_at,updated_at,version
           ) VALUES('time-1','project-1','worker-1','2026-01-15','regular',480,'approved',
                    'billable',200,?,?,1)`,
        )
        .run(now, now);

      const result = service.createCanonicalRevision(
        principal,
        input({
          idempotencyKey: 'test:accounting-pack:approved-time-cost',
          sourceItems: [
            ...(input().sourceItems as readonly Record<string, unknown>[]),
            {
              id: 'source-time-1',
              itemKind: 'time',
              sourceId: 'time-1',
              itemVersion: 1,
              effectiveAt: '2026-01-15T00:00:00.000Z',
              evidenceType: 'finance_change_event',
              evidenceId: 'time-evidence-1',
              amountMinor: null,
              currency: 'EUR',
            },
            {
              id: 'source-compensation-1',
              itemKind: 'compensation',
              sourceId: 'worker-1:project-1',
              itemVersion: 1,
              effectiveAt: '2026-02-01T00:00:00.000Z',
              evidenceType: 'settlement_revision',
              evidenceId: 'compensation-evidence-1',
              amountMinor: 200,
              currency: 'EUR',
              payload: { sourceTimeIds: ['time-1'] },
            },
            {
              id: 'source-direct-cost-1',
              itemKind: 'direct_cost',
              sourceId: 'labor:worker-1:project-1',
              itemVersion: 1,
              effectiveAt: '2026-02-01T00:00:00.000Z',
              evidenceType: 'direct_cost_event',
              evidenceId: 'direct-cost-evidence-1',
              amountMinor: 200,
              currency: 'EUR',
              payload: { sourceTimeIds: ['time-1'] },
            },
          ],
          workerCosts: [
            {
              workerId: 'worker-1',
              projectId: 'project-1',
              currency: 'EUR',
              internalLoadedLaborCostMinor: '200',
            },
          ],
          sourceItemCount: 4,
          workerCostCount: 1,
          approvedTimeEntryCount: 1,
          workerCostMinor: 200,
          directCostMinor: 200,
          contributionMinor: 800,
        }),
      );

      expect(result.revisionId).toMatch(/^fp-accounting-pack-revision-/u);
    } finally {
      sqlite.close();
    }
  });

  it('accepts a non-monetary invoice-source linkage whose authoritative allocation is null', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-09T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-link-valid','Worker Link','worker-link-valid@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO time_entry(
             id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
             created_at,updated_at,version
           ) VALUES('time-link-1','project-1','worker-link-valid','2026-01-09','regular',60,
                    'approved','billable',?,?,1)`,
        )
        .run(now, now);
      seedLegacyFinalizedInvoiceChild(sqlite, 'invoice_source', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_source(
             source_link_id,invoice_id,source_type,source_id,source_version,source_hash,locked_at
            ) VALUES('link-1','invoice-1','time','time-link-1',1,?,
                     '2026-01-10T00:00:00.000Z')`,
          )
          .run(
            createHash('sha256')
              .update(
                JSON.stringify({
                  sourceType: 'time',
                  sourceId: 'time-link-1',
                  sourceVersion: 1,
                  snapshots: [],
                }),
              )
              .digest('hex'),
          ),
      );
      seedLegacyFinalizedInvoiceChild(sqlite, 'commercial_manifest', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_commercial_source_manifest(
             manifest_id,invoice_id,source_type,source_id,source_version,disposition,
             reason_code,source_hash,created_at,locked_at
           ) VALUES('manifest-link-1','invoice-1','time','time-link-1',1,'included',
                    'time_source_included',?,?,'2026-01-10T00:00:00.000Z')`,
          )
          .run(
            createHash('sha256')
              .update(
                JSON.stringify({
                  sourceType: 'time',
                  sourceId: 'time-link-1',
                  sourceVersion: 1,
                  snapshots: [],
                }),
              )
              .digest('hex'),
            now,
          ),
      );

      const result = service.createCanonicalRevision(
        principal,
        input({
          idempotencyKey: 'test:accounting-pack:null-linkage-allocation',
          sourceItems: [
            ...(input().sourceItems as readonly Record<string, unknown>[]),
            {
              id: 'source-time-link-1',
              itemKind: 'time',
              sourceId: 'time-link-1',
              itemVersion: 1,
              effectiveAt: '2026-01-09T00:00:00.000Z',
              evidenceType: 'finance_change_event',
              evidenceId: 'time-link-evidence-1',
              amountMinor: null,
              currency: 'EUR',
            },
            {
              id: 'source-link-1',
              itemKind: 'invoice_source',
              sourceId: 'invoice-1:time:time-link-1',
              itemVersion: 1,
              effectiveAt: '2026-01-09T00:00:00.000Z',
              evidenceType: 'invoice_source',
              evidenceId: 'source-link-evidence-1',
              amountMinor: null,
              currency: 'EUR',
            },
            {
              id: 'manifest-source-link-1',
              itemKind: 'commercial_manifest',
              sourceId: 'invoice-1:time:time-link-1',
              itemVersion: 1,
              effectiveAt: '2026-01-09T00:00:00.000Z',
              evidenceType: 'observed_invoice_manifest',
              evidenceId: 'manifest-source-link-evidence-1',
              amountMinor: null,
              currency: 'EUR',
            },
          ],
          sourceItemCount: 4,
          invoiceSourceCount: 1,
          approvedTimeEntryCount: 1,
        }),
      );

      expect(result.revisionId).toMatch(/^fp-accounting-pack-revision-/u);
    } finally {
      sqlite.close();
    }
  });

  it('rejects caller-forged source amounts even when its snapshot equations balance', () => {
    const { sqlite, service, principal } = fixture();
    try {
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:forged-balanced-totals',
            sourceItems: [
              {
                id: 'source-forged-balanced',
                itemKind: 'invoice',
                sourceId: 'invoice-1',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'invoice-source-forged-balanced',
                amountMinor: 900,
                currency: 'EUR',
              },
            ],
            netMinor: 900,
            taxMinor: 180,
            grossMinor: 1080,
            outstandingMinor: 1080,
            contributionMinor: 600,
          }),
        ),
      ).toThrow(/amount_mismatch/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('binds every declared source effectiveAt to its authoritative business date or instant', () => {
    const { sqlite, service, principal } = fixture();
    try {
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:forged-source-effective-at',
            sourceItems: [
              {
                ...(input().sourceItems as readonly Record<string, unknown>[])[0],
                effectiveAt: '2026-01-11T00:00:00.000Z',
              },
            ],
          }),
        ),
      ).toThrow(/invoice:invoice-1:effective_at_mismatch/u);
    } finally {
      sqlite.close();
    }
  });

  it('requires locked, hashed invoice sources and validates their operational version', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-09T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-link','Worker Link','worker-link@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO time_entry(
             id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
             created_at,updated_at,version
           ) VALUES('time-link-invalid','project-1','worker-link','2026-01-09','regular',60,
                    'approved','billable',?,?,1)`,
        )
        .run(now, now);
      seedLegacyFinalizedInvoiceChild(sqlite, 'invoice_source', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_source(
             source_link_id,invoice_id,source_type,source_id,source_version,
             allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at
           ) VALUES('link-invalid-authority','invoice-1','time','time-link-invalid',2,10,2,12,?)`,
          )
          .run(now),
      );

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:invalid-invoice-source-authority',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-link-invalid-authority',
                itemKind: 'invoice_source',
                sourceId: 'invoice-1:time:time-link-invalid',
                itemVersion: 2,
                effectiveAt: '2030-01-01T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'link-invalid-authority-evidence',
                amountMinor: 10,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            invoiceSourceCount: 1,
          }),
        ),
      ).toThrow(
        /invoice_source:.*(missing_locked_at|missing_source_hash|operational_version_mismatch|effective_at_mismatch)/u,
      );
    } finally {
      sqlite.close();
    }
  });

  it('requires commercial manifest hashes and issue-time locks', () => {
    const { sqlite, service, principal } = fixture();
    try {
      seedLegacyFinalizedInvoiceChild(sqlite, 'commercial_manifest', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_commercial_source_manifest(
             manifest_id,invoice_id,source_type,source_id,source_version,disposition,
             allocated_minor,reason_code,source_hash,created_at,locked_at
           ) VALUES('manifest-unlocked','invoice-1','fixed_price','fixed-unlocked',1,
                    'included',10,'fixed',NULL,'2026-01-10T00:00:00.000Z',NULL)`,
          )
          .run(),
      );
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:manifest-unlocked',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-manifest-unlocked',
                itemKind: 'commercial_manifest',
                sourceId: 'invoice-1:fixed_price:fixed-unlocked',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'manifest-unlocked-evidence',
                amountMinor: 10,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
          }),
        ),
      ).toThrow(/commercial_manifest:.*(missing_locked_at|missing_source_hash)/u);
    } finally {
      sqlite.close();
    }
  });

  it('uses the commercial source business date instead of manifest created_at', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const createdAt = '2026-01-20T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-manifest','Worker Manifest','worker-manifest@example.test','worker','active',1,?,?)`,
        )
        .run(createdAt, createdAt);
      sqlite
        .prepare(
          `INSERT INTO expense(
             id,project_id,worker_id,spent_on,category,currency,amount_minor,
             project_currency_amount_minor,client_treatment,approval_state,created_at,updated_at,version
           ) VALUES('expense-manifest-date','project-1','worker-manifest','2026-01-12','travel',
                    'EUR',10,10,'reimbursable','approved',?,?,1)`,
        )
        .run(createdAt, createdAt);
      seedLegacyFinalizedInvoiceChild(sqlite, 'invoice_line', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_line(
             id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,
             subtotal_minor,source_type,source_id,snapshot_json
           ) VALUES('line-manifest-business-date','invoice-1','Expense',1,1,10,10,
                    'expense','expense-manifest-date','{}')`,
          )
          .run(),
      );
      const canonicalManifestHash = createHash('sha256')
        .update(
          JSON.stringify({
            sourceType: 'expense',
            sourceId: 'expense-manifest-date',
            sourceVersion: 1,
            snapshots: ['{}'],
          }),
        )
        .digest('hex');
      seedLegacyFinalizedInvoiceChild(sqlite, 'commercial_manifest', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_commercial_source_manifest(
             manifest_id,invoice_id,source_type,source_id,source_version,disposition,
             allocated_minor,reason_code,source_hash,created_at,locked_at
           ) VALUES('manifest-business-date','invoice-1','expense','expense-manifest-date',1,
                    'included',10,'billable',?,?,
                    '2026-01-10T00:00:00.000Z')`,
          )
          .run(canonicalManifestHash, createdAt),
      );
      const canonicalExpenseSources = [
        {
          id: 'source-expense-manifest-date',
          itemKind: 'expense',
          sourceId: 'expense-manifest-date',
          itemVersion: 1,
          effectiveAt: '2026-01-12T00:00:00.000Z',
          evidenceType: 'finance_change_event',
          evidenceId: 'expense-manifest-date-evidence',
          amountMinor: 10,
          currency: 'EUR',
        },
        {
          id: 'source-direct-cost-manifest-date',
          itemKind: 'direct_cost',
          sourceId: 'expense:expense-manifest-date',
          itemVersion: 1,
          effectiveAt: '2026-01-12T00:00:00.000Z',
          evidenceType: 'direct_cost_event',
          evidenceId: 'direct-cost-manifest-date-evidence',
          amountMinor: 10,
          currency: 'EUR',
          payload: { expenseId: 'expense-manifest-date' },
        },
      ];
      const expenseTotals = {
        sourceItemCount: 4,
        expenseCount: 1,
        approvedExpenseCount: 1,
        expenseCostMinor: 10,
        directCostMinor: 10,
        contributionMinor: 990,
      };

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:manifest-business-date',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              ...canonicalExpenseSources,
              {
                id: 'source-manifest-business-date',
                itemKind: 'commercial_manifest',
                sourceId: 'invoice-1:expense:expense-manifest-date',
                itemVersion: 1,
                effectiveAt: createdAt,
                evidenceType: 'invoice_source',
                evidenceId: 'manifest-business-date-evidence',
                amountMinor: 10,
                currency: 'EUR',
              },
            ],
            ...expenseTotals,
          }),
        ),
      ).toThrow(/commercial_manifest:.*effective_at_mismatch/u);
      expect(
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:manifest-authoritative-business-date',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              ...canonicalExpenseSources,
              {
                id: 'source-manifest-authoritative-business-date',
                itemKind: 'commercial_manifest',
                sourceId: 'invoice-1:expense:expense-manifest-date',
                itemVersion: 1,
                effectiveAt: '2026-01-12T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'manifest-authoritative-business-date-evidence',
                amountMinor: 10,
                currency: 'EUR',
              },
            ],
            ...expenseTotals,
          }),
        ).revisionId,
      ).toMatch(/^fp-accounting-pack-revision-/u);
    } finally {
      sqlite.close();
    }
  });

  it('recomputes commercial source hashes from canonical invoice-line bytes', () => {
    const { sqlite, service, principal } = fixture();
    try {
      seedLegacyFinalizedInvoiceChild(sqlite, 'invoice_line', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_line(
             id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,
             subtotal_minor,source_type,source_id,snapshot_json
           ) VALUES('line-hash-forgery','invoice-1','Fixed fee',1,1,25,25,
                    'fixed_price','fixed-hash-forgery','{"basis":"canonical"}')`,
          )
          .run(),
      );
      seedLegacyFinalizedInvoiceChild(sqlite, 'commercial_manifest', () =>
        sqlite
          .prepare(
            `INSERT INTO invoice_commercial_source_manifest(
             manifest_id,invoice_id,source_type,source_id,source_version,disposition,
             original_minor,allocated_minor,remaining_minor,reason_code,source_hash,created_at,locked_at
           ) VALUES('manifest-hash-forgery','invoice-1','fixed_price','fixed-hash-forgery',1,
                    'included',25,25,0,'fixed_price_included',
                    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    '2026-01-10T00:00:00.000Z','2026-01-10T00:00:00.000Z')`,
          )
          .run(),
      );

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:forged-commercial-hash',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-hash-forgery',
                itemKind: 'commercial_manifest',
                sourceId: 'invoice-1:fixed_price:fixed-hash-forgery',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'observed_invoice_manifest',
                evidenceId: 'manifest-hash-forgery-evidence',
                amountMinor: 25,
                currency: 'EUR',
                payload: {
                  sourceHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
              },
            ],
            sourceItemCount: 2,
          }),
        ),
      ).toThrow(/commercial_manifest:.*source_hash_mismatch/u);
    } finally {
      sqlite.close();
    }
  });

  it('binds compensation settlements to the declared worker, project, period and final state', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-31T12:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-settlement','Worker Settlement','worker-settlement@example.test',
                  'worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO compensation_rule(
             id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,
             created_at,updated_at,version
           ) VALUES('rule-settlement','worker-settlement','project-1','EUR',100,'hourly',
                    '2026-01-01',?,?,1)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO compensation_settlement(
             id,worker_id,project_id,compensation_rule_id,period_start,period_end,
             source_basis,source_amount_minor,percentage_bps,amount_minor,currency,state,
             settled_at,created_at,updated_at
           ) VALUES('settlement-1','worker-settlement','project-1','rule-settlement',
                    '2026-01-01','2026-02-01','APPROVED_TIME',6000,NULL,10000,'EUR',
                    'estimated',?,?,?)`,
        )
        .run(now, now, now);
      const settlementSource = {
        id: 'source-settlement-1',
        itemKind: 'compensation_settlement',
        sourceId: 'settlement-1',
        itemVersion: 1,
        effectiveAt: '2026-02-01T00:00:00.000Z',
        evidenceType: 'settlement_revision',
        evidenceId: 'settlement-evidence-1',
        amountMinor: 10000,
        currency: 'EUR',
        payload: {
          worker_id: 'worker-settlement',
          project_id: 'project-1',
          period_start: '2026-01-01',
          period_end: '2026-02-01',
          state: 'estimated',
          compensation_rule_id: 'rule-settlement',
          rule_version: 1,
          currency: 'EUR',
          amount_minor: 10000,
          percentage_bps: null,
          source_basis: 'APPROVED_TIME',
          source_amount_minor: 6000,
        },
      };

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:unapproved-settlement',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              settlementSource,
            ],
            sourceItemCount: 2,
          }),
        ),
      ).toThrow(/compensation_settlement:settlement-1:settlement_not_approved/u);
      sqlite
        .prepare(
          "UPDATE compensation_settlement SET state='settled',settled_at=? WHERE id='settlement-1'",
        )
        .run(now);
      const finalSettlementSource = {
        ...settlementSource,
        payload: { ...settlementSource.payload, state: 'settled' },
      };

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:forged-settlement-binding',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                ...finalSettlementSource,
                payload: { ...finalSettlementSource.payload, worker_id: 'another-worker' },
              },
            ],
            sourceItemCount: 2,
          }),
        ),
      ).toThrow(/compensation_settlement:settlement-1:worker_id_mismatch/u);

      expect(
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:canonical-settlement-binding',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              finalSettlementSource,
            ],
            sourceItemCount: 2,
          }),
        ).revisionId,
      ).toMatch(/^fp-accounting-pack-revision-/u);
    } finally {
      sqlite.close();
    }
  });

  it('independently validates reversal causality, currency and cumulative payment capacity', () => {
    const scenarios = [
      {
        name: 'date',
        paymentAmount: 100,
        reversals: [
          { id: 'reversal-date', amount: 50, currency: 'EUR', at: '2026-01-14T00:00:00.000Z' },
        ],
        expected: /reversal_before_original_payment/u,
      },
      {
        name: 'currency',
        paymentAmount: 100,
        reversals: [
          { id: 'reversal-currency', amount: 50, currency: 'USD', at: '2026-01-16T00:00:00.000Z' },
        ],
        expected: /reversal_currency_mismatch/u,
      },
      {
        name: 'capacity',
        paymentAmount: 100,
        reversals: [
          {
            id: 'reversal-capacity-1',
            amount: 60,
            currency: 'EUR',
            at: '2026-01-16T00:00:00.000Z',
          },
          {
            id: 'reversal-capacity-2',
            amount: 50,
            currency: 'EUR',
            at: '2026-01-17T00:00:00.000Z',
          },
        ],
        expected: /cumulative_reversal_exceeds_original_payment/u,
      },
    ] as const;

    for (const scenario of scenarios) {
      const { sqlite, service, principal } = fixture();
      try {
        service.createCanonicalRevision(
          principal,
          input({ idempotencyKey: `test:accounting-pack:reversal-${scenario.name}:prerequisite` }),
        );
        const commands = sqlite
          .prepare('SELECT command_id FROM finance_command ORDER BY command_id')
          .all() as Array<{ command_id: string }>;
        sqlite
          .prepare(
            `INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,created_at)
             VALUES(?, 'invoice-1', ?, 'EUR', '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')`,
          )
          .run(`payment-${scenario.name}`, scenario.paymentAmount);
        scenario.reversals.forEach((reversal, index) => {
          sqlite
            .prepare(
              `INSERT INTO invoice_payment_reversal_event(
                 id,original_payment_id,invoice_id,currency,amount_minor,effective_at,reason_code,
                 actor_id,command_id,created_at,reversal_payload_hash,reversal_hash
               ) VALUES(?,?,'invoice-1',?,?,?,'correction','owner',?,?,?,?)`,
            )
            .run(
              reversal.id,
              `payment-${scenario.name}`,
              reversal.currency,
              reversal.amount,
              reversal.at,
              commands[index]!.command_id,
              reversal.at,
              `payload-${scenario.name}-${index}`,
              `hash-${scenario.name}-${index}`,
            );
        });
        const sourceItems = [
          ...(input().sourceItems as readonly Record<string, unknown>[]),
          {
            id: `source-payment-${scenario.name}`,
            itemKind: 'payment',
            sourceId: `payment-${scenario.name}`,
            itemVersion: 1,
            effectiveAt: '2026-01-15T00:00:00.000Z',
            evidenceType: 'payment_record',
            evidenceId: `payment-${scenario.name}-evidence`,
            amountMinor: scenario.paymentAmount,
            currency: 'EUR',
          },
          ...scenario.reversals.map((reversal) => ({
            id: `source-${reversal.id}`,
            itemKind: 'payment_reversal',
            sourceId: reversal.id,
            itemVersion: 1,
            effectiveAt: reversal.at,
            evidenceType: 'payment_reversal',
            evidenceId: `${reversal.id}-evidence`,
            amountMinor: reversal.amount,
            currency: 'EUR',
          })),
        ];
        const reversed = scenario.reversals.reduce((sum, row) => sum + row.amount, 0);
        expect(() =>
          service.createCanonicalRevision(
            principal,
            input({
              idempotencyKey: `test:accounting-pack:reversal-${scenario.name}`,
              sourceItems,
              sourceItemCount: sourceItems.length,
              paymentCount: 1 + scenario.reversals.length,
              collectedMinor: scenario.paymentAmount - reversed,
              outstandingMinor: 1200 - scenario.paymentAmount + reversed,
            }),
          ),
        ).toThrow(scenario.expected);
      } finally {
        sqlite.close();
      }
    }
  });

  it('canonicalizes source kinds and rejects a caller watermark that is not the database maximum', () => {
    const normalized = fixture();
    try {
      const result = normalized.service.createCanonicalRevision(
        normalized.principal,
        input({
          idempotencyKey: 'test:accounting-pack:normalized-source-kind',
          sourceItems: [
            {
              ...(input().sourceItems as readonly Record<string, unknown>[])[0],
              itemKind: 'INVOICE',
            },
          ],
        }),
      );
      expect(
        normalized.sqlite
          .prepare('SELECT item_kind FROM finance_source_cut_item WHERE cut_id=?')
          .get(result.sourceCutId),
      ).toEqual({ item_kind: 'invoice' });
    } finally {
      normalized.sqlite.close();
    }

    const watermark = fixture();
    try {
      const maximum = (
        watermark.sqlite
          .prepare('SELECT COALESCE(MAX(change_sequence),0) value FROM finance_change_event')
          .get() as { value: number }
      ).value;
      expect(() =>
        watermark.service.createCanonicalRevision(
          watermark.principal,
          input({
            changeSequenceHighWatermark: maximum + 1,
            idempotencyKey: 'test:accounting-pack:future-high-watermark',
          }),
        ),
      ).toThrow(/high watermark.*database maximum/i);
    } finally {
      watermark.sqlite.close();
    }
  });

  it('rejects a caller-supplied clean reconciliation when authoritative sources are omitted', () => {
    const { sqlite, service, principal } = fixture();
    try {
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:omitted-authoritative-sources',
            sourceItems: [],
            sourceItemCount: 0,
            reconciliationStatus: 'CLEAN',
            reconciliation: { reconciles: true },
          }),
        ),
      ).toThrow(/omitted_from_source_cut|does not match authoritative Accounting Pack sources/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects caller-supplied source categories whose IDs have no authoritative rows', () => {
    const { sqlite, service, principal } = fixture();
    try {
      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:complete-authoritative-sources',
            sourceItems: [
              {
                id: 'source-invoice-complete',
                itemKind: 'invoice',
                sourceId: 'invoice-1',
                itemVersion: 1,
                effectiveAt: '2026-01-10T00:00:00.000Z',
                evidenceType: 'invoice_source',
                evidenceId: 'invoice-complete-evidence',
                amountMinor: 1000,
                currency: 'EUR',
              },
              {
                id: 'source-expense-complete',
                itemKind: 'expense',
                sourceId: 'expense-1',
                itemVersion: 1,
                effectiveAt: '2026-01-12T00:00:00.000Z',
                evidenceType: 'finance_change_event',
                evidenceId: 'expense-complete-evidence',
                amountMinor: 100,
                currency: 'EUR',
              },
              {
                id: 'source-compensation-complete',
                itemKind: 'compensation',
                sourceId: 'worker-1:project-1',
                itemVersion: 1,
                effectiveAt: '2026-01-31T00:00:00.000Z',
                evidenceType: 'settlement_revision',
                evidenceId: 'compensation-complete-evidence',
                amountMinor: 200,
                currency: 'EUR',
              },
              {
                id: 'source-direct-cost-complete',
                itemKind: 'direct_cost',
                sourceId: 'labor:worker-1:project-1',
                itemVersion: 1,
                effectiveAt: '2026-01-31T00:00:00.000Z',
                evidenceType: 'direct_cost_event',
                evidenceId: 'direct-cost-complete-evidence',
                amountMinor: 200,
                currency: 'EUR',
              },
            ],
            invoiceRegister: [{ invoiceId: 'invoice-1', currency: 'EUR', netMinor: '1000' }],
            collections: [],
            workerCosts: [
              {
                workerId: 'worker-1',
                projectId: 'project-1',
                currency: 'EUR',
                internalLoadedLaborCostMinor: '200',
              },
            ],
            expenseRegister: [
              {
                expenseId: 'expense-1',
                currency: 'EUR',
                projectCurrency: 'EUR',
                projectCurrencyAmountMinor: '100',
              },
            ],
            invoiceCount: 1,
            paymentCount: 0,
            workerCostCount: 1,
            expenseCount: 1,
            sourceItemCount: 4,
            invoiceSourceCount: 0,
            approvedTimeEntryCount: 0,
            approvedExpenseCount: 1,
            reconciliationStatus: 'CLEAN',
            reconciliation: { reconciles: true },
            reconciliationChecks: {
              invoiceSources: false,
              payments: false,
              workerCosts: false,
              expenses: false,
              directCosts: false,
              contribution: false,
            },
          }),
        ),
      ).toThrow(/missing_authoritative_row/u);
      expect(
        (sqlite.prepare('SELECT count(*) count FROM finance_command').get() as { count: number })
          .count,
      ).toBe(0);
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

  it('rejects an operational source from another same-currency legal entity', () => {
    const { sqlite, service, principal } = fixture();
    try {
      const now = '2026-01-09T00:00:00.000Z';
      sqlite
        .prepare(
          `INSERT INTO legal_entity(
             id,code,legal_name,currency,billing_address,company_identifiers,status,
             created_at,updated_at,version
           ) VALUES('legacy-eur-other','LE-EUR-OTHER','Other EUR Entity','EUR','Address',
                    'TAX-EUR-OTHER','active',?,?,1)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO project(
             id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
           ) VALUES('project-eur-other','PROJECT-EUR-OTHER','client-1','Other Entity Project',
                    'Europe/Madrid','EUR','active','time_and_materials',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO billing_rule(
             id,project_id,legal_entity_id,stream_type,enabled,cadence_type,currency,
             auto_generate_draft,auto_issue,auto_send,effective_from,created_at,updated_at,version
           ) VALUES('billing-rule-eur-other','project-eur-other','legacy-eur-other','labor',1,
                    'monthly','EUR',0,0,0,'2026-01-01',?,?,1)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
           VALUES('worker-eur-other','Other Worker','other-worker@example.test','worker','active',1,?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO time_entry(
             id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,
             created_at,updated_at,version
           ) VALUES('time-eur-other','project-eur-other','worker-eur-other','2026-01-09','regular',
                    60,'approved','billable',?,?,1)`,
        )
        .run(now, now);

      expect(() =>
        service.createCanonicalRevision(
          principal,
          input({
            idempotencyKey: 'test:accounting-pack:cross-entity-operational-source',
            sourceItems: [
              ...(input().sourceItems as readonly Record<string, unknown>[]),
              {
                id: 'source-time-eur-other',
                itemKind: 'time',
                sourceId: 'time-eur-other',
                itemVersion: 1,
                effectiveAt: '2026-01-09T00:00:00.000Z',
                evidenceType: 'approved_time',
                evidenceId: 'time-eur-other-evidence',
                amountMinor: null,
                currency: 'EUR',
              },
            ],
            sourceItemCount: 2,
            approvedTimeEntryCount: 1,
          }),
        ),
      ).toThrow(/time:time-eur-other:project_legacy_legal_entity_mismatch/u);
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

  it('requires a valid unexpired human session step-up before any immutable write', () => {
    const { sqlite, service, basePrincipal, principal, sessionId } = fixture();
    try {
      expect(() => service.createCanonicalRevision(basePrincipal, input())).toThrow(
        /Recent step-up authentication is required/u,
      );

      sqlite
        .prepare('UPDATE session SET step_up_at=? WHERE id=?')
        .run(new Date(Date.now() - 10 * 60_000 - 1).toISOString(), sessionId);
      expect(() => service.createCanonicalRevision(principal, input())).not.toThrow();

      sqlite
        .prepare('UPDATE session SET expires_at=? WHERE id=?')
        .run(new Date(Date.now() - 1).toISOString(), sessionId);
      expect(() =>
        service.createCanonicalRevision(principal, {
          ...input(),
          periodStart: '2026-03-01',
          periodEnd: '2026-04-01',
        }),
      ).toThrow(/Recent step-up authentication is required/u);
    } finally {
      sqlite.close();
    }
  });

  it('keeps the same live-session proof when step_up_at later changes', () => {
    const { sqlite, service, principal, sessionId } = fixture();
    try {
      service.createCanonicalRevision(principal, input());
      const firstProof = sqlite
        .prepare(
          `SELECT request_hash,payload_hash,step_up_verified_at,step_up_expires_at
             FROM finance_command
            WHERE operation='accounting_pack_revision_snapshot.create'`,
        )
        .get() as Record<string, unknown>;

      sqlite
        .prepare('UPDATE session SET step_up_at=? WHERE id=?')
        .run(new Date(Date.now() - 1).toISOString(), sessionId);
      const replay = service.createCanonicalRevision(principal, input());
      expect(replay.idempotent).toBe(true);

      expect(
        sqlite
          .prepare(
            `SELECT request_hash,payload_hash,step_up_verified_at,step_up_expires_at
               FROM finance_command
              WHERE operation='accounting_pack_revision_snapshot.create'`,
          )
          .get(),
      ).toEqual(firstProof);
    } finally {
      sqlite.close();
    }
  });
});
