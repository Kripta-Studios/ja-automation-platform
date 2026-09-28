import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSyntheticDeploymentIdentity,
  canonicalFixtureDatabasePath,
  canonicalFixtureDirectoryPath,
  isLocalTestUrl,
  isOpaqueFixtureSentinel,
  isSyntheticEmail,
  isSyntheticSecret,
  localSameOriginUrl,
  redactedUrlPath,
} from '../../scripts/isolated-test-guards.ts';

const sentinel = '550e8400-e29b-41d4-a716-446655440000';

describe('isolated browser/audit fixture guards', () => {
  it.each([
    'http://localhost:5174/j-aautomation',
    'https://localhost:4174/app',
    'http://127.0.0.1:5174',
    'http://127.42.12.9:5174',
    'https://127.255.255.254:4174',
    'http://[::1]:5174/j-aautomation',
  ])('accepts a loopback HTTP(S) preview URL: %s', (value) => {
    expect(isLocalTestUrl(value)).toBe(true);
  });

  it.each([
    'file://localhost/tmp/portal',
    'ftp://127.0.0.1:5174',
    'http://portal.example.test:5174',
    'http://portal.localhost:5174',
    'http://portal.local:5174',
    'http://j-aautomation.com:5174',
    'http://127.0.0.1.example.test:5174',
    'http://localhost.example.test:5174',
    'http://localhost@192.168.1.10:5174',
    'http://user:password@127.0.0.1:5174',
    'http://[::2]:5174',
    'http://192.168.1.10:5174',
    'http://127.0.0.1:5100',
    'http://127.0.0.1:5101',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:9999',
    'http://127.0.0.1',
  ])('rejects a non-loopback or unsafe preview URL: %s', (value) => {
    expect(isLocalTestUrl(value)).toBe(false);
  });

  it.each([
    'owner@example.com',
    'owner@team.example.com',
    'worker@example.test',
    'worker@qa.example.invalid',
    'worker@isolated.test',
    'worker@isolated.invalid',
    'worker@localhost',
    'WORKER@EXAMPLE.TEST',
  ])('accepts a reserved synthetic email: %s', (value) => {
    expect(isSyntheticEmail(value)).toBe(true);
  });

  it.each([
    'worker@foo.local',
    'worker@demo.jaautomation.local',
    'worker@foo.localhost',
    'worker@j-aautomation.com',
    'worker@foo.j-aautomation.com',
    'worker@example.com.evil',
    'worker@test',
    'worker@invalid',
    'worker@foo.test.evil',
    'worker@foo..test',
    'worker@-foo.test',
    'worker@foo-.test',
    'worker@foo.test.',
    'worker without an at sign',
  ])('rejects a production, LAN, or malformed email: %s', (value) => {
    expect(isSyntheticEmail(value)).toBe(false);
  });

  it.each([sentinel, 'opaque-fixture-20260906-AbCdEf0123456789'])(
    'accepts an opaque fixture sentinel: %s',
    (value) => {
      expect(isOpaqueFixtureSentinel(value)).toBe(true);
    },
  );

  it.each([
    '',
    'test-fixture',
    'fixture-sentinel-without-enough-length',
    'fixture-aaaaaaaaaaaaaaaaaaaaaaaa',
    'opaque-fixture-without-digits-abcdefghijkl',
    'opaque fixture 20260906 abcdef',
  ])('rejects a missing, weak, or predictable sentinel: %s', (value) => {
    expect(isOpaqueFixtureSentinel(value)).toBe(false);
  });

  it.each(['A3!synthetic-fixture-secret-20260906', '550e8400-e29b-41d4-a716-446655440000'])(
    'accepts a strong synthetic secret: %s',
    (value) => {
      expect(isSyntheticSecret(value, 'worker@example.test')).toBe(true);
    },
  );

  it.each(['worker', 'password', 'finance', 'worker@example.test', 'short-secret-1'])(
    'rejects a default, derived, or weak secret: %s',
    (value) => {
      expect(isSyntheticSecret(value, 'worker@example.test')).toBe(false);
    },
  );

  it('redacts URL query and fragment data to a stable pathname', () => {
    expect(redactedUrlPath('https://localhost:4174/j-aautomation/app?token=secret#password')).toBe(
      '/j-aautomation/app',
    );
    expect(
      redactedUrlPath(
        '/j-aautomation/app?email=worker@example.test#section',
        'http://localhost:5174',
      ),
    ).toBe('/j-aautomation/app');
    expect(redactedUrlPath('not a URL')).toBe('[invalid-url]');
  });

  it('accepts only same-origin links for guarded local resource requests', () => {
    const base = 'http://127.0.0.1:5174/j-aautomation';
    expect(localSameOriginUrl('/j-aautomation/app/report.pdf', base)).toBe(
      'http://127.0.0.1:5174/j-aautomation/app/report.pdf',
    );
    expect(() => localSameOriginUrl('https://example.test/report.pdf', base)).toThrow(
      /isolated test origin/u,
    );
    expect(() => localSameOriginUrl('http://127.0.0.1:4174/report.pdf', base)).toThrow(
      /isolated test origin/u,
    );
  });

  it('confines token-bound fixture directories and rejects symlinked targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-directory-guard-test-'));
    const fixtureDirectory = join(root, `documents-${sentinel}`);
    const outside = mkdtempSync(join(tmpdir(), 'ja-directory-outside-'));
    const linked = join(root, `linked-${sentinel}`);
    mkdirSync(fixtureDirectory);
    symlinkSync(outside, linked);
    try {
      expect(
        canonicalFixtureDirectoryPath(fixtureDirectory, {
          roots: [root],
          token: sentinel,
          requireToken: true,
        }),
      ).toBe(fixtureDirectory);
      expect(() =>
        canonicalFixtureDirectoryPath(outside, { roots: [root], token: sentinel }),
      ).toThrow(/isolated fixture root/u);
      expect(() =>
        canonicalFixtureDirectoryPath(linked, {
          roots: [root],
          token: sentinel,
          requireToken: true,
        }),
      ).toThrow(/symbolic links|canonical/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('accepts a token-bound regular fixture database path and rejects unsafe paths/symlinks', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-guard-test-'));
    const fixtureRoot = join(root, `fixture-${sentinel}`);
    mkdirSync(fixtureRoot);
    const databasePath = join(fixtureRoot, `e2e-portal-${sentinel}.sqlite`);
    const database = new DatabaseSync(databasePath);
    database.exec(
      `CREATE TABLE deployment_identity(singleton INTEGER PRIMARY KEY, tenant_id TEXT, deployment_id TEXT);
       INSERT INTO deployment_identity VALUES(1,'e2e-test-tenant','e2e-test-deployment');`,
    );
    database.close();
    const symlinkPath = join(fixtureRoot, 'linked.sqlite');
    symlinkSync(databasePath, symlinkPath);
    try {
      expect(canonicalFixtureDatabasePath(databasePath, sentinel, { roots: [root] })).toBe(
        databasePath,
      );
      expect(() =>
        canonicalFixtureDatabasePath(join(tmpdir(), 'outside.sqlite'), sentinel, { roots: [root] }),
      ).toThrow(/isolated fixture root/u);
      expect(() => canonicalFixtureDatabasePath(symlinkPath, sentinel, { roots: [root] })).toThrow(
        /symbolic links|canonical/u,
      );
      expect(() =>
        canonicalFixtureDatabasePath(databasePath.replaceAll(sentinel, 'foreign-token'), sentinel, {
          roots: [root],
        }),
      ).toThrow(/linked to the fixture sentinel/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts only a database with a synthetic deployment identity', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(
      `CREATE TABLE deployment_identity(singleton INTEGER PRIMARY KEY, tenant_id TEXT, deployment_id TEXT);
       INSERT INTO deployment_identity VALUES(1,'e2e-test-tenant','e2e-test-deployment');`,
    );
    expect(() =>
      assertSyntheticDeploymentIdentity(database, {
        JA_TENANT_ID: 'e2e-test-tenant',
        JA_DEPLOYMENT_ID: 'e2e-test-deployment',
      }),
    ).not.toThrow();
    database
      .prepare('UPDATE deployment_identity SET deployment_id=? WHERE singleton=1')
      .run('production-vps');
    expect(() =>
      assertSyntheticDeploymentIdentity(database, {
        JA_TENANT_ID: 'e2e-test-tenant',
        JA_DEPLOYMENT_ID: 'production-vps',
      }),
    ).toThrow(/non-synthetic/u);
    database.close();
  });
});
