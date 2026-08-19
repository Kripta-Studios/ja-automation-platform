import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { createDatabase } from '@ja/database';
import { readDemoToken } from '$lib/server/demo-session';
import { createHash, randomUUID } from 'node:crypto';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';

const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
const portalBase = process.env.JA_PORTAL_BASE_PATH ?? `${publicBase}/app`;
const production = process.env.NODE_ENV === 'production';
const portalCsp =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'";

function applySecurityHeaders(
  response: Response,
  isPortal: boolean,
  path: string,
  correlationId: string,
): Response {
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  if (isPortal && !response.headers.has('content-security-policy'))
    response.headers.set('content-security-policy', portalCsp);
  if (production)
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (isPortal && !path.endsWith('/service-worker.js') && !path.includes('/manifest.'))
    response.headers.set('cache-control', 'private, no-store');
  return response;
}

function authRateLimit(event: Parameters<Handle>[0]['event']): Response | null {
  if (event.request.method === 'GET' || event.request.method === 'HEAD') return null;
  const address = event.getClientAddress();
  const endpoint = event.url.pathname.replace(/[^A-Za-z0-9/_-]/g, '_');
  const bucketKey = createHash('sha256').update(`auth:${address}:${endpoint}`).digest('hex');
  const { sqlite } = createDatabase();
  try {
    const now = Date.now();
    const windowMs = 15 * 60_000;
    const row = sqlite
      .prepare('SELECT window_started_at,request_count FROM rate_limit_bucket WHERE bucket_key=?')
      .get(bucketKey) as { window_started_at: string; request_count: number } | undefined;
    if (!row || now - Date.parse(row.window_started_at) >= windowMs) {
      sqlite
        .prepare(
          'INSERT INTO rate_limit_bucket(bucket_key,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=excluded.window_started_at,request_count=1',
        )
        .run(bucketKey, new Date(now).toISOString());
      return null;
    }
    if (row.request_count >= 10)
      return new Response(JSON.stringify({ error: 'Too many authentication attempts' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'retry-after': String(
            Math.max(1, Math.ceil((windowMs - (now - Date.parse(row.window_started_at))) / 1000)),
          ),
        },
      });
    sqlite
      .prepare('UPDATE rate_limit_bucket SET request_count=request_count+1 WHERE bucket_key=?')
      .run(bucketKey);
    return null;
  } finally {
    sqlite.close();
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  const startedAt = Date.now();
  const suppliedCorrelationId = event.request.headers.get('x-correlation-id')?.trim() ?? '';
  const correlationId = /^[A-Za-z0-9._:-]{8,96}$/.test(suppliedCorrelationId)
    ? suppliedCorrelationId
    : randomUUID();
  event.locals.correlationId = correlationId;
  const path = event.url.pathname;
  const isPortal = path === portalBase || path.startsWith(`${portalBase}/`);
  const isAuth = path.startsWith(`${portalBase}/api/auth/`);
  const isDemo = path === `${portalBase}/demo-login`;
  if (path.endsWith('/api/auth/sign-up/email'))
    return applySecurityHeaders(
      new Response(JSON.stringify({ error: 'A valid single-use invitation is required.' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
      true,
      path,
      correlationId,
    );
  if (isAuth && event.request.method !== 'GET' && event.request.method !== 'HEAD') {
    const limited = authRateLimit(event);
    if (limited) return applySecurityHeaders(limited, isPortal, path, correlationId);
  }
  if (
    isPortal &&
    event.request.method !== 'GET' &&
    event.request.method !== 'HEAD' &&
    !isAuth &&
    !isDemo
  ) {
    const origin = event.request.headers.get('origin');
    const referer = event.request.headers.get('referer');
    if (
      (origin && origin !== event.url.origin) ||
      (!origin && (!referer || !referer.startsWith(event.url.origin)))
    ) {
      return applySecurityHeaders(
        new Response('Origin check failed', {
          status: 403,
          headers: { 'cache-control': 'no-store' },
        }),
        true,
        path,
        correlationId,
      );
    }
  }
  if (!building && isPortal) {
    const demoUserId = readDemoToken(event.cookies.get('ja_demo_session'));
    if (demoUserId) {
      const { sqlite } = createDatabase();
      try {
        const demoUser = sqlite
          .prepare(
            "SELECT id,name,email,role,status,mfa_enrolled mfaEnrolled,mfa_required mfaRequired FROM user WHERE id=? AND status='active'",
          )
          .get(demoUserId) as unknown as App.Locals['user'];
        event.locals.user = demoUser ?? null;
        event.locals.session = demoUser
          ? {
              id: `demo-${demoUser.id}`,
              userId: demoUser.id,
              expiresAt: new Date(Date.now() + 3600000),
            }
          : null;
      } finally {
        sqlite.close();
      }
    } else {
      const current = await auth.api.getSession({ headers: event.request.headers });
      let currentUser: App.Locals['user'] = null;
      if (current?.session && current.user) {
        const { sqlite } = createDatabase();
        try {
          currentUser =
            (sqlite
              .prepare(
                "SELECT id,name,email,role,status,mfa_enrolled mfaEnrolled,mfa_required mfaRequired FROM user WHERE id=? AND status='active'",
              )
              .get(current.session.userId) as App.Locals['user'] | undefined) ?? null;
        } finally {
          sqlite.close();
        }
      }
      const active = currentUser !== null;
      event.locals.session = active ? (current?.session ?? null) : null;
      event.locals.user = currentUser;
      if (
        active &&
        production &&
        currentUser?.mfaRequired &&
        !currentUser?.mfaEnrolled &&
        !path.endsWith('/profile') &&
        !path.startsWith(`${portalBase}/api/security/mfa`)
      )
        return applySecurityHeaders(
          new Response('MFA enrollment is required for this account', {
            status: 403,
            headers: { 'cache-control': 'no-store' },
          }),
          true,
          path,
          correlationId,
        );
    }
  } else {
    event.locals.session = null;
    event.locals.user = null;
  }
  let response: Response;
  try {
    response = await svelteKitHandler({ event, resolve, auth, building });
  } catch (caught) {
    if (production || process.env.JA_JSON_LOGS === 'true')
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'http.request.error',
          correlationId,
          method: event.request.method,
          path,
          durationMs: Date.now() - startedAt,
          error: caught instanceof Error ? caught.message : 'unknown error',
        }),
      );
    throw caught;
  }
  applySecurityHeaders(response, isPortal, path, correlationId);
  if (production || process.env.JA_JSON_LOGS === 'true')
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
        event: 'http.request',
        correlationId,
        method: event.request.method,
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
        userId: event.locals.user?.id,
        role: event.locals.user?.role,
      }),
    );
  return response;
};
