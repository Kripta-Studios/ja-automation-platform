import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
let restoreDeploymentIdentity: (() => void) | undefined;
beforeAll(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
});
afterAll(() => restoreDeploymentIdentity?.());
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'ja-outbox-quarantine-'));
  roots.push(root);
  const databasePath = join(root, 'app.db');
  const backupRoot = join(root, 'backups');
  const backup = join(backupRoot, 'latest');
  const environmentPath = join(root, 'jaautomation.env');
  mkdirSync(backup, { recursive: true });
  const secret = 'test-secret-that-is-long-enough-for-hmac-validation';
  writeFileSync(
    environmentPath,
    [
      'JA_OUTBOX_WEBHOOK_URL=https://j-aautomation.com/j-aautomation/app/api/internal/outbox-delivery',
      `JA_OUTBOX_WEBHOOK_SECRET=${secret}`,
      'JA_OUTBOX_CUTOVER_AT=2026-09-04T00:00:00.000Z',
      '',
    ].join('\n'),
  );
  const { sqlite } = createDatabase(databasePath);
  return { root, databasePath, backup, environmentPath, secret, sqlite };
};

const insertEvent = (
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  topic: string,
  createdAt: string,
  failedAt: string | null = null,
) =>
  sqlite
    .prepare(
      `INSERT INTO outbox_event(
         id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,failed_at
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run(id, topic, `aggregate-${id}`, `key-${id}`, '{}', createdAt, createdAt, failedAt);

const createVerifiedBackup = (fixtureValue: ReturnType<typeof fixture>) => {
  const backupDatabase = join(fixtureValue.backup, 'database.db');
  copyFileSync(fixtureValue.databasePath, backupDatabase);
  const bytes = readFileSync(backupDatabase);
  writeFileSync(
    join(fixtureValue.backup, 'manifest.json'),
    JSON.stringify({
      format: 1,
      createdAt: new Date().toISOString(),
      database: {
        path: 'database.db',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: statSync(backupDatabase).size,
      },
      documents: [],
    }),
  );
};

const runQuarantine = (fixtureValue: ReturnType<typeof fixture>) =>
  spawnSync(
    process.execPath,
    [
      resolve('deployment/scripts/quarantine-outbox-backlog.mjs'),
      `--database=${fixtureValue.databasePath}`,
      `--backup-dir=${fixtureValue.backup}`,
      `--env-file=${fixtureValue.environmentPath}`,
      '--apply',
    ],
    { encoding: 'utf8' },
  );

describe('pre-cutover outbox quarantine', () => {
  it('quarantines only pending pre-cutover rows after a fresh backup', () => {
    const value = fixture();
    try {
      insertEvent(
        value.sqlite,
        'old-notification',
        'notification.email.requested',
        '2026-09-03T23:00:00.000Z',
      );
      insertEvent(
        value.sqlite,
        'old-inquiry',
        'public-inquiry.received',
        '2026-09-03T23:30:00.000Z',
      );
      insertEvent(
        value.sqlite,
        'new-notification',
        'notification.email.requested',
        '2026-09-04T00:00:00.000Z',
      );
      insertEvent(
        value.sqlite,
        'already-failed',
        'notification.email.requested',
        '2026-09-03T22:00:00.000Z',
        '2026-09-03T22:30:00.000Z',
      );
      value.sqlite.close();
      createVerifiedBackup(value);
      const result = runQuarantine(value);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"outboxQuarantine":"applied"');
      expect(result.stdout).toContain('"total":2');
      expect(`${result.stdout}${result.stderr}`).not.toContain(value.secret);
      const reopened = createDatabase(value.databasePath).sqlite;
      try {
        expect(
          reopened.prepare('SELECT id,last_error,failed_at FROM outbox_event ORDER BY id').all(),
        ).toEqual([
          {
            id: 'already-failed',
            last_error: null,
            failed_at: '2026-09-03T22:30:00.000Z',
          },
          {
            id: 'new-notification',
            last_error: null,
            failed_at: null,
          },
          {
            id: 'old-inquiry',
            last_error: 'PRE_CUTOVER_QUARANTINED',
            failed_at: expect.any(String),
          },
          {
            id: 'old-notification',
            last_error: 'PRE_CUTOVER_QUARANTINED',
            failed_at: expect.any(String),
          },
        ]);
      } finally {
        reopened.close();
      }
    } finally {
      if (value.sqlite.isOpen) value.sqlite.close();
    }
  });

  it('fails before mutation when a post-cutover topic is unsupported', () => {
    const value = fixture();
    try {
      insertEvent(
        value.sqlite,
        'old-notification',
        'notification.email.requested',
        '2026-09-03T23:00:00.000Z',
      );
      insertEvent(value.sqlite, 'unsupported', 'unknown.topic', '2026-09-04T00:01:00.000Z');
      value.sqlite.close();
      createVerifiedBackup(value);
      const result = runQuarantine(value);
      expect(result.status).not.toBe(0);
      const reopened = createDatabase(value.databasePath).sqlite;
      try {
        expect(
          reopened.prepare('SELECT failed_at FROM outbox_event WHERE id=?').get('old-notification'),
        ).toEqual({ failed_at: null });
      } finally {
        reopened.close();
      }
    } finally {
      if (value.sqlite.isOpen) value.sqlite.close();
    }
  });

  it('fails closed before mutation when the exact backup hash is invalid', () => {
    const value = fixture();
    try {
      insertEvent(
        value.sqlite,
        'old-notification',
        'notification.email.requested',
        '2026-09-03T23:00:00.000Z',
      );
      value.sqlite.close();
      createVerifiedBackup(value);
      writeFileSync(join(value.backup, 'database.db'), 'not-the-manifest-database');
      const result = runQuarantine(value);
      expect(result.status).not.toBe(0);
      const reopened = createDatabase(value.databasePath).sqlite;
      try {
        expect(
          reopened.prepare('SELECT failed_at FROM outbox_event WHERE id=?').get('old-notification'),
        ).toEqual({ failed_at: null });
      } finally {
        reopened.close();
      }
    } finally {
      if (value.sqlite.isOpen) value.sqlite.close();
    }
  });
});
