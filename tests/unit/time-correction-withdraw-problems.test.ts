import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
vi.mock('$lib/server/actions/time-correction-dependency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/actions/time-correction-dependency')>()),
  timeCorrectionDependency: vi.fn(),
}));

import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActions } from '../../apps/portal/src/lib/server/actions/operations-actions';
import { timeCorrectionDependency } from '../../apps/portal/src/lib/server/actions/time-correction-dependency';

const correctionId = '22222222-2222-4222-8222-222222222222';
const linkedId = '33333333-3333-4333-8333-333333333333';
const repository = { withdrawCorrectionDraft: vi.fn() };
const close = vi.fn();

function request(reason = 'This entry needs a different correction'): Request {
  const form = new FormData();
  form.set('recordType', 'time_entry');
  form.set('correctionId', correctionId);
  form.set('version', '1');
  form.set('reason', reason);
  return new Request('http://local.test/app/time/' + correctionId, { method: 'POST', body: form });
}

async function withdraw(reason?: string) {
  return reportActions.withdrawCorrectionDraft({
    request: request(reason),
    params: { id: correctionId, section: 'time' },
    locals: { user: { id: 'worker-1', role: 'worker' } },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  repository.withdrawCorrectionDraft.mockImplementation(() => {
    throw new ConflictError('Correction draft has dependent records');
  });
  vi.mocked(openPortalRepository).mockReturnValue({
    repository,
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('time correction withdrawal dependencies', () => {
  it.each([
    ['expense', 'TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE', 'review_linked_expense'],
    ['report', 'TIME_CORRECTION_WITHDRAW_LINKED_REPORT', 'review_linked_report'],
  ] as const)('points to an authorized linked %s', async (kind, code, remedy) => {
    vi.mocked(timeCorrectionDependency).mockReturnValue({ kind, recordId: linkedId });
    const response = await withdraw();
    expect(response).toMatchObject({
      status: 409,
      data: {
        code,
        actionName: 'withdrawCorrectionDraft',
        fieldErrors: {},
        remedies: [{ id: remedy, recordId: linkedId }],
        values: { reason: 'This entry needs a different correction' },
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps an inaccessible dependency neutral and retains the reason', async () => {
    vi.mocked(timeCorrectionDependency).mockReturnValue({ kind: 'other' });
    const response = await withdraw();
    expect(response).toMatchObject({
      status: 409,
      data: {
        code: 'TIME_CORRECTION_WITHDRAW_HAS_DEPENDENCIES',
        remedies: [{ id: 'contact_project_owner' }],
        values: { reason: 'This entry needs a different correction' },
      },
    });
    expect(JSON.stringify(response.data)).not.toContain(linkedId);
  });

  it('gives an owner a finance next step for an inaccessible dependency', async () => {
    vi.mocked(timeCorrectionDependency).mockReturnValue({ kind: 'other' });
    vi.mocked(openPortalRepository).mockReturnValue({
      repository,
      principal: { userId: 'owner-1', role: 'owner_admin' },
      sqlite: { close },
    } as unknown as ReturnType<typeof openPortalRepository>);
    const response = await withdraw();
    expect(response).toMatchObject({
      status: 409,
      data: {
        code: 'TIME_CORRECTION_WITHDRAW_HAS_DEPENDENCIES',
        remedies: [{ id: 'contact_finance' }],
      },
    });
  });

  it.each([
    [
      new ConflictError('Correction draft changed before withdrawal'),
      'TIME_CORRECTION_WITHDRAW_CHANGED',
      'review_time',
      409,
    ],
    [
      new ConflictError('Only an unreviewed correction draft can be withdrawn'),
      'TIME_CORRECTION_WITHDRAW_REVIEWED',
      'review_time',
      409,
    ],
    [
      new AccessDeniedError('Correction withdrawal access required'),
      'TIME_CORRECTION_WITHDRAW_ACCESS_REQUIRED',
      'contact_project_owner',
      403,
    ],
    [
      new AccessDeniedError('Delegated correction withdrawal requires crew authorization'),
      'TIME_CORRECTION_WITHDRAW_CREW_ACCESS_REQUIRED',
      'contact_project_owner',
      403,
    ],
    [
      new ValidationError('Withdrawal reason is required'),
      'TIME_CORRECTION_WITHDRAW_REASON_INVALID',
      'enter_reason',
      400,
    ],
    [
      new ValidationError('Correction withdrawal is invalid'),
      'TIME_CORRECTION_WITHDRAW_REQUEST_INVALID',
      'review_time',
      400,
    ],
  ] as const)(
    'maps a nondependency withdrawal blocker: %s',
    async (error, code, remedy, status) => {
      repository.withdrawCorrectionDraft.mockImplementation(() => {
        throw error;
      });
      const response = await withdraw();
      expect(response).toMatchObject({
        status,
        data: {
          code,
          actionName: 'withdrawCorrectionDraft',
          remedies: [{ id: remedy }],
          values: { reason: 'This entry needs a different correction' },
        },
      });
    },
  );

  it('keeps an uncertain withdrawal safe and reviewable', async () => {
    repository.withdrawCorrectionDraft.mockImplementation(() => {
      throw new Error('private database detail');
    });
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await withdraw();
      expect(response).toMatchObject({
        status: 500,
        data: {
          code: 'UNEXPECTED_ERROR',
          actionName: 'withdrawCorrectionDraft',
          remedies: [{ id: 'review_time' }],
          values: { reason: 'This entry needs a different correction' },
        },
      });
      expect(JSON.stringify(response.data)).not.toContain('private database detail');
      expect(logging).toHaveBeenCalled();
    } finally {
      logging.mockRestore();
    }
  });

  it('asks an owner with an expired live session to sign in again', async () => {
    repository.withdrawCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('Live authenticated session required');
    });
    vi.mocked(openPortalRepository).mockReturnValue({
      repository,
      principal: { userId: 'owner-1', role: 'owner_admin' },
      sqlite: { close },
    } as unknown as ReturnType<typeof openPortalRepository>);
    const response = await withdraw();
    expect(response).toMatchObject({
      status: 401,
      data: {
        code: 'TIME_CORRECTION_WITHDRAW_SESSION_EXPIRED',
        actionName: 'withdrawCorrectionDraft',
        remedies: [{ id: 'sign_in_again' }],
        values: { reason: 'This entry needs a different correction' },
      },
    });
  });

  it('identifies an overlong reason beside the retained reason field', async () => {
    const reason = 'x'.repeat(2001);
    const response = await withdraw(reason);
    expect(response).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_CORRECTION_WITHDRAW_REASON_TOO_LONG',
        actionName: 'withdrawCorrectionDraft',
        fieldErrors: { reason: ['problem.time.correctionWithdrawReasonTooLong'] },
        remedies: [{ id: 'enter_reason' }],
        values: { reason },
      },
    });
    expect(repository.withdrawCorrectionDraft).not.toHaveBeenCalled();
  });
});
