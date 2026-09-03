import {
  lastCompletePeriodForCadence,
  periodForCadence,
  type BillingCadence,
} from '@ja/billing-engine';
import { ReadinessError, ValidationError } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  billingReadinessMessageKey,
  isAutoResolvableBillingReadiness,
} from '../portal/billing-readiness';
import { actionFail, actionSuccess, type ActionMessageKey } from './actions/action-message';

const DAY = 86_400_000;
const MAX_LOOKBACK_PERIODS = 16;

type DraftRepository = {
  createInvoiceDraft: (
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) => { created: boolean; id?: string };
  listBillingRules: (principal: Principal) => readonly Record<string, unknown>[];
};

type DraftAttempt =
  | { ok: true; result: { created: boolean } }
  | { ok: false; reasons: readonly { code: string; sourceId?: string }[] };

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return isoDay(new Date(new Date(`${value}T00:00:00.000Z`).valueOf() + days * DAY));
}

function cadenceOptions(rule: Record<string, unknown>) {
  const monthlyCutoff = rule.monthly_cutoff_day ?? rule.monthlyCutoffDay;
  return {
    anchorDate: String(rule.anchor_date ?? rule.anchorDate ?? '') || undefined,
    monthlyCutoffDay:
      monthlyCutoff === null || monthlyCutoff === undefined ? undefined : Number(monthlyCutoff),
  };
}

function previousCompletePeriod(
  cadence: BillingCadence,
  currentStart: string,
  options: ReturnType<typeof cadenceOptions>,
) {
  return periodForCadence(cadence, addDays(currentStart, -1), options);
}

function tryCreateDraft(
  repository: DraftRepository,
  principal: Principal,
  billingRuleId: string,
  periodStart: string,
  periodEnd: string,
): DraftAttempt {
  try {
    return {
      ok: true,
      result: repository.createInvoiceDraft(principal, billingRuleId, periodStart, periodEnd),
    };
  } catch (error) {
    if (error instanceof ReadinessError) return { ok: false, reasons: error.reasons };
    if (
      error instanceof ValidationError &&
      /does not match the configured cadence/i.test(error.message)
    )
      return { ok: false, reasons: [{ code: 'period_cutoff_mismatch' }] };
    throw error;
  }
}

function failReadiness(reasons: readonly { code?: string }[]) {
  const messageKey = billingReadinessMessageKey(reasons[0]?.code) as ActionMessageKey;
  return actionFail(409, messageKey, {}, undefined, { reasons });
}

export function createInvoiceDraftResolvingPeriod(
  context: Readonly<{ principal: Principal; repository: DraftRepository }>,
  input: Readonly<{ billingRuleId: string; periodStart: string; periodEnd: string }>,
) {
  const requested = tryCreateDraft(
    context.repository,
    context.principal,
    input.billingRuleId,
    input.periodStart,
    input.periodEnd,
  );
  if (requested.ok) {
    return actionSuccess(
      requested.result.created
        ? 'action.billing.invoiceDraftCreated'
        : 'action.billing.invoiceDraftExisting',
      { periodStart: input.periodStart, periodEnd: input.periodEnd },
      requested.result.created
        ? 'Invoice draft created for review'
        : 'Existing invoice draft returned for review',
    );
  }

  if (!isAutoResolvableBillingReadiness(requested.reasons)) return failReadiness(requested.reasons);

  const rule = context.repository
    .listBillingRules(context.principal)
    .find((row) => String(row.id) === input.billingRuleId) as Record<string, unknown> | undefined;
  const cadence = String(rule?.cadence_type ?? rule?.cadenceType ?? '') as BillingCadence;
  const options = rule
    ? cadenceOptions(rule)
    : { anchorDate: undefined, monthlyCutoffDay: undefined };
  const today = new Date().toISOString().slice(0, 10);
  let cursor =
    lastCompletePeriodForCadence(cadence, today, options) ??
    periodForCadence(cadence, input.periodStart, options);

  if (cursor && cursor.start === input.periodStart && cursor.end === input.periodEnd)
    cursor = previousCompletePeriod(cadence, cursor.start, options);

  for (let index = 0; index < MAX_LOOKBACK_PERIODS && cursor; index += 1) {
    const attempt = tryCreateDraft(
      context.repository,
      context.principal,
      input.billingRuleId,
      cursor.start,
      cursor.end,
    );
    if (attempt.ok) {
      return actionSuccess(
        attempt.result.created
          ? 'action.billing.invoiceDraftCreatedForPeriod'
          : 'action.billing.invoiceDraftExistingForPeriod',
        { periodStart: cursor.start, periodEnd: cursor.end },
        attempt.result.created
          ? `Invoice draft created for ${cursor.start} → ${cursor.end}`
          : `Existing invoice draft returned for ${cursor.start} → ${cursor.end}`,
      );
    }
    if (!isAutoResolvableBillingReadiness(attempt.reasons)) return failReadiness(attempt.reasons);
    cursor = previousCompletePeriod(cadence, cursor.start, options);
  }

  return failReadiness(requested.reasons);
}
