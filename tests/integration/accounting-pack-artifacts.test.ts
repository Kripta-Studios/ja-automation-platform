import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import { runArtifactJobs } from '@ja/reporting';
import {
  makeE2EFixturePointer,
  validateE2EFixturePointer,
  writeE2EFixturePointer,
} from '../e2e/environment.js';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const originalChromiumPath = process.env.JA_CHROMIUM_PATH;
const originalRequirePdf = process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
const restoreDeploymentIdentities: Array<() => void> = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  vi.useRealTimers();
  if (originalChromiumPath === undefined) delete process.env.JA_CHROMIUM_PATH;
  else process.env.JA_CHROMIUM_PATH = originalChromiumPath;
  if (originalRequirePdf === undefined) delete process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
  else process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = originalRequirePdf;
  for (const sqlite of databases.splice(0)) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function seedFinance(sqlite: ReturnType<typeof createDatabase>['sqlite']): Principal {
  const now = new Date().toISOString();
  const sessionId = 'finance-accounting-pack-session';
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('finance', 'Finance Test', 'finance@example.com', 'finance_admin', 'active', 1, now, now);
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(sessionId, `${sessionId}-token`, 'finance', expiresAt, now, now, now);
  return {
    userId: 'finance',
    role: 'finance_admin',
    projectIds: new Set(),
    sessionId,
  };
}

function seedLegalEntity(sqlite: ReturnType<typeof createDatabase>['sqlite']): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO legal_entity(
         id,code,legal_name,currency,billing_address,company_identifiers,status,
         created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,1)`,
    )
    .run('entity-eur', 'JAEU', 'J&A Europe', 'EUR', 'Address', 'TAX-EU', 'active', now, now);
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-artifacts-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  databases.push(sqlite);
  const principal = seedFinance(sqlite);
  seedB5ServiceActorBinding(sqlite, principal.userId);
  const v3 = new V3Repository(sqlite);
  return { directory, sqlite, principal, v3 };
}

function artifactContext(root: string, _principal: Principal, v3: V3Repository) {
  return {
    documentRoot: join(root, 'documents'),
    repository: { createInvoiceDraftFromJob: () => undefined },
    v3,
  };
}

describe('E2E fixture pointer ownership', () => {
  it('rejects stale/foreign pointers and refuses concurrent overwrite', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'ja-e2e-pointer-'));
    directories.push(fixtureRoot);
    const token = randomUUID();
    const now = Date.now();
    const pointer = makeE2EFixturePointer({
      token,
      fixtureRoot,
      createdAt: new Date(now).toISOString(),
      ownerPid: process.pid,
    });
    mkdirSync(pointer.documentRoot, { recursive: true });
    writeFileSync(pointer.databasePath, 'disposable fixture', 'utf8');

    expect(
      validateE2EFixturePointer(pointer, { expectedToken: token, fixtureRoot, now }),
    ).toMatchObject({ runToken: token, databasePath: pointer.databasePath });
    expect(() =>
      validateE2EFixturePointer(
        { ...pointer, createdAt: new Date(now - 2 * 60 * 60 * 1000 - 1).toISOString() },
        { expectedToken: token, fixtureRoot, now },
      ),
    ).toThrow(/stale/i);
    expect(() =>
      validateE2EFixturePointer(
        makeE2EFixturePointer({ token: randomUUID(), fixtureRoot, createdAt: pointer.createdAt }),
        { expectedToken: token, fixtureRoot, now },
      ),
    ).toThrow(/another concurrent run/i);

    const pointerPath = join(fixtureRoot, 'fixture-pointer.json');
    writeE2EFixturePointer(pointer, pointerPath, { expectedToken: token, fixtureRoot, now });
    expect(() =>
      writeE2EFixturePointer(pointer, pointerPath, { expectedToken: token, fixtureRoot, now }),
    ).toThrow(/EEXIST|already exists/i);
  });
});

/**
 * Run the real durable artifact runner in a worker so the test can observe the committed
 * `running` lease while the test-owned snapshot barrier holds the handler. There is no public
 * pause/barrier API in production, so this fixture supplies the smallest deterministic seam
 * without changing the production runner or its state transitions.
 */
async function runWithRunningBarrier(
  directory: string,
  onRunning: () => void,
): Promise<{ processed: number; failed: number }> {
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { createDatabase, V3Repository } = await import('@ja/database');
      const { runArtifactJobs } = await import('@ja/reporting');
      const database = createDatabase(workerData.databasePath);
      const v3 = new V3Repository(database.sqlite);
      const barrierV3 = Object.create(v3);
      barrierV3.accountingPackSnapshotFromJob = (packId, execution) => {
        parentPort.postMessage({ kind: 'running', packId });
        Atomics.wait(new Int32Array(workerData.shared), 0, 0);
        return v3.accountingPackSnapshotFromJob(packId, execution);
      };
      try {
        const result = runArtifactJobs({
          documentRoot: workerData.documentRoot,
          repository: { createInvoiceDraftFromJob: () => undefined },
          v3: barrierV3,
        });
        parentPort.postMessage({ kind: 'done', result });
      } finally {
        database.sqlite.close();
      }
    })().catch((error) => {
      parentPort.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    });
  `;
  const worker = new Worker(source, {
    eval: true,
    execArgv: ['--experimental-strip-types'],
    workerData: {
      databasePath: join(directory, 'app.db'),
      documentRoot: join(directory, 'documents'),
      shared,
    },
  });
  const release = new Int32Array(shared);
  return await new Promise((resolve, reject) => {
    let released = false;
    let finishing = false;
    const releaseBarrier = (): void => {
      if (released) return;
      released = true;
      Atomics.store(release, 0, 1);
      Atomics.notify(release, 0);
    };
    // `worker.terminate()` resolves only after the worker has emitted `exit`. Await it before
    // resolving this helper so afterEach cannot race a still-open SQLite handle on Windows.
    const terminateThen = (callback: () => void): void => {
      if (finishing) return;
      finishing = true;
      void worker.terminate().then(
        () => callback(),
        (error) => reject(error),
      );
    };
    worker.on(
      'message',
      (message: {
        kind: string;
        result?: { processed: number; failed: number };
        message?: string;
      }) => {
        if (message.kind === 'running') {
          try {
            onRunning();
            releaseBarrier();
          } catch (error) {
            releaseBarrier();
            terminateThen(() => reject(error));
          }
        } else if (message.kind === 'done' && message.result) {
          terminateThen(() => resolve(message.result!));
        } else if (message.kind === 'error') {
          releaseBarrier();
          terminateThen(() => reject(new Error(message.message ?? 'Artifact worker failed')));
        }
      },
    );
    worker.once('error', (error) => {
      releaseBarrier();
      terminateThen(() => reject(error));
    });
  });
}

describe('Accounting Pack artifact lifecycle', () => {
  it('requires a live session before creating any pack snapshot, job, or success audit', () => {
    const { sqlite, principal, v3 } = fixture();
    sqlite
      .prepare('UPDATE session SET expires_at=? WHERE id=?')
      .run(new Date(Date.now() - 1).toISOString(), principal.sessionId);

    expect(() => v3.createAccountingPack(principal, '2110-03-01', '2110-03-31')).toThrow(
      /step-up/i,
    );
    expect(sqlite.prepare('SELECT COUNT(*) count FROM accounting_pack_run').get()).toEqual({
      count: 0,
    });
    expect(
      sqlite
        .prepare("SELECT COUNT(*) count FROM job WHERE kind='accounting_pack_artifact_render'")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare("SELECT COUNT(*) count FROM audit_event WHERE action LIKE 'accounting_pack.%'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('keeps XLSX, both CSV registers and JSON available when the PDF renderer fails', () => {
    process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = 'true';
    // B5 retry scheduling is five minutes by contract. Advance this disposable test clock rather
    // than mutating a protected queued job row (queued -> queued is intentionally rejected by the
    // migration trigger), so each retry exercises the real claim/start/fail projection.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2110-01-01T00:00:00.000Z'));
    const { directory, sqlite, principal, v3 } = fixture();
    process.env.JA_CHROMIUM_PATH = join(directory, 'missing-chromium');
    const periodStart = '2110-01-01';
    const periodEnd = '2110-01-31';
    const pack = v3.createAccountingPack(principal, periodStart, periodEnd);

    const idempotencyKey = `accounting-pack:${pack.id}`;
    const result = runArtifactJobs(artifactContext(directory, principal, v3));
    expect(result).toMatchObject({ processed: 0, failed: 1 });
    const firstAttempt = sqlite
      .prepare(
        'SELECT state,attempts,run_after,last_error_code,active_job_run_id,fence_version FROM job WHERE idempotency_key=?',
      )
      .get(idempotencyKey) as { state: string; attempts: number; run_after: string } | undefined;
    // A retryable B5 failure projects the parent job back to `queued`; `pending` was the legacy
    // scheduler state and is intentionally not part of the current durable-job contract.
    expect(firstAttempt).toMatchObject({
      state: 'queued',
      attempts: 1,
      last_error_code: 'HANDLER_FAILED',
      active_job_run_id: null,
      fence_version: 1,
    });
    expect(firstAttempt?.run_after).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const firstFailure = sqlite
      .prepare(
        'SELECT state,outcome,error_code,finished_at,retry_run_after,fence_version FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?) ORDER BY started_at DESC,id DESC LIMIT 1',
      )
      .get(idempotencyKey) as
      | {
          state: string;
          outcome: string;
          error_code: string | null;
          finished_at: string | null;
          retry_run_after: string | null;
          fence_version: number;
        }
      | undefined;
    expect(firstFailure).toMatchObject({
      state: 'failed',
      outcome: 'retry_scheduled',
      error_code: 'HANDLER_FAILED',
      fence_version: 1,
    });
    expect(firstFailure?.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(firstFailure?.retry_run_after).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Advance only this disposable fixture's clock beyond the production retry delay so all five
    // attempts are observed in one deterministic test.
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1));
      expect(runArtifactJobs(artifactContext(directory, principal, v3))).toMatchObject({
        processed: 0,
        failed: 1,
      });
      const retry = sqlite
        .prepare(
          'SELECT state,attempts,last_error_code,active_job_run_id,fence_version FROM job WHERE idempotency_key=?',
        )
        .get(idempotencyKey) as { state: string; attempts: number } | undefined;
      expect(retry?.attempts).toBe(attempt);
      expect(retry).toMatchObject({
        state: attempt < 5 ? 'queued' : 'dead_letter',
        last_error_code: 'HANDLER_FAILED',
        active_job_run_id: attempt < 5 ? null : expect.any(String),
        fence_version: attempt,
      });
    }
    const terminal = sqlite
      .prepare('SELECT state,attempts FROM job WHERE idempotency_key=?')
      .get(idempotencyKey) as { state: string; attempts: number } | undefined;
    expect(terminal).toEqual({ state: 'dead_letter', attempts: 5 });
    const terminalFailure = sqlite
      .prepare(
        'SELECT state,outcome,error_code,finished_at,retry_run_after FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?) ORDER BY started_at DESC,id DESC LIMIT 1',
      )
      .get(idempotencyKey) as
      | {
          state: string;
          outcome: string;
          error_code: string | null;
          finished_at: string | null;
          retry_run_after: string | null;
        }
      | undefined;
    expect(terminalFailure).toMatchObject({
      state: 'failed',
      outcome: 'failed_terminal',
      error_code: 'HANDLER_FAILED',
      retry_run_after: null,
    });
    expect(terminalFailure?.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?)',
        )
        .get(idempotencyKey),
    ).toEqual({ count: 5 });

    const rows = sqlite
      .prepare(
        'SELECT export_type,storage_key,sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? ORDER BY export_type',
      )
      .all(pack.id) as Array<{
      export_type: string;
      storage_key: string;
      sha256: string;
      byte_length: number;
    }>;
    const readyTypes = rows.map((row) => row.export_type);
    const statusByFormat = Object.fromEntries(
      ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'].map((format) => [
        format,
        readyTypes.includes(format) ? 'ready' : 'failed',
      ]),
    );
    expect(statusByFormat).toEqual({
      pdf: 'failed',
      xlsx: 'ready',
      invoice_csv: 'ready',
      expense_csv: 'ready',
      json: 'ready',
    });
    const reconciliation = JSON.parse(
      (
        sqlite
          .prepare('SELECT reconciliation_json FROM accounting_pack_run WHERE id=?')
          .get(pack.id) as { reconciliation_json: string }
      ).reconciliation_json,
    ) as { _artifactFailures?: Record<string, { state: string; error: string }> };
    // The runner stores the normalized durable error code on job/job_run, while the pack keeps
    // the renderer's explicit format error for Finance diagnostics and retry decisions.
    expect(reconciliation._artifactFailures?.pdf).toMatchObject({ state: 'failed' });
    expect(reconciliation._artifactFailures?.pdf?.error).toMatch(
      /chromium|browser|pdf|executable|renderer/i,
    );
    for (const row of rows) {
      expect(row.export_type).not.toBe('pdf');
      const bytes = readFileSync(join(directory, 'documents', row.storage_key));
      expect(bytes.byteLength, `${row.export_type} byte count`).toBe(row.byte_length);
      expect(createHash('sha256').update(bytes).digest('hex'), `${row.export_type} sha256`).toBe(
        row.sha256,
      );
    }
  });

  it('exposes a deterministic running lease before the artifact handler completes', async () => {
    const { directory, sqlite, principal, v3 } = fixture();
    const pack = v3.createAccountingPack(principal, '2110-02-01', '2110-02-28');
    let observedPackId = '';
    const result = await runWithRunningBarrier(directory, () => {
      const job = sqlite
        .prepare(
          'SELECT id,state,attempts,lease_until,active_job_run_id,fence_version,last_error_code FROM job WHERE idempotency_key=?',
        )
        .get(`accounting-pack:${pack.id}`) as
        | {
            id: string;
            state: string;
            attempts: number;
            lease_until: string | null;
            active_job_run_id: string | null;
            fence_version: number;
            last_error_code: string | null;
          }
        | undefined;
      // `startJob` advances the linked run to `running`; the parent remains `claimed` until the
      // fenced terminal projection succeeds. This is the observable lease boundary.
      expect(job).toMatchObject({
        state: 'claimed',
        attempts: 1,
        active_job_run_id: expect.any(String),
        fence_version: 1,
        last_error_code: null,
      });
      expect(job?.lease_until).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      if (!job?.id) throw new Error('Running Accounting Pack job row is missing');
      if (!job.active_job_run_id) throw new Error('Running Accounting Pack job run is missing');
      const run = sqlite
        .prepare(
          'SELECT id,job_id,state,outcome,finished_at,error_code,fence_version,lease_until FROM job_run WHERE id=?',
        )
        .get(job.active_job_run_id) as
        | {
            id: string;
            job_id: string;
            state: string;
            outcome: string | null;
            finished_at: string | null;
            error_code: string | null;
            fence_version: number;
            lease_until: string | null;
          }
        | undefined;
      expect(run).toMatchObject({
        id: job.active_job_run_id,
        job_id: job.id,
        state: 'running',
        outcome: null,
        finished_at: null,
        error_code: null,
        fence_version: job.fence_version,
        lease_until: job.lease_until,
      });
      observedPackId = pack.id;
    });
    expect(observedPackId).toBe(pack.id);
    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(
      sqlite
        .prepare(
          'SELECT id,state,attempts,lease_until,active_job_run_id,fence_version,last_error_code FROM job WHERE idempotency_key=?',
        )
        .get(`accounting-pack:${pack.id}`),
    ).toMatchObject({
      state: 'succeeded',
      attempts: 1,
      lease_until: null,
      fence_version: 1,
      last_error_code: null,
    });
    const terminalRun = sqlite
      .prepare(
        'SELECT state,outcome,finished_at,error_code FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?)',
      )
      .get(`accounting-pack:${pack.id}`) as
      | { state: string; outcome: string; finished_at: string | null; error_code: string | null }
      | undefined;
    expect(terminalRun).toMatchObject({
      state: 'succeeded',
      outcome: 'succeeded',
      error_code: null,
    });
    expect(terminalRun?.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('starts a pack in a queued state and does not expose a ready artifact before processing', () => {
    const { sqlite, principal, v3 } = fixture();
    const pack = v3.createAccountingPack(principal, '2111-01-01', '2111-01-31');

    expect(pack.state).toBe('queued');
    expect(
      sqlite
        .prepare('SELECT state FROM job WHERE kind=? AND idempotency_key=?')
        .get('accounting_pack_artifact_render', `accounting-pack:${pack.id}`),
    ).toEqual({ state: 'queued' });
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM accounting_pack_export WHERE pack_run_id=?')
        .get(pack.id),
    ).toEqual({ count: 0 });
    expect(() => v3.accountingPackExport(principal, pack.id, 'xlsx')).toThrow(/not ready/i);
  });

  it('persists each ready format idempotently and uses a period-bearing filename', () => {
    const { directory, sqlite, principal, v3 } = fixture();
    const periodStart = '2112-02-01';
    const periodEnd = '2112-02-29';
    const pack = v3.createAccountingPack(principal, periodStart, periodEnd);
    const context = artifactContext(directory, principal, v3);

    expect(runArtifactJobs(context)).toMatchObject({ failed: 0 });
    const firstRows = sqlite
      .prepare(
        'SELECT id,export_type,storage_key,sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? ORDER BY export_type',
      )
      .all(pack.id) as Array<{
      id: string;
      export_type: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json';
      storage_key: string;
      sha256: string;
      byte_length: number;
    }>;
    expect(firstRows.map((row) => row.export_type)).toEqual([
      'expense_csv',
      'invoice_csv',
      'json',
      'pdf',
      'xlsx',
    ]);
    for (const row of firstRows) {
      const bytes = readFileSync(join(directory, 'documents', row.storage_key));
      expect(bytes.byteLength).toBe(row.byte_length);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
    }
    expect(
      sqlite
        .prepare('SELECT state,attempts FROM job WHERE idempotency_key=?')
        .get(`accounting-pack:${pack.id}`),
    ).toEqual({ state: 'succeeded', attempts: 1 });

    expect(runArtifactJobs(context)).toMatchObject({ processed: 0, failed: 0 });
    const secondRows = sqlite
      .prepare(
        'SELECT id,export_type,storage_key,sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? ORDER BY export_type',
      )
      .all(pack.id);
    expect(secondRows).toEqual(firstRows);
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM accounting_pack_export WHERE pack_run_id=?')
        .get(pack.id),
    ).toEqual({ count: 5 });
    const pdf = v3.accountingPackExport(principal, pack.id, 'pdf');
    expect(pdf.filename).toBe(`accounting-pack-${periodStart}-${periodEnd}-pdf.pdf`);
  });

  it('finalizes with required XLSX/CSV outputs when optional PDF and JSON are absent', () => {
    const { directory, sqlite, principal, v3 } = fixture();
    seedLegalEntity(sqlite);
    process.env.JA_CHROMIUM_PATH = join(directory, 'missing-chromium');
    delete process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
    delete process.env.JA_ACCOUNTING_PACK_REQUIRE_JSON;
    const pack = v3.createAccountingPack(principal, '2113-01-01', '2113-01-31');

    expect(runArtifactJobs(artifactContext(directory, principal, v3))).toMatchObject({
      processed: 1,
      failed: 0,
    });
    sqlite
      .prepare("DELETE FROM accounting_pack_export WHERE pack_run_id=? AND export_type='json'")
      .run(pack.id);
    expect(() => v3.markAccountingPackFinal(principal, pack.id)).not.toThrow();
    expect(sqlite.prepare('SELECT state FROM accounting_pack_run WHERE id=?').get(pack.id)).toEqual(
      { state: 'final' },
    );
  });

  it('rejects blocked reconciliation even when required artifacts are ready', () => {
    const { directory, sqlite, principal, v3 } = fixture();
    seedLegalEntity(sqlite);
    const pack = v3.createAccountingPack(principal, '2113-02-01', '2113-02-28');
    expect(runArtifactJobs(artifactContext(directory, principal, v3))).toMatchObject({ failed: 0 });
    const stored = sqlite
      .prepare('SELECT reconciliation_json FROM accounting_pack_run WHERE id=?')
      .get(pack.id) as { reconciliation_json: string };
    const reconciliation = JSON.parse(stored.reconciliation_json) as Record<string, unknown>;
    reconciliation.reconciles = false;
    sqlite
      .prepare('UPDATE accounting_pack_run SET reconciliation_json=? WHERE id=?')
      .run(JSON.stringify(reconciliation), pack.id);

    expect(() => v3.markAccountingPackFinal(principal, pack.id)).toThrow(
      /reconciliation is blocked/i,
    );
    expect(sqlite.prepare('SELECT state FROM accounting_pack_run WHERE id=?').get(pack.id)).toEqual(
      { state: 'draft' },
    );
  });

  it('blocks stale non-final bytes but preserves finalized historical downloads', () => {
    const first = fixture();
    seedLegalEntity(first.sqlite);
    const staleDraft = first.v3.createAccountingPack(first.principal, '2113-03-01', '2113-03-31');
    expect(
      runArtifactJobs(artifactContext(first.directory, first.principal, first.v3)),
    ).toMatchObject({
      failed: 0,
    });
    const sourceChangedAt = new Date().toISOString();
    first.sqlite
      .prepare(
        `INSERT INTO legal_entity(
           id,code,legal_name,currency,billing_address,company_identifiers,status,
           created_at,updated_at,version
         ) VALUES('entity-later','JALATER','Later Entity','EUR','Address','TAX-LATER','active',
                  ?,?,1)`,
      )
      .run(sourceChangedAt, sourceChangedAt);
    let staleDownloadError: unknown;
    try {
      first.v3.accountingPackExport(first.principal, staleDraft.id, 'xlsx');
    } catch (error) {
      staleDownloadError = error;
    }
    expect(String(staleDownloadError)).toMatch(/not ready/i);
    expect(String(staleDownloadError)).not.toMatch(/source changed/i);
    const refreshedRuns = first.sqlite
      .prepare(
        'SELECT id,state FROM accounting_pack_run WHERE period_start=? AND period_end=? ORDER BY created_at,id',
      )
      .all('2113-03-01', '2113-03-31') as Array<{ id: string; state: string }>;
    expect(refreshedRuns).toHaveLength(2);
    expect(refreshedRuns.some((row) => row.id === staleDraft.id)).toBe(true);
    expect(
      runArtifactJobs(artifactContext(first.directory, first.principal, first.v3)),
    ).toMatchObject({ failed: 0 });
    expect(
      first.v3.accountingPackExport(first.principal, staleDraft.id, 'xlsx').filename,
    ).toContain('2113-03-01');

    const second = fixture();
    seedLegalEntity(second.sqlite);
    const historical = second.v3.createAccountingPack(second.principal, '2113-04-01', '2113-04-30');
    expect(
      runArtifactJobs(artifactContext(second.directory, second.principal, second.v3)),
    ).toMatchObject({ failed: 0 });
    second.v3.markAccountingPackFinal(second.principal, historical.id);
    second.sqlite
      .prepare(
        `INSERT INTO legal_entity(
           id,code,legal_name,currency,billing_address,company_identifiers,status,
           created_at,updated_at,version
         ) VALUES('entity-later','JALATER','Later Entity','EUR','Address','TAX-LATER','active',
                  '2999-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z',1)`,
      )
      .run();
    expect(
      second.v3.accountingPackExport(second.principal, historical.id, 'xlsx').filename,
    ).toContain('2113-04-01');
  });

  it('retries only a failed format idempotently and preserves ready siblings', () => {
    const { directory, sqlite, principal, v3 } = fixture();
    process.env.JA_CHROMIUM_PATH = join(directory, 'missing-chromium');
    delete process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
    const pack = v3.createAccountingPack(principal, '2114-01-01', '2114-01-31');
    expect(runArtifactJobs(artifactContext(directory, principal, v3))).toMatchObject({
      processed: 1,
      failed: 0,
    });
    const siblings = sqlite
      .prepare(
        "SELECT id,export_type,sha256 FROM accounting_pack_export WHERE pack_run_id=? AND export_type<>'pdf' ORDER BY export_type",
      )
      .all(pack.id);

    sqlite
      .prepare('UPDATE session SET expires_at=? WHERE id=?')
      .run(new Date(Date.now() - 1).toISOString(), principal.sessionId);
    const jobsBeforeDeniedRetry = (
      sqlite
        .prepare("SELECT COUNT(*) count FROM job WHERE kind='accounting_pack_artifact_render'")
        .get() as { count: number }
    ).count;
    expect(() =>
      v3.retryAccountingPackExport(principal, pack.id, 'pdf', 'retry-without-live-session'),
    ).toThrow(/step-up/i);
    expect(
      (
        sqlite
          .prepare("SELECT COUNT(*) count FROM job WHERE kind='accounting_pack_artifact_render'")
          .get() as { count: number }
      ).count,
    ).toBe(jobsBeforeDeniedRetry);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='accounting_pack.export_retry'",
        )
        .get(),
    ).toEqual({ count: 0 });
    sqlite
      .prepare('UPDATE session SET expires_at=?,step_up_at=? WHERE id=?')
      .run(
        new Date(Date.now() + 3_600_000).toISOString(),
        new Date().toISOString(),
        principal.sessionId,
      );

    const first = v3.retryAccountingPackExport(principal, pack.id, 'pdf', 'retry-pdf-once');
    const replay = v3.retryAccountingPackExport(principal, pack.id, 'pdf', 'retry-pdf-once');
    expect(replay).toEqual({ ...first, created: false });
    expect(first).toMatchObject({ created: true, state: 'queued' });
    expect(
      sqlite
        .prepare(
          "SELECT action,json_extract(details_json,'$.exportType') export_type FROM audit_event WHERE entity_id=? AND action='accounting_pack.export_retry'",
        )
        .get(pack.id),
    ).toEqual({ action: 'accounting_pack.export_retry', export_type: 'pdf' });
    delete process.env.JA_CHROMIUM_PATH;
    expect(runArtifactJobs(artifactContext(directory, principal, v3))).toMatchObject({
      processed: 1,
      failed: 0,
    });
    expect(
      sqlite
        .prepare(
          "SELECT id,export_type,sha256 FROM accounting_pack_export WHERE pack_run_id=? AND export_type<>'pdf' ORDER BY export_type",
        )
        .all(pack.id),
    ).toEqual(siblings);
    expect(v3.accountingPackExport(principal, pack.id, 'pdf').filename).toContain('2114-01-01');
  });

  it('creates canonical revision metadata in the normal pack flow and replays unchanged input', () => {
    const { sqlite, principal, v3 } = fixture();
    seedLegalEntity(sqlite);
    const first = v3.createAccountingPack(principal, '2115-01-01', '2115-01-31');
    const second = v3.createAccountingPack(principal, '2115-01-01', '2115-01-31');
    expect(second.id).toBe(first.id);
    const reconciliation = second.reconciliation as {
      canonicalRevision: { status: string; revisions: Array<{ revisionId: string }> };
    };
    expect(reconciliation.canonicalRevision.status).toBe('current');
    expect(reconciliation.canonicalRevision.revisions).toHaveLength(1);
    expect(sqlite.prepare('SELECT count(*) count FROM accounting_pack_revision').get()).toEqual({
      count: 1,
    });
    sqlite
      .prepare(
        `INSERT INTO legal_entity(
           id,code,legal_name,currency,billing_address,company_identifiers,status,
           created_at,updated_at,version
         ) VALUES('entity-later','JALATER','Later Entity','USD','Address','TAX-LATER','active',
                  '2999-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z',1)`,
      )
      .run();
    const refreshed = v3.createAccountingPack(principal, '2115-01-01', '2115-01-31');
    expect(refreshed.id).not.toBe(first.id);
    expect(refreshed.state).toBe('queued');
    const refreshedReconciliation = refreshed.reconciliation as {
      canonicalRevision: { status: string; revisions: Array<{ revisionId: string }> };
    };
    expect(refreshedReconciliation.canonicalRevision.status).toBe('current');
    expect(refreshedReconciliation.canonicalRevision.revisions).toHaveLength(1);
    expect(refreshedReconciliation.canonicalRevision.revisions[0]?.revisionId).not.toBe(
      reconciliation.canonicalRevision.revisions[0]?.revisionId,
    );
    expect(sqlite.prepare('SELECT count(*) count FROM accounting_pack_revision').get()).toEqual({
      count: 2,
    });
    expect(
      sqlite
        .prepare(
          'SELECT id,state FROM accounting_pack_run WHERE period_start=? AND period_end=? ORDER BY created_at,id',
        )
        .all('2115-01-01', '2115-01-31'),
    ).toHaveLength(2);
  });

  it('schedules and executes fenced temporary-upload cleanup idempotently', () => {
    const { directory, sqlite, principal, v3 } = fixture();
    const reservation = v3.reserveUpload(principal, {
      originalFilename: 'abandoned.pdf',
      artifactType: 'report',
    });
    const target = join(directory, 'documents', reservation.storageKey);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, 'abandoned temporary upload');
    sqlite
      .prepare("UPDATE document SET updated_at='2000-01-01T00:00:00.000Z' WHERE id=?")
      .run(reservation.reservationId);

    v3.scheduleCoreJobs();
    v3.scheduleCoreJobs();
    expect(
      sqlite.prepare("SELECT count(*) count FROM job WHERE kind='temporary_upload_cleanup'").get(),
    ).toEqual({ count: 1 });
    const result = runArtifactJobs(artifactContext(directory, principal, v3));
    expect(result.failed).toBe(0);
    expect(
      sqlite.prepare('SELECT id FROM document WHERE id=?').get(reservation.reservationId),
    ).toBeUndefined();
    expect(existsSync(target)).toBe(false);
    expect(() =>
      v3.cleanupTemporaryUploadReservationsFromJob(
        {
          jobId: 'forged',
          runId: 'forged',
          tenantId: 'test-tenant',
          deploymentId: 'test-deployment',
          requiredCapability: 'storage.temporary.cleanup',
          fenceVersion: 1,
        },
        '2000-01-02T00:00:00.000Z',
        () => undefined,
      ),
    ).toThrow(/execution/i);
  });
});
