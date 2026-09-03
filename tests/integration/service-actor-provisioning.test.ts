import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  DURABLE_JOB_CAPABILITIES,
  provisionServiceActor,
  resolveConfiguredServiceActor,
} from '../../packages/database/src/domains/jobs/service-actor-repository.ts';
import {
  B5_TEST_DEPLOYMENT_ID,
  B5_TEST_TENANT_ID,
  installB5TestDeploymentIdentity,
} from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const restores: (() => void)[] = [];

beforeEach(() => {
  restores.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function openDatabase(): ReturnType<typeof createDatabase> {
  const root = mkdtempSync(join(tmpdir(), 'ja-service-actor-'));
  roots.push(root);
  const database = createDatabase(join(root, 'app.db'));
  const now = new Date().toISOString();
  for (const [id, role] of [
    ['owner-1', 'owner_admin'],
    ['owner-2', 'finance_admin'],
  ] as const) {
    database.sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES(?,?,?,1,?, 'active',1,1,?,?,1)`,
      )
      .run(
        id,
        id,
        role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.test`,
        role,
        now,
        now,
      );
  }
  return database;
}

describe('deployment service-actor provisioning', () => {
  it('creates the singleton binding and makes identical replay a no-op', () => {
    const { sqlite } = openDatabase();
    try {
      const input = {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      };

      const first = provisionServiceActor(sqlite, input);
      const replay = provisionServiceActor(sqlite, input);

      expect(first).toMatchObject({
        created: true,
        rotated: false,
        actorId: 'jobs-service-v1',
        bindingVersion: 1,
      });
      expect(replay).toMatchObject({
        created: false,
        rotated: false,
        actorId: 'jobs-service-v1',
        bindingVersion: 1,
      });
      expect(
        (sqlite.prepare('SELECT COUNT(*) count FROM service_actor').get() as { count: number })
          .count,
      ).toBe(1);
      expect(
        (
          sqlite.prepare('SELECT COUNT(*) count FROM deployment_service_actor_binding').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it('defaults to the reviewed capability allowlist and rejects unknown or duplicate values', () => {
    const { sqlite } = openDatabase();
    try {
      const result = provisionServiceActor(sqlite, {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      });
      expect(result.capabilities).toEqual([...DURABLE_JOB_CAPABILITIES]);
      expect(() =>
        provisionServiceActor(sqlite, {
          tenantId: B5_TEST_TENANT_ID,
          deploymentId: B5_TEST_DEPLOYMENT_ID,
          actorId: 'jobs-service-v2',
          name: 'J&A durable jobs v2',
          boundByUserId: 'owner-2',
          capabilities: ['not-a-reviewed-capability'],
        }),
      ).toThrow('INVALID_SERVICE_ACTOR_CAPABILITIES');
      expect(() =>
        provisionServiceActor(sqlite, {
          tenantId: B5_TEST_TENANT_ID,
          deploymentId: B5_TEST_DEPLOYMENT_ID,
          actorId: 'jobs-service-v2',
          name: 'J&A durable jobs v2',
          boundByUserId: 'owner-1',
          capabilities: [DURABLE_JOB_CAPABILITIES[0]!, DURABLE_JOB_CAPABILITIES[0]!],
        }),
      ).toThrow('INVALID_SERVICE_ACTOR_CAPABILITIES');
      expect(
        (sqlite.prepare('SELECT COUNT(*) count FROM service_actor').get() as { count: number })
          .count,
      ).toBe(1);
      expect(() =>
        provisionServiceActor(sqlite, {
          tenantId: B5_TEST_TENANT_ID,
          deploymentId: B5_TEST_DEPLOYMENT_ID,
          actorId: 'jobs-service-v2',
          name: 'J&A durable jobs v2',
          boundByUserId: 'owner-1',
          capabilities: [DURABLE_JOB_CAPABILITIES[0]!],
        }),
      ).toThrow('INVALID_SERVICE_ACTOR_CAPABILITIES');
    } finally {
      sqlite.close();
    }
  });

  it('fails closed when a persisted actor loses a reviewed capability', () => {
    const { sqlite } = openDatabase();
    try {
      provisionServiceActor(sqlite, {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        actorId: 'jobs-service-v1',
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      });
      sqlite
        .prepare(
          `UPDATE service_actor
              SET capabilities_json='["artifact.invoice.render"]',version=version+1
            WHERE id='jobs-service-v1'`,
        )
        .run();
      expect(() => resolveConfiguredServiceActor(sqlite)).toThrow(
        'SERVICE_ACTOR_CAPABILITIES_CORRUPT',
      );
    } finally {
      sqlite.close();
    }
  });

  it('rotates to a new actor, retains the previous actor, and replays idempotently', () => {
    const { sqlite } = openDatabase();
    try {
      const base = {
        tenantId: B5_TEST_TENANT_ID,
        deploymentId: B5_TEST_DEPLOYMENT_ID,
        name: 'J&A durable jobs',
        boundByUserId: 'owner-1',
      } as const;
      provisionServiceActor(sqlite, { ...base, actorId: 'jobs-service-v1' });

      const rotation = provisionServiceActor(sqlite, {
        ...base,
        actorId: 'jobs-service-v2',
        name: 'J&A durable jobs v2',
        boundByUserId: 'owner-2',
        rotate: true,
      });
      const replay = provisionServiceActor(sqlite, {
        ...base,
        actorId: 'jobs-service-v2',
        name: 'J&A durable jobs v2',
        boundByUserId: 'owner-2',
        rotate: true,
      });

      expect(rotation).toMatchObject({
        created: true,
        rotated: true,
        actorId: 'jobs-service-v2',
        previousActorId: 'jobs-service-v1',
        bindingVersion: 2,
      });
      expect(replay).toMatchObject({
        created: false,
        rotated: false,
        actorId: 'jobs-service-v2',
        bindingVersion: 2,
      });
      expect(
        sqlite.prepare('SELECT id,status,version FROM service_actor ORDER BY id').all(),
      ).toEqual([
        { id: 'jobs-service-v1', status: 'disabled', version: 2 },
        { id: 'jobs-service-v2', status: 'active', version: 1 },
      ]);
      expect(
        sqlite
          .prepare(
            'SELECT service_actor_id,bound_by_user_id,version FROM deployment_service_actor_binding',
          )
          .get(),
      ).toEqual({ service_actor_id: 'jobs-service-v2', bound_by_user_id: 'owner-2', version: 2 });
    } finally {
      sqlite.close();
    }
  });

  it('fails closed for deployment mismatches and inactive binders without mutating state', () => {
    const { sqlite } = openDatabase();
    try {
      expect(() =>
        provisionServiceActor(sqlite, {
          tenantId: 'other-tenant',
          deploymentId: B5_TEST_DEPLOYMENT_ID,
          actorId: 'jobs-service-v1',
          name: 'J&A durable jobs',
          boundByUserId: 'owner-1',
        }),
      ).toThrow('DEPLOYMENT_IDENTITY_MISMATCH');
      sqlite
        .prepare("UPDATE user SET status='suspended',version=version+1 WHERE id='owner-2'")
        .run();
      expect(() =>
        provisionServiceActor(sqlite, {
          tenantId: B5_TEST_TENANT_ID,
          deploymentId: B5_TEST_DEPLOYMENT_ID,
          actorId: 'jobs-service-v1',
          name: 'J&A durable jobs',
          boundByUserId: 'owner-2',
        }),
      ).toThrow('SERVICE_ACTOR_BINDER_UNAVAILABLE');
      expect(
        (sqlite.prepare('SELECT COUNT(*) count FROM service_actor').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('rejects an actor id that is already assigned to a human user', () => {
    const { sqlite } = openDatabase();
    try {
      expect(() =>
        provisionServiceActor(sqlite, {
          tenantId: B5_TEST_TENANT_ID,
          deploymentId: B5_TEST_DEPLOYMENT_ID,
          actorId: 'owner-1',
          name: 'J&A durable jobs',
          boundByUserId: 'owner-1',
        }),
      ).toThrow('SERVICE_ACTOR_ID_CONFLICT');
      expect(
        (sqlite.prepare('SELECT COUNT(*) count FROM service_actor').get() as { count: number })
          .count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
