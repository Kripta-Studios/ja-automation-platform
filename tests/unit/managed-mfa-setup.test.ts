import { describe, expect, it } from 'vitest';
import { symmetricDecrypt } from 'better-auth/crypto';
import {
  generateManagedMfaSetup,
  managedTotpUri,
} from '../../apps/portal/src/lib/server/managed-mfa-setup';

describe('managed MFA material compatibility', () => {
  it.each([
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('encodes RFC4648 bytes for an authenticator URI', (secret, expected) => {
    const uri = new URL(managedTotpUri(secret, 'worker+audit@example.test'));
    expect(uri.searchParams.get('secret')).toBe(expected);
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
    expect(decodeURIComponent(uri.pathname)).toBe('/J&A Automation:worker+audit@example.test');
  });

  it('uses Better Auth encryption for secret and single-use backup-code payloads', async () => {
    const key = 'unit-test-only-secret-no-account-or-database';
    const first = await generateManagedMfaSetup(key, 'worker@example.test');
    const second = await generateManagedMfaSetup(key, 'worker@example.test');
    const secret = await symmetricDecrypt({ key, data: first.encryptedSecret });
    expect(secret).toHaveLength(32);
    expect(first.totpURI).toBe(managedTotpUri(secret, 'worker@example.test'));
    expect(JSON.parse(await symmetricDecrypt({ key, data: first.encryptedBackupCodes }))).toEqual(
      first.backupCodes,
    );
    expect(first.backupCodes).toHaveLength(10);
    expect(new Set(first.backupCodes).size).toBe(10);
    for (const code of first.backupCodes) expect(code).toMatch(/^[a-zA-Z0-9]{5}-[a-zA-Z0-9]{5}$/u);
    expect(first.totpURI).not.toBe(second.totpURI);
    expect(first.backupCodes).not.toEqual(second.backupCodes);
  });

  it('retains Better Auth secret-version envelopes for rotated encryption keys', async () => {
    const key = {
      currentVersion: 1,
      keys: new Map([[1, 'unit-current-key']]),
      legacySecret: 'unit-legacy-key',
    };
    const setup = await generateManagedMfaSetup(key, 'worker@example.test');
    expect(setup.encryptedSecret).toMatch(/^\$ba\$1\$/u);
    expect(setup.encryptedBackupCodes).toMatch(/^\$ba\$1\$/u);
    expect(await symmetricDecrypt({ key, data: setup.encryptedSecret })).toHaveLength(32);
    expect(JSON.parse(await symmetricDecrypt({ key, data: setup.encryptedBackupCodes }))).toEqual(
      setup.backupCodes,
    );
  });
});
