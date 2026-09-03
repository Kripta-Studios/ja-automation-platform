import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openPortalRepository } = vi.hoisted(() => ({ openPortalRepository: vi.fn() }));

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

import {
  projectManagerApprovalQueueProjection,
  projectManagerDashboardProjection,
  projectManagerMilestoneProjection,
  projectManagerSearchProjection,
  projectManagerSearchSuggestionsProjection,
} from '../../apps/portal/src/routes/app/[section]/role-projections.ts';
import { load as rootLoad } from '../../apps/portal/src/routes/app/+page.server.ts';

const financeSearchRow = {
  id: 'invoice-1',
  type: 'invoice',
  label: 'INV-001',
  detail: 'labor · Invoice',
  total_minor: '900719925474099301',
  currency: 'EUR',
  client_rate_minor: '25000',
  internal_cost_minor: '5000',
  margin_bps: 2_500,
  tax_profile_id: 'vat-standard',
  client_treatment: 'reimbursable',
};

const operationalSearchRow = {
  id: 'project-1',
  type: 'project',
  label: 'Project 1',
  detail: 'J&A-001 · Project',
  amount_minor: '10000',
  currency: 'EUR',
  internal_cost_minor: '5000',
  metadata: { client_rate_minor: '25000' },
};

const unknownSearchRow = {
  id: 'future-finance-1',
  type: 'future-finance-entity',
  label: 'Future commercial result',
  detail: 'Must fail closed for PM',
  contribution_minor: '5000',
};

function rootLoaderContext(role: string) {
  const search = vi.fn(() => [operationalSearchRow, financeSearchRow, unknownSearchRow]);
  const searchSuggestions = vi.fn(() => [financeSearchRow, operationalSearchRow, unknownSearchRow]);
  const close = vi.fn();
  openPortalRepository.mockReturnValue({
    principal: { role, userId: `${role}-user`, projectIds: new Set(['project-1']) },
    repository: {
      search,
      searchSuggestions,
      dashboard: vi.fn(() => ({
        activeProjects: 1,
        actualMinutes: 120,
        pendingReports: 1,
        upcomingInvoiceMinor: '900719925474099301',
      })),
      listAssignedProjects: vi.fn(() => []),
      listApprovalQueue: vi.fn(() => []),
      listPlanning: vi.fn(() => []),
    },
    sqlite: { close },
  });
  return { search, searchSuggestions, close };
}

async function callRootLoader(role: string) {
  rootLoaderContext(role);
  return await rootLoad({
    locals: {
      user: {
        id: `${role}-user`,
        role,
        status: 'active',
      },
    },
    url: new URL('http://localhost/j-aautomation/app?q=project'),
  } as never);
}

describe('project-manager portal serialization', () => {
  beforeEach(() => openPortalRepository.mockReset());

  it('keeps the PM dashboard operational and omits every monetary or invoice total', () => {
    const projected = projectManagerDashboardProjection({
      activeProjects: 3,
      actualMinutes: 480,
      pendingReports: 2,
      expenseMinor: '900719925474099301',
      upcomingInvoices: 4,
      upcomingInvoiceMinor: '800000000000000000',
      currency: 'EUR',
      clientRateMinor: '12000',
      internalCostMinor: '7000',
      marginBps: '2500',
      taxBps: '2100',
      billingTreatment: 'reimbursable',
    });

    expect(projected).toEqual({ activeProjects: 3, actualMinutes: 480, pendingReports: 2 });
    expect(JSON.stringify(projected)).not.toMatch(
      /expenseMinor|upcomingInvoice|currency|rate|cost|margin|tax|treatment/i,
    );
  });

  it('removes invoice search entities and keeps only operational lookup fields', () => {
    const rows = [
      {
        id: 'project-1',
        type: 'project',
        label: 'Project 1',
        detail: 'J&A-001 · Project',
        // A future repository enrichment must not be able to smuggle a nested
        // finance object through an otherwise allowlisted display field.
        metadata: { internal_cost_minor: 50_00 },
        amount_minor: 100_00,
        currency: 'EUR',
        client_rate_minor: 250_00,
      },
      {
        id: 'invoice-1',
        type: 'invoice',
        label: 'INV-001',
        detail: 'labor · Invoice',
        total_minor: 1_000_00,
        currency: 'EUR',
        margin_bps: 2_500,
      },
      {
        id: 'report-1',
        type: 'report',
        label: 'Commissioning report',
        detail: 'J&A-001 · Daily report',
        metadata: { client_rate_minor: 250_00 },
        tax_profile: 'VAT',
        internal_cost_minor: 50_00,
      },
      {
        id: 'unknown-1',
        type: 'finance-configuration',
        label: 'Commercial policy',
        detail: 'Finance-only',
        rate_minor: 10_00,
      },
    ];

    const expected = [
      {
        id: 'project-1',
        type: 'project',
        label: 'Project 1',
        detail: 'J&A-001 · Project',
      },
      {
        id: 'report-1',
        type: 'report',
        label: 'Commissioning report',
        detail: 'J&A-001 · Daily report',
      },
    ];

    expect(projectManagerSearchProjection(rows)).toEqual(expected);
    expect(projectManagerSearchSuggestionsProjection(rows)).toEqual(expected);
    expect(projectManagerSearchProjection(rows).some((row) => row.type === 'invoice')).toBe(false);
    expect(JSON.stringify(projectManagerSearchProjection(rows))).not.toMatch(
      /amount_minor|currency|client_rate|total_minor|margin|tax|internal_cost|rate_minor|metadata/u,
    );
  });

  it('keeps milestone review identity, project, date, state and action version only', () => {
    const rows = [
      {
        id: 'milestone-1',
        project_id: 'project-1',
        name: 'Commissioning gate',
        description: 'Operational acceptance checkpoint',
        due_on: '2026-09-01',
        approval_state: 'submitted',
        version: 4,
        project_number: 'J&A-001',
        project_name: 'Project 1',
        amount_minor: 100_00,
        currency: 'EUR',
        client_rate_minor: 250_00,
        tax_profile_id: 'vat-standard',
        internal_cost_minor: 50_00,
        contribution_margin_bps: 3_000,
        billing_treatment: 'reimbursable',
      },
    ];

    const projected = projectManagerMilestoneProjection(rows);
    expect(projected).toEqual([
      {
        id: 'milestone-1',
        project_id: 'project-1',
        name: 'Commissioning gate',
        description: 'Operational acceptance checkpoint',
        due_on: '2026-09-01',
        approval_state: 'submitted',
        version: 4,
        project_number: 'J&A-001',
        project_name: 'Project 1',
      },
    ]);
    expect(projected[0]).not.toHaveProperty('amount_minor');
    expect(projected[0]).not.toHaveProperty('currency');
    expect(projected[0]).not.toHaveProperty('client_rate_minor');
    expect(projected[0]).not.toHaveProperty('tax_profile_id');
    expect(projected[0]).not.toHaveProperty('internal_cost_minor');
    expect(projected[0]).not.toHaveProperty('contribution_margin_bps');
    expect(projected[0]).not.toHaveProperty('billing_treatment');
  });

  it('keeps PM approval rows operational and drops expense minor units', () => {
    const projected = projectManagerApprovalQueueProjection([
      {
        type: 'time',
        id: 'time-1',
        project_id: 'project-1',
        worker_id: 'worker-1',
        date: '2026-08-24',
        amount: 480,
        approval_state: 'submitted',
        review_stage: 'operational',
        currency: 'EUR',
        internal_cost_minor: 5000,
      },
      {
        type: 'expense',
        id: 'expense-1',
        project_id: 'project-1',
        worker_id: 'worker-1',
        date: '2026-08-24',
        amount: 12500,
        approval_state: 'submitted',
        review_stage: 'operational',
        reimbursement_amount_minor: 12500,
        currency: 'EUR',
      },
    ]);

    expect(projected).toEqual([
      {
        type: 'time',
        id: 'time-1',
        project_id: 'project-1',
        worker_id: 'worker-1',
        date: '2026-08-24',
        amount: 480,
        approval_state: 'submitted',
        review_stage: 'operational',
      },
      {
        type: 'expense',
        id: 'expense-1',
        project_id: 'project-1',
        worker_id: 'worker-1',
        date: '2026-08-24',
        approval_state: 'submitted',
        review_stage: 'operational',
      },
    ]);
    expect(JSON.stringify(projected)).not.toMatch(
      /minor|currency|cost|rate|margin|tax|billing|reimbursement/i,
    );
  });

  it('does not mutate the Finance/Owner source row used by the unprojected branch', () => {
    const financeRow = {
      id: 'milestone-finance',
      project_id: 'project-1',
      name: 'Commercial gate',
      due_on: '2026-09-01',
      approval_state: 'submitted',
      version: 2,
      project_number: 'J&A-001',
      project_name: 'Project 1',
      amount_minor: 100_00,
      currency: 'EUR',
      tax_profile_id: 'vat-standard',
      internal_cost_minor: 50_00,
    };
    const before = { ...financeRow };

    projectManagerMilestoneProjection([financeRow]);

    expect(financeRow).toEqual(before);
    expect(financeRow).toEqual(
      expect.objectContaining({
        amount_minor: 100_00,
        currency: 'EUR',
        tax_profile_id: 'vat-standard',
        internal_cost_minor: 50_00,
      }),
    );
  });

  it('applies the closed-world projection to PM root-loader results and suggestions', async () => {
    const loaded = (await callRootLoader('project_manager')) as Record<string, unknown>;
    const expected = [
      {
        id: 'project-1',
        type: 'project',
        label: 'Project 1',
        detail: 'J&A-001 · Project',
      },
    ];

    expect(loaded.searchResults).toEqual(expected);
    expect(loaded.searchSuggestions).toEqual(expected);
    expect(loaded.dashboard).toEqual({
      activeProjects: 1,
      actualMinutes: 120,
      pendingReports: 1,
    });

    const serialized = JSON.stringify({
      searchResults: loaded.searchResults,
      searchSuggestions: loaded.searchSuggestions,
    });
    expect(serialized).not.toMatch(
      /invoice|future-finance|amount|currency|rate|tax|margin|cost|treatment|contribution|metadata/i,
    );
  });

  it.each(['owner_admin'])(
    'preserves repository-authorized root search data for %s',
    async (role) => {
      const loaded = (await callRootLoader(role)) as Record<string, unknown>;

      expect(loaded.searchResults).toEqual([
        operationalSearchRow,
        financeSearchRow,
        unknownSearchRow,
      ]);
      expect(loaded.searchSuggestions).toEqual([
        financeSearchRow,
        operationalSearchRow,
        unknownSearchRow,
      ]);
      expect(loaded.dashboard).toEqual(
        expect.objectContaining({ upcomingInvoiceMinor: '900719925474099301' }),
      );
    },
  );

  it('routes finance to its role landing without serializing root search data', async () => {
    await expect(callRootLoader('finance_admin')).rejects.toMatchObject({
      status: 303,
      location: '/j-aautomation/app/finance?view=overview&q=project',
    });
  });
});
