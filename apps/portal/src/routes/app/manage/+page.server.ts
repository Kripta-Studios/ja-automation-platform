import { error, redirect } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ConflictError,
  OwnerRecordManagement,
  ownerRecordTypes,
  OwnerCatalogManagement,
  ownerCatalogs,
  ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { englishCoverageKey } from '$lib/i18n/coverage-translations';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import type { Actions, PageServerLoad } from './$types';
import {
  includesArchivedProjectHistory,
  normalizeVisibleProjectSelection,
  projectVisibility,
  visibleProjectRecords,
} from '$lib/portal/project-visibility';

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
    const includeArchived = includesArchivedProjectHistory(url.searchParams);
    const includeInactive = url.searchParams.get('includeInactive') === '1';
    const scope = projectVisibility(
      ctx.repository.listAssignedProjects(ctx.principal),
      includeArchived,
    );
    const projects = scope.projects;
    const requestedProjectId = url.searchParams.get('project') ?? '';
    const selectedProjectId = normalizeVisibleProjectSelection(
      requestedProjectId,
      scope.projectIds,
    );
    if (requestedProjectId && !selectedProjectId) {
      const canonical = new URL(url);
      canonical.searchParams.delete('project');
      canonical.searchParams.delete('focus');
      redirect(303, `${canonical.pathname}${canonical.search}`);
    }
    const records = visibleProjectRecords(
      manager.list(ctx.principal, recordType),
      scope.projectIds,
    ).filter((row) => !selectedProjectId || row.project_id === selectedProjectId);
    const workers = ctx.sqlite
      .prepare(
        `SELECT id,name,email,status FROM user WHERE role IN ('worker','project_manager')
         ${includeInactive ? '' : "AND status='active'"} ORDER BY name`,
      )
      .all() as { id: string; name: string; email: string; status: string }[];
    const workerIds = new Set(workers.map((worker) => worker.id));
    const catalogRows = area
      ? new OwnerCatalogManagement(ctx.sqlite)
          .list(ctx.principal, area)
          .filter((row) =>
            row.project_id
              ? scope.projectIds.has(String(row.project_id)) &&
                (!selectedProjectId || row.project_id === selectedProjectId)
              : true,
          )
          .filter((row) => area !== 'worker_availability' || workerIds.has(String(row.worker_id)))
      : [];
    const requestedFocusId = url.searchParams.get('focus') ?? '';
    const focusId = (area ? catalogRows : records).some((row) => row.id === requestedFocusId)
      ? requestedFocusId
      : '';
    if (requestedFocusId && !focusId) {
      const canonical = new URL(url);
      canonical.searchParams.delete('focus');
      redirect(303, `${canonical.pathname}${canonical.search}`);
    }
    // Counts describe current operational/configuration lists. Financial obligations
    // and issued/accounting history keep their complete historical counts.
    const historicalTables = new Set([
      'invoice',
      'billing_period',
      'payment',
      'compensation_settlement',
      'accounting_pack_run',
      'accounting_pack_revision',
      'legal_entity',
      'tax_profile',
      'invoice_number_policy',
    ]);
    function countVisible(table: string): number {
      const conditions: string[] = [];
      const values: string[] = [];
      if (!historicalTables.has(table)) {
        const columns = new Set(
          (ctx.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
            (column) => column.name,
          ),
        );
        if (table === 'project' || columns.has('project_id')) {
          const column = table === 'project' ? 'id' : 'project_id';
          const ids = [...scope.projectIds];
          conditions.push(
            `${column} IS NULL OR ${ids.length ? `${column} IN (${ids.map(() => '?').join(',')})` : '0'}`,
          );
          values.push(...ids);
        }
        if (!includeInactive && table === 'user') conditions.push("status='active'");
        if (!includeArchived && table === 'client') conditions.push("status<>'archived'");
        if (!includeArchived && table === 'client_contact')
          conditions.push("client_id IN (SELECT id FROM client WHERE status<>'archived')");
        if (!includeInactive && table === 'supplier') conditions.push("status='active'");
        if (!includeInactive && table === 'supplier_user_profile')
          conditions.push("user_id IN (SELECT id FROM user WHERE status='active')");
        if (!includeInactive && table === 'supplier_project_grant')
          conditions.push("supplier_id IN (SELECT id FROM supplier WHERE status='active')");
        if (!includeInactive && ['worker_skill', 'worker_availability'].includes(table))
          conditions.push("worker_id IN (SELECT id FROM user WHERE status='active')");
      }
      return Number(
        ctx.sqlite
          .prepare(
            `SELECT count(*) count FROM ${table}${conditions.length ? ` WHERE ${conditions.map((condition) => `(${condition})`).join(' AND ')}` : ''}`,
          )
          .get(...values)?.count ?? 0,
      );
    }
    return {
      managementUser: locals.user!,
      recordType,
      records,
      area,
      catalog: area ? ownerCatalogs[area]! : null,
      technicalReports: visibleProjectRecords(
        ctx.sqlite
          .prepare('SELECT id,project_id,system_name FROM technical_report ORDER BY system_name')
          .all(),
        scope.projectIds,
      ).filter((report) => !selectedProjectId || report.project_id === selectedProjectId),
      catalogRows,
      focusId,
      projects,
      selectedProjectId,
      workers,
      domains: domains.map((domain) => ({
        ...domain,
        counts: domain.tables.map((table) => ({
          table,
          count: countVisible(table),
        })),
      })),
    };
  } finally {
    ctx.sqlite.close();
  }
};

// Only known domain messages become user-facing causes; unexpected details remain sanitized.
const managementMessages: Record<string, `action.${string}`> = {
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

function managementRemedies(key: string, recordId: string) {
  if (key.includes('invoice') || key.includes('billing'))
    return [{ id: 'review_linked_invoice', recordId }];
  if (key.includes('reimbursement') || key.includes('settlement'))
    return [{ id: 'review_financial_history', recordId }];
  if (key.includes('correction') || key.includes('History') || key.includes('finalReport'))
    return [{ id: 'review_correction_path', recordId }];
  return [{ id: 'review_updated_record', recordId }];
}

const managementFields: Partial<Record<`action.${string}`, string>> = {
  'action.management.reason': 'reason',
  'action.management.windowOrder': 'ends_at',
  'action.management.amount': 'amount',
  'action.management.plannedMinutes': 'planned_minutes',
  'action.management.activeWorker': 'worker_id',
  'action.management.assignmentWindow': 'starts_at',
  'action.management.reportProject': 'technical_report_id',
  'action.management.safetyEvidence': 'validation',
};

function retainedValues(form: FormData): Record<string, string> {
  return Object.fromEntries(
    [...form]
      .filter(([key]) => key !== 'token' && key !== 'confirmed')
      .map(([key, value]) => [key, String(value)]),
  );
}

export function _managementFailure(caught: unknown, values: Record<string, string>) {
  if (caught instanceof AccessDeniedError && caught.message === 'Owner administration required')
    return actionFail(
      403,
      'problem.management.ownerRequired',
      {},
      'Owner access is required for this change. Contact an Owner.',
      {
        code: 'MANAGEMENT_OWNER_REQUIRED',
        values,
        recordId: values.id ?? '',
        remedies: [{ id: 'contact_owner' }],
      },
    );
  const rawMessage = caught instanceof Error ? caught.message : '';
  if (
    caught instanceof ValidationError &&
    (rawMessage === 'Invalid operation' || rawMessage === 'Invalid management operation')
  )
    return actionFail(
      400,
      'problem.management.operationInvalid',
      {},
      'This operation is unavailable for the selected record. Review the available actions before trying again.',
      {
        code: 'MANAGEMENT_OPERATION_INVALID',
        values,
        recordId: values.id ?? '',
        fieldErrors: { operation: ['problem.management.operationInvalid'] },
        remedies: [{ id: 'review_updated_record', recordId: values.id ?? '' }],
      },
    );
  const knownStatus =
    caught instanceof ValidationError ? 400 : caught instanceof ConflictError ? 409 : null;
  const knownKey =
    knownStatus && Object.hasOwn(managementMessages, rawMessage)
      ? managementMessages[rawMessage]
      : undefined;
  const catalog = values.kind ? ownerCatalogs[values.kind] : undefined;
  const invalidField =
    knownStatus === 400 && !knownKey
      ? (catalog?.fields ?? []).find((field) => rawMessage === `Invalid ${field.label}`)
      : undefined;
  const recordId = values.id ?? '';
  if (knownKey)
    return actionFail(knownStatus!, knownKey, {}, englishCoverageKey(knownKey), {
      values,
      recordId,
      remedies: managementRemedies(knownKey, recordId),
      ...(managementFields[knownKey]
        ? { fieldErrors: { [managementFields[knownKey]]: [knownKey] } }
        : {}),
    });
  if (invalidField)
    return actionFail(
      400,
      'action.management.invalidField',
      { fieldLabel: invalidField.label },
      `Check ${invalidField.label}: complete it with a valid value.`,
      { values, recordId, fieldErrors: { [invalidField.name]: ['Enter a valid value.'] } },
    );
  return actionFailure(caught, { values, recordId });
}

export const actions: Actions = {
  manageCatalog: async ({ locals, request }) => {
    const ctx = openPortalRepository(locals);
    let values: Record<string, string> = {};
    try {
      new OwnerRecordManagement(ctx.sqlite).assertOwner(ctx.principal);
      const form = await request.formData();
      values = retainedValues(form);
      if (form.get('confirmed') !== 'yes')
        return actionFail(
          400,
          'problem.management.confirmOperation',
          {},
          'Confirm the operation before saving.',
          {
            code: 'MANAGEMENT_CONFIRMATION_REQUIRED',
            values,
            recordId: values.id ?? '',
            fieldErrors: { confirmed: ['Confirm the operation'] },
          },
        );
      const kind = values.kind ?? '';
      if (!Object.hasOwn(ownerCatalogs, kind))
        return actionFail(
          400,
          'problem.management.kindInvalid',
          {},
          'Choose an available management area before saving.',
          {
            code: 'MANAGEMENT_KIND_INVALID',
            values,
            recordId: values.id ?? '',
            fieldErrors: { kind: ['problem.management.kindInvalid'] },
            remedies: [{ id: 'review_updated_record', recordId: values.id ?? '' }],
          },
        );
      const operation = values.operation ?? '';
      if (
        !['create', 'update', 'delete', 'restore'].includes(operation) ||
        (operation === 'restore' && kind !== 'document') ||
        (operation === 'create' && kind === 'document')
      )
        return actionFail(
          400,
          'problem.management.operationInvalid',
          {},
          'This operation is unavailable for the selected record. Review the available actions before trying again.',
          {
            code: 'MANAGEMENT_OPERATION_INVALID',
            values,
            recordId: values.id ?? '',
            fieldErrors: { operation: ['problem.management.operationInvalid'] },
            remedies: [{ id: 'review_updated_record', recordId: values.id ?? '' }],
          },
        );
      new OwnerCatalogManagement(ctx.sqlite).mutate(ctx.principal, {
        kind: String(form.get('kind')),
        id: String(form.get('id') ?? ''),
        token: String(form.get('token') ?? ''),
        operation: String(form.get('operation')),
        reason: String(form.get('reason') ?? ''),
        values: Object.fromEntries(form),
      });
      return actionSuccess('problem.notice.saved', {}, 'Changes saved');
    } catch (caught) {
      return _managementFailure(caught, values);
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
      values = retainedValues(form);
      if (form.get('confirmed') !== 'yes')
        return actionFail(
          400,
          'problem.management.confirmOperation',
          {},
          'Confirm the operation before saving.',
          {
            code: 'MANAGEMENT_CONFIRMATION_REQUIRED',
            values,
            recordId: values.id ?? '',
            fieldErrors: { confirmed: ['Confirm the operation'] },
          },
        );
      if (
        !ownerRecordTypes.includes((values.recordType ?? '') as (typeof ownerRecordTypes)[number])
      )
        return actionFail(
          400,
          'problem.management.recordTypeInvalid',
          {},
          'Choose an available record type before saving.',
          {
            code: 'MANAGEMENT_RECORD_TYPE_INVALID',
            values,
            recordId: values.id ?? '',
            fieldErrors: { recordType: ['problem.management.recordTypeInvalid'] },
            remedies: [{ id: 'review_updated_record', recordId: values.id ?? '' }],
          },
        );
      if (!['reopen', 'delete'].includes(values.operation ?? ''))
        return actionFail(
          400,
          'problem.management.operationInvalid',
          {},
          'This operation is unavailable for the selected record. Review the available actions before trying again.',
          {
            code: 'MANAGEMENT_OPERATION_INVALID',
            values,
            recordId: values.id ?? '',
            fieldErrors: { operation: ['problem.management.operationInvalid'] },
            remedies: [{ id: 'review_updated_record', recordId: values.id ?? '' }],
          },
        );
      const version = Number(values.version);
      if (!Number.isSafeInteger(version) || version < 1)
        return actionFail(
          400,
          'problem.management.versionInvalid',
          {},
          'This record version is missing or invalid. Review the updated record before trying again.',
          {
            code: 'MANAGEMENT_VERSION_INVALID',
            values,
            recordId: values.id ?? '',
            fieldErrors: { version: ['problem.management.versionInvalid'] },
            remedies: [{ id: 'review_updated_record', recordId: values.id ?? '' }],
          },
        );
      manager.mutate(ctx.principal, {
        recordType: String(form.get('recordType')),
        id: String(form.get('id')),
        version,
        operation: String(form.get('operation')),
        reason: String(form.get('reason') ?? ''),
      });
      return actionSuccess('problem.notice.saved', {}, 'Changes saved');
    } catch (caught) {
      return _managementFailure(caught, values);
    } finally {
      ctx.sqlite.close();
    }
  },
};
