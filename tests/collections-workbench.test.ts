import { describe, expect, it } from 'vitest';
import {
  collectionForecast,
  collectionPriorities,
  customerBalances,
} from '../apps/portal/src/lib/portal/collections-workbench';
import {
  collectionMatches,
  collectionSummaries,
} from '../apps/portal/src/lib/portal/collections-analysis';
import { collectionsWorkbenchCsv } from '../apps/portal/src/lib/server/collections-workbench-export';
import { translate } from '../apps/portal/src/lib/i18n/catalog';

const asOf = '2026-09-18';
const row = {
  invoiceId: 'i-1',
  invoiceNumber: 'INV-1',
  clientId: 'c-1',
  clientName: 'Customer',
  clientNumber: 'C-1',
  projectName: 'Project',
  currency: 'EUR',
  outstandingMinor: '7500',
  collectedMinor: '2500',
  paymentStatus: 'partially_paid',
  dueDate: '2026-08-01',
};

describe('Collection planning from canonical remaining balances', () => {
  it('groups stable customer identities, separates currencies, keeps credits and reconciles to the ledger', () => {
    const rows = [
      row,
      { ...row, invoiceId: 'i-2', projectName: 'Other project', outstandingMinor: '-1000' },
      { ...row, clientId: 'c-2', currency: 'USD' },
      { ...row, clientId: 'c-3' },
      { ...row, paymentStatus: 'void', outstandingMinor: '999999' },
      { ...row, outstandingMinor: '0' },
    ];
    const customers = customerBalances(rows, asOf);
    expect(customers).toHaveLength(3);
    expect(customers.find((item) => item.clientId === 'c-1')).toMatchObject({
      outstanding: 7500n,
      credits: -1000n,
      netOutstanding: 6500n,
      openDocuments: 2,
      oldestDaysOverdue: 48,
    });
    for (const summary of collectionSummaries(rows, asOf))
      expect(
        customers
          .filter((item) => item.currency === summary.currency)
          .reduce((sum, item) => sum + item.netOutstanding, 0n),
      ).toBe(summary.netOutstanding);
    expect(collectionMatches(row, { client: 'c-1' }, asOf)).toBe(true);
    expect(collectionMatches(row, { client: 'c-2' }, asOf)).toBe(false);
  });

  it('partitions all forecast boundaries exactly, without pulling past or missing dates into future cash', () => {
    const days = [-1, 0, 7, 8, 30, 31, 60, 61, 90, 91];
    const rows = days.map((day) => ({
      ...row,
      dueDate: '',
      expectedCollectionDate: new Date(Date.parse(`${asOf}T00:00:00Z`) + day * 86400000)
        .toISOString()
        .slice(0, 10),
      outstandingMinor: '100',
    }));
    rows.push({
      ...row,
      dueDate: '2026-02-30',
      expectedCollectionDate: '',
      outstandingMinor: '300',
    });
    const result = collectionForecast(rows, asOf)[0]!;
    expect(result.buckets).toEqual({
      past: 100n,
      next_7: 200n,
      next_30: 200n,
      next_60: 200n,
      next_90: 200n,
      later: 100n,
      undated: 300n,
    });
    expect(result.total).toBe(1300n);
    expect(result.explicit).toBe(1000n);
    expect(Object.values(result.buckets).reduce((a, b) => a + b, 0n)).toBe(result.total);
  });

  it('uses expected dates ahead of due dates, preserves huge exact values and excludes credits/void/paid', () => {
    const huge = '900719925474099312345';
    const result = collectionForecast(
      [
        { ...row, outstandingMinor: huge, expectedCollectionDate: '2026-09-20' },
        { ...row, dueDate: '2026-09-25', expectedCollectionDate: 'invalid' },
        { ...row, outstandingMinor: '-500' },
        { ...row, outstandingMinor: '0' },
        { ...row, paymentStatus: 'void' },
        { ...row, currency: 'USD' },
      ],
      asOf,
    );
    expect(result[0]).toMatchObject({
      currency: 'EUR',
      total: BigInt(huge) + 7500n,
      explicit: BigInt(huge),
      dueFallback: 7500n,
    });
    expect(result[0]!.buckets.next_7).toBe(BigInt(huge) + 7500n);
    expect(result[1]!.buckets.past).toBe(7500n);
    expect(() => collectionForecast([], 'invalid')).toThrow();
  });

  it('prioritizes overdue partial payments, stale collection dates and missing maturity without contacting anyone', () => {
    const result = collectionPriorities(
      [
        row,
        { ...row, invoiceId: 'missing', dueDate: '' },
        { ...row, invoiceId: 'stale', dueDate: '2099-01-01', expectedCollectionDate: '2026-09-17' },
        { ...row, dueDate: '2099-01-01' },
        { ...row, outstandingMinor: '-1000' },
        { ...row, paymentStatus: 'void' },
      ],
      asOf,
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      invoiceId: 'i-1',
      reason: 'Overdue invoice',
      daysOverdue: 48,
    });
    expect(result.map((item) => item.reason)).toContain('No due date');
    expect(result.map((item) => item.reason)).toContain('Collection date passed');
  });

  it('exports the same exact summaries, neutralizes formula text and retains empty report headers', () => {
    const csv = new TextDecoder().decode(
      collectionsWorkbenchCsv([{ ...row, clientName: '=HYPERLINK("evil")' }], asOf, 'customers'),
    );
    expect(csv).toContain('grossReceivablesMinor');
    expect(csv).toContain('7500');
    expect(csv).toContain("'=HYPERLINK");
    for (const report of ['customers', 'forecast', 'priorities'] as const) {
      expect(new TextDecoder().decode(collectionsWorkbenchCsv([], asOf, report))).toContain(
        'balanceAsOf',
      );
    }
    expect(translate('es', 'Customer balances')).toBe('Saldos por cliente');
    expect(translate('pt', 'Collection forecast')).toBe('Previsão de recebimentos');
    expect(translate('es', 'Pagination')).toBe('Paginación');
    expect(translate('pt', 'Pagination')).toBe('Paginação');
    expect(translate('es', 'Records')).toBe('Registros');
  });
});
