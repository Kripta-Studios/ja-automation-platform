import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.endsWith('/api/auth/sign-up/email'))
    return new Response(JSON.stringify({ error: 'A valid single-use invitation is required.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  if (!building && event.url.pathname.includes('/app')) {
    const current = await auth.api.getSession({ headers: event.request.headers });
    event.locals.session = current?.session ?? null;
    event.locals.user = current?.user ?? null;
  } else {
    event.locals.session = null;
    event.locals.user = null;
  }
  const response = await svelteKitHandler({ event, resolve, auth, building });
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
  response.headers.set(
    'content-security-policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  return response;
};
