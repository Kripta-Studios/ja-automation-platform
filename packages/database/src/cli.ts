import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase, integrityCheck } from './index.ts';

const command = process.argv[2];
const defaultPath = process.env.JA_DATABASE_PATH ?? resolve(process.cwd(), 'data/app.db');
const path = command === 'fresh' ? resolve(process.cwd(), 'data/test-fresh.db') : defaultPath;
mkdirSync(dirname(path), { recursive: true });
if (command === 'fresh' && existsSync(path)) rmSync(path);
const { sqlite } = createDatabase(path);
const journal = (sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string })
  .journal_mode;
const foreignKeys = (sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
  .foreign_keys;
const integrity = integrityCheck(sqlite);
sqlite.close();
if (journal !== 'wal' || foreignKeys !== 1 || integrity !== 'ok')
  throw new Error(
    `Database check failed: journal=${journal}, foreign_keys=${foreignKeys}, integrity=${integrity}`,
  );
console.log(
  `database=${path} journal=${journal} foreign_keys=${foreignKeys} integrity=${integrity}`,
);
