import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import {
  reportActionFailure,
  reportActions,
} from '../../apps/portal/src/lib/server/actions/operations-actions';

describe('report and technical change action blockers', () => {
  it.each([
    [
      'Operational project access required',
      'REPORT_PROJECT_NOT_ACTIVE',
      'problem.report.projectNotActive',
    ],
    [
      'Project assignment access required',
      'REPORT_ASSIGNMENT_REQUIRED',
      'problem.report.assignmentRequired',
    ],
  ])('keeps a report draft when %s', (message, code, messageKey) => {
    const response = reportActionFailure(new AccessDeniedError(message), {
      projectId: 'project-1',
      workDate: '2026-09-26',
      tasksCompleted: 'Existing draft work',
    });
    expect(response.status).toBe(403);
    expect(response.data).toMatchObject({
      code,
      messageKey,
      values: {
        projectId: 'project-1',
        workDate: '2026-09-26',
        tasksCompleted: 'Existing draft work',
      },
      remedies: [{ id: 'contact_project_owner' }],
    });
  });

  it.each([
    [
      'Project access required',
      'createTechnicalChange',
      'TECHNICAL_CHANGE_PROJECT_ACCESS_REQUIRED',
      403,
      'contact_project_owner',
    ],
    [
      'Technical change submission access required',
      'submitTechnicalChange',
      'TECHNICAL_CHANGE_SUBMISSION_ACCESS_REQUIRED',
      403,
      'contact_project_owner',
    ],
    [
      'Active project required for technical change submission',
      'submitTechnicalChange',
      'TECHNICAL_CHANGE_PROJECT_NOT_ACTIVE',
      403,
      'contact_project_owner',
    ],
    [
      'Effective project assignment required for technical change submission',
      'submitTechnicalChange',
      'TECHNICAL_CHANGE_ASSIGNMENT_REQUIRED',
      403,
      'contact_project_owner',
    ],
  ])('explains V3 access blocker %s', (message, actionName, code, status, remedy) => {
    const response = reportActionFailure(new V3AccessDeniedError(message), {
      actionName,
      id: 'change-1',
      projectId: 'project-1',
      component: 'PLC A',
      changeMade: 'Retain this change',
    });
    expect(response.status).toBe(status);
    expect(response.data).toMatchObject({
      code,
      actionName,
      values: {
        id: 'change-1',
        projectId: 'project-1',
        component: 'PLC A',
        changeMade: 'Retain this change',
      },
      remedies: [{ id: remedy }],
    });
  });

  it('explains a stale technical change submission', () => {
    const response = reportActionFailure(
      new V3ConflictError('Technical change changed or cannot be submitted'),
      { actionName: 'submitTechnicalChange', id: 'change-1', version: '2' },
    );
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'TECHNICAL_CHANGE_SUBMISSION_CHANGED',
      values: { id: 'change-1', version: '2' },
      remedies: [{ id: 'review_reports' }],
    });
  });

  it('keeps the generic V3 project access error outside technical change actions', () => {
    const response = reportActionFailure(new V3AccessDeniedError('Project access required'), {
      projectId: 'project-1',
    });
    expect(response.status).toBe(403);
    expect(response.data).toMatchObject({
      messageKey: 'action.error.forbidden',
      values: { projectId: 'project-1' },
    });
  });

  it('identifies a technical report from another project', () => {
    const response = reportActionFailure(
      new V3ValidationError('Technical report does not belong to the project'),
      {
        actionName: 'createTechnicalChange',
        projectId: 'project-1',
        technicalReportId: 'report-2',
        changeMade: 'Retain this change',
      },
    );
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'TECHNICAL_CHANGE_REPORT_MISMATCH',
      values: { technicalReportId: 'report-2', changeMade: 'Retain this change' },
      fieldErrors: {
        technicalReportId: ['problem.report.technicalChangeReportMismatch'],
      },
      remedies: [{ id: 'review_report_fields' }],
    });
  });

  it('points safety change validation at the missing form field', async () => {
    const form = new FormData();
    form.set('projectId', '11111111-1111-4111-8111-111111111111');
    form.set('component', 'PLC A');
    form.set('changeMade', 'Retain this change');
    form.set('validation', 'Verified in test');
    form.set('safetyImpact', 'on');
    const response = await reportActions.createTechnicalChange({
      request: new Request('http://localhost/app/reports?/createTechnicalChange', {
        method: 'POST',
        body: form,
      }),
      params: { section: 'reports' },
    } as never);
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'TECHNICAL_CHANGE_SAFETY_DETAILS_REQUIRED',
      actionName: 'createTechnicalChange',
      values: {
        component: 'PLC A',
        changeMade: 'Retain this change',
        validation: 'Verified in test',
      },
      fieldErrors: {
        rollbackInformation: ['problem.report.technicalChangeSafetyDetailsRequired'],
      },
      remedies: [{ id: 'review_report_fields' }],
    });
    expect(response.data.fieldErrors).not.toHaveProperty('validation');
  });
});
