import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSource } from '../fixtures/b5-lifecycle-security-fixture.js';

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
});
