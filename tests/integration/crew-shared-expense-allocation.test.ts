import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  CrewLeaderRepository,
  CrewSharedExpenseAllocationRepository,
  ValidationError,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const spentOn = new Date().toISOString().slice(0, 10);
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'shared-receipt-owner');
  const chief = stepUpB5Principal(fixture.sqlite, fixture.worker, 'shared-receipt-chief');
  const secondWorkerId = 'b5-second-crew-worker';
  seedB5User(fixture.sqlite, secondWorkerId, 'worker');
  for (const workerId of [fixture.outsider.userId, secondWorkerId]) {
    fixture.repository.assignWorker(owner, {
      projectId: fixture.project.id,
      workerId,
      startsOn: '2026-01-01',
    });
  }
  const crew = new CrewLeaderRepository(fixture.sqlite);
  for (const workerId of [fixture.outsider.userId, secondWorkerId])
    crew.grant(owner, {
      projectId: fixture.project.id,
      chiefUserId: chief.userId,
      workerUserId: workerId,
      startsOn: '2026-01-01',
    });
  const times = crew.createBatch(chief, {
    projectId: fixture.project.id,
    workerIds: [fixture.outsider.userId, secondWorkerId],
    requestId: 'shared-receipt-time-request-001',
    workDate: spentOn,
    category: 'regular',
    minutes: 90,
    summary: 'Installed equipment together',
  }).created;
  const receipt = fixture.repository.registerReceipt(chief, {
    projectId: fixture.project.id,
    sha256: 'd'.repeat(64),
    mediaType: 'image/png',
    byteLength: 101,
    storageKey: 'receipts/shared-crew.png',
    originalFilename: 'shared-crew.png',
  });
  const expense = fixture.repository.createExpense(
    chief,
    {
      projectId: fixture.project.id,
      spentOn,
      occurredTimeLocal: '14:35',
      timeEntryId: times[0]!.id,
      vendor: 'Crew parking',
      category: 'parking',
      description: 'Parking for two installation workers',
      currency: 'EUR',
      amountMinor: 1250n,
      whoPaid: 'worker',
      receiptRequired: true,
      receiptDocumentId: receipt.id,
    },
    fixture.outsider.userId,
    'shared-receipt-expense-request-001',
  );
  const allocations = [
    { timeEntryId: times[0]!.id, amountMinor: 800n },
    { timeEntryId: times[1]!.id, amountMinor: 450n },
  ];
  const repository = new CrewSharedExpenseAllocationRepository(fixture.sqlite);
  return { fixture, owner, chief, crew, times, receipt, expense, allocations, repository };
}

describe('shared crew receipt allocations', () => {
  it('saves exact, immutable allocations while keeping one invoice/reimbursement source', () => {
    const { fixture, owner, chief, expense, allocations, repository } = setup();
    expect(repository.eligibleReceipts(chief, fixture.project.id, spentOn)).toHaveLength(1);
    const input = {
      requestId: 'shared-allocation-request-001',
      expenseId: expense.id,
      allocations,
    };
    const created = repository.create(chief, input);
    expect(created.replayed).toBe(false);
    expect(repository.create(chief, input)).toEqual({ ...created, replayed: true });
    expect(repository.eligibleReceipts(chief, fixture.project.id, spentOn)).toEqual([]);
    const visible = repository.allocatedReceipts(chief, fixture.project.id, spentOn);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ expenseId: expense.id, totalMinor: 1250 });
    expect(visible[0]?.allocations).toHaveLength(2);
    expect(visible[0]).not.toHaveProperty('reimbursementAmountMinor');
    expect(visible[0]).not.toHaveProperty('billingTreatment');
    expect(
      fixture.sqlite
        .prepare(
          'SELECT total_minor,allocation_count,completed FROM crew_shared_expense_allocation_group WHERE id=?',
        )
        .get(created.id),
    ).toEqual({ total_minor: 1250, allocation_count: 2, completed: 1 });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT amount_minor FROM crew_shared_expense_allocation WHERE group_id=? ORDER BY amount_minor',
        )
        .all(created.id),
    ).toEqual([{ amount_minor: 450 }, { amount_minor: 800 }]);
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) count,SUM(amount_minor) total FROM expense WHERE id=?')
        .get(expense.id),
    ).toEqual({ count: 1, total: 1250 });
    expect(() =>
      fixture.sqlite.prepare('UPDATE expense SET amount_minor=1300 WHERE id=?').run(expense.id),
    ).toThrow();
    expect(() =>
      fixture.sqlite
        .prepare('UPDATE crew_shared_expense_allocation SET amount_minor=1 WHERE group_id=?')
        .run(created.id),
    ).toThrow();
    expect(() =>
      fixture.sqlite.prepare('UPDATE expense SET time_entry_id=NULL WHERE id=?').run(expense.id),
    ).toThrow(/allocated receipt source immutable/u);
    expect(() =>
      fixture.sqlite
        .prepare("UPDATE time_entry SET work_date='2026-09-25' WHERE id=?")
        .run(allocations[0]!.timeEntryId),
    ).toThrow(/allocated crew time identity immutable/u);
    expect(() =>
      fixture.repository.updateExpense(chief, {
        id: expense.id,
        version: 1,
        amountMinor: 1300n,
      }),
    ).toThrow(ConflictError);
    expect(() => fixture.repository.deleteExpense(owner, expense.id, 1)).toThrow(ConflictError);
    expect(() =>
      fixture.repository.deleteDraft(owner, {
        recordType: 'expense',
        recordId: expense.id,
        version: 1,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      fixture.repository.updateTimeEntry(owner, {
        id: allocations[0]!.timeEntryId,
        version: 1,
        workDate: '2026-09-25',
      }),
    ).toThrow(ConflictError);
    expect(() => fixture.repository.deleteTime(owner, allocations[0]!.timeEntryId, 1)).toThrow(
      ConflictError,
    );
    expect(() =>
      repository.create(chief, {
        ...input,
        allocations: [{ ...allocations[0]!, amountMinor: 799n }, allocations[1]!],
      }),
    ).toThrow(ConflictError);
  });

  it('rejects mismatched totals, unrelated shifts and revoked grants without partial writes', () => {
    const { fixture, owner, chief, crew, expense, allocations, repository } = setup();
    expect(() =>
      repository.create(chief, {
        requestId: 'shared-allocation-invalid-001',
        expenseId: expense.id,
        allocations: [{ ...allocations[0]!, amountMinor: 801n }, allocations[1]!],
      }),
    ).toThrow(ValidationError);
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) count FROM crew_shared_expense_allocation_group')
        .get(),
    ).toEqual({ count: 0 });
    expect(() =>
      repository.create(chief, {
        requestId: 'shared-allocation-invalid-002',
        expenseId: expense.id,
        allocations: [{ ...allocations[0]!, timeEntryId: 'other-shift' }, allocations[1]!],
      }),
    ).toThrow(AccessDeniedError);
    const grant = crew
      .grants(owner, fixture.project.id)
      .find((row) => row.workerUserId === fixture.outsider.userId)!;
    crew.revoke(owner, grant.id);
    expect(() =>
      repository.create(chief, {
        requestId: 'shared-allocation-invalid-003',
        expenseId: expense.id,
        allocations,
      }),
    ).toThrow(AccessDeniedError);
    fixture.sqlite.exec('SAVEPOINT shared_grant_guard');
    try {
      fixture.sqlite
        .prepare(
          `INSERT INTO crew_shared_expense_allocation_group
         (id,expense_id,project_id,actor_user_id,request_id,payload_sha256,total_minor,allocation_count,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'revoked-grant-group',
          expense.id,
          fixture.project.id,
          chief.userId,
          'revoked-grant-request-001',
          'a'.repeat(64),
          1250,
          2,
          new Date().toISOString(),
        );
      expect(() =>
        fixture.sqlite
          .prepare(
            `INSERT INTO crew_shared_expense_allocation
         (group_id,time_entry_id,worker_id,grant_id,amount_minor,recorded_at)
         VALUES(?,?,?,?,?,?)`,
          )
          .run(
            'revoked-grant-group',
            allocations[0]!.timeEntryId,
            fixture.outsider.userId,
            grant.id,
            800,
            new Date().toISOString(),
          ),
      ).toThrow(/shared receipt allocation scope mismatch/u);
    } finally {
      fixture.sqlite.exec('ROLLBACK TO SAVEPOINT shared_grant_guard');
      fixture.sqlite.exec('RELEASE SAVEPOINT shared_grant_guard');
    }
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) count FROM crew_shared_expense_allocation_group')
        .get(),
    ).toEqual({ count: 0 });
  });
});
