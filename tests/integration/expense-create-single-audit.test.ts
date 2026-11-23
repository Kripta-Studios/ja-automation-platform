import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import type { PortalActionEvent } from '../../apps/portal/src/lib/server/action-utils.js';

const context = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../apps/portal/src/lib/server/portal-repository.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openPortalRepository: () => context.current,
}));
import { expenseActions } from '../../apps/portal/src/lib/server/actions/expense-actions.js';

let value: B5LifecycleSecurityFixture | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  if (value) closeB5LifecycleSecurityFixture(value);
  value = undefined;
});
function setup(): B5LifecycleSecurityFixture {
  value = createB5LifecycleSecurityFixture();
  vi.spyOn(value.sqlite, 'close').mockImplementation(() => undefined);
  // The owner records for the worker: worker-scope checks depend on the host clock /
  // timezone data (see worker-operational-project-scope pre-existing failures).
  context.current = {
    ...value,
    principal: stepUpB5Principal(value.sqlite, value.owner, 'expense-audit-once-owner'),
  };
  return value;
}
function event(fixture: B5LifecycleSecurityFixture, fields: Record<string, string>) {
  const form = new FormData();
  form.set('projectId', fixture.project.id);
  for (const [key, data] of Object.entries({
    spentOn: new Date().toISOString().slice(0, 10),
    vendor: 'Audit once vendor',
    category: 'meals',
    description: 'Dinner after shift',
    currency: 'EUR',
    amount: '12.34',
    whoPaid: 'worker',
    ...fields,
  }))
    form.set(key, data);
  return {
    locals: {},
    params: { section: 'expenses' },
    request: new Request('http://localhost/app/expenses', { method: 'POST', body: form }),
  } as PortalActionEvent;
}
const creates = (fixture: B5LifecycleSecurityFixture) =>
  fixture.sqlite
    .prepare("SELECT entity_id,details_json FROM audit_event WHERE action='expense.create'")
    .all() as Array<{ entity_id: string; details_json: string }>;

describe('expense create audit (T17 double emit)', () => {
  it('records exactly one expense.create per expense on Save & send, and a replay adds none', async () => {
    const fixture = setup();
    const fields = {
      requestId: 'audit-once-request-0000001',
      submitNow: 'on',
      workerId: fixture.worker.userId,
    };
    expect(await expenseActions.createExpense(event(fixture, fields))).toMatchObject({
      success: true,
    });
    const expenses = fixture.sqlite
      .prepare('SELECT id,approval_state FROM expense')
      .all() as Array<{
      id: string;
      approval_state: string;
    }>;
    expect(expenses).toHaveLength(1);
    expect(expenses[0]!.approval_state).toBe('submitted');
    const events = creates(fixture);
    expect(events).toHaveLength(1);
    expect(events[0]!.entity_id).toBe(expenses[0]!.id);
    expect(JSON.parse(events[0]!.details_json)).toMatchObject({
      expenseRequestId: 'audit-once-request-0000001',
      amountMinor: '1234',
    });

    // Same request again: replayed, no new expense, no new audit event.
    expect(await expenseActions.createExpense(event(fixture, fields))).toMatchObject({
      success: true,
    });
    expect(fixture.sqlite.prepare('SELECT count(*) n FROM expense').get()).toEqual({ n: 1 });
    expect(creates(fixture)).toHaveLength(1);
  });
});
