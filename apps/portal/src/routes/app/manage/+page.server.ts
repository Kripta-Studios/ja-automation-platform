import { error, fail } from '@sveltejs/kit';
import {
  OwnerRecordManagement,
  ownerRecordTypes,
  OwnerCatalogManagement,
  ownerCatalogs,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFailure } from '$lib/server/actions/action-message';
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
    const projects = ctx.sqlite
      .prepare('SELECT id,project_number,name FROM project ORDER BY project_number')
      .all() as { id: string; project_number: string; name: string }[];
    const requestedProjectId = url.searchParams.get('project') ?? '';
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
      projects,
      selectedProjectId: projects.some((project) => project.id === requestedProjectId)
        ? requestedProjectId
        : '',
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

// Only known domain messages become user-facing causes; unexpected details remain sanitized.
const managementMessages: Record<string, string> = {
  'Record changed. Reload before continuing.': 'action.management.changed',
  'Planning overlaps another assignment': 'action.management.planningOverlap',
  'Worker is unavailable': 'action.management.workerUnavailable',
  'Manage the linked invoice before changing this milestone':
    'action.management.linkedMilestoneInvoice',
  'Finalized reports require a versioned correction': 'action.management.finalReport',
  'This record is linked to billing. Manage the invoice before changing its sources.':
    'action.management.billingLinked',
  'This record is an invoice source. Manage the invoice first.': 'action.management.invoiceSource',
  'This record belongs to a correction history. Use the correction workflow.':
    'action.management.correctionHistory',
  'This record has financial history. Use a financial correction.':
    'action.management.financialHistory',
  'This record is included in a period report. Manage the report before changing its sources.':
    'action.management.periodReport',
  'This expense has a reimbursement. Reverse or adjust the payment first.':
    'action.management.reimbursement',
  'This expense has a financial classification history. Use a financial correction.':
    'action.management.classificationHistory',
  'This time is included in a settlement. Adjust the settlement first.':
    'action.management.settlement',
  'This report has technical changes. Manage those changes first.':
    'action.management.technicalChanges',
  'Reports with committed attachments require a versioned correction.':
    'action.management.committedAttachments',
  'This record is already a draft': 'action.management.alreadyDraft',
  'A reason between 3 and 2000 characters is required': 'action.management.reason',
  'End must follow start': 'action.management.windowOrder',
  'Active worker required': 'action.management.activeWorker',
  'Worker assignment must cover the planning window': 'action.management.assignmentWindow',
  'Technical report does not belong to the project': 'action.management.reportProject',
  'Safety-impacting changes require validation and rollback information':
    'action.management.safetyEvidence',
  'Invalid amount': 'action.management.amount',
  'Invalid Planned minutes': 'action.management.plannedMinutes',
  'Project not found': 'action.management.projectNotFound',
  'Record not found': 'action.management.recordNotFound',
};

function managementFailure(caught: unknown, values: Record<string, string>) {
  const failure = actionFailure(caught);
  const rawMessage = caught instanceof Error ? caught.message : '';
  const knownKey =
    [400, 409].includes(failure.status) && Object.hasOwn(managementMessages, rawMessage)
      ? managementMessages[rawMessage]
      : undefined;
  const invalidField =
    failure.status === 400 && !knownKey
      ? Object.values(ownerCatalogs)
          .flatMap((catalog) => catalog.fields)
          .find((field) => rawMessage === `Invalid ${field.label}`)
      : undefined;
  return fail(failure.status, {
    ...failure.data,
    ...(knownKey ? { messageKey: knownKey } : {}),
    ...(invalidField
      ? {
          messageKey: 'action.management.invalidField',
          messageParams: { fieldLabel: invalidField.label },
        }
      : {}),
    values,
    recordId: values.id ?? '',
  });
}

export const actions: Actions = {
  manageCatalog: async ({ locals, request }) => {
    const ctx = openPortalRepository(locals);
    let values: Record<string, string> = {};
    try {
      new OwnerRecordManagement(ctx.sqlite).assertOwner(ctx.principal);
      const form = await request.formData();
      values = Object.fromEntries([...form].map(([key, value]) => [key, String(value)]));
      if (form.get('confirmed') !== 'yes')
        return fail(400, {
          success: false,
          message: 'Confirm the operation',
          values,
          recordId: values.id ?? '',
        });
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
      return managementFailure(caught, values);
    } finally {
      ctx.sqlite.close();
    }
  },
  manageRecord: async ({ locals, request }) => {
    const ctx = openPortalRepository(locals);
    let values: Record<string, string> = {};
    try {
      const manager = new OwnerRecordManagement(ctx.sqlite);
      manager.assertOwner(ctx.principal);
      const form = await request.formData();
      values = Object.fromEntries([...form].map(([key, value]) => [key, String(value)]));
      if (form.get('confirmed') !== 'yes')
        return fail(400, {
          success: false,
          message: 'Confirm the operation',
          values,
          recordId: values.id ?? '',
        });
      manager.mutate(ctx.principal, {
        recordType: String(form.get('recordType')),
        id: String(form.get('id')),
        version: Number(form.get('version')),
        operation: String(form.get('operation')),
        reason: String(form.get('reason') ?? ''),
      });
      return { success: true, message: 'Changes saved' };
    } catch (caught) {
      return managementFailure(caught, values);
    } finally {
      ctx.sqlite.close();
    }
  },
};
