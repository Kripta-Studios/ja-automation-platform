import { describe, expect, it } from 'vitest';
import { canReadRecord } from '@ja/domain';
describe('record authorization', () => {
  const record = { ownerId: 'worker-a', projectId: 'project-a' };
  it('denies cross-project access', () =>
    expect(
      canReadRecord(
        { userId: 'manager', role: 'project_manager', projectIds: new Set(['project-b']) },
        record,
      ),
    ).toBe(false));
  it('denies another worker in the same project', () =>
    expect(
      canReadRecord(
        { userId: 'worker-b', role: 'worker', projectIds: new Set(['project-a']) },
        record,
      ),
    ).toBe(false));
  it('allows record owner', () =>
    expect(
      canReadRecord(
        { userId: 'worker-a', role: 'worker', projectIds: new Set(['project-a']) },
        record,
      ),
    ).toBe(true));
});
