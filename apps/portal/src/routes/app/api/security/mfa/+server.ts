import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

type MfaBody = { action?: unknown; password?: unknown; code?: unknown };

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as MfaBody | null;
  const action = body?.action;
  const password = body?.password;
  const passwordValue = typeof password === 'string' ? password : undefined;
  const codeValue = typeof body?.code === 'string' ? body.code : undefined;
  if (action !== 'enable' && action !== 'verify' && action !== 'disable')
    return json({ error: 'A valid MFA action is required' }, { status: 400 });
  if (
    (action === 'enable' || action === 'disable') &&
    (!passwordValue || passwordValue.length < 12)
  )
    return json({ error: 'A valid password is required' }, { status: 400 });
  if (action === 'verify' && (!codeValue || !/^\d{6}$/.test(codeValue)))
    return json({ error: 'Enter the six-digit authenticator code' }, { status: 400 });
  const headers = request.headers;
  try {
    if (action === 'enable') {
      const result = await auth.api.enableTwoFactor({
        body: { password: passwordValue, method: 'totp', issuer: 'J&A Automation' },
        headers,
      });
      const database = createDatabase();
      try {
        database.sqlite
          .prepare(
            'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            locals.user.id,
            'security.mfa.setup_started',
            'user',
            locals.user.id,
            new Date().toISOString(),
            JSON.stringify({ method: 'totp', sessionId: locals.session.id }),
            locals.correlationId,
            JSON.stringify({ method: 'totp' }),
          );
      } finally {
        database.sqlite.close();
      }
      return json({
        enabled: false,
        requiresVerification: true,
        totpURI: 'totpURI' in result ? result.totpURI : undefined,
        backupCodes: 'backupCodes' in result ? result.backupCodes : undefined,
      });
    }
    if (action === 'verify') {
      await auth.api.verifyTOTP({
        body: { code: codeValue as string, trustDevice: false },
        headers,
      });
      const database = createDatabase();
      try {
        database.sqlite
          .prepare('UPDATE user SET mfa_enrolled=1,updated_at=?,version=version+1 WHERE id=?')
          .run(new Date().toISOString(), locals.user.id);
        database.sqlite
          .prepare(
            'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            locals.user.id,
            'security.mfa.enable',
            'user',
            locals.user.id,
            new Date().toISOString(),
            JSON.stringify({ method: 'totp', sessionId: locals.session.id, verified: true }),
            locals.correlationId,
            JSON.stringify({ method: 'totp', verified: true }),
          );
      } finally {
        database.sqlite.close();
      }
      return json({ enabled: true, verified: true });
    }
    const database = createDatabase();
    try {
      const row = database.sqlite
        .prepare('SELECT mfa_required FROM user WHERE id=?')
        .get(locals.user.id) as { mfa_required: number } | undefined;
      if (row?.mfa_required === 1)
        return json({ error: 'Your organization requires MFA' }, { status: 403 });
    } finally {
      database.sqlite.close();
    }
    await auth.api.disableTwoFactor({ body: { password: passwordValue }, headers });
    const updated = createDatabase();
    try {
      updated.sqlite
        .prepare('UPDATE user SET mfa_enrolled=0,updated_at=?,version=version+1 WHERE id=?')
        .run(new Date().toISOString(), locals.user.id);
      updated.sqlite
        .prepare(
          'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          locals.user.id,
          'security.mfa.disable',
          'user',
          locals.user.id,
          new Date().toISOString(),
          JSON.stringify({ sessionId: locals.session.id }),
          locals.correlationId,
          JSON.stringify({}),
        );
    } finally {
      updated.sqlite.close();
    }
    return json({ enabled: false });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'security.mfa.change_failed',
        userId: locals.user.id,
        action,
        error: error instanceof Error ? error.message : 'unknown error',
      }),
    );
    return json({ error: 'MFA change was not accepted' }, { status: 401 });
  }
};
