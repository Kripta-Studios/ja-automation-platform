import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { ConflictError, ValidationError } from '../../repository.ts';
import { OwnerRecordManagement } from './owner-record-management.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { recordAuditEvent } from '../../core/audit.ts';

/** Discard only unissued invoices, releasing their source reservations atomically. */
export function discardOwnerInvoice(
  sqlite: DatabaseSync,
  principal: Principal,
  id: string,
  reason: string,
  expectedVersion?: number,
) {
  return runImmediateTransaction(sqlite, 'owner-invoice-management', () => {
    new OwnerRecordManagement(sqlite).assertOwner(principal);
    if (reason.trim().length < 3 || reason.length > 2000)
      throw new ValidationError('A deletion reason is required');
    const invoice = sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(id);
    if (!invoice) throw new ValidationError('Invoice not found');
    if (
      expectedVersion !== undefined &&
      (!Number.isSafeInteger(expectedVersion) || expectedVersion !== invoice.version)
    )
      throw new ConflictError('Invoice changed. Reload before deleting.');
    if (
      !['draft', 'approved'].includes(String(invoice.state)) ||
      invoice.issued_at ||
      invoice.source_lock_at ||
      invoice.invoice_number
    )
      throw new ConflictError('Issued invoices require a void or adjustment');
    if (
      sqlite
        .prepare("SELECT 1 FROM localized_pdf_variant WHERE owner_type='invoice' AND owner_id=?")
        .get(id)
    )
      throw new ConflictError(
        'This invoice has a versioned PDF. Retain it and create a replacement.',
      );
    if (
      sqlite
        .prepare(
          'SELECT 1 FROM invoice_adjustment WHERE original_invoice_id=? OR adjustment_invoice_id=?',
        )
        .get(id, id) ||
      sqlite.prepare('SELECT 1 FROM payment WHERE invoice_id=?').get(id)
    )
      throw new ConflictError('This invoice has adjustments or payments');
    const sources = sqlite.prepare('SELECT * FROM invoice_source WHERE invoice_id=?').all(id);
    const lines = sqlite.prepare('SELECT * FROM invoice_line WHERE invoice_id=?').all(id);
    const manifest = sqlite
      .prepare('SELECT * FROM invoice_commercial_source_manifest WHERE invoice_id=?')
      .all(id);
    if (sources.some((row) => row.locked_at) || manifest.some((row) => row.locked_at))
      throw new ConflictError('Invoice sources are finalized');
    const locks = sqlite
      .prepare(
        'SELECT * FROM billing_lock WHERE project_id=? AND stream_type=? AND period_start=? AND period_end=?',
      )
      .all(invoice.project_id!, invoice.stream_type!, invoice.period_start!, invoice.period_end!);
    if (
      locks.length &&
      sqlite
        .prepare(
          'SELECT 1 FROM invoice WHERE id<>? AND project_id=? AND stream_type=? AND period_start=? AND period_end=?',
        )
        .get(
          id,
          invoice.project_id!,
          invoice.stream_type!,
          invoice.period_start!,
          invoice.period_end!,
        )
    )
      throw new ConflictError('Another invoice shares this billing period');
    sqlite.prepare('DELETE FROM invoice_commercial_source_manifest WHERE invoice_id=?').run(id);
    sqlite.prepare('DELETE FROM invoice_source WHERE invoice_id=?').run(id);
    sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(id);
    sqlite.prepare('DELETE FROM invoice WHERE id=?').run(id);
    const unlocked: unknown[] = [];
    for (const lock of locks) {
      for (const table of ['time_entry', 'expense'] as const) {
        const rows = sqlite
          .prepare(`SELECT * FROM ${table} WHERE billing_lock_id=? AND invoice_id IS NULL`)
          .all(lock.id!);
        unlocked.push(...rows);
        const reset =
          table === 'time_entry'
            ? "billing_status='unlocked',locked_at=NULL,locked_by=NULL"
            : "billing_state='unlocked'";
        sqlite
          .prepare(
            `UPDATE ${table} SET ${reset},billing_lock_id=NULL,updated_at=?,version=version+1 WHERE billing_lock_id=? AND invoice_id IS NULL`,
          )
          .run(new Date().toISOString(), lock.id!);
      }
      sqlite.prepare('DELETE FROM billing_lock WHERE id=?').run(lock.id!);
    }
    if (invoice.billing_rule_id)
      sqlite
        .prepare(
          "UPDATE billing_period SET state='ready',closed_at=NULL,updated_at=?,version=version+1 WHERE billing_rule_id=? AND period_start=? AND period_end=?",
        )
        .run(
          new Date().toISOString(),
          invoice.billing_rule_id,
          invoice.period_start!,
          invoice.period_end!,
        );
    recordAuditEvent(sqlite, principal, 'invoice.delete_draft', 'invoice', id, {
      reason: reason.trim(),
      projectId: invoice.project_id,
      before: { invoice, lines, sources, manifest, locks, unlocked },
      after: null,
    });
  });
}
