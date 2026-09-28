import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { AssignmentExpensePolicyRepository, ConflictError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { financeActions } from '../../apps/portal/src/lib/server/actions/finance-actions';

const close = vi.fn();
const assignmentProject = vi.fn();

function request(values: Record<string, string>): Request {
  const body = new FormData();
  for (const [name, value] of Object.entries(values)) body.set(name, value);
  return new Request('http://local.test/app/finance?view=commercial', {
    method: 'POST',
    body,
  });
}

async function submit(
  actionName: 'setProjectReimbursementDefault' | 'setWorkerReimbursementOverride',
  values: Record<string, string>,
) {
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'finance-1', role: 'finance_admin' },
    sqlite: { close, prepare: () => ({ get: assignmentProject }) },
  } as unknown as ReturnType<typeof openPortalRepository>);
  return financeActions[actionName]({
    params: { section: 'finance' },
    locals: { user: { id: 'finance-1', role: 'finance_admin' } },
    request: request(values),
  } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  assignmentProject.mockReset();
});

describe('stale worker reimbursement policy actions', () => {
  it('keeps the attempted project mode and reason with a scoped review remedy', async () => {
    vi.spyOn(
      AssignmentExpensePolicyRepository.prototype,
      'setProjectReimbursementDefault',
    ).mockImplementation(() => {
      throw new ConflictError('Project changed. Reload its reimbursement policy');
    });
    const values = {
      projectId: 'project-b',
      expectedVersion: '2',
      mode: 'none',
      reason: 'Apply the revised travel policy',
    };
    const result = await submit('setProjectReimbursementDefault', values);

    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'WORKER_REIMBURSEMENT_POLICY_CHANGED',
        actionName: 'setProjectReimbursementDefault',
        values,
        remedies: [{ id: 'review_updated_record', projectId: 'project-b' }],
      },
    });
    expect((result as { data: { remedies: unknown[] } }).data.remedies[0]).not.toHaveProperty(
      'values',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the attempted person override and identifies its assignment', async () => {
    assignmentProject.mockReturnValue({ project_id: 'project-b' });
    vi.spyOn(
      AssignmentExpensePolicyRepository.prototype,
      'setWorkerReimbursementOverride',
    ).mockImplementation(() => {
      throw new ConflictError('Assignment changed. Reload its reimbursement policy');
    });
    const values = {
      projectMemberId: 'assignment-2',
      expectedVersion: '4',
      mode: 'at_cost',
      reason: 'Reimburse the worker for approved travel',
    };
    const result = await submit('setWorkerReimbursementOverride', values);

    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'WORKER_REIMBURSEMENT_POLICY_CHANGED',
        actionName: 'setWorkerReimbursementOverride',
        values,
        remedies: [
          { id: 'review_updated_record', recordId: 'assignment-2', projectId: 'project-b' },
        ],
      },
    });
    expect((result as { data: { remedies: unknown[] } }).data.remedies[0]).not.toHaveProperty(
      'values',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('offers a Finance contact when the removed assignment cannot be scoped to a project', async () => {
    assignmentProject.mockReturnValue(undefined);
    vi.spyOn(
      AssignmentExpensePolicyRepository.prototype,
      'setWorkerReimbursementOverride',
    ).mockImplementation(() => {
      throw new ConflictError('Assignment changed. Reload its reimbursement policy');
    });
    const values = {
      projectMemberId: 'removed-assignment',
      expectedVersion: '4',
      mode: 'none',
      reason: 'Travel policy changed after review',
    };
    const result = await submit('setWorkerReimbursementOverride', values);

    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'WORKER_REIMBURSEMENT_POLICY_CHANGED',
        values,
        remedies: [{ id: 'contact_finance_owner' }],
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
