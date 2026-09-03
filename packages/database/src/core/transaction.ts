import type { DatabaseSync } from 'node:sqlite';
import { isDatabaseBusyError, logDatabaseBusyRetry } from './busy-retry.ts';

let nestedTransactionSequence = 0;

export function runImmediateTransaction<T>(
  sqlite: DatabaseSync,
  repository: string,
  work: () => T,
): T {
  if ((sqlite as DatabaseSync & { readonly isTransaction: boolean }).isTransaction) {
    nestedTransactionSequence += 1;
    const savepoint = `ja_nested_${nestedTransactionSequence}`;
    sqlite.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = work();
      sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      try {
        sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } catch {
        // Preserve the repository error; the outer transaction will roll back.
      }
      throw error;
    }
  }
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
