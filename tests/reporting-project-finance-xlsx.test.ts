import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { accountingPackXlsx, projectFinanceXlsx, toCsv } from '@ja/reporting';
import { xlsxFromSheets } from '../packages/reporting/src/exports.ts';

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
  return [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1] ?? '');
}

function cellXml(files: Map<string, string>, sheet: number, reference: string): string {
  const xml = files.get(`xl/worksheets/sheet${sheet}.xml`) ?? '';
  const match = xml.match(new RegExp(`<c r="${reference}"(?: [^>]*)?>[\\s\\S]*?<\\/c>`));
  if (!match) throw new Error(`Missing cell ${reference} in sheet ${sheet}`);
  return match[0];
}

function cellByHeader(files: Map<string, string>, sheet: number, header: string, row = 2): string {
  const xml = files.get(`xl/worksheets/sheet${sheet}.xml`) ?? '';
  const match = [...xml.matchAll(/<c r="([A-Z]+)1"[^>]*><is><t>([^<]*)<\/t><\/is><\/c>/g)].find(
    (candidate) => candidate[2] === header,
  );
  if (!match?.[1]) throw new Error(`Missing header ${header} in sheet ${sheet}`);
  return cellXml(files, sheet, `${match[1]}${row}`);
}

describe('project finance XLSX export', () => {
  it('keeps declared numeric values numeric, dates sortable, and identifiers/formula-like text literal', () => {
    const bytes = xlsxFromSheets([
      {
        name: 'Typed cells',
        columns: ['recordId', 'workDate', 'minutes', 'amount', 'exactMinorUnits', 'note'],
        numericColumns: ['minutes', 'amount'],
        dateColumns: ['workDate'],
        rows: [
          {
            recordId: '00123',
            workDate: '2026-08-12',
            minutes: 90,
            amount: 12.5,
            exactMinorUnits: '9007199254740993',
            note: '=HYPERLINK("https://example.test","unsafe")',
          },
        ],
      },
    ]);

    const files = unzip(bytes);
    const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
    expect(files.get('[Content_Types].xml')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    );
    expect(sheet).toMatch(/r="B2" s="1"><v>\d+<\/v><\/c>/);
    expect(sheet).toContain('<c r="C2"><v>90</v></c>');
    expect(sheet).toContain('<c r="D2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t>00123</t></is></c>');
    expect(sheet).toContain('9007199254740993');
    expect(sheet).toContain('=HYPERLINK');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:F2"/>');
    expect(sheet).toContain('customWidth="1"');
    expect(files.get('xl/workbook.xml')).toContain('_xlnm.Print_Titles');
  });

  it('never serializes an unsafe JavaScript integer as a numeric cell', () => {
    const files = unzip(
      xlsxFromSheets([
        {
          name: 'Precision',
          rows: [{ unsafe: 9_007_199_254_740_992 }],
          numericColumns: ['unsafe'],
        },
      ]),
    );
    expect(cellByHeader(files, 1, 'unsafe')).toContain('t="inlineStr"');
  });

  it('uses explicit CSV numeric columns while neutralizing untrusted text and preserving signed minor units', () => {
    const csv = toCsv(
      [
        {
          amountMinor: '-123',
          identifier: '00123',
          expression: '-1+2',
          exponent: '-1E3',
          formula: '=1+1',
          tabbed: '\tSUM(A1:A2)',
          multiline: '\rmalicious',
        },
      ],
      undefined,
      { numericColumns: ['amountMinor'] },
    );

    expect(csv).toContain('-123');
    expect(csv).toContain("'00123");
    expect(csv).toContain("'-1+2");
    expect(csv).toContain("'-1E3");
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'\tSUM(A1:A2)");
    expect(csv).toContain("'\rmalicious");
  });

  it('writes real caller monetary cells as numeric major-unit values while exact minor units remain text', () => {
    const bytes = accountingPackXlsx({
      invoiceRegister: [
        {
          invoiceId: 'INV-001',
          currency: 'EUR',
          netMinor: '123456',
          taxMinor: '23456',
          grossMinor: '146912',
        },
        { invoiceId: 'INV-TOO-LARGE', currency: 'EUR', netMinor: '9007199254740993' },
      ],
      collections: [
        {
          paymentId: 'PAY-001',
          currency: 'EUR',
          grossInvoicedMinor: '146912',
          amountCollectedInMonthMinor: '-1200',
          totalCollectedToDateMinor: '120000',
          outstandingMinor: '26912',
        },
      ],
      workerCosts: [
        {
          workerId: 'worker-001',
          currency: 'EUR',
          approvedCompensationMinor: '72000',
          settledCompensationMinor: '70000',
          internalLoadedLaborCostMinor: '80000',
          reimbursementMinor: '2500',
        },
      ],
      expenseRegister: [
        {
          expenseId: 'expense-001',
          currency: 'EUR',
          amountMinor: '2500',
          taxMinor: '500',
          grossMinor: '3000',
          projectCurrency: 'EUR',
          projectCurrencyAmountMinor: '2500',
          billingAmountMinor: '3500',
        },
        {
          expenseId: 'expense-missing-money',
          currency: 'EUR',
          amountMinor: null,
          taxMinor: undefined,
          grossMinor: '',
          projectCurrency: 'EUR',
          projectCurrencyAmountMinor: 'malformed',
          billingAmountMinor: '0',
        },
      ],
    });
    const files = unzip(bytes);

    expect(cellByHeader(files, 1, 'net')).toContain('<v>1234.56</v>');
    expect(cellByHeader(files, 1, 'netMinor')).toContain('<is><t>123456</t></is>');
    expect(cellByHeader(files, 1, 'net', 3)).toContain('t="inlineStr"');
    expect(cellByHeader(files, 1, 'netMinor', 3)).toContain('9007199254740993');
    expect(cellByHeader(files, 2, 'amountCollectedInMonth')).toContain('<v>-12</v>');
    expect(cellByHeader(files, 3, 'approvedCompensation')).toContain('<v>720</v>');
    expect(cellByHeader(files, 4, 'amount')).toContain('<v>25</v>');
    for (const header of ['amount', 'tax', 'gross', 'projectCurrencyAmount'])
      expect(cellByHeader(files, 4, header, 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 4, 'billingAmount', 3)).toContain('<v>0</v>');
    expect(cellByHeader(files, 4, 'amountMinor', 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 4, 'taxMinor', 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 4, 'grossMinor', 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 4, 'projectCurrencyAmountMinor', 3)).toContain(
      '<is><t>malformed</t></is>',
    );
  });

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
        {
          workerName: 'Alex Worker',
          spentOn: '2026-08-14',
          category: 'misc',
          paidBy: 'worker',
          treatment: 'reimbursable',
          costMinor: null,
          actualCostMinor: undefined,
          revenueMinor: '',
          pendingFinanceRevenueMinor: 'malformed',
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
    expect(cellByHeader(files, 1, 'amount', 11)).toContain('<v>1234.56</v>');
    expect(cellByHeader(files, 1, 'exactMinorUnits', 11)).toContain('<is><t>123456</t></is>');
    expect(cellByHeader(files, 1, 'hours', 22)).toContain('<v>1.5</v>');
    expect(cellByHeader(files, 1, 'percentage', 21)).toContain('<v>37.8</v>');
    expect(summary).toMatch(/<col min="4" max="4"[^>]* style="2"\/>/u);
    expect(files.get('xl/styles.xml')).toContain('numFmtId="165"');

    const labor = files.get('xl/worksheets/sheet2.xml') ?? '';
    expect(labor).toContain('Alex Worker');
    expect(labor).toContain('<c r="D2"><v>1.5</v></c>');
    expect(labor).toContain('<c r="H2"><v>1234.56</v></c>');
    expect(labor).toContain('123456');
    expect(cellByHeader(files, 2, 'clientRevenue')).toContain('<v>1234.56</v>');
    expect(cellByHeader(files, 2, 'internalCost')).toContain('<v>800</v>');
    expect(cellByHeader(files, 2, 'workerCompensation')).toContain('<v>720</v>');

    expect(cellByHeader(files, 3, 'cost')).toContain('<v>25</v>');
    expect(cellByHeader(files, 3, 'actualCost')).toContain('<v>25</v>');
    expect(cellByHeader(files, 3, 'revenue')).toContain('<v>100</v>');
    expect(cellByHeader(files, 3, 'pendingFinanceRevenue')).toContain('<v>0</v>');
    for (const header of ['cost', 'actualCost', 'revenue', 'pendingFinanceRevenue'])
      expect(cellByHeader(files, 3, header, 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 3, 'costExactMinor', 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 3, 'actualCostExactMinor', 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 3, 'revenueExactMinor', 3)).toContain('<is><t></t></is>');
    expect(cellByHeader(files, 3, 'pendingFinanceRevenueExactMinor', 3)).toContain(
      '<is><t>malformed</t></is>',
    );
    expect(cellByHeader(files, 4, 'amount')).toContain('<v>334.56</v>');
    expect(cellByHeader(files, 5, 'revenue')).toContain('<v>25</v>');

    const invoices = files.get('xl/worksheets/sheet6.xml') ?? '';
    expect(invoices).toContain('JA-INV-000001');
    expect(invoices).toContain('<c r="G2"><v>1210</v></c>');
    expect(invoices).toContain('<c r="H2"><v>400</v></c>');
    expect(cellByHeader(files, 6, 'total')).toContain('<v>1210</v>');
    expect(cellByHeader(files, 6, 'collected')).toContain('<v>400</v>');
    expect(cellByHeader(files, 7, 'amount')).toContain('<v>500</v>');

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
