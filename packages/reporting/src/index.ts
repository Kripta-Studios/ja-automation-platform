export type Readiness = {
  state: 'ready' | 'incomplete' | 'blocked' | 'already_closed';
  reasons: readonly { code: string; sourceId?: string }[];
};

export {
  accountingPackArtifacts,
  accountingPackCsv,
  accountingPackPdf,
  accountingPackXlsx,
  invoicePdf,
  periodReportPdf,
  REPORT_LOCALES,
  REPORT_TEMPLATE_VERSION,
  toCsv,
  type ReportLocale,
} from './exports.ts';
export function periodReadiness(input: {
  closed: boolean;
  unsubmitted: number;
  unapproved: number;
  lockHeld: boolean;
}): Readiness {
  if (input.closed) return { state: 'already_closed', reasons: [{ code: 'period_closed' }] };
  if (input.lockHeld) return { state: 'blocked', reasons: [{ code: 'billing_lock_held' }] };
  const reasons = [];
  if (input.unsubmitted) reasons.push({ code: 'unsubmitted_records' });
  if (input.unapproved) reasons.push({ code: 'unapproved_records' });
  return reasons.length ? { state: 'incomplete', reasons } : { state: 'ready', reasons: [] };
}
