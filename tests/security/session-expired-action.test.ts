import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(() => new Response('downstream')) }));

vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$lib/server/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
  revokeSessionsUnlessUserIsActive: vi.fn(),
}));
vi.mock('$lib/server/temporary-owner-login', () => ({
  withTemporaryOwnerLogin: (request: Request, _base: string, next: (r: Request) => unknown) =>
    next(request),
  revokeExpiredTemporaryOwnerSessions: vi.fn(),
}));
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: async ({
    event,
    resolve,
  }: {
    event: unknown;
    resolve: (e: unknown) => Response;
  }) => resolve(event),
}));

const { handle } = await import('../../apps/portal/src/hooks.server.js');

function post(path: string, headers: Record<string, string>) {
  const url = new URL(`http://localhost/j-aautomation/app${path}`);
  return handle({
    event: {
      url,
      request: new Request(url, {
        method: 'POST',
        headers: { origin: url.origin, 'x-correlation-id': 'session-test-123456', ...headers },
        body: 'cells=%5B%5D',
      }),
      locals: {},
      cookies: { get: () => undefined },
      getClientAddress: () => '198.51.100.9',
    },
    resolve: mocks.resolve,
  } as never);
}

/** Decodes the flat devalue table SvelteKit uses for action data. */
function decode(table: unknown[]): unknown {
  const read = (index: number): unknown => {
    const value = table[index];
    if (Array.isArray(value)) return value.map((entry) => read(entry as number));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, read(entry as number)]),
      );
    return value;
  };
  return read(0);
}

describe('page action without a live session', () => {
  it('returns a typed 401 action failure instead of reaching the action (no 500)', async () => {
    mocks.resolve.mockClear();
    const response = await post('/time?/saveTimeWeek', {
      'x-sveltekit-action': 'true',
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = (await response.json()) as { type: string; status: number; data: string };
    expect(body.type).toBe('failure');
    expect(body.status).toBe(401);
    expect(decode(JSON.parse(body.data))).toMatchObject({
      success: false,
      actionName: 'saveTimeWeek',
      code: 'AUTH_SESSION_EXPIRED',
      messageKey: 'problem.session.expired',
      remedies: [{ id: 'sign_in_again' }],
      correlationId: 'session-test-123456',
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('sends a native form post to sign-in with a safe return path', async () => {
    const response = await post('/expenses?/createExpense&project=p1', {
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!, 'http://localhost');
    expect(location.pathname).toBe('/j-aautomation/app/login');
    expect(location.searchParams.get('reason')).toBe('session-expired');
    expect(location.searchParams.get('returnTo')).toBe('/j-aautomation/app/expenses?project=p1');
  });

  it('leaves API endpoints and the invitation page to their own handling', async () => {
    mocks.resolve.mockClear();
    await post('/api/notifications/read', { 'content-type': 'application/json' });
    await post('/invite/some-token', {
      'x-sveltekit-action': 'true',
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });
});
