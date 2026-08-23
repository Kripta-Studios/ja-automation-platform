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
import type { PortalRepository } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import {
  formObject,
  normalizeLocalDateTime,
  type PortalActionEvent,
} from '$lib/server/action-utils';

export const reportActions = {
  autosaveReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');

    const object = await formObject(request);
    object.safetyRelated = ['on', 'true', '1'].includes(String(object.safetyRelated));
    const type = object.type;
    if (object.id === undefined || (type !== 'daily' && type !== 'technical'))
      return actionFail(
        400,
        'action.validation.reportAutosaveRequest',
        {},
        'Invalid report autosave request',
      );

    const parsed =
      type === 'daily'
        ? dailyReportInputSchema.and(versionedRecordSchema).safeParse(object)
        : technicalReportInputSchema.and(versionedRecordSchema).safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        type === 'daily'
          ? 'action.validation.dailyReportFields'
          : 'action.validation.technicalReportFields',
        {},
        type === 'daily' ? 'Check the daily report fields' : 'Check the PLC report fields',
        { fields: parsed.error.flatten().fieldErrors },
      );

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
            code: 'report_not_editable',
            currentVersion: Number(detail.report.version ?? parsed.data.version),
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
      return actionFailure(error);
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
      return actionFail(400, 'action.validation.draftDelete', {}, 'Invalid draft deletion');
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.deleteDraft(context.principal, {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        recordId,
        version,
      });
      return actionSuccess('action.reports.draftDeleted', { recordId: result.id }, 'Draft deleted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createCorrectionDraft: async ({ locals, request, params }: PortalActionEvent) => {
    if (!['reports', 'time', 'expenses', 'approvals'].includes(params.section ?? ''))
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const rawType = String(object.recordType ?? object.type ?? '');
    const recordType =
      rawType === 'daily' ? 'daily_report' : rawType === 'technical' ? 'technical_report' : rawType;
    const originalId = String(object.originalId ?? object.recordId ?? object.id ?? '');
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
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  generatePeriodReports: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = accountingPackPeriodSchema
      .extend({ projectId: uuidSchema })
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectReportingPeriod',
        {},
        'Check project and reporting period',
      );
    const context = openPortalRepository(locals);
    try {
      const reports = context.v3.refreshPeriodReports(context.principal, parsed.data);
      context.v3.enqueueJob(
        'period_close_report',
        `period-report-refresh:${parsed.data.projectId}:${parsed.data.periodStart}:${parsed.data.periodEnd}:${parsed.data.reportLocale}`,
        parsed.data,
      );
      return actionSuccess(
        'action.reports.periodReportsRefreshed',
        { reportCount: reports.length },
        `${reports.length} period reports queued for rendering.`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createDailyReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = dailyReportInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.dailyReportFields',
        {},
        'Check the daily report fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createDailyReport(context.principal, parsed.data);
      return actionSuccess('action.reports.dailyDraftSaved', {}, 'Daily report draft saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = technicalReportInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.technicalReportFields',
        {},
        'Check the PLC report fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createTechnicalReport(context.principal, parsed.data);
      return actionSuccess('action.reports.technicalDraftSaved', {}, 'PLC report draft saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.safetyImpact = object.safetyImpact === 'on';
    const parsed = technicalChangeInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.technicalChangeFields',
        {},
        'Check technical change fields',
        { fields: parsed.error.flatten().fieldErrors },
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
      return actionFailure(error);
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
      return actionFail(400, 'action.validation.report', {}, 'Invalid report');
    const context = openPortalRepository(locals);
    try {
      context.repository.submitReport(context.principal, type, parsed.data.id, parsed.data.version);
      return actionSuccess('action.reports.submitted', {}, 'Report submitted for review');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.technicalChange', {}, 'Invalid technical change');
    const context = openPortalRepository(locals);
    try {
      context.v3.submitTechnicalChange(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess(
        'action.reports.technicalChangeSubmitted',
        {},
        'Technical change submitted for review',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createPlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = planningAssignmentInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.planningFields', {}, 'Check planning fields');
    const context = openPortalRepository(locals);
    try {
      context.repository.createPlanningAssignment(context.principal, parsed.data);
      return actionSuccess('action.planning.assignmentPublished', {}, 'Assignment published');
    } catch (error) {
      return actionFailure(error);
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
