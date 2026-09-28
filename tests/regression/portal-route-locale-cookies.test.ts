import { describe, expect, it, vi } from 'vitest';
vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  assertLiveSession: vi.fn(),
}));
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: 'owner_admin' },
    repository: { projectOverview: () => ({ project: {} }), projectCloseoutDetail: () => ({}) },
    sqlite: { prepare: () => ({ all: () => [] }), close: () => undefined },
  }),
}));
vi.mock('$lib/server/supplier-context', () => ({
  openSupplierContext: () => ({
    principal: { role: 'owner_admin' },
    supplier: {
      listProjects: () => [{ id: 'project' }],
      operationalReport: () => ({
        rows: [
          {
            workerName: 'Technician name',
            workDate: '2026-09-09',
            category: 'work',
            minutes: 60,
            summary: 'Original summary',
            state: 'approved',
            isSuperseded: false,
            recordedByName: 'Coordinator name',
          },
        ],
        project: { name: 'Installation' },
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    },
    sqlite: { close: () => undefined },
  }),
  supplierPeriod: () => ({ from: '2026-09-01', to: '2026-09-30' }),
  supplierReadFailure: (error: unknown) => {
    throw error;
  },
}));
import { load } from '../../apps/portal/src/routes/app/projects/[id]/closeout/+page.server';
import { GET } from '../../apps/portal/src/routes/app/supplier/report.csv/+server';
import { supplierCopy, supplierStateLabel } from '../../apps/portal/src/routes/app/supplier/copy';

function request(query: string, canonical?: string, legacy?: string) {
  return {
    locals: { user: { role: 'owner_admin' }, session: { id: 'owner-session' } },
    params: { id: 'project' },
    url: new URL(`https://example.test/app?projectId=project&${query}`),
    cookies: { get: (key: string) => (key === 'ja.portal.locale' ? canonical : legacy) },
  };
}

describe('closeout and operational CSV retain the portal cookie preference', () => {
  it.each([
    ['', 'pt', 'es', 'pt'],
    ['', undefined, 'es', 'es'],
    ['lang=en', 'pt', 'es', 'en'],
    ['lang=pt-BR', 'es', undefined, 'pt'],
    ['', undefined, undefined, 'en'],
  ] as const)(
    'resolves query %s with cookies %s/%s as %s',
    async (query, canonical, legacy, expected) => {
      const event = request(query, canonical, legacy);
      const data = await load(event as never);
      expect(data).toMatchObject({ locale: expected });
      const csv = await GET(event as never);
      const body = await csv.text();
      expect(body).toContain(supplierCopy[expected].project);
      expect(body).toContain(supplierCopy[expected].work);
      expect(body).toContain(supplierStateLabel(expected, 'approved'));
      expect(body).toContain('Original summary');
      expect(body).toContain('Technician name');
    },
  );
});
