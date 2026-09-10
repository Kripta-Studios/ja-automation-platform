import { afterEach, describe, expect, it } from 'vitest';
import { OwnerRecordManagement, OwnerCatalogManagement } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture';

const fixtures: ReturnType<typeof createB5LifecycleSecurityFixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});
function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'owner-management');
  const manager = new OwnerRecordManagement(fixture.sqlite);
  const expense = fixture.repository.createExpense(fixture.worker, {
    projectId: fixture.project.id,
    spentOn: '2026-02-03',
    category: 'hotel',
    vendor: 'Owner management test',
    description: 'Test expense',
    amountMinor: 12000n,
    currency: 'EUR',
    whoPaid: 'worker',
    receiptRequired: false,
  });
  return { ...fixture, owner, manager, expense };
}

describe('Owner operational management', () => {
  it('reopens an approved expense, preserves prior values in audit, and lets Owner edit and submit another worker record', () => {
    const f = setup();
    f.repository.submitExpense(f.worker, f.expense.id, 1);
    f.repository.operationalApproveExpense(f.owner, f.expense.id, 'approved');
    const before = f.sqlite.prepare('SELECT * FROM expense WHERE id=?').get(f.expense.id)!;
    f.manager.mutate(f.owner, {
      recordType: 'expense',
      id: f.expense.id,
      version: Number(before.version),
      operation: 'reopen',
      reason: 'Remove demo approval',
    });
    const reopened = f.sqlite.prepare('SELECT * FROM expense WHERE id=?').get(f.expense.id)!;
    expect(reopened.approval_state).toBe('draft');
    expect(reopened.approved_at).toBeNull();
    expect(
      f.sqlite
        .prepare(
          "SELECT before_json FROM audit_event WHERE action='owner.record.reopen' AND entity_id=?",
        )
        .get(f.expense.id)?.before_json,
    ).toContain('approved');
    f.repository.updateExpense(f.owner, {
      id: f.expense.id,
      version: Number(reopened.version),
      amountMinor: 5000n,
      vendor: 'Corrected vendor',
    });
    f.repository.submitExpense(f.owner, f.expense.id, Number(reopened.version) + 1);
    expect(
      f.sqlite
        .prepare('SELECT amount_minor,approval_state,worker_id FROM expense WHERE id=?')
        .get(f.expense.id),
    ).toEqual({ amount_minor: 5000, approval_state: 'submitted', worker_id: f.worker.userId });
  });
  it('deletes approved unlinked expenses with a full before snapshot and keeps review history', () => {
    const f = setup();
    f.repository.submitExpense(f.worker, f.expense.id, 1);
    f.repository.operationalApproveExpense(f.owner, f.expense.id, 'approved');
    const row = f.manager.list(f.owner, 'expense')[0];
    f.manager.mutate(f.owner, {
      recordType: 'expense',
      id: f.expense.id,
      version: Number(row.version),
      operation: 'delete',
      reason: 'Remove unwanted record',
    });
    expect(f.sqlite.prepare('SELECT 1 FROM expense WHERE id=?').get(f.expense.id)).toBeUndefined();
    expect(
      f.sqlite
        .prepare(
          "SELECT before_json FROM audit_event WHERE action='owner.record.delete' AND entity_id=?",
        )
        .get(f.expense.id)?.before_json,
    ).toContain('12000');
  });
  it('rejects non-Owner, stale sessions, invalid types, stale versions, and payment-linked records atomically', () => {
    const f = setup();
    const input = {
      recordType: 'expense',
      id: f.expense.id,
      version: 1,
      operation: 'delete',
      reason: 'Test deletion',
    };
    for (const principal of [
      f.worker,
      f.finance,
      { ...f.owner, sessionId: 'expired' },
      { ...f.worker, role: 'owner_admin' as const },
    ])
      expect(() => f.manager.mutate(principal, input)).toThrow();
    expect(() => f.manager.mutate(f.owner, { ...input, recordType: 'user' })).toThrow();
    expect(() => f.manager.mutate(f.owner, { ...input, version: 0 })).toThrow();
    f.sqlite
      .prepare("UPDATE expense SET reimbursement_state='reimbursed',reimbursed_at=? WHERE id=?")
      .run(new Date().toISOString(), f.expense.id);
    expect(() => f.manager.mutate(f.owner, input)).toThrow(/reimbursement/);
    expect(f.sqlite.prepare('SELECT 1 FROM expense WHERE id=?').get(f.expense.id)).toBeTruthy();
    expect(
      f.sqlite.prepare("SELECT 1 FROM audit_event WHERE action='owner.record.delete'").get(),
    ).toBeUndefined();
  });
});

describe('Owner planning, availability and milestone CRUD', () => {
  it.each(['planning_assignment', 'worker_availability', 'project_milestone', 'technical_change'])(
    'creates, updates and deletes %s with concurrency and role checks',
    (kind) => {
      const f = setup();
      const manager = new OwnerCatalogManagement(f.sqlite);
      const values = {
        project_id: f.project.id,
        worker_id: f.worker.userId,
        starts_at: '2026-02-10T08:00',
        ends_at: '2026-02-10T10:00',
        planned_minutes: '120',
        status: 'planned',
        availability: 'tentative',
        component: 'PLC',
        change_made: 'Correct operational change',
        safety_impact: '0',
        name: 'Owner milestone',
        amount: '123.45',
        due_on: '2026-02-10',
      };
      const created = manager.mutate(f.owner, {
        kind,
        operation: 'create',
        reason: 'Create test record',
        values,
      });
      const row = manager.list(f.owner, kind).find((row) => row.id === created.id)!;
      expect(row).toBeTruthy();
      expect(() =>
        manager.mutate(f.worker, {
          kind,
          id: created.id,
          token: row.token,
          operation: 'delete',
          reason: 'Not authorized',
          values: {},
        }),
      ).toThrow();
      manager.mutate(f.owner, {
        kind,
        id: created.id,
        token: row.token,
        operation: 'update',
        reason: 'Correct record',
        values: {
          ...values,
          planned_minutes: '90',
          name: 'Updated milestone',
          availability: 'available',
        },
      });
      expect(() =>
        manager.mutate(f.owner, {
          kind,
          id: created.id,
          token: row.token,
          operation: 'delete',
          reason: 'Stale deletion',
          values: {},
        }),
      ).toThrow(/changed/);
      const updated = manager.list(f.owner, kind).find((row) => row.id === created.id)!;
      manager.mutate(f.owner, {
        kind,
        id: created.id,
        token: updated.token,
        operation: 'delete',
        reason: 'Delete record',
        values: {},
      });
      expect(manager.list(f.owner, kind).some((row) => row.id === created.id)).toBe(false);
      expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    },
  );
  it('rejects overlapping planning and rolls back the original record', () => {
    const f = setup();
    const manager = new OwnerCatalogManagement(f.sqlite);
    const values = {
      project_id: f.project.id,
      worker_id: f.worker.userId,
      starts_at: '2026-02-10T08:00',
      ends_at: '2026-02-10T10:00',
      planned_minutes: '120',
      status: 'planned',
    };
    manager.mutate(f.owner, {
      kind: 'planning_assignment',
      operation: 'create',
      reason: 'First shift',
      values,
    });
    expect(() =>
      manager.mutate(f.owner, {
        kind: 'planning_assignment',
        operation: 'create',
        reason: 'Overlapping shift',
        values,
      }),
    ).toThrow(/overlap/);
    expect(manager.list(f.owner, 'planning_assignment')).toHaveLength(1);
  });
});

it('Owner creates and manages another worker time without impersonating them', () => {
  const f = setup();
  const input = {
    projectId: f.project.id,
    workDate: '2026-02-12',
    category: 'regular',
    minutes: 60,
    summary: 'Owner recorded actual work',
  };
  const time = f.repository.createTimeEntry(f.owner, input, f.worker.userId);
  f.repository.updateTimeEntry(f.owner, { id: time.id, version: 1, minutes: 90 });
  f.repository.submitTime(f.owner, time.id, 2);
  expect(
    f.sqlite
      .prepare('SELECT worker_id,minutes,approval_state FROM time_entry WHERE id=?')
      .get(time.id),
  ).toEqual({ worker_id: f.worker.userId, minutes: 90, approval_state: 'submitted' });
  const audit = f.sqlite
    .prepare("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='time.create'")
    .get(time.id);
  expect(audit?.actor_id).toBe(f.owner.userId);
  expect(() => f.repository.createTimeEntry(f.outsider, input, f.worker.userId)).toThrow();
});

it('worker can retrieve an Owner-uploaded receipt for their own expense without exposing other receipts', () => {
  const f = setup();
  const receipt = f.repository.registerReceipt(f.owner, {
    projectId: f.project.id,
    sha256: 'a'.repeat(64),
    mediaType: 'image/png',
    byteLength: 100,
    storageKey: 'receipts/owner-crud.png',
    originalFilename: 'owner-crud.png',
  });
  f.repository.createExpense(
    f.owner,
    {
      projectId: f.project.id,
      spentOn: '2026-02-03',
      category: 'hotel',
      vendor: 'Owner receipt',
      description: 'Receipt for worker',
      amountMinor: 1000n,
      currency: 'EUR',
      whoPaid: 'worker',
      receiptRequired: true,
      receiptDocumentId: receipt.id,
    },
    f.worker.userId,
  );
  expect(f.v3.authorizeDocument(f.worker, receipt.id).storageKey).toBe('receipts/owner-crud.png');
  expect(() => f.v3.authorizeDocument(f.outsider, receipt.id)).toThrow();
});

it('Owner archives and restores document listings while preserving referenced private receipts', () => {
  const f = setup();
  const manager = new OwnerCatalogManagement(f.sqlite);
  const receipt = f.repository.registerReceipt(f.owner, {
    projectId: f.project.id,
    sha256: 'b'.repeat(64),
    mediaType: 'image/png',
    byteLength: 100,
    storageKey: 'receipts/archive.png',
    originalFilename: 'archive.png',
  });
  f.repository.createExpense(
    f.owner,
    {
      projectId: f.project.id,
      spentOn: '2026-02-03',
      category: 'hotel',
      vendor: 'Archive test',
      description: 'Referenced receipt',
      amountMinor: 1000n,
      currency: 'EUR',
      whoPaid: 'worker',
      receiptRequired: true,
      receiptDocumentId: receipt.id,
    },
    f.worker.userId,
  );
  const row = manager.list(f.owner, 'document').find((row) => row.id === receipt.id)!;
  manager.mutate(f.owner, {
    kind: 'document',
    id: receipt.id,
    token: row.token,
    operation: 'delete',
    reason: 'Archive obsolete listing',
    values: {},
  });
  expect(f.repository.listDocuments(f.owner).some((row) => row.id === receipt.id)).toBe(false);
  expect(f.v3.authorizeDocument(f.worker, receipt.id).storageKey).toBe('receipts/archive.png');
  expect(() => f.v3.authorizeDocument(f.outsider, receipt.id)).toThrow();
  const archived = manager.list(f.owner, 'document').find((row) => row.id === receipt.id)!;
  expect(archived.archived_at).toBeTruthy();
  manager.mutate(f.owner, {
    kind: 'document',
    id: receipt.id,
    token: archived.token,
    operation: 'restore',
    reason: 'Restore useful receipt',
    values: {},
  });
  expect(f.repository.listDocuments(f.owner).some((row) => row.id === receipt.id)).toBe(true);
  expect(f.sqlite.prepare('SELECT sha256 FROM document WHERE id=?').get(receipt.id)?.sha256).toBe(
    'b'.repeat(64),
  );
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
