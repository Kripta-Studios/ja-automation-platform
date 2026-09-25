import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const restoreDeploymentIdentity = installB5TestDeploymentIdentity();
let directory: string;
let databasePath: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ja-default-issuer-'));
  databasePath = join(directory, 'app.db');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

afterAll(() => restoreDeploymentIdentity());

describe('default invoice issuer bootstrap', () => {
  it('creates the J&A USD issuer on a fresh production-schema database without inventing a tax identifier', () => {
    const { sqlite } = createDatabase(databasePath);
    try {
      const issuer = sqlite
        .prepare(
          `SELECT id,code,legal_name,currency,billing_address,company_identifiers,status
           FROM legal_entity WHERE code='JA-USA'`,
        )
        .get() as
        | {
            id: string;
            code: string;
            legal_name: string;
            currency: string;
            billing_address: string;
            company_identifiers: string;
            status: string;
          }
        | undefined;
      expect(issuer).toMatchObject({
        id: 'legal-entity-ja-usa',
        code: 'JA-USA',
        legal_name: 'J&A Automation LLC',
        currency: 'USD',
        company_identifiers: '',
        status: 'active',
      });
      expect(issuer?.billing_address).toContain('Georgetown TX 78626');
      expect(issuer?.billing_address).toContain('Phone:');
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      sqlite.close();
    }
  });

  it('preserves an owner-configured issuer when the production database reopens', () => {
    const first = createDatabase(databasePath).sqlite;
    try {
      first
        .prepare(
          `UPDATE legal_entity
           SET billing_address=?,company_identifiers=?,version=version+1
           WHERE code='JA-USA'`,
        )
        .run('Owner configured address', 'Owner configured tax identifier');
    } finally {
      first.close();
    }

    const reopened = createDatabase(databasePath).sqlite;
    try {
      expect(
        reopened.prepare(`SELECT COUNT(*) AS count FROM legal_entity WHERE code='JA-USA'`).get(),
      ).toMatchObject({ count: 1 });
      expect(
        reopened
          .prepare(
            `SELECT billing_address,company_identifiers,version FROM legal_entity WHERE code='JA-USA'`,
          )
          .get(),
      ).toMatchObject({
        billing_address: 'Owner configured address',
        company_identifiers: 'Owner configured tax identifier',
        version: 2,
      });
      expect(integrityCheck(reopened)).toBe('ok');
    } finally {
      reopened.close();
    }
  });
});
