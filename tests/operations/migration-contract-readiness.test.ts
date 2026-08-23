import { cp, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateReviewedMigrationContract } from '@ja/database';

const previousMigrationPath = process.env.JA_MIGRATIONS_PATH;
const roots: string[] = [];

afterEach(async () => {
  if (previousMigrationPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousMigrationPath;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('reviewed migration contract readiness', () => {
  it('requires the canonical manifest and exact SQL hashes, not a dummy max filename', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ja-migration-contract-'));
    roots.push(root);
    const migrationDirectory = join(root, 'migrations');
    await cp(resolve('migrations'), migrationDirectory, { recursive: true });
    process.env.JA_MIGRATIONS_PATH = migrationDirectory;

    const healthy = validateReviewedMigrationContract();
    expect(healthy.expectedMigrationVersion).toBeGreaterThanOrEqual(25);
    expect(healthy.manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(healthy.reviewedMigrationFiles.length).toBeGreaterThanOrEqual(7);

    await writeFile(join(migrationDirectory, '9999_dummy.sql'), 'SELECT 1;\n', 'utf8');
    expect(() => validateReviewedMigrationContract()).toThrow(/MIGRATION_CONTRACT/u);

    await unlink(join(migrationDirectory, '9999_dummy.sql'));
    const highest = healthy.reviewedMigrationFiles.at(-1);
    if (!highest) throw new Error('fixture did not contain a reviewed migration');
    await unlink(join(migrationDirectory, highest));
    expect(() => validateReviewedMigrationContract()).toThrow(/MIGRATION_CONTRACT_FILE_MISSING/u);
  });

  it('fails closed for missing, unreadable or non-directory migration paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ja-migration-invalid-'));
    roots.push(root);
    process.env.JA_MIGRATIONS_PATH = join(root, 'missing');
    expect(() => validateReviewedMigrationContract()).toThrow(/MIGRATION_DIRECTORY_UNAVAILABLE/u);

    const file = join(root, 'not-a-directory');
    await writeFile(file, 'not a directory', 'utf8');
    process.env.JA_MIGRATIONS_PATH = file;
    expect(() => validateReviewedMigrationContract()).toThrow(/MIGRATION_DIRECTORY_UNREADABLE/u);
  });
});
