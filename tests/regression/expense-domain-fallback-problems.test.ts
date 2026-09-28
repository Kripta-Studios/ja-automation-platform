import { describe, expect, it } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { expenseActionFailure } from '../../apps/portal/src/lib/server/actions/expense-actions';

describe('expense domain fallback problems', () => {
  it.each([
    [
      new ValidationError('Expense not found'),
      404,
      'EXPENSE_RECORD_UNAVAILABLE',
      'problem.expense.recordUnavailable',
      'review_expenses',
    ],
    [
      new ValidationError('Crew expense request ID required'),
      400,
      'EXPENSE_CREW_REQUEST_ID_INVALID',
      'problem.expense.crewRequestIdInvalid',
      'review_expense',
    ],
    [
      new ValidationError('Money exceeds safe SQLite integer range'),
      400,
      'EXPENSE_AMOUNT_TOO_LARGE',
      'problem.expense.amountTooLarge',
      'correct_field',
    ],
    [
      new AccessDeniedError('Project assignment access required'),
      403,
      'EXPENSE_PROJECT_ACCESS_REQUIRED',
      'problem.expense.projectAccessRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Project manager project scope required'),
      403,
      'EXPENSE_PROJECT_ACCESS_REQUIRED',
      'problem.expense.projectAccessRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Owner administration required to record for another worker'),
      403,
      'EXPENSE_OWNER_ENTRY_REQUIRED',
      'problem.expense.ownerEntryRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Active worker assignment required'),
      403,
      'EXPENSE_ASSIGNMENT_REQUIRED',
      'problem.expense.assignmentRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Expense ownership required'),
      403,
      'EXPENSE_OWNERSHIP_REQUIRED',
      'problem.expense.ownershipRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Expense ownership or admin rights required'),
      403,
      'EXPENSE_OWNERSHIP_REQUIRED',
      'problem.expense.ownershipRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Crew expense access required'),
      403,
      'EXPENSE_CREW_ACCESS_REQUIRED',
      'problem.expense.crewAccessRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Active project crew delegation required'),
      403,
      'EXPENSE_CREW_ACCESS_REQUIRED',
      'problem.expense.crewAccessRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Valid project timezone required for crew access'),
      403,
      'EXPENSE_PROJECT_TIMEZONE_REQUIRED',
      'problem.expense.projectTimezoneRequired',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Crew time record access required'),
      403,
      'EXPENSE_CREW_TIME_ACCESS_REQUIRED',
      'problem.expense.crewTimeAccessRequired',
      'review_time',
    ],
  ] as const)('maps %s to a specific problem', (error, status, code, messageKey, remedy) => {
    const response = expenseActionFailure(error, {
      id: 'expense-1',
      amount: '999999999999999.99',
      requestId: 'short',
      timeEntryId: 'time-1',
      secret: 'must-not-return',
    });
    expect(response.status).toBe(status);
    expect(response.data).toMatchObject({
      code,
      messageKey,
      remedies: [{ id: remedy }],
      values: {
        id: 'expense-1',
        amount: '999999999999999.99',
        requestId: 'short',
        timeEntryId: 'time-1',
      },
    });
    expect(response.data.message).not.toBe(error.message);
    expect(JSON.stringify(response.data)).not.toContain('must-not-return');
  });

  it.each([
    [new ValidationError('Crew expense request ID required'), 'requestId'],
    [new ValidationError('Money exceeds safe SQLite integer range'), 'amount'],
    [
      new AccessDeniedError('Owner administration required to record for another worker'),
      'workerId',
    ],
    [new AccessDeniedError('Active worker assignment required'), 'spentOn'],
    [new AccessDeniedError('Crew time record access required'), 'timeEntryId'],
  ] as const)('points %s at the affected field with a localizable key', (error, field) => {
    const response = expenseActionFailure(error);
    expect(response.data.fieldErrors).toMatchObject({ [field]: [response.data.messageKey] });
  });
});
