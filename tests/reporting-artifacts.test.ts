import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPORT_TEMPLATE_VERSION,
  REPORT_LOCALES,
  accountingPackArtifacts,
  invoicePdf,
  periodReportPdf,
} from '@ja/reporting';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const pageCount = (bytes: Uint8Array): number =>
  Buffer.from(bytes).toString('latin1').split('/Type /Page').length - 1;
const textFromPdf = (bytes: Uint8Array): string => {
  const directory = mkdtempSync(join(tmpdir(), 'ja-reporting-privacy-'));
  const input = join(directory, 'report.pdf');
  try {
    writeFileSync(input, bytes);
    return execFileSync('pdftotext', ['-layout', input, '-'], { encoding: 'utf8' })
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('production reporting artifacts', () => {
  it('renders long immutable invoice snapshots as multipage PDFs with traceable template output', () => {
    const pdf = invoicePdf({
      number: 'JA-INV-000001',
      locale: 'es',
      legalEntity: { legal_name: 'J&A Automation', billing_address: 'Configured address' },
      client: { legalName: 'Northline Mobility', billingEmail: 'ap@example.com' },
      calculation: {
        currency: 'EUR',
        subtotalMinor: '123456',
        taxMinor: '24691',
        totalMinor: '148147',
      },
      lines: Array.from({ length: 90 }, (_, index) => ({
        description:
          `Linha ${index + 1} · Línea ${index + 1} · Long commissioning description `.repeat(3),
        subtotal_minor: String((index + 1) * 137),
      })),
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(sha256(pdf)).toMatch(/^[a-f0-9]{64}$/);
    expect(REPORT_TEMPLATE_VERSION).toBe('2026.08.23.1');
  });

  it('keeps period and Accounting Pack generation on the same renderer contract', () => {
    const periodPdf = periodReportPdf({
      project: { number: 'C-0001-P-001', name: 'Commissioning', clientName: 'Client' },
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      audience: 'internal',
      locale: 'pt',
      dailyReports: Array.from({ length: 24 }, (_, index) => ({
        work_date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        summary: 'Validated sequence, safety interlocks and rollback evidence.'.repeat(4),
      })),
    });
    expect(pageCount(periodPdf)).toBeGreaterThan(1);

    const artifacts = accountingPackArtifacts({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      invoiceRegister: [{ invoiceNumber: 'JA-INV-000001', totalMinor: '148147' }],
      collections: [{ invoiceNumber: 'JA-INV-000001', amountMinor: '148147' }],
      workerCosts: [{ workerId: 'worker-1', compensationMinor: '55000' }],
      expenseRegister: [{ category: 'hotel', amountMinor: '12000' }],
      totals: { revenueMinor: '148147', costMinor: '67000' },
      totalsByCurrency: [{ currency: 'EUR', revenueMinor: '148147' }],
    });
    expect(artifacts.map((artifact) => artifact.type)).toEqual([
      'pdf',
      'xlsx',
      'invoice_csv',
      'expense_csv',
      'json',
    ]);
    for (const artifact of artifacts) {
      expect(artifact.bytes.byteLength).toBeGreaterThan(0);
      expect(sha256(artifact.bytes)).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('omits commercial calculation and money sections from customer period PDFs while retaining operational records', () => {
    const pdf = periodReportPdf({
      project: { number: 'C-0001-P-001', name: 'Commissioning', clientName: 'Client' },
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      audience: 'customer',
      locale: 'en',
      commercialSummary: {
        currency: 'USD',
        actualMinutes: 600,
        approvedMinutes: 540,
        billableMinutes: 480,
        candidateSubtotalMinor: '123456',
      },
      commercialCalculation: [
        {
          type: 'labor',
          basis: 'SECRET COMMERCIAL BASIS',
          minutes: 480,
          amountMinor: '123456',
        },
      ],
      financialSummary: {
        currency: 'USD',
        approvedCostMinor: '50000',
        contributionMarginMinor: '73456',
      },
      dailyReports: [
        {
          work_date: '2026-08-12',
          summary: 'Customer-visible operational activity retained',
          approval_state: 'approved',
        },
      ],
      technicalReports: [
        {
          report_date: '2026-08-13',
          change_summary: 'PLC validation record retained',
          approval_state: 'approved',
        },
      ],
      technicalChanges: [
        {
          created_at: '2026-08-14T00:00:00.000Z',
          change_made: 'Operational change reference retained',
          approval_state: 'approved',
        },
      ],
      sourceCounts: {
        dailyReports: 1,
        technicalReports: 1,
        technicalChanges: 1,
        timeEntries: 1,
      },
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const text = textFromPdf(pdf);
    expect(text).toContain('Customer-visible operational activity retained');
    expect(text).toContain('PLC validation record retained');
    expect(text).toContain('Operational change reference retained');
    expect(text).toContain('daily 1');
    expect(text).toContain('technical 1');
    expect(text).toContain('changes 1');
    expect(text).toContain('time 1');
    expect(text).not.toContain('SECRET COMMERCIAL BASIS');
    expect(text).not.toContain('Calculation basis');
    expect(text).not.toContain('1,234.56');
    expect(text).not.toContain('Calculated bill candidate');
  });

  it('supports the selectable English, Brazilian Portuguese and Spanish report locales', () => {
    expect(REPORT_LOCALES).toEqual(['en', 'pt', 'es']);
    for (const locale of REPORT_LOCALES) {
      const pdf = invoicePdf({
        number: `JA-${locale}`,
        locale,
        calculation: {
          currency: 'BRL',
          subtotalMinor: '12345',
          taxMinor: '0',
          totalMinor: '12345',
        },
        lines: [{ description: 'Commissioning', subtotal_minor: '12345' }],
      });
      expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.byteLength).toBeGreaterThan(0);
    }
  });
});
