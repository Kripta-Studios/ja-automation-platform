import { describe, expect, it } from 'vitest';
import {
  ledgerCurrencyUnits,
  ledgerReadableCsv,
} from '../../apps/portal/src/lib/server/ledger-readable-csv';

const row = {
  invoiceId: 'inv-1',
  invoiceNumber: '123-2026-000001',
  clientNumber: 'C-7',
  clientName: 'Dürr Stuttgart',
  projectNumber: 'MAG',
  projectName: 'Line 5',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  issueDate: '2026-11-01T23:59:59.000Z',
  dueDate: '2026-11-15',
  currency: 'USD',
  subtotalMinor: '84000',
  taxMinor: '0',
  totalMinor: '84000',
  netCollectedMinor: '20000',
  collectedMinor: '20000',
  appliedCreditMinor: '0',
  netOutstandingMinor: '64000',
  outstandingMinor: '64000',
  paymentStatus: 'partially_paid',
  daysOverdue: 9,
  agingBucket: '1_30',
  poNumber: '=HYPERLINK("x")',
};

describe('T49 readable invoice collection ledger CSV', () => {
  it('starts with a BOM and uses human headers in the viewer language', () => {
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(ledgerReadableCsv([row], 'es'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header).toContain('Factura,Cliente,Proyecto');
    expect(header).not.toMatch(/Minor|invoiceId/u);
    expect(line).toContain('Dürr Stuttgart');
    expect(line).toContain(',840.00,');
    expect(line).toContain(',640.00,');
    expect(line).toContain('2026-11-01,2026-11-15');
    expect(line).not.toContain('23:59');
    expect(line).toContain('Vencido de 1 a 30 días');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('keeps amounts exact and in each currency own minor units', () => {
    expect(ledgerCurrencyUnits('-12345', 'USD')).toBe('-123.45');
    expect(ledgerCurrencyUnits('1500', 'JPY')).toBe('1500');
    expect(ledgerCurrencyUnits('900719925474099312', 'USD')).toBe('9007199254740993.12');
    expect(ledgerCurrencyUnits('', 'USD')).toBe('');
  });

  it('translates statuses (English default)', () => {
    const csv = new TextDecoder().decode(
      ledgerReadableCsv([{ ...row, paymentStatus: 'unpaid' }], 'en'),
    );
    expect(csv).toContain('Invoice,Client,Project');
    expect(csv).toContain(',Unpaid,');
  });
});
