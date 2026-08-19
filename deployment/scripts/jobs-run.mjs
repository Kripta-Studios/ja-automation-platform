import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import {
  accountingPackCsv,
  accountingPackPdf,
  accountingPackXlsx,
  invoicePdf,
  periodReportPdf,
  toCsv,
} from '@ja/reporting';

const root = resolve(process.env.JA_DOCUMENT_ROOT ?? '/var/lib/jaautomation/files');
const databasePath =
  process.env.JA_DATABASE_PATH ?? '/var/lib/jaautomation/data/jaautomation.sqlite';

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
  try {
    writeFileSync(target, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

function exportCell(value) {
  if (
    value === null ||
    value === undefined ||
    ['string', 'number', 'bigint', 'boolean'].includes(typeof value)
  )
    return value;
  return JSON.stringify(value);
}

function exportRows(rows) {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, exportCell(value)])),
  );
}

const database = createDatabase(databasePath);
const sqlite = database.sqlite;
try {
  const actorId = process.env.JA_JOB_ACTOR_ID;
  const actor = actorId
    ? sqlite
        .prepare(
          "SELECT id,role FROM user WHERE id=? AND status='active' AND role IN ('owner_admin','finance_admin')",
        )
        .get(actorId)
    : sqlite
        .prepare(
          "SELECT id,role FROM user WHERE status='active' AND role IN ('owner_admin','finance_admin') ORDER BY role='owner_admin' DESC,id LIMIT 1",
        )
        .get();
  if (!actor) throw new Error('No active finance job actor is configured');
  const principal = { userId: actor.id, role: actor.role, projectIds: new Set() };
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  v3.scheduleCoreJobs();
  const result = v3.runDueJobs(20, {
    invoice_pdf: (payload) => {
      const invoiceId = String(payload?.invoiceId ?? '');
      if (!invoiceId) throw new Error('Invoice PDF job has no invoice id');
      const snapshot = v3.invoiceSnapshot(principal, invoiceId);
      const bytes = invoicePdf(snapshot);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const metadata = writeArtifact(`invoices/${invoiceId}/${hash}.pdf`, bytes);
      v3.recordInvoicePdf(
        principal,
        invoiceId,
        `invoices/${invoiceId}/${hash}.pdf`,
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
        const hash = createHash('sha256').update(bytes).digest('hex');
        const key = `reports/${report.id}/${hash}.pdf`;
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
      const invoiceRegister = exportRows(snapshot.invoiceRegister ?? []);
      const collections = exportRows(snapshot.collections ?? []);
      const workerCosts = exportRows(snapshot.workerCosts ?? []);
      const expenseRegister = exportRows(snapshot.expenseRegister ?? []);
      const exportSnapshot = {
        ...snapshot,
        invoiceRegister,
        collections,
        workerCosts,
        expenseRegister,
      };
      const artifacts = [
        ['pdf', 'pdf', accountingPackPdf(exportSnapshot)],
        ['xlsx', 'xlsx', accountingPackXlsx(exportSnapshot)],
        ['invoice_csv', 'csv', accountingPackCsv(exportSnapshot)],
        ['expense_csv', 'csv', new TextEncoder().encode(toCsv(expenseRegister))],
        ['json', 'json', new TextEncoder().encode(JSON.stringify(exportSnapshot))],
      ];
      for (const [type, extension, bytes] of artifacts) {
        const hash = createHash('sha256').update(bytes).digest('hex');
        const key = `accounting-packs/${packId}/${type}-${hash}.${extension}`;
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
  process.stdout.write(`${JSON.stringify(combined)}\n`);
  if (result.failed > 0 || outbox.failed > 0 || outbox.permanentlyFailed > 0) process.exitCode = 1;
} finally {
  sqlite.close();
}
