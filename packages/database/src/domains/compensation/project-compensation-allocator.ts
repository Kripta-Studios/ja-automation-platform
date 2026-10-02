import { hourlyRateForMinutes, money, type Currency } from '@ja/money';

type GroupedCompensationRule = Readonly<{
  id: string;
  rule_type: string;
  rate_basis: string;
  rate_minor: string;
  daily_guarantee_minutes: number | null;
}>;

type ApprovedCompensationSource = Readonly<{
  sourceId: string;
  workerId: string;
  workDate: string;
  minutes: number;
  rule: GroupedCompensationRule | null;
}>;

/** Request-local allocation for one project and selected date range. */
export class ProjectCompensationAllocator {
  private readonly dailyGroups = new Set<string>();
  private readonly fixedGroups = new Set<string>();
  private readonly guaranteeDays = new Map<
    string,
    { rule: GroupedCompensationRule; actualMinutes: number; sourceId: string }
  >();

  constructor(private readonly currency: Currency) {}

  /** Only approved sources participate; ordinary per-source pay stays with the caller. */
  additionalForApprovedSource(source: ApprovedCompensationSource): bigint {
    const { rule, workerId, workDate, sourceId, minutes } = source;
    if (!rule) return 0n;
    const dailyKey = `${workerId}:${workDate}:${rule.id}`;
    if (
      rule.rule_type === 'Hourly' &&
      rule.rate_basis !== 'daily' &&
      rule.daily_guarantee_minutes
    ) {
      const day = this.guaranteeDays.get(dailyKey) ?? {
        rule,
        actualMinutes: 0,
        sourceId,
      };
      day.actualMinutes += minutes;
      this.guaranteeDays.set(dailyKey, day);
    }
    // Match the worker-pay grouping precedence, including legacy daily-basis rules.
    // Deterministic source order assigns each group amount to its first approved row.
    if (rule.rule_type === 'Daily' || rule.rate_basis === 'daily') {
      if (!this.dailyGroups.has(dailyKey)) {
        this.dailyGroups.add(dailyKey);
        return BigInt(rule.rate_minor);
      }
    } else if (
      rule.rule_type === 'FixedPerBillingPeriod' ||
      rule.rule_type === 'FixedProjectAmount' ||
      rule.rule_type === 'CustomApprovedAdjustment'
    ) {
      const fixedKey = `${workerId}:${rule.id}`;
      if (!this.fixedGroups.has(fixedKey)) {
        this.fixedGroups.add(fixedKey);
        return BigInt(rule.rate_minor);
      }
    }
    return 0n;
  }

  /** Guarantees use approved actual minutes and the base rate, independent of client minimums. */
  guaranteeTopUps(): Array<{ sourceId: string; amountMinor: bigint }> {
    const topUps: Array<{ sourceId: string; amountMinor: bigint }> = [];
    for (const { rule, actualMinutes, sourceId } of this.guaranteeDays.values()) {
      const minutes = Math.max(0, (rule.daily_guarantee_minutes ?? 0) - actualMinutes);
      if (minutes === 0) continue;
      topUps.push({
        sourceId,
        amountMinor: hourlyRateForMinutes(money(this.currency, BigInt(rule.rate_minor)), minutes)
          .minorUnits,
      });
    }
    return topUps;
  }
}
