import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActions } from '../../apps/portal/src/lib/server/actions/operations-actions';

const reportId = '11111111-1111-4111-8111-111111111111';
const changeId = '22222222-2222-4222-8222-222222222222';
const milestoneId = '33333333-3333-4333-8333-333333333333';
const repository = { reviewReport: vi.fn(), reviewProjectMilestone: vi.fn() };
const v3 = { reviewTechnicalChange: vi.fn() };
const close = vi.fn();

function request(values: Record<string, string>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return new Request('http://local.test/approvals', { method: 'POST', body });
}

async function submit(
  actionName: 'reviewReport' | 'reviewTechnicalChange' | 'reviewMilestone',
  values: Record<string, string>,
) {
  return reportActions[actionName]({
    params: { section: 'approvals' },
    locals: { user: { id: 'reviewer-1', role: 'project_manager' } },
    request: request(values),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(openPortalRepository).mockReturnValue({
    repository,
    v3,
    principal: { userId: 'reviewer-1', role: 'project_manager' },
    sqlite: { close },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('approval review action audit', () => {
  it('keeps submitted report review values when the record leaves the queue', async () => {
    repository.reviewReport.mockImplementation(() => {
      throw new ConflictError('Report is not submitted');
    });
    const result = await submit('reviewReport', {
      type: 'daily',
      id: reportId,
      decision: 'needs_changes',
      reason: 'Correct the summary',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'APPROVAL_REPORT_NOT_SUBMITTED',
        actionName: 'reviewReport',
        params: { recordType: 'daily' },
        values: { reason: 'Correct the summary' },
        remedies: [{ id: 'review_updated_record', recordId: reportId }],
      },
    });
  });

  it('reports a missing report reason beside the field', async () => {
    const result = await submit('reviewReport', {
      type: 'technical',
      id: reportId,
      decision: 'needs_changes',
      reason: '',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'APPROVAL_REVIEW_REASON_REQUIRED',
        values: { reason: '' },
        fieldErrors: { reason: ['problem.approval.reasonRequired'] },
        remedies: [{ id: 'enter_reason' }],
      },
    });
    expect(repository.reviewReport).not.toHaveBeenCalled();
  });

  it.each([
    ['Report not found', ValidationError, 404, 'APPROVAL_REPORT_UNAVAILABLE'],
    [
      'Active project required for report review',
      AccessDeniedError,
      403,
      'APPROVAL_PROJECT_NOT_ACTIVE',
    ],
    ['Project review required', AccessDeniedError, 403, 'APPROVAL_REVIEW_PERMISSION_REQUIRED'],
  ] as const)('maps the known report blocker %s', async (message, ErrorClass, status, code) => {
    repository.reviewReport.mockImplementation(() => {
      throw new ErrorClass(message);
    });
    const result = await submit('reviewReport', {
      type: 'daily',
      id: reportId,
      decision: 'approved',
    });
    expect(result).toMatchObject({ status, data: { code } });
  });

  it('gives safety-impacting technical changes an explicit return remedy', async () => {
    v3.reviewTechnicalChange.mockImplementation(() => {
      throw new V3ValidationError(
        'Safety-impacting changes cannot be approved without validation and rollback information',
      );
    });
    const result = await submit('reviewTechnicalChange', {
      id: changeId,
      decision: 'approved',
      reason: '',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'APPROVAL_SAFETY_EVIDENCE_REQUIRED',
        messageKey: 'problem.approval.safetyEvidenceRequired',
        actionName: 'reviewTechnicalChange',
        remedies: [{ id: 'return_for_correction' }],
      },
    });
  });

  it.each([
    ['Technical change not found', V3ValidationError, 404, 'APPROVAL_TECHNICAL_CHANGE_UNAVAILABLE'],
    [
      'Technical change is not submitted',
      V3ConflictError,
      409,
      'APPROVAL_TECHNICAL_CHANGE_NOT_SUBMITTED',
    ],
    [
      'Technical change review required',
      V3AccessDeniedError,
      403,
      'APPROVAL_REVIEW_PERMISSION_REQUIRED',
    ],
  ] as const)(
    'maps the known technical-change blocker %s',
    async (message, ErrorClass, status, code) => {
      v3.reviewTechnicalChange.mockImplementation(() => {
        throw new ErrorClass(message);
      });
      const result = await submit('reviewTechnicalChange', { id: changeId, decision: 'approved' });
      expect(result).toMatchObject({ status, data: { code, values: { id: changeId } } });
    },
  );

  it('rejects a milestone decision that this workflow cannot record', async () => {
    const result = await submit('reviewMilestone', {
      id: milestoneId,
      decision: 'needs_changes',
      reason: 'Return for edits',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'APPROVAL_MILESTONE_DECISION_INVALID',
        values: { reason: 'Return for edits' },
        fieldErrors: { decision: ['problem.approval.milestoneDecisionInvalid'] },
      },
    });
    expect(repository.reviewProjectMilestone).not.toHaveBeenCalled();
  });

  it.each([
    ['Milestone not found', ValidationError, 404, 'APPROVAL_MILESTONE_UNAVAILABLE'],
    ['Submitted milestone required', ConflictError, 409, 'APPROVAL_MILESTONE_NOT_SUBMITTED'],
    [
      'Active project required for milestone review',
      AccessDeniedError,
      403,
      'APPROVAL_PROJECT_NOT_ACTIVE',
    ],
    ['A rejection reason is required', ValidationError, 400, 'APPROVAL_REVIEW_REASON_REQUIRED'],
  ] as const)('maps the known milestone blocker %s', async (message, ErrorClass, status, code) => {
    repository.reviewProjectMilestone.mockImplementation(() => {
      throw new ErrorClass(message);
    });
    const result = await submit('reviewMilestone', {
      id: milestoneId,
      decision: 'rejected',
      reason: 'Incorrect scope',
    });
    expect(result).toMatchObject({ status, data: { code } });
  });

  it('retains malformed technical-review values and marks the invalid field', async () => {
    const result = await submit('reviewTechnicalChange', {
      id: changeId,
      decision: 'invalid',
      reason: 'Keep this',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'APPROVAL_REVIEW_FIELDS_INVALID',
        values: { decision: 'invalid', reason: 'Keep this' },
        fieldErrors: { decision: ['problem.approval.reviewFieldsInvalid'] },
      },
    });
  });

  it('preserves a successful review outcome', async () => {
    const result = await submit('reviewMilestone', { id: milestoneId, decision: 'approved' });
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.approvals.milestoneReviewRecorded',
    });
    expect(repository.reviewProjectMilestone).toHaveBeenCalledWith(
      expect.anything(),
      milestoneId,
      'approved',
      undefined,
    );
  });

  it('does not misclassify an unexpected exception with familiar text', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      repository.reviewReport.mockImplementation(() => {
        throw new Error('Report is not submitted');
      });
      const result = await submit('reviewReport', {
        type: 'daily',
        id: reportId,
        decision: 'approved',
      });
      expect(result).toMatchObject({ status: 500, data: { code: 'UNEXPECTED_ERROR' } });
    } finally {
      logged.mockRestore();
    }
  });
});
