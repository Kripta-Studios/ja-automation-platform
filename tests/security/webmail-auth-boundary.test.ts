import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hooks = readFileSync('apps/portal/src/hooks.server.ts', 'utf8');
const auth = readFileSync('apps/portal/src/lib/server/auth.ts', 'utf8');
const delegatedPassword = readFileSync('apps/portal/src/lib/server/webmail-password.ts', 'utf8');

describe('Webmail authentication security boundary', () => {
  it('does not rewrite or cache a submitted Webmail password in the request hook', () => {
    expect(hooks).not.toContain('reconcileWebmailAuthCredentials');
    expect(hooks).not.toMatch(/hashPassword|UPDATE\s+account|SET\s+password/iu);
  });

  it('uses Better Auth custom verification and preserves its standard sign-in route', () => {
    expect(auth).toContain('verify: verifyPortalPassword');
    expect(auth).toContain('before: authBefore');
    expect(auth).toContain("path === '/change-password'");
    expect(auth).toContain("path === '/reset-password'");
    expect(auth).toContain('twoFactor({');
    expect(hooks).not.toContain("path.endsWith('/api/auth/sign-in/email')");
  });

  it('requires canonical active credential and mail identity links before IMAP', () => {
    expect(delegatedPassword).toContain("a.provider_id='credential'");
    expect(delegatedPassword).toContain("a.issuer='local:credential'");
    expect(delegatedPassword).toContain('a.account_id=u.id');
    expect(delegatedPassword).toContain("u.status='active'");
    expect(delegatedPassword).toContain("mi.status='active'");
  });
});
