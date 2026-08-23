import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  B5_DURABLE_JOB_REGISTRY,
  durableRegistryMap,
  makeB5DurableJobFixture,
} from '../fixtures/b5-durable-job-fixture.js';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
let restoreDeploymentIdentity: (() => void) | undefined;
beforeAll(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
});
afterAll(() => restoreDeploymentIdentity?.());
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('B5 durable job security boundary (RED characterization)', () => {
  it('pins the reviewed accounting-pack job kind and capability without finance fixture truth', () => {
    const fixture = makeB5DurableJobFixture();
    expect(durableRegistryMap().get('accounting_pack_artifact_render')).toBe(
      'artifact.accounting_pack.render',
    );
    expect(fixture.financeEntities).toEqual([]);
    expect(B5_DURABLE_JOB_REGISTRY).toHaveLength(10);
  });

  it('requires tenant/deployment/contract/fence columns in production job tables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-jobs-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    try {
      const jobColumns = new Set(
        (sqlite.prepare("PRAGMA table_info('job')").all() as Array<{ name: string }>).map(
          (row) => row.name,
        ),
      );
      const runColumns = new Set(
        (sqlite.prepare("PRAGMA table_info('job_run')").all() as Array<{ name: string }>).map(
          (row) => row.name,
        ),
      );
      for (const column of [
        'tenant_id',
        'deployment_id',
        'contract_version',
        'payload_sha256',
        'correlation_id',
        'required_capability',
        'active_job_run_id',
        'fence_version',
      ]) {
        expect(jobColumns.has(column), `job.${column} is required`).toBe(true);
      }
      for (const column of [
        'tenant_id',
        'deployment_id',
        'contract_version',
        'required_capability',
        'service_actor_id',
        'fence_version',
        'fencing_token',
      ]) {
        expect(runColumns.has(column), `job_run.${column} is required`).toBe(true);
      }
    } finally {
      sqlite.close();
    }
  });

  it('requires service-actor and deployment binding tables before service execution', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-service-actor-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    try {
      const tables = new Set(
        (
          sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
            name: string;
          }>
        ).map((row) => row.name),
      );
      expect(tables.has('service_actor')).toBe(true);
      expect(tables.has('deployment_service_actor_binding')).toBe(true);
    } finally {
      sqlite.close();
    }
  });
});
