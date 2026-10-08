/** Deliberate host maintenance for the user-authorized Owner approval policy.
 * HTTP reads/actions never invoke this command. Run with Node 24 transform-types.
 */
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync, openSync, closeSync, writeSync, fsyncSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ownerFinanceCatchupCandidates,
  acceptOwnerFinanceApproval,
} from '../../packages/database/src/domains/approval/owner-finance-approval.ts';
import { runImmediateTransaction } from '../../packages/database/src/core/transaction.ts';

const { values } = parseArgs({
  options: {
    database: { type: 'string' },
    release: { type: 'string' },
    'backup-manifest': { type: 'string' },
    receipt: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});
if (!values.database || !values.release || !/^[a-f0-9]{40}$/.test(values.release))
  throw new Error('Specify a database and a reviewed release commit');
let backupIdentity;
let backupSha;
if (values.apply) {
  if (process.getuid?.() !== 0)
    throw new Error('Application requires the authorized host administrator');
  if (!values['backup-manifest'] || !values.receipt)
    throw new Error('A verified fresh backup and a private receipt path are required');
  const path = resolve(values['backup-manifest']);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 3_600_000)
    throw new Error('Backup must be from this maintenance window');
  if (manifest.database.path !== 'database.db') throw new Error('Unexpected backup database path');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolve(dirname(path), 'database.db')))
    hash.update(chunk);
  if (hash.digest('hex') !== manifest.database.sha256)
    throw new Error('Backup database checksum mismatch');
  backupSha = manifest.database.sha256;
  const backup = new DatabaseSync(resolve(dirname(path), 'database.db'), { readOnly: true });
  try {
    backupIdentity = backup
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get();
  } finally {
    backup.close();
  }
}
const receiptFd = values.receipt ? openSync(resolve(values.receipt), 'wx', 0o600) : undefined;
function recordReceipt(result) {
  if (receiptFd === undefined) return;
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
  let offset = 0;
  while (offset < bytes.length)
    offset += writeSync(receiptFd, bytes, offset, bytes.length - offset, null);
  fsyncSync(receiptFd);
}
recordReceipt({ status: 'started', releaseCommit: values.release, dryRun: !values.apply });
let committed = false;
let lastResult;
const sqlite = new DatabaseSync(resolve(values.database), { readOnly: !values.apply });
sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
try {
  const correlationId = randomUUID();
  const work = () => {
    const identity = sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get();
    if (
      values.apply &&
      (!identity ||
        !backupIdentity ||
        identity.tenant_id !== backupIdentity.tenant_id ||
        identity.deployment_id !== backupIdentity.deployment_id)
    )
      throw new Error('Backup and target deployment identities differ');
    const rows = ownerFinanceCatchupCandidates(sqlite);
    if (values.apply)
      for (const row of rows) {
        const accepted = acceptOwnerFinanceApproval(
          sqlite,
          { userId: row.approvedBy, correlationId },
          row.type,
          row.id,
          'policy_reconciliation',
          `deployment-policy:${values.release}`,
        );
        if (!accepted) throw new Error('Reconciliation source changed; transaction rolled back');
      }
    if (values.apply)
      for (const row of rows) {
        const stamp = sqlite
          .prepare(`SELECT finance_approved_by,finance_approved_at FROM ${row.type} WHERE id=?`)
          .get(row.id);
        const audits = sqlite
          .prepare(
            'SELECT actor_id,details_json FROM audit_event WHERE correlation_id=? AND entity_id=? AND action=?',
          )
          .all(
            correlationId,
            row.id,
            row.type === 'time_entry' ? 'time.finance_review' : 'expense.finance_approve',
          );
        if (
          stamp.finance_approved_by !== row.approvedBy ||
          !stamp.finance_approved_at ||
          audits.length !== 1 ||
          audits[0].actor_id !== row.approvedBy ||
          JSON.parse(audits[0].details_json).origin !== 'policy_reconciliation'
        )
          throw new Error('Reconciliation audit/stamp mismatch; transaction rolled back');
      }
    const result = {
      status: values.apply ? 'transaction_pending' : 'dry_run',
      identity,
      backupSha,
      policy: 'owner-combined-operational-finance-approval',
      dryRun: !values.apply,
      releaseCommit: values.release,
      correlationId,
      authorization: 'explicit-user-request-applied-by-host-administrator',
      recordedAt: new Date().toISOString(),
      backupManifest: values['backup-manifest'] ?? null,
      count: rows.length,
      rows,
    };
    lastResult = result;
    recordReceipt(result);
    return result;
  };
  const result = values.apply
    ? runImmediateTransaction(sqlite, 'OwnerApprovalPolicyMaintenance', work)
    : work();
  committed = Boolean(values.apply);
  recordReceipt({ ...result, status: committed ? 'committed' : 'dry_run' });
  console.log(
    JSON.stringify({
      dryRun: result.dryRun,
      count: result.count,
      correlationId,
      receipt: values.receipt ?? null,
    }),
  );
} catch (error) {
  try {
    recordReceipt({
      ...lastResult,
      status: committed ? 'committed_with_error' : 'rolled_back',
      releaseCommit: values.release,
      error: String(error),
    });
  } catch {
    // Preserve a prepared receipt if the filesystem fails after commit.
  }
  throw error;
} finally {
  sqlite.close();
  if (receiptFd !== undefined) closeSync(receiptFd);
}
