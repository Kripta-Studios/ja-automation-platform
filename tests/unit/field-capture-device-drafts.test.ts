import { describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb', () => ({
  openDB: async () => ({
    put: async (_name: string, value: unknown, key: string) => void store.set(key, value),
    get: async (_name: string, key: string) => store.get(key),
    getAll: async () => [...store.values()],
    delete: async (_name: string, key: string) => void store.delete(key),
    close: () => undefined,
  }),
}));
import {
  clearLocalCaptureDraft,
  listLocalCaptureDrafts,
  saveLocalCaptureDraft,
} from '../../apps/portal/src/lib/portal/field-capture/local-draft.js';

describe('field capture drafts saved on this device (T24)', () => {
  it('lists only this person’s drafts, newest first, so a reload can reopen them', async () => {
    await saveLocalCaptureDraft({
      userId: 'tech',
      projectId: 'bbs',
      workDate: '2026-11-21',
      values: { workSummary: 'RW- captura' },
      savedAt: '2026-11-21T18:00:00.000Z',
    });
    await saveLocalCaptureDraft({
      userId: 'tech',
      projectId: 'bbs',
      workDate: '2026-11-20',
      values: { workSummary: 'older' },
      savedAt: '2026-11-20T18:00:00.000Z',
    });
    await saveLocalCaptureDraft({
      userId: 'someone-else',
      projectId: 'bbs',
      workDate: '2026-11-21',
      values: { workSummary: 'not mine' },
      savedAt: '2026-11-22T18:00:00.000Z',
    });
    const drafts = await listLocalCaptureDrafts('tech');
    expect(drafts.map((draft) => draft.workDate)).toEqual(['2026-11-21', '2026-11-20']);
    expect(drafts[0]!.values.workSummary).toBe('RW- captura');
    await clearLocalCaptureDraft('tech', 'bbs', '2026-11-21');
    expect((await listLocalCaptureDrafts('tech')).map((draft) => draft.workDate)).toEqual([
      '2026-11-20',
    ]);
  });
});
