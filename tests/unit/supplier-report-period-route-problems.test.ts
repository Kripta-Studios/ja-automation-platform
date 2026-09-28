import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError } from '@ja/database';

const state = vi.hoisted(() => ({
  principalRole: 'supplier_coordinator',
  listProjects: vi.fn(() => [{ id: 'project-1', name: 'Test project' }]),
  listTime: vi.fn(() => []),
  operationalReport: vi.fn(() => ({
    project: { id: 'project-1', name: 'Test project' },
    from: '2026-09-01',
    to: '2026-09-30',
    rows: [],
  })),
  close: vi.fn(),
  projectRecord: null as { name: string; status: string } | null,
  sessionLive: true,
  supplierExists: true,
}));

vi.mock('$lib/server/supplier-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/supplier-context')>()),
  openSupplierContext: () => ({
    principal: { userId: 'supplier-1', role: state.principalRole, sessionId: 'session-1' },
    sqlite: {
      prepare: (sql: string) => ({
        get: () =>
          sql.includes('FROM project WHERE id=?')
            ? state.projectRecord
            : sql.includes('FROM supplier WHERE id=?')
              ? state.supplierExists
                ? { id: 'supplier-1' }
                : undefined
              : sql.includes('FROM session WHERE user_id=?')
                ? state.sessionLive
                  ? { expires_at: '2099-01-01T00:00:00.000Z' }
                  : undefined
                : { profile: 'supplier_coordinator' },
      }),
      close: state.close,
    },
    supplier: {
      listProjects: state.listProjects,
      listSuppliers: () => [],
      listTechnicians: () => [],
      listTime: state.listTime,
      operationalReport: state.operationalReport,
    },
  }),
}));

import { load as workspaceLoad } from '../../apps/portal/src/routes/app/supplier/+page.server';
import { load as reportLoad } from '../../apps/portal/src/routes/app/supplier/report/+page.server';
import { GET as reportCsv } from '../../apps/portal/src/routes/app/supplier/report.csv/+server';

function event(path: string) {
  return {
    url: new URL(`http://localhost${path}`),
    locals: {
      user: { id: 'supplier-1' },
      session: { id: 'session-1' },
      correlationId: 'request-123',
    },
    cookies: { get: () => undefined },
  } as never;
}

describe('supplier report routes with invalid periods', () => {
  beforeEach(() => {
    state.principalRole = 'supplier_coordinator';
    state.listProjects.mockClear();
    state.listTime.mockClear();
    state.operationalReport.mockClear();
    state.close.mockClear();
    state.projectRecord = null;
    state.sessionLive = true;
    state.supplierExists = true;
    state.listProjects.mockImplementation(() => [{ id: 'project-1', name: 'Test project' }]);
    state.operationalReport.mockImplementation(() => ({
      project: { id: 'project-1', name: 'Test project' },
      from: '2026-09-01',
      to: '2026-09-30',
      rows: [],
    }));
  });

  it('keeps the selected workspace, project, and dates without listing misleading records', async () => {
    const result = await workspaceLoad(
      event(
        '/app/supplier?workspaceAction=report&projectId=project-1&from=2026-09-30&to=2026-09-01&lang=en',
      ),
    );
    expect(result).toMatchObject({
      projectId: 'project-1',
      from: '2026-09-30',
      to: '2026-09-01',
      entries: [],
      periodProblem: {
        code: 'SUPPLIER_REPORT_PERIOD_ORDER_INVALID',
        correlationId: 'request-123',
        fieldErrors: { to: ['problem.supplier.reportPeriodOrderInvalid'] },
      },
    });
    expect(state.listTime).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('keeps raw invalid dates on the report page without querying a report', async () => {
    const result = await reportLoad(
      event('/app/supplier/report?projectId=project-1&from=2026-02-30&to=2026-09-30&lang=es'),
    );
    expect(result).toMatchObject({
      projectId: 'project-1',
      from: '2026-02-30',
      to: '2026-09-30',
      report: null,
      periodProblem: {
        code: 'SUPPLIER_REPORT_PERIOD_DATE_INVALID',
        correlationId: 'request-123',
        fieldErrors: { from: ['problem.supplier.dateInvalid'] },
      },
    });
    expect(state.operationalReport).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['from=2026-02-30&to=2026-09-30', 'SUPPLIER_REPORT_PERIOD_DATE_INVALID'],
    ['from=2026-09-30&to=2026-09-01', 'SUPPLIER_REPORT_PERIOD_ORDER_INVALID'],
  ])('returns precise JSON instead of a CSV for %s', async (query, code) => {
    const response = await reportCsv(
      event(`/app/supplier/report.csv?projectId=project-1&${query}&lang=pt`),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      success: false,
      code,
      correlationId: 'request-123',
      remedies: [{ id: 'review_report_period' }],
    });
    expect(state.operationalReport).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('requires a selected project before downloading a CSV', async () => {
    const response = await reportCsv(
      event('/app/supplier/report.csv?from=2026-09-01&to=2026-09-30'),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'SUPPLIER_REPORT_PROJECT_REQUIRED',
      correlationId: 'request-123',
      messageKey: 'problem.supplier.reportProjectRequired',
      fieldErrors: { projectId: ['problem.supplier.reportProjectRequired'] },
      remedies: [{ id: 'choose_operational_project' }],
    });
    expect(state.operationalReport).not.toHaveBeenCalled();
    expect(state.listProjects).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each([
    '/app/supplier/report.csv?from=2026-09-30&to=2026-09-01',
    '/app/supplier/report.csv?projectId=project-1&from=2026-09-30&to=2026-09-01',
  ])('denies a non-supplier role before showing report input guidance at %s', async (path) => {
    state.principalRole = 'finance_admin';
    state.listProjects.mockImplementationOnce(() => {
      throw new AccessDeniedError('Supplier role required');
    });
    const response = await reportCsv(event(path));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SUPPLIER_REPORT_ROLE_REQUIRED',
      messageKey: 'problem.supplier.reportRoleRequired',
      remedies: [{ id: 'contact_owner' }],
      correlationId: 'request-123',
    });
    expect(state.listProjects).toHaveBeenCalledOnce();
    expect(state.operationalReport).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('conceals a project that left the coordinator scope after the page opened', async () => {
    state.listProjects.mockImplementation(() => []);
    const route = await reportLoad(
      event('/app/supplier/report?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(route).toMatchObject({
      projectId: 'project-1',
      unavailableProject: { id: 'project-1', name: '' },
      projectProblem: {
        code: 'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
        remedies: [{ id: 'contact_owner' }],
      },
      report: null,
    });
    const response = await reportCsv(
      event('/app/supplier/report.csv?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-correlation-id')).toBe('request-123');
    expect(await response.json()).toMatchObject({
      code: 'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
      params: {},
      remedies: [{ id: 'contact_owner' }],
    });
    expect(state.operationalReport).not.toHaveBeenCalled();
  });

  it('shows the owner the current status without generating the unavailable project report', async () => {
    state.principalRole = 'owner_admin';
    state.projectRecord = { name: 'Junkers', status: 'closing' };
    state.listProjects.mockImplementation(() => []);
    const route = await reportLoad(
      event('/app/supplier/report?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(route).toMatchObject({
      unavailableProject: { id: 'project-1', name: 'Junkers', status: 'closing' },
      projectProblem: {
        code: 'SUPPLIER_REPORT_PROJECT_UNAVAILABLE',
        params: { projectName: 'Junkers', status: 'closing' },
        remedies: [{ id: 'review_supplier_project', projectId: 'project-1' }],
      },
      report: null,
    });
    const response = await reportCsv(
      event('/app/supplier/report.csv?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'SUPPLIER_REPORT_PROJECT_UNAVAILABLE',
      params: { projectName: 'Junkers', status: 'closing' },
    });
    expect(state.operationalReport).not.toHaveBeenCalled();
  });

  it('preserves an owner supplier filter that disappeared and names the precise remedy', async () => {
    state.principalRole = 'owner_admin';
    state.supplierExists = false;
    const route = await reportLoad(
      event(
        '/app/supplier/report?projectId=project-1&supplierId=removed-supplier&from=2026-09-01&to=2026-09-30',
      ),
    );
    expect(route).toMatchObject({
      supplierId: 'removed-supplier',
      supplierProblem: {
        code: 'SUPPLIER_REPORT_SUPPLIER_UNAVAILABLE',
        remedies: [{ id: 'choose_supplier' }],
      },
      report: null,
    });
    const response = await reportCsv(
      event(
        '/app/supplier/report.csv?projectId=project-1&supplierId=removed-supplier&from=2026-09-01&to=2026-09-30',
      ),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'SUPPLIER_REPORT_SUPPLIER_UNAVAILABLE',
      fieldErrors: { supplierId: ['problem.supplier.reportSupplierUnavailable'] },
    });
    expect(state.operationalReport).not.toHaveBeenCalled();
  });

  it('returns a verified CSV with private headers for a current project', async () => {
    const response = await reportCsv(
      event('/app/supplier/report.csv?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(await response.text()).toContain('Installation / project');
  });

  it('withholds CSV rows when a project leaves scope during generation', async () => {
    state.listProjects
      .mockImplementationOnce(() => [{ id: 'project-1', name: 'Test project' }])
      .mockImplementationOnce(() => []);
    const response = await reportCsv(
      event('/app/supplier/report.csv?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      code: 'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
      remedies: [{ id: 'contact_owner' }],
    });
    expect(state.operationalReport).toHaveBeenCalledOnce();
  });

  it('withholds generated rows when the session ends before delivery', async () => {
    state.operationalReport.mockImplementationOnce(() => {
      state.sessionLive = false;
      return {
        project: { id: 'project-1', name: 'Test project' },
        from: '2026-09-01',
        to: '2026-09-30',
        rows: [],
      };
    });
    const response = await reportCsv(
      event('/app/supplier/report.csv?projectId=project-1&from=2026-09-01&to=2026-09-30'),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      code: 'SUPPLIER_REPORT_SIGN_IN_REQUIRED',
      remedies: [{ id: 'sign_in_again' }],
    });
  });

  it('keeps unexpected details in logs and returns a safe reference', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.operationalReport.mockImplementationOnce(() => {
      throw new Error('internal database path');
    });
    try {
      const response = await reportCsv(
        event('/app/supplier/report.csv?projectId=project-1&from=2026-09-01&to=2026-09-30'),
      );
      const body = await response.text();
      expect(response.status).toBe(503);
      expect(body).not.toContain('internal database path');
      expect(JSON.parse(body)).toMatchObject({
        code: 'SUPPLIER_REPORT_SERVICE_UNAVAILABLE',
        correlationId: 'request-123',
        remedies: [{ id: 'retry_supplier_report_download' }],
      });
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('keeps the typed response when connection cleanup fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.close.mockImplementationOnce(() => {
      throw new Error('connection cleanup');
    });
    try {
      const response = await reportCsv(
        event('/app/supplier/report.csv?projectId=project-1&from=2026-09-30&to=2026-09-01'),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'SUPPLIER_REPORT_PERIOD_ORDER_INVALID',
        correlationId: 'request-123',
      });
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
