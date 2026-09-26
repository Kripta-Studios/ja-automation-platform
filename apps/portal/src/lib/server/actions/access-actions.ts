import { sealInvitationToken } from '$lib/server/invitation-mail-token';
import { invitationInputSchema, uuidSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import {
  CANONICAL_OWNER_EMAIL,
  MailIdentityRepository,
  SYNTHETIC_OWNER_DEPLOYMENT_ID,
  SYNTHETIC_OWNER_EMAIL,
  SYNTHETIC_OWNER_TENANT_ID,
  SupplierWorkforceRepository,
} from '@ja/database';
import {
  StalwartOperationRejectedError,
  StalwartUnavailableError,
} from '$lib/server/stalwart-client';
import { hashPortalPassword } from '$lib/server/webmail-password';

const knownAccessRules: Readonly<
  Record<
    string,
    {
      status: 400 | 409;
      code: string;
      messageKey: `problem.${string}`;
      message: string;
      remedy: string;
      field?: string;
    }
  >
> = {
  'The last active owner cannot be demoted': {
    status: 409,
    code: 'ACCESS_LAST_OWNER_REQUIRED',
    messageKey: 'problem.access.lastOwnerRequired',
    message:
      'The last active owner must keep owner access. Add another owner before changing this role.',
    remedy: 'review_owner_access',
  },
  'The last active owner cannot be offboarded or suspended': {
    status: 409,
    code: 'ACCESS_LAST_OWNER_REQUIRED',
    messageKey: 'problem.access.lastOwnerRequired',
    message:
      'The last active owner must keep owner access. Add another owner before changing this status.',
    remedy: 'review_owner_access',
  },
  'The owner cannot change their own status': {
    status: 400,
    code: 'ACCESS_SELF_STATUS_BLOCKED',
    messageKey: 'problem.access.selfStatusBlocked',
    message:
      'An owner cannot change their own account status here. Ask another authorized owner to review the account.',
    remedy: 'contact_owner',
  },
  CANONICAL_OWNER_PROTECTED: {
    status: 409,
    code: 'ACCESS_CANONICAL_OWNER_PROTECTED',
    messageKey: 'problem.access.canonicalOwnerProtected',
    message: 'The designated owner account cannot be changed through this mailbox action.',
    remedy: 'review_owner_access',
  },
  PORTAL_USER_INACTIVE: {
    status: 409,
    code: 'ACCESS_PORTAL_USER_INACTIVE',
    messageKey: 'problem.access.userInactive',
    message: 'This portal account is inactive. Review its status before changing mailbox access.',
    remedy: 'review_user_status',
  },
  MAIL_IDENTITY_NOT_FOUND: {
    status: 409,
    code: 'ACCESS_MAIL_IDENTITY_STALE',
    messageKey: 'problem.access.mailIdentityStale',
    message:
      'This mailbox link changed or was removed. Review the updated account before retrying.',
    remedy: 'review_updated_record',
  },
  MAILBOX_CHANGE_REASON_REQUIRED: {
    status: 400,
    code: 'ACCESS_CHANGE_REASON_REQUIRED',
    messageKey: 'problem.access.reasonRequired',
    message: 'Enter a reason for this account access change.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'An account already exists for this email': {
    status: 409,
    code: 'ACCESS_EMAIL_ALREADY_USED',
    messageKey: 'problem.access.emailAlreadyUsed',
    message:
      'A portal account already uses this email. Choose the existing person or another email.',
    remedy: 'review_existing_person',
    field: 'email',
  },
  'This person already has portal access': {
    status: 409,
    code: 'ACCESS_PERSON_ALREADY_HAS_LOGIN',
    messageKey: 'problem.access.personAlreadyHasLogin',
    message:
      'This person already has portal access. Review their existing account instead of creating another login.',
    remedy: 'review_existing_person',
  },
  'Existing person is not active': {
    status: 400,
    code: 'ACCESS_PERSON_INACTIVE',
    messageKey: 'problem.access.personInactive',
    message:
      'The selected person is no longer active. Review their status or choose an active person.',
    remedy: 'review_user_status',
    field: 'existingUserId',
  },
  'Existing person role does not match the selected access role': {
    status: 400,
    code: 'ACCESS_PERSON_ROLE_MISMATCH',
    messageKey: 'problem.access.personRoleMismatch',
    message:
      'The selected person has a different role. Review their role before granting this access.',
    remedy: 'review_existing_person',
    field: 'accessRole',
  },
  'Existing person supplier profile does not match': {
    status: 400,
    code: 'ACCESS_PERSON_SUPPLIER_MISMATCH',
    messageKey: 'problem.access.personSupplierMismatch',
    message:
      'The selected person belongs to a different supplier profile. Review that profile before granting access.',
    remedy: 'review_existing_person',
    field: 'supplierId',
  },
  'Supplier profile with canonical time history cannot be reassigned': {
    status: 409,
    code: 'ACCESS_SUPPLIER_HISTORY_LOCKED',
    messageKey: 'problem.access.supplierHistoryLocked',
    message:
      'This person has supplier time history. Review the existing supplier profile before changing its supplier.',
    remedy: 'review_supplier_profile',
  },
  'Supplier coordinators require a usable login account': {
    status: 400,
    code: 'ACCESS_SUPPLIER_LOGIN_REQUIRED',
    messageKey: 'problem.access.supplierLoginRequired',
    message:
      'A supplier coordinator needs working portal access. Create or restore their login first.',
    remedy: 'review_user_access',
  },
  'Only existing worker accounts can receive a supplier profile': {
    status: 400,
    code: 'ACCESS_SUPPLIER_WORKER_REQUIRED',
    messageKey: 'problem.access.supplierWorkerRequired',
    message:
      'Only worker accounts can receive a supplier profile. Choose a worker or review this person’s role.',
    remedy: 'review_existing_person',
    field: 'workerId',
  },
  'Email is invalid': {
    status: 400,
    code: 'ACCESS_EMAIL_INVALID',
    messageKey: 'problem.access.emailInvalid',
    message: 'Enter a valid email address for this portal account.',
    remedy: 'correct_email',
    field: 'email',
  },
};

function knownAccessFailure(
  error: unknown,
  correlationId: string | undefined,
  recordId?: string,
  actionName?: string,
  values?: Readonly<Record<string, unknown>>,
) {
  if (!(error instanceof Error)) return null;
  const rule = knownAccessRules[error.message];
  if (!rule) return null;
  return actionFail(rule.status, rule.messageKey, {}, rule.message, {
    code: rule.code,
    ...(rule.field ? { fieldErrors: { [rule.field]: [rule.message] } } : {}),
    remedies: [{ id: rule.remedy, ...(recordId ? { recordId } : {}) }],
    correlationId,
    ...(actionName ? { actionName } : {}),
    ...(values ? { values } : {}),
  });
}

type DirectoryAction =
  | 'createInvitation'
  | 'provisionMailboxUsers'
  | 'createMailboxAccount'
  | 'bootstrapMailboxUsers'
  | 'changeMailboxRole'
  | 'deprovisionMailboxUser'
  | 'updateMailboxPassword'
  | 'destroyMailboxAccount';

type DirectoryProblem = Readonly<{
  status: number;
  code: string;
  key: `problem.${string}` | `action.${string}`;
  message: string;
  remedy: string;
  field?: string;
}>;

const directoryProblems: Readonly<Record<string, DirectoryProblem>> = {
  'Owner role required to invite users': {
    status: 403,
    code: 'ACCESS_INVITATION_OWNER_REQUIRED',
    key: 'problem.access.ownerRequired',
    message: 'Only an owner can invite people. Contact an owner to review access.',
    remedy: 'contact_owner',
  },
  'Invitation email is invalid': {
    status: 400,
    code: 'ACCESS_INVITATION_EMAIL_INVALID',
    key: 'problem.access.emailInvalid',
    message: 'Enter a valid email address for this invitation.',
    remedy: 'correct_email',
    field: 'email',
  },
  'Invitation expiry must be 1 to 14 days': {
    status: 400,
    code: 'ACCESS_INVITATION_EXPIRY_INVALID',
    key: 'problem.access.invitationExpiryInvalid',
    message: 'Choose an invitation expiry from 1 to 14 days.',
    remedy: 'review_user_access',
    field: 'expiresInDays',
  },
  'An active or pending account already uses this email': {
    status: 409,
    code: 'ACCESS_INVITATION_ACCOUNT_EXISTS',
    key: 'problem.access.emailAlreadyUsed',
    message:
      'An active or pending account already uses this email. Review that person before inviting again.',
    remedy: 'review_existing_person',
    field: 'email',
  },
  CANONICAL_OWNER_REQUIRED: {
    status: 403,
    code: 'ACCESS_OWNER_REQUIRED',
    key: 'problem.access.ownerRequired',
    message: 'Only the designated owner can change mailbox access. Contact the owner.',
    remedy: 'contact_owner',
  },
  MAILBOX_ROLE_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_ROLE_INVALID',
    key: 'problem.access.mailboxRoleInvalid',
    message: 'Choose a permitted portal role for this mailbox.',
    remedy: 'review_user_access',
    field: 'role',
  },
  MAILBOX_NOT_FOUND_IN_STALWART: {
    status: 409,
    code: 'ACCESS_MAILBOX_NOT_FOUND',
    key: 'problem.access.mailIdentityStale',
    message: 'The selected mailbox is no longer available. Review the current mailbox directory.',
    remedy: 'review_mailbox_identity',
    field: 'stalwartAccountId',
  },
  MAILBOX_EMAIL_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_EMAIL_INVALID',
    key: 'problem.access.emailInvalid',
    message: 'Enter a valid mailbox email address.',
    remedy: 'correct_email',
    field: 'email',
  },
  STALWART_ACCOUNT_ID_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_ACCOUNT_INVALID',
    key: 'problem.access.mailboxAccountInvalid',
    message: 'The mailbox reference is invalid. Choose an account from the current directory.',
    remedy: 'review_mailbox_identity',
    field: 'stalwartAccountId',
  },
  DUPLICATE_MAILBOX_EMAIL: {
    status: 400,
    code: 'ACCESS_MAILBOX_SELECTION_DUPLICATE',
    key: 'problem.access.mailboxSelectionDuplicate',
    message: 'The same mailbox was selected more than once. Keep one selection for each email.',
    remedy: 'review_mailbox_identity',
    field: 'emails',
  },
  PORTAL_USER_INACTIVE: {
    status: 409,
    code: 'ACCESS_PORTAL_USER_INACTIVE',
    key: 'problem.access.userInactive',
    message: 'The portal account is inactive. Review its status before linking the mailbox.',
    remedy: 'review_user_status',
  },
  MAIL_IDENTITY_COLLISION: {
    status: 409,
    code: 'ACCESS_MAILBOX_IDENTITY_COLLISION',
    key: 'action.access.mailbox.identityCollision',
    message: 'This mailbox conflicts with an existing portal identity. Review the current link.',
    remedy: 'review_mailbox_identity',
  },
  MAIL_IDENTITY_RELINK_REQUIRES_EXPLICIT_ACTION: {
    status: 409,
    code: 'ACCESS_MAILBOX_RELINK_REQUIRED',
    key: 'action.access.mailbox.relinkRequired',
    message:
      'This mailbox was linked to another account. Review the identity before an explicit relink.',
    remedy: 'review_mailbox_identity',
  },
  CANONICAL_OWNER_MAILBOX_MISSING: {
    status: 409,
    code: 'ACCESS_OWNER_MAILBOX_MISSING',
    key: 'problem.access.ownerMailboxMissing',
    message:
      'The designated owner mailbox is missing. Review the mailbox directory before synchronizing.',
    remedy: 'review_mailbox_identity',
  },
  CANONICAL_OWNER_MAILBOX_PROTECTED: {
    status: 409,
    code: 'ACCESS_CANONICAL_OWNER_PROTECTED',
    key: 'problem.access.canonicalOwnerProtected',
    message: 'The designated owner mailbox cannot be deleted here.',
    remedy: 'review_owner_access',
  },
  NON_CANONICAL_OWNER_CONFLICT: {
    status: 409,
    code: 'ACCESS_OWNER_IDENTITY_CONFLICT',
    key: 'problem.access.ownerIdentityConflict',
    message: 'Owner identity records need review before mailbox synchronization can continue.',
    remedy: 'review_owner_access',
  },
  SYNTHETIC_OWNER_DEPLOYMENT_REQUIRED: {
    status: 409,
    code: 'ACCESS_MAILBOX_DEPLOYMENT_MISMATCH',
    key: 'problem.access.mailboxDeploymentMismatch',
    message: 'The selected mailbox is outside this deployment. Review the directory setup.',
    remedy: 'review_mailbox_identity',
  },
  MAILBOX_ALIAS_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_ALIAS_INVALID',
    key: 'action.access.mailbox.invalidAlias',
    message: 'Use an alias of 2–64 lowercase letters, numbers, dots, underscores or hyphens.',
    remedy: 'review_mailbox_identity',
    field: 'username',
  },
  MAILBOX_NAME_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_NAME_INVALID',
    key: 'problem.access.mailboxNameInvalid',
    message: 'Enter a mailbox display name of 1 to 160 characters.',
    remedy: 'review_user_access',
    field: 'name',
  },
  MAILBOX_PASSWORD_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_PASSWORD_INVALID',
    key: 'action.access.mailbox.invalidPassword',
    message: 'Use a password of 12–128 characters without line breaks.',
    remedy: 'review_user_access',
    field: 'password',
  },
  MAILBOX_QUOTA_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_QUOTA_INVALID',
    key: 'action.access.mailbox.invalidQuota',
    message: 'Enter a valid mailbox quota.',
    remedy: 'review_mailbox_identity',
    field: 'quotaMb',
  },
  MAILBOX_IDEMPOTENCY_KEY_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_REQUEST_KEY_INVALID',
    key: 'problem.access.mailboxRequestKeyInvalid',
    message: 'The mailbox request reference is invalid. Reload this form before trying again.',
    remedy: 'review_mailbox_identity',
    field: 'idempotencyKey',
  },
  MAILBOX_IDEMPOTENCY_KEY_COLLISION: {
    status: 409,
    code: 'ACCESS_MAILBOX_REQUEST_KEY_REUSED',
    key: 'problem.access.mailboxRequestKeyReused',
    message:
      'This request reference was used for another mailbox action. Review the current account before starting a new request.',
    remedy: 'review_mailbox_identity',
  },
  MAILBOX_COMMAND_RESULT_MISSING: {
    status: 409,
    code: 'ACCESS_MAILBOX_RESULT_UNCERTAIN',
    key: 'problem.access.mailboxResultUncertain',
    message:
      'The mailbox may have changed, but its saved result is unavailable. Check the current account before retrying with the same request reference.',
    remedy: 'review_mailbox_identity',
  },
  STALWART_TOKEN_REQUIRED: {
    status: 503,
    code: 'ACCESS_MAILBOX_SERVICE_CONFIGURATION',
    key: 'problem.access.mailboxServiceConfiguration',
    message: 'Mailbox service access is not configured. Contact the owner before retrying.',
    remedy: 'contact_owner',
  },
  STALWART_JMAP_TLS_REQUIRED: {
    status: 503,
    code: 'ACCESS_MAILBOX_SERVICE_CONFIGURATION',
    key: 'problem.access.mailboxServiceConfiguration',
    message:
      'Mailbox service access is not configured securely. Contact the owner before retrying.',
    remedy: 'contact_owner',
  },
  MAILBOX_CHANGE_REASON_REQUIRED: {
    status: 400,
    code: 'ACCESS_CHANGE_REASON_REQUIRED',
    key: 'problem.access.reasonRequired',
    message: 'Enter a reason for this mailbox access change.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  MAILBOX_PASSWORD_CONFIRMATION_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_CONFIRMATION_INVALID',
    key: 'problem.access.mailboxConfirmationInvalid',
    message: 'Confirm the current mailbox email before changing its password.',
    remedy: 'correct_email',
    field: 'confirmation',
  },
  MAILBOX_DESTROY_CONFIRMATION_INVALID: {
    status: 400,
    code: 'ACCESS_MAILBOX_DESTROY_CONFIRMATION_INVALID',
    key: 'problem.access.mailboxDestroyConfirmationInvalid',
    message: 'Type the required delete confirmation for this mailbox before deleting it.',
    remedy: 'review_mailbox_identity',
    field: 'confirmation',
  },
};

function directoryFailure(
  error: unknown,
  actionName: DirectoryAction,
  values: Record<string, string>,
  correlationId?: string,
) {
  const extras = { actionName, values, correlationId };
  const make = (problem: DirectoryProblem) =>
    actionFail(problem.status, problem.key, {}, problem.message, {
      ...extras,
      code: problem.code,
      ...(problem.field ? { fieldErrors: { [problem.field]: [problem.key] } } : {}),
      remedies: [{ id: problem.remedy }],
    });
  if (error instanceof StalwartUnavailableError)
    return make({
      status: 503,
      code: 'ACCESS_MAILBOX_SERVICE_UNAVAILABLE',
      key: 'problem.access.mailboxServiceUnavailable',
      message:
        'The mailbox service is unavailable. The change may have succeeded; check the mailbox directory before retrying with the same request reference.',
      remedy: 'review_mailbox_identity',
    });
  if (error instanceof StalwartOperationRejectedError) {
    if (error.rejectionType === 'alreadyExists' || error.rejectionType === 'primaryKeyViolation')
      return make({
        status: 409,
        code: 'ACCESS_MAILBOX_ALIAS_EXISTS',
        key: 'action.access.mailbox.aliasExists',
        message: 'That mailbox alias already exists. Review the directory before choosing another.',
        remedy: 'review_mailbox_identity',
        field: 'username',
      });
    if (error.rejectionType === 'forbidden')
      return make({
        status: 503,
        code: 'ACCESS_MAILBOX_SERVICE_PERMISSION',
        key: 'problem.access.mailboxServicePermission',
        message:
          'Mailbox service permissions prevent this change. Contact the owner to review service access.',
        remedy: 'contact_owner',
      });
    if (
      error.rejectionType === 'invalidProperties' &&
      error.properties.some((property) => property.toLowerCase().includes('secret'))
    )
      return make({
        status: 400,
        code: 'ACCESS_MAILBOX_PASSWORD_REJECTED',
        key: 'action.access.mailbox.passwordRejected',
        message: 'The mailbox service rejected this password. Enter a different strong password.',
        remedy: 'review_user_access',
        field: 'password',
      });
    if (
      error.rejectionType === 'invalidProperties' &&
      error.properties.some((property) => property.toLowerCase().includes('quota'))
    )
      return make(directoryProblems.MAILBOX_QUOTA_INVALID!);
    return make({
      status: 409,
      code: 'ACCESS_MAILBOX_OPERATION_REJECTED',
      key: 'problem.access.mailboxOperationRejected',
      message:
        'The mailbox service rejected this change. Review the account state before trying again.',
      remedy: 'review_mailbox_identity',
    });
  }
  if (error instanceof Error) {
    const partial = {
      MAILBOX_PARTIAL_FAILURE_CREATED: {
        code: 'ACCESS_MAILBOX_CREATED_LINK_PENDING',
        key: 'action.access.mailbox.createdLinkPending',
        message:
          'The mailbox was created, but its portal link is pending. Check the directory and retry with the same request reference to finish linking.',
      },
      MAILBOX_PARTIAL_FAILURE_PASSWORD_UPDATED: {
        code: 'ACCESS_MAILBOX_PASSWORD_AUDIT_PENDING',
        key: 'problem.access.mailboxPasswordAuditPending',
        message:
          'The mailbox password may already have changed, but portal recording is pending. Check the account and retry with the same request reference to finish recording it.',
      },
      MAILBOX_PARTIAL_FAILURE_DESTROYED: {
        code: 'ACCESS_MAILBOX_DESTROY_AUDIT_PENDING',
        key: 'problem.access.mailboxDestroyAuditPending',
        message:
          'The mailbox was deleted, but portal recording is pending. Check the directory and retry with the same request reference to finish recording it.',
      },
    }[error.message];
    if (partial)
      return make({
        status: 409,
        ...partial,
        key: partial.key as `problem.${string}` | `action.${string}`,
        remedy: 'review_mailbox_identity',
      });
    const known = directoryProblems[error.message];
    if (known)
      return make({
        ...known,
        ...(known.field === 'role' && actionName === 'createMailboxAccount'
          ? { field: 'provisionRole' }
          : {}),
        ...(known.field === 'stalwartAccountId' && actionName === 'provisionMailboxUsers'
          ? { field: 'emails' }
          : {}),
      });
  }
  return actionFailure(error, extras);
}

function directoryInputFailure(
  actionName: DirectoryAction,
  values: Record<string, string>,
  fieldErrors: Record<string, string[]>,
  correlationId?: string,
) {
  return actionFail(
    400,
    'problem.access.directoryInputInvalid',
    {},
    'Correct the highlighted mailbox or invitation fields before continuing.',
    {
      code: 'ACCESS_DIRECTORY_INPUT_INVALID',
      actionName,
      values,
      fieldErrors,
      remedies: [{ id: 'review_user_access' }],
      correlationId,
    },
  );
}

function directoryFormFailure(actionName: DirectoryAction, correlationId?: string) {
  return actionFail(
    400,
    'problem.access.invalidForm',
    {},
    'The submitted form could not be read. Reload it and enter the details again.',
    {
      code: 'ACCESS_FORM_UNREADABLE',
      actionName,
      remedies: [{ id: 'review_user_access' }],
      correlationId,
    },
  );
}

function directoryOwnerFailure(
  event: PortalActionEvent,
  actionName: DirectoryAction,
  values: Record<string, string>,
) {
  if (!event.locals.user || !event.locals.session)
    return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.', {
      code: 'ACCESS_SESSION_REQUIRED',
      actionName,
      values,
      remedies: [{ id: 'contact_owner' }],
      correlationId: event.locals.correlationId,
    });
  const email = event.locals.user.email.trim().toLowerCase();
  const syntheticOwnerAllowed =
    process.env.NODE_ENV !== 'production' &&
    process.env.JA_TENANT_ID === SYNTHETIC_OWNER_TENANT_ID &&
    process.env.JA_DEPLOYMENT_ID === SYNTHETIC_OWNER_DEPLOYMENT_ID &&
    email === SYNTHETIC_OWNER_EMAIL;
  if (
    event.locals.user.role !== 'owner_admin' ||
    (email !== CANONICAL_OWNER_EMAIL && !syntheticOwnerAllowed)
  )
    return actionFail(
      403,
      'problem.access.ownerRequired',
      {},
      'Only an owner can change invitation or mailbox access. Contact an owner.',
      {
        code: 'ACCESS_OWNER_REQUIRED',
        actionName,
        values,
        remedies: [{ id: 'contact_owner' }],
        correlationId: event.locals.correlationId,
      },
    );
  return null;
}

function openAccessContext(
  locals: PortalActionEvent['locals'],
  directoryAction?: DirectoryAction,
  values: Record<string, string> = {},
) {
  try {
    return { context: openPortalRepository(locals) };
  } catch (error) {
    return {
      failure: directoryAction
        ? directoryFailure(error, directoryAction, values, locals.correlationId)
        : actionFailure(error),
    };
  }
}

function requireOwner(event: PortalActionEvent): ReturnType<typeof actionFail> | null {
  if (!event.locals.user || !event.locals.session)
    return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.');
  const email = event.locals.user.email.trim().toLowerCase();
  const syntheticOwnerAllowed =
    process.env.NODE_ENV !== 'production' &&
    process.env.JA_TENANT_ID === SYNTHETIC_OWNER_TENANT_ID &&
    process.env.JA_DEPLOYMENT_ID === SYNTHETIC_OWNER_DEPLOYMENT_ID &&
    email === SYNTHETIC_OWNER_EMAIL;
  if (
    event.locals.user.role !== 'owner_admin' ||
    (email !== CANONICAL_OWNER_EMAIL && !syntheticOwnerAllowed)
  )
    return actionFail(403, 'action.error.forbidden', {}, 'Owner administration required');
  return null;
}

export const accessActions = {
  setWorkforceProfile: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const denied = requireOwner(event);
    if (denied) return denied;
    const object = await formObject(event.request);
    const userId = uuidSchema.safeParse(object.workerId);
    const profile = String(object.profile ?? '');
    if (
      !userId.success ||
      !['standard', 'supplier_coordinator', 'external_technician'].includes(profile)
    )
      return actionFail(
        400,
        'problem.access.workforceProfileInvalid',
        {},
        'Choose a person and a valid workforce profile.',
        {
          code: 'ACCESS_WORKFORCE_PROFILE_INVALID',
          fieldErrors: {
            ...(!userId.success ? { workerId: ['problem.access.personSelectionRequired'] } : {}),
            ...(!['standard', 'supplier_coordinator', 'external_technician'].includes(profile)
              ? { profile: ['Choose a valid workforce profile.'] }
              : {}),
          },
          correlationId: event.locals.correlationId,
        },
      );
    const opened = openAccessContext(event.locals);
    if ('failure' in opened) return opened.failure;
    try {
      new SupplierWorkforceRepository(opened.context.sqlite).setAccountProfile(
        opened.context.principal,
        {
          userId: userId.data,
          profile: profile as 'standard' | 'supplier_coordinator' | 'external_technician',
          supplierId: typeof object.supplierId === 'string' ? object.supplierId : undefined,
        },
      );
      return actionSuccess('action.access.workerProfile.updated', {}, 'Worker profile updated');
    } catch (error) {
      return (
        knownAccessFailure(error, event.locals.correlationId, userId.data) ?? actionFailure(error)
      );
    } finally {
      opened.context.sqlite.close();
    }
  },
  createLocalPortalUser: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const object = await formObject(request);
    const name = typeof object.name === 'string' ? object.name : '';
    const email = typeof object.email === 'string' ? object.email : '';
    const password = typeof object.password === 'string' ? object.password : '';
    const accessRole = typeof object.role === 'string' ? object.role : '';
    const supplierId = typeof object.supplierId === 'string' ? object.supplierId : undefined;
    const values = Object.fromEntries(
      [
        'existingUserId',
        'name',
        'email',
        'role',
        'supplierId',
        'phone',
        'company',
        'contactName',
        'notes',
      ].map((key) => [key, typeof object[key] === 'string' ? object[key] : '']),
    );
    if (!name.trim() || password.length < 12 || password.length > 128)
      return actionFail(
        400,
        'problem.access.localCredentialsInvalid',
        {},
        'Name and a 12–128 character password are required',
        {
          code: 'ACCESS_LOCAL_CREDENTIALS_INVALID',
          fieldErrors: {
            ...(!name.trim() ? { name: ['Enter the person’s name.'] } : {}),
            ...(password.length < 12 || password.length > 128
              ? { password: ['Use a password with 12–128 characters.'] }
              : {}),
          },
          correlationId: locals.correlationId,
          actionName: 'createLocalPortalUser',
          values,
        },
      );
    const roleMap = {
      worker: { role: 'worker' as const },
      project_manager: { role: 'project_manager' as const },
      finance_admin: { role: 'finance_admin' as const },
      auditor_read_only: { role: 'auditor_read_only' as const },
      supplier_coordinator: {
        role: 'worker' as const,
        supplierProfile: 'supplier_coordinator' as const,
      },
      external_technician: {
        role: 'worker' as const,
        supplierProfile: 'external_technician' as const,
      },
    };
    const mapped = roleMap[accessRole as keyof typeof roleMap];
    if (!mapped)
      return actionFail(400, 'problem.access.localRoleInvalid', {}, 'Choose a valid access role.', {
        code: 'ACCESS_LOCAL_ROLE_INVALID',
        fieldErrors: { role: ['Choose a valid access role.'] },
        correlationId: locals.correlationId,
        actionName: 'createLocalPortalUser',
        values,
      });
    const supplierProfile = 'supplierProfile' in mapped ? mapped.supplierProfile : undefined;
    if (supplierProfile && !supplierId?.trim())
      return actionFail(
        400,
        'problem.access.supplierRequired',
        {},
        'Select a supplier for this access role.',
        {
          code: 'ACCESS_SUPPLIER_REQUIRED',
          fieldErrors: { supplierId: ['Select a supplier.'] },
          correlationId: locals.correlationId,
          actionName: 'createLocalPortalUser',
          values,
        },
      );
    const opened = openAccessContext(locals);
    if ('failure' in opened) return opened.failure;
    try {
      // Better Auth's configured crypto is the only password implementation.
      // The resulting hash is passed to the transaction; plaintext is never
      // returned, recorded, or placed in an audit payload.
      const passwordHash = await hashPortalPassword(password);
      const workforce = new SupplierWorkforceRepository(opened.context.sqlite);
      const created = workforce.provisionLocalPortalAccount(opened.context.principal, {
        existingUserId:
          typeof object.existingUserId === 'string' && object.existingUserId.trim()
            ? object.existingUserId
            : undefined,
        name,
        email,
        passwordHash,
        role: mapped.role,
        supplierProfile,
        supplierId,
        phone: typeof object.phone === 'string' ? object.phone : undefined,
        company: typeof object.company === 'string' ? object.company : undefined,
        contactName: typeof object.contactName === 'string' ? object.contactName : undefined,
        notes: typeof object.notes === 'string' ? object.notes : undefined,
      });
      return actionSuccess(
        'action.access.localAccount.provisioned',
        { userId: created.userId, role: accessRole },
        'Local portal access created',
      );
    } catch (error) {
      return (
        knownAccessFailure(
          error,
          locals.correlationId,
          String(object.existingUserId ?? ''),
          'createLocalPortalUser',
          values,
        ) ?? actionFailure(error)
      );
    } finally {
      opened.context.sqlite.close();
    }
  },
  createInvitation: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request).catch(() => null);
    if (!object) return directoryFormFailure('createInvitation', locals.correlationId);
    const values = {
      email: String(object.email ?? ''),
      role: String(object.role ?? ''),
      expiresInDays: String(object.expiresInDays ?? ''),
      emailChoice: String(object.emailChoice ?? ''),
    };
    const authorizationFailure = directoryOwnerFailure(event, 'createInvitation', values);
    if (authorizationFailure) return authorizationFailure;
    const parsed = invitationInputSchema.safeParse(object);
    if (!parsed.success)
      return directoryInputFailure(
        'createInvitation',
        values,
        Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors)
            .filter(([, errors]) => Boolean(errors?.length))
            .map(([field]) => [
              field,
              [
                {
                  email: 'problem.access.emailInvalid',
                  role: 'problem.access.invitationRoleInvalid',
                  expiresInDays: 'problem.access.invitationExpiryInvalid',
                }[field] ?? 'problem.access.directoryInputInvalid',
              ],
            ]),
        ),
        locals.correlationId,
      );
    if (!['yes', 'no'].includes(String(object.emailChoice)))
      return directoryInputFailure(
        'createInvitation',
        values,
        { emailChoice: ['problem.access.invitationEmailChoiceInvalid'] },
        locals.correlationId,
      );
    const opened = openAccessContext(locals, 'createInvitation', values);
    if ('failure' in opened) return opened.failure;
    try {
      const result = opened.context.v3.createInvitation(
        opened.context.principal,
        { ...parsed.data, emailConfirmed: object.emailChoice === 'yes' },
        (token, id) => sealInvitationToken(token, id, process.env.JA_AUTH_SECRET),
      );
      const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
      return actionSuccess(
        'action.access.invitation.created',
        { path: `${publicBase}/app/invite/${result.token}` },
        `Invite created: ${publicBase}/app/invite/${result.token}`,
      );
    } catch (error) {
      return directoryFailure(error, 'createInvitation', values, locals.correlationId);
    } finally {
      opened.context.sqlite.close();
    }
  },
  updateUserStatus: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const object = await formObject(request);
    const userId = typeof object.userId === 'string' ? object.userId : '';
    const status = typeof object.status === 'string' ? object.status : '';
    const parsedId = uuidSchema.safeParse(userId);
    if (!parsedId.success || !['active', 'suspended', 'offboarded', 'archived'].includes(status))
      return actionFail(
        400,
        'problem.access.statusInvalid',
        {},
        'Choose a person and a valid account status.',
        {
          code: 'ACCESS_STATUS_INVALID',
          fieldErrors: {
            ...(!parsedId.success ? { userId: ['problem.access.personSelectionRequired'] } : {}),
            ...(!['active', 'suspended', 'offboarded', 'archived'].includes(status)
              ? { status: ['Choose a valid account status.'] }
              : {}),
          },
          correlationId: locals.correlationId,
        },
      );
    const opened = openAccessContext(locals);
    if ('failure' in opened) return opened.failure;
    try {
      opened.context.repository.updateUserStatus(
        opened.context.principal,
        userId,
        status as 'active' | 'suspended' | 'offboarded' | 'archived',
      );
      return actionSuccess(
        'action.access.accountStatus.updated',
        { status },
        `Account marked ${status}`,
      );
    } catch (error) {
      return knownAccessFailure(error, locals.correlationId, userId) ?? actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
  updateWorkerProfile: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const object = await formObject(request);
    const workerId = typeof object.workerId === 'string' ? object.workerId : '';
    const name = typeof object.name === 'string' ? object.name : '';
    const email = typeof object.email === 'string' ? object.email : '';
    const role = typeof object.role === 'string' ? object.role : '';
    const joinedAt = typeof object.joinedAt === 'string' ? object.joinedAt : '';

    const parsedId = uuidSchema.safeParse(workerId);
    if (!parsedId.success || !name.trim() || !email.trim() || !role)
      return actionFail(
        400,
        'problem.access.workerProfileInvalid',
        {},
        'Complete the person’s name, email and role before saving.',
        {
          code: 'ACCESS_WORKER_PROFILE_INVALID',
          fieldErrors: {
            ...(!parsedId.success ? { workerId: ['problem.access.personSelectionRequired'] } : {}),
            ...(!name.trim() ? { name: ['problem.access.nameRequired'] } : {}),
            ...(!email.trim() ? { email: ['problem.access.emailRequired'] } : {}),
            ...(!role ? { role: ['problem.access.roleRequired'] } : {}),
          },
          correlationId: locals.correlationId,
        },
      );

    const opened = openAccessContext(locals);
    if ('failure' in opened) return opened.failure;
    try {
      const target = opened.context.sqlite
        .prepare('SELECT email,role FROM user WHERE id=?')
        .get(workerId) as { email: string; role: string } | undefined;
      if (!target)
        return actionFail(
          404,
          'problem.access.userSelectionInvalid',
          {},
          'The selected person is no longer available. Review the team directory before saving.',
          {
            code: 'ACCESS_PERSON_UNAVAILABLE',
            actionName: 'updateWorkerProfile',
            values: { workerId, name, email, role, joinedAt },
            fieldErrors: { workerId: ['problem.access.userSelectionInvalid'] },
            remedies: [{ id: 'review_user_access' }],
            correlationId: locals.correlationId,
          },
        );
      const designatedOwnerEmail =
        process.env.NODE_ENV !== 'production' &&
        process.env.JA_TENANT_ID === SYNTHETIC_OWNER_TENANT_ID &&
        process.env.JA_DEPLOYMENT_ID === SYNTHETIC_OWNER_DEPLOYMENT_ID
          ? SYNTHETIC_OWNER_EMAIL
          : CANONICAL_OWNER_EMAIL;
      const canonical = target.email.toLowerCase() === designatedOwnerEmail;
      if ((canonical && role !== 'owner_admin') || (!canonical && role === 'owner_admin'))
        return actionFail(
          409,
          'problem.access.canonicalOwnerProtected',
          {},
          'The designated owner account cannot be changed through this profile form.',
          {
            code: 'ACCESS_CANONICAL_OWNER_PROTECTED',
            remedies: [{ id: 'review_owner_access', recordId: workerId }],
            correlationId: locals.correlationId,
          },
        );
      const linked = opened.context.sqlite
        .prepare('SELECT email FROM mail_identity WHERE user_id=? AND status=?')
        .get(workerId, 'active') as { email: string } | undefined;
      if (linked && linked.email.toLowerCase() !== email.trim().toLowerCase())
        return actionFail(
          409,
          'problem.access.linkedMailboxEmail',
          {},
          'This person has a linked mailbox address. Change the mailbox identity through the authorized mail account flow.',
          {
            code: 'ACCESS_LINKED_MAILBOX_EMAIL',
            remedies: [{ id: 'review_mailbox_identity', recordId: workerId }],
            correlationId: locals.correlationId,
          },
        );
      opened.context.repository.updateWorkerProfile(opened.context.principal, workerId, {
        name,
        email,
        role,
        joinedAt,
      });
      return actionSuccess('action.access.workerProfile.updated', {}, 'Worker profile updated');
    } catch (error) {
      return knownAccessFailure(error, locals.correlationId, workerId) ?? actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
  provisionMailboxUsers: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const form = await request.formData().catch(() => null);
    if (!form) return directoryFormFailure('provisionMailboxUsers', event.locals.correlationId);

    const role = String(form.get('role') ?? 'worker');
    const emailsRaw = form.getAll('emails');
    const emails = emailsRaw
      .flatMap((val) => String(val).split(','))
      .map((e) => e.trim())
      .filter(Boolean);
    const values = { role, emails: emails.join(',') };
    const authorizationFailure = directoryOwnerFailure(event, 'provisionMailboxUsers', values);
    if (authorizationFailure) return authorizationFailure;

    if (emails.length === 0) {
      return directoryInputFailure(
        'provisionMailboxUsers',
        values,
        { emails: ['problem.access.mailboxSelectionRequired'] },
        locals.correlationId,
      );
    }
    if (!['worker', 'project_manager', 'finance_admin'].includes(role))
      return directoryInputFailure(
        'provisionMailboxUsers',
        values,
        { role: ['problem.access.mailboxRoleInvalid'] },
        locals.correlationId,
      );

    const { provisionMailboxUsers } = await import('$lib/server/mail-directory');
    const opened = openAccessContext(locals, 'provisionMailboxUsers', values);
    if ('failure' in opened) return opened.failure;
    try {
      const result = await provisionMailboxUsers(opened.context.sqlite, opened.context.principal, {
        emails,
        role: role as 'worker' | 'project_manager' | 'finance_admin',
      });
      return actionSuccess(
        'action.access.mailboxes.provisioned',
        { created: result.created, updated: result.updated, unchanged: result.unchanged },
        `${result.created + result.updated} mailbox account(s) provisioned successfully.`,
      );
    } catch (error) {
      return directoryFailure(error, 'provisionMailboxUsers', values, locals.correlationId);
    } finally {
      opened.context.sqlite.close();
    }
  },
  createMailboxAccount: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const form = await request.formData().catch(() => null);
    if (!form) return directoryFormFailure('createMailboxAccount', event.locals.correlationId);

    const username = String(form.get('username') ?? '').trim();
    const name = String(form.get('name') ?? '').trim();
    // Password bytes are opaque input. Never normalize or trim them before
    // Stalwart applies its own password policy and hashing.
    const password = String(form.get('password') ?? '');
    const quotaMb = Number(form.get('quotaMb') || 5120);
    const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim();
    const provisionRole = String(form.get('provisionRole') ?? 'worker') as
      | 'worker'
      | 'project_manager'
      | 'finance_admin';
    const values = {
      username,
      name,
      quotaMb: String(form.get('quotaMb') ?? ''),
      provisionRole,
      idempotencyKey,
    };
    const authorizationFailure = directoryOwnerFailure(event, 'createMailboxAccount', values);
    if (authorizationFailure) return authorizationFailure;

    if (!username || idempotencyKey.length < 16)
      return directoryInputFailure(
        'createMailboxAccount',
        values,
        {
          ...(!username ? { username: ['action.access.mailbox.invalidAlias'] } : {}),
          ...(idempotencyKey.length < 16
            ? { idempotencyKey: ['problem.access.mailboxRequestKeyInvalid'] }
            : {}),
        },
        locals.correlationId,
      );
    if (!password)
      return directoryInputFailure(
        'createMailboxAccount',
        values,
        { password: ['action.access.mailbox.invalidPassword'] },
        locals.correlationId,
      );
    if (!['worker', 'project_manager', 'finance_admin'].includes(provisionRole))
      return directoryInputFailure(
        'createMailboxAccount',
        values,
        { provisionRole: ['problem.access.mailboxRoleInvalid'] },
        locals.correlationId,
      );

    const { createMailboxAccount } = await import('$lib/server/mail-directory');
    const opened = openAccessContext(locals, 'createMailboxAccount', values);
    if ('failure' in opened) return opened.failure;
    try {
      const created = await createMailboxAccount(opened.context.sqlite, opened.context.principal, {
        username,
        name,
        password,
        quotaMb,
        provisionRole,
        idempotencyKey,
      });
      return actionSuccess(
        'action.access.mailbox.created',
        created,
        `Mailbox ${created.email} created successfully.`,
      );
    } catch (error) {
      return directoryFailure(error, 'createMailboxAccount', values, locals.correlationId);
    } finally {
      opened.context.sqlite.close();
    }
  },
  bootstrapMailboxUsers: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = directoryOwnerFailure(event, 'bootstrapMailboxUsers', {});
    if (authorizationFailure) return authorizationFailure;
    const opened = openAccessContext(event.locals, 'bootstrapMailboxUsers');
    if ('failure' in opened) return opened.failure;
    try {
      const { bootstrapMailboxUsers } = await import('$lib/server/mail-directory');
      const result = await bootstrapMailboxUsers(opened.context.sqlite, opened.context.principal);
      return actionSuccess(
        'action.access.mailboxes.provisioned',
        { created: result.created, updated: result.updated, unchanged: result.unchanged },
        'Mailbox directory synchronized.',
      );
    } catch (error) {
      return directoryFailure(error, 'bootstrapMailboxUsers', {}, event.locals.correlationId);
    } finally {
      opened.context.sqlite.close();
    }
  },
  changeMailboxRole: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const form = await event.request.formData().catch(() => null);
    if (!form) return directoryFormFailure('changeMailboxRole', event.locals.correlationId);
    const userId = String(form.get('portalUserId') ?? '').trim();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const role = String(form.get('role') ?? '');
    const reason = String(form.get('reason') ?? '').trim();
    const confirmation = String(form.get('confirmation') ?? '')
      .trim()
      .toLowerCase();
    const values = { portalUserId: userId, email, role, reason, confirmation };
    const roleAllowed = ['worker', 'project_manager', 'finance_admin'].includes(role);
    if (!uuidSchema.safeParse(userId).success || confirmation !== email || !reason || !roleAllowed)
      return actionFail(
        400,
        'problem.access.roleChangeFieldsInvalid',
        {},
        'Select a user and role, enter a reason, and confirm the current email before changing access.',
        {
          code: 'ACCESS_ROLE_CHANGE_FIELDS_INVALID',
          actionName: 'changeMailboxRole',
          values,
          fieldErrors: {
            ...(!uuidSchema.safeParse(userId).success
              ? { portalUserId: ['problem.access.userSelectionInvalid'] }
              : {}),
            ...(confirmation !== email
              ? { confirmation: ['problem.access.confirmationMismatch'] }
              : {}),
            ...(!reason ? { reason: ['problem.access.reasonRequired'] } : {}),
            ...(!roleAllowed ? { role: ['Please select an option.'] } : {}),
          },
          remedies: [{ id: 'review_user_access', recordId: userId }],
          correlationId: event.locals.correlationId,
        },
      );
    const opened = openAccessContext(event.locals);
    if ('failure' in opened) return opened.failure;
    try {
      new MailIdentityRepository(opened.context.sqlite).changePortalRole(
        opened.context.principal,
        userId,
        email,
        role as 'worker' | 'project_manager' | 'finance_admin',
        reason,
      );
      return actionSuccess('action.access.workerProfile.updated', { role }, 'Portal role updated.');
    } catch (error) {
      return (
        knownAccessFailure(
          error,
          event.locals.correlationId,
          userId,
          'changeMailboxRole',
          values,
        ) ?? actionFailure(error, { actionName: 'changeMailboxRole', values })
      );
    } finally {
      opened.context.sqlite.close();
    }
  },
  deprovisionMailboxUser: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const form = await event.request.formData().catch(() => null);
    if (!form) return directoryFormFailure('deprovisionMailboxUser', event.locals.correlationId);
    const userId = String(form.get('portalUserId') ?? '').trim();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const reason = String(form.get('reason') ?? '').trim();
    const confirmation = String(form.get('confirmation') ?? '')
      .trim()
      .toLowerCase();
    const values = { portalUserId: userId, email, reason, confirmation };
    if (!uuidSchema.safeParse(userId).success || confirmation !== email || !reason)
      return actionFail(
        400,
        'problem.access.offboardFieldsInvalid',
        {},
        'Select a user, enter a reason, and confirm the current email before removing portal access.',
        {
          code: 'ACCESS_OFFBOARD_FIELDS_INVALID',
          actionName: 'deprovisionMailboxUser',
          values,
          fieldErrors: {
            ...(!uuidSchema.safeParse(userId).success
              ? { portalUserId: ['problem.access.userSelectionInvalid'] }
              : {}),
            ...(confirmation !== email
              ? { confirmation: ['problem.access.confirmationMismatch'] }
              : {}),
            ...(!reason ? { reason: ['problem.access.reasonRequired'] } : {}),
          },
          remedies: [{ id: 'review_user_access', recordId: userId }],
          correlationId: event.locals.correlationId,
        },
      );
    const opened = openAccessContext(event.locals);
    if ('failure' in opened) return opened.failure;
    try {
      new MailIdentityRepository(opened.context.sqlite).offboardPortalUser(
        opened.context.principal,
        userId,
        email,
        reason,
      );
      return actionSuccess(
        'action.access.accountStatus.updated',
        { status: 'offboarded' },
        'Portal access removed; mailbox preserved.',
      );
    } catch (error) {
      return (
        knownAccessFailure(
          error,
          event.locals.correlationId,
          userId,
          'deprovisionMailboxUser',
          values,
        ) ?? actionFailure(error, { actionName: 'deprovisionMailboxUser', values })
      );
    } finally {
      opened.context.sqlite.close();
    }
  },
  updateMailboxPassword: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const form = await event.request.formData().catch(() => null);
    if (!form) return directoryFormFailure('updateMailboxPassword', event.locals.correlationId);
    const stalwartAccountId = String(form.get('stalwartAccountId') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const reason = String(form.get('reason') ?? '').trim();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const confirmation = String(form.get('confirmation') ?? '')
      .trim()
      .toLowerCase();
    const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim();
    const values = { stalwartAccountId, reason, email, confirmation, idempotencyKey };
    const authorizationFailure = directoryOwnerFailure(event, 'updateMailboxPassword', values);
    if (authorizationFailure) return authorizationFailure;
    if (
      !stalwartAccountId ||
      !password ||
      !reason ||
      !email ||
      confirmation !== email ||
      idempotencyKey.length < 16
    )
      return directoryInputFailure(
        'updateMailboxPassword',
        values,
        {
          ...(!stalwartAccountId
            ? { stalwartAccountId: ['problem.access.mailboxAccountInvalid'] }
            : {}),
          ...(!password ? { password: ['action.access.mailbox.invalidPassword'] } : {}),
          ...(!reason ? { reason: ['problem.access.reasonRequired'] } : {}),
          ...(!email ? { email: ['problem.access.emailInvalid'] } : {}),
          ...(confirmation !== email
            ? { confirmation: ['problem.access.mailboxConfirmationInvalid'] }
            : {}),
          ...(idempotencyKey.length < 16
            ? { idempotencyKey: ['problem.access.mailboxRequestKeyInvalid'] }
            : {}),
        },
        event.locals.correlationId,
      );
    const opened = openAccessContext(event.locals, 'updateMailboxPassword', values);
    if ('failure' in opened) return opened.failure;
    try {
      const { updateMailboxPassword } = await import('$lib/server/mail-directory');
      await updateMailboxPassword(opened.context.sqlite, opened.context.principal, {
        stalwartAccountId,
        password,
        reason,
        email,
        confirmation,
        idempotencyKey,
      });
      return actionSuccess(
        'action.access.mailbox.passwordUpdated',
        {},
        'Mailbox password updated.',
      );
    } catch (error) {
      return directoryFailure(error, 'updateMailboxPassword', values, event.locals.correlationId);
    } finally {
      opened.context.sqlite.close();
    }
  },
  destroyMailboxAccount: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const form = await event.request.formData().catch(() => null);
    if (!form) return directoryFormFailure('destroyMailboxAccount', event.locals.correlationId);
    const stalwartAccountId = String(form.get('stalwartAccountId') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const confirmation = String(form.get('confirmation') ?? '').trim();
    const reason = String(form.get('reason') ?? '').trim();
    const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim();
    const values = { stalwartAccountId, email, confirmation, reason, idempotencyKey };
    const authorizationFailure = directoryOwnerFailure(event, 'destroyMailboxAccount', values);
    if (authorizationFailure) return authorizationFailure;
    if (!stalwartAccountId || !email || !confirmation || !reason || idempotencyKey.length < 16)
      return directoryInputFailure(
        'destroyMailboxAccount',
        values,
        {
          ...(!stalwartAccountId
            ? { stalwartAccountId: ['problem.access.mailboxAccountInvalid'] }
            : {}),
          ...(!email ? { email: ['problem.access.emailInvalid'] } : {}),
          ...(!confirmation
            ? { confirmation: ['problem.access.mailboxDestroyConfirmationInvalid'] }
            : {}),
          ...(!reason ? { reason: ['problem.access.reasonRequired'] } : {}),
          ...(idempotencyKey.length < 16
            ? { idempotencyKey: ['problem.access.mailboxRequestKeyInvalid'] }
            : {}),
        },
        event.locals.correlationId,
      );
    const opened = openAccessContext(event.locals, 'destroyMailboxAccount', values);
    if ('failure' in opened) return opened.failure;
    try {
      const { destroyMailboxAccount } = await import('$lib/server/mail-directory');
      await destroyMailboxAccount(opened.context.sqlite, opened.context.principal, {
        stalwartAccountId,
        email,
        confirmation,
        reason,
        idempotencyKey,
      });
      return actionSuccess(
        'action.access.mailbox.destroyed',
        {},
        'Mailbox deleted; portal account preserved.',
      );
    } catch (error) {
      return directoryFailure(error, 'destroyMailboxAccount', values, event.locals.correlationId);
    } finally {
      opened.context.sqlite.close();
    }
  },
};
