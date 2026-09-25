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
import { StalwartOperationRejectedError } from '$lib/server/stalwart-client';
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

function openAccessContext(locals: PortalActionEvent['locals']) {
  try {
    return { context: openPortalRepository(locals) };
  } catch (error) {
    return { failure: actionFailure(error) };
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
            ...(!userId.success ? { workerId: ['Choose a person.'] } : {}),
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
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const object = await formObject(request);
    const parsed = invitationInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.invitation', {}, 'Invalid invitation', {
        fields: parsed.error.flatten().fieldErrors,
      });
    if (!['yes', 'no'].includes(String(object.emailChoice)))
      return actionFail(
        400,
        'action.validation.invalid',
        {},
        'Choose whether to send the invitation email.',
      );
    const opened = openAccessContext(locals);
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
      return actionFailure(error);
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
            ...(!parsedId.success ? { userId: ['Choose a person.'] } : {}),
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
            ...(!parsedId.success ? { workerId: ['Choose a person.'] } : {}),
            ...(!name.trim() ? { name: ['Enter a name.'] } : {}),
            ...(!email.trim() ? { email: ['Enter an email address.'] } : {}),
            ...(!role ? { role: ['Choose a role.'] } : {}),
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
        return actionFail(400, 'action.validation.workerProfile', {}, 'Worker not found');
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
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const form = await request.formData().catch(() => null);
    if (!form) return actionFail(400, 'action.validation.invalidForm', {}, 'Invalid form');

    const role = String(form.get('role') ?? 'worker');
    const emailsRaw = form.getAll('emails');
    const emails = emailsRaw
      .flatMap((val) => String(val).split(','))
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      return actionFail(400, 'action.validation.missingEmails', {}, 'No email accounts selected');
    }
    if (!['worker', 'project_manager', 'finance_admin'].includes(role))
      return actionFail(400, 'action.validation.invalid', {}, 'Invalid portal role');

    const { provisionMailboxUsers } = await import('$lib/server/mail-directory');
    const opened = openAccessContext(locals);
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
      return actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
  createMailboxAccount: async (event: PortalActionEvent) => {
    const { locals, request, params } = event;
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const form = await request.formData().catch(() => null);
    if (!form) return actionFail(400, 'action.validation.invalidForm', {}, 'Invalid form');

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

    if (!username || idempotencyKey.length < 16) {
      return actionFail(400, 'action.validation.missingUsername', {}, 'Username is required');
    }
    if (!password) return actionFail(400, 'action.validation.invalid', {}, 'Password is required');
    if (!['worker', 'project_manager', 'finance_admin'].includes(provisionRole))
      return actionFail(400, 'action.validation.invalid', {}, 'Invalid portal role');

    const { createMailboxAccount, MailboxSagaPartialFailureError } =
      await import('$lib/server/mail-directory');
    const opened = openAccessContext(locals);
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
      if (error instanceof MailboxSagaPartialFailureError && error.externalOutcome === 'created')
        return actionFail(
          409,
          'action.access.mailbox.createdLinkPending',
          {},
          'The mailbox was created in Stalwart, but its portal link is pending. Retry the same creation to finish linking it; a second mailbox will not be created.',
        );
      if (error instanceof StalwartOperationRejectedError && error.operation === 'create') {
        const isPasswordRejection = error.properties.some((property) =>
          property.toLowerCase().includes('secret'),
        );
        const isQuotaRejection = error.properties.some((property) =>
          property.toLowerCase().includes('quota'),
        );
        const message =
          error.rejectionType === 'alreadyExists' || error.rejectionType === 'primaryKeyViolation'
            ? {
                key: 'action.access.mailbox.aliasExists' as const,
                text: 'That mailbox alias already exists in Stalwart.',
              }
            : error.rejectionType === 'forbidden'
              ? {
                  key: 'action.access.mailbox.permissionDenied' as const,
                  text: 'The portal service key cannot create this Stalwart account or grant its mailbox permissions.',
                }
              : error.rejectionType === 'invalidProperties' && isPasswordRejection
                ? {
                    key: 'action.access.mailbox.passwordRejected' as const,
                    text: 'Stalwart rejected the password. Use a unique strong password of at least 16 characters.',
                  }
                : error.rejectionType === 'invalidProperties' && isQuotaRejection
                  ? {
                      key: 'action.access.mailbox.invalidQuota' as const,
                      text: 'Stalwart rejected the mailbox quota.',
                    }
                  : {
                      key: 'action.access.mailbox.rejected' as const,
                      text: `Stalwart rejected the account creation (${error.rejectionType}).`,
                    };
        return actionFail(400, message.key, { reason: error.rejectionType }, message.text);
      }
      if (error instanceof Error) {
        const knownFailure = {
          MAILBOX_ALIAS_INVALID: [
            'action.access.mailbox.invalidAlias',
            'Use an alias of 2–64 lowercase letters, numbers, dots, underscores or hyphens.',
          ],
          MAILBOX_PASSWORD_INVALID: [
            'action.access.mailbox.invalidPassword',
            'Use a password of 12–128 characters without line breaks.',
          ],
          MAILBOX_QUOTA_INVALID: [
            'action.access.mailbox.invalidQuota',
            'Enter a valid mailbox quota.',
          ],
          PORTAL_USER_INACTIVE: [
            'action.access.mailbox.userInactive',
            'A portal user with this email is archived. Restore it explicitly before linking this mailbox.',
          ],
          MAIL_IDENTITY_COLLISION: [
            'action.access.mailbox.identityCollision',
            'This mailbox conflicts with an existing portal identity and was not linked.',
          ],
          MAIL_IDENTITY_RELINK_REQUIRES_EXPLICIT_ACTION: [
            'action.access.mailbox.relinkRequired',
            'This email was linked to a different Stalwart account. An explicit relink is required.',
          ],
        }[error.message];
        if (knownFailure)
          return actionFail(409, knownFailure[0] as `action.${string}`, {}, knownFailure[1]);
      }
      return actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
  bootstrapMailboxUsers: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const opened = openAccessContext(event.locals);
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
      return actionFailure(error);
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
    if (!form) return actionFail(400, 'action.validation.invalidForm', {}, 'Invalid form');
    const userId = String(form.get('portalUserId') ?? '').trim();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const role = String(form.get('role') ?? '');
    const reason = String(form.get('reason') ?? '').trim();
    const confirmation = String(form.get('confirmation') ?? '')
      .trim()
      .toLowerCase();
    if (
      !uuidSchema.safeParse(userId).success ||
      confirmation !== email ||
      !reason ||
      !['worker', 'project_manager', 'finance_admin'].includes(role)
    )
      return actionFail(400, 'action.validation.invalid', {}, 'Invalid role change confirmation');
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
      return knownAccessFailure(error, event.locals.correlationId, userId) ?? actionFailure(error);
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
    if (!form) return actionFail(400, 'action.validation.invalidForm', {}, 'Invalid form');
    const userId = String(form.get('portalUserId') ?? '').trim();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const reason = String(form.get('reason') ?? '').trim();
    const confirmation = String(form.get('confirmation') ?? '')
      .trim()
      .toLowerCase();
    if (!uuidSchema.safeParse(userId).success || confirmation !== email || !reason)
      return actionFail(400, 'action.validation.invalid', {}, 'Invalid offboarding confirmation');
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
      return knownAccessFailure(error, event.locals.correlationId, userId) ?? actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
  updateMailboxPassword: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const form = await event.request.formData().catch(() => null);
    if (!form) return actionFail(400, 'action.validation.invalidForm', {}, 'Invalid form');
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
    if (
      !stalwartAccountId ||
      !password ||
      !reason ||
      !email ||
      confirmation !== email ||
      idempotencyKey.length < 16
    )
      return actionFail(
        400,
        'action.validation.invalid',
        {},
        'Account, password, reason and confirmation are required',
      );
    const opened = openAccessContext(event.locals);
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
      return actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
  destroyMailboxAccount: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const form = await event.request.formData().catch(() => null);
    if (!form) return actionFail(400, 'action.validation.invalidForm', {}, 'Invalid form');
    const stalwartAccountId = String(form.get('stalwartAccountId') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const confirmation = String(form.get('confirmation') ?? '').trim();
    const reason = String(form.get('reason') ?? '').trim();
    const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim();
    if (!stalwartAccountId || !email || !confirmation || !reason || idempotencyKey.length < 16)
      return actionFail(
        400,
        'action.validation.invalid',
        {},
        'Explicit confirmation and reason are required',
      );
    const opened = openAccessContext(event.locals);
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
      return actionFailure(error);
    } finally {
      opened.context.sqlite.close();
    }
  },
};
