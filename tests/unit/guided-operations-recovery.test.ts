import { describe, expect, it } from 'vitest';
import { ValidationError } from '@ja/database';
import { _crewPageActionFailure as crewPageActionFailure } from '../../apps/portal/src/routes/app/crew/+page.server';
import { actionFail } from '../../apps/portal/src/lib/server/actions/action-message';
import { weeklyRecoveryFields } from '../../apps/portal/src/lib/portal/sections/operational-recovery-fields';
import { withOperationalActionNames } from '../../apps/portal/src/lib/server/actions/operational-action-context';
import { timeActions } from '../../apps/portal/src/lib/server/actions/time-actions';
import { expenseActions } from '../../apps/portal/src/lib/server/actions/expense-actions';
import type { PortalActionEvent } from '../../apps/portal/src/lib/server/action-utils';

const projectId = '00000000-0000-4000-8000-000000000001';
const dates = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];
function event(section: string, values: Record<string, string>): PortalActionEvent {
  return {
    locals: {},
    params: { section },
    request: new Request(`http://localhost/app/${section}`, {
      method: 'POST',
      body: new URLSearchParams(values),
    }),
  } as PortalActionEvent;
}

describe('guided operational recovery', () => {
  it('keeps framework failure identity and the explicit source action', async () => {
    const failure = actionFail(400, 'problem.time.summaryInvalid', {}, undefined, {
      fieldErrors: { summary: ['Required'] },
    });
    const actions = withOperationalActionNames({
      saveDraft: async (_event: PortalActionEvent) => failure,
    });
    const result = await actions.saveDraft(event('time', {}));
    expect(result).toBe(failure);
    expect(result.constructor.name).toBe('ActionFailure');
    expect(result.data).toMatchObject({ actionName: 'saveDraft' });
  });

  it('maps a skipped Monday row to the actual Tuesday fields while retaining shared choices', () => {
    expect(
      weeklyRecoveryFields(
        {
          amountMinor: ['Amount invalid'],
          description: ['Required'],
          projectId: ['Project invalid'],
        },
        dates[1]!,
        dates,
        'expense',
      ),
    ).toEqual({
      amount_1: ['Amount invalid'],
      description_1: ['Required'],
      projectId: ['Project invalid'],
    });
  });

  it('returns all invalid time rows as editable day controls before opening a repository', async () => {
    const result = await timeActions.createTimeBatch(
      event('time', {
        batchForm: 'week_table',
        weekStart: dates[0]!,
        projectId,
        entries: JSON.stringify([
          { projectId, workDate: dates[1], category: 'regular', minutes: 60, summary: 'x' },
          { projectId, workDate: dates[4], category: 'wrong', minutes: -1, summary: 'Normal work' },
        ]),
        ...Object.fromEntries(dates.map((date, index) => [`workDate_${index}`, date])),
      }),
    );
    expect(result).toHaveProperty('status', 400);
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'TIME_BATCH_ENTRY_INVALID',
        actionName: 'createTimeBatch',
        fieldErrors: {
          summary_1: ['problem.time.summaryInvalid'],
          category_4: ['problem.time.categoryInvalid'],
          hours_4: ['Enter a valid number of hours from 0 to 24.'],
        },
      },
    });
    expect((result as { data: { fieldErrors: object } }).data.fieldErrors).not.toHaveProperty(
      'entries',
    );
  });

  it('retains the complete expense table and points to every bad daily value', async () => {
    const entries = JSON.stringify([
      { spentOn: dates[1], amount: '-1', description: 'x', category: 'meals', vendor: '' },
      {
        spentOn: dates[4],
        amount: 'invalid',
        description: 'Site parking',
        category: 'parking',
        vendor: '',
      },
    ]);
    const result = await expenseActions.createExpenseWeek(
      event('expenses', {
        batchForm: 'expense_week_table',
        weekStart: dates[0]!,
        projectId,
        currency: 'EUR',
        whoPaid: 'worker',
        requestId: 'guided-expense-week-0001',
        entries,
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_WEEK_ROW_INVALID',
        actionName: 'createExpenseWeek',
        values: { entries, projectId, currency: 'EUR', whoPaid: 'worker' },
        fieldErrors: {
          amount_1: ['problem.expense.amountInvalid'],
          description_1: ['problem.expense.descriptionInvalid'],
          amount_4: ['problem.expense.amountInvalid'],
        },
      },
    });
    expect((result as { data: { fieldErrors: object } }).data.fieldErrors).not.toHaveProperty(
      'entries',
    );
  });
  it('targets a malformed weekly category and vendor to their own day controls', async () => {
    const result = await expenseActions.createExpenseWeek(
      event('expenses', {
        weekStart: dates[0]!,
        projectId,
        currency: 'EUR',
        whoPaid: 'worker',
        requestId: 'guided-expense-week-0002',
        entries: JSON.stringify([
          {
            spentOn: dates[2],
            amount: '10.00',
            description: 'Travel meal',
            category: 'wrong',
            vendor: 'x'.repeat(201),
          },
        ]),
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_WEEK_ROWS_INVALID',
        actionName: 'createExpenseWeek',
        fieldErrors: {
          category_2: ['problem.expenseDetail.correctionExpenseCategoryInvalid'],
          vendor_2: ['problem.expense.vendorInvalid'],
        },
      },
    });
  });

  it('asks for the invalid crew member hours rather than changing member selection', () => {
    const result = crewPageActionFailure(
      new ValidationError('Crew member hours: enter hours such as 7.5'),
      'createBatch',
      {
        mode: 'individual',
        hours_good: '7.5',
        hours_bad: 'wrong',
        summary: 'Retained crew work',
      },
      ['good', 'bad'],
    );
    expect(result.data).toMatchObject({
      code: 'CREW_INDIVIDUAL_HOURS_INVALID',
      actionName: 'createBatch',
      fieldErrors: { hours_bad: ['problem.crew.individualHoursInvalid'] },
      workerIds: ['good', 'bad'],
      values: { summary: 'Retained crew work' },
    });
    expect(result.data.fieldErrors).not.toHaveProperty('workerIds');
  });

  it('asks for the invalid allocation amount while preserving selected receipt rows', () => {
    const result = crewPageActionFailure(
      new ValidationError('Enter each receipt allocation as an amount such as 6.50'),
      'allocateReceipt',
      {
        amount_good: '12.50',
        amount_bad: 'wrong',
        expenseId: 'receipt-1',
      },
      [],
      ['good', 'bad'],
    );
    expect(result.data).toMatchObject({
      fieldErrors: { amount_bad: ['problem.crew.receiptAmountFormatInvalid'] },
      timeEntryIds: ['good', 'bad'],
      values: { expenseId: 'receipt-1' },
    });
    expect(result.data.fieldErrors).not.toHaveProperty('timeEntryIds');
  });
});
