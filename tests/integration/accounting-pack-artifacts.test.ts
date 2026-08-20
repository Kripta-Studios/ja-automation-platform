import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import { runArtifactJobs } from '@ja/reporting';
import {
  makeE2EFixturePointer,
  validateE2EFixturePointer,
  writeE2EFixturePointer,
} from '../e2e/environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const originalChromiumPath = process.env.JA_CHROMIUM_PATH;

afterEach(() => {
  if (originalChromiumPath === undefined) delete process.env.JA_CHROMIUM_PATH;
  else process.env.JA_CHROMIUM_PATH = originalChromiumPath;
  for (const sqlite of databases.splice(0)) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function seedFinance(sqlite: ReturnType<typeof createDatabase>['sqlite']): Principal {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('finance', 'Finance Test', 'finance@example.com', 'finance_admin', 'active', 1, now, now);
  return { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-artifacts-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  databases.push(sqlite);
  const principal = seedFinance(sqlite);
  const v3 = new V3Repository(sqlite);
  return { directory, sqlite, principal, v3 };
}

function artifactContext(root: string, principal: Principal, v3: V3Repository) {
  return {
    principal,
    documentRoot: join(root, 'documents'),
    repository: { createInvoiceDraft: () => undefined },
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
  principal: Principal,
  onRunning: () => void,
): Promise<{ processed: number; failed: number }> {
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { createDatabase, V3Repository } = await import('@ja/database');
      const { runArtifactJobs } = await import('@ja/reporting');
      const database = createDatabase(workerData.databasePath);
      const principal = workerData.principal;
      const v3 = new V3Repository(database.sqlite);
      const barrierV3 = Object.create(v3);
      barrierV3.accountingPackSnapshot = (actor, packId) => {
        parentPort.postMessage({ kind: 'running', packId });
        Atomics.wait(new Int32Array(workerData.shared), 0, 0);
        return v3.accountingPackSnapshot(actor, packId);
      };
      try {
        const result = runArtifactJobs({
          principal,
          documentRoot: workerData.documentRoot,
          repository: { createInvoiceDraft: () => undefined },
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
      principal,
      shared,
    },
  });
  const release = new Int32Array(shared);
  return await new Promise((resolve, reject) => {
    let released = false;
    const releaseBarrier = (): void => {
      if (released) return;
      released = true;
      Atomics.store(release, 0, 1);
      Atomics.notify(release, 0);
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
            reject(error);
          }
        } else if (message.kind === 'done' && message.result) {
          resolve(message.result);
          void worker.terminate();
        } else if (message.kind === 'error') {
          releaseBarrier();
          reject(new Error(message.message ?? 'Artifact worker failed'));
          void worker.terminate();
        }
      },
    );
    worker.once('error', (error) => {
      releaseBarrier();
      reject(error);
    });
  });
}

describe('Accounting Pack artifact lifecycle', () => {
  it('keeps XLSX, both CSV registers and JSON available when the PDF renderer fails', () => {
    const { directory, sqlite, principal, v3 } = fixture();
    process.env.JA_CHROMIUM_PATH = join(directory, 'missing-chromium');
    const periodStart = '2110-01-01';
    const periodEnd = '2110-01-31';
    const pack = v3.createAccountingPack(principal, periodStart, periodEnd);

    const idempotencyKey = `accounting-pack:${pack.id}`;
    const result = runArtifactJobs(artifactContext(directory, principal, v3));
    expect(result).toMatchObject({ processed: 0, failed: 1 });
    const firstAttempt = sqlite
      .prepare('SELECT state,attempts,run_after FROM job WHERE idempotency_key=?')
      .get(idempotencyKey) as { state: string; attempts: number; run_after: string } | undefined;
    expect(firstAttempt?.state).toBe('pending');
    expect(firstAttempt?.attempts).toBe(1);
    expect(firstAttempt?.run_after).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const firstFailure = sqlite
      .prepare(
        'SELECT outcome,error_code,finished_at FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?) ORDER BY started_at DESC LIMIT 1',
      )
      .get(idempotencyKey) as
      | { outcome: string; error_code: string | null; finished_at: string | null }
      | undefined;
    expect(firstFailure?.outcome).toBe('failure');
    expect(firstFailure?.error_code).toMatch(/chromium|browser|pdf|executable|renderer/i);
    expect(firstFailure?.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // The production retry delay is five minutes. Move only this disposable fixture's retry due
    // time back to the past so all five attempts are observed in one deterministic test.
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      sqlite
        .prepare('UPDATE job SET run_after=? WHERE idempotency_key=?')
        .run(new Date(0).toISOString(), idempotencyKey);
      expect(runArtifactJobs(artifactContext(directory, principal, v3))).toMatchObject({
        processed: 0,
        failed: 1,
      });
      const retry = sqlite
        .prepare('SELECT state,attempts FROM job WHERE idempotency_key=?')
        .get(idempotencyKey) as { state: string; attempts: number } | undefined;
      expect(retry?.attempts).toBe(attempt);
    }
    const terminal = sqlite
      .prepare('SELECT state,attempts FROM job WHERE idempotency_key=?')
      .get(idempotencyKey) as { state: string; attempts: number } | undefined;
    expect(terminal).toEqual({ state: 'failed', attempts: 5 });
    const terminalFailure = sqlite
      .prepare(
        'SELECT outcome,error_code,finished_at FROM job_run WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?) ORDER BY started_at DESC LIMIT 1',
      )
      .get(idempotencyKey) as
      | { outcome: string; error_code: string | null; finished_at: string | null }
      | undefined;
    expect(terminalFailure?.outcome).toBe('failure');
    expect(terminalFailure?.error_code).toMatch(/chromium|browser|pdf|executable|renderer/i);
    expect(terminalFailure?.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

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
    const result = await runWithRunningBarrier(directory, principal, () => {
      const job = sqlite
        .prepare('SELECT id,state,attempts,lease_until FROM job WHERE idempotency_key=?')
        .get(`accounting-pack:${pack.id}`) as
        | { id: string; state: string; attempts: number; lease_until: string | null }
        | undefined;
      expect(job?.state).toBe('running');
      expect(job?.attempts).toBe(1);
      expect(job?.lease_until).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      if (!job?.id) throw new Error('Running Accounting Pack job row is missing');
      const run = sqlite
        .prepare(
          'SELECT outcome,finished_at FROM job_run WHERE job_id=? ORDER BY started_at DESC LIMIT 1',
        )
        .get(job.id) as { outcome: string | null; finished_at: string | null } | undefined;
      expect(run).toEqual({ outcome: null, finished_at: null });
      observedPackId = pack.id;
    });
    expect(observedPackId).toBe(pack.id);
    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(
      sqlite
        .prepare('SELECT state FROM job WHERE idempotency_key=?')
        .get(`accounting-pack:${pack.id}`),
    ).toEqual({ state: 'complete' });
  });

  it('starts a pack in a queued state and does not expose a ready artifact before processing', () => {
    const { sqlite, principal, v3 } = fixture();
    const pack = v3.createAccountingPack(principal, '2111-01-01', '2111-01-31');

    expect(pack.state).toBe('queued');
    expect(
      sqlite
        .prepare('SELECT state FROM job WHERE kind=? AND idempotency_key=?')
        .get('accounting_pack', `accounting-pack:${pack.id}`),
    ).toEqual({ state: 'pending' });
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM accounting_pack_export WHERE pack_run_id=?')
        .get(pack.id),
    ).toEqual({ count: 0 });
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
        'SELECT export_type,storage_key,sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? ORDER BY export_type',
      )
      .all(pack.id) as Array<{
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

    expect(runArtifactJobs(context)).toMatchObject({ processed: 0, failed: 0 });
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM accounting_pack_export WHERE pack_run_id=?')
        .get(pack.id),
    ).toEqual({ count: 5 });
    const pdf = v3.accountingPackExport(principal, pack.id, 'pdf');
    expect(pdf.filename).toMatch(/2112-02/);
  });
});
