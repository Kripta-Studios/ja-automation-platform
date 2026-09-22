import { describe, expect, it } from 'vitest';
import { parseTimeUpdateForm } from '../../apps/portal/src/lib/server/actions/time-actions';

const baseForm = {
  id: '00000000-0000-4000-8000-000000000002',
  version: '4',
  projectId: '00000000-0000-4000-8000-000000000001',
  workDate: '2026-09-22',
  category: 'regular',
  summary: 'Commissioning work completed',
};

describe('time edit action input', () => {
  it('derives minutes and preserves a complete interval for the repository update', () => {
    const parsed = parseTimeUpdateForm({
      ...baseForm,
      startTime: '08:00',
      endTime: '12:30',
      breakMinutes: '30',
      minutes: '1',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      id: baseForm.id,
      version: 4,
      startTime: '08:00',
      endTime: '12:30',
      breakMinutes: 30,
      minutes: 240,
    });
  });

  it('keeps duration-only historical edits compatible without clock values', () => {
    const parsed = parseTimeUpdateForm({ ...baseForm, minutes: '75' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      id: baseForm.id,
      version: 4,
      minutes: 75,
      startTime: undefined,
      endTime: undefined,
      breakMinutes: undefined,
    });
  });
});
