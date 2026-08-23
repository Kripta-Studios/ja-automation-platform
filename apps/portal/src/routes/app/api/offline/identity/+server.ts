import { createHmac } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type OfflineIdentityConfig = Readonly<{
  secret: string;
  tenantId: string;
  deploymentId: string;
}>;

const partitionPattern = /^[A-Za-z0-9._:-]{1,160}$/;

function configuration(): OfflineIdentityConfig | null {
  const secret = process.env.JA_AUTH_SECRET?.trim();
  const tenantId = process.env.JA_TENANT_ID?.trim();
  const deploymentId = process.env.JA_DEPLOYMENT_ID?.trim();
  if (
    !secret ||
    !tenantId ||
    !deploymentId ||
    !partitionPattern.test(tenantId) ||
    !partitionPattern.test(deploymentId)
  )
    return null;
  return { secret, tenantId, deploymentId };
}

function issueIdentity(userId: string, sessionId: string, config: OfflineIdentityConfig): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      sid: sessionId,
      tenantId: config.tenantId,
      deploymentId: config.deploymentId,
      exp: Date.now() + 24 * 60 * 60_000,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export const GET: RequestHandler = ({ cookies, locals }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const config = configuration();
  if (!config)
    return json(
      { error: 'Offline identity is not configured' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  const token = issueIdentity(locals.user.id, locals.session.id, config);
  cookies.set('ja_offline_identity', token, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60,
  });
  return json(
    {
      token,
      tenantId: config.tenantId,
      deploymentId: config.deploymentId,
      userId: locals.user.id,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
};
