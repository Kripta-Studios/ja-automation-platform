import { describe, expect, it } from 'vitest';
import { offlineMutationSchema } from '@ja/schemas';
describe('offline boundary', () => {
  it('requires opaque IDs and optimistic version', () =>
    expect(
      offlineMutationSchema.safeParse({
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c4966f9d31',
        entityType: 'time',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c4966f9d32',
        baseVersion: 2,
        createdAt: '2026-08-18T12:00:00.000Z',
        payload: { minutes: 60 },
        attachments: [],
      }).success,
    ).toBe(true));
  it('rejects a negative version', () =>
    expect(
      offlineMutationSchema.safeParse({
        mutationId: 'x',
        entityType: 'time',
        entityId: 'x',
        baseVersion: -1,
        createdAt: 'bad',
        payload: {},
        attachments: [],
      }).success,
    ).toBe(false));
});
