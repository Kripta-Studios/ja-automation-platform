import { DatabaseSync } from 'node:sqlite';
import { inflateRawSync } from 'node:zlib';
import type { Principal } from '@ja/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository } from '../../packages/database/src/repository';
import { projectFinanceXlsx } from '../../packages/reporting/src/exports';

let sqlite: DatabaseSync;
const issueDate = '2026-09-30T01:19:21.091Z';
const dueDate = '2026-10-30T01:19:21.091Z';
const principal = (role: Principal['role']): Principal => ({
  userId: role,
  role,
  projectIds: new Set(['project']),
});

beforeEach(() => {
  // Isolated method contract only: never opens or seeds a runtime database.
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user(id TEXT,status TEXT);
    INSERT INTO user VALUES('owner_admin','active'),('finance_admin','active'),('auditor_read_only','active'),('worker','active'),('project_manager','active');
    CREATE TABLE project(id TEXT,client_id TEXT,project_number TEXT,cost_center_code TEXT,po_number TEXT);
    INSERT INTO project VALUES('project','client','QA-PROJECT','QA','QA-PO');
    CREATE TABLE client(id TEXT,client_code TEXT,client_number TEXT,display_name TEXT);
    INSERT INTO client VALUES('client','QA','QA-CLIENT','QA Client');
    CREATE TABLE invoice(id TEXT,project_id TEXT,invoice_number TEXT,stream_type TEXT,state TEXT,currency TEXT,
      total_minor INTEGER,period_start TEXT,period_end TEXT,planned_issue_on TEXT,expected_collection_on TEXT,
      issued_at TEXT,due_at TEXT,version INTEGER,pdf_status TEXT,pdf_generated_at TEXT,created_at TEXT);
    CREATE TABLE invoice_event(invoice_id TEXT,event_type TEXT);
    CREATE TABLE invoice_source(invoice_id TEXT);
    CREATE TABLE invoice_line(invoice_id TEXT);
    CREATE TABLE payment(invoice_id TEXT,amount_minor INTEGER);
    CREATE TABLE invoice_payment_reversal_event(invoice_id TEXT,amount_minor INTEGER);
  `);
});
afterEach(() => sqlite.close());

function addInvoice(dueAt: string | null) {
  sqlite
    .prepare(
      `INSERT INTO invoice VALUES('invoice','project','QA-INVOICE','expense','issued','USD',361,
    '2026-10-01','2026-10-31',NULL,NULL,?,?,1,'ready',?,?)`,
    )
    .run(issueDate, dueAt, issueDate, issueDate);
}

function invoiceSheet(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const length = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30;
    const name = buffer.subarray(start, start + nameLength).toString('utf8');
    const dataStart = start + nameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + length);
    if (name === 'xl/worksheets/sheet6.xml')
      return (method === 8 ? inflateRawSync(compressed) : compressed).toString('utf8');
    offset = dataStart + length;
  }
  throw new Error('Invoices worksheet missing');
}

function cell(sheet: string, reference: string) {
  const match = sheet.match(new RegExp(`<c r="${reference}"(?: [^>]*)?>[\\s\\S]*?<\\/c>`));
  if (!match) throw new Error(`Cell ${reference} missing`);
  return match[0];
}

describe('canonical invoice due date from real repository list to project finance workbook', () => {
  it.each(['owner_admin', 'finance_admin', 'auditor_read_only'] as const)(
    'preserves the actual distinct due date for %s without changing invoice history',
    (role) => {
      addInvoice(dueDate);
      const before = sqlite.prepare('SELECT * FROM invoice').all();
      const rows = new PortalRepository(sqlite).listInvoices(principal(role));
      expect(rows[0]).toMatchObject({
        issued_at: issueDate,
        due_at: dueDate,
        total_minor: 361,
        paid_minor: '0',
      });
      const sheet = invoiceSheet(
        projectFinanceXlsx({
          project: { currency: 'USD' },
          financial: {},
          timeEconomics: [],
          expenseEconomics: [],
          invoices: rows,
        }),
      );
      expect(cell(sheet, 'K2')).toContain(issueDate);
      expect(cell(sheet, 'L2')).toContain(dueDate);
      expect(cell(sheet, 'L2')).not.toContain(issueDate);
      expect(sqlite.prepare('SELECT * FROM invoice').all()).toEqual(before);
    },
  );

  it('keeps unknown due dates blank instead of substituting the issue date', () => {
    addInvoice(null);
    const rows = new PortalRepository(sqlite).listInvoices(principal('finance_admin'));
    expect(rows[0]?.due_at).toBeNull();
    const sheet = invoiceSheet(
      projectFinanceXlsx({
        project: { currency: 'USD' },
        financial: {},
        timeEconomics: [],
        expenseEconomics: [],
        invoices: rows,
      }),
    );
    expect(cell(sheet, 'K2')).toContain(issueDate);
    expect(cell(sheet, 'L2')).toContain('<t></t>');
    expect(cell(sheet, 'L2')).not.toContain(issueDate);
  });

  it.each(['worker', 'project_manager'] as const)(
    'preserves finance-list denial for %s',
    (role) => {
      addInvoice(dueDate);
      expect(() => new PortalRepository(sqlite).listInvoices(principal(role))).toThrow(
        'Finance role required',
      );
    },
  );
});
