import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError, CrewLeaderRepository } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
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
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'expense-crew-owner');
  const chief = stepUpB5Principal(fixture.sqlite, fixture.worker, 'expense-crew-chief');
  const workerId = fixture.outsider.userId;
  fixture.repository.assignWorker(owner, {
    projectId: fixture.project.id,
    workerId,
    startsOn: '2026-01-01',
  });
  const crew = new CrewLeaderRepository(fixture.sqlite);
  const grant = crew.grant(owner, {
    projectId: fixture.project.id,
    chiefUserId: chief.userId,
    workerUserId: workerId,
    startsOn: '2026-01-01',
  });
  const shift = crew.createBatch(chief, {
    projectId: fixture.project.id,
    workerIds: [workerId],
    requestId: 'crew-expense-shift-request-0001',
    workDate: spentOn,
    category: 'regular',
    minutes: 150,
    summary: 'Installed client equipment',
  }).created[0]!;
  const input = {
    projectId: fixture.project.id,
    spentOn,
    occurredTimeLocal: '14:35',
    timeEntryId: shift.id,
    vendor: 'Crew parking',
    category: 'parking',
    description: 'Parking for installation',
    currency: 'EUR' as const,
    amountMinor: 1250n,
    whoPaid: 'worker',
    receiptRequired: false,
  };
  return { fixture, owner, chief, workerId, crew, grant, shift, input };
}

describe('chief-entered worker expenses', () => {
  it('records exact worker and chief provenance, links hours, and keeps worker reimbursement private', () => {
    const { fixture, chief, workerId, grant, shift, input } = setup();
    const created = fixture.repository.createExpense(
      chief,
      input,
      workerId,
      'crew-expense-request-0001',
    );
    expect(created).toMatchObject({ version: 1 });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT worker_id,time_entry_id,occurred_time_local,amount_minor,reimbursement_amount_minor FROM expense WHERE id=?',
        )
        .get(created.id),
    ).toEqual({
      worker_id: workerId,
      time_entry_id: shift.id,
      occurred_time_local: '14:35',
      amount_minor: 1250,
      reimbursement_amount_minor: null,
    });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT grant_id,recorded_by_user_id FROM crew_expense_recorder WHERE expense_id=?',
        )
        .get(created.id),
    ).toEqual({ grant_id: grant.id, recorded_by_user_id: chief.userId });
    const chiefList = fixture.repository.listExpensesForScope(chief);
    const crewRow = chiefList.find((row) => row.id === created.id)!;
    expect(crewRow).toMatchObject({ worker_id: workerId, amount_minor: 1250 });
    expect(crewRow).not.toHaveProperty('reimbursement_amount_minor');
    expect(crewRow).not.toHaveProperty('billing_treatment');
    const detail = fixture.repository.expenseDetail(chief, created.id);
    expect(detail).not.toHaveProperty('reimbursement_amount_minor');
    expect(detail).not.toHaveProperty('client_treatment');
    expect(
      fixture.repository.expenseDetail(fixture.repository.principalFor(workerId), created.id),
    ).toMatchObject({
      worker_id: workerId,
      reimbursement_amount_minor: null,
    });
    expect(
      fixture.repository.createExpense(chief, input, workerId, 'crew-expense-request-0001'),
    ).toMatchObject({ id: created.id, replayed: true });
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) count FROM expense WHERE id=?').get(created.id),
    ).toEqual({ count: 1 });
    expect(() =>
      fixture.repository.createExpense(
        chief,
        {
          ...input,
          amountMinor: 1300n,
        },
        workerId,
        'crew-expense-request-0001',
      ),
    ).toThrow(ConflictError);
    const edited = fixture.repository.updateExpense(chief, {
      id: created.id,
      version: 1,
      description: 'Parking for the team installation',
    });
    expect(edited.version).toBe(2);
    fixture.repository.submitExpense(chief, created.id, 2);
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(created.id),
    ).toEqual({ approval_state: 'submitted' });
  });

  it('rejects out-of-scope, cross-worker shift and revoked access without changing source rows', () => {
    const { fixture, owner, chief, workerId, crew, grant, input } = setup();
    const created = fixture.repository.createExpense(
      chief,
      input,
      workerId,
      'crew-expense-request-0002',
    );
    expect(() =>
      fixture.repository.createExpense(
        chief,
        input,
        fixture.manager.userId,
        'crew-expense-outside-0003',
      ),
    ).toThrow(AccessDeniedError);
    expect(() =>
      fixture.repository.createExpense(
        chief,
        { ...input, timeEntryId: undefined },
        chief.userId,
        'crew-expense-other-0004',
      ),
    ).not.toThrow();
    expect(() =>
      fixture.repository.createExpense(
        chief,
        { ...input, timeEntryId: input.timeEntryId },
        chief.userId,
        'crew-expense-cross-shift-0005',
      ),
    ).toThrow('A matching active time record is required');
    crew.revoke(owner, grant.id);
    expect(() =>
      fixture.repository.createExpense(chief, input, workerId, 'crew-expense-revoked-0006'),
    ).toThrow(AccessDeniedError);
    expect(() => fixture.repository.submitExpense(chief, created.id, 1)).toThrow(AccessDeniedError);
    expect(() =>
      fixture.repository.updateExpense(chief, {
        id: created.id,
        version: 1,
        description: 'Changed after revoke',
      }),
    ).toThrow(AccessDeniedError);
    expect(() => fixture.repository.expenseDetail(chief, created.id)).toThrow(AccessDeniedError);
    expect(
      fixture.repository.listExpensesForScope(chief).some((row) => row.id === created.id),
    ).toBe(false);
    expect(
      fixture.repository.expenseDetail(fixture.repository.principalFor(workerId), created.id)
        .worker_id,
    ).toBe(workerId);
    expect(
      fixture.sqlite
        .prepare('SELECT approval_state,version FROM expense WHERE id=?')
        .get(created.id),
    ).toEqual({ approval_state: 'draft', version: 1 });
  });

  it('enforces immutable actor/grant/expense binding in SQLite', () => {
    const { fixture, chief, workerId, grant, input } = setup();
    const created = fixture.repository.createExpense(
      chief,
      input,
      workerId,
      'crew-expense-request-0007',
    );
    const own = fixture.repository.createExpense(chief, {
      ...input,
      timeEntryId: undefined,
    });
    const insert = fixture.sqlite.prepare(
      'INSERT INTO crew_expense_recorder(expense_id,grant_id,recorded_by_user_id,recorded_at) VALUES(?,?,?,?)',
    );
    expect(() => insert.run(own.id, grant.id, chief.userId, new Date().toISOString())).toThrow(
      /scope mismatch/u,
    );
    expect(() =>
      fixture.sqlite
        .prepare('UPDATE crew_expense_recorder SET recorded_by_user_id=? WHERE expense_id=?')
        .run(workerId, created.id),
    ).toThrow(/immutable/u);
    expect(() =>
      fixture.sqlite
        .prepare(
          'INSERT INTO crew_expense_request(actor_user_id,request_id,payload_sha256,expense_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(
          workerId,
          'forged-crew-request-0008',
          'a'.repeat(64),
          created.id,
          new Date().toISOString(),
        ),
    ).toThrow(/actor mismatch/u);
  });
});
