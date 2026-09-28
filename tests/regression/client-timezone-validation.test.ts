import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PortalRepository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { clientInputSchema, clientUpdateInputSchema, isValidIanaTimeZone } from '@ja/schemas';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const owner: Principal = { userId: 'timezone-owner', role: 'owner_admin', projectIds: new Set() };
const clientInput = {
  legalName: 'Timezone Test Client SL',
  displayName: 'Timezone Test Client',
  currency: 'EUR' as const,
  timezone: 'Europe/Madrid',
  billingEmail: 'billing@example.test',
  billingAddress: 'Calle 42, Madrid',
};

describe('client IANA timezone boundary', () => {
  it('reports an invalid timezone on that field for create and update', () => {
    expect(isValidIanaTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Invalid/QA')).toBe(false);

    const created = clientInputSchema.safeParse({ ...clientInput, timezone: 'Invalid/QA' });
    expect(created.success).toBe(false);
    if (!created.success)
      expect(created.error.flatten().fieldErrors.timezone).toContain(
        'problem.client.timezoneInvalid',
      );

    const updated = clientUpdateInputSchema.safeParse({
      clientId: 'timezone-client',
      version: 1,
      timezone: 'Invalid/QA',
    });
    expect(updated.success).toBe(false);
    if (!updated.success)
      expect(updated.error.flatten().fieldErrors.timezone).toContain(
        'problem.client.timezoneInvalid',
      );
    expect(clientInputSchema.parse(clientInput).timezone).toBe('Europe/Madrid');
  });

  it('does not write a client or change its version when repository callers bypass the form schema', () => {
    const restoreDeploymentIdentity = installB5TestDeploymentIdentity();
    const directory = mkdtempSync(join(tmpdir(), 'ja-client-timezone-'));
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          owner.userId,
          'Timezone Owner',
          'antonny.luty@j-aautomation.com',
          'owner_admin',
          'active',
          1,
          now,
          now,
        );
      const repository = new PortalRepository(sqlite);
      expect(() =>
        repository.createClient(owner, { ...clientInput, timezone: 'Invalid/QA' }),
      ).toThrow('Timezone must be a valid IANA time zone');
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM client').get()).toMatchObject({
        count: 0,
      });

      const client = repository.createClient(owner, clientInput);
      const before = sqlite
        .prepare('SELECT timezone,version FROM client WHERE id=?')
        .get(client.id);
      expect(before).toMatchObject({ timezone: 'Europe/Madrid', version: 1 });
      expect(() =>
        repository.updateClient(owner, client.id, { timezone: 'Invalid/QA' }, 1),
      ).toThrow('Timezone must be a valid IANA time zone');
      expect(
        sqlite.prepare('SELECT timezone,version FROM client WHERE id=?').get(client.id),
      ).toEqual(before);
      repository.updateClient(owner, client.id, { timezone: 'UTC' }, 1);
      expect(
        sqlite.prepare('SELECT timezone,version FROM client WHERE id=?').get(client.id),
      ).toMatchObject({
        timezone: 'UTC',
        version: 2,
      });
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
      restoreDeploymentIdentity();
    }
  });
});
