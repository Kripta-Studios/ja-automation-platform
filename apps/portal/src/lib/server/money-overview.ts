import type { V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import type { MoneyOverview, MoneyPeriodKey } from '../portal/money-overview-types';

const big = (value: unknown): bigint => {
  const text = String(value ?? '0');
  return /^-?\d+$/u.test(text) ? BigInt(text) : 0n;
};
const day = (value: unknown): string => String(value ?? '').slice(0, 10);

/** Calendar windows in UTC dates, matching the rest of finance (dates are ISO days). */
export function moneyPeriod(
  requested: string | null | undefined,
  today: string,
): { key: MoneyPeriodKey; from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const iso = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  if (requested === 'last_month')
    return { key: 'last_month', from: iso(year, month - 1, 1), to: iso(year, month, 0) };
  if (requested === 'this_year') return { key: 'this_year', from: `${year}-01-01`, to: today };
  if (requested === 'last_year')
    return { key: 'last_year', from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  return { key: 'this_month', from: iso(year, month, 1), to: today };
}

/**
 * Owner money summary for a period. Every amount is an exact integer string in
 * minor units, grouped by currency; currencies are never combined.
 *
 * - invoiced: issued invoice totals (incl. tax) with an issue date in the period, voids excluded
 * - collected: customer payments received in the period minus reversals effective in the period
 * - outstanding / overdue: open balances right now (not period-bound)
 * - costs: labor cost + approved expense cost of work dated in the period
 * - workValue / margin: billable value of approved work in the period, minus its costs
 */
export function buildMoneyOverview(
  v3: V3Repository,
  principal: Principal,
  requestedPeriod: string | null | undefined,
  options: Readonly<{ includeArchived: boolean; today?: string }>,
): MoneyOverview {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const period = moneyPeriod(requestedPeriod, today);
  const ledger = v3.masterLedger(principal);
  const periodPortfolio = v3.financePortfolio(principal, period.from, period.to, {
    includeArchived: options.includeArchived,
  });
  const allTime = v3.financePortfolio(principal, undefined, undefined, {
    includeArchived: options.includeArchived,
  });

  type Totals = {
    invoiced: bigint;
    collected: bigint;
    outstanding: bigint;
    overdue: bigint;
    overdueCount: number;
    openCount: number;
    laborCost: bigint;
    expenseCost: bigint;
    workValue: bigint;
    readyToInvoice: bigint;
  };
  const totals = new Map<string, Totals>();
  const totalsFor = (currency: string): Totals => {
    let row = totals.get(currency);
    if (!row) {
      row = {
        invoiced: 0n,
        collected: 0n,
        outstanding: 0n,
        overdue: 0n,
        overdueCount: 0,
        openCount: 0,
        laborCost: 0n,
        expenseCost: 0n,
        workValue: 0n,
        readyToInvoice: 0n,
      };
      totals.set(currency, row);
    }
    return row;
  };
  const inPeriod = (value: unknown) => {
    const date = day(value);
    return date.length === 10 && date >= period.from && date <= period.to;
  };

  const projectOpen = new Map<string, { outstanding: bigint; overdue: bigint }>();
  const projectInvoiced = new Map<string, bigint>();
  for (const invoice of ledger) {
    const currency = String(invoice.currency);
    const state = String(invoice.billingStatus ?? '');
    const row = totalsFor(currency);
    const projectId = String(invoice.projectId);
    if (state !== 'void' && inPeriod(invoice.issueDate)) {
      row.invoiced += big(invoice.totalMinor);
      projectInvoiced.set(projectId, (projectInvoiced.get(projectId) ?? 0n) + big(invoice.totalMinor));
    }
    for (const payment of invoice.payments as Array<Record<string, unknown>>)
      if (inPeriod(payment.received_at)) row.collected += big(payment.grossAmountMinor);
    for (const reversal of invoice.paymentReversals as Array<Record<string, unknown>>)
      if (inPeriod(reversal.effectiveAt)) row.collected -= big(reversal.amountMinor);
    const outstanding = big(invoice.outstandingMinor);
    if (state !== 'void' && outstanding > 0n) {
      row.outstanding += outstanding;
      row.openCount += 1;
      const open = projectOpen.get(projectId) ?? { outstanding: 0n, overdue: 0n };
      open.outstanding += outstanding;
      const due = day(invoice.dueDate);
      if (due && due < today) {
        row.overdue += outstanding;
        row.overdueCount += 1;
        open.overdue += outstanding;
      }
      projectOpen.set(projectId, open);
    }
  }

  const unbilledByProject = new Map<string, bigint>();
  for (const project of allTime.projects) {
    const unbilled = big(project.approvedUnbilledWipMinor);
    unbilledByProject.set(String(project.projectId), unbilled);
    totalsFor(String(project.currency)).readyToInvoice += unbilled;
  }

  const projects: MoneyOverview['projects'] = [];
  for (const project of periodPortfolio.projects) {
    const currency = String(project.currency);
    const projectId = String(project.projectId);
    const labor = big(project.directLaborCostMinor);
    const expense = big(project.expenseCostMinor);
    const workValue = big(project.revenueCandidateMinor);
    const row = totalsFor(currency);
    row.laborCost += labor;
    row.expenseCost += expense;
    row.workValue += workValue;
    const cost = labor + expense;
    const open = projectOpen.get(projectId) ?? { outstanding: 0n, overdue: 0n };
    const unbilled = unbilledByProject.get(projectId) ?? 0n;
    const invoiced = projectInvoiced.get(projectId) ?? 0n;
    projects.push({
      projectId,
      projectNumber: String(project.projectNumber ?? ''),
      projectName: String(project.projectName ?? ''),
      clientName: String(project.clientName ?? ''),
      currency,
      invoicedMinor: invoiced.toString(),
      workValueMinor: workValue.toString(),
      costMinor: cost.toString(),
      marginMinor: (workValue - cost).toString(),
      marginBps: workValue === 0n ? null : (((workValue - cost) * 10_000n) / workValue).toString(),
      readyToInvoiceMinor: unbilled.toString(),
      outstandingMinor: open.outstanding.toString(),
      overdueMinor: open.overdue.toString(),
      missingRates: Number(project.missingRateCount ?? 0),
      hasActivity:
        workValue !== 0n ||
        cost !== 0n ||
        invoiced !== 0n ||
        unbilled !== 0n ||
        open.outstanding !== 0n,
    });
  }
  projects.sort(
    (a, b) =>
      Number(b.hasActivity) - Number(a.hasActivity) ||
      a.currency.localeCompare(b.currency) ||
      (big(b.workValueMinor) + big(b.readyToInvoiceMinor) > big(a.workValueMinor) + big(a.readyToInvoiceMinor)
        ? 1
        : -1) ||
      a.projectNumber.localeCompare(b.projectNumber),
  );

  const currencies = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, row]) => {
      const costs = row.laborCost + row.expenseCost;
      const margin = row.workValue - costs;
      return {
        currency,
        invoicedMinor: row.invoiced.toString(),
        collectedMinor: row.collected.toString(),
        outstandingMinor: row.outstanding.toString(),
        overdueMinor: row.overdue.toString(),
        overdueCount: row.overdueCount,
        openCount: row.openCount,
        laborCostMinor: row.laborCost.toString(),
        expenseCostMinor: row.expenseCost.toString(),
        costsMinor: costs.toString(),
        workValueMinor: row.workValue.toString(),
        marginMinor: margin.toString(),
        marginBps: row.workValue === 0n ? null : ((margin * 10_000n) / row.workValue).toString(),
        readyToInvoiceMinor: row.readyToInvoice.toString(),
      };
    });
  return { period: { ...period, today }, currencies, projects };
}
