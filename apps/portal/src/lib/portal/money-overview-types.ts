export type MoneyPeriodKey = 'this_month' | 'last_month' | 'this_year' | 'last_year';
export const moneyPeriodKeys: readonly MoneyPeriodKey[] = [
  'this_month',
  'last_month',
  'this_year',
  'last_year',
];

/** Exact minor-unit strings; one entry per currency, never combined. */
export type MoneyCurrencyTotals = {
  currency: string;
  invoicedMinor: string;
  collectedMinor: string;
  outstandingMinor: string;
  overdueMinor: string;
  overdueCount: number;
  openCount: number;
  laborCostMinor: string;
  expenseCostMinor: string;
  costsMinor: string;
  workValueMinor: string;
  marginMinor: string;
  marginBps: string | null;
  readyToInvoiceMinor: string;
};

export type MoneyProjectRow = {
  projectId: string;
  projectNumber: string;
  projectName: string;
  clientName: string;
  currency: string;
  invoicedMinor: string;
  workValueMinor: string;
  costMinor: string;
  marginMinor: string;
  marginBps: string | null;
  readyToInvoiceMinor: string;
  outstandingMinor: string;
  overdueMinor: string;
  missingRates: number;
  hasActivity: boolean;
};

export type MoneyOverview = {
  period: { key: MoneyPeriodKey; from: string; to: string; today: string };
  currencies: MoneyCurrencyTotals[];
  projects: MoneyProjectRow[];
};

/** "Which rate applies today" for one person on one project. */
export type RatePersonRow = {
  assignmentId: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  clientName: string;
  currency: string;
  workerId: string;
  workerName: string;
  clientRateMinor: string | null;
  clientRateBasis: string | null;
  clientSource: string | null;
  clientRuleId: string | null;
  payRateMinor: string | null;
  payBasis: string | null;
  payType: string | null;
  paySource: string | null;
  payRuleId: string | null;
  costRateMinor: string | null;
  costRuleId: string | null;
  issues: string[];
};

export type RateRuleRow = {
  id: string;
  kind: 'client' | 'pay' | 'cost';
  projectId: string | null;
  projectLabel: string;
  workerId: string | null;
  workerName: string;
  category: string | null;
  currency: string;
  rateMinor: string;
  basis: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'current' | 'scheduled' | 'ended';
};

export type RatesOverview = {
  today: string;
  people: RatePersonRow[];
  rules: RateRuleRow[];
  projects: Array<{
    id: string;
    label: string;
    clientName: string;
    currency: string;
    defaultRateMinor: string | null;
    defaultRateBasis: string | null;
    defaultRuleId: string | null;
    defaultEffectiveFrom: string | null;
  }>;
  workers: Array<{ id: string; name: string }>;
};
