import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buckets: new Map<string, { window_started_at: string; request_count: number }>(),
  handler: vi.fn(),
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$lib/server/auth', () => ({ auth: {}, revokeSessionsUnlessUserIsActive: vi.fn() }));
vi.mock('@ja/database', () => ({
  createDatabase: () => ({
    sqlite: {
      exec: vi.fn(),
      close: vi.fn(),
      prepare: (sql: string) => ({
        get: (key: string) => mocks.buckets.get(key),
        run: (key: string, startedAt?: string) => {
          if (sql.startsWith('INSERT INTO rate_limit_bucket')) {
            mocks.buckets.set(key, { window_started_at: startedAt!, request_count: 1 });
          } else if (sql.startsWith('UPDATE rate_limit_bucket')) {
            mocks.buckets.get(key)!.request_count += 1;
          } else if (sql.startsWith('DELETE FROM rate_limit_bucket')) {
            mocks.buckets.delete(key);
          }
        },
      }),
    },
  }),
}));
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: mocks.handler.mockImplementation(
    async ({ event, resolve }: { event: unknown; resolve: (event: unknown) => Response }) =>
      resolve(event),
  ),
}));

const { handle } = await import('../../apps/portal/src/hooks.server.js');

function authEvent(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  email = 'private@example.test',
  address = '198.51.100.3',
) {
  const url = new URL(`http://localhost/j-aautomation/app${path}`);
  return {
    url,
    request: new Request(url, {
      method,
      headers: {
        'x-correlation-id': 'auth-test-reference-123',
        ...(method === 'POST' ? { origin: url.origin } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ email, password: 'secret-value' }) } : {}),
    }),
    locals: {},
    cookies: { get: () => undefined },
    getClientAddress: () => address,
  };
}

async function request(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  options: { status?: number; email?: string; address?: string } = {},
) {
  return handle({
    event: authEvent(path, method, options.email, options.address),
    resolve: vi.fn(() => new Response('downstream', { status: options.status ?? 200 })),
  } as never);
}

const signIn = '/api/auth/sign-in/email';

beforeEach(() => {
  mocks.buckets.clear();
  mocks.handler.mockClear();
  vi.stubEnv('JA_AUTH_RATE_LIMIT_MAX', '1');
});

afterEach(() => vi.unstubAllEnvs());

describe('auth rate-limit problem contract', () => {
  it.each([
    ['/api/auth/sign-in/email', 'AUTH_SIGN_IN_RATE_LIMITED', 'problem.auth.signInRateLimited'],
    [
      '/api/auth/request-password-reset',
      'AUTH_REQUEST_RATE_LIMITED',
      'problem.auth.requestRateLimited',
    ],
    ['/api/invitations/accept', 'AUTH_REQUEST_RATE_LIMITED', 'problem.auth.requestRateLimited'],
  ])('returns a typed, safe 429 for %s after the first request', async (path, code, messageKey) => {
    // Sign-in only counts failed attempts; the other endpoints count every request.
    const status = path === signIn ? 401 : 200;
    expect((await request(path, 'POST', { status })).status).toBe(status);
    const response = await request(path, 'POST', { status });
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(900);
    expect(body).toEqual({
      error: 'Too many authentication attempts',
      code,
      messageKey,
      params: { retryAfterSeconds },
      fieldErrors: {},
      remedies: [{ id: 'wait_and_retry' }],
      correlationId: response.headers.get('x-correlation-id'),
    });
    expect(JSON.stringify(body)).not.toMatch(/private@example\.test|secret-value|198\.51\.100\.3/u);
    expect(mocks.handler).toHaveBeenCalledTimes(1);
  });

  it('does not rate-limit auth GET requests', async () => {
    expect((await request('/api/auth/get-session', 'GET')).status).toBe(200);
    expect((await request('/api/auth/get-session', 'GET')).status).toBe(200);
    expect(mocks.buckets.size).toBe(0);
  });

  it('does not count successful sign-ins', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect((await request(signIn, 'POST', { status: 200 })).status).toBe(200);
    expect(mocks.handler).toHaveBeenCalledTimes(5);
  });

  it('keys failed sign-ins by address plus email, so colleagues on one NAT are not locked out', async () => {
    expect((await request(signIn, 'POST', { status: 401, email: 'a@example.test' })).status).toBe(
      401,
    );
    expect((await request(signIn, 'POST', { status: 401, email: 'a@example.test' })).status).toBe(
      429,
    );
    expect((await request(signIn, 'POST', { status: 200, email: 'b@example.test' })).status).toBe(
      200,
    );
    expect(
      (
        await request(signIn, 'POST', {
          status: 401,
          email: 'A@Example.test ',
          address: '198.51.100.3',
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await request(signIn, 'POST', {
          status: 401,
          email: 'a@example.test',
          address: '203.0.113.7',
        })
      ).status,
    ).toBe(401);
  });

  it('keeps a looser address-only ceiling against password spraying', async () => {
    vi.stubEnv('JA_AUTH_RATE_LIMIT_MAX', '2');
    for (let index = 0; index < 10; index += 1)
      expect(
        (await request(signIn, 'POST', { status: 401, email: `spray${index}@example.test` }))
          .status,
      ).toBe(401);
    expect(
      (await request(signIn, 'POST', { status: 200, email: 'fresh@example.test' })).status,
    ).toBe(429);
  });

  it('resets the account counter after a successful sign-in', async () => {
    vi.stubEnv('JA_AUTH_RATE_LIMIT_MAX', '2');
    expect((await request(signIn, 'POST', { status: 401 })).status).toBe(401);
    expect((await request(signIn, 'POST', { status: 200 })).status).toBe(200);
    expect((await request(signIn, 'POST', { status: 401 })).status).toBe(401);
    expect((await request(signIn, 'POST', { status: 401 })).status).toBe(401);
    expect((await request(signIn, 'POST', { status: 401 })).status).toBe(429);
  });
});
