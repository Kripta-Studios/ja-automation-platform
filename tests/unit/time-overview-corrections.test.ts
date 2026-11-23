import { describe, expect, it } from 'vitest';
import { countsAsEffectiveTime, overviewEntries, overviewFilters } from '$lib/server/time-overview';

const row = (id: string, extra: Record<string, unknown>) => ({
  id,
  worker_id: 'w1',
  worker_name: 'Lucas Example',
  project_id: 'p1',
  project_number: 'P-1',
  project_name: 'BBS',
  work_date: '2026-11-11',
  category: 'regular',
  minutes: 330,
  ...extra,
});

describe('time overview with corrections (T09)', () => {
  it('keeps an approved original until its correction is approved, then counts the correction once', () => {
    const original = row('o', { approval_state: 'approved', active_correction_id: 'c', active_correction_state: 'draft' });
    const draft = row('c', { approval_state: 'draft', minutes: 300, correction_linked: 1, corrects_approved: 1 });
    expect(countsAsEffectiveTime(original)).toBe(true);
    expect(countsAsEffectiveTime(draft)).toBe(false);
    const approvedOnly = overviewEntries([original, draft], overviewFilters(new URLSearchParams('status=approved')));
    expect(approvedOnly.entries.map((entry) => entry.id)).toEqual(['o']);
    const all = overviewEntries([original, draft], overviewFilters(new URLSearchParams()));
    expect(all.entries.map((entry) => entry.id)).toEqual(['o']);

    const originalAfter = { ...original, active_correction_state: 'approved' };
    const approvedCorrection = { ...draft, approval_state: 'approved' };
    expect(
      overviewEntries([originalAfter, approvedCorrection], overviewFilters(new URLSearchParams()))
        .entries.map((entry) => [entry.id, entry.minutes]),
    ).toEqual([['c', 300]]);
  });

  it('replaces a sent-back original by its correction right away', () => {
    const returned = row('o', { approval_state: 'needs_changes', active_correction_id: 'c', active_correction_state: 'submitted' });
    const correction = row('c', { approval_state: 'submitted', correction_linked: 1, corrects_approved: 0 });
    expect(
      overviewEntries([returned, correction], overviewFilters(new URLSearchParams())).entries.map((entry) => entry.id),
    ).toEqual(['c']);
  });
});
