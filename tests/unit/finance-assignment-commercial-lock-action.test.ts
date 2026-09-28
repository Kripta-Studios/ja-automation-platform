import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V3AccessDeniedError, V3ConflictError } from '@ja/database';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { financeActions } from '../../apps/portal/src/lib/server/actions/finance-actions';

const assignmentId = '22222222-2222-4222-8222-222222222222';
const projectId = '11111111-1111-4111-8111-111111111111';
const ruleId = '33333333-3333-4333-8333-333333333333';
const lockedMessage =
  'Assignment commercial terms cannot change after time has been recorded; use a date-effective rule';
const setFallback = vi.fn();
const setReferences = vi.fn();
const close = vi.fn();
const getProject = vi.fn(() => ({ project_id: projectId }));
const prepare = vi.fn(() => ({ get: getProject }));

function request(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://localhost/app/finance', { method: 'POST', body: form });
}

async function submit(
  actionName: 'setAssignmentCommercialFallback' | 'setAssignmentCommercialRuleReferences',
  values: Record<string, string>,
) {
  return financeActions[actionName]({
    request: request(values),
    params: { section: 'finance' },
    locals: { user: { id: 'finance-1', role: 'finance_admin' } },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  getProject.mockReturnValue({ project_id: projectId });
  setFallback.mockImplementation(() => {
    throw new V3ConflictError(lockedMessage);
  });
  setReferences.mockImplementation(() => {
    throw new V3ConflictError(lockedMessage);
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

describe('recorded time locks assignment commercial choices', () => {
  it.each([
    [
      'setAssignmentCommercialFallback',
      { allowGlobalCompensation: 'yes', allowGlobalInternalCost: 'no' },
    ],
    [
      'setAssignmentCommercialRuleReferences',
      { clientBillRuleId: ruleId, workerCompensationRuleId: '', internalCostRuleId: '' },
    ],
  ] as const)('returns a specific 409 and retains %s values', async (actionName, choices) => {
    const values = { projectMemberId: assignmentId, expectedVersion: '2', ...choices };
    const result = await submit(actionName, values);
    expect(result).toMatchObject({
      status: 409,
      data: {
        success: false,
        code: 'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME',
        messageKey: 'problem.finance.assignmentCommercialLockedByTime',
        actionName,
        values,
        fieldErrors: {},
        remedies: [
          { id: 'review_compensation_rules', projectId },
          { id: 'review_client_labor_rates', projectId },
          { id: 'review_internal_cost_rules', projectId },
        ],
      },
    });
    expect(result.data?.correlationId).toEqual(expect.any(String));
    expect(getProject).toHaveBeenCalledWith(assignmentId);
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not expose the assignment project when Finance access is denied', async () => {
    setFallback.mockImplementation(() => {
      throw new V3AccessDeniedError('Finance role required');
    });
    const result = await submit('setAssignmentCommercialFallback', {
      projectMemberId: assignmentId,
      expectedVersion: '2',
      allowGlobalCompensation: 'yes',
      allowGlobalInternalCost: 'no',
    });
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'FINANCE_ROLE_REQUIRED',
        remedies: [{ id: 'contact_finance_owner' }],
      },
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('has meaningful English, Spanish, and Portuguese guidance', () => {
    const key = 'problem.finance.assignmentCommercialLockedByTime';
    expect(portalText('en', key)).toContain('worker pay, customer billing, or internal cost');
    expect(portalText('es', key)).toContain('pago al trabajador');
    expect(portalText('pt', key)).toContain('pagamento ao trabalhador');
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(portalText(locale, 'problem.finance.assignmentCommercialRecordedTime')).not.toMatch(
        /^problem\./u,
      );
      expect(portalText(locale, 'problem.finance.assignmentCommercialRuleUnavailable')).not.toMatch(
        /^problem\./u,
      );
    }
  });
});
