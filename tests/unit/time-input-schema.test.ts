import { describe, expect, it } from 'vitest';
import { timeInputSchema } from '@ja/schemas';

const baseInput = {
  projectId: '00000000-0000-4000-8000-000000000001',
  workDate: '2026-09-22',
  category: 'regular',
  summary: 'Commissioning work completed',
};

describe('time input schema', () => {
  it('derives canonical minutes from a complete interval and defaults the break to zero', () => {
    const parsed = timeInputSchema.parse({
      ...baseInput,
      startTime: '08:15',
      endTime: '12:00',
      minutes: '999',
      breakMinutes: '',
    });

    expect(parsed).toMatchObject({
      startTime: '08:15',
      endTime: '12:00',
      breakMinutes: 0,
      minutes: 225,
    });
  });

  it('preserves the duration-only legacy contract without inventing clock times', () => {
    expect(timeInputSchema.parse({ ...baseInput, minutes: '75' })).toMatchObject({
      ...baseInput,
      minutes: 75,
      startTime: undefined,
      endTime: undefined,
      breakMinutes: undefined,
    });
  });

  it.each([
    [{ startTime: '08:00', minutes: 60 }, 'endTime'],
    [{ startTime: '8:00', endTime: '09:00' }, 'startTime'],
    [{ startTime: '09:00', endTime: '09:00' }, 'endTime'],
    [{ startTime: '10:00', endTime: '09:00' }, 'endTime'],
    [{ startTime: '08:00', endTime: '09:00', breakMinutes: 60 }, 'breakMinutes'],
    [{ startTime: '', endTime: '', minutes: '' }, 'minutes'],
  ])('rejects an invalid or incomplete interval %#', (values, errorField) => {
    const parsed = timeInputSchema.safeParse({ ...baseInput, ...values });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.flatten().fieldErrors[errorField]).toBeDefined();
  });
});
