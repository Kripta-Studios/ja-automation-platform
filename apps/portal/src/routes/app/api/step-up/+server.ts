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
      database.sqlite
        .prepare(
          "UPDATE user SET last_step_up_at=?,updated_at=?,version=version+1 WHERE id=? AND status='active'",
        )
        .run(new Date().toISOString(), new Date().toISOString(), locals.user.id);
    } finally {
      database.sqlite.close();
    }
    return json({ steppedUp: true });
  } catch {
    return json({ error: 'Password verification failed' }, { status: 401 });
  }
};
