import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3AccessDeniedError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

const { load } = await import('../../apps/portal/src/routes/app/manage/worker-pay/+page.server.ts');
const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  openPortalRepository.mockReset();
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function routeContext(
  value: B5LifecycleSecurityFixture,
  principal: { userId: string; role: string; sessionId?: string },
) {
  // A real SQLite handle has prototype methods, so expose them explicitly in the route stub.
  openPortalRepository.mockReturnValue({
    sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
    principal,
    v3: value.v3,
  });
}

async function request(
  value: B5LifecycleSecurityFixture,
  principal: { userId: string; role: string; sessionId?: string },
  query = '',
) {
  routeContext(value, principal);
  return load({
    locals: {
      user: { id: principal.userId, role: principal.role },
      session: { id: principal.sessionId },
    },
    url: new URL(`http://localhost/j-aautomation/app/manage/worker-pay${query}`),
  } as never);
}

describe('Owner worker pay review', () => {
  it('matches each worker self projection and keeps approved and pending amounts separate', async () => {
    const value = fixture();
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'owner-pay');
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'owner-pay');
    const second = value.outsider;
    value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: second.userId,
      startsOn: '2026-01-01',
    });
    const firstRule = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      effectiveFrom: '2026-01-01',
    });
    const secondRule = value.v3.createCompensationRule(finance, {
      workerId: second.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 1_250n,
      effectiveFrom: '2026-01-01',
    });
    const approved = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-05',
      category: 'regular',
      minutes: 60,
      summary: 'Worker one approved source',
    });
    value.repository.submitTime(value.worker, approved.id, approved.version);
    value.repository.operationalApproveTime(value.manager, approved.id, 'approved');
    value.repository.financeApproveTime(finance, approved.id, true);
    value.repository.createTimeEntry(second, {
      projectId: value.project.id,
      workDate: '2026-08-06',
      category: 'regular',
      minutes: 60,
      summary: 'Worker two pending source',
    });
    const firstExpense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-07',
      vendor: 'Worker one travel',
      category: 'travel',
      description: 'Own reimbursement',
      currency: 'EUR',
      amountMinor: 333n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    const secondExpense = value.repository.createExpense(second, {
      projectId: value.project.id,
      spentOn: '2026-08-07',
      vendor: 'Worker two travel',
      category: 'travel',
      description: 'Separate reimbursement',
      currency: 'EUR',
      amountMinor: 444n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    value.sqlite
      .prepare('UPDATE expense SET expense_policy_required=0 WHERE id IN (?,?)')
      .run(firstExpense.id, secondExpense.id);
    const now = new Date().toISOString();
    for (const [id, workerId, ruleId, amountMinor] of [
      ['owner-pay-first-settlement', value.worker.userId, firstRule.id, 6_000],
      ['owner-pay-second-settlement', second.userId, secondRule.id, 1_250],
    ] as const)
      value.sqlite
        .prepare(
          `INSERT INTO compensation_settlement(
          id,worker_id,project_id,compensation_rule_id,period_start,period_end,
          source_basis,source_amount_minor,amount_minor,currency,state,settled_at,
          created_at,updated_at
        ) VALUES(?,?,?,?,?,?,'approved_labor',?,?,'EUR','settled',?,?,?)`,
        )
        .run(
          id,
          workerId,
          value.project.id,
          ruleId,
          '2026-08-01',
          '2026-08-31',
          amountMinor,
          amountMinor,
          now,
          now,
          now,
        );
    const range = '&start=2026-08-01&end=2026-08-31';
    const first = (await request(
      value,
      owner,
      `?worker=${value.worker.userId}${range}`,
    )) as Awaited<ReturnType<typeof load>> & {
      pay: { estimatedApprovedMinor: string; estimatedPendingMinor: string };
      activities: Array<Record<string, unknown>>;
      expenses: Array<Record<string, unknown>>;
      settlements: Array<Record<string, unknown>>;
    };
    const secondView = (await request(
      value,
      owner,
      `?worker=${second.userId}${range}`,
    )) as typeof first;
    expect(first.pay).toEqual(value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31'));
    expect(secondView.pay).toEqual(value.v3.workerPay(second, '2026-08-01', '2026-08-31'));
    expect(first.pay.estimatedApprovedMinor).toBe('6000');
    expect(first.pay.estimatedPendingMinor).toBe('0');
    expect(secondView.pay.estimatedApprovedMinor).toBe('0');
    expect(secondView.pay.estimatedPendingMinor).toBe('1250');
    expect(JSON.stringify(first.activities)).toContain('Worker one approved source');
    expect(JSON.stringify(first.activities)).not.toContain('Worker two pending source');
    expect(JSON.stringify(secondView.activities)).toContain('Worker two pending source');
    expect(JSON.stringify(secondView.activities)).not.toContain('Worker one approved source');
    expect(JSON.stringify(first.expenses)).toContain('Worker one travel');
    expect(JSON.stringify(first.expenses)).not.toContain('Worker two travel');
    expect(JSON.stringify(secondView.expenses)).toContain('Worker two travel');
    expect(first.settlements).toHaveLength(1);
    expect(secondView.settlements).toHaveLength(1);
    expect(first.settlements[0]).toMatchObject({
      amountMinor: '6000',
      remainingAmountMinor: '6000',
    });
    expect(secondView.settlements[0]).toMatchObject({
      amountMinor: '1250',
      remainingAmountMinor: '1250',
    });
    expect(first.settlements[0]).not.toHaveProperty('workerId');
    expect(JSON.stringify(first)).not.toMatch(
      /clientRateMinor|internalCostMinor|contributionMarginMinor/,
    );
  });

  it('denies every lower role before exposing selector or validating a target', async () => {
    const value = fixture();
    seedB5User(value.sqlite, 'b5-auditor', 'auditor_read_only');
    const targets = [
      value.finance,
      value.manager,
      value.worker,
      value.outsider,
      { userId: 'b5-auditor', role: 'auditor_read_only' as const, projectIds: new Set<string>() },
    ];
    for (const target of targets) {
      const principal = stepUpB5Principal(value.sqlite, target, `denied-${target.userId}`);
      await expect(request(value, principal, '?worker=guessed-private-id')).rejects.toMatchObject({
        status: 403,
      });
      expect(() =>
        value.v3.ownerWorkerPay(principal, value.worker.userId, '2026-08-01', '2026-08-31'),
      ).toThrow(V3AccessDeniedError);
    }
    const workerSession = stepUpB5Principal(value.sqlite, value.worker, 'role-spoof');
    expect(() =>
      value.v3.ownerWorkerPay(
        { ...workerSession, role: 'owner_admin' },
        value.worker.userId,
        '2026-08-01',
        '2026-08-31',
      ),
    ).toThrow(V3AccessDeniedError);
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'invalid-target');
    await expect(request(value, owner, '?worker=guessed-private-id')).rejects.toMatchObject({
      status: 400,
    });
    await expect(request(value, owner, '?worker=b5-worker&start=2026-02-30')).rejects.toMatchObject(
      { status: 400 },
    );
  });
});
