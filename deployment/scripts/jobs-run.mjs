import { createHmac } from 'node:crypto';
import { statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
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

function assertDiskReady() {
  const threshold = Number.parseInt(process.env.JA_MIN_FREE_BYTES ?? '1073741824', 10);
  const stats = statfsSync(root);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  log(freeBytes < threshold ? 'error' : 'info', 'disk.readiness', {
    freeBytes,
    minimumBytes: threshold,
  });
  if (freeBytes < threshold)
    throw new Error('Private document volume is below free-space threshold');
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
  v3.scheduleCoreJobs();
  const result = runArtifactJobs({ repository, v3, principal, documentRoot: root });
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
