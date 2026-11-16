import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import type { Principal } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  approvalActions,
  parseApprovalBatchItems,
} from '../../apps/portal/src/lib/server/actions/approval-actions';
import {
  stepUpB5Principal,
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

let fixture: B5LifecycleSecurityFixture;
beforeEach(() => {
  vi.resetAllMocks();
  fixture = createB5LifecycleSecurityFixture();
});
afterEach(() => closeB5LifecycleSecurityFixture(fixture));

function useReviewer(principal: Principal) {
  vi.mocked(openPortalRepository).mockReturnValue({
    repository: fixture.repository,
    principal,
    // The fixture owns the connection; the action's close() must not end the test DB.
    sqlite: new Proxy(fixture.sqlite, {
      get(target, key) {
        if (key === 'close') return () => undefined;
        const member = Reflect.get(target, key) as unknown;
        return typeof member === 'function' ? member.bind(target) : member;
      },
    }),
  } as unknown as ReturnType<typeof openPortalRepository>);
}

function submittedTime(date: string) {
  const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, `batch-${date}`);
  const row = fixture.repository.createTimeEntry(worker, {
    projectId: fixture.project.id,
    workDate: date,
    category: 'regular',
    minutes: 480,
    summary: `Work ${date}`,
  });
  fixture.repository.submitTime(worker, row.id, row.version);
  return fixture.sqlite.prepare('SELECT id,version FROM time_entry WHERE id=?').get(row.id) as {
    id: string;
    version: number;
  };
}

function state(id: string) {
  return fixture.sqlite
    .prepare('SELECT approval_state,finance_approved_at FROM time_entry WHERE id=?')
    .get(id) as { approval_state: string; finance_approved_at: string | null };
}

async function approveBatch(items: string[]) {
  const body = new FormData();
  for (const item of items) body.append('item', item);
  return approvalActions.approveBatch({
    params: { section: 'approvals' },
    locals: { user: { id: 'reviewer' } },
    request: new Request('http://local.test/approvals', { method: 'POST', body }),
  } as never);
}

describe('approveBatch (approve a worker week in one transaction)', () => {
  it('approves every pinned item with one approval event and audit row each', async () => {
    const monday = submittedTime('2026-08-17');
    const tuesday = submittedTime('2026-08-18');
    useReviewer(fixture.manager);
    const result = await approveBatch([
      `time:${monday.id}:${monday.version}`,
      `time:${tuesday.id}:${tuesday.version}`,
    ]);
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.approval.batchTimeApproved',
      messageParams: { count: 2, hours: 16 },
    });
    expect(state(monday.id).approval_state).toBe('approved');
    expect(state(tuesday.id).approval_state).toBe('approved');
    for (const id of [monday.id, tuesday.id]) {
      expect(
        fixture.sqlite
          .prepare(
            "SELECT COUNT(*) n FROM approval_event WHERE entity_type='time' AND entity_id=? AND to_state='approved'",
          )
          .get(id),
      ).toEqual({ n: 1 });
      expect(
        fixture.sqlite
          .prepare(
            "SELECT COUNT(*) n FROM audit_event WHERE action='time.approved' AND entity_id=?",
          )
          .get(id),
      ).toEqual({ n: 1 });
    }
  });

  it('rolls the whole batch back when any item changed since the reviewer saw it', async () => {
    const monday = submittedTime('2026-08-17');
    const tuesday = submittedTime('2026-08-18');
    useReviewer(fixture.manager);
    const result = await approveBatch([
      `time:${monday.id}:${monday.version}`,
      `time:${tuesday.id}:${tuesday.version - 1}`,
    ]);
    expect(result).toMatchObject({
      status: 409,
      data: { code: 'APPROVAL_RECORD_CHANGED', values: { id: tuesday.id, type: 'time' } },
    });
    expect(state(monday.id).approval_state).toBe('submitted');
    expect(state(tuesday.id).approval_state).toBe('submitted');
  });

  it('keeps RBAC: a worker cannot approve and nothing changes', async () => {
    const monday = submittedTime('2026-08-17');
    useReviewer(stepUpB5Principal(fixture.sqlite, fixture.worker, 'batch-worker'));
    const result = await approveBatch([`time:${monday.id}:${monday.version}`]);
    expect(result).toMatchObject({ status: 403 });
    expect(state(monday.id).approval_state).toBe('submitted');
  });

  it('refuses a reviewer deciding their own record', async () => {
    const monday = submittedTime('2026-08-17');
    fixture.sqlite
      .prepare('UPDATE time_entry SET worker_id=? WHERE id=?')
      .run(fixture.manager.userId, monday.id);
    useReviewer(fixture.manager);
    const result = await approveBatch([`time:${monday.id}:${monday.version}`]);
    expect(result).toMatchObject({ status: 403, data: { code: 'APPROVAL_OWN_RECORD' } });
    expect(state(monday.id).approval_state).toBe('submitted');
  });

  it('includes financial acceptance when the Owner approves', async () => {
    const monday = submittedTime('2026-08-17');
    useReviewer(stepUpB5Principal(fixture.sqlite, fixture.owner, 'batch-owner'));
    const result = await approveBatch([`time:${monday.id}:${monday.version}`]);
    expect(result).toMatchObject({ success: true });
    expect(state(monday.id).approval_state).toBe('approved');
    expect(state(monday.id).finance_approved_at).not.toBeNull();
  });

  it('rejects malformed, duplicated or empty item lists before opening the database', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseApprovalBatchItems([])).toBeUndefined();
    expect(parseApprovalBatchItems([`time:${id}:1`, `time:${id}:2`])).toBeUndefined();
    expect(parseApprovalBatchItems([`daily:${id}:1`])).toBeUndefined();
    expect(parseApprovalBatchItems([`expense:${id}:3`])).toEqual([
      { type: 'expense', id, version: 3 },
    ]);
    const result = await approveBatch([`time:${id}`]);
    expect(result).toMatchObject({ status: 400 });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
