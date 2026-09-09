import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('0042 supplier workforce migration', () => {
  it('creates additive operational tables and records reviewed migration 42', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-supplier-migration-'));
    directories.push(directory);
    const restore = installB5TestDeploymentIdentity();
    try {
      const { sqlite } = createDatabase(join(directory, 'app.db'));
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'supplier%' ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: 'supplier' },
        { name: 'supplier_project_grant' },
        { name: 'supplier_time_entry_recorder' },
        { name: 'supplier_user_profile' },
        { name: 'supplier_user_profile_period' },
      ]);
      expect(
        sqlite
          .prepare(
            'SELECT migration_version,migration_name FROM migration_contract_metadata WHERE migration_version=42',
          )
          .get(),
      ).toEqual({ migration_version: 42, migration_name: 'supplier_workforce' });
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO supplier_time_entry_recorder(time_entry_id,supplier_id,recorded_by_user_id,recorded_at) VALUES('x','x','x','x')",
          )
          .run(),
      ).toThrow();
      sqlite.close();
    } finally {
      restore();
    }
  });
});
