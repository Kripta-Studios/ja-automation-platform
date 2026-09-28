import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  AccessDeniedError,
  ValidationError,
  V3AccessDeniedError,
  V3ValidationError,
} from '@ja/database';
import { englishCoverageKey } from '$lib/i18n/coverage-translations';
import { openPortalRepository } from '$lib/server/portal-repository';

const querySchema = z.object({
  billingRuleId: z.string().min(1).max(200),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});

type ReadinessProblemKey =
  | 'problem.billing.readinessSignInRequired'
  | 'problem.billing.readinessSelectionInvalid'
  | 'problem.billing.readinessAccountInactive'
  | 'problem.billing.readinessAccessRequired'
  | 'problem.billing.readinessStreamUnavailable'
  | 'problem.billing.readinessOutsideEffectiveDates'
  | 'problem.billing.readinessCadenceMismatch'
  | 'problem.billing.readinessPeriodInvalid'
  | 'problem.billing.readinessUnavailable';

function readinessProblem(
  status: number,
  code: string,
  messageKey: ReadinessProblemKey,
  remedyId: string,
  error?: unknown,
): Response {
  const correlationId = randomUUID();
  if (status === 500)
    console.error('Unexpected billing readiness failure', { correlationId, error });
  const message = englishCoverageKey(messageKey);
  return json(
    {
      success: false,
      code,
      messageKey,
      params: {},
      fieldErrors: {},
      remedies: [{ id: remedyId }],
      correlationId,
      error: message,
    },
    { status, headers: { 'cache-control': 'private, no-store' } },
  );
}

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session)
    return readinessProblem(
      401,
      'BILLING_READINESS_SIGN_IN_REQUIRED',
      'problem.billing.readinessSignInRequired',
      'sign_in_again',
    );
  const parsed = querySchema.safeParse({
    billingRuleId: url.searchParams.get('billingRuleId') ?? '',
    periodStart: url.searchParams.get('periodStart') ?? '',
    periodEnd: url.searchParams.get('periodEnd') ?? '',
  });
  if (!parsed.success)
    return readinessProblem(
      400,
      'BILLING_READINESS_SELECTION_INVALID',
      'problem.billing.readinessSelectionInvalid',
      'review_selected_period',
    );

  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const readiness = context.repository.billingReadiness(
      context.principal,
      parsed.data.billingRuleId,
      parsed.data.periodStart,
      parsed.data.periodEnd,
    );
    return json(readiness, {
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
      return /active account required/i.test(caught.message)
        ? readinessProblem(
            403,
            'BILLING_READINESS_ACCOUNT_INACTIVE',
            'problem.billing.readinessAccountInactive',
            'contact_owner',
          )
        : readinessProblem(
            403,
            'BILLING_READINESS_ACCESS_REQUIRED',
            'problem.billing.readinessAccessRequired',
            'contact_finance',
          );
    if (caught instanceof ValidationError || caught instanceof V3ValidationError) {
      if (/billing rule not found|inactive/i.test(caught.message))
        return readinessProblem(
          409,
          'BILLING_READINESS_STREAM_UNAVAILABLE',
          'problem.billing.readinessStreamUnavailable',
          'review_billing_setup',
        );
      if (/outside the stream effective dates/i.test(caught.message))
        return readinessProblem(
          409,
          'BILLING_READINESS_OUTSIDE_EFFECTIVE_DATES',
          'problem.billing.readinessOutsideEffectiveDates',
          'review_billing_setup',
        );
      if (/cadence/i.test(caught.message))
        return readinessProblem(
          409,
          'BILLING_READINESS_CADENCE_MISMATCH',
          'problem.billing.readinessCadenceMismatch',
          'review_selected_period',
        );
      return readinessProblem(
        400,
        'BILLING_READINESS_PERIOD_INVALID',
        'problem.billing.readinessPeriodInvalid',
        'review_selected_period',
      );
    }
    return readinessProblem(
      500,
      'BILLING_READINESS_UNAVAILABLE',
      'problem.billing.readinessUnavailable',
      'retry_readiness',
      caught,
    );
  } finally {
    context?.sqlite.close();
  }
};
