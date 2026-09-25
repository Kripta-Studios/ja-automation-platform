import { ReadinessError, ValidationError } from '@ja/database';
import type { Principal } from '@ja/domain';
import { billingReadinessMessageKey } from '../portal/billing-readiness';
import { actionFail, actionSuccess, type ActionMessageKey } from './actions/action-message';

type DraftRepository = {
  createInvoiceDraft: (
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) => { created: boolean; id?: string; existingState?: string };
};

type DraftAttempt =
  | { ok: true; result: { created: boolean; id?: string; existingState?: string } }
  | { ok: false; reasons: readonly { code: string; sourceId?: string }[] };

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

function failReadiness(
  reasons: readonly { code?: string }[],
  selection: Readonly<{ billingRuleId: string; periodStart: string; periodEnd: string }>,
) {
  const messageKey = billingReadinessMessageKey(reasons[0]?.code) as ActionMessageKey;
  return actionFail(409, messageKey, {}, undefined, { reasons, ...selection });
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
    const existingFinal =
      !requested.result.created &&
      requested.result.existingState &&
      requested.result.existingState !== 'draft';
    return actionSuccess(
      requested.result.created
        ? 'action.billing.invoiceDraftCreated'
        : existingFinal
          ? 'action.billing.invoiceAlreadyExists'
          : 'action.billing.invoiceDraftExisting',
      {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        invoiceId: requested.result.id ?? '',
        invoiceState: requested.result.existingState ?? 'draft',
      },
      requested.result.created
        ? 'Invoice draft created for review'
        : existingFinal
          ? 'An invoice already exists for this stream and period. Open it to review its current state.'
          : 'Existing invoice draft returned for review',
    );
  }
  // The selected range is a commercial instruction. Never search backwards and
  // generate a different period merely because the requested one is blocked.
  // The caller receives the exact readiness reasons and can explicitly review
  // pending records or choose another period.
  return failReadiness(requested.reasons, input);
}
