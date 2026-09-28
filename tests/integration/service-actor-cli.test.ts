import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  executeServiceActorCli,
  parseServiceActorCliArgs,
} from '../../packages/database/src/cli/service-actor.ts';
import { DURABLE_JOB_CAPABILITIES } from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const restores: (() => void)[] = [];

beforeEach(() => restores.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setupDatabase(): string {
  const root = mkdtempSync(join(tmpdir(), 'ja-service-actor-cli-'));
  roots.push(root);
  const databasePath = join(root, 'app.db');
  const database = createDatabase(databasePath);
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES('operator-1','Operator','antonny.luty@j-aautomation.com',1,'owner_admin','active',1,1,?,?,1),
       ('operator-2','Operator 2','operator-2@example.test',1,'finance_admin','active',1,1,?,?,1)`,
    )
    .run(now, now, now, now);
  database.sqlite.close();
  return databasePath;
}

describe('service-actor production CLI', () => {
  it('parses provision/rotate commands without the retired human actor option', () => {
    expect(
      parseServiceActorCliArgs([
        'provision',
        '--tenant-id',
        B5_TEST_TENANT_ID,
        '--deployment-id',
        B5_TEST_DEPLOYMENT_ID,
        '--actor-id',
        'jobs-service-v1',
        '--name',
        'J&A durable jobs',
        '--bound-by-user-id',
        'operator-1',
      ]),
    ).toMatchObject({ command: 'provision', actorId: 'jobs-service-v1' });
    expect(() => parseServiceActorCliArgs(['provision', '--JA_JOB_ACTOR_ID', 'human-1'])).toThrow(
      'UNKNOWN_SERVICE_ACTOR_OPTION',
    );
  });

  it('uses only deployment identity environment settings when identity flags are omitted', () => {
    expect(
      parseServiceActorCliArgs(
        [
          'provision',
          '--actor-id',
          'jobs-service-v1',
          '--name',
          'J&A durable jobs',
          '--bound-by-user-id',
          'operator-1',
        ],
        {
          JA_TENANT_ID: B5_TEST_TENANT_ID,
          JA_DEPLOYMENT_ID: B5_TEST_DEPLOYMENT_ID,
        },
      ),
    ).toMatchObject({
      tenantId: B5_TEST_TENANT_ID,
      deploymentId: B5_TEST_DEPLOYMENT_ID,
      actorId: 'jobs-service-v1',
    });
  });

  it('parses the exact reviewed capability allowlist and rejects malformed lists', () => {
    expect(
      parseServiceActorCliArgs([
        'provision',
        '--tenant-id',
        B5_TEST_TENANT_ID,
        '--deployment-id',
        B5_TEST_DEPLOYMENT_ID,
        '--actor-id',
        'jobs-service-v1',
        '--name',
        'J&A durable jobs',
        '--bound-by-user-id',
        'operator-1',
        '--capabilities',
        [...DURABLE_JOB_CAPABILITIES].reverse().join(','),
      ]),
    ).toMatchObject({
      command: 'provision',
      capabilities: [...DURABLE_JOB_CAPABILITIES],
    });
    expect(() =>
      parseServiceActorCliArgs([
        'provision',
        '--tenant-id',
        B5_TEST_TENANT_ID,
        '--deployment-id',
        B5_TEST_DEPLOYMENT_ID,
        '--actor-id',
        'jobs-service-v1',
        '--name',
        'J&A durable jobs',
        '--bound-by-user-id',
        'operator-1',
        '--capabilities',
        'backup.verify',
      ]),
    ).toThrow('INVALID_SERVICE_ACTOR_CLI_CAPABILITIES');
    expect(() =>
      parseServiceActorCliArgs([
        'provision',
        '--tenant-id',
        B5_TEST_TENANT_ID,
        '--deployment-id',
        B5_TEST_DEPLOYMENT_ID,
        '--actor-id',
        'jobs-service-v1',
        '--name',
        'J&A durable jobs',
        '--bound-by-user-id',
        'operator-1',
        '--capabilities',
        'backup.verify,,artifact.invoice.render',
      ]),
    ).toThrow('INVALID_SERVICE_ACTOR_CLI_CAPABILITIES');
  });

  it('provisions through the same CLI contract and emits a replay-safe result', () => {
    const databasePath = setupDatabase();
    const argv = [
      'provision',
      '--tenant-id',
      B5_TEST_TENANT_ID,
      '--deployment-id',
      B5_TEST_DEPLOYMENT_ID,
      '--actor-id',
      'jobs-service-v1',
      '--name',
      'J&A durable jobs',
      '--bound-by-user-id',
      'operator-1',
      '--database-path',
      databasePath,
    ];
    expect(executeServiceActorCli(argv)).toMatchObject({ created: true, bindingVersion: 1 });
    expect(executeServiceActorCli(argv)).toMatchObject({ created: false, bindingVersion: 1 });
    const database = createDatabase(databasePath);
    try {
      expect(
        (
          database.sqlite
            .prepare('SELECT service_actor_id FROM deployment_service_actor_binding')
            .get() as { service_actor_id: string }
        ).service_actor_id,
      ).toBe('jobs-service-v1');
    } finally {
      database.sqlite.close();
    }
  });

  it('rejects missing actor/operator arguments before opening a database', () => {
    expect(() => parseServiceActorCliArgs(['rotate', '--actor-id', 'jobs-service-v2'])).toThrow(
      'SERVICE_ACTOR_CLI_ARGUMENT_MISSING',
    );
  });

  it('executes a rotate command and preserves replay semantics', () => {
    const databasePath = setupDatabase();
    const common = [
      '--tenant-id',
      B5_TEST_TENANT_ID,
      '--deployment-id',
      B5_TEST_DEPLOYMENT_ID,
      '--database-path',
      databasePath,
    ];
    expect(
      executeServiceActorCli([
        'provision',
        ...common,
        '--name',
        'J&A durable jobs',
        '--bound-by-user-id',
        'operator-1',
        '--actor-id',
        'jobs-service-v1',
      ]),
    ).toMatchObject({ created: true, rotated: false });
    expect(
      executeServiceActorCli([
        'rotate',
        ...common,
        '--name',
        'J&A durable jobs v2',
        '--bound-by-user-id',
        'operator-2',
        '--actor-id',
        'jobs-service-v2',
      ]),
    ).toMatchObject({ created: true, rotated: true, previousActorId: 'jobs-service-v1' });
    expect(
      executeServiceActorCli([
        'rotate',
        ...common,
        '--name',
        'J&A durable jobs v2',
        '--bound-by-user-id',
        'operator-2',
        '--actor-id',
        'jobs-service-v2',
      ]),
    ).toMatchObject({ created: false, rotated: false, actorId: 'jobs-service-v2' });
  });
});
