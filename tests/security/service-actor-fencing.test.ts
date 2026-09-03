import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PortalRepository,
  assertFencedJobExecution,
  createDatabase,
  V3Repository,
} from '@ja/database';
import {
  DURABLE_JOB_CAPABILITIES,
  provisionServiceActor,
} from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const restores: Array<() => void> = [];

beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  vi.useRealTimers();
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Database = ReturnType<typeof createDatabase>;
type Sqlite = Database['sqlite'];
type Execution = Parameters<typeof assertFencedJobExecution>[1];

function fixture(): { sqlite: Sqlite; v3: V3Repository } {
  const root = mkdtempSync(join(tmpdir(), 'ja-service-actor-fencing-'));
  roots.push(root);
  const database = createDatabase(join(root, 'app.db'));
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES('operator-1','Operator','antonny.luty@j-aautomation.com',1,'owner_admin','active',1,1,?,?,1)`,
    )
    .run(now, now);
  provisionServiceActor(database.sqlite, {
    tenantId: B5_TEST_TENANT_ID,
    deploymentId: B5_TEST_DEPLOYMENT_ID,
    actorId: 'jobs-service-v1',
    name: 'J&A durable jobs',
    boundByUserId: 'operator-1',
  });
  database.sqlite.exec(
    `CREATE TABLE protected_service_write(
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       job_id TEXT NOT NULL,
       run_id TEXT NOT NULL
     ) STRICT`,
  );
  return { sqlite: database.sqlite, v3: new V3Repository(database.sqlite) };
}

function enqueueBackup(v3: V3Repository, suffix: string): string {
  return v3.enqueueJob('backup_verify', `fencing:${suffix}`, { target: suffix }).id;
}

function expectedBackup(target = undefined as string | undefined) {
  return {
    kind: 'backup_verify' as const,
    capability: 'backup.verify' as const,
    ...(target === undefined ? {} : { payloadTarget: { target } }),
  };
}

function protectedWrites(sqlite: Sqlite): number {
  return Number(
    (
      sqlite.prepare('SELECT count(*) count FROM protected_service_write').get() as {
        count: number;
      }
    ).count,
  );
}

function expectRejectedProof(
  value: { sqlite: Sqlite; v3: V3Repository },
  proof: (execution: Execution) => Execution,
  expected = expectedBackup('valid'),
): void {
  enqueueBackup(value.v3, 'valid');
  const result = value.v3.runDueJobs(1, {
    backup_verify: (_payload, execution) => {
      const authorized = assertFencedJobExecution(value.sqlite, proof(execution), expected);
      value.sqlite
        .prepare('INSERT INTO protected_service_write(job_id,run_id) VALUES(?,?)')
        .run(authorized.jobId, authorized.runId);
    },
  });
  expect(result.processed).toBe(0);
  expect(result.failed).toBe(1);
  expect(protectedWrites(value.sqlite)).toBe(0);
}

describe('fenced service actor execution rejects stale or forged proofs before writes', () => {
  it('cannot resolve the service actor as a human principal', () => {
    const value = fixture();
    try {
      expect(() => new PortalRepository(value.sqlite).principalFor('jobs-service-v1')).toThrow(
        /active account required/i,
      );
    } finally {
      value.sqlite.close();
    }
  });

  it.each([
    ['wrong job id', (execution: Execution) => ({ ...execution, jobId: 'missing-job' })],
    ['wrong run id', (execution: Execution) => ({ ...execution, runId: 'missing-run' })],
    ['wrong tenant', (execution: Execution) => ({ ...execution, tenantId: 'other-tenant' })],
    [
      'wrong deployment',
      (execution: Execution) => ({ ...execution, deploymentId: 'other-deploy' }),
    ],
    [
      'wrong capability',
      (execution: Execution) => ({ ...execution, requiredCapability: 'artifact.invoice.render' }),
    ],
    [
      'wrong fence',
      (execution: Execution) => ({ ...execution, fenceVersion: execution.fenceVersion + 1 }),
    ],
  ])('%s leaves the protected write absent', (_label, proof) => {
    const value = fixture();
    try {
      expectRejectedProof(value, proof);
    } finally {
      value.sqlite.close();
    }
  });

  it('rejects a wrong kind before touching the protected write', () => {
    const value = fixture();
    try {
      expectRejectedProof(value, (execution) => execution, {
        kind: 'invoice_pdf',
        capability: 'artifact.invoice.render',
      });
    } finally {
      value.sqlite.close();
    }
  });

  it('rejects a payload target mismatch before touching the protected write', () => {
    const value = fixture();
    try {
      expectRejectedProof(value, (execution) => execution, expectedBackup('different-target'));
    } finally {
      value.sqlite.close();
    }
  });

  it('rejects an expired lease and does not write through a stale execution', () => {
    const value = fixture();
    const initial = new Date('2026-08-29T12:00:00.000Z');
    vi.useFakeTimers({ now: initial });
    try {
      enqueueBackup(value.v3, 'expired');
      const result = value.v3.runDueJobs(1, {
        backup_verify: (_payload, execution) => {
          vi.setSystemTime(new Date(initial.getTime() + 10 * 60_000));
          const authorized = assertFencedJobExecution(
            value.sqlite,
            execution,
            expectedBackup('expired'),
          );
          value.sqlite
            .prepare('INSERT INTO protected_service_write(job_id,run_id) VALUES(?,?)')
            .run(authorized.jobId, authorized.runId);
        },
      });
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(protectedWrites(value.sqlite)).toBe(0);
    } finally {
      value.sqlite.close();
    }
  });

  it('rejects a disabled actor, rotated binding and changed capability snapshot', () => {
    const disabled = fixture();
    try {
      expectRejectedProof(disabled, (execution) => {
        disabled.sqlite
          .prepare(
            "UPDATE service_actor SET status='disabled',version=version+1 WHERE id='jobs-service-v1'",
          )
          .run();
        return execution;
      });
    } finally {
      disabled.sqlite.close();
    }

    const rotated = fixture();
    try {
      expectRejectedProof(rotated, (execution) => {
        const now = new Date().toISOString();
        rotated.sqlite
          .prepare(
            `INSERT INTO service_actor(
               id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
             ) SELECT 'jobs-service-v2',tenant_id,deployment_id,'Replacement','active',capabilities_json,?,?,1
                FROM service_actor WHERE id='jobs-service-v1'`,
          )
          .run(now, now);
        rotated.sqlite
          .prepare(
            `UPDATE deployment_service_actor_binding
                SET service_actor_id='jobs-service-v2',bound_at=?,version=version+1
              WHERE singleton=1`,
          )
          .run(now);
        return execution;
      });
    } finally {
      rotated.sqlite.close();
    }

    const changedCapabilities = fixture();
    try {
      expectRejectedProof(changedCapabilities, (execution) => {
        changedCapabilities.sqlite
          .prepare('UPDATE service_actor SET capabilities_json=?,version=version+1 WHERE id=?')
          .run(JSON.stringify([...DURABLE_JOB_CAPABILITIES].reverse()), 'jobs-service-v1');
        return execution;
      });
    } finally {
      changedCapabilities.sqlite.close();
    }
  });

  it('rejects a tampered persisted payload hash before invoking a protected write', () => {
    const value = fixture();
    try {
      const now = new Date().toISOString();
      const payloadJson = '{"target":"tampered"}';
      value.sqlite
        .prepare(
          `INSERT INTO job(
             id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,
             updated_at,version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,
             required_capability,active_job_run_id,fence_version,max_attempts,last_error_code
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'tampered-payload-job',
          'backup_verify',
          'tampered-payload-key',
          'queued',
          now,
          null,
          0,
          payloadJson,
          now,
          now,
          1,
          B5_TEST_TENANT_ID,
          B5_TEST_DEPLOYMENT_ID,
          'b5-v1',
          'a'.repeat(64),
          'tampered-payload-correlation',
          'backup.verify',
          null,
          0,
          5,
          null,
        );
      expect(
        value.v3.runDueJobs(1, {
          backup_verify: () => {
            throw new Error('protected handler must not be called');
          },
        }),
      ).toEqual({ processed: 0, failed: 1, overdueMarked: 0 });
      expect(protectedWrites(value.sqlite)).toBe(0);
    } finally {
      value.sqlite.close();
    }
  });

  it('rejects replay after the job has completed and keeps the write count at one', () => {
    const value = fixture();
    let completedExecution: Execution | undefined;
    try {
      enqueueBackup(value.v3, 'replay');
      expect(
        value.v3.runDueJobs(1, {
          backup_verify: (_payload, execution) => {
            completedExecution = execution;
            const authorized = assertFencedJobExecution(
              value.sqlite,
              execution,
              expectedBackup('replay'),
            );
            value.sqlite
              .prepare('INSERT INTO protected_service_write(job_id,run_id) VALUES(?,?)')
              .run(authorized.jobId, authorized.runId);
          },
        }),
      ).toEqual({ processed: 1, failed: 0, overdueMarked: 0 });
      expect(protectedWrites(value.sqlite)).toBe(1);
      expect(completedExecution).toBeDefined();
      expect(() =>
        assertFencedJobExecution(value.sqlite, completedExecution!, expectedBackup('replay')),
      ).toThrow('FENCED_JOB_EXECUTION_INVALID');
      expect(protectedWrites(value.sqlite)).toBe(1);
    } finally {
      value.sqlite.close();
    }
  });
});
