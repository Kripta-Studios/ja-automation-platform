import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, V3Repository, WorkerStatementRepository } from '@ja/database';
import { provisionServiceActor } from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const restores: (() => void)[] = [];
const runnerPath = resolve('deployment/scripts/jobs-run.mjs');

beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function prepareEnvironment(): { databasePath: string; documentRoot: string } {
  const root = mkdtempSync(join(tmpdir(), 'ja-service-actor-runner-'));
  roots.push(root);
  const documentRoot = join(root, 'documents');
  for (const directory of [
    documentRoot,
    'receipts',
    'reports',
    'invoices',
    'technical',
    'plc-backups',
    'exports',
    'temp',
  ])
    mkdirSync(directory === documentRoot ? directory : join(documentRoot, directory), {
      recursive: true,
    });
  return { databasePath: join(root, 'app.db'), documentRoot };
}

function seedBinder(databasePath: string): void {
  const database = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES(?,?,?,1,'owner_admin','active',1,1,?,?,1)`,
      )
      .run('owner-1', 'Owner', 'antonny.luty@j-aautomation.com', now, now);
  } finally {
    database.sqlite.close();
  }
}

function seedWorker(databasePath: string): void {
  const database = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES(?,?,?,1,'worker','active',0,0,?,?,1)`,
      )
      .run('worker-1', 'Worker One', 'worker@example.test', now, now);
  } finally {
    database.sqlite.close();
  }
}

function runJobs(
  environment: { databasePath: string; documentRoot: string },
  actorId?: string,
  options: { withoutDeploymentIdentity?: boolean; secret?: string } = {},
) {
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    JA_DATABASE_PATH: environment.databasePath,
    JA_DOCUMENT_ROOT: environment.documentRoot,
    JA_TENANT_ID: B5_TEST_TENANT_ID,
    JA_DEPLOYMENT_ID: B5_TEST_DEPLOYMENT_ID,
    JA_MIN_FREE_BYTES: '0',
    NODE_ENV: 'test',
  };
  if (options.withoutDeploymentIdentity) {
    delete childEnvironment.JA_TENANT_ID;
    delete childEnvironment.JA_DEPLOYMENT_ID;
  }
  if (options.secret !== undefined) childEnvironment.JA_OUTBOX_WEBHOOK_SECRET = options.secret;
  delete childEnvironment.JA_JOB_ACTOR_ID;
  if (actorId !== undefined) childEnvironment.JA_JOB_ACTOR_ID = actorId;
  return spawnSync(process.execPath, ['--experimental-strip-types', runnerPath], {
    cwd: resolve('.'),
    env: childEnvironment,
    encoding: 'utf8',
  });
}

describe('production durable jobs runner service binding', () => {
  it('reports a structured redacted diagnosis when deployment identity is absent', () => {
    const environment = prepareEnvironment();
    const secret = 'runner-test-secret-value';
    const result = runJobs(environment, undefined, {
      withoutDeploymentIdentity: true,
      secret,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('"event":"jobs.runner.error"');
    expect(output).toContain(
      'JA_TENANT_ID must be configured as a lowercase deployment identifier',
    );
    expect(output).not.toContain(secret);
    expect(output).not.toContain('Error:');
  });

  it('fails closed when the deployment singleton binding is absent', () => {
    const environment = prepareEnvironment();
    seedBinder(environment.databasePath);
    const result = runJobs(environment);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('SERVICE_ACTOR_BINDING_UNAVAILABLE');
  });

  it('resolves the active service actor binding without treating a human as the actor', () => {
    const environment = prepareEnvironment();
    seedBinder(environment.databasePath);
    const database = createDatabase(environment.databasePath);
    try {
      provisionServiceActor(database.sqlite, {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      });
    } finally {
      database.sqlite.close();
    }
    const result = runJobs(environment);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(
      'Configured JA_JOB_ACTOR_ID is not an active finance actor',
    );
  });

  it('fails closed when the persisted binding actor loses a reviewed capability', () => {
    const environment = prepareEnvironment();
    seedBinder(environment.databasePath);
    const database = createDatabase(environment.databasePath);
    try {
      const now = new Date().toISOString();
      database.sqlite
        .prepare(
          `INSERT INTO service_actor(
             id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
           ) VALUES(?,?,?,?,?,?,?,?,1)`,
        )
        .run(
          'jobs-service-v1',
          B5_TEST_TENANT_ID,
          B5_TEST_DEPLOYMENT_ID,
          'J&A durable jobs',
          'active',
          '["artifact.invoice.render"]',
          now,
          now,
        );
      database.sqlite
        .prepare(
          `INSERT INTO deployment_service_actor_binding(
             singleton,tenant_id,deployment_id,service_actor_id,bound_at,bound_by_user_id,version
           ) VALUES(1,?,?,?,?,?,1)`,
        )
        .run(B5_TEST_TENANT_ID, B5_TEST_DEPLOYMENT_ID, 'jobs-service-v1', now, 'owner-1');
    } finally {
      database.sqlite.close();
    }
    const result = runJobs(environment);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('SERVICE_ACTOR_CAPABILITIES_CORRUPT');
  });

  it('fails closed when the deployment singleton actor is disabled', () => {
    const environment = prepareEnvironment();
    seedBinder(environment.databasePath);
    const database = createDatabase(environment.databasePath);
    try {
      provisionServiceActor(database.sqlite, {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      });
      database.sqlite
        .prepare(
          `UPDATE service_actor
              SET status='disabled',version=version+1
            WHERE id='jobs-service-v1'`,
        )
        .run();
    } finally {
      database.sqlite.close();
    }
    const result = runJobs(environment);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('SERVICE_ACTOR_BINDING_UNAVAILABLE');
  });

  it('rejects the retired human-actor environment setting even when a valid binding exists', () => {
    const environment = prepareEnvironment();
    seedBinder(environment.databasePath);
    const database = createDatabase(environment.databasePath);
    try {
      provisionServiceActor(database.sqlite, {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      });
    } finally {
      database.sqlite.close();
    }
    const result = runJobs(environment, 'owner-1');
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('LEGACY_JOB_ACTOR_ID_UNSUPPORTED');
  });

  it('renders independent durable Worker-statement formats through the bound service actor', () => {
    const environment = prepareEnvironment();
    seedBinder(environment.databasePath);
    seedWorker(environment.databasePath);
    const database = createDatabase(environment.databasePath);
    let artifactIds: string[] = [];
    try {
      provisionServiceActor(database.sqlite, {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      });
      const v3 = new V3Repository(database.sqlite);
      const statements = new WorkerStatementRepository(database.sqlite, {
        verify: () => ({ exists: false, byteLength: null, contentSha256: null }),
      });
      const artifacts = statements.requestWorkerStatementArtifacts(
        { userId: 'worker-1', role: 'worker', projectIds: new Set() },
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          templateVersion: 'client-essential-test-v1',
          generationVersion: 'client-essential-test-generation-v1',
          requestKey: 'runner-worker-statement',
          snapshot: {
            worker: { id: 'worker-1', name: 'Worker One' },
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
            currency: 'EUR',
            approvedMinutes: 0,
            pendingMinutes: 0,
            estimatedApprovedMinor: '0',
            estimatedPendingMinor: '0',
            approvedReimbursementMinor: '0',
            pendingReimbursementMinor: '0',
            missingCompensationRules: 0,
            activities: [],
            settlements: [],
            expenses: [],
          },
        },
        (artifact) => {
          v3.enqueueJob(
            'worker_statement_artifact_render',
            `worker-statement:${artifact.artifactId}:attempt:${artifact.currentAttemptNumber}`,
            { artifactId: artifact.artifactId, requestedAttempt: artifact.currentAttemptNumber },
          );
        },
      );
      artifactIds = artifacts.map((artifact) => artifact.artifactId);
      expect(artifacts.map((artifact) => artifact.format).sort()).toEqual(['csv', 'pdf']);
    } finally {
      database.sqlite.close();
    }

    const result = runJobs(environment);

    const verified = createDatabase(environment.databasePath);
    try {
      const workerJobs = verified.sqlite
        .prepare(
          `SELECT id,state,last_error_code FROM job
            WHERE kind='worker_statement_artifact_render' ORDER BY id`,
        )
        .all();
      const rows = verified.sqlite
        .prepare(
          `SELECT artifact_id,format,status,storage_key,byte_length,content_sha256
             FROM worker_statement_artifact
            WHERE artifact_id IN (?,?) ORDER BY format`,
        )
        .all(...artifactIds) as Array<{
        artifact_id: string;
        format: string;
        status: string;
        storage_key: string;
        byte_length: number;
        content_sha256: string;
      }>;
      expect(rows).toHaveLength(2);
      expect(
        rows.map((row) => row.status),
        `${result.stdout}\n${result.stderr}\n${JSON.stringify(workerJobs)}`,
      ).toEqual(['ready', 'ready']);
      expect(rows.every((row) => row.byte_length > 0 && row.content_sha256.length === 64)).toBe(
        true,
      );
      expect(rows.every((row) => existsSync(join(environment.documentRoot, row.storage_key)))).toBe(
        true,
      );
      expect(
        verified.sqlite
          .prepare(
            `SELECT count(*) count FROM job
              WHERE kind='worker_statement_artifact_render' AND state='succeeded'`,
          )
          .get(),
      ).toEqual({ count: 2 });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      verified.sqlite.close();
    }
  });
});
