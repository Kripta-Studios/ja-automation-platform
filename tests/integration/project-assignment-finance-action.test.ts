import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3ValidationError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});
const { projectActions } =
  await import('../../apps/portal/src/lib/server/actions/project-actions.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function fixture(role: 'owner' | 'manager' = 'owner') {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  openPortalRepository.mockReturnValue({
    repository: value.repository,
    v3: value.v3,
    principal:
      role === 'owner'
        ? stepUpB5Principal(value.sqlite, value.owner, 'assignment-finance')
        : value.manager,
    sqlite: {
      close: vi.fn(),
      exec: value.sqlite.exec.bind(value.sqlite),
      prepare: value.sqlite.prepare.bind(value.sqlite),
    },
  });
  return value;
}
function event(form: Record<string, string>) {
  return {
    locals: { correlationId: 'assignment-finance-test' },
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}
function form(projectId: string) {
  return {
    projectId,
    workerId: 'b5-outsider',
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    internalCostHourlyRate: '28.50',
    compensationRate: '20.25',
    compensationBasis: 'hourly',
    financeEffectiveFrom: '2026-10-01',
    financeEffectiveTo: '2026-10-31',
    financeNotes: 'Authorized for October',
  };
}
function count(sqlite: B5LifecycleSecurityFixture['sqlite'], table: string, projectId: string) {
  return (
    sqlite
      .prepare(`SELECT COUNT(*) n FROM ${table} WHERE project_id=? AND worker_id=?`)
      .get(projectId, 'b5-outsider') as { n: number }
  ).n;
}
function assignmentCount(sqlite: B5LifecycleSecurityFixture['sqlite'], projectId: string) {
  return (
    sqlite
      .prepare('SELECT COUNT(*) n FROM project_member WHERE project_id=? AND user_id=?')
      .get(projectId, 'b5-outsider') as { n: number }
  ).n;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('worker assignment finance terms', () => {
  it('requires finance setup through the assignment flow when creating a project with people', async () => {
    const value = fixture();
    const projectForm = {
      clientId: value.client.id,
      costCenterCode: 'QA-INITIAL-WORKER-TERMS-1',
      name: 'Initial worker terms project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      initialWorkerId: '00000000-0000-4000-8000-000000000001',
      initialWorkersStartOn: '2026-10-01',
    };
    expect(await projectActions.createProject(event(projectForm))).toMatchObject({
      status: 400,
      data: {
        code: 'PROJECT_INITIAL_WORKERS_REQUIRE_FINANCE_SETUP',
        messageKey: 'problem.project.initialWorkersRequireFinanceSetup',
        values: {
          initialWorkerIds: ['00000000-0000-4000-8000-000000000001'],
          initialWorkersStartOn: '2026-10-01',
        },
        fieldErrors: {
          initialWorkerIds: ['problem.project.initialWorkersRequireFinanceSetup'],
        },
      },
    });
    expect(
      value.sqlite
        .prepare('SELECT id FROM project WHERE cost_center_code=?')
        .get(projectForm.costCenterCode),
    ).toBeUndefined();
    expect(
      await projectActions.createProject(
        event({
          ...Object.fromEntries(
            Object.entries(projectForm).filter(([key]) => key !== 'initialWorkerId'),
          ),
          costCenterCode: 'QA-INITIAL-WORKER-TERMS-2',
          initialWorkersStartOn: '',
        }),
      ),
    ).toMatchObject({ success: true, messageKey: 'action.projects.projectCreated' });
  }, 90_000);

  it('saves the assignment and two project-currency rules atomically for an owner', async () => {
    const value = fixture();
    const submitted = form(value.project.id);
    submitted.internalCostHourlyRate = '28,50';
    expect(
      await projectActions.assignWorker(event({ ...submitted, currency: 'USD' })),
    ).toMatchObject({
      success: true,
      messageKey: 'action.projects.assignmentCreatedWithFinance',
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(1);
    expect(
      value.sqlite
        .prepare(
          'SELECT currency,hourly_rate_minor,effective_from,effective_to FROM internal_cost_rule WHERE project_id=? AND worker_id=?',
        )
        .get(value.project.id, 'b5-outsider'),
    ).toEqual({
      currency: 'EUR',
      hourly_rate_minor: 2850,
      effective_from: '2026-10-01',
      effective_to: '2026-10-31',
    });
    expect(
      value.sqlite
        .prepare(
          'SELECT currency,rate_minor,rule_type,rate_basis FROM compensation_rule WHERE project_id=? AND worker_id=?',
        )
        .get(value.project.id, 'b5-outsider'),
    ).toEqual({ currency: 'EUR', rate_minor: 2025, rule_type: 'Hourly', rate_basis: 'hourly' });
  });

  it('rejects missing terms with field errors and rolls back the assignment', async () => {
    const value = fixture();
    const submitted = form(value.project.id);
    submitted.compensationRate = '';
    expect(await projectActions.assignWorker(event(submitted))).toMatchObject({
      status: 400,
      data: {
        code: 'ASSIGNMENT_FINANCE_TERMS_REQUIRED',
        values: submitted,
        fieldErrors: { compensationRate: ['problem.assignment.financeTermsRequired'] },
      },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);
    expect(count(value.sqlite, 'internal_cost_rule', value.project.id)).toBe(0);
  });

  it('rejects mixed decimal separators without saving an assignment', async () => {
    const value = fixture();
    const submitted = form(value.project.id);
    submitted.internalCostHourlyRate = '1,000.50';
    expect(await projectActions.assignWorker(event(submitted))).toMatchObject({
      status: 400,
      data: {
        code: 'ASSIGNMENT_FINANCE_TERMS_REQUIRED',
        fieldErrors: { internalCostHourlyRate: ['problem.assignment.financeTermsRequired'] },
      },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);
  });

  it('rejects finance dates that do not cover the assignment', async () => {
    const value = fixture();
    const submitted = form(value.project.id);
    submitted.financeEffectiveTo = '2026-10-30';
    expect(await projectActions.assignWorker(event(submitted))).toMatchObject({
      status: 400,
      data: {
        code: 'ASSIGNMENT_FINANCE_DATES_MISMATCH',
        fieldErrors: { financeEffectiveTo: ['problem.assignment.financeDatesMismatch'] },
      },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);
  });

  it('does not create finance rules for an overlapping assignment', async () => {
    const value = fixture();
    expect(
      await projectActions.assignWorker(
        event({ ...form(value.project.id), workerId: 'b5-worker' }),
      ),
    ).toMatchObject({
      status: 409,
      data: { code: 'PROJECT_ASSIGNMENT_OVERLAP' },
    });
    expect(
      (
        value.sqlite
          .prepare('SELECT COUNT(*) n FROM internal_cost_rule WHERE project_id=? AND worker_id=?')
          .get(value.project.id, 'b5-worker') as { n: number }
      ).n,
    ).toBe(0);
  });

  it('keeps standalone assignment starts inside project dates', async () => {
    const value = fixture();
    value.sqlite
      .prepare('UPDATE project SET planned_end_date=? WHERE id=?')
      .run('2026-10-31', value.project.id);
    const submitted = form(value.project.id);
    submitted.startsOn = '2026-11-01';
    submitted.financeEffectiveFrom = '2026-11-01';
    submitted.endsOn = '2026-11-30';
    submitted.financeEffectiveTo = '2026-11-30';
    expect(await projectActions.assignWorker(event(submitted))).toMatchObject({
      status: 400,
      data: {
        code: 'ASSIGNMENT_START_OUTSIDE_PROJECT_DATES',
        fieldErrors: { startsOn: ['problem.assignment.startOutsideProjectDates'] },
      },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);

    const existing = value.sqlite
      .prepare('SELECT id,version FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, 'b5-worker') as { id: string; version: number };
    expect(
      await projectActions.updateAssignment(
        event({
          assignmentId: existing.id,
          version: String(existing.version),
          startsOn: '2026-11-01',
        }),
      ),
    ).toMatchObject({
      status: 400,
      data: { code: 'ASSIGNMENT_START_OUTSIDE_PROJECT_DATES' },
    });
  });

  it('rolls back the assignment and internal cost if compensation creation fails', async () => {
    const value = fixture();
    vi.spyOn(value.v3, 'createCompensationRule').mockImplementation(() => {
      throw new V3ValidationError('Injected validation failure');
    });
    expect(await projectActions.assignWorker(event(form(value.project.id)))).toMatchObject({
      status: 400,
      data: { code: 'ASSIGNMENT_FINANCE_SAVE_BLOCKED' },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);
    expect(count(value.sqlite, 'internal_cost_rule', value.project.id)).toBe(0);
  });

  it('blocks an uncovered date extension, then accepts staged rules and a covered shortening', async () => {
    const value = fixture();
    expect(await projectActions.assignWorker(event(form(value.project.id)))).toMatchObject({
      success: true,
    });
    const assignment = value.sqlite
      .prepare('SELECT id,version FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, 'b5-outsider') as { id: string; version: number };
    const extension = {
      assignmentId: assignment.id,
      version: String(assignment.version),
      endsOn: '2026-11-30',
    };
    expect(await projectActions.updateAssignment(event(extension))).toMatchObject({
      status: 409,
      data: {
        code: 'ASSIGNMENT_FINANCE_COVERAGE_REQUIRED',
        values: extension,
        remedies: [{ id: 'review_finance_rules', projectId: value.project.id }],
      },
    });
    expect(
      value.sqlite
        .prepare('SELECT ends_on,version FROM project_member WHERE id=?')
        .get(assignment.id),
    ).toEqual({ ends_on: '2026-10-31', version: assignment.version });

    const owner = stepUpB5Principal(value.sqlite, value.owner, 'stage-extension');
    value.v3.createInternalCostRule(owner, {
      workerId: 'b5-outsider',
      projectId: value.project.id,
      currency: 'EUR',
      hourlyRateMinor: 2900n,
      effectiveFrom: '2026-11-01',
      effectiveTo: '2026-11-30',
    });
    value.v3.createCompensationRule(owner, {
      workerId: 'b5-outsider',
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateBasis: 'hourly',
      rateMinor: 2100n,
      effectiveFrom: '2026-11-01',
      effectiveTo: '2026-11-30',
    });
    expect(await projectActions.updateAssignment(event(extension))).toMatchObject({
      success: true,
      messageKey: 'action.projects.assignmentUpdated',
    });
    expect(
      value.sqlite
        .prepare('SELECT ends_on,version FROM project_member WHERE id=?')
        .get(assignment.id),
    ).toEqual({ ends_on: '2026-11-30', version: assignment.version + 1 });
    expect(
      await projectActions.updateAssignment(
        event({
          assignmentId: assignment.id,
          version: String(assignment.version + 1),
          endsOn: '2026-10-15',
        }),
      ),
    ).toMatchObject({ success: true });
    expect(
      value.sqlite.prepare('SELECT ends_on FROM project_member WHERE id=?').get(assignment.id),
    ).toEqual({ ends_on: '2026-10-15' });
  });

  it('blocks a manager without full existing finance coverage and reveals no private terms', async () => {
    const value = fixture('manager');
    expect(await projectActions.assignWorker(event(form(value.project.id)))).toMatchObject({
      status: 409,
      data: {
        code: 'ASSIGNMENT_FINANCE_SETUP_REQUIRED',
        values: {
          projectId: value.project.id,
          workerId: 'b5-outsider',
          startsOn: '2026-10-01',
          endsOn: '2026-10-31',
        },
        remedies: [{ id: 'contact_project_owner' }],
      },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);
    expect(count(value.sqlite, 'internal_cost_rule', value.project.id)).toBe(0);
    expect(count(value.sqlite, 'compensation_rule', value.project.id)).toBe(0);
  });

  it('lets an owner use pre-staged finance rules without creating duplicates', async () => {
    const value = fixture();
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'owner-existing-rules');
    value.v3.createInternalCostRule(owner, {
      workerId: 'b5-outsider',
      projectId: value.project.id,
      currency: 'EUR',
      hourlyRateMinor: 2800n,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    });
    value.v3.createCompensationRule(owner, {
      workerId: 'b5-outsider',
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateBasis: 'hourly',
      rateMinor: 2000n,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    });
    expect(
      await projectActions.assignWorker(
        event({
          projectId: value.project.id,
          workerId: 'b5-outsider',
          startsOn: '2026-10-01',
          endsOn: '2026-10-31',
          useExistingFinanceRules: 'on',
        }),
      ),
    ).toMatchObject({ success: true, messageKey: 'action.projects.assignmentCreated' });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(1);
    expect(count(value.sqlite, 'internal_cost_rule', value.project.id)).toBe(1);
    expect(count(value.sqlite, 'compensation_rule', value.project.id)).toBe(1);
  });

  it('does not create an Owner assignment when selected existing rules are incomplete', async () => {
    const value = fixture();
    const submitted = {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      useExistingFinanceRules: 'on',
    };
    expect(await projectActions.assignWorker(event(submitted))).toMatchObject({
      status: 409,
      data: {
        code: 'ASSIGNMENT_FINANCE_SETUP_REQUIRED',
        remedies: [{ id: 'review_finance_rules', projectId: value.project.id }],
        values: submitted,
      },
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(0);
  });

  it('allows a manager to assign when existing currency-matched rules cover every date', async () => {
    const value = fixture('manager');
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'manager-coverage-seed');
    value.v3.createInternalCostRule(owner, {
      workerId: 'b5-outsider',
      currency: 'EUR',
      hourlyRateMinor: 2800n,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-15',
    });
    value.v3.createInternalCostRule(owner, {
      workerId: 'b5-outsider',
      currency: 'EUR',
      hourlyRateMinor: 3000n,
      effectiveFrom: '2026-10-16',
      effectiveTo: '2026-10-31',
    });
    value.v3.createCompensationRule(owner, {
      workerId: 'b5-outsider',
      currency: 'EUR',
      ruleType: 'Hourly',
      rateBasis: 'hourly',
      rateMinor: 2000n,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    });
    expect(await projectActions.assignWorker(event(form(value.project.id)))).toMatchObject({
      success: true,
      messageKey: 'action.projects.assignmentCreated',
    });
    expect(assignmentCount(value.sqlite, value.project.id)).toBe(1);
    expect(count(value.sqlite, 'internal_cost_rule', value.project.id)).toBe(0);
    expect(count(value.sqlite, 'compensation_rule', value.project.id)).toBe(0);
  });
});
