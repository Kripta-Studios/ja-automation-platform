import type { Principal } from '@ja/domain';
import type { V3Repository } from '@ja/database';

/**
 * One open-balance rule for every money screen (audit 2026-11-22 T12): what the client still
 * owes on an invoice is its total, minus net payments, minus issued credit notes linked to it.
 * A credit note itself carries no balance (it is applied to its original invoice). The master
 * ledger computes it (`netOutstandingMinor`); the per-document `outstandingMinor` stays available
 * as `documentOutstandingMinor` for the accounting views that need the signed document value.
 */
export function withNetOutstanding<T extends Record<string, unknown>>(
  rows: readonly T[],
): Array<T & { outstandingMinor: string; documentOutstandingMinor: string }> {
  return rows.map((row) => ({
    ...row,
    documentOutstandingMinor: String(row.outstandingMinor ?? '0'),
    outstandingMinor: String(row.netOutstandingMinor ?? row.outstandingMinor ?? '0'),
  }));
}

/** Net open balance per issued invoice id (finance roles only: the ledger asserts it). */
export function netOutstandingByInvoice(
  v3: V3Repository,
  principal: Principal,
  filters: Parameters<V3Repository['masterLedger']>[1] = {},
): Map<string, bigint> {
  return new Map(
    v3
      .masterLedger(principal, filters)
      .map((row) => [String(row.invoiceId), BigInt(String(row.netOutstandingMinor ?? '0'))]),
  );
}

/** Balance for list rows that come from listInvoices: unissued drafts are not in the ledger. */
export function invoiceOpenBalance(
  invoice: Readonly<{ id: unknown }>,
  net: ReadonlyMap<string, bigint>,
): bigint {
  return net.get(String(invoice.id)) ?? 0n;
}
