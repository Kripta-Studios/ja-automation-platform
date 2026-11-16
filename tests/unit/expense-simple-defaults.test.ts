import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  defaultExpenseDescription,
  defaultExpensePayer,
  normalizeExpenseAmount,
} from '../../apps/portal/src/lib/server/actions/expense-actions';

function db(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE project_member(id TEXT, project_id TEXT, user_id TEXT, status TEXT, starts_on TEXT, ends_on TEXT);
    CREATE TABLE assignment_expense_policy(project_member_id TEXT, payer TEXT, category TEXT,
      effective_from TEXT, effective_to TEXT, version INTEGER);
    INSERT INTO project_member VALUES('m1','p1','w1','active','2026-01-01',NULL);
  `);
  return sqlite;
}
const input = { projectId: 'p1', workerId: 'w1', spentOn: '2026-11-16', category: 'meals' };

describe('simplified expense intake defaults', () => {
  it('accepts a decimal comma without changing exact minor units', () => {
    expect(normalizeExpenseAmount('12,50')).toBe('12.50');
    expect(normalizeExpenseAmount(' 7 ')).toBe('7');
    expect(normalizeExpenseAmount('1,234.50')).toBe('1,234.50');
  });

  it('fills a neutral description only when the note is empty', () => {
    expect(defaultExpenseDescription({ category: 'hotel' })).toBe('Hotel expense');
    expect(defaultExpenseDescription({ category: 'hotel', vendor: 'Riverside Inn' })).toBe(
      'Riverside Inn',
    );
  });

  it('derives the payer from the assignment expense policy', () => {
    const sqlite = db();
    expect(defaultExpensePayer(sqlite, input)).toBe('worker');
    sqlite.exec(
      "INSERT INTO assignment_expense_policy VALUES('m1','company_card',NULL,'2026-01-01',NULL,1)",
    );
    expect(defaultExpensePayer(sqlite, input)).toBe('company_card');
    sqlite.exec(
      "INSERT INTO assignment_expense_policy VALUES('m1','worker','meals','2026-01-01',NULL,1)",
    );
    expect(defaultExpensePayer(sqlite, input)).toBe('worker');
    expect(defaultExpensePayer(sqlite, { ...input, category: 'hotel' })).toBe('company_card');
    expect(defaultExpensePayer(sqlite, { ...input, workerId: 'nobody' })).toBe('worker');
  });
});
