import { afterEach, describe, expect, it } from 'vitest';
import { CrewLeaderRepository, ValidationError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

// Final verify 2026-11-26 (bug 9): supplier technicians and coordinators are never offered or
// accepted as crew chief or crew member of J&A workers.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

describe('crew delegations and supplier staff', () => {
  it('leaves supplier staff out of the candidates and refuses them server-side', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'crew-supplier-owner');
    const supplierStaff = fixture.outsider.userId;
    fixture.repository.assignWorker(fixture.owner, {
      projectId: fixture.project.id,
      workerId: supplierStaff,
      startsOn: '2026-01-01',
    });
    const crew = new CrewLeaderRepository(fixture.sqlite);
    const ids = () => crew.candidateWorkers(owner, fixture.project.id).map((person) => person.id);
    expect(ids()).toContain(supplierStaff);
    const at = new Date().toISOString();
    fixture.sqlite
      .prepare(
        "INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES('crew-supplier','Crew Supplier','active',?,?)",
      )
      .run(at, at);
    fixture.sqlite
      .prepare(
        "INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,'crew-supplier','external_technician',?,?)",
      )
      .run(supplierStaff, at, at);
    expect(ids()).not.toContain(supplierStaff);
    expect(ids()).toContain(fixture.worker.userId);
    for (const [chiefUserId, workerUserId] of [
      [supplierStaff, fixture.worker.userId],
      [fixture.worker.userId, supplierStaff],
    ])
      expect(() =>
        crew.grant(owner, {
          projectId: fixture.project.id,
          chiefUserId: chiefUserId!,
          workerUserId: workerUserId!,
          startsOn: '2026-01-01',
        }),
      ).toThrow(ValidationError);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) n FROM crew_leader_grant').get()).toEqual({ n: 0 });
  });
});
