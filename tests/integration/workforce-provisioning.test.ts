import { afterEach, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { SupplierWorkforceRepository } from '@ja/database';
import { createB5LifecycleSecurityFixture, closeB5LifecycleSecurityFixture, stepUpB5Principal, type B5LifecycleSecurityFixture } from '../fixtures/b5-lifecycle-security-fixture.js';
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f); });
function setup() { const f = createB5LifecycleSecurityFixture(); fixtures.push(f); return { ...f, owner: stepUpB5Principal(f.sqlite, f.owner, 'provision'), workforce: new SupplierWorkforceRepository(f.sqlite) }; }
it('provisions an external email with a verifiable hash and denies duplicate takeover', async () => {
  const f = setup(); const password = 'Test-only-secret-2026!'; const passwordHash = await hashPassword(password);
  const input = { name: 'External technician', email: 'external@other-company.test', passwordHash, role: 'worker' as const };
  const result = f.workforce.provisionLocalPortalAccount(f.owner, input);
  const account = f.sqlite.prepare('SELECT password FROM account WHERE user_id=?').get(result.userId)!;
  expect(await verifyPassword({ password, hash: String(account.password) })).toBe(true);
  expect(account.password).not.toBe(password);
  expect(() => f.workforce.provisionLocalPortalAccount(f.owner, input)).toThrow(/already exists/);
  expect(() => f.workforce.provisionLocalPortalAccount(f.worker, { ...input, email: 'other@example.test' })).toThrow();
});
it('rejects forged roles and rolls back supplier profile creation on invalid supplier', async () => {
  const f = setup(); const passwordHash = await hashPassword('Test-only-secret-2026!');
  expect(() => f.workforce.provisionLocalPortalAccount(f.owner, { name: 'Forged', email: 'forged@example.test', passwordHash, role: 'owner_admin' as 'worker' })).toThrow();
  expect(f.sqlite.prepare('SELECT id FROM user WHERE email=?').get('forged@example.test')).toBeUndefined();
  expect(() => f.workforce.provisionLocalPortalAccount(f.owner, { name: 'Invalid supplier', email: 'invalid@example.test', passwordHash, role: 'worker', supplierProfile: 'external_technician', supplierId: 'missing' })).toThrow();
  expect(f.sqlite.prepare('SELECT id FROM user WHERE email=?').get('invalid@example.test')).toBeUndefined();
});
