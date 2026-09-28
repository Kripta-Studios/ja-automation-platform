import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';

const state = vi.hoisted(() => ({
  bootstrapError: null as Error | null,
  operationError: null as Error | null,
  openCount: 0,
  closeCount: 0,
  getCount: 0,
  timeState: 'active' as 'active' | 'corrected' | 'rejected',
  retainedTimeValid: true,
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    assertLiveSession: () => {
      if (state.operationError) throw state.operationError;
    },
    CrewLeaderRepository: class {
      authorizeDelegatedOperationalEntry() {
        if (state.operationError) throw state.operationError;
        return { grantId: 'grant-1' };
      }
      assignedWorkers() {
        if (state.operationError) throw state.operationError;
        return [{ id: 'worker-1', name: 'Worker One' }];
      }
    },
  };
});

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => {
    state.openCount += 1;
    if (state.bootstrapError) throw state.bootstrapError;
    return {
      principal: {
        userId: 'worker-1',
        role: 'worker',
        sessionId: 'session-1',
        projectIds: new Set(['11111111-1111-4111-8111-111111111111']),
      },
      sqlite: {
        close: () => (state.closeCount += 1),
        prepare: (sql: string) => ({
          get: () => {
            if (state.operationError) throw state.operationError;
            if (sql.includes('FROM time_entry') && sql.includes('approval_state NOT IN'))
              return state.retainedTimeValid ? { 1: 1 } : undefined;
            state.getCount += 1;
            return state.getCount === 1 ? { id: 'assignment-1' } : { ok: 1 };
          },
        }),
      },
      repository: {
        expenseDetail: () => ({
          id: '33333333-3333-4333-8333-333333333333',
          project_id: '11111111-1111-4111-8111-111111111111',
          worker_id: 'worker-1',
          spent_on: '2026-09-26',
          time_entry_id: 'time-1',
        }),
        listTimeForScope: () => {
          if (state.operationError) throw state.operationError;
          return [
            {
              id: 'time-1',
              worker_id: 'worker-1',
              worker_name: 'Worker One',
              minutes: 480,
              category: 'regular',
              activity_summary: 'Installation',
              approval_state: state.timeState === 'rejected' ? 'rejected' : 'draft',
              active_correction_id: state.timeState === 'corrected' ? 'correction-1' : null,
              correction_linked: 0,
            },
          ];
        },
      },
    };
  },
}));

import { GET as descriptionGET } from '../../apps/portal/src/routes/app/api/expenses/description-default/+server';
import { GET as timeGET } from '../../apps/portal/src/routes/app/api/expenses/time-options/+server';
import { GET as crewGET } from '../../apps/portal/src/routes/app/api/expenses/crew-workers/+server';

const projectId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const date = '2026-09-26';
const routes = {
  description: {
    GET: descriptionGET,
    path: `/app/api/expenses/description-default?projectId=${projectId}&workerId=${workerId}&date=${date}`,
    invalid: 'EXPENSE_LOOKUP_DESCRIPTION_FILTERS_INVALID',
    denied: 'EXPENSE_LOOKUP_DESCRIPTION_SCOPE_DENIED',
    result: { description: 'Perdiem' },
  },
  time: {
    GET: timeGET,
    path: `/app/api/expenses/time-options?projectId=${projectId}&date=${date}`,
    invalid: 'EXPENSE_LOOKUP_TIME_FILTERS_INVALID',
    denied: 'EXPENSE_LOOKUP_TIME_SCOPE_DENIED',
    result: {
      rows: [
        {
          id: 'time-1',
          workerId: 'worker-1',
          workerName: 'Worker One',
          minutes: 480,
          category: 'regular',
          summary: 'Installation',
          approvalState: 'draft',
          correctionLinked: 0,
        },
      ],
    },
  },
  crew: {
    GET: crewGET,
    path: `/app/api/expenses/crew-workers?projectId=${projectId}&date=${date}`,
    invalid: 'EXPENSE_LOOKUP_CREW_FILTERS_INVALID',
    denied: 'EXPENSE_LOOKUP_CREW_SCOPE_DENIED',
    result: { workers: [{ id: 'worker-1', name: 'Worker One' }] },
  },
} as const;

async function get(
  route: (typeof routes)[keyof typeof routes],
  options: { locals?: Record<string, unknown>; path?: string } = {},
) {
  const response = await route.GET({
    locals: options.locals ?? {
      user: { id: 'worker-1' },
      session: { id: 'session-1' },
      correlationId: 'expense-lookup-test',
    },
    url: new URL(`http://localhost${options.path ?? route.path}`),
  } as never);
  return { response, body: await response.json() };
}

beforeEach(() => {
  state.bootstrapError = null;
  state.operationError = null;
  state.openCount = 0;
  state.closeCount = 0;
  state.getCount = 0;
  state.timeState = 'active';
  state.retainedTimeValid = true;
});

it('confirms an existing linked time with an active correction without offering it as a new choice', async () => {
  state.timeState = 'corrected';
  const { response, body } = await get(routes.time, {
    path: `${routes.time.path}&originalExpenseId=33333333-3333-4333-8333-333333333333`,
  });
  expect(response.status).toBe(200);
  expect(body).toEqual({ rows: [], originalLinkValid: true });
});

it('flags a rejected original linked time even when the expense ID is unchanged', async () => {
  state.timeState = 'rejected';
  state.retainedTimeValid = false;
  const { response, body } = await get(routes.time, {
    path: `${routes.time.path}&originalExpenseId=33333333-3333-4333-8333-333333333333`,
  });
  expect(response.status).toBe(200);
  expect(body).toEqual({ rows: [], originalLinkValid: false });
});

describe.each(Object.entries(routes))('%s expense lookup API', (_name, route) => {
  it('requires sign-in before opening a repository', async () => {
    const { response, body } = await get(route, { locals: {} });
    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      code: 'EXPENSE_LOOKUP_SIGN_IN_REQUIRED',
      messageKey: 'problem.expenseLookup.signInRequired',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'sign_in_again' }],
    });
    expect(body.correlationId).toEqual(expect.any(String));
    expect(state.openCount).toBe(0);
  });

  it('reports invalid filters without opening a repository', async () => {
    const { response, body } = await get(route, {
      path: '/app/api/expenses/description-default?projectId=bad&date=not-a-date',
    });
    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: route.invalid,
      remedies: [{ id: 'review_expense_form' }],
    });
    expect(state.openCount).toBe(0);
  });

  it('maps an account disabled after the page was opened', async () => {
    state.bootstrapError = new AccessDeniedError('Active account required');
    const { response, body } = await get(route);
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: 'EXPENSE_LOOKUP_ACCOUNT_DISABLED',
      messageKey: 'problem.expenseLookup.accountDisabled',
      remedies: [{ id: 'contact_owner' }],
    });
    expect(state.closeCount).toBe(0);
  });

  it('reports a permission change without exposing repository text', async () => {
    state.operationError = new AccessDeniedError('private membership state');
    const { response, body } = await get(route);
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: route.denied,
      remedies: [{ id: 'review_expense_form' }, { id: 'contact_owner' }],
    });
    expect(JSON.stringify(body)).not.toContain('private membership state');
    expect(state.closeCount).toBe(1);
  });

  it('hides unexpected details behind a reference', async () => {
    state.bootstrapError = new Error('private database path');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { response, body } = await get(route);
      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'EXPENSE_LOOKUP_UNAVAILABLE',
        messageKey: 'problem.expenseLookup.unavailable',
        params: { correlationId: 'expense-lookup-test' },
        remedies: [{ id: 'retry_expense_options' }],
      });
      expect(JSON.stringify(body)).not.toContain('private database path');
      expect(log).toHaveBeenCalledOnce();
      expect(state.closeCount).toBe(0);
    } finally {
      log.mockRestore();
    }
  });

  it('closes the repository after an unexpected lookup failure', async () => {
    state.operationError = new Error('private query detail');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { response, body } = await get(route);
      expect(response.status).toBe(500);
      expect(body.code).toBe('EXPENSE_LOOKUP_UNAVAILABLE');
      expect(JSON.stringify(body)).not.toContain('private query detail');
      expect(state.closeCount).toBe(1);
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('preserves the successful response shape', async () => {
    const { response, body } = await get(route);
    expect(response.status).toBe(200);
    expect(body).toEqual(route.result);
    expect(state.closeCount).toBe(1);
  });
});

it('maps an expired session while loading a description to sign-in guidance', async () => {
  state.operationError = new AccessDeniedError('Live authenticated session required');
  const { response, body } = await get(routes.description);
  expect(response.status).toBe(401);
  expect(body).toMatchObject({ code: 'EXPENSE_LOOKUP_SIGN_IN_REQUIRED' });
});

it('maps known crew validation without returning its raw text', async () => {
  state.operationError = new ValidationError('private worker data in repository error');
  const { response, body } = await get(routes.crew);
  expect(response.status).toBe(400);
  expect(body).toMatchObject({ code: 'EXPENSE_LOOKUP_CREW_FILTERS_INVALID' });
  expect(JSON.stringify(body)).not.toContain('private worker data');
});
