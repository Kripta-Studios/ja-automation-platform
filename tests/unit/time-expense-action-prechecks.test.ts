import { beforeEach, describe, expect, it, vi } from 'vitest';

const close = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { timeActions } from '../../apps/portal/src/lib/server/actions/time-actions';
import { expenseActions } from '../../apps/portal/src/lib/server/actions/expense-actions';

const projectId = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';

function request(values: Record<string, string | File>): Request {
  const form = new FormData();
  for (const [field, value] of Object.entries(values)) form.set(field, value);
  return new Request('http://localhost/app/action', { method: 'POST', body: form });
}

async function timeAction(name: keyof typeof timeActions, values: Record<string, string | File>) {
  return timeActions[name]({ request: request(values), params: { section: 'time' } } as never);
}

async function expenseAction(
  name: keyof typeof expenseActions,
  values: Record<string, string | File>,
) {
  return expenseActions[name]({
    request: request(values),
    params: { section: 'expenses' },
  } as never);
}

const validTime = {
  projectId,
  workDate: '2026-09-25',
  category: 'regular',
  minutes: '480',
  summary: 'Repair completed',
};
const validExpense = {
  projectId,
  spentOn: '2026-09-25',
  category: 'parking',
  description: 'Parking at customer site',
  currency: 'EUR',
  amount: '12.50',
  whoPaid: 'worker',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('time action prechecks', () => {
  it('identifies a malformed batch without retaining arbitrary JSON keys', async () => {
    const malformed = await timeAction('createTimeBatch', { entries: '{private-data' });
    expect(malformed).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_BATCH_ENTRIES_INVALID',
        fieldErrors: { entries: ['problem.time.batchEntriesInvalid'] },
        remedies: [{ id: 'review_week' }],
      },
    });
    const invalidEntry = await timeAction('createTimeBatch', {
      entries: JSON.stringify([{ ...validTime, workDate: 'bad', privateNote: 'secret' }]),
    });
    expect(invalidEntry).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_BATCH_ENTRY_INVALID',
        fieldErrors: { entries: ['problem.time.batchEntryInvalid'] },
      },
    });
    expect(JSON.stringify(invalidEntry.data)).not.toContain('secret');
  });

  it('returns a role-safe owner remedy for a valid batch submitted by a worker', async () => {
    const result = await timeAction('createTimeBatch', {
      workerId: 'worker-2',
      entries: JSON.stringify([validTime]),
    });
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'TIME_BATCH_OWNER_REQUIRED',
        remedies: [{ id: 'contact_project_owner' }],
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('separates a missing interval from malformed clock input', async () => {
    const missing = await timeAction('createTime', { ...validTime, startTime: '09:00' });
    expect(missing).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_INTERVAL_INCOMPLETE',
        fieldErrors: { endTime: ['problem.time.intervalIncomplete'] },
      },
    });
    const malformed = await timeAction('createTime', {
      ...validTime,
      startTime: 'bad',
      endTime: '17:00',
    });
    expect(malformed).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_CLOCK_INVALID',
        fieldErrors: { startTime: ['problem.time.clockInvalid'] },
      },
    });
  });

  it('keeps linked meal entries and identifies the blocked category and request', async () => {
    const category = await timeAction('createTime', {
      ...validTime,
      withExpense: 'on',
      expenseCategory: 'fuel',
      expenseAmount: '4.50',
    });
    expect(category).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_LINKED_EXPENSE_MEALS_ONLY',
        values: { expenseCategory: 'fuel', expenseAmount: '4.50' },
        fieldErrors: { expenseCategory: ['problem.time.linkedExpenseMealsOnly'] },
        remedies: [{ id: 'review_time' }],
      },
    });
    const requestId = await timeAction('createTime', {
      ...validTime,
      withExpense: 'on',
      expenseCategory: 'meals',
      requestId: 'short',
    });
    expect(requestId).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_LINKED_MEAL_REQUEST_INVALID',
        fieldErrors: { requestId: ['problem.time.linkedMealRequestInvalid'] },
      },
    });
    const meal = await timeAction('createTime', {
      ...validTime,
      withExpense: 'on',
      expenseCategory: 'meals',
      expenseAmount: 'not-a-number',
      expenseCurrency: 'EUR',
      expenseWhoPaid: 'worker',
      expenseDescription: 'Customer lunch',
      requestId: 'meal-request-2026-09-25',
    });
    expect(meal).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_LINKED_MEAL_FIELDS_INVALID',
        values: { expenseAmount: 'not-a-number' },
        fieldErrors: { expenseAmount: ['problem.time.linkedMealFieldsInvalid'] },
      },
    });
  });

  it('rejects ambiguous week dates and invalid selected rows', async () => {
    const copy = await timeAction('copyTimeLayout', {
      sourceWeekStart: 'not-a-date',
      targetWeekStart: '2026-09-28',
    });
    expect(copy).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_COPY_WEEK_INVALID',
        fieldErrors: { sourceWeekStart: ['problem.time.copyWeekInvalid'] },
      },
    });
    const week = await timeAction('submitTimeWeek', {
      workerId: 'worker-1',
      weekStart: '2026-09-25',
      entries: '[]',
    });
    expect(week).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_WEEK_START_INVALID',
        fieldErrors: { weekStart: ['problem.time.weekStartInvalid'] },
      },
    });
    const rows = await timeAction('submitTimeWeek', {
      workerId: 'worker-1',
      weekStart: '2026-09-21',
      entries: '[{"id":"bad","version":0}]',
    });
    expect(rows).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_WEEK_SELECTION_INVALID',
        fieldErrors: { entries: ['problem.time.weekSelectionInvalid'] },
      },
    });
  });

  it('maps a missing record version to the record and review remedy', async () => {
    const result = await timeAction('submitTime', { id: recordId, version: '0' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_RECORD_INVALID',
        fieldErrors: { version: ['problem.time.recordInvalid'] },
        remedies: [{ id: 'review_time' }],
      },
    });
    const deleted = await timeAction('deleteTime', { id: recordId, version: '0' });
    expect(deleted).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_RECORD_INVALID',
        remedies: [{ id: 'review_time' }],
      },
    });
  });
});

describe('expense action prechecks', () => {
  it('keeps payer guidance separate from customer billing treatment', async () => {
    const result = await expenseAction('createExpense', { ...validExpense, whoPaid: 'unknown' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_PAYER_INVALID',
        messageKey: 'problem.expense.payerInvalid',
        values: { whoPaid: 'unknown', amount: '12.50' },
        fieldErrors: { whoPaid: ['problem.expense.payerInvalid'] },
        remedies: [{ id: 'review_expense' }],
      },
    });
    expect(JSON.stringify(result.data)).toContain(
      'Customer billing treatment is reviewed separately',
    );
  });

  it('keeps amount and record errors beside their visible controls', async () => {
    const amount = await expenseAction('updateExpense', {
      id: recordId,
      version: '1',
      amount: '-4',
    });
    expect(amount).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_AMOUNT_INVALID',
        values: { amount: '-4' },
        fieldErrors: { amount: ['problem.expense.amountInvalid'] },
      },
    });
    const record = await expenseAction('submitExpense', { id: recordId, version: '0' });
    expect(record).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_RECORD_INVALID',
        fieldErrors: { version: ['problem.expense.recordInvalid'] },
      },
    });
    const deleted = await expenseAction('deleteExpense', { id: recordId, version: '0' });
    expect(deleted).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_RECORD_INVALID',
        remedies: [{ id: 'review_expense' }],
      },
    });
  });

  it('asks for a safe receipt reattachment without returning file bytes', async () => {
    const receipt = new File(['private receipt'], 'receipt.txt', { type: 'text/plain' });
    const result = await expenseAction('createExpense', { ...validExpense, receipt });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_RECEIPT_TYPE_OR_SIZE',
        fieldErrors: { receipt: ['problem.expense.receiptTypeOrSize'] },
        values: { receiptNeedsReattach: true },
        remedies: [{ id: 'attach_receipt' }],
      },
    });
    expect(JSON.stringify(result.data)).not.toContain('private receipt');
    expect(close).toHaveBeenCalledOnce();
  });

  it('distinguishes receipt content from type and size failures', async () => {
    const receipt = new File(['not a PDF'], 'receipt.pdf', { type: 'application/pdf' });
    const result = await expenseAction('createExpense', { ...validExpense, receipt });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_RECEIPT_CONTENT_INVALID',
        fieldErrors: { receipt: ['problem.expense.receiptContentInvalid'] },
        values: { receiptNeedsReattach: true },
        remedies: [{ id: 'attach_receipt' }],
      },
    });
  });
});
