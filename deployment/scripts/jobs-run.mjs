import { createHash, createHmac } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  statfsSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  createDatabase,
  LocalizedPdfRepository,
  PortalRepository,
  V3Repository,
  WorkerStatementRepository,
} from '@ja/database';
import { resolveConfiguredServiceActor } from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import { runArtifactJobs } from '@ja/reporting';
import { sendOperationalAlert } from './alerts.mjs';

const root = resolve(process.env.JA_DOCUMENT_ROOT ?? '/var/lib/jaautomation/files');
const databasePath =
  process.env.JA_DATABASE_PATH ?? '/var/lib/jaautomation/data/jaautomation.sqlite';

function log(level, event, fields = {}) {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      service: 'jaautomation-jobs',
      ...fields,
    })}\n`,
  );
}

function diagnosticError(error) {
  let message = error instanceof Error ? error.message : 'unknown error';
  for (const [name, value] of Object.entries(process.env)) {
    if (!/(?:SECRET|PASSWORD|TOKEN|PRIVATE|SSH_KEY|ENCRYPTION_KEY)/u.test(name)) continue;
    if (typeof value === 'string' && value.length > 0)
      message = message.replaceAll(value, '[REDACTED]');
  }
  return message || 'unknown error';
}

function minimumFreeBytes() {
  const configured = process.env.JA_MIN_FREE_BYTES ?? '1073741824';
  if (!/^(?:0|[1-9]\d*)$/.test(configured))
    throw new Error('JA_MIN_FREE_BYTES must be a non-negative integer');
  const threshold = Number(configured);
  if (!Number.isSafeInteger(threshold)) throw new Error('JA_MIN_FREE_BYTES must be a safe integer');
  return threshold;
}

function assertDiskReady() {
  const threshold = minimumFreeBytes();
  const stats = statfsSync(root);
  const freeBytesBig = BigInt(stats.bavail) * BigInt(stats.bsize);
  const freeBytes = Number(
    freeBytesBig > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : freeBytesBig,
  );
  log(freeBytes < threshold ? 'error' : 'info', 'disk.readiness', {
    freeBytes,
    minimumBytes: threshold,
  });
  if (freeBytesBig < BigInt(threshold))
    throw new Error('Private document volume is below free-space threshold');
}

function assertNoSymlinkParents(rootPath, directory) {
  const rootResolved = resolve(rootPath);
  const directoryResolved = resolve(directory);
  const relativeDirectory = relative(rootResolved, directoryResolved);
  if (
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error('Localized PDF path escaped private root');
  const rootStats = lstatSync(rootResolved);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('Localized PDF root must be a real directory');
  let cursor = rootResolved;
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, component);
    const stats = lstatSync(cursor);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error('Localized PDF parent must be a real directory');
  }
}

function readRegularFileNoFollow(path) {
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(path, fsConstants.O_RDONLY | noFollow);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new Error('Localized PDF destination is not a regular file');
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function pdfMagicValid(bytes) {
  if (bytes.byteLength < 8) return false;
  const header = bytes.subarray(0, 5).toString('ascii');
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 1024)).toString('latin1');
  return header === '%PDF-' && tail.includes('%%EOF');
}

function csvContentValid(bytes) {
  if (bytes.byteLength === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function verifyWorkerStatementStorage(storageKey, expected) {
  try {
    const target = resolve(root, storageKey);
    const relativeTarget = relative(root, target);
    if (
      !relativeTarget ||
      relativeTarget.split(/[\\/]/u).includes('..') ||
      relativeTarget.startsWith('\\') ||
      relativeTarget.startsWith('/')
    )
      return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
    assertNoSymlinkParents(root, dirname(target));
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink())
      return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
    const bytes = readRegularFileNoFollow(target);
    const mediaType =
      expected?.mediaType ?? (pdfMagicValid(bytes) ? 'application/pdf' : 'text/csv');
    const magicValid =
      mediaType === 'application/pdf' ? pdfMagicValid(bytes) : csvContentValid(bytes);
    return {
      exists: true,
      byteLength: bytes.byteLength,
      contentSha256: createHash('sha256').update(bytes).digest('hex'),
      mediaType,
      magicValid,
    };
  } catch {
    return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
  }
}

function workerStatementSchemaReady(sqlite) {
  const requiredTables = [
    'worker_statement_artifact',
    'worker_statement_artifact_attempt',
    'worker_statement_retry_decision',
    'worker_statement_integrity_incident',
  ];
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables
        .map(() => '?')
        .join(',')})`,
    )
    .all(...requiredTables)
    .map((row) => row.name);
  if (tables.length !== requiredTables.length) return false;
  const migration = sqlite
    .prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migration')
    .get();
  return Number(migration?.version ?? 0) >= 32;
}

function hasWorkerStatementJob(sqlite) {
  return Boolean(
    sqlite
      .prepare(
        "SELECT 1 FROM job WHERE kind='worker_statement_artifact_render' AND state IN ('queued','claimed','running') LIMIT 1",
      )
      .get(),
  );
}

function jobsLoopRequested() {
  return process.argv.includes('--loop') || process.env.JA_JOBS_LOOP === '1';
}

function pollIntervalMs() {
  const raw = process.env.JA_JOBS_POLL_MS ?? '5000';
  if (!/^(?:[1-9]\d{2,6})$/.test(raw))
    throw new Error('JA_JOBS_POLL_MS must be an integer from 100 to 9999999 milliseconds');
  const value = Number(raw);
  if (value < 1000) throw new Error('JA_JOBS_POLL_MS must be at least 1000 milliseconds');
  return value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function runCycle() {
  let sqlite;
  try {
    sqlite = createDatabase(databasePath).sqlite;
    assertDiskReady();
    // The singleton deployment binding is authoritative.  The former
    // JA_JOB_ACTOR_ID setting represented a human-table lookup and is retired;
    // fail closed rather than allowing an old deployment to select an actor by
    // environment configuration.
    if (process.env.JA_JOB_ACTOR_ID !== undefined)
      throw new Error('LEGACY_JOB_ACTOR_ID_UNSUPPORTED');
    const actor = resolveConfiguredServiceActor(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    const workerStatementReady = workerStatementSchemaReady(sqlite);
    if (!workerStatementReady && hasWorkerStatementJob(sqlite))
      throw new Error('WORKER_STATEMENT_SCHEMA_UNAVAILABLE: migration 0032 is required');
    const workerStatement = workerStatementReady
      ? new WorkerStatementRepository(sqlite, {
          verify: (storageKey, expected) => verifyWorkerStatementStorage(storageKey, expected),
        })
      : undefined;
    const localizedPdf = new LocalizedPdfRepository(sqlite, {
      verify: (storageKey) => {
        try {
          const target = resolve(root, storageKey);
          const relativeTarget = relative(root, target);
          if (
            !relativeTarget ||
            relativeTarget.split(/[\\/]/u).includes('..') ||
            relativeTarget.startsWith('\\') ||
            relativeTarget.startsWith('/')
          )
            return { exists: false, byteLength: null, contentSha256: null };
          assertNoSymlinkParents(root, dirname(target));
          const stat = lstatSync(target);
          if (!stat.isFile() || stat.isSymbolicLink())
            return { exists: false, byteLength: null, contentSha256: null };
          const bytes = readRegularFileNoFollow(target);
          const magicValid = pdfMagicValid(bytes);
          return {
            exists: true,
            byteLength: bytes.byteLength,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            mediaType: magicValid ? 'application/pdf' : 'application/octet-stream',
            magicValid,
          };
        } catch {
          return { exists: false, byteLength: null, contentSha256: null };
        }
      },
    });
    v3.scheduleCoreJobs();
    const result = runArtifactJobs({
      repository,
      v3,
      documentRoot: root,
      localizedPdf,
      workerStatement,
    });
    const webhookUrl = process.env.JA_OUTBOX_WEBHOOK_URL;
    const webhookSecret = process.env.JA_OUTBOX_WEBHOOK_SECRET;
    const pendingOutbox = Number(
      sqlite
        .prepare(
          'SELECT COUNT(*) count FROM outbox_event WHERE delivered_at IS NULL AND failed_at IS NULL',
        )
        .get()?.count ?? 0,
    );
    if (pendingOutbox > 0 && (!webhookUrl || !webhookSecret))
      log('warn', 'outbox.deferred.configuration_missing', { pending: pendingOutbox });
    const outbox =
      !webhookUrl || !webhookSecret
        ? { processed: 0, failed: 0, permanentlyFailed: 0, deferred: pendingOutbox }
        : await v3.runDueOutbox(20, async (event) => {
            if (process.env.NODE_ENV === 'production' && !webhookUrl.startsWith('https://'))
              throw new Error('Production outbox webhook must use HTTPS');
            let payload = event.payload;
            if (event.topic === 'public-inquiry.received') {
              const inquiryId = String(payload?.inquiryId ?? '');
              const inquiry = sqlite
                .prepare(
                  'SELECT id,kind,payload_json,source_hash,created_at FROM public_inquiry WHERE id=?',
                )
                .get(inquiryId);
              if (!inquiry) throw new Error('Public inquiry source is missing');
              payload = {
                ...payload,
                inquiry: {
                  ...inquiry,
                  payload: JSON.parse(inquiry.payload_json),
                },
              };
              delete payload.inquiry.payload_json;
            }
            const body = JSON.stringify({
              eventId: event.id,
              topic: event.topic,
              aggregateId: event.aggregateId,
              idempotencyKey: event.idempotencyKey,
              attempts: event.attempts,
              payload,
            });
            const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'user-agent': 'jaautomation-outbox/3',
                'x-ja-event-id': event.id,
                'x-ja-idempotency-key': event.idempotencyKey,
                'x-ja-signature': `sha256=${signature}`,
              },
              body,
              signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok) throw new Error(`Outbox webhook returned HTTP ${response.status}`);
          });
    const combined = { ...result, outbox };
    log(
      result.failed > 0 || outbox.failed > 0 || outbox.permanentlyFailed > 0 ? 'error' : 'info',
      'jobs.cycle',
      {
        ...combined,
        actorId: actor.id,
      },
    );
    if (result.failed > 0 || outbox.failed > 0 || outbox.permanentlyFailed > 0) {
      process.exitCode = 1;
      await sendOperationalAlert('jobs.cycle.failed', {
        actorId: actor.id,
        failedJobs: result.failed,
        failedOutbox: outbox.failed,
        permanentlyFailedOutbox: outbox.permanentlyFailed,
      }).catch((alertError) =>
        log('error', 'alerts.delivery.failed', {
          error: diagnosticError(alertError),
        }),
      );
    }
  } catch (error) {
    log('error', 'jobs.runner.error', {
      error: diagnosticError(error),
    });
    await sendOperationalAlert('jobs.runner.error', {
      error: diagnosticError(error),
    }).catch((alertError) =>
      log('error', 'alerts.delivery.failed', {
        error: diagnosticError(alertError),
      }),
    );
    process.exitCode = 1;
  } finally {
    try {
      sqlite?.close();
    } catch (error) {
      log('error', 'jobs.runner.close_failed', { error: diagnosticError(error) });
      process.exitCode = 1;
    }
  }
}

async function main() {
  if (!jobsLoopRequested()) {
    await runCycle();
    return;
  }

  const pollMs = pollIntervalMs();
  let stopping = false;
  const requestStop = () => {
    stopping = true;
  };
  process.on('SIGINT', requestStop);
  process.on('SIGTERM', requestStop);
  log('info', 'jobs.loop.start', { pollMs });
  while (!stopping) {
    process.exitCode = 0;
    await runCycle();
    if (stopping) break;
    await sleep(pollMs);
  }
  log('info', 'jobs.loop.stop', {});
}

await main();
