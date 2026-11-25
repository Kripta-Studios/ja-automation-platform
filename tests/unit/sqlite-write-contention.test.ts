import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseWritable, isDatabaseBusyError, openDatabase } from '@ja/database';
import { createRateLimitStore } from '$lib/server/auth-rate-limit-store';

// Two connections on one SQLite file stand in for the portal and the jobs
// container (deployment/scripts/jobs-run.mjs --loop) sharing production data.
let directory: string;
let path: string;
let holder: DatabaseSync;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ja-sqlite-contention-'));
  path = join(directory, 'app.sqlite');
  holder = openDatabase(path);
  holder.exec(
    'CREATE TABLE rate_limit_bucket(bucket_key TEXT PRIMARY KEY, window_started_at TEXT NOT NULL, request_count INTEGER NOT NULL)',
  );
});

afterEach(() => {
  try {
    if (holder.isTransaction) holder.exec('ROLLBACK');
    holder.close();
  } catch {
    // already closed
  }
  rmSync(directory, { recursive: true, force: true });
});

function bump(sqlite: DatabaseSync, key: string) {
  sqlite
    .prepare(
      "INSERT INTO rate_limit_bucket VALUES(?,'2026-11-25T00:00:00.000Z',1) ON CONFLICT(bucket_key) DO UPDATE SET request_count=request_count+1",
    )
    .run(key);
}

describe('SQLite write contention between portal and jobs', () => {
  it('every connection waits on a busy database and uses WAL', () => {
    const other = openDatabase(path);
    try {
      expect(other.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 });
      expect(other.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    } finally {
      other.close();
    }
  });

  it('readiness reports the database writable without waiting for a held write lock', () => {
    holder.exec('BEGIN IMMEDIATE');
    bump(holder, 'jobs');
    const probe = openDatabase(path);
    try {
      const started = Date.now();
      expect(databaseWritable(probe)).toBe(true);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(probe.isTransaction).toBe(false);
    } finally {
      probe.close();
    }
  });

  it('readiness reports a query-only connection as not writable', () => {
    const probe = openDatabase(path);
    try {
      probe.exec('PRAGMA query_only = 1');
      expect(databaseWritable(probe)).toBe(false);
    } finally {
      probe.close();
    }
  });

  it('the rate-limit check reads while another connection holds the write lock', () => {
    bump(holder, 'account');
    holder.exec('BEGIN IMMEDIATE');
    bump(holder, 'other');
    const store = createRateLimitStore({ open: () => openDatabase(path) });
    try {
      const started = Date.now();
      const row = store.read((sqlite) =>
        sqlite.prepare('SELECT request_count FROM rate_limit_bucket WHERE bucket_key=?').get('account'),
      );
      expect(row).toEqual({ request_count: 1 });
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      store.close();
    }
  });

  it('the rate-limit write retries without blocking the event loop until the lock is released', async () => {
    holder.exec('BEGIN IMMEDIATE');
    bump(holder, 'jobs');
    const retries: number[] = [];
    const store = createRateLimitStore({
      open: () => openDatabase(path),
      busyTimeoutMs: 20,
      baseDelayMs: 10,
      maxDelayMs: 40,
      attempts: 50,
      onBusyRetry: (attempt) => retries.push(attempt),
    });
    // The holder commits from a timer: this only fires if the retrying writer
    // yields the event loop (a long synchronous busy wait would starve it).
    let committedAt = 0;
    setTimeout(() => {
      holder.exec('COMMIT');
      committedAt = Date.now();
    }, 150);
    try {
      await store.write((sqlite) => bump(sqlite, 'account'));
      expect(committedAt).toBeGreaterThan(0);
      expect(retries.length).toBeGreaterThan(0);
      expect(
        holder.prepare('SELECT bucket_key,request_count FROM rate_limit_bucket ORDER BY 1').all(),
      ).toEqual([
        { bucket_key: 'account', request_count: 1 },
        { bucket_key: 'jobs', request_count: 1 },
      ]);
    } finally {
      store.close();
    }
  });

  it('the rate-limit write gives up with the busy error after its attempts', async () => {
    holder.exec('BEGIN IMMEDIATE');
    const store = createRateLimitStore({
      open: () => openDatabase(path),
      busyTimeoutMs: 5,
      baseDelayMs: 5,
      maxDelayMs: 5,
      attempts: 3,
    });
    try {
      const failure = await store.write((sqlite) => bump(sqlite, 'account')).catch((error) => error);
      expect(isDatabaseBusyError(failure)).toBe(true);
      holder.exec('ROLLBACK');
      // The store recovers once the lock is free.
      await store.write((sqlite) => bump(sqlite, 'account'));
      expect(
        holder.prepare('SELECT request_count FROM rate_limit_bucket WHERE bucket_key=?').get('account'),
      ).toEqual({ request_count: 1 });
    } finally {
      store.close();
    }
  });
});
