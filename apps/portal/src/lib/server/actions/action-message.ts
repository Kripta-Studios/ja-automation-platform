import { randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { englishCoverageKey } from '../../i18n/coverage-translations';
import { billingReadinessMessageKey } from '../../portal/billing-readiness';
import type {
  ProblemData,
  ProblemFieldErrors,
  ProblemParams,
  ProblemRemedy,
} from '../../problem/contract';
import { actionFailure as baseActionFailure } from '../portal-repository';

export type ActionMessageKey = `action.${string}` | `problem.${string}`;
export type ActionMessageParam = string | number | boolean | null;
export type ActionMessageParams = ProblemParams;

export type ActionMessageData = Readonly<{
  success: boolean;
  messageKey: ActionMessageKey;
  messageParams: ActionMessageParams;
  /** Compatibility fallback for existing form/message consumers. */
  message?: string;
  [key: string]: unknown;
}>;

export type ActionFailureExtras = Record<string, unknown> & {
  code?: string;
  fields?: Record<string, string[] | string | undefined>;
  fieldErrors?: Record<string, string[] | string | undefined>;
  remedies?: readonly ProblemRemedy[];
  correlationId?: string;
};

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

function codeForKey(key: ActionMessageKey): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
}

function normalizedFieldErrors(fields: unknown): ProblemFieldErrors {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields).flatMap(([field, messages]) => {
      const values = Array.isArray(messages)
        ? messages.filter((message): message is string => typeof message === 'string')
        : typeof messages === 'string'
          ? [messages]
          : [];
      return values.length ? [[field, values]] : [];
    }),
  );
}

function failurePayload(
  messageKey: ActionMessageKey,
  params: ActionMessageParams,
  legacyMessage: string,
  extra: ActionFailureExtras,
): ProblemData & ActionMessageData {
  const correlationId = extra.correlationId || randomUUID();
  const fieldErrors = normalizedFieldErrors(extra.fieldErrors ?? extra.fields);
  return {
    ...extra,
    success: false,
    code: extra.code ?? codeForKey(messageKey),
    messageKey,
    params,
    messageParams: params,
    fieldErrors,
    remedies: extra.remedies ?? [],
    correlationId,
    message: legacyMessage,
  };
}

export function actionFail(
  status: number,
  messageKey: ActionMessageKey,
  messageParams: ActionMessageParams = {},
  legacyMessage?: string,
  extra: ActionFailureExtras = {},
) {
  return fail(
    status,
    failurePayload(
      messageKey,
      messageParams,
      legacyMessage ?? englishCoverageKey(messageKey),
      extra,
    ),
  );
}

type FailureResult = {
  status: number;
  data?: Record<string, unknown>;
};

type AssignmentStatusConflict = Error & {
  code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS';
  projectId: string;
  projectName: string;
  status: string;
};

function assignmentStatusConflict(error: unknown): error is AssignmentStatusConflict {
  if (!(error instanceof Error)) return false;
  const candidate = error as Partial<AssignmentStatusConflict>;
  return (
    candidate.code === 'PROJECT_ASSIGNMENT_BLOCKED_STATUS' &&
    typeof candidate.projectId === 'string' &&
    typeof candidate.projectName === 'string' &&
    typeof candidate.status === 'string'
  );
}

/** Normalize repository errors into SvelteKit's ActionFailure for native and enhanced forms. */
export function actionFailure(error: unknown, extra: ActionFailureExtras = {}) {
  let result: FailureResult;
  try {
    result = baseActionFailure(error) as FailureResult;
  } catch {
    const correlationId = extra.correlationId || randomUUID();
    console.error('Unexpected form action failure', { correlationId, error });
    return actionFail(
      500,
      'problem.error.unexpected',
      { correlationId },
      `We could not confirm whether the action completed. Check the record before trying again. Reference: ${correlationId}.`,
      { ...extra, code: 'UNEXPECTED_ERROR', correlationId, remedies: [] },
    );
  }

  if (result.status === 409 && assignmentStatusConflict(error)) {
    const status = error.status.charAt(0).toUpperCase() + error.status.slice(1);
    const params = { projectName: error.projectName, status };
    return actionFail(
      409,
      'problem.project.assignmentBlockedStatus',
      params,
      `${error.projectName} is ${status}. New assignments are allowed only for Active, Planned, or Paused projects.`,
      {
        ...(result.data ?? {}),
        ...extra,
        code: error.code,
        remedies: extra.remedies ?? [{ id: 'contact_project_owner' }],
      },
    );
  }

  const readinessReasons = Array.isArray(result.data?.reasons) ? result.data.reasons : [];
  const readinessKey =
    result.status === 409 && readinessReasons.length > 0
      ? billingReadinessMessageKey((readinessReasons[0] as { code?: string } | undefined)?.code)
      : null;
  const messageKey: ActionMessageKey =
    result.status === 401
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
  const legacyMessage = englishCoverageKey(messageKey);
  const correlationId = extra.correlationId || randomUUID();
  if (result.status === 400 || result.status === 409) {
    console.warn('Unmapped form business failure', {
      correlationId,
      status: result.status,
      error,
    });
  }
  // Recreate a framework failure. Spreading the original instance into a plain
  // object makes SvelteKit serialize the payload under `form.data`.
  return actionFail(result.status, messageKey, {}, legacyMessage, {
    ...(result.data ?? {}),
    ...extra,
    correlationId,
    ...(readinessReasons.length > 0 &&
    typeof (readinessReasons[0] as { code?: unknown }).code === 'string'
      ? { code: (readinessReasons[0] as { code: string }).code }
      : {}),
  });
}
