import type { DatabaseSync } from 'node:sqlite';
import { isDatabaseBusyError, logDatabaseBusyRetry } from './busy-retry.ts';

export function runImmediateTransaction<T>(
  sqlite: DatabaseSync,
  repository: string,
  work: () => T,
): T {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let began = false;
    try {
      sqlite.exec('BEGIN IMMEDIATE');
      began = true;
      const result = work();
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      if (began) {
        try {
          sqlite.exec('ROLLBACK');
        } catch {
          // Preserve the original transaction error.
        }
      }
      if (isDatabaseBusyError(error) && attempt < 3) {
        logDatabaseBusyRetry(repository, attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Transaction retry limit reached');
}
