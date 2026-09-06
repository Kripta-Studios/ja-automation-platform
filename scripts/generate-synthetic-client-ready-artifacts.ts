/**
 * Generates a deterministic, synthetic artifact set with the canonical report
 * and invoice renderers. The destination must be an isolated /tmp directory;
 * no database, mailbox, or deployed private storage is read.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  accountingPackArtifacts,
  invoicePdf,
  periodReportPdf,
  projectFinanceXlsx,
  renderAccountingPackArtifacts,
  workerStatementCsv,
  workerStatementPdf,
  type AccountingPackSourceSnapshot,
  type WorkerStatementSnapshot,
} from '@ja/reporting';

const outputValue = process.env.JA_ARTIFACT_SOURCE_DIR?.trim();
if (!outputValue) throw new Error('JA_ARTIFACT_SOURCE_DIR is required.');
const output = resolve(outputValue);
if (!output.startsWith(`${resolve('/tmp')}${sep}`))
  throw new Error('JA_ARTIFACT_SOURCE_DIR must be an isolated /tmp directory.');
mkdirSync(output, { recursive: true });

const period = {
  project: {
    number: 'SYN-C-0001-P-001',
    name: 'Synthetic commissioning validation',
    clientName: 'Synthetic Client One',
  },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  locale: 'en',
  dailyReports: [
    {
      work_date: '2026-08-12',
      summary: 'Validated a synthetic safety-interlock sequence and documented the result.',
      approval_state: 'approved',
    },
  ],
  technicalReports: [
    {
      report_date: '2026-08-13',
      change_summary: 'Recorded a synthetic PLC verification with rollback evidence.',
      approval_state: 'approved',
    },
  ],
  technicalChanges: [],
  timeSummary: [
    {
      date: '2026-08-12',
      workerDisplay: 'Synthetic Worker A',
      activitySummary: 'Commissioning validation',
      minutes: 480,
      approvalState: 'approved',
    },
  ],
  sourceCounts: { dailyReports: 1, technicalReports: 1, technicalChanges: 0, timeEntries: 1 },
} as const;

const worker: WorkerStatementSnapshot = {
  worker: { id: 'synthetic-worker-a', name: 'Synthetic Worker A' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'USD',
  approvedMinutes: 480,
  pendingMinutes: 60,
  estimatedApprovedMinor: '32000',
  estimatedPendingMinor: '4000',
  approvedReimbursementMinor: '8500',
  pendingReimbursementMinor: '0',
  missingCompensationRules: 0,
  activities: [
    {
      id: 'synthetic-time-1',
      projectNumber: period.project.number,
      projectName: period.project.name,
      date: '2026-08-12',
      category: 'regular',
      activitySummary: 'Synthetic commissioning validation',
      actualMinutes: 480,
      approvalState: 'approved',
    },
  ],
  settlements: [
    {
      id: 'synthetic-settlement-1',
      projectNumber: period.project.number,
      projectName: period.project.name,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountMinor: '32000',
      currency: 'USD',
      state: 'scheduled',
      expectedPaymentOn: '2026-09-10',
    },
  ],
  expenses: [
    {
      id: 'synthetic-expense-1',
      projectNumber: period.project.number,
      spentOn: '2026-08-12',
      vendor: 'Synthetic Transit Vendor',
      category: 'travel',
      reimbursementAmountMinor: '8500',
      currency: 'USD',
      approvalState: 'approved',
      reimbursementState: 'scheduled',
      expectedReimbursementOn: '2026-09-10',
    },
  ],
};

const pack: AccountingPackSourceSnapshot = {
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  locale: 'en',
  currency: 'USD',
  invoiceRegister: [
    {
      invoiceNumber: 'SYN-LAB-0001',
      client: 'Synthetic Client One',
      projectNumber: period.project.number,
      streamType: 'labor',
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      currency: 'USD',
      version: 1,
      netMinor: '80000',
      taxMinor: '0',
      grossMinor: '80000',
    },
  ],
  collections: [
    {
      invoiceNumber: 'SYN-LAB-0001',
      client: 'Synthetic Client One',
      receivedAt: '2026-09-05',
      currency: 'USD',
      grossInvoicedMinor: '80000',
      amountCollectedInMonthMinor: '20000',
      totalCollectedToDateMinor: '20000',
      outstandingMinor: '60000',
      amountMinor: '20000',
    },
  ],
  workerCosts: [
    {
      workerId: worker.worker.id,
      worker: worker.worker.name,
      projectNumber: period.project.number,
      actualMinutes: 480,
      currency: 'USD',
      approvedCompensationMinor: '32000',
      settledCompensationMinor: '0',
      internalLoadedLaborCostMinor: '40000',
      reimbursementMinor: '8500',
      amountMinor: '40000',
    },
  ],
  expenseRegister: [
    {
      date: '2026-08-12',
      worker: worker.worker.name,
      projectNumber: period.project.number,
      vendor: 'Synthetic Transit Vendor',
      category: 'travel',
      currency: 'USD',
      projectCurrency: 'USD',
      amountMinor: '8500',
      taxMinor: '0',
      grossMinor: '8500',
      projectCurrencyAmountMinor: '8500',
      billingAmountMinor: '8500',
    },
  ],
  totals: { currency: 'USD', revenueMinor: '80000', costMinor: '48500' },
  totalsByCurrency: [{ currency: 'USD', revenueMinor: '80000', costMinor: '48500' }],
};

const invoiceBase = {
  locale: 'en',
  legalEntity: { legalName: 'Synthetic Issuer LLC', billingAddress: 'Synthetic Address' },
  client: { legalName: 'Synthetic Client One', billingEmail: 'ap@example.invalid' },
  project: { number: period.project.number, name: period.project.name, poNumber: 'SYN-PO-1' },
  termsAndInstructions: {
    bankSwiftNumber: 'SYNTHETIC-SWIFT',
    bankAccountNumber: 'SYNTHETIC-ACCOUNT',
    bankName: 'Synthetic Test Bank',
    beneficiary: 'Synthetic Issuer LLC',
    pastDueNotice: 'Synthetic fixture; not payable.',
  },
  issueDate: '2026-09-01',
  dueDate: '2026-09-30',
};

writeFileSync(
  output + '/customer-report.pdf',
  periodReportPdf({ ...period, audience: 'customer' }),
);
writeFileSync(
  output + '/finance-report.pdf',
  periodReportPdf({
    ...period,
    audience: 'internal',
    commercialSummary: {
      currency: 'USD',
      actualMinutes: 480,
      approvedMinutes: 480,
      billableMinutes: 480,
      candidateSubtotalMinor: '80000',
      invoicedNetMinor: '80000',
      paidMinor: '20000',
      receivableMinor: '60000',
    },
    financialSummary: {
      currency: 'USD',
      approvedCostMinor: '48500',
      contributionMarginMinor: '31500',
      contributionMarginBps: 3938,
    },
  }),
);
writeFileSync(output + '/worker-report.pdf', workerStatementPdf(worker));
writeFileSync(
  output + '/invoice-labor.pdf',
  invoicePdf({
    ...invoiceBase,
    number: 'SYN-LAB-0001',
    template: { id: 'labor-detailed', version: 1 },
    calculation: { currency: 'USD', subtotalMinor: '80000', taxMinor: '0', totalMinor: '80000' },
    lines: [
      {
        description: 'Synthetic Worker A · commissioning validation',
        quantity_numerator: 8,
        quantity_denominator: 1,
        unit_price_minor: '10000',
        subtotal_minor: '80000',
      },
    ],
  }),
);
writeFileSync(
  output + '/invoice-expenses.pdf',
  invoicePdf({
    ...invoiceBase,
    number: 'SYN-EXP-0001',
    template: { id: 'expenses-detailed', version: 1 },
    calculation: { currency: 'USD', subtotalMinor: '8500', taxMinor: '0', totalMinor: '8500' },
    lines: [
      {
        description: 'Synthetic transit expense',
        vendor: 'Synthetic Transit Vendor',
        quantity: 1,
        unit_price_minor: '8500',
        subtotal_minor: '8500',
      },
    ],
  }),
);
writeFileSync(
  output + '/credit.pdf',
  invoicePdf({
    ...invoiceBase,
    number: 'SYN-CR-0001',
    template: { id: 'credit-adjustment', version: 1 },
    calculation: { currency: 'USD', subtotalMinor: '-1000', taxMinor: '0', totalMinor: '-1000' },
    originalInvoice: 'SYN-LAB-0001',
    reason: 'Synthetic correction reference',
    lines: [
      {
        description: 'Synthetic correction',
        original_invoice: 'SYN-LAB-0001',
        reason: 'Synthetic correction reference',
        subtotal_minor: '-1000',
      },
    ],
  }),
);

const packArtifacts = accountingPackArtifacts(pack);
for (const artifact of packArtifacts) {
  if (artifact.type === 'pdf') writeFileSync(output + '/accounting-pack.pdf', artifact.bytes);
  if (artifact.type === 'xlsx') writeFileSync(output + '/accounting-pack.xlsx', artifact.bytes);
  if (artifact.type === 'invoice_csv')
    writeFileSync(output + '/accounting-pack.csv', artifact.bytes);
}

// Preserve the full language/data-volume reader matrix required by the final
// handoff. These remain synthetic renderer artifacts: routed authorization and
// lifecycle are proved separately by integration and browser journeys.
const locales = ['en', 'es', 'pt'] as const;
const datasets = ['empty', 'ordinary', 'long'] as const;
const longText =
  'Synthetic commissioning record with accented text: verificación, proteção, segurança, rollback, interlock and documented operator handover. ';

for (const locale of locales) {
  for (const dataset of datasets) {
    const matrixDir = resolve(output, 'matrix', locale, dataset);
    mkdirSync(matrixDir, { recursive: true });
    const empty = dataset === 'empty';
    const long = dataset === 'long';
    const repetitions = long ? 36 : 1;
    const matrixPeriod = {
      ...period,
      locale,
      dailyReports: empty
        ? []
        : Array.from({ length: repetitions }, (_, index) => ({
            ...period.dailyReports[0],
            summary: long ? `${longText.repeat(4)} #${index + 1}` : period.dailyReports[0].summary,
          })),
      technicalReports: empty
        ? []
        : Array.from({ length: repetitions }, (_, index) => ({
            ...period.technicalReports[0],
            change_summary: long
              ? `${longText.repeat(4)} #${index + 1}`
              : period.technicalReports[0].change_summary,
          })),
      technicalChanges: [],
      timeSummary: empty
        ? []
        : Array.from({ length: repetitions }, (_, index) => ({
            ...period.timeSummary[0],
            activitySummary: long
              ? `${longText.repeat(3)} #${index + 1}`
              : period.timeSummary[0].activitySummary,
          })),
      sourceCounts: empty
        ? { dailyReports: 0, technicalReports: 0, technicalChanges: 0, timeEntries: 0 }
        : {
            dailyReports: repetitions,
            technicalReports: repetitions,
            technicalChanges: 0,
            timeEntries: repetitions,
          },
    };
    writeFileSync(
      resolve(matrixDir, 'customer-report.pdf'),
      periodReportPdf({ ...matrixPeriod, audience: 'customer' }),
    );
    writeFileSync(
      resolve(matrixDir, 'finance-report.pdf'),
      periodReportPdf({
        ...matrixPeriod,
        audience: 'internal',
        commercialSummary: {
          currency: 'USD',
          actualMinutes: empty ? 0 : 480 * repetitions,
          approvedMinutes: empty ? 0 : 480 * repetitions,
          billableMinutes: empty ? 0 : 480 * repetitions,
          candidateSubtotalMinor: empty ? '0' : String(80_000 * repetitions),
          invoicedNetMinor: empty ? '0' : String(80_000 * repetitions),
          paidMinor: empty ? '0' : '20000',
          receivableMinor: empty ? '0' : String(80_000 * repetitions - 20_000),
        },
        financialSummary: {
          currency: 'USD',
          approvedCostMinor: empty ? '0' : String(48_500 * repetitions),
          contributionMarginMinor: empty ? '0' : String(31_500 * repetitions),
          contributionMarginBps: empty ? 0 : 3938,
        },
      }),
    );

    const matrixWorker: WorkerStatementSnapshot = {
      ...worker,
      locale,
      approvedMinutes: empty ? 0 : 480 * repetitions,
      pendingMinutes: 0,
      estimatedApprovedMinor: empty ? '0' : String(32_000 * repetitions),
      estimatedPendingMinor: '0',
      approvedReimbursementMinor: empty ? '0' : String(8_500 * repetitions),
      activities: empty
        ? []
        : Array.from({ length: repetitions }, (_, index) => ({
            ...worker.activities[0],
            id: `synthetic-time-${index + 1}`,
            activitySummary: long
              ? `${longText.repeat(3)} #${index + 1}`
              : worker.activities[0].activitySummary,
          })),
      settlements: empty ? [] : worker.settlements,
      expenses: empty
        ? []
        : Array.from({ length: repetitions }, (_, index) => ({
            ...worker.expenses[0],
            id: `synthetic-expense-${index + 1}`,
            vendor: long ? `${longText} #${index + 1}` : worker.expenses[0].vendor,
          })),
    };
    writeFileSync(resolve(matrixDir, 'worker-report.pdf'), workerStatementPdf(matrixWorker));
    writeFileSync(resolve(matrixDir, 'worker-report.csv'), workerStatementCsv(matrixWorker));

    const lineCount = empty ? 0 : long ? 36 : 1;
    const laborLines = Array.from({ length: lineCount }, (_, index) => ({
      description: long
        ? `${longText.repeat(3)} worker ${index + 1}`
        : 'Synthetic Worker A · commissioning validation',
      quantity_numerator: 8,
      quantity_denominator: 1,
      unit_price_minor: '10000',
      subtotal_minor: '80000',
    }));
    const expenseLines = Array.from({ length: lineCount }, (_, index) => ({
      description: long
        ? `${longText.repeat(3)} expense ${index + 1}`
        : 'Synthetic transit expense',
      vendor: long ? `Synthetic Transit Vendor ${index + 1}` : 'Synthetic Transit Vendor',
      quantity: 1,
      unit_price_minor: '8500',
      subtotal_minor: '8500',
    }));
    const creditLines = Array.from({ length: lineCount }, (_, index) => ({
      description: long ? `${longText.repeat(3)} credit ${index + 1}` : 'Synthetic correction',
      original_invoice: 'SYN-LAB-0001',
      reason: 'Synthetic correction reference',
      subtotal_minor: '-1000',
    }));
    const localizedInvoiceBase = { ...invoiceBase, locale };
    writeFileSync(
      resolve(matrixDir, 'invoice-labor.pdf'),
      invoicePdf({
        ...localizedInvoiceBase,
        number: 'SYN-LAB-0001',
        template: { id: 'labor-detailed', version: 1 },
        calculation: {
          currency: 'USD',
          subtotalMinor: String(80_000 * lineCount),
          taxMinor: '0',
          totalMinor: String(80_000 * lineCount),
        },
        lines: laborLines,
      }),
    );
    writeFileSync(
      resolve(matrixDir, 'invoice-expenses.pdf'),
      invoicePdf({
        ...localizedInvoiceBase,
        number: 'SYN-EXP-0001',
        template: { id: 'expenses-detailed', version: 1 },
        calculation: {
          currency: 'USD',
          subtotalMinor: String(8_500 * lineCount),
          taxMinor: '0',
          totalMinor: String(8_500 * lineCount),
        },
        lines: expenseLines,
      }),
    );
    writeFileSync(
      resolve(matrixDir, 'credit.pdf'),
      invoicePdf({
        ...localizedInvoiceBase,
        number: 'SYN-CR-0001',
        template: { id: 'credit-adjustment', version: 1 },
        calculation: {
          currency: 'USD',
          subtotalMinor: String(-1_000 * lineCount),
          taxMinor: '0',
          totalMinor: String(-1_000 * lineCount),
        },
        originalInvoice: 'SYN-LAB-0001',
        reason: 'Synthetic correction reference',
        lines: creditLines,
      }),
    );

    const matrixPack: AccountingPackSourceSnapshot = {
      ...pack,
      locale,
      invoiceRegister: empty
        ? []
        : Array.from({ length: repetitions }, () => pack.invoiceRegister[0]),
      collections: empty ? [] : Array.from({ length: repetitions }, () => pack.collections[0]),
      workerCosts: empty ? [] : Array.from({ length: repetitions }, () => pack.workerCosts[0]),
      expenseRegister: empty
        ? []
        : Array.from({ length: repetitions }, () => pack.expenseRegister[0]),
      totals: empty
        ? { currency: 'USD', revenueMinor: '0', costMinor: '0' }
        : {
            currency: 'USD',
            revenueMinor: String(80_000 * repetitions),
            costMinor: String(48_500 * repetitions),
          },
      totalsByCurrency: empty
        ? [{ currency: 'USD', revenueMinor: '0', costMinor: '0' }]
        : [
            {
              currency: 'USD',
              revenueMinor: String(80_000 * repetitions),
              costMinor: String(48_500 * repetitions),
            },
          ],
    };
    for (const artifact of renderAccountingPackArtifacts(matrixPack)) {
      if (artifact.status !== 'ready' || !artifact.bytes)
        throw new Error(
          `Synthetic Accounting Pack matrix failed: ${locale}/${dataset}/${artifact.type}`,
        );
      writeFileSync(
        resolve(matrixDir, `accounting-pack-${artifact.type}.${artifact.extension}`),
        artifact.bytes,
      );
    }
    writeFileSync(
      resolve(matrixDir, 'project-finance.xlsx'),
      projectFinanceXlsx({
        project: {
          project_number: period.project.number,
          project_name: long ? longText.repeat(3) : period.project.name,
          client_name: period.project.clientName,
          currency: 'USD',
          period_start: period.periodStart,
          period_end: period.periodEnd,
        },
        financial: {
          currency: 'USD',
          laborRevenueMinor: empty ? '0' : String(80_000 * repetitions),
          approvedCostMinor: empty ? '0' : String(48_500 * repetitions),
          contributionMarginMinor: empty ? '0' : String(31_500 * repetitions),
          contributionMarginBps: empty ? '0' : '3938',
          actualMinutes: empty ? 0 : 480 * repetitions,
          approvedMinutes: empty ? 0 : 480 * repetitions,
          billableMinutes: empty ? 0 : 480 * repetitions,
        },
        timeEconomics: empty
          ? []
          : Array.from({ length: repetitions }, (_, index) => ({
              workerName: `Synthetic Worker ${index + 1}`,
              workDate: '2026-08-12',
              category: 'regular',
              actualMinutes: 480,
              clientBillableMinutes: 480,
              clientRevenueMinor: '80000',
              internalCostMinor: '40000',
              workerCompensationMinor: '32000',
              approvalState: 'approved',
            })),
        expenseEconomics: empty
          ? []
          : Array.from({ length: repetitions }, (_, index) => ({
              workerName: `Synthetic Worker ${index + 1}`,
              spentOn: '2026-08-12',
              category: 'travel',
              paidBy: 'worker',
              treatment: 'reimbursable',
              costMinor: '8500',
              revenueMinor: '8500',
              approvalState: 'approved',
              financeApprovalState: 'approved',
              financeProjectionState: 'ready',
            })),
        invoices: empty ? [] : matrixPack.invoiceRegister,
        locale,
      }),
    );
  }
}

console.log(`Synthetic canonical artifact source generated at ${output}`);
