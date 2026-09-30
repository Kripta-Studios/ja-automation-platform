import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  CrewLeaderRepository,
  PortalRepository,
  createDatabase,
} from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import { TimeEntryRepository } from '../../packages/database/src/domains/time/time-entry-repository';
import { recordAuditEvent } from '../../packages/database/src/core/audit';
import { runImmediateTransaction } from '../../packages/database/src/core/transaction';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment';

let sqlite: DatabaseSync;
let repository: PortalRepository;
let restoreIdentity: () => void;
const stamp = '2026-09-30T12:00:00Z';
const principal = (userId = 'worker', role: Role = 'worker'): Principal => ({
  userId,
  role,
  sessionId: `${userId}-session`,
  projectIds: new Set(['project']),
});
const worker = principal();
const owner = principal('owner', 'owner_admin');
const timeInput = (workDate = '2026-09-30') => ({
  projectId: 'project',
  workDate,
  category: 'regular',
  minutes: 15,
  summary: 'Isolated operational write',
});
const expenseInput = (spentOn = '2026-09-30') => ({
  projectId: 'project',
  spentOn,
  category: 'meals',
  currency: 'USD' as const,
  amountMinor: 1n,
  description: 'Isolated operational expense',
  whoPaid: 'worker',
  receiptRequired: false,
});

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
  // Full production SQL contracts, isolated in memory; no application database.
  sqlite = createDatabase(':memory:').sqlite;
});
afterAll(() => {
  sqlite.close();
  restoreIdentity();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(stamp);
  sqlite.exec('SAVEPOINT operational_case');
  for (const [id, role] of [
    ['worker', 'worker'],
    ['member', 'worker'],
    ['owner', 'owner_admin'],
    ['finance', 'finance_admin'],
    ['manager', 'project_manager'],
  ] as const) {
    sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        id,
        id,
        role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.test`,
        role,
        'active',
        stamp,
        stamp,
      );
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .run(`${id}-session`, `${id}-token`, id, '2027-01-01T00:00:00Z', stamp, stamp);
  }
  sqlite
    .prepare(
      'INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run('client', 'C-TEST', 'Test', 'Test', 'active', 'USD', 'UTC', stamp, stamp);
  sqlite
    .prepare(
      'INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .run('project', 'P-TEST', 'client', 'Test', 'UTC', 'USD', 'active', 'tm', stamp, stamp);
  for (const id of ['worker', 'member', 'manager', 'finance']) assignment(id);
  repository = new PortalRepository(sqlite);
});
afterEach(() => {
  sqlite.exec('ROLLBACK TO operational_case; RELEASE operational_case');
  vi.useRealTimers();
});

function assignment(userId: string, from = '2026-09-01', to: string | null = '2026-10-31') {
  sqlite
    .prepare(
      'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(`${userId}-${from}`, 'project', userId, 'worker', from, to, stamp, stamp);
}
function endAssignment(endsOn: string, userId = 'worker') {
  sqlite.prepare('UPDATE project_member SET ends_on=? WHERE user_id=?').run(endsOn, userId);
}
function timezone(value: string) {
  sqlite.prepare('UPDATE project SET timezone=?').run(value);
}
function footprint() {
  return Object.fromEntries(
    [
      'time_entry',
      'expense',
      'audit_event',
      'outbox_event',
      'job',
      'operational_time_expense_request',
      'crew_expense_recorder',
      'crew_time_entry_recorder',
    ].map((table) => [table, sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()?.n]),
  );
}
function denied(write: () => unknown) {
  const before = footprint();
  expect(write).toThrow(AccessDeniedError);
  expect(footprint()).toEqual(before);
}
function domain() {
  return new TimeEntryRepository({
    sqlite,
    transaction: (work) => runImmediateTransaction(sqlite, 'operational-write-test', work),
    assertActive: () => {},
    assertReadable: () => {},
    assertCanReview: () => {},
    audit: (actor, action, entity, id, details) =>
      recordAuditEvent(sqlite, actor, action, entity, id, details),
    assertDate: () => {},
    assertText: (value) => value.trim(),
    shiftIsoDate: (date, days) =>
      new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10),
    now: () => new Date().toISOString(),
    errors: {
      accessDenied: (message) => {
        throw new AccessDeniedError(message);
      },
      conflict: (message) => {
        throw new ConflictError(message);
      },
      validation: (message) => {
        throw new Error(message);
      },
    },
  });
}
const creates = {
  expense: () => repository.createExpense(worker, expenseInput()),
  time: () => repository.createTimeEntry(worker, timeInput()),
  canonicalTime: () => domain().createTimeEntry(worker, timeInput()),
};

describe('current project-local own operational writes', () => {
  it.each(Object.keys(creates) as Array<keyof typeof creates>)(
    'rejects stale %s after the project-local date passes the assignment end',
    (kind) => {
      timezone('Pacific/Kiritimati');
      endAssignment('2026-09-30');
      denied(creates[kind]);
      expect(
        sqlite.prepare('SELECT ends_on FROM project_member WHERE user_id=?').get('worker')?.ends_on,
      ).toBe('2026-09-30');
    },
  );

  it.each(Object.keys(creates) as Array<keyof typeof creates>)(
    'permits %s on the current New York day despite the later UTC date',
    (kind) => {
      vi.setSystemTime('2026-09-30T02:00:00Z');
      timezone('America/New_York');
      endAssignment('2026-09-29');
      const saved =
        kind === 'expense'
          ? repository.createExpense(worker, expenseInput('2026-09-29'))
          : kind === 'time'
            ? repository.createTimeEntry(worker, timeInput('2026-09-29'))
            : domain().createTimeEntry(worker, timeInput('2026-09-29'));
      expect(saved).toMatchObject({ id: expect.any(String), version: 1 });
      vi.setSystemTime('2026-09-30T05:00:00Z');
      denied(() =>
        kind === 'expense'
          ? repository.updateExpense(worker, {
              id: saved.id,
              version: 1,
              description: 'Denied update',
            })
          : kind === 'time'
            ? repository.updateTimeEntry(worker, {
                id: saved.id,
                version: 1,
                summary: 'Denied update',
              })
            : domain().updateTimeEntry(worker, {
                id: saved.id,
                version: 1,
                summary: 'Denied update',
              }),
      );
    },
  );

  it('permits separate current and future assignments without requiring one interval to cover both', () => {
    endAssignment('2026-09-30');
    assignment('worker', '2026-10-02', '2026-10-03');
    expect(repository.createExpense(worker, expenseInput('2026-10-03')).version).toBe(1);
    expect(repository.createTimeEntry(worker, timeInput('2026-10-03')).version).toBe(1);
    expect(
      domain().createTimeEntry(worker, {
        ...timeInput('2026-10-03'),
        summary: 'Separate interval',
        category: 'travel',
      }).version,
    ).toBe(1);
    denied(() => repository.createExpense(worker, expenseInput('2026-10-01')));
    denied(() => domain().createTimeEntry(worker, timeInput('2026-10-01')));
  });

  it.each(['closed', 'archived', 'closing', 'draft'])(
    'rejects %s projects before creates or audit writes',
    (status) => {
      sqlite.prepare('UPDATE project SET status=?').run(status);
      for (const create of Object.values(creates)) denied(create);
    },
  );

  it.each(['planned', 'paused', 'active'])('keeps legitimate %s project writes', (status) => {
    sqlite.prepare('UPDATE project SET status=?').run(status);
    expect(repository.createExpense(worker, expenseInput()).version).toBe(1);
    expect(repository.createTimeEntry(worker, timeInput()).version).toBe(1);
  });

  it('fails closed on invalid project timezone', () => {
    timezone('Not/A_Timezone');
    for (const create of Object.values(creates)) denied(create);
  });

  it.each(['missing', 'expired', 'inactive', 'roleChanged'])(
    'requires live Worker identity for %s context',
    (state) => {
      if (state === 'missing') sqlite.exec("DELETE FROM session WHERE user_id='worker'");
      if (state === 'expired')
        sqlite.exec("UPDATE session SET expires_at='2026-09-29T00:00:00Z' WHERE user_id='worker'");
      if (state === 'inactive') sqlite.exec("UPDATE user SET status='suspended' WHERE id='worker'");
      if (state === 'roleChanged')
        sqlite.exec("UPDATE user SET role='project_manager' WHERE id='worker'");
      for (const create of Object.values(creates)) denied(create);
    },
  );

  it('preserves the owned draft and audit when current authority is revoked before update', () => {
    const expense = repository.createExpense(worker, expenseInput());
    const time = repository.createTimeEntry(worker, timeInput());
    timezone('Pacific/Kiritimati');
    endAssignment('2026-09-30');
    denied(() =>
      repository.updateExpense(worker, {
        id: expense.id,
        version: 1,
        description: 'Must not persist',
      }),
    );
    denied(() =>
      repository.updateTimeEntry(worker, { id: time.id, version: 1, summary: 'Must not persist' }),
    );
    denied(() =>
      domain().updateTimeEntry(worker, { id: time.id, version: 1, summary: 'Must not persist' }),
    );
    expect(
      sqlite.prepare('SELECT version,description FROM expense WHERE id=?').get(expense.id),
    ).toMatchObject({ version: 1, description: expenseInput().description });
    expect(
      sqlite.prepare('SELECT version,activity_summary FROM time_entry WHERE id=?').get(time.id),
    ).toMatchObject({ version: 1, activity_summary: timeInput().summary });
  });

  it('creates Time and Expense atomically, and cannot replay their identifiers after revocation', () => {
    const input = expenseInput();
    const result = repository.createTimeWithExpense(
      worker,
      timeInput(),
      input,
      'isolated-capture-request',
    );
    expect(result.replayed).toBe(false);
    expect(
      repository.createTimeWithExpense(worker, timeInput(), input, 'isolated-capture-request'),
    ).toMatchObject({ replayed: true, time: result.time, expense: result.expense });
    timezone('Pacific/Kiritimati');
    endAssignment('2026-09-30');
    denied(() =>
      repository.createTimeWithExpense(worker, timeInput(), input, 'new-isolated-capture-request'),
    );
    denied(() =>
      repository.createTimeWithExpense(worker, timeInput(), input, 'isolated-capture-request'),
    );
  });

  it('rolls back the Time row and its audit if the Expense fails within the same capture', () => {
    const before = footprint();
    expect(() =>
      repository.createTimeWithExpense(
        worker,
        timeInput(),
        { ...expenseInput(), amountMinor: 0n },
        'invalid-expense-capture-request',
      ),
    ).toThrow('Expense amount must be positive');
    expect(footprint()).toEqual(before);
  });

  it('rechecks inside the canonical Time transaction after a successful portal precheck', () => {
    const original = TimeEntryRepository.prototype.createTimeEntryForWorker;
    const spy = vi
      .spyOn(TimeEntryRepository.prototype, 'createTimeEntryForWorker')
      .mockImplementationOnce(function (this: TimeEntryRepository, actor, subject, input) {
        timezone('Pacific/Kiritimati');
        endAssignment('2026-09-30');
        return original.call(this, actor, subject, input);
      });
    try {
      denied(() => repository.createTimeEntry(worker, timeInput()));
    } finally {
      spy.mockRestore();
    }
  });
});

function supplier() {
  sqlite
    .prepare('INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('supplier', 'Isolated supplier', 'active', stamp, stamp);
  sqlite
    .prepare(
      'INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,?,?,?,?)',
    )
    .run('worker', 'supplier', 'supplier_coordinator', stamp, stamp);
  sqlite
    .prepare(
      'INSERT INTO supplier_project_grant(id,supplier_id,project_id,coordinator_id,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      'supplier-grant',
      'supplier',
      'project',
      'worker',
      '2026-09-01',
      '2026-10-31',
      stamp,
      stamp,
    );
}
describe('unchanged delegation and administrative boundaries', () => {
  it('keeps live supplier own authority on current and requested project-local days', () => {
    supplier();
    timezone('America/New_York');
    vi.setSystemTime('2026-09-30T02:00:00Z');
    endAssignment('2026-09-29');
    sqlite.exec("UPDATE supplier_project_grant SET ends_on='2026-09-29'");
    expect(repository.createExpense(worker, expenseInput('2026-09-29')).version).toBe(1);
    expect(repository.createTimeEntry(worker, timeInput('2026-09-29')).version).toBe(1);
  });
  it.each(['revokedGrant', 'inactiveSupplier', 'expiredGrant'])(
    'denies supplier writes after %s without downgrading to ordinary Worker',
    (reason) => {
      supplier();
      if (reason === 'revokedGrant')
        sqlite.exec(
          "UPDATE supplier_project_grant SET status='revoked',revoked_at='2026-09-30T00:00:00Z',revoked_by='owner'",
        );
      if (reason === 'inactiveSupplier') sqlite.exec("UPDATE supplier SET status='inactive'");
      if (reason === 'expiredGrant')
        sqlite.exec("UPDATE supplier_project_grant SET ends_on='2026-09-29'");
      for (const create of Object.values(creates)) denied(create);
    },
  );
  it('requires a supplier grant on the future occurrence independently from current access', () => {
    supplier();
    sqlite.exec("UPDATE supplier_project_grant SET ends_on='2026-09-30'");
    denied(() => repository.createExpense(worker, expenseInput('2026-10-01')));
    denied(() => domain().createTimeEntry(worker, timeInput('2026-10-01')));
  });
  it('preserves Owner entry for a worker with historical requested-day membership', () => {
    timezone('Pacific/Kiritimati');
    endAssignment('2026-09-30');
    expect(repository.createExpense(owner, expenseInput(), 'worker').version).toBe(1);
    expect(repository.createTimeEntry(owner, timeInput(), 'worker').version).toBe(1);
  });
  it('preserves Finance own expense entry and prevents Worker entry for an ungranted other subject', () => {
    timezone('Pacific/Kiritimati');
    endAssignment('2026-09-30', 'finance');
    expect(
      repository.createExpense(principal('finance', 'finance_admin'), expenseInput()).version,
    ).toBe(1);
    denied(() =>
      repository.createExpense(worker, expenseInput(), 'member', 'ungranted-expense-request'),
    );
    denied(() => repository.createTimeEntry(worker, timeInput(), 'member'));
  });
  it('preserves the existing project-manager own Time path', () => {
    expect(
      repository.createTimeEntry(principal('manager', 'project_manager'), timeInput()).version,
    ).toBe(1);
  });
  it('preserves live chief/member writes and refuses expired member authority before any further write', () => {
    const crew = new CrewLeaderRepository(sqlite);
    crew.grant(owner, {
      projectId: 'project',
      chiefUserId: 'worker',
      workerUserId: 'member',
      startsOn: '2026-09-01',
    });
    const expense = repository.createExpense(
      worker,
      expenseInput(),
      'member',
      'crew-expense-request-valid',
    );
    const time = crew.createBatch(worker, {
      ...timeInput(),
      workerIds: ['member'],
      requestId: 'crew-time-request-valid',
    }).created[0];
    expect(expense.version).toBe(1);
    expect(time?.version).toBe(1);
    endAssignment('2026-09-29', 'member');
    denied(() =>
      repository.createExpense(worker, expenseInput(), 'member', 'crew-expense-request-denied'),
    );
    denied(() =>
      repository.updateExpense(worker, {
        id: expense.id,
        version: 1,
        description: 'Must not persist',
      }),
    );
    denied(() =>
      crew.createBatch(worker, {
        ...timeInput(),
        workerIds: ['member'],
        requestId: 'crew-time-request-denied',
      }),
    );
  });

  it.each(['chiefAssignment', 'revokedGrant'])(
    'does not bypass chief delegation after %s',
    (reason) => {
      const crew = new CrewLeaderRepository(sqlite);
      const grant = crew.grant(owner, {
        projectId: 'project',
        chiefUserId: 'worker',
        workerUserId: 'member',
        startsOn: '2026-09-01',
      });
      if (reason === 'chiefAssignment') endAssignment('2026-09-29');
      else crew.revoke(owner, grant.id);
      denied(() =>
        repository.createExpense(worker, expenseInput(), 'member', 'crew-expense-revoked-request'),
      );
      denied(() =>
        crew.createBatch(worker, {
          ...timeInput(),
          workerIds: ['member'],
          requestId: 'crew-time-revoked-request',
        }),
      );
    },
  );
});
