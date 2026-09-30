import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({ base: '/j-aautomation' }));
import { GET } from '../../apps/portal/src/routes/app/service-worker.js/+server';

const origin = 'https://portal.test';
const scope = '/j-aautomation/app/';
const partition = 'ja-portal-private-v3-tenant-deployment-worker';
const legacyPartition = 'ja-portal-private-tenant-deployment-worker';
const otherPartition = 'ja-portal-private-v3-tenant-deployment-other';
const otherLegacyPartition = 'ja-portal-private-tenant-deployment-other';
const tokenFor = (user = 'worker') =>
  `${Buffer.from(JSON.stringify({ sub: user, tenantId: 'tenant', deploymentId: 'deployment', sid: 'session', exp: Date.now() + 86_400_000 })).toString('base64url')}.signature`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

async function serviceWorker() {
  vi.stubEnv('JA_OFFLINE_ENABLED', 'true');
  const token = tokenFor();
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  let offline = false;
  let deleteFails = false;
  let putGate: Promise<void> | undefined;
  let localeCookie = '';
  let identityCookie: string | undefined = token;
  const claim = vi.fn(async () => undefined);
  let network: (request: Request) => Promise<Response> = async () => new Response('authorized');
  const deletes: string[] = [];
  const puts: string[] = [];
  const fetches: (Request | string)[] = [];
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        put: async (request: Request, response: Response) => {
          puts.push(request.url);
          if (putGate) await putGate;
          store.set(request.url, response.clone());
        },
        match: async (request: Request) => store.get(request.url)?.clone(),
      };
    },
    delete: async (name: string) => {
      deletes.push(name);
      if (deleteFails) throw new Error('Cache Storage unavailable');
      return stores.delete(name);
    },
    keys: async () => [...stores.keys()],
  };
  const fetcher = async (input: Request | string) => {
    fetches.push(input);
    if (offline) throw new Error('Offline');
    const request = typeof input === 'string' ? new Request(origin + input) : input;
    if (request.url.endsWith('/api/offline/identity'))
      return Response.json({
        token,
        userId: 'worker',
        tenantId: 'tenant',
        deploymentId: 'deployment',
      });
    return network(request);
  };
  const self = {
    location: { origin },
    cookieStore: {
      get: async (name: string) => ({
        value: name === 'ja_offline_identity' ? identityCookie : localeCookie,
      }),
    },
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
      listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim },
  };
  runInNewContext(await GET().text(), {
    self,
    caches,
    fetch: fetcher,
    Request,
    Response,
    URL,
    atob,
  });
  return {
    stores,
    caches,
    deletes,
    puts,
    fetches,
    claim,
    fetchEvent: (url: string, method = 'GET') => {
      let response: Promise<Response> | undefined;
      const work: Promise<unknown>[] = [];
      listeners.get('fetch')!({
        request: new Request(url, { method }),
        respondWith: (value: Promise<Response>) => (response = value),
        waitUntil: (value: Promise<unknown>) => work.push(value),
      });
      return { response, work };
    },
    setIdentityCookie: (value?: string) => (identityCookie = value),
    activate: async () => {
      let work!: Promise<void>;
      listeners.get('activate')!({ waitUntil: (value: Promise<void>) => (work = value) });
      await work;
    },
    setOffline: (value: boolean) => (offline = value),
    setDeleteFails: (value: boolean) => (deleteFails = value),
    setPutGate: (value?: Promise<void>) => (putGate = value),
    setLocaleCookie: (value: string) => (localeCookie = value),
    setNetwork: (value: typeof network) => (network = value),
    read: (path = 'time/owned', navigate = false) => {
      let response!: Promise<Response>;
      const request = new Request(origin + scope + path);
      if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
      listeners.get('fetch')!({
        request,
        respondWith: (value: Promise<Response>) => (response = value),
      });
      return response;
    },
    purge: async (user = 'worker') => {
      let work!: Promise<void>;
      let acknowledgment: unknown;
      listeners.get('message')!({
        data: { type: 'ja-offline-purge-private-reads', token: tokenFor(user) },
        ports: [{ postMessage: (value: unknown) => (acknowledgment = value) }],
        waitUntil: (value: Promise<void>) => (work = value),
      });
      await work;
      return acknowledgment;
    },
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('executed private service-worker read revocation', () => {
  it.each(['entry/start.hash.js', 'assets/layout.hash.css', 'assets/geist.hash.woff2'])(
    'caches public immutable %s online and serves the same bytes offline with tracked writes',
    async (asset) => {
      const sw = await serviceWorker();
      const url = origin + '/j-aautomation/_app/immutable/' + asset;
      sw.setNetwork(async () => new Response('public immutable bytes'));
      const online = sw.fetchEvent(url);
      expect(online.work).toHaveLength(1);
      expect(await (await online.response!).text()).toBe('public immutable bytes');
      await Promise.all(online.work);
      expect(sw.stores.get('ja-portal-static-v2')?.has(url)).toBe(true);
      expect(sw.stores.has(partition)).toBe(false);
      sw.setOffline(true);
      const offline = sw.fetchEvent(url);
      expect(await (await offline.response!).text()).toBe('public immutable bytes');
      await Promise.all(offline.work);
    },
  );

  it.each([
    'logo.png',
    'icon-192.png',
    'icon-512.png',
    'manifest.webmanifest',
    'fonts/geist-latin.woff2',
    'fonts/geist-mono-latin.woff2',
  ])('keeps the known public app asset %s available offline', async (asset) => {
    const sw = await serviceWorker();
    const url = origin + scope + asset;
    const online = sw.fetchEvent(url);
    expect((await online.response!).status).toBe(200);
    await Promise.all(online.work);
    expect(sw.stores.get('ja-portal-static-v2')?.has(url)).toBe(true);
    sw.setOffline(true);
    expect((await sw.fetchEvent(url).response!).status).toBe(200);
  });

  it.each(['documents/private-evidence.svg', 'documents/private-receipt.jpeg'])(
    'keeps authenticated download %s out of the public cache',
    async (path) => {
      const sw = await serviceWorker();
      const url = origin + scope + path;
      const event = sw.fetchEvent(url);
      expect((await event.response!).status).toBe(200);
      expect(sw.stores.get('ja-portal-static-v2')?.has(url) ?? false).toBe(false);
      expect(sw.stores.get(partition)?.has(url)).toBe(true);
      sw.setNetwork(async () => new Response('Access restricted', { status: 403 }));
      expect((await sw.fetchEvent(url).response!).status).toBe(403);
      expect(sw.stores.has(partition)).toBe(false);
    },
  );

  it('keeps the immutable cache write alive until an in-flight put completes', async () => {
    const sw = await serviceWorker();
    const put = deferred<void>();
    sw.setPutGate(put.promise);
    const event = sw.fetchEvent(origin + '/j-aautomation/_app/immutable/entry/start.js');
    await vi.waitFor(() => expect(sw.puts).toHaveLength(1));
    let completed = false;
    void Promise.all(event.work).then(() => {
      completed = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);
    put.resolve();
    await Promise.all(event.work);
    expect(completed).toBe(true);
    expect((await event.response!).status).toBe(200);
  });

  it.each([
    [origin + scope + 'api/private-file', 'GET'],
    [origin + scope + 'api/private-file.js', 'GET'],
    [origin + scope + 'api/private-file.jpeg', 'GET'],
    [origin + '/j-aautomation/files/private.js', 'GET'],
    [origin + '/j-aautomation/_app/immutable/private.pdf', 'GET'],
    ['https://other.test/j-aautomation/_app/immutable/entry/start.js', 'GET'],
    [origin + '/j-aautomation/_app/immutable/entry/start.js', 'POST'],
  ])('does not cache unrelated or non-GET resource %s %s', async (url, method) => {
    const sw = await serviceWorker();
    const event = sw.fetchEvent(url, method);
    expect(event.response).toBeUndefined();
    expect(event.work).toEqual([]);
    expect(sw.fetches).toEqual([]);
    expect(sw.stores.size).toBe(0);
  });

  it('purges inherited current-identity HTML and loader entries before claiming clients without network', async () => {
    const sw = await serviceWorker();
    const privateEntries = new Map([
      [origin + scope + 'time/owned', new Response('inherited private time')],
      [origin + scope + 'expenses/__data.json', new Response('inherited private expense')],
    ]);
    sw.stores.set(partition, privateEntries);
    sw.stores.set(legacyPartition, new Map(privateEntries));
    sw.stores.set(otherLegacyPartition, new Map([['other', new Response('other legacy')]]));
    sw.stores.set(otherPartition, new Map([['other', new Response('other user')]]));
    sw.stores.set('ja-portal-static-v2', new Map([['style', new Response('static')]]));
    sw.stores.set('ja-portal-static', new Map());
    const network = vi.fn(async () => new Response('unexpected network'));
    sw.setNetwork(network);
    sw.setOffline(true);
    sw.claim.mockImplementation(async () => {
      expect(sw.stores.has(partition)).toBe(false);
      expect(sw.stores.has(legacyPartition)).toBe(false);
      expect(sw.stores.has(otherLegacyPartition)).toBe(true);
      expect(sw.stores.has(otherPartition)).toBe(true);
      expect(sw.stores.has('ja-portal-static-v2')).toBe(true);
    });
    await sw.activate();
    expect(sw.claim).toHaveBeenCalledOnce();
    expect(sw.deletes).toEqual([partition, legacyPartition, 'ja-portal-static']);
    expect(network).not.toHaveBeenCalled();
    expect(sw.fetches).toEqual([]);
    expect((await sw.read('time/owned', true)).status).toBe(503);
    expect((await sw.read('expenses/__data.json')).status).toBe(503);
  });

  it.each([
    undefined,
    'malformed',
    `${Buffer.from(JSON.stringify({ sub: 'worker', tenantId: 'tenant', deploymentId: 'deployment', sid: 'session', exp: 1 })).toString('base64url')}.signature`,
  ])(
    'does not purge arbitrary private partitions without a valid cookie identity (%s)',
    async (cookie) => {
      const sw = await serviceWorker();
      sw.setIdentityCookie(cookie);
      sw.stores.set(partition, new Map([['old', new Response('unknown private owner')]]));
      sw.stores.set(legacyPartition, new Map([['old', new Response('unknown legacy owner')]]));
      sw.stores.set(otherPartition, new Map());
      await sw.activate();
      expect(sw.deletes).toEqual(['ja-portal-static']);
      expect(sw.stores.has(legacyPartition)).toBe(true);
      expect(sw.stores.has(partition)).toBe(true);
      expect(sw.stores.has(otherPartition)).toBe(true);
      expect(sw.claim).toHaveBeenCalledOnce();
    },
  );

  it('activates with failed private deletion blocked until a completed later purge', async () => {
    const sw = await serviceWorker();
    sw.stores.set(
      partition,
      new Map([[origin + scope + 'time/owned', new Response('inherited secret')]]),
    );
    sw.setDeleteFails(true);
    await sw.activate();
    expect(sw.claim).toHaveBeenCalledOnce();
    expect(sw.stores.has(partition)).toBe(true);
    sw.setOffline(true);
    const denied = await sw.read('time/owned', true);
    expect(denied.status).toBe(503);
    expect(await denied.text()).not.toContain('inherited secret');
    sw.setOffline(false);
    sw.setDeleteFails(false);
    expect(await sw.purge()).toEqual({ type: 'ja-offline-private-reads-purged', success: true });
    expect(sw.stores.has(partition)).toBe(false);
  });

  it('cannot serve an old-worker late write into the inherited namespace after activation', async () => {
    const sw = await serviceWorker();
    sw.stores.set(
      legacyPartition,
      new Map([[origin + scope + 'time/owned', new Response('old cached private')]]),
    );
    await sw.activate();
    // Model a still-running old worker's late CacheStorage put into its legacy namespace.
    await (
      await sw.caches.open(legacyPartition)
    ).put(new Request(origin + scope + 'time/owned'), new Response('late old-worker private'));
    sw.setOffline(true);
    const response = await sw.read('time/owned', true);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('late old-worker private');
    expect(sw.stores.get(legacyPartition)?.size).toBe(1);
    expect(sw.stores.get(partition)?.size ?? 0).toBe(0);
    sw.setOffline(false);
    expect(await sw.purge()).toEqual({ type: 'ja-offline-private-reads-purged', success: true });
    expect(sw.stores.has(legacyPartition)).toBe(false);
  });

  it('never repopulates inherited cache from a 200 started before activation purge', async () => {
    const sw = await serviceWorker();
    const oldResponse = deferred<Response>();
    let started = false;
    sw.setNetwork(async () => {
      started = true;
      return oldResponse.promise;
    });
    const old = sw.read('time/old');
    await vi.waitFor(() => expect(started).toBe(true));
    await sw.activate();
    oldResponse.resolve(new Response('pre-upgrade private content'));
    expect((await old).status).toBe(200);
    expect(sw.puts).toEqual([]);
    sw.setOffline(true);
    expect((await sw.read('time/old')).status).toBe(503);
  });

  it.each([401, 403, 404])(
    'removes cached HTML and loader copies on real server status %s',
    async (status) => {
      const sw = await serviceWorker();
      await sw.read('time/owned');
      await sw.read('expenses/__data.json?q=owned');
      sw.stores.set(otherPartition, new Map([['other', new Response('other user')]]));
      sw.stores.set(otherLegacyPartition, new Map([['other', new Response('other legacy')]]));
      sw.stores.set('ja-portal-static-v2', new Map([['style', new Response('static')]]));
      sw.setNetwork(async () => new Response('Access restricted', { status }));
      const denied = await sw.read('time/owned');
      expect(denied.status).toBe(status);
      expect(await denied.text()).toBe('Access restricted');
      expect(sw.stores.has(partition)).toBe(false);
      expect(sw.stores.has(legacyPartition)).toBe(false);
      expect(sw.stores.has(otherLegacyPartition)).toBe(true);
      expect(sw.stores.has(otherPartition)).toBe(true);
      expect(sw.stores.has('ja-portal-static-v2')).toBe(true);
      sw.setOffline(true);
      expect((await sw.read('time/owned')).status).toBe(503);
      expect((await sw.read('expenses/__data.json?q=owned')).status).toBe(503);
    },
  );

  it('never repopulates a partition from a 200 fetch started before denial', async () => {
    const sw = await serviceWorker();
    const oldResponse = deferred<Response>();
    let started = false;
    sw.setNetwork(async (request) => {
      if (request.url.endsWith('/time/old')) {
        started = true;
        return oldResponse.promise;
      }
      return new Response('Access restricted', { status: 403 });
    });
    const old = sw.read('time/old');
    await vi.waitFor(() => expect(started).toBe(true));
    expect((await sw.read('time/denied')).status).toBe(403);
    oldResponse.resolve(new Response('old private project'));
    expect((await old).status).toBe(200);
    expect(sw.puts).toEqual([]);
    sw.setOffline(true);
    expect((await sw.read('time/old')).status).toBe(503);
  });

  it('serializes deletion after an already running cache put and blocks interim offline reads', async () => {
    const sw = await serviceWorker();
    const put = deferred<void>();
    sw.setPutGate(put.promise);
    const old = sw.read('time/old');
    await vi.waitFor(() => expect(sw.puts).toHaveLength(1));
    sw.setNetwork(async () => new Response('Access restricted', { status: 403 }));
    const denied = sw.read('time/denied');
    await new Promise((resolve) => setImmediate(resolve));
    sw.setOffline(true);
    expect((await sw.read('time/old')).status).toBe(503);
    put.resolve();
    await old;
    expect((await denied).status).toBe(403);
    expect(sw.stores.has(partition)).toBe(false);
    expect((await sw.read('time/old')).status).toBe(503);
  });

  it('invalidates an older in-flight read before acknowledging proactive assignment purge', async () => {
    const sw = await serviceWorker();
    const oldResponse = deferred<Response>();
    let started = false;
    sw.setNetwork(async () => {
      started = true;
      return oldResponse.promise;
    });
    const old = sw.read('time/old');
    await vi.waitFor(() => expect(started).toBe(true));
    expect(await sw.purge()).toEqual({ type: 'ja-offline-private-reads-purged', success: true });
    oldResponse.resolve(new Response('previous assignment private content'));
    await old;
    expect(sw.puts).toEqual([]);
    sw.setOffline(true);
    expect((await sw.read('time/old')).status).toBe(503);
  });

  it('keeps failed deletion blocked even after new successful reads until a completed purge', async () => {
    const sw = await serviceWorker();
    await sw.read('time/old');
    sw.setDeleteFails(true);
    sw.setNetwork(async () => new Response('Access restricted', { status: 403 }));
    expect((await sw.read('time/old')).status).toBe(403);
    expect(sw.stores.get(partition)?.size).toBe(1);
    expect(await sw.purge()).toEqual({ type: 'ja-offline-private-reads-purged', success: false });
    sw.setNetwork(async () => new Response('new authorized value'));
    expect((await sw.read('time/new')).status).toBe(200);
    expect(sw.stores.get(partition)?.size).toBe(1);
    sw.setOffline(true);
    expect((await sw.read('time/old')).status).toBe(503);
    sw.setOffline(false);
    sw.setDeleteFails(false);
    expect(await sw.purge()).toEqual({ type: 'ja-offline-private-reads-purged', success: true });
    expect(sw.stores.has(partition)).toBe(false);
    await sw.read('time/new');
    sw.setOffline(true);
    expect(await (await sw.read('time/new')).text()).toBe('new authorized value');
    expect((await sw.read('time/old')).status).toBe(503);
  });

  it('acknowledges only the live identity partition after deletion and rejects another identity', async () => {
    const sw = await serviceWorker();
    await sw.read();
    sw.stores.set(otherPartition, new Map([['other', new Response('other user')]]));
    expect(await sw.purge('other')).toEqual({
      type: 'ja-offline-private-reads-purged',
      success: false,
    });
    expect(sw.deletes).toEqual([]);
    expect(await sw.purge()).toEqual({ type: 'ja-offline-private-reads-purged', success: true });
    expect(sw.deletes).toEqual([partition, legacyPartition]);
    expect(sw.stores.has(partition)).toBe(false);
    expect(sw.stores.has(otherPartition)).toBe(true);
  });

  it.each([
    ['en', 'Connect to check access to this page'],
    ['es', 'Conéctate para comprobar el acceso a esta página'],
    ['pt', 'Conecte-se para verificar o acesso a esta página'],
  ])(
    'gives data-free localized navigation guidance in %s after known revocation',
    async (locale, heading) => {
      const sw = await serviceWorker();
      sw.setNetwork(async () => new Response('secret project summary'));
      await sw.read();
      await sw.purge();
      sw.setOffline(true);
      const response = await sw.read(`time/owned?lang=${locale}`, true);
      const html = await response.text();
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain(heading);
      expect(html).toContain('<main role="alert">');
      expect(html).toContain(`href="${scope}"`);
      expect(html).not.toMatch(/secret project|owned|worker|session/);
    },
  );

  it('validates locale input, uses a supported cookie and preserves unknown-offline policy', async () => {
    const sw = await serviceWorker();
    sw.setOffline(true);
    expect((await sw.read('time/unknown', true)).status).toBe(0);
    sw.setOffline(false);
    await sw.purge();
    sw.setLocaleCookie('es');
    sw.setOffline(true);
    const html = await (await sw.read('time/owned?lang=%22%3Esecret', true)).text();
    expect(html).toContain('<html lang="es">');
    expect(html).not.toContain('secret');
  });
});
