import {
  accountingPackPeriodSchema,
  availabilityInputSchema,
  dailyReportInputSchema,
  planningAssignmentInputSchema,
  reportDecisionSchema,
  skillInputSchema,
  technicalChangeDecisionSchema,
  technicalChangeInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
  workerSkillInputSchema,
  uuidSchema,
} from '@ja/schemas';
import { z } from 'zod';
import { fail } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  type PortalRepository,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess, type ActionMessageKey } from './action-message';
import {
  formObject,
  normalizeLocalDateTime,
  type PortalActionEvent,
} from '$lib/server/action-utils';
import { buildCorrectionPatch } from './correction-draft-fields';

const reportValueFields = new Set([
  'id',
  'type',
  'version',
  'recordType',
  'recordId',
  'originalId',
  'correctionId',
  'workerId',
  'projectId',
  'reportDate',
  'workDate',
  'title',
  'summary',
  'activities',
  'findings',
  'recommendations',
  'siteShift',
  'tasksCompleted',
  'clientDecisions',
  'problemsFound',
  'correctiveActions',
  'blockers',
  'downtimeMinutes',
  'standbyReason',
  'openItems',
  'nextDayPlan',
  'systemName',
  'plantSite',
  'areaLine',
  'stationMachine',
  'systemType',
  'plcPlatform',
  'controller',
  'hmiScada',
  'networkProtocol',
  'softwareVersion',
  'programReference',
  'problemSymptom',
  'diagnosisRootCause',
  'changePerformed',
  'productionImpact',
  'validation',
  'validationResult',
  'openRisk',
  'rollbackPlan',
  'customerContact',
  'safetyRelated',
  'safetyImpact',
  'reason',
  'requestId',
  'patch',
  'ownerOverride',
  'correctionFields',
  'periodStart',
  'periodEnd',
  'fromDate',
  'toDate',
  'contentMode',
  'technicalReportIds',
]);

function safeReportValues(values: Record<string, unknown>): Record<string, string | string[]> {
  const scalar = Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] =>
        reportValueFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
  const selected = Array.isArray(values.technicalReportIds)
    ? values.technicalReportIds.filter((value): value is string => typeof value === 'string')
    : undefined;
  return { ...scalar, ...(selected ? { technicalReportIds: selected } : {}) };
}

type ReportProblem = {
  status: number;
  code: string;
  key: ActionMessageKey;
  message: string;
  field?: string;
  remedy: string;
};
const reportProblems: Record<string, ReportProblem> = {
  'Report changed or cannot be edited': {
    status: 409,
    code: 'REPORT_DRAFT_CHANGED',
    key: 'problem.report.draftChanged',
    message:
      'This report changed while you were editing. Review the current version before saving.',
    remedy: 'review_report',
  },
  'Report changed or cannot be submitted': {
    status: 409,
    code: 'REPORT_SUBMISSION_CHANGED',
    key: 'problem.report.submissionChanged',
    message:
      'This report changed or is no longer a draft. Review the current version before submitting.',
    remedy: 'review_report',
  },
  'Submitted or approved reports require an audited correction draft before editing': {
    status: 409,
    code: 'REPORT_CORRECTION_REQUIRED',
    key: 'problem.report.correctionRequired',
    message: 'Submitted or approved reports require an audited correction draft before editing.',
    remedy: 'request_report_correction',
  },
  'This report is part of a finalized report and cannot be edited': {
    status: 409,
    code: 'REPORT_FINALIZED',
    key: 'problem.report.finalized',
    message:
      'This report is part of a finalized report. Review the current record and request a versioned correction.',
    remedy: 'review_report',
  },
  'A linked correction draft cannot be edited': {
    status: 409,
    code: 'REPORT_CORRECTION_DRAFT_LOCKED',
    key: 'problem.report.correctionDraftLocked',
    message: 'This linked correction draft cannot be edited here. Review its correction record.',
    remedy: 'review_report',
  },
  'Only never-submitted draft reports can be deleted': {
    status: 409,
    code: 'REPORT_DELETE_DRAFT_ONLY',
    key: 'problem.report.deleteDraftOnly',
    message:
      'Only a report draft that has never been submitted can be deleted. Review the report or request a correction.',
    remedy: 'review_report',
  },
  'Only never-submitted drafts can be deleted': {
    status: 409,
    code: 'RECORD_DELETE_DRAFT_ONLY',
    key: 'problem.report.deleteDraftOnly',
    message:
      'Only a draft that has never been submitted can be deleted. Review the record or request a correction.',
    remedy: 'review_report',
  },
  'Report approval history cannot be deleted': {
    status: 409,
    code: 'REPORT_REVIEW_HISTORY_LOCKED',
    key: 'problem.report.reviewHistoryLocked',
    message: 'This report has review history and cannot be deleted. Request an audited correction.',
    remedy: 'review_report',
  },
  'Finalized reports cannot be deleted': {
    status: 409,
    code: 'REPORT_FINALIZED',
    key: 'problem.report.finalized',
    message:
      'This report is part of a finalized report. Review the current record and request a versioned correction.',
    remedy: 'review_report',
  },
  'Remove linked technical changes before deleting this report': {
    status: 409,
    code: 'REPORT_LINKED_TECHNICAL_CHANGES',
    key: 'problem.report.linkedTechnicalChanges',
    message:
      'This report has linked technical changes. Review those changes before deleting the draft.',
    remedy: 'review_report',
  },
  'Record changed before deletion': {
    status: 409,
    code: 'RECORD_DELETE_CHANGED',
    key: 'problem.report.deleteChanged',
    message: 'This record changed before deletion. Review its current state.',
    remedy: 'review_report',
  },
  'Report changed or cannot be deleted': {
    status: 409,
    code: 'REPORT_DELETE_CHANGED',
    key: 'problem.report.deleteChanged',
    message: 'This report changed before deletion. Review its current state.',
    remedy: 'review_report',
  },
  'Report is not submitted': {
    status: 409,
    code: 'REPORT_REVIEW_STATE_CHANGED',
    key: 'problem.report.reviewStateChanged',
    message:
      'This report is no longer submitted for review. Open the current version before deciding.',
    remedy: 'review_report',
  },
  'Active project required for report submission': {
    status: 403,
    code: 'REPORT_PROJECT_NOT_ACTIVE',
    key: 'problem.report.projectNotActive',
    message:
      'The project is no longer active for report submission. Contact the project owner to review its status.',
    remedy: 'contact_project_owner',
  },
  'Effective project assignment required for submission': {
    status: 403,
    code: 'REPORT_ASSIGNMENT_REQUIRED',
    key: 'problem.report.assignmentRequired',
    message:
      'An effective project assignment must cover the report date. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Active project assignment required': {
    status: 403,
    code: 'REPORT_ASSIGNMENT_REQUIRED',
    key: 'problem.report.assignmentRequired',
    message:
      'An effective project assignment must cover the report date. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Safety-related changes require validation and rollback details': {
    status: 400,
    code: 'REPORT_SAFETY_DETAILS_REQUIRED',
    key: 'problem.report.safetyDetailsRequired',
    message: 'Safety-related changes require validation and rollback details before saving.',
    field: 'validation',
    remedy: 'review_report',
  },
};

export function reportActionFailure(error: unknown, values: Record<string, unknown> = {}) {
  const savedValues = safeReportValues(values);
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError
  ) {
    const known = reportProblems[error.message];
    if (known) {
      const remedy =
        known.remedy === 'review_report' && savedValues.recordType === 'time_entry'
          ? 'review_time'
          : known.remedy === 'review_report' && savedValues.recordType === 'expense'
            ? 'review_expense'
            : known.remedy;
      return actionFail(known.status, known.key, {}, known.message, {
        code: known.code,
        values: savedValues,
        ...(known.field
          ? {
              fields:
                known.code === 'REPORT_SAFETY_DETAILS_REQUIRED'
                  ? Object.fromEntries(
                      (['validation', 'rollbackPlan'] as const)
                        .filter((field) => !String(savedValues[field] ?? '').trim())
                        .map((field) => [field, [known.message]]),
                    )
                  : { [known.field]: [known.message] },
            }
          : {}),
        remedies: [{ id: remedy }],
      });
    }
  }
  return actionFailure(error, { values: savedValues });
}

function safetyDetailsSchemaFailure(
  safetyRelated: unknown,
  issues: readonly { path: PropertyKey[] }[],
  values: Record<string, unknown>,
) {
  if (
    safetyRelated !== true ||
    issues.length === 0 ||
    !issues.every((issue) => ['validation', 'rollbackPlan'].includes(String(issue.path[0])))
  )
    return null;
  return reportActionFailure(
    new ValidationError('Safety-related changes require validation and rollback details'),
    values,
  );
}

function planningActionFailure(error: unknown, operation: string, values: Record<string, unknown>) {
  if (!(error instanceof ValidationError || error instanceof ConflictError)) {
    const result = actionFailure(error);
    return fail(result.status, { ...result.data, operation, values });
  }
  const messages: Record<string, { key: `action.${string}`; field?: string; status: number }> = {
    'Worker must have an effective project assignment for the planning window': {
      key: 'action.planning.workerNotAssigned',
      field: 'workerId',
      status: 400,
    },
    'Worker already has an overlapping planning assignment': {
      key: 'action.planning.workerOverlap',
      field: 'startsAt',
      status: 409,
    },
    'Worker is unavailable for this planning window': {
      key: 'action.planning.workerUnavailable',
      field: 'startsAt',
      status: 409,
    },
    'Planning end must follow a valid start': {
      key: 'action.planning.invalidWindow',
      field: 'endsAt',
      status: 400,
    },
    'Planned minutes must be between 1 and 10080': {
      key: 'action.planning.invalidMinutes',
      field: 'plannedMinutes',
      status: 400,
    },
    'Planning assignment changed; reload before editing': {
      key: 'action.planning.changed',
      status: 409,
    },
    'Planning assignment changed; reload before cancelling': {
      key: 'action.planning.changed',
      status: 409,
    },
    'Cancelled planning cannot be edited': {
      key: 'action.planning.alreadyCancelled',
      status: 409,
    },
    'Planning assignment is already cancelled': {
      key: 'action.planning.alreadyCancelled',
      status: 409,
    },
    'Planning assignment not found': {
      key: 'action.planning.assignmentNotFound',
      status: 400,
    },
    'Planning and schedules are only allowed on active, planned, or paused projects': {
      key: 'action.planning.projectUnavailable',
      field: 'projectId',
      status: 409,
    },
  };
  const known = messages[error.message];
  if (!known) {
    const result = actionFailure(error);
    return fail(result.status, { ...result.data, operation, values });
  }
  return actionFail(known.status, known.key, {}, error.message, {
    operation,
    values,
    ...(known.field ? { fields: { [known.field]: [error.message] } } : {}),
  });
}

export const reportActions = {
  autosaveReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');

    const object = await formObject(request);
    const values = safeReportValues(object);
    object.safetyRelated = ['on', 'true', '1'].includes(String(object.safetyRelated));
    const type = object.type;
    if (object.id === undefined || (type !== 'daily' && type !== 'technical'))
      return actionFail(
        400,
        'action.validation.reportAutosaveRequest',
        {},
        'Invalid report autosave request',
        { values },
      );

    const parsed =
      type === 'daily'
        ? dailyReportInputSchema.and(versionedRecordSchema).safeParse(object)
        : technicalReportInputSchema.and(versionedRecordSchema).safeParse(object);
    if (!parsed.success) {
      if (type === 'technical') {
        const safetyFailure = safetyDetailsSchemaFailure(
          object.safetyRelated,
          parsed.error.issues,
          values,
        );
        if (safetyFailure) return safetyFailure;
      }
      return actionFail(
        400,
        type === 'daily'
          ? 'action.validation.dailyReportFields'
          : 'action.validation.technicalReportFields',
        {},
        type === 'daily' ? 'Check the daily report fields' : 'Check the PLC report fields',
        { fields: parsed.error.flatten().fieldErrors, values },
      );
    }

    const context = openPortalRepository(locals);
    try {
      const detail = context.repository.reportDetail(context.principal, parsed.data.id);
      const state = String(detail.report.approval_state ?? '');
      if (detail.type !== type || !detail.canEdit)
        return actionFail(403, 'action.error.reportEditAccess', {}, 'Report edit access required');
      if (state !== 'draft' && state !== 'needs_changes')
        return actionFail(
          409,
          'action.conflict.reportNotEditable',
          {},
          'Autosave is available only for draft reports or reports needing changes',
          {
            code: 'REPORT_NOT_EDITABLE',
            currentVersion: Number(detail.report.version ?? parsed.data.version),
            values,
            remedies: [{ id: 'review_report', recordId: parsed.data.id }],
          },
        );

      const result =
        type === 'daily'
          ? context.repository.updateDailyReport(
              context.principal,
              parsed.data as Parameters<PortalRepository['updateDailyReport']>[1],
            )
          : context.repository.updateTechnicalReport(
              context.principal,
              parsed.data as Parameters<PortalRepository['updateTechnicalReport']>[1],
            );
      return {
        ...actionSuccess(
          'action.reports.autosaved',
          { type, reportId: result.id, version: result.version },
          'Report draft autosaved',
        ),
        autosaved: true,
        id: result.id,
        type,
        version: result.version,
        changedFields: 'changedFields' in result ? result.changedFields : [],
      };
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  deleteDraft: async ({ locals, request, params }: PortalActionEvent) => {
    if (!['reports', 'time', 'expenses'].includes(params.section ?? ''))
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const rawType = String(object.recordType ?? object.type ?? '');
    const recordType =
      rawType === 'daily' ? 'daily_report' : rawType === 'technical' ? 'technical_report' : rawType;
    const recordId = String(object.recordId ?? object.id ?? '');
    const version = Number(object.version);
    if (
      !['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType) ||
      !recordId ||
      !Number.isInteger(version) ||
      version < 1
    )
      return actionFail(400, 'action.validation.draftDelete', {}, 'Invalid draft deletion', {
        values: safeReportValues(object),
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.deleteDraft(context.principal, {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        recordId,
        version,
      });
      return actionSuccess('action.reports.draftDeleted', { recordId: result.id }, 'Draft deleted');
    } catch (error) {
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  createCorrectionDraft: async ({ locals, request, params }: PortalActionEvent) => {
    const object = await formObject(request);
    const rawType = String(object.recordType ?? object.type ?? '');
    const recordType =
      rawType === 'daily' ? 'daily_report' : rawType === 'technical' ? 'technical_report' : rawType;
    const originalId = String(object.originalId ?? object.recordId ?? object.id ?? '');
    if (
      !['reports', 'time', 'expenses', 'approvals'].includes(params.section ?? '') &&
      params.id !== originalId
    )
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const requestId = String(object.requestId ?? '');
    const reason = String(object.reason ?? '').trim();
    if (
      !['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType) ||
      !originalId ||
      !requestId ||
      !reason
    )
      return actionFail(400, 'action.validation.correctionDraft', {}, 'Invalid correction request');
    let patch: Record<string, unknown> | undefined;
    if (typeof object.patch === 'string' && object.patch.trim()) {
      try {
        const parsed = JSON.parse(object.patch) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        patch = parsed as Record<string, unknown>;
      } catch {
        return actionFail(
          400,
          'action.validation.correctionDraft',
          {},
          'Invalid correction fields',
        );
      }
    }
    const context = openPortalRepository(locals);
    try {
      if (object.correctionFields) {
        const original =
          recordType === 'time_entry'
            ? context.repository.timeDetail(context.principal, originalId)
            : recordType === 'expense'
              ? context.repository.expenseDetail(context.principal, originalId)
              : context.repository.reportDetail(context.principal, originalId).report;
        patch = buildCorrectionPatch(
          recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
          object,
          original as Record<string, unknown>,
        );
      } else if (!patch || Object.keys(patch).length === 0) {
        return actionFail(
          400,
          'action.validation.correctionDraft',
          {},
          'Revised fields are required',
          {
            values: safeReportValues(object),
          },
        );
      }
      const correctionInput = {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        originalId,
        requestId,
        reason,
        patch,
      };
      const result =
        String(object.ownerOverride ?? '') === 'yes'
          ? context.repository.ownerOverrideCorrectionDraft(context.principal, correctionInput)
          : context.repository.createCorrectionDraft(context.principal, correctionInput);
      return actionSuccess(
        'action.reports.correctionDraftCreated',
        { correctionId: result.correctionId },
        'Correction draft created',
      );
    } catch (error) {
      if (error instanceof ValidationError)
        return actionFail(400, 'action.validation.correctionDraft', {}, error.message, {
          values: safeReportValues(object),
        });
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  withdrawCorrectionDraft: async ({ locals, request, params }: PortalActionEvent) => {
    const object = await formObject(request);
    const recordType = String(object.recordType ?? '');
    const correctionId = String(object.correctionId ?? '');
    const version = Number(object.version);
    const reason = String(object.reason ?? '').trim();
    if (
      !['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType) ||
      !correctionId ||
      !Number.isSafeInteger(version) ||
      reason.length < 3 ||
      (!['time', 'expenses', 'reports'].includes(params.section ?? '') &&
        params.id !== correctionId)
    )
      return actionFail(
        400,
        'action.validation.correctionDraft',
        {},
        'Invalid correction withdrawal',
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.withdrawCorrectionDraft(context.principal, {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        correctionId,
        version,
        reason,
      });
      return actionSuccess(
        'action.reports.correctionDraftWithdrawn',
        {
          originalId: result.originalId,
        },
        'Correction draft withdrawn',
      );
    } catch (error) {
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  generatePeriodReports: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const periodValues = {
      ...Object.fromEntries(formData),
      technicalReportIds: formData.getAll('technicalReportIds').map(String),
    };
    const parsed = accountingPackPeriodSchema
      .extend({
        projectId: uuidSchema,
        contentMode: z
          .enum([
            'hours_only',
            'hours_activity',
            'hours_activity_selected_technical',
            'hours_activity_all_technical',
          ])
          .default('hours_activity_all_technical'),
        technicalReportIds: z.array(uuidSchema).default([]),
      })
      .safeParse({
        ...Object.fromEntries(formData),
        technicalReportIds: formData.getAll('technicalReportIds').map(String),
      });
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectReportingPeriod',
        {},
        'Check project and reporting period',
        { values: safeReportValues(periodValues), fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.refreshAndQueuePeriodReports(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.periodReportsRefreshed',
        {
          reportCount: result.reports.length,
          jobId: result.jobId,
          jobCreated: result.jobCreated,
          jobState: result.jobState,
        },
        `${result.reports.length} period reports refreshed. Rendering job: ${result.jobState}.`,
      );
    } catch (error) {
      return reportActionFailure(error, periodValues);
    } finally {
      context.sqlite.close();
    }
  },
  createDailyReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeReportValues(object);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = dailyReportInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.dailyReportFields',
        {},
        'Check the daily report fields',
        { fields: parsed.error.flatten().fieldErrors, values },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createDailyReport(context.principal, parsed.data, workerId);
      return actionSuccess('action.reports.dailyDraftSaved', {}, 'Daily report draft saved');
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeReportValues(object);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = technicalReportInputSchema.safeParse(object);
    if (!parsed.success) {
      const safetyFailure = safetyDetailsSchemaFailure(
        object.safetyRelated,
        parsed.error.issues,
        values,
      );
      if (safetyFailure) return safetyFailure;
      return actionFail(
        400,
        'action.validation.technicalReportFields',
        {},
        'Check the PLC report fields',
        { fields: parsed.error.flatten().fieldErrors, values },
      );
    }
    const context = openPortalRepository(locals);
    try {
      context.repository.createTechnicalReport(context.principal, parsed.data, workerId);
      return actionSuccess('action.reports.technicalDraftSaved', {}, 'PLC report draft saved');
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeReportValues(object);
    object.safetyImpact = object.safetyImpact === 'on';
    const parsed = technicalChangeInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.technicalChangeFields',
        {},
        'Check technical change fields',
        { fields: parsed.error.flatten().fieldErrors, values },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.createTechnicalChange(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.technicalChangeDraftSaved',
        {},
        'Technical change draft saved',
      );
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  submitReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const type = object.type;
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success || (type !== 'daily' && type !== 'technical'))
      return actionFail(400, 'action.validation.report', {}, 'Invalid report', {
        values: safeReportValues(object),
        fields: parsed.success
          ? { type: ['Select a report type.'] }
          : parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitReport(context.principal, type, parsed.data.id, parsed.data.version);
      return actionSuccess('action.reports.submitted', {}, 'Report submitted for review');
    } catch (error) {
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  submitTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.technicalChange', {}, 'Invalid technical change', {
        values: safeReportValues(object),
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.submitTechnicalChange(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess(
        'action.reports.technicalChangeSubmitted',
        {},
        'Technical change submitted for review',
      );
    } catch (error) {
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  createPlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = { ...object };
    // Planning's datetime-local controls represent UTC, independent of the server timezone.
    for (const key of ['startsAt', 'endsAt']) {
      const value = object[key];
      object[key] =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
          ? `${value}:00.000Z`
          : value;
    }
    const parsed = planningAssignmentInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.planningFields', {}, 'Check planning fields', {
        fields: parsed.error.flatten().fieldErrors,
        operation: 'createPlanning',
        values,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createPlanningAssignment(context.principal, parsed.data);
      return actionSuccess('action.planning.assignmentPublished', {}, 'Assignment published');
    } catch (error) {
      return planningActionFailure(error, 'createPlanning', values);
    } finally {
      context.sqlite.close();
    }
  },
  updatePlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = { ...object };
    for (const key of ['startsAt', 'endsAt']) {
      const value = object[key];
      object[key] =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
          ? `${value}:00.000Z`
          : value;
    }
    const parsed = planningAssignmentInputSchema.and(versionedRecordSchema).safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.planningFields', {}, 'Check planning fields', {
        fields: parsed.error.flatten().fieldErrors,
        operation: 'updatePlanning',
        values,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updatePlanningAssignment(context.principal, parsed.data);
      return actionSuccess('action.planning.assignmentUpdated', {}, 'Assignment updated');
    } catch (error) {
      return planningActionFailure(error, 'updatePlanning', values);
    } finally {
      context.sqlite.close();
    }
  },
  cancelPlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const parsed = versionedRecordSchema.safeParse(values);
    if (!parsed.success)
      return actionFail(400, 'action.validation.planningFields', {}, 'Check planning fields', {
        fields: parsed.error.flatten().fieldErrors,
        operation: 'cancelPlanning',
        values,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.cancelPlanningAssignment(context.principal, parsed.data);
      return actionSuccess('action.planning.assignmentCancelled', {}, 'Assignment cancelled');
    } catch (error) {
      return planningActionFailure(error, 'cancelPlanning', values);
    } finally {
      context.sqlite.close();
    }
  },
  createSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = skillInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.skillFields', {}, 'Check skill fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createSkill(context.principal, parsed.data);
      return actionSuccess('action.planning.skillSaved', {}, 'Skill saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setWorkerSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = workerSkillInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.workerSkillFields',
        {},
        'Check worker skill fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.setWorkerSkill(context.principal, parsed.data);
      return actionSuccess('action.planning.workerSkillUpdated', {}, 'Worker skill updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('skillId')?.toString();
    if (!id) return actionFail(400, 'action.validation.skillIdRequired', {}, 'Skill ID required');

    const input: Record<string, unknown> = {};
    if (formData.has('name')) input.name = formData.get('name')?.toString();

    const context = openPortalRepository(locals);
    try {
      context.repository.updateSkill(context.principal, id, input);
      return actionSuccess('action.planning.skillUpdated', {}, 'Skill updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('skillId')?.toString();
    if (!id) return actionFail(400, 'action.validation.skillIdRequired', {}, 'Skill ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteSkill(context.principal, id);
      return actionSuccess('action.planning.skillDeleted', {}, 'Skill deleted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteWorkerSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const workerId = formData.get('workerId')?.toString();
    const skillId = formData.get('skillId')?.toString();
    if (!workerId || !skillId)
      return actionFail(
        400,
        'action.validation.workerSkillIdsRequired',
        {},
        'Worker ID and Skill ID required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteWorkerSkill(context.principal, workerId, skillId);
      return actionSuccess('action.planning.workerSkillDeleted', {}, 'Worker skill deleted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setAvailability: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.startsAt = normalizeLocalDateTime(object.startsAt);
    object.endsAt = normalizeLocalDateTime(object.endsAt);
    const parsed = availabilityInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.availabilityFields',
        {},
        'Check availability fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.setWorkerAvailability(context.principal, parsed.data);
      return actionSuccess('action.planning.availabilitySaved', {}, 'Availability saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = reportDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.reportDecision', {}, 'Invalid report decision');
    const context = openPortalRepository(locals);
    try {
      context.repository.reviewReport(
        context.principal,
        parsed.data.type,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return actionSuccess('action.approvals.reportReviewRecorded', {}, 'Report review recorded');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = technicalChangeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.technicalChangeDecision',
        {},
        'Invalid technical change decision',
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.reviewTechnicalChange(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return actionSuccess(
        'action.approvals.technicalChangeReviewRecorded',
        {},
        'Technical change review recorded',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = technicalChangeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.milestoneDecision',
        {},
        'Invalid milestone decision',
      );
    if (parsed.data.decision === 'needs_changes')
      return actionFail(
        400,
        'action.validation.milestoneDecisionType',
        {},
        'Milestones must be approved or rejected',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.reviewProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return actionSuccess(
        'action.approvals.milestoneReviewRecorded',
        {},
        'Milestone review recorded',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
