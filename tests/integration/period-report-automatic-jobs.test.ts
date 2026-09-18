import { beforeEach, describe, expect, it, vi } from 'vitest';

const openPortalRepository = vi.fn();
const runArtifactJobs = vi.fn();

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));
vi.mock('$lib/server/artifact-jobs', () => ({ runArtifactJobs }));

const { actions } =
  await import('../../apps/portal/src/routes/app/reports/period/[id]/+page.server.ts');
const { reportActions } =
  await import('../../apps/portal/src/lib/server/actions/operations-actions.ts');

describe('period report artifact automation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['detail', 'queued', true],
    ['detail', 'claimed', false],
    ['detail', 'succeeded', false],
    ['index', 'queued', true],
    ['index', 'claimed', false],
    ['index', 'succeeded', false],
  ] as const)(
    '%s refresh returns the actual %s durable state',
    async (surface, jobState, jobCreated) => {
      const refreshAndQueuePeriodReports = vi.fn(() => ({
        reports: [{ id: 'period-report-1' }],
        jobId: 'job-1',
        jobCreated,
        jobState,
        retryOfJobId: null,
      }));
      const close = vi.fn();
      openPortalRepository.mockReturnValue({
        principal: { userId: 'finance-1', role: 'finance_admin', projectIds: new Set<string>() },
        v3: { refreshAndQueuePeriodReports },
        sqlite: { close },
      });

      const request = new Request('http://localhost/reports/period/period-report-1?/refresh', {
        method: 'POST',
        body: new URLSearchParams({
          projectId: '11111111-1111-4111-8111-111111111111',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reportLocale: 'en',
        }),
      });
      const refresh = surface === 'detail' ? actions.refresh : reportActions.generatePeriodReports;
      if (!refresh) throw new Error('Expected the period report refresh action');

      const result = await refresh({
        locals: { user: { id: 'finance-1', role: 'finance_admin' } },
        request,
        params: { id: 'period-report-1', section: 'reports' },
      } as never);

      expect(refreshAndQueuePeriodReports).toHaveBeenCalledOnce();
      expect(refreshAndQueuePeriodReports).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'finance-1' }),
        {
          projectId: '11111111-1111-4111-8111-111111111111',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reportLocale: 'en',
          contentMode: 'hours_activity_all_technical',
          technicalReportIds: [],
        },
      );
      expect(runArtifactJobs).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        success: true,
        messageKey: 'action.reports.periodReportsRefreshed',
        messageParams: {
          [surface === 'detail' ? 'reports' : 'reportCount']: 1,
          jobId: 'job-1',
          jobCreated,
          jobState,
        },
      });
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('wires strict optimistic period-report approval to the public domain command', async () => {
    const approvePeriodReport = vi.fn(() => ({
      id: 'period-report-1',
      state: 'approved',
      snapshotVersion: 3,
      snapshotSha256: 'a'.repeat(64),
      approvedAt: '2026-08-25T08:00:00.000Z',
      changed: true,
    }));
    const close = vi.fn();
    const principal = {
      userId: 'manager-1',
      role: 'project_manager',
      projectIds: new Set(['project-1']),
    };
    openPortalRepository.mockReturnValue({
      principal,
      v3: { approvePeriodReport },
      sqlite: { close },
    });
    const approve = actions.approve;
    if (!approve) throw new Error('Expected the period report approval action');
    const result = await approve({
      locals: { user: { id: 'manager-1', role: 'project_manager' } },
      request: new Request('http://localhost/reports/period/period-report-1?/approve', {
        method: 'POST',
        body: new URLSearchParams({
          expectedSnapshotVersion: '3',
          expectedSnapshotSha256: 'a'.repeat(64),
        }),
      }),
      params: { id: 'period-report-1' },
    } as never);

    expect(approvePeriodReport).toHaveBeenCalledWith(principal, {
      periodReportId: 'period-report-1',
      expectedSnapshotVersion: 3,
      expectedSnapshotSha256: 'a'.repeat(64),
    });
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.reports.periodReportApproved',
      messageParams: { reportId: 'period-report-1', snapshotVersion: 3 },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects approval overposting before opening the repository', async () => {
    const approve = actions.approve;
    if (!approve) throw new Error('Expected the period report approval action');
    const result = await approve({
      locals: { user: { id: 'manager-1', role: 'project_manager' } },
      request: new Request('http://localhost/reports/period/period-report-1?/approve', {
        method: 'POST',
        body: new URLSearchParams({
          expectedSnapshotVersion: '3',
          expectedSnapshotSha256: 'a'.repeat(64),
          clientRateMinor: '999999',
        }),
      }),
      params: { id: 'period-report-1' },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: { messageKey: 'action.validation.periodReportApproval' },
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
