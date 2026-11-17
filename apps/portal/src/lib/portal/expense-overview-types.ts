/** Server-built Expenses overview payload (see lib/server/expense-overview.ts). */
import type { PortalRow } from './portal-data';
import type { ExpenseStatus } from './sections/expense-status';

export type ExpenseOverviewPeriod = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';
export type ExpenseOverviewGroup = 'worker' | 'project';
/** One exact total per currency: [currency, minor units as a decimal string]. */
export type ExpenseSums = Array<[string, string]>;
export type ExpenseBreakdown = Array<{ status: ExpenseStatus; count: number }>;

export type ExpenseOverviewData = {
  period: ExpenseOverviewPeriod;
  from: string;
  to: string;
  project: string;
  worker: string;
  status: string;
  category: string;
  receipt: string;
  find: string;
  group: ExpenseOverviewGroup;
  show: number;
  count: number;
  sums: ExpenseSums;
  breakdown: ExpenseBreakdown;
  quick: { missing: number; needsChanges: number; submitted: number };
  groupCount: number;
  groups: Array<{ id: string; name: string; count: number; sums: ExpenseSums; breakdown: ExpenseBreakdown }>;
  others: { count: number; items: number; sums: ExpenseSums } | null;
  categories: Array<{ category: string; count: number; sums: ExpenseSums; share: number }>;
  open: {
    id: string;
    name: string;
    page: number;
    pageSize: number;
    count: number;
    items: PortalRow[];
  } | null;
};
