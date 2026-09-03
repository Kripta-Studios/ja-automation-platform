import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const partitionPattern = /^[A-Za-z0-9._:-]{1,160}$/;

function offlineEnabled(): boolean {
  return process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() !== 'false';
}

function configuration(): { secret: string; tenantId: string; deploymentId: string } | null {
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

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ valid: false }, { status: 401 });
  if (!offlineEnabled())
    return json(
      { offlineEnabled: false, valid: false },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  const config = configuration();
  if (!config) return json({ valid: false }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string') return json({ valid: false }, { status: 400 });
  const [payload, signature, ...extra] = body.token.split('.');
  if (!payload || !signature || extra.length) return json({ valid: false }, { status: 400 });
  const expected = createHmac('sha256', config.secret).update(payload).digest('base64url');
  const validSignature =
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!validSignature) return json({ valid: false }, { status: 401 });
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      sid?: unknown;
      tenantId?: unknown;
      deploymentId?: unknown;
      exp?: unknown;
    };
    const valid =
      decoded.sub === locals.user.id &&
      decoded.sid === locals.session.id &&
      decoded.tenantId === config.tenantId &&
      decoded.deploymentId === config.deploymentId &&
      typeof decoded.tenantId === 'string' &&
      typeof decoded.deploymentId === 'string' &&
      typeof decoded.exp === 'number' &&
      decoded.exp > Date.now();
    return json(
      valid
        ? {
            valid: true,
            tenantId: decoded.tenantId,
            deploymentId: decoded.deploymentId,
            userId: decoded.sub,
          }
        : { valid: false },
      { status: valid ? 200 : 401 },
    );
  } catch {
    return json({ valid: false }, { status: 400 });
  }
};
