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
    sqlite: { prepare: () => ({ get: mocks.profile }), close: vi.fn() },
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
  it.each([
    ['supplier_coordinator', '/supplier?lang=es', 'Proveedor'],
    ['external_technician', '/time?lang=es', 'Horas'],
  ] as const)(
    'returns a localized 403 and allowed remedy for %s',
    async (profile, suffix, label) => {
      mocks.profile.mockReturnValue({ profile });
      const resolve = vi.fn(() => new Response('restricted projection'));
      const response = await handle({
        event: requestFor('/finance', 'text/html', 'es'),
        resolve,
      } as never);
      const body = await response.text();

      expect(response.status).toBe(403);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-correlation-id')).toBeTruthy();
      expect(body).toContain('<html lang="es-ES">');
      expect(body).toContain('Acceso restringido');
      expect(body).toContain('Tu cuenta no tiene acceso');
      expect(body).toContain('Consultar a un propietario');
      expect(body).toContain(`href="/j-aautomation/app${suffix}">${label}</a>`);
      expect(body).not.toContain('href="/j-aautomation/app/finance');
      expect(body).not.toContain('restricted projection');
      expect(body).not.toContain('Operational account: access denied');
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('returns a stable machine-readable 403 for denied data requests', async () => {
    mocks.profile.mockReturnValue({ profile: 'supplier_coordinator' });
    const response = await handle({
      event: requestFor('/finance/__data.json?lang=pt', 'application/json'),
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
