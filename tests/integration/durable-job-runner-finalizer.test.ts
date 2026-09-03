import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, V3Repository } from '@ja/database';
import { provisionServiceActor } from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const restores: Array<() => void> = [];

beforeEach(() => {
  restores.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  vi.useRealTimers();
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): {
  path: string;
  sqlite: ReturnType<typeof createDatabase>['sqlite'];
  v3: V3Repository;
} {
  const root = mkdtempSync(join(tmpdir(), 'ja-durable-runner-finalizer-'));
  roots.push(root);
  const path = join(root, 'app.db');
  const database = createDatabase(path);
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES('runner-owner','Runner Owner','antonny.luty@j-aautomation.com',1,'owner_admin','active',1,1,?,?,1)`,
    )
    .run(now, now);
  provisionServiceActor(database.sqlite, {
    tenantId: B5_TEST_TENANT_ID,
    deploymentId: B5_TEST_DEPLOYMENT_ID,
    actorId: 'jobs-service-v1',
    name: 'J&A durable jobs',
    boundByUserId: 'runner-owner',
  });
  database.sqlite.exec('CREATE TABLE finalizer_probe(value TEXT NOT NULL) STRICT');
  return { path, sqlite: database.sqlite, v3: new V3Repository(database.sqlite) };
}

describe('durable runner finalizer boundary', () => {
  it('rolls back finalizer writes, persists a bounded redacted diagnosis, and retries independently', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2110-01-01T00:00:00.000Z'));
    const { sqlite, v3 } = fixture();
    let handlerCalls = 0;
    try {
      v3.enqueueJob('backup_verify', 'runner-finalizer-boundary', { scope: 'reports' });

      const first = v3.runDueJobs(1, {
        backup_verify: (_payload, execution) => {
          expect(execution.requiredCapability).toBe('backup.verify');
          handlerCalls += 1;
          if (handlerCalls > 1)
            return () => {
              sqlite.prepare('INSERT INTO finalizer_probe(value) VALUES(?)').run('committed');
            };
          return () => {
            sqlite.prepare('INSERT INTO finalizer_probe(value) VALUES(?)').run('rolled-back');
            throw new Error(
              'Chromium renderer failed at C:\\private\\customer\\report.pdf for user@example.test with token=secret-token-value',
            );
          };
        },
      });

      expect(first).toMatchObject({ processed: 0, failed: 1 });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM finalizer_probe').get()).toEqual({
        count: 0,
      });
      expect(
        sqlite
          .prepare(
            `SELECT state,attempts,last_error_code,active_job_run_id
               FROM job WHERE idempotency_key=?`,
          )
          .get('runner-finalizer-boundary'),
      ).toMatchObject({
        state: 'queued',
        attempts: 1,
        last_error_code: 'HANDLER_FAILED',
        active_job_run_id: null,
      });
      expect(
        sqlite
          .prepare(
            `SELECT state,outcome,error_code,retry_run_after
               FROM job_run
              WHERE job_id=(SELECT id FROM job WHERE idempotency_key=?)
              ORDER BY started_at DESC,id DESC LIMIT 1`,
          )
          .get('runner-finalizer-boundary'),
      ).toMatchObject({
        state: 'failed',
        outcome: 'retry_scheduled',
        error_code: 'HANDLER_FAILED',
      });
      const failureAudit = sqlite
        .prepare(
          `SELECT details_json FROM audit_event
             WHERE action='service_job.fail'
             ORDER BY occurred_at DESC,rowid DESC LIMIT 1`,
        )
        .get() as { details_json: string } | undefined;
      expect(failureAudit).toBeDefined();
      const diagnostic = JSON.parse(failureAudit?.details_json ?? '{}') as {
        errorDetail?: string;
      };
      expect(diagnostic.errorDetail).toMatch(/^HANDLER_FAILED:/u);
      expect(diagnostic.errorDetail).not.toContain('secret-token-value');
      expect(diagnostic.errorDetail).not.toContain('user@example.test');
      expect(diagnostic.errorDetail).not.toContain('C:\\private');
      expect(diagnostic.errorDetail?.length).toBeLessThanOrEqual(300);

      vi.setSystemTime(new Date('2110-01-01T00:05:00.001Z'));
      const second = v3.runDueJobs(1, {
        backup_verify: (_payload, execution) => {
          expect(execution.requiredCapability).toBe('backup.verify');
          handlerCalls += 1;
          return () => {
            sqlite.prepare('INSERT INTO finalizer_probe(value) VALUES(?)').run('committed');
          };
        },
      });
      expect(second).toMatchObject({ processed: 1, failed: 0 });
      expect(sqlite.prepare('SELECT value FROM finalizer_probe').all()).toEqual([
        { value: 'committed' },
      ]);
      expect(
        sqlite
          .prepare('SELECT state,attempts FROM job WHERE idempotency_key=?')
          .get('runner-finalizer-boundary'),
      ).toEqual({ state: 'succeeded', attempts: 2 });
    } finally {
      sqlite.close();
    }
  });
});
