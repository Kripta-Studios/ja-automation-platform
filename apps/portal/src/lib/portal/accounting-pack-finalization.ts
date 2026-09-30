type Reconciliation = Record<string, unknown>;

export function accountingPackFinalizationReadiness(reconciliation: Reconciliation): {
  ready: boolean;
  message: string;
} {
  const canonical = reconciliation.canonicalRevision;
  const revision =
    canonical && typeof canonical === 'object' && !Array.isArray(canonical)
      ? (canonical as Record<string, unknown>)
      : {};
  if (
    revision.status === 'current' &&
    Array.isArray(revision.revisions) &&
    revision.revisions.length > 0
  )
    return { ready: true, message: '' };

  const emptyPeriod = [
    'sourceItemCount',
    'invoiceSourceCount',
    'paymentCount',
    'approvedTimeEntryCount',
    'approvedExpenseCount',
  ].every((key) => reconciliation[key] === 0);
  if (revision.status === 'partial' && emptyPeriod)
    return {
      ready: false,
      message:
        'This empty period has no confirmed invoice issuer for its final version. You can still download formats marked Ready. Review invoice issuers or choose a period with issued invoices.',
    };
  if (revision.status === 'partial' || revision.status === 'unconfigured')
    return {
      ready: false,
      message:
        'This version has no confirmed invoice issuer for every currency. You can still download formats marked Ready. Ask an owner to review the invoice issuers before finalizing a new version.',
    };
  return {
    ready: false,
    message:
      'This version is not ready to be finalized. You can still download formats marked Ready. Review the source records and invoice issuer setup with an owner.',
  };
}
