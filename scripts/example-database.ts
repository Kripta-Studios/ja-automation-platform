import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function resolveExamplesDatabasePath(root = process.cwd()): string {
  const configured = process.env.JA_EXAMPLES_DATABASE_PATH?.trim();
  return configured ? resolve(configured) : resolve(root, 'packages/database/data/demo.db');
}

export function openExamplesDatabase(path: string): DatabaseSync {
  if (!existsSync(path))
    throw new Error(
      `Example generation database does not exist: ${path}. Seed a disposable database and set JA_EXAMPLES_DATABASE_PATH.`,
    );

  const database = new DatabaseSync(path, { readOnly: true });
  const invoiceTable = database
    .prepare("SELECT 1 AS present FROM sqlite_schema WHERE type='table' AND name='invoice'")
    .get() as { present?: number } | undefined;
  if (!invoiceTable?.present) {
    database.close();
    throw new Error(`Example generation database has no invoice schema: ${path}`);
  }
  return database;
}
