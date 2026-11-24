import type { OwnerFinanceSummary } from './owner-finance';
import type { HomeInbox, WorkerWeekStatus } from './home-inbox';
import type { ApprovalQueuePage } from './approval-queue-page';
import type { MoneyOverview, RatesOverview } from './money-overview-types';
import type { TimeOverviewData } from './time-overview-types';
import type { ExpenseOverviewData } from './expense-overview-types';
import type { ClientCalendarEntry } from './client-work-calendar';
import type { ProblemData } from '../problem/contract';
export type PortalRow = Record<string, string | number | boolean | string[] | null>;

export type ReimbursementReviewPerson = Readonly<{
  assignmentId: string;
  workerId: string;
  workerName: string;
  startsOn: string;
  endsOn: string | null;
}>;
export type ReimbursementReviewInputs = Readonly<{
  assignmentId: string;
  date: string;
  payer: string;
  category: string;
}>;
type ReimbursementReviewBase = Readonly<{
  inputs: ReimbursementReviewInputs;
  person: ReimbursementReviewPerson | null;
}>;
export type FinanceReimbursementReview = ReimbursementReviewBase &
  (
    | { status: 'idle' }
    | {
        status: 'invalid';
        issue: 'invalid_date' | 'invalid_payer' | 'invalid_category' | 'person_required';
      }
    | {
        status: 'unavailable';
        issue:
          | 'person_unavailable'
          | 'missing_assignment'
          | 'ambiguous_assignment'
          | 'missing_policy'
          | 'context_changed';
      }
    | {
        status: 'resolved';
        person: ReimbursementReviewPerson;
        behavior: 'at_cost' | 'none';
        source: 'assignment_override' | 'project_default' | 'person_policy' | 'non_worker_payer';
        sourceEffectiveFrom: string | null;
        policy: Readonly<{
          id: string;
          version: number;
          payer: string;
          category: string | null;
          effectiveFrom: string;
          effectiveTo: string | null;
        }>;
      }
  );

export type ReportWindowTab = {
  shown: number;
  /** Rows matching the filters. */
  total: number;
  /** Draft / submitted / needs-changes rows in the tab (unfiltered). */
  pending: number;
  /** Worker filter choices from every visible row of the tab ([id, name]). */
  workers: Array<[string, string]>;
};

export type ReportWindow = {
  /** Filter signature the server applied (see report-window.ts). */
  key: string;
  limit: number;
  daily: ReportWindowTab;
  technical: ReportWindowTab;
  clientOptions: string[];
};

export type PortalData = {
  suppliers?: PortalRow[];
  locale?: 'en' | 'es' | 'pt';
  offlineEnabled?: boolean;
  ownerFinance?: OwnerFinanceSummary;
  /** Home task inbox (owner / project manager). */
  homeInbox?: HomeInbox;
  /** Daily report prefill for the signed-in person (own rows only). */
  reportPrefill?: {
    recentTime: Array<{ projectId: string; workDate: string; minutes: number }>;
    lastDaily: {
      projectId: string;
      workDate: string;
      siteShift: string;
      openItems: string;
      nextDayPlan: string;
    } | null;
  };
  /** Home week status for the signed-in worker. */
  workerWeek?: WorkerWeekStatus;
  /** Archived projects in the account's scope; hides "Include archived" when 0. */
  archivedProjectCount?: number;
  /** Pending approvals for the navigation badge (layout data). */
  approvalPendingCount?: number;
  /** Approvals page: pending queue, server-side filters and paging. */
  approvalQueue?: ApprovalQueuePage;
  moneyOverview?: MoneyOverview;
  ratesOverview?: RatesOverview;
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
    status?: string;
    mfaEnrolled?: boolean;
    mfaRequired?: boolean;
    workforceProfile?: 'external_technician' | 'supplier_coordinator';
  };
  section: string;
  projects?: PortalRow[];
  selectedDocumentProject?: PortalRow | null;
  archivedDocuments?: PortalRow[];
  calendarEntries?: ClientCalendarEntry[];
  calendarMonth?: string;
  canViewWorkCalendar?: boolean;
  clients?: PortalRow[];
  assignments?: PortalRow[];
  assignmentToday?: string;
  /** Projects list (scale): false when workers/assignments were not shipped (load on demand). */
  projectPeopleLoaded?: boolean;
  /** False when assignment rows were not shipped (list, create client/project). */
  projectAssignmentsLoaded?: boolean;
  /** Active assignments / distinct active workers per project id. */
  projectAssignmentCounts?: Record<string, { active: number; workers: number }>;
  /** Reports register window (scale): the server applied these filters and limit. */
  reportWindow?: ReportWindow;
  /** Documents register page (scale). */
  documentList?: {
    find: string;
    order: 'newest' | 'oldest' | 'name';
    page: number;
    pages: number;
    pageSize: number;
    total: number;
    matched: number;
  };
  timeAssignments?: PortalRow[];
  timeWorkers?: Array<{ id: string; name: string }>;
  timeWorkerId?: string;
  weekEntries?: PortalRow[];
  weekSheets?: Array<{
    id: string;
    projectId: string;
    filename: string;
    createdAt: string;
    /** The uploader (or owner) may remove it while the week is not sent (audit T38). */
    removable?: boolean;
  }>;
  /** Sent-back time entries in any week (audit T07). */
  timeReturns?: PortalRow[];
  /** Entries a reviewer rejected this week, with the note (audit T07). */
  weekRejected?: PortalRow[];
  /** Project id -> who reviews this person's hours (audit T07/T83). */
  timeReviewers?: Record<string, string>;
  recordsTotal?: number;
  timeDay?: string;
  timeView?: 'capture' | 'overview';
  canReviewTime?: boolean;
  overview?: TimeOverviewData;
  contacts?: PortalRow[];
  /** People directory (projects?view=team) projections; see team-directory-load.ts. */
  teamStats?: PortalRow[];
  teamWeekStart?: string;
  teamWeekEnd?: string;
  mailboxLinkedIds?: string[];
  /** Owner People directory: unused invitation links (see V3Repository.listOpenInvitations). */
  invitations?: Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: string;
    createdAt: string;
    expired: boolean;
  }>;
  personPayRules?: PortalRow[];
  defaultsProjectIds?: string[];
  personAssignModes?: Record<string, 'defaults' | 'existing' | 'rates'>;
  workers?: PortalRow[];
  planningFilterWorkers?: PortalRow[];
  /** Planning: the focused assignment (may be outside the current page) and compact calendar events. */
  planningFocus?: PortalRow | null;
  planningCalendar?: PortalRow[];
  planningList?: {
    period: string;
    from: string;
    to: string;
    search: string;
    page: number;
    pageSize: number;
    total: number;
    allTotal: number;
  };
  skills?: PortalRow[];
  workerSkills?: PortalRow[];
  allSkills?: PortalRow[];
  availability?: PortalRow[];
  selectedWorkerId?: string;
  records?: PortalRow[];
  milestones?: PortalRow[];
  documents?: PortalRow[];
  technicalChanges?: PortalRow[];
  periodReports?: PortalRow[];
  /** Approved technical reports selectable for a period report (owner / finance). */
  periodTechnicalReports?: PortalRow[];
  billingRules?: PortalRow[];
  compensationRules?: PortalRow[];
  clientLaborRates?: PortalRow[];
  internalCostRules?: PortalRow[];
  assignmentExpensePolicies?: PortalRow[];
  projectExpenseReimbursement?: PortalRow | null;
  reimbursementPreferenceAsOf?: string;
  reimbursementPreferenceHistory?: PortalRow[];
  reimbursementReview?: FinanceReimbursementReview;
  commercialPolicies?: PortalRow[];
  commercialTermsSummary?: PortalRow[];
  commercialAsOf?: string;
  commercialCategory?: string;
  financeExpenses?: PortalRow[];
  invoices?: PortalRow[];
  invoiceEmailDeliveries?: PortalRow[];
  settlements?: PortalRow[];
  compensationPayments?: PortalRow[];
  financeToday?: string;
  payActivities?: PortalRow[];
  payExpenses?: PortalRow[];
  payOutstanding?: Array<{
    currency: string;
    settlementMinor: string;
    reimbursementMinor: string;
  }>;
  reimbursements?: PortalRow[];
  ledger?: Array<Record<string, unknown>>;
  packs?: Array<Record<string, unknown>>;
  audit?: PortalRow[];
  auditView?: 'all' | 'business' | 'service';
  auditFilter?: import('$lib/portal/audit-log').AuditFilter;
  auditTotal?: number;
  auditPage?: number;
  auditPages?: number;
  auditPageSize?: number;
  auditActors?: Array<{ id: string; name: string }>;
  auditEntityTypes?: string[];
  notificationPage?: { total: number; all: number; unread: number; page: number; pages: number; pageSize: number; unreadOnly: boolean };
  clientDirectory?: import('$lib/portal/client-directory').ClientDirectoryPage;
  legalEntities?: PortalRow[];
  canonicalLegalEntityOptions?: PortalRow[];
  projectLegalEntityAssignments?: PortalRow[];
  canonicalAssignmentCommandToken?: string;
  canonicalRevisionCommandToken?: string;
  canonicalAuthorityAsOf?: string;
  taxProfiles?: PortalRow[];
  selectedProjectId?: string;
  periodStart?: string;
  periodEnd?: string;
  payPeriodProblem?: ProblemData | null;
  weekStart?: string;
  weekEnd?: string;
  expenseView?: 'capture' | 'overview';
  expenseOverview?: ExpenseOverviewData;
  expenseCapture?: { weeks: number; from: string; olderCount: number };
  weekDraftRecords?: PortalRow[];
  timeFilter?: {
    category: string;
    projectId: string;
    workerId: string;
    status?: string;
    from: string;
    to: string;
  };
  timesheet?: {
    weekStart: string;
    weekEnd: string;
    days: Array<{
      date: string;
      label: string;
      expectedMinutes: number | null;
      actualMinutes: number;
      differenceMinutes: number | null;
      status: string;
      categories: Record<string, number>;
    }>;
  };
  weeklyPay?: {
    currency: string;
    approvedMinutes: number;
    pendingMinutes: number;
    estimatedApprovedMinor: string;
    estimatedPendingMinor: string;
    currencyBreakdown?: Array<{
      currency: string;
      estimatedApprovedMinor: string;
      estimatedPendingMinor: string;
    }>;
  };
  searchQuery?: string;
  searchSuggestions?: PortalRow[];
  searchResults?: PortalRow[];
  pay?: {
    currency: string;
    projectIds?: string[];
    approvedMinutes: number;
    pendingMinutes: number;
    /** Own hours sent back for changes (needs_changes): not waiting for approval. */
    returnedMinutes?: number;
    estimatedApprovedMinor: string;
    estimatedPendingMinor: string;
    approvedReimbursementMinor: string;
    pendingReimbursementMinor: string;
    currencyBreakdown?: Array<{
      currency: string;
      estimatedApprovedMinor: string;
      estimatedPendingMinor: string;
      approvedReimbursementMinor: string;
      pendingReimbursementMinor: string;
    }>;
    guaranteedMinutes?: number;
    percentageBased?: boolean;
    settlementTriggers?: string[];
    missingCompensationRules?: number;
    label?: string;
    projectProgress?: Array<Record<string, unknown>>;
  };
  finance?: {
    currency: string;
    actualMinutes?: number;
    approvedMinutes?: number;
    approvedCostMinor: string;
    revenueCandidateMinor: string;
    contributionMarginMinor: string;
    invoicedMinor: string;
    paidMinor: string;
    receivableMinor: string;
    laborRevenueMinor?: string;
    expenseRevenueMinor?: string;
    directLaborCostMinor?: string;
    expenseCostMinor?: string;
    travelCostMinor?: string;
    otherDirectCostMinor?: string;
    approvedUnbilledWipMinor?: string;
    unapprovedWipMinor?: string;
    milestoneRevenueMinor?: string;
    budgetMinor?: string | null;
    plannedMinutes?: number | null;
    plannedRemainingMinutes?: number | null;
    estimateToCompleteMinor?: string | null;
    estimateAtCompletionCostMinor?: string | null;
    expectedFinalMarginMinor?: string | null;
    hoursConsumedBps?: string | null;
    travelBudgetConsumedBps?: string | null;
    travelBudgetMinor?: string | null;
    expenseBudgetConsumedBps?: string | null;
    expenseBudgetMinor?: string | null;
    forecastAvailable?: boolean;
    alerts?: string[];
    contributionMarginBps?: string;
    timeEconomics?: Array<Record<string, unknown>>;
    expenseEconomics?: Array<Record<string, unknown>>;
  } | null;
  portfolio?: {
    projects?: Array<Record<string, unknown>>;
    byClient?: Array<Record<string, unknown>>;
    byWorker?: Array<Record<string, unknown>>;
    byMonth?: Array<Record<string, unknown>>;
    byWeek?: Array<Record<string, unknown>>;
  };
  dashboard?: {
    activeProjects: number;
    actualMinutes: number;
    pendingReports: number;
    expenseTotalsByCurrency?: Array<{ currency: string; minor: string }>;
    upcomingInvoices?: number;
    upcomingInvoiceTotalsByCurrency?: Array<{ currency: string; minor: string }>;
  };
};

export type PortalActionResult = {
  success?: boolean;
  operation?: string;
  message?: string;
  messageKey?: string;
} | null;
