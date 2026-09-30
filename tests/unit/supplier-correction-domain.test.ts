import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  TimeEntryRepository,
  type TimeEntryCorrectionInput,
  type TimeEntryRepositoryDependencies,
} from '../../packages/database/src/domains/time/time-entry-repository';
import { SupplierWorkforceRepository } from '../../packages/database/src/domains/workforce/supplier-workforce-repository';

const principal = {
  userId: 'coordinator',
  role: 'worker',
  sessionId: 'live',
  projectIds: new Set(['project']),
} as Principal;
const record = {
  id: 'time',
  project_id: 'project',
  worker_id: 'technician',
  work_date: '2026-10-10',
  category: 'work',
  activity_code: null,
  minutes: 15,
  project_timezone: 'Europe/Madrid',
  activity_summary: 'Original activity',
  site: null,
  start_time: null,
  end_time: null,
  break_minutes: null,
  approval_state: 'needs_changes',
  submitted_at: null,
  invoice_id: null,
  billing_status: 'unlocked',
  billing_lock_id: null,
  locked_at: null,
  version: 1,
};

/** In-memory statement doubles only: no fixture database or business seeds. */
function harness(changes: Record<string, unknown> = {}) {
  const current = { ...record, ...changes };
  const writes: { sql: string; args: unknown[] }[] = [];
  let parent: { original_id: string } | undefined;
  let linked = false;
  let ownerMatches = true;
  let grantMatches = true;
  let attempts: unknown[] = [];
  let changedRows = 1;
  const queries: { sql: string; args: unknown[] }[] = [];
  const sqlite = {
    exec: vi.fn(),
    prepare: (sql: string) => ({
      get: (...args: unknown[]) => {
        queries.push({ sql, args });
        if (sql.includes('FROM time_entry WHERE id=?')) return current;
        if (sql.includes('SELECT original_id FROM record_correction_link')) return parent;
        if (sql.includes('SELECT 1 FROM record_correction_link WHERE'))
          return linked ? { found: 1 } : undefined;
        if (sql.includes('JOIN supplier_time_entry_recorder recorder'))
          return ownerMatches ? { found: 1 } : undefined;
        if (sql.includes('FROM deployment_identity')) return { tenant_id: 'tenant' };
        if (sql.includes('SUM(minutes)')) return { minutes: 0 };
        if (sql.includes('crew_shared_expense_allocation')) return undefined;
        if (sql.includes('FROM session')) return { expires_at: '2099-01-01T00:00:00Z' };
        if (sql.includes('FROM supplier_user_profile'))
          return { profile: 'supplier_coordinator', supplier_id: 'supplier' };
        if (sql.includes('FROM supplier_project_grant'))
          return grantMatches
            ? { grant_id: 'grant', starts_on: '2026-01-01', ends_on: null }
            : undefined;
        if (sql.includes('JOIN supplier_user_profile sup')) return { found: 1 };
        if (sql.includes('FROM project_member')) return { found: 1 };
        if (sql.includes('FROM user')) return { role: 'worker', status: 'active' };
        return undefined;
      },
      all: () => (sql.includes('rcl.request_id') ? attempts : []),
      run: (...args: unknown[]) => {
        writes.push({ sql, args });
        return { changes: changedRows };
      },
    }),
  } as unknown as DatabaseSync;
  const reject = (message: string): never => {
    throw new Error(message);
  };
  const deps: TimeEntryRepositoryDependencies = {
    sqlite,
    transaction: (work) => work(),
    assertActive: vi.fn(),
    assertReadable: vi.fn(),
    assertCanReview: vi.fn(),
    assertDelegatedTimeAccess: vi.fn(),
    recordDelegatedTimeEntry: vi.fn(),
    audit: vi.fn(),
    assertDate: vi.fn(),
    assertText: (text) => text.trim(),
    shiftIsoDate: (date) => date,
    now: () => '2026-09-30T00:00:00Z',
    errors: { accessDenied: reject, conflict: reject, validation: reject },
  };
  return {
    sqlite,
    deps,
    current,
    writes,
    queries,
    setLinked: (value: boolean) => {
      linked = value;
    },
    setOwner: (value: boolean) => {
      ownerMatches = value;
    },
    setGrant: (value: boolean) => {
      grantMatches = value;
    },
    setAttempts: (value: unknown[]) => {
      attempts = value;
    },
    setChangedRows: (value: number) => {
      changedRows = value;
    },
  };
}
const correction = (patch: TimeEntryCorrectionInput['patch']) => ({
  originalId: 'time',
  requestId: 'request',
  reason: 'Fix actual hours',
  patch,
});

describe('Supplier correction draft domain boundaries', () => {
  it.each([
    {},
    { minutes: 15 },
    { minutes: undefined },
    { startTime: null, endTime: null, breakMinutes: null },
  ])('rejects effective no-op %j before writes', (patch) => {
    const h = harness();
    expect(() =>
      new TimeEntryRepository(h.deps).createCorrectionDraft(principal, correction(patch)),
    ).toThrow('Change at least one operational field');
    expect(h.writes).toHaveLength(0);
  });
  it.each([{ guessedField: 'change' }, { minutes: null }, { summary: null }, { minutes: 1.5 }])(
    'rejects invalid or unknown %j before writes',
    (patch) => {
      const h = harness();
      expect(() =>
        new TimeEntryRepository(h.deps).createCorrectionDraft(
          principal,
          correction(patch as never),
        ),
      ).toThrow();
      expect(h.writes).toHaveLength(0);
    },
  );
  it('creates changed operational truth, linked history and Supplier recorder once, then replays', () => {
    const h = harness();
    const repo = new TimeEntryRepository(h.deps);
    const input = correction({ minutes: 30 });
    const created = repo.createCorrectionDraft(principal, input);
    expect(h.writes.filter((w) => w.sql.includes('INSERT INTO time_entry'))).toHaveLength(1);
    expect(h.writes.some((w) => w.sql.includes('UPDATE time_entry'))).toBe(false);
    expect(h.deps.recordDelegatedTimeEntry).toHaveBeenCalledWith(
      principal,
      created.id,
      'technician',
      'project',
      '2026-10-10',
    );
    const link = h.writes.find((w) => w.sql.includes('INSERT INTO record_correction_link'))!;
    h.setAttempts([
      {
        correction_id: created.id,
        request_id: 'request',
        request_payload_sha256: link.args[5],
        approval_state: 'draft',
      },
    ]);
    const count = h.writes.length;
    expect(repo.createCorrectionDraft(principal, input)).toMatchObject({
      id: created.id,
      replayed: true,
    });
    expect(h.writes).toHaveLength(count);
    expect(() => repo.createCorrectionDraft(principal, correction({ minutes: 45 }))).toThrow(
      'conflicts with prior replay',
    );
  });
  it('honors an explicit null interval removal with the changed duration', () => {
    const h = harness({ start_time: '08:00', end_time: '08:15', break_minutes: 0 });
    new TimeEntryRepository(h.deps).createCorrectionDraft(
      principal,
      correction({ minutes: 30, startTime: null, endTime: null, breakMinutes: null }),
    );
    const timeWrite = h.writes.find((w) => w.sql.includes('INSERT INTO time_entry'))!;
    expect(timeWrite.args.slice(10, 13)).toEqual([null, null, null]);
  });
  it('retains generic Worker linked correction edit lock', () => {
    const h = harness({ approval_state: 'draft' });
    h.setLinked(true);
    expect(() =>
      new TimeEntryRepository(h.deps).updateTimeEntry(principal, {
        id: 'time',
        version: 1,
        minutes: 30,
      }),
    ).toThrow('A linked correction draft cannot be edited');
    expect(h.writes).toHaveLength(0);
  });
  it('permits only the real Supplier actor and recorder through the visible draft edit method', () => {
    const h = harness({ approval_state: 'draft' });
    h.setLinked(true);
    const repo = new SupplierWorkforceRepository(h.sqlite);
    expect(repo.updateTime(principal, { id: 'time', version: 1, minutes: 30 })).toEqual({
      id: 'time',
      version: 2,
    });
    const owned = h.queries.find((q) =>
      q.sql.includes('JOIN supplier_time_entry_recorder recorder'),
    )!;
    expect(owned.args).toEqual(['time', 'coordinator', 'coordinator', 'supplier']);
    const update = h.writes.find((w) => w.sql.includes('UPDATE time_entry'))!;
    expect(update.sql).toContain(
      'submitted_at IS NULL AND billing_lock_id IS NULL AND locked_at IS NULL',
    );
    h.setOwner(false);
    h.writes.length = 0;
    expect(() => repo.updateTime(principal, { id: 'time', version: 1, minutes: 30 })).toThrow(
      'Supplier correction draft ownership required',
    );
    expect(h.writes).toHaveLength(0);
  });
  it.each([
    { submitted_at: '2026-09-30T00:00:00Z' },
    { locked_at: '2026-09-30' },
    { billing_lock_id: 'lock' },
    { invoice_id: 'invoice' },
    { approval_state: 'submitted' },
  ])('rejects reviewed/locked correction %j before editing', (changes) => {
    const h = harness({ approval_state: 'draft', ...changes });
    h.setLinked(true);
    expect(() =>
      new SupplierWorkforceRepository(h.sqlite).updateTime(principal, {
        id: 'time',
        version: 1,
        minutes: 30,
      }),
    ).toThrow('Only an unlocked never-submitted time draft');
    expect(h.writes).toHaveLength(0);
  });
  it('requires live original and changed-date project grants for editing', () => {
    const h = harness({ approval_state: 'draft' });
    h.setLinked(true);
    const repo = new SupplierWorkforceRepository(h.sqlite);
    repo.updateTime(principal, { id: 'time', version: 1, workDate: '2026-10-11', minutes: 30 });
    const dates = h.queries
      .filter((q) => q.sql.includes('FROM supplier_project_grant'))
      .map((q) => q.args[5]);
    expect(dates).toEqual(['2026-10-10', '2026-10-11']);
    h.setGrant(false);
    h.writes.length = 0;
    expect(() => repo.updateTime(principal, { id: 'time', version: 1, minutes: 30 })).toThrow(
      'Current supplier project grant required',
    );
    expect(h.writes).toHaveLength(0);
  });
  it('rejects stale updates through the final guarded write', () => {
    const h = harness({ approval_state: 'draft' });
    h.setLinked(true);
    h.setChangedRows(0);
    expect(() =>
      new SupplierWorkforceRepository(h.sqlite).updateTime(principal, {
        id: 'time',
        version: 1,
        minutes: 30,
      }),
    ).toThrow('Time entry changed or cannot be edited');
  });
});
