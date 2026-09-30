import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';

vi.mock('$lib/server/supplier-context', async (original) => ({
  ...(await original<typeof import('$lib/server/supplier-context')>()),
  openSupplierContext: vi.fn(),
}));
import { openSupplierContext } from '$lib/server/supplier-context';
import { actions } from '../../apps/portal/src/routes/app/supplier/+page.server';

const correct = vi.fn();
const update = vi.fn();
const createBatch = vi.fn();
const close = vi.fn();
const fields = {
  id: 'returned-time',
  requestId: 'visible-request',
  reason: 'Correct actual work',
  workDate: '2026-10-10',
  category: 'work',
  summary: 'Updated operational activity',
  durationMode: 'duration',
  durationHours: '0.25',
};
async function submit(
  changes: Record<string, string> = {},
  operation: 'correctTime' | 'updateTime' | 'createTimeBatch' = 'correctTime',
) {
  return actions[operation]!({
    locals: { correlationId: 'supplier-correction-unit' },
    request: new Request('http://local.test/app/supplier?/correctTime', {
      method: 'POST',
      body: new URLSearchParams({ ...fields, ...changes }),
    }),
  } as never);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(openSupplierContext).mockReturnValue({
    principal: { userId: 'coordinator', role: 'worker' },
    supplier: { createTimeCorrection: correct, updateTime: update, createTimeBatch: createBatch },
    sqlite: { close, prepare: () => ({ get: () => ({ name: 'Authorized project' }) }) },
  } as unknown as ReturnType<typeof openSupplierContext>);
});

describe('Supplier draft edit visible duration authority', () => {
  it.each([
    ['0.5', '999', 30],
    ['0,25', '15', 15],
    ['0.0167', '', 1],
  ])('uses visible %s hours over minute override %s', async (durationHours, minutes, expected) => {
    expect(await submit({ version: '1', durationHours, minutes }, 'updateTime')).toMatchObject({
      success: true,
    });
    expect(update).toHaveBeenCalledWith(expect.anything(), {
      id: fields.id,
      version: 1,
      workDate: fields.workDate,
      category: fields.category,
      summary: fields.summary,
      minutes: expected,
      startTime: null,
      endTime: null,
      breakMinutes: null,
    });
  });
  it.each(['0', '999'])(
    'derives a normal interval from visible break hours despite breakMinutes=%s',
    async (breakMinutes) => {
      expect(
        await submit(
          {
            version: '1',
            durationMode: 'interval',
            startTime: '08:00',
            endTime: '09:00',
            breakHours: '0.25',
            breakMinutes,
            minutes: '999',
          },
          'updateTime',
        ),
      ).toMatchObject({ success: true });
      expect(update.mock.calls[0][1]).toMatchObject({
        minutes: 45,
        startTime: '08:00',
        endTime: '09:00',
        breakMinutes: 15,
      });
    },
  );
  it.each(['garbage', '-1', '25', '2'])(
    'retains invalid visible break %s and fails before the update method',
    async (breakHours) => {
      expect(
        await submit(
          {
            version: '1',
            durationMode: 'interval',
            startTime: '08:00',
            endTime: '09:00',
            breakHours,
            breakMinutes: '0',
          },
          'updateTime',
        ),
      ).toMatchObject({
        status: 400,
        data: {
          operation: 'updateTime',
          values: { breakHours, breakMinutes: '0', startTime: '08:00', endTime: '09:00' },
          fieldErrors: { breakHours: ['problem.supplier.intervalInvalid'] },
        },
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
  it.each(['', 'garbage', '-1', '25'])(
    'rejects invalid visible duration %s even with a valid minute override',
    async (durationHours) => {
      expect(
        await submit({ version: '1', durationHours, minutes: '30' }, 'updateTime'),
      ).toMatchObject({
        status: 400,
        data: {
          operation: 'updateTime',
          values: { durationHours, minutes: '30' },
          fieldErrors: { durationHours: expect.any(Array) },
        },
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
});

describe('normal Supplier team creation form compatibility', () => {
  it.each([
    [{ durationMode: 'duration', durationHours: '0.25', minutes: '15' }, 15],
    [
      {
        durationMode: 'interval',
        startTime: '08:00',
        endTime: '09:00',
        breakHours: '0.25',
        breakMinutes: '15',
        minutes: '45',
      },
      45,
    ],
  ] as const)('preserves the existing visible form %j', async (duration, expected) => {
    createBatch.mockReturnValue({ created: [{ id: 'draft', version: 1 }], replayed: false });
    expect(
      await submit(
        { workerIds: 'technician', projectId: 'project', batchMode: 'shared', ...duration },
        'createTimeBatch',
      ),
    ).toMatchObject({ success: true, outcome: { createdCount: 1, totalMinutes: expected } });
    expect(createBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workerIds: ['technician'],
        minutes: expected,
        projectId: 'project',
      }),
    );
  });
});
describe('Supplier inline correction operational patch', () => {
  it.each([
    ['0.25', 15],
    ['0,5', 30],
    ['0.0167', 1],
    ['24', 1440],
  ])(
    'converts visible %s hours through the validated helper (%i minutes)',
    async (hours, minutes) => {
      expect(
        await submit({
          durationHours: hours,
          minutes: '999',
          workerId: 'guessed',
          rateMinor: '999',
        }),
      ).toMatchObject({ success: true });
      expect(correct).toHaveBeenCalledOnce();
      expect(correct.mock.calls[0][1]).toEqual({
        originalId: fields.id,
        requestId: fields.requestId,
        reason: fields.reason,
        patch: {
          workDate: fields.workDate,
          category: fields.category,
          summary: fields.summary,
          minutes,
          startTime: null,
          endTime: null,
          breakMinutes: null,
        },
      });
      expect(close).toHaveBeenCalledOnce();
    },
  );
  it.each(['', '-1', '25', 'garbage', '0'])(
    'retains invalid hours %s without calling the write method',
    async (durationHours) => {
      const result = await submit({ durationHours });
      expect(result).toMatchObject({
        status: 400,
        data: {
          values: { ...fields, durationHours },
          fieldErrors: { durationHours: expect.any(Array) },
        },
      });
      expect(correct).not.toHaveBeenCalled();
    },
  );
  it('retains truthful interval input and ignores hidden minute overrides', async () => {
    await submit({
      durationMode: 'interval',
      startTime: '08:00',
      endTime: '09:00',
      breakHours: '0.25',
      breakMinutes: '999',
      minutes: '999',
    });
    expect(correct.mock.calls[0][1].patch).toMatchObject({
      minutes: 45,
      startTime: '08:00',
      endTime: '09:00',
      breakMinutes: 15,
    });
  });
  it('keeps an invalid interval break on its visible hours field', async () => {
    expect(
      await submit({
        durationMode: 'interval',
        startTime: '08:00',
        endTime: '09:00',
        breakHours: '2',
      }),
    ).toMatchObject({
      status: 400,
      data: {
        values: { breakHours: '2' },
        fieldErrors: { breakHours: ['problem.supplier.intervalInvalid'] },
      },
    });
    expect(correct).not.toHaveBeenCalled();
  });
  it('retains no-op values with a field-local correction remedy', async () => {
    correct.mockImplementation(() => {
      throw new ValidationError(
        'Change at least one operational field before creating a correction',
      );
    });
    expect(await submit()).toMatchObject({
      status: 400,
      data: {
        code: 'SUPPLIER_TIME_CORRECTION_EMPTY',
        values: fields,
        fieldErrors: { summary: ['problem.supplier.timeCorrectionEmpty'] },
        remedies: [{ id: 'correct_supplier_field' }],
      },
    });
  });
  it('explains actor ownership without exposing another record', async () => {
    correct.mockImplementation(() => {
      throw new AccessDeniedError('Supplier correction draft ownership required');
    });
    expect(await submit()).toMatchObject({
      status: 403,
      data: {
        code: 'SUPPLIER_TIME_CORRECTION_OWNERSHIP',
        values: fields,
        remedies: [{ id: 'contact_owner' }],
      },
    });
  });
});
