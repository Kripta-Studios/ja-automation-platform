import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  revokeSessionsUnlessUserIsActive: vi.fn(),
}));

vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$lib/server/auth', () => ({
  auth: { api: { getSession: authMocks.getSession } },
  revokeSessionsUnlessUserIsActive: authMocks.revokeSessionsUnlessUserIsActive,
}));
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: vi.fn(
    async ({ event, resolve }: { event: unknown; resolve: (event: unknown) => Response }) =>
      resolve(event),
  ),
}));

const previousNodeEnv = process.env.NODE_ENV;
const previousTenantId = process.env.JA_TENANT_ID;
const previousDeploymentId = process.env.JA_DEPLOYMENT_ID;
const unenrolledUser = {
  id: 'owner',
  name: 'Owner',
  email: 'antonny.luty@j-aautomation.com',
  role: 'owner_admin',
  status: 'active',
  mfaRequired: false,
  mfaEnrolled: false,
};

async function handleFor(nodeEnv: string) {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  return (await import('../../apps/portal/src/hooks.server.js')).handle;
}

function eventFor(path: string, options?: { method?: string; accept?: string; origin?: string }) {
  const url = new URL(`http://localhost${path}`);
  const method = options?.method ?? 'GET';
  const headers = new Headers();
  if (options?.accept) headers.set('accept', options.accept);
  if (options?.origin) headers.set('origin', options.origin);
  return {
    url,
    request: new Request(url, { method, headers }),
    locals: {},
    cookies: { get: () => undefined },
    getClientAddress: () => '198.51.100.4',
  };
}

beforeEach(() => {
  process.env.JA_TENANT_ID = 'mfa-gate-test';
  process.env.JA_DEPLOYMENT_ID = 'mfa-gate-test';
  authMocks.getSession.mockReset();
  authMocks.revokeSessionsUnlessUserIsActive.mockReset();
  authMocks.getSession.mockReturnValue({ session: { userId: 'owner', id: 'session-1' }, user: {} });
  authMocks.revokeSessionsUnlessUserIsActive.mockReturnValue(unenrolledUser);
});

afterEach(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousTenantId === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousTenantId;
  if (previousDeploymentId === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousDeploymentId;
});

describe('optional MFA session behavior', () => {
  it('allows an unenrolled user to reach normal portal navigation', async () => {
    const handle = await handleFor('production');
    const resolve = vi.fn(() => new Response('portal projection'));

    const response = await handle({
      event: eventFor('/j-aautomation/app/', { accept: 'text/html' }),
      resolve,
    } as never);

    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('allows an unenrolled user to reach normal portal API and action requests', async () => {
    const handle = await handleFor('production');
    const resolve = vi.fn(() => new Response('portal projection'));

    for (const candidate of [
      eventFor('/j-aautomation/app/api/projects'),
      eventFor('/j-aautomation/app/projects/owner', { method: 'POST', origin: 'http://localhost' }),
    ]) {
      const response = await handle({ event: candidate, resolve } as never);
      expect(response.status).toBe(200);
    }
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('keeps optional enrollment and ordinary session/static requests reachable', async () => {
    const handle = await handleFor('production');
    const resolve = vi.fn(() => new Response('allowed'));
    const allowed = [
      eventFor('/j-aautomation/app/mfa-enrollment', { accept: 'text/html' }),
      eventFor('/j-aautomation/app/api/security/mfa', {
        method: 'POST',
        origin: 'http://localhost',
      }),
      eventFor('/j-aautomation/app/api/auth/get-session'),
      eventFor('/j-aautomation/app/api/auth/sign-out'),
      eventFor('/j-aautomation/app/_app/immutable/entry/start.abc123.js'),
      eventFor('/j-aautomation/app/logo.png'),
    ];

    for (const event of allowed)
      expect((await handle({ event, resolve } as never)).status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(allowed.length);
  });

  it('does not add MFA-specific restrictions to dynamic or static portal paths', async () => {
    const handle = await handleFor('production');
    const resolve = vi.fn(() => new Response('portal projection'));
    for (const event of [
      eventFor('/j-aautomation/app/projects/export.js'),
      eventFor('/j-aautomation/app/actions/avatar.png', {
        method: 'POST',
        origin: 'http://localhost',
      }),
      eventFor('/j-aautomation/app/_app/immutable/entry/start.abc123.js', {
        method: 'POST',
        origin: 'http://localhost',
      }),
    ]) {
      const response = await handle({ event, resolve } as never);
      expect(response.status).toBe(200);
    }

    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('keeps enrolled, non-production, and inactive sessions out of the enrollment fence', async () => {
    const resolve = vi.fn(() => new Response('portal projection'));
    authMocks.revokeSessionsUnlessUserIsActive.mockReturnValue({
      ...unenrolledUser,
      mfaEnrolled: true,
    });
    expect(
      (
        await (
          await handleFor('production')
        )({
          event: eventFor('/j-aautomation/app/', { accept: 'text/html' }),
          resolve,
        } as never)
      ).status,
    ).toBe(200);

    authMocks.revokeSessionsUnlessUserIsActive.mockReturnValue(unenrolledUser);
    expect(
      (
        await (
          await handleFor('test')
        )({
          event: eventFor('/j-aautomation/app/', { accept: 'text/html' }),
          resolve,
        } as never)
      ).status,
    ).toBe(200);

    authMocks.revokeSessionsUnlessUserIsActive.mockReturnValue(null);
    expect(
      (
        await (
          await handleFor('production')
        )({
          event: eventFor('/j-aautomation/app/', { accept: 'text/html' }),
          resolve,
        } as never)
      ).status,
    ).toBe(200);
  });
});
