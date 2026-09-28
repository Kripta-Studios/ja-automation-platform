import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('service actor and user identity namespaces', () => {
  it('rejects direct SQL inserts in both namespace directions', () => {
    const value = fixture();
    const now = new Date().toISOString();
    const actorCapabilities = JSON.stringify(['artifact.invoice.render']);

    expect(() =>
      value.sqlite
        .prepare(
          `INSERT INTO service_actor(
             id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
           ) VALUES(?,?,?,?,?,?,?,?,1)`,
        )
        .run(
          value.owner.userId,
          'test-tenant',
          'test-deployment',
          'Collision actor',
          'active',
          actorCapabilities,
          now,
          now,
        ),
    ).toThrow(/namespace|collid/iu);

    expect(() =>
      value.sqlite
        .prepare(
          `INSERT INTO user(
             id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
           ) VALUES(?,?,?,1,'worker','active',0,0,?,?,1)`,
        )
        .run('test-b5-service-actor', 'Collision user', 'collision@example.test', now, now),
    ).toThrow(/namespace|collid/iu);

    expect(value.sqlite.prepare('SELECT count(*) count FROM service_actor').get()).toEqual({
      count: 1,
    });
    expect(value.sqlite.prepare('SELECT count(*) count FROM user').get()).toEqual({ count: 5 });
  });

  it('rejects direct SQL renames into either namespace and retains both original IDs', () => {
    const value = fixture();
    const now = new Date().toISOString();
    value.sqlite
      .prepare(
        `INSERT INTO service_actor(
           id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?,?,?,1)`,
      )
      .run(
        'namespace-actor',
        'test-tenant',
        'test-deployment',
        'Namespace actor',
        'active',
        JSON.stringify(['artifact.invoice.render']),
        now,
        now,
      );
    value.sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES(?,?,?,1,'worker','active',0,0,?,?,1)`,
      )
      .run('namespace-user', 'Namespace user', 'namespace-user@example.test', now, now);

    expect(() =>
      value.sqlite
        .prepare(
          "UPDATE service_actor SET id='namespace-user',version=version+1 WHERE id='namespace-actor'",
        )
        .run(),
    ).toThrow(/rename|namespace|collid/iu);
    expect(() =>
      value.sqlite
        .prepare("UPDATE user SET id='namespace-actor',version=version+1 WHERE id='namespace-user'")
        .run(),
    ).toThrow(/rename|namespace|collid/iu);

    expect(
      value.sqlite.prepare('SELECT id FROM service_actor WHERE id=?').get('namespace-actor'),
    ).toEqual({
      id: 'namespace-actor',
    });
    expect(value.sqlite.prepare('SELECT id FROM user WHERE id=?').get('namespace-user')).toEqual({
      id: 'namespace-user',
    });
  });
});
