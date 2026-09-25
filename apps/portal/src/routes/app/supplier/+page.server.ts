import { randomUUID } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import {
  openSupplierContext,
  supplierPeriod,
  supplierReadFailure,
} from '$lib/server/supplier-context';
import { actionFail, actionFailure } from '$lib/server/actions/action-message';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';

type SupplierRule = {
  code: string;
  key: `problem.${string}`;
  field?: string;
  remedy: string;
};

/** Match repository wording at this boundary; codes and catalog keys are the public contract. */
const supplierRules: Record<string, SupplierRule> = {
  'Supplier name already exists': {
    code: 'SUPPLIER_NAME_EXISTS',
    key: 'problem.supplier.nameExists',
    field: 'name',
    remedy: 'review_supplier_directory',
  },
  'Supplier email is invalid': {
    code: 'SUPPLIER_EMAIL_INVALID',
    key: 'problem.supplier.emailInvalid',
    field: 'contactEmail',
    remedy: 'correct_supplier_field',
  },
  'Technician email is invalid': {
    code: 'SUPPLIER_TECHNICIAN_EMAIL_INVALID',
    key: 'problem.supplier.technicianEmailInvalid',
    field: 'email',
    remedy: 'correct_supplier_field',
  },
  'Technician email already belongs to an account': {
    code: 'SUPPLIER_TECHNICIAN_EMAIL_USED',
    key: 'problem.supplier.technicianEmailUsed',
    field: 'email',
    remedy: 'review_supplier_directory',
  },
  'Manage login email from the account profile': {
    code: 'SUPPLIER_LOGIN_EMAIL_MANAGED',
    key: 'problem.supplier.loginEmailManaged',
    field: 'email',
    remedy: 'review_user_access',
  },
  'Active supplier required': {
    code: 'SUPPLIER_ACTIVE_REQUIRED',
    key: 'problem.supplier.activeRequired',
    field: 'supplierId',
    remedy: 'review_supplier_directory',
  },
  'Supplier not found': {
    code: 'SUPPLIER_NOT_FOUND',
    key: 'problem.supplier.notFound',
    remedy: 'review_supplier_directory',
  },
  'Supplier technician required': {
    code: 'SUPPLIER_TECHNICIAN_UNAVAILABLE',
    key: 'problem.supplier.technicianUnavailable',
    field: 'workerId',
    remedy: 'choose_technician',
  },
  'Active or suspended supplier technician required': {
    code: 'SUPPLIER_TECHNICIAN_STATUS_BLOCKED',
    key: 'problem.supplier.technicianStatusBlocked',
    remedy: 'review_supplier_directory',
  },
  'Operational project required': {
    code: 'SUPPLIER_OPERATIONAL_PROJECT_REQUIRED',
    key: 'problem.supplier.operationalProjectRequired',
    field: 'projectId',
    remedy: 'choose_operational_project',
  },
  'Active supplier coordinator required': {
    code: 'SUPPLIER_COORDINATOR_UNAVAILABLE',
    key: 'problem.supplier.coordinatorUnavailable',
    field: 'coordinatorId',
    remedy: 'review_supplier_profile',
  },
  'Supplier coordinators require a usable login account': {
    code: 'SUPPLIER_COORDINATOR_LOGIN_REQUIRED',
    key: 'problem.supplier.coordinatorLoginRequired',
    field: 'userId',
    remedy: 'review_user_access',
  },
  'Only existing worker accounts can receive a supplier profile': {
    code: 'SUPPLIER_PROFILE_WORKER_REQUIRED',
    key: 'problem.supplier.profileWorkerRequired',
    field: 'userId',
    remedy: 'review_user_access',
  },
  'Supplier profile with canonical time history cannot be reassigned': {
    code: 'SUPPLIER_PROFILE_HISTORY_LOCKED',
    key: 'problem.supplier.profileHistoryLocked',
    field: 'supplierId',
    remedy: 'review_supplier_profile',
  },
  'Supplier project grant overlaps an active grant': {
    code: 'SUPPLIER_GRANT_OVERLAP',
    key: 'problem.supplier.grantOverlap',
    remedy: 'review_supplier_grants',
  },
  'Active supplier project grant required': {
    code: 'SUPPLIER_GRANT_CHANGED',
    key: 'problem.supplier.grantChanged',
    remedy: 'review_supplier_grants',
  },
  'Technician assignment already exists': {
    code: 'SUPPLIER_ASSIGNMENT_EXISTS',
    key: 'problem.supplier.assignmentExists',
    remedy: 'review_supplier_assignments',
  },
  'End date must follow start date': {
    code: 'SUPPLIER_DATE_ORDER_INVALID',
    key: 'problem.supplier.dateOrderInvalid',
    field: 'endsOn',
    remedy: 'correct_supplier_field',
  },
  'Select at least one technician': {
    code: 'SUPPLIER_BATCH_TECHNICIAN_REQUIRED',
    key: 'problem.supplier.batchTechnicianRequired',
    field: 'workerIds',
    remedy: 'choose_technician',
  },
  'A time batch is limited to 100 technicians': {
    code: 'SUPPLIER_BATCH_LIMIT',
    key: 'problem.supplier.batchLimit',
    field: 'workerIds',
    remedy: 'choose_technician',
  },
  'Batch request was already used with different values': {
    code: 'SUPPLIER_BATCH_REPLAY_CHANGED',
    key: 'problem.supplier.batchReplayChanged',
    remedy: 'review_saved_drafts',
  },
  'Select at least one draft': {
    code: 'SUPPLIER_DRAFT_REQUIRED',
    key: 'problem.supplier.draftRequired',
    field: 'entries',
    remedy: 'review_time_drafts',
  },
  'A submission batch is limited to 100 drafts': {
    code: 'SUPPLIER_DRAFT_BATCH_LIMIT',
    key: 'problem.supplier.draftBatchLimit',
    field: 'entries',
    remedy: 'review_time_drafts',
  },
  'The selected drafts are invalid': {
    code: 'SUPPLIER_DRAFT_SELECTION_INVALID',
    key: 'problem.supplier.draftSelectionInvalid',
    field: 'entries',
    remedy: 'review_time_drafts',
  },
  'Time entry changed or cannot be submitted': {
    code: 'SUPPLIER_TIME_SUBMIT_STALE',
    key: 'problem.supplier.timeSubmitStale',
    remedy: 'review_time_drafts',
  },
  'Time entry changed or cannot be edited': {
    code: 'SUPPLIER_TIME_EDIT_STALE',
    key: 'problem.supplier.timeEditStale',
    remedy: 'review_time_drafts',
  },
  'Time entry changed or cannot be discarded': {
    code: 'SUPPLIER_TIME_DISCARD_STALE',
    key: 'problem.supplier.timeDiscardStale',
    remedy: 'review_time_drafts',
  },
  'Time entry changed or cannot be deleted': {
    code: 'SUPPLIER_TIME_DISCARD_STALE',
    key: 'problem.supplier.timeDiscardStale',
    remedy: 'review_time_drafts',
  },
  'Refresh this draft before discarding it': {
    code: 'SUPPLIER_TIME_DISCARD_STALE',
    key: 'problem.supplier.timeDiscardStale',
    remedy: 'review_time_drafts',
  },
  'Only an unlocked never-submitted time draft can change': {
    code: 'SUPPLIER_TIME_DRAFT_LOCKED',
    key: 'problem.supplier.timeDraftLocked',
    remedy: 'review_time_drafts',
  },
  'A linked correction draft cannot be edited': {
    code: 'SUPPLIER_TIME_CORRECTION_LOCKED',
    key: 'problem.supplier.timeCorrectionLocked',
    remedy: 'review_time_drafts',
  },
  'Returned, submitted, or approved time requires the reviewed correction path': {
    code: 'SUPPLIER_TIME_CORRECTION_REQUIRED',
    key: 'problem.supplier.timeCorrectionRequired',
    remedy: 'review_time_drafts',
  },
  'A correction draft already exists for this time entry': {
    code: 'SUPPLIER_TIME_CORRECTION_EXISTS',
    key: 'problem.supplier.timeCorrectionExists',
    remedy: 'review_time_drafts',
  },
  'Only approved or reviewer-returned time can create a correction draft': {
    code: 'SUPPLIER_TIME_CORRECTION_STATE',
    key: 'problem.supplier.timeCorrectionState',
    remedy: 'review_time_drafts',
  },
  'Financially finalized time requires an explicit adjustment': {
    code: 'SUPPLIER_TIME_FINANCE_LOCKED',
    key: 'problem.supplier.timeFinanceLocked',
    remedy: 'contact_owner',
  },
  'Correction request conflicts with prior replay': {
    code: 'SUPPLIER_TIME_CORRECTION_REPLAY',
    key: 'problem.supplier.timeCorrectionReplay',
    remedy: 'review_time_drafts',
  },
  'Correction reason must contain at least 3 characters': {
    code: 'SUPPLIER_TIME_CORRECTION_REASON',
    key: 'problem.supplier.timeCorrectionReason',
    field: 'reason',
    remedy: 'correct_supplier_field',
  },
  'Change at least one operational field before creating a correction': {
    code: 'SUPPLIER_TIME_CORRECTION_EMPTY',
    key: 'problem.supplier.timeCorrectionEmpty',
    remedy: 'review_time_drafts',
  },
  'This crew time is linked to an allocated receipt; its work date cannot change': {
    code: 'SUPPLIER_TIME_LINKED_RECEIPT_DATE',
    key: 'problem.time.allocatedReceiptDateLocked',
    field: 'workDate',
    remedy: 'review_time_drafts',
  },
  'This crew time is linked to an allocated receipt and cannot be deleted': {
    code: 'SUPPLIER_TIME_LINKED_RECEIPT',
    key: 'problem.time.allocatedReceipt',
    remedy: 'review_time_drafts',
  },
  'Locked or invoiced time is immutable and cannot be voided': {
    code: 'SUPPLIER_TIME_FINANCE_LOCKED',
    key: 'problem.supplier.timeFinanceLocked',
    remedy: 'contact_owner',
  },
  'Correction drafts are immutable and cannot be deleted': {
    code: 'SUPPLIER_TIME_CORRECTION_LOCKED',
    key: 'problem.supplier.timeCorrectionLocked',
    remedy: 'review_time_drafts',
  },
  'Invalid supplier status': {
    code: 'SUPPLIER_STATUS_INVALID',
    key: 'problem.supplier.statusInvalid',
    field: 'status',
    remedy: 'review_supplier_directory',
  },
  'Invalid technician status': {
    code: 'SUPPLIER_TECHNICIAN_STATUS_INVALID',
    key: 'problem.supplier.technicianStatusInvalid',
    field: 'status',
    remedy: 'review_supplier_directory',
  },
  'Choose shared or individual hours': {
    code: 'SUPPLIER_BATCH_MODE_INVALID',
    key: 'problem.supplier.batchModeInvalid',
    field: 'batchMode',
    remedy: 'correct_supplier_field',
  },
  'Enter hours for every selected technician': {
    code: 'SUPPLIER_BATCH_HOURS_REQUIRED',
    key: 'problem.supplier.batchHoursRequired',
    field: 'workerHours',
    remedy: 'correct_supplier_field',
  },
  'Enter valid hours for every selected technician': {
    code: 'SUPPLIER_BATCH_HOURS_INVALID',
    key: 'problem.supplier.batchHoursInvalid',
    field: 'workerHours',
    remedy: 'correct_supplier_field',
  },
  'Individual hours must be greater than zero and no more than 24': {
    code: 'SUPPLIER_BATCH_HOURS_RANGE',
    key: 'problem.supplier.batchHoursRange',
    field: 'workerHours',
    remedy: 'correct_supplier_field',
  },
  'Individual hours cannot include a shared time interval': {
    code: 'SUPPLIER_BATCH_MODE_CONFLICT',
    key: 'problem.supplier.batchModeConflict',
    field: 'batchMode',
    remedy: 'correct_supplier_field',
  },
  'Start and end time are both required': {
    code: 'SUPPLIER_INTERVAL_REQUIRED',
    key: 'problem.supplier.intervalRequired',
    field: 'startTime',
    remedy: 'correct_supplier_field',
  },
  'The time interval or break is invalid': {
    code: 'SUPPLIER_INTERVAL_INVALID',
    key: 'problem.supplier.intervalInvalid',
    field: 'breakMinutes',
    remedy: 'correct_supplier_field',
  },
  'Enter hours, or a start and end time': {
    code: 'SUPPLIER_DURATION_REQUIRED',
    key: 'problem.supplier.durationRequired',
    field: 'durationHours',
    remedy: 'correct_supplier_field',
  },
  'Duration must be greater than zero and no more than 24 hours': {
    code: 'SUPPLIER_DURATION_RANGE',
    key: 'problem.supplier.durationRange',
    field: 'durationHours',
    remedy: 'correct_supplier_field',
  },
  'Choose duration or time interval': {
    code: 'SUPPLIER_DURATION_MODE_INVALID',
    key: 'problem.supplier.durationModeInvalid',
    field: 'durationMode',
    remedy: 'correct_supplier_field',
  },
  'Phone is too long': {
    code: 'SUPPLIER_PHONE_TOO_LONG',
    key: 'problem.supplier.phoneTooLong',
    field: 'phone',
    remedy: 'correct_supplier_field',
  },
  'Address is too long': {
    code: 'SUPPLIER_ADDRESS_TOO_LONG',
    key: 'problem.supplier.addressTooLong',
    field: 'address',
    remedy: 'correct_supplier_field',
  },
  'Notes are too long': {
    code: 'SUPPLIER_NOTES_TOO_LONG',
    key: 'problem.supplier.notesTooLong',
    field: 'notes',
    remedy: 'correct_supplier_field',
  },
  'Company is too long': {
    code: 'SUPPLIER_COMPANY_TOO_LONG',
    key: 'problem.supplier.companyTooLong',
    field: 'company',
    remedy: 'correct_supplier_field',
  },
  'Contact name is too long': {
    code: 'SUPPLIER_CONTACT_NAME_TOO_LONG',
    key: 'problem.supplier.contactNameTooLong',
    field: 'contactName',
    remedy: 'correct_supplier_field',
  },
  'Worker not found': {
    code: 'SUPPLIER_PROFILE_WORKER_UNAVAILABLE',
    key: 'problem.supplier.profileWorkerUnavailable',
    field: 'userId',
    remedy: 'review_user_access',
  },
  'Current supplier project grant required': {
    code: 'SUPPLIER_GRANT_REQUIRED',
    key: 'problem.supplier.grantRequired',
    remedy: 'contact_owner',
  },
  'Supplier technician project scope required': {
    code: 'SUPPLIER_TECHNICIAN_SCOPE_REQUIRED',
    key: 'problem.supplier.technicianScopeRequired',
    remedy: 'contact_owner',
  },
  'Supplier scope required': {
    code: 'SUPPLIER_SCOPE_REQUIRED',
    key: 'problem.supplier.scopeRequired',
    remedy: 'contact_owner',
  },
  'Active supplier coordinator access required': {
    code: 'SUPPLIER_COORDINATOR_ACCESS_CHANGED',
    key: 'problem.supplier.coordinatorAccessChanged',
    remedy: 'contact_owner',
  },
  'Owner administration required': {
    code: 'SUPPLIER_OWNER_REQUIRED',
    key: 'problem.supplier.ownerRequired',
    remedy: 'contact_owner',
  },
  'Account role changed': {
    code: 'SUPPLIER_ACCOUNT_ROLE_CHANGED',
    key: 'problem.supplier.accountRoleChanged',
    remedy: 'contact_owner',
  },
  'Only the coordinator who recorded this draft may discard it': {
    code: 'SUPPLIER_DRAFT_RECORDER_REQUIRED',
    key: 'problem.supplier.draftRecorderRequired',
    remedy: 'contact_owner',
  },
  'Minutes must be an integer from 0 to 1440': {
    code: 'SUPPLIER_MINUTES_INVALID',
    key: 'problem.supplier.minutesInvalid',
    field: 'minutes',
    remedy: 'correct_supplier_field',
  },
  'Break minutes are invalid': {
    code: 'SUPPLIER_BREAK_INVALID',
    key: 'problem.supplier.breakInvalid',
    field: 'breakMinutes',
    remedy: 'correct_supplier_field',
  },
  'Time entry not found': {
    code: 'SUPPLIER_TIME_NOT_FOUND',
    key: 'problem.supplier.timeNotFound',
    remedy: 'review_time_drafts',
  },
  'Original time entry not found': {
    code: 'SUPPLIER_TIME_NOT_FOUND',
    key: 'problem.supplier.timeNotFound',
    remedy: 'review_time_drafts',
  },
  'Returned correction changed before retry': {
    code: 'SUPPLIER_TIME_CORRECTION_STALE',
    key: 'problem.supplier.timeCorrectionStale',
    remedy: 'review_time_drafts',
  },
  'Worker assignment does not cover corrected work date': {
    code: 'SUPPLIER_TIME_ASSIGNMENT_DATE',
    key: 'problem.supplier.timeAssignmentDate',
    field: 'workDate',
    remedy: 'contact_owner',
  },
  'Project assignment access required': {
    code: 'SUPPLIER_TIME_ASSIGNMENT_REQUIRED',
    key: 'problem.supplier.timeAssignmentRequired',
    remedy: 'contact_owner',
  },
  'Active project assignment required': {
    code: 'SUPPLIER_TIME_ASSIGNMENT_REQUIRED',
    key: 'problem.supplier.timeAssignmentRequired',
    remedy: 'contact_owner',
  },
  'Time entry ownership required': {
    code: 'SUPPLIER_TIME_OWNERSHIP_REQUIRED',
    key: 'problem.supplier.timeOwnershipRequired',
    remedy: 'contact_owner',
  },
  'Batch request is invalid': {
    code: 'SUPPLIER_BATCH_REQUEST_INVALID',
    key: 'problem.supplier.batchRequestInvalid',
    field: 'requestId',
    remedy: 'review_saved_drafts',
  },
  'Source and target weeks must differ': {
    code: 'SUPPLIER_TIME_WEEK_UNCHANGED',
    key: 'problem.supplier.timeWeekUnchanged',
    remedy: 'review_time_drafts',
  },
  'Start and end time must be provided together': {
    code: 'SUPPLIER_INTERVAL_INCOMPLETE',
    key: 'problem.time.intervalIncomplete',
    field: 'startTime',
    remedy: 'correct_supplier_field',
  },
  'End time must be later on the same day': {
    code: 'SUPPLIER_INTERVAL_ORDER_INVALID',
    key: 'problem.time.intervalOrderInvalid',
    field: 'endTime',
    remedy: 'correct_supplier_field',
  },
  'Break minutes must be an integer within the shift': {
    code: 'SUPPLIER_BREAK_INVALID',
    key: 'problem.time.breakInvalid',
    field: 'breakMinutes',
    remedy: 'correct_supplier_field',
  },
  'Minutes must equal elapsed time less break minutes': {
    code: 'SUPPLIER_DURATION_MISMATCH',
    key: 'problem.time.durationMismatch',
    field: 'minutes',
    remedy: 'correct_supplier_field',
  },
  'A worker cannot enter more than 1440 minutes per day': {
    code: 'SUPPLIER_DAILY_LIMIT',
    key: 'problem.time.dailyLimit',
    field: 'workDate',
    remedy: 'review_time_drafts',
  },
  'Time intervals cannot overlap for the same worker and date': {
    code: 'SUPPLIER_TIME_INTERVAL_OVERLAP',
    key: 'problem.time.intervalOverlap',
    field: 'startTime',
    remedy: 'review_time_drafts',
  },
  'An existing time entry has an incomplete interval': {
    code: 'SUPPLIER_EXISTING_INTERVAL_INVALID',
    key: 'problem.supplier.existingIntervalInvalid',
    remedy: 'review_time_drafts',
  },
  'An existing time entry has an invalid interval': {
    code: 'SUPPLIER_EXISTING_INTERVAL_INVALID',
    key: 'problem.supplier.existingIntervalInvalid',
    remedy: 'review_time_drafts',
  },
  'Live authenticated session required': {
    code: 'SUPPLIER_SESSION_EXPIRED',
    key: 'problem.supplier.sessionExpired',
    remedy: 'sign_in_again',
  },
  'Deployment identity is not configured': {
    code: 'SUPPLIER_CORRECTION_CONFIGURATION_MISSING',
    key: 'problem.supplier.correctionConfigurationMissing',
    remedy: 'contact_owner',
  },
};

function supplierProblem(
  caught: unknown,
  operation: string,
  values: Record<string, string>,
  owner: boolean,
  correlationId?: string,
) {
  if (
    !(
      caught instanceof ValidationError ||
      caught instanceof ConflictError ||
      caught instanceof AccessDeniedError
    )
  )
    return null;
  const batch = /^No time entry was saved\. (.*?): (.*)$/u.exec(caught.message);
  const message = batch?.[2] ?? caught.message;
  const grantEnd =
    /^Assignment cannot extend beyond the coordinator authorization ending (\d{4}-\d{2}-\d{2})$/u.exec(
      message,
    );
  const clockField = /^(Start time|End time) must use strict HH:mm format$/u.exec(message);
  const rule =
    supplierRules[message] ??
    (grantEnd
      ? {
          code: 'SUPPLIER_ASSIGNMENT_GRANT_END',
          key: 'problem.supplier.assignmentGrantEnd' as const,
          remedy: 'contact_owner',
        }
      : clockField
        ? {
            code: 'SUPPLIER_CLOCK_FORMAT_INVALID',
            key: 'problem.supplier.clockFormatInvalid' as const,
            field: clockField[1] === 'Start time' ? 'startTime' : 'endTime',
            remedy: 'correct_supplier_field',
          }
        : null) ??
    (/^(?:Start date|End date|Work date|Date) must be an ISO date$/u.test(message)
      ? {
          code: 'SUPPLIER_DATE_INVALID',
          key: 'problem.supplier.dateInvalid' as const,
          field: /End/u.test(message) ? 'endsOn' : /Start/u.test(message) ? 'startsOn' : 'workDate',
          remedy: 'correct_supplier_field',
        }
      : /^(?:Supplier name|Technician name|Activity summary|Category|Correction reason|Correction request|Batch request|Supplier) is required$/u.test(
            message,
          )
        ? {
            code: 'SUPPLIER_REQUIRED_FIELD',
            key: 'problem.supplier.requiredField' as const,
            field:
              message.startsWith('Supplier name') || message.startsWith('Technician')
                ? 'name'
                : message.startsWith('Activity')
                  ? 'summary'
                  : message.startsWith('Category')
                    ? 'category'
                    : message.startsWith('Correction')
                      ? message.startsWith('Correction request')
                        ? 'requestId'
                        : 'reason'
                      : message.startsWith('Supplier')
                        ? 'supplierId'
                        : 'requestId',
            remedy: 'correct_supplier_field',
          }
        : null);
  if (!rule) return null;
  const status =
    caught instanceof AccessDeniedError ? 403 : caught instanceof ConflictError ? 409 : 400;
  const params: Record<string, string> = {
    ...(batch ? { technicianName: batch[1] ?? '' } : {}),
    ...(grantEnd ? { grantEnd: grantEnd[1] ?? '' } : {}),
  };
  const ownerRemedies = new Set([
    'review_supplier_directory',
    'review_supplier_profile',
    'review_supplier_grants',
    'review_user_access',
  ]);
  return actionFail(status, rule.key, params, message, {
    code: rule.code,
    operation,
    values,
    correlationId,
    fieldErrors: rule.field ? { [rule.field]: [rule.key] } : {},
    remedies: [{ id: !owner && ownerRemedies.has(rule.remedy) ? 'contact_owner' : rule.remedy }],
  });
}

function batchDuration(values: Record<string, string>): {
  minutes: number;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
} {
  const durationOnly = values.durationMode === 'duration';
  const intervalOnly = values.durationMode === 'interval';
  const startTime = durationOnly ? '' : values.startTime?.trim() || '';
  const endTime = durationOnly ? '' : values.endTime?.trim() || '';
  const breakText = values.breakMinutes?.trim() || '0';
  if (intervalOnly || startTime || endTime) {
    if (!/^\d{2}:\d{2}$/u.test(startTime) || !/^\d{2}:\d{2}$/u.test(endTime))
      throw new ValidationError('Start and end time are both required');
    const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
    const breakMinutes = Number(breakText);
    const minutes = toMinutes(endTime) - toMinutes(startTime) - breakMinutes;
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || minutes < 1 || minutes > 1440)
      throw new ValidationError('The time interval or break is invalid');
    return { minutes, startTime, endTime, breakMinutes };
  }
  const submittedMinutes = (values.minutes ?? '').trim();
  if (/^\d{1,4}$/u.test(submittedMinutes)) {
    const minutes = Number(submittedMinutes);
    if (minutes >= 1 && minutes <= 1440) return { minutes };
  }
  const normalizedHours = (values.durationHours ?? '').trim().replace(',', '.');
  if (!/^\d{1,2}(?:\.\d{1,2})?$/u.test(normalizedHours))
    throw new ValidationError('Enter hours, or a start and end time');
  const minutes = Math.round(Number(normalizedHours) * 60);
  if (minutes < 1 || minutes > 1440)
    throw new ValidationError('Duration must be greater than zero and no more than 24 hours');
  return { minutes };
}

export const load: PageServerLoad = ({ locals, url, cookies }) => {
  const ctx = openSupplierContext(locals);
  try {
    const owner = ctx.principal.role === 'owner_admin';
    const profile = ctx.sqlite
      .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
      .get(ctx.principal.userId);
    if (profile?.profile === 'external_technician')
      redirect(303, '/j-aautomation/app/supplier/report');
    const projects = ctx.supplier.listProjects(ctx.principal);
    const projectId = url.searchParams.get('projectId') || projects[0]?.id || '';
    const period = supplierPeriod(url);
    return {
      owner,
      currentUserId: ctx.principal.userId,
      directory: owner ? ctx.supplier.technicianDirectory(ctx.principal) : [],
      batchRequestId: randomUUID(),
      correctionRequestId: randomUUID(),
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      projects,
      projectId,
      ...period,
      suppliers: ctx.supplier.listSuppliers(ctx.principal),
      technicians: ctx.supplier.listTechnicians(ctx.principal) as {
        id: string;
        name: string;
        supplierId: string;
      }[],
      assigned: projectId
        ? (ctx.supplier.listTechnicians(ctx.principal, projectId) as {
            id: string;
            name: string;
            supplierId: string;
          }[])
        : [],
      entries: projectId ? ctx.supplier.listTime(ctx.principal, { projectId, ...period }) : [],
      accounts: owner
        ? (ctx.sqlite
            .prepare(
              `SELECT u.id,u.name,s.profile,s.supplier_id supplierId FROM user u
        LEFT JOIN supplier_user_profile s ON s.user_id=u.id WHERE u.role='worker' AND u.status='active' AND (EXISTS(SELECT 1 FROM account a WHERE a.user_id=u.id AND (a.provider_id<>'credential' OR length(a.password)>0)) OR EXISTS(SELECT 1 FROM passkey pk WHERE pk.user_id=u.id)) ORDER BY u.name`,
            )
            .all() as {
            id: string;
            name: string;
            profile: string | null;
            supplierId: string | null;
          }[])
        : [],
      grants: owner
        ? (ctx.supplier.listGrants(ctx.principal) as {
            id: string;
            supplierName: string;
            projectName: string;
            coordinatorName: string;
            startsOn: string;
            endsOn: string | null;
            status: string;
          }[])
        : [],
    };
  } catch (caught) {
    supplierReadFailure(caught);
  } finally {
    ctx.sqlite.close();
  }
};

function action(operation: string): Actions[string] {
  return async ({ locals, request }) => {
    const values = Object.fromEntries(
      [...(await request.formData())].map(([key, value]) => [
        key,
        typeof value === 'string' ? value : '',
      ]),
    );
    const ctx = openSupplierContext(locals);
    try {
      let outcome: Record<string, string | number | boolean> | undefined;
      const text = (key: string) => values[key] ?? '';
      const optional = (key: string) => text(key) || undefined;
      switch (operation) {
        case 'createSupplier':
          ctx.supplier.createSupplier(ctx.principal, {
            name: text('name'),
            contactEmail: optional('contactEmail'),
            phone: optional('phone'),
            address: optional('address'),
            notes: optional('notes'),
          });
          break;
        case 'updateSupplier':
          ctx.supplier.updateSupplier(ctx.principal, {
            id: text('id'),
            name: text('name'),
            contactEmail: optional('contactEmail'),
            phone: optional('phone'),
            address: optional('address'),
            notes: optional('notes'),
          });
          break;
        case 'setSupplierStatus':
          if (text('confirmed') !== 'yes')
            return actionFail(400, 'problem.supplier.confirmStatusChange', {}, undefined, {
              code: 'SUPPLIER_STATUS_CONFIRMATION_REQUIRED',
              operation,
              values,
              fieldErrors: { confirmed: ['problem.supplier.confirmStatusChange'] },
              remedies: [{ id: 'confirm_status_change' }],
              correlationId: locals.correlationId,
            });
          ctx.supplier.setSupplierStatus(ctx.principal, { id: text('id'), status: text('status') });
          break;
        case 'updateTechnician':
          ctx.supplier.updateTechnician(ctx.principal, {
            id: text('id'),
            name: text('name'),
            email: optional('email'),
            phone: optional('phone'),
            company: optional('company'),
            contactName: optional('contactName'),
            notes: optional('notes'),
          });
          break;
        case 'setTechnicianStatus':
          if (text('confirmed') !== 'yes')
            return actionFail(400, 'problem.supplier.confirmStatusChange', {}, undefined, {
              code: 'SUPPLIER_STATUS_CONFIRMATION_REQUIRED',
              operation,
              values,
              fieldErrors: { confirmed: ['problem.supplier.confirmStatusChange'] },
              remedies: [{ id: 'confirm_status_change' }],
              correlationId: locals.correlationId,
            });
          ctx.supplier.setTechnicianStatus(ctx.principal, {
            id: text('id'),
            status: text('status'),
          });
          break;
        case 'setProfile': {
          const profile = text('profile');
          if (!['standard', 'external_technician', 'supplier_coordinator'].includes(profile))
            return actionFail(400, 'problem.supplier.profileInvalid', {}, undefined, {
              code: 'SUPPLIER_PROFILE_INVALID',
              operation,
              values,
              fieldErrors: { profile: ['problem.supplier.profileInvalid'] },
              remedies: [{ id: 'review_supplier_profile' }],
              correlationId: locals.correlationId,
            });
          ctx.supplier.setAccountProfile(ctx.principal, {
            userId: text('userId'),
            profile: profile as 'standard' | 'external_technician' | 'supplier_coordinator',
            supplierId: profile === 'standard' ? undefined : optional('supplierId'),
          });
          break;
        }
        case 'grant':
          ctx.supplier.grantProject(ctx.principal, {
            supplierId: text('supplierId'),
            projectId: text('projectId'),
            coordinatorId: text('coordinatorId'),
            startsOn: text('startsOn'),
            endsOn: optional('endsOn'),
          });
          break;
        case 'revoke':
          ctx.supplier.revokeProject(ctx.principal, { id: text('id') });
          break;
        case 'addTechnician':
          ctx.supplier.addTechnician(ctx.principal, {
            supplierId: optional('supplierId'),
            projectId: text('projectId'),
            name: text('name'),
            email: optional('email'),
            phone: optional('phone'),
            company: optional('company'),
            contactName: optional('contactName'),
            notes: optional('notes'),
            startsOn: text('startsOn'),
            endsOn: optional('endsOn'),
          });
          break;
        case 'assignTechnician':
          ctx.supplier.assignTechnician(ctx.principal, {
            workerId: text('workerId'),
            projectId: text('projectId'),
            startsOn: text('startsOn'),
            endsOn: optional('endsOn'),
          });
          break;
        case 'createTime':
          ctx.supplier.createTime(ctx.principal, {
            workerId: text('workerId'),
            projectId: text('projectId'),
            workDate: text('workDate'),
            category: text('category'),
            minutes: Number(text('minutes')),
            summary: text('summary'),
          });
          break;
        case 'createTimeBatch': {
          const workerIds = text('workerIds')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
          const individual = text('batchMode') === 'individual';
          if (!individual && !['', 'shared'].includes(text('batchMode')))
            throw new ValidationError('Choose shared or individual hours');
          let workerMinutes: Record<string, number> | undefined;
          if (individual) {
            let hours: unknown;
            try {
              hours = JSON.parse(text('workerHours'));
            } catch {
              throw new ValidationError('Enter hours for every selected technician');
            }
            if (!hours || typeof hours !== 'object' || Array.isArray(hours))
              throw new ValidationError('Enter hours for every selected technician');
            const selected = new Set(workerIds);
            if (
              Object.keys(hours).length !== selected.size ||
              Object.keys(hours).some((id) => !selected.has(id))
            )
              throw new ValidationError('Enter hours for every selected technician');
            workerMinutes = {};
            for (const workerId of selected) {
              const normalized = String((hours as Record<string, unknown>)[workerId] ?? '')
                .trim()
                .replace(',', '.');
              if (!/^\d{1,2}(?:\.\d{1,2})?$/u.test(normalized))
                throw new ValidationError('Enter valid hours for every selected technician');
              const minutes = Math.round(Number(normalized) * 60);
              if (minutes < 1 || minutes > 1440)
                throw new ValidationError(
                  'Individual hours must be greater than zero and no more than 24',
                );
              workerMinutes[workerId] = minutes;
            }
          }
          const duration = individual ? { minutes: 1 } : batchDuration(values);
          const batch = ctx.supplier.createTimeBatch(ctx.principal, {
            requestId: text('requestId'),
            workerIds,
            projectId: text('projectId'),
            workDate: text('workDate'),
            category: text('category'),
            summary: text('summary'),
            workerMinutes,
            ...duration,
          });
          const project = ctx.sqlite
            .prepare('SELECT name FROM project WHERE id=?')
            .get(text('projectId')) as { name: string } | undefined;
          outcome = {
            createdCount: batch.created.length,
            projectName: project?.name ?? text('projectId'),
            workDate: text('workDate'),
            totalMinutes: workerMinutes
              ? Object.values(workerMinutes).reduce((sum, minutes) => sum + minutes, 0)
              : duration.minutes * batch.created.length,
            replayed: batch.replayed,
          };
          break;
        }
        case 'correctTime':
          ctx.supplier.createTimeCorrection(ctx.principal, {
            originalId: text('id'),
            requestId: text('requestId'),
            reason: text('reason'),
          });
          break;
        case 'submitTime':
          ctx.supplier.submitTime(ctx.principal, {
            id: text('id'),
            version: Number(text('version')),
          });
          break;
        case 'submitTimeBatch': {
          let entries: unknown;
          try {
            entries = JSON.parse(text('entries'));
          } catch {
            throw new ValidationError('The selected drafts are invalid');
          }
          if (
            !Array.isArray(entries) ||
            entries.some(
              (entry) =>
                !entry ||
                typeof entry.id !== 'string' ||
                !Number.isInteger(entry.version) ||
                entry.version < 1,
            )
          )
            throw new ValidationError('The selected drafts are invalid');
          const submitted = ctx.supplier.submitTimeBatch(ctx.principal, entries);
          outcome = { submittedCount: submitted.submitted };
          break;
        }
        case 'updateTime': {
          const durationMode = text('durationMode');
          if (!['duration', 'interval'].includes(durationMode))
            throw new ValidationError('Choose duration or time interval');
          const duration = batchDuration(values);
          ctx.supplier.updateTime(ctx.principal, {
            id: text('id'),
            version: Number(text('version')),
            workDate: text('workDate'),
            category: text('category'),
            summary: text('summary'),
            ...duration,
            ...(durationMode === 'duration'
              ? { startTime: null, endTime: null, breakMinutes: null }
              : {}),
          });
          break;
        }
        case 'discardTime':
          ctx.supplier.discardTime(ctx.principal, {
            id: text('id'),
            version: Number(text('version')),
          });
          break;
      }
      return { success: true, operation, values: {}, outcome };
    } catch (caught) {
      const known = supplierProblem(
        caught,
        operation,
        values,
        ctx.principal.role === 'owner_admin',
        locals.correlationId,
      );
      if (known) return known;
      return actionFailure(caught, { operation, values, correlationId: locals.correlationId });
    } finally {
      ctx.sqlite.close();
    }
  };
}
export const actions: Actions = Object.fromEntries(
  [
    'updateSupplier',
    'setSupplierStatus',
    'updateTechnician',
    'setTechnicianStatus',
    'createSupplier',
    'setProfile',
    'grant',
    'revoke',
    'addTechnician',
    'assignTechnician',
    'createTime',
    'createTimeBatch',
    'submitTime',
    'submitTimeBatch',
    'updateTime',
    'discardTime',
    'correctTime',
  ].map((name) => [name, action(name)]),
);
