import { describe, expect, it } from 'vitest';
import { buildMoneyOverview } from '../../apps/portal/src/lib/server/money-overview';

/** Audit round 2 (NEW-1, NEW-4): Money explains a negative "Invoiced" and a margin without revenue. */
describe('Money overview: credit notes and billing decisions', () => {
  const project = {
    projectId: 'p1',
    projectNumber: 'P-1',
    projectName: 'BBS Mexico',
    clientName: 'IMPC',
    currency: 'USD',
    directLaborCostMinor: '219750',
    expenseCostMinor: '0',
    revenueCandidateMinor: '52500',
    billingDecisionMinutes: 2190,
    approvedUnbilledWipMinor: '0',
  };
  const v3 = {
    masterLedger: () => [
      {
        invoiceId: 'cn',
        projectId: 'p1',
        currency: 'USD',
        billingStatus: 'issued',
        issueDate: '2026-11-24',
        totalMinor: '-10000',
        outstandingMinor: '0',
        netOutstandingMinor: '0',
        payments: [],
        paymentReversals: [],
      },
    ],
    financePortfolio: () => ({ projects: [project] }),
  };
  it('counts the credit note apart and the approved hours waiting for a billing decision', () => {
    const view = buildMoneyOverview(v3 as never, {} as never, 'this_month', {
      includeArchived: false,
      today: '2026-11-25',
    });
    const usd = view.currencies.find((row) => row.currency === 'USD')!;
    expect(usd.invoicedMinor).toBe('-10000');
    expect(usd.creditedMinor).toBe('-10000');
    expect(usd.billingDecisionMinutes).toBe(2190);
    expect(view.projects[0]!.billingDecisionMinutes).toBe(2190);
  });
});
