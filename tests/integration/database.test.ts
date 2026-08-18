import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
describe('SQLite migration', () => {
  it('enables WAL, foreign keys and STRICT schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ja-db-'));
    dirs.push(dir);
    const { sqlite } = createDatabase(join(dir, 'app.db'));
    expect(
      (sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode,
    ).toBe('wal');
    expect(
      (sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys,
    ).toBe(1);
    expect(integrityCheck(sqlite)).toBe('ok');
    expect(
      (
        sqlite.prepare("SELECT strict FROM pragma_table_list WHERE name='invoice'").get() as {
          strict: number;
        }
      ).strict,
    ).toBe(1);
    sqlite.close();
  });
});
