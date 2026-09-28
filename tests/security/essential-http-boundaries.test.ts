import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  overview: vi.fn(() => ({ project: { project_number: 'P-001' } })),
  finance: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  assertLiveSession: vi.fn(),
}));
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { userId: 'finance', role: 'finance_admin' },
    sqlite: { close: boundary.close },
    repository: { projectOverview: boundary.overview },
    v3: { projectFinance: boundary.finance },
  }),
}));
const { GET: financeExportGet } =
  await import('../../apps/portal/src/routes/app/api/projects/[id]/finance-export/+server.js');
const { isRealIsoDate } = await import('../../apps/portal/src/lib/server/iso-date.js');

describe('Client Essential finance-export HTTP boundary', () => {
  it('accepts only real ISO calendar dates and rejects malformed periods', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true);
    expect(isRealIsoDate('2024-02-29')).toBe(true);
    expect(isRealIsoDate('2026-02-29')).toBe(false);
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('2026-1-01')).toBe(false);
    expect(isRealIsoDate('2026-01-01\r\n";')).toBe(false);
  });

  it('rejects reversed periods after project authorization and before finance export', async () => {
    boundary.overview.mockClear();
    boundary.finance.mockClear();
    boundary.close.mockClear();
    const event = {
      locals: {
        user: { id: 'finance', role: 'finance_admin' },
        session: { id: 'finance-session' },
      },
      params: { id: 'project-1' },
      url: new URL(
        'http://localhost/j-aautomation/app/api/projects/project-1/finance-export?periodStart=2026-09-01&periodEnd=2026-08-01',
      ),
    } as unknown as Parameters<typeof financeExportGet>[0];

    const response = financeExportGet(event) as Response;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PROJECT_FINANCE_EXPORT_PERIOD_RANGE_REVERSED',
      fieldErrors: { periodEnd: ['problem.projectFinanceExport.periodRangeReversed'] },
      remedies: [{ id: 'review_finance_period' }],
    });
    expect(boundary.overview).toHaveBeenCalledOnce();
    expect(boundary.finance).not.toHaveBeenCalled();
    expect(boundary.close).toHaveBeenCalledOnce();
  });

  it('keeps the ordinary XLSX response contract and safe semantic filename boundary', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'apps/portal/src/routes/app/api/projects/[id]/finance-export/+server.ts',
      ),
      'utf8',
    );
    expect(source).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(source).toContain('\'content-disposition\': `attachment; filename="${filename}"`');
    expect(source).toContain(".replace(/[^A-Za-z0-9._-]+/gu, '-')");
    expect(source).toContain('start! > end!');
    expect(source).not.toMatch(/filename=.*periodStart.*request/iu);
  });
});
