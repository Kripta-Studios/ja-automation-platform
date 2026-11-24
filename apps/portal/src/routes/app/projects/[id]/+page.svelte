<script lang="ts">
  import { minorDigitsFor } from '$lib/portal/payment-money';
  import ProjectInvoiceComposer from '$lib/portal/sections/ProjectInvoiceComposer.svelte';
  import { journeyText } from '$lib/portal/project-invoice-journey';
  import { projectUxRound2Text } from '$lib/portal/project-ux-round2-copy';
  import ProjectSiteFields from '$lib/portal/sections/ProjectSiteFields.svelte';
  import TimezoneSelect from '$lib/portal/ui/TimezoneSelect.svelte';
  import PermanentDeleteDialog from '$lib/portal/ui/PermanentDeleteDialog.svelte';
  import {
    projectCopy,
    projectPickLabel,
    type ProjectCopyKey,
  } from '$lib/portal/project-ux-round3-copy';
  import { hubText, type ProjectHubCopyKey } from '$lib/portal/project-hub-copy';
  import ProjectHubTeam from '$lib/portal/sections/ProjectHubTeam.svelte';
  import { personDisplayName } from '$lib/portal/display-name';
  import { isSystemAccount } from '$lib/portal/system-accounts';
  import ProjectHubLifecycle from '$lib/portal/sections/ProjectHubLifecycle.svelte';
  import { clientBillingIssues, clientBillingIssueText } from '$lib/portal/client-billing-issues';
  import type { ProjectHubData, HubMoney } from '$lib/server/project-hub';
  import { useAssistantPaneRequest } from '$lib/portal/assistant/surface-request.svelte';
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import PrintIcon from '$lib/portal/ui/PrintIcon.svelte';
  import PlanningCalendar from '$lib/portal/ui/PlanningCalendar.svelte';
  import ProjectBudgetInput from '$lib/portal/sections/ProjectBudgetInput.svelte';
  import ProjectEconomicsDefaults from '$lib/portal/sections/ProjectEconomicsDefaults.svelte';
  import ProjectBillingSetup from '$lib/portal/sections/ProjectBillingSetup.svelte';
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { afterNavigate, beforeNavigate, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { ResponsiveSheet, ToastRegion, formValidation, type ToastItem } from '$lib/portal/ui';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import { reportFormFieldErrors } from '$lib/portal/ui/form-validation';
  import type { ProblemData } from '$lib/problem/contract';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneActionMessage,
    standaloneText,
  } from '../../standalone-locale';
  import type { PortalLocale } from '$lib/portal-i18n';
  import {
    billingReadinessMessageKey,
    billingReadinessReviewPath,
  } from '$lib/portal/billing-readiness';
  import { formatDecimalHours } from '$lib/portal/sections/time-entry-actions';
  import { decimalHoursFromMinutes } from '$lib/portal/minute-hours';
  import {
    translateControlledValue,
    type ControlledValueDomain,
  } from '$lib/i18n/controlled-values';

  type Primitive = string | number | boolean | null | undefined;
  type Row = Record<string, Primitive>;
  type TabId = 'overview' | 'team' | 'hours' | 'expenses' | 'invoices' | 'reports' | 'settings';
  /** Old links (?tab=work|commercial|billing) keep working and land in the hub. */
  const legacyTabs: Record<string, TabId> = {
    work: 'overview',
    commercial: 'settings',
    billing: 'settings',
  };
  type FinancialProjection = {
    currency?: string;
    approvedCostMinor?: string | null;
    revenueCandidateMinor?: string | null;
    contributionMarginMinor?: string | null;
    contributionMarginBps?: string | null;
    invoicedMinor?: string | null;
    paidMinor?: string | null;
    receivableMinor?: string | null;
    approvedUnbilledWipMinor?: string | null;
    unapprovedWipMinor?: string | null;
    plannedMinutes?: number | null;
  };
  type ProjectOverview = {
    project: Row;
    workers: Row[];
    time: Row[];
    reports: Row[];
    expenses: Row[];
    planning: Row[];
    milestones: Row[];
    schedule: Row | null;
    actualMinutes: number;
    financial: FinancialProjection | null;
  };
  type BillingRule = Row & {
    id?: Primitive;
    stream_type?: Primitive;
    cadence_type?: Primitive;
    currency?: Primitive;
    status?: Primitive;
  };

  const allowedTabIds: readonly TabId[] = [
    'overview',
    'team',
    'hours',
    'expenses',
    'invoices',
    'reports',
    'settings',
  ];

  function resolveTabFromUrl(value: string | null, roleValue: unknown): TabId {
    const raw = value?.trim() ?? '';
    const candidate = legacyTabs[raw] ?? raw;
    if (!allowedTabIds.includes(candidate as TabId)) return 'overview';
    const tab = candidate as TabId;
    const commercialRole =
      roleValue === 'owner_admin' ||
      roleValue === 'finance_admin' ||
      roleValue === 'auditor_read_only';
    if (!commercialRole && tab === 'invoices') return 'overview';
    if (
      roleValue === 'worker' &&
      (tab === 'hours' || tab === 'expenses' || tab === 'settings')
    )
      return 'overview';
    if (!commercialRole && raw !== tab && tab === 'settings') return 'overview';
    return tab;
  }

  let { data, form } = $props();
  type DraftFailure = {
    success?: boolean;
    reasons?: Array<{ code?: string }>;
    billingRuleId?: string;
    periodStart?: string;
    periodEnd?: string;
  };
  type DetailForm = Partial<ProblemData> & {
    success?: boolean;
    action?: string;
    actionName?: string;
    values?: Record<string, string>;
  };
  // Consume only the failed response explicitly discarded with its person drafts.
  // A later response must remain visible, even for the same person action.
  let discardedPersonFeedback = $state.raw<unknown>(null);
  const visibleForm = $derived(form === discardedPersonFeedback ? null : form);
  const detailForm = $derived((visibleForm ?? null) as DetailForm | null);
  const problem = $derived(
    detailForm?.code && detailForm.messageKey && detailForm.correlationId
      ? (detailForm as ProblemData)
      : null,
  );
  let localeOverride = $state<PortalLocale | null>(null);
  let restoredTab = $state<{ projectId: string; tab: TabId } | null>(null);
  const historyTab = $derived(
    (page.state as { projectDetailTab?: { projectId: string; tab: TabId } }).projectDetailTab,
  );
  let activeTab = $derived(
    resolveTabFromUrl(
      (historyTab?.projectId === String(data.overview.project.id) ? historyTab.tab : null) ??
        page.url.searchParams.get('tab') ??
        (restoredTab?.projectId === String(data.overview.project.id) ? restoredTab.tab : null),
      data.user?.role,
    ),
  );
  function initiallyFailed(action: string): boolean {
    const submitted = form as DetailForm | null | undefined;
    return submitted?.success === false && submitted.actionName === action;
  }
  let editOpen = $state(initiallyFailed('updateProject'));
  let invoiceOpen = $state(initiallyFailed('createInvoiceDraft'));
  let saving = $state(false);
  let mounted = $state(false);
  let dismissedActionToastKey = $state('');
  let expenseCategoryFilter = $state('');
  let selectedPlanningDate = $state('');
  let tabButtons = $state<Partial<Record<TabId, HTMLButtonElement>>>({});
  let personDraftStatus = $state<(() => { dirty: boolean; pending: boolean }) | null>(null);
  let billingEditorKey = $state(0);
  let observedBillingSetup = '';
  function billingRouteIdentity(url: URL): string {
    const normalized = new URL(url);
    normalized.searchParams.delete('lang');
    normalized.searchParams.sort();
    return normalized.pathname + normalized.search;
  }
  $effect(() => {
    const current = `${billingRouteIdentity(page.url)}:${data.overview.project.id}:${data.billingSetup?.version ?? ''}`;
    if (observedBillingSetup && observedBillingSetup !== current && !personDraftStatus?.().pending)
      billingEditorKey++;
    observedBillingSetup = current;
  });
  function confirmPersonDraftDeparture(): boolean {
    const status = personDraftStatus?.();
    if (!status) return true;
    if (status.pending) return false;
    if (!status.dirty) return true;
    if (!window.confirm(t('Discard your unsaved changes? Your entered information will be lost.')))
      return false;
    const discarded = form as DetailForm | null | undefined;
    const action = discarded?.actionName ?? discarded?.action;
    if (
      discarded?.success === false &&
      (action === 'savePersonTerms' || action === 'savePeopleTerms')
    )
      discardedPersonFeedback = form;
    return true;
  }
  beforeNavigate((navigation) => {
    if (navigation.willUnload) return;
    if (
      navigation.from?.url.pathname === navigation.to?.url.pathname &&
      navigation.from?.url.search === navigation.to?.url.search
    )
      return;
    if (
      navigation.from &&
      navigation.to &&
      billingRouteIdentity(navigation.from.url) === billingRouteIdentity(navigation.to.url)
    ) {
      if (personDraftStatus?.().pending) navigation.cancel();
      return;
    }
    if (!confirmPersonDraftDeparture()) navigation.cancel();
  });
  let periodProblemContainer = $state<HTMLElement | undefined>(undefined);

  async function selectProjectPlanningDate(date: string): Promise<void> {
    selectedPlanningDate = date;
    await tick();
    const actions = document.getElementById('project-day-actions');
    actions?.scrollIntoView({ block: 'start' });
    actions?.focus({ preventScroll: true });
  }

  const locale = $derived(
    page.url.searchParams.has('lang')
      ? resolveStandaloneLocale(page.url.searchParams.get('lang'), data.locale)
      : (localeOverride ?? data.locale ?? resolveStandaloneLocale()),
  );
  const t = (key: string): string => standaloneText(locale, key);
  const pc = (key: ProjectCopyKey, params: Record<string, string | number> = {}): string =>
    projectCopy(locale, key, params);
  const projectUx2 = (
    key: Parameters<typeof projectUxRound2Text>[1],
    params?: Record<string, string | number>,
  ): string => projectUxRound2Text(locale, key, params);
  const controlled = (domain: ControlledValueDomain, value: unknown): string =>
    translateControlledValue(
      locale,
      domain,
      value === null || value === undefined ? null : String(value),
    );
  const overview = $derived(data.overview as ProjectOverview);
  const scheduleWeekdays = $derived([
    { label: projectUx2('monday'), minutes: overview.schedule?.monday_minutes },
    { label: projectUx2('tuesday'), minutes: overview.schedule?.tuesday_minutes },
    { label: projectUx2('wednesday'), minutes: overview.schedule?.wednesday_minutes },
    { label: projectUx2('thursday'), minutes: overview.schedule?.thursday_minutes },
    { label: projectUx2('friday'), minutes: overview.schedule?.friday_minutes },
  ]);
  const projectDocuments = $derived(data.documents as Row[]);
  const project = $derived(overview.project);
  const siteContact = $derived(
    (data.siteContacts ?? []).find(
      (contact) => String(contact.id) === String(project.onsite_contact_id),
    ) as Row | undefined,
  );
  const siteContactDirectoryHref = $derived(
    siteContact
      ? `${base}/app/projects?view=clients&client=${encodeURIComponent(String(siteContact.client_id))}&lang=${locale}`
      : '',
  );
  const role = $derived(String(data.user?.role ?? ''));
  const isOwner = $derived(role === 'owner_admin');
  const isWorker = $derived(role === 'worker');
  const h = (key: ProjectHubCopyKey, params: Record<string, string | number> = {}): string =>
    hubText(locale, key, params);
  useAssistantPaneRequest({
    url: () => page.url,
    panes: ['project-edit'],
    activate: () => {
      if (canEditProjectDetails) editOpen = true;
    },
    deactivate: () => {
      if (!initiallyFailed('updateProject')) editOpen = false;
    },
  });
  const isFinance = $derived(role === 'finance_admin');
  const isAuditor = $derived(role === 'auditor_read_only');
  // Project manager choices (P2): only active project managers (the server
  // rejects anyone else), shown by name; the e-mail only tells apart people
  // who share a name. The current manager stays listed so the form is honest.
  const managerChoices = $derived.by(() => {
    const currentId = String(project?.project_manager_id ?? '');
    const people = ((data.workers ?? []) as Array<Record<string, unknown>>)
      .filter(
        (worker) =>
          worker.role === 'project_manager' &&
          !isSystemAccount(worker) &&
          (String(worker.status ?? 'active') === 'active' || String(worker.id) === currentId),
      )
      .map((worker) => ({
        id: String(worker.id),
        name: personDisplayName(worker.name, worker.email),
        email: String(worker.email ?? ''),
        active: String(worker.status ?? 'active') === 'active',
      }));
    const counts = new SvelteMap<string, number>();
    for (const person of people) counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
    return people
      .map((person) => ({
        ...person,
        label: (counts.get(person.name) ?? 0) > 1 ? `${person.name} (${person.email})` : person.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
  const canViewCommercial = $derived(isOwner || isFinance || isAuditor);
  const canWriteFinance = $derived(isOwner || isFinance);
  // Owner edits every project detail; finance_admin edits the commercial fields only
  // (PO, contract, model, budgets, caps, client minimum). The server accepts both roles.
  const canEditProjectDetails = $derived(isOwner || isFinance);
  const commercialOnlyEdit = $derived(isFinance && !isOwner);
  const projectHref = $derived(
    `${base}/app/projects/${encodeURIComponent(String(data.overview.project.id))}`,
  );
  const readinessHref = $derived.by(() => {
    const failure = form as DraftFailure | null;
    return `${base}/app${billingReadinessReviewPath(
      (failure?.reasons ?? []).map((reason) => String(reason.code ?? '')),
      String(data.overview.project.id),
      {
        start: String(detailForm?.values?.periodStart ?? failure?.periodStart ?? ''),
        end: String(detailForm?.values?.periodEnd ?? failure?.periodEnd ?? ''),
      },
    )}`;
  });
  const remedyLinks = $derived({
    review_projects: { label: t('problem.remedy.reviewProjects'), href: base + '/app/projects' },
    review_updated_record: {
      label: t('problem.remedy.reviewUpdatedRecord'),
      href: projectHref,
      reload: true,
    },
    correct_field: { label: t('problem.remedy.correctField') },
    contact_owner: { label: t('problem.remedy.contactOwner') },
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: base + '/app/login' },
    ...(canWriteFinance
      ? {
          review_billing_setup: {
            label: t('Project billing setup'),
            href: projectHref + '?tab=billing#project-panel-billing',
          },
          review_person_terms: {
            label: t('problem.remedy.reviewPersonTerms'),
            href: projectHref + '?tab=billing#project-panel-billing',
          },
          review_pending_records: { label: t('Review pending records'), href: readinessHref },
        }
      : {}),
    ...(isOwner
      ? {
          review_project_status: {
            label: t('problem.remedy.reviewProjectStatus'),
            href: projectHref + '?tab=overview',
          },
        }
      : {}),
  });
  const failedProjectValues = $derived(
    detailForm?.success === false && detailForm.actionName === 'updateProject'
      ? (detailForm.values ?? {})
      : {},
  );
  function projectValue(name: string, fallback: string | number): string | number {
    return Object.hasOwn(failedProjectValues, name) ? (failedProjectValues[name] ?? '') : fallback;
  }
  const budgetTypes = [
    'none',
    'revenue',
    'purchase_order',
    'labor',
    'travel',
    'expense',
    'combined',
  ];
  const selectedBudgetType = $derived(
    String(projectValue('budgetType', display(project.budget_type, 'none'))),
  );
  function projectChecked(name: string, fallback: boolean): boolean {
    return detailForm?.success === false && detailForm.actionName === 'updateProject'
      ? Object.hasOwn(failedProjectValues, name)
      : fallback;
  }
  function confirmProjectRecovery(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      detailForm?.success !== false ||
      detailForm.actionName !== 'updateProject' ||
      !(event.target instanceof Element)
    )
      return;
    const link = event.target.closest<HTMLAnchorElement>(
      '[data-project-problem] a[data-sveltekit-reload]',
    );
    if (!link || new URL(link.href).pathname !== projectHref) return;
    if (saving || !window.confirm(t('Reload the latest project and discard your unsaved edits?')))
      event.preventDefault();
  }
  function projectFieldError(name: string): string {
    const key =
      detailForm?.actionName === 'updateProject' ? problem?.fieldErrors?.[name]?.[0] : null;
    return key ? t(key) : '';
  }
  const billingRules = $derived((data.billingRules ?? []) as BillingRule[]);
  const activeBillingRules = $derived(billingRules.filter((rule) => String(rule.enabled) === '1'));
  // The quick invoice flow (Billing → New invoice) prefilled with this project.
  const quickInvoiceHref = $derived(
    `${base}/app/billing?project=${encodeURIComponent(String(project.id))}&assistantSurface=invoice-create&lang=${locale}`,
  );
  const billingSetup = $derived(data.billingSetup ?? null);
  const finance = $derived(overview.financial);
  const periodProblem = $derived((data.periodProblem ?? null) as ProblemData | null);
  const periodValues = $derived(
    (data.periodValues ?? { periodStart: data.periodStart, periodEnd: data.periodEnd }) as {
      periodStart: string;
      periodEnd: string;
    },
  );
  const financePeriodStart = $derived(String(data.periodStart ?? ''));
  const financePeriodEnd = $derived(String(data.periodEnd ?? ''));
  const invoiceDraftStart = $derived(String(data.invoiceDraftStart ?? financePeriodStart));
  const invoiceDraftEnd = $derived(String(data.invoiceDraftEnd ?? financePeriodEnd));
  const draftFailure = $derived((form ?? null) as DraftFailure | null);
  const selectedDraftRuleId = $derived(
    detailForm?.success === false &&
      detailForm.actionName === 'createInvoiceDraft' &&
      detailForm.values?.billingRuleId
      ? detailForm.values.billingRuleId
      : draftFailure?.success === false && draftFailure.billingRuleId
        ? draftFailure.billingRuleId
        : String(activeBillingRules[0]?.id ?? ''),
  );
  const selectedDraftStart = $derived(
    detailForm?.success === false &&
      detailForm.actionName === 'createInvoiceDraft' &&
      detailForm.values?.periodStart
      ? detailForm.values.periodStart
      : draftFailure?.success === false && draftFailure.periodStart
        ? draftFailure.periodStart
        : invoiceDraftStart,
  );
  const selectedDraftEnd = $derived(
    detailForm?.success === false &&
      detailForm.actionName === 'createInvoiceDraft' &&
      detailForm.values?.periodEnd
      ? detailForm.values.periodEnd
      : draftFailure?.success === false && draftFailure.periodEnd
        ? draftFailure.periodEnd
        : invoiceDraftEnd,
  );
  let handledDraftFailure = '';
  $effect(() => {
    const failure = form as DraftFailure | null;
    if (failure?.success !== false || !failure.billingRuleId || !Array.isArray(failure.reasons))
      return;
    const key = `${failure.billingRuleId}:${failure.periodStart ?? ''}:${failure.periodEnd ?? ''}:${failure.reasons.map((reason) => reason.code ?? '').join(',')}`;
    if (key !== handledDraftFailure) {
      handledDraftFailure = key;
      invoiceOpen = true;
    }
  });
  const expenseCategories = $derived(
    [...new Set(overview.expenses.map((expense) => String(expense.category ?? '').trim()))]
      .filter(Boolean)
      .sort(),
  );
  const filteredExpenses = $derived(
    expenseCategoryFilter
      ? overview.expenses.filter(
          (expense) => String(expense.category ?? '') === expenseCategoryFilter,
        )
      : overview.expenses,
  );

  const tabs = $derived([
    { id: 'overview' as const, label: h('tabOverview') },
    { id: 'team' as const, label: h('tabTeam') },
    ...(isWorker
      ? []
      : [
          { id: 'hours' as const, label: h('tabHours') },
          { id: 'expenses' as const, label: h('tabExpenses') },
        ]),
    ...(canViewCommercial ? [{ id: 'invoices' as const, label: h('tabInvoices') }] : []),
    { id: 'reports' as const, label: h('tabReports') },
    ...(isWorker ? [] : [{ id: 'settings' as const, label: h('tabSettings') }]),
  ] satisfies Array<{ id: TabId; label: string }>);
  const hub = $derived(data.hub as ProjectHubData);
  const rawTabParam = $derived(page.url.searchParams.get('tab') ?? '');
  const settingsGroup = $derived(
    page.url.searchParams.get('group') ??
      (rawTabParam === 'billing' || page.url.searchParams.has('billingStep')
        ? 'billing'
        : rawTabParam === 'commercial'
          ? 'commercial'
          : ''),
  );
  const approvalsHref = $derived(
    `${base}/app/approvals?project=${encodeURIComponent(String(project.id))}&lang=${locale}`,
  );
  const expenseTotals = $derived.by((): HubMoney[] => {
    const totals = new SvelteMap<string, bigint>();
    for (const person of hub.expenses.people)
      for (const row of person.total)
        totals.set(row.currency, (totals.get(row.currency) ?? 0n) + BigInt(row.amountMinor));
    return [...totals].map(([currency, amount]) => ({ currency, amountMinor: amount.toString() }));
  });
  const pendingTotal = $derived(
    hub.pending.timeCount + hub.pending.expenseCount + hub.pending.reportCount,
  );
  function tabHref(tab: TabId, extra = ''): string {
    return `${projectHref}?tab=${tab}${extra}&lang=${locale}`;
  }
  function tabLink(event: MouseEvent, tab: TabId): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (selectTab(tab)) window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function hoursOverviewHref(workerId = ''): string {
    return `${base}/app/time?view=overview&period=this_month&project=${encodeURIComponent(String(project.id))}${workerId ? `&rworker=${encodeURIComponent(workerId)}` : ''}&lang=${locale}`;
  }
  function expensesOverviewHref(workerId = ''): string {
    return `${base}/app/expenses?view=overview&project=${encodeURIComponent(String(project.id))}${workerId ? `&worker=${encodeURIComponent(workerId)}` : ''}&lang=${locale}`;
  }
  function moneyList(list: readonly HubMoney[]): string {
    if (!list.length) return money('0', String(project.currency ?? 'USD'));
    return list.map((row) => money(row.amountMinor, row.currency)).join(' + ');
  }
  type AttentionItem = {
    id: string;
    tone: 'warn' | 'info';
    text: string;
    action?: string;
    href?: string;
    tab?: TabId;
    primary?: boolean;
  };
  const attention = $derived.by((): AttentionItem[] => {
    const items: AttentionItem[] = [];
    // Only promise "Review and approve" for what this viewer may approve
    // (PM: not their own records, not supplier-workforce time).
    const reviewable = hub.reviewable;
    const reviewableTotal = reviewable.timeCount + reviewable.expenseCount + reviewable.reportCount;
    if (!isWorker && reviewableTotal > 0)
      items.push({
        id: 'approvals',
        tone: 'warn',
        text: h('attApprovals', {
          hours: hours(reviewable.timeMinutes),
          expenses: reviewable.expenseCount,
          reports: reviewable.reportCount,
        }),
        action: h('attApprovalsAction'),
        href: approvalsHref,
        primary: true,
      });
    if (!isWorker && pendingTotal > reviewableTotal)
      items.push({
        id: 'approvals-others',
        tone: 'info',
        text: h('attApprovalsOthers', {
          hours: hours(hub.pending.timeMinutes - reviewable.timeMinutes),
          count: pendingTotal - reviewableTotal,
        }),
      });
    const fin = hub.finance;
    if (fin && canWriteFinance && (fin.unbilledMinutes > 0 || (fin.approvedUnbilledMinor !== '0' && fin.openDrafts === 0)))
      items.push({
        id: 'unbilled',
        tone: 'warn',
        text:
          fin.approvedUnbilledMinor !== '0'
            ? h('attUnbilled', {
                amount: money(fin.approvedUnbilledMinor, fin.currency),
                hours: hours(fin.unbilledMinutes),
              })
            : h('attUnbilledHoursOnly', { hours: hours(fin.unbilledMinutes) }),
        action: h('createInvoice'),
        href: quickInvoiceHref,
        primary: items.length === 0,
      });
    if (fin?.missingRate && canWriteFinance)
      items.push({
        id: 'rates',
        tone: 'warn',
        text: h('attMissingRate'),
        action: h('attMissingRateAction'),
        href: tabHref('team'),
        tab: 'team',
      });
    if (canWriteFinance && billingSetup?.issuingPrerequisites?.includes('billing_setup_required'))
      items.push({
        id: 'billing-setup',
        tone: 'warn',
        text: h('attBillingSetup'),
        action: h('attBillingSetupAction'),
        href: tabHref('settings', '&group=billing'),
      });
    if (fin && fin.openDrafts > 0)
      items.push({
        id: 'drafts',
        tone: 'info',
        text: h('attDrafts', { count: fin.openDrafts }),
        action: h('attDraftsAction'),
        href: tabHref('invoices'),
        tab: 'invoices',
      });
    if (fin && fin.overdue > 0)
      items.push({
        id: 'overdue',
        tone: 'warn',
        text: h('attOverdue', { count: fin.overdue }),
        action: h('attDraftsAction'),
        href: tabHref('invoices'),
        tab: 'invoices',
      });
    // Billing-data checks (shared with the client page and the invoice screen): which
    // client fields are missing, a J&A billing email, a PO that is just the project name.
    if (canWriteFinance && hub.clientBilling)
      for (const issue of clientBillingIssues(hub.clientBilling, {
        name: project.name,
        po_number: project.po_number,
      }))
        items.push({
          id: `billing-${issue.code}`,
          tone: 'warn',
          text: clientBillingIssueText(locale, issue),
          action: issue.code === 'po_equals_project_name' ? h('fixPo') : h('fixClient'),
          href:
            issue.code === 'po_equals_project_name'
              ? tabHref('settings', '&assistantPane=project-edit')
              : `${base}/app/clients/${encodeURIComponent(hub.clientBilling.clientId)}?lang=${locale}#client-settings-title`,
        });
    if (isOwner && !display(project.po_number, '') && !display(hub.clientPo, ''))
      items.push({
        id: 'po',
        tone: 'info',
        text: h('attNoPo'),
        action: h('attNoPoAction'),
        href: tabHref('settings', '&assistantPane=project-edit'),
      });
    if ((isOwner || role === 'project_manager') && hub.assignments.length === 0)
      items.push({
        id: 'team',
        tone: 'info',
        text: h('attNoTeam'),
        action: h('addPeople'),
        href: tabHref('team'),
        tab: 'team',
      });
    return items;
  });
  let hubToasts = $state<ToastItem[]>([]);
  function hubNotify(message: string, variant: 'success' | 'danger'): void {
    const id = `hub:${Date.now()}`;
    hubToasts = [
      ...hubToasts,
      {
        id,
        message,
        title: variant === 'success' ? t('Success') : t('Error'),
        variant,
        closeLabel: t('Dismiss notification'),
      },
    ];
    setTimeout(() => (hubToasts = hubToasts.filter((toast) => toast.id !== id)), 6000);
  }
  const financeExportUrl = $derived(
    base +
      '/app/api/projects/' +
      encodeURIComponent(String(project.id)) +
      '/finance-export?periodStart=' +
      financePeriodStart +
      '&periodEnd=' +
      financePeriodEnd +
      '&locale=' +
      encodeURIComponent(locale),
  );
  const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let financeExportProblem = $state<ProblemData | null>(null);
  let financeExportBusy = $state(false);
  let exportPeriodStart = $state('');
  let exportPeriodEnd = $state('');
  let financeExportController: AbortController | null = null;
  let financeExportDisposed = false;
  let financeExportObjectUrls: Array<{ url: string; timer: number }> = [];
  const financeExportRemedyLinks = $derived({
    review_finance_period: {
      label: t('problem.projectFinanceExport.reviewPeriod'),
      href: '#finance-export-period-fields',
    },
    retry_finance_export: {
      label: t('problem.projectFinanceExport.retry'),
      href: '#finance-export-button',
    },
    sign_in_again: { label: t('problem.remedy.signInAgain'), href: base + '/app/login' },
    contact_owner: { label: t('problem.remedy.contactAccessOwner') },
  });
  const financeExportPeriodIssue = $derived(
    financeExportProblem?.code.startsWith('PROJECT_FINANCE_EXPORT_PERIOD_') ?? false,
  );
  function cancelFinanceExport(): void {
    financeExportController?.abort();
    financeExportController = null;
    financeExportBusy = false;
    for (const item of financeExportObjectUrls) {
      clearTimeout(item.timer);
      URL.revokeObjectURL(item.url);
    }
    financeExportObjectUrls = [];
  }
  beforeNavigate(cancelFinanceExport);
  onDestroy(() => {
    financeExportDisposed = true;
    cancelFinanceExport();
  });
  const financeExportNetworkProblem = (): ProblemData => ({
    code: 'PROJECT_FINANCE_EXPORT_NETWORK_UNAVAILABLE',
    messageKey: 'problem.projectFinanceExport.networkUnavailable',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'retry_finance_export' }],
    correlationId: '',
  });
  const financeExportSignInProblem = (): ProblemData => ({
    code: 'PROJECT_FINANCE_EXPORT_SIGN_IN_REQUIRED',
    messageKey: 'problem.projectFinanceExport.signInRequired',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'sign_in_again' }],
    correlationId: '',
  });
  function parsedFinanceExportProblem(payload: unknown): ProblemData {
    if (!payload || typeof payload !== 'object') return financeExportNetworkProblem();
    const candidate = payload as Partial<ProblemData>;
    if (
      typeof candidate.code !== 'string' ||
      !candidate.code.startsWith('PROJECT_FINANCE_EXPORT_') ||
      typeof candidate.messageKey !== 'string' ||
      !candidate.messageKey.startsWith('problem.projectFinanceExport.')
    )
      return financeExportNetworkProblem();
    return {
      code: candidate.code,
      messageKey: candidate.messageKey as ProblemData['messageKey'],
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      params: candidate.params && typeof candidate.params === 'object' ? candidate.params : {},
      fieldErrors:
        candidate.fieldErrors && typeof candidate.fieldErrors === 'object'
          ? candidate.fieldErrors
          : {},
      remedies: Array.isArray(candidate.remedies) ? candidate.remedies : [],
      correlationId: typeof candidate.correlationId === 'string' ? candidate.correlationId : '',
    };
  }
  function financeExportFilename(disposition: string | null): string {
    const match = disposition?.match(/filename=(?:"([^"]+)"|([^;]+))/iu);
    const suggested = (match?.[1] ?? match?.[2] ?? '').trim();
    const safe = suggested
      .replace(/[<>:"/\\|?*]/gu, '_')
      .replace(/\p{Cc}/gu, '_')
      .slice(0, 160);
    return safe && safe.toLowerCase().endsWith('.xlsx') ? safe : 'Project-finance.xlsx';
  }
  function showFinanceExportProblem(problem: ProblemData): void {
    if (financeExportDisposed) return;
    exportPeriodStart = financePeriodStart;
    exportPeriodEnd = financePeriodEnd;
    financeExportProblem = problem;
    void tick().then(() => {
      if (financeExportDisposed) return;
      requestAnimationFrame(() => {
        if (financeExportDisposed || !financeExportProblem) return;
        const notice = document.querySelector<HTMLElement>(
          '[data-finance-export-problem] [data-ui="problem-notice"]',
        );
        if (!notice) return;
        notice.focus({ preventScroll: true });
        const bounds = notice.getBoundingClientRect();
        const headerClearance = 88;
        if (bounds.top < headerClearance) window.scrollBy(0, bounds.top - headerClearance);
        else if (bounds.bottom > window.innerHeight - 24)
          window.scrollBy(0, bounds.bottom - (window.innerHeight - 24));
      });
    });
  }
  async function downloadFinanceExport(href: string): Promise<void> {
    if (financeExportBusy || financeExportDisposed) return;
    const controller = new AbortController();
    financeExportController = controller;
    const current = (): boolean =>
      !financeExportDisposed &&
      financeExportController === controller &&
      !controller.signal.aborted;
    financeExportBusy = true;
    financeExportProblem = null;
    try {
      const response = await fetch(href, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!current()) return;
      const type = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (
        response.redirected &&
        new URL(response.url).origin === location.origin &&
        new URL(response.url).pathname.endsWith('/app/login')
      ) {
        showFinanceExportProblem(financeExportSignInProblem());
        return;
      }
      if (!response.ok) {
        const payload = type.includes('json') ? await response.json().catch(() => null) : null;
        if (current()) showFinanceExportProblem(parsedFinanceExportProblem(payload));
        return;
      }
      if (!type.startsWith(xlsxContentType)) {
        showFinanceExportProblem(financeExportNetworkProblem());
        return;
      }
      const file = await response.blob();
      if (!current()) return;
      if (!file.size) {
        showFinanceExportProblem(financeExportNetworkProblem());
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = financeExportFilename(response.headers.get('content-disposition'));
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          financeExportObjectUrls = financeExportObjectUrls.filter(
            (item) => item.url !== objectUrl,
          );
        }, 60_000);
        financeExportObjectUrls.push({ url: objectUrl, timer });
      }
    } catch {
      if (current()) showFinanceExportProblem(financeExportNetworkProblem());
    } finally {
      if (financeExportController === controller) {
        financeExportController = null;
        financeExportBusy = false;
      }
    }
  }

  function display(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    return String(value);
  }

  function percentageFromBps(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    let bps: bigint;
    try {
      bps = BigInt(raw);
    } catch {
      return '—';
    }
    const negative = bps < 0n;
    const absolute = negative ? -bps : bps;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole.toString()}.${fraction}%`;
  }

  function money(minor: unknown, currency = String(project.currency ?? 'USD')): string {
    const raw = String(minor ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    let value: bigint;
    try {
      value = BigInt(raw);
    } catch {
      return '—';
    }
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const digits = minorDigitsFor(currency);
    const scale = 10n ** BigInt(digits);
    const major = absolute / scale;
    const cents = (absolute % scale).toString().padStart(digits, '0');
    const numberLocale = locale === 'pt' ? 'pt-BR' : locale;
    const numberFormat = new Intl.NumberFormat(numberLocale, { useGrouping: true });
    const group =
      numberFormat.formatToParts(1234567).find((part) => part.type === 'group')?.value ?? ',';
    const groupedMajor = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
    const decimal = locale === 'en' ? '.' : ',';
    return (negative ? '-' : '') + currency + ' ' + groupedMajor + (digits ? decimal + cents : '');
  }

  function hours(minutes: unknown): string {
    return formatDecimalHours(minutes);
  }

  function formatProjectDate(value: unknown, fallback = '—'): string {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return raw;
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime())
      ? raw
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  }

  function formatProjectTimestamp(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '—';
    const timestamp = /(?:z|[+-]\d{2}:\d{2})$/iu.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? raw
      : new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(date);
  }

  function expenseAmount(row: Row): string {
    return money(row.amount_minor, String(row.currency ?? project.currency ?? 'USD'));
  }

  function status(value: unknown): string {
    return controlled('status', value) || display(value, t('Not configured'));
  }

  function reportType(value: unknown): string {
    return String(value).toUpperCase() === 'PLC' ? t('Technical / PLC') : t('Daily');
  }

  function submitForm(): void {
    saving = true;
  }

  type ActionFeedback = {
    success?: boolean;
    messageKey?: unknown;
  };

  const actionFeedback = $derived(problem ? null : standaloneActionMessage(locale, visibleForm));
  const actionResult = $derived((visibleForm ?? null) as ActionFeedback | null);
  const actionFeedbackKey = $derived(
    actionFeedback
      ? `${actionResult?.success === true ? 'success' : 'error'}:${String(actionResult?.messageKey ?? actionFeedback)}`
      : '',
  );
  const actionToastVisible = $derived(
    Boolean(mounted && actionFeedbackKey && dismissedActionToastKey !== actionFeedbackKey),
  );
  const actionToasts = $derived<ToastItem[]>(
    actionToastVisible && actionFeedback
      ? [
          {
            id: `project-action:${actionFeedbackKey}`,
            message: actionFeedback,
            title: actionResult?.success === true ? t('Success') : t('Error'),
            variant: actionResult?.success === true ? 'success' : 'danger',
            closeLabel: t('Dismiss notification'),
          },
        ]
      : [],
  );

  function dismissActionToast(): void {
    dismissedActionToastKey = actionFeedbackKey;
  }

  const tabStateKey = (): string =>
    `ja-project-tab:${String(data.overview.project.id)}:${String(data.user.id)}`;
  const scrollStateKey = (): string =>
    `ja-project-scroll:${String(data.overview.project.id)}:${String(data.user.id)}`;
  const periodScrollStateKey = (): string =>
    `ja-project-period-scroll:${String(data.overview.project.id)}:${String(data.user.id)}`;
  let inMemoryScrollState: string | null = null;
  let inMemoryPeriodScroll: string | null = null;
  function readSessionState(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      // Storage may be blocked; the URL and component state still retain the active tab.
      return null;
    }
  }
  function writeSessionState(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Storage is optional for form submission and navigation.
    }
  }
  function removeSessionState(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // The in-memory scroll snapshot is cleared independently below.
    }
  }
  function rememberPeriodScroll(): void {
    inMemoryPeriodScroll = JSON.stringify({ top: window.scrollY, at: Date.now() });
    writeSessionState(periodScrollStateKey(), inMemoryPeriodScroll);
  }
  function restorePeriodScroll(): void {
    const saved = readSessionState(periodScrollStateKey()) ?? inMemoryPeriodScroll;
    removeSessionState(periodScrollStateKey());
    inMemoryPeriodScroll = null;
    if (!saved) return;
    try {
      const position = JSON.parse(saved) as { top?: unknown; at?: unknown };
      if (
        typeof position.top === 'number' &&
        Number.isFinite(position.top) &&
        typeof position.at === 'number' &&
        Date.now() - position.at < 300_000
      )
        window.scrollTo({ top: Math.max(0, position.top), behavior: 'instant' });
    } catch {
      // A malformed snapshot must not interrupt correction guidance.
    }
  }
  let periodRecoveryGeneration = 0;
  function recoverPeriodProblem(): void {
    const container = periodProblemContainer;
    if (!periodProblem || !container) return;
    const generation = ++periodRecoveryGeneration;
    void tick().then(() =>
      setTimeout(
        () =>
          requestAnimationFrame(() => {
            if (generation !== periodRecoveryGeneration || !container.isConnected || !periodProblem)
              return;
            restorePeriodScroll();
            requestAnimationFrame(() => {
              if (
                generation !== periodRecoveryGeneration ||
                !container.isConnected ||
                !periodProblem
              )
                return;
              const notice = container.querySelector<HTMLElement>('[data-ui="problem-notice"]');
              if (!notice) return;
              notice.focus({ preventScroll: true });
              const bounds = notice.getBoundingClientRect();
              const topInset = 80;
              const bottomInset = 24;
              if (bounds.top < topInset)
                window.scrollBy({ top: bounds.top - topInset, behavior: 'instant' });
              else if (bounds.bottom > window.innerHeight - bottomInset)
                window.scrollBy({
                  top: bounds.bottom - window.innerHeight + bottomInset,
                  behavior: 'instant',
                });
            });
          }),
        0,
      ),
    );
  }
  $effect(() => {
    if (periodProblem && periodProblemContainer) recoverPeriodProblem();
    else if (!periodProblem) {
      removeSessionState(periodScrollStateKey());
      inMemoryPeriodScroll = null;
    }
  });
  // Kit can reset focus and scroll after rendering a same-route GET result.
  afterNavigate(() => {
    if (periodProblem) recoverPeriodProblem();
    else {
      removeSessionState(periodScrollStateKey());
      inMemoryPeriodScroll = null;
    }
  });
  function rememberDetailScroll(): void {
    const sheet = document.querySelector<HTMLElement>(
      '.project-edit-sheet .responsive-sheet-body, .project-invoice-sheet .responsive-sheet-body',
    );
    inMemoryScrollState = JSON.stringify({
      top: window.scrollY,
      sheetTop: sheet?.scrollTop ?? null,
      sheetKind: sheet?.closest('.project-edit-sheet') ? 'edit' : sheet ? 'invoice' : null,
      at: Date.now(),
    });
    writeSessionState(scrollStateKey(), inMemoryScrollState);
  }
  function restoreDetailScroll(): void {
    const saved = readSessionState(scrollStateKey()) ?? inMemoryScrollState;
    if (saved === null) return;
    removeSessionState(scrollStateKey());
    inMemoryScrollState = null;
    try {
      const position = JSON.parse(saved) as {
        top?: unknown;
        sheetTop?: unknown;
        sheetKind?: unknown;
        at?: unknown;
      };
      if (
        typeof position.top === 'number' &&
        Number.isFinite(position.top) &&
        typeof position.at === 'number' &&
        Date.now() - position.at < 300_000
      ) {
        const sheetSelector =
          position.sheetKind === 'edit'
            ? '.project-edit-sheet .responsive-sheet-body'
            : position.sheetKind === 'invoice'
              ? '.project-invoice-sheet .responsive-sheet-body'
              : null;
        const sheetTop = typeof position.sheetTop === 'number' ? position.sheetTop : null;
        requestAnimationFrame(() => {
          window.scrollTo({ top: position.top as number, behavior: 'auto' });
          if (sheetSelector && sheetTop !== null) {
            const sheet = document.querySelector<HTMLElement>(sheetSelector);
            if (sheet) sheet.scrollTop = sheetTop;
          }
        });
      }
    } catch {
      // A malformed position must not interrupt form recovery.
    }
  }
  const submitDetail: SubmitFunction = ({ formElement }) => {
    const isProjectUpdate = formElement.getAttribute('action')?.startsWith('?/updateProject');
    rememberDetailScroll();
    return async ({ result, update }) => {
      try {
        await update({ reset: false, invalidateAll: true });
        if (isProjectUpdate && result.type === 'success') editOpen = false;
      } finally {
        saving = false;
        restoreDetailScroll();
      }
    };
  };
  let handledProblemId = '';
  $effect(() => {
    const id = problem?.correlationId;
    if (!id || id === handledProblemId) return;
    handledProblemId = id;
    saving = false;
    const action = detailForm?.actionName;
    const personDrafts = personDraftStatus?.();
    const preserveBillingDrafts =
      action === 'updateProject' && (personDrafts?.dirty || personDrafts?.pending);
    if (action === 'updateProject') editOpen = true;
    if (action === 'createInvoiceDraft') invoiceOpen = true;
    if (
      action === 'saveBillingSetup' ||
      action === 'savePersonTerms' ||
      action === 'savePeopleTerms' ||
      action === 'createInvoiceDraft'
    )
      restoredTab = { projectId: String(data.overview.project.id), tab: action === 'createInvoiceDraft' ? 'invoices' : 'settings' };
    else if (
      action === 'submitMilestone' ||
      (action === 'updateProject' && !preserveBillingDrafts) ||
      action === 'deleteProject'
    )
      restoredTab = {
        projectId: String(data.overview.project.id),
        tab: action === 'submitMilestone' ? 'overview' : 'settings',
      };
    if (action === 'savePersonTerms' || action === 'savePeopleTerms') return;
    void tick().then(() => {
      const formElement = action
        ? document.querySelector<HTMLFormElement>(`form[action*="/${action}"]`)
        : null;
      if (formElement && problem.fieldErrors)
        reportFormFieldErrors(
          formElement,
          action === 'saveProjectPersonDefaults'
            ? Object.fromEntries(
                Object.entries(problem.fieldErrors).filter(([field]) => field !== 'effectiveFrom'),
              )
            : problem.fieldErrors,
        );
      const target =
        formElement?.querySelector<HTMLElement>('[data-validation-summary]') ??
        formElement?.querySelector<HTMLElement>('[data-defaults-validation-summary]') ??
        document.querySelector<HTMLElement>('[data-project-problem] [data-ui="problem-notice"]');
      target?.focus({ preventScroll: true });
    });
  });

  function selectTab(tab: TabId): boolean {
    if (tab === activeTab) return true;
    if (!confirmPersonDraftDeparture()) return false;
    restoredTab = { projectId: String(data.overview.project.id), tab };
    writeSessionState(tabStateKey(), tab);
    const url = new URL(page.url);
    url.searchParams.set('tab', tab);
    // Shallow replacement updates page.state, while page.url retains the last
    // loaded URL. Keep the visible panel in the same history entry as its URL.
    replaceState(url, {
      ...page.state,
      projectDetailTab: { projectId: String(data.overview.project.id), tab },
    });
    return true;
  }

  async function handleTabKeydown(event: KeyboardEvent, current: TabId): Promise<void> {
    const index = tabs.findIndex((tab) => tab.id === current);
    if (index < 0) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    if (!selectTab(next.id)) return;
    await tick();
    tabButtons[next.id]?.focus();
  }

  function printReport(): void {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.print();
  }

  onMount(() => {
    mounted = true;
    const warnPersonDraftUnload = (event: BeforeUnloadEvent) => {
      const status = personDraftStatus?.();
      if (status?.dirty || status?.pending) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnPersonDraftUnload);
    if (problem) void tick().then(restoreDetailScroll);
    if (!page.url.searchParams.has('tab')) {
      const savedTab = readSessionState(tabStateKey());
      if (savedTab && allowedTabIds.includes(savedTab as TabId))
        restoredTab = {
          projectId: String(data.overview.project.id),
          tab: resolveTabFromUrl(savedTab, data.user?.role),
        };
    }
    localeOverride = resolveStandaloneLocale(page.url.searchParams.get('lang'), data.locale);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ja.portal.locale' || event.key === 'ja-portal-locale')
        localeOverride = resolveStandaloneLocale(event.newValue);
    };
    const onSubmit = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('[data-project-detail]') ||
        target?.matches('.project-edit-form, .invoice-draft-form')
      )
        rememberDetailScroll();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', rememberDetailScroll);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener('beforeunload', warnPersonDraftUnload);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', rememberDetailScroll);
      document.removeEventListener('submit', onSubmit, true);
    };
  });
  $effect(() => {
    if (!mounted) return;
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
</script>

<svelte:window onclickcapture={confirmProjectRecovery} />

<svelte:head>
  <title>{display(project.project_number)} · {display(project.name)} | J&A Automation</title>
</svelte:head>

<main class="project-detail-page" data-project-detail data-role={role}>
  <nav class="project-breadcrumb no-print" aria-label={t('Project navigation')}>
    <a href={base + '/app/projects'} data-origin-back
      ><DirectionIcon direction="left" /> {t('Projects')}</a
    >
    <span aria-hidden="true">/</span>
    <span aria-current="page">{display(project.project_number)}</span>
    <div class="project-breadcrumb-actions">
      <button type="button" class="quiet-button" onclick={printReport}>
        <PrintIcon />
        {t('Print report')}
      </button>
    </div>
  </nav>

  {#if problem && (detailForm?.actionName !== 'updateProject' || !canEditProjectDetails) && (detailForm?.actionName !== 'createInvoiceDraft' || !canWriteFinance)}
    <div data-project-problem>
      <ProblemNotice
        {problem}
        {remedyLinks}
        kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
      />
    </div>
  {/if}

  {#if actionFeedback && !actionToastVisible}
    <p
      class:success={actionResult?.success}
      class="project-action-message"
      data-project-action-message
      role="status"
      aria-live="polite"
    >
      {actionFeedback}
    </p>
  {/if}

  <header class="project-context hub-header" data-project-hub-header>
    <div class="hub-header__identity">
      <p class="hub-header__ref">{projectPickLabel(project)}</p>
      <h1>{display(project.name, t('Project'))}</h1>
      <p class="project-context-meta">
        {#if !isWorker && project.client_id}
          <a
            class="project-context-client-link"
            data-hub-client-link
            href={`${base}/app/clients/${encodeURIComponent(String(project.client_id))}?lang=${encodeURIComponent(locale)}`}
            >{display(project.client_name, t('Client'))}</a
          >
        {:else}
          {display(project.client_name)}
        {/if}
        · {display(display(project.site_name, '') || project.site_location, h('noSite'))}
        · {h('projectManager')}: {hub.managerName ?? h('noManager')}
      </p>
    </div>
    <div class="project-context-actions">
      <span class="state-badge" data-state={String(project.status ?? 'unknown')}
        >{status(project.status)}</span
      >
    </div>
  </header>

  <section class="hub-figures" aria-label={t('Project status summary')} data-hub-figures>
    <a class="hub-figure" href={tabHref('hours')} onclick={(event) => tabLink(event, 'hours')}>
      <span>{h('figHoursMonth')}</span>
      <strong data-hub-fig-hours>{hours(hub.hours.monthMinutes)}</strong>
      <small>{h('figHoursTotal', { hours: hours(hub.hours.totalMinutes) })}</small>
    </a>
    {#if hub.finance}
      <a
        class="hub-figure"
        class:hub-figure--attention={hub.finance.unbilledMinutes > 0}
        href={canWriteFinance ? quickInvoiceHref : tabHref('invoices')}
      >
        <span>{h('figUnbilled')}</span>
        <strong data-hub-fig-unbilled
          >{money(hub.finance.approvedUnbilledMinor, hub.finance.currency)}</strong
        >
        <small
          >{hub.finance.unbilledMinutes === 0 && hub.finance.openDrafts > 0
            ? h('figInDrafts', { count: hub.finance.openDrafts })
            : h('figUnbilledHours', { hours: hours(hub.finance.unbilledMinutes) })}</small
        >
      </a>
      {#if hub.finance.budgetConsumedBps !== null}
        <a class="hub-figure" href={tabHref('settings')} onclick={(event) => tabLink(event, 'settings')}>
          <span>{h('figBudget')}</span>
          <strong>{percentageFromBps(hub.finance.budgetConsumedBps)}</strong>
          <small
            >{hub.finance.budgetMinor
              ? h('figBudgetOf', { amount: money(hub.finance.budgetMinor, hub.finance.currency) })
              : ''}</small
          >
        </a>
      {/if}
    {/if}
    {#if !isWorker}
      <a class="hub-figure" href={tabHref('expenses')} onclick={(event) => tabLink(event, 'expenses')}>
        <span>{h('figExpensesMonth')}</span>
        <strong>{moneyList(hub.expenses.month)}</strong>
        <small>{h('total')}: {moneyList(expenseTotals)}</small>
      </a>
    {/if}
    {#if hub.finance && hub.invoices}
      <a class="hub-figure" href={tabHref('invoices')} onclick={(event) => tabLink(event, 'invoices')}>
        <span>{h('figOpenInvoices')}</span>
        <strong>{money(hub.finance.receivableMinor, hub.finance.currency)}</strong>
        <small
          >{h('figOpenInvoicesCount', {
            count: hub.invoices.filter((row) => row.outstandingMinor !== '0').length,
          })}</small
        >
      </a>
    {/if}
    {#if !isWorker}
      <svelte:element
        this={isAuditor ? 'div' : 'a'}
        class="hub-figure"
        class:hub-figure--attention={pendingTotal > 0}
        href={isAuditor ? undefined : approvalsHref}
      >
        <span>{h('figWaiting')}</span>
        <strong>{pendingTotal}</strong>
        <small
          >{h('figWaitingDetail', {
            hours: hours(hub.pending.timeMinutes),
            expenses: hub.pending.expenseCount,
            reports: hub.pending.reportCount,
          })}</small
        >
      </svelte:element>
    {/if}
  </section>

  {#if data.invalidProjectTimezone}
    <section class="project-surface" data-project-timezone-problem role="alert">
      <p>{t('problem.projectDetail.timezoneInvalid')}</p>
      {#if isOwner}
        <button
          type="button"
          class="quiet-button"
          disabled={!mounted}
          onclick={() => (editOpen = true)}
        >
          {t('Edit project')}
        </button>
      {/if}
    </section>
  {/if}

  {#if canViewCommercial && periodProblem}
    <section
      class="project-surface project-period-correction"
      data-project-period-problem
      bind:this={periodProblemContainer}
      aria-label={t('problem.projectDetail.periodFilter')}
    >
      <ProblemNotice
        problem={periodProblem}
        remedyLinks={{ correct_field: { label: t('problem.remedy.correctField') } }}
      />
      <p>{t('problem.projectDetail.periodNotApplied')}</p>
      {#if Object.keys(periodProblem.fieldErrors).length > 1}
        <ul class="project-period-error-links">
          {#each Object.keys(periodProblem.fieldErrors) as field}
            <li>
              <a href={'#project-' + field}
                >{t(field === 'periodStart' ? 'Period start' : 'Period end')}</a
              >
            </li>
          {/each}
        </ul>
      {/if}
      <form
        method="GET"
        action={projectHref}
        class="project-period-form"
        data-project-period-form
        onsubmit={rememberPeriodScroll}
      >
        <input type="hidden" name="tab" value={activeTab} />
        <input type="hidden" name="lang" value={locale} />
        <label for="project-periodStart">
          {t('Period start')}
          <input
            id="project-periodStart"
            name="periodStart"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            value={periodValues.periodStart}
            aria-invalid={Boolean(periodProblem.fieldErrors.periodStart)}
            aria-describedby={periodProblem.fieldErrors.periodStart
              ? 'project-periodStart-error'
              : undefined}
          />
          {#if periodProblem.fieldErrors.periodStart?.[0]}
            <small id="project-periodStart-error" class="field-error"
              >{t(periodProblem.fieldErrors.periodStart[0])}</small
            >
          {/if}
        </label>
        <label for="project-periodEnd">
          {t('Period end')}
          <input
            id="project-periodEnd"
            name="periodEnd"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            value={periodValues.periodEnd}
            aria-invalid={Boolean(periodProblem.fieldErrors.periodEnd)}
            aria-describedby={periodProblem.fieldErrors.periodEnd
              ? 'project-periodEnd-error'
              : undefined}
          />
          {#if periodProblem.fieldErrors.periodEnd?.[0]}
            <small id="project-periodEnd-error" class="field-error"
              >{t(periodProblem.fieldErrors.periodEnd[0])}</small
            >
          {/if}
        </label>
        <button type="submit" class="primary-button"
          >{t('problem.projectDetail.reviewPeriod')}</button
        >
      </form>
    </section>
  {/if}

  <div class="project-tabs no-print" role="tablist" aria-label={t('Project detail sections')}>
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        id={'project-tab-' + tab.id}
        aria-controls={'project-panel-' + tab.id}
        aria-selected={activeTab === tab.id}
        tabindex={activeTab === tab.id ? 0 : -1}
        bind:this={tabButtons[tab.id]}
        class:active={activeTab === tab.id}
        onkeydown={(event) => handleTabKeydown(event, tab.id)}
        onclick={() => selectTab(tab.id)}>{tab.label}</button
      >
    {/each}
  </div>

  {#snippet planningPanel()}
          <section class="project-surface" aria-labelledby="planning-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('PLANNING CONTEXT')}</p>
                <h2 id="planning-title">
                  <a
                    href={`${base}/app/planning?project=${encodeURIComponent(String(project.id))}&lang=${encodeURIComponent(locale)}`}
                    >{t('Published schedule')}</a
                  >
                </h2>
              </div>
              <span class="surface-count planning-assignment-count"
                >{overview.planning.length}
                {t(overview.planning.length === 1 ? 'field assignment' : 'field assignments')}</span
              >
            </div>
            {#if overview.schedule}
              <p class="portal-kicker">{t('Expected working schedule')}</p>
              <dl class="schedule-facts">
                <div>
                  <dt>{t('Timezone')}</dt>
                  <dd>{display(overview.schedule.timezone)}</dd>
                </div>
                <div>
                  <dt>{t('Effective from')}</dt>
                  <dd>{formatProjectDate(overview.schedule.effective_from)}</dd>
                </div>
                <div>
                  <dt>{t('Weekday hours')}</dt>
                  <dd class="schedule-weekday-list">
                    {#if scheduleWeekdays.every((day) => !Number(day.minutes))}
                      <span data-no-expected-hours>{pc('noExpectation')}</span>
                    {:else}
                      {#each scheduleWeekdays as day}
                        <span><strong>{day.label}</strong> {hours(day.minutes)}</span>
                      {/each}
                    {/if}
                  </dd>
                </div>
              </dl>
              <p class="surface-intro">
                {t('Planning context only; actual time remains independently recorded.')}
              </p>
            {:else}
              <div class="empty-state project-empty-action">
                <span>{t('No published schedule is configured.')}</span>
                <a
                  class="secondary-button"
                  href={`${base}/app/planning?project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
                >
                  {t('Open planning')}
                  <DirectionIcon />
                </a>
              </div>
            {/if}
            <PlanningCalendar
              translate={t}
              {locale}
              zoneNote={!isWorker}
              onselectdate={selectProjectPlanningDate}
              events={overview.planning.map((plan) => ({
                id: String(plan.id),
                title: `${display(plan.worker_name)}${plan.planned_minutes == null ? '' : ` · ${hours(plan.planned_minutes)}`}`,
                startsAt: String(plan.starts_at),
                endsAt: plan.ends_at == null ? undefined : String(plan.ends_at),
                href:
                  data.user.role === 'owner_admin'
                    ? `${base}/app/manage?area=planning_assignment&project=${encodeURIComponent(String(project.id))}&focus=${encodeURIComponent(String(plan.id))}&lang=${encodeURIComponent(locale)}`
                    : `${base}/app/planning?project=${encodeURIComponent(String(project.id))}&lang=${encodeURIComponent(locale)}`,
              }))}
            />
            {#if selectedPlanningDate}
              <nav
                id="project-day-actions"
                class="project-day-actions"
                aria-label={t('Actions for selected day')}
                tabindex="-1"
              >
                <strong>{formatProjectDate(selectedPlanningDate)}</strong>
                <a
                  class="secondary-button"
                  href={`${base}/app/planning?project=${encodeURIComponent(String(project.id))}&date=${encodeURIComponent(selectedPlanningDate)}&lang=${encodeURIComponent(locale)}#${role === 'owner_admin' || role === 'project_manager' ? 'planning-create-form' : 'planning-day-agenda'}`}
                  >{t('Open planning for this day')} <DirectionIcon /></a
                >
                {#if role === 'worker' || role === 'project_manager'}
                  <a
                    class="secondary-button"
                    href={`${base}/app/time?project=${encodeURIComponent(String(project.id))}&date=${encodeURIComponent(selectedPlanningDate)}&action=log-time&lang=${encodeURIComponent(locale)}`}
                    >{t('Record time for this day')} <DirectionIcon /></a
                  >
                  <a
                    class="secondary-button"
                    href={`${base}/app/expenses?project=${encodeURIComponent(String(project.id))}&date=${encodeURIComponent(selectedPlanningDate)}&action=record-expense&lang=${encodeURIComponent(locale)}`}
                    >{t('Add expense for this day')} <DirectionIcon /></a
                  >
                {/if}
              </nav>
            {/if}
            <div class="planning-list">
              {#each overview.planning as plan}
                <article class="planning-record">
                  <a
                    href={data.user.role === 'owner_admin'
                      ? `${base}/app/manage?area=planning_assignment&project=${encodeURIComponent(String(project.id))}&focus=${encodeURIComponent(String(plan.id))}&lang=${encodeURIComponent(locale)}`
                      : `${base}/app/planning?project=${encodeURIComponent(String(project.id))}&lang=${encodeURIComponent(locale)}`}
                  >
                    <strong>{display(plan.worker_name, t('Assigned worker'))}</strong></a
                  ><small>{display(plan.site)} · {display(plan.required_skill)}</small><span
                    >{formatProjectTimestamp(plan.starts_at)}{plan.ends_at
                      ? ` → ${formatProjectTimestamp(plan.ends_at)}`
                      : ''} · {projectUx2('utc')}</span
                  >
                </article>
              {:else}
                <div class="empty-state project-empty-action">
                  <span>{t('No planning assignments recorded.')}</span>
                  <a
                    class="secondary-button"
                    href={`${base}/app/planning?project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
                  >
                    {t('Open planning')}
                    <DirectionIcon />
                  </a>
                </div>
              {/each}
            </div>
          </section>
  {/snippet}

  <div class="project-tab-panels">
    {#if activeTab === 'overview'}
      <div
        id="project-panel-overview"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-overview"
        tabindex="0"
      >
        <section class="project-surface hub-attention" aria-labelledby="hub-attention-title" data-hub-attention>
          <h2 id="hub-attention-title">{h('attentionTitle')}</h2>
          {#if attention.length === 0}
            <p class="hub-clear" data-hub-attention-clear>{h('attentionClear')}</p>
          {:else}
            <ul class="hub-attention-list">
              {#each attention as item (item.id)}
                <li class="hub-attention-item" data-tone={item.tone} data-hub-attention-item={item.id}>
                  <span>{item.text}</span>
                  {#if item.action && item.href}
                    <a
                      class={item.primary ? 'primary-button' : 'secondary-button'}
                      href={item.href}
                      onclick={(event) => (item.tab ? tabLink(event, item.tab) : undefined)}
                      >{item.action}</a
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
        {#if !isAuditor}
          <nav class="hub-shortcuts" aria-label={h('shortcuts')}>
            <a
              class="secondary-button"
              href={`${base}/app/time?action=log-time&project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
              >{h('logTime')}</a
            >
            <a
              class="secondary-button"
              href={`${base}/app/expenses?action=record-expense&project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
              >{h('addExpense')}</a
            >
            <a
              class="secondary-button"
              href={`${base}/app/reports?assistantSurface=report-daily&project=${encodeURIComponent(String(project.id))}&lang=${locale}#report-panel-daily`}
              >{h('workReport')}</a
            >
          </nav>
        {/if}
          {#if data.user.role === 'project_manager' && overview.milestones.length > 0}
            <section class="project-surface" aria-labelledby="operational-milestones-title">
              <div class="surface-heading">
                <div>
                  <p class="portal-kicker">{t('PROJECT RECORDS')}</p>
                  <h2 id="operational-milestones-title">{t('Milestones')}</h2>
                </div>
                <span class="surface-count">{overview.milestones.length}</span>
              </div>
              <div class="compact-record-list">
                {#each overview.milestones as milestone}
                  <div class="compact-record">
                    <span class="record-mark" aria-hidden="true">M</span>
                    <span class="record-copy">
                      <strong>{display(milestone.name, t('Milestone'))}</strong>
                      <small
                        >{display(milestone.due_on, t('No due date'))} · {status(
                          milestone.approval_state,
                        )}</small
                      >
                    </span>
                    {#if ['draft', 'rejected'].includes(String(milestone.approval_state ?? ''))}
                      <form
                        method="POST"
                        action="?/submitMilestone&tab=overview"
                        use:enhance={submitDetail}
                      >
                        <input type="hidden" name="id" value={milestone.id} />
                        <input type="hidden" name="version" value={milestone.version} />
                        <button type="submit" class="secondary-button"
                          >{t('Submit for approval now')}</button
                        >
                      </form>
                    {/if}
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        {#if isWorker}
          {@render planningPanel()}
        {/if}
      </div>
    {:else if activeTab === 'team'}
      <div
        id="project-panel-team"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-team"
        tabindex="0"
      >
        {#if isWorker}
          <section class="project-surface" aria-labelledby="team-title">
            <h2 id="team-title">{h('tabTeam')} · {overview.workers.length}</h2>
            <ul class="hub-plain-list">
              {#each overview.workers as worker}
                <li>
                  <strong>{display(personDisplayName(worker.name, worker.email), t('Assigned worker'))}</strong>
                  <small>{controlled('role', worker.assignment_role ?? worker.role)}</small>
                </li>
              {/each}
            </ul>
          </section>
        {:else}
          <ProjectHubTeam
            projectId={String(project.id)}
            currency={String(project.currency ?? '')}
            {locale}
            {role}
            assignments={hub.assignments}
            lastEndedOn={hub.lastEndedOn ?? {}}
            workers={(data.workers ?? []) as Array<Record<string, unknown>>}
            ratePeople={billingSetup ? billingSetup.people : null}
            hasPersonDefaults={Boolean(data.personDefaults)}
            projectStart={String(project.start_date ?? '')}
            projectEnd={String(project.planned_end_date ?? '')}
            today={hub.today}
            canSetRates={canWriteFinance}
            viewerId={String(data.user?.id ?? '')}
            roleLabel={(value) => controlled('role', value ?? 'worker')}
            formatDate={(value) => formatProjectDate(value)}
            describe={(result) => standaloneActionMessage(locale, result ?? { success: false })}
            notify={hubNotify}
          />
        {/if}
      </div>
    {:else if activeTab === 'hours' && !isWorker}
      <div
        id="project-panel-hours"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-hours"
        tabindex="0"
      >
        <section class="project-surface" aria-labelledby="hub-hours-title" data-hub-hours>
          <div class="surface-heading">
            <h2 id="hub-hours-title">{h('tabHours')}</h2>
            <a class="primary-button" href={hoursOverviewHref()}>{h('openHoursOverview')}</a>
          </div>
          {#if hub.hours.people.length === 0}
            <p class="empty-state">{h('noHours')}</p>
          {:else}
            <div class="hub-table-wrap">
              <table class="hub-table">
                <thead>
                  <tr>
                    <th scope="col">{h('person')}</th>
                    <th scope="col">{h('thisMonth')}</th>
                    <th scope="col">{h('total')}</th>
                    <th scope="col">{h('waiting')}</th>
                    <th scope="col">{h('drafts')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each hub.hours.people as row (row.workerId)}
                    <tr>
                      <th scope="row"
                        ><a href={hoursOverviewHref(row.workerId)}>{row.name}</a></th
                      >
                      <td data-label={h('thisMonth')}>{hours(row.monthMinutes)}</td>
                      <td data-label={h('total')}>{hours(row.totalMinutes)}</td>
                      <td data-label={h('waiting')} class:hub-warn={row.waitingMinutes > 0}
                        >{row.waitingMinutes ? hours(row.waitingMinutes) : '—'}</td
                      >
                      <td data-label={h('drafts')}
                        >{row.draftMinutes ? hours(row.draftMinutes) : '—'}</td
                      >
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{h('total')}</th>
                    <td data-label={h('thisMonth')}>{hours(hub.hours.monthMinutes)}</td>
                    <td data-label={h('total')}>{hours(hub.hours.totalMinutes)}</td>
                    <td data-label={h('waiting')}
                      >{hours(hub.hours.people.reduce((sum, row) => sum + row.waitingMinutes, 0))}</td
                    >
                    <td data-label={h('drafts')}
                      >{hours(hub.hours.people.reduce((sum, row) => sum + row.draftMinutes, 0))}</td
                    >
                  </tr>
                </tfoot>
              </table>
            </div>
          {/if}
        </section>
      </div>
    {:else if activeTab === 'expenses' && !isWorker}
      <div
        id="project-panel-expenses"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-expenses"
        tabindex="0"
      >
        <section class="project-surface" aria-labelledby="hub-expenses-title" data-hub-expenses>
          <div class="surface-heading">
            <h2 id="hub-expenses-title">{h('tabExpenses')}</h2>
            <a class="primary-button" href={expensesOverviewHref()}>{h('openExpensesOverview')}</a>
          </div>
          {#if hub.expenses.people.length === 0}
            <p class="empty-state">{h('noExpenses')}</p>
          {:else}
            <div class="hub-table-wrap">
              <table class="hub-table">
                <thead>
                  <tr>
                    <th scope="col">{h('person')}</th>
                    <th scope="col">{h('thisMonth')}</th>
                    <th scope="col">{h('total')}</th>
                    <th scope="col">{h('waiting')}</th>
                    <th scope="col">{h('missingReceipt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each hub.expenses.people as row (row.workerId)}
                    <tr>
                      <th scope="row"
                        ><a href={expensesOverviewHref(row.workerId)}>{row.name}</a></th
                      >
                      <td data-label={h('thisMonth')}>{moneyList(row.month)}</td>
                      <td data-label={h('total')}>{moneyList(row.total)} · {row.count}</td>
                      <td data-label={h('waiting')} class:hub-warn={row.waitingCount > 0}
                        >{row.waitingCount || '—'}</td
                      >
                      <td data-label={h('missingReceipt')} class:hub-warn={row.missingReceipts > 0}
                        >{row.missingReceipts || '—'}</td
                      >
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>
          <section class="project-surface" aria-labelledby="operational-expenses-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('OPERATIONS')}</p>
                <h2 id="operational-expenses-title">
                  {isFinance || isOwner || isAuditor
                    ? t('Expense review')
                    : t('Operational expenses')}
                </h2>
              </div>
              <span class="surface-count">{filteredExpenses.length}</span>
            </div>
            <p class="surface-intro">
              {isFinance || isOwner || isAuditor
                ? t('Commercial classification is shown only in the Finance view.')
                : t('Reported expense amounts, receipt evidence and operational review state.')}
            </p>
            <label class="expense-filter">
              <span>{t('Filter by category')}</span>
              <select bind:value={expenseCategoryFilter}>
                <option value="">{t('All categories')}</option>
                {#each expenseCategories as category}
                  <option value={category}>{controlled('expenseCategory', category)}</option>
                {/each}
              </select>
            </label>
            <div class="compact-record-list">
              {#each filteredExpenses.slice(0, 5) as expense}
                <a
                  class="compact-record"
                  href={base + '/app/expenses/' + String(expense.id)}
                  data-expense-record
                >
                  <span class="record-mark" aria-hidden="true">E</span>
                  <span class="record-copy"
                    ><strong
                      >{display(
                        expense.vendor,
                        display(
                          expense.description,
                          controlled('expenseCategory', expense.category),
                        ),
                      )}</strong
                    ><small
                      >{display(expense.spent_on)} · {controlled(
                        'expenseCategory',
                        expense.category,
                      )} · {status(expense.approval_state)}</small
                    ></span
                  >
                  <span class="record-value">{expenseAmount(expense)}</span>
                </a>
              {:else}
                <div class="empty-state project-empty-action">
                  <span>
                    {expenseCategoryFilter
                      ? t('No expenses match this category.')
                      : t('No expenses recorded for this project.')}
                  </span>
                  {#if !expenseCategoryFilter && !isAuditor}
                    <a
                      class="secondary-button"
                      href={`${base}/app/expenses?action=record-expense&project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
                      >{t('Add expense')} <DirectionIcon /></a
                    >
                  {/if}
                </div>
              {/each}
            </div>
            <a
              class="inline-link"
              href={`${base}/app/expenses?project=${encodeURIComponent(String(project.id))}`}
              >{t('View all expenses')} <DirectionIcon /></a
            >
          </section>
      </div>
    {:else if activeTab === 'invoices' && canViewCommercial}
      <div
        id="project-panel-invoices"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-invoices"
        tabindex="0"
      >
        <section class="project-surface" aria-labelledby="hub-invoices-title" data-hub-invoices>
          <div class="surface-heading">
            <h2 id="hub-invoices-title">{h('tabInvoices')} · {hub.invoices?.length ?? 0}</h2>
            {#if canWriteFinance}
              <a class="primary-button" href={quickInvoiceHref} data-hub-new-invoice
                >{h('newInvoice')}</a
              >
            {/if}
          </div>
          {#if !hub.invoices?.length}
            <p class="empty-state">{h('noInvoices')}</p>
          {:else}
            <div class="hub-table-wrap">
              <table class="hub-table">
                <thead>
                  <tr>
                    <th scope="col">{h('invoice')}</th>
                    <th scope="col">{h('period')}</th>
                    <th scope="col">{h('status')}</th>
                    <th scope="col">{h('total')}</th>
                    <th scope="col">{h('outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each hub.invoices as invoice (invoice.id)}
                    <tr>
                      <th scope="row"
                        ><a
                          href={`${base}/app/billing/invoices/${encodeURIComponent(invoice.id)}?lang=${locale}`}
                          >{invoice.number ?? h('draft')}</a
                        ></th
                      >
                      <td data-label={h('period')}
                        >{invoice.periodStart
                          ? `${formatProjectDate(invoice.periodStart)} – ${formatProjectDate(invoice.periodEnd)}`
                          : '—'}</td
                      >
                      <td data-label={h('status')}
                        ><span class="state-badge" data-state={invoice.state}
                          >{status(invoice.state)}</span
                        ></td
                      >
                      <td data-label={h('total')}>{money(invoice.totalMinor, invoice.currency)}</td>
                      <td data-label={h('outstanding')}
                        >{invoice.outstandingMinor === '0'
                          ? '—'
                          : money(invoice.outstandingMinor, invoice.currency)}{invoice.dueAt &&
                        invoice.outstandingMinor !== '0'
                          ? ` · ${h('due')} ${formatProjectDate(String(invoice.dueAt).slice(0, 10))}`
                          : ''}</td
                      >
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>
        <details class="hub-group" open={settingsGroup === 'advanced'} data-hub-invoice-advanced>
          <summary>{h('invoiceAdvanced')}</summary>
          <div class="hub-group__body">
            {#if canWriteFinance}
              <div id="project-panel-work">
        <ProjectInvoiceComposer
          projectId={String(project.id)}
          projectTimezone={String(project.timezone ?? '')}
          rules={billingRules}
          {locale}
          {role}
          userId={String(data.user.id)}
          initialDate={[
            ...overview.time.map((row) => String(row.work_date ?? '')),
            ...overview.expenses.map((row) => String(row.spent_on ?? '')),
          ]
            .filter(Boolean)
            .sort()
            .at(-1) ?? String(project.start_date ?? '')}
        />
              </div>
            {/if}
        <section class="project-surface" aria-labelledby="billing-title">
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('FINANCE WORKFLOW')}</p>
              <h2 id="billing-title">{t('Invoices and advanced settings')}</h2>
            </div>
            <a
              class="secondary-button"
              href={`${base}/app/billing?project=${encodeURIComponent(String(project.id))}`}
              >{t('Open Billing')}</a
            >
          </div>
          <p class="surface-intro">
            {t(
              'Review drafts and issued invoices here. Advanced billing rules remain available for Finance.',
            )}
          </p>
          <div class="billing-stream-list">
            {#each billingRules as rule}
              <a
                class="billing-stream"
                href={`${base}/app/billing?view=streams&project=${encodeURIComponent(String(project.id))}&focus=${encodeURIComponent(String(rule.id))}`}
              >
                <div>
                  <strong>{controlled('billingStream', rule.stream_type)}</strong><small
                    >{controlled('billingStream', rule.cadence_type)} · {display(
                      rule.currency,
                    )}</small
                  >
                </div>
                <span class="state-badge"
                  >{status(
                    String(rule.enabled) === '1'
                      ? 'active'
                      : String(rule.enabled) === '0'
                        ? 'archived'
                        : 'unknown',
                  )}</span
                >
              </a>
            {:else}
              <div class="empty-state project-empty-action">
                <span>{t('No billing stream is configured for this project.')}</span>
                <a
                  class="secondary-button"
                  href={`${base}/app/billing?project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
                >
                  {t('Open Billing')}
                  <DirectionIcon />
                </a>
              </div>
            {/each}
          </div>
          {#if canWriteFinance}
            {#if !activeBillingRules.length}
              <div class="empty-state project-empty-action">
                <span
                  >{t(
                    'No active billing streams. Configure a new stream to create invoice drafts.',
                  )}</span
                >
                <a
                  class="secondary-button"
                  href={`${base}/app/billing?project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
                >
                  {t('Open Billing')}
                  <DirectionIcon />
                </a>
              </div>
            {/if}
            <div class="billing-action-row">
              {#if activeBillingRules.length}<button
                  type="button"
                  class="primary-button"
                  onclick={() => (invoiceOpen = true)}>{t('Create invoice draft')}</button
                >{/if}{#if !periodProblem}<a
                  id="finance-export-button"
                  class="secondary-button"
                  href={financeExportUrl}
                  download
                  aria-disabled={financeExportBusy}
                  onclick={(event) => {
                    event.preventDefault();
                    void downloadFinanceExport((event.currentTarget as HTMLAnchorElement).href);
                  }}>{t('Download finance export')}</a
                >{/if}
            </div>
            {#if financeExportProblem}
              <div data-finance-export-problem>
                <ProblemNotice
                  problem={financeExportProblem}
                  remedyLinks={financeExportRemedyLinks}
                />
                {#if financeExportPeriodIssue}
                  <form
                    id="finance-export-period-fields"
                    class="project-period-form"
                    method="GET"
                    action={projectHref}
                    onsubmit={rememberPeriodScroll}
                  >
                    <input type="hidden" name="tab" value="billing" />
                    <input type="hidden" name="lang" value={locale} />
                    <label for="finance-export-periodStart">
                      {t('Period start')}
                      <input
                        id="finance-export-periodStart"
                        name="periodStart"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        bind:value={exportPeriodStart}
                        aria-invalid={Boolean(financeExportProblem.fieldErrors.periodStart)}
                        aria-describedby={financeExportProblem.fieldErrors.periodStart
                          ? 'finance-export-periodStart-error'
                          : undefined}
                      />
                      {#if financeExportProblem.fieldErrors.periodStart}
                        <small id="finance-export-periodStart-error" class="field-error"
                          >{t(financeExportProblem.fieldErrors.periodStart[0] ?? '')}</small
                        >
                      {/if}
                    </label>
                    <label for="finance-export-periodEnd">
                      {t('Period end')}
                      <input
                        id="finance-export-periodEnd"
                        name="periodEnd"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        bind:value={exportPeriodEnd}
                        aria-invalid={Boolean(financeExportProblem.fieldErrors.periodEnd)}
                        aria-describedby={financeExportProblem.fieldErrors.periodEnd
                          ? 'finance-export-periodEnd-error'
                          : undefined}
                      />
                      {#if financeExportProblem.fieldErrors.periodEnd}
                        <small id="finance-export-periodEnd-error" class="field-error"
                          >{t(financeExportProblem.fieldErrors.periodEnd[0] ?? '')}</small
                        >
                      {/if}
                    </label>
                    <button class="primary-button" type="submit"
                      >{t('problem.projectFinanceExport.reviewPeriod')}</button
                    >
                  </form>
                {/if}
              </div>
            {/if}
          {:else}<p class="read-only-note">
              {t('Auditor access is read only. Finance actions remain unavailable.')}
            </p>{/if}
        </section>
          </div>
        </details>
      </div>
    {:else if activeTab === 'reports'}
      <div
        id="project-panel-reports"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-reports"
        tabindex="0"
      >
        <section
          id="project-reports"
          class="project-surface report-surface"
          aria-labelledby="reports-title"
          tabindex="-1"
        >
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('REPORTS & FILES')}</p>
              <h2 id="reports-title">{t('Reports')}</h2>
            </div>
            <a
              class="primary-button"
              href={`${base}/app/reports?project=${encodeURIComponent(String(project.id))}`}
              >{t('Open Reports')}</a
            >
          </div>
          <div class="report-surface-grid">
            <a
              class="report-type-card"
              href={base +
                '/app/reports?view=daily&project=' +
                encodeURIComponent(String(project.id))}
              ><span class="report-type-icon" aria-hidden="true">D</span><strong
                >{t('Daily')}</strong
              ><small>{t('Field activity and operational summary')}</small><span
                class="record-value"
                >{overview.reports.filter((row) => row.type !== 'PLC').length}</span
              ></a
            >
            <a
              class="report-type-card"
              href={base +
                '/app/reports?view=technical&project=' +
                encodeURIComponent(String(project.id))}
              ><span class="report-type-icon" aria-hidden="true">P</span><strong
                >{t('Technical / PLC')}</strong
              ><small>{t('Controls, systems and technical evidence')}</small><span
                class="record-value"
                >{overview.reports.filter((row) => row.type === 'PLC').length}</span
              ></a
            >
            <a
              class="report-type-card report-signoff-card"
              href={base +
                '/app/reports?view=signoff&project=' +
                encodeURIComponent(String(project.id))}
              ><span class="report-type-icon" aria-hidden="true">✓</span><strong
                >{t('Client Sign-off')}</strong
              ><small>{t('Customer-safe hours, activities and conformity surface')}</small><span
                class="inline-link">{t('Open sign-off')} <DirectionIcon /></span
              ></a
            >
          </div>
          <div class="report-register" aria-label={t('Project report register')}>
            {#each overview.reports as report}
              <a class="compact-record" href={base + '/app/reports/' + String(report.id)}
                ><span class="record-mark" aria-hidden="true"
                  >{report.type === 'PLC' ? 'P' : 'D'}</span
                ><span class="record-copy"
                  ><strong>{display(report.title, t('Report'))}</strong><small
                    >{reportType(report.type)} · {display(report.date)} · {status(
                      report.approval_state,
                    )}</small
                  ></span
                >{#if report.safety_related}<span class="safety-label">{t('Safety')}</span>{/if}</a
              >
            {:else}
              <div class="empty-state project-empty-action">
                <span>{t('No reports recorded for this project.')}</span>
                <a
                  class="secondary-button"
                  href={`${base}/app/reports?project=${encodeURIComponent(String(project.id))}&lang=${locale}`}
                >
                  {t('Open Reports')}
                  <DirectionIcon />
                </a>
              </div>
            {/each}
          </div>
        </section>
        <section class="project-surface" aria-labelledby="project-files-title">
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('REPORTS & FILES')}</p>
              <h2 id="project-files-title">
                {t('Private project documents')} · {projectDocuments.length}
              </h2>
            </div>
            <a
              class="secondary-button"
              href={`${base}/app/documents?project=${encodeURIComponent(String(project.id))}#document-list`}
              >{t('Documents')}</a
            >
          </div>
          <div class="compact-record-list">
            {#each projectDocuments.slice(0, 5) as document}
              <div class="compact-record">
                <span class="record-mark" aria-hidden="true">F</span>
                <span class="record-copy">
                  <strong
                    >{display(
                      document.safe_filename ?? document.original_filename,
                      t('Document'),
                    )}</strong
                  >
                  <small>{display(document.artifact_type)}</small>
                </span>
              </div>
            {:else}
              <p class="empty-state">
                {t('No private documents are available in your access scope.')}
              </p>
            {/each}
          </div>
        </section>
      </div>
    {:else if activeTab === 'settings' && !isWorker}
      <div
        id="project-panel-settings"
        class="project-tab-panel"
        role="tabpanel"
        aria-labelledby="project-tab-settings"
        tabindex="0"
      >
        <p class="surface-intro">
          {isAuditor || !canEditProjectDetails ? h('settingsIntroReadOnly') : h('settingsIntro')}
        </p>
        <details class="hub-group" open={!settingsGroup || settingsGroup === 'details'} data-hub-group="details">
          <summary>{h('setDetails')}</summary>
          <div class="hub-group__body">
            {#if canEditProjectDetails}
              <button
                type="button"
                class="primary-button"
                data-project-edit-cta
                disabled={!mounted}
                onclick={() => (editOpen = true)}
              >
                {h('editDetails')}
              </button>
            {/if}
          <section class="project-surface" aria-label={h('setDetails')}>
            <dl class="project-facts">
              <div>
                <dt>{t('Client')}</dt>
                <dd>
                  {#if canViewCommercial && project.client_id}
                    <a
                      href={`${base}/app/projects?view=clients&focus=${encodeURIComponent(String(project.client_id))}&lang=${encodeURIComponent(locale)}#client-directory-client-${encodeURIComponent(String(project.client_id))}`}
                      >{display(project.client_name, t('Client'))}</a
                    >
                  {:else}{display(project.client_name)}{/if}
                </dd>
              </div>
              <div>
                <dt>{t('Client number')}</dt>
                <dd>{display(project.client_number)}</dd>
              </div>
              <div>
                <dt>{t('Project number')}</dt>
                <dd>{display(project.project_number)}</dd>
              </div>
              <div>
                <dt>{t('Cost center')}</dt>
                <dd>{display(project.cost_center_code, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('PO / reference')}</dt>
                <dd>{display(project.po_number, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('Site / plant')}</dt>
                <dd>{display(project.site_name, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('Location (optional)')}</dt>
                <dd>{display(project.site_location, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('On-site manager (optional)')}</dt>
                <dd>{display(project.onsite_manager, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('On-site contact (optional)')}</dt>
                <dd data-project-site-contact>
                  {#if siteContact}
                    <div class="project-contact-details">
                      <a
                        href={`${siteContactDirectoryHref}#client-contact-${encodeURIComponent(String(siteContact.id))}`}
                        >{display(siteContact.name)}</a
                      >
                      {#each ([['role', 'Role'], ['company', 'Company'], ['location', 'Location']] as const) as [field, label]}
                        {#if display(siteContact[field], '')}
                          <p><span>{t(label)}:</span> {display(siteContact[field])}</p>
                        {/if}
                      {/each}
                      {#if display(siteContact.phone, '')}
                        <p>
                          <span>{t('Phone')}:</span>
                          <a href={`tel:${display(siteContact.phone, '')}`}
                            >{display(siteContact.phone)}</a
                          >
                        </p>
                      {/if}
                      {#if display(siteContact.email, '')}
                        <p>
                          <span>{t('Email')}:</span>
                          <a href={`mailto:${display(siteContact.email, '')}`}
                            >{display(siteContact.email)}</a
                          >
                        </p>
                      {/if}
                      {#if Number(siteContact.is_primary) === 1}<p>{t('Primary contact')}</p>{/if}
                      {#if Number(siteContact.is_billing_contact) === 1}<p>
                          {t('Billing contact')}
                        </p>{/if}
                      {#if display(siteContact.notes, '')}
                        <p class="project-contact-notes">
                          <span>{t('Notes')}:</span>
                          {display(siteContact.notes)}
                        </p>
                      {/if}
                      {#if isOwner || isFinance}
                        <a
                          href={`${siteContactDirectoryHref}#client-contact-edit-${encodeURIComponent(String(siteContact.id))}`}
                          >{t('Edit contact')}</a
                        >
                      {/if}
                      {#if canViewCommercial}
                        <a
                          class="project-contact-directory-link"
                          href={`${siteContactDirectoryHref}#client-contacts-${encodeURIComponent(String(siteContact.client_id))}`}
                          >{t('Open client contacts')} <DirectionIcon /></a
                        >
                      {/if}
                    </div>
                  {:else}{t('Not configured')}{/if}
                </dd>
              </div>
              <div>
                <dt>{t('Timezone')}</dt>
                <dd>{display(project.timezone)}</dd>
              </div>
              <div>
                <dt>{t('Schedule')}</dt>
                <dd>{display(project.start_date)} → {display(project.planned_end_date)}</dd>
              </div>
            </dl>
            {#if display(project.description, '')}<p class="project-description">
                {display(project.description)}
              </p>{/if}
          </section>
          </div>
        </details>
        {#if billingSetup}
          <details
            id="project-billing-setup"
            class="hub-group"
            open={settingsGroup === 'billing'}
            data-hub-group="billing"
          >
            <summary>{h('setBilling')} <small>{h('setBillingHint')}</small></summary>
            <div class="hub-group__body">
        {#if billingSetup}
          {#key data.personDefaultsRevision}
            <ProjectEconomicsDefaults
              projectId={String(project.id)}
              currency={String(project.currency)}
              defaults={data.personDefaults}
              revision={data.personDefaultsRevision}
              projectStart={String(project.start_date ?? '')}
              canEdit={canWriteFinance}
              {form}
              {t}
            />
          {/key}
          {#key billingEditorKey}
            <ProjectBillingSetup
              bind:personDraftStatus
              projectId={String(project.id)}
              currency={String(project.currency)}
              timezone={String(project.timezone)}
              commercialModel={String(project.billing_model ?? t('Not configured'))}
              poCap={money(project.po_cap_minor, String(project.currency))}
              rules={billingRules}
              legalEntities={billingSetup.legalEntities}
              taxProfiles={billingSetup.taxProfiles}
              contacts={billingSetup.contacts}
              templates={billingSetup.templates}
              people={billingSetup.people}
              personDefaults={data.personDefaults}
              version={billingSetup.version}
              rulesFingerprint={billingSetup.rulesFingerprint}
              issuingPrerequisites={billingSetup.issuingPrerequisites}
              requestKey={billingSetup.requestKey}
              canEdit={canWriteFinance}
              canEditProject={canEditProjectDetails}
              onEditProject={() => (editOpen = true)}
              form={visibleForm}
              {t}
              {locale}
            />
          {/key}
        {/if}
            </div>
          </details>
        {/if}
        {#if canViewCommercial}
          <details class="hub-group" open={settingsGroup === 'commercial'} data-hub-group="commercial">
            <summary>{h('setCommercial')}</summary>
            <div class="hub-group__body project-panel-grid">
          <section class="project-surface" aria-labelledby="commercial-policy-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('FINANCE / ADMIN')}</p>
                <h2 id="commercial-policy-title">
                  <a href={`${base}/app/finance?view=commercial&project=${project.id}`}
                    >{t('Commercial configuration')}</a
                  >
                </h2>
              </div>
              <span class="read-only-note">{isAuditor ? t('Read only') : t('Authorized view')}</span
              >
            </div>
            {#if canWriteFinance}
              <a
                class="secondary-button"
                href={`${base}/app/finance?view=commercial&project=${encodeURIComponent(String(project.id))}`}
                >{t('Configure commercial terms')} <DirectionIcon /></a
              >
            {/if}
            <dl class="project-facts">
              <div>
                <dt>{t('Commercial model')}</dt>
                <dd>{controlled('billingModel', project.billing_model) || t('Not configured')}</dd>
              </div>
              <div>
                <dt>{t('Reference hours / day')}</dt>
                <dd>
                  {!project.expected_minutes_per_day
                    ? pc('noExpectation')
                    : hours(project.expected_minutes_per_day)}
                </dd>
              </div>
              <div>
                <dt>{t('Client minimum')}</dt>
                <dd>
                  {project.client_daily_minimum_minutes === null ||
                  project.client_daily_minimum_minutes === undefined
                    ? t('Not configured')
                    : hours(project.client_daily_minimum_minutes)}
                </dd>
              </div>
              <div>
                <dt>{t('Budget type')}</dt>
                <dd>{controlled('budgetType', project.budget_type) || t('Not configured')}</dd>
              </div>
              <div>
                <dt>{t('Cost center')}</dt>
                <dd>{display(project.cost_center_code, t('Not configured'))}</dd>
              </div>
              <div>
                <dt>{t('PO / reference')}</dt>
                <dd>{display(project.po_number, t('Not configured'))}</dd>
              </div>
            </dl>
            <p class="surface-intro">
              {t(
                'Workers and PMs record operational truth. Finance configuration determines its commercial interpretation.',
              )}
            </p>
          </section>
          <section class="project-surface" aria-labelledby="economics-title">
            <div class="surface-heading">
              <div>
                <p class="portal-kicker">{t('CANONICAL PROJECTION')}</p>
                <h2 id="economics-title">
                  <a href={`${base}/app/finance?view=economic&project=${project.id}`}
                    >{t('Project economics')}</a
                  >
                </h2>
              </div>
              <span class="read-only-note"
                >{isAuditor ? t('Read only') : t('Exact source records')}</span
              >
            </div>
            {#if canWriteFinance}
              <a
                class="secondary-button"
                href={`${base}/app/finance?view=commercial&project=${encodeURIComponent(String(project.id))}`}
                >{t('Edit economics inputs')} <DirectionIcon /></a
              >
            {/if}
            {#if finance}
              <dl class="finance-facts">
                <div>
                  <dt>{t('Contribution')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/finance?view=economic&project=${encodeURIComponent(String(project.id))}&source=portfolio#finance-source-records`}
                    >
                      {money(
                        finance.contributionMarginMinor,
                        String(finance.currency ?? project.currency),
                      )}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('Contribution Margin %')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/finance?view=economic&project=${encodeURIComponent(String(project.id))}&source=portfolio#finance-source-records`}
                    >
                      {String(finance.revenueCandidateMinor ?? '').trim() === '0'
                        ? t('Not applicable — no revenue candidate')
                        : percentageFromBps(finance.contributionMarginBps)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('Direct Project Result')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/finance?view=economic&project=${encodeURIComponent(String(project.id))}&source=portfolio#finance-source-records`}
                    >
                      {money(
                        finance.contributionMarginMinor,
                        String(finance.currency ?? project.currency),
                      )}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('Direct cost')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/finance?view=economic&project=${encodeURIComponent(String(project.id))}&source=portfolio#finance-source-records`}
                    >
                      {money(
                        finance.approvedCostMinor,
                        String(finance.currency ?? project.currency),
                      )}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('Client receivable')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/ledger?project=${encodeURIComponent(String(project.id))}`}
                    >
                      {money(finance.receivableMinor, String(finance.currency ?? project.currency))}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('Invoiced')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/billing?project=${encodeURIComponent(String(project.id))}`}
                    >
                      {money(finance.invoicedMinor, String(finance.currency ?? project.currency))}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('Collected')}</dt>
                  <dd>
                    <a href={`${base}/app/ledger?project=${encodeURIComponent(String(project.id))}`}
                      >{money(finance.paidMinor, String(finance.currency ?? project.currency))}</a
                    >
                  </dd>
                </div>
                <div>
                  <dt>{t('Approved WIP')}</dt>
                  <dd>
                    <a
                      href={`${base}/app/billing?project=${encodeURIComponent(String(project.id))}&stage=wip`}
                    >
                      {money(
                        finance.approvedUnbilledWipMinor,
                        String(finance.currency ?? project.currency),
                      )}
                    </a>
                  </dd>
                </div>
              </dl>
            {:else}<p class="empty-state">
                {periodProblem
                  ? t('problem.projectDetail.periodNotApplied')
                  : t('Finance projection is not available for this role.')}
              </p>{/if}
          </section>
            </div>
          </details>
          <details class="hub-group" open={settingsGroup === 'milestones'} data-hub-group="milestones">
            <summary>{h('setMilestones')} · {overview.milestones.length}</summary>
            <div class="hub-group__body">
        <section class="project-surface" aria-labelledby="milestones-title">
          <div class="surface-heading">
            <div>
              <p class="portal-kicker">{t('COMMERCIAL RECORDS')}</p>
              <h2 id="milestones-title">{t('Milestones')}</h2>
            </div>
            <span class="surface-count">{overview.milestones.length}</span>
          </div>
          {#if isOwner}
            <a
              class="secondary-button"
              href={`${base}/app/manage?area=project_milestone&project=${encodeURIComponent(String(project.id))}`}
              >{t('Create or edit milestones')} <DirectionIcon /></a
            >
          {/if}
          <div class="compact-record-list">
            {#each overview.milestones as milestone}
              <svelte:element
                this={isOwner ? 'a' : 'div'}
                class="compact-record"
                href={isOwner
                  ? `${base}/app/manage?area=project_milestone&project=${encodeURIComponent(String(project.id))}&focus=${encodeURIComponent(String(milestone.id))}`
                  : undefined}
                ><span class="record-mark" aria-hidden="true">M</span><span class="record-copy"
                  ><strong>{display(milestone.name, t('Milestone'))}</strong><small
                    >{display(milestone.due_on, t('No due date'))} · {status(
                      milestone.approval_state,
                    )}</small
                  ></span
                ><span class="record-value"
                  >{money(
                    milestone.amount_minor,
                    String(milestone.currency ?? project.currency),
                  )}</span
                ></svelte:element
              >
            {:else}<p class="empty-state">{t('No milestones configured.')}</p>{/each}
          </div>
        </section>
            </div>
          </details>
        {/if}
        <details class="hub-group" open={settingsGroup === 'schedule'} data-hub-group="schedule">
          <summary>{h('setSchedule')}</summary>
          <div class="hub-group__body">
            {@render planningPanel()}
          </div>
        </details>
        {#if canWriteFinance}
          <details class="hub-group" open={settingsGroup === 'closeout'} data-hub-group="closeout">
            <summary>{h('setCloseout')}</summary>
            <div class="hub-group__body">
              <p class="surface-intro">{h('setCloseoutHint')}</p>
              <ProjectHubLifecycle
                projectId={String(project.id)}
                projectName={display(project.name, String(project.project_number ?? ''))}
                status={String(project.status ?? '')}
                version={Number(project.version ?? 1)}
                {locale}
                {role}
                today={hub.today}
                describe={(result) => standaloneActionMessage(locale, result ?? { success: false })}
                notify={hubNotify}
              />
              <a
                class="secondary-button"
                data-project-closeout-link
                href={base + '/app/projects/' + encodeURIComponent(String(project.id)) + '/closeout'}
                >{h('openCloseout')}</a
              >
            </div>
          </details>
        {/if}
        {#if isOwner}
          <section class="hub-danger" aria-label={h('dangerZone')}>
            <h3>{h('dangerZone')}</h3>
            <PermanentDeleteDialog
              kind="project"
              recordId={String(project.id)}
              action="?/deleteProject"
              {base}
              {locale}
            />
          </section>
        {/if}
      </div>
    {/if}
  </div>
</main>

<ToastRegion
  toasts={[...actionToasts, ...hubToasts]}
  label={t('Notifications')}
  class="project-action-toast-region"
  ondismiss={(id: string) =>
    id.startsWith('hub:')
      ? (hubToasts = hubToasts.filter((toast) => toast.id !== id))
      : dismissActionToast()}
/>

{#if canEditProjectDetails}
  <ResponsiveSheet
    open={editOpen}
    protectChanges
    title={t('Edit project')}
    description={t(
      'Update project details. If someone else has changed the project, review their changes before saving again.',
    )}
    closeLabel={t('Close edit project')}
    class="project-edit-sheet"
    onclose={() => (editOpen = false)}
  >
    {#if problem && detailForm?.actionName === 'updateProject'}
      <div data-project-problem>
        <ProblemNotice
          {problem}
          {remedyLinks}
          kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        />
      </div>
    {/if}
    <form
      method="POST"
      action="?/updateProject&tab=overview"
      id="assistant-project-edit"
      data-assistant-target="project-edit"
      class="project-edit-form"
      onsubmit={submitForm}
      use:formValidation
      use:enhance={submitDetail}
    >
      <input type="hidden" name="projectId" value={project.id} />
      <input
        type="hidden"
        name="version"
        value={projectValue('version', Number(project.version ?? 1))}
      />
      <div class="form-notice">
        <strong>{pc('referenceLabel')}</strong><span
          >{display(project.project_number)} · {display(project.client_name)} · {display(
            project.currency,
          )}</span
        >
      </div>
      <section class="edit-form-section" aria-labelledby="edit-identification-title">
        <div class="edit-form-section__heading">
          <p class="portal-kicker">{t('PROJECT IDENTITY')}</p>
          <h3 id="edit-identification-title">{t('Identification & client')}</h3>
          <p>{t('Keep the authorized client and project references clear and traceable.')}</p>
        </div>
        <div class="edit-field-grid">
          {#if !commercialOnlyEdit}
          <label
            >{t('Name')}<input
              name="name"
              value={projectValue('name', display(project.name, ''))}
              required
              maxlength="200"
            /></label
          >
          <label
            >{pc('costCenter')}<input
              name="costCenterCode"
              value={projectValue('costCenterCode', display(project.cost_center_code, ''))}
              required
              maxlength="120"
            /><small>{pc('costCenterHint')}</small></label
          >
          <label
            >{pc('referenceLabel')}<input
              name="projectNumber"
              value={projectValue('projectNumber', display(project.project_number, ''))}
              maxlength="120"
            /><small>{pc('referenceHint')}</small>{#if data.projectHasInvoices}<small
                class="edit-field-warning"
                data-project-invoiced-warning>{pc('invoicedReferenceWarning')}</small
              >{/if}</label
          >
          <label
            >{t('Project alias')}<input
              name="projectAlias"
              value={projectValue('projectAlias', display(project.project_alias, ''))}
              maxlength="120"
            /></label
          >
          {/if}
          <label
            >{pc('poLabel')}<input
              name="poNumber"
              value={projectValue('poNumber', display(project.po_number, ''))}
              maxlength="200"
            /><small>{pc('poHint')}</small></label
          >
          <label
            >{t('Contract number')}<input
              name="contractNumber"
              value={projectValue('contractNumber', display(project.contract_number, ''))}
              maxlength="200"
            /></label
          >
        </div>
      </section>
      <section class="edit-form-section" aria-labelledby="edit-planning-title">
        <div class="edit-form-section__heading">
          <p class="portal-kicker">{t('LOCATION & PLANNING')}</p>
          <h3 id="edit-planning-title">{t('Location & planning')}</h3>
          <p>{t('Set the operating site, dates and planning assumptions.')}</p>
        </div>
        <div class="edit-field-grid">
          {#if !commercialOnlyEdit}
          <TimezoneSelect
            name="timezone"
            label={pc('timezone')}
            value={String(projectValue('timezone', display(project.timezone, '')))}
            {locale}
          />
          <ProjectSiteFields
            clientId={String(project.client_id)}
            contacts={data.siteContacts ?? []}
            values={{
              siteName: projectValue('siteName', display(project.site_name, '')),
              onsiteManager: projectValue('onsiteManager', display(project.onsite_manager, '')),
              siteLocation: projectValue('siteLocation', display(project.site_location, '')),
              onsiteContactId: projectValue(
                'onsiteContactId',
                display(project.onsite_contact_id, ''),
              ),
            }}
            translate={t}
          />
          <label
            >{t('Country')}<input
              name="country"
              value={projectValue('country', display(project.country, ''))}
              maxlength="120"
            /></label
          >
          <label
            >{t('Start date')}<input
              name="startDate"
              type="date"
              value={projectValue('startDate', display(project.start_date, ''))}
            /></label
          >
          <label
            >{t('Planned end')}<input
              name="plannedEndDate"
              type="date"
              value={projectValue('plannedEndDate', display(project.planned_end_date, ''))}
            /></label
          >
          <label
            >{pc('expectedHours')}<input
              name="expectedHoursPerDay"
              type="number"
              step="0.0001"
              min="0"
              max="24"
              inputmode="decimal"
              value={projectValue(
                'expectedHoursPerDay',
                project.expected_minutes_per_day
                  ? decimalHoursFromMinutes(project.expected_minutes_per_day)
                  : '',
              )}
            /><small>{pc('expectedHint')}</small></label
          >
          {/if}
          <label
            >{t('Client minimum hours')}<input
              name="clientDailyMinimumHours"
              type="number"
              step="0.0001"
              min="0"
              max="24"
              value={projectValue(
                'clientDailyMinimumHours',
                project.client_daily_minimum_minutes != null
                  ? decimalHoursFromMinutes(project.client_daily_minimum_minutes)
                  : '',
              )}
            /></label
          >
          <p class="edit-field-grid__help">
            {t(
              'Expected hours are planning context. The client daily minimum is a separate commercial top-up applied once per worker, project and day; it never changes actual recorded hours or worker compensation.',
            )}
          </p>
          {#if !commercialOnlyEdit}
          <ProjectBudgetInput
            name="plannedMinutes"
            label={t('Planned hours')}
            value={String(projectValue('plannedMinutes', String(project.planned_minutes ?? '')))}
            kind="hours"
          />
          {#if projectFieldError('plannedMinutes')}<p role="alert">
              {projectFieldError('plannedMinutes')}
            </p>{/if}
          {/if}
        </div>
      </section>
      <section class="edit-form-section" aria-labelledby="edit-commercial-title">
        <div class="edit-form-section__heading">
          <p class="portal-kicker">{t('COMMERCIAL OWNERSHIP')}</p>
          <h3 id="edit-commercial-title">{t('Commercial model & owners')}</h3>
          <p>{t('Review the commercial model, limits and accountable owner.')}</p>
        </div>
        <div class="edit-field-grid">
          {#if !commercialOnlyEdit}
          <label
            >{t('Project manager')}<select name="projectManagerId"
              ><option value="">{t('Unassigned')}</option
              >{#if failedProjectValues.projectManagerId && !(data.workers ?? []).some((worker) => String(worker.id) === failedProjectValues.projectManagerId)}<option
                  value={failedProjectValues.projectManagerId}
                  selected
                  disabled>{t('problem.projectDetail.optionUnavailable')}</option
                >{/if}
              >{#each managerChoices as worker (worker.id)}<option
                    value={worker.id}
                    disabled={!worker.active}
                    selected={worker.id ===
                      String(
                        projectValue('projectManagerId', String(project.project_manager_id ?? '')),
                      )}>{worker.label}{worker.active ? '' : ` · ${t('Inactive')}`}</option
                  >{/each}</select
            ></label
          >
          {/if}
          <label
            >{t('Commercial model')}<select name="billingModel"
              >{#each ['tm', 'tm_daily_minimum', 'all_in', 'capped_tm', 'milestone', 'hybrid', 'internal'] as model}<option
                  value={model}
                  selected={String(
                    projectValue('billingModel', String(project.billing_model ?? '')),
                  ) === model}>{controlled('billingModel', model)}</option
                >{/each}</select
            ></label
          >
          <p class="edit-field-grid__help">
            {t(
              'All-in keeps labor hourly unless an explicit fixed labor price is configured. It only means selected expenses are included instead of billed separately.',
            )}
          </p>
          <label
            >{t('Budget type')}<select name="budgetType">
              {#if !budgetTypes.includes(selectedBudgetType)}
                <option value={selectedBudgetType} selected
                  >{controlled('budgetType', selectedBudgetType)}</option
                >
              {/if}
              {#each budgetTypes as budgetType}
                <option value={budgetType} selected={selectedBudgetType === budgetType}
                  >{controlled('budgetType', budgetType)}</option
                >
              {/each}
            </select></label
          >
          <ProjectBudgetInput
            name="budgetMinor"
            label={t('Budget')}
            value={String(projectValue('budgetMinor', String(project.budget_minor ?? '')))}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('budgetMinor')}<p role="alert">
              {projectFieldError('budgetMinor')}
            </p>{/if}
          <ProjectBudgetInput
            name="revenueBudgetMinor"
            label={t('Revenue budget')}
            value={String(
              projectValue('revenueBudgetMinor', String(project.revenue_budget_minor ?? '')),
            )}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('revenueBudgetMinor')}<p role="alert">
              {projectFieldError('revenueBudgetMinor')}
            </p>{/if}
          <ProjectBudgetInput
            name="poCapMinor"
            label={t('PO cap')}
            value={String(projectValue('poCapMinor', String(project.po_cap_minor ?? '')))}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('poCapMinor')}<p role="alert">
              {projectFieldError('poCapMinor')}
            </p>{/if}
          <ProjectBudgetInput
            name="fixedPriceMinor"
            label={t('Explicit fixed labor price')}
            value={String(projectValue('fixedPriceMinor', String(project.fixed_price_minor ?? '')))}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('fixedPriceMinor')}<p role="alert">
              {projectFieldError('fixedPriceMinor')}
            </p>{/if}
          <ProjectBudgetInput
            name="laborBudgetMinutes"
            label={t('Planned labor hours')}
            value={String(
              projectValue('laborBudgetMinutes', String(project.labor_budget_minutes ?? '')),
            )}
            kind="hours"
          />
          {#if projectFieldError('laborBudgetMinutes')}<p role="alert">
              {projectFieldError('laborBudgetMinutes')}
            </p>{/if}
          <ProjectBudgetInput
            name="expenseBudgetMinor"
            label={t('Expense budget')}
            value={String(
              projectValue('expenseBudgetMinor', String(project.expense_budget_minor ?? '')),
            )}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('expenseBudgetMinor')}<p role="alert">
              {projectFieldError('expenseBudgetMinor')}
            </p>{/if}
          <ProjectBudgetInput
            name="travelBudgetMinor"
            label={t('Travel budget')}
            value={String(
              projectValue('travelBudgetMinor', String(project.travel_budget_minor ?? '')),
            )}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('travelBudgetMinor')}<p role="alert">
              {projectFieldError('travelBudgetMinor')}
            </p>{/if}
          <ProjectBudgetInput
            name="otherCostBudgetMinor"
            label={t('Other cost budget')}
            value={String(
              projectValue('otherCostBudgetMinor', String(project.other_cost_budget_minor ?? '')),
            )}
            currency={String(project.currency ?? 'USD')}
          />
          {#if projectFieldError('otherCostBudgetMinor')}<p role="alert">
              {projectFieldError('otherCostBudgetMinor')}
            </p>{/if}
        </div>
      </section>
      {#if commercialOnlyEdit}
        <!-- Finance edits commercial fields only; keep the other updateProject fields as they are
             (the action treats an absent manager/checkbox as "clear"). -->
        <input type="hidden" name="projectManagerId" value={String(project.project_manager_id ?? '')} />
        {#if Number(project.weekly_close_enabled ?? 0) === 1}<input
            type="hidden"
            name="weeklyCloseEnabled"
            value="on"
          />{/if}
        {#if Number(project.daily_report_required ?? 0) === 1}<input
            type="hidden"
            name="dailyReportRequired"
            value="on"
          />{/if}
        {#if Number(project.technical_reporting_required ?? 0) === 1}<input
            type="hidden"
            name="technicalReportingRequired"
            value="on"
          />{/if}
      {:else}
      <details class="advanced-edit-fields">
        <summary>{t('Advanced reporting and notes')}</summary>
        <div class="edit-field-grid">
          <label class="wide-field"
            >{t('Description')}<textarea name="description" rows="3"
              >{projectValue('description', display(project.description, ''))}</textarea
            ></label
          >
          <label class="wide-field"
            >{t('Administration notes')}<textarea name="notes" rows="3"
              >{projectValue('notes', display(project.notes, ''))}</textarea
            ></label
          >
          <label class="check"
            ><input
              name="weeklyCloseEnabled"
              type="checkbox"
              checked={projectChecked(
                'weeklyCloseEnabled',
                Number(project.weekly_close_enabled ?? 0) === 1,
              )}
            />
            {t('Weekly close enabled')}</label
          >
          <label class="check"
            ><input
              name="dailyReportRequired"
              type="checkbox"
              checked={projectChecked(
                'dailyReportRequired',
                Number(project.daily_report_required ?? 0) === 1,
              )}
            />
            {t('Daily report required')}</label
          >
          <label class="check"
            ><input
              name="technicalReportingRequired"
              type="checkbox"
              checked={projectChecked(
                'technicalReportingRequired',
                Number(project.technical_reporting_required ?? 0) === 1,
              )}
            />
            {t('PLC report required')}</label
          >
        </div>
      </details>
      {/if}
      <p class="form-help">{pc('editIdentityNote')}</p>
      <div class="sheet-form-actions">
        <button
          type="button"
          class="secondary-button"
          data-sheet-close
          onclick={() => (editOpen = false)}>{t('Cancel')}</button
        ><button type="submit" class="primary-button" disabled={saving}
          >{saving ? t('Saving…') : t('Save project')}</button
        >
      </div>
    </form>
    {#if isOwner}
      <div class="project-edit-danger">
        <PermanentDeleteDialog
          kind="project"
          recordId={String(project.id)}
          action="?/deleteProject"
          {base}
          {locale}
        />
      </div>
    {/if}
  </ResponsiveSheet>
{/if}

{#if canWriteFinance}
  <ResponsiveSheet
    open={invoiceOpen}
    title={t('Create invoice draft')}
    description={t(
      'Draft creation is reviewable. Approval, issue, sending and payment remain explicit finance actions.',
    )}
    closeLabel={t('Close invoice draft')}
    class="project-invoice-sheet"
    onclose={() => (invoiceOpen = false)}
  >
    {#if problem && detailForm?.actionName === 'createInvoiceDraft'}
      <div data-project-problem>
        <ProblemNotice
          {problem}
          {remedyLinks}
          kind={problem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        />
      </div>
    {/if}
    <ProjectInvoiceComposer
      projectId={String(project.id)}
      rules={billingRules}
      {locale}
      {role}
      userId={String(data.user.id)}
      initialRuleId={selectedDraftRuleId}
      initialDate={[
        ...overview.time.map((row) => String(row.work_date ?? '')),
        ...overview.expenses.map((row) => String(row.spent_on ?? '')),
      ]
        .filter(Boolean)
        .sort()
        .at(-1) ?? ''}
    />
    <details class="project-surface">
      <summary>{journeyText(locale, 'wholePeriod')}</summary>
      {#if activeBillingRules.length > 0}
        <form
          method="POST"
          action="?/createInvoiceDraft&tab=billing"
          class="invoice-draft-form"
          onsubmit={submitForm}
          use:formValidation
          use:enhance={submitDetail}
        >
          <label
            >{t('Billing stream')}<select name="billingRuleId" value={selectedDraftRuleId} required
              >{#if selectedDraftRuleId && !activeBillingRules.some((rule) => String(rule.id) === selectedDraftRuleId)}<option
                  value={selectedDraftRuleId}
                  selected
                  disabled>{t('problem.projectDetail.optionUnavailable')}</option
                >{/if}
              >{#each activeBillingRules as rule}<option value={rule.id}
                  >{controlled('billingStream', rule.stream_type)} · {controlled(
                    'billingStream',
                    rule.cadence_type,
                  )} · {display(rule.currency)}</option
                >{/each}</select
            ></label
          >
          <label
            >{t('Period start')}<input
              name="periodStart"
              type="date"
              value={selectedDraftStart}
              required
            /></label
          >
          <label
            >{t('Period end')}<input
              name="periodEnd"
              type="date"
              value={selectedDraftEnd}
              required
            /></label
          >
          {#if form && !form.success && Array.isArray((form as { reasons?: unknown }).reasons)}
            <aside class="form-notice" role="alert">
              {#if actionFeedback}<span>{actionFeedback}</span>{/if}
              <ul>
                {#each (form as { reasons?: Array<{ code?: string }> }).reasons ?? [] as reason}
                  <li>{t(billingReadinessMessageKey(reason?.code))}</li>
                {/each}
              </ul>
              <a
                href={`${base}/app/projects/${encodeURIComponent(String(project.id))}?tab=billing#project-panel-billing`}
                >{t('Project billing setup')}</a
              >
            </aside>
          {/if}
          <p class="form-help">
            {t(
              'Customer sign-off and other canonical billing readiness checks remain enforced by the server.',
            )}
          </p>
          <div class="sheet-form-actions">
            <button type="button" class="secondary-button" onclick={() => (invoiceOpen = false)}
              >{t('Cancel')}</button
            ><button
              type="submit"
              class="primary-button"
              disabled={saving ||
                !activeBillingRules.some((rule) => String(rule.id) === selectedDraftRuleId)}
              >{saving ? t('Creating…') : t('Create draft')}</button
            >
          </div>
        </form>
      {:else}<p class="empty-state">
          {t('No active billing streams. Configure a new stream to create invoice drafts.')}
        </p>{/if}
    </details>
  </ResponsiveSheet>
{/if}

<style>
  /* Sheets are siblings of the page, so they need the same surface tokens. */
  .project-detail-page,
  :global(.project-edit-sheet),
  :global(.project-invoice-sheet) {
    --project-ink: var(--ja-ink, #1f1f1c);
    --project-muted: var(--ja-steel, #77756d);
    --project-line: var(--ja-line, #e4e4e2);
    --project-surface: var(--ja-white, #fff);
    --project-soft: #f8f8f7;
  }

  .project-detail-page {
    max-width: 78rem;
    margin: 0 auto;
    padding: clamp(1rem, 2.5vw, 2.25rem);
    color: var(--project-ink);
  }

  .project-breadcrumb,
  .project-context,
  .surface-heading,
  .project-breadcrumb-actions,
  .project-context-actions,
  .billing-action-row,
  .sheet-form-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .project-breadcrumb {
    min-height: 2.75rem;
    color: var(--project-muted);
    font-size: 0.875rem;
  }
  .project-breadcrumb a,
  .inline-link {
    color: var(--ja-teal, #706e66);
    font-weight: 700;
    text-decoration: none;
  }
  .project-breadcrumb a:hover,
  .project-breadcrumb a:focus-visible,
  .inline-link:hover,
  .inline-link:focus-visible {
    text-decoration: underline;
  }
  .project-breadcrumb-actions {
    margin-inline-start: auto;
  }

  .quiet-button,
  .secondary-button,
  .primary-button {
    min-height: 2.75rem;
    border-radius: 0.45rem;
    padding: 0.65rem 0.9rem;
    font: inherit;
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }
  .quiet-button,
  .secondary-button {
    border: 1px solid var(--project-line);
    background: var(--project-surface);
    color: var(--project-ink);
  }
  .primary-button {
    border: 1px solid var(--ja-teal, #706e66);
    background: var(--ja-teal, #706e66);
    color: #fff;
  }
  .quiet-button:hover,
  .secondary-button:hover,
  .quiet-button:focus-visible,
  .secondary-button:focus-visible {
    border-color: var(--ja-teal, #706e66);
  }
  .primary-button:hover,
  .primary-button:focus-visible {
    background: #5b5a53;
  }
  .quiet-button:focus-visible,
  .secondary-button:focus-visible,
  .primary-button:focus-visible,
  .project-tabs button:focus-visible,
  .compact-record:focus-visible,
  .report-type-card:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 35%, transparent);
    outline-offset: 2px;
  }

  .project-action-message {
    margin: 1rem 0;
    padding: 0.8rem 1rem;
    border: 1px solid #d6a03a;
    border-radius: 0.5rem;
    background: #fff8e7;
    color: #5a3c00;
  }
  .project-action-message.success {
    border-color: #68a980;
    background: #effaf2;
    color: #1f5630;
  }
  .project-context {
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.25rem;
    margin: 1.75rem 0 1.25rem;
    padding: 1.4rem clamp(1rem, 2vw, 1.6rem);
    border: 1px solid var(--project-line);
    border-inline-start: 4px solid var(--ja-red, #a12c2a);
    background: var(--project-surface);
  }
  .project-context h1,
  .surface-heading h2 {
    margin: 0.2rem 0 0;
    color: var(--project-ink);
  }
  .project-context h1 {
    font-size: clamp(1.55rem, 3vw, 2.25rem);
    letter-spacing: -0.025em;
  }
  .project-context-meta,
  .surface-intro,
  .form-help,
  .project-description {
    color: var(--project-muted);
  }
  .project-context-meta {
    margin: 0.45rem 0 0;
  }
  .project-context-client-link {
    color: inherit;
    font-weight: 750;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
    text-underline-offset: 0.16em;
  }
  .project-context-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .state-badge,
  .read-only-note,
  .surface-count,
  .safety-label {
    display: inline-flex;
    align-items: center;
    min-height: 1.7rem;
    border: 1px solid var(--project-line);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    color: var(--project-muted);
    font-size: 0.75rem;
    font-weight: 800;
    white-space: nowrap;
  }
  .state-badge[data-state='active'],
  .state-badge[data-state='approved'],
  .state-badge[data-state='locked'] {
    border-color: #86b99a;
    background: #effaf2;
    color: #1f5630;
  }
  p.read-only-note {
    display: block;
    max-width: 100%;
    box-sizing: border-box;
    white-space: normal;
    overflow-wrap: anywhere;
  }


  .project-surface {
    border: 1px solid var(--project-line);
    background: var(--project-surface);
  }
  .project-period-correction {
    padding: 1rem;
  }
  .project-period-correction > p {
    margin: 0.5rem 0 1rem;
    color: var(--project-muted);
  }
  .project-period-error-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0 0 1rem;
    padding-inline-start: 1.25rem;
  }
  .project-period-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
    gap: 0.75rem;
    align-items: end;
  }
  .project-period-form label {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
    font-size: 0.85rem;
    font-weight: 750;
  }
  .project-period-form input:not([type='hidden']) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--project-line);
    border-radius: 0.4rem;
    padding: 0.7rem;
    color: var(--project-ink);
    background: var(--project-surface);
    font: inherit;
  }
  .project-period-form input[aria-invalid='true'] {
    border-color: var(--ja-status-danger, #a40f18);
  }
  .project-period-form input:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 35%, transparent);
    outline-offset: 1px;
  }
  .project-period-form .field-error {
    color: var(--ja-status-danger, #a40f18);
    font-weight: 650;
  }
  @media (max-width: 600px) {
    .project-period-form {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .billing-stream:hover,
  .billing-stream:focus-visible {
    border-color: var(--ja-teal, #706e66);
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 22%, transparent);
    outline-offset: 2px;
  }
  .project-facts dt,
  .finance-facts dt,
  .schedule-facts dt {
    color: var(--project-muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .record-copy small,
  .planning-record small,
  .billing-stream small,
  .report-type-card small {
    color: var(--project-muted);
    line-height: 1.4;
  }



  .project-contact-directory-link {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    color: var(--project-ink);
    font-size: 0.82rem;
    font-weight: 800;
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }




  .project-tabs {
    display: flex;
    gap: 0.2rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--project-line);
    scrollbar-width: thin;
  }
  .project-tabs button {
    min-height: 3rem;
    flex: 0 0 auto;
    border: 0;
    border-bottom: 3px solid transparent;
    padding: 0.7rem 1rem;
    background: transparent;
    color: var(--project-muted);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .project-tabs button.active {
    border-bottom-color: var(--ja-red, #a12c2a);
    color: var(--project-ink);
  }
  .project-tab-panel {
    padding-block: 1.25rem 2rem;
    animation: project-panel-enter 180ms ease-out both;
  }

  @keyframes project-panel-enter {
    from {
      opacity: 0;
      transform: translateY(0.35rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .project-panel-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .project-surface {
    min-width: 0;
    padding: clamp(1rem, 2vw, 1.4rem);
  }
  .surface-heading {
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .surface-heading h2 {
    font-size: 1.1rem;
  }
  .planning-assignment-count {
    max-width: 52%;
    text-align: center;
    white-space: normal;
  }
  .portal-kicker {
    margin: 0;
    color: var(--ja-red, #a12c2a);
    font-size: 0.7rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .project-facts,
  .finance-facts,
  .schedule-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem 1.2rem;
    margin: 0;
  }
  .project-facts div,
  .finance-facts div,
  .schedule-facts div {
    min-width: 0;
  }
  .project-facts dd,
  .finance-facts dd,
  .schedule-facts dd {
    margin: 0.25rem 0 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }
  .project-facts dd a,
  .finance-facts dd a {
    color: inherit;
    text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
    text-underline-offset: 0.18em;
  }
  .project-contact-details {
    display: grid;
    gap: 0.4rem;
  }

  .schedule-weekday-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .schedule-weekday-list span {
    display: grid;
    min-width: 5.5rem;
    gap: 0.2rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--project-line);
    border-radius: 0.45rem;
    background: var(--project-soft);
    font-variant-numeric: tabular-nums;
  }

  .schedule-weekday-list strong {
    color: var(--project-muted);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .project-contact-details p {
    margin: 0;
    font-weight: 500;
  }
  .project-contact-details > a {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
  }
  .project-contact-details a {
    text-decoration-line: underline;
  }
  .project-contact-details p span {
    color: var(--portal-muted, #526174);
  }
  .project-contact-notes {
    white-space: pre-wrap;
  }
  .project-description {
    margin: 1rem 0 0;
    white-space: pre-wrap;
  }
  .surface-intro {
    margin: 0 0 1rem;
    font-size: 0.9rem;
  }

  .expense-filter {
    display: grid;
    max-width: 19rem;
    gap: 0.35rem;
    margin: 0 0 0.85rem;
    color: var(--project-muted);
    font-size: 0.8rem;
    font-weight: 750;
  }

  .expense-filter select {
    min-height: 2.75rem;
    border: 1px solid var(--project-line);
    border-radius: 0.4rem;
    padding: 0.65rem 0.7rem;
    background: var(--project-surface);
    color: var(--project-ink);
    font: inherit;
  }

  .expense-filter select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 35%, transparent);
    outline-offset: 1px;
  }

  .compact-record-list,
  .planning-list,
  .billing-stream-list,
  .report-register {
    display: grid;
    gap: 0.55rem;
  }
  .project-day-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin: 0.85rem 0;
    scroll-margin-top: 5rem;
  }
  .compact-record,
  .planning-record,
  .billing-stream {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--project-line);
    background: var(--project-soft);
    color: inherit;
    text-decoration: none;
  }
  .compact-record:hover,
  .compact-record:focus-visible {
    border-color: var(--ja-teal, #706e66);
  }
  .record-mark,
  .report-type-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--project-line);
    border-radius: 0.45rem;
    background: var(--project-surface);
    color: var(--ja-red, #a12c2a);
    font-weight: 850;
  }
  .record-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 0.15rem;
  }
  .record-copy strong,
  .record-copy small {
    overflow-wrap: anywhere;
  }
  .record-value {
    flex: 0 0 auto;
    color: var(--project-ink);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    text-align: end;
  }
  .empty-state {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--project-line);
    color: var(--project-muted);
  }
  .project-empty-action {
    display: grid;
    justify-items: start;
    gap: 0.65rem;
  }
  .inline-link {
    display: inline-block;
    margin-top: 0.8rem;
  }


  .planning-record {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
  }
  .planning-record small {
    grid-column: 1;
  }
  .planning-record span {
    grid-column: 2;
    grid-row: 1 / span 2;
    color: var(--project-muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .report-surface {
    display: grid;
    gap: 1rem;
  }
  .report-surface-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .report-type-card {
    display: grid;
    min-height: 8.5rem;
    gap: 0.4rem;
    align-content: start;
    padding: 1rem;
    border: 1px solid var(--project-line);
    background: var(--project-soft);
    color: inherit;
    text-decoration: none;
  }
  .report-type-card .record-value {
    margin-top: auto;
  }
  .report-type-icon {
    width: 2rem;
    height: 2rem;
    margin-bottom: 0.3rem;
  }
  .safety-label {
    border-color: #cf9d6a;
    color: #7a4a12;
  }
  .billing-stream {
    justify-content: space-between;
  }
  .billing-stream > div {
    display: grid;
    gap: 0.2rem;
  }
  .billing-action-row {
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .project-edit-form,
  .invoice-draft-form {
    display: grid;
    gap: 1rem;
  }

  .edit-form-section {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid var(--project-line);
    border-radius: 0.55rem;
    background: var(--project-soft);
  }

  .edit-form-section__heading {
    display: grid;
    gap: 0.2rem;
  }

  .edit-form-section__heading h3 {
    margin: 0;
    color: var(--project-ink);
    font-size: 1rem;
  }

  .edit-form-section__heading p:last-child {
    margin: 0;
    color: var(--project-muted);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .edit-field-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.85rem;
  }
  .edit-field-grid label,
  .edit-field-grid :global(label),
  .invoice-draft-form label {
    display: grid;
    gap: 0.35rem;
    color: var(--project-ink);
    font-size: 0.85rem;
    font-weight: 750;
  }
  .project-edit-danger {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 2px dashed var(--ja-status-danger, #a40f18);
  }
  .edit-field-warning {
    color: var(--ja-status-danger, #a40f18);
    font-weight: 600;
  }
  .edit-field-grid__help {
    grid-column: 1 / -1;
    margin: -0.2rem 0 0;
    color: var(--project-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .edit-field-grid input,
  .edit-field-grid :global(input:not([type='hidden'])),
  .edit-field-grid select,
  .edit-field-grid textarea,
  .invoice-draft-form input,
  .invoice-draft-form select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--project-line);
    border-radius: 0.4rem;
    padding: 0.7rem;
    background: var(--project-surface);
    color: var(--project-ink);
    font: inherit;
  }
  .edit-field-grid input:focus-visible,
  .edit-field-grid :global(input:not([type='hidden']):focus-visible),
  .edit-field-grid select:focus-visible,
  .edit-field-grid textarea:focus-visible,
  .invoice-draft-form input:focus-visible,
  .invoice-draft-form select:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 35%, transparent);
    outline-offset: 1px;
  }
  .wide-field {
    grid-column: 1 / -1;
  }
  .advanced-edit-fields {
    border-block: 1px solid var(--project-line);
    padding-block: 0.8rem;
  }
  .advanced-edit-fields summary {
    cursor: pointer;
    font-weight: 800;
  }
  .advanced-edit-fields .edit-field-grid {
    margin-top: 1rem;
  }
  .check {
    display: flex !important;
    align-items: center;
    gap: 0.5rem !important;
  }
  .check input {
    width: auto;
  }
  .form-notice {
    display: grid;
    gap: 0.2rem;
    border-inline-start: 3px solid var(--ja-teal, #706e66);
    padding: 0.75rem 0.9rem;
    background: #f6f6f5;
  }
  .form-notice span {
    color: var(--project-muted);
    font-size: 0.85rem;
  }
  .sheet-form-actions {
    position: sticky;
    z-index: 2;
    bottom: -1.25rem;
    justify-content: flex-end;
    margin: 0 -1.25rem -1.25rem;
    padding: 0.8rem 1.25rem;
    border-top: 1px solid var(--project-line);
    background: var(--project-surface);
    box-shadow: 0 -0.5rem 1rem rgb(255 255 255 / 75%);
    backdrop-filter: blur(0.65rem);
  }

  :global(.project-edit-sheet) {
    width: min(40rem, 60vw);
  }
  button:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  @media (max-width: 900px) {

    .project-panel-grid {
      grid-template-columns: 1fr;
    }
    :global(.project-edit-sheet) {
      width: min(40rem, 60vw);
    }
  }
  @media (max-width: 640px) {
    .project-detail-page {
      padding: 0.75rem;
    }
    .project-breadcrumb,
    .project-context,
    .project-breadcrumb-actions,
    .project-context-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .project-breadcrumb-actions {
      margin-inline-start: 0;
    }
    .project-breadcrumb-actions > *,
    .project-context-actions > * {
      justify-content: center;
      width: 100%;
      box-sizing: border-box;
      text-align: center;
    }

    .project-facts,
    .finance-facts,
    .schedule-facts,
    .report-surface-grid,
    .edit-field-grid {
      grid-template-columns: 1fr;
    }
    .project-context {
      margin-top: 1rem;
    }


    /* Phones: tabs wrap onto a second row instead of scrolling sideways, so every
       tab (Invoices, Reports, Settings) is visible without swiping. */
    .project-tabs {
      display: flex;
      flex-wrap: wrap;
      overflow-x: visible;
      gap: 0 0.1rem;
    }
    .project-tabs button {
      flex: 1 1 auto;
      min-width: max-content;
      min-height: 2.75rem;
      padding: 0.55rem 0.6rem;
    }
    .compact-record,
  .billing-stream {
      align-items: flex-start;
    }
    .record-value {
      max-width: 8rem;
      overflow-wrap: anywhere;
      text-align: end;
    }
    .planning-record {
      grid-template-columns: 1fr;
    }
    .planning-record span {
      grid-column: 1;
      grid-row: auto;
      text-align: start;
    }
    :global(.project-edit-sheet),
    :global(.project-invoice-sheet) {
      inset: 0;
      width: 100vw;
      max-height: 100svh;
      border: 0;
      border-radius: 0;
    }
    .sheet-form-actions {
      bottom: -1rem;
      margin-inline: -1rem;
      padding-inline: 1rem;
    }
    .sheet-form-actions > * {
      flex: 1 1 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .project-detail-page *,
    .project-detail-page *::before,
    .project-detail-page *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
    .project-tab-panel {
      animation: none !important;
    }
  }
  @media print {
    .project-detail-page {
      max-width: none;
      padding: 0;
    }
    .project-breadcrumb,
  .project-tabs,
  .project-context-actions,
  .no-print {
      display: none !important;
    }
    .project-tab-panel:not([id='project-panel-overview']) {
      display: none;
    }
    .project-surface {
      break-inside: avoid;
      box-shadow: none;
    }
  }

  /* ---- Project hub (owner round 2026-11-16) ---- */
  .hub-header__ref {
    margin: 0 0 0.25rem;
    font-weight: 600;
    color: var(--project-muted);
    letter-spacing: 0.01em;
  }
  .hub-figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
    gap: 0.75rem;
    margin: 1rem 0 1.25rem;
  }
  .hub-figure {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--project-line);
    border-radius: 0.75rem;
    background: var(--project-surface);
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .hub-figure:hover,
  .hub-figure:focus-visible {
    border-color: var(--project-ink);
  }
  .hub-figure span,
  .hub-figure small {
    color: var(--project-muted);
    font-size: 0.85rem;
  }
  .hub-figure strong {
    font-size: 1.35rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .hub-figure--attention {
    border-color: #f59e0b;
    background: #fffbeb;
  }
  .hub-attention h2 {
    margin: 0 0 0.75rem;
    font-size: 1.15rem;
  }
  .hub-attention-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .hub-attention-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.6rem;
    border-left: 4px solid #3b82f6;
    background: var(--project-soft);
  }
  .hub-attention-item[data-tone='warn'] {
    border-left-color: #f59e0b;
    background: #fffbeb;
  }
  .hub-attention-item span {
    flex: 1 1 16rem;
  }
  .hub-clear {
    margin: 0;
    color: var(--project-muted);
  }
  .hub-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  .hub-table-wrap {
    overflow-x: auto;
  }
  .hub-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .hub-table th,
  .hub-table td {
    text-align: left;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--project-line);
    white-space: nowrap;
  }
  .hub-table thead th {
    border-top: 0;
    color: var(--project-muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .hub-table tfoot th,
  .hub-table tfoot td {
    font-weight: 700;
  }
  .hub-table td.hub-warn {
    color: #9a3412;
    font-weight: 600;
  }
  .hub-plain-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .hub-plain-list li {
    display: grid;
  }
  .hub-group {
    border: 1px solid var(--project-line);
    border-radius: 0.75rem;
    background: var(--project-surface);
    margin-bottom: 0.75rem;
  }
  .hub-group > summary {
    cursor: pointer;
    padding: 1rem 1.25rem;
    font-weight: 700;
    min-height: var(--ja-target-min, 2.75rem);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }
  .hub-group > summary small {
    font-weight: 400;
    color: var(--project-muted);
  }
  .hub-group__body {
    padding: 0 1.25rem 1.25rem;
    display: grid;
    gap: 1rem;
  }
  .hub-group__body > .primary-button,
  .hub-group__body > .secondary-button {
    justify-self: start;
  }
  .hub-danger {
    margin-top: 1.5rem;
    padding: 1rem 1.25rem;
    border: 1px solid #fecaca;
    border-radius: 0.75rem;
    background: #fef2f2;
  }
  .hub-danger h3 {
    margin: 0 0 0.5rem;
    color: #b42318;
  }
  @media (max-width: 640px) {
    .project-breadcrumb-actions {
      display: none;
    }
    .hub-figures {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .hub-figure {
      padding: 0.65rem 0.75rem;
    }
    .hub-figure strong {
      font-size: 1.1rem;
    }
    .hub-table thead {
      display: none;
    }
    .hub-table,
    .hub-table tbody,
    .hub-table tfoot,
    .hub-table tr,
    .hub-table th,
    .hub-table td {
      display: block;
      white-space: normal;
    }
    .hub-table tr {
      border-top: 1px solid var(--project-line);
      padding: 0.5rem 0;
    }
    .hub-table th,
    .hub-table td {
      border: 0;
      padding: 0.15rem 0;
    }
    .hub-table td[data-label]::before {
      content: attr(data-label) ': ';
      color: var(--project-muted);
    }
    .hub-group > summary {
      padding: 0.85rem 1rem;
    }
    .hub-group__body {
      padding: 0 1rem 1rem;
    }
  }
</style>
