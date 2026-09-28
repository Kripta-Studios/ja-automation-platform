import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError } from '@ja/database';

const state = vi.hoisted(() => ({
  deny: false,
  events: [] as string[],
  close: vi.fn(),
  workers: [
    { id: 'worker-1', name: 'Test Worker' },
    { id: 'manager-1', name: 'Test Manager' },
  ],
  pay: vi.fn(() => ({ currencyBreakdown: [], missingCompensationRules: 0 })),
  settlements: vi.fn(() => []),
  details: vi.fn(() => ({ activities: [], expenses: [] })),
}));

vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  OwnerRecordManagement: class {
    assertOwner() {
      state.events.push('owner');
      if (state.deny) throw new AccessDeniedError('Owner required');
    }
  },
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: 'owner_admin', userId: 'owner-1', sessionId: 'session-1' },
    sqlite: {
      prepare: () => ({
        all: () => {
          state.events.push('workers');
          return state.workers;
        },
      }),
      close: state.close,
    },
    v3: {
      ownerWorkerPay: state.pay,
      ownerWorkerSettlements: state.settlements,
      ownerWorkerPayDetails: state.details,
    },
  }),
}));

import { load } from '../../apps/portal/src/routes/app/manage/worker-pay/+page.server';

function event(query: string) {
  return {
    locals: {
      user: { id: 'owner-1', role: 'owner_admin', status: 'active' },
      session: { id: 'session-1' },
      correlationId: 'worker-pay-request-1',
    },
    url: new URL(`http://localhost/j-aautomation/app/manage/worker-pay?${query}`),
  } as never;
}

describe('Owner worker pay GET filters', () => {
  beforeEach(() => {
    state.deny = false;
    state.events.length = 0;
    state.close.mockClear();
    state.pay.mockClear();
    state.settlements.mockClear();
    state.details.mockClear();
  });

  it.each([
    ['start=2026-02-30&end=2026-03-31&worker=worker-1', 'start'],
    ['start=2026-03-01&end=not-a-date&worker=worker-1', 'end'],
  ])('retains invalid dates and skips financial reads for %s', (query, field) => {
    const result = load(event(query));
    expect(result).toMatchObject({
      filterProblem: {
        code: 'WORKER_PAY_PERIOD_DATE_INVALID',
        messageKey: 'problem.workerPay.periodDateInvalid',
        correlationId: 'worker-pay-request-1',
        fieldErrors: { [field]: ['problem.workerPay.periodDateInvalid'] },
        remedies: [{ id: 'correct_field' }],
      },
      selectedWorker: { id: 'worker-1' },
      requestedWorkerId: 'worker-1',
      pay: null,
    });
    expect(result?.periodStart).toBe(event(query).url.searchParams.get('start'));
    expect(result?.periodEnd).toBe(event(query).url.searchParams.get('end'));
    expect(state.events).toEqual(['owner', 'workers']);
    expect(state.pay).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('reports duplicate filter parameters and retains the first values', () => {
    const result = load(event('start=2026-03-01&start=2026-03-02&end=2026-03-31&worker=worker-1'));
    expect(result).toMatchObject({
      periodStart: '2026-03-01',
      filterProblem: {
        code: 'WORKER_PAY_FILTER_DUPLICATE',
        fieldErrors: { start: ['problem.workerPay.filterDuplicate'] },
      },
      pay: null,
    });
    expect(state.pay).not.toHaveBeenCalled();
  });

  it('reports both causes when the retained duplicate date is malformed', () => {
    const result = load(event('start=not-a-date&start=2026-03-01&end=2026-03-31&worker=worker-1'));
    expect(result).toMatchObject({
      periodStart: 'not-a-date',
      filterProblem: {
        code: 'WORKER_PAY_FILTER_DUPLICATE',
        fieldErrors: {
          start: ['problem.workerPay.filterDuplicate', 'problem.workerPay.periodDateInvalid'],
        },
      },
      pay: null,
    });
    expect(state.pay).not.toHaveBeenCalled();
  });

  it('reports a reversed range without calculating compensation', () => {
    const result = load(event('start=2026-03-31&end=2026-03-01&worker=worker-1'));
    expect(result).toMatchObject({
      filterProblem: {
        code: 'WORKER_PAY_PERIOD_RANGE_REVERSED',
        fieldErrors: { end: ['problem.workerPay.periodRangeReversed'] },
      },
      pay: null,
    });
    expect(state.pay).not.toHaveBeenCalled();
  });

  it('keeps a stale worker selection visible as unavailable', () => {
    const result = load(event('start=2026-03-01&end=2026-03-31&worker=former-worker'));
    expect(result).toMatchObject({
      selectedWorker: null,
      requestedWorkerId: 'former-worker',
      filterProblem: {
        code: 'WORKER_PAY_WORKER_UNAVAILABLE',
        fieldErrors: { worker: ['problem.workerPay.workerUnavailable'] },
      },
      pay: null,
    });
    expect(state.pay).not.toHaveBeenCalled();
  });

  it('checks Owner access before reading workers or interpreting filters', () => {
    state.deny = true;
    expect(() => load(event('start=not-a-date&worker=former-worker'))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(state.events).toEqual(['owner']);
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('calculates only a valid authorized worker period', () => {
    const result = load(event('start=2026-03-01&end=2026-03-31&worker=worker-1'));
    expect(result).toMatchObject({ filterProblem: null, selectedWorker: { id: 'worker-1' } });
    expect(state.pay).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner_admin' }),
      'worker-1',
      '2026-03-01',
      '2026-03-31',
    );
    expect(state.settlements).toHaveBeenCalledOnce();
    expect(state.details).toHaveBeenCalledOnce();
  });
});
