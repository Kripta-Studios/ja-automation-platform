import { beforeEach, describe, expect, it, vi } from 'vitest';

const scenario = vi.hoisted(() => ({
  message: '',
  kind: 'conflict' as 'conflict' | 'validation' | 'access',
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  const verdict = () => {
    if (!scenario.message) return;
    if (scenario.kind === 'validation') throw new original.ValidationError(scenario.message);
    if (scenario.kind === 'access') throw new original.AccessDeniedError(scenario.message);
    throw new original.ConflictError(scenario.message);
  };
  return {
    ...original,
    CrewLeaderRepository: class {
      createBatch() {
        verdict();
        return { created: [], replayed: false };
      }
      updateDraft() {
        verdict();
        return { id: 'time-1', version: 2 };
      }
      submit() {
        verdict();
        return { id: 'time-1', version: 2 };
      }
      entryDetail() {
        verdict();
        return { projectId: 'project-1', workDate: '2026-09-25' };
      }
    },
    CrewSharedExpenseAllocationRepository: class {
      create() {
        verdict();
        return { id: 'allocation-1', replayed: false };
      }
    },
  };
});

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: 'worker', userId: 'chief-1' },
    sqlite: { close: () => {} },
  }),
}));

import { actions as crewActions } from '../../apps/portal/src/routes/app/crew/+page.server';
import { actions as detailActions } from '../../apps/portal/src/routes/app/crew/time/[id]/+page.server';

function request(form: FormData): Request {
  return new Request('http://localhost/j-aautomation/app/crew', { method: 'POST', body: form });
}

beforeEach(() => {
  scenario.message = '';
  scenario.kind = 'conflict';
});

describe('crew route problem contract', () => {
  it('returns a precise stale batch problem with retained entries', async () => {
    scenario.message = 'Batch request was used with different values';
    const form = new FormData();
    form.set('requestId', 'request-1234567890');
    form.set('projectId', 'project-1');
    form.set('workDate', '2026-09-25');
    form.set('mode', 'shared');
    form.set('sharedHours', '7.5');
    form.set('summary', 'Maintenance');
    form.set('category', 'regular');
    form.set('workerIds', 'worker-1');
    const response = await crewActions.createBatch!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'CREW_BATCH_RETRY_CHANGED',
      messageKey: 'problem.crew.batchRetryChanged',
      operation: 'createBatch',
      remedies: [{ id: 'review_crew_day' }],
      values: { sharedHours: '7.5', summary: 'Maintenance' },
      workerIds: ['worker-1'],
    });
  });

  it('explains a receipt allocation mismatch beside the selected rows', async () => {
    scenario.message = 'Crew allocations must equal the receipt amount exactly';
    scenario.kind = 'validation';
    const form = new FormData();
    form.set('requestId', 'request-1234567890');
    form.set('expenseId', 'expense-1');
    form.set('timeEntryIds', 'time-1');
    form.set('timeEntryIds', 'time-2');
    form.set('amount_time-2', '4.00');
    const response = await crewActions.allocateReceipt!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'CREW_RECEIPT_TOTAL_MISMATCH',
      fieldErrors: { timeEntryIds: [expect.any(String)] },
      remedies: [{ id: 'review_receipts' }],
    });
  });

  it('blocks a stale draft edit without changing its posted version', async () => {
    scenario.message = 'This crew draft changed. Reload it before saving.';
    const form = new FormData();
    form.set('version', '1');
    form.set('workDate', '2026-09-25');
    form.set('category', 'regular');
    form.set('minutes', '450');
    form.set('summary', 'Completed work');
    const response = await detailActions.update!({
      locals: { user: { id: 'chief-1' } },
      params: { id: 'time-1' },
      request: request(form),
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'CREW_DRAFT_CHANGED',
      values: { version: '1', summary: 'Completed work' },
      remedies: [{ id: 'review_time' }],
    });
  });

  it('keeps successful action redirects out of the failure mapper', async () => {
    const form = new FormData();
    form.set('version', '1');
    await expect(
      detailActions.submit!({
        locals: { user: { id: 'chief-1' } },
        params: { id: 'time-1' },
        request: request(form),
      } as never),
    ).rejects.toMatchObject({ status: 303 });
  });
});
