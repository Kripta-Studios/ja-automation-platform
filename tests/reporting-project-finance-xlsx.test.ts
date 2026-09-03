import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { projectFinanceXlsx } from '@ja/reporting';

function unzip(bytes: Uint8Array): Map<string, string> {
  const files = new Map<string, string>();
  const buffer = Buffer.from(bytes);
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedLength = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressed = buffer.subarray(dataStart, dataStart + compressedLength);
    const data = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    files.set(name, data.toString('utf8'));
    offset = dataStart + compressedLength;
  }
  return files;
}

function sheetNames(files: Map<string, string>): string[] {
  const workbook = files.get('xl/workbook.xml') ?? '';
  return [...workbook.matchAll(/name="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('project finance XLSX export', () => {
  it('builds a labeled workbook with formatted money, hours, invoices and exact minor units', () => {
    const bytes = projectFinanceXlsx({
      project: {
        project_number: 'C-0001-P-001',
        project_name: 'Commissioning',
        client_number: 'C-0001',
        client_name: 'Northline',
        currency: 'EUR',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
      },
      financial: {
        currency: 'EUR',
        billingModel: 'tm',
        state: 'ready',
        laborRevenueMinor: '123456',
        expenseRevenueMinor: '10000',
        milestoneRevenueMinor: '0',
        revenueCandidateMinor: '133456',
        directLaborCostMinor: '80000',
        travelCostMinor: '2500',
        otherDirectCostMinor: '500',
        approvedCostMinor: '83000',
        workerCompensationMinor: '72000',
        contributionMarginMinor: '50456',
        contributionMarginBps: '3780',
        actualMinutes: 90,
        approvedMinutes: 90,
        billableMinutes: 90,
        invoicedMinor: '100000',
        invoicedGrossMinor: '121000',
        paidMinor: '40000',
        receivableMinor: '81000',
        approvedUnbilledWipMinor: '33456',
        unapprovedWipMinor: '0',
        alerts: ['MISSING_RATE'],
        reasons: [{ code: 'missing_client_rate', sourceId: 'time-1' }],
        approvedUnbilledSources: [
          {
            sourceType: 'time',
            sourceId: 'time-1',
            amountMinor: '33456',
            workDate: '2026-08-12',
            workerId: 'worker-1',
          },
        ],
        dailyMinimumAdjustments: [
          {
            workerId: 'worker-1',
            workDate: '2026-08-12',
            adjustmentMinutes: 30,
            revenueMinor: '2500',
          },
        ],
      },
      timeEconomics: [
        {
          workerName: 'Alex Worker',
          workDate: '2026-08-12',
          category: 'regular',
          actualMinutes: 90,
          clientBillableMinutes: 90,
          clientRevenueMinor: '123456',
          internalCostMinor: '80000',
          workerCompensationMinor: '72000',
          billabilityState: 'billable',
          approvalState: 'approved',
          billingStatus: 'unlocked',
          invoiceId: null,
        },
      ],
      expenseEconomics: [
        {
          workerName: 'Alex Worker',
          spentOn: '2026-08-13',
          category: 'hotel',
          paidBy: 'worker',
          treatment: 'reimbursable',
          costMinor: '2500',
          actualCostMinor: '2500',
          revenueMinor: '10000',
          pendingFinanceRevenueMinor: '0',
          approvalState: 'approved',
          financeApprovalState: 'approved',
          financeProjectionState: 'ready',
        },
      ],
      invoices: [
        {
          invoice_number: 'JA-INV-000001',
          stream_type: 'labor',
          state: 'issued',
          period_start: '2026-08-01',
          period_end: '2026-08-31',
          currency: 'EUR',
          total_minor: '121000',
          paid_minor: '40000',
          issued_at: '2026-08-20T00:00:00.000Z',
          due_at: '2026-09-19T00:00:00.000Z',
        },
      ],
      milestones: [
        {
          name: 'FAT',
          due_on: '2026-08-30',
          approval_state: 'approved',
          amount_minor: '50000',
          currency: 'EUR',
        },
      ],
      locale: 'en',
    });

    const files = unzip(bytes);
    expect(sheetNames(files)).toEqual([
      'Summary',
      'Labor',
      'Expenses',
      'Unbilled WIP',
      'Daily minimum',
      'Invoices',
      'Milestones',
      'Alerts',
    ]);

    const summary = files.get('xl/worksheets/sheet1.xml') ?? '';
    expect(summary).toContain('Labor revenue');
    expect(summary).toContain('EUR');
    expect(summary).toContain('1,234.56');
    expect(summary).toContain('123456');
    expect(summary).toContain('1.50');
    expect(summary).toContain('37.80%');
    expect(summary).not.toContain('laborRevenueMinor');

    const labor = files.get('xl/worksheets/sheet2.xml') ?? '';
    expect(labor).toContain('Alex Worker');
    expect(labor).toContain('1.50');
    expect(labor).toContain('1,234.56');
    expect(labor).toContain('123456');

    const invoices = files.get('xl/worksheets/sheet6.xml') ?? '';
    expect(invoices).toContain('JA-INV-000001');
    expect(invoices).toContain('1,210.00');
    expect(invoices).toContain('400.00');

    const alerts = files.get('xl/worksheets/sheet8.xml') ?? '';
    expect(alerts).toContain('MISSING_RATE');
    expect(alerts).toContain('missing_client_rate');
    expect(alerts).toContain('time-1');
  });

  it('keeps empty detail sheets header-only and localizes sheet names', () => {
    const bytes = projectFinanceXlsx({
      project: {
        project_number: 'C-0002-P-001',
        project_name: 'Empty',
        currency: 'EUR',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
      },
      financial: { currency: 'EUR', laborRevenueMinor: '0', contributionMarginBps: '0' },
      timeEconomics: [],
      expenseEconomics: [],
      locale: 'es',
    });
    const files = unzip(bytes);
    expect(sheetNames(files)).toContain('Resumen');
    expect(sheetNames(files)).toContain('Mano de obra');
    expect(sheetNames(files)).toContain('Facturas');
    expect(files.get('xl/worksheets/sheet2.xml')).toContain('actualHours');
  });
});
