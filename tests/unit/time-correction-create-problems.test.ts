import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActions } from '../../apps/portal/src/lib/server/actions/operations-actions';

const originalId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const close = vi.fn();
const repository = {
  timeDetail: vi.fn(),
  createCorrectionDraft: vi.fn(),
};

function correction(values: Record<string, string> = {}) {
  return {
    recordType: 'time_entry',
    correctionFields: 'time_entry',
    originalId,
    requestId,
    reason: 'Correct the site work details',
    workDate: '2026-09-25',
    category: 'commissioning',
    minutes: '60',
    activitySummary: 'Checked the updated control sequence',
    activityCode: 'PLC-VERIFY',
    site: 'North plant',
    startTime: '08:00',
    endTime: '09:00',
    breakMinutes: '0',
    ...values,
  };
}

async function submit(values: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return reportActions.createCorrectionDraft({
    params: { section: 'time', id: originalId },
    locals: { user: { id: 'worker-1', role: 'worker' } },
    request: new Request('http://local.test/app/time/correction?/createCorrectionDraft', {
      method: 'POST',
      body,
    }),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  repository.timeDetail.mockReturnValue({
    id: originalId,
    work_date: '2026-09-24',
    category: 'regular',
    minutes: 45,
    activity_summary: 'Original site inspection',
    activity_code: null,
    site: null,
    start_time: null,
    end_time: null,
    break_minutes: null,
  });
  vi.mocked(openPortalRepository).mockReturnValue({
    repository,
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('time correction creation conflict recovery', () => {
  it.each([
    [
      'A correction draft already exists for this original record',
      'TIME_CORRECTION_ALREADY_EXISTS',
      'problem.time.correctionAlreadyExists',
      'review_time',
    ],
    [
      'Correction request payload conflicts with prior replay',
      'TIME_CORRECTION_RETRY_CHANGED',
      'problem.time.correctionRetryChanged',
      'review_time',
    ],
    [
      'Only approved or reviewer-returned time can create a correction draft',
      'TIME_CORRECTION_STATE_BLOCKED',
      'problem.time.correctionStateBlocked',
      'review_time',
    ],
    [
      'Financially finalized records require a finance correction',
      'TIME_CORRECTION_FINANCIALLY_FINALIZED',
      'problem.time.correctionFinanciallyFinalized',
      'contact_finance',
    ],
    [
      'Settled compensation time requires an explicit adjustment',
      'TIME_CORRECTION_SETTLED_COMPENSATION',
      'problem.time.correctionSettledCompensation',
      'contact_finance',
    ],
    [
      'Returned correction changed before retry creation',
      'TIME_CORRECTION_RETURNED_CHANGED',
      'problem.time.correctionReturnedChanged',
      'review_time',
    ],
  ] as const)('maps %s without losing entered fields', async (cause, code, messageKey, remedy) => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new ConflictError(cause);
    });
    const response = await submit(correction({ privateToken: 'do-not-echo' }));
    expect(response).toMatchObject({
      status: 409,
      data: {
        code,
        messageKey,
        actionName: 'createCorrectionDraft',
        values: {
          originalId,
          requestId,
          reason: 'Correct the site work details',
          workDate: '2026-09-25',
          category: 'commissioning',
          minutes: '60',
          activitySummary: 'Checked the updated control sequence',
          activityCode: 'PLC-VERIFY',
          site: 'North plant',
          startTime: '08:00',
          endTime: '09:00',
          breakMinutes: '0',
        },
        fieldErrors: {},
        remedies: [{ id: remedy }],
        correlationId: expect.any(String),
      },
    });
    expect(JSON.stringify(response.data)).not.toContain('do-not-echo');
    expect(response.data.message).not.toBe(cause);
    expect(repository.createCorrectionDraft).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses a role-safe remedy when correction access changed', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('Correction access required');
    });
    const response = await submit(correction({ site: 'Keep entered site' }));
    expect(response).toMatchObject({
      status: 403,
      data: {
        code: 'TIME_CORRECTION_ACCESS_REQUIRED',
        messageKey: 'problem.time.correctionAccessRequired',
        actionName: 'createCorrectionDraft',
        values: { site: 'Keep entered site', requestId, originalId },
        remedies: [{ id: 'contact_project_owner' }],
        correlationId: expect.any(String),
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['empty', ''],
    ['too short', 'ab'],
    ['too long', 'x'.repeat(2001)],
  ])('keeps the correction form and marks a %s reason', async (_label, reason) => {
      const response = await submit(correction({ reason, site: 'Retain entered site' }));
      expect(response).toMatchObject({
        status: 400,
        data: {
          code: 'TIME_CORRECTION_REASON_INVALID',
          messageKey: 'problem.time.correctionReasonInvalid',
          actionName: 'createCorrectionDraft',
          values: { reason, site: 'Retain entered site', originalId, requestId },
          fieldErrors: { reason: ['problem.time.correctionReasonInvalid'] },
          remedies: [{ id: 'enter_reason' }],
        },
      });
      expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it.each(['Correction reason is required', 'Correction reason must contain at least 3 characters'])(
    'maps repository reason validation: %s',
    async (cause) => {
      repository.createCorrectionDraft.mockImplementation(() => {
        throw new ValidationError(cause);
      });
      const response = await submit(correction());
      expect(response).toMatchObject({
        status: 400,
        data: {
          code: 'TIME_CORRECTION_REASON_INVALID',
          fieldErrors: { reason: ['problem.time.correctionReasonInvalid'] },
          remedies: [{ id: 'enter_reason' }],
          values: { activitySummary: 'Checked the updated control sequence' },
        },
      });
    },
  );

  it('returns a safe time-register remedy when the entry vanished before field validation', async () => {
    repository.timeDetail.mockImplementation(() => {
      throw new ValidationError('Time entry not found');
    });
    const response = await submit(correction({ site: 'Keep site input' }));
    expect(response).toMatchObject({
      status: 404,
      data: {
        code: 'TIME_CORRECTION_RECORD_UNAVAILABLE',
        messageKey: 'problem.time.correctionRecordUnavailable',
        actionName: 'createCorrectionDraft',
        values: { site: 'Keep site input' },
        remedies: [{ id: 'review_week' }],
      },
    });
    expect(repository.createCorrectionDraft).not.toHaveBeenCalled();
  });

  it('maps a missing original detected inside the repository transaction', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new ValidationError('Original record not found');
    });
    const response = await submit(correction());
    expect(response.status).toBe(404);
    expect(response.data).toMatchObject({
      code: 'TIME_CORRECTION_RECORD_UNAVAILABLE',
      remedies: [{ id: 'review_week' }],
    });
  });

  it('marks the corrected date when the worker assignment no longer covers it', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('Worker assignment does not cover corrected work date');
    });
    const response = await submit(correction({ workDate: '2026-09-26' }));
    expect(response).toMatchObject({
      status: 409,
      data: {
        code: 'TIME_CORRECTION_DATE_ASSIGNMENT_REQUIRED',
        messageKey: 'problem.time.correctionDateAssignmentRequired',
        values: { workDate: '2026-09-26' },
        fieldErrors: { workDate: ['problem.time.correctionDateAssignmentRequired'] },
        remedies: [{ id: 'contact_project_owner' }],
      },
    });
  });

  it('explains changed access to the original time entry without blaming the corrected date', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('Project assignment access required');
    });
    const response = await submit(
      correction({ workDate: '2026-09-26', activitySummary: 'Keep the new activity details' }),
    );
    expect(response).toMatchObject({
      status: 403,
      data: {
        code: 'TIME_CORRECTION_ASSIGNMENT_ACCESS_CHANGED',
        messageKey: 'problem.time.correctionAssignmentAccessChanged',
        actionName: 'createCorrectionDraft',
        values: {
          workDate: '2026-09-26',
          activitySummary: 'Keep the new activity details',
          requestId,
          originalId,
        },
        fieldErrors: {},
        remedies: [{ id: 'contact_project_owner' }],
        correlationId: expect.any(String),
      },
    });
    expect(String(response.data.message)).not.toContain('report');
    expect(close).toHaveBeenCalledOnce();
  });

  it('marks only the corrected date when the caller lost project access for that date', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('Corrected work date outside project access');
    });
    const response = await submit(
      correction({ workDate: '2026-09-26', activitySummary: 'Keep the corrected activity' }),
    );
    expect(response).toMatchObject({
      status: 403,
      data: {
        code: 'TIME_CORRECTION_CORRECTED_DATE_ACCESS_REQUIRED',
        messageKey: 'problem.time.correctionCorrectedDateAccessRequired',
        actionName: 'createCorrectionDraft',
        values: {
          workDate: '2026-09-26',
          activitySummary: 'Keep the corrected activity',
          requestId,
        },
        fieldErrors: {
          workDate: ['problem.time.correctionCorrectedDateAccessRequired'],
        },
        remedies: [{ id: 'contact_project_owner' }],
        correlationId: expect.any(String),
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves unrelated conflicts on the existing fallback path', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new ConflictError('Different correction conflict');
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const response = await submit(correction());
      expect(response.status).toBe(409);
      expect(response.data.code).not.toBe('TIME_CORRECTION_ALREADY_EXISTS');
      expect(response.data.code).not.toBe('TIME_CORRECTION_RETRY_CHANGED');
    } finally {
      warning.mockRestore();
    }
  });
});
