import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accountingPackPdf,
  dailyReportPdf,
  invoicePdf,
  normalizeReportLocale,
  periodReportPdf,
  technicalReportPdf,
  translateCalculationBasis,
  translateReportMetric,
} from '@ja/reporting';

type Locale = 'en' | 'es' | 'pt-BR';

const locales: readonly Locale[] = ['en', 'es', 'pt-BR'];
const textFromPdf = (bytes: Uint8Array): string => {
  const directory = mkdtempSync(join(tmpdir(), 'ja-reporting-i18n-'));
  const input = join(directory, 'report.pdf');
  try {
    writeFileSync(input, bytes);
    return execFileSync('pdftotext', ['-layout', input, '-'], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const expectPdf = (bytes: Uint8Array): string => {
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(500);
  return textFromPdf(bytes).replace(/\s+/g, ' ').trim();
};

const containsPdfCopy = (text: string, expected: string): boolean =>
  text
    .replace(/\s/g, '')
    .toLocaleLowerCase()
    .includes(expected.replace(/\s/g, '').toLocaleLowerCase());

const pageCount = (bytes: Uint8Array): number =>
  Buffer.from(bytes)
    .toString('latin1')
    .match(/\/Type \/Page\b/g)?.length ?? 0;

const titles = {
  invoice: {
    en: 'Labor Detailed Invoice',
    es: 'Factura Detallada de Mano de Obra',
    'pt-BR': 'Fatura Detalhada de Mão de Obra',
  },
  period: {
    en: 'Project Period Report',
    es: 'Informe Periódico del Proyecto',
    'pt-BR': 'Relatório Periódico do Projeto',
  },
  pack: { en: 'Accounting Pack', es: 'Paquete Contable', 'pt-BR': 'Pacote Contábil' },
  daily: { en: 'Daily report', es: 'Informe diario', 'pt-BR': 'Relatório diário' },
  technical: { en: 'Technical report', es: 'Informe técnico', 'pt-BR': 'Relatório técnico' },
} as const;

const packMetricLabels = {
  en: [
    'Labor invoiced',
    'Expense invoiced',
    'Milestone / other invoiced',
    'Total invoiced',
    'Tax invoiced',
    'Gross invoiced',
    'Collected',
    'Outstanding',
    'Worker compensation',
    'Internal labor cost',
    'Travel cost',
    'Other direct cost',
    'Contribution',
    'Direct cost',
    'Currency',
  ],
  es: [
    'Mano de obra facturada',
    'Gastos facturados',
    'Hitos / otros facturados',
    'Total facturado',
    'Impuestos facturados',
    'Total bruto facturado',
    'Cobrado',
    'Pendiente',
    'Compensación del trabajador',
    'Coste interno de mano de obra',
    'Coste de viajes',
    'Otro coste directo',
    'Contribución',
    'Coste directo',
    'Moneda',
  ],
  'pt-BR': [
    'Mão de obra faturada',
    'Despesas faturadas',
    'Marcos / outros faturados',
    'Total faturado',
    'Impostos faturados',
    'Total bruto faturado',
    'Recebido',
    'Em aberto',
    'Remuneração do trabalhador',
    'Custo interno de mão de obra',
    'Custo de viagem',
    'Outro custo direto',
    'Contribuição',
    'Custo direto',
    'Moeda',
  ],
} as const;

const englishControlledResidue = [
  'Labor Detailed Invoice',
  'Invoice detail',
  'Bill to',
  'Accounting Pack',
  'Totals by currency',
  'Project Period Report',
  'Calculation basis',
  'Daily report',
  'Technical report',
  'Template',
  'Safety-related',
  'System type',
  'PLC platform',
];

const invoiceSnapshot = (locale: Locale) => ({
  number: `JA-I18N-${locale}`,
  locale,
  legalEntity: { legal_name: 'J&A Automation', billing_address: 'Configured address' },
  client: { legalName: 'Northline Mobility', billingEmail: 'ap@example.com' },
  calculation: {
    currency: 'EUR',
    subtotalMinor: '123456',
    taxMinor: '24691',
    totalMinor: '148147',
  },
  lines: [
    {
      description: 'Startup support, sensor timing investigation and customer handover notes',
      subtotal_minor: '123456',
    },
  ],
});

const periodSnapshot = (locale: Locale) => ({
  project: { number: 'C-0001-P-001', name: 'Commissioning', clientName: 'Northline Mobility' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  audience: 'internal',
  locale,
  commercialSummary: {
    currency: 'EUR',
    actualMinutes: 600,
    approvedMinutes: 540,
    billableMinutes: 480,
    candidateSubtotalMinor: '123456',
    operationalRevenueCandidateMinor: '123456',
    invoicedNetMinor: '0',
    paidMinor: '0',
    receivableMinor: '123456',
    sourceCounts: {
      dailyReports: 1,
      technicalReports: 1,
      technicalChanges: 1,
      timeEntries: 1,
      expenses: 1,
    },
  },
  financialSummary: {
    currency: 'EUR',
    approvedCostMinor: '50000',
    contributionMarginMinor: '73456',
    contributionMarginBps: 5950,
  },
  commercialCalculation: [
    {
      type: 'labor',
      basis: 'approved_billable_minutes_effective_client_labor_rates',
      minutes: 480,
      amountMinor: '123456',
    },
  ],
  dailyReports: [
    {
      work_date: '2026-08-01',
      summary: 'Startup support, sensor timing investigation and customer handover notes',
      approval_state: 'approved',
    },
  ],
  technicalReports: [
    {
      created_at: '2026-08-02',
      change_summary: 'Validated PLC sequence and HMI alarms',
      approval_state: 'submitted',
    },
  ],
  technicalChanges: [
    {
      created_at: '2026-08-03',
      change_made: 'Adjusted sensor timing',
      approval_state: 'needs_changes',
    },
  ],
});

const packSnapshot = (locale: Locale) => ({
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  locale,
  currency: 'EUR',
  invoiceRegister: [],
  collections: [],
  workerCosts: [],
  expenseRegister: [],
  totals: {
    laborInvoicedMinor: '101000',
    expenseInvoicedMinor: '12000',
    milestoneOtherInvoicedMinor: '5000',
    totalInvoicedMinor: '118000',
    taxInvoicedMinor: '23600',
    grossInvoicedMinor: '141600',
    collectedMinor: '100000',
    outstandingMinor: '41600',
    workerCompensationMinor: '45000',
    internalLaborCostMinor: '52000',
    travelCostMinor: '7000',
    otherDirectCostMinor: '3000',
    contributionMinor: '56000',
    directCostMinor: '52000',
    currency: 'EUR',
  },
  totalsByCurrency: [{ currency: 'EUR', totalInvoicedMinor: '118000', collectedMinor: '100000' }],
});

const dailySnapshot = (locale: Locale) => ({
  id: 'daily-1',
  locale,
  project: { number: 'C-0001-P-001', name: 'Commissioning' },
  date: '2026-08-01',
  worker: 'Antonny Luty',
  summary: 'Startup support, sensor timing investigation and customer handover notes',
  safetyRelated: true,
  approvalState: 'approved',
});

const technicalSnapshot = (locale: Locale) => ({
  id: 'technical-1',
  locale,
  project: { number: 'C-0001-P-001', name: 'Commissioning' },
  date: '2026-08-02',
  systemName: 'Line 4 PLC',
  plantSite: 'Northline plant',
  areaLine: 'Assembly / Line 4',
  stationMachine: 'Station 12',
  systemType: 'PLC',
  plcPlatform: 'Rockwell Automation',
  controller: 'ControlLogix',
  hmiScada: 'FactoryTalk View',
  networkProtocol: 'EtherNet/IP',
  softwareVersion: 'v3.7.2',
  programReference: 'PLC-L4-2026',
  changeSummary: 'Startup support, sensor timing investigation and customer handover notes',
  safetyRelated: false,
  productionImpact: 'No production interruption',
  validation: 'FAT',
  validationResult: 'Passed',
  openRisk: 'None',
  rollbackPlan: 'Restore PLC backup',
  approvalState: 'approved',
  technicalChanges: [
    {
      date: '2026-08-03',
      component: 'Sensor timing',
      detail: 'Adjusted sequence observation',
      approvalState: 'approved',
    },
  ],
});

describe('localized report PDF renderers', () => {
  it('normalizes full locale aliases while retaining the internal pt code', () => {
    expect(normalizeReportLocale('en-US')).toBe('en');
    expect(normalizeReportLocale('es-ES')).toBe('es');
    expect(normalizeReportLocale('pt-BR')).toBe('pt');
    expect(
      translateCalculationBasis('approved_billable_minutes_effective_client_labor_rates', 'pt-BR'),
    ).toContain('Minutos faturáveis');
    expect(translateReportMetric('candidateSubtotalMinor', 'pt-BR')).toBe(
      'Candidato de faturamento calculado',
    );
  });

  it('uses the ES thousands separator for four-digit money values', () => {
    const text = expectPdf(
      invoicePdf({
        ...invoiceSnapshot('es'),
        calculation: {
          currency: 'EUR',
          subtotalMinor: '101000',
          taxMinor: '0',
          totalMinor: '101000',
        },
        lines: [{ description: 'Four digit separator validation', subtotal_minor: '101000' }],
      }),
    );
    expect(containsPdfCopy(text, '1.010,00 €')).toBe(true);
  });

  it.each(locales)('renders invoice, period and Accounting Pack PDFs in %s', (locale) => {
    const invoiceText = expectPdf(invoicePdf(invoiceSnapshot(locale)));
    const periodText = expectPdf(periodReportPdf(periodSnapshot(locale)));
    const packText = expectPdf(accountingPackPdf(packSnapshot(locale)));
    const invoiceTitle = titles.invoice[locale];
    expect(containsPdfCopy(invoiceText, invoiceTitle.split(' ')[0])).toBe(true);
    expect(containsPdfCopy(invoiceText, invoiceTitle.split(' ').at(-1) ?? invoiceTitle)).toBe(true);
    const periodTitle = titles.period[locale];
    expect(containsPdfCopy(periodText, periodTitle.split(' ')[0])).toBe(true);
    expect(containsPdfCopy(periodText, periodTitle.split(' ').at(-1) ?? periodTitle)).toBe(true);
    expect(containsPdfCopy(packText, titles.pack[locale])).toBe(true);
    for (const label of packMetricLabels[locale])
      expect(containsPdfCopy(packText, label)).toBe(true);
    expect(containsPdfCopy(invoiceText, 'Startup support, sensor timing investigation')).toBe(true);
    expect(containsPdfCopy(periodText, 'Startup support, sensor timing investigation')).toBe(true);
    expect(containsPdfCopy(periodText, 'handover notes')).toBe(true);
    for (const text of [invoiceText, periodText, packText]) {
      if (locale !== 'en')
        for (const residue of englishControlledResidue)
          expect(containsPdfCopy(text, residue)).toBe(false);
    }
  });

  it('renders repeated identical snapshots to byte-identical PDF artifacts', () => {
    const first = invoicePdf(invoiceSnapshot('es'));
    const second = invoicePdf(invoiceSnapshot('es'));
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    expect(hash(first)).toBe(hash(second));
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('keeps very large exact-money totals readable and present in the PDF text', () => {
    const hugeMinorUnits = '9'.repeat(54);
    const text = expectPdf(
      invoicePdf({
        ...invoiceSnapshot('es'),
        calculation: {
          currency: 'EUR',
          subtotalMinor: hugeMinorUnits,
          taxMinor: '0',
          totalMinor: hugeMinorUnits,
        },
        lines: [{ description: 'Large exact-money validation', subtotal_minor: hugeMinorUnits }],
      }),
    );
    expect(containsPdfCopy(text, 'Total')).toBe(true);
    expect(text.replace(/[^0-9]/g, '')).toContain(hugeMinorUnits);
  });

  it('does not create an orphan technical-changes heading when there are no changes', () => {
    const pdf = technicalReportPdf({ ...technicalSnapshot('es'), technicalChanges: [] });
    expect(pageCount(pdf)).toBeGreaterThan(0);
    expect(containsPdfCopy(expectPdf(pdf), 'Cambios técnicos')).toBe(false);
  });

  it.each(locales)('renders Daily Field Report and PLC / Technical Report PDFs in %s', (locale) => {
    const dailyText = expectPdf(dailyReportPdf(dailySnapshot(locale)));
    const technicalText = expectPdf(technicalReportPdf(technicalSnapshot(locale)));
    expect(containsPdfCopy(dailyText, titles.daily[locale])).toBe(true);
    expect(containsPdfCopy(technicalText, titles.technical[locale])).toBe(true);
    expect(
      containsPdfCopy(
        dailyText,
        'Startup support, sensor timing investigation and customer handover notes',
      ),
    ).toBe(true);
    expect(containsPdfCopy(technicalText, 'Rockwell Automation')).toBe(true);
    expect(containsPdfCopy(technicalText, 'EtherNet/IP')).toBe(true);
    if (locale !== 'en') {
      for (const residue of englishControlledResidue) {
        expect(containsPdfCopy(dailyText, residue)).toBe(false);
        expect(containsPdfCopy(technicalText, residue)).toBe(false);
      }
    }
  });
});
