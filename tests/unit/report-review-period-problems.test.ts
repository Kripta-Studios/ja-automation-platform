import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodFollowupAccessDeniedError } from '@ja/database';

const state = vi.hoisted(() => ({
  role: 'project_manager',
  projects: [{ id: 'project-1', project_number: 'P-001', name: 'Test project' }],
  close: vi.fn(),
  prepare: vi.fn((sql: string) => ({
    all: vi.fn(() =>
      sql.includes('FROM project p') ? state.projects : sql.includes('FROM user u') ? [] : [],
    ),
  })),
  reviewProjectPeriod: vi.fn(() => ({ reports: [] })),
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    PeriodFollowupRepository: class {
      assertReviewAccess(principal: { role: string }) {
        if (principal.role === 'worker')
          throw new original.PeriodFollowupAccessDeniedError('Project review role required');
      }
      reviewProjectPeriod(...args: unknown[]) {
        return state.reviewProjectPeriod(...(args as Parameters<typeof state.reviewProjectPeriod>));
      }
    },
  };
});
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: state.role, userId: 'actor-1' },
    sqlite: { prepare: state.prepare, close: state.close },
    repository: { listFinanceProjects: vi.fn(() => state.projects) },
  }),
}));

import { load } from '../../apps/portal/src/routes/app/reports/review/+page.server';

function event(query: string) {
  return {
    locals: {
      user: { id: 'actor-1', role: state.role },
      session: { id: 'session-1' },
      correlationId: 'report-review-request-123',
    },
    url: new URL(`http://localhost/app/reports/review?${query}`),
    cookies: { get: () => null },
  } as never;
}

describe('Report Review period filter problems', () => {
  beforeEach(() => {
    state.role = 'project_manager';
    state.projects = [{ id: 'project-1', project_number: 'P-001', name: 'Test project' }];
    state.close.mockClear();
    state.prepare.mockClear();
    state.reviewProjectPeriod.mockClear();
  });

  it('denies a worker before interpreting malformed filters or reading project options', async () => {
    state.role = 'worker';
    let failure: unknown;
    try {
      await load(event('project=private&from=2026-02-30&to=2026-01-01'));
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toMatchObject({ status: 403 });
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.reviewProjectPeriod).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('retains malformed period and unavailable project without loading report or finance data', async () => {
    const result = await load(
      event('project=private&from=2026-02-30&to=2026-03-01&lang=es&viewportScrollY=456'),
    );
    expect(result).toMatchObject({
      locale: 'es',
      selectedProjectId: 'private',
      periodStart: '2026-02-30',
      periodEnd: '2026-03-01',
      review: null,
      finance: { billing: [], invoices: [] },
      filterProblem: {
        code: 'REPORT_REVIEW_PROJECT_UNAVAILABLE',
        correlationId: 'report-review-request-123',
        fieldErrors: {
          project: ['problem.reports.reviewProjectUnavailable'],
          from: ['problem.reports.reviewPeriodDateInvalid'],
        },
        remedies: [{ id: 'correct_field' }],
      },
    });
    expect(state.reviewProjectPeriod).not.toHaveBeenCalled();
    expect(state.prepare).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['project=project-1&from=2026-02-30&to=2026-03-01', 'REPORT_REVIEW_PERIOD_DATE_INVALID'],
    ['project=project-1&from=2026-03-02&to=2026-03-01', 'REPORT_REVIEW_PERIOD_RANGE_REVERSED'],
    [
      'project=project-1&from=2026-03-01&from=2026-03-02&to=2026-03-31',
      'REPORT_REVIEW_PERIOD_DATE_DUPLICATE',
    ],
    [
      'project=project-1&project=private&from=2026-03-01&to=2026-03-31',
      'REPORT_REVIEW_PROJECT_DUPLICATE',
    ],
    ['from=2026-03-01&to=2026-03-31', 'REPORT_REVIEW_PROJECT_REQUIRED'],
  ])('returns a typed filter failure for %s', async (query, code) => {
    const result = await load(event(query));
    expect(result).toMatchObject({ filterProblem: { code }, review: null });
    expect(state.reviewProjectPeriod).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('continues loading a valid authorized period', async () => {
    const result = await load(event('project=project-1&from=2026-03-01&to=2026-03-31'));
    expect(result).toMatchObject({
      selectedProjectId: 'project-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      filterProblem: null,
      review: { reports: [] },
    });
    expect(state.reviewProjectPeriod).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('refreshes options and retains the period when membership is revoked during review', async () => {
    state.reviewProjectPeriod.mockImplementationOnce(() => {
      state.projects = [];
      throw new PeriodFollowupAccessDeniedError('Project review required');
    });
    const result = await load(
      event('project=project-1&from=2026-03-01&to=2026-03-31&lang=pt&viewportScrollY=398'),
    );
    expect(result).toMatchObject({
      locale: 'pt',
      projects: [],
      selectedProjectId: 'project-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      review: null,
      finance: { billing: [], invoices: [] },
      filterProblem: {
        code: 'REPORT_REVIEW_PROJECT_UNAVAILABLE',
        correlationId: 'report-review-request-123',
        fieldErrors: { project: ['problem.reports.reviewProjectUnavailable'] },
        remedies: [{ id: 'correct_field' }],
      },
    });
    expect(state.prepare).toHaveBeenCalledTimes(2);
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('keeps a session denial when the project disappears during review', async () => {
    state.reviewProjectPeriod.mockImplementationOnce(() => {
      state.projects = [];
      throw new PeriodFollowupAccessDeniedError('Active account required');
    });
    let failure: unknown;
    try {
      await load(event('project=project-1&from=2026-03-01&to=2026-03-31'));
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toMatchObject({
      status: 403,
      body: { message: 'Project review required' },
    });
    expect(state.prepare).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each(['owner_admin', 'finance_admin'])(
    'keeps %s access denials outside project-manager membership recovery',
    async (role) => {
      state.role = role;
      state.reviewProjectPeriod.mockImplementationOnce(() => {
        state.projects = [];
        throw new PeriodFollowupAccessDeniedError('Project review required');
      });
      let failure: unknown;
      try {
        await load(event('project=project-1&from=2026-03-01&to=2026-03-31'));
      } catch (caught) {
        failure = caught;
      }
      expect(failure).toMatchObject({ status: 403 });
      expect(state.prepare).not.toHaveBeenCalled();
      expect(state.close).toHaveBeenCalledOnce();
    },
  );
});
