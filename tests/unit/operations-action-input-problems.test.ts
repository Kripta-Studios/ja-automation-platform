import { describe, expect, it, vi } from 'vitest';

const autosave = vi.hoisted(() => ({ type: 'technical', state: 'submitted', canEdit: true }));

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return {
    ...original,
    openPortalRepository: () => ({
      principal: { userId: 'worker-1', role: 'worker' },
      sqlite: { close: vi.fn() },
      repository: {
        reportDetail: () => ({
          type: autosave.type,
          canEdit: autosave.canEdit,
          report: { approval_state: autosave.state, version: 2 },
        }),
      },
    }),
  };
});

import { reportActions } from '../../apps/portal/src/lib/server/actions/operations-actions';

function event(section: string, action: string, entries: Record<string, string>, file?: File) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  if (file) form.set('attachment', file);
  return {
    params: { section },
    request: new Request(`http://localhost/app/${section}?/${action}`, {
      method: 'POST',
      body: form,
    }),
    locals: {},
  } as never;
}

describe('operations action direct input problems', () => {
  it('explains an incomplete daily report and retains only safe fields', async () => {
    const result = await reportActions.createDailyReport(
      event(
        'reports',
        'createDailyReport',
        {
          title: 'Keep this title',
          reportDate: 'invalid',
          safetyRelated: 'on',
          patch: '{"private":"do not echo"}',
        },
        new File(['private contents'], 'receipt.txt'),
      ),
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'REPORT_DAILY_FIELDS_INVALID',
      messageKey: 'problem.report.fieldsInvalid',
      actionName: 'createDailyReport',
      values: { title: 'Keep this title', safetyRelated: 'on' },
      fieldErrors: expect.any(Object),
      remedies: [{ id: 'review_report_fields' }],
    });
    expect(result.data.values).not.toHaveProperty('attachment');
    expect(result.data.values).not.toHaveProperty('patch');
  });

  it('retains a technical change safety checkbox without echoing arbitrary input', async () => {
    const result = await reportActions.createTechnicalChange(
      event('reports', 'createTechnicalChange', {
        safetyImpact: 'on',
        patch: '{"private":"do not echo"}',
      }),
    );
    expect(result.data).toMatchObject({
      code: 'TECHNICAL_CHANGE_FIELDS_INVALID',
      values: { safetyImpact: 'on' },
    });
    expect(result.data.values).not.toHaveProperty('patch');
  });

  it('marks missing autosave identity without opening the repository', async () => {
    const result = await reportActions.autosaveReport(
      event('reports', 'autosaveReport', { type: 'daily', title: 'Keep this title' }),
    );
    expect(result.data).toMatchObject({
      code: 'REPORT_AUTOSAVE_REQUEST_INVALID',
      fieldErrors: { id: ['problem.report.autosaveRequestInvalid'] },
      values: { title: 'Keep this title' },
      remedies: [{ id: 'review_report' }],
    });
  });

  it('distinguishes an autosave report type change from an access denial', async () => {
    autosave.type = 'technical';
    const result = await reportActions.autosaveReport(
      event('reports', 'autosaveReport', {
        id: '11111111-1111-4111-8111-111111111111',
        version: '2',
        type: 'daily',
        projectId: '22222222-2222-4222-8222-222222222222',
        workerId: '33333333-3333-4333-8333-333333333333',
        workDate: '2026-09-25',
        summary: 'Completed the inspection',
        tasksCompleted: 'Checked the control panel',
        title: 'Keep this title',
      }),
    );
    expect(result.data).toMatchObject({
      code: 'REPORT_AUTOSAVE_TYPE_CHANGED',
      values: { title: 'Keep this title' },
      remedies: [{ id: 'review_report' }],
    });
  });

  it('returns the current status when autosave is no longer permitted', async () => {
    autosave.type = 'daily';
    autosave.state = 'submitted';
    const result = await reportActions.autosaveReport(
      event('reports', 'autosaveReport', {
        id: '11111111-1111-4111-8111-111111111111',
        version: '2',
        type: 'daily',
        projectId: '22222222-2222-4222-8222-222222222222',
        workDate: '2026-09-25',
        summary: 'Completed the inspection',
        tasksCompleted: 'Checked the control panel',
      }),
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'REPORT_AUTOSAVE_STATE_CHANGED',
      params: { status: 'submitted' },
      remedies: [{ id: 'review_report' }],
    });
  });

  it('requires a reason before a time correction draft', async () => {
    const result = await reportActions.createCorrectionDraft(
      event('time', 'createCorrectionDraft', {
        recordType: 'time_entry',
        originalId: '11111111-1111-4111-8111-111111111111',
        requestId: '22222222-2222-4222-8222-222222222222',
        reason: '',
      }),
    );
    expect(result.data).toMatchObject({
      code: 'CORRECTION_REASON_REQUIRED',
      fieldErrors: { reason: ['problem.correction.reasonRequired'] },
      remedies: [{ id: 'review_time' }],
    });
  });

  it('marks an invalid reporting period with retained scalar selection', async () => {
    const result = await reportActions.generatePeriodReports(
      event('reports', 'generatePeriodReports', {
        projectId: 'bad-id',
        periodStart: '2026-09-25',
        periodEnd: '2026-09-01',
      }),
    );
    expect(result.data).toMatchObject({
      code: 'REPORT_PERIOD_SELECTION_INVALID',
      values: { projectId: 'bad-id', periodStart: '2026-09-25' },
      fieldErrors: expect.any(Object),
      remedies: [{ id: 'review_report_period' }],
    });
  });

  it('requires a current report version and a supported type for submission', async () => {
    const result = await reportActions.submitReport(
      event('reports', 'submitReport', {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'other',
        version: 'bad',
      }),
    );
    expect(result.data).toMatchObject({
      code: 'REPORT_SUBMISSION_FIELDS_INVALID',
      fieldErrors: { type: ['problem.report.submissionFieldsInvalid'] },
      remedies: [{ id: 'review_report' }],
    });
    expect(result.data.fieldErrors).toHaveProperty('version');
  });

  it('marks missing draft identity and version before deletion', async () => {
    const result = await reportActions.deleteDraft(
      event('reports', 'deleteDraft', { recordType: 'daily_report', version: '0' }),
    );
    expect(result.data).toMatchObject({
      code: 'DRAFT_DELETE_REQUEST_INVALID',
      fieldErrors: {
        recordId: ['problem.report.deleteRequestInvalid'],
        version: ['problem.report.deleteRequestInvalid'],
      },
      remedies: [{ id: 'review_report' }],
    });
  });

  it('marks missing planning fields and preserves the entered date', async () => {
    const result = await reportActions.createPlanning(
      event('planning', 'createPlanning', { startsAt: '2026-09-25T08:00' }),
    );
    expect(result.data).toMatchObject({
      code: 'PLANNING_FIELDS_INVALID',
      operation: 'createPlanning',
      values: { startsAt: '2026-09-25T08:00' },
      fieldErrors: expect.any(Object),
      remedies: [{ id: 'review_planning_fields' }],
    });
  });

  it('marks both missing worker and skill on deletion', async () => {
    const result = await reportActions.deleteWorkerSkill(
      event('planning', 'deleteWorkerSkill', {}),
    );
    expect(result.data).toMatchObject({
      code: 'WORKER_SKILL_SELECTION_REQUIRED',
      fieldErrors: {
        workerId: ['problem.workforce.workerSkillSelectionRequired'],
        skillId: ['problem.workforce.workerSkillSelectionRequired'],
      },
      remedies: [{ id: 'review_worker_skills' }],
    });
  });

  it('requires a selected skill before an update', async () => {
    const result = await reportActions.updateSkill(
      event('planning', 'updateSkill', { name: 'Retain this name' }),
    );
    expect(result.data).toMatchObject({
      code: 'SKILL_SELECTION_REQUIRED',
      values: { name: 'Retain this name' },
      fieldErrors: { skillId: ['problem.workforce.skillSelectionRequired'] },
      remedies: [{ id: 'review_skills' }],
    });
  });

  it('marks invalid availability without losing note or dates', async () => {
    const result = await reportActions.setAvailability(
      event('planning', 'setAvailability', {
        workerId: 'bad-id',
        startsAt: '2026-09-25T08:00',
        note: 'Keep this note',
      }),
    );
    expect(result.data).toMatchObject({
      code: 'AVAILABILITY_FIELDS_INVALID',
      values: { startsAt: '2026-09-25T08:00', note: 'Keep this note' },
      fieldErrors: expect.any(Object),
      remedies: [{ id: 'review_availability_fields' }],
    });
  });
});
