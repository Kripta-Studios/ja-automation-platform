import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
vi.mock('$lib/server/report-attachment-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/report-attachment-route')>()),
  validateReportAttachmentFile: vi.fn(async (file: File) => new Uint8Array(await file.arrayBuffer())),
}));
vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  recordAuditEvent: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { expenseActions } from '../../apps/portal/src/lib/server/actions/expense-actions';

const projectId = '11111111-1111-4111-8111-111111111111';
const png = (label: string) =>
  new File([Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(label)])], `${label}.png`, {
    type: 'image/png',
  });

let sqlite: DatabaseSync;
const createExpense = vi.fn();
const submitExpense = vi.fn();
const reserveUpload = vi.fn();

function batchRequest(rows: Array<{ amount: string; receipt?: File }>, submitNow: boolean): Request {
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('currency', 'USD');
  form.set('requestId', 'batch-request-0000000001');
  form.set('rowCount', String(rows.length));
  if (submitNow) form.set('submitNow', 'on');
  rows.forEach((row, index) => {
    form.set(`spentOn_${index}`, '2026-11-18');
    form.set(`category_${index}`, 'meals');
    form.set(`amount_${index}`, row.amount);
    if (row.receipt) form.set(`receipt_${index}`, row.receipt);
  });
  return new Request('http://localhost/app/expenses?/createExpenseBatch', {
    method: 'POST',
    body: form,
  });
}

async function run(request: Request) {
  const action = (expenseActions as unknown as Record<string, (event: unknown) => Promise<unknown>>)
    .createExpenseBatch!;
  return (await action({ locals: {}, request, params: { section: 'expenses' } })) as {
    status?: number;
    data?: Record<string, unknown>;
    messageKey?: string;
    messageParams?: Record<string, unknown>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE document(id TEXT, sha256 TEXT, byte_length INTEGER);
    CREATE TABLE project_member(id TEXT, project_id TEXT, user_id TEXT, status TEXT, starts_on TEXT, ends_on TEXT);
    CREATE TABLE assignment_expense_policy(project_member_id TEXT, payer TEXT, category TEXT,
      effective_from TEXT, effective_to TEXT, version INTEGER);
    CREATE TABLE audit_event(actor_id TEXT, action TEXT, details_json TEXT);
  `);
  let n = 0;
  createExpense.mockImplementation(() => ({ id: `expense-${++n}`, version: 1 }));
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite,
    v3: { reserveUpload, finalizeUpload: vi.fn(), cancelUploadReservation: vi.fn() },
    repository: { createExpense, submitExpense, removeUnreferencedReceipt: vi.fn() },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('Add several expenses', () => {
  it('"Save & send" creates and submits every row in one transaction', async () => {
    const result = await run(batchRequest([{ amount: '12.50' }, { amount: '7' }], true));
    expect(createExpense).toHaveBeenCalledTimes(2);
    expect(createExpense.mock.calls.map((call) => String(call[1].amountMinor))).toEqual(['1250', '700']);
    expect(submitExpense.mock.calls).toEqual([
      [{ userId: 'worker-1', role: 'worker' }, 'expense-1', 1],
      [{ userId: 'worker-1', role: 'worker' }, 'expense-2', 1],
    ]);
    expect(JSON.stringify(result)).toContain('action.expense.weekSubmitted');
  });

  it('"Save as drafts" never submits', async () => {
    const result = await run(batchRequest([{ amount: '12.50' }], false));
    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(submitExpense).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain('action.expense.weekDraftsSavedOne');
  });

  it('names each row whose receipt is already stored or repeated, and saves nothing', async () => {
    const stored = png('stored-receipt');
    const storedBytes = new Uint8Array(await stored.arrayBuffer());
    sqlite
      .prepare('INSERT INTO document VALUES(?,?,?)')
      .run('doc-1', createHash('sha256').update(storedBytes).digest('hex'), storedBytes.byteLength);
    const fresh = png('fresh-receipt');
    const result = await run(
      batchRequest(
        [
          { amount: '10', receipt: stored },
          { amount: '11', receipt: fresh },
          { amount: '12', receipt: png('fresh-receipt') },
        ],
        true,
      ),
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'EXPENSE_RECEIPT_DUPLICATE_CONTENT',
      batchRow: 0,
      batchRows: [0, 2],
    });
    expect(reserveUpload).not.toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();
    expect(submitExpense).not.toHaveBeenCalled();
  });
});
