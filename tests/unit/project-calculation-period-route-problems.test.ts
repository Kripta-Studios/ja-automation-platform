import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';

const state = vi.hoisted(() => ({
  role: 'owner_admin',
  assertSession: vi.fn(),
  overview: vi.fn(),
  finance: vi.fn(() => ({ currency: 'EUR', contributionMarginMinor: '100' })),
  explain: vi.fn(() => ({ project: { id: 'project-1', name: 'Test' }, people: [] })),
  close: vi.fn(),
  events: [] as string[],
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: state.role, userId: 'user-1', sessionId: 'session-1' },
    repository: { projectOverview: state.overview },
    v3: { projectFinance: state.finance },
    sqlite: { close: state.close },
  }),
}));

vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  assertLiveSession: state.assertSession,
  projectPeriodExplanation: state.explain,
}));

import { load } from '../../apps/portal/src/routes/app/projects/[id]/calculation/+page.server';

const projectId = '11111111-1111-4111-8111-111111111111';

function event(query: string, localRole = 'owner_admin') {
  return {
    locals: {
      user: { id: 'user-1', role: localRole, status: 'active' },
      session: { id: 'session-1' },
      correlationId: 'calculation-request-1',
    },
    params: { id: projectId },
    url: new URL(`http://localhost/j-aautomation/app/projects/${projectId}/calculation?${query}`),
  } as never;
}

describe('project calculation period', () => {
  beforeEach(() => {
    state.role = 'owner_admin';
    state.events.length = 0;
    state.assertSession.mockReset().mockImplementation(() => state.events.push('session'));
    state.overview.mockReset().mockImplementation(() => {
      state.events.push('overview');
      return {
        project: {
          id: projectId,
          project_number: 'QA-42',
          name: 'Test project',
          currency: 'EUR',
        },
      };
    });
    state.finance.mockReset().mockImplementation(() => {
      state.events.push('finance');
      return { currency: 'EUR', contributionMarginMinor: '100' };
    });
    state.explain.mockReset().mockImplementation(() => {
      state.events.push('explanation');
      return { project: { id: projectId, name: 'Test project' }, people: [] };
    });
    state.close.mockClear();
  });

  it.each([
    ['periodStart=2026-02-30&periodEnd=2026-03-31&lang=es', 'periodStart'],
    ['periodStart=2026-09-01&periodEnd=bad&lang=pt', 'periodEnd'],
  ])('keeps invalid period values and skips finance for %s', (query, field) => {
    const result = load(event(query));
    expect(result).toMatchObject({
      periodProblem: {
        code: 'PROJECT_CALCULATION_PERIOD_DATE_INVALID',
        messageKey: 'problem.projectCalculation.periodDateInvalid',
        correlationId: 'calculation-request-1',
        fieldErrors: { [field]: ['problem.projectCalculation.periodDateInvalid'] },
        remedies: [{ id: 'correct_field' }],
      },
      explanation: null,
    });
    expect(result?.periodValues).toMatchObject({
      periodStart: event(query).url.searchParams.get('periodStart'),
      periodEnd: event(query).url.searchParams.get('periodEnd'),
    });
    expect(state.overview).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner_admin' }),
      projectId,
      { includeFinance: false },
    );
    expect(state.events).toEqual(['session', 'overview']);
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('reports duplicate dates even when the first values are valid', () => {
    const result = load(
      event('periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30'),
    );
    expect(result).toMatchObject({
      periodValues: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      periodProblem: {
        code: 'PROJECT_CALCULATION_PERIOD_DATE_DUPLICATE',
        messageKey: 'problem.projectCalculation.periodDateDuplicate',
        fieldErrors: { periodStart: ['problem.projectCalculation.periodDateDuplicate'] },
      },
      explanation: null,
    });
    expect(state.events).toEqual(['session', 'overview']);
  });

  it('reports the reversed end date without calculating another period', () => {
    const result = load(event('periodStart=2026-09-30&periodEnd=2026-09-01'));
    expect(result).toMatchObject({
      periodValues: { periodStart: '2026-09-30', periodEnd: '2026-09-01' },
      periodProblem: {
        code: 'PROJECT_CALCULATION_PERIOD_RANGE_REVERSED',
        messageKey: 'problem.projectCalculation.periodRangeReversed',
        fieldErrors: { periodEnd: ['problem.projectCalculation.periodRangeReversed'] },
      },
      explanation: null,
    });
    expect(state.events).toEqual(['session', 'overview']);
  });

  it('checks live session before reading project or interpreting invalid dates', () => {
    state.assertSession.mockImplementationOnce(() => {
      throw new AccessDeniedError('Stale session');
    });
    expect(() => load(event('periodStart=2026-02-30&periodEnd=2026-09-30'))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(state.overview).not.toHaveBeenCalled();
    expect(state.events).toEqual([]);
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('checks live role before project access or period interpretation', () => {
    state.role = 'worker';
    expect(() => load(event('periodStart=2026-02-30&periodEnd=2026-09-30'))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(state.events).toEqual(['session']);
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('checks project access before providing malformed-period guidance', () => {
    state.overview.mockImplementationOnce(() => {
      throw new AccessDeniedError('Project access required');
    });
    expect(() => load(event('periodStart=2026-02-30&periodEnd=2026-09-30'))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(state.finance).not.toHaveBeenCalled();
    expect(state.explain).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('maps an absent project to 404 without date guidance', () => {
    state.overview.mockImplementationOnce(() => {
      throw new ValidationError('Project not found');
    });
    expect(() => load(event('periodStart=2026-02-30&periodEnd=2026-09-30'))).toThrowError(
      expect.objectContaining({ status: 404 }),
    );
    expect(state.finance).not.toHaveBeenCalled();
    expect(state.explain).not.toHaveBeenCalled();
  });

  it('keeps a valid period and calculates only its authorized explanation', () => {
    const result = load(event('periodStart=2026-09-01&periodEnd=2026-09-30'));
    expect(result).toMatchObject({
      periodValues: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      periodProblem: null,
      explanation: { project: { id: projectId, name: 'Test project' } },
    });
    expect(state.finance).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner_admin' }),
      projectId,
      '2026-09-01',
      '2026-09-30',
    );
    expect(state.explain).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 'owner_admin' }),
      expect.objectContaining({
        projectId,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      }),
    );
    expect(state.events).toEqual(['session', 'overview', 'finance', 'explanation']);
  });
});
