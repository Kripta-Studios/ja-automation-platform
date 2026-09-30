import { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrewLeaderRepository } from '../../packages/database/src/domains/workforce/crew-leader-repository';
import { _expenseDescriptionDefault } from '../../apps/portal/src/routes/app/api/expenses/description-default/+server';
import { expenseLookupCaught } from '../../apps/portal/src/lib/server/expense-lookup-problem';

// Isolated SQL contract fixture: never opens the runtime database or seed helpers.
let sqlite: DatabaseSync;
const principal = (userId = 'caller', role: Principal['role'] = 'worker'): Principal => ({
  userId,
  role,
  sessionId: `${userId}-session`,
  projectIds: new Set(['assigned']),
});
const scope = { projectId: 'assigned', workerId: 'caller', date: '2026-10-10' };
const description = (actor = principal(), input = scope) =>
  _expenseDescriptionDefault(sqlite, actor, input);
const roster = (projectId = 'assigned', date = scope.date, actor = principal()) =>
  new CrewLeaderRepository(sqlite).assignedWorkers(actor, projectId, date);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T02:00:00Z'));
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,role TEXT,status TEXT);
    CREATE TABLE session(id TEXT,token TEXT,user_id TEXT,expires_at TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,name TEXT,status TEXT,timezone TEXT);
    CREATE TABLE project_member(id TEXT,project_id TEXT,user_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    CREATE TABLE crew_leader_grant(id TEXT,project_id TEXT,chief_user_id TEXT,worker_user_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    CREATE TABLE assignment_expense_policy(project_member_id TEXT,category TEXT,effective_from TEXT,effective_to TEXT);
    CREATE TABLE supplier_user_profile(user_id TEXT,profile TEXT,supplier_id TEXT);
    CREATE TABLE supplier(id TEXT,status TEXT);
    CREATE TABLE supplier_project_grant(id TEXT,supplier_id TEXT,coordinator_id TEXT,project_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    INSERT INTO user VALUES('caller','Caller','worker','active'),('member','Member','worker','active'),('owner','Owner','owner_admin','active'),('pm','Manager','project_manager','active');
    INSERT INTO session SELECT id||'-session',id||'-token',id,'2027-01-01T00:00:00Z' FROM user;
    INSERT INTO project VALUES('assigned','Authorized','active','UTC'),('unassigned','Private','active','UTC');
    INSERT INTO project_member VALUES('caller-assignment','assigned','caller','active','2026-09-01','2026-10-31'),('member-assignment','assigned','member','active','2026-09-01','2026-10-31');
  `);
});
afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
});

async function denialBody(lookup: 'crew' | 'description', operation: () => unknown) {
  let failure: unknown;
  try {
    operation();
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toBeInstanceOf(Error);
  const response = expenseLookupCaught(lookup, failure, 'same-request-reference');
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  return response.json();
}

describe('crew worker options authorized project boundary', () => {
  it('returns an empty roster to an assigned ordinary worker and only an authorized chief roster', () => {
    expect(roster()).toEqual([]);
    sqlite.exec(
      "INSERT INTO crew_leader_grant VALUES('grant','assigned','caller','member','active','2026-09-01','2026-10-31')",
    );
    expect(roster()).toEqual([{ id: 'member', name: 'Member' }]);
  });

  it('maps existing unassigned and missing project identifiers to identical safe denial bodies', async () => {
    const existing = await denialBody('crew', () => roster('unassigned'));
    const missing = await denialBody('crew', () => roster('missing'));
    expect(existing).toEqual(missing);
    expect(existing).toMatchObject({ code: 'EXPENSE_LOOKUP_CREW_SCOPE_DENIED', params: {} });
    expect(JSON.stringify(existing)).not.toMatch(/Private|unassigned|missing|timezone/u);
  });

  it('denies a formerly assigned project even on a historically eligible requested date', async () => {
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE user_id='caller'");
    expect(await denialBody('crew', () => roster('assigned', '2026-09-20'))).toMatchObject({
      code: 'EXPENSE_LOOKUP_CREW_SCOPE_DENIED',
    });
  });

  it('requires membership on the requested day and excludes revoked or expired member grants', () => {
    expect(() => roster('assigned', '2026-11-01')).toThrow();
    sqlite.exec(
      "INSERT INTO crew_leader_grant VALUES('grant','assigned','caller','member','active','2026-09-01','2026-10-31')",
    );
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE user_id='member'");
    expect(roster()).toEqual([]);
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-10-31' WHERE user_id='member'; UPDATE crew_leader_grant SET status='revoked'",
    );
    expect(roster()).toEqual([]);
  });

  it('uses project-local today for current membership while allowing eligible future work dates', () => {
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET starts_on='2026-09-30' WHERE user_id='caller'",
    );
    expect(() => roster()).toThrow(); // September 29 in the project, not yet assigned.
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(roster()).toEqual([]);
  });

  it.each(['archived', 'closed'])(
    'denies %s project metadata with the safe scope response',
    async (status) => {
      sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, 'assigned');
      expect(await denialBody('crew', () => roster())).toMatchObject({
        code: 'EXPENSE_LOOKUP_CREW_SCOPE_DENIED',
      });
    },
  );

  it('maps an invalid timezone only after assignment authorization to the same safe response', async () => {
    sqlite.exec("UPDATE project SET timezone='Invalid/Zone'");
    expect(await denialBody('crew', () => roster())).toMatchObject({
      code: 'EXPENSE_LOOKUP_CREW_SCOPE_DENIED',
    });
    expect(await denialBody('crew', () => roster('unassigned'))).toEqual(
      await denialBody('crew', () => roster('missing')),
    );
  });
});

describe('expense description current and requested-day access', () => {
  it('keeps authorized future per-diem descriptions operational and preserves Owner/PM scope', () => {
    expect(description()).toBe('Only hours');
    sqlite.exec(
      "INSERT INTO assignment_expense_policy VALUES('caller-assignment','per_diem','2026-10-01',NULL)",
    );
    expect(description()).toBe('Perdiem');
    expect(description(principal('owner', 'owner_admin'))).toBe('Perdiem');
    expect(description(principal('pm', 'project_manager'))).toBe('Perdiem');
    expect(() =>
      description({ ...principal('pm', 'project_manager'), projectIds: new Set() }),
    ).toThrow();
  });

  it('denies ended or not-yet-current own assignments despite eligible requested dates', async () => {
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE user_id='caller'");
    expect(
      await denialBody('description', () =>
        description(principal(), { ...scope, date: '2026-09-20' }),
      ),
    ).toMatchObject({ code: 'EXPENSE_LOOKUP_DESCRIPTION_SCOPE_DENIED' });
    sqlite.exec(
      "UPDATE project_member SET starts_on='2026-10-01',ends_on='2026-10-31' WHERE user_id='caller'",
    );
    expect(() => description()).toThrow();
  });

  it('denies requested dates beyond the assignment without changing administrative historical access', () => {
    expect(() => description(principal(), { ...scope, date: '2026-11-01' })).toThrow();
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE user_id='caller'");
    expect(description(principal('owner', 'owner_admin'), { ...scope, date: '2026-09-20' })).toBe(
      'Only hours',
    );
    expect(description(principal('pm', 'project_manager'), { ...scope, date: '2026-09-20' })).toBe(
      'Only hours',
    );
  });

  it('preserves eligible future assignments separately from the current assignment', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE user_id='caller'; INSERT INTO project_member VALUES('future-assignment','assigned','caller','active','2026-10-01','2026-10-31'); INSERT INTO assignment_expense_policy VALUES('future-assignment','per_diem','2026-10-01',NULL)",
    );
    expect(description()).toBe('Perdiem');
    expect(roster()).toEqual([]);
  });

  it('requires both chief and member current/requested-day assignments for delegated suggestions', () => {
    sqlite.exec(
      "INSERT INTO crew_leader_grant VALUES('grant','assigned','caller','member','active','2026-09-01','2026-10-31')",
    );
    expect(description(principal(), { ...scope, workerId: 'member' })).toBe('Only hours');
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE user_id='member'");
    expect(() =>
      description(principal(), { ...scope, workerId: 'member', date: '2026-09-20' }),
    ).toThrow();
  });

  it('uses local today for both own assignment and live supplier grant boundaries', () => {
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; INSERT INTO supplier VALUES('supplier','active'); INSERT INTO supplier_user_profile VALUES('caller','supplier_coordinator','supplier'); INSERT INTO supplier_project_grant VALUES('supplier-grant','supplier','caller','assigned','active','2026-09-30','2026-10-31')",
    );
    expect(() => description()).toThrow();
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(description()).toBe('Only hours');
    sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
    expect(() => description()).toThrow();
  });

  it('denies invalid authorized project timezone and archived projects without leaking context', async () => {
    sqlite.exec("UPDATE project SET timezone='Invalid/Zone' WHERE id='assigned'");
    expect(await denialBody('description', () => description())).toMatchObject({
      code: 'EXPENSE_LOOKUP_DESCRIPTION_SCOPE_DENIED',
    });
    sqlite.exec("UPDATE project SET timezone='UTC',status='archived' WHERE id='assigned'");
    const archived = await denialBody('description', () => description());
    const missing = await denialBody('description', () =>
      description(principal(), { ...scope, projectId: 'missing' }),
    );
    expect(archived).toEqual(missing);
  });
});

describe.each([
  ['crew', () => roster()],
  ['description', () => description()],
] as const)('%s live identity checks', (lookup, operation) => {
  it('denies expired sessions before returning any options or suggestion', async () => {
    sqlite.exec("UPDATE session SET expires_at='2026-09-29T00:00:00Z' WHERE user_id='caller'");
    let failure: unknown;
    try {
      operation();
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
    const response = expenseLookupCaught(lookup, failure, 'session');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'EXPENSE_LOOKUP_SIGN_IN_REQUIRED',
      params: {},
    });
  });

  it('denies suspended accounts and stale roles before returning data', () => {
    sqlite.exec("UPDATE user SET status='suspended' WHERE id='caller'");
    expect(operation).toThrow('Active account required');
    sqlite.exec("UPDATE user SET status='active',role='project_manager' WHERE id='caller'");
    expect(operation).toThrow('Active account required');
  });
});
