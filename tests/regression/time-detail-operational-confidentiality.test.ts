import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openPortalRepository } = vi.hoisted(() => ({ openPortalRepository: vi.fn() }));
vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));
vi.mock('$lib/server/actions/operations-actions', () => ({ reportActions: {} }));
vi.mock('$lib/server/actions/time-actions', () => ({ timeActions: {} }));
const { load } = await import('../../apps/portal/src/routes/app/time/[id]/+page.server');

let sqlite: DatabaseSync;
const rawSource = {
  id: 'source',
  project_id: 'assigned-project',
  worker_id: 'worker',
  project_name: 'Operational project',
  project_number: 'P-001',
  work_date: '2026-10-06',
  minutes: 360,
  category: 'regular',
  activity_summary: 'Actual inspection work',
  approval_state: 'approved',
  billability_state: 'billable',
  client_rate_minor: 12500,
  billable_minutes: 480,
  internal_cost_minor: 5000,
  compensation_amount_minor: 8000,
  billing_status: 'locked',
  invoice_id: 'private-invoice',
  billing_lock_id: 'private-billing-lock',
  finance_approved_at: '2026-10-06T10:00:00Z',
  locked_at: '2026-10-06T11:00:00Z',
  customer_charge_minor: 100000,
};
const privateKeys = [
  'billability_state',
  'client_rate_minor',
  'billable_minutes',
  'internal_cost_minor',
  'compensation_amount_minor',
  'billing_status',
  'invoice_id',
  'billing_lock_id',
  'finance_approved_at',
  'locked_at',
  'customer_charge_minor',
];

beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE deployment_identity(singleton INTEGER, tenant_id TEXT);
    INSERT INTO deployment_identity VALUES(1,'tenant');
    CREATE TABLE record_correction_link(record_type TEXT,original_id TEXT,correction_id TEXT,reason TEXT,tenant_id TEXT,actor_user_id TEXT,created_at TEXT);
    CREATE TABLE time_entry(id TEXT,version INTEGER,invoice_id TEXT,billing_status TEXT,billing_lock_id TEXT,locked_at TEXT,approval_state TEXT);
    INSERT INTO time_entry VALUES('source',3,'private-invoice','locked','private-billing-lock','2026-10-06T11:00:00Z','approved');
    CREATE TABLE operational_time_expense_request(time_entry_id TEXT,expense_id TEXT);
    CREATE TABLE expense(id TEXT,version INTEGER,approval_state TEXT);
    CREATE TABLE daily_report(id TEXT,project_id TEXT,worker_id TEXT,work_date TEXT);
    CREATE TABLE technical_report(id TEXT,project_id TEXT,author_id TEXT,report_date TEXT);
  `);
});
afterEach(() => {
  if (sqlite.isOpen) sqlite.close();
});

async function detail(role: string, profile?: string) {
  const userId = role === 'project_manager' ? 'pm' : 'worker';
  openPortalRepository.mockReturnValue({
    principal: { userId, role },
    repository: { timeDetail: vi.fn(() => ({ ...rawSource })) },
    sqlite,
  });
  return await load({
    locals: { user: { id: userId, role, status: 'active', workforceProfile: profile } },
    params: { id: 'source' },
  } as never);
}

describe('time detail operational confidentiality boundary', () => {
  it.each([
    ['Worker', 'worker', undefined],
    ['Chief delegation', 'worker', undefined],
    ['External technician', 'worker', 'external_technician'],
    ['Supplier coordinator', 'worker', 'supplier_coordinator'],
    ['Project manager', 'project_manager', undefined],
  ])('returns only operational source facts for %s', async (_context, role, profile) => {
    const data = (await detail(role!, profile)) as {
      record: Record<string, unknown>;
      canCreateCorrection: boolean;
    };
    expect(data.record).toMatchObject({
      id: 'source',
      project_id: 'assigned-project',
      worker_id: 'worker',
      work_date: '2026-10-06',
      minutes: 360,
      approval_state: 'approved',
      activity_summary: 'Actual inspection work',
    });
    for (const key of privateKeys) expect(data.record).not.toHaveProperty(key);
    expect(JSON.stringify(data)).not.toContain('private-invoice');
    expect(JSON.stringify(data)).not.toContain('private-billing-lock');
    // The hidden lock still prevents an unsupported operational correction.
    expect(data.canCreateCorrection).toBe(false);
  });

  it.each(['owner_admin', 'finance_admin', 'auditor_read_only'])(
    'preserves the existing financial source presentation for %s',
    async (role) => {
      const data = (await detail(role)) as { record: Record<string, unknown> };
      expect(data.record).toMatchObject({
        billability_state: 'billable',
        client_rate_minor: 12500,
        billable_minutes: 480,
        billing_status: 'locked',
      });
    },
  );

  it('retains the supported correction affordance for unlocked own approved work', async () => {
    sqlite.exec(
      "UPDATE time_entry SET invoice_id=NULL,billing_status='unlocked',billing_lock_id=NULL,locked_at=NULL",
    );
    const data = (await detail('worker')) as {
      record: Record<string, unknown>;
      canCreateCorrection: boolean;
    };
    expect(data.canCreateCorrection).toBe(true);
    expect(data.record.minutes).toBe(360);
    for (const key of privateKeys) expect(data.record).not.toHaveProperty(key);
  });
});
