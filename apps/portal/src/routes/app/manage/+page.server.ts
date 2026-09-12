import { error, fail } from '@sveltejs/kit';
import {
  OwnerRecordManagement,
  ownerRecordTypes,
  OwnerCatalogManagement,
  ownerCatalogs,
} from '@ja/database';
import { openPortalRepository, actionFailure } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';

const domains = [
  {
    title: 'Clients and contacts',
    route: 'projects?view=clients',
    tables: ['client', 'client_contact'],
  },
  {
    title: 'Projects and assignments',
    route: 'projects',
    tables: ['project', 'project_member', 'project_milestone', 'schedule'],
  },
  { title: 'Workers and access', route: 'projects?view=team', tables: ['user', 'invitation'] },
  {
    title: 'Suppliers and technicians',
    route: 'supplier',
    tables: ['supplier', 'supplier_user_profile', 'supplier_project_grant'],
  },
  {
    title: 'Planning and skills',
    route: 'planning',
    tables: ['planning_assignment', 'skill', 'worker_skill', 'worker_availability'],
  },
  { title: 'Time', route: 'time', tables: ['time_entry'] },
  { title: 'Expenses', route: 'expenses', tables: ['expense'] },
  {
    title: 'Reports',
    route: 'reports',
    tables: ['daily_report', 'technical_report', 'technical_change', 'period_report'],
  },
  { title: 'Documents', route: 'documents', tables: ['document'] },
  {
    title: 'Commercial Configuration',
    route: 'finance?view=commercial',
    tables: [
      'compensation_rule',
      'internal_cost_rule',
      'client_labor_rate',
      'assignment_rate_override',
    ],
  },
  {
    title: 'Billing',
    route: 'billing',
    tables: [
      'invoice',
      'billing_rule',
      'billing_period',
      'legal_entity',
      'tax_profile',
      'invoice_number_policy',
    ],
  },
  {
    title: 'Payments and settlements',
    route: 'finance/cash',
    tables: ['payment', 'compensation_settlement'],
  },
  {
    title: 'Accounting',
    route: 'accounting',
    tables: ['accounting_pack_run', 'accounting_pack_revision'],
  },
] as const;

export const load: PageServerLoad = ({ locals, url }) => {
  const ctx = openPortalRepository(locals);
  try {
    const manager = new OwnerRecordManagement(ctx.sqlite);
    manager.assertOwner(ctx.principal);
    const recordType = url.searchParams.get('type') || 'expense';
    if (!ownerRecordTypes.includes(recordType as (typeof ownerRecordTypes)[number]))
      error(400, 'Invalid record type');
    const area = url.searchParams.get('area') || '';
    if (area && !Object.hasOwn(ownerCatalogs, area)) error(400, 'Invalid management area');
    return {
      managementUser: locals.user!,
      recordType,
      records: manager.list(ctx.principal, recordType),
      area,
      catalog: area ? ownerCatalogs[area]! : null,
      technicalReports: ctx.sqlite
        .prepare('SELECT id,system_name FROM technical_report ORDER BY system_name')
        .all() as { id: string; system_name: string }[],
      catalogRows: area
        ? new OwnerCatalogManagement(ctx.sqlite)
            .list(ctx.principal, area)
            .filter(
              (row) =>
                !url.searchParams.get('project') ||
                String(row.project_id) === url.searchParams.get('project'),
            )
        : [],
      focusId: url.searchParams.get('focus') ?? '',
      projects: ctx.sqlite
        .prepare('SELECT id,project_number,name FROM project ORDER BY project_number')
        .all() as { id: string; project_number: string; name: string }[],
      workers: ctx.sqlite
        .prepare(
          "SELECT id,name,email FROM user WHERE role IN ('worker','project_manager') ORDER BY name",
        )
        .all() as { id: string; name: string; email: string }[],
      domains: domains.map((domain) => ({
        ...domain,
        counts: domain.tables.map((table) => ({
          table,
          count: Number(
            ctx.sqlite.prepare(`SELECT count(*) count FROM ${table}`).get()?.count ?? 0,
          ),
        })),
      })),
    };
  } finally {
    ctx.sqlite.close();
  }
};

export const actions: Actions = {
  manageCatalog: async ({ locals, request }) => {
    const ctx = openPortalRepository(locals);
    let values: Record<string, string> = {};
    try {
      new OwnerRecordManagement(ctx.sqlite).assertOwner(ctx.principal);
      const form = await request.formData();
      values = Object.fromEntries([...form].map(([key, value]) => [key, String(value)]));
      if (form.get('confirmed') !== 'yes')
        return fail(400, { success: false, message: 'Confirm the operation' });
      new OwnerCatalogManagement(ctx.sqlite).mutate(ctx.principal, {
        kind: String(form.get('kind')),
        id: String(form.get('id') ?? ''),
        token: String(form.get('token') ?? ''),
        operation: String(form.get('operation')),
        reason: String(form.get('reason') ?? ''),
        values: Object.fromEntries(form),
      });
      return { success: true, message: 'Changes saved' };
    } catch (caught) {
      const failure = actionFailure(caught);
      return fail(failure.status, { ...failure.data, values, recordId: values.id ?? '' });
    } finally {
      ctx.sqlite.close();
    }
  },
  manageRecord: async ({ locals, request }) => {
    const ctx = openPortalRepository(locals);
    try {
      const manager = new OwnerRecordManagement(ctx.sqlite);
      manager.assertOwner(ctx.principal);
      const form = await request.formData();
      if (form.get('confirmed') !== 'yes')
        return fail(400, { success: false, message: 'Confirm the operation' });
      manager.mutate(ctx.principal, {
        recordType: String(form.get('recordType')),
        id: String(form.get('id')),
        version: Number(form.get('version')),
        operation: String(form.get('operation')),
        reason: String(form.get('reason') ?? ''),
      });
      return { success: true, message: 'Changes saved' };
    } catch (caught) {
      return actionFailure(caught);
    } finally {
      ctx.sqlite.close();
    }
  },
};
