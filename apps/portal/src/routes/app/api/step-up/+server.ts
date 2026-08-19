import { createDatabase } from '@ja/database';
import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!body || typeof body.password !== 'string' || body.password.length < 12)
    return json({ error: 'A valid password is required' }, { status: 400 });
  try {
    const result = await auth.api.verifyPassword({
      body: { password: body.password },
      headers: request.headers,
    });
    if (!result.status) return json({ error: 'Password verification failed' }, { status: 401 });
    const database = createDatabase();
    try {
      const steppedAt = new Date().toISOString();
      const updated = database.sqlite
        .prepare(
          'UPDATE session SET step_up_at=?,updated_at=? WHERE id=? AND user_id=? AND expires_at>?',
        )
        .run(steppedAt, steppedAt, locals.session.id, locals.user.id, steppedAt);
      if (updated.changes !== 1)
        return json({ error: 'Session is no longer active' }, { status: 401 });
    } finally {
      database.sqlite.close();
    }
    return json({ steppedUp: true });
  } catch {
    return json({ error: 'Password verification failed' }, { status: 401 });
  }
};
