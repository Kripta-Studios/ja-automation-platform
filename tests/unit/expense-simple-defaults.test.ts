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
    // T56: the thousands separator the app itself displays is accepted in every locale.
    expect(normalizeExpenseAmount('1,234.50')).toBe('1234.50');
    expect(normalizeExpenseAmount('2.940,00', 'MXN')).toBe('2940.00');
    expect(normalizeExpenseAmount('1.234.567,8', 'BRL')).toBe('1234567.8');
    // Not an amount: left as typed so the schema rejects it with the field error.
    expect(normalizeExpenseAmount('12,345,6')).toBe('12,345,6');
    expect(normalizeExpenseAmount('12.505', 'USD')).toBe('12505');
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

import {
  normalizeReceiptAmount,
  receiptFactsFromFileName,
  receiptFactsFromText,
} from '../../apps/portal/src/lib/portal/expense-evidence';

describe('receipt-first suggestions', () => {
  const today = '2026-11-16';
  it('normalizes receipt amounts exactly', () => {
    expect(normalizeReceiptAmount('1.234,56')).toBe('1234.56');
    expect(normalizeReceiptAmount('1,234.56')).toBe('1234.56');
    expect(normalizeReceiptAmount('12,5')).toBe('12.50');
    expect(normalizeReceiptAmount('0,00')).toBeUndefined();
  });
  it('prefers the total line and a valid recent date', () => {
    const text =
      'HOTEL RED ROOF\n14/11/2026 21:03\nSubtotal 80,00\nIVA 9,90\nTOTAL 89,90\nCambio 10,10';
    expect(receiptFactsFromText(text, { locale: 'es', today })).toEqual({
      amount: '89.90',
      date: '2026-11-14',
    });
    expect(
      receiptFactsFromText('Date 11/14/2026\nAmount due $35.20', { locale: 'en', today }),
    ).toEqual({
      amount: '35.20',
      date: '2026-11-14',
    });
    expect(
      receiptFactsFromText('2027-01-01 total 5.00', { locale: 'en', today }).date,
    ).toBeUndefined();
  });
  it('reads deliberate file names', () => {
    expect(receiptFactsFromFileName('2026-11-14_hotel_89.90.jpg', today)).toEqual({
      date: '2026-11-14',
      amount: '89.90',
    });
    expect(receiptFactsFromFileName('IMG_20261115_103000.jpg', today)).toEqual({
      date: '2026-11-15',
    });
  });
});
