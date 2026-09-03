import { fail } from '@sveltejs/kit';
import { englishCoverageKey } from '../../i18n/coverage-translations';
import { billingReadinessMessageKey } from '../../portal/billing-readiness';
import { actionFailure as baseActionFailure } from '../portal-repository';

export type ActionMessageKey = `action.${string}`;
export type ActionMessageParam = string | number | boolean | null;
export type ActionMessageParams = Readonly<Record<string, ActionMessageParam>>;

export type ActionMessageData = Readonly<{
  success: boolean;
  messageKey: ActionMessageKey;
  messageParams: ActionMessageParams;
  /** Compatibility fallback for existing form/message consumers. */
  message?: string;
  [key: string]: unknown;
}>;

export function actionSuccess(
  messageKey: ActionMessageKey,
  messageParams: ActionMessageParams = {},
  legacyMessage?: string,
): ActionMessageData {
  return {
    success: true,
    messageKey,
    messageParams,
    ...(legacyMessage ? { message: legacyMessage } : {}),
  };
}

export function actionFail(
  status: number,
  messageKey: ActionMessageKey,
  messageParams: ActionMessageParams = {},
  legacyMessage?: string,
  extra: Record<string, unknown> = {},
) {
  return fail(status, {
    success: false,
    messageKey,
    messageParams,
    ...(legacyMessage ? { message: legacyMessage } : {}),
    ...extra,
  });
}

type FailureResult = {
  status: number;
  data?: Record<string, unknown>;
};

/**
 * Normalize repository errors at the action boundary.  Domain exception
 * strings are useful for logs, but must not become an unlocalized browser
 * response.  The legacy message is deliberately generic for old consumers;
 * localized clients use messageKey/messageParams.
 */
export function actionFailure(error: unknown): FailureResult {
  let result: FailureResult;
  try {
    result = baseActionFailure(error) as FailureResult;
  } catch {
    // Unexpected exceptions are still represented by a localizable action
    // result; their details remain server-side only.
    result = { status: 500, data: { success: false } };
  }
  const stepUpRequired = result.data?.stepUpRequired === true;
  const readinessReasons = Array.isArray(result.data?.reasons) ? result.data.reasons : [];
  const readinessKey =
    result.status === 409 && readinessReasons.length > 0
      ? billingReadinessMessageKey((readinessReasons[0] as { code?: string } | undefined)?.code)
      : null;
  const messageKey: ActionMessageKey = stepUpRequired
    ? 'action.error.stepUpRequired'
    : result.status === 401
      ? 'action.error.unauthenticated'
      : result.status === 403
        ? 'action.error.forbidden'
        : readinessKey
          ? (readinessKey as ActionMessageKey)
          : result.status === 409
            ? 'action.error.conflict'
            : result.status === 400
              ? 'action.error.invalid'
              : 'action.error.unavailable';
  const legacyMessage = stepUpRequired
    ? 'Confirm your identity to continue.'
    : result.status === 401
      ? 'Sign in again to continue.'
      : result.status === 403
        ? 'You do not have permission to perform this action.'
        : readinessKey
          ? englishCoverageKey(readinessKey)
          : result.status === 409
            ? 'This action conflicts with the current record state.'
            : result.status === 400
              ? 'Check the submitted values and try again.'
              : 'The action could not be completed. Try again shortly.';
  // `baseActionFailure` returns SvelteKit's ActionFailure instance. Spreading
  // it into a plain object loses the instance marker, so SvelteKit treats the
  // result as a successful action and serializes the actual failure one level
  // below `form.data`. That makes structured blockers (including
  // `customer_signoff_required`) unreachable by section components. Recreate
  // the framework failure at this boundary so native and enhanced forms both
  // receive the normalized payload directly as `form`.
  return fail(result.status, {
    ...(result.data ?? {}),
    messageKey,
    messageParams: {},
    message: legacyMessage,
  });
}
