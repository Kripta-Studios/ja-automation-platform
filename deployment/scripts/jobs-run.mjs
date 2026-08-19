import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import {
  accountingPackArtifacts,
  invoicePdf,
  periodReportPdf,
  REPORT_TEMPLATE_VERSION,
} from '@ja/reporting';
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

function safeKey(key) {
  if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').includes('..'))
    throw new Error('Unsafe artifact key');
}

function writeArtifact(key, bytes) {
  safeKey(key);
  const target = resolve(root, key);
  const relative = target.slice(root.length).replaceAll('\\', '/');
  if (!relative.startsWith('/') || relative.includes('/../'))
    throw new Error('Artifact path escaped private root');
  mkdirSync(dirname(target), { recursive: true });
  let persisted = bytes;
  try {
    writeFileSync(target, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    persisted = readFileSync(target);
  }
  return {
    sha256: createHash('sha256').update(persisted).digest('hex'),
    byteLength: persisted.byteLength,
  };
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
  const result = v3.runDueJobs(20, {
    invoice_pdf: (payload) => {
      const invoiceId = String(payload?.invoiceId ?? '');
      if (!invoiceId) throw new Error('Invoice PDF job has no invoice id');
      const snapshot = v3.invoiceSnapshot(principal, invoiceId);
      const bytes = invoicePdf(snapshot);
      const metadata = writeArtifact(`invoices/${invoiceId}/${REPORT_TEMPLATE_VERSION}.pdf`, bytes);
      v3.recordInvoicePdf(
        principal,
        invoiceId,
        `invoices/${invoiceId}/${REPORT_TEMPLATE_VERSION}.pdf`,
        metadata.sha256,
        metadata.byteLength,
      );
    },
    period_close_report: (payload) => {
      const projectId = String(payload?.projectId ?? '');
      const periodStart = String(payload?.periodStart ?? '');
      const periodEnd = String(payload?.periodEnd ?? '');
      if (!projectId || !periodStart || !periodEnd)
        throw new Error('Period report job has incomplete period data');
      const reports = v3.refreshPeriodReports(principal, { projectId, periodStart, periodEnd });
      for (const report of reports) {
        const bytes = periodReportPdf(report.snapshot);
        const key = `reports/${report.id}/${REPORT_TEMPLATE_VERSION}.pdf`;
        const metadata = writeArtifact(key, bytes);
        v3.recordPeriodReportPdf(principal, report.id, key, metadata.sha256, metadata.byteLength);
      }
    },
    auto_draft: (payload) => {
      const billingRuleId = String(payload?.billingRuleId ?? '');
      const periodStart = String(payload?.periodStart ?? '');
      const periodEnd = String(payload?.periodEnd ?? '');
      if (!billingRuleId || !periodStart || !periodEnd)
        throw new Error('Automatic draft job has incomplete period data');
      repository.createInvoiceDraft(principal, billingRuleId, periodStart, periodEnd);
    },
    accounting_pack: (payload) => {
      const packId = String(payload?.packId ?? '');
      if (!packId) throw new Error('Accounting Pack job has no pack id');
      const snapshot = v3.accountingPackSnapshot(principal, packId);
      const artifacts = accountingPackArtifacts({
        ...snapshot,
        invoiceRegister: snapshot.invoiceRegister ?? [],
        collections: snapshot.collections ?? [],
        workerCosts: snapshot.workerCosts ?? [],
        expenseRegister: snapshot.expenseRegister ?? [],
        totals: snapshot.totals ?? {},
      });
      for (const { type, extension, bytes } of artifacts) {
        const key = `accounting-packs/${packId}/${type}-${REPORT_TEMPLATE_VERSION}.${extension}`;
        const metadata = writeArtifact(key, bytes);
        v3.recordAccountingPackExport(
          principal,
          packId,
          type,
          key,
          metadata.sha256,
          metadata.byteLength,
        );
      }
    },
    document_scan: (payload) => {
      const documentId = String(payload?.documentId ?? '');
      if (!documentId) throw new Error('Document scan job has no document id');
      const result = process.env.JA_MALWARE_SCANNER_RESULT;
      if (result !== 'clean' && result !== 'rejected')
        throw new Error('Malware scanner decision is unavailable');
      v3.recordDocumentScan(
        principal,
        documentId,
        result,
        process.env.JA_MALWARE_SCANNER_PROVIDER ?? 'configured-scanner',
      );
    },
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
