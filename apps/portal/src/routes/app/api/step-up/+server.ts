import { json, type RequestHandler } from '@sveltejs/kit';
import { confirmStepUpPassword, stepUpClientAddress } from '$lib/server/step-up';

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== 'string')
    return json({ error: 'A password is required' }, { status: 400 });

  const result = await confirmStepUpPassword({
    userId: locals.user.id,
    sessionId: locals.session.id,
    password: body.password,
    headers: request.headers,
    clientAddress: stepUpClientAddress(getClientAddress),
  });
  if (result.ok) return json({ steppedUp: true });

  const headers = result.retryAfter ? { 'retry-after': String(result.retryAfter) } : undefined;
  return json(
    { error: result.status === 429 ? 'Too many attempts' : 'Identity confirmation failed' },
    { status: result.status, headers },
  );
};
