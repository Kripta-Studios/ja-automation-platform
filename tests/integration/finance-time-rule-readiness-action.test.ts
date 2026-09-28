import { afterEach, describe, expect, it, vi } from 'vitest';
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
const { approvalActions } =
  await import('../../apps/portal/src/lib/server/actions/approval-actions.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'finance-time-readiness');
  const entry = fixture.repository.createTimeEntry(fixture.worker, {
    projectId: fixture.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes: 480,
    summary: 'Approved work awaiting Finance review',
  });
  fixture.repository.submitTime(fixture.worker, entry.id, entry.version);
  fixture.repository.operationalApproveTime(fixture.manager, entry.id, 'approved');
  openPortalRepository.mockReturnValue({
    repository: fixture.repository,
    principal: finance,
    sqlite: {
      prepare: fixture.sqlite.prepare.bind(fixture.sqlite),
      exec: fixture.sqlite.exec.bind(fixture.sqlite),
      close: vi.fn(),
    },
  });
  const event = () =>
    ({
      params: { section: 'approvals' },
      request: new Request('http://localhost/app/approvals?/financeApprove', {
        method: 'POST',
        body: new URLSearchParams({ type: 'time', id: entry.id, billable: 'yes' }),
      }),
      locals: { user: { id: finance.userId }, correlationId: 'finance-rule-readiness-test' },
    }) as never;
  const approved = () =>
    fixture.sqlite
      .prepare('SELECT finance_approved_at FROM time_entry WHERE id=?')
      .get(entry.id) as {
      finance_approved_at: string | null;
    };
  return { fixture, finance, entry, event, approved };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  vi.clearAllMocks();
});

describe('Finance review needs worker cost and compensation', () => {
  it('retains approved time and names the missing terms with a project-scoped remedy', async () => {
    const { fixture, entry, event, approved } = setup();
    expect(await approvalActions.financeApprove(event())).toMatchObject({
      status: 409,
      data: {
        code: 'FINANCE_REVIEW_COST_AND_COMPENSATION_REQUIRED',
        messageKey: 'problem.approval.timeCostAndCompensationRequired',
        messageParams: {
          workerName: expect.any(String),
          projectName: expect.any(String),
          workDate: '2026-08-20',
        },
        remedies: [{ id: 'review_finance_rules', projectId: fixture.project.id }],
      },
    });
    expect(approved().finance_approved_at).toBeNull();
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(entry.id),
    ).toEqual({ approval_state: 'approved' });
  });

  it('approves only after both project-currency rules cover the work date', async () => {
    const { fixture, finance, event, approved } = setup();
    fixture.v3.createInternalCostRule(finance, {
      workerId: fixture.worker.userId,
      projectId: fixture.project.id,
      currency: 'EUR',
      hourlyRateMinor: 2800n,
      effectiveFrom: '2026-08-20',
      effectiveTo: '2026-08-20',
    });
    expect(await approvalActions.financeApprove(event())).toMatchObject({
      status: 409,
      data: { code: 'FINANCE_REVIEW_COMPENSATION_REQUIRED' },
    });
    expect(approved().finance_approved_at).toBeNull();
    fixture.v3.createCompensationRule(finance, {
      workerId: fixture.worker.userId,
      projectId: fixture.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateBasis: 'hourly',
      rateMinor: 2000n,
      effectiveFrom: '2026-08-20',
      effectiveTo: '2026-08-20',
    });
    expect(await approvalActions.financeApprove(event())).toMatchObject({
      success: true,
      messageKey: 'action.approval.financeReviewRecorded',
    });
    expect(approved().finance_approved_at).not.toBeNull();
  });
});
