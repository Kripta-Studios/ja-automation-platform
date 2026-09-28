import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function setup() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const create = (receiptRequired = false) =>
    value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-20',
      vendor: 'Submission fixture',
      category: 'parking',
      description: 'Site parking',
      currency: 'EUR',
      amountMinor: 1200n,
      whoPaid: 'worker',
      receiptRequired,
    });
  const submitAudits = (id: string) =>
    (
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='expense.submit' AND entity_id=?",
        )
        .get(id) as { count: number }
    ).count;
  return { ...value, create, submitAudits };
}

describe('expense submission blockers', () => {
  it('distinguishes a stale draft from a record another tab already submitted', () => {
    const value = setup();
    const draft = value.create();
    value.repository.updateExpense(value.worker, {
      id: draft.id,
      version: draft.version,
      vendor: 'Updated in another tab',
    });

    expect(() => value.repository.submitExpense(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Expense changed before submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(0);
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(draft.id),
    ).toEqual({
      approval_state: 'draft',
    });

    value.repository.submitExpense(value.worker, draft.id, draft.version + 1);
    expect(value.submitAudits(draft.id)).toBe(1);
    expect(() => value.repository.submitExpense(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Expense is not a draft for submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(1);
  });

  it('identifies the missing required receipt without submitting', () => {
    const value = setup();
    const draft = value.create();
    // Older imported drafts can require a receipt without carrying a committed file.
    value.sqlite.prepare('UPDATE expense SET receipt_required=1 WHERE id=?').run(draft.id);
    expect(() => value.repository.submitExpense(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Expense receipt required for submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(0);
  });

  it('keeps a billing-locked draft blocked even when its version is current', () => {
    const value = setup();
    const draft = value.create();
    value.sqlite.prepare("UPDATE expense SET billing_state='locked' WHERE id=?").run(draft.id);
    expect(() => value.repository.submitExpense(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Expense locked before submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(0);
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(draft.id),
    ).toEqual({
      approval_state: 'draft',
    });
  });

  it('reports ownership to a scoped manager before revealing draft state', () => {
    const value = setup();
    const draft = value.create();
    expect(() => value.repository.submitExpense(value.manager, draft.id, draft.version)).toThrow(
      new AccessDeniedError('Expense ownership required'),
    );
    expect(value.submitAudits(draft.id)).toBe(0);
  });
});
