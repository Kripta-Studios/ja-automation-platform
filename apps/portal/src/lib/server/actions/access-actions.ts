import { invitationInputSchema, uuidSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { MailIdentityRepository } from '@ja/database';

type IdentityScope = 'invitation' | 'workerProfile' | 'userStatus';
type IdentityContext = Readonly<{
  identityScope: IdentityScope;
  workerId?: string;
  userId?: string;
}>;

function openAccessContext(locals: PortalActionEvent['locals']) {
  try {
    return { context: openPortalRepository(locals) };
  } catch (error) {
    return { failure: actionFailure(error) };
  }
}

function identityFailurePayload(context: IdentityContext) {
  return { stepUpRequired: true, ...context };
}

function requireOwner(event: PortalActionEvent): ReturnType<typeof actionFail> | null {
  if (!event.locals.user || !event.locals.session)
    return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.');
  if (
    event.locals.user.role !== 'owner_admin' ||
    event.locals.user.email.trim().toLowerCase() !== 'antonny.luty@j-aautomation.com'
  )
    return actionFail(403, 'action.error.forbidden', {}, 'Owner administration required');
  return null;
}

function confirmProtectedActionIdentity(
  event: PortalActionEvent,
): ReturnType<typeof actionFail> | null {
  const sessionId = event.locals.session?.id;
  const userId = event.locals.user?.id;
  if (!sessionId || !userId)
    return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.');
  const opened = openAccessContext(event.locals);
  if ('failure' in opened) return opened.failure as ReturnType<typeof actionFail>;
  try {
    const row = opened.context.sqlite
      .prepare('SELECT step_up_at,expires_at FROM session WHERE id=? AND user_id=?')
      .get(sessionId, userId) as { step_up_at: string | null; expires_at: string } | undefined;
    const steppedAt = row?.step_up_at ? Date.parse(row.step_up_at) : Number.NaN;
    const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : Number.NaN;
    if (
      !row ||
      !Number.isFinite(steppedAt) ||
      Date.now() - steppedAt > 10 * 60_000 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    )
      return actionFail(
        403,
        'action.error.stepUpRequired',
        {},
        'Confirm your identity to continue.',
        { stepUpRequired: true },
      );
    return null;
  } finally {
    opened.context.sqlite.close();
  }
}

function withIdentityContext(error: unknown, context: IdentityContext) {
  const failure = actionFailure(error);
  if (failure.data?.stepUpRequired !== true) return failure;
  return actionFail(
    failure.status,
    'action.error.stepUpRequired',
    {},
    'Confirm your identity to continue.',
    identityFailurePayload(context),
  );
}

export const accessActions = {
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
    const opened = openAccessContext(locals);
    if ('failure' in opened) return opened.failure;
    try {
      const result = opened.context.v3.createInvitation(opened.context.principal, parsed.data);
      const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
      return actionSuccess(
        'action.access.invitation.created',
        { path: `${publicBase}/app/invite/${result.token}` },
        `Invite created: ${publicBase}/app/invite/${result.token}`,
      );
    } catch (error) {
      return withIdentityContext(error, { identityScope: 'invitation' });
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
        'action.validation.accountStatus',
        {},
        'Invalid account status change',
      );
    const identityContext = { identityScope: 'userStatus' as const, userId };
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
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
      return withIdentityContext(error, identityContext);
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
      return actionFail(400, 'action.validation.workerProfile', {}, 'Invalid worker profile data');

    const identityContext = { identityScope: 'workerProfile' as const, workerId };
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
    const opened = openAccessContext(locals);
    if ('failure' in opened) return opened.failure;
    try {
      const target = opened.context.sqlite
        .prepare('SELECT email,role FROM user WHERE id=?')
        .get(workerId) as { email: string; role: string } | undefined;
      if (!target)
        return actionFail(400, 'action.validation.workerProfile', {}, 'Worker not found');
      const canonical = target.email.toLowerCase() === 'antonny.luty@j-aautomation.com';
      if ((canonical && role !== 'owner_admin') || (!canonical && role === 'owner_admin'))
        return actionFail(409, 'action.error.conflict', {}, 'Antonny Luty is the only owner.');
      const linked = opened.context.sqlite
        .prepare('SELECT email FROM mail_identity WHERE user_id=? AND status=?')
        .get(workerId, 'active') as { email: string } | undefined;
      if (linked && linked.email.toLowerCase() !== email.trim().toLowerCase())
        return actionFail(
          409,
          'action.error.conflict',
          {},
          'A linked Webmail address cannot be changed from the portal.',
        );
      opened.context.repository.updateWorkerProfile(opened.context.principal, workerId, {
        name,
        email,
        role,
        joinedAt,
      });
      return actionSuccess('action.access.workerProfile.updated', {}, 'Worker profile updated');
    } catch (error) {
      return withIdentityContext(error, identityContext);
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;

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
      return withIdentityContext(error, { identityScope: 'userStatus' });
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;

    const { createMailboxAccount } = await import('$lib/server/mail-directory');
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
      return withIdentityContext(error, { identityScope: 'userStatus' });
    } finally {
      opened.context.sqlite.close();
    }
  },
  bootstrapMailboxUsers: async (event: PortalActionEvent) => {
    if (event.params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const authorizationFailure = requireOwner(event);
    if (authorizationFailure) return authorizationFailure;
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
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
      return withIdentityContext(error, { identityScope: 'userStatus' });
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
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
      return withIdentityContext(error, { identityScope: 'workerProfile', workerId: userId });
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
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
      return withIdentityContext(error, { identityScope: 'userStatus', userId });
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
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
      return withIdentityContext(error, { identityScope: 'userStatus' });
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
    const identityFailure = confirmProtectedActionIdentity(event);
    if (identityFailure) return identityFailure;
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
      return withIdentityContext(error, { identityScope: 'userStatus' });
    } finally {
      opened.context.sqlite.close();
    }
  },
};
