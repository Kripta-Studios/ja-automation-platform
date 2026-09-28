import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'worker',
  active: true,
  sessionExpiry: '2099-01-01T00:00:00.000Z',
  close: vi.fn(),
  listExpensesForScope: vi.fn(() => [
    {
      id: 'expense-1',
      spent_on: '2026-09-12',
      project_id: 'project-1',
      worker_id: 'worker-1',
      client_name: 'Client',
      category: 'meal',
      currency: 'EUR',
      amount_minor: 1200,
      approval_state: 'approved',
      reimbursement_state: 'pending',
      receipt_required: 0,
      vendor: 'Cafe',
    },
  ]),
  exporter: vi.fn(() => new TextEncoder().encode('test-export')),
}));

vi.mock('$lib/server/portal-repository', async () => {
  const { AccessDeniedError } = await import('@ja/database');
  return {
    openPortalRepository: () => {
      if (!state.active) throw new AccessDeniedError('Active account required');
      return {
        principal: { role: state.role, userId: 'worker-1', sessionId: 'session-1' },
        sqlite: {
          prepare: () => ({ get: () => ({ expires_at: state.sessionExpiry }) }),
          close: state.close,
        },
        repository: { listExpensesForScope: state.listExpensesForScope },
      };
    },
  };
});
vi.mock('@ja/reporting', () => ({ expenseRegisterExport: state.exporter }));

import { GET } from '../../apps/portal/src/routes/app/expenses/export/+server';

const valid = 'from=2026-09-01&to=2026-09-30&format=csv';

function event(query: string, signedIn = true) {
  return {
    locals: {
      user: signedIn ? { id: 'worker-1' } : null,
      session: signedIn ? { id: 'session-1' } : null,
      correlationId: 'expense-export-request-123',
    },
    url: new URL(`http://localhost/app/expenses/export?${query}`),
  } as never;
}

async function request(query: string, signedIn = true): Promise<Response> {
  return (await GET(event(query, signedIn))) as Response;
}

async function problem(query: string, signedIn = true) {
  const response = await request(query, signedIn);
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-disposition')).toBeNull();
  const body = await response.json();
  expect(body).toMatchObject({
    success: false,
    correlationId: 'expense-export-request-123',
    params: expect.any(Object),
    fieldErrors: expect.any(Object),
    remedies: expect.any(Array),
  });
  return { response, body };
}

describe('expense export download problems', () => {
  beforeEach(() => {
    state.role = 'worker';
    state.active = true;
    state.sessionExpiry = '2099-01-01T00:00:00.000Z';
    state.close.mockClear();
    state.listExpensesForScope.mockClear();
    state.exporter.mockClear();
  });

  it('requires sign-in before opening the repository or inspecting filters', async () => {
    const { response, body } = await problem('from=2026-02-30&worker=someone-else', false);
    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 'EXPENSE_EXPORT_SIGN_IN_REQUIRED',
      messageKey: 'problem.expenseExport.signInRequired',
      remedies: [{ id: 'sign_in_again' }],
    });
    expect(state.close).not.toHaveBeenCalled();
  });

  it.each([
    ['expired session', '2000-01-01T00:00:00.000Z', true, 401, 'SESSION_EXPIRED'],
    ['disabled account', '2099-01-01T00:00:00.000Z', false, 403, 'ACCOUNT_DISABLED'],
  ])('checks %s before malformed filters', async (_name, expiry, active, status, code) => {
    state.sessionExpiry = expiry as string;
    state.active = active as boolean;
    const result = await problem('from=2026-02-30&worker=someone-else');
    expect(result.response.status).toBe(status);
    expect(result.body.code).toBe(`EXPENSE_EXPORT_${code}`);
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledTimes(active ? 1 : 0);
  });

  it('denies a worker asking for another worker before reporting malformed dates', async () => {
    const { response, body } = await problem('from=2026-02-30&worker=someone-else');
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: 'EXPENSE_EXPORT_WORKER_SCOPE_DENIED',
      fieldErrors: { worker: ['problem.expenseExport.workerScopeDenied'] },
      remedies: [{ id: 'review_own_expenses' }],
    });
    expect(body.message).not.toContain('date');
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
  });

  it('denies project-manager reimbursement filtering without disclosing payment state', async () => {
    state.role = 'project_manager';
    const { response, body } = await problem(`${valid}&reimbursement=pending`);
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: 'EXPENSE_EXPORT_REIMBURSEMENT_SCOPE_DENIED',
      fieldErrors: { reimbursement: ['problem.expenseExport.reimbursementScopeDenied'] },
    });
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
  });

  it('rejects duplicate format values instead of exporting the first format', async () => {
    const { response, body } = await problem(`${valid}&format=pdf`);
    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: 'EXPENSE_EXPORT_FILTER_DUPLICATE',
      messageKey: 'problem.expenseExport.filterDuplicate',
      fieldErrors: { format: ['problem.expenseExport.filterDuplicate'] },
      remedies: [{ id: 'review_expense_filters' }],
    });
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
    expect(state.exporter).not.toHaveBeenCalled();
  });

  it('checks every worker value for scope before reporting duplicates or invalid dates', async () => {
    const { response, body } = await problem(
      'from=2026-02-30&to=2026-09-30&format=csv&worker=worker-1&worker=other-worker',
    );
    expect(response.status).toBe(403);
    expect(body.code).toBe('EXPENSE_EXPORT_WORKER_SCOPE_DENIED');
    expect(body.fieldErrors).toEqual({ worker: ['problem.expenseExport.workerScopeDenied'] });
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
  });

  it('reports a repeated own-worker filter as duplicate after scope is satisfied', async () => {
    const { response, body } = await problem(`${valid}&worker=worker-1&worker=worker-1`);
    expect(response.status).toBe(400);
    expect(body.code).toBe('EXPENSE_EXPORT_FILTER_DUPLICATE');
    expect(body.fieldErrors).toEqual({ worker: ['problem.expenseExport.filterDuplicate'] });
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
  });

  it('reports every repeated recognized filter without reading or rendering expenses', async () => {
    state.role = 'finance_admin';
    const { response, body } = await problem(`${valid}&format=pdf&from=2026-02-30&q=one&q=two`);
    expect(response.status).toBe(400);
    expect(body.code).toBe('EXPENSE_EXPORT_FILTER_DUPLICATE');
    expect(body.fieldErrors).toEqual({
      from: ['problem.expenseExport.filterDuplicate'],
      format: ['problem.expenseExport.filterDuplicate'],
      q: ['problem.expenseExport.filterDuplicate'],
    });
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
    expect(state.exporter).not.toHaveBeenCalled();
  });

  it('preserves permission precedence for a repeated reimbursement filter', async () => {
    state.role = 'project_manager';
    const { response, body } = await problem(`${valid}&reimbursement=&reimbursement=pending`);
    expect(response.status).toBe(403);
    expect(body.code).toBe('EXPENSE_EXPORT_REIMBURSEMENT_SCOPE_DENIED');
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
  });

  it('checks a live session before giving duplicate filter guidance', async () => {
    state.sessionExpiry = '2000-01-01T00:00:00.000Z';
    const { response, body } = await problem(`${valid}&format=pdf`);
    expect(response.status).toBe(401);
    expect(body.code).toBe('EXPENSE_EXPORT_SESSION_EXPIRED');
    expect(state.listExpensesForScope).not.toHaveBeenCalled();
  });

  it.each([
    ['from=2026-02-30&to=2026-03-01&format=csv', 'DATE_INVALID', 400, 'from'],
    ['from=2026-09-30&to=2026-09-01&format=csv', 'DATE_ORDER_INVALID', 400, 'to'],
    ['from=2026-09-01&to=2026-09-30&format=txt', 'FORMAT_INVALID', 400, 'format'],
    [`${valid}&receipt=bogus`, 'RECEIPT_INVALID', 400, 'receipt'],
    [`${valid}&currency=GBP`, 'CURRENCY_INVALID', 400, 'currency'],
    [`${valid}&status=bogus`, 'STATUS_INVALID', 400, 'status'],
    [`${valid}&reimbursement=unknown`, 'REIMBURSEMENT_INVALID', 400, 'reimbursement'],
    [`${valid}&q=${'x'.repeat(501)}`, 'FILTER_TOO_LONG', 400, 'q'],
  ])(
    'returns %s as %s without reading or rendering expenses',
    async (query, code, status, field) => {
      const { response, body } = await problem(query as string);
      expect(response.status).toBe(status);
      expect(body.code).toBe(`EXPENSE_EXPORT_${code}`);
      expect(body.fieldErrors).toHaveProperty(field as string);
      expect(body.remedies).toEqual([{ id: 'review_expense_filters' }]);
      expect(state.listExpensesForScope).not.toHaveBeenCalled();
      expect(state.exporter).not.toHaveBeenCalled();
      expect(state.close).toHaveBeenCalledOnce();
    },
  );

  it('links both invalid date fields in one response', async () => {
    const { body } = await problem('from=2026-02-30&to=2026-09-31&format=csv');
    expect(body.fieldErrors).toEqual({
      from: ['problem.expenseExport.dateInvalid'],
      to: ['problem.expenseExport.dateInvalid'],
    });
  });

  it.each(['csv', 'xlsx', 'pdf'])('keeps a successful %s download unchanged', async (format) => {
    const response = await request(`from=2026-09-01&to=2026-09-30&format=${format}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      `Expenses_2026-09-01_2026-09-30.${format}`,
    );
    expect(response.headers.get('content-type')).toContain(
      format === 'pdf' ? 'application/pdf' : format === 'xlsx' ? 'spreadsheetml.sheet' : 'text/csv',
    );
    expect(await response.text()).toBe('test-export');
    expect(state.listExpensesForScope).toHaveBeenCalledOnce();
    expect(state.exporter).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each(['owner_admin', 'finance_admin', 'project_manager', 'worker'])(
    'exports only repository-scoped rows for %s',
    async (role) => {
      state.role = role;
      const response = await request(`${valid}&worker=worker-1`);
      expect(response.status).toBe(200);
      expect(state.listExpensesForScope).toHaveBeenCalledWith(
        expect.objectContaining({ role, userId: 'worker-1' }),
      );
      expect(state.exporter).toHaveBeenCalledOnce();
    },
  );

  it('continues supporting deep links for existing status and reimbursement states', async () => {
    state.role = 'finance_admin';
    const response = await request(`${valid}&status=locked&reimbursement=scheduled`);
    expect(response.status).toBe(200);
    expect(state.listExpensesForScope).toHaveBeenCalledOnce();
  });

  it('returns a safe reference and retry guidance after a render failure', async () => {
    state.exporter.mockImplementationOnce(() => {
      throw new Error('private rendering path');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { response, body } = await problem(valid);
      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        code: 'EXPENSE_EXPORT_UNAVAILABLE',
        params: { correlationId: 'expense-export-request-123' },
        remedies: [{ id: 'retry_expense_export' }],
      });
      expect(body.message).not.toContain('private rendering path');
      expect(log).toHaveBeenCalledOnce();
      expect(state.close).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
