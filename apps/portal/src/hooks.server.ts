import { building } from '$app/environment';
import { auth, revokeSessionsUnlessUserIsActive } from '$lib/server/auth';
import { createDatabase } from '@ja/database';
import { createHash, randomUUID } from 'node:crypto';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { documentLanguage, normalizePortalLocale, type PortalLocale } from '$lib/portal-i18n';
import {
  isWebmailOnlyUser,
  webmailOnlyUserIdForEmail,
  webmailOnlyUserIdForResetToken,
} from '$lib/server/webmail-password';

function normalizeBasePath(value: string | undefined, fallback: string): string {
  const candidate = (value?.trim() || fallback).split(/[?#]/u, 1)[0] ?? fallback;
  const withoutOuterSlashes = candidate.replace(/^\/+|\/+$/gu, '');
  return withoutOuterSlashes ? `/${withoutOuterSlashes}` : '';
}

const publicBase = normalizeBasePath(process.env.JA_PUBLIC_BASE_PATH, '/j-aautomation');
const portalBase = normalizeBasePath(process.env.JA_PORTAL_BASE_PATH, `${publicBase || ''}/app`);
const production = process.env.NODE_ENV === 'production';
const portalCsp =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'";

function requestLocale(event: Parameters<Handle>[0]['event']): PortalLocale {
  const requested =
    event.url.searchParams.get('lang') ??
    event.cookies.get('ja.portal.locale') ??
    event.cookies.get('ja-portal-locale');
  return normalizePortalLocale(requested);
}

async function applyServerDocumentLocale(
  response: Response,
  locale: PortalLocale,
): Promise<Response> {
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  const body = await response.text();
  const language = documentLanguage(locale);
  const html = body.replace(/<html\b([^>]*)>/i, (_match, attributes: string) => {
    const withoutLanguage = attributes.replace(/\s+lang\s*=\s*(['"])[^'\"]*\1/i, '');
    return `<html lang="${language}"${withoutLanguage}>`;
  });
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applySecurityHeaders(
  response: Response,
  isPortal: boolean,
  path: string,
  correlationId: string,
): Response {
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set(
    'referrer-policy',
    path.startsWith(`${portalBase}/invite/`) || path === `${portalBase}/api/invitations/accept`
      ? 'no-referrer'
      : 'strict-origin-when-cross-origin',
  );
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

function requestLogPath(path: string): string {
  const invitationPrefix = `${portalBase}/invite/`;
  return path.startsWith(invitationPrefix) ? `${invitationPrefix}[REDACTED]` : path;
}

/**
 * Keep the historical public login URL useful after the portal acquired its
 * `/app` boundary.  The redirect is deliberately exact: API paths and any
 * other public route must continue through the normal SvelteKit handler.
 */
function legacyLoginRedirect(event: Parameters<Handle>[0]['event']): Response | null {
  const legacyPath = publicBase ? `${publicBase}/login` : '/login';
  const canonicalPath = portalBase ? `${portalBase}/login` : '/login';
  if (event.url.pathname !== legacyPath || legacyPath === canonicalPath) return null;

  const target = new URL(canonicalPath, event.url.origin);
  // URL.search is already encoded by the platform; assigning it preserves
  // repeated keys and avoids interpreting user input as a redirect target.
  target.search = event.url.search;
  // Construct the response explicitly instead of using Response.redirect:
  // Node's redirect helper exposes immutable headers, while the common
  // security-header path must add the correlation and cache headers below.
  return new Response(null, {
    status: 307,
    headers: { location: target.toString() },
  });
}

/**
 * Keep common, user-guessable portal URLs useful without creating duplicate
 * section implementations. The match is exact so nested resources and API
 * endpoints always continue through SvelteKit's normal authorization path.
 */
function canonicalPortalAliasRedirect(event: Parameters<Handle>[0]['event']): Response | null {
  const aliases: Readonly<Record<string, Readonly<{ path: string; view?: string }>>> = {
    [`${portalBase}/invoices`]: { path: `${portalBase}/billing` },
    [`${portalBase}/settings`]: { path: `${portalBase}/audit` },
    [`${portalBase}/team`]: { path: `${portalBase}/projects`, view: 'team' },
    [`${portalBase}/clients`]: { path: `${portalBase}/projects`, view: 'clients' },
  };
  const alias = aliases[event.url.pathname];
  if (!alias) return null;
  const target = new URL(alias.path, event.url.origin);
  target.search = event.url.search;
  if (alias.view) target.searchParams.set('view', alias.view);
  return new Response(null, { status: 307, headers: { location: target.toString() } });
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
    sqlite.exec('BEGIN IMMEDIATE');
    const row = sqlite
      .prepare('SELECT window_started_at,request_count FROM rate_limit_bucket WHERE bucket_key=?')
      .get(bucketKey) as { window_started_at: string; request_count: number } | undefined;
    if (!row || now - Date.parse(row.window_started_at) >= windowMs) {
      sqlite
        .prepare(
          'INSERT INTO rate_limit_bucket(bucket_key,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=excluded.window_started_at,request_count=1',
        )
        .run(bucketKey, new Date(now).toISOString());
      sqlite.exec('COMMIT');
      return null;
    }
    const configuredMaximum = Number.parseInt(process.env.JA_AUTH_RATE_LIMIT_MAX ?? '', 10);
    const maximumAttempts =
      Number.isSafeInteger(configuredMaximum) &&
      configuredMaximum >= 1 &&
      configuredMaximum <= 10_000
        ? configuredMaximum
        : 10;
    if (row.request_count >= maximumAttempts) {
      sqlite.exec('COMMIT');
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
    }
    sqlite
      .prepare('UPDATE rate_limit_bucket SET request_count=request_count+1 WHERE bucket_key=?')
      .run(bucketKey);
    sqlite.exec('COMMIT');
    return null;
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original rate-limit failure.
    }
    throw error;
  } finally {
    sqlite.close();
  }
}

async function denyWebmailPasswordMutation(
  event: Parameters<Handle>[0]['event'],
): Promise<Response | null> {
  const suffix = event.url.pathname.slice(`${portalBase}/api/auth`.length);
  if (suffix === '/change-password' || suffix === '/set-password') {
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (!session?.user?.id || !isWebmailOnlyUser(session.user.id)) return null;
  } else if (suffix === '/request-password-reset') {
    const body = (await event.request
      .clone()
      .json()
      .catch(() => null)) as { email?: unknown } | null;
    if (typeof body?.email !== 'string' || !webmailOnlyUserIdForEmail(body.email)) return null;
  } else if (suffix === '/reset-password') {
    const body = (await event.request
      .clone()
      .json()
      .catch(() => null)) as { token?: unknown } | null;
    const token =
      typeof body?.token === 'string' ? body.token : event.url.searchParams.get('token');
    if (!token || !webmailOnlyUserIdForResetToken(token)) return null;
  } else return null;

  return new Response(
    suffix === '/request-password-reset'
      ? JSON.stringify({
          status: true,
          message: 'If this email exists in our system, check your email for the reset link',
        })
      : JSON.stringify({
          code: 'WEBMAIL_PASSWORD_MANAGED_EXTERNALLY',
          message: 'Password changes for this account are managed by Webmail.',
        }),
    {
      status: suffix === '/request-password-reset' ? 200 : 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  const startedAt = Date.now();
  const suppliedCorrelationId = event.request.headers.get('x-correlation-id')?.trim() ?? '';
  const correlationId = /^[A-Za-z0-9._:-]{8,96}$/.test(suppliedCorrelationId)
    ? suppliedCorrelationId
    : randomUUID();
  event.locals.correlationId = correlationId;
  const path = event.url.pathname;
  const legacyLogin = legacyLoginRedirect(event);
  if (legacyLogin) return applySecurityHeaders(legacyLogin, false, path, correlationId);
  const portalAlias = canonicalPortalAliasRedirect(event);
  if (portalAlias) return applySecurityHeaders(portalAlias, true, path, correlationId);
  const isPortal = path === portalBase || path.startsWith(`${portalBase}/`);
  const isAuth = path.startsWith(`${portalBase}/api/auth/`);
  const isInvitationAccept = path === `${portalBase}/api/invitations/accept`;
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
  if (isPortal && event.request.method !== 'GET' && event.request.method !== 'HEAD' && !isAuth) {
    const origin = event.request.headers.get('origin');
    const referer = event.request.headers.get('referer');
    let refererOrigin: string | null = null;
    if (referer) {
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        refererOrigin = null;
      }
    }
    if (
      (origin && origin !== event.url.origin) ||
      (!origin && (!refererOrigin || refererOrigin !== event.url.origin))
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
  if (
    (isAuth || isInvitationAccept) &&
    event.request.method !== 'GET' &&
    event.request.method !== 'HEAD'
  ) {
    const limited = authRateLimit(event);
    if (limited) return applySecurityHeaders(limited, isPortal, path, correlationId);
    if (isAuth) {
      const deniedPasswordMutation = await denyWebmailPasswordMutation(event);
      if (deniedPasswordMutation)
        return applySecurityHeaders(deniedPasswordMutation, isPortal, path, correlationId);
    }
  }
  if (!building && isPortal) {
    const current = await auth.api.getSession({ headers: event.request.headers });
    let currentUser: App.Locals['user'] = null;
    if (current?.session && current.user) {
      currentUser = revokeSessionsUnlessUserIsActive(current.session.userId);
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
          path: requestLogPath(path),
          durationMs: Date.now() - startedAt,
          error: caught instanceof Error ? caught.message : 'unknown error',
        }),
      );
    throw caught;
  }
  if (isPortal) response = await applyServerDocumentLocale(response, requestLocale(event));
  applySecurityHeaders(response, isPortal, path, correlationId);
  if (production || process.env.JA_JSON_LOGS === 'true')
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
        event: 'http.request',
        correlationId,
        method: event.request.method,
        path: requestLogPath(path),
        status: response.status,
        durationMs: Date.now() - startedAt,
        userId: event.locals.user?.id,
        role: event.locals.user?.role,
      }),
    );
  return response;
};
