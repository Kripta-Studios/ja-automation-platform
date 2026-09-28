import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V3ValidationError } from '@ja/database';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { financeActions } from '../../apps/portal/src/lib/server/actions/finance-actions';

const assignmentId = '22222222-2222-4222-8222-222222222222';
const projectId = '11111111-1111-4111-8111-111111111111';
const ruleId = '33333333-3333-4333-8333-333333333333';
const unavailableMessage = 'Commercial rule is unavailable for the full assignment scope and dates';
const setReferences = vi.fn();
const getProject = vi.fn(() => ({ project_id: projectId }));
const prepare = vi.fn(() => ({ get: getProject }));
const close = vi.fn();

async function submit(values: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return financeActions.setAssignmentCommercialRuleReferences({
    request: new Request('http://localhost/app/finance', { method: 'POST', body }),
    params: { section: 'finance' },
    locals: { user: { id: 'finance-1', role: 'finance_admin' } },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  getProject.mockReturnValue({ project_id: projectId });
  setReferences.mockImplementation(() => {
    throw new V3ValidationError(unavailableMessage);
  });
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'finance-1', role: 'finance_admin' },
    sqlite: { prepare, close },
    v3: { setAssignmentCommercialRuleReferences: setReferences },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('assignment commercial rule changed while its form was open', () => {
  const values = {
    projectMemberId: assignmentId,
    expectedVersion: '2',
    clientBillRuleId: ruleId,
    workerCompensationRuleId: '',
    internalCostRuleId: '',
  };

  it('returns a typed 409 with safe Finance review steps and retained selection', async () => {
    const result = await submit(values);
    expect(result).toMatchObject({
      status: 409,
      data: {
        success: false,
        code: 'FINANCE_ASSIGNMENT_COMMERCIAL_RULE_UNAVAILABLE',
        messageKey: 'problem.finance.assignmentCommercialRuleUnavailable',
        actionName: 'setAssignmentCommercialRuleReferences',
        values,
        fieldErrors: {},
        remedies: [
          { id: 'review_client_labor_rates', projectId },
          { id: 'review_compensation_rules', projectId },
          { id: 'review_internal_cost_rules', projectId },
        ],
      },
    });
    expect(result.data?.message).not.toContain(unavailableMessage);
    expect(result.data?.correlationId).toEqual(expect.any(String));
    expect(setReferences).toHaveBeenCalledOnce();
    expect(getProject).toHaveBeenCalledWith(assignmentId);
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not disclose an assignment project if it cannot be resolved', async () => {
    getProject.mockReturnValueOnce(undefined as never);
    const result = await submit(values);
    expect(result.status).toBe(409);
    expect(result.data?.remedies).toEqual([
      { id: 'review_client_labor_rates', projectId: undefined },
      { id: 'review_compensation_rules', projectId: undefined },
      { id: 'review_internal_cost_rules', projectId: undefined },
    ]);
    expect(result.data?.params).toEqual({});
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves other validation failures on their existing path', async () => {
    setReferences.mockImplementationOnce(() => {
      throw new V3ValidationError('Commercial rule ID is invalid');
    });
    const result = await submit(values);
    expect(result).toMatchObject({
      status: 400,
      data: {
        messageKey: 'action.error.invalid',
        actionName: 'setAssignmentCommercialRuleReferences',
      },
    });
    expect(getProject).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
