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
} from '@ja/database';
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

const database = createDatabase(databasePath);
const sqlite = database.sqlite;
try {
  assertDiskReady();
  const actorId = process.env.JA_JOB_ACTOR_ID;
  if (!actorId) throw new Error('JA_JOB_ACTOR_ID must name an active finance service actor');
  const actor = sqlite
    .prepare(
      "SELECT id,role FROM user WHERE id=? AND status='active' AND role IN ('owner_admin','finance_admin')",
    )
    .get(actorId);
  if (!actor) throw new Error('Configured JA_JOB_ACTOR_ID is not an active finance actor');
  const principal = {
    userId: actor.id,
    role: actor.role,
    projectIds: new Set(),
    isServiceActor: true,
  };
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
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
    principal,
    documentRoot: root,
    localizedPdf,
  });
  const webhookUrl = process.env.JA_OUTBOX_WEBHOOK_URL;
  const webhookSecret = process.env.JA_OUTBOX_WEBHOOK_SECRET;
  const outbox = await v3.runDueOutbox(20, async (event) => {
    if (!webhookUrl || !webhookSecret)
      throw new Error('JA_OUTBOX_WEBHOOK_URL and JA_OUTBOX_WEBHOOK_SECRET are required');
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
      actorId,
    },
  );
  if (result.failed > 0 || outbox.failed > 0 || outbox.permanentlyFailed > 0) {
    process.exitCode = 1;
    await sendOperationalAlert('jobs.cycle.failed', {
      actorId,
      failedJobs: result.failed,
      failedOutbox: outbox.failed,
      permanentlyFailedOutbox: outbox.permanentlyFailed,
    }).catch((alertError) =>
      log('error', 'alerts.delivery.failed', {
        error: alertError instanceof Error ? alertError.message : 'unknown error',
      }),
    );
  }
} catch (error) {
  log('error', 'jobs.runner.error', {
    error: error instanceof Error ? error.message : 'unknown error',
  });
  await sendOperationalAlert('jobs.runner.error', {
    error: error instanceof Error ? error.message : 'unknown error',
  }).catch((alertError) =>
    log('error', 'alerts.delivery.failed', {
      error: alertError instanceof Error ? alertError.message : 'unknown error',
    }),
  );
  process.exitCode = 1;
} finally {
  sqlite.close();
}
