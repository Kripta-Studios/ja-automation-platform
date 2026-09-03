import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { ensureEvidence } from '../../packages/database/src/domains/finance/finance-command-writer.js';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterAll(() => restoreIdentity?.());

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-finance-evidence-writer-'));
  directories.push(directory);
  return createDatabase(join(directory, 'app.db')).sqlite;
}

const fail = (message: string): never => {
  throw new Error(`controlled finance evidence conflict: ${message}`);
};

describe('finance command evidence writer', () => {
  it('rejects a semantic collision as a controlled domain error before SQLite insertion', () => {
    const sqlite = fixture();
    try {
      ensureEvidence(
        sqlite,
        'evidence-1',
        'invoice_source',
        'accounting-pack-source-item-v1',
        'invoice:1:1',
        Buffer.from('first immutable bytes'),
        '2026-08-30T10:00:00.000Z',
        fail,
      );

      expect(() =>
        ensureEvidence(
          sqlite,
          'evidence-2',
          'invoice_source',
          'accounting-pack-source-item-v1',
          'invoice:1:1',
          Buffer.from('different immutable bytes'),
          '2026-08-30T10:01:00.000Z',
          fail,
        ),
      ).toThrow(/controlled finance evidence conflict: Evidence semantic hash is not idempotent/u);
      expect(sqlite.prepare('SELECT count(*) count FROM finance_hash_evidence').get()).toEqual({
        count: 1,
      });
    } finally {
      sqlite.close();
    }
  });

  it('does not silently alias identical bytes to a second evidence identity', () => {
    const sqlite = fixture();
    try {
      const bytes = Buffer.from('shared immutable bytes');
      ensureEvidence(
        sqlite,
        'evidence-1',
        'invoice_source',
        'accounting-pack-source-item-v1',
        'invoice:1:1',
        bytes,
        '2026-08-30T10:00:00.000Z',
        fail,
      );

      expect(() =>
        ensureEvidence(
          sqlite,
          'evidence-2',
          'invoice_source',
          'accounting-pack-source-item-v1',
          'invoice:1:1',
          bytes,
          '2026-08-30T10:01:00.000Z',
          fail,
        ),
      ).toThrow(/semantic identity is already bound to another identity/u);
      expect(sqlite.prepare('SELECT count(*) count FROM finance_hash_evidence').get()).toEqual({
        count: 1,
      });
    } finally {
      sqlite.close();
    }
  });
});
