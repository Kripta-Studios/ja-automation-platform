import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase, integrityCheck, PortalRepository } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  signInB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';

const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const original = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  if (original === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = original;
});

function migrationsThrough(version: number): string {
  const target = mkdtempSync(join(tmpdir(), `ja-supersession-schema${version}-`));
  directories.push(target);
  for (const entry of readdirSync(resolve('migrations')))
    if (
      entry === 'contracts' ||
      (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= version)
    )
      cpSync(join(resolve('migrations'), entry), join(target, entry), { recursive: true });
  return target;
}

type Value = B5LifecycleSecurityFixture;

function returnedExpense(f: Value, spentOn: string) {
  const expense = f.repository.createExpense(f.worker, {
    projectId: f.project.id,
    spentOn,
    vendor: 'Hardware store',
    category: 'materials',
    description: 'Cable ties',
    currency: 'EUR',
    amountMinor: 11_200n,
    whoPaid: 'worker',
    clientTreatment: 'reimbursable',
    receiptRequired: false,
  });
  f.repository.submitExpense(f.worker, expense.id, expense.version);
  f.repository.operationalApproveExpense(f.manager, expense.id, 'needs_changes', 'Receipt is unreadable');
  return expense.id;
}

function returnedTime(f: Value, workDate: string) {
  const time = f.repository.createTimeEntry(f.worker, {
    projectId: f.project.id,
    workDate,
    category: 'regular',
    minutes: 600,
    summary: 'Commissioning',
  });
  f.repository.submitTime(f.worker, time.id, time.version);
  f.repository.operationalApproveTime(f.manager, time.id, 'needs_changes', 'Ten hours? Confirm');
  return time.id;
}

function correct(f: Value, recordType: 'time_entry' | 'expense', originalId: string, requestId: string) {
  return f.repository.createCorrectionDraft(f.worker, {
    recordType,
    originalId,
    requestId,
    reason: 'Fixed after review',
    patch: recordType === 'time_entry' ? { minutes: 540 } : { description: 'Cable ties, new receipt' },
  });
}

function state(f: { sqlite: Value['sqlite'] }, table: 'time_entry' | 'expense', id: string) {
  return (f.sqlite.prepare(`SELECT approval_state FROM ${table} WHERE id=?`).get(id) as {
    approval_state: string;
  }).approval_state;
}

describe('returned record supersession migration83 (T08)', () => {
  it('closes sent-back originals whose correction was sent or approved, and keeps editing ones open', () => {
    process.env.JA_MIGRATIONS_PATH = migrationsThrough(82);
    const base = createB5LifecycleSecurityFixture();
    const f = { ...base, worker: signInB5Principal(base.sqlite, base.worker, 'supersession-worker') };
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 82,
    });
    // Expense: corrected copy approved, original stuck in needs_changes (pm-21).
    const expenseOriginal = returnedExpense(f, '2026-08-18');
    const expenseCorrection = correct(f, 'expense', expenseOriginal, 'expense-fix');
    f.repository.submitExpense(f.worker, expenseCorrection.correctionId, 1);
    f.repository.operationalApproveExpense(f.manager, expenseCorrection.correctionId, 'approved');
    // Time: corrected copy submitted (crewlead-16 / technician-28).
    const timeOriginal = returnedTime(f, '2026-08-19');
    const timeCorrection = correct(f, 'time_entry', timeOriginal, 'time-fix');
    f.repository.submitTime(f.worker, timeCorrection.correctionId, 1);
    // Time: correction still a draft -> the worker is still fixing it.
    const draftOriginal = returnedTime(f, '2026-08-20');
    const draftCorrection = correct(f, 'time_entry', draftOriginal, 'time-draft');
    expect(state(f, 'expense', expenseOriginal)).toBe('needs_changes');
    expect(state(f, 'time_entry', timeOriginal)).toBe('needs_changes');
    const untouched = f.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(draftOriginal);
    f.sqlite.close();

    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    const upgraded = { sqlite: createDatabase(join(f.directory, 'app.db')).sqlite };
    f.sqlite = upgraded.sqlite;
    expect(upgraded.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 98,
    });
    expect(integrityCheck(upgraded.sqlite)).toBe('ok');
    expect(state(upgraded, 'expense', expenseOriginal)).toBe('rejected');
    expect(state(upgraded, 'expense', expenseCorrection.correctionId)).toBe('approved');
    expect(state(upgraded, 'time_entry', timeOriginal)).toBe('rejected');
    expect(state(upgraded, 'time_entry', timeCorrection.correctionId)).toBe('submitted');
    expect(upgraded.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(draftOriginal)).toEqual(
      untouched,
    );
    expect(
      upgraded.sqlite
        .prepare(
          "SELECT entity_type,from_state,to_state,reason FROM approval_event WHERE entity_id IN (?,?) AND to_state='rejected' ORDER BY entity_type",
        )
        .all(expenseOriginal, timeOriginal),
    ).toEqual([
      {
        entity_type: 'expense',
        from_state: 'needs_changes',
        to_state: 'rejected',
        reason: `Superseded by correction ${expenseCorrection.correctionId}`,
      },
      {
        entity_type: 'time',
        from_state: 'needs_changes',
        to_state: 'rejected',
        reason: `Superseded by correction ${timeCorrection.correctionId}`,
      },
    ]);
    // Sending the remaining draft correction closes its original through the trigger.
    const repository = new PortalRepository(upgraded.sqlite);
    repository.submitTime(f.worker, draftCorrection.correctionId, 1);
    expect(state(upgraded, 'time_entry', draftOriginal)).toBe('rejected');
    expect(state(upgraded, 'time_entry', draftCorrection.correctionId)).toBe('submitted');
  });

  it('on a fresh database a submitted correction supersedes its sent-back original; a withdrawn draft does not', () => {
    const base = createB5LifecycleSecurityFixture();
    const f = { ...base, worker: signInB5Principal(base.sqlite, base.worker, 'supersession-fresh') };
    fixtures.push(f);
    const kept = returnedExpense(f, '2026-08-18');
    const draft = correct(f, 'expense', kept, 'expense-withdraw');
    f.repository.withdrawCorrectionDraft(f.worker, {
      recordType: 'expense',
      correctionId: draft.correctionId,
      version: 1,
      reason: 'Wrong file',
    });
    expect(state(f, 'expense', kept)).toBe('needs_changes');
    const replaced = returnedExpense(f, '2026-08-19');
    const correction = correct(f, 'expense', replaced, 'expense-send');
    f.repository.submitExpense(f.worker, correction.correctionId, 1);
    expect(state(f, 'expense', replaced)).toBe('rejected');
    // Sent-back lists no longer show it; the correction is the live record.
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM expense WHERE worker_id=? AND approval_state='needs_changes'")
        .get(f.worker.userId),
    ).toEqual({ n: 1 });
  });
});
