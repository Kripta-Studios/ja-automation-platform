import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  AssignmentExpensePolicyRepository,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const finance = stepUpB5Principal(value.sqlite, value.finance, 'expense-policy');
  const policy = new AssignmentExpensePolicyRepository(value.sqlite);
  const member = value.sqlite
    .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
    .get(value.project.id, value.worker.userId) as { id: string };
  return { ...value, finance, policy, memberId: member.id };
}

describe('per-assignment expense policy', () => {
  it('keeps worker reimbursement and customer recovery independent by payer and category', () => {
    const value = fixture();
    const input = {
      projectMemberId: value.memberId,
      effectiveFrom: '2026-08-01',
      reason: 'Configured explicit assignment expense treatment',
    } as const;
    expect(() =>
      value.policy.create(value.worker, {
        ...input,
        payer: 'worker',
        category: 'hotel',
        workerReimbursement: 'at_cost',
        clientRecovery: 'at_cost',
      }),
    ).toThrow(AccessDeniedError);
    const reimbursed = value.policy.create(value.finance, {
      ...input,
      payer: 'worker',
      category: 'hotel',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
    });
    const included = value.policy.create(value.finance, {
      ...input,
      payer: 'worker',
      category: 'meals',
      workerReimbursement: 'none',
      clientRecovery: 'included',
    });
    value.policy.create(value.finance, {
      ...input,
      payer: 'company_direct',
      category: 'hotel',
      workerReimbursement: 'none',
      clientRecovery: 'included',
    });
    const create = (category: string, whoPaid: 'worker' | 'company_direct', amountMinor: bigint) =>
      value.repository.createExpense(value.worker, {
        projectId: value.project.id,
        spentOn: '2026-08-20',
        vendor: 'Policy test',
        category,
        description: 'Expense terms are independently configured',
        currency: 'EUR',
        amountMinor,
        whoPaid,
        receiptRequired: false,
      });
    const hotel = create('hotel', 'worker', 4000n);
    const meal = create('meals', 'worker', 2500n);
    const company = create('hotel', 'company_direct', 6000n);
    expect(value.policy.preview(value.finance, hotel.id)).toMatchObject({
      policy: { id: reimbursed.id },
      issues: [],
      workerReimbursementMinor: '4000',
      clientRecoveryMinor: '4000',
    });
    expect(value.policy.preview(value.finance, meal.id)).toMatchObject({
      policy: { id: included.id },
      issues: [],
      workerReimbursementMinor: '0',
      clientRecoveryMinor: '0',
    });
    expect(value.policy.preview(value.finance, company.id)).toMatchObject({
      issues: [],
      workerReimbursementMinor: '0',
      clientRecoveryMinor: '0',
    });
    expect(value.policy.listForProject(value.finance, value.project.id)).toHaveLength(3);
    expect(() => value.policy.listForProject(value.worker, value.project.id)).toThrow(
      AccessDeniedError,
    );
    expect(() =>
      value.sqlite
        .prepare('UPDATE assignment_expense_policy SET markup_bps=1 WHERE id=?')
        .run(reimbursed.id),
    ).toThrow(/immutable/u);
  });

  it('reports missing terms, rejects duplicate effective starts and preserves historical selection', () => {
    const value = fixture();
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-20',
      vendor: 'Unconfigured test',
      category: 'fuel',
      description: 'Recorded before commercial policy exists',
      currency: 'EUR',
      amountMinor: 1500n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    expect(value.policy.preview(value.finance, expense.id).issues).toEqual(['missing_policy']);
    const base = {
      projectMemberId: value.memberId,
      payer: 'worker' as const,
      category: 'fuel',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'none' as const,
      clientRecovery: 'non_billable' as const,
      reason: 'First fuel terms',
    };
    const first = value.policy.create(value.finance, base);
    expect(() => value.policy.create(value.finance, base)).toThrow(ConflictError);
    const successor = value.policy.create(value.finance, {
      ...base,
      effectiveFrom: '2026-09-01',
      reason: 'Future fuel terms',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
    });
    expect(value.policy.preview(value.finance, expense.id).policy?.id).toBe(first.id);
    expect(
      value.policy.resolve({
        projectId: value.project.id,
        workerId: value.worker.userId,
        spentOn: '2026-09-20',
        category: 'fuel',
        whoPaid: 'worker',
      }).policy?.id,
    ).toBe(successor.id);
    expect(() =>
      value.policy.create(value.finance, {
        ...base,
        payer: 'company_direct',
        workerReimbursement: 'at_cost',
      }),
    ).toThrow(ValidationError);
    value.policy.create(value.finance, {
      ...base,
      category: 'parking',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    });
    expect(() =>
      value.policy.create(value.finance, {
        ...base,
        category: 'parking',
        effectiveFrom: '2026-10-15',
        effectiveTo: '2026-11-15',
      }),
    ).toThrow(ConflictError);
  });

  it('requires an explicit end for policies on bounded assignments', () => {
    const value = fixture();
    value.sqlite
      .prepare('UPDATE project_member SET ends_on=? WHERE id=?')
      .run('2026-10-31', value.memberId);
    expect(() =>
      value.policy.create(value.finance, {
        projectMemberId: value.memberId,
        payer: 'worker',
        category: 'parking',
        effectiveFrom: '2026-08-01',
        workerReimbursement: 'none',
        clientRecovery: 'included',
        reason: 'Bounded team assignment expense rule',
      }),
    ).toThrow(ValidationError);
    expect(
      value.policy.create(value.finance, {
        projectMemberId: value.memberId,
        payer: 'worker',
        category: 'parking',
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-10-31',
        workerReimbursement: 'none',
        clientRecovery: 'included',
        reason: 'Bounded team assignment expense rule',
      }).effectiveTo,
    ).toBe('2026-10-31');
  });
});
