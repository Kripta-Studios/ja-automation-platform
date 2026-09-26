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
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

const initialProjectPeopleSchema = z.object({
  initialWorkerIds: z.array(uuidSchema).max(100),
  initialWorkersStartOn: z.union([z.literal(''), z.iso.date()]).optional(),
});

type KnownProjectRule = Readonly<{
  status: 400 | 403 | 409;
  code: string;
  messageKey: `problem.${string}`;
  message: string;
  remedy: string;
  field?: string;
}>;

const knownProjectRules: Record<string, KnownProjectRule> = {
  'Client administration required': {
    status: 403,
    code: 'CLIENT_ADMIN_REQUIRED',
    messageKey: 'problem.client.adminRequired',
    message:
      'You cannot change client records with this access. Contact an owner or finance administrator.',
    remedy: 'contact_owner',
  },
  'Project administration required': {
    status: 403,
    code: 'PROJECT_ADMIN_REQUIRED',
    messageKey: 'problem.project.adminRequired',
    message:
      'You cannot change project settings with this access. Contact an owner or finance administrator.',
    remedy: 'contact_owner',
  },
  'Assignment administration required': {
    status: 403,
    code: 'ASSIGNMENT_ADMIN_REQUIRED',
    messageKey: 'problem.assignment.adminRequired',
    message:
      'You cannot change this assignment with your current access. Contact the project owner.',
    remedy: 'contact_owner',
  },
  'Project assignment is not currently effective': {
    status: 403,
    code: 'ASSIGNMENT_MANAGER_SCOPE_ENDED',
    messageKey: 'problem.assignment.managerScopeEnded',
    message:
      'Your project assignment is no longer effective. Contact the project owner before making changes.',
    remedy: 'contact_owner',
  },
  'Project milestone administration required': {
    status: 403,
    code: 'MILESTONE_ADMIN_REQUIRED',
    messageKey: 'problem.milestone.roleRequired',
    message:
      'You cannot submit this milestone. Contact the project owner or an authorized manager.',
    remedy: 'contact_owner',
  },
  'Schedule administration required': {
    status: 403,
    code: 'PROJECT_SCHEDULE_ADMIN_REQUIRED',
    messageKey: 'problem.project.scheduleAdminRequired',
    message:
      'You cannot change this project schedule with your current access. Contact the project owner.',
    remedy: 'contact_owner',
  },
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
  'Project client not found': {
    status: 409,
    code: 'PROJECT_CLIENT_UNAVAILABLE',
    messageKey: 'problem.project.unavailable',
    message: 'This project is no longer available. Review the project list before continuing.',
    remedy: 'review_updated_record',
  },
  'Active project manager not found': {
    status: 400,
    code: 'PROJECT_MANAGER_UNAVAILABLE',
    messageKey: 'problem.project.managerUnavailable',
    message: 'The selected project manager is no longer active. Choose an available manager.',
    remedy: 'choose_available_manager',
    field: 'projectManagerId',
  },
  'Billing address is required for new clients': {
    status: 400,
    code: 'CLIENT_BILLING_ADDRESS_REQUIRED',
    messageKey: 'problem.client.billingAddressRequired',
    message: 'Enter a billing address before saving this client.',
    remedy: 'review_billing_contact',
    field: 'billingAddress',
  },
  'Billing address is required': {
    status: 400,
    code: 'CLIENT_BILLING_ADDRESS_REQUIRED',
    messageKey: 'problem.client.billingAddressRequired',
    message: 'Enter a billing address before saving this client.',
    remedy: 'review_billing_contact',
    field: 'billingAddress',
  },
  'Billing email is invalid': {
    status: 400,
    code: 'CLIENT_BILLING_EMAIL_INVALID',
    messageKey: 'problem.client.billingEmailInvalid',
    message: 'Enter a valid billing email address or use a billing contact name.',
    remedy: 'review_billing_contact',
    field: 'billingEmail',
  },
  'A billing contact name or billing email is required': {
    status: 400,
    code: 'CLIENT_BILLING_IDENTITY_REQUIRED',
    messageKey: 'problem.client.billingIdentityRequired',
    message: 'Enter a billing email address or billing contact name before saving this client.',
    remedy: 'add_billing_contact',
    field: 'billingEmail',
  },
  'Billing contact name is too long': {
    status: 400,
    code: 'CLIENT_BILLING_CONTACT_NAME_TOO_LONG',
    messageKey: 'problem.client.billingContactNameTooLong',
    message: 'Shorten the billing contact name to 160 characters or fewer.',
    remedy: 'review_billing_contact',
    field: 'billingContactName',
  },
  'PO / reference is too long': {
    status: 400,
    code: 'CLIENT_PO_REFERENCE_TOO_LONG',
    messageKey: 'problem.client.poReferenceTooLong',
    message: 'Shorten the PO or reference to 200 characters or fewer.',
    remedy: 'review_updated_record',
    field: 'poReference',
  },
  'Client notes are too long': {
    status: 400,
    code: 'CLIENT_NOTES_TOO_LONG',
    messageKey: 'problem.client.notesTooLong',
    message: 'Shorten the client notes to 5,000 characters or fewer.',
    remedy: 'review_updated_record',
    field: 'notes',
  },
  'Payment terms must be an integer between 0 and 365 days': {
    status: 400,
    code: 'CLIENT_PAYMENT_TERMS_INVALID',
    messageKey: 'problem.client.paymentTermsInvalid',
    message: 'Enter payment terms as a whole number from 0 to 365 days.',
    remedy: 'review_updated_record',
    field: 'paymentTermsDays',
  },
  'Client not found': {
    status: 400,
    code: 'CLIENT_UNAVAILABLE',
    messageKey: 'problem.client.unavailable',
    message: 'This client is no longer available. Review the client list before continuing.',
    remedy: 'review_updated_record',
  },
  'Contact not found': {
    status: 400,
    code: 'CLIENT_CONTACT_UNAVAILABLE',
    messageKey: 'problem.client.contactUnavailable',
    message: 'This contact is no longer available. Review the client contacts before continuing.',
    remedy: 'review_billing_contact',
  },
  'Contact changed before deletion': {
    status: 409,
    code: 'CLIENT_CONTACT_STALE',
    messageKey: 'problem.client.contactStale',
    message:
      'This contact changed before deletion. Review the current contact before trying again.',
    remedy: 'review_billing_contact',
  },
  'Client changed before deletion': {
    status: 409,
    code: 'CLIENT_STALE',
    messageKey: 'problem.client.stale',
    message:
      'This client changed while you were editing. Review the updated client before saving again.',
    remedy: 'review_updated_record',
  },
  'Project not found': {
    status: 400,
    code: 'PROJECT_UNAVAILABLE',
    messageKey: 'problem.project.unavailable',
    message: 'This project is no longer available. Review the project list before continuing.',
    remedy: 'review_updated_record',
  },
  'Project changed before update': {
    status: 409,
    code: 'PROJECT_STALE',
    messageKey: 'problem.project.stale',
    message:
      'This project changed while you were editing. Review its current status before saving again.',
    remedy: 'review_updated_record',
  },
  'Project changed before deletion': {
    status: 409,
    code: 'PROJECT_STALE',
    messageKey: 'problem.project.stale',
    message:
      'This project changed while you were editing. Review its current status before saving again.',
    remedy: 'review_updated_record',
  },
  'Project manager assignment changed before replacement': {
    status: 409,
    code: 'PROJECT_MANAGER_ASSIGNMENT_STALE',
    messageKey: 'problem.project.managerAssignmentStale',
    message:
      'The project manager assignment changed while you were editing. Review the current project before saving again.',
    remedy: 'review_updated_record',
  },
  'Project manager assignment changed before activation': {
    status: 409,
    code: 'PROJECT_MANAGER_ASSIGNMENT_STALE',
    messageKey: 'problem.project.managerAssignmentStale',
    message:
      'The project manager assignment changed while you were editing. Review the current project before saving again.',
    remedy: 'review_updated_record',
  },
  'Expected working hours must be between 0 and 24 hours': {
    status: 400,
    code: 'PROJECT_EXPECTED_HOURS_INVALID',
    messageKey: 'problem.project.expectedHoursInvalid',
    message: 'Enter expected working hours between 0 and 24 for each day.',
    remedy: 'review_project_dates',
    field: 'expectedHoursPerDay',
  },
  'Client daily minimum must be between 0 and 24 hours': {
    status: 400,
    code: 'PROJECT_CLIENT_DAILY_MINIMUM_INVALID',
    messageKey: 'problem.project.clientDailyMinimumInvalid',
    message:
      'Enter a customer billing minimum between 0 and 24 hours; this does not change worker pay.',
    remedy: 'review_updated_record',
    field: 'clientDailyMinimumHours',
  },
  'Planned end date must follow the project start date': {
    status: 400,
    code: 'PROJECT_DATE_RANGE_INVALID',
    messageKey: 'problem.project.dateRangeInvalid',
    message: 'The planned end date must be on or after the project start date. Review the dates.',
    remedy: 'review_project_dates',
    field: 'plannedEndDate',
  },
  'Planned end date must follow the start date': {
    status: 400,
    code: 'PROJECT_DATE_RANGE_INVALID',
    messageKey: 'problem.project.dateRangeInvalid',
    message: 'The planned end date must be on or after the project start date. Review the dates.',
    remedy: 'review_project_dates',
    field: 'plannedEndDate',
  },
  'Project budgets cannot be negative': {
    status: 400,
    code: 'PROJECT_BUDGET_NEGATIVE',
    messageKey: 'problem.project.budgetNegative',
    message: 'Project budgets cannot be negative. Review the entered amounts.',
    remedy: 'review_updated_record',
  },
  'Labor budget minutes are invalid': {
    status: 400,
    code: 'PROJECT_LABOR_BUDGET_INVALID',
    messageKey: 'problem.project.laborBudgetInvalid',
    message: 'Enter a non-negative whole number of labor budget minutes.',
    remedy: 'review_updated_record',
    field: 'laborBudgetMinutes',
  },
  'Cost center code must end in digits for the project number': {
    status: 400,
    code: 'PROJECT_COST_CENTER_FORMAT',
    messageKey: 'problem.project.costCenterFormat',
    message: 'End the cost center code with digits so a project number can be created.',
    remedy: 'review_updated_record',
    field: 'costCenterCode',
  },
  'Cost center code is already used by another project for this client': {
    status: 409,
    code: 'PROJECT_COST_CENTER_DUPLICATE',
    messageKey: 'problem.project.costCenterDuplicate',
    message: 'This client already has a project with that cost center code. Choose another code.',
    remedy: 'review_updated_record',
    field: 'costCenterCode',
  },
  'Project number cannot change after an invoice was created': {
    status: 409,
    code: 'PROJECT_NUMBER_LOCKED_BY_INVOICE',
    messageKey: 'problem.project.numberLockedByInvoice',
    message:
      'An invoice already uses this project number. Keep the current cost center code and review the project.',
    remedy: 'review_updated_record',
    field: 'costCenterCode',
  },
  'Invalid commercial model': {
    status: 400,
    code: 'PROJECT_COMMERCIAL_MODEL_INVALID',
    messageKey: 'problem.project.commercialModelInvalid',
    message: 'Choose a supported commercial model for this project.',
    remedy: 'review_updated_record',
    field: 'billingModel',
  },
  'Milestone changed or not found': {
    status: 409,
    code: 'MILESTONE_STALE',
    messageKey: 'problem.milestone.changed',
    message:
      'This milestone changed or was removed. Review the current milestone before submitting.',
    remedy: 'review_updated_record',
  },
  'Milestone cannot be submitted': {
    status: 409,
    code: 'MILESTONE_NOT_SUBMITTABLE',
    messageKey: 'problem.milestone.notSubmittable',
    message: 'Only a draft or rejected milestone can be submitted. Review its current status.',
    remedy: 'review_updated_record',
  },
  'Milestone amount must be positive': {
    status: 400,
    code: 'MILESTONE_AMOUNT_INVALID',
    messageKey: 'problem.milestone.amountInvalid',
    message: 'Enter a milestone amount greater than zero.',
    remedy: 'review_updated_record',
    field: 'amountMinor',
  },
  'Planning and schedules are only allowed on active, planned, or paused projects': {
    status: 409,
    code: 'PROJECT_SCHEDULE_BLOCKED_STATUS',
    messageKey: 'problem.project.scheduleBlockedStatus',
    message:
      'Schedules are allowed only for Active, Planned, or Paused projects. Review the project status.',
    remedy: 'review_project_status',
  },
  'Schedule minutes must be between 0 and 1440': {
    status: 400,
    code: 'PROJECT_SCHEDULE_MINUTES_INVALID',
    messageKey: 'problem.project.scheduleMinutesInvalid',
    message: 'Enter each day’s scheduled minutes as a whole number from 0 to 1,440.',
    remedy: 'review_updated_record',
  },
  'Assignment not found': {
    status: 400,
    code: 'ASSIGNMENT_UNAVAILABLE',
    messageKey: 'problem.assignment.unavailable',
    message: 'This assignment is no longer available. Review the current project assignments.',
    remedy: 'review_assignments',
  },
  'Assignment end date must follow the start date': {
    status: 400,
    code: 'ASSIGNMENT_DATE_RANGE_INVALID',
    messageKey: 'problem.assignment.dateRangeInvalid',
    message: 'The assignment end date must be on or after its start date. Review the dates.',
    remedy: 'review_assignments',
    field: 'endsOn',
  },
  'Immediate removal cannot use a future end date': {
    status: 400,
    code: 'ASSIGNMENT_REMOVAL_FUTURE_DATE',
    messageKey: 'problem.assignment.removalFutureDate',
    message: 'Immediate removal cannot use a future end date. Choose today or an earlier date.',
    remedy: 'review_assignments',
    field: 'endsOn',
  },
  'Planned minutes must be a non-negative safe integer': {
    status: 400,
    code: 'ASSIGNMENT_PLANNED_MINUTES_INVALID',
    messageKey: 'problem.assignment.plannedMinutesInvalid',
    message: 'Enter planned minutes as a non-negative whole number.',
    remedy: 'review_assignments',
    field: 'plannedMinutes',
  },
  'Assignment version is required': {
    status: 400,
    code: 'ASSIGNMENT_VERSION_REQUIRED',
    messageKey: 'problem.assignment.versionRequired',
    message: 'This assignment needs a current version. Review it before saving.',
    remedy: 'review_assignments',
    field: 'version',
  },
  'Select no more than 100 workers when creating a project': {
    status: 400,
    code: 'PROJECT_INITIAL_WORKER_LIMIT',
    messageKey: 'problem.project.initialWorkerLimit',
    message: 'Select no more than 100 workers when creating a project.',
    remedy: 'review_selected_workers',
    field: 'initialWorkerIds',
  },
  'Project manager assignment history is inconsistent': {
    status: 409,
    code: 'PROJECT_MANAGER_HISTORY_CONFLICT',
    messageKey: 'problem.project.managerHistoryConflict',
    message:
      'The project manager assignment history needs review before this change can be saved. Contact the owner.',
    remedy: 'contact_owner',
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
    role?: string;
  } = {},
) {
  if (
    !(
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof AccessDeniedError
    )
  )
    return null;
  const simpleField = /^(\w+) must be an integer(?: amount in minor units)?$/u.exec(error.message);
  const hoursField = /^(\w+) must be a number between 0 and 24$/u.exec(error.message);
  const rule: KnownProjectRule | null =
    knownProjectRules[error.message] ??
    (simpleField
      ? {
          status: 400,
          code: 'PROJECT_NUMBER_FIELD_INVALID',
          messageKey: 'problem.project.numberFieldInvalid',
          message: 'Enter a valid whole number or amount in the highlighted project field.',
          remedy: 'review_updated_record',
          field: simpleField[1],
        }
      : hoursField
        ? {
            status: 400,
            code: 'PROJECT_HOURS_FIELD_INVALID',
            messageKey: 'problem.project.hoursFieldInvalid',
            message: 'Enter a number of hours from 0 to 24 in the highlighted project field.',
            remedy: 'review_updated_record',
            field: hoursField[1],
          }
        : null);
  if (!rule) return null;
  const { correlationId, recordId, projectId, currentStatus, currentVersion, role, ...extra } =
    options;
  const remedy =
    rule.remedy === 'review_project_status' && role !== 'owner_admin'
      ? 'contact_owner'
      : rule.remedy === 'review_project_dates' && options.actionName === 'updateProject'
        ? 'review_updated_record'
        : rule.remedy;
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
      ...(rule.field ? { fieldErrors: { [rule.field]: [rule.messageKey] } } : {}),
      remedies: [
        {
          id: remedy,
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

function inputFailure(
  code: string,
  messageKey: `problem.${string}`,
  message: string,
  fieldErrors: Record<string, string[] | string | undefined>,
  extras: {
    actionName: string;
    values: Readonly<Record<string, unknown>>;
    correlationId?: string;
  },
  remedy = 'correct_fields',
) {
  return actionFail(400, messageKey, {}, message, {
    ...extras,
    code,
    fieldErrors,
    remedies: [{ id: remedy }],
  });
}

function schemaFieldErrors(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter(
      (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0,
    ),
  );
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
      return inputFailure(
        'CLIENT_FIELDS_INVALID',
        'problem.client.fieldsInvalid',
        'Some client details are missing or invalid. Correct the highlighted fields before saving.',
        schemaFieldErrors(parsed.error),
        { values, actionName: 'createClient', correlationId: locals.correlationId },
      );
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
    const extras = {
      correlationId: locals.correlationId,
      actionName: 'createClientContact',
      values: object,
    };
    const parsed = clientContactInputSchema.safeParse(object);
    if (!parsed.success)
      return inputFailure(
        'CLIENT_CONTACT_FIELDS_INVALID',
        'problem.client.contactFieldsInvalid',
        'Some contact details are missing or invalid. Correct the highlighted fields before saving.',
        schemaFieldErrors(parsed.error),
        extras,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createClientContact(context.principal, parsed.data);
      return actionSuccess('action.projects.clientContactSaved', {}, 'Client contact saved');
    } catch (error) {
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  updateProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const values = Object.fromEntries(data);
    const projectId = data.get('projectId')?.toString();
    if (!projectId)
      return inputFailure(
        'PROJECT_ID_REQUIRED',
        'problem.project.idRequired',
        'Select a project before saving these changes.',
        { projectId: ['problem.project.idRequired'] },
        { actionName: 'updateProject', values, correlationId: locals.correlationId },
      );
    const versionValue = data.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return inputFailure(
        'PROJECT_VERSION_REQUIRED',
        'problem.project.versionRequired',
        'The project version is missing or invalid. Review the current project before saving again.',
        { version: ['problem.project.versionRequired'] },
        { actionName: 'updateProject', values, correlationId: locals.correlationId },
        'review_updated_record',
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
      if (!Number.isInteger(parsed)) throw new ValidationError(`${name} must be an integer`);
      return parsed;
    };
    const money = (name: string): bigint | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (!value.trim()) return null;
      try {
        return BigInt(value);
      } catch {
        throw new ValidationError(`${name} must be an integer amount in minor units`);
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
          throw new ValidationError(`${hoursName} must be a number between 0 and 24`);
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
      const extras = {
        correlationId: locals.correlationId,
        projectId,
        actionName: 'updateProject',
        values,
        ...currentRecordState(context, 'project', projectId),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
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
      return inputFailure(
        'PROJECT_FIELDS_INVALID',
        'problem.project.fieldsInvalid',
        'Some project details or initial worker selections are missing or invalid. Correct the highlighted fields.',
        {
          ...(!parsed.success ? schemaFieldErrors(parsed.error) : {}),
          ...(!people.success ? schemaFieldErrors(people.error) : {}),
        },
        {
          values: retainedValues,
          actionName: 'createProject',
          correlationId: locals.correlationId,
        },
      );
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
            actionName: 'createProject',
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
            actionName: 'createProject',
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
            actionName: 'createProject',
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
            actionName: 'createProject',
            remedies: [{ id: 'review_project_dates' }],
            correlationId: locals.correlationId,
          },
        );
      return (
        knownProjectFailure(error, {
          correlationId: locals.correlationId,
          actionName: 'createProject',
          values: retainedValues,
        }) ??
        actionFailure(error, {
          correlationId: locals.correlationId,
          actionName: 'createProject',
          values: retainedValues,
        })
      );
    } finally {
      context.sqlite.close();
    }
  },
  createMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const extras = { correlationId: locals.correlationId, actionName: 'createMilestone', values };
    const parsed = milestoneInputSchema.safeParse(values);
    if (!parsed.success)
      return inputFailure(
        'MILESTONE_FIELDS_INVALID',
        'problem.milestone.fieldsInvalid',
        'Some milestone details are missing or invalid. Correct the highlighted fields.',
        schemaFieldErrors(parsed.error),
        extras,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createProjectMilestone(context.principal, parsed.data);
      return actionSuccess('action.projects.milestoneDraftSaved', {}, 'Milestone draft saved');
    } catch (error) {
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  submitMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const extras = { correlationId: locals.correlationId, actionName: 'submitMilestone', values };
    const parsed = versionedRecordSchema.safeParse(values);
    if (!parsed.success)
      return inputFailure(
        'MILESTONE_RECORD_INVALID',
        'problem.milestone.recordInvalid',
        'The milestone reference or version is invalid. Review the current milestone before submitting.',
        schemaFieldErrors(parsed.error),
        extras,
        'review_updated_record',
      );
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
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  updateSchedule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const extras = { correlationId: locals.correlationId, actionName: 'updateSchedule', values };
    const parsed = scheduleInputSchema.safeParse(values);
    if (!parsed.success)
      return inputFailure(
        'PROJECT_SCHEDULE_FIELDS_INVALID',
        'problem.project.scheduleFieldsInvalid',
        'The schedule has missing or invalid days, dates, or hours. Correct the highlighted fields.',
        schemaFieldErrors(parsed.error),
        extras,
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProjectSchedule(context.principal, parsed.data);
      return actionSuccess('action.projects.scheduleSaved', {}, 'Expected schedule saved');
    } catch (error) {
      return (
        knownProjectFailure(error, { ...extras, role: context.principal.role }) ??
        actionFailure(error, extras)
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
      return inputFailure(
        'ASSIGNMENT_FIELDS_INVALID',
        'problem.assignment.fieldsInvalid',
        'The assignment has missing or invalid project, worker, date, or time details. Correct the highlighted fields.',
        schemaFieldErrors(parsed.error),
        { actionName: 'assignWorker', values, correlationId: locals.correlationId },
      );
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
    const values = await formObject(request);
    const parsed = clientUpdateInputSchema.safeParse(values);
    if (!parsed.success)
      return inputFailure(
        'CLIENT_FIELDS_INVALID',
        'problem.client.fieldsInvalid',
        'Some client details or the version are missing or invalid. Correct the highlighted fields.',
        schemaFieldErrors(parsed.error),
        { values, actionName: 'updateClient', correlationId: locals.correlationId },
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
      const extras = {
        correlationId: locals.correlationId,
        recordId: clientId,
        actionName: 'updateClient',
        values,
        ...currentRecordState(context, 'client', clientId),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  transitionClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const values = Object.fromEntries(data);
    const clientId = data.get('clientId')?.toString();
    const status = data.get('status')?.toString();
    const version = Number(data.get('version'));
    const extras = { values, actionName: 'transitionClient', correlationId: locals.correlationId };
    if (!clientId)
      return inputFailure(
        'CLIENT_ID_REQUIRED',
        'problem.client.idRequired',
        'Select a client before changing its status.',
        { clientId: ['problem.client.idRequired'] },
        extras,
      );
    if (!Number.isInteger(version) || version < 1)
      return inputFailure(
        'CLIENT_VERSION_REQUIRED',
        'problem.client.versionRequired',
        'The client version is missing or invalid. Review the current client before changing its status.',
        { version: ['problem.client.versionRequired'] },
        extras,
        'review_updated_record',
      );
    if (!status || !['active', 'closed', 'archived', 'restore'].includes(status))
      return inputFailure(
        'CLIENT_TRANSITION_STATUS_INVALID',
        'problem.client.transitionStatusInvalid',
        'Choose a valid client status before saving.',
        { status: ['problem.client.transitionStatusInvalid'] },
        extras,
      );
    const reason = data.get('reason')?.toString().trim();
    if (!reason)
      return inputFailure(
        'CLIENT_TRANSITION_REASON_REQUIRED',
        'problem.client.transitionReasonRequired',
        'Enter a reason for changing the client status.',
        { reason: ['problem.client.transitionReasonRequired'] },
        extras,
      );
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
      const extras = {
        correlationId: locals.correlationId,
        recordId: clientId,
        actionName: 'transitionClient',
        values,
        ...currentRecordState(context, 'client', clientId),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  transitionProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const values = Object.fromEntries(data);
    const projectId = data.get('projectId')?.toString();
    const status = data.get('status')?.toString();
    const version = Number(data.get('version'));
    const extras = { values, actionName: 'transitionProject', correlationId: locals.correlationId };
    if (!projectId)
      return inputFailure(
        'PROJECT_ID_REQUIRED',
        'problem.project.idRequired',
        'Select a project before changing its status.',
        { projectId: ['problem.project.idRequired'] },
        extras,
      );
    if (!Number.isInteger(version) || version < 1)
      return inputFailure(
        'PROJECT_VERSION_REQUIRED',
        'problem.project.versionRequired',
        'The project version is missing or invalid. Review the current project before changing its status.',
        { version: ['problem.project.versionRequired'] },
        extras,
        'review_updated_record',
      );
    if (
      !status ||
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
      return inputFailure(
        'PROJECT_TRANSITION_STATUS_INVALID',
        'problem.project.transitionStatusInvalid',
        'Choose a valid project status before saving.',
        { status: ['problem.project.transitionStatusInvalid'] },
        extras,
      );
    const reason = data.get('reason')?.toString().trim();
    if (!reason)
      return inputFailure(
        'PROJECT_TRANSITION_REASON_REQUIRED',
        'problem.project.transitionReasonRequired',
        'Enter a reason for changing the project status.',
        { reason: ['problem.project.transitionReasonRequired'] },
        extras,
      );
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
      const extras = {
        correlationId: locals.correlationId,
        projectId,
        actionName: 'transitionProject',
        values,
        ...currentRecordState(context, 'project', projectId),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  archiveClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = Object.fromEntries(formData);
    const id = formData.get('clientId')?.toString();
    const version = Number(formData.get('version'));
    const extras = { values, actionName: 'archiveClient', correlationId: locals.correlationId };
    if (!id)
      return inputFailure(
        'CLIENT_ID_REQUIRED',
        'problem.client.idRequired',
        'Select a client before archiving it.',
        { clientId: ['problem.client.idRequired'] },
        extras,
      );
    if (!Number.isInteger(version) || version < 1)
      return inputFailure(
        'CLIENT_VERSION_REQUIRED',
        'problem.client.versionRequired',
        'The client version is missing or invalid. Review the current client before archiving it.',
        { version: ['problem.client.versionRequired'] },
        extras,
        'review_updated_record',
      );
    const reason = formData.get('reason')?.toString().trim();
    if (!reason)
      return inputFailure(
        'CLIENT_TRANSITION_REASON_REQUIRED',
        'problem.client.transitionReasonRequired',
        'Enter a reason for archiving the client.',
        { reason: ['problem.client.transitionReasonRequired'] },
        extras,
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
      const extras = {
        correlationId: locals.correlationId,
        recordId: id,
        actionName: 'archiveClient',
        values,
        ...currentRecordState(context, 'client', id),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  deleteClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = Object.fromEntries(formData);
    const id = formData.get('clientId')?.toString();
    if (!id)
      return inputFailure(
        'CLIENT_ID_REQUIRED',
        'problem.client.idRequired',
        'Select a client before deleting it.',
        { clientId: ['problem.client.idRequired'] },
        { values, actionName: 'deleteClient', correlationId: locals.correlationId },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteClient(context.principal, id);
      return actionSuccess('action.projects.clientDeleted', {}, 'Client deleted');
    } catch (error) {
      const extras = {
        correlationId: locals.correlationId,
        recordId: id,
        actionName: 'deleteClient',
        values,
        ...currentRecordState(context, 'client', id),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  deleteProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = Object.fromEntries(formData);
    const id = formData.get('projectId')?.toString();
    if (!id)
      return inputFailure(
        'PROJECT_ID_REQUIRED',
        'problem.project.idRequired',
        'Select a project before deleting it.',
        { projectId: ['problem.project.idRequired'] },
        { values, actionName: 'deleteProject', correlationId: locals.correlationId },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteProject(context.principal, id);
      return actionSuccess('action.projects.projectDeleted', {}, 'Project deleted');
    } catch (error) {
      const extras = {
        correlationId: locals.correlationId,
        projectId: id,
        actionName: 'deleteProject',
        values,
        ...currentRecordState(context, 'project', id),
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  updateClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = Object.fromEntries(formData);
    const id = formData.get('contactId')?.toString();
    if (!id)
      return inputFailure(
        'CLIENT_CONTACT_ID_REQUIRED',
        'problem.client.contactIdRequired',
        'Select a client contact before updating it.',
        { contactId: ['problem.client.contactIdRequired'] },
        { values, actionName: 'updateClientContact', correlationId: locals.correlationId },
      );

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
      const extras = {
        correlationId: locals.correlationId,
        recordId: id,
        actionName: 'updateClientContact',
        values,
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
    } finally {
      context.sqlite.close();
    }
  },
  deleteClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = Object.fromEntries(formData);
    const id = formData.get('contactId')?.toString();
    if (!id)
      return inputFailure(
        'CLIENT_CONTACT_ID_REQUIRED',
        'problem.client.contactIdRequired',
        'Select a client contact before deleting it.',
        { contactId: ['problem.client.contactIdRequired'] },
        { values, actionName: 'deleteClientContact', correlationId: locals.correlationId },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteClientContact(context.principal, id);
      return actionSuccess('action.projects.clientContactDeleted', {}, 'Client contact deleted');
    } catch (error) {
      const extras = {
        correlationId: locals.correlationId,
        recordId: id,
        actionName: 'deleteClientContact',
        values,
      };
      return knownProjectFailure(error, extras) ?? actionFailure(error, extras);
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
      return inputFailure(
        'ASSIGNMENT_ID_REQUIRED',
        'problem.assignment.idRequired',
        'Select an assignment before updating it.',
        { assignmentId: ['problem.assignment.idRequired'] },
        extras,
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return inputFailure(
        'ASSIGNMENT_VERSION_REQUIRED',
        'problem.assignment.versionRequired',
        'The assignment version is missing or invalid. Review the current assignment before saving.',
        { version: ['problem.assignment.versionRequired'] },
        extras,
        'review_assignments',
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
      return inputFailure(
        'ASSIGNMENT_ID_REQUIRED',
        'problem.assignment.idRequired',
        'Select an assignment before removing it.',
        { assignmentId: ['problem.assignment.idRequired'] },
        extras,
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return inputFailure(
        'ASSIGNMENT_VERSION_REQUIRED',
        'problem.assignment.versionRequired',
        'The assignment version is missing or invalid. Review the current assignment before removing it.',
        { version: ['problem.assignment.versionRequired'] },
        extras,
        'review_assignments',
      );
    const reason = formData.get('reason')?.toString().trim();
    if (!reason)
      return inputFailure(
        'ASSIGNMENT_REMOVAL_REASON_REQUIRED',
        'problem.assignment.removalReasonRequired',
        'Enter a reason for removing the assignment.',
        { reason: ['problem.assignment.removalReasonRequired'] },
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
      return inputFailure(
        'ASSIGNMENT_ID_REQUIRED',
        'problem.assignment.idRequired',
        'Select an assignment before deleting it.',
        { assignmentId: ['problem.assignment.idRequired'] },
        extras,
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return inputFailure(
        'ASSIGNMENT_VERSION_REQUIRED',
        'problem.assignment.versionRequired',
        'The assignment version is missing or invalid. Review the current assignment before deleting it.',
        { version: ['problem.assignment.versionRequired'] },
        extras,
        'review_assignments',
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
