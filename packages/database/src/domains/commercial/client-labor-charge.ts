import type { DatabaseSync } from 'node:sqlite';
import { weeklyPeriod } from '@ja/billing-engine';
import { hourlyRateForMinutes, money, type Currency } from '@ja/money';
import { resolveClientLaborRule } from './assignment-commercial-terms.ts';

export type ClientBillingUnit = 'hourly' | 'daily' | 'weekly';
export type CustomerChargeSource = {
  sourceId: string;
  projectId: string;
  workerId: string;
  workDate: string;
  minutes: number;
  currency: Currency;
  unit: ClientBillingUnit;
  rateMinor: bigint;
};

export function clientBillingUnit(value: unknown): ClientBillingUnit {
  return value === 'daily' || value === 'weekly' ? value : 'hourly';
}

/** Full worked units, anchored to one actual source. Invoice snapshots retain
 * that anchor so late/backdated parts cannot bill the same unit a second time. */
export class ClientLaborChargeAllocator {
  private readonly used = new Set<string>();
  private readonly anchors = new Map<string, string | null>();
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly invoiceId = '',
  ) {}
  charge(input: CustomerChargeSource) {
    if (input.unit === 'hourly')
      return {
        amountMinor: hourlyRateForMinutes(money(input.currency, input.rateMinor), input.minutes)
          .minorUnits,
        numerator: input.minutes,
        denominator: 60,
        bucketKey: null,
      };
    const start = input.unit === 'daily' ? input.workDate : weeklyPeriod(input.workDate).start;
    const end = input.unit === 'daily' ? input.workDate : weeklyPeriod(input.workDate).end;
    const key = JSON.stringify([
      input.projectId,
      input.workerId,
      input.currency,
      input.unit,
      start,
    ]);
    let anchor = this.anchors.get(key);
    if (!this.anchors.has(key)) {
      const billed = this.sqlite
        .prepare(
          `SELECT line.source_id FROM invoice_line line
        JOIN invoice invoice ON invoice.id=line.invoice_id
        WHERE json_extract(line.snapshot_json,'$.customerChargeBucketKey')=?
          AND line.subtotal_minor>0 AND invoice.id<>?
          AND invoice.state NOT IN ('void','cancelled','superseded')
        ORDER BY invoice.created_at,line.id LIMIT 1`,
        )
        .get(key, this.invoiceId) as { source_id: string } | undefined;
      anchor = billed?.source_id ?? null;
      if (!anchor) {
        const rows = this.sqlite
          .prepare(
            `SELECT t.id,t.work_date,t.category,t.activity_code
          FROM time_entry t WHERE t.project_id=? AND t.worker_id=? AND t.work_date BETWEEN ? AND ?
            AND t.minutes>0 AND t.approval_state IN ('approved','locked') AND t.billability_state='billable'
            AND NOT EXISTS(SELECT 1 FROM record_correction_link link JOIN time_entry correction
              ON correction.id=link.correction_id WHERE link.record_type='time_entry'
              AND link.original_id=t.id AND correction.approval_state IN ('draft','submitted','approved'))
            AND NOT (t.category='travel' AND COALESCE((SELECT travel_client_billable
              FROM project_commercial_policy policy WHERE policy.project_id=t.project_id
              AND policy.effective_from<=t.work_date AND (policy.effective_to IS NULL OR policy.effective_to>=t.work_date)
              ORDER BY policy.effective_from DESC,policy.version DESC LIMIT 1),1)=0)
          ORDER BY t.work_date,COALESCE(t.start_time,t.created_at),t.id`,
          )
          .all(input.projectId, input.workerId, start, end) as Array<{
          id: string;
          work_date: string;
          category: string;
          activity_code: string | null;
        }>;
        anchor =
          rows.find((row) => {
            const selected = resolveClientLaborRule(this.sqlite, {
              projectId: input.projectId,
              workerId: input.workerId,
              workDate: row.work_date,
              category: row.category,
              activityCode: row.activity_code,
            });
            return (
              selected.issues.length === 0 &&
              selected.selected?.rule.currency === input.currency &&
              clientBillingUnit(selected.selected?.rule.rate_basis) === input.unit
            );
          })?.id ?? null;
      }
      this.anchors.set(key, anchor);
    }
    const first = input.minutes > 0 && anchor === input.sourceId && !this.used.has(key);
    if (first) this.used.add(key);
    return {
      amountMinor: first ? input.rateMinor : 0n,
      numerator: first ? 1 : 0,
      denominator: 1,
      bucketKey: key,
    };
  }
}
