import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { AccessDeniedError, ValidationError, V3AccessDeniedError } from '@ja/database';
import { englishCoverageKey } from '$lib/i18n/coverage-translations';

export type ExpenseLookup = 'description' | 'time' | 'crew';

type Problem = Readonly<{
  status: number;
  code: string;
  messageKey: `problem.expenseLookup.${string}`;
  remedies: readonly { id: string }[];
}>;

const signIn: Problem = {
  status: 401,
  code: 'EXPENSE_LOOKUP_SIGN_IN_REQUIRED',
  messageKey: 'problem.expenseLookup.signInRequired',
  remedies: [{ id: 'sign_in_again' }],
};

const accountDisabled: Problem = {
  status: 403,
  code: 'EXPENSE_LOOKUP_ACCOUNT_DISABLED',
  messageKey: 'problem.expenseLookup.accountDisabled',
  remedies: [{ id: 'contact_owner' }],
};

const problems: Record<ExpenseLookup, { invalid: Problem; denied: Problem }> = {
  description: {
    invalid: {
      status: 400,
      code: 'EXPENSE_LOOKUP_DESCRIPTION_FILTERS_INVALID',
      messageKey: 'problem.expenseLookup.descriptionFiltersInvalid',
      remedies: [{ id: 'review_expense_form' }],
    },
    denied: {
      status: 403,
      code: 'EXPENSE_LOOKUP_DESCRIPTION_SCOPE_DENIED',
      messageKey: 'problem.expenseLookup.descriptionScopeDenied',
      remedies: [{ id: 'review_expense_form' }, { id: 'contact_owner' }],
    },
  },
  time: {
    invalid: {
      status: 400,
      code: 'EXPENSE_LOOKUP_TIME_FILTERS_INVALID',
      messageKey: 'problem.expenseLookup.timeFiltersInvalid',
      remedies: [{ id: 'review_expense_form' }],
    },
    denied: {
      status: 403,
      code: 'EXPENSE_LOOKUP_TIME_SCOPE_DENIED',
      messageKey: 'problem.expenseLookup.timeScopeDenied',
      remedies: [{ id: 'review_expense_form' }, { id: 'contact_owner' }],
    },
  },
  crew: {
    invalid: {
      status: 400,
      code: 'EXPENSE_LOOKUP_CREW_FILTERS_INVALID',
      messageKey: 'problem.expenseLookup.crewFiltersInvalid',
      remedies: [{ id: 'review_expense_form' }],
    },
    denied: {
      status: 403,
      code: 'EXPENSE_LOOKUP_CREW_SCOPE_DENIED',
      messageKey: 'problem.expenseLookup.crewScopeDenied',
      remedies: [{ id: 'review_expense_form' }, { id: 'contact_owner' }],
    },
  },
};

export function expenseLookupProblem(problem: Problem, correlationId?: string) {
  return json(
    {
      success: false,
      code: problem.code,
      messageKey: problem.messageKey,
      params: {},
      fieldErrors: {},
      remedies: problem.remedies,
      correlationId: correlationId || randomUUID(),
      error: englishCoverageKey(problem.messageKey),
    },
    { status: problem.status, headers: { 'cache-control': 'private, no-store' } },
  );
}

export function expenseLookupSignIn(correlationId?: string) {
  return expenseLookupProblem(signIn, correlationId);
}

export function expenseLookupInvalid(lookup: ExpenseLookup, correlationId?: string) {
  return expenseLookupProblem(problems[lookup].invalid, correlationId);
}

export function expenseLookupCaught(
  lookup: ExpenseLookup,
  caught: unknown,
  correlationId?: string,
) {
  if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError) {
    if (
      caught.message === 'Sign in required' ||
      caught.message === 'Live authenticated session required'
    )
      return expenseLookupSignIn(correlationId);
    if (caught.message === 'Active account required')
      return expenseLookupProblem(accountDisabled, correlationId);
    return expenseLookupProblem(problems[lookup].denied, correlationId);
  }
  if (caught instanceof ValidationError)
    return expenseLookupProblem(problems[lookup].invalid, correlationId);
  const reference = correlationId || randomUUID();
  console.error('Unexpected expense lookup failure', {
    correlationId: reference,
    lookup,
    error: caught,
  });
  return json(
    {
      success: false,
      code: 'EXPENSE_LOOKUP_UNAVAILABLE',
      messageKey: 'problem.expenseLookup.unavailable',
      params: { correlationId: reference },
      fieldErrors: {},
      remedies: [{ id: 'retry_expense_options' }],
      correlationId: reference,
      error: englishCoverageKey('problem.expenseLookup.unavailable'),
    },
    { status: 500, headers: { 'cache-control': 'private, no-store' } },
  );
}
