import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { createDatabase, isDatabaseBusyError } from '@ja/database';

/**
 * Storage for the authentication rate limit.
 *
 * node:sqlite is synchronous: while a connection waits on `busy_timeout`, the
 * whole Node event loop is blocked. A long wait therefore cannot let another
 * request of the same portal process finish the write that holds the lock, and
 * every concurrent request stalls with it. The rate-limit write therefore waits
 * only briefly inside SQLite and retries with an asynchronous back-off that
 * yields the event loop between attempts. Pure checks never open a write
 * transaction: in WAL mode a plain read never waits for, or blocks, a writer
 * (the jobs process or another portal request).
 *
 * One connection is kept and reused, instead of opening (and migrating) a new
 * connection for every sign-in.
 */
export type RateLimitStoreOptions = Readonly<{
  open?: () => DatabaseSync;
  /** Time a single attempt may block inside SQLite (event loop blocked). */
  busyTimeoutMs?: number;
  /** Write attempts before giving up. */
  attempts?: number;
  /** First back-off delay; doubles up to maxDelayMs. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  onBusyRetry?: (attempt: number) => void;
}>;

export type RateLimitStore = Readonly<{
  read: <T>(work: (sqlite: DatabaseSync) => T) => T;
  write: <T>(work: (sqlite: DatabaseSync) => T) => Promise<T>;
  close: () => void;
}>;

export const RATE_LIMIT_BUSY_TIMEOUT_MS = 100;
export const RATE_LIMIT_WRITE_ATTEMPTS = 12;

export function createRateLimitStore(options: RateLimitStoreOptions = {}): RateLimitStore {
  const open = options.open ?? (() => createDatabase().sqlite);
  const busyTimeoutMs = Math.max(0, Math.trunc(options.busyTimeoutMs ?? RATE_LIMIT_BUSY_TIMEOUT_MS));
  const attempts = Math.max(1, Math.trunc(options.attempts ?? RATE_LIMIT_WRITE_ATTEMPTS));
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? 25);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 800);
  let connection: DatabaseSync | undefined;

  const reset = () => {
    try {
      connection?.close();
    } catch {
      // A broken connection is replaced on the next call.
    }
    connection = undefined;
  };
  const current = (): DatabaseSync => {
    if (connection?.isOpen) return connection;
    connection = open();
    connection.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    return connection;
  };

  return {
    read(work) {
      try {
        return work(current());
      } catch (error) {
        if (!isDatabaseBusyError(error)) reset();
        throw error;
      }
    },
    async write(work) {
      let wait = baseDelayMs;
      for (let attempt = 1; ; attempt += 1) {
        const sqlite = current();
        let began = false;
        try {
          sqlite.exec('BEGIN IMMEDIATE');
          began = true;
          const result = work(sqlite);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          if (began) {
            try {
              sqlite.exec('ROLLBACK');
            } catch {
              // Preserve the original failure.
            }
          }
          if (!isDatabaseBusyError(error)) {
            reset();
            throw error;
          }
          if (attempt >= attempts) throw error;
          options.onBusyRetry?.(attempt);
          await delay(wait);
          wait = Math.min(maxDelayMs, wait * 2);
        }
      }
    },
    close: reset,
  };
}
