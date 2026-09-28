import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V3ConflictError } from '@ja/database';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { financeActions } from '../../apps/portal/src/lib/server/actions/finance-actions';

const assignmentId = '22222222-2222-4222-8222-222222222222';
const projectId = '11111111-1111-4111-8111-111111111111';
const ruleId = '33333333-3333-4333-8333-333333333333';
const versionChanged = 'Project assignment changed before commercial update';
const setFallback = vi.fn();
const setReferences = vi.fn();
const getProject = vi.fn(() => ({ project_id: projectId }));
const prepare = vi.fn(() => ({ get: getProject }));
const close = vi.fn();

type ActionName = 'setAssignmentCommercialFallback' | 'setAssignmentCommercialRuleReferences';

async function submit(actionName: ActionName, values: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return financeActions[actionName]({
    request: new Request('http://localhost/app/finance', { method: 'POST', body }),
    params: { section: 'finance' },
    locals: { user: { id: 'finance-1', role: 'finance_admin' } },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  getProject.mockReturnValue({ project_id: projectId });
  setFallback.mockImplementation(() => {
    throw new V3ConflictError(versionChanged);
  });
  setReferences.mockImplementation(() => {
    throw new V3ConflictError(versionChanged);
  });
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'finance-1', role: 'finance_admin' },
    sqlite: { prepare, close },
    v3: {
      setAssignmentCommercialFallback: setFallback,
      setAssignmentCommercialRuleReferences: setReferences,
    },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('assignment commercial choices changed while the form was open', () => {
  it.each([
    [
      'setAssignmentCommercialFallback',
      { allowGlobalCompensation: 'yes', allowGlobalInternalCost: 'no' },
    ],
    [
      'setAssignmentCommercialRuleReferences',
      { clientBillRuleId: ruleId, workerCompensationRuleId: '', internalCostRuleId: '' },
    ],
  ] as const)(
    'returns a specific native-form 409 and retains %s choices',
    async (actionName, choices) => {
      const values = { projectMemberId: assignmentId, expectedVersion: '2', ...choices };
      const result = await submit(actionName, values);
      expect(result).toMatchObject({
        status: 409,
        data: {
          success: false,
          code: 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED',
          messageKey: 'problem.finance.assignmentCommercialVersionChanged',
          message:
            "This person's commercial choices changed while the form was open. Your changes were not saved. Review the current saved choices before deciding whether to submit yours.",
          actionName,
          values,
          params: {},
          fieldErrors: {},
          remedies: [{ id: 'review_updated_record', recordId: assignmentId, projectId }],
        },
      });
      expect(result.data?.correlationId).toEqual(expect.any(String));
      expect(result.data?.messageKey).not.toBe('action.error.conflict');
      expect(getProject).toHaveBeenCalledWith(assignmentId);
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('omits project identity when the authorized lookup cannot resolve it', async () => {
    getProject.mockReturnValueOnce(undefined as never);
    const result = await submit('setAssignmentCommercialFallback', {
      projectMemberId: assignmentId,
      expectedVersion: '2',
      allowGlobalCompensation: 'yes',
      allowGlobalInternalCost: 'no',
    });
    expect(result.status).toBe(409);
    expect(result.data?.remedies).toEqual([
      { id: 'review_updated_record', recordId: assignmentId },
    ]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps an unrelated conflict on its existing path', async () => {
    setFallback.mockImplementationOnce(() => {
      throw new V3ConflictError('An unrelated commercial conflict');
    });
    const result = await submit('setAssignmentCommercialFallback', {
      projectMemberId: assignmentId,
      expectedVersion: '2',
      allowGlobalCompensation: 'yes',
      allowGlobalInternalCost: 'no',
    });
    expect(result).toMatchObject({
      status: 409,
      data: { messageKey: 'action.error.conflict', actionName: 'setAssignmentCommercialFallback' },
    });
    expect(getProject).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
