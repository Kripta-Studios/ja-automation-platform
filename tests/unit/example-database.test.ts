import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openExamplesDatabase } from '../../scripts/example-database.ts';

describe('example document database', () => {
  it('refuses a missing database without creating an empty SQLite file', () => {
    const missing = join(tmpdir(), `ja-missing-examples-${crypto.randomUUID()}.db`);

    expect(() => openExamplesDatabase(missing)).toThrow(/does not exist/u);
    expect(existsSync(missing)).toBe(false);
  });

  it('refuses a SQLite file that was not seeded with the invoice schema', () => {
    const empty = join(tmpdir(), `ja-empty-examples-${crypto.randomUUID()}.db`);
    new DatabaseSync(empty).close();

    try {
      expect(() => openExamplesDatabase(empty)).toThrow(/has no invoice schema/u);
    } finally {
      rmSync(empty, { force: true });
    }
  });
});
