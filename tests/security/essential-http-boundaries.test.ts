import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('rejects reversed periods before opening a project repository', () => {
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

    let thrown: unknown;
    try {
      financeExportGet(event);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ status: 400 });
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
    expect(source).toContain('periodStart > periodEnd');
    expect(source).not.toMatch(/filename=.*periodStart.*request/iu);
  });
});
