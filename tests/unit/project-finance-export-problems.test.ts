import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'finance_admin',
  active: true,
  liveSession: true,
  projectAllowed: true,
  financeAllowed: true,
  renderFails: false,
  open: vi.fn(),
  close: vi.fn(),
  audit: vi.fn(),
  projectOverview: vi.fn((..._args: unknown[]) => undefined),
  projectFinance: vi.fn((..._args: unknown[]) => undefined),
  render: vi.fn((..._args: unknown[]) => undefined),
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    assertLiveSession: () => {
      if (!state.liveSession)
        throw new original.AccessDeniedError('Live authenticated session required');
    },
    recordAuditEvent: state.audit,
  };
});
vi.mock('$lib/server/portal-repository', async () => {
  const { AccessDeniedError, V3AccessDeniedError } = await import('@ja/database');
  return {
    openPortalRepository: () => {
      state.open();
      if (!state.active) throw new AccessDeniedError('Active account required');
      return {
        sqlite: { close: state.close },
        principal: { role: state.role, userId: 'finance-1', sessionId: 'session-1' },
        repository: {
          projectOverview: (...args: unknown[]) => {
            state.projectOverview(...args);
            if (!state.projectAllowed) throw new AccessDeniedError('Project access required');
            return {
              project: {
                id: 'project-1',
                project_number: 'P-100',
                name: 'Junkers',
                client_number: 'C-1',
                client_name: 'Client',
                currency: 'EUR',
              },
              milestones: [],
            };
          },
          listInvoices: () => [],
          listProjectInvoiceExpenseLines: () => [],
        },
        v3: {
          projectFinance: (...args: unknown[]) => {
            state.projectFinance(...args);
            if (!state.financeAllowed) throw new V3AccessDeniedError('Project access required');
            return { timeEconomics: [], expenseEconomics: [] };
          },
        },
      };
    },
  };
});
vi.mock('@ja/reporting', () => ({
  projectFinanceXlsx: (...args: unknown[]) => {
    state.render(...args);
    if (state.renderFails) throw new Error('private renderer details');
    return new TextEncoder().encode('xlsx bytes');
  },
}));

import { GET } from '../../apps/portal/src/routes/app/api/projects/[id]/finance-export/+server';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const valid = 'periodStart=2026-09-01&periodEnd=2026-09-30';

function event(query: string, signedIn = true, id = 'project-1') {
  return {
    locals: {
      user: signedIn ? { id: 'finance-1' } : null,
      session: signedIn ? { id: 'session-1' } : null,
      correlationId: 'project-export-reference-123',
    },
    params: { id },
    url: new URL(`http://localhost/app/api/projects/${id}/finance-export?${query}`),
  } as never;
}

async function request(query: string, signedIn = true, id = 'project-1'): Promise<Response> {
  return (await GET(event(query, signedIn, id))) as Response;
}

async function problem(query: string, signedIn = true, id = 'project-1') {
  const response = await request(query, signedIn, id);
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  expect(response.headers.get('content-disposition')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const body = await response.json();
  expect(body).toMatchObject({
    success: false,
    correlationId: 'project-export-reference-123',
    params: expect.any(Object),
    fieldErrors: expect.any(Object),
    remedies: expect.any(Array),
  });
  return { response, body };
}

describe('project finance XLSX export problems', () => {
  beforeEach(() => {
    state.role = 'finance_admin';
    state.active = true;
    state.liveSession = true;
    state.projectAllowed = true;
    state.financeAllowed = true;
    state.renderFails = false;
    for (const fn of [
      state.open,
      state.close,
      state.audit,
      state.projectOverview,
      state.projectFinance,
      state.render,
    ])
      fn.mockClear();
  });

  it('requires sign-in before repository access', async () => {
    const { response, body } = await problem('periodStart=2026-02-30', false);
    expect(response.status).toBe(401);
    expect(body.code).toBe('PROJECT_FINANCE_EXPORT_SIGN_IN_REQUIRED');
    expect(state.open).not.toHaveBeenCalled();
  });

  it.each([
    ['expired session', false, true, 401, 'SESSION_EXPIRED'],
    ['disabled account', true, false, 403, 'ACCOUNT_DISABLED'],
  ])('checks %s before revealing period facts', async (_case, live, active, status, code) => {
    state.liveSession = live as boolean;
    state.active = active as boolean;
    const { response, body } = await problem('periodStart=2026-02-30');
    expect(response.status).toBe(status);
    expect(body.code).toBe(`PROJECT_FINANCE_EXPORT_${code}`);
    expect(state.projectOverview).not.toHaveBeenCalled();
    expect(state.projectFinance).not.toHaveBeenCalled();
  });

  it('requires a finance role before project or period facts', async () => {
    state.role = 'worker';
    const { response, body } = await problem('periodStart=2026-02-30');
    expect(response.status).toBe(403);
    expect(body.code).toBe('PROJECT_FINANCE_EXPORT_FINANCE_ROLE_REQUIRED');
    expect(state.projectOverview).not.toHaveBeenCalled();
  });

  it('checks project object access before reporting malformed period dates', async () => {
    state.projectAllowed = false;
    const { response, body } = await problem('periodStart=2026-02-30');
    expect(response.status).toBe(403);
    expect(body.code).toBe('PROJECT_FINANCE_EXPORT_PROJECT_ACCESS_CHANGED');
    expect(body.message).not.toContain('date');
    expect(state.projectFinance).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
  });

  it.each([
    ['periodStart=2026-02-30&periodEnd=2026-03-01', 'PERIOD_DATE_INVALID', 'periodStart'],
    ['periodStart=2026-09-01&periodEnd=', 'PERIOD_DATE_INVALID', 'periodEnd'],
    ['periodStart=2026-09-01', 'PERIOD_DATE_INCOMPLETE', 'periodEnd'],
    [
      'periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30',
      'PERIOD_DATE_DUPLICATE',
      'periodStart',
    ],
    ['periodStart=2026-09-30&periodEnd=2026-09-01', 'PERIOD_RANGE_REVERSED', 'periodEnd'],
  ])('returns %s as a typed no-render problem', async (query, code, field) => {
    const { response, body } = await problem(query as string);
    expect(response.status).toBe(400);
    expect(body.code).toBe(`PROJECT_FINANCE_EXPORT_${code}`);
    expect(body.fieldErrors).toHaveProperty(field as string);
    expect(body.remedies).toEqual([{ id: 'review_finance_period' }]);
    expect(state.projectOverview).toHaveBeenCalledWith(expect.any(Object), 'project-1', {
      includeFinance: false,
    });
    expect(state.projectFinance).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('links both invalid date fields in one response', async () => {
    const { body } = await problem('periodStart=2026-02-30&periodEnd=2026-09-31');
    expect(body.fieldErrors).toEqual({
      periodStart: ['problem.projectFinanceExport.periodDateInvalid'],
      periodEnd: ['problem.projectFinanceExport.periodDateInvalid'],
    });
  });

  it('preserves a valid XLSX download and filename', async () => {
    const response = await request(`${valid}&locale=es`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('content-disposition')).toContain(
      'ja-P-100-finance-2026-09-01-2026-09-30.xlsx',
    );
    expect(await response.text()).toBe('xlsx bytes');
    expect(state.projectFinance).toHaveBeenCalledOnce();
    expect(state.render).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledOnce();
  });

  it('reports a permission change during finance loading without rendering', async () => {
    state.financeAllowed = false;
    const { response, body } = await problem(valid);
    expect(response.status).toBe(403);
    expect(body.code).toBe('PROJECT_FINANCE_EXPORT_PROJECT_ACCESS_CHANGED');
    expect(state.render).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it('logs private render details but returns a safe retryable reference', async () => {
    state.renderFails = true;
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { response, body } = await problem(valid);
      expect(response.status).toBe(503);
      expect(body.code).toBe('PROJECT_FINANCE_EXPORT_UNAVAILABLE');
      expect(body.message).toContain('project-export-reference-123');
      expect(body.message).not.toContain('private renderer details');
      expect(body.remedies).toEqual([{ id: 'retry_finance_export' }]);
      expect(state.audit).not.toHaveBeenCalled();
      expect(logger).toHaveBeenCalledOnce();
    } finally {
      logger.mockRestore();
    }
  });

  it('resolves every route and browser download problem in English, Spanish, and Portuguese', async () => {
    const keys = new Set<string>();
    keys.add((await problem(valid, false)).body.messageKey);
    state.liveSession = false;
    keys.add((await problem(valid)).body.messageKey);
    state.liveSession = true;
    state.active = false;
    keys.add((await problem(valid)).body.messageKey);
    state.active = true;
    state.role = 'worker';
    keys.add((await problem(valid)).body.messageKey);
    state.role = 'finance_admin';
    state.projectAllowed = false;
    keys.add((await problem(valid)).body.messageKey);
    state.projectAllowed = true;
    for (const query of [
      `${valid}&periodStart=2026-09-02`,
      'periodStart=2026-09-01',
      'periodStart=2026-02-30&periodEnd=2026-03-01',
      'periodStart=2026-09-30&periodEnd=2026-09-01',
    ])
      keys.add((await problem(query)).body.messageKey);
    state.renderFails = true;
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      keys.add((await problem(valid)).body.messageKey);
    } finally {
      logger.mockRestore();
    }
    keys.add('problem.projectFinanceExport.networkUnavailable');
    expect(keys).toEqual(
      new Set([
        'problem.projectFinanceExport.signInRequired',
        'problem.projectFinanceExport.sessionExpired',
        'problem.projectFinanceExport.accountDisabled',
        'problem.projectFinanceExport.financeRoleRequired',
        'problem.projectFinanceExport.projectAccessChanged',
        'problem.projectFinanceExport.periodDateDuplicate',
        'problem.projectFinanceExport.periodDateIncomplete',
        'problem.projectFinanceExport.periodDateInvalid',
        'problem.projectFinanceExport.periodRangeReversed',
        'problem.projectFinanceExport.unavailable',
        'problem.projectFinanceExport.networkUnavailable',
      ]),
    );
    for (const key of keys)
      for (const locale of ['en', 'es', 'pt'] as const)
        expect(portalText(locale, key), `${locale}: ${key}`).not.toBe(key);
  });
});
