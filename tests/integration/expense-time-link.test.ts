import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

const expenseInput = (projectId: string) => ({
  projectId,
  spentOn: '2026-08-20',
  vendor: 'Project parking',
  category: 'parking',
  description: 'Parking at project site',
  currency: 'EUR' as const,
  amountMinor: 1250n,
  whoPaid: 'worker',
  receiptRequired: false,
});

describe('expense occurrence time and linked hours', () => {
  it('saves a new shift and its expense together with one scope and no partial success', () => {
    const value = fixture();
    const time = {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 450,
      summary: 'Install control panel',
    };
    const expense = {
      vendor: 'Project parking',
      category: 'parking',
      description: 'Parking at project site',
      currency: 'EUR' as const,
      amountMinor: 1250n,
      whoPaid: 'worker',
      receiptRequired: false,
      occurredTimeLocal: '14:35',
    };
    const requestId = 'shift-expense-request-0001';
    const created = value.repository.createTimeWithExpense(value.worker, time, expense, requestId);
    expect(created.replayed).toBe(false);
    expect(value.repository.timeDetail(value.worker, created.time.id)).toMatchObject({
      worker_id: value.worker.userId,
      minutes: 450,
      start_time: null,
      end_time: null,
    });
    expect(value.repository.expenseDetail(value.worker, created.expense.id)).toMatchObject({
      worker_id: value.worker.userId,
      time_entry_id: created.time.id,
      spent_on: '2026-08-20',
      occurred_time_local: '14:35',
      amount_minor: 1250,
    });
    expect(() =>
      value.repository.deleteDraft(
        value.worker,
        'time_entry',
        created.time.id,
        created.time.version,
      ),
    ).toThrow('linked to another record');
    const countTime = value.sqlite.prepare('SELECT COUNT(*) count FROM time_entry').get() as {
      count: number;
    };
    const countExpense = value.sqlite.prepare('SELECT COUNT(*) count FROM expense').get() as {
      count: number;
    };
    expect(value.repository.createTimeWithExpense(value.worker, time, expense, requestId)).toEqual({
      ...created,
      replayed: true,
    });
    expect(() =>
      value.repository.createTimeWithExpense(
        value.worker,
        time,
        {
          ...expense,
          amountMinor: 1300n,
        },
        requestId,
      ),
    ).toThrow('Time and expense retry has changed');
    expect(() =>
      value.repository.createTimeWithExpense(
        value.worker,
        {
          ...time,
          summary: 'Another installation',
        },
        {
          ...expense,
          amountMinor: 0n,
        },
        'shift-expense-request-0002',
      ),
    ).toThrow('Expense amount must be positive');
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM time_entry').get()).toEqual(countTime);
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM expense').get()).toEqual(countExpense);
    expect(() =>
      value.sqlite
        .prepare(
          'UPDATE operational_time_expense_request SET request_id=? WHERE actor_user_id=? AND request_id=?',
        )
        .run('changed-shift-expense-request-0001', value.worker.userId, requestId),
    ).toThrow(/time expense request immutable/u);
    expect(value.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('persists optional local time and a same-worker/project/date shift without changing money or minutes', () => {
    const value = fixture();
    const shift = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 450,
      summary: 'Install control panel',
    });
    const expense = value.repository.createExpense(value.worker, {
      ...expenseInput(value.project.id),
      occurredTimeLocal: '13:45',
      timeEntryId: shift.id,
    });
    expect(value.repository.expenseDetail(value.worker, expense.id)).toMatchObject({
      occurred_time_local: '13:45',
      time_entry_id: shift.id,
      amount_minor: 1250,
    });
    expect(value.repository.listExpensesForScope(value.worker)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expense.id, time_entry_id: shift.id }),
      ]),
    );
    expect(value.repository.timeDetail(value.worker, shift.id)).toMatchObject({ minutes: 450 });
    const changed = value.repository.updateExpense(value.worker, {
      id: expense.id,
      version: expense.version,
      occurredTimeLocal: '14:05',
      timeEntryId: null,
    });
    expect(value.repository.expenseDetail(value.worker, expense.id)).toMatchObject({
      occurred_time_local: '14:05',
      time_entry_id: null,
      version: changed.version,
    });
    value.repository.updateExpense(value.worker, {
      id: expense.id,
      version: changed.version,
      occurredTimeLocal: null,
    });
    expect(value.repository.expenseDetail(value.worker, expense.id).occurred_time_local).toBeNull();
    const expenseOnly = value.repository.createExpense(
      value.worker,
      expenseInput(value.project.id),
    );
    expect(value.repository.expenseDetail(value.worker, expenseOnly.id)).toMatchObject({
      occurred_time_local: null,
      time_entry_id: null,
    });
  });

  it('rejects cross-worker, cross-project, wrong-date, unknown and invalid-time links', () => {
    const value = fixture();
    const sameProjectOtherWorker = value.repository.createTimeEntry(value.manager, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Manager site visit',
    });
    const anotherProject = value.repository.createProject(value.owner, {
      costCenterCode: 'QA-EXPENSE-TIME-LINK-TEST-1',
      clientId: value.client.id,
      name: 'Other project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    value.repository.assignWorker(value.owner, {
      projectId: anotherProject.id,
      workerId: value.worker.userId,
      startsOn: '2026-01-01',
    });
    const otherProjectShift = value.repository.createTimeEntry(value.worker, {
      projectId: anotherProject.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Other project visit',
    });
    const otherDateShift = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 60,
      summary: 'Next-day work',
    });
    for (const timeEntryId of [
      sameProjectOtherWorker.id,
      otherProjectShift.id,
      otherDateShift.id,
      '00000000-0000-4000-8000-000000000000',
    ]) {
      expect(() =>
        value.repository.createExpense(value.worker, {
          ...expenseInput(value.project.id),
          timeEntryId,
        }),
      ).toThrow('A matching active time record is required');
    }
    expect(() =>
      value.repository.createExpense(value.worker, {
        ...expenseInput(value.project.id),
        occurredTimeLocal: '24:00',
      }),
    ).toThrow('Expense occurrence time must be HH:mm');
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM expense').get()).toEqual({ count: 0 });
  });

  it('keeps a linked draft unchanged when an edit tries to move it to another date', () => {
    const value = fixture();
    const shift = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Site arrival',
    });
    const expense = value.repository.createExpense(value.worker, {
      ...expenseInput(value.project.id),
      timeEntryId: shift.id,
    });
    expect(() =>
      value.repository.updateExpense(value.worker, {
        id: expense.id,
        version: expense.version,
        spentOn: '2026-08-21',
      }),
    ).toThrow('A matching active time record is required');
    expect(value.repository.expenseDetail(value.worker, expense.id)).toMatchObject({
      spent_on: '2026-08-20',
      time_entry_id: shift.id,
      version: expense.version,
    });
  });

  it('requires an approved-expense correction to clear or relink hours when its date changes', () => {
    const value = fixture();
    const shift = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Original linked shift',
    });
    const original = value.repository.createExpense(value.worker, {
      ...expenseInput(value.project.id),
      occurredTimeLocal: '13:45',
      timeEntryId: shift.id,
    });
    value.repository.submitExpense(value.worker, original.id, original.version);
    value.repository.operationalApproveExpense(value.manager, original.id, 'approved');
    expect(() =>
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'expense',
        originalId: original.id,
        requestId: 'wrong-date-linked-correction',
        reason: 'Correct the date of the parking expense',
        patch: { spentOn: '2026-08-21' },
      }),
    ).toThrow('A matching active time record is required');
    const corrected = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'expense',
      originalId: original.id,
      requestId: 'cleared-linked-correction',
      reason: 'Correct the date and detach the original shift',
      patch: { spentOn: '2026-08-21', timeEntryId: null },
    });
    expect(value.repository.expenseDetail(value.worker, corrected.correctionId)).toMatchObject({
      spent_on: '2026-08-21',
      occurred_time_local: '13:45',
      time_entry_id: null,
    });
  });

  it('preserves occurrence time and rejects mismatched shifts at the legacy offline expense boundary', () => {
    const value = fixture();
    // Production's legacy offline queue is append-only; this exercises its
    // still-present insertion path without changing that production guard.
    value.sqlite.exec('DROP TRIGGER offline_mutation_legacy_no_insert');
    const shift = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Shift to link from offline expense',
    });
    const payload = {
      ...expenseInput(value.project.id),
      amountMinor: '1250',
      occurredTimeLocal: '15:25',
      timeEntryId: shift.id,
    };
    const entityId = '0198be45-cd9c-7ab4-9a5a-a6c000000201';
    expect(
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000202',
        entityType: 'expense',
        entityId,
        baseVersion: 0,
        payload,
        attachments: [],
      }),
    ).toEqual({ outcome: 'accepted', version: 1 });
    expect(value.repository.expenseDetail(value.worker, entityId)).toMatchObject({
      occurred_time_local: '15:25',
      time_entry_id: shift.id,
    });
    const otherWorkerShift = value.repository.createTimeEntry(value.manager, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Another worker shift',
    });
    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000203',
        entityType: 'expense',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c000000204',
        baseVersion: 0,
        payload: { ...payload, timeEntryId: otherWorkerShift.id },
        attachments: [],
      }),
    ).toThrow('A matching active time record is required');
  });
});
