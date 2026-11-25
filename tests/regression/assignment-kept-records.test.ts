import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError } from '@ja/database';
import { resolveAssignmentCommercialTerms } from '../../packages/database/src/domains/commercial/assignment-commercial-terms.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

/**
 * Owner decision 2026-11-25: assignment dates may move away from approved or invoiced
 * time and expenses. Those records stay paid and billed at the terms of the period they
 * were recorded under (an ended history assignment), so pay, settlements and invoice
 * readiness never report a missing compensation rule for them.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'kept-owner');
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'kept-finance');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'kept-worker');
  f.v3.createCompensationRule(finance, {
    workerId: 'b5-worker',
    projectId: f.project.id,
    currency: 'EUR',
    ruleType: 'Hourly',
    rateMinor: 5_000n,
    rateBasis: 'hourly',
    effectiveFrom: '2026-01-01',
  } as never);
  const assignment = () =>
    f.sqlite
      .prepare(
        "SELECT id,version,status,starts_on,ends_on FROM project_member WHERE user_id='b5-worker' AND status='active' LIMIT 1",
      )
      .get() as { id: string; version: number; status: string; starts_on: string; ends_on: string | null };
  const hours = (workDate: string, state: string) => {
    const entry = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate,
      category: 'regular',
      minutes: 120,
      summary: `Hours on ${workDate}`,
    }) as { id: string };
    f.sqlite.prepare('UPDATE time_entry SET approval_state=? WHERE id=?').run(state, entry.id);
    return entry.id;
  };
  return { f, owner, assignment, hours };
}

describe('assignment dates that leave approved records outside', () => {
  it('previews the kept records, saves, and keeps them at the previous terms', () => {
    const { f, owner, assignment, hours } = setup();
    hours('2026-02-02', 'approved');
    const row = assignment();
    expect(
      f.repository.previewAssignmentDates(owner, row.id, { startsOn: '2026-03-01' }),
    ).toMatchObject({ blockedByRecords: false, keptApprovedRecords: 1 });
    f.repository.updateAssignment(owner, row.id, { startsOn: '2026-03-01', version: row.version });
    expect(assignment()).toMatchObject({ starts_on: '2026-03-01', status: 'active' });
    const history = f.sqlite
      .prepare(
        "SELECT id,status,starts_on,ends_on,can_review FROM project_member WHERE user_id='b5-worker' AND id<>?",
      )
      .get(row.id);
    expect(history).toMatchObject({
      status: 'inactive',
      starts_on: '2026-02-02',
      ends_on: '2026-02-02',
      can_review: 0,
    });
    // Rate resolution, My Pay / Owner pay: still the previous assignment's terms.
    const terms = resolveAssignmentCommercialTerms(f.sqlite, {
      projectId: f.project.id,
      workerId: 'b5-worker',
      workDate: '2026-02-02',
      category: 'regular',
    });
    expect(terms.issues.filter((item) => item.code === 'missing_assignment')).toEqual([]);
    expect(terms.workerCompensation).not.toBeNull();
    const pay = f.v3.ownerWorkerPay(owner, 'b5-worker', '2026-02-01', '2026-02-28') as {
      missingCompensationRules?: number;
    };
    expect(pay.missingCompensationRules ?? 0).toBe(0);
    // Audited on both rows.
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_event WHERE action='assignment.update' AND entity_id=? AND metadata_json LIKE '%keptApprovedRecords%'",
        )
        .get(row.id),
    ).toEqual({ n: 1 });
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_event WHERE action='assignment.create' AND metadata_json LIKE '%historyOf%'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });

  it('lets an assignment end before approved hours (removal) and keeps them payable', () => {
    const { f, owner, assignment, hours } = setup();
    hours('2026-04-10', 'approved');
    const row = assignment();
    expect(
      f.repository.previewAssignmentRemoval(owner, row.id, { endsOn: '2026-04-01' }),
    ).toMatchObject({ blockedByRecords: false, keptApprovedRecords: 1 });
    f.repository.removeAssignment(owner, row.id, {
      endsOn: '2026-04-01',
      reason: 'Assignment finished earlier',
      version: row.version,
    });
    const pay = f.v3.ownerWorkerPay(owner, 'b5-worker', '2026-04-01', '2026-04-30') as {
      missingCompensationRules?: number;
    };
    expect(pay.missingCompensationRules ?? 0).toBe(0);
    // The history row gives no access: the worker cannot log a new day there.
    const worker = stepUpB5Principal(f.sqlite, f.worker, 'kept-worker-2');
    expect(() =>
      f.repository.createTimeEntry(worker, {
        projectId: f.project.id,
        workDate: '2026-04-10',
        category: 'travel',
        minutes: 30,
        summary: 'New hours after the end',
      }),
    ).toThrow();
  });

  it('still refuses when unapproved expenses or reports fall outside', () => {
    const { f, owner, assignment } = setup();
    const worker = stepUpB5Principal(f.sqlite, f.worker, 'kept-worker-3');
    f.repository.createExpense(worker, {
      projectId: f.project.id,
      spentOn: '2026-02-03',
      vendor: 'Shop',
      category: 'fuel',
      description: 'Fuel',
      currency: 'EUR',
      amountMinor: 1_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    } as never);
    const row = assignment();
    expect(() =>
      f.repository.updateAssignment(owner, row.id, { startsOn: '2026-03-01', version: row.version }),
    ).toThrow(ConflictError);
  });
});
