import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  REPORT_TEMPLATE_VERSION,
  accountingPackArtifacts,
  invoicePdf,
  periodReportPdf,
} from '@ja/reporting';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const pageCount = (bytes: Uint8Array): number =>
  Buffer.from(bytes).toString('latin1').split('/Type /Page').length - 1;

describe('production reporting artifacts', () => {
  it('renders long immutable invoice snapshots as multipage PDFs with traceable template output', () => {
    const pdf = invoicePdf({
      number: 'JA-INV-000001',
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
    expect(REPORT_TEMPLATE_VERSION).toBe('2026.08.19.1');
  });

  it('keeps period and Accounting Pack generation on the same renderer contract', () => {
    const periodPdf = periodReportPdf({
      project: { number: 'C-0001-P-001', name: 'Commissioning', clientName: 'Client' },
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      audience: 'internal',
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
});
