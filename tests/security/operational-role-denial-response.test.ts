import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  activeUser: vi.fn(),
  profile: vi.fn(),
}));

vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$lib/server/auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
  revokeSessionsUnlessUserIsActive: mocks.activeUser,
}));
vi.mock('@ja/database', () => ({
  createDatabase: () => ({
    sqlite: { prepare: () => ({ get: mocks.profile, all: () => [], run: vi.fn() }), close: vi.fn() },
  }),
}));
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: async ({
    event,
    resolve,
  }: {
    event: unknown;
    resolve: (event: unknown) => Response;
  }) => resolve(event),
}));

const { handle } = await import('../../apps/portal/src/hooks.server.js');

function requestFor(path: string, accept = 'text/html', cookieLocale?: string) {
  const url = new URL(`http://localhost/j-aautomation/app${path}`);
  return {
    url,
    request: new Request(url, { headers: { accept } }),
    locals: {},
    cookies: { get: (name: string) => (name === 'ja.portal.locale' ? cookieLocale : undefined) },
    getClientAddress: () => '198.51.100.3',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ session: { userId: 'operational-user' }, user: {} });
  mocks.activeUser.mockReturnValue({ id: 'operational-user', role: 'worker', status: 'active' });
});

describe('operational account route denial', () => {
  it.each(['supplier_coordinator', 'external_technician'] as const)(
    'sends a denied page navigation of %s to the in-app restricted page (T18)',
    async (profile) => {
      mocks.profile.mockReturnValue({ profile });
      const resolve = vi.fn(() => new Response('restricted projection'));
      const response = await handle({
        event: requestFor('/finance?lang=es', 'text/html', 'es'),
        resolve,
      } as never);

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        '/j-aautomation/app/restricted?from=%2Ffinance&lang=es',
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-correlation-id')).toBeTruthy();
      expect(await response.text()).not.toContain('restricted projection');
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('sends My Pay for supplier people to the restricted page with its own explanation', async () => {
    mocks.profile.mockReturnValue({ profile: 'supplier_coordinator' });
    const resolve = vi.fn(() => new Response('restricted projection'));
    const response = await handle({
      event: requestFor('/pay', 'text/html', 'en'),
      resolve,
    } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/j-aautomation/app/restricted?from=%2Fpay&lang=en',
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('answers a denied client-side navigation with a SvelteKit data redirect', async () => {
    mocks.profile.mockReturnValue({ profile: 'external_technician' });
    const resolve = vi.fn(() => new Response('restricted projection'));
    const response = await handle({
      event: requestFor('/projects/other/__data.json?x-sveltekit-invalidated=01', '*/*', 'pt'),
      resolve,
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: 'redirect',
      location: '/j-aautomation/app/restricted?from=%2Fprojects%2Fother&lang=pt',
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('recognises a SvelteKit data request by its flag (event.url has no __data.json)', async () => {
    mocks.profile.mockReturnValue({ profile: 'external_technician' });
    const event = { ...requestFor('/finance', '*/*', 'es'), isDataRequest: true };
    const response = await handle({ event, resolve: vi.fn() } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: 'redirect',
      location: '/j-aautomation/app/restricted?from=%2Ffinance&lang=es',
    });
  });

  it('returns a stable machine-readable 403 for denied API requests', async () => {
    mocks.profile.mockReturnValue({ profile: 'supplier_coordinator' });
    const response = await handle({
      event: requestFor('/api/worker-statement?lang=pt', 'application/json'),
      resolve: vi.fn(() => new Response('restricted projection')),
    } as never);

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      code: 'OPERATIONAL_ACCOUNT_ROUTE_RESTRICTED',
      messageKey: 'problem.operational.routeRestricted',
      params: {},
      fieldErrors: {},
      remedies: [
        { id: 'return_to_work', href: '/j-aautomation/app/supplier?lang=pt' },
        { id: 'contact_owner' },
      ],
      correlationId: response.headers.get('x-correlation-id'),
    });
  });

  it('preserves allowed operational routes for downstream object authorization', async () => {
    mocks.profile.mockReturnValue({ profile: 'external_technician' });
    const resolve = vi.fn(() => new Response('allowed projection'));
    const response = await handle({ event: requestFor('/time'), resolve } as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('allowed projection');
    expect(resolve).toHaveBeenCalledOnce();
  });
});
