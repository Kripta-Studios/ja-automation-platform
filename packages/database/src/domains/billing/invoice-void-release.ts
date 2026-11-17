import type { DatabaseSync } from 'node:sqlite';

type SourceLink = {
  source_link_id: string;
  invoice_id: string;
  invoice_line_id: string | null;
  source_type: 'time' | 'expense' | 'milestone';
  source_id: string;
  source_version: number | null;
  locked_at: string | null;
  source_hash: string | null;
  allocated_net_minor: number | bigint | null;
  allocated_tax_minor: number | bigint | null;
  allocated_gross_minor: number | bigint | null;
  created_at: string | null;
};

export type VoidSourceRelease = Readonly<{
  time: number;
  expense: number;
  milestone: number;
  locksReleased: number;
}>;

const RELEASABLE = "('time','expense','milestone')";

/**
 * Releases the billable sources of an invoice that was just voided, inside the caller's
 * transaction, so the corrected work can be invoiced again (replacement invoice).
 *
 * History stays intact: the void invoice keeps its frozen snapshot, lines and commercial
 * manifest, and every released source link is archived byte-for-byte in the append-only
 * `invoice_void_source_release` table before the live reservation is removed. A source can
 * therefore be reserved by at most one non-void invoice (enforced by the unique
 * `invoice_source(source_type,source_id)` constraint and the single `invoice_id` pointer).
 */
export function releaseVoidInvoiceSources(
  sqlite: DatabaseSync,
  input: Readonly<{
    invoiceId: string;
    voidEventId: string;
    actorId: string;
    releasedAt: string;
    newId: () => string;
  }>,
): VoidSourceRelease {
  const invoice = sqlite
    .prepare(
      'SELECT id,state,project_id,stream_type,period_start,period_end,billing_rule_id FROM invoice WHERE id=?',
    )
    .get(input.invoiceId) as
    | {
        id: string;
        state: string;
        project_id: string;
        stream_type: string;
        period_start: string | null;
        period_end: string | null;
        billing_rule_id: string | null;
      }
    | undefined;
  if (!invoice || invoice.state !== 'void') throw new Error('Void invoice required');
  const links = sqlite
    .prepare(
      `SELECT source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,locked_at,
              source_hash,allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at
         FROM invoice_source WHERE invoice_id=? AND source_type IN ${RELEASABLE}
        ORDER BY source_type,source_id`,
    )
    .all(input.invoiceId) as SourceLink[];
  const archive = sqlite.prepare(
    `INSERT INTO invoice_void_source_release(
       source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,locked_at,
       source_hash,allocated_net_minor,allocated_tax_minor,allocated_gross_minor,created_at,
       legacy_pointer,void_event_id,actor_id,released_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const archived = new Set<string>();
  for (const link of links) {
    archive.run(
      link.source_link_id,
      link.invoice_id,
      link.invoice_line_id,
      link.source_type,
      link.source_id,
      link.source_version,
      link.locked_at,
      link.source_hash,
      link.allocated_net_minor,
      link.allocated_tax_minor,
      link.allocated_gross_minor,
      link.created_at,
      0,
      input.voidEventId,
      input.actorId,
      input.releasedAt,
    );
    archived.add(`${link.source_type}:${link.source_id}`);
  }
  // Legacy rows may point at the invoice without a reservation link; archive the pointer too.
  const pointers = [
    ...(
      sqlite.prepare('SELECT id FROM time_entry WHERE invoice_id=?').all(input.invoiceId) as Array<{
        id: string;
      }>
    ).map((row) => ({ type: 'time' as const, id: row.id })),
    ...(
      sqlite.prepare('SELECT id FROM expense WHERE invoice_id=?').all(input.invoiceId) as Array<{
        id: string;
      }>
    ).map((row) => ({ type: 'expense' as const, id: row.id })),
    ...(
      sqlite
        .prepare('SELECT id FROM project_milestone WHERE invoice_id=?')
        .all(input.invoiceId) as Array<{ id: string }>
    ).map((row) => ({ type: 'milestone' as const, id: row.id })),
  ];
  for (const pointer of pointers) {
    if (archived.has(`${pointer.type}:${pointer.id}`)) continue;
    archive.run(
      `void-legacy-${input.newId()}`,
      input.invoiceId,
      null,
      pointer.type,
      pointer.id,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      input.voidEventId,
      input.actorId,
      input.releasedAt,
    );
  }
  sqlite
    .prepare(`DELETE FROM invoice_source WHERE invoice_id=? AND source_type IN ${RELEASABLE}`)
    .run(input.invoiceId);
  const at = input.releasedAt;
  const time = sqlite
    .prepare(
      `UPDATE time_entry SET invoice_id=NULL,billing_status='unlocked',locked_at=NULL,locked_by=NULL,
              billing_lock_id=NULL,updated_at=?,version=version+1 WHERE invoice_id=?`,
    )
    .run(at, input.invoiceId).changes;
  const expense = sqlite
    .prepare(
      `UPDATE expense SET invoice_id=NULL,billing_state='unlocked',billing_lock_id=NULL,updated_at=?,
              version=version+1 WHERE invoice_id=?`,
    )
    .run(at, input.invoiceId).changes;
  const milestone = sqlite
    .prepare(
      'UPDATE project_milestone SET invoice_id=NULL,updated_at=?,version=version+1 WHERE invoice_id=?',
    )
    .run(at, input.invoiceId).changes;
  // Sources held back by a PO cap on this invoice become billable again as well.
  const capBlocked = sqlite
    .prepare(
      `SELECT source_type,source_id FROM invoice_commercial_source_manifest
        WHERE invoice_id=? AND source_type IN ('time','expense')
          AND disposition IN ('partially_included','blocked')`,
    )
    .all(input.invoiceId) as Array<{ source_type: string; source_id: string }>;
  for (const source of capBlocked)
    sqlite
      .prepare(
        source.source_type === 'time'
          ? "UPDATE time_entry SET billing_status='unlocked',updated_at=?,version=version+1 WHERE id=? AND invoice_id IS NULL AND billing_status='cap_blocked'"
          : "UPDATE expense SET billing_state='unlocked',updated_at=?,version=version+1 WHERE id=? AND invoice_id IS NULL AND billing_state='cap_blocked'",
      )
      .run(at, source.source_id);
  // A closed billing period lock for exactly this invoice's period is released when no other
  // live invoice still uses that period.
  let locksReleased = 0;
  if (invoice.period_start && invoice.period_end) {
    const shared = sqlite
      .prepare(
        `SELECT 1 FROM invoice WHERE id<>? AND project_id=? AND stream_type=? AND period_start=? AND period_end=?
           AND state NOT IN ('void','superseded') LIMIT 1`,
      )
      .get(
        invoice.id,
        invoice.project_id,
        invoice.stream_type,
        invoice.period_start,
        invoice.period_end,
      );
    if (!shared) {
      const locks = sqlite
        .prepare(
          'SELECT id FROM billing_lock WHERE project_id=? AND stream_type=? AND period_start=? AND period_end=?',
        )
        .all(
          invoice.project_id,
          invoice.stream_type,
          invoice.period_start,
          invoice.period_end,
        ) as Array<{ id: string }>;
      for (const lock of locks) {
        sqlite
          .prepare(
            "UPDATE time_entry SET billing_status='unlocked',locked_at=NULL,locked_by=NULL,billing_lock_id=NULL,updated_at=?,version=version+1 WHERE billing_lock_id=? AND invoice_id IS NULL",
          )
          .run(at, lock.id);
        sqlite
          .prepare(
            "UPDATE expense SET billing_state='unlocked',billing_lock_id=NULL,updated_at=?,version=version+1 WHERE billing_lock_id=? AND invoice_id IS NULL",
          )
          .run(at, lock.id);
        sqlite.prepare('DELETE FROM billing_lock WHERE id=?').run(lock.id);
        locksReleased += 1;
      }
      if (invoice.billing_rule_id && locks.length)
        sqlite
          .prepare(
            "UPDATE billing_period SET state='ready',closed_at=NULL,updated_at=?,version=version+1 WHERE billing_rule_id=? AND period_start=? AND period_end=?",
          )
          .run(at, invoice.billing_rule_id, invoice.period_start, invoice.period_end);
    }
  }
  return { time: Number(time), expense: Number(expense), milestone: Number(milestone), locksReleased };
}
