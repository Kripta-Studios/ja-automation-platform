<script lang="ts">
  /**
   * Approvals: one queue with Time / Expenses / Reports tabs.
   * Time and expenses are grouped by worker + week (Mon–Sun). A group is approved
   * with one `approveBatch` call (one transaction, every item pinned to the
   * version the reviewer saw). Single entries are sent back with a required note
   * through the existing `approveRecord` action. Bulk approval shows an in-page
   * summary (counts, hours, amounts) before anything is recorded.
   * Approvals cannot be undone; approved-but-unbilled records link to the
   * existing audited correction path.
   */
  import { enhance } from '$app/forms';
  import { goto, replaceState } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount, tick } from 'svelte';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import type { ProblemData } from '../../problem/contract';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';
  import { ProblemNotice, StatusBadge, formValidation } from '../ui';
  import { approvalQueueText, type ApprovalQueueCopyKey } from './approval-queue-copy';
  import type { ApprovalQueuePage, QueueTotals } from '../approval-queue-page';
  import type { CurrencyTotal } from '../home-inbox';
  import { personDisplayName } from '../display-name';
  import { clockHoursFromMinutes } from '../minute-hours';

  type Tab = 'time' | 'expenses' | 'reports';
  type Kind = 'time' | 'expense';
  const tabs: readonly Tab[] = ['time', 'expenses', 'reports'];

  let {
    data,
    isAuditor,
    isOwner,
    canSeeFinanceReview = false,
    locale = 'en',
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    isOwner: boolean;
    /** Explicit capability: finance rows remain out of the PM surface by default. */
    canSeeFinanceReview?: boolean;
    locale?: PortalLocale;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  const t = (key: ApprovalQueueCopyKey, params: Record<string, string | number> = {}) =>
    approvalQueueText(locale, key, params);
  const language = $derived(documentLanguage(locale));
  const componentId = $props.id();
  const role = $derived(String(data.user.role));
  const userId = $derived(String(data.user.id));
  const ownerApprovalIncludesFinance = $derived(role === 'owner_admin');
  const canDecide = $derived(!isAuditor);

  type Item = {
    row: Row;
    id: string;
    type: Kind;
    date: string;
    minutes: number;
    version: string;
    workerId: string;
    workerName: string;
    projectName: string;
    own: boolean;
  };
  type Group = {
    key: string;
    kind: Kind;
    workerName: string;
    weekStart: string;
    items: Item[];
    actionable: Item[];
    minutes: number;
    projects: string[];
  };

  function value(row: Row, key: string): string {
    const raw = row[key];
    return raw === null || raw === undefined ? '' : String(raw);
  }

  function projectName(row: Row): string {
    const direct = value(row, 'project_name') || value(row, 'project_number');
    if (direct) return direct;
    const project = (data.projects ?? []).find(
      (candidate) => value(candidate, 'id') === value(row, 'project_id'),
    );
    return project
      ? value(project, 'name') || value(project, 'project_number') || translate('Project')
      : translate('Project');
  }

  function workerName(row: Row): string {
    return personDisplayName(value(row, 'worker_name')) || translate('Worker');
  }

  function recordHref(row: Row): string {
    const id = encodeURIComponent(value(row, 'id'));
    const type = value(row, 'type');
    if (type === 'expense') return `${base}/app/expenses/${id}`;
    if (type === 'time') return `${base}/app/time/${id}`;
    if (['daily', 'technical'].includes(type)) return `${base}/app/reports/${id}`;
    return `${base}/app/${encodeURIComponent(type)}/${id}`;
  }

  function correctionHref(row: Row): string {
    const type = value(row, 'type');
    const anchor = ['daily', 'technical'].includes(type)
      ? 'report-correction-title'
      : type === 'expense'
        ? 'expense-correction-title'
        : 'time-correction-title';
    return `${recordHref(row)}#${anchor}`;
  }

  function receiptHref(row: Row): string {
    return `${base}/app/api/documents/${encodeURIComponent(value(row, 'receipt_document_id'))}?view=1`;
  }

  function expenseClassificationHref(row: Row): string {
    const params = new URLSearchParams({
      view: 'commercial',
      project: value(row, 'project_id'),
      expense: value(row, 'id'),
    });
    return `${base}/app/finance?${params.toString()}#expense-classification`;
  }

  // ---------- formatting ----------
  function hoursText(minutes: number): string {
    return t('hours', { hours: clockHoursFromMinutes(Math.round(minutes)) });
  }
  function utcDate(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }
  function shiftDays(iso: string, days: number): string {
    const date = utcDate(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function weekRange(weekStart: string): string {
    const start = utcDate(weekStart);
    const end = utcDate(shiftDays(weekStart, 6));
    const dayMonth = new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    try {
      return dayMonth.formatRange(start, end);
    } catch {
      return `${dayMonth.format(start)} – ${dayMonth.format(end)}`;
    }
  }
  function dayLabel(iso: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return iso;
    return new Intl.DateTimeFormat(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(utcDate(iso));
  }
  function categoryLabel(category: string): string {
    if (category === 'regular' || category === '') return t('work');
    if (category === 'travel') return t('travel');
    if (category === 'overtime') return t('overtime');
    return controlledValue('timeCategory', category) || category;
  }
  function countLabel(kind: Kind, count: number): string {
    if (kind === 'time') return count === 1 ? t('entry') : t('entries', { count });
    return count === 1 ? t('expense') : t('expenses', { count });
  }
  function moneyTotals(items: readonly Item[]): string {
    const totals = new Map<string, bigint>();
    for (const item of items) {
      const currency = value(item.row, 'expense_currency');
      const raw = value(item.row, 'expense_amount_minor');
      if (!currency || !/^-?\d+$/u.test(raw)) continue;
      totals.set(currency, (totals.get(currency) ?? 0n) + BigInt(raw));
    }
    return [...totals]
      .map(([currency, minor]) => money(minor.toString(), currency, language))
      .join(' + ');
  }
  function groupTitle(group: Group): string {
    return `${group.workerName} · ${t('week', { range: weekRange(group.weekStart) })}`;
  }
  function groupFacts(group: Group, items: readonly Item[] = group.items): string {
    const amount = group.kind === 'expense' ? moneyTotals(items) : '';
    return [
      group.kind === 'time' ? hoursText(sumMinutes(items)) : countLabel('expense', items.length),
      group.kind === 'time' ? countLabel('time', items.length) : amount,
      group.projects.length > 2
        ? t('projects', { count: group.projects.length })
        : group.projects.join(', '),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  function sumMinutes(items: readonly Item[]): number {
    return items.reduce((total, item) => total + item.minutes, 0);
  }
  function itemSummary(item: Item): string {
    return [
      item.workerName,
      dayLabel(item.date),
      item.type === 'time' ? hoursText(item.minutes) : expenseLine(item.row),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  function expenseLine(row: Row): string {
    const category = value(row, 'expense_category');
    const currency = value(row, 'expense_currency');
    return [
      controlledValue('expenseCategory', category) || category,
      value(row, 'expense_label'),
      currency ? money(row.expense_amount_minor, currency, language) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  function token(item: Item): string {
    return `${item.type}:${item.id}:${item.version}`;
  }

  // ---------- queue model (server: pending only, searched, filtered, paginated) ----------
  const emptyTotals: QueueTotals = { timeCount: 0, minutes: 0, expenseCount: 0, expenseTotals: [] };
  const queue = $derived<ApprovalQueuePage>(
    data.approvalQueue ?? {
      query: {
        tab: 'time',
        search: '',
        worker: '',
        project: '',
        week: '',
        show: 20,
        view: 'pending',
      },
      pageSize: 20,
      summary: {
        time: { count: 0, minutes: 0 },
        expenses: { count: 0, totals: [] },
        reports: 0,
        total: 0,
      },
      options: { workers: [], projects: [], weeks: [] },
      filtersActive: false,
      matching: { ...emptyTotals, reports: 0, groups: 0 },
      groups: [],
      reports: [],
      waiting: { count: 0, rows: [] },
      approveAll: {
        matching: emptyTotals,
        batch: emptyTotals,
        workers: [],
        tokens: [],
        ownExcluded: 0,
      },
      approved: null,
      finance: { count: 0, rows: [] },
    },
  );
  const activeTab = $derived<Tab>(queue.query.tab as Tab);
  /** Every row the server sent (for "problem with …" lookups). */
  const rows = $derived((data.records ?? []) as Row[]);
  const milestones = $derived((data.milestones ?? []) as Row[]);
  const ownerOverrideAllowed = $derived(isOwner && role === 'owner_admin' && !isAuditor);

  function toItem(row: Row): Item {
    const type: Kind = value(row, 'type') === 'expense' ? 'expense' : 'time';
    return {
      row,
      id: value(row, 'id'),
      type,
      date: value(row, 'date'),
      minutes: type === 'time' ? Number(value(row, 'amount')) || 0 : 0,
      version: value(row, 'record_version'),
      workerId: value(row, 'worker_id'),
      workerName: workerName(row),
      projectName: projectName(row),
      // Only the Owner may decide their own records; everyone else needs another reviewer.
      own: role !== 'owner_admin' && value(row, 'worker_id') === userId,
    };
  }

  const pageGroups = $derived(
    queue.groups.map((source): Group => {
      const items = source.rows.map((row) => toItem(row as Row));
      const projects: string[] = [];
      for (const item of items)
        if (!projects.includes(item.projectName)) projects.push(item.projectName);
      return {
        key: source.key,
        kind: source.kind,
        workerName:
          personDisplayName(source.workerName) || items[0]?.workerName || translate('Worker'),
        weekStart: source.weekStart,
        items,
        actionable: items.filter((item) => !item.own && item.version),
        minutes: sumMinutes(items),
        projects,
      };
    }),
  );

  // Search and filters live in the URL; the server applies them before paging,
  // so "Approve week" / "Approve all visible" never include hidden work.
  // svelte-ignore state_referenced_locally
  let searchText = $state(queue.query.search);
  // svelte-ignore state_referenced_locally
  let workerFilter = $state(queue.query.worker);
  // svelte-ignore state_referenced_locally
  let projectFilter = $state(queue.query.project);
  // svelte-ignore state_referenced_locally
  let weekFilter = $state(queue.query.week);
  $effect(() => {
    searchText = queue.query.search;
    workerFilter = queue.query.worker;
    projectFilter = queue.query.project;
    weekFilter = queue.query.week;
  });
  let filtersOpen = $state(false);
  const filterOptions = $derived(queue.options);
  const filtersActive = $derived(queue.filtersActive);

  /** Current URL with changed query parameters (empty values removed). */
  function queueHref(changes: Record<string, string | number | null>): string {
    const next = new URL($page.url);
    next.searchParams.delete('approveAll');
    for (const [key, raw] of Object.entries(changes)) {
      const text = raw === null ? '' : String(raw).trim();
      if (text) next.searchParams.set(key, text);
      else next.searchParams.delete(key);
    }
    return `${next.pathname}${next.search}`;
  }
  function navigate(changes: Record<string, string | number | null>): void {
    selected = {};
    confirmOpen = false;
    void goto(queueHref(changes), { keepFocus: true, noScroll: true });
  }
  function applyFilters(event?: Event): void {
    event?.preventDefault();
    navigate({
      search: searchText,
      worker: workerFilter,
      project: projectFilter,
      week: weekFilter,
      show: null,
    });
  }
  function clearFilters(): void {
    searchText = '';
    workerFilter = '';
    projectFilter = '';
    weekFilter = '';
    applyFilters();
  }
  // Tab badges count what this viewer can approve (P1); own entries stay listed.
  const tabSummary = $derived(queue.reviewable ?? queue.summary);
  const tabCount = (tab: Tab): number =>
    tab === 'time'
      ? tabSummary.time.count
      : tab === 'expenses'
        ? tabSummary.expenses.count
        : tabSummary.reports;

  // ---------- approve all hours and expenses (one transaction via approveBatch) ----------
  const APPROVE_ALL_LIMIT = 200; // matches the server batch limit
  const PENDING_PAGE_SIZE = 20; // APPROVAL_PAGE_SIZE on the server
  const approveAllTokens = $derived(queue.approveAll.tokens);
  const approveAllWorkers = $derived(queue.approveAll.workers);
  function totalsSummary(totals: QueueTotals): string {
    return [
      totals.timeCount
        ? `${hoursText(totals.minutes)} (${countLabel('time', totals.timeCount)})`
        : '',
      totals.expenseCount
        ? [countLabel('expense', totals.expenseCount), currencyText(totals.expenseTotals)]
            .filter(Boolean)
            .join(' · ')
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  function currencyText(totals: readonly CurrencyTotal[]): string {
    return totals.map((total) => money(total.minor, total.currency, language)).join(' + ');
  }
  function mixedSummary(items: readonly Item[]): string {
    const time = items.filter((item) => item.type === 'time');
    const expenses = items.filter((item) => item.type === 'expense');
    return [
      time.length ? `${hoursText(sumMinutes(time))} (${countLabel('time', time.length)})` : '',
      expenses.length
        ? [countLabel('expense', expenses.length), moneyTotals(expenses)]
            .filter(Boolean)
            .join(' · ')
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  let approveAllOpen = $state(false);
  async function openApproveAll(): Promise<void> {
    approveAllOpen = true;
    confirmOpen = false;
    await tick();
    const panel = document.getElementById(`approve-all-${componentId}`);
    panel?.scrollIntoView({ block: 'start', behavior: 'instant' });
    panel?.focus({ preventScroll: true });
  }
  function closeApproveAll(): void {
    approveAllOpen = false;
    if (typeof location === 'undefined') return;
    const url = new URL(location.href);
    if (!url.searchParams.has('approveAll')) return;
    url.searchParams.delete('approveAll');
    replaceState(url, $page.state);
  }

  const visibleGroups = $derived(activeTab === 'reports' ? [] : pageGroups);
  const visibleReports = $derived(queue.reports as Row[]);
  const shownCount = $derived(
    activeTab === 'reports' ? visibleReports.length : visibleGroups.length,
  );
  const totalCount = $derived(
    activeTab === 'reports' ? queue.matching.reports : queue.matching.groups,
  );
  // Filters appear only when the tab has enough work to need them.
  const showFilters = $derived(
    filtersActive ||
      filterOptions.workers.length > 1 ||
      filterOptions.projects.length > 1 ||
      filterOptions.weeks.length > 1,
  );
  const waitingRows = $derived(queue.waiting.rows as Row[]);
  const ownRows = $derived((queue.ownEntries?.rows ?? []) as Row[]);
  const approvedView = $derived(queue.query.view === 'approved');
  const approvedRows = $derived(
    ((queue.approved?.rows ?? []) as Row[]).filter(
      (row) =>
        value(row, 'approval_state') === 'approved' &&
        ['correction', 'owner_override'].includes(value(row, 'review_stage')),
    ),
  );

  // ---------- tabs ----------
  onMount(() => {
    // Home "Approve all hours and expenses" lands here with the summary already open.
    if (
      $page.url.searchParams.get('approveAll') === '1' &&
      canDecide &&
      approveAllTokens.length > 0
    )
      void openApproveAll();
  });

  function tabId(tab: Tab): string {
    return `approval-tab-${componentId}-${tab}`;
  }
  function panelId(): string {
    return 'approval-queue';
  }
  function tabLabel(tab: Tab): string {
    return tab === 'time' ? t('tabTime') : tab === 'expenses' ? t('tabExpenses') : t('tabReports');
  }
  function focusTab(tab: Tab): void {
    confirmOpen = false;
    selected = {};
    if (typeof document === 'undefined') return;
    // Filters belong to one tab's people/projects; switching tabs starts clean.
    void goto(queueHref({ tab, show: null, worker: null, project: null, week: null, view: null }), {
      keepFocus: true,
      noScroll: true,
    }).then(() => tick().then(() => document.getElementById(tabId(tab))?.focus()));
  }
  function handleTabKeydown(event: KeyboardEvent, tab: Tab): void {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) focusTab(nextTab);
  }

  // ---------- disclosure / selection state ----------
  let expanded = $state<Record<string, boolean>>({});
  let sendBackFor = $state<string | null>(null);
  let selected = $state<Record<string, boolean>>({});
  let confirmOpen = $state(false);
  let busyKey = $state<string | null>(null);
  let lastAction = $state<{ text: string; tone: 'success' | 'info' } | null>(null);

  const selectableGroups = $derived(visibleGroups.filter((group) => group.actionable.length > 0));
  const visibleActionableCount = $derived(
    selectableGroups.reduce((total, group) => total + group.actionable.length, 0),
  );
  const selectedGroups = $derived(selectableGroups.filter((group) => selected[group.key]));
  const selectedItems = $derived(selectedGroups.flatMap((group) => group.actionable));
  const allSelected = $derived(
    selectableGroups.length > 0 && selectedGroups.length === selectableGroups.length,
  );
  function toggleAll(event: Event): void {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const next: Record<string, boolean> = {};
    if (checked) for (const group of selectableGroups) next[group.key] = true;
    selected = next;
    if (!checked) confirmOpen = false;
  }
  function selectionTotals(): string {
    const items = selectedItems;
    if (activeTab === 'time')
      return `${countLabel('time', items.length)} · ${hoursText(sumMinutes(items))}`;
    return [countLabel('expense', items.length), moneyTotals(items)].filter(Boolean).join(' · ');
  }
  function approveAllVisible(): void {
    const next: Record<string, boolean> = {};
    for (const group of selectableGroups) next[group.key] = true;
    selected = next;
    void openConfirm();
  }
  async function openConfirm(): Promise<void> {
    confirmOpen = true;
    await tick();
    document.getElementById(`approval-confirm-${componentId}`)?.focus();
  }

  // ---------- problems ----------
  const approvalProblem = $derived.by(() => {
    const result = $page.form as (ProblemData & { success?: boolean }) | null | undefined;
    return result?.success === false &&
      /^(?:APPROVAL_|FINANCE_REVIEW_|EXPENSE_CLASSIFICATION_|FINANCE_ROLE_)/u.test(result.code)
      ? result
      : null;
  });
  const failedApprovalValues = $derived(
    ((approvalProblem as (ProblemData & { values?: Record<string, unknown> }) | null)?.values ??
      {}) as Record<string, unknown>,
  );
  const failedRow = $derived.by(() => {
    const id = String(failedApprovalValues.id ?? '');
    return id ? rows.find((row) => value(row, 'id') === id) : undefined;
  });
  const approvalCurrentStatus = $derived.by(() => {
    const currentStatus = String(approvalProblem?.params.currentStatus ?? '');
    const failed = failedRow ? rowSummary(failedRow) : '';
    const status = currentStatus
      ? `${translate('Current status')}: ${controlledValue('status', currentStatus) || currentStatus}`
      : '';
    return (
      [failed ? t('problemWith', { summary: failed }) : '', status].filter(Boolean).join(' · ') ||
      undefined
    );
  });
  const approvalRemedyLinks = $derived.by(() => {
    const links: Record<string, { label: string; href?: string }> = {
      contact_project_owner: { label: translate('Contact a project owner') },
      contact_project_reviewer: { label: translate('Contact a project reviewer') },
      contact_finance_owner: { label: translate('Contact Finance or an owner') },
      sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login` },
      review_approval_queue: {
        label: translate('problem.remedy.reviewApprovalQueue'),
        href: '#approval-queue',
      },
      enter_reason: { label: translate('Review reason') },
    };
    const remedy = approvalProblem?.remedies.find((item) => item.id === 'review_updated_record');
    if (
      remedy?.recordId &&
      ['time', 'expense', 'daily', 'technical'].includes(String(approvalProblem?.params.recordType))
    )
      links.review_updated_record = {
        label: translate('Review updated record'),
        href: recordHref({ id: remedy.recordId, type: String(approvalProblem?.params.recordType) }),
      };
    const classify = approvalProblem?.remedies.find((item) => item.id === 'classify_expense');
    if (
      classify?.recordId &&
      canSeeFinanceReview &&
      ['owner_admin', 'finance_admin'].includes(role)
    )
      links.classify_expense = {
        label: translate('Classify expense in Finance'),
        href: `${base}/app/finance?view=commercial&expense=${encodeURIComponent(classify.recordId)}#expense-classification`,
      };
    const financeRules = approvalProblem?.remedies.find(
      (item) => item.id === 'review_finance_rules',
    );
    if (
      financeRules?.projectId &&
      canSeeFinanceReview &&
      ['owner_admin', 'finance_admin'].includes(role)
    )
      links.review_finance_rules = {
        label: translate('Open finance configuration'),
        href: `${base}/app/finance?view=commercial&project=${encodeURIComponent(financeRules.projectId)}`,
      };
    return links;
  });
  let focusedProblemId = '';
  $effect(() => {
    const problem = approvalProblem;
    if (!problem?.correlationId || problem.correlationId === focusedProblemId) return;
    focusedProblemId = problem.correlationId;
    void tick().then(() => {
      const notice = document.querySelector<HTMLElement>('[data-approval-problem]');
      notice?.focus({ preventScroll: true });
      notice?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  });

  // ---------- submissions ----------
  /** Keep scroll, record what happened, and let the refreshed queue drop the decided rows. */
  function decide(
    key: string,
    summary: string,
    tone: 'approved' | 'sentBack' | 'report',
  ): SubmitFunction {
    return ({ formData }) => {
      busyKey = key;
      lastAction = null;
      const decision = String(formData.get('decision') ?? '');
      // Batch forms are re-rendered as rows change; describe exactly what is being sent.
      const tokens = formData.getAll('item').map(String);
      if (tokens.length && key !== 'all') summary = tokensSummary(tokens) || summary;
      const banner: ApprovalQueueCopyKey =
        decision === 'rejected'
          ? 'rejectedBanner'
          : tone === 'approved'
            ? 'approvedBanner'
            : tone === 'report'
              ? 'reportApprovedBanner'
              : 'sentBackBanner';
      return async ({ result, update }) => {
        await update({ reset: false });
        busyKey = null;
        if (result.type === 'success') {
          lastAction = {
            text: t(banner, { summary }),
            tone:
              banner === 'approvedBanner' || banner === 'reportApprovedBanner' ? 'success' : 'info',
          };
          sendBackFor = null;
          confirmOpen = false;
          selected = {};
          if (key === 'all') closeApproveAll();
        }
      };
    };
  }
  function tokensSummary(tokens: readonly string[]): string {
    const ids = new Set(tokens.map((entry) => entry.split(':')[1] ?? ''));
    const sent = pageGroups
      .map((group) => ({ group, items: group.actionable.filter((item) => ids.has(item.id)) }))
      .filter((part) => part.items.length > 0);
    if (sent.length === 0) return '';
    if (sent.length === 1)
      return `${groupTitle(sent[0]!.group)} · ${groupFacts(sent[0]!.group, sent[0]!.items)}`;
    const items = sent.flatMap((part) => part.items);
    if (items.some((item) => item.type === 'time') && items.some((item) => item.type === 'expense'))
      return mixedSummary(items);
    return items.every((item) => item.type === 'time')
      ? `${countLabel('time', items.length)} · ${hoursText(sumMinutes(items))}`
      : [countLabel('expense', items.length), moneyTotals(items)].filter(Boolean).join(' · ');
  }
  function rowSummary(row: Row): string {
    const type = value(row, 'type');
    if (type === 'daily' || type === 'technical')
      return `${type === 'daily' ? t('daily') : t('technical')} · ${workerName(row)} · ${dayLabel(value(row, 'date'))}`;
    return itemSummary(toItem(row));
  }
  function bulkSummary(groups: readonly Group[]): string {
    const items = groups.flatMap((group) => group.actionable);
    return activeTab === 'time'
      ? `${countLabel('time', items.length)} · ${hoursText(sumMinutes(items))}`
      : [countLabel('expense', items.length), moneyTotals(items)].filter(Boolean).join(' · ');
  }

  const reportLabels: Record<string, ApprovalQueueCopyKey> = {
    tasks: 'reportTasks',
    problems: 'reportProblems',
    blockers: 'reportBlockers',
    next_day: 'reportNextDay',
    safety: 'reportSafety',
    downtime: 'reportDowntime',
    change: 'reportChange',
    validation: 'reportValidation',
    risk: 'reportRisk',
    impact: 'reportImpact',
  };
  /** Label/text pairs for the in-queue report preview (server sends operational text only). */
  function reportDetail(row: Row): Array<[string, string]> {
    const detail = (row.report_detail ?? {}) as Record<string, unknown>;
    return Object.entries(reportLabels).flatMap(([key, label]) => {
      const raw = detail[key];
      if (raw === null || raw === undefined || String(raw).trim() === '') return [];
      const text = key === 'downtime' ? `${String(raw)} min` : String(raw);
      return [[t(label), text] as [string, string]];
    });
  }

  function statusVariant(state: unknown): 'success' | 'warning' | 'danger' | 'neutral' {
    const status = String(state ?? '');
    return status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'danger'
        : ['submitted', 'needs_changes'].includes(status)
          ? 'warning'
          : 'neutral';
  }

  // ---------- milestones & finance (secondary, only when present) ----------
  const financeReviewVisible = $derived(
    canSeeFinanceReview && ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(role),
  );
  const financeRows = $derived(financeReviewVisible ? (queue.finance.rows as Row[]) : []);
  function rowType(row: Row): Kind {
    return value(row, 'type') === 'expense' ? 'expense' : 'time';
  }
  function failedFinanceBillable(row: Row): string {
    return String(failedApprovalValues.id ?? '') === value(row, 'id')
      ? String(failedApprovalValues.billable ?? '')
      : '';
  }
  const queueEmpty = $derived(queue.summary.total === 0);
</script>

<div class="aq">
  <p class="aq-help">{ownerApprovalIncludesFinance ? t('helpOwner') : t('help')}</p>
  {#if queue.ownerOnlyTime}
    <p class="aq-help aq-owner-only" data-owner-only-time>
      {queue.ownerOnlyTime.count === 1
        ? t('ownerApprovesSupplierOne', { name: queue.ownerOnlyTime.ownerName })
        : t('ownerApprovesSupplier', {
            name: queue.ownerOnlyTime.ownerName,
            count: queue.ownerOnlyTime.count,
          })}
    </p>
  {/if}

  {#if approvalProblem}
    <div data-approval-problem tabindex="-1">
      <ProblemNotice
        problem={approvalProblem}
        status={approvalCurrentStatus}
        remedyLinks={approvalRemedyLinks}
        {locale}
      />
    </div>
  {/if}

  {#if lastAction}
    <p class="aq-done" data-tone={lastAction.tone} role="status" data-approval-last-action>
      <span aria-hidden="true">✓</span>
      {lastAction.text}
      <button type="button" class="aq-link" onclick={() => (lastAction = null)}
        >{translate('Dismiss notification')}</button
      >
    </p>
  {/if}

  {#if canDecide && approveAllTokens.length > 0}
    {@const allMatching = queue.approveAll.matching}
    {@const allBatch = queue.approveAll.batch}
    {@const allCount = allMatching.timeCount + allMatching.expenseCount}
    {#if !approveAllOpen}
      <div class="aq-all-row">
        <button
          type="button"
          class="aq-primary aq-all-button"
          onclick={openApproveAll}
          data-approve-all-open
          disabled={busyKey !== null}
        >
          {filtersActive ? t('approveAllMatching') : t('approveAll')}
        </button>
        <span class="aq-muted" data-approve-all-summary>{totalsSummary(allMatching)}</span>
      </div>
    {:else}
      <form
        class="aq-confirm aq-all-confirm"
        id={`approve-all-${componentId}`}
        tabindex="-1"
        method="POST"
        action="?/approveBatch"
        data-approve-all-confirm
        use:enhance={decide('all', totalsSummary(allBatch), 'approved')}
      >
        <strong class="aq-confirm-title">{t('approveAllTitle')}</strong>
        <p>{t('approveAllIntro')}</p>
        <div class="aq-all-table-wrap">
          <table class="aq-all-table">
            <thead>
              <tr>
                <th scope="col">{t('filterWorker')}</th>
                <th scope="col" class="aq-num">{t('tabTime')}</th>
                <th scope="col" class="aq-num">{t('tabExpenses')}</th>
              </tr>
            </thead>
            <tbody>
              {#each approveAllWorkers as worker (worker.workerId)}
                <tr data-approve-all-worker={worker.workerId}>
                  <th scope="row">
                    {personDisplayName(worker.workerName) || translate('Worker')}
                    <small
                      >{worker.projects.length > 2
                        ? t('projects', { count: worker.projects.length })
                        : worker.projects.join(', ')}</small
                    >
                  </th>
                  <td class="aq-num">
                    {#if worker.timeCount}
                      <strong>{hoursText(worker.minutes)}</strong>
                      <small>{countLabel('time', worker.timeCount)}</small>
                    {:else}—{/if}
                  </td>
                  <td class="aq-num">
                    {#if worker.expenseCount}
                      <strong
                        >{currencyText(worker.expenseTotals) ||
                          countLabel('expense', worker.expenseCount)}</strong
                      >
                      {#if worker.expenseTotals.length}<small
                          >{countLabel('expense', worker.expenseCount)}</small
                        >{/if}
                    {:else}—{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t('confirmTotal')}</th>
                <td class="aq-num">
                  {#if allBatch.timeCount}
                    <strong>{hoursText(allBatch.minutes)}</strong>
                    <small>{countLabel('time', allBatch.timeCount)}</small>
                  {:else}—{/if}
                </td>
                <td class="aq-num">
                  {#if allBatch.expenseCount}
                    <strong
                      >{currencyText(allBatch.expenseTotals) ||
                        countLabel('expense', allBatch.expenseCount)}</strong
                    >
                    {#if allBatch.expenseTotals.length}<small
                        >{countLabel('expense', allBatch.expenseCount)}</small
                      >{/if}
                  {:else}—{/if}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {#if allCount > approveAllTokens.length}
          <p class="aq-muted" data-approve-all-batch-note>
            {t('approveAllBatch', {
              shown: approveAllTokens.length,
              count: allCount,
              limit: APPROVE_ALL_LIMIT,
            })}
          </p>
        {/if}
        {#if queue.approveAll.ownExcluded > 0}
          <p class="aq-muted">
            {queue.approveAll.ownExcluded === 1
              ? t('ownExcludedOne')
              : t('ownExcluded', { count: queue.approveAll.ownExcluded })}
          </p>
        {/if}
        {#if ownerApprovalIncludesFinance}
          <p class="aq-muted">{t('confirmOwnerNote')}</p>
        {/if}
        {#each approveAllTokens as item (item)}
          <input type="hidden" name="item" value={item} />
        {/each}
        <div class="aq-sendback-actions">
          <button type="submit" class="aq-primary" disabled={busyKey !== null}>
            {busyKey === 'all'
              ? t('approving')
              : t('approveAllButton', { count: approveAllTokens.length })}
          </button>
          <button type="button" class="aq-secondary" onclick={closeApproveAll}>{t('cancel')}</button
          >
        </div>
      </form>
    {/if}
  {/if}

  <div class="approval-tabs" aria-label={t('tabsLabel')} role="tablist">
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        id={tabId(tab)}
        aria-selected={activeTab === tab}
        aria-controls={panelId()}
        tabindex={activeTab === tab ? 0 : -1}
        class:active={activeTab === tab}
        onclick={() => focusTab(tab)}
        onkeydown={(event) => handleTabKeydown(event, tab)}
      >
        <span>{tabLabel(tab)}</span>
        <strong class:zero={tabCount(tab) === 0}>{tabCount(tab)}</strong>
      </button>
    {/each}
  </div>

  <div
    id={panelId()}
    class="aq-panel"
    role="tabpanel"
    aria-labelledby={tabId(activeTab)}
    tabindex="-1"
  >
    <form
      class="aq-filters"
      role="search"
      aria-label={t('filters')}
      method="GET"
      onsubmit={applyFilters}
      data-approval-filters
    >
      <label class="aq-search">
        <span>{t('searchLabel')}</span>
        <input
          type="search"
          name="search"
          bind:value={searchText}
          autocomplete="off"
          maxlength="100"
          enterkeyhint="search"
        />
      </label>
      {#if showFilters}
        <button
          type="button"
          class="aq-secondary aq-filter-toggle"
          aria-expanded={filtersOpen || filtersActive}
          aria-controls={`aq-filter-fields-${componentId}`}
          onclick={() => (filtersOpen = !filtersOpen)}>{t('filters')}</button
        >
        <div
          class="aq-filter-fields"
          id={`aq-filter-fields-${componentId}`}
          class:is-open={filtersOpen || filtersActive}
        >
          <label>
            <span>{t('filterWeek')}</span>
            <select name="week" bind:value={weekFilter} onchange={() => applyFilters()}>
              <option value="">{t('allWeeks')}</option>
              {#each filterOptions.weeks as week (week)}<option value={week}
                  >{weekRange(week)}</option
                >{/each}
            </select>
          </label>
          <label>
            <span>{t('filterProject')}</span>
            <select name="project" bind:value={projectFilter} onchange={() => applyFilters()}>
              <option value="">{t('allProjects')}</option>
              {#each filterOptions.projects as [id, label] (id)}<option value={id}>{label}</option
                >{/each}
            </select>
          </label>
          <label>
            <span>{t('filterWorker')}</span>
            <select name="worker" bind:value={workerFilter} onchange={() => applyFilters()}>
              <option value="">{t('allWorkers')}</option>
              {#each filterOptions.workers as [id, label] (id)}<option value={id}
                  >{personDisplayName(label) || label}</option
                >{/each}
            </select>
          </label>
        </div>
      {/if}
      <div class="aq-filter-actions">
        <button type="submit" class="aq-secondary">{t('searchButton')}</button>
        {#if filtersActive}
          <button type="button" class="aq-link" onclick={clearFilters}>{t('clearFilters')}</button>
        {/if}
      </div>
    </form>
    {#if totalCount > 0}
      <p class="aq-scope" role="status" data-approval-scope>
        {activeTab === 'reports'
          ? t('showingReports', { shown: shownCount, count: totalCount })
          : t('showingWeeks', { shown: shownCount, count: totalCount })}
        {#if activeTab !== 'reports'}
          · {activeTab === 'time'
            ? `${hoursText(queue.matching.minutes)} · ${countLabel('time', queue.matching.timeCount)}`
            : [
                countLabel('expense', queue.matching.expenseCount),
                currencyText(queue.matching.expenseTotals),
              ]
                .filter(Boolean)
                .join(' · ')}
        {/if}
      </p>
    {/if}

    {#if activeTab !== 'reports'}
      {@const kind = activeTab === 'time' ? 'time' : 'expense'}
      {#if visibleGroups.length === 0}
        <p class="aq-empty" role="status">
          {filtersActive
            ? t('noMatches')
            : activeTab === 'time'
              ? t('emptyTime')
              : t('emptyExpenses')}
        </p>
      {:else}
        {#if canDecide && selectableGroups.length > 1}
          <div class="aq-select-row">
            <label class="aq-select-all">
              <input type="checkbox" checked={allSelected} onchange={toggleAll} />
              <span>{t('selectAll')}</span>
            </label>
            <!-- Only the weeks loaded on this page (after search/filters), never hidden ones. -->
            <button
              type="button"
              class="aq-secondary"
              onclick={approveAllVisible}
              disabled={visibleActionableCount > APPROVE_ALL_LIMIT}
              data-approve-visible
              >{t('approveAllVisible', {
                count: countLabel(kind, visibleActionableCount),
              })}</button
            >
            {#if visibleActionableCount > APPROVE_ALL_LIMIT}
              <small class="aq-muted"
                >{t('visibleTooMany', {
                  count: visibleActionableCount,
                  limit: APPROVE_ALL_LIMIT,
                })}</small
              >
            {/if}
          </div>
        {/if}
        <ul class="aq-groups" aria-live="polite">
          {#each visibleGroups as group (group.key)}
            {@const open = expanded[group.key] ?? false}
            <li
              class="aq-group"
              data-approval-group={group.key}
              class:is-selected={selected[group.key]}
            >
              <div class="aq-group-head">
                {#if canDecide && group.actionable.length > 0}
                  <input
                    class="aq-check"
                    type="checkbox"
                    aria-label={t('select', { label: groupTitle(group) })}
                    checked={selected[group.key] ?? false}
                    onchange={(event) => {
                      selected = {
                        ...selected,
                        [group.key]: (event.currentTarget as HTMLInputElement).checked,
                      };
                      confirmOpen = false;
                    }}
                  />
                {/if}
                <button
                  type="button"
                  class="aq-group-toggle"
                  aria-expanded={open}
                  aria-controls={`aq-days-${componentId}-${group.key}`}
                  onclick={() => (expanded = { ...expanded, [group.key]: !open })}
                >
                  <strong class="aq-group-title">{groupTitle(group)}</strong>
                  <span class="aq-group-facts">{groupFacts(group)}</span>
                  <span class="aq-group-more">{open ? t('hideDays') : t('showDays')}</span>
                </button>
                <div class="aq-group-action">
                  {#if !canDecide}
                    <span class="aq-muted">{t('readOnly')}</span>
                  {:else if group.actionable.length === 0}
                    <span class="aq-muted">{t('ownRecord')}</span>
                  {:else}
                    <form
                      method="POST"
                      action="?/approveBatch"
                      use:enhance={decide(
                        group.key,
                        `${groupTitle(group)} · ${groupFacts(group, group.actionable)}`,
                        'approved',
                      )}
                    >
                      {#each group.actionable as item (item.id)}
                        <input type="hidden" name="item" value={token(item)} />
                      {/each}
                      <button type="submit" class="aq-primary" disabled={busyKey !== null}>
                        {busyKey === group.key ? t('approving') : t('approveWeek')}
                      </button>
                    </form>
                  {/if}
                </div>
              </div>

              {#if open}
                <ul class="aq-days" id={`aq-days-${componentId}-${group.key}`}>
                  {#each group.items as item (item.id)}
                    <li class="aq-day" data-approval-row={item.id}>
                      <div class="aq-day-main">
                        <span class="aq-day-date">{dayLabel(item.date)}</span>
                        {#if kind === 'time'}
                          <span class="aq-day-amount">{hoursText(item.minutes)}</span>
                          <span class="aq-day-detail">
                            {categoryLabel(value(item.row, 'time_category'))}
                            {#if value(item.row, 'start_time') && value(item.row, 'end_time')}
                              · {value(item.row, 'start_time')}–{value(item.row, 'end_time')}
                            {/if}
                            {#if Number(value(item.row, 'break_minutes')) > 0}
                              · {t('breakMinutes', { minutes: value(item.row, 'break_minutes') })}
                            {/if}
                            · {item.projectName}
                            {#if value(item.row, 'activity_summary')}
                              <span class="aq-summary">{value(item.row, 'activity_summary')}</span>
                            {/if}
                          </span>
                        {:else}
                          {#if value(item.row, 'expense_currency')}
                            <span class="aq-day-amount"
                              >{money(
                                item.row.expense_amount_minor,
                                value(item.row, 'expense_currency'),
                                language,
                              )}</span
                            >
                          {/if}
                          <span class="aq-day-detail">
                            {controlledValue(
                              'expenseCategory',
                              value(item.row, 'expense_category'),
                            ) || value(item.row, 'expense_category')}
                            {#if value(item.row, 'expense_label')}· {value(
                                item.row,
                                'expense_label',
                              )}{/if}
                            · {item.projectName}
                          </span>
                          <span class="aq-receipt">
                            {#if value(item.row, 'receipt_document_id')}
                              <a href={receiptHref(item.row)} target="_blank" rel="noopener">
                                {#if value(item.row, 'receipt_media_type').startsWith('image/')}
                                  <img
                                    src={receiptHref(item.row)}
                                    alt={t('receipt')}
                                    loading="lazy"
                                    width="56"
                                    height="56"
                                    onerror={(event) =>
                                      ((event.currentTarget as HTMLImageElement).hidden = true)}
                                  />
                                  <span>{t('receipt')}</span>
                                {:else}
                                  <span>{t('receiptPdf')}</span>
                                {/if}
                              </a>
                            {:else}
                              <span class="aq-muted">{t('noReceipt')}</span>
                            {/if}
                          </span>
                        {/if}
                      </div>
                      <div class="aq-day-actions">
                        <a class="aq-link" href={recordHref(item.row)}>{t('open')}</a>
                        {#if canDecide && !item.own}
                          <button
                            type="button"
                            class="aq-secondary"
                            aria-expanded={sendBackFor === item.id}
                            onclick={() => (sendBackFor = sendBackFor === item.id ? null : item.id)}
                            >{t('sendBack')}</button
                          >
                        {/if}
                      </div>
                      {#if sendBackFor === item.id}
                        <form
                          class="aq-sendback"
                          method="POST"
                          action="?/approveRecord"
                          use:formValidation
                          use:enhance={decide(`back:${item.id}`, itemSummary(item), 'sentBack')}
                        >
                          <input type="hidden" name="type" value={item.type} />
                          <input type="hidden" name="id" value={item.id} />
                          <label>
                            <span>{t('sendBackReason')}</span>
                            <input
                              name="reason"
                              minlength="3"
                              maxlength="1000"
                              required
                              autocomplete="off"
                              value={String(failedApprovalValues.id ?? '') === item.id
                                ? String(failedApprovalValues.reason ?? '')
                                : ''}
                            />
                            <small>{t('sendBackHint')}</small>
                          </label>
                          <div class="aq-sendback-actions">
                            <button
                              type="submit"
                              name="decision"
                              value="needs_changes"
                              class="aq-primary"
                              disabled={busyKey !== null}>{t('sendBackSubmit')}</button
                            >
                            <button
                              type="button"
                              class="aq-secondary"
                              onclick={() => (sendBackFor = null)}>{t('cancel')}</button
                            >
                            <button
                              type="submit"
                              name="decision"
                              value="rejected"
                              class="aq-danger-link"
                              title={t('rejectHint')}
                              disabled={busyKey !== null}>{t('reject')}</button
                            >
                          </div>
                        </form>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else if visibleReports.length === 0}
      <p class="aq-empty" role="status">
        {filtersActive ? t('noMatches') : t('emptyReports')}
      </p>
    {:else}
      <ul class="aq-groups" aria-live="polite">
        {#each visibleReports as row (value(row, 'id'))}
          {@const reportSummary = `${value(row, 'type') === 'daily' ? t('daily') : t('technical')} · ${workerName(row)} · ${dayLabel(value(row, 'date'))}`}
          {@const reportOpen = expanded[`report:${value(row, 'id')}`] ?? false}
          {@const detail = reportDetail(row)}
          <li class="aq-group aq-report" data-approval-row={value(row, 'id')}>
            <div class="aq-group-head">
              <button
                type="button"
                class="aq-group-toggle"
                aria-expanded={reportOpen}
                aria-controls={`aq-report-${componentId}-${value(row, 'id')}`}
                data-report-read
                onclick={() =>
                  (expanded = { ...expanded, [`report:${value(row, 'id')}`]: !reportOpen })}
              >
                <strong class="aq-group-title">{reportSummary}</strong>
                <span class="aq-group-facts"
                  >{value(row, 'report_title') || t('untitled')} · {projectName(row)}</span
                >
                <span class="aq-group-more">{reportOpen ? t('hideReport') : t('readReport')}</span>
              </button>
              <div class="aq-group-action">
                {#if !canDecide}
                  <span class="aq-muted">{t('readOnly')}</span>
                {:else}
                  <form
                    method="POST"
                    action="?/reviewReport"
                    use:enhance={decide(`report:${value(row, 'id')}`, reportSummary, 'report')}
                  >
                    <input type="hidden" name="type" value={value(row, 'type')} />
                    <input type="hidden" name="id" value={value(row, 'id')} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit" class="aq-primary" disabled={busyKey !== null}
                      >{t('approveReport')}</button
                    >
                  </form>
                  <button
                    type="button"
                    class="aq-secondary"
                    aria-expanded={sendBackFor === value(row, 'id')}
                    onclick={() =>
                      (sendBackFor = sendBackFor === value(row, 'id') ? null : value(row, 'id'))}
                    >{t('sendBack')}</button
                  >
                {/if}
              </div>
            </div>
            {#if reportOpen}
              <div class="aq-report-detail" id={`aq-report-${componentId}-${value(row, 'id')}`}>
                {#if detail.length}
                  <dl>
                    {#each detail as [label, text] (label)}
                      <div>
                        <dt>{label}</dt>
                        <dd>{text}</dd>
                      </div>
                    {/each}
                  </dl>
                {:else}
                  <p class="aq-muted">{t('reportEmpty')}</p>
                {/if}
                <a class="aq-link" href={recordHref(row)}>{t('fullReport')}</a>
              </div>
            {/if}
            {#if sendBackFor === value(row, 'id')}
              <form
                class="aq-sendback"
                method="POST"
                action="?/reviewReport"
                use:formValidation
                use:enhance={decide(`back:${value(row, 'id')}`, reportSummary, 'sentBack')}
              >
                <input type="hidden" name="type" value={value(row, 'type')} />
                <input type="hidden" name="id" value={value(row, 'id')} />
                <input type="hidden" name="decision" value="needs_changes" />
                <label>
                  <span>{t('sendBackReason')}</span>
                  <input name="reason" minlength="3" maxlength="2000" required autocomplete="off" />
                  <small>{t('sendBackHint')}</small>
                </label>
                <div class="aq-sendback-actions">
                  <button type="submit" class="aq-primary" disabled={busyKey !== null}
                    >{t('sendBackSubmit')}</button
                  >
                  <button type="button" class="aq-secondary" onclick={() => (sendBackFor = null)}
                    >{t('cancel')}</button
                  >
                </div>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if shownCount < totalCount}
      <p class="aq-more-row">
        <a
          class="aq-secondary aq-show-more"
          href={queueHref({ show: shownCount + PENDING_PAGE_SIZE, view: null })}
          data-sveltekit-noscroll
          data-sveltekit-keepfocus
          data-approval-show-more>{t('showMore')}</a
        >
        <span class="aq-muted"
          >{activeTab === 'reports'
            ? t('showingReports', { shown: shownCount, count: totalCount })
            : t('showingWeeks', { shown: shownCount, count: totalCount })}</span
        >
      </p>
    {/if}

    {#if activeTab !== 'reports' && (queue.ownEntries?.count ?? 0) > 0}
      {@const own = queue.ownEntries!}
      <details class="aq-more" data-approval-own>
        <summary
          >{t('ownEntries', {
            summary:
              activeTab === 'time'
                ? `${countLabel('time', own.count)} · ${hoursText(own.minutes)}`
                : countLabel('expense', own.count),
          })}</summary
        >
        <ul class="aq-plain">
          {#each ownRows as row (value(row, 'id'))}
            <li><a href={recordHref(row)}>{rowSummary(row)}</a></li>
          {/each}
        </ul>
        {#if ownRows.length < own.count}
          <p class="aq-muted">{t('showing', { shown: ownRows.length, count: own.count })}</p>
        {/if}
      </details>
    {/if}

    {#if queue.waiting.count > 0}
      <details class="aq-more">
        <summary>{t('waiting', { count: queue.waiting.count })}</summary>
        <ul class="aq-plain">
          {#each waitingRows as row (value(row, 'id'))}
            <li>
              <a href={recordHref(row)}>{rowSummary(row)}</a>
              <StatusBadge
                variant={statusVariant(row.approval_state)}
                text={controlledValue('status', row.approval_state) || value(row, 'approval_state')}
              />
              {#if value(row, 'review_reason')}
                <small>{t('note')}: {value(row, 'review_reason')}</small>
              {/if}
            </li>
          {/each}
        </ul>
        {#if waitingRows.length < queue.waiting.count}
          <p class="aq-muted">
            {t('showing', { shown: waitingRows.length, count: queue.waiting.count })}
          </p>
        {/if}
      </details>
    {/if}

    <!-- Approved, not invoiced: a separate list, loaded only on request. -->
    {#if !approvedView}
      <p class="aq-more-row">
        <a
          class="aq-link"
          href={queueHref({ view: 'approved', show: null })}
          data-sveltekit-noscroll
          data-approved-open>{t('approvedOpen')}</a
        >
      </p>
    {:else}
      <section
        class="aq-more aq-approved"
        data-approved-list
        aria-labelledby={`aq-approved-${componentId}`}
      >
        <div class="aq-approved-head">
          <strong id={`aq-approved-${componentId}`}
            >{t('alreadyApproved', { count: queue.approved?.count ?? 0 })}</strong
          >
          <a class="aq-link" href={queueHref({ view: null, show: null })} data-sveltekit-noscroll
            >{t('approvedClose')}</a
          >
        </div>
        <p class="aq-muted">{t('alreadyApprovedHelp')}</p>
        {#if approvedRows.length === 0}
          <p class="aq-muted">{t('approvedEmpty')}</p>
        {:else}
          <ul class="aq-plain">
            {#each approvedRows as row (value(row, 'id'))}
              <li>
                <a href={recordHref(row)}>{rowSummary(row)} · {projectName(row)}</a>
                {#if canDecide && (value(row, 'review_stage') === 'correction' || ownerOverrideAllowed)}
                  <a class="aq-link" href={correctionHref(row)}>{t('correct')}</a>
                {/if}
              </li>
            {/each}
          </ul>
          {#if approvedRows.length < (queue.approved?.count ?? 0)}
            <p class="aq-more-row">
              <a
                class="aq-secondary aq-show-more"
                href={queueHref({ show: approvedRows.length + queue.pageSize })}
                data-sveltekit-noscroll
                data-sveltekit-keepfocus>{t('showMore')}</a
              >
              <span class="aq-muted"
                >{t('showing', {
                  shown: approvedRows.length,
                  count: queue.approved?.count ?? 0,
                })}</span
              >
            </p>
          {/if}
        {/if}
      </section>
    {/if}
  </div>

  {#if milestones.length > 0}
    <details class="aq-more" open={queueEmpty}>
      <summary>{t('milestones', { count: milestones.length })}</summary>
      <ul class="aq-groups">
        {#each milestones as milestone (value(milestone, 'id'))}
          <li class="aq-group" data-approval-milestone={value(milestone, 'id')}>
            <div class="aq-group-head">
              <a
                class="aq-group-toggle"
                href={`${base}/app/projects/${encodeURIComponent(value(milestone, 'project_id'))}`}
              >
                <strong class="aq-group-title"
                  >{value(milestone, 'project_number')} · {value(milestone, 'name')}</strong
                >
                <span class="aq-group-facts">{value(milestone, 'due_on') || t('noDueDate')}</span>
              </a>
              <div class="aq-group-action">
                {#if !canDecide}
                  <span class="aq-muted">{t('readOnly')}</span>
                {:else}
                  <form
                    method="POST"
                    action="?/reviewMilestone"
                    use:enhance={decide(
                      `milestone:${value(milestone, 'id')}`,
                      value(milestone, 'name'),
                      'approved',
                    )}
                  >
                    <input type="hidden" name="id" value={value(milestone, 'id')} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit" class="aq-primary" disabled={busyKey !== null}
                      >{t('approve')}</button
                    >
                  </form>
                  <button
                    type="button"
                    class="aq-secondary"
                    aria-expanded={sendBackFor === value(milestone, 'id')}
                    onclick={() =>
                      (sendBackFor =
                        sendBackFor === value(milestone, 'id') ? null : value(milestone, 'id'))}
                    >{t('rejectMilestone')}</button
                  >
                {/if}
              </div>
            </div>
            {#if sendBackFor === value(milestone, 'id')}
              <form
                class="aq-sendback"
                method="POST"
                action="?/reviewMilestone"
                use:formValidation
                use:enhance={decide(
                  `back:${value(milestone, 'id')}`,
                  value(milestone, 'name'),
                  'sentBack',
                )}
              >
                <input type="hidden" name="id" value={value(milestone, 'id')} />
                <input type="hidden" name="decision" value="rejected" />
                <label>
                  <span>{t('rejectReason')}</span>
                  <input name="reason" minlength="3" required autocomplete="off" />
                </label>
                <div class="aq-sendback-actions">
                  <button type="submit" class="aq-primary" disabled={busyKey !== null}
                    >{t('rejectMilestone')}</button
                  >
                  <button type="button" class="aq-secondary" onclick={() => (sendBackFor = null)}
                    >{t('cancel')}</button
                  >
                </div>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  {#if canSeeFinanceReview && financeReviewVisible && financeRows.length > 0}
    <details class="aq-more" id="finance-review" open={queueEmpty}>
      <summary>{t('financeReview', { count: financeRows.length })}</summary>
      <p class="aq-muted">
        {ownerApprovalIncludesFinance ? t('financeOwnerHelp') : t('financeHelp')}
      </p>
      <ul class="aq-groups">
        {#each financeRows as row (value(row, 'id'))}
          <li class="aq-group" data-finance-review-row={value(row, 'id')}>
            <div class="aq-group-head">
              <a class="aq-group-toggle" href={recordHref(row)}>
                <strong class="aq-group-title">{itemSummary(toItem(row))}</strong>
                <span class="aq-group-facts">{projectName(row)}</span>
              </a>
              <div class="aq-group-action">
                {#if rowType(row) === 'expense' && value(row, 'commercial_classification_state') !== 'classified'}
                  <span class="aq-finance-note" data-finance-classification-required>
                    {t('classifyFirst')}
                    <a class="aq-link" href={expenseClassificationHref(row)}>{t('classify')}</a>
                  </span>
                {:else if isAuditor}
                  <span class="aq-muted">{t('readOnly')}</span>
                {:else}
                  <form
                    method="POST"
                    action="?/financeApprove"
                    class="aq-finance-form"
                    use:formValidation
                    use:enhance={decide(
                      `finance:${value(row, 'id')}`,
                      itemSummary(toItem(row)),
                      'approved',
                    )}
                  >
                    <input type="hidden" name="type" value={rowType(row)} />
                    <input type="hidden" name="id" value={value(row, 'id')} />
                    {#if rowType(row) === 'time'}
                      <label>
                        <span>{t('treatment')}</span>
                        <select name="billable" value={failedFinanceBillable(row)} required>
                          <option value="" disabled>{t('chooseOption')}</option>
                          <option value="yes">{t('billable')}</option>
                          <option value="no">{t('nonBillable')}</option>
                        </select>
                      </label>
                    {/if}
                    <button type="submit" class="aq-primary" disabled={busyKey !== null}
                      >{t('recordFinance')}</button
                    >
                  </form>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  {#if canDecide && activeTab !== 'reports' && selectedGroups.length > 0}
    <div class="aq-bulk" role="region" aria-label={t('approveSelected')}>
      {#if confirmOpen}
        <form
          class="aq-confirm"
          id={`approval-confirm-${componentId}`}
          tabindex="-1"
          method="POST"
          action="?/approveBatch"
          use:enhance={decide('bulk', bulkSummary(selectedGroups), 'approved')}
        >
          <strong class="aq-confirm-title">{t('confirmTitle')}</strong>
          <p>{t('confirmIntro')}</p>
          <ul>
            {#each selectedGroups as group (group.key)}
              <li>{groupTitle(group)} · {groupFacts(group, group.actionable)}</li>
            {/each}
          </ul>
          <p class="aq-confirm-total">
            <strong>{t('confirmTotal')}:</strong>
            {selectionTotals()}
          </p>
          {#if ownerApprovalIncludesFinance}
            <p class="aq-muted">{t('confirmOwnerNote')}</p>
          {/if}
          {#each selectedItems as item (item.id)}
            <input type="hidden" name="item" value={token(item)} />
          {/each}
          {#if selectedItems.length > APPROVE_ALL_LIMIT}
            <p class="aq-muted">
              {t('visibleTooMany', { count: selectedItems.length, limit: APPROVE_ALL_LIMIT })}
            </p>
          {/if}
          <div class="aq-sendback-actions">
            <button
              type="submit"
              class="aq-primary"
              disabled={busyKey !== null || selectedItems.length > APPROVE_ALL_LIMIT}
            >
              {busyKey === 'bulk'
                ? t('approving')
                : t('confirmButton', {
                    count: countLabel(
                      activeTab === 'time' ? 'time' : 'expense',
                      selectedItems.length,
                    ),
                  })}
            </button>
            <button type="button" class="aq-secondary" onclick={() => (confirmOpen = false)}
              >{t('cancel')}</button
            >
          </div>
        </form>
      {:else}
        <span class="aq-bulk-text">
          <strong>{t('selected', { count: selectedGroups.length })}</strong>
          · {selectionTotals()}
        </span>
        <div class="aq-sendback-actions">
          <button type="button" class="aq-secondary" onclick={() => (selected = {})}
            >{t('clearSelection')}</button
          >
          <button type="button" class="aq-primary" onclick={openConfirm}
            >{t('approveSelectedCount', { count: selectedGroups.length })}</button
          >
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .aq {
    display: grid;
    gap: 1rem;
    padding-bottom: 6rem;
  }
  .aq-help {
    margin: 0;
    color: var(--ja-steel, #5b6573);
    max-width: 70ch;
  }
  .aq-muted {
    color: var(--ja-steel, #5b6573);
    font-size: 0.875rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .aq-done {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.75rem 1rem;
    border-radius: var(--ja-radius, 10px);
    border: 1px solid #9fd3b0;
    background: #eef9f1;
    color: #14532d;
    font-weight: 600;
  }
  .aq-done[data-tone='info'] {
    border-color: #f1c27d;
    background: #fff7e8;
    color: #6b3d00;
  }
  .aq-done .aq-link {
    margin-left: auto;
    font-weight: 500;
  }

  /* Tabs */
  .approval-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--ja-line, #d5dbe3);
    overflow-x: auto;
  }
  .approval-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 1rem;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--ja-steel, #5b6573);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .approval-tabs button.active {
    color: var(--ja-ink, #1c2430);
    border-bottom-color: var(--ja-red, #b3261e);
  }
  .approval-tabs strong {
    min-width: 1.6rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--ja-red, #b3261e);
    color: #fff;
    font-size: 0.8125rem;
    text-align: center;
  }
  .approval-tabs strong.zero {
    background: var(--ja-surface, #eef1f4);
    color: var(--ja-steel, #5b6573);
  }
  .approval-tabs button:focus-visible,
  .aq button:focus-visible,
  .aq a:focus-visible,
  .aq input:focus-visible,
  .aq select:focus-visible,
  .aq summary:focus-visible {
    outline: 3px solid var(--ja-focus-ring, #1f6feb);
    outline-offset: 2px;
  }

  .aq-panel {
    display: grid;
    gap: 0.75rem;
  }
  .aq-filters select,
  .aq-filters input[type='search'],
  .aq-sendback input,
  .aq-finance-form select {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: var(--ja-control-radius, 8px);
    background: var(--ja-white, #fff);
    font: inherit;
  }
  .aq-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem;
  }
  .aq-filters label {
    display: grid;
    gap: 0.25rem;
    flex: 1 1 11rem;
    max-width: 18rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .aq-filters .aq-search {
    flex: 2 1 16rem;
    max-width: 24rem;
  }
  .aq-filter-fields {
    display: contents;
  }
  .aq-filter-toggle {
    display: none;
  }
  .aq-filter-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .aq-scope {
    margin: 0;
    color: var(--ja-steel, #5b6573);
    font-size: 0.875rem;
  }
  .aq-more-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
  }
  .aq-show-more {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .aq-approved-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .aq-select-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .aq-empty {
    margin: 0;
    padding: 1.5rem 1rem;
    border: 1px dashed var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    color: var(--ja-steel, #5b6573);
    text-align: center;
  }
  .aq-select-all {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    font-weight: 600;
  }
  .aq-select-all input,
  .aq-check {
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
    flex: none;
  }

  /* Groups */
  .aq-groups,
  .aq-days,
  .aq-plain {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .aq-group {
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
  }
  .aq-group.is-selected {
    border-color: var(--ja-ink, #1c2430);
    box-shadow: 0 0 0 1px var(--ja-ink, #1c2430);
  }
  .aq-group-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
  }
  .aq .aq-group-toggle.aq-group-toggle {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    width: auto;
    display: grid;
    justify-items: start;
    justify-content: start;
    align-content: center;
    gap: 0.15rem;
    margin: 0;
    padding: 0.25rem 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 400;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transform: none;
  }
  .aq-group-title {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
  .aq-group-facts {
    color: var(--ja-steel, #5b6573);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .aq-group-more {
    color: var(--ja-teal, #0b6b78);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: underline;
  }
  .aq-group-action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    flex: none;
  }
  .aq-group-action form {
    margin: 0;
  }
  .aq-primary,
  .aq-secondary {
    min-height: 44px;
    padding: 0 1rem;
    border-radius: var(--ja-control-radius, 8px);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .aq-primary {
    border: 1px solid var(--ja-red, #b3261e);
    background: var(--ja-red, #b3261e);
    color: #fff;
  }
  .aq-secondary {
    border: 1px solid var(--ja-control-border, #b8c0cc);
    background: var(--ja-white, #fff);
    color: var(--ja-ink, #1c2430);
  }
  .aq-primary:disabled,
  .aq-secondary:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .aq-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 0.25rem;
    border: 0;
    background: none;
    color: var(--ja-teal, #0b6b78);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }
  .aq-danger-link {
    min-height: 44px;
    margin-left: auto;
    border: 0;
    background: none;
    color: var(--ja-danger, #c62828);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  /* Days inside a group */
  .aq-days {
    gap: 0;
    border-top: 1px solid var(--ja-line, #eef1f4);
  }
  .aq-day {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.75rem;
    align-items: center;
    padding: 0.6rem 1rem;
    border-top: 1px solid var(--ja-line, #eef1f4);
  }
  .aq-day:first-child {
    border-top: 0;
  }
  .aq-day-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    min-width: 0;
  }
  .aq-day-date {
    font-weight: 600;
    min-width: 7.5rem;
  }
  .aq-day-amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    min-width: 4rem;
  }
  .aq-day-detail {
    color: var(--ja-steel, #5b6573);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .aq-summary {
    display: block;
    color: var(--ja-ink, #1c2430);
  }
  .aq-day-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .aq-receipt a {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    color: var(--ja-teal, #0b6b78);
    font-weight: 600;
  }
  .aq-receipt img {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--ja-line, #d5dbe3);
  }
  .aq-sendback {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.5rem;
    margin: 0.25rem 0 0.5rem;
    padding: 0.75rem;
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-surface, #f6f8fa);
  }
  .aq-report .aq-sendback {
    margin: 0 1rem 1rem;
  }
  .aq-sendback label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }
  .aq-sendback small {
    color: var(--ja-steel, #5b6573);
    font-weight: 400;
  }
  .aq-sendback-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  /* Secondary lists */
  .aq-more {
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    padding: 0 1rem;
    background: var(--ja-white, #fff);
  }
  .aq-more > summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 600;
    cursor: pointer;
  }
  .aq-more[open] {
    padding-bottom: 1rem;
  }
  .aq-more .aq-groups {
    margin-top: 0.5rem;
  }
  .aq-plain li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }
  .aq-plain li small {
    flex-basis: 100%;
    color: var(--ja-steel, #5b6573);
  }
  .aq-plain a {
    color: var(--ja-ink, #1c2430);
  }
  .aq-finance-note {
    font-size: 0.9rem;
  }
  .aq-finance-form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem;
  }
  .aq-finance-form label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .aq-report-detail {
    display: grid;
    gap: 0.5rem;
    padding: 0.25rem 1rem 1rem;
  }
  .aq-report-detail dl {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }
  .aq-report-detail dl div {
    display: grid;
    grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr);
    gap: 0.75rem;
  }
  .aq-report-detail dt {
    font-weight: 650;
    color: var(--ja-text-secondary, #57574f);
  }
  .aq-report-detail dd {
    margin: 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  @media (max-width: 620px) {
    .aq-report-detail dl div {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }
  }

  /* Approve all hours and expenses */
  .aq-all-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .aq-all-button {
    min-height: 48px;
    font-size: 1rem;
  }
  .aq-all-confirm {
    margin-bottom: 1.25rem;
    padding: 1rem 1.25rem;
    border: 2px solid var(--ja-red, #b3261e);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
  }
  .aq-all-table-wrap {
    max-height: 50vh;
    overflow: auto;
  }
  .aq-all-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .aq-all-table th,
  .aq-all-table td {
    padding: 0.5rem 0.5rem;
    border-bottom: 1px solid var(--ja-border-subdued, #e5e5e0);
    text-align: left;
    vertical-align: top;
  }
  .aq-all-table thead th {
    font-size: 0.8125rem;
    color: var(--ja-text-secondary, #57574f);
  }
  .aq-all-table tfoot th,
  .aq-all-table tfoot td {
    border-bottom: 0;
    border-top: 2px solid var(--ja-ink, #1c2430);
  }
  .aq-all-table small {
    display: block;
    color: var(--ja-text-secondary, #57574f);
    font-weight: 400;
    font-size: 0.8125rem;
  }
  .aq-all-table .aq-num {
    text-align: right;
    white-space: nowrap;
  }
  @media (max-width: 620px) {
    .aq-all-confirm {
      padding: 0.85rem;
    }
    /* Keep the decision above the fixed phone navigation while the summary is on screen. */
    .aq-all-confirm .aq-sendback-actions {
      position: sticky;
      bottom: calc(4.2rem + 0.5rem + env(safe-area-inset-bottom, 0px));
      z-index: 2;
      padding: 0.5rem 0;
      background: var(--ja-white, #fff);
    }
    .aq-all-button,
    .aq-all-confirm .aq-sendback-actions button {
      flex: 1 1 100%;
      width: 100%;
    }
    .aq-all-table th,
    .aq-all-table td {
      padding: 0.45rem 0.25rem;
    }
  }

  /* Sticky bulk bar and in-page confirmation */
  .aq-bulk {
    position: sticky;
    bottom: 0.75rem;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-ink, #1c2430);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
  }
  .aq-confirm {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }
  .aq-confirm:focus {
    outline: none;
  }
  .aq-confirm-title {
    font-size: 1.1rem;
  }
  .aq-confirm p,
  .aq-confirm ul {
    margin: 0;
  }
  .aq-confirm ul {
    max-height: 30vh;
    overflow: auto;
    padding-left: 1.25rem;
  }

  @media (max-width: 760px) {
    .aq-filter-toggle {
      display: inline-flex;
      align-items: center;
    }
    .aq-filter-fields {
      display: none;
      width: 100%;
    }
    .aq-filter-fields.is-open {
      display: grid;
      gap: 0.75rem;
    }
    .aq-filters label,
    .aq-filters .aq-search {
      max-width: none;
    }
    .aq-group-head {
      flex-wrap: wrap;
      padding: 0.75rem;
    }
    .aq .aq-group-toggle.aq-group-toggle {
      flex: 1 1 0;
    }
    .aq-group-action {
      flex-basis: 100%;
      justify-content: stretch;
    }
    .aq-group-action form,
    .aq-group-action .aq-primary {
      flex: 1 1 auto;
      width: 100%;
    }
    .aq-group-action .aq-secondary {
      flex: 1 1 auto;
    }
    .aq-day {
      grid-template-columns: 1fr;
      padding: 0.6rem 0.75rem;
    }
    .aq-day-date {
      min-width: 0;
    }
    .aq-bulk {
      bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    }
    .aq-bulk .aq-sendback-actions {
      width: 100%;
    }
    .aq-bulk .aq-sendback-actions button {
      flex: 1 1 auto;
    }
  }

  /* The phone bottom navigation is fixed at 4.2rem (responsive.css); keep the bar above it. */
  @media (max-width: 620px) {
    .aq {
      padding-bottom: 10rem;
    }
    .aq-bulk {
      bottom: calc(4.2rem + 0.5rem + env(safe-area-inset-bottom, 0px));
      max-height: calc(100vh - 9rem);
      overflow: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aq * {
      scroll-behavior: auto;
    }
  }
</style>
