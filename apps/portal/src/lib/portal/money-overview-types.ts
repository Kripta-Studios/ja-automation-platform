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
  /** Approved work already on an unissued draft (not counted as ready). */
  inDraftMinor: string;
  /**
   * Approved expenses whose invoice amount is decided on New invoice (same as Home),
   * counted in this receipt currency; not part of readyToInvoiceMinor.
   */
  expensesWaitingCount: number;
  expensesWaitingMinor: string;
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
  /** Approved work already on an unissued draft (not counted as ready). */
  inDraftMinor: string;
  outstandingMinor: string;
  overdueMinor: string;
  /** Approved expenses waiting for their invoice amount (see MoneyCurrencyTotals). */
  expensesWaiting: { count: number; totals: Array<{ currency: string; minor: string }> };
  missingRates: number;
  hasActivity: boolean;
};

export type MoneyOverview = {
  period: { key: MoneyPeriodKey; from: string; to: string; today: string };
  currencies: MoneyCurrencyTotals[];
  /** One page of the projects with activity, most money waiting first. */
  projects: MoneyProjectRow[];
  projectList: { active: number; quiet: number; matches: number; search: string; limit: number };
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

export type RatesProjectRow = {
  id: string;
  label: string;
  clientName: string;
  currency: string;
  defaultRateMinor: string | null;
  defaultRateBasis: string | null;
  defaultRuleId: string | null;
  defaultEffectiveFrom: string | null;
  /** Active people on the project today, and how many of them have no client rate. */
  peopleCount: number;
  missingCount: number;
};

export type RatesOverview = {
  today: string;
  /** One page of projects (most missing rates first); details only for the open project. */
  projects: RatesProjectRow[];
  projectList: {
    total: number;
    matches: number;
    projectsMissing: number;
    peopleMissing: number;
    search: string;
    missingOnly: boolean;
    limit: number;
  };
  openProjectId: string;
  /** People and rate history of the open project only. */
  people: RatePersonRow[];
  rules: RateRuleRow[];
};
