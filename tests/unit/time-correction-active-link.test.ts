import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { AccessDeniedError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { load } from '../../apps/portal/src/routes/app/time/[id]/+page.server';

const originalId = '11111111-1111-4111-8111-111111111111';
const correctionId = '22222222-2222-4222-8222-222222222222';
const timeDetail = vi.fn();
const close = vi.fn();
let activeId: string | null = correctionId;
let originalStatus = 'approved';

beforeEach(() => {
  vi.resetAllMocks();
  activeId = correctionId;
  originalStatus = 'approved';
  timeDetail.mockImplementation((_principal, id: string) =>
    id === originalId
      ? {
          id,
          project_id: 'project-1',
          worker_id: 'worker-1',
          work_date: '2026-09-25',
          approval_state: originalStatus,
        }
      : { id, approval_state: 'draft' },
  );
  vi.mocked(openPortalRepository).mockReturnValue({
    repository: { timeDetail },
    principal: { userId: 'worker-1', role: 'worker', projectIds: new Set(['project-1']) },
    sqlite: {
      prepare: (sql: string) => ({
        get: () =>
          sql.includes('FROM time_entry t WHERE t.id=?')
            ? {
                version: 1,
                invoice_id: null,
                billing_status: 'unlocked',
                billing_lock_id: null,
                locked_at: null,
                active_id: activeId,
                correction_actor: null,
              }
            : undefined,
        all: () => [],
      }),
      close,
    },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

async function detail() {
  return (await load({
    locals: { user: { id: 'worker-1', role: 'worker' } },
    params: { id: originalId },
  } as never)) as {
    activeCorrection: { id: string; status: string } | null;
    record: Record<string, unknown>;
  };
}

describe('time detail existing correction link projection', () => {
  it('offers a readable active correction from an approved original', async () => {
    const result = await detail();
    expect(result.activeCorrection).toEqual({ id: correctionId, status: 'draft' });
    expect(timeDetail).toHaveBeenCalledWith(expect.anything(), correctionId);
    expect(close).toHaveBeenCalledOnce();
  });

  it('offers the same readable correction from a reviewer-returned original', async () => {
    originalStatus = 'needs_changes';
    const result = await detail();
    expect(result.activeCorrection).toEqual({ id: correctionId, status: 'draft' });
  });

  it.each([AccessDeniedError, ValidationError])(
    'conceals the linked ID when the current role cannot open it (%s)',
    async (ErrorClass) => {
      timeDetail.mockImplementation((_principal, id: string) => {
        if (id === correctionId) throw new ErrorClass('not readable');
        return {
          id,
          project_id: 'project-1',
          worker_id: 'worker-1',
          work_date: '2026-09-25',
          approval_state: 'approved',
        };
      });
      const result = await detail();
      expect(result.activeCorrection).toBeNull();
      expect(JSON.stringify(result)).not.toContain(correctionId);
    },
  );

  it('removes a returned record’s repository-projected correction ID when unreadable', async () => {
    originalStatus = 'needs_changes';
    timeDetail.mockImplementation((_principal, id: string) => {
      if (id === correctionId) throw new AccessDeniedError('not readable');
      return {
        id,
        project_id: 'project-1',
        worker_id: 'worker-1',
        work_date: '2026-09-25',
        approval_state: 'needs_changes',
        active_correction_id: correctionId,
        active_correction_state: 'draft',
      };
    });
    const result = await detail();
    expect(result.activeCorrection).toBeNull();
    expect(result.record.active_correction_id).toBeNull();
    expect(JSON.stringify(result)).not.toContain(correctionId);
  });

  it('does not offer a self-link on the active returned correction', async () => {
    activeId = originalId;
    originalStatus = 'needs_changes';
    const result = await detail();
    expect(result.activeCorrection).toBeNull();
    expect(timeDetail).toHaveBeenCalledTimes(1);
  });
});
