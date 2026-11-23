import { resolvePortalLocalePreference } from '$lib/i18n/context';
import { building } from '$app/environment';
import { auth, revokeSessionsUnlessUserIsActive } from '$lib/server/auth';
import {
  withTemporaryOwnerLogin,
  revokeExpiredTemporaryOwnerSessions,
} from '$lib/server/temporary-owner-login';
import { createDatabase } from '@ja/database';
import { supplierRouteAllowed } from '$lib/server/supplier-route-access';
import { createHash, randomUUID } from 'node:crypto';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { documentLanguage, portalText, type PortalLocale } from '$lib/portal-i18n';
import type { ProblemData } from '$lib/problem/contract';
import {
  isLinkedMailUser,
  linkedMailUserIdForEmail,
  linkedMailUserIdForResetToken,
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
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'self' blob:; object-src 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'";

function requestLocale(event: Parameters<Handle>[0]['event']): PortalLocale {
  return resolvePortalLocalePreference(
    event.url.searchParams.get('lang'),
    event.cookies.get('ja.portal.locale'),
    event.cookies.get('ja-portal-locale'),
  );
}

/**
 * Keep this guard before route loading while giving denied document requests a
 * usable remedy. T18: a browser navigation is sent to the in-app "restricted"
 * page (app shell, role-correct way back, contact link, coordinator/technician
 * copy for My Pay) instead of a bare HTML document; a SvelteKit client
 * navigation gets the same destination as a data redirect. Every other request
 * keeps the stable machine-readable 403.
 */
function operationalRestrictedLocation(route: string, locale: PortalLocale): string {
  const from = route.replace(/\/__data\.json$/u, '') || '/';
  return `${portalBase}/restricted?from=${encodeURIComponent(from)}&lang=${locale}`;
}

function operationalAccessDeniedResponse(
  profile: 'external_technician' | 'supplier_coordinator',
  locale: PortalLocale,
  request: Readonly<{ method: string; accept: string; dataRequest: boolean }>,
  correlationId: string,
  route = '',
): Response {
  const destination = profile === 'supplier_coordinator' ? 'supplier' : 'time';
  const href = `${portalBase}/${destination}?lang=${locale}`;
  const code = 'OPERATIONAL_ACCOUNT_ROUTE_RESTRICTED';
  const read = request.method === 'GET' || request.method === 'HEAD';
  if (read && request.dataRequest)
    return new Response(
      `${JSON.stringify({ type: 'redirect', location: operationalRestrictedLocation(route, locale) })}\n`,
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  if (read && request.accept.includes('text/html'))
    return new Response(null, {
      status: 303,
      headers: { location: operationalRestrictedLocation(route, locale) },
    });
  return new Response(
    JSON.stringify({
      code,
      messageKey: 'problem.operational.routeRestricted',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'return_to_work', href }, { id: 'contact_owner' }],
      correlationId,
    }),
    { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
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
  response.headers.set(
    'permissions-policy',
    path === `${portalBase}/workflow/capture`
      ? 'camera=(self), microphone=(self), on-device-speech-recognition=(self), geolocation=()'
      : 'camera=(self), microphone=(), geolocation=()',
  );
  const reportPreview = new RegExp(
    `^${portalBase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/reports/(?:period/)?[^/]+/preview$`,
    'u',
  ).test(path);
  response.headers.set('x-frame-options', reportPreview ? 'SAMEORIGIN' : 'DENY');
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
    // T18: "settings" is the person's own Profile (password, language, MFA) for
    // every role, never the owner/auditor-only audit log.
    [`${portalBase}/settings`]: { path: `${portalBase}/profile` },
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

const AUTH_RATE_WINDOW_MS = 15 * 60_000;

function authRateLimitMaximum(): number {
  const configuredMaximum = Number.parseInt(process.env.JA_AUTH_RATE_LIMIT_MAX ?? '', 10);
  return Number.isSafeInteger(configuredMaximum) &&
    configuredMaximum >= 1 &&
    configuredMaximum <= 10_000
    ? configuredMaximum
    : 10;
}

type AuthRateLimitSqlite = ReturnType<typeof createDatabase>['sqlite'];

/** Returns the live window for a bucket, or null when it is absent or expired. */
function liveBucket(
  sqlite: AuthRateLimitSqlite,
  bucketKey: string,
  now: number,
): { startedAt: number; count: number } | null {
  const row = sqlite
    .prepare('SELECT window_started_at,request_count FROM rate_limit_bucket WHERE bucket_key=?')
    .get(bucketKey) as { window_started_at: string; request_count: number } | undefined;
  if (!row) return null;
  const startedAt = Date.parse(row.window_started_at);
  if (!Number.isFinite(startedAt) || now - startedAt >= AUTH_RATE_WINDOW_MS) return null;
  return { startedAt, count: row.request_count };
}

function bumpBucket(sqlite: AuthRateLimitSqlite, bucketKey: string, now: number): void {
  if (liveBucket(sqlite, bucketKey, now)) {
    sqlite
      .prepare('UPDATE rate_limit_bucket SET request_count=request_count+1 WHERE bucket_key=?')
      .run(bucketKey);
    return;
  }
  sqlite
    .prepare(
      'INSERT INTO rate_limit_bucket(bucket_key,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=excluded.window_started_at,request_count=1',
    )
    .run(bucketKey, new Date(now).toISOString());
}

function withRateLimitTransaction<T>(work: (sqlite: AuthRateLimitSqlite) => T): T {
  const { sqlite } = createDatabase();
  try {
    sqlite.exec('BEGIN IMMEDIATE');
    const result = work(sqlite);
    sqlite.exec('COMMIT');
    return result;
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

function rateLimitedResponse(
  event: Parameters<Handle>[0]['event'],
  correlationId: string,
  startedAt: number,
  now: number,
): Response {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((AUTH_RATE_WINDOW_MS - (now - startedAt)) / 1000),
  );
  const signIn = event.url.pathname.startsWith(`${portalBase}/api/auth/sign-in/`);
  const problem: ProblemData & { error: string } = {
    error: 'Too many authentication attempts',
    code: signIn ? 'AUTH_SIGN_IN_RATE_LIMITED' : 'AUTH_REQUEST_RATE_LIMITED',
    messageKey: signIn ? 'problem.auth.signInRateLimited' : 'problem.auth.requestRateLimited',
    params: { retryAfterSeconds },
    fieldErrors: {},
    remedies: [{ id: 'wait_and_retry' }],
    correlationId,
  };
  return new Response(JSON.stringify(problem), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'retry-after': String(retryAfterSeconds),
    },
  });
}

/**
 * Password sign-in counts only FAILED attempts, keyed by client address plus the
 * normalized email, so people behind one NAT do not lock each other out. A looser
 * address-only ceiling (5x) still slows password spraying across many accounts.
 * A successful sign-in clears that account's counter.
 */
type SignInRateLimit = Readonly<{ limited: Response | null; record?: (status: number) => void }>;

async function signInRateLimit(
  event: Parameters<Handle>[0]['event'],
  correlationId: string,
): Promise<SignInRateLimit> {
  const address = event.getClientAddress();
  const endpoint = event.url.pathname.replace(/[^A-Za-z0-9/_-]/g, '_');
  const body = (await event.request
    .clone()
    .json()
    .catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const accountKey = createHash('sha256')
    .update(`auth-failed:${address}:${email}:${endpoint}`)
    .digest('hex');
  const addressKey = createHash('sha256')
    .update(`auth-failed-ip:${address}:${endpoint}`)
    .digest('hex');
  const maximum = authRateLimitMaximum();
  const addressMaximum = Math.min(maximum * 5, 50_000);
  const now = Date.now();
  const blocked = withRateLimitTransaction((sqlite) => {
    const account = liveBucket(sqlite, accountKey, now);
    if (account && account.count >= maximum) return account;
    const perAddress = liveBucket(sqlite, addressKey, now);
    if (perAddress && perAddress.count >= addressMaximum) return perAddress;
    return null;
  });
  if (blocked)
    return { limited: rateLimitedResponse(event, correlationId, blocked.startedAt, now) };
  return {
    limited: null,
    record(status: number) {
      const at = Date.now();
      if (status >= 200 && status < 300) {
        withRateLimitTransaction((sqlite) =>
          sqlite.prepare('DELETE FROM rate_limit_bucket WHERE bucket_key=?').run(accountKey),
        );
      } else if (status >= 400 && status < 500 && status !== 429) {
        withRateLimitTransaction((sqlite) => {
          bumpBucket(sqlite, accountKey, at);
          bumpBucket(sqlite, addressKey, at);
        });
      }
    },
  };
}

function authRateLimit(
  event: Parameters<Handle>[0]['event'],
  correlationId: string,
): Response | null {
  if (event.request.method === 'GET' || event.request.method === 'HEAD') return null;
  const address = event.getClientAddress();
  const endpoint = event.url.pathname.replace(/[^A-Za-z0-9/_-]/g, '_');
  const bucketKey = createHash('sha256').update(`auth:${address}:${endpoint}`).digest('hex');
  const now = Date.now();
  const maximumAttempts = authRateLimitMaximum();
  const blocked = withRateLimitTransaction((sqlite) => {
    const bucket = liveBucket(sqlite, bucketKey, now);
    if (bucket && bucket.count >= maximumAttempts) return bucket;
    bumpBucket(sqlite, bucketKey, now);
    return null;
  });
  return blocked ? rateLimitedResponse(event, correlationId, blocked.startedAt, now) : null;
}

async function denyWebmailPasswordMutation(
  event: Parameters<Handle>[0]['event'],
): Promise<Response | null> {
  const suffix = event.url.pathname.slice(`${portalBase}/api/auth`.length);
  if (suffix === '/change-password' || suffix === '/set-password') {
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (!session?.user?.id || !isLinkedMailUser(session.user.id)) return null;
  } else if (suffix === '/request-password-reset') {
    const body = (await event.request
      .clone()
      .json()
      .catch(() => null)) as { email?: unknown } | null;
    if (typeof body?.email !== 'string' || !linkedMailUserIdForEmail(body.email)) return null;
  } else if (suffix === '/reset-password') {
    const body = (await event.request
      .clone()
      .json()
      .catch(() => null)) as { token?: unknown } | null;
    const token =
      typeof body?.token === 'string' ? body.token : event.url.searchParams.get('token');
    if (!token || !linkedMailUserIdForResetToken(token)) return null;
  } else return null;

  return new Response(
    suffix === '/request-password-reset'
      ? JSON.stringify({
          status: true,
          message: 'If this email exists in our system, check your email for the reset link',
        })
      : JSON.stringify({
          code: 'WEBMAIL_PASSWORD_MANAGED_EXTERNALLY',
          message: 'Change this password from your portal profile; it updates Webmail too.',
        }),
    {
      status: suffix === '/request-password-reset' ? 200 : 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
}

/**
 * Minimal devalue-compatible encoder for the plain JSON-like data of an action
 * failure (objects, arrays, strings, finite numbers, booleans). SvelteKit's
 * enhanced forms decode action results with devalue.
 */
function encodeActionData(value: unknown): string {
  const table: unknown[] = [];
  const add = (item: unknown): number => {
    const index = table.length;
    table.push(null);
    if (Array.isArray(item)) table[index] = item.map(add);
    else if (item && typeof item === 'object')
      table[index] = Object.fromEntries(
        Object.entries(item as Record<string, unknown>).map(([key, entry]) => [key, add(entry)]),
      );
    else table[index] = item;
    return index;
  };
  add(value);
  return JSON.stringify(table);
}

/**
 * A page action without a live session (expired, revoked or signed out in
 * another tab) must not reach the action and become an uncaught 500. Enhanced
 * forms get a typed 401 failure so the page keeps every typed value and shows
 * "sign in again"; native form posts go to sign-in with a safe return path.
 */
function sessionExpiredActionResponse(
  event: Parameters<Handle>[0]['event'],
  correlationId: string,
): Response | null {
  if (event.request.method !== 'POST' || event.locals.user) return null;
  const route = event.url.pathname.slice(portalBase.length);
  if (/^\/(?:api|login|invite|accept-invitation)(?:\/|$)/u.test(route)) return null;
  const actionQuery = [...event.url.searchParams.keys()].find((key) => key.startsWith('/'));
  const actionName = actionQuery ? actionQuery.slice(1) : 'default';
  const locale = requestLocale(event);
  if (event.request.headers.get('x-sveltekit-action') === 'true') {
    const problem = {
      success: false,
      actionName,
      code: 'AUTH_SESSION_EXPIRED',
      messageKey: 'problem.session.expired',
      message: portalText(locale, 'problem.session.expired'),
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'sign_in_again' }],
      correlationId,
    };
    return new Response(
      JSON.stringify({ type: 'failure', status: 401, data: encodeActionData(problem) }),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
    );
  }
  const contentType = event.request.headers.get('content-type') ?? '';
  if (!/^(?:application\/x-www-form-urlencoded|multipart\/form-data)/u.test(contentType))
    return null;
  const returnTo = new URL(event.url);
  for (const key of [...returnTo.searchParams.keys()])
    if (key.startsWith('/')) returnTo.searchParams.delete(key);
  const login = new URL(`${portalBase}/login`, event.url.origin);
  login.searchParams.set('reason', 'session-expired');
  login.searchParams.set('returnTo', returnTo.pathname + returnTo.search);
  login.searchParams.set('lang', locale);
  return new Response(null, {
    status: 303,
    headers: { location: login.pathname + login.search, 'cache-control': 'no-store' },
  });
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
  if (!building && isPortal) revokeExpiredTemporaryOwnerSessions();
  const isInvitationAccept = path === `${portalBase}/api/invitations/accept`;
  // The profile password form verifies the current password, so it shares the
  // authentication rate limit.
  const isPasswordChange = path === `${portalBase}/profile/password`;
  const isPasswordSignIn = path === `${portalBase}/api/auth/sign-in/email`;
  let signInLimit: SignInRateLimit | null = null;
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
    (isAuth || isInvitationAccept || isPasswordChange) &&
    event.request.method !== 'GET' &&
    event.request.method !== 'HEAD'
  ) {
    if (isPasswordSignIn) {
      signInLimit = await signInRateLimit(event, correlationId);
      if (signInLimit.limited)
        return applySecurityHeaders(signInLimit.limited, isPortal, path, correlationId);
    } else {
      const limited = authRateLimit(event, correlationId);
      if (limited) return applySecurityHeaders(limited, isPortal, path, correlationId);
    }
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
    if (currentUser) {
      const { sqlite } = createDatabase();
      try {
        const profile = sqlite
          .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
          .get(currentUser.id) as
          | { profile: 'external_technician' | 'supplier_coordinator' }
          | undefined;
        if (profile) {
          event.locals.user!.workforceProfile = profile.profile;
          const route = path.slice(portalBase.length);
          if (!supplierRouteAllowed(route, profile.profile))
            return applySecurityHeaders(
              operationalAccessDeniedResponse(
                profile.profile,
                requestLocale(event),
                {
                  method: event.request.method,
                  accept: event.request.headers.get('accept') ?? '',
                  dataRequest: /\/__data\.json$/u.test(route),
                },
                correlationId,
                route,
              ),
              true,
              path,
              correlationId,
            );
          if (route === '' || route === '/' || route === '/__data.json')
            return applySecurityHeaders(
              new Response(null, {
                status: 303,
                headers: {
                  location: `${portalBase}/${profile.profile === 'supplier_coordinator' ? 'supplier' : 'time'}?lang=${requestLocale(event)}`,
                },
              }),
              true,
              path,
              correlationId,
            );
        }
      } finally {
        sqlite.close();
      }
    }
  } else {
    event.locals.session = null;
    event.locals.user = null;
  }
  if (!building && isPortal) {
    const expired = sessionExpiredActionResponse(event, correlationId);
    if (expired) return applySecurityHeaders(expired, true, path, correlationId);
  }
  let response: Response;
  try {
    response = await withTemporaryOwnerLogin(event.request, portalBase, async (request) => {
      event.request = request;
      return svelteKitHandler({ event, resolve, auth, building });
    });
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
  signInLimit?.record?.(response.status);
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
