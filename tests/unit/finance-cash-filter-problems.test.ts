import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'finance_admin',
  sessionExpiry: '2099-01-01T00:00:00.000Z',
  close: vi.fn(),
  listFinanceProjects: vi.fn(() => [
    {
      id: 'project-1',
      project_number: 'P-001',
      name: 'Test project',
      currency: 'EUR',
    },
  ]),
  readCashMovements: vi.fn(() => []),
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: state.role, userId: 'actor-1', sessionId: 'session-1' },
    sqlite: {
      prepare: () => ({ get: () => ({ expires_at: state.sessionExpiry }) }),
      close: state.close,
    },
    repository: { listFinanceProjects: state.listFinanceProjects },
  }),
}));
vi.mock('$lib/server/cash-calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/cash-calendar')>()),
  readCashMovements: state.readCashMovements,
}));

import { load } from '../../apps/portal/src/routes/app/finance/cash/+page.server';

function event(query: string) {
  return {
    locals: {
      user: { id: 'actor-1' },
      session: { id: 'session-1' },
      correlationId: 'cash-request-123',
    },
    url: new URL(`http://localhost/app/finance/cash?${query}`),
  } as never;
}

async function failureFor(query: string): Promise<unknown> {
  try {
    await load(event(query));
  } catch (caught) {
    return caught;
  }
  throw new Error('Expected cash route to deny access');
}

describe('Finance Cash filter problems', () => {
  beforeEach(() => {
    state.role = 'finance_admin';
    state.sessionExpiry = '2099-01-01T00:00:00.000Z';
    state.close.mockClear();
    state.listFinanceProjects.mockClear();
    state.readCashMovements.mockClear();
  });

  it.each([
    ['project_manager', 403],
    ['worker', 403],
  ])('checks %s permission before malformed filters', async (role, status) => {
    state.role = role;
    expect(
      await failureFor('filter=unknown&from=2026-02-30&to=2026-01-01&project=private'),
    ).toMatchObject({ status, body: { message: 'Finance access required' } });
    expect(state.listFinanceProjects).not.toHaveBeenCalled();
    expect(state.readCashMovements).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('checks live session before malformed filters', async () => {
    state.sessionExpiry = '2000-01-01T00:00:00.000Z';
    expect(await failureFor('filter=unknown&from=2026-02-30')).toMatchObject({
      status: 401,
      body: { message: 'Live authenticated session required' },
    });
    expect(state.listFinanceProjects).not.toHaveBeenCalled();
    expect(state.readCashMovements).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('retains all filters and highlights each known invalid field without calculating cash', async () => {
    const result = await load(
      event(
        'currency=USD&filter=unknown&from=2026-02-30&to=2026-03-01&project=old-project&group=month&dated=1',
      ),
    );
    expect(result).toMatchObject({
      currency: 'USD',
      filter: 'unknown',
      from: '2026-02-30',
      to: '2026-03-01',
      projectId: 'old-project',
      granularity: 'month',
      datedOnly: true,
      movements: [],
      groups: [],
      problem: {
        code: 'FINANCE_CASH_FILTER_INVALID',
        messageKey: 'problem.finance.cashFilterInvalid',
        correlationId: 'cash-request-123',
        fieldErrors: {
          filter: ['problem.finance.cashFilterInvalid'],
          from: ['Enter a valid date.'],
          project: ['problem.finance.cashProjectUnavailable'],
        },
        remedies: [{ id: 'correct_field' }],
      },
    });
    expect(state.readCashMovements).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'currency=ZZZ',
      'FINANCE_CASH_CURRENCY_INVALID',
      { currency: ['problem.finance.cashCurrencyInvalid'] },
    ],
    [
      'group=quarter',
      'FINANCE_CASH_GROUP_INVALID',
      { group: ['problem.finance.cashGroupInvalid'] },
    ],
    [
      'from=2026-02-30&to=2026-03-01',
      'FINANCE_CASH_DATE_INVALID',
      { from: ['Enter a valid date.'] },
    ],
    [
      'from=2026-09-30&to=2026-09-01',
      'FINANCE_CASH_DATE_ORDER_INVALID',
      { to: ['problem.finance.cashDateOrderInvalid'] },
    ],
    [
      'from=2026-09-01&to=2026-09-30&project=old-project',
      'FINANCE_CASH_PROJECT_UNAVAILABLE',
      { project: ['problem.finance.cashProjectUnavailable'] },
    ],
  ])('returns %s as %s and skips cash calculations', async (query, code, fieldErrors) => {
    const result = await load(event(query));
    expect(result).toMatchObject({
      problem: { code, fieldErrors, remedies: [{ id: 'correct_field' }] },
      movements: [],
      groups: [],
    });
    expect(state.readCashMovements).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('keeps both unavailable selections so the user can correct them', async () => {
    const result = await load(event('currency=ZZZ&group=quarter'));
    expect(result).toMatchObject({
      currency: 'ZZZ',
      granularity: 'quarter',
      problem: {
        code: 'FINANCE_CASH_CURRENCY_INVALID',
        fieldErrors: {
          currency: ['problem.finance.cashCurrencyInvalid'],
          group: ['problem.finance.cashGroupInvalid'],
        },
      },
    });
    expect(state.readCashMovements).not.toHaveBeenCalled();
  });

  it('keeps valid cash filters and calculations working', async () => {
    const result = await load(
      event('currency=EUR&filter=receivable&from=2026-09-01&to=2026-09-30&project=project-1'),
    );
    expect(result).toMatchObject({
      filter: 'receivable',
      from: '2026-09-01',
      to: '2026-09-30',
      projectId: 'project-1',
      problem: null,
      movements: [],
      groups: [],
    });
    expect(state.readCashMovements).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });
});
