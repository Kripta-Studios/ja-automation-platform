import type { DatabaseSync } from 'node:sqlite';

/**
 * Who holds each approved source right now: `"time:<id>"` / `"expense:<id>"` → invoice
 * state (an unissued draft, or a live invoice). Void, cancelled and superseded invoices
 * release their sources. One definition for Home and Money "Ready to invoice", so work
 * already sitting on a draft is shown as "in a draft" and never counted as ready twice.
 */
export function invoiceSourceHolders(
  sqlite: DatabaseSync,
  projectIds?: ReadonlySet<string>,
): Map<string, string> {
  const holders = new Map<string, string>();
  if (projectIds && projectIds.size === 0) return holders;
  for (const row of sqlite
    .prepare(
      `SELECT invoice.project_id projectId,source.source_type type,source.source_id id,invoice.state state
         FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
        WHERE invoice.state NOT IN ('void','cancelled','superseded')`,
    )
    .all() as Array<{ projectId: string; type: string; id: string; state: string }>)
    if (!projectIds || projectIds.has(row.projectId)) holders.set(`${row.type}:${row.id}`, row.state);
  return holders;
}
