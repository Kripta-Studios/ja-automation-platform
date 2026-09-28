import { describe, expect, it } from 'vitest';
import {
  focusRecordBrowser,
  restoreRecordBrowserState,
  type RecordBrowserState,
} from '../../apps/portal/src/lib/portal/ui/record-browser';

const defaults: RecordBrowserState = { search: '', status: '', order: 'priority', page: 0 };
const rows = Array.from({ length: 12 }, (_, index) => ({
  id: String(index),
  name: `Project ${index}`,
  status: index === 11 ? 'published' : 'draft',
  starts_at: `2026-09-${String(index + 1).padStart(2, '0')}T08:00:00Z`,
}));

describe('record browser context and focus state', () => {
  it('restores each context independently and uses defaults for a new context', () => {
    const first = { search: 'Planning', status: 'published', order: 'newest', page: 2 };
    const second = { search: 'Availability', status: 'unavailable', order: 'oldest', page: 1 };
    expect(restoreRecordBrowserState(first, defaults, true)).toEqual(first);
    expect(restoreRecordBrowserState(second, defaults, true)).toEqual(second);
    expect(restoreRecordBrowserState(null, defaults, true)).toEqual(defaults);
    expect(restoreRecordBrowserState(first, defaults, true)).toEqual(first);
  });

  it('rejects invalid saved pagination/sort preferences and ignores retired local filters', () => {
    for (const page of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '8', null]) {
      expect(restoreRecordBrowserState({ page, order: 'unknown' }, defaults, true)).toEqual(
        defaults,
      );
    }
    expect(
      restoreRecordBrowserState(
        { search: 'hidden', status: 'retired', order: 'name', page: 3 },
        defaults,
        false,
      ),
    ).toEqual({ ...defaults, order: 'name', page: 3 });
  });

  it('reveals an explicitly requested authorized row past the first page and preserves sort', () => {
    const original = { search: 'Missing name', status: 'draft', order: 'oldest', page: 0 };
    expect(focusRecordBrowser(rows, original, '11', 8, true, false)).toEqual({
      search: '',
      status: '',
      order: 'oldest',
      page: 1,
    });
    expect(original.search).toBe('Missing name');
  });

  it('keeps local criteria that match the focused row', () => {
    expect(
      focusRecordBrowser(
        rows,
        { search: 'Project', status: 'published', order: 'newest', page: 4 },
        '11',
        8,
        true,
        false,
      ),
    ).toEqual({ search: 'Project', status: 'published', order: 'newest', page: 0 });
    expect(
      focusRecordBrowser(
        rows,
        { search: 'Project', status: 'draft', order: 'oldest', page: 0 },
        '11',
        8,
        true,
        false,
      ),
    ).toEqual({ search: 'Project', status: '', order: 'oldest', page: 1 });
  });

  it('never clears filters for a missing or unauthorized target', () => {
    const original = { search: 'Planning', status: 'draft', order: 'oldest', page: 1 };
    expect(focusRecordBrowser(rows, original, 'not-projected', 8, true, false)).toBeNull();
    expect(focusRecordBrowser(rows, original, '', 8, true, false)).toBeNull();
    expect(original).toEqual({ search: 'Planning', status: 'draft', order: 'oldest', page: 1 });
  });

  it('uses the parent ordering/projection unchanged for controlled registers', () => {
    const original = { search: 'Not a local filter', status: 'draft', order: 'newest', page: 0 };
    expect(focusRecordBrowser(rows, original, '11', 8, true, true)).toEqual({
      ...original,
      page: 1,
    });
    expect(focusRecordBrowser(rows.slice(0, 4), original, '11', 8, true, true)).toBeNull();
  });
});
