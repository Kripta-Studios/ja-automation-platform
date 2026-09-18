import { describe, expect, it } from 'vitest';
import { translate } from '../apps/portal/src/lib/i18n/catalog';
import {
  collectionAging,
  collectionMatches,
  collectionSummaries,
} from '../apps/portal/src/lib/portal/collections-analysis';

const date = '2026-09-18';
const row = {
  projectId: 'project-1',
  clientNumber: 'C-001',
  clientName: 'Fábrica Norte',
  projectNumber: 'P-001',
  projectName: 'PLC upgrade',
  invoiceNumber: 'INV-001',
  poNumber: 'PO-ALPHA',
  currency: 'EUR',
  paymentStatus: 'partially_paid',
  outstandingMinor: '7500',
  collectedMinor: '2500',
  dueDate: '2026-08-19',
};

describe('Receivable aging and shared register/export filters', () => {
  it('registers the new management labels in the actual runtime catalog', () => {
    expect(translate('es', 'Receivable aging')).toBe('Antigüedad de saldos pendientes');
    expect(translate('pt', 'Receivable aging')).toBe('Antiguidade dos saldos a receber');
    expect(translate('es', 'Required receipt missing')).toBe('Falta el justificante obligatorio');
    expect(translate('pt', 'Required receipt missing')).toBe('Falta o comprovante obrigatório');
  });
  it.each([
    ['2026-09-19', 'current', 0],
    ['2026-09-18', 'current', 0],
    ['2026-09-17', '1_30', 1],
    ['2026-08-19', '1_30', 30],
    ['2026-08-18', '31_60', 31],
    ['2026-07-20', '31_60', 60],
    ['2026-07-19', '61_90', 61],
    ['2026-06-20', '61_90', 90],
    ['2026-06-19', 'over_90', 91],
    ['', 'undated', null],
    ['2026-02-30', 'undated', null],
  ])('classifies calendar due date %s without timezone shifts', (dueDate, bucket, days) => {
    expect(collectionAging({ ...row, dueDate }, date)).toEqual({
      agingBucket: bucket,
      daysOverdue: days,
      balanceAsOf: date,
    });
  });

  it('uses the due calendar day and includes overdue partial payments independently of stored status', () => {
    expect(
      collectionAging({ ...row, dueDate: '2026-09-17T23:59:59-05:00' }, date).daysOverdue,
    ).toBe(1);
    expect(collectionMatches(row, { status: 'overdue' }, date)).toBe(true);
    expect(collectionMatches(row, { status: 'collected' }, date)).toBe(true);
    expect(collectionMatches(row, { status: 'outstanding', aging: '1_30' }, date)).toBe(true);
    expect(collectionMatches({ ...row, outstandingMinor: '0' }, { status: 'overdue' }, date)).toBe(
      false,
    );
  });

  it('searches names, numbers and purchase references and combines all filters', () => {
    for (const query of ['fabrica', 'PLC', 'C-001', 'P-001', 'PO-ALPHA'])
      expect(
        collectionMatches(
          row,
          { query, project: 'project-1', currency: 'EUR', aging: '1_30' },
          date,
        ),
      ).toBe(true);
    expect(collectionMatches(row, { project: 'other' }, date)).toBe(false);
    expect(collectionMatches(row, { currency: 'USD' }, date)).toBe(false);
    expect(collectionMatches(row, { aging: 'undated' }, date)).toBe(false);
  });

  it('keeps gross receivables, credits and net balances exact and separate by currency', () => {
    const huge = '900719925474099312345';
    const summaries = collectionSummaries(
      [
        row,
        { ...row, outstandingMinor: huge },
        { ...row, currency: 'USD', dueDate: '', outstandingMinor: '1200' },
        { ...row, outstandingMinor: '300', dueDate: '2099-01-01' },
        { ...row, paymentStatus: 'void', outstandingMinor: '9000' },
        { ...row, paymentStatus: 'credited', outstandingMinor: '0' },
        { ...row, outstandingMinor: '-9000' },
      ],
      date,
    );
    expect(summaries[0]).toMatchObject({
      currency: 'EUR',
      outstanding: BigInt(huge) + 7800n,
      credits: -9000n,
      netOutstanding: BigInt(huge) - 1200n,
      overdue: BigInt(huge) + 7500n,
    });
    expect(summaries[0]!.buckets.current).toBe(300n);
    expect(summaries[1]).toMatchObject({ currency: 'USD', outstanding: 1200n, overdue: 0n });
    expect(summaries[1]!.buckets.undated).toBe(1200n);
    for (const summary of summaries)
      expect(Object.values(summary.buckets).reduce((a, b) => a + b, 0n)).toBe(
        summary.netOutstanding,
      );
  });

  it.each([
    ['-2500', 'partially_paid', 7500n],
    ['-10000', 'credited', 0n],
  ])('reconciles an original invoice and separate %s credit', (credit, state, net) => {
    const original = { ...row, paymentStatus: state, outstandingMinor: '10000' };
    const adjustment = { ...row, paymentStatus: 'paid', outstandingMinor: credit };
    expect(collectionSummaries([original, adjustment], date)[0]).toMatchObject({
      outstanding: 10000n,
      credits: BigInt(credit),
      netOutstanding: net,
    });
    expect(collectionAging(adjustment, date).agingBucket).toBe('credit');
    expect(collectionMatches(adjustment, { status: 'outstanding' }, date)).toBe(true);
    expect(collectionMatches(adjustment, { status: 'overdue' }, date)).toBe(false);
    expect(
      collectionSummaries([original, { ...adjustment, paymentStatus: 'void' }], date)[0],
    ).toMatchObject({ credits: 0n, netOutstanding: 10000n });
  });

  it('fails visibly on malformed financial values and reference dates', () => {
    expect(() => collectionAging(row, '2026-02-30')).toThrow('Invalid ledger reference date');
    expect(() => collectionSummaries([{ ...row, outstandingMinor: '1.25' }], date)).toThrow(
      'Invalid ledger amount',
    );
  });
});
