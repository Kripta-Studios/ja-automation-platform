import { resolvePortalLocalePreference } from '$lib/i18n/context';
import { error, redirect } from '@sveltejs/kit';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import type { ProblemRemedy } from '$lib/problem/contract';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';

function writer(role: string | undefined): boolean {
  return role === 'owner_admin' || role === 'finance_admin';
}
function list(form: FormData, name: string): string[] {
  return form
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

type CloseoutAction = 'prepare' | 'refresh' | 'confirmClient' | 'finalize' | 'reopen';
type Values = {
  documentId: string[];
  revisionId: string;
  clientSnapshotHash: string;
  confirmationChecked: boolean;
  replaceSelection: boolean;
  reason: string;
  expectedClientSnapshotHash: string;
  expectedInternalSnapshotHash: string;
  expectedConfirmationHash: string;
  expectedUpdatedAt: string;
};

function values(form: FormData): Values {
  return {
    documentId: list(form, 'documentId'),
    revisionId: String(form.get('revisionId') ?? ''),
    clientSnapshotHash: String(form.get('clientSnapshotHash') ?? ''),
    confirmationChecked: form.get('confirmationChecked') === 'yes',
    replaceSelection: form.has('replaceSelection'),
    reason: String(form.get('reason') ?? ''),
    expectedClientSnapshotHash: String(form.get('expectedClientSnapshotHash') ?? ''),
    expectedInternalSnapshotHash: String(form.get('expectedInternalSnapshotHash') ?? ''),
    expectedConfirmationHash: String(form.get('expectedConfirmationHash') ?? ''),
    expectedUpdatedAt: String(form.get('expectedUpdatedAt') ?? ''),
  };
}

function assertRevisionForProject(
  sqlite: ReturnType<typeof openPortalRepository>['sqlite'],
  revisionId: string,
  projectId: string,
): void {
  const row = sqlite
    .prepare(
      'SELECT s.project_id FROM project_closeout_revision r JOIN project_closeout_series s ON s.id=r.series_id WHERE r.id=?',
    )
    .get(revisionId) as { project_id: string } | undefined;
  // A posted revision must belong to the route project even for global Finance
  // writers. Use the same result for missing and cross-project IDs.
  if (!row || row.project_id !== projectId)
    throw new ValidationError('Closeout revision not found');
}

function closeoutFailure(
  cause: unknown,
  actionName: CloseoutAction,
  value: Values,
  projectId: string,
) {
  const extras = { actionName, values: value };
  const review = [{ id: 'review_closeout', projectId }];
  const documents = [{ id: 'review_closeout_documents', projectId }];
  const make = (
    status: number,
    code: string,
    key: `problem.closeout.${string}`,
    message: string,
    fieldErrors: Record<string, string[]> = {},
    remedies: readonly ProblemRemedy[] = review,
  ) => actionFail(status, key, {}, message, { ...extras, code, fieldErrors, remedies });
  if (cause instanceof AccessDeniedError) {
    if (
      cause.message === 'Finance role required' ||
      cause.message === 'Active Finance role required'
    )
      return make(
        403,
        'CLOSEOUT_FINANCE_ROLE_REQUIRED',
        'problem.closeout.financeRoleRequired',
        'An active Finance or Owner role is required to manage closeout.',
        {},
        [{ id: 'contact_owner', projectId }],
      );
    if (cause.message === 'Owner role required' || cause.message === 'Active Owner role required')
      return make(
        403,
        'CLOSEOUT_OWNER_ROLE_REQUIRED',
        'problem.closeout.ownerRoleRequired',
        'Only an active Owner can reopen a closed project.',
        {},
        [{ id: 'contact_owner', projectId }],
      );
  }
  if (!(cause instanceof ConflictError) && !(cause instanceof ValidationError))
    return actionFailure(cause, extras);
  const message = cause.message;
  if (message === 'Project not found')
    return make(
      404,
      'CLOSEOUT_PROJECT_NOT_FOUND',
      'problem.closeout.projectNotFound',
      'This project is no longer available. Review the project list.',
      {},
      [{ id: 'review_projects' }],
    );
  if (message === 'Closeout revision not found')
    return make(
      409,
      'CLOSEOUT_REVISION_NOT_FOUND',
      'problem.closeout.revisionNotFound',
      'This closeout revision is no longer available. Review the current closeout.',
    );
  if (message === 'Reopen reason is required')
    return make(
      400,
      'CLOSEOUT_REOPEN_REASON_REQUIRED',
      'problem.closeout.reopenReasonRequired',
      'Enter a reason of 1 to 2000 characters before reopening.',
      { reason: ['problem.closeout.reopenReasonRequired'] },
      [{ id: 'enter_reason', projectId }],
    );
  if (message === 'Customer attachment selection is invalid')
    return make(
      400,
      'CLOSEOUT_DOCUMENT_SELECTION_INVALID',
      'problem.closeout.documentSelectionInvalid',
      'The selected customer attachments contain duplicates or exceed the allowed document count. Review the selection.',
      { documentId: ['problem.closeout.documentSelectionInvalid'] },
      documents,
    );
  if (
    message === 'A selected customer document is unavailable' ||
    /^Document .+ is not authorized for customer closeout$/u.test(message)
  )
    return make(
      409,
      'CLOSEOUT_DOCUMENT_UNAVAILABLE',
      'problem.closeout.documentUnavailable',
      'A selected document is unavailable or is not authorized for customer closeout. Review the selection.',
      { documentId: ['problem.closeout.documentUnavailable'] },
      documents,
    );
  if (
    message === 'Customer attachment selection exceeds the 100 MB closeout limit' ||
    message === 'Closeout package exceeds the size limit'
  )
    return make(
      400,
      'CLOSEOUT_PACKAGE_TOO_LARGE',
      'problem.closeout.packageTooLarge',
      'The closeout package exceeds its size limit. Choose fewer or smaller customer attachments.',
      { documentId: ['problem.closeout.packageTooLarge'] },
      documents,
    );
  if (
    message ===
    'Client snapshot contains a recognized monetary pattern and needs review before publication'
  )
    return make(
      409,
      'CLOSEOUT_CLIENT_SNAPSHOT_FINANCIAL_REVIEW',
      'problem.closeout.clientSnapshotFinancialReview',
      'The client snapshot may contain financial information. Review its source records before publication.',
      {},
      review,
    );
  if (message === 'Client publication confirmation is stale; review the exact current snapshot')
    return make(
      409,
      'CLOSEOUT_CLIENT_CONFIRMATION_STALE',
      'problem.closeout.clientConfirmationStale',
      'The client snapshot changed since confirmation. Review the current snapshot and confirm it again.',
      {},
      review,
    );
  if (message === 'Draft requires exact client publication confirmation before finalization')
    return make(
      409,
      'CLOSEOUT_CONFIRMATION_REQUIRED',
      'problem.closeout.confirmationRequired',
      'Confirm the exact current client snapshot before finalizing the closeout.',
      {},
      review,
    );
  if (message === 'A closeout draft is already active')
    return make(
      409,
      'CLOSEOUT_DRAFT_ALREADY_ACTIVE',
      'problem.closeout.draftAlreadyActive',
      'A closeout draft is already active. Review that draft before continuing.',
      {},
      review,
    );
  if (
    message === 'Only an active closeout draft can be refreshed' ||
    message === 'An active closeout draft is required'
  )
    return make(
      409,
      'CLOSEOUT_ACTIVE_DRAFT_REQUIRED',
      'problem.closeout.activeDraftRequired',
      'This closeout draft is no longer active. Review the current closeout.',
      {},
      review,
    );
  if (
    message === 'Closeout draft changed concurrently' ||
    message === 'Project closeout changed concurrently'
  )
    return make(
      409,
      'CLOSEOUT_DRAFT_CHANGED',
      'problem.closeout.draftChanged',
      'The closeout changed while this form was open. Review the updated draft before continuing.',
      {},
      review,
    );
  if (
    message === 'A final closeout revision is required' ||
    message === 'Only the latest final closeout revision can be reopened' ||
    message === 'This final closeout revision has already been reopened' ||
    message === 'Only a closed project can be reopened'
  )
    return make(
      409,
      'CLOSEOUT_REOPEN_UNAVAILABLE',
      'problem.closeout.reopenUnavailable',
      'This revision cannot be reopened because it is not the latest final revision of a closed project, or it was already reopened. Review the current closeout.',
      {},
      review,
    );
  if (
    message === 'Closeout source snapshot changed; prepare a fresh draft' ||
    message ===
      'Closeout draft snapshot or client publication confirmation changed; prepare a fresh draft' ||
    message === 'Selected customer document source changed; prepare a fresh draft' ||
    message === 'Accepted customer conformity source changed; prepare a fresh draft'
  )
    return make(
      409,
      'CLOSEOUT_SOURCE_CHANGED',
      'problem.closeout.sourceChanged',
      'The closeout source records changed. Review them and prepare a fresh draft.',
      {},
      review,
    );
  if (
    message === 'Closeout draft source manifest is invalid' ||
    message === 'Accepted customer conformity source is invalid' ||
    message === 'Accepted customer conformity evidence is unavailable or stale' ||
    message === 'Accepted customer conformity evidence is invalid'
  )
    return make(
      409,
      'CLOSEOUT_SOURCE_INVALID',
      'problem.closeout.sourceInvalid',
      'A required closeout source or accepted customer conformity record is invalid or stale. Review the source records.',
      {},
      review,
    );
  if (
    message === 'Accepted customer conformity path is unsafe' ||
    message === 'Accepted customer conformity evidence path is unsafe' ||
    message === 'Selected document path is unsafe' ||
    message === 'Selected document path escaped storage root' ||
    /^Document .+ has (?:invalid integrity metadata|an unsafe storage key)$/u.test(message) ||
    /^Selected document .+ (?:has an unsafe storage path|failed integrity verification)$/u.test(
      message,
    )
  )
    return make(
      409,
      'CLOSEOUT_DOCUMENT_INTEGRITY_FAILED',
      'problem.closeout.documentIntegrityFailed',
      'A selected source document failed a storage or integrity check. Review the source documents and contact an owner.',
      {},
      [...documents, { id: 'contact_owner', projectId }],
    );
  if (message === 'Closeout artifact write did not complete')
    return make(
      503,
      'CLOSEOUT_ARTIFACT_WRITE_INCOMPLETE',
      'problem.closeout.artifactWriteIncomplete',
      'The closeout artifact did not finish writing. Check the current revision before trying again.',
      {},
      review,
    );
  return actionFailure(cause, extras);
}

export const load: PageServerLoad = ({ locals, params, url, cookies }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (!writer(locals.user.role)) error(403, 'Finance role required');
  const context = openPortalRepository(locals);
  try {
    const overview = context.repository.projectOverview(context.principal, params.id);
    const closeout = context.repository.projectCloseoutDetail(context.principal, params.id);
    const documents = context.sqlite
      .prepare(
        "SELECT id,safe_filename,original_filename,artifact_type,sensitivity,media_type,sha256,byte_length FROM document WHERE project_id=? AND state='committed' AND artifact_classification='standard' AND media_type='application/pdf' AND artifact_type IN ('customer_period_pdf','customer_report_pdf','technical_reference','system_reference','backup_reference','approved_customer_document') AND sensitivity IN ('customer_private','operational') AND scan_status IN ('clean','not_scanned') ORDER BY created_at,id",
      )
      .all(params.id);
    return {
      user: locals.user,
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      project: overview.project,
      closeout,
      documents,
    };
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  prepare: async ({ request, locals, params }) => {
    const form = await request.formData();
    const value = values(form);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        actionName: 'prepare',
        values: value,
        code: 'CLOSEOUT_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    if (!writer(locals.user.role))
      return closeoutFailure(
        new AccessDeniedError('Finance role required'),
        'prepare',
        value,
        params.id ?? '',
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.prepareProjectCloseout(context.principal, {
        projectId: params.id ?? '',
        clientDocumentIds: value.documentId,
      });
      return actionSuccess('action.closeout.draftPrepared', {}, 'Closeout draft prepared');
    } catch (cause) {
      return closeoutFailure(cause, 'prepare', value, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  refresh: async ({ request, locals, params }) => {
    const form = await request.formData();
    const value = values(form);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        actionName: 'refresh',
        values: value,
        code: 'CLOSEOUT_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    if (!writer(locals.user.role))
      return closeoutFailure(
        new AccessDeniedError('Finance role required'),
        'refresh',
        value,
        params.id ?? '',
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      assertRevisionForProject(context.sqlite, value.revisionId, params.id ?? '');
      context.repository.refreshProjectCloseoutDraft(context.principal, {
        revisionId: value.revisionId,
        ...(value.replaceSelection ? { clientDocumentIds: value.documentId } : {}),
        expectedState: {
          clientSnapshotHash: value.expectedClientSnapshotHash,
          internalSnapshotHash: value.expectedInternalSnapshotHash,
          confirmationHash: value.expectedConfirmationHash,
          updatedAt: value.expectedUpdatedAt,
        },
      });
      return actionSuccess(
        'action.closeout.draftRefreshed',
        {},
        'Closeout draft refreshed; review and confirm the new client snapshot',
      );
    } catch (cause) {
      return closeoutFailure(cause, 'refresh', value, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  confirmClient: async ({ request, locals, params }) => {
    const form = await request.formData();
    const value = values(form);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        actionName: 'confirmClient',
        values: value,
        code: 'CLOSEOUT_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    if (!writer(locals.user.role))
      return closeoutFailure(
        new AccessDeniedError('Finance role required'),
        'confirmClient',
        value,
        params.id ?? '',
      );
    if (!value.confirmationChecked)
      return actionFail(
        400,
        'problem.closeout.confirmationCheckRequired',
        {},
        'Confirm that you reviewed the exact client snapshot before continuing.',
        {
          actionName: 'confirmClient',
          values: value,
          code: 'CLOSEOUT_CONFIRMATION_CHECK_REQUIRED',
          fieldErrors: { confirmationChecked: ['problem.closeout.confirmationCheckRequired'] },
          remedies: [{ id: 'review_closeout', projectId: params.id ?? '' }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      assertRevisionForProject(context.sqlite, value.revisionId, params.id ?? '');
      context.repository.confirmProjectCloseoutClientPublication(
        context.principal,
        value.revisionId,
        value.clientSnapshotHash,
      );
      return actionSuccess(
        'action.closeout.clientSnapshotConfirmed',
        {},
        'Exact client snapshot confirmed',
      );
    } catch (cause) {
      return closeoutFailure(cause, 'confirmClient', value, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  finalize: async ({ request, locals, params }) => {
    const form = await request.formData();
    const value = values(form);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        actionName: 'finalize',
        values: value,
        code: 'CLOSEOUT_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    if (!writer(locals.user.role))
      return closeoutFailure(
        new AccessDeniedError('Finance role required'),
        'finalize',
        value,
        params.id ?? '',
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      assertRevisionForProject(context.sqlite, value.revisionId, params.id ?? '');
      context.repository.finalizeProjectCloseoutRevision(context.principal, value.revisionId);
      return actionSuccess('action.closeout.packagesFinalized', {}, 'Closeout packages finalized');
    } catch (cause) {
      return closeoutFailure(cause, 'finalize', value, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  reopen: async ({ request, locals, params }) => {
    const form = await request.formData();
    const value = values(form);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        actionName: 'reopen',
        values: value,
        code: 'CLOSEOUT_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    if (locals.user.role !== 'owner_admin')
      return closeoutFailure(
        new AccessDeniedError('Owner role required'),
        'reopen',
        value,
        params.id ?? '',
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      assertRevisionForProject(context.sqlite, value.revisionId, params.id ?? '');
      context.repository.reopenProjectCloseout(context.principal, value.revisionId, value.reason);
      return actionSuccess('action.closeout.reopened', {}, 'Closeout reopened');
    } catch (cause) {
      return closeoutFailure(cause, 'reopen', value, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
};
