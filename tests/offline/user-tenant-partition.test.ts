import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSource } from '../fixtures/b5-lifecycle-security-fixture.js';

vi.mock('$app/paths', () => ({ base: '/j-aautomation' }));
const { closeDatabase, openDatabase } = vi.hoisted(() => ({
  closeDatabase: vi.fn(),
  openDatabase: vi.fn(),
}));
vi.mock('../../apps/portal/node_modules/idb/build/index.js', () => ({ openDB: openDatabase }));
import { configureOfflineIdentity, purgeUserCache } from '../../apps/portal/src/lib/offline';

afterEach(() => vi.unstubAllGlobals());

describe('B5 private offline partition contract (RED characterization)', () => {
  it('does not use a single global IndexedDB name for every authenticated user', () => {
    const source = readSource('apps/portal/src/lib/offline.ts');
    expect(source).not.toContain("const name = 'ja-portal-user-cache'");
    expect(source).toMatch(/tenantId/);
    expect(source).toMatch(/deploymentId/);
    expect(source).toMatch(/userId/);
  });

  it('requires authenticated offline identity issuance and verification endpoints', () => {
    expect(
      existsSync(
        resolve(process.cwd(), 'apps/portal/src/routes/app/api/offline/identity/+server.ts'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(process.cwd(), 'apps/portal/src/routes/app/api/offline/identity/verify/+server.ts'),
      ),
    ).toBe(true);
  });

  it('fails closed when signing or partition configuration is absent', () => {
    const issueSource = readSource('apps/portal/src/routes/app/api/offline/identity/+server.ts');
    const verifySource = readSource(
      'apps/portal/src/routes/app/api/offline/identity/verify/+server.ts',
    );
    expect(issueSource).toMatch(/JA_AUTH_SECRET/);
    expect(issueSource).toMatch(/JA_TENANT_ID/);
    expect(issueSource).toMatch(/JA_DEPLOYMENT_ID/);
    expect(issueSource).not.toMatch(/JA_AUTH_SECRET\?\?/);
    expect(issueSource).not.toMatch(/tenantId:\s*['"]default['"]/);
    expect(issueSource).not.toMatch(/deploymentId:\s*['"]local['"]/);
    expect(verifySource).toContain('decoded.sid === locals.session.id');
    expect(verifySource).toContain('config.tenantId');
    expect(verifySource).toContain('config.deploymentId');
  });

  it('does not retain the legacy global private service-worker cache', () => {
    const source = readSource('apps/portal/src/routes/app/service-worker.js/+server.ts');
    expect(source).not.toMatch(/ja-portal-shell-v\d+/);
    expect(source).toMatch(/tenant|deployment|user/i);
    expect(source).toContain('ja-portal-private-');
    expect(source).toContain('ja_offline_identity');
    expect(source).toContain('cookieStore');
  });

  it('purges both read-cache versions only for the configured identity on signout', async () => {
    const tenantId = 'tenant:exact';
    const deploymentId = 'deployment';
    const userId = 'worker';
    const partition = [tenantId, deploymentId, userId].map(encodeURIComponent).join('-');
    const current = `ja-portal-private-v3-${partition}`;
    const legacy = `ja-portal-private-${partition}`;
    const other = 'ja-portal-private-v3-other-deployment-worker';
    const cacheNames = new Set([current, legacy, other, 'ja-portal-static-v2']);
    const token = `${Buffer.from(JSON.stringify({ sub: userId, tenantId, deploymentId, sid: 'session', exp: Date.now() + 60_000 })).toString('base64url')}.signature`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ token, userId, tenantId, deploymentId })),
    );
    const deleteCache = vi.fn(async (name: string) => cacheNames.delete(name));
    vi.stubGlobal('caches', { delete: deleteCache });
    openDatabase.mockResolvedValue({ close: closeDatabase });
    const deleteDatabase = vi.fn(() => {
      const request: { onsuccess?: () => void } = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });
    vi.stubGlobal('indexedDB', { deleteDatabase });
    await configureOfflineIdentity(userId, tenantId);
    await purgeUserCache();
    expect(openDatabase).toHaveBeenCalledWith(`ja-portal-${partition}`, 2, expect.any(Object));
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(`ja-portal-${partition}`);
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual([current, legacy]);
    expect(cacheNames).toEqual(new Set([other, 'ja-portal-static-v2']));
  });
});
