import { afterEach, describe, expect, it } from 'vitest';
import { _expenseDescriptionDefault } from '../../apps/portal/src/routes/app/api/expenses/description-default/+server.js';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

describe('expense description suggestion', () => {
  it('uses an effective per diem policy only for the authorized assignment and date', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const worker = stepUpB5Principal(value.sqlite, value.worker, 'expense-default-worker');
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'expense-default-owner');
    const scope = {
      projectId: value.project.id,
      workerId: value.worker.userId,
      date: '2026-08-20',
    };

    expect(_expenseDescriptionDefault(value.sqlite, worker, scope)).toBe('Only hours');
    const assignment = value.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, worker.userId) as { id: string };
    value.sqlite
      .prepare(
        `INSERT INTO assignment_expense_policy(id,project_member_id,payer,category,effective_from,
          worker_reimbursement,client_recovery,markup_bps,version,reason,created_by_user_id,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'test-per-diem-policy',
        assignment.id,
        'worker',
        'per_diem',
        '2026-09-01',
        'at_cost',
        'at_cost',
        0,
        1,
        'Test future per diem eligibility',
        owner.userId,
        new Date().toISOString(),
      );
    expect(_expenseDescriptionDefault(value.sqlite, worker, scope)).toBe('Only hours');
    expect(_expenseDescriptionDefault(value.sqlite, worker, { ...scope, date: '2026-10-04' })).toBe(
      'Perdiem',
    );
    expect(_expenseDescriptionDefault(value.sqlite, owner, { ...scope, date: '2026-10-04' })).toBe(
      'Perdiem',
    );
    expect(() =>
      _expenseDescriptionDefault(value.sqlite, worker, {
        ...scope,
        workerId: value.outsider.userId,
      }),
    ).toThrow();
  });
});
