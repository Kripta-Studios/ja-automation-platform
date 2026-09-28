import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError } from '@ja/database';

const state = vi.hoisted(() => ({
  role: 'owner_admin',
  overview: vi.fn(),
  finance: vi.fn(() => ({ currency: 'EUR', contributionMarginMinor: '100' })),
  close: vi.fn(),
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: state.role, userId: 'user-1' },
    repository: {
      projectOverview: state.overview,
      listBillingRules: () => [],
      listAllWorkers: () => [],
      listLegalEntities: () => [],
      listTaxProfiles: () => [],
    },
    v3: { projectFinance: state.finance },
    sqlite: { close: state.close },
  }),
}));

vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  ProjectBillingSetupRepository: class {
    currentVersion() {
      return 1;
    }
    rulesFingerprint() {
      return 'fingerprint';
    }
    listTemplates() {
      return [];
    }
    peopleReview() {
      return [];
    }
  },
}));

import { load } from '../../apps/portal/src/routes/app/projects/[id]/+page.server';

const projectId = '11111111-1111-4111-8111-111111111111';
const projectOverview = {
  project: { id: projectId, name: 'Test project', currency: 'EUR', timezone: 'Europe/Madrid' },
  workers: [],
  time: [],
  reports: [],
  expenses: [],
  planning: [],
  milestones: [],
  schedule: null,
  actualMinutes: 0,
  // The repository supplies an unfiltered default projection on finance roles.
  // Invalid query periods must never serialize this misleading value.
  financial: { currency: 'EUR', contributionMarginMinor: '999' },
};

function event(query: string) {
  return {
    locals: {
      user: { id: 'user-1', role: state.role, status: 'active' },
      session: { id: 'session-1' },
      correlationId: 'period-request-1',
    },
    params: { id: projectId },
    url: new URL(`http://localhost/j-aautomation/app/projects/${projectId}?${query}`),
  } as never;
}

describe('project detail finance period', () => {
  beforeEach(() => {
    state.role = 'owner_admin';
    state.overview.mockReset().mockReturnValue(projectOverview);
    state.finance.mockClear();
    state.close.mockClear();
  });

  it.each([
    ['periodStart=2026-02-30&periodEnd=2026-03-31&tab=commercial', 'periodStart'],
    ['periodStart=2026-09-01&periodEnd=not-a-date&tab=billing', 'periodEnd'],
  ])('preserves invalid dates and skips finance projection for %s', async (query, field) => {
    const result = await load(event(query));
    expect(result).toMatchObject({
      periodProblem: {
        code: 'PROJECT_DETAIL_PERIOD_DATE_INVALID',
        correlationId: 'period-request-1',
        fieldErrors: { [field]: ['problem.projectDetail.periodDateInvalid'] },
        remedies: [{ id: 'correct_field' }],
      },
      overview: { financial: null },
    });
    expect(result?.periodValues).toMatchObject({
      periodStart: new URL(event(query).url).searchParams.get('periodStart'),
      periodEnd: new URL(event(query).url).searchParams.get('periodEnd'),
    });
    expect(state.overview).toHaveBeenCalledOnce();
    expect(state.overview).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner_admin' }),
      projectId,
      { includeFinance: false },
    );
    expect(state.finance).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('explains duplicate date parameters even when the first displayed dates are valid', async () => {
    const result = await load(
      event('periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30'),
    );
    expect(result).toMatchObject({
      periodValues: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      periodProblem: {
        code: 'PROJECT_DETAIL_PERIOD_DATE_DUPLICATE',
        messageKey: 'problem.projectDetail.periodDateDuplicate',
        fieldErrors: { periodStart: ['problem.projectDetail.periodDateDuplicate'] },
        remedies: [{ id: 'correct_field' }],
      },
      overview: { financial: null },
    });
    expect(state.finance).not.toHaveBeenCalled();
  });

  it('identifies a reversed valid range without calculating misleading finance figures', async () => {
    const result = await load(event('periodStart=2026-09-30&periodEnd=2026-09-01&tab=billing'));
    expect(result).toMatchObject({
      periodValues: { periodStart: '2026-09-30', periodEnd: '2026-09-01' },
      periodProblem: {
        code: 'PROJECT_DETAIL_PERIOD_RANGE_REVERSED',
        messageKey: 'problem.projectDetail.periodRangeReversed',
        fieldErrors: { periodEnd: ['problem.projectDetail.periodRangeReversed'] },
      },
      overview: { financial: null },
    });
    expect(state.finance).not.toHaveBeenCalled();
  });

  it('checks object access before providing malformed-period guidance', async () => {
    state.role = 'project_manager';
    state.overview.mockImplementationOnce(() => {
      throw new AccessDeniedError('Project assignment access required');
    });
    expect(() => load(event('periodStart=2026-02-30&periodEnd=2026-09-30'))).toThrowError(
      expect.objectContaining({ status: 403, body: { message: 'detail.project.forbidden' } }),
    );
    expect(state.finance).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each(['project_manager', 'worker'])('does not expose finance guidance to %s', async (role) => {
    state.role = role;
    const result = await load(event('periodStart=2026-02-30&periodEnd=2026-09-30'));
    expect(result).toMatchObject({
      periodProblem: null,
      billingSetup: null,
      overview: { financial: null },
    });
    expect(state.finance).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('retains the valid period and calculates only its authorized projection', async () => {
    const result = await load(event('periodStart=2026-09-01&periodEnd=2026-09-30'));
    expect(result).toMatchObject({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      periodProblem: null,
      overview: { financial: { contributionMarginMinor: '100' } },
    });
    expect(state.finance).toHaveBeenCalledOnce();
    expect(state.finance).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner_admin' }),
      projectId,
      '2026-09-01',
      '2026-09-30',
    );
  });
});
