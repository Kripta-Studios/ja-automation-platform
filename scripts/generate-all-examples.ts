import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  invoicePdf,
  periodReportPdf,
  accountingPackPdf,
  accountingPackXlsx,
  accountingPackCsv,
  projectFinanceXlsx,
  invoiceCollectionLedgerXlsx,
  invoiceCollectionLedgerCsv,
  workerStatementPdf,
  workerStatementCsv,
  dailyReportPdf,
  technicalReportPdf,
  toCsv,
} from '../packages/reporting/src/exports.ts';
import type { InvoiceTemplateSnapshot } from '../packages/invoice-templates/src/index.ts';

const outDir = resolve(process.cwd(), 'docs/examples');
mkdirSync(outDir, { recursive: true });

console.log('Generating all platform PDF and Excel examples into:', outDir);

// Open demo DB to pull real data
const db = new DatabaseSync('./packages/database/data/demo.db');

// Helper to write
function save(filename: string, data: Uint8Array | string) {
  const target = resolve(outDir, filename);
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  writeFileSync(target, buffer);
  console.log(`✓ Generated: ${filename} (${buffer.length.toLocaleString()} bytes)`);
}

// -------------------------------------------------------------
// 1. INVOICES (PDF)
// -------------------------------------------------------------
const inv013Row = db
  .prepare('SELECT snapshot_json FROM invoice WHERE invoice_number=?')
  .get('CP020-013') as { snapshot_json: string } | undefined;
const inv014Row = db
  .prepare('SELECT snapshot_json FROM invoice WHERE invoice_number=?')
  .get('CP020-014') as { snapshot_json: string } | undefined;

if (inv013Row) {
  const snap = JSON.parse(inv013Row.snapshot_json);
  save('Invoice_CP020-013_Labor_Detailed_EN.pdf', invoicePdf({ ...snap, locale: 'en' }));
  save('Invoice_CP020-013_Labor_Detailed_ES.pdf', invoicePdf({ ...snap, locale: 'es' }));
  save('Invoice_CP020-013_Labor_Detailed_PT.pdf', invoicePdf({ ...snap, locale: 'pt' }));
}

if (inv014Row) {
  const snap = JSON.parse(inv014Row.snapshot_json);
  save('Invoice_CP020-014_Expenses_Detailed_EN.pdf', invoicePdf({ ...snap, locale: 'en' }));
  save('Invoice_CP020-014_Expenses_Detailed_ES.pdf', invoicePdf({ ...snap, locale: 'es' }));
  save('Invoice_CP020-014_Expenses_Detailed_PT.pdf', invoicePdf({ ...snap, locale: 'pt' }));
}

// Additional invoice template families
const sampleSummarySnap: InvoiceTemplateSnapshot = {
  template: { id: 'labor-summary', version: 1 },
  number: 'CP020-SUM-001',
  purchaseNo: 'BBS Mexico',
  locale: 'en',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: { legalName: 'IMPC Gmbh', billingAddress: '112 Birkshire Dr, Georgetown TX 78626' },
  project: { number: 'CP020', name: 'BBS Mexico', poNumber: 'BBS Mexico' },
  calculation: { currency: 'USD', subtotalMinor: '5743725', taxMinor: '0', totalMinor: '5743725' },
  lines: [
    {
      description: 'Senior PLC Programming & Commissioning (CW31-CW32)',
      quantity: 450,
      unit_price_minor: '7000',
      subtotal_minor: '3150000',
      amount_minor: '3150000',
    },
    {
      description: 'Robotics & Electrical Field Support (CW31-CW32)',
      quantity: 558.45,
      unit_price_minor: '5500',
      subtotal_minor: '2593725',
      amount_minor: '2593725',
    },
  ],
};
save('Invoice_Sample_Labor_Summary_EN.pdf', invoicePdf(sampleSummarySnap));

const sampleMilestoneSnap: InvoiceTemplateSnapshot = {
  template: { id: 'fixed-milestone', version: 1 },
  number: 'CP021-MS-001',
  purchaseNo: 'Junkers DFW',
  locale: 'en',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: { legalName: 'IMPC Gmbh', billingAddress: '112 Birkshire Dr, Georgetown TX 78626' },
  project: { number: 'CP021', name: 'Junkers DFW', poNumber: 'Junkers DFW' },
  calculation: { currency: 'USD', subtotalMinor: '4500000', taxMinor: '0', totalMinor: '4500000' },
  lines: [
    {
      description: 'Milestone 1: Electrical Design & Schematics Approval',
      milestone: 'M-01 Approved',
      quantity: 1,
      unit_price_minor: '2000000',
      subtotal_minor: '2000000',
      amount_minor: '2000000',
    },
    {
      description: 'Milestone 2: Factory Acceptance Testing (FAT) Completion',
      milestone: 'M-02 FAT Sign-off',
      quantity: 1,
      unit_price_minor: '2500000',
      subtotal_minor: '2500000',
      amount_minor: '2500000',
    },
  ],
};
save('Invoice_Sample_Fixed_Milestone_EN.pdf', invoicePdf(sampleMilestoneSnap));

const sampleCreditSnap: InvoiceTemplateSnapshot = {
  template: { id: 'credit-adjustment', version: 1 },
  number: 'CR-CP020-001',
  purchaseNo: 'BBS Mexico',
  locale: 'en',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: { legalName: 'IMPC Gmbh', billingAddress: '112 Birkshire Dr, Georgetown TX 78626' },
  project: { number: 'CP020', name: 'BBS Mexico', poNumber: 'BBS Mexico' },
  calculation: { currency: 'USD', subtotalMinor: '-350000', taxMinor: '0', totalMinor: '-350000' },
  lines: [
    {
      description: 'Credit Adjustment: Customer credit memo for line 2 standby discount',
      original_invoice: 'CP020-013',
      quantity: 1,
      unit_price_minor: '-350000',
      subtotal_minor: '-350000',
      amount_minor: '-350000',
    },
  ],
};
save('Invoice_Sample_Credit_Adjustment_EN.pdf', invoicePdf(sampleCreditSnap));

// -------------------------------------------------------------
// 2. PROJECT PERIOD REPORTS (PDF)
// -------------------------------------------------------------
const timeSummaryData = [
  {
    date: '2026-08-03',
    worker: 'Gabriel Santos',
    category: 'PLC Commissioning',
    activitySummary: 'Allen Bradley PLC program commissioning Line 1',
    minutes: 7890,
    approvalState: 'approved',
  },
  {
    date: '2026-08-04',
    worker: 'Maico Silva',
    category: 'Robotics Integration',
    activitySummary: 'Fanuc robot path optimization and gripper sensor alignment',
    minutes: 8076,
    approvalState: 'approved',
  },
  {
    date: '2026-08-05',
    worker: 'Victor Lima',
    category: 'PLC Commissioning',
    activitySummary: 'Line 2 Siemens S7-1500 safety sequence validation and HMI setup',
    minutes: 7770,
    approvalState: 'approved',
  },
  {
    date: '2026-08-06',
    worker: 'Andrew Miller',
    category: 'Electrical & Hardware',
    activitySummary: 'Field I/O checkout and Profinet network diagnostics',
    minutes: 8070,
    approvalState: 'approved',
  },
  {
    date: '2026-08-07',
    worker: 'Lucas Oliveira',
    category: 'PLC Tuning',
    activitySummary: 'Stations 10-14 cycle time tuning and handover testing',
    minutes: 7836,
    approvalState: 'approved',
  },
  {
    date: '2026-08-08',
    worker: 'Luiz Costa',
    category: 'Standby / Production Run',
    activitySummary: 'Supervised trial production run with plant engineering',
    minutes: 7545,
    approvalState: 'approved',
  },
  {
    date: '2026-08-09',
    worker: 'Fernando Gomes',
    category: 'Electrical Support',
    activitySummary: 'Panel wiring inspection and station safety testing',
    minutes: 6480,
    approvalState: 'approved',
  },
  {
    date: '2026-08-10',
    worker: 'Alejandro Ramos',
    category: 'Commissioning Tech',
    activitySummary: 'Sensor recalibration and station handover sign-off',
    minutes: 6840,
    approvalState: 'approved',
  },
];

const customerPeriodSnap = {
  project: { number: 'CP020', name: 'BBS Mexico', clientName: 'IMPC Gmbh' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-14',
  audience: 'customer' as const,
  currency: 'USD',
  commercialSummary: {
    currency: 'USD',
    actualMinutes: 60507,
    approvedMinutes: 60507,
    billableMinutes: 60507,
  },
  dailyReports: [
    {
      work_date: '2026-08-03',
      summary: 'Commissioned Allen Bradley ControlLogix safety zones',
      approval_state: 'approved',
    },
    {
      work_date: '2026-08-05',
      summary: 'Siemens S7-1500 safety sequence validation and HMI setup',
      approval_state: 'approved',
    },
  ],
  technicalReports: [
    {
      report_date: '2026-08-05',
      change_summary: 'TIA Portal v19 Safety Evaluation discrepancy window adjusted',
      approval_state: 'approved',
    },
  ],
  technicalChanges: [
    {
      created_at: '2026-08-05',
      change_made: 'Updated input filter parameter and discrepancy time window',
      approval_state: 'approved',
    },
  ],
  timeSummary: timeSummaryData,
  sourceCounts: { dailyReports: 2, technicalReports: 1, technicalChanges: 1, timeEntries: 8 },
};

save(
  'Period_Report_Customer_Signoff_EN.pdf',
  periodReportPdf({ ...customerPeriodSnap, locale: 'en' }),
);
save(
  'Period_Report_Customer_Signoff_ES.pdf',
  periodReportPdf({ ...customerPeriodSnap, locale: 'es' }),
);
save(
  'Period_Report_Customer_Signoff_PT.pdf',
  periodReportPdf({ ...customerPeriodSnap, locale: 'pt' }),
);

const internalPeriodSnap = {
  ...customerPeriodSnap,
  audience: 'internal' as const,
  commercialSummary: {
    currency: 'USD',
    actualMinutes: 60507,
    approvedMinutes: 60507,
    billableMinutes: 60507,
    candidateSubtotalMinor: '5743725',
    operationalRevenueCandidateMinor: '5743725',
    invoicedNetMinor: '5743725',
    paidMinor: '0',
    receivableMinor: '5743725',
    sourceCounts: {
      dailyReports: 2,
      technicalReports: 1,
      technicalChanges: 1,
      timeEntries: 8,
      expenses: 8,
    },
  },
  financialSummary: {
    currency: 'USD',
    approvedCostMinor: '3428000',
    contributionMarginMinor: '2315725',
    contributionMarginBps: 4031, // 40.31%
  },
  commercialCalculation: [
    {
      type: 'labor',
      basis: 'approved_billable_minutes_effective_client_labor_rates',
      minutes: 60507,
      amountMinor: '5743725',
    },
  ],
};

save(
  'Period_Report_Internal_Admin_EN.pdf',
  periodReportPdf({ ...internalPeriodSnap, locale: 'en' }),
);
save(
  'Period_Report_Internal_Admin_ES.pdf',
  periodReportPdf({ ...internalPeriodSnap, locale: 'es' }),
);
save(
  'Period_Report_Internal_Admin_PT.pdf',
  periodReportPdf({ ...internalPeriodSnap, locale: 'pt' }),
);

// -------------------------------------------------------------
// 3. MONTHLY ACCOUNTING PACK (PDF, XLSX & CSV)
// -------------------------------------------------------------
const accountingWorkerCosts = [
  {
    worker: 'Gabriel Santos',
    workerName: 'Gabriel Santos',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Lead PLC Engineer',
    hours: '131.50',
    actualApprovedMinutes: 7890,
    approvedMinutes: 7890,
    currency: 'USD',
    approvedCostMinor: '526000',
    approvedCompensationMinor: '526000',
  },
  {
    worker: 'Maico Silva',
    workerName: 'Maico Silva',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Automation Specialist',
    hours: '134.60',
    actualApprovedMinutes: 8076,
    approvedMinutes: 8076,
    currency: 'USD',
    approvedCostMinor: '471100',
    approvedCompensationMinor: '471100',
  },
  {
    worker: 'Victor Lima',
    workerName: 'Victor Lima',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Robot Programmer',
    hours: '129.50',
    actualApprovedMinutes: 7770,
    approvedMinutes: 7770,
    currency: 'USD',
    approvedCostMinor: '453250',
    approvedCompensationMinor: '453250',
  },
  {
    worker: 'Andrew Miller',
    workerName: 'Andrew Miller',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Commissioning Tech',
    hours: '134.50',
    actualApprovedMinutes: 8070,
    approvedMinutes: 8070,
    currency: 'USD',
    approvedCostMinor: '470750',
    approvedCompensationMinor: '470750',
  },
  {
    worker: 'Lucas Oliveira',
    workerName: 'Lucas Oliveira',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'PLC Programmer',
    hours: '130.60',
    actualApprovedMinutes: 7836,
    approvedMinutes: 7836,
    currency: 'USD',
    approvedCostMinor: '457100',
    approvedCompensationMinor: '457100',
  },
  {
    worker: 'Luiz Costa',
    workerName: 'Luiz Costa',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Field Specialist',
    hours: '125.75',
    actualApprovedMinutes: 7545,
    approvedMinutes: 7545,
    currency: 'USD',
    approvedCostMinor: '440125',
    approvedCompensationMinor: '440125',
  },
  {
    worker: 'Fernando Gomes',
    workerName: 'Fernando Gomes',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Electrical Tech',
    hours: '108.00',
    actualApprovedMinutes: 6480,
    approvedMinutes: 6480,
    currency: 'USD',
    approvedCostMinor: '378000',
    approvedCompensationMinor: '378000',
  },
  {
    worker: 'Alejandro Ramos',
    workerName: 'Alejandro Ramos',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Commissioning Tech',
    hours: '114.00',
    actualApprovedMinutes: 6840,
    approvedMinutes: 6840,
    currency: 'USD',
    approvedCostMinor: '399000',
    approvedCompensationMinor: '399000',
  },
  {
    worker: 'Josafa Silva',
    workerName: 'Josafa Silva',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    role: 'Senior Specialist',
    hours: '148.00',
    actualApprovedMinutes: 8880,
    approvedMinutes: 8880,
    currency: 'USD',
    approvedCostMinor: '592000',
    approvedCompensationMinor: '592000',
  },
];

const accountingExpenseRegister = [
  {
    date: '2026-08-02',
    spentOn: '2026-08-02',
    vendor: 'American Airlines',
    worker: 'Josafa Silva',
    workerName: 'Josafa Silva',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    category: 'flight',
    currency: 'USD',
    grossMinor: '97380',
    costMinor: '97380',
    amountMinor: '97380',
    billable: true,
  },
  {
    date: '2026-08-03',
    spentOn: '2026-08-03',
    vendor: 'Hertz DFW',
    worker: 'Josafa Silva',
    workerName: 'Josafa Silva',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    category: 'car_rental',
    currency: 'USD',
    grossMinor: '25898',
    costMinor: '25898',
    amountMinor: '25898',
    billable: true,
  },
  {
    date: '2026-08-04',
    spentOn: '2026-08-04',
    vendor: 'Marriott Georgetown',
    worker: 'Josafa Silva',
    workerName: 'Josafa Silva',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    category: 'hotel',
    currency: 'USD',
    grossMinor: '85632',
    costMinor: '85632',
    amountMinor: '85632',
    billable: true,
  },
  {
    date: '2026-08-05',
    spentOn: '2026-08-05',
    vendor: 'Chevron Fuel',
    worker: 'Josafa Silva',
    workerName: 'Josafa Silva',
    project: 'CP020 · BBS Mexico',
    projectNumber: 'CP020',
    category: 'fuel',
    currency: 'USD',
    grossMinor: '10790',
    costMinor: '10790',
    amountMinor: '10790',
    billable: true,
  },
];

const accountingSnap = {
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'USD',
  invoiceRegister: [
    {
      invoiceNumber: 'CP020-013',
      client: 'IMPC Gmbh',
      clientNumber: 'C-0020',
      project: 'BBS Mexico',
      projectNumber: 'CP020',
      stream: 'labor',
      servicePeriod: '2026-08-01 → 2026-08-14',
      issueDate: '2026-08-10',
      dueDate: '2026-09-10',
      subtotalMinor: '5743725',
      taxMinor: '0',
      totalMinor: '5743725',
      grossMinor: '5743725',
      currency: 'USD',
    },
    {
      invoiceNumber: 'CP020-014',
      client: 'IMPC Gmbh',
      clientNumber: 'C-0020',
      project: 'BBS Mexico',
      projectNumber: 'CP020',
      stream: 'expense',
      servicePeriod: '2026-08-01 → 2026-08-14',
      issueDate: '2026-08-10',
      dueDate: '2026-09-10',
      subtotalMinor: '1336331',
      taxMinor: '0',
      totalMinor: '1336331',
      grossMinor: '1336331',
      currency: 'USD',
    },
  ],
  collections: [
    {
      invoiceNumber: 'CP020-013',
      receivedAt: '2026-08-25',
      client: 'IMPC Gmbh',
      currency: 'USD',
      amountMinor: '2500000',
      paymentMethod: 'wire_transfer',
      reference: 'WF-REF-981245',
    },
  ],
  workerCosts: accountingWorkerCosts,
  expenseRegister: accountingExpenseRegister,
  totals: {
    laborInvoicedMinor: '5743725',
    expenseInvoicedMinor: '1336331',
    milestoneOtherInvoicedMinor: '0',
    totalInvoicedMinor: '7080056',
    taxInvoicedMinor: '0',
    grossInvoicedMinor: '7080056',
    collectedMinor: '2500000',
    outstandingMinor: '4580056',
    workerCompensationMinor: '4187325',
    internalLaborCostMinor: '4187325',
    travelCostMinor: '219700',
    otherDirectCostMinor: '0',
    contributionMinor: '2673031',
    directCostMinor: '4407025',
    currency: 'USD',
  },
  totalsByCurrency: [{ currency: 'USD', totalInvoicedMinor: '7080056', collectedMinor: '2500000' }],
};

save(
  'Accounting_Pack_Monthly_2026-08_EN.pdf',
  accountingPackPdf({ ...accountingSnap, locale: 'en' }),
);
save(
  'Accounting_Pack_Monthly_2026-08_ES.pdf',
  accountingPackPdf({ ...accountingSnap, locale: 'es' }),
);
save(
  'Accounting_Pack_Monthly_2026-08_PT.pdf',
  accountingPackPdf({ ...accountingSnap, locale: 'pt' }),
);
save('Accounting_Pack_Monthly_2026-08.xlsx', accountingPackXlsx(accountingSnap));
save('Accounting_Pack_Monthly_2026-08.csv', accountingPackCsv(accountingSnap));
save('Accounting_Pack_Monthly_2026-08_Worker_Costs.csv', toCsv(accountingWorkerCosts));
save('Accounting_Pack_Monthly_2026-08_Expenses.csv', toCsv(accountingExpenseRegister));

// -------------------------------------------------------------
// 4. PROJECT FINANCE ECONOMIC REVIEW (EXCEL)
// -------------------------------------------------------------
const projectFinanceSnap = {
  project: {
    number: 'CP020',
    name: 'BBS Mexico',
    clientName: 'IMPC Gmbh',
    currency: 'USD',
  },
  financial: {
    currency: 'USD',
    candidateSubtotalMinor: '7080056',
    invoicedNetMinor: '7080056',
    paidMinor: '2500000',
    receivableMinor: '4580056',
    approvedCostMinor: '4407025',
    contributionMarginMinor: '2673031',
    contributionMarginBps: 3775, // 37.75%
  },
  timeEconomics: [
    {
      worker: 'Gabriel Santos',
      date: '2026-08-05',
      category: 'work',
      actualHours: '131.5',
      actualMinutes: 7890,
      billableHours: '131.5',
      billableMinutes: 7890,
      clientRevenue: '$9,205.00',
      internalCost: '$5,260.00',
      workerCompensation: '$5,260.00',
      billability: 'billable',
      approval: 'approved',
      billingStatus: 'invoiced',
      invoiceId: 'CP020-013',
      clientRevenueExactMinor: '920500',
      internalCostExactMinor: '526000',
      workerCompensationExactMinor: '526000',
    },
    {
      worker: 'Maico Silva',
      date: '2026-08-05',
      category: 'work',
      actualHours: '134.6',
      actualMinutes: 8076,
      billableHours: '134.6',
      billableMinutes: 8076,
      clientRevenue: '$7,403.00',
      internalCost: '$4,711.00',
      workerCompensation: '$4,711.00',
      billability: 'billable',
      approval: 'approved',
      billingStatus: 'invoiced',
      invoiceId: 'CP020-013',
      clientRevenueExactMinor: '740300',
      internalCostExactMinor: '471100',
      workerCompensationExactMinor: '471100',
    },
    {
      worker: 'Victor Lima',
      date: '2026-08-05',
      category: 'work',
      actualHours: '129.5',
      actualMinutes: 7770,
      billableHours: '129.5',
      billableMinutes: 7770,
      clientRevenue: '$7,122.50',
      internalCost: '$4,532.50',
      workerCompensation: '$4,532.50',
      billability: 'billable',
      approval: 'approved',
      billingStatus: 'invoiced',
      invoiceId: 'CP020-013',
      clientRevenueExactMinor: '712250',
      internalCostExactMinor: '453250',
      workerCompensationExactMinor: '453250',
    },
    {
      worker: 'Josafa Silva',
      date: '2026-08-05',
      category: 'work',
      actualHours: '148.0',
      actualMinutes: 8880,
      billableHours: '148.0',
      billableMinutes: 8880,
      clientRevenue: '$10,360.00',
      internalCost: '$5,920.00',
      workerCompensation: '$5,920.00',
      billability: 'billable',
      approval: 'approved',
      billingStatus: 'invoiced',
      invoiceId: 'CP020-014',
      clientRevenueExactMinor: '1036000',
      internalCostExactMinor: '592000',
      workerCompensationExactMinor: '592000',
    },
  ],
  expenseEconomics: [
    {
      worker: 'Josafa Silva',
      date: '2026-08-02',
      category: 'flight',
      paidBy: 'worker',
      treatment: 'reimbursable',
      cost: '$973.80',
      actualCost: '$973.80',
      revenue: '$973.80',
      pendingFinanceRevenue: '$0.00',
      approval: 'approved',
      financeApproval: 'approved',
      projection: 'reimbursable',
      costExactMinor: '97380',
      revenueExactMinor: '97380',
    },
    {
      worker: 'Josafa Silva',
      date: '2026-08-04',
      category: 'hotel',
      paidBy: 'worker',
      treatment: 'reimbursable',
      cost: '$856.32',
      actualCost: '$856.32',
      revenue: '$856.32',
      pendingFinanceRevenue: '$0.00',
      approval: 'approved',
      financeApproval: 'approved',
      projection: 'reimbursable',
      costExactMinor: '85632',
      revenueExactMinor: '85632',
    },
  ],
  locale: 'en',
};
save('Project_Finance_Economic_Review_CP020.xlsx', projectFinanceXlsx(projectFinanceSnap));

// -------------------------------------------------------------
// 5. INVOICE COLLECTION LEDGER (EXCEL & CSV)
// -------------------------------------------------------------
const ledgerRows = [
  {
    invoiceId: 'invoice-cp020-013',
    invoiceNumber: 'CP020-013',
    clientNumber: 'C-0020',
    clientName: 'IMPC Gmbh',
    projectNumber: 'CP020',
    projectName: 'BBS Mexico',
    issueDate: '2026-08-10',
    dueDate: '2026-09-10',
    currency: 'USD',
    subtotalMinor: '5743725',
    taxMinor: '0',
    totalMinor: '5743725',
    grossPaymentsMinor: '2500000',
    paymentReversalsMinor: '0',
    netCollectedMinor: '2500000',
    collectedMinor: '2500000',
    outstandingMinor: '3243725',
    directCostKnownMinor: '3428000',
    directCostMinor: '3428000',
    directCostComplete: true,
    directCostMissingSourceIds: [],
    contributionMinor: '2315725',
    contributionMarginBps: '4031',
    paymentStatus: 'partially_paid',
    billingStatus: 'issued',
    payments: [{ receivedAt: '2026-08-25', amountMinor: '2500000', reference: 'WF-WIRE-01' }],
    paymentReversals: [],
  },
  {
    invoiceId: 'invoice-cp020-014',
    invoiceNumber: 'CP020-014',
    clientNumber: 'C-0020',
    clientName: 'IMPC Gmbh',
    projectNumber: 'CP020',
    projectName: 'BBS Mexico',
    issueDate: '2026-08-10',
    dueDate: '2026-09-10',
    currency: 'USD',
    subtotalMinor: '1336331',
    taxMinor: '0',
    totalMinor: '1336331',
    grossPaymentsMinor: '0',
    paymentReversalsMinor: '0',
    netCollectedMinor: '0',
    collectedMinor: '0',
    outstandingMinor: '1336331',
    directCostKnownMinor: '979025',
    directCostMinor: '979025',
    directCostComplete: true,
    directCostMissingSourceIds: [],
    contributionMinor: '357306',
    contributionMarginBps: '2673',
    paymentStatus: 'unpaid',
    billingStatus: 'issued',
    payments: [],
    paymentReversals: [],
  },
];

save('Invoice_Collection_Ledger.xlsx', invoiceCollectionLedgerXlsx(ledgerRows));
save('Invoice_Collection_Ledger.csv', invoiceCollectionLedgerCsv(ledgerRows));

// -------------------------------------------------------------
// 6. WORKER COMPENSATION STATEMENT (PDF & CSV)
// -------------------------------------------------------------
const workerSnap = {
  worker: { id: 'w-gabriel', name: 'Gabriel Santos', role: 'Lead PLC Engineer' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-14',
  currency: 'USD',
  approvedMinutes: 2430,
  pendingMinutes: 0,
  estimatedApprovedMinor: '526000',
  estimatedPendingMinor: '0',
  approvedReimbursementMinor: '12500',
  pendingReimbursementMinor: '0',
  activities: [
    {
      date: '2026-08-03',
      projectNumber: 'CP020',
      projectName: 'BBS Mexico',
      category: 'work',
      activitySummary: 'Allen Bradley PLC program commissioning Line 1',
      actualMinutes: 600,
      approvalState: 'approved',
      compensationRateMinor: '4000',
    },
    {
      date: '2026-08-04',
      projectNumber: 'CP020',
      projectName: 'BBS Mexico',
      category: 'work',
      activitySummary: 'Safety circuit integration and interlock testing',
      actualMinutes: 630,
      approvalState: 'approved',
      compensationRateMinor: '4000',
    },
    {
      date: '2026-08-05',
      projectNumber: 'CP020',
      projectName: 'BBS Mexico',
      category: 'work',
      activitySummary: 'HMI alarms setup and sensor calibration',
      actualMinutes: 600,
      approvalState: 'approved',
      compensationRateMinor: '4000',
    },
    {
      date: '2026-08-06',
      projectNumber: 'CP020',
      projectName: 'BBS Mexico',
      category: 'work',
      activitySummary: 'Cycle time optimization Line 1 & 2',
      actualMinutes: 600,
      approvalState: 'approved',
      compensationRateMinor: '4000',
    },
  ],
  settlements: [
    {
      settlementId: 'SET-2026-08-1',
      projectNumber: 'CP020',
      projectName: 'BBS Mexico',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-14',
      amountMinor: '526000',
      state: 'paid',
      expectedPaymentOn: '2026-08-15',
      settledAt: '2026-08-15',
      reference: 'ACH-DIRECT-PAY',
      currency: 'USD',
    },
  ],
  expenses: [
    {
      projectNumber: 'CP020',
      projectName: 'BBS Mexico',
      spentOn: '2026-08-03',
      date: '2026-08-03',
      vendor: 'Chevron Gas & Oil',
      category: 'fuel',
      currency: 'USD',
      reimbursementAmountMinor: '12500',
      amountMinor: '12500',
      approvalState: 'approved',
      reimbursementState: 'paid',
      expectedReimbursementOn: '2026-08-15',
      reimbursedAt: '2026-08-15',
    },
  ],
};

save('Worker_Statement_Gabriel_Santos_EN.pdf', workerStatementPdf(workerSnap));
save('Worker_Statement_Gabriel_Santos.csv', workerStatementCsv(workerSnap));

// -------------------------------------------------------------
// 7. DAILY FIELD REPORT (PDF)
// -------------------------------------------------------------
const dailySnap = {
  id: 'daily-report-cp020-01',
  project: { number: 'CP020', name: 'BBS Mexico', clientName: 'IMPC Gmbh' },
  date: '2026-08-05',
  worker: 'Gabriel Santos',
  summary:
    'Commissioned Allen Bradley ControlLogix safety zones and validated Siemens S7-1500 interlocks for Stations 10 to 14. Supervised trial production run with 0 safety incidents.',
  siteShift: 'Plant 1 · First Shift (07:00 - 17:00)',
  tasksCompleted: 'Safety circuit checkout, servo axis tuning, HMI alarm messaging verified',
  problemsFound: 'Photoelectric sensor bracket on station 12 was misaligned',
  correctiveActions: 'Re-aligned bracket and tightened mounting bolts; retested trigger window',
  downtimeMinutes: 0,
  standbyReason: 'None · Normal continuous operation',
  safetyRelated: true,
  approvalState: 'approved',
};

save('Daily_Field_Report_BBS_Mexico_EN.pdf', dailyReportPdf({ ...dailySnap, locale: 'en' }));
save('Daily_Field_Report_BBS_Mexico_ES.pdf', dailyReportPdf({ ...dailySnap, locale: 'es' }));
save('Daily_Field_Report_BBS_Mexico_PT.pdf', dailyReportPdf({ ...dailySnap, locale: 'pt' }));

// -------------------------------------------------------------
// 8. TECHNICAL & PLC REPORT (PDF)
// -------------------------------------------------------------
const techSnap = {
  id: 'tech-report-cp020-01',
  project: { number: 'CP020', name: 'BBS Mexico', clientName: 'IMPC Gmbh' },
  date: '2026-08-05',
  systemName: 'Main Assembly Cell PLC',
  plantSite: 'BBS Saltillo Plant',
  areaLine: 'Assembly Line 2',
  stationMachine: 'Station 10 - 14 Transfer',
  systemType: 'PLC & Safety Controller',
  plcPlatform: 'Siemens S7-1500 & Allen Bradley GuardLogix',
  controller: 'CPU 1517F-3 PN/DP',
  hmiScada: 'Siemens WinCC Unified & FactoryTalk View',
  networkProtocol: 'PROFINET / EtherNet/IP Industrial Gateway',
  softwareVersion: 'TIA Portal v19 / Studio 5000 v35',
  programReference: 'BBS_MEX_L2_MAIN_REV_3.4',
  problemSymptom: 'Intermittent emergency stop trip on conveyor index transfer',
  diagnosisRootCause:
    'Dual-channel safety relay pulse test timing discrepancy between safety gate and PLC safety input module',
  changePerformed:
    'Adjusted discrepancy time window in Safety Evaluation configuration from 50ms to 200ms per manufacturer recommendation',
  productionImpact: 'Zero unplanned downtime observed over 4 hours of test production',
  validation:
    'Tested 10 consecutive emergency stop triggers and re-engaged safety circuit; all fault codes reset cleanly',
  validationResult: 'Pass · Fully functional and within safety SIL3 compliance standards',
  openRisk: 'None identified; hardware and firmware signatures backed up',
  rollbackPlan: 'Restore safety project file BBS_MEX_L2_MAIN_REV_3.3 from local backup PLC SD card',
  safetyRelated: true,
  approvalState: 'approved',
  technicalChanges: [
    {
      created_at: '2026-08-05',
      component: 'Safety Input Module F-DI 16x24VDC',
      change_made: 'Updated input filter parameter and discrepancy time window',
      approval_state: 'approved',
    },
    {
      created_at: '2026-08-05',
      component: 'HMI Alarm Banner',
      change_made: 'Added explicit diagnostic text: Station 12 Gate Discrepancy Fault',
      approval_state: 'approved',
    },
  ],
};

save(
  'Technical_PLC_Report_Line2_Siemens_EN.pdf',
  technicalReportPdf({ ...techSnap, locale: 'en' }),
);
save(
  'Technical_PLC_Report_Line2_Siemens_ES.pdf',
  technicalReportPdf({ ...techSnap, locale: 'es' }),
);
save(
  'Technical_PLC_Report_Line2_Siemens_PT.pdf',
  technicalReportPdf({ ...techSnap, locale: 'pt' }),
);

console.log('\nAll platform PDF and Excel examples generated successfully!');
db.close();
