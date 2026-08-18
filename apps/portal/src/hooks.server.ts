import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { createDatabase } from '@ja/database';
import { readDemoToken } from '$lib/server/demo-session';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.endsWith('/api/auth/sign-up/email'))
    return new Response(JSON.stringify({ error: 'A valid single-use invitation is required.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  if (!building && event.url.pathname.includes('/app')) {
    const demoUserId = readDemoToken(event.cookies.get('ja_demo_session'));
    if (demoUserId) {
      const { sqlite } = createDatabase();
      try {
        const demoUser = sqlite
          .prepare(
            "SELECT id,name,email,role,status,mfa_enrolled mfaEnrolled FROM user WHERE id=? AND status='active'",
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
      event.locals.session = current?.session ?? null;
      event.locals.user = current?.user ?? null;
    }
  } else {
    event.locals.session = null;
    event.locals.user = null;
  }
  const response = await svelteKitHandler({ event, resolve, auth, building });
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
  return response;
};
