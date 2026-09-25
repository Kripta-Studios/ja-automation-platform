import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupplierWorkforceRepository } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openSupplierContext = vi.fn();
vi.mock('$lib/server/supplier-context', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/supplier-context')>();
  return { ...original, openSupplierContext };
});
const { actions } = await import('../../apps/portal/src/routes/app/supplier/+page.server.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const supplier = new SupplierWorkforceRepository(fixture.sqlite);
  const usePrincipal = (principal = fixture.owner) =>
    openSupplierContext.mockReturnValue({
      principal,
      supplier,
      sqlite: { prepare: fixture.sqlite.prepare.bind(fixture.sqlite), close: vi.fn() },
    });
  usePrincipal();
  return { fixture, supplier, usePrincipal };
}
function event(values: Record<string, string>) {
  return {
    locals: { correlationId: 'supplier-action-test' },
    request: new Request('http://localhost/j-aautomation/app/supplier', {
      method: 'POST',
      body: new URLSearchParams(values),
    }),
  } as never;
}
async function submit(operation: keyof typeof actions, values: Record<string, string>) {
  return actions[operation]!(event(values));
}
function prepareCoordinator(
  fixture: B5LifecycleSecurityFixture,
  supplier: SupplierWorkforceRepository,
) {
  const record = supplier.createSupplier(fixture.owner, { name: 'Supplier action test' });
  const timestamp = new Date().toISOString();
  fixture.sqlite
    .prepare(
      `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
       VALUES(?,?,?,'credential',?,?,?,?)`,
    )
    .run(
      'supplier-action-test-credential',
      'local:credential',
      'supplier-action-test-account',
      fixture.worker.userId,
      'fixture-credential-hash',
      timestamp,
      timestamp,
    );
  Object.assign(
    fixture.owner,
    stepUpB5Principal(fixture.sqlite, fixture.owner, 'supplier-action-profile-owner'),
  );
  supplier.setAccountProfile(fixture.owner, {
    userId: fixture.worker.userId,
    profile: 'supplier_coordinator',
    supplierId: record.id,
  });
  supplier.grantProject(fixture.owner, {
    supplierId: record.id,
    projectId: fixture.project.id,
    coordinatorId: fixture.worker.userId,
    startsOn: '2026-01-01',
  });
  return {
    record,
    coordinator: stepUpB5Principal(fixture.sqlite, fixture.worker, 'supplier-action-coordinator'),
  };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  vi.clearAllMocks();
});

describe('supplier workforce form problems', () => {
  it('returns a stable duplicate supplier problem and retains the entered name', async () => {
    const { fixture, supplier } = setup();
    supplier.createSupplier(fixture.owner, { name: 'Existing supplier' });
    expect(
      await submit('createSupplier', { name: 'Existing supplier', contactEmail: 'a@example.test' }),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'SUPPLIER_NAME_EXISTS',
        messageKey: 'problem.supplier.nameExists',
        operation: 'createSupplier',
        values: { name: 'Existing supplier', contactEmail: 'a@example.test' },
        fieldErrors: { name: ['problem.supplier.nameExists'] },
        remedies: [{ id: 'review_supplier_directory' }],
        correlationId: 'supplier-action-test',
      },
    });
  });

  it('requires explicit status confirmation without changing the supplier', async () => {
    const { fixture, supplier } = setup();
    const record = supplier.createSupplier(fixture.owner, { name: 'Status supplier' });
    expect(await submit('setSupplierStatus', { id: record.id, status: 'inactive' })).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_STATUS_CONFIRMATION_REQUIRED',
        operation: 'setSupplierStatus',
        fieldErrors: { confirmed: ['problem.supplier.confirmStatusChange'] },
      },
    });
    expect(fixture.sqlite.prepare('SELECT status FROM supplier WHERE id=?').get(record.id)).toEqual(
      {
        status: 'active',
      },
    );
  });

  it('rejects an invalid profile with a field error and no write', async () => {
    const { fixture } = setup();
    expect(
      await submit('setProfile', { userId: fixture.worker.userId, profile: 'administrator' }),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_PROFILE_INVALID',
        fieldErrors: { profile: ['problem.supplier.profileInvalid'] },
        values: { userId: fixture.worker.userId, profile: 'administrator' },
      },
    });
    expect(
      fixture.sqlite
        .prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=?')
        .get(fixture.worker.userId),
    ).toBeUndefined();
  });

  it('explains an overlapping grant and keeps a forged coordinator request role safe', async () => {
    const { fixture, supplier, usePrincipal } = setup();
    const { record, coordinator } = prepareCoordinator(fixture, supplier);
    const values = {
      supplierId: record.id,
      projectId: fixture.project.id,
      coordinatorId: fixture.worker.userId,
      startsOn: '2026-09-01',
    };
    expect(await submit('grant', values)).toMatchObject({
      status: 409,
      data: {
        code: 'SUPPLIER_GRANT_OVERLAP',
        remedies: [{ id: 'review_supplier_grants' }],
        values,
      },
    });
    usePrincipal(coordinator);
    expect(await submit('grant', values)).toMatchObject({
      status: 403,
      data: {
        code: 'SUPPLIER_OWNER_REQUIRED',
        remedies: [{ id: 'contact_owner' }],
      },
    });
  });

  it('reports a stale time draft without submitting the changed record', async () => {
    const { fixture, supplier, usePrincipal } = setup();
    const { coordinator } = prepareCoordinator(fixture, supplier);
    const technician = supplier.addTechnician(coordinator, {
      projectId: fixture.project.id,
      name: 'Technician One',
      startsOn: '2026-01-01',
    });
    const draft = supplier.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: new Date().toISOString().slice(0, 10),
      category: 'work',
      minutes: 60,
      summary: 'Supplier draft',
    });
    fixture.sqlite.prepare('UPDATE time_entry SET version=version+1 WHERE id=?').run(draft.id);
    usePrincipal(coordinator);
    expect(
      await submit('submitTime', { id: draft.id, version: String(draft.version) }),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'SUPPLIER_TIME_SUBMIT_STALE',
        values: { id: draft.id, version: String(draft.version) },
        remedies: [{ id: 'review_time_drafts' }],
      },
    });
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(draft.id),
    ).toEqual({ approval_state: 'draft' });
  });
});
