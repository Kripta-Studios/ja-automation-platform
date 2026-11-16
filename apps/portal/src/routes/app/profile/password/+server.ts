import { json, type RequestHandler } from '@sveltejs/kit';
import { createDatabase } from '@ja/database';
import {
  changeOwnPassword,
  linkedIdentityForUser,
  passwordChangeProblem,
} from '$lib/server/webmail-password';

const headers = { 'cache-control': 'private, no-store' };

/** Whether the signed-in user's password is also their Webmail password. */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ linkedMailbox: false }, { status: 401, headers });
  const { sqlite } = createDatabase();
  try {
    return json(
      { linkedMailbox: linkedIdentityForUser(sqlite, locals.user.id) !== null },
      { headers },
    );
  } finally {
    sqlite.close();
  }
};

/**
 * Self-service password change from My profile. One password per person: for
 * a user with a company mailbox this changes the Webmail password too. The
 * request is same-origin checked and rate limited in hooks.server.ts.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const correlationId = locals.correlationId;
  if (!locals.user || !locals.session?.id)
    return json(
      {
        success: false,
        code: 'ACCESS_SESSION_REQUIRED',
        messageKey: 'action.error.unauthenticated',
        fieldErrors: {},
        correlationId,
      },
      { status: 401, headers },
    );
  const form = await request.formData().catch(() => null);
  // Password bytes are opaque: never trim or normalize them.
  const currentPassword = String(form?.get('currentPassword') ?? '');
  const newPassword = String(form?.get('newPassword') ?? '');
  const { sqlite } = createDatabase();
  try {
    const result = await changeOwnPassword(sqlite, {
      userId: locals.user.id,
      sessionId: locals.session.id,
      currentPassword,
      newPassword,
      correlationId,
    });
    if (result.ok)
      return json(
        {
          success: true,
          messageKey: result.linkedMailbox
            ? 'action.access.password.changed'
            : 'action.access.password.changedPortal',
          linkedMailbox: result.linkedMailbox,
        },
        { headers },
      );
    const problem = passwordChangeProblem(
      result.code === 'TARGET_NOT_ALLOWED' ? 'USER_NOT_ACTIVE' : result.code,
    );
    return json(
      {
        success: false,
        code: problem.code,
        messageKey: problem.key,
        fieldErrors: problem.field ? { [problem.field]: [problem.key] } : {},
        correlationId,
      },
      { status: problem.status, headers },
    );
  } finally {
    sqlite.close();
  }
};
