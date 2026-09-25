import {
  assignmentInputSchema,
  clientContactInputSchema,
  clientInputSchema,
  clientUpdateInputSchema,
  milestoneInputSchema,
  projectInputSchema,
  scheduleInputSchema,
  uuidSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { z } from 'zod';
import { ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

const initialProjectPeopleSchema = z.object({
  initialWorkerIds: z.array(uuidSchema).max(100),
  initialWorkersStartOn: z.union([z.literal(''), z.iso.date()]).optional(),
});

type KnownProjectRule = Readonly<{
  status: 400 | 409;
  code: string;
  messageKey: `problem.${string}`;
  message: string;
  remedy: string;
  field?: string;
}>;

const knownProjectRules: Record<string, KnownProjectRule> = {
  'Client changed before update': {
    status: 409,
    code: 'CLIENT_STALE',
    messageKey: 'problem.client.stale',
    message:
      'This client changed while you were editing. Review the updated client before saving again.',
    remedy: 'review_updated_record',
  },
  'Client changed before lifecycle transition': {
    status: 409,
    code: 'CLIENT_STALE',
    messageKey: 'problem.client.stale',
    message:
      'This client changed while you were editing. Review the updated client before saving again.',
    remedy: 'review_updated_record',
  },
  'Project changed before lifecycle transition': {
    status: 409,
    code: 'PROJECT_STALE',
    messageKey: 'problem.project.stale',
    message:
      'This project changed while you were editing. Review its current status before saving again.',
    remedy: 'review_updated_record',
  },
  'Assignment changed before update': {
    status: 409,
    code: 'ASSIGNMENT_STALE',
    messageKey: 'problem.assignment.stale',
    message:
      'This assignment changed while you were editing. Review the latest dates before saving again.',
    remedy: 'review_assignments',
  },
  'Assignment changed before removal': {
    status: 409,
    code: 'ASSIGNMENT_STALE',
    messageKey: 'problem.assignment.stale',
    message:
      'This assignment changed while you were editing. Review the latest dates before saving again.',
    remedy: 'review_assignments',
  },
  'Client has projects that are not closed': {
    status: 409,
    code: 'CLIENT_CLOSE_OPEN_PROJECTS',
    messageKey: 'problem.client.closeOpenProjects',
    message: 'Close or archive the client’s open projects before closing the client.',
    remedy: 'review_client_projects',
  },
  'Archived client cannot receive an active project': {
    status: 409,
    code: 'PROJECT_CLIENT_ARCHIVED',
    messageKey: 'problem.project.clientArchived',
    message: 'The client is archived. Review the client’s status before activating this project.',
    remedy: 'review_client_status',
  },
  'Invalid client lifecycle transition': {
    status: 409,
    code: 'CLIENT_TRANSITION_NOT_ALLOWED',
    messageKey: 'problem.client.transitionNotAllowed',
    message: 'The requested client status change is not allowed from its current status.',
    remedy: 'review_updated_record',
  },
  'Invalid project lifecycle transition': {
    status: 409,
    code: 'PROJECT_TRANSITION_NOT_ALLOWED',
    messageKey: 'problem.project.transitionNotAllowed',
    message: 'The requested project status change is not allowed from its current status.',
    remedy: 'review_updated_record',
  },
  'Only archived records can be restored': {
    status: 409,
    code: 'RECORD_NOT_ARCHIVED',
    messageKey: 'problem.record.notArchived',
    message: 'Only an archived record can be restored. Review its current status.',
    remedy: 'review_updated_record',
  },
  'Archived record has no safe restore target': {
    status: 409,
    code: 'RECORD_RESTORE_TARGET_MISSING',
    messageKey: 'problem.record.restoreTargetMissing',
    message:
      'This archived record has no safe previous status to restore. Contact the owner for review.',
    remedy: 'contact_owner',
  },
  'Archived client has no safe restore target': {
    status: 409,
    code: 'CLIENT_RESTORE_TARGET_MISSING',
    messageKey: 'problem.record.restoreTargetMissing',
    message:
      'This archived client has no safe previous status to restore. Contact the owner for review.',
    remedy: 'contact_owner',
  },
  'Client has associated projects and cannot be deleted. Please delete or archive its projects first.':
    {
      status: 409,
      code: 'CLIENT_DELETE_HAS_PROJECTS',
      messageKey: 'problem.client.deleteHasProjects',
      message:
        'This client still has projects. Review those projects and archive the client instead if history must be kept.',
      remedy: 'review_client_projects',
    },
  'Client is referenced by invoice history and cannot be deleted. Please archive the client instead.':
    {
      status: 409,
      code: 'CLIENT_DELETE_HAS_INVOICES',
      messageKey: 'problem.client.deleteHasInvoices',
      message:
        'This client is referenced by invoice history. Archive the client instead of deleting it.',
      remedy: 'archive_client',
    },
  'Client contact is referenced by billing history and cannot be deleted': {
    status: 409,
    code: 'CLIENT_CONTACT_BILLING_HISTORY',
    messageKey: 'problem.client.contactBillingHistory',
    message:
      'This contact is used by billing history and cannot be deleted. Update the active billing contact instead.',
    remedy: 'review_billing_contact',
  },
  'A billing email or billing contact is required': {
    status: 400,
    code: 'CLIENT_BILLING_CONTACT_REQUIRED',
    messageKey: 'problem.client.billingContactRequired',
    message: 'Keep a billing email or another billing contact before removing this contact.',
    remedy: 'add_billing_contact',
    field: 'isBillingContact',
  },
  'Only active assignments can be edited': {
    status: 409,
    code: 'ASSIGNMENT_INACTIVE',
    messageKey: 'problem.assignment.inactive',
    message:
      'This assignment is no longer active. Review the current assignment before making changes.',
    remedy: 'review_assignments',
  },
  'Assignment is already inactive': {
    status: 409,
    code: 'ASSIGNMENT_INACTIVE',
    messageKey: 'problem.assignment.inactive',
    message:
      'This assignment is already inactive. Review the current assignment before making changes.',
    remedy: 'review_assignments',
  },
  'Worker already has an overlapping project assignment': {
    status: 409,
    code: 'PROJECT_ASSIGNMENT_OVERLAP',
    messageKey: 'problem.project.assignmentOverlap',
    message:
      'This worker already has an overlapping assignment on this project. Review the existing assignment dates.',
    remedy: 'review_assignments',
  },
  'Active client not found': {
    status: 400,
    code: 'PROJECT_ACTIVE_CLIENT_REQUIRED',
    messageKey: 'problem.project.activeClientRequired',
    message:
      'The selected client is no longer active. Choose an active client or review its status.',
    remedy: 'review_client_status',
    field: 'clientId',
  },
  'Active project manager not found': {
    status: 400,
    code: 'PROJECT_MANAGER_UNAVAILABLE',
    messageKey: 'problem.project.managerUnavailable',
    message: 'The selected project manager is no longer active. Choose an available manager.',
    remedy: 'choose_available_manager',
    field: 'projectManagerId',
  },
};

for (const [message, code, messageKey, subject] of [
  [
    'Project has recorded time entries and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_TIME',
    'problem.project.deleteHasTime',
    'time entries',
  ],
  [
    'Project has recorded expenses and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_EXPENSES',
    'problem.project.deleteHasExpenses',
    'expenses',
  ],
  [
    'Project has generated invoices and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_INVOICES',
    'problem.project.deleteHasInvoices',
    'invoices',
  ],
  [
    'Project has recorded daily field reports and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_DAILY_REPORTS',
    'problem.project.deleteHasDailyReports',
    'daily field reports',
  ],
  [
    'Project has recorded technical reports and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_TECHNICAL_REPORTS',
    'problem.project.deleteHasTechnicalReports',
    'technical reports',
  ],
] as const) {
  knownProjectRules[message] = {
    status: 409,
    code,
    messageKey,
    message: `This project has ${subject} and cannot be deleted. Archive the project instead.`,
    remedy: 'archive_project',
  };
}

function knownProjectFailure(
  error: unknown,
  options: {
    correlationId?: string;
    recordId?: string;
    projectId?: string;
    currentStatus?: string;
    currentVersion?: number;
    values?: Readonly<Record<string, unknown>>;
    actionName?: string;
  } = {},
) {
  if (!(error instanceof ConflictError || error instanceof ValidationError)) return null;
  const rule = knownProjectRules[error.message];
  if (!rule) return null;
  const { correlationId, recordId, projectId, currentStatus, currentVersion, ...extra } = options;
  return actionFail(
    rule.status,
    rule.messageKey,
    {
      ...(currentStatus ? { currentStatus } : {}),
      ...(currentVersion ? { currentVersion } : {}),
    },
    rule.message,
    {
      ...extra,
      code: rule.code,
      ...(rule.field ? { fieldErrors: { [rule.field]: [rule.message] } } : {}),
      remedies: [
        {
          id: rule.remedy,
          ...(projectId ? { projectId } : {}),
          ...(recordId ? { recordId } : {}),
        },
      ],
      correlationId,
    },
  );
}

function currentRecordState(
  context: ReturnType<typeof openPortalRepository>,
  kind: 'client' | 'project',
  id: string | undefined,
): { currentStatus?: string; currentVersion?: number } {
  if (!id) return {};
  const row = context.sqlite.prepare(`SELECT status,version FROM ${kind} WHERE id=?`).get(id) as
    | { status: string; version: number }
    | undefined;
  if (!row) return {};
  return {
    currentStatus: row.status.charAt(0).toUpperCase() + row.status.slice(1),
    currentVersion: row.version,
  };
}

function assignmentActionExtras(
  formData: FormData,
  actionName: 'updateAssignment' | 'removeAssignment' | 'deleteAssignment',
  correlationId?: string,
) {
  return { actionName, values: Object.fromEntries(formData), correlationId };
}

export const projectActions = {
  createClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = Object.fromEntries(
      [
        'clientCode',
        'legalName',
        'displayName',
        'currency',
        'timezone',
        'billingEmail',
        'billingContactName',
        'billingAddress',
        'paymentTermsDays',
        'poReference',
        'notes',
      ].map((key) => [key, typeof object[key] === 'string' ? object[key] : '']),
    );
    const parsed = clientInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.clientFields', {}, 'Check client fields', {
        fields: parsed.error.flatten().fieldErrors,
        values,
        actionName: 'createClient',
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createClient(context.principal, parsed.data);
      return actionSuccess(
        'action.projects.clientCreated',
        { clientNumber: result.clientNumber },
        `Created ${result.clientNumber}`,
      );
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          values,
          actionName: 'createClient',
        }) ?? actionFailure(error, { values, actionName: 'createClient' })
      );
    } finally {
      context.sqlite.close();
    }
  },
  createClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.isBillingContact = object.isBillingContact === 'on';
    object.isPrimary = object.isPrimary === 'on';
    const parsed = clientContactInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.contactFields', {}, 'Check contact fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createClientContact(context.principal, parsed.data);
      return actionSuccess('action.projects.clientContactSaved', {}, 'Client contact saved');
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const projectId = data.get('projectId')?.toString();
    if (!projectId)
      return actionFail(400, 'action.validation.projectIdRequired', {}, 'Project ID required');
    const versionValue = data.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Project version is required',
      );
    const text = (name: string): string | undefined => {
      const value = data.get(name);
      return value === null ? undefined : value.toString();
    };
    const integer = (name: string, nullable = false): number | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (!value.trim()) return nullable ? null : undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
      return parsed;
    };
    const money = (name: string): bigint | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (!value.trim()) return null;
      try {
        return BigInt(value);
      } catch {
        throw new Error(`${name} must be an integer amount in minor units`);
      }
    };
    const hoursToMinutes = (
      hoursName: string,
      minutesName: string,
      nullable = false,
    ): number | null | undefined => {
      const hoursVal = text(hoursName);
      if (hoursVal !== undefined) {
        if (!hoursVal.trim()) return nullable ? null : undefined;
        const parsed = Number(hoursVal);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24)
          throw new Error(`${hoursName} must be a number between 0 and 24`);
        return Math.round(parsed * 60);
      }
      return integer(minutesName, nullable);
    };
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProject(context.principal, {
        projectId,
        version,
        costCenterCode: text('costCenterCode'),
        name: text('name'),
        poNumber: text('poNumber'),
        description: text('description'),
        projectAlias: text('projectAlias'),
        timezone: text('timezone'),
        billingModel: text('billingModel'),
        siteName: text('siteName'),
        country: text('country'),
        projectManagerId: text('projectManagerId') || null,
        expectedMinutesPerDay:
          hoursToMinutes('expectedHoursPerDay', 'expectedMinutesPerDay') ?? undefined,
        clientDailyMinimumMinutes: hoursToMinutes(
          'clientDailyMinimumHours',
          'clientDailyMinimumMinutes',
          true,
        ),
        budgetMinor: money('budgetMinor'),
        revenueBudgetMinor: money('revenueBudgetMinor'),
        poCapMinor: money('poCapMinor'),
        fixedPriceMinor: money('fixedPriceMinor'),
        laborBudgetMinutes: integer('laborBudgetMinutes', true),
        travelBudgetMinor: money('travelBudgetMinor'),
        expenseBudgetMinor: money('expenseBudgetMinor'),
        otherCostBudgetMinor: money('otherCostBudgetMinor'),
        plannedMinutes: integer('plannedMinutes', true),
        contractNumber: text('contractNumber'),
        startDate: text('startDate'),
        plannedEndDate: text('plannedEndDate'),
        budgetType: text('budgetType'),
        weeklyCloseEnabled: data.has('weeklyCloseEnabled')
          ? data.get('weeklyCloseEnabled') === 'on'
          : undefined,
        dailyReportRequired: data.has('dailyReportRequired')
          ? data.get('dailyReportRequired') === 'on'
          : undefined,
        technicalReportingRequired: data.has('technicalReportingRequired')
          ? data.get('technicalReportingRequired') === 'on'
          : undefined,
        notes: text('notes'),
      });
      return actionSuccess('action.projects.projectUpdated', {}, 'Project updated');
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  createProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const initialWorkerIds = data.getAll('initialWorkerId').map((value) => value.toString());
    const values = Object.fromEntries(data) as Record<string, unknown>;
    delete values.initialWorkerId;
    delete values.initialWorkersStartOn;
    const people = initialProjectPeopleSchema.safeParse({
      initialWorkerIds,
      initialWorkersStartOn: data.get('initialWorkersStartOn')?.toString() ?? undefined,
    });
    const parsed = projectInputSchema.safeParse(values);
    const retainedValues = {
      ...values,
      initialWorkerIds,
      initialWorkersStartOn: data.get('initialWorkersStartOn')?.toString() ?? '',
    };
    if (!parsed.success || !people.success)
      return actionFail(400, 'action.validation.projectFields', {}, 'Check project fields', {
        fields: {
          ...(!parsed.success ? parsed.error.flatten().fieldErrors : {}),
          ...(!people.success ? people.error.flatten().fieldErrors : {}),
        },
        values: retainedValues,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createProject(context.principal, {
        ...parsed.data,
        initialWorkerIds: people.data.initialWorkerIds,
        initialWorkersStartOn: people.data.initialWorkersStartOn || undefined,
      });
      return actionSuccess(
        'action.projects.projectCreated',
        { projectNumber: result.projectNumber, projectId: result.id },
        `Created ${result.projectNumber}`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Project currency must match the client currency'
      )
        return actionFail(
          400,
          'problem.project.clientCurrencyMismatch',
          {},
          'Project currency must match the selected client’s currency.',
          {
            code: 'PROJECT_CLIENT_CURRENCY_MISMATCH',
            fieldErrors: { currency: [error.message] },
            values: retainedValues,
            remedies: [{ id: 'review_client_currency', recordId: parsed.data.clientId }],
            correlationId: locals.correlationId,
          },
        );
      if (error instanceof Error && /^Selected worker \d+ is duplicated$/u.test(error.message))
        return actionFail(
          400,
          'problem.project.initialWorkerDuplicate',
          {},
          'A worker was selected more than once. Keep one entry for each worker.',
          {
            code: 'PROJECT_INITIAL_WORKER_DUPLICATE',
            fieldErrors: { initialWorkerIds: [error.message] },
            values: retainedValues,
            remedies: [{ id: 'review_selected_workers' }],
            correlationId: locals.correlationId,
          },
        );
      if (
        error instanceof Error &&
        /^Selected worker \d+ is not an active workforce member$/u.test(error.message)
      )
        return actionFail(
          400,
          'problem.project.initialWorkerUnavailable',
          {},
          'A selected worker is no longer active. Choose an available worker.',
          {
            code: 'PROJECT_INITIAL_WORKER_UNAVAILABLE',
            fieldErrors: { initialWorkerIds: [error.message] },
            values: retainedValues,
            remedies: [{ id: 'choose_available_worker' }],
            correlationId: locals.correlationId,
          },
        );
      if (
        error instanceof Error &&
        error.message === 'Worker assignment start date must be within project dates'
      )
        return actionFail(
          400,
          'problem.project.initialWorkerDateOutsideProject',
          {},
          'The worker assignment must start within the project dates. Review the start date.',
          {
            code: 'PROJECT_INITIAL_WORKER_DATE_OUTSIDE_PROJECT',
            fieldErrors: { initialWorkersStartOn: [error.message] },
            values: retainedValues,
            remedies: [{ id: 'review_project_dates' }],
            correlationId: locals.correlationId,
          },
        );
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  createMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = milestoneInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.milestoneFields', {}, 'Check milestone fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createProjectMilestone(context.principal, parsed.data);
      return actionSuccess('action.projects.milestoneDraftSaved', {}, 'Milestone draft saved');
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  submitMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.milestoneRecord', {}, 'Invalid milestone record');
    const context = openPortalRepository(locals);
    try {
      context.repository.submitProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.version,
      );
      return actionSuccess(
        'action.projects.milestoneSubmitted',
        {},
        'Milestone submitted for review',
      );
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateSchedule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = scheduleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.scheduleFields', {}, 'Check schedule fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProjectSchedule(context.principal, parsed.data);
      return actionSuccess('action.projects.scheduleSaved', {}, 'Expected schedule saved');
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  assignWorker: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = Object.fromEntries(
      ['projectId', 'workerId', 'startsOn', 'endsOn', 'plannedMinutes'].map((key) => [
        key,
        typeof object[key] === 'string' ? object[key] : '',
      ]),
    );
    const parsed = assignmentInputSchema.safeParse(object);
    if (!parsed.success) {
      const fields = Object.fromEntries(
        Object.keys(parsed.error.flatten().fieldErrors).map((field) => [
          field,
          [
            field === 'startsOn' || field === 'endsOn'
              ? 'Enter a valid date.'
              : field === 'plannedMinutes'
                ? 'Enter a valid number.'
                : 'Please select an option.',
          ],
        ]),
      );
      return actionFail(400, 'action.validation.assignmentFields', {}, 'Check assignment fields', {
        fields,
        actionName: 'assignWorker',
        values,
        correlationId: locals.correlationId,
      });
    }
    const context = openPortalRepository(locals);
    try {
      context.repository.assignWorker(context.principal, parsed.data);
      return actionSuccess('action.projects.assignmentCreated', {}, 'Assignment created');
    } catch (error) {
      const domainCode = error instanceof Error ? (error as Error & { code?: string }).code : null;
      if (domainCode === 'PROJECT_ASSIGNMENT_OVERLAP')
        return actionFail(
          409,
          'problem.project.assignmentOverlap',
          {},
          'This worker already has an overlapping assignment on this project. Review the existing assignment dates.',
          {
            code: domainCode,
            actionName: 'assignWorker',
            values,
            remedies: [{ id: 'review_assignments', projectId: parsed.data.projectId }],
            correlationId: locals.correlationId,
          },
        );
      if (error instanceof Error && error.message === 'Active workforce member not found')
        return actionFail(
          400,
          'problem.project.assignmentWorkerUnavailable',
          {},
          'This worker is no longer active. Choose an available worker before assigning.',
          {
            code: 'PROJECT_ASSIGNMENT_WORKER_UNAVAILABLE',
            actionName: 'assignWorker',
            values,
            fieldErrors: { workerId: ['Choose an active worker.'] },
            remedies: [{ id: 'choose_available_worker' }],
            correlationId: locals.correlationId,
          },
        );
      const blockedStatus =
        error instanceof Error &&
        (error as Error & { code?: string }).code === 'PROJECT_ASSIGNMENT_BLOCKED_STATUS';
      return actionFailure(error, {
        actionName: 'assignWorker',
        values,
        correlationId: locals.correlationId,
        ...(blockedStatus
          ? {
              remedies:
                context.principal.role === 'owner_admin'
                  ? [{ id: 'review_project_status', projectId: parsed.data.projectId }]
                  : [{ id: 'contact_project_owner' }],
            }
          : {}),
      });
    } finally {
      context.sqlite.close();
    }
  },
  updateClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = clientUpdateInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.clientFields',
        {},
        'Check client fields and version',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const { clientId, version, ...input } = {
      ...parsed.data,
      // The repository keeps the update contract string-based while treating
      // an explicit empty string as the intentional clear operation.
      clientCode: parsed.data.clientCode === null ? '' : parsed.data.clientCode,
    };

    const context = openPortalRepository(locals);
    try {
      context.repository.updateClient(context.principal, clientId, input, version);
      return actionSuccess('action.projects.clientUpdated', {}, 'Client updated');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: clientId,
          actionName: 'updateClient',
          ...currentRecordState(context, 'client', clientId),
        }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  transitionClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const clientId = data.get('clientId')?.toString();
    const status = data.get('status')?.toString();
    const version = Number(data.get('version'));
    if (!clientId || !status || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid client transition');
    const reason = data.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A transition reason is required',
      );
    if (!['active', 'closed', 'archived', 'restore'].includes(status))
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid client transition');
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.transitionClient(context.principal, {
        clientId,
        status: status as 'active' | 'closed' | 'archived' | 'restore',
        version,
        reason,
      });
      return actionSuccess(
        'action.projects.clientUpdated',
        { status: result.status },
        'Client lifecycle updated',
      );
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: clientId,
          actionName: 'transitionClient',
          ...currentRecordState(context, 'client', clientId),
        }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  transitionProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const projectId = data.get('projectId')?.toString();
    const status = data.get('status')?.toString();
    const version = Number(data.get('version'));
    if (!projectId || !status || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid project transition');
    const reason = data.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A transition reason is required',
      );
    if (
      ![
        'draft',
        'planned',
        'active',
        'paused',
        'closing',
        'closed',
        'archived',
        'restore',
      ].includes(status)
    )
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid project transition');
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.transitionProject(context.principal, {
        projectId,
        status: status as
          | 'draft'
          | 'planned'
          | 'active'
          | 'paused'
          | 'closing'
          | 'closed'
          | 'archived'
          | 'restore',
        version,
        reason,
      });
      return actionSuccess(
        'action.projects.projectUpdated',
        { status: result.status },
        'Project lifecycle updated',
      );
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          projectId,
          actionName: 'transitionProject',
          ...currentRecordState(context, 'project', projectId),
        }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  archiveClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('clientId')?.toString();
    const version = Number(formData.get('version'));
    if (!id || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid client transition');
    const reason = formData.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A transition reason is required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.transitionClient(context.principal, {
        clientId: id,
        status: 'archived',
        version,
        reason,
      });
      return actionSuccess('action.projects.clientArchived', {}, 'Client archived');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: id,
          actionName: 'archiveClient',
          ...currentRecordState(context, 'client', id),
        }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  deleteClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('clientId')?.toString();
    if (!id) return actionFail(400, 'action.validation.clientIdRequired', {}, 'Client ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteClient(context.principal, id);
      return actionSuccess('action.projects.clientDeleted', {}, 'Client deleted');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: id,
          actionName: 'deleteClient',
          ...currentRecordState(context, 'client', id),
        }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  deleteProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('projectId')?.toString();
    if (!id)
      return actionFail(400, 'action.validation.projectIdRequired', {}, 'Project ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteProject(context.principal, id);
      return actionSuccess('action.projects.projectDeleted', {}, 'Project deleted');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          projectId: id,
          actionName: 'deleteProject',
          ...currentRecordState(context, 'project', id),
        }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('contactId')?.toString();
    if (!id)
      return actionFail(400, 'action.validation.contactIdRequired', {}, 'Contact ID required');

    const input: Record<string, unknown> = {};
    if (formData.has('name')) input.name = formData.get('name')?.toString();
    if (formData.has('email')) input.email = formData.get('email')?.toString();
    if (formData.has('phone')) input.phone = formData.get('phone')?.toString();
    if (formData.has('role')) input.role = formData.get('role')?.toString();
    if (formData.has('isBillingContactPresent') || formData.has('isBillingContact'))
      input.isBillingContact = formData.get('isBillingContact')?.toString() === 'on';
    if (formData.has('isPrimaryPresent') || formData.has('isPrimary'))
      input.isPrimary = formData.get('isPrimary')?.toString() === 'on';

    const context = openPortalRepository(locals);
    try {
      context.repository.updateClientContact(context.principal, id, input);
      return actionSuccess('action.projects.clientContactUpdated', {}, 'Client contact updated');
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  deleteClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('contactId')?.toString();
    if (!id)
      return actionFail(400, 'action.validation.contactIdRequired', {}, 'Contact ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteClientContact(context.principal, id);
      return actionSuccess('action.projects.clientContactDeleted', {}, 'Client contact deleted');
    } catch (error) {
      return (
        knownProjectFailure(error, { correlationId: locals.correlationId }) ?? actionFailure(error)
      );
    } finally {
      context.sqlite.close();
    }
  },
  updateAssignment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const extras = assignmentActionExtras(formData, 'updateAssignment', locals.correlationId);
    const id = formData.get('assignmentId')?.toString();
    if (!id)
      return actionFail(
        400,
        'action.validation.assignmentIdRequired',
        {},
        'Assignment ID required',
        extras,
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Assignment version is required',
        extras,
      );

    const input: {
      startsOn?: string;
      endsOn?: string;
      plannedMinutes?: number;
      canReview?: boolean;
      version: number;
    } = { version };
    if (formData.has('startsOn')) input.startsOn = formData.get('startsOn')?.toString();
    if (formData.has('endsOn')) input.endsOn = formData.get('endsOn')?.toString() ?? '';
    if (formData.has('plannedMinutes')) {
      const plannedMinutes = formData.get('plannedMinutes')?.toString() ?? '';
      input.plannedMinutes =
        plannedMinutes === ''
          ? 0
          : /^\d+$/u.test(plannedMinutes)
            ? Number(plannedMinutes)
            : Number.NaN;
    }
    if (formData.has('canReviewPresent') || formData.has('canReview'))
      input.canReview = formData.get('canReview')?.toString() === 'on';
    input.version = version;

    const context = openPortalRepository(locals);
    try {
      context.repository.updateAssignment(context.principal, id, input);
      return actionSuccess('action.projects.assignmentUpdated', {}, 'Assignment updated');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: id,
          actionName: 'updateAssignment',
          values: extras.values,
        }) ?? actionFailure(error, extras)
      );
    } finally {
      context.sqlite.close();
    }
  },
  removeAssignment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const extras = assignmentActionExtras(formData, 'removeAssignment', locals.correlationId);
    const id = formData.get('assignmentId')?.toString();
    if (!id)
      return actionFail(
        400,
        'action.validation.assignmentIdRequired',
        {},
        'Assignment ID required',
        extras,
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Assignment version is required',
        extras,
      );
    const reason = formData.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A removal reason is required',
        extras,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.removeAssignment(context.principal, id, {
        endsOn: formData.get('endsOn')?.toString() || undefined,
        reason,
        version,
      });
      return actionSuccess('action.projects.assignmentDeleted', {}, 'Assignment removed');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: id,
          actionName: 'removeAssignment',
          values: extras.values,
        }) ?? actionFailure(error, extras)
      );
    } finally {
      context.sqlite.close();
    }
  },
  deleteAssignment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const extras = assignmentActionExtras(formData, 'deleteAssignment', locals.correlationId);
    const id = formData.get('assignmentId')?.toString();
    if (!id)
      return actionFail(
        400,
        'action.validation.assignmentIdRequired',
        {},
        'Assignment ID required',
        extras,
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Assignment version is required',
        extras,
      );
    const reason =
      formData.get('reason')?.toString().trim() || 'Removed by an authorized administrator';
    const context = openPortalRepository(locals);
    try {
      context.repository.removeAssignment(context.principal, id, {
        reason,
        endsOn: formData.get('endsOn')?.toString() || undefined,
        version,
      });
      return actionSuccess('action.projects.assignmentDeleted', {}, 'Assignment removed');
    } catch (error) {
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          recordId: id,
          actionName: 'deleteAssignment',
          values: extras.values,
        }) ?? actionFailure(error, extras)
      );
    } finally {
      context.sqlite.close();
    }
  },
};
