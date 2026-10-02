<script lang="ts">
  import { useViewPreferences } from '../ui/view-preferences.svelte';
  import DirectionIcon from '../ui/DirectionIcon.svelte';
  import { decimalHoursFromMinutes } from '../minute-hours';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import { enhance } from '$app/forms';
  import { beforeNavigate } from '$app/navigation';
  import { confirmDirtyForms, dirtyFormGuard } from '../dirty-form-guard';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalLocale } from '../../portal-i18n';
  import type { ProblemData } from '../../problem/contract';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { expensePolicyIssueLabels } from '../expense-policy-issues';
  import { financeProjectReviewHref, financeReviewProjectId } from '../finance-review-links';
  import FinanceConfigurationSection from './FinanceConfigurationSection.svelte';
  import {
    Field,
    ProblemNotice,
    SectionCard,
    StatusBadge,
    TableRegion,
    formValidation,
    reportFormFieldErrors,
  } from '../ui';
  import type { TableCardRow } from '../ui';
  import { readSessionItem, removeSessionItem, saveSessionItem } from '../ui/safe-session-storage';

  type MoneyFormatter = (minor: unknown, currency?: string) => string;
  type Metric = {
    key: string;
    label: string;
    value: string;
    note?: string;
  };
  type FinanceProjectionReason = {
    code?: string;
    sourceId?: string;
  };
  type FinanceProjection = NonNullable<PortalData['finance']> & {
    /** Canonical V3 uses `state`; `financeProjectionState` is accepted for DTO compatibility. */
    state?: string;
    financeProjectionState?: string;
    reasons?: FinanceProjectionReason[];
  };

  let {
    data,
    availableProjects,
    isAuditor,
    translate,
    controlledValue,
    money,
    currentView = 'overview',
    locale = 'en',
  }: {
    data: PortalData;
    availableProjects: Row[];
    isAuditor: boolean;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    money: MoneyFormatter;
    currentView?: string;
    locale?: PortalLocale;
  } = $props();

  const financeRoles = ['owner_admin', 'finance_admin', 'auditor_read_only'] as const;
  const financeWriteRoles = ['owner_admin', 'finance_admin'] as const;
  const componentId = $props.id();
  type FinanceWorkspaceView = 'overview' | 'economic' | 'commercial';
  type SourceTab = 'portfolio' | 'workers' | 'time' | 'expenses' | 'settlements';
  type ExpenseInboxFilter = 'all' | 'needs' | 'reimbursable' | 'non_billable';

  function expenseRecoveryLabel(value: string): string {
    const labels: Record<string, string> = {
      at_cost: 'Bill at cost',
      markup: 'Bill with markup',
      included: 'Included in labor price',
      non_billable: 'Non-billable',
      client_direct: 'Customer paid directly',
    };
    return translate(labels[value] ?? value);
  }

  function workerReimbursementLabel(value: string): string {
    return translate(
      value === 'at_cost' ? 'Reimburse at cost' : value === 'none' ? 'Do not reimburse' : value,
    );
  }

  const activeView = $derived.by((): FinanceWorkspaceView => {
    const requested = String(currentView ?? '')
      .trim()
      .toLowerCase();
    if (requested === 'economic' || requested === 'commercial' || requested === 'overview') {
      return requested;
    }
    return 'overview';
  });
  const showEconomics = $derived(activeView === 'overview' || activeView === 'economic');
  const showSourceTabs = $derived(activeView === 'economic');
  const showCommercial = $derived(activeView === 'commercial');

  let sourceTab = $state<SourceTab>('portfolio');
  let expenseInboxFilter = $state<ExpenseInboxFilter>('all');
  useViewPreferences({
    scope: 'finance-source',
    user: () => `${data.user.id}:${data.user.role}`,
    url: () => $page.url,
    defaults: { sourceTab: 'portfolio', expenseInboxFilter: 'all' },
    query: { sourceTab: 'source' },
    get: () => ({ sourceTab, expenseInboxFilter }),
    set: (saved) => {
      sourceTab = ['portfolio', 'workers', 'time', 'expenses', 'settlements'].includes(
        saved.sourceTab,
      )
        ? (saved.sourceTab as SourceTab)
        : 'portfolio';
      expenseInboxFilter = ['all', 'needs', 'reimbursable', 'non_billable'].includes(
        saved.expenseInboxFilter,
      )
        ? (saved.expenseInboxFilter as ExpenseInboxFilter)
        : 'all';
    },
  });
  let selectedExpenseId = $state('');
  let expenseEditor: HTMLDivElement | undefined = $state();
  function confirmExpenseEditorChange(): boolean {
    return confirmDirtyForms(
      expenseEditor,
      translate('Discard your unsaved changes? Your entered information will be lost.'),
    );
  }
  function clearExpenseEditor(): boolean {
    if (!confirmExpenseEditorChange()) return false;
    selectedExpenseId = '';
    return true;
  }
  function selectExpense(id: string): void {
    if (confirmExpenseEditorChange()) selectedExpenseId = selectedExpenseId === id ? '' : id;
  }
  function setExpenseInboxFilter(filter: ExpenseInboxFilter): void {
    if (filter === expenseInboxFilter || !clearExpenseEditor()) return;
    expenseInboxFilter = filter;
  }
  beforeNavigate((navigation) => {
    if (
      navigation.to?.url.pathname === navigation.from?.url.pathname &&
      navigation.to?.url.search === navigation.from?.url.search
    )
      return;
    if (!navigation.willUnload && !confirmExpenseEditorChange()) navigation.cancel();
  });
  const linkedExpenseId = $derived($page.url.searchParams.get('expense')?.trim() ?? '');
  $effect(() => {
    if (linkedExpenseId) selectedExpenseId = linkedExpenseId;
  });
  const finance = $derived(data.finance as FinanceProjection | null | undefined);
  const financeProjectionIncomplete = $derived(
    Boolean(finance) &&
      (finance?.financeProjectionState === 'incomplete' || finance?.state === 'incomplete'),
  );
  const financeProjectionReasons = $derived(finance?.reasons ?? []);
  const provisionalRuleMarker = 'Owner-requested provisional estimate';
  const provisionalCopy = {
    en: {
      title: 'Provisional finance rates need confirmation',
      explanation:
        'These owner-requested estimates are visible for review. Confirm the actual internal cost and worker compensation before final financial review.',
    },
    es: {
      title: 'Las tarifas financieras provisionales requieren confirmación',
      explanation:
        'Estas estimaciones solicitadas por el propietario están visibles para su revisión. Confirme el coste interno real y la remuneración del trabajador antes de la revisión financiera final.',
    },
    pt: {
      title: 'As taxas financeiras provisórias precisam de confirmação',
      explanation:
        'Estas estimativas solicitadas pelo proprietário estão visíveis para revisão. Confirme o custo interno real e a remuneração do trabalhador antes da revisão financeira final.',
    },
  } as const;
  const provisionalRules = $derived.by(() => {
    const projectId = String(data.selectedProjectId ?? '');
    if (
      !authorizedFinance ||
      !projectId ||
      !availableProjects.some((project) => String(project.id) === projectId)
    )
      return [];
    return [
      ...(data.internalCostRules ?? []).map((rule) => ({ kind: 'internal' as const, rule })),
      ...(data.compensationRules ?? []).map((rule) => ({ kind: 'compensation' as const, rule })),
    ].filter(
      ({ rule }) =>
        value(rule, 'projectId', 'project_id') === projectId &&
        value(rule, 'notes').startsWith(provisionalRuleMarker),
    );
  });
  const authorizedFinance = $derived(
    financeRoles.includes(String(data.user.role) as (typeof financeRoles)[number]),
  );
  const canWriteFinance = $derived(
    financeWriteRoles.includes(String(data.user.role) as (typeof financeWriteRoles)[number]),
  );
  const financeProblem = $derived.by(() => {
    const result = $page.form as (ProblemData & { success?: boolean }) | null | undefined;
    return result?.success === false &&
      (result.messageKey?.startsWith('problem.finance.') ||
        [
          'recordCompensationPayment',
          'reverseCompensationPayment',
          'recordReimbursement',
          'createAssignmentExpensePolicy',
          'setProjectReimbursementDefault',
          'setWorkerReimbursementOverride',
        ].includes(String((result as { actionName?: string }).actionName)))
      ? result
      : null;
  });
  const failedFinanceForm = $derived(
    $page.form as
      | (ProblemData & { success?: boolean; actionName?: string; values?: Record<string, unknown> })
      | null
      | undefined,
  );
  const reimbursementProblemInForm = $derived.by(() => {
    if (!canWriteFinance || !showCommercial || !financeProblem || !data.selectedProjectId)
      return false;
    if (failedFinanceForm?.actionName === 'setProjectReimbursementDefault')
      return (
        Boolean(data.projectExpenseReimbursement) &&
        String(failedFinanceForm.values?.projectId ?? '') === String(data.selectedProjectId)
      );
    if (failedFinanceForm?.actionName === 'setWorkerReimbursementOverride')
      return Boolean(
        data.commercialTermsSummary?.some(
          (person) =>
            person.canConfigure === true &&
            String(person.assignmentId ?? person.assignment_id ?? person.id) ===
              String(failedFinanceForm.values?.projectMemberId ?? ''),
        ),
      );
    return false;
  });
  const policyProblemInForm = $derived(
    Boolean(
      canWriteFinance &&
      showCommercial &&
      data.selectedProjectId &&
      financeProblem &&
      failedFinanceForm?.actionName === 'createAssignmentExpensePolicy',
    ),
  );
  const commercialAssignmentProblemInForm = $derived(
    Boolean(
      canWriteFinance &&
      showCommercial &&
      data.selectedProjectId &&
      [
        'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME',
        'FINANCE_ASSIGNMENT_COMMERCIAL_RULE_UNAVAILABLE',
        'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED',
      ].includes(financeProblem?.code ?? '') &&
      ['setAssignmentCommercialFallback', 'setAssignmentCommercialRuleReferences'].includes(
        String(failedFinanceForm?.actionName),
      ) &&
      data.commercialTermsSummary?.some(
        (person) =>
          person.canConfigure === true &&
          String(person.assignmentId ?? person.assignment_id ?? '') ===
            String(failedFinanceForm?.values?.projectMemberId ?? ''),
      ),
    ),
  );
  const commercialAssignmentMissingAtDate = $derived(
    Boolean(
      canWriteFinance &&
      showCommercial &&
      data.selectedProjectId &&
      availableProjects.some((project) => String(project.id) === data.selectedProjectId) &&
      financeProblem?.code === 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED' &&
      ['setAssignmentCommercialFallback', 'setAssignmentCommercialRuleReferences'].includes(
        String(failedFinanceForm?.actionName),
      ) &&
      financeProblem.remedies.some(
        (remedy) =>
          remedy.id === 'review_updated_record' &&
          remedy.projectId === String(data.selectedProjectId) &&
          remedy.recordId === String(failedFinanceForm?.values?.projectMemberId ?? ''),
      ) &&
      !data.commercialTermsSummary?.some(
        (person) =>
          String(person.assignmentId ?? person.assignment_id ?? '') ===
          String(failedFinanceForm?.values?.projectMemberId ?? ''),
      ),
    ),
  );
  function attemptedRuleLabel(ruleId: string, rules: Row[] | undefined, amountKey: string): string {
    if (!ruleId) return translate('Resolve by project and date');
    const rule = rules?.find((candidate) => value(candidate, 'id') === ruleId);
    if (!rule) return translate('problem.finance.assignmentCommercialUnavailableOption');
    const start = value(rule, 'effectiveFrom', 'effective_from');
    const end = value(rule, 'effectiveTo', 'effective_to') || translate('open-ended');
    return `${displayMoney(value(rule, amountKey), value(rule, 'currency'))} · ${start} → ${end}`;
  }
  const attemptedCommercialChoices = $derived.by(() => {
    if (!commercialAssignmentMissingAtDate) return [];
    const values = failedFinanceForm?.values ?? {};
    const attempted = (field: string) =>
      typeof values[field] === 'string' ? (values[field] as string) : '';
    if (failedFinanceForm?.actionName === 'setAssignmentCommercialFallback')
      return [
        {
          label: translate('Global worker pay fallback'),
          value: translate(attempted('allowGlobalCompensation') === 'yes' ? 'On' : 'Off'),
        },
        {
          label: translate('Global internal cost fallback'),
          value: translate(attempted('allowGlobalInternalCost') === 'yes' ? 'On' : 'Off'),
        },
      ];
    return [
      {
        label: translate('Customer hourly rule'),
        value: attemptedRuleLabel(
          attempted('clientBillRuleId'),
          data.clientLaborRates,
          'hourly_rate_minor',
        ),
      },
      {
        label: translate('Worker compensation rule'),
        value: attemptedRuleLabel(
          attempted('workerCompensationRuleId'),
          data.compensationRules,
          'rate_minor',
        ),
      },
      {
        label: translate('Internal cost rule'),
        value: attemptedRuleLabel(
          attempted('internalCostRuleId'),
          data.internalCostRules,
          'hourly_rate_minor',
        ),
      },
    ];
  });
  const expensePlanningRecordUnavailable = $derived(
    financeProblem?.code === 'FINANCE_EXPENSE_PLANNING_RECORD_UNAVAILABLE' &&
      failedFinanceForm?.actionName === 'setExpensePlanningDates',
  );
  function attemptedPlanningDate(field: 'expectedReimbursementOn' | 'expectedRecoveryOn'): string {
    const raw = failedFinanceForm?.values?.[field];
    return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(raw) ? raw : '—';
  }
  function retainedFinanceValue(
    actionName: string,
    recordId: string,
    field: string,
    fallback: string,
  ) {
    const failed = failedFinanceForm;
    if (failed?.success !== false || failed.actionName !== actionName) return fallback;
    const submittedId = String(
      failed.values?.settlementId ??
        failed.values?.paymentEventId ??
        failed.values?.expenseId ??
        '',
    );
    if (submittedId !== recordId) return fallback;
    const value = failed.values?.[field];
    return typeof value === 'string' ? value : fallback;
  }
  function settlementPlanningConflictFor(settlementId: string): boolean {
    return (
      failedFinanceForm?.success === false &&
      failedFinanceForm.code === 'FINANCE_SETTLEMENT_PLANNING_CHANGED' &&
      failedFinanceForm.actionName === 'setCompensationSettlementExpectedPaymentOn' &&
      failedFinanceForm.values?.settlementId === settlementId
    );
  }
  function currentSettlementPlanningDate(settlement: Row | Record<string, unknown>): string {
    const current = (
      failedFinanceForm as
        | (typeof failedFinanceForm & { currentExpectedPaymentOn?: unknown })
        | null
    )?.currentExpectedPaymentOn;
    if (typeof current === 'string' || current === null) return current ?? '';
    return value(settlement, 'expectedPaymentOn', 'expected_payment_on');
  }
  function failedReversalFor(paymentId: string): boolean {
    return (
      failedFinanceForm?.success === false &&
      failedFinanceForm.actionName === 'reverseCompensationPayment' &&
      failedFinanceForm.values?.paymentEventId === paymentId
    );
  }
  function revealFinanceProblem(target: HTMLElement, center = false): void {
    if (center) target.scrollIntoView({ block: 'center', inline: 'nearest' });
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const headerPosition = header ? window.getComputedStyle(header).position : '';
    const safeTop =
      (header && (headerPosition === 'sticky' || headerPosition === 'fixed')
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0) + 16;
    const mobileNavigation = document.querySelector<HTMLElement>('.bottom-nav');
    const safeBottom =
      mobileNavigation &&
      mobileNavigation.getClientRects().length > 0 &&
      window.getComputedStyle(mobileNavigation).position === 'fixed'
        ? mobileNavigation.getBoundingClientRect().top - 16
        : window.innerHeight - 16;
    const bounds = target.getBoundingClientRect();
    const delta =
      bounds.height > safeBottom - safeTop || bounds.top < safeTop
        ? bounds.top - safeTop
        : bounds.bottom > safeBottom
          ? bounds.bottom - safeBottom
          : 0;
    if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
  }
  const submitFinance: SubmitFunction = () => {
    const scrollTop = window.scrollY;
    return async ({ result, update }) => {
      await update({ reset: false });
      await tick();
      window.scrollTo({ top: scrollTop, behavior: 'instant' });
      if (result.type === 'failure') {
        const problem = document.querySelector<HTMLElement>('[data-finance-problem]');
        problem?.focus({ preventScroll: true });
        if (problem) revealFinanceProblem(problem);
      }
    };
  };
  const financeScrollKey = 'ja-finance-failed-form-scroll';
  function rememberFinanceScroll(): void {
    saveSessionItem(financeScrollKey, String(window.scrollY));
  }
  function rememberFinanceForm(event: SubmitEvent): void {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.method.toLowerCase() === 'post')
      rememberFinanceScroll();
  }
  onMount(() => {
    if (failedFinanceForm?.success === false && !financeProblem) {
      const saved = Number(readSessionItem(financeScrollKey));
      if (Number.isFinite(saved) && saved >= 0)
        requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'instant' }));
      removeSessionItem(financeScrollKey);
    }
    if (failedFinanceForm?.success !== false) removeSessionItem(financeScrollKey);
  });
  const financeRemedyLinks = $derived.by(() => {
    const links: Record<string, { label: string; href?: string; reload?: boolean }> = {
      sign_in_again: { label: translate('Sign in again'), href: `${base}/app/login` },
      contact_finance_owner: { label: translate('Contact Finance or an owner') },
      correct_field: { label: translate('problem.remedy.correctField') },
      review_updated_record: { label: translate('Review updated record') },
      review_worker_payments: { label: translate('Review worker payments') },
      review_expense_policy: { label: translate('Review expense policy') },
      review_assignment_policy: { label: translate('problem.remedy.reviewAssignmentPolicy') },
      contact_project_owner: { label: translate('problem.remedy.contactProjectOwner') },
      review_project_commercial_policy: {
        label: translate('problem.remedy.reviewProjectCommercialPolicy'),
      },
      review_compensation_rules: { label: translate('problem.remedy.reviewCompensationRules') },
      review_client_labor_rates: { label: translate('problem.remedy.reviewClientLaborRates') },
      review_internal_cost_rules: { label: translate('problem.remedy.reviewInternalCostRules') },
      review_approved_time: { label: translate('problem.remedy.reviewApprovedTime') },
      review_worker_compensation_settlements: {
        label: translate('Review worker compensation settlement'),
      },
    };
    const remedies = financeProblem?.remedies ?? [];
    if (
      expensePlanningRecordUnavailable &&
      canWriteFinance &&
      data.selectedProjectId &&
      availableProjects.some((project) => String(project.id) === data.selectedProjectId) &&
      remedies.some((remedy) => remedy.id === 'review_finance_expenses')
    )
      links.review_finance_expenses = {
        label: translate('problem.remedy.reviewFinanceExpenses'),
        href: `${base}/app/finance?view=commercial&project=${encodeURIComponent(data.selectedProjectId)}&lang=${encodeURIComponent(locale)}${financeExpenses.length ? '#expense-classification' : ''}`,
        reload: true,
      };
    const financeProjectId = financeReviewProjectId(
      remedies,
      failedFinanceForm?.success === false ? failedFinanceForm.values?.projectId : undefined,
      data.selectedProjectId,
      availableProjects.map((project) => String(project.id)),
    );
    if (canWriteFinance && financeProjectId) {
      if (remedies.some((item) => item.id === 'review_project_commercial_policy'))
        links.review_project_commercial_policy = {
          label: translate('problem.remedy.reviewProjectCommercialPolicy'),
          href: financeProjectReviewHref(base, financeProjectId, 'commercial', {
            task: 'Project commercial and time policy',
            lang: locale,
            hash: '#project-commercial-policy',
          }),
        };
      if (remedies.some((item) => item.id === 'review_compensation_rules'))
        links.review_compensation_rules = {
          label: translate('problem.remedy.reviewCompensationRules'),
          href: financeProjectReviewHref(base, financeProjectId, 'commercial', {
            task: 'Compensation statement rules',
            lang: locale,
            hash: '#finance-rule-registers',
          }),
        };
      if (remedies.some((item) => item.id === 'review_client_labor_rates'))
        links.review_client_labor_rates = {
          label: translate('problem.remedy.reviewClientLaborRates'),
          href: financeProjectReviewHref(base, financeProjectId, 'commercial', {
            task: 'Client labor rates',
            lang: locale,
            hash: '#finance-rule-registers',
          }),
        };
      if (remedies.some((item) => item.id === 'review_internal_cost_rules'))
        links.review_internal_cost_rules = {
          label: translate('problem.remedy.reviewInternalCostRules'),
          href: financeProjectReviewHref(base, financeProjectId, 'commercial', {
            task: 'Assignment budget context / internal loaded cost',
            lang: locale,
            hash: '#finance-rule-registers',
          }),
        };
      if (remedies.some((item) => item.id === 'review_approved_time'))
        links.review_approved_time = {
          label: translate('problem.remedy.reviewApprovedTime'),
          href: financeProjectReviewHref(base, financeProjectId, 'economic', {
            source: 'time',
            lang: locale,
          }),
        };
      if (remedies.some((item) => item.id === 'review_worker_compensation_settlements'))
        links.review_worker_compensation_settlements = {
          label: translate('Review worker compensation settlement'),
          href: financeProjectReviewHref(base, financeProjectId, 'economic', {
            source: 'settlements',
            lang: locale,
            hash: '#worker-payments',
          }),
        };
    }
    if (canWriteFinance && remedies.some((item) => item.id === 'review_worker_payments'))
      links.review_worker_payments = {
        label: translate('Review worker payments'),
        href: `${financeHref('economic', 'settlements')}&lang=${encodeURIComponent(locale)}#worker-payments`,
      };
    const review = remedies.find((item) => item.id === 'review_updated_record');
    if (financeProblem?.code === 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED') {
      if (
        canWriteFinance &&
        review?.recordId &&
        review.recordId === String(failedFinanceForm?.values?.projectMemberId ?? '') &&
        review.projectId &&
        review.projectId === String(data.selectedProjectId ?? '') &&
        availableProjects.some((project) => String(project.id) === review.projectId)
      ) {
        const personVisible = data.commercialTermsSummary?.some(
          (person) => String(person.assignmentId ?? person.assignment_id ?? '') === review.recordId,
        );
        if (personVisible) {
          const query = new URLSearchParams({
            view: 'commercial',
            project: review.projectId,
            lang: locale,
          });
          if (data.commercialAsOf) query.set('asOf', data.commercialAsOf);
          if (data.commercialCategory) query.set('category', data.commercialCategory);
          links.review_updated_record = {
            label: translate('Review updated record'),
            href: `${base}/app/finance?${query.toString()}#commercial-person-${encodeURIComponent(review.recordId)}`,
            reload: true,
          };
        } else {
          links.review_updated_record = {
            label: translate('problem.remedy.reviewAssignmentDates'),
            href: `${base}/app/projects/${encodeURIComponent(review.projectId)}?tab=team#team-title`,
            reload: true,
          };
        }
      }
    } else if (
      review?.recordId &&
      financeExpenses.some((row) => String(row.id) === review.recordId)
    )
      links.review_updated_record = {
        label: translate('Review updated record'),
        href: `${base}/app/expenses/${encodeURIComponent(review.recordId)}`,
      };
    else if (
      review?.recordId &&
      settlements.some((row) => String(row.id) === review.recordId) &&
      canWriteFinance
    )
      links.review_updated_record = {
        label: translate('Review updated record'),
        href: `${base}/app/finance?view=economic&source=settlements&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}#worker-payments`,
      };
    else if (
      canWriteFinance &&
      financeProblem &&
      review &&
      ['setProjectReimbursementDefault', 'setWorkerReimbursementOverride'].includes(
        String(failedFinanceForm?.actionName),
      )
    ) {
      const assignmentId = String(failedFinanceForm?.values?.projectMemberId ?? '');
      const submittedProjectId =
        review.projectId ??
        (failedFinanceForm?.actionName === 'setProjectReimbursementDefault'
          ? failedFinanceForm?.values?.projectId
          : undefined) ??
        (failedFinanceForm?.actionName === 'setWorkerReimbursementOverride' &&
        assignmentId &&
        review.recordId === assignmentId &&
        data.commercialTermsSummary?.some(
          (person) =>
            String(person.assignmentId ?? person.assignment_id ?? person.id) === assignmentId,
        )
          ? data.selectedProjectId
          : undefined);
      const policyProjectId = financeReviewProjectId(
        remedies,
        submittedProjectId,
        undefined,
        availableProjects.map((project) => String(project.id)),
      );
      if (policyProjectId)
        links.review_updated_record = {
          label: translate('Review updated record'),
          href: financeProjectReviewHref(base, policyProjectId, 'commercial', {
            task: 'Person expense policies',
            lang: locale,
            hash: '#person-expense-policies',
          }),
          reload: true,
        };
    }
    const issuer = remedies.find((item) => item.id === 'configure_project_issuer');
    const issuerProjectId = issuer?.projectId || String(data.selectedProjectId ?? '');
    if (
      canWriteFinance &&
      issuer &&
      issuerProjectId &&
      availableProjects.some((project) => String(project.id) === issuerProjectId)
    )
      links.configure_project_issuer = {
        label: translate('Review project issuing authority'),
        href: `${base}/app/finance?view=commercial&project=${encodeURIComponent(issuerProjectId)}#project-issuing-authority`,
      };
    const classification = remedies.find((item) => item.id === 'review_expense_classification');
    if (canWriteFinance && classification?.recordId)
      links.review_expense_classification = {
        label: translate('Review expense classification'),
        href: `${base}/app/finance?view=commercial&expense=${encodeURIComponent(classification.recordId)}#expense-classification`,
      };
    if (
      canWriteFinance &&
      remedies.some((item) => item.id === 'review_expense_policy') &&
      data.selectedProjectId &&
      availableProjects.some((project) => String(project.id) === String(data.selectedProjectId))
    )
      links.review_expense_policy = {
        label: translate('Review expense policy'),
        href: `${base}/app/finance?view=commercial&project=${encodeURIComponent(String(data.selectedProjectId))}#person-expense-policies`,
        ...(financeProblem?.code === 'UNEXPECTED_ERROR' ? { reload: true } : {}),
      };
    const assignmentRemedy = remedies.find((item) => item.id === 'review_assignment_policy');
    const assignmentStateFailure = [
      'FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE',
      'FINANCE_POLICY_OUTSIDE_ASSIGNMENT',
      'FINANCE_POLICY_END_REQUIRED',
    ].includes(financeProblem?.code ?? '');
    const assignmentProjectId = assignmentRemedy?.projectId || String(data.selectedProjectId ?? '');
    if (
      canWriteFinance &&
      assignmentRemedy &&
      assignmentProjectId &&
      availableProjects.some((project) => String(project.id) === assignmentProjectId)
    )
      links.review_assignment_policy = {
        label: translate(
          assignmentStateFailure
            ? 'problem.remedy.reviewAssignments'
            : 'problem.remedy.reviewAssignmentPolicy',
        ),
        href: assignmentStateFailure
          ? `${base}/app/projects?project=${encodeURIComponent(assignmentProjectId)}&assignment=${encodeURIComponent(assignmentRemedy.recordId ?? '')}#assignment-history`
          : `${base}/app/finance?view=commercial&project=${encodeURIComponent(assignmentProjectId)}#person-expense-policies`,
        ...(assignmentStateFailure ? { reload: true } : {}),
      };
    return links;
  });
  let focusedFinanceProblemId = '';
  function restoreFinanceFormValues(form: HTMLFormElement, values: Record<string, unknown>): void {
    for (const control of form.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"], input[type="radio"]',
    )) {
      if (control.disabled || !control.name) continue;
      control.checked = values[control.name] === control.value;
    }
    for (const [name, raw] of Object.entries(values)) {
      if (typeof raw !== 'string') continue;
      const control = form.elements.namedItem(name);
      if (
        control instanceof HTMLInputElement &&
        !['hidden', 'file', 'password', 'checkbox', 'radio'].includes(control.type)
      )
        control.value = raw;
      else if (control instanceof HTMLTextAreaElement) control.value = raw;
      else if (
        control instanceof HTMLSelectElement &&
        Array.from(control.options).some((option) => option.value === raw)
      )
        control.value = raw;
    }
  }
  $effect(() => {
    const id = financeProblem?.correlationId;
    const focusKey = `${id}:${failedReversalVisible}`;
    if (!id || focusKey === focusedFinanceProblemId) return;
    focusedFinanceProblemId = focusKey;
    void tick().then(async () => {
      await tick();
      const failed = failedFinanceForm;
      let fieldFocus: HTMLElement | null = null;
      if (failed?.actionName && failed.fieldErrors && failed.values) {
        const forms = [
          ...document.querySelectorAll<HTMLFormElement>('[data-ui="finance-overview"] form'),
        ].filter(
          (candidate) =>
            candidate.dataset.financeAction === failed.actionName ||
            candidate.getAttribute('action') === `?/${failed.actionName}` ||
            candidate.getAttribute('action')?.startsWith(`?/${failed.actionName}&`),
        );
        const submittedIds = Object.entries(failed.values).filter(
          ([name, value]) => name.endsWith('Id') && typeof value === 'string' && value,
        ) as Array<[string, string]>;
        const matched = forms
          .map((candidate) => {
            let matches = 0;
            for (const [name, value] of submittedIds) {
              // Compare only fixed record IDs. A selected worker or project in
              // a blank create form is entered data and must be restored after
              // matching, not used to reject the correct form.
              const fixedId = Array.from(
                candidate.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
              ).find((input) => input.name === name);
              if (!fixedId) continue;
              if (fixedId.value !== value) return { candidate, matches: -1 };
              matches += 1;
            }
            return { candidate, matches };
          })
          .filter((item) => item.matches >= 0)
          .sort((left, right) => right.matches - left.matches);
        const form =
          matched.length === 1 || (matched[0]?.matches ?? 0) > (matched[1]?.matches ?? 0)
            ? matched[0]?.candidate
            : undefined;
        if (form) {
          restoreFinanceFormValues(form, failed.values);
          const fieldErrors = { ...failed.fieldErrors };
          // A stale policy form can send a threshold after overtime was turned
          // off. Its threshold control is then hidden, so explain the correction
          // beside the visible overtime choice instead of focusing a hidden input.
          if (
            form.hasAttribute('data-project-commercial-policy-form') &&
            fieldErrors.overtimeThresholdMinutes &&
            form.querySelector('input[type="hidden"][name="overtimeThresholdMinutes"]')
          ) {
            fieldErrors.overtimeEnabled = fieldErrors.overtimeThresholdMinutes;
            delete fieldErrors.overtimeThresholdMinutes;
          }
          reportFormFieldErrors(form, fieldErrors);
          const fields = Object.keys(fieldErrors);
          const visibleField =
            fields.length === 1
              ? Array.from(form.querySelectorAll<HTMLElement>('[name]')).find(
                  (control) =>
                    control.getAttribute('name') === fields[0] &&
                    control.getClientRects().length > 0 &&
                    !control.hasAttribute('disabled'),
                )
              : undefined;
          if (commercialAssignmentProblemInForm)
            fieldFocus = form.querySelector<HTMLElement>(
              '[data-finance-problem] [data-ui="problem-notice"]',
            );
          else if (policyProblemInForm)
            fieldFocus = form.querySelector<HTMLElement>('[data-finance-problem]');
          else if (fields.length > 1)
            fieldFocus = form.querySelector<HTMLElement>('[data-validation-summary]');
          else
            fieldFocus = visibleField ?? form.querySelector<HTMLElement>('[data-finance-problem]');
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const saved = Number(readSessionItem(financeScrollKey));
      if (Number.isFinite(saved) && saved >= 0)
        window.scrollTo({ top: saved, behavior: 'instant' });
      removeSessionItem(financeScrollKey);
      const globalNotice =
        commercialAssignmentMissingAtDate || expensePlanningRecordUnavailable
          ? document.querySelector<HTMLElement>('[data-finance-problem] [data-ui="problem-notice"]')
          : null;
      const focusTarget =
        fieldFocus ?? globalNotice ?? document.querySelector<HTMLElement>('[data-finance-problem]');
      focusTarget?.focus({
        preventScroll: true,
      });
      if (focusTarget)
        revealFinanceProblem(
          focusTarget,
          failed?.actionName === 'reverseCompensationPayment' || policyProblemInForm,
        );
      if (focusTarget && commercialAssignmentProblemInForm)
        window.setTimeout(() => {
          if (focusTarget.isConnected && document.activeElement === focusTarget)
            revealFinanceProblem(focusTarget);
        }, 180);
    });
  });
  const portfolioProjects = $derived(data.portfolio?.projects ?? []);
  const portfolioWorkers = $derived(data.portfolio?.byWorker ?? []);
  const timeEconomics = $derived(finance?.timeEconomics ?? []);
  const expenseEconomics = $derived(finance?.expenseEconomics ?? []);
  const financeExpenses = $derived(data.financeExpenses ?? []);
  const settlements = $derived(data.settlements ?? []);
  const selectedSettlementProject = $derived(
    availableProjects.find((project) => String(project.id) === String(data.selectedProjectId)),
  );
  let settlementPeriodStart = $state('');
  let settlementPeriodEnd = $state('');
  let settlementWorkerId = $state('');
  const settlementWorkerChoices = $derived(
    (data.workers ?? []).filter((worker) => {
      if (!settlementPeriodStart || !settlementPeriodEnd) return true;
      if (settlementPeriodEnd < settlementPeriodStart) return false;
      return (
        Array.isArray(worker.assignmentWindows) &&
        worker.assignmentWindows.some((window) => {
          const [startsOn = '', endsOn] = String(window).split('/');
          return startsOn <= settlementPeriodStart && (!endsOn || endsOn >= settlementPeriodEnd);
        })
      );
    }),
  );
  $effect(() => {
    if (
      settlementWorkerId &&
      !settlementWorkerChoices.some((worker) => String(worker.id) === settlementWorkerId)
    ) {
      settlementWorkerId = '';
    }
  });
  const compensationPayments = $derived(data.compensationPayments ?? []);
  const reimbursements = $derived(data.reimbursements ?? []);

  function value(row: Row | Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const candidate = row[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
        return String(candidate);
      }
    }
    return '';
  }

  function displayMoney(minor: unknown, currency: unknown): string {
    if (minor === null || minor === undefined || String(minor).trim() === '') return '—';
    return money(minor, String(currency || finance?.currency || 'USD'));
  }

  function expenseReference(row: Row | Record<string, unknown>): string {
    const id = value(row, 'id');
    return id ? `…${id.slice(-8)}` : '—';
  }

  function expenseLinkLabel(row: Row | Record<string, unknown>): string {
    return [
      translate('Open details'),
      value(row, 'description') || expenseReference(row),
      value(row, 'spentOn', 'spent_on'),
      displayMoney(row.recordedAmountMinor, row.recordedCurrency),
      value(row, 'id'),
    ]
      .filter((part) => part && part !== '—')
      .join(' · ');
  }

  function minorAsDecimal(minor: unknown): string {
    const raw = String(minor ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '';
    const negative = raw.startsWith('-');
    const digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  }

  function paymentsForSettlement(settlementId: unknown): Row[] {
    return compensationPayments.filter(
      (payment) => value(payment, 'settlementId', 'settlement_id') === String(settlementId),
    );
  }

  function paymentIsReversed(paymentId: unknown): boolean {
    return compensationPayments.some(
      (payment) =>
        value(payment, 'eventType', 'event_type') === 'reversal' &&
        value(payment, 'reversesEventId', 'reverses_event_id') === String(paymentId),
    );
  }

  /** Format canonical basis points without converting money or financial truth in the UI. */
  function displayBps(valueToFormat: unknown): string {
    const raw = String(valueToFormat ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return '—';
    const negative = raw.startsWith('-');
    const digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
    const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
    const fraction = digits.slice(-2);
    return `${negative ? '-' : ''}${whole}.${fraction}%`;
  }

  function displayContributionMarginBps(valueToFormat: unknown): string {
    return String(finance?.revenueCandidateMinor ?? '').trim() === '0'
      ? translate('Not applicable — no revenue candidate')
      : displayBps(valueToFormat);
  }

  function displayHours(valueToFormat: unknown): string {
    const hours = decimalHoursFromMinutes(valueToFormat);
    if (hours === '—') return hours;
    const [whole, fraction] = hours.split('.');
    const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${grouped}${fraction ? `.${fraction}` : ''} ${translate('hrs')}`;
  }

  function consumptionTone(valueToFormat: unknown): 'ok' | 'warning' | 'danger' {
    const raw = String(valueToFormat ?? '').trim();
    if (!/^-?\d+$/.test(raw)) return 'ok';
    const digits = BigInt(raw.startsWith('-') ? raw.slice(1) : raw);
    if (digits > 10000n) return 'danger';
    if (digits >= 7500n) return 'warning';
    return 'ok';
  }

  function progressValue(valueToFormat: unknown): string {
    const raw = String(valueToFormat ?? '').trim();
    if (!/^\d+$/.test(raw)) return '0';
    const digits = BigInt(raw);
    const capped = digits > 10000n ? 10000n : digits;
    const whole = capped / 100n;
    const fraction = (capped % 100n).toString().padStart(2, '0');
    return `${whole}.${fraction}`;
  }

  function setSourceTab(next: SourceTab): void {
    sourceTab = next;
  }

  function taxPercentOptions(): Array<{ label: string; bps: string }> {
    return [
      { label: '0%', bps: '0' },
      { label: '4%', bps: '400' },
      { label: '10%', bps: '1000' },
      { label: '21%', bps: '2100' },
    ];
  }

  function expenseTaxBps(row: Row | Record<string, unknown>): string {
    const taxBps = value(row, 'taxBps', 'tax_bps');
    return taxPercentOptions().some((option) => option.bps === taxBps) ? taxBps : '0';
  }

  function syncTaxBps(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    const form = select.form;
    const taxBps = form?.elements.namedItem('taxBps') as HTMLInputElement | null;
    if (!taxBps) return;
    const selected = taxPercentOptions().find((option) => option.bps === select.value);
    taxBps.value = selected?.bps ?? '0';
  }

  function statusLabel(status: unknown): string {
    const raw = String(status ?? '').trim();
    return raw ? controlledValue('status', raw) || translate(raw) : translate('Not available');
  }

  function categoryLabel(category: unknown): string {
    const raw = String(category ?? '').trim();
    return raw ? controlledValue('category', raw) || translate(raw) : translate('Not classified');
  }

  function expenseClassificationState(row: Row | Record<string, unknown>): string {
    return (
      value(row, 'commercialClassificationState', 'commercial_classification_state') ||
      'unclassified'
    );
  }

  function expenseTreatmentLabel(row: Row | Record<string, unknown>): string {
    const classification = value(
      row,
      'classificationState',
      'commercialClassificationState',
      'commercial_classification_state',
    );
    const treatment = value(row, 'treatment');
    return classification === 'classified' && treatment
      ? controlledValue('billingStream', treatment)
      : translate('Not classified');
  }

  function hasExpenseIssuingAuthority(row: Row | Record<string, unknown>): boolean {
    const spentOn = value(row, 'spentOn', 'spent_on');
    return Boolean(
      spentOn &&
      data.projectLegalEntityAssignments?.some((assignment) => {
        const from = value(assignment, 'effectiveFrom', 'effective_from');
        const to = value(assignment, 'effectiveTo', 'effective_to');
        return from <= spentOn && (!to || to >= spentOn);
      }),
    );
  }

  function issuingAuthorityHref(): string {
    const params = new URLSearchParams({
      view: 'commercial',
      project: String(data.selectedProjectId ?? ''),
    });
    return `${base}/app/finance?${params.toString()}#project-issuing-authority`;
  }

  function personExpensePolicyHref(row: Row | Record<string, unknown>): string {
    const params = new URLSearchParams({
      view: 'commercial',
      project: projectId(row),
      expense: value(row, 'id'),
    });
    return `${base}/app/finance?${params.toString()}#person-expense-policies`;
  }

  function expenseBillingState(row: Row | Record<string, unknown>): string {
    return value(row, 'billingState', 'billing_state') || 'unlocked';
  }

  function expenseIsLocked(row: Row | Record<string, unknown>): boolean {
    return (
      Boolean(value(row, 'invoiceId', 'invoice_id', 'billingLockId', 'billing_lock_id')) ||
      ['locked', 'invoiced', 'collected', 'paid'].includes(expenseBillingState(row))
    );
  }

  function expenseIdempotencyKey(row: Row | Record<string, unknown>): string {
    return `finance-expense-classification:${value(row, 'id')}:${value(row, 'version') || '1'}`;
  }

  const expensePresets = {
    reimbursable_at_cost: {
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
    },
    all_in: { clientTreatment: 'all_in', billingTreatment: 'all_in' },
    non_billable: { clientTreatment: 'non_billable', billingTreatment: 'internal_non_billable' },
    reimbursable_plus_markup: {
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_plus_markup',
    },
    client_direct: { clientTreatment: 'non_billable', billingTreatment: 'client_direct' },
    allowance_per_diem: { clientTreatment: 'reimbursable', billingTreatment: 'allowance_per_diem' },
    informational: { clientTreatment: 'non_billable', billingTreatment: 'informational' },
  } as const;

  type ExpensePreset = keyof typeof expensePresets;

  type PolicyPreview = {
    policy?: {
      id?: string;
      version?: number;
      workerReimbursement?: string;
      clientRecovery?: string;
    } | null;
    issues?: string[];
    clientTreatment?: string | null;
    billingTreatment?: string | null;
    markupBps?: number | null;
    workerReimbursementMinor?: string | null;
    clientRecoveryMinor?: string | null;
  };

  function requiresExpensePolicy(row: Row | Record<string, unknown>): boolean {
    return String(row.expense_policy_required ?? row.expensePolicyRequired ?? 0) === '1';
  }

  function expensePolicyPreview(row: Row | Record<string, unknown>): PolicyPreview | null {
    return (row.policyPreview as PolicyPreview | null | undefined) ?? null;
  }

  function expensePreset(row: Row | Record<string, unknown>): ExpensePreset {
    const clientTreatment = value(row, 'clientTreatment', 'client_treatment');
    const billingTreatment = value(row, 'billingTreatment', 'billing_treatment');
    const match = (Object.keys(expensePresets) as ExpensePreset[]).find(
      (key) =>
        expensePresets[key].clientTreatment === clientTreatment &&
        expensePresets[key].billingTreatment === billingTreatment,
    );
    return match ?? 'reimbursable_at_cost';
  }

  function syncExpensePreset(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    const form = select.form;
    const preset = select.value as ExpensePreset;
    if (!form || !(preset in expensePresets)) return;
    const selected = expensePresets[preset];
    const clientTreatment = form.elements.namedItem('clientTreatment') as HTMLInputElement | null;
    const billingTreatment = form.elements.namedItem('billingTreatment') as HTMLInputElement | null;
    if (clientTreatment) clientTreatment.value = selected.clientTreatment;
    if (billingTreatment) billingTreatment.value = selected.billingTreatment;
    const markup = form.elements.namedItem('markupBps') as HTMLInputElement | null;
    const overrideMarkup = form.elements.namedItem(
      'expenseOverrideMarkup',
    ) as HTMLInputElement | null;
    if (overrideMarkup) {
      const needsMarkup = preset === 'reimbursable_plus_markup';
      overrideMarkup.disabled = !needsMarkup;
      overrideMarkup.required = needsMarkup;
      if (!needsMarkup && markup) markup.value = '0';
      if (needsMarkup && markup) markup.value = overrideMarkup.value || '0';
    }
  }

  function syncExpenseOverride(event: Event): void {
    const checkbox = event.currentTarget as HTMLInputElement;
    const form = checkbox.form;
    if (!form) return;
    const select = form.elements.namedItem('expenseOverridePreset') as HTMLSelectElement | null;
    const overrideMarkup = form.elements.namedItem(
      'expenseOverrideMarkup',
    ) as HTMLInputElement | null;
    const client = form.elements.namedItem('clientTreatment') as HTMLInputElement | null;
    const billing = form.elements.namedItem('billingTreatment') as HTMLInputElement | null;
    const markup = form.elements.namedItem('markupBps') as HTMLInputElement | null;
    if (!select) return;
    select.disabled = !checkbox.checked;
    if (checkbox.checked) {
      syncExpensePreset({ currentTarget: select } as unknown as Event);
    } else {
      if (client) client.value = client.dataset.policyValue ?? client.value;
      if (billing) billing.value = billing.dataset.policyValue ?? billing.value;
      if (markup) markup.value = markup.dataset.policyValue ?? '0';
      if (overrideMarkup) {
        overrideMarkup.disabled = true;
        overrideMarkup.required = false;
      }
    }
  }

  function prepareExpenseClassification(event: SubmitEvent): void {
    const form = event.currentTarget as HTMLFormElement;
    const checked = (form.elements.namedItem('overrideExpensePolicy') as HTMLInputElement | null)
      ?.checked;
    if (!checked) return;
    const select = form.elements.namedItem('expenseOverridePreset') as HTMLSelectElement | null;
    if (!select) return;
    syncExpensePreset({ currentTarget: select } as unknown as Event);
    const markup = form.elements.namedItem('markupBps') as HTMLInputElement | null;
    const overrideMarkup = form.elements.namedItem(
      'expenseOverrideMarkup',
    ) as HTMLInputElement | null;
    if (select.value === 'reimbursable_plus_markup' && markup && overrideMarkup)
      markup.value = overrideMarkup.value;
  }

  function projectNumber(row: Row | Record<string, unknown>): string {
    return value(row, 'projectNumber', 'project_number') || translate('No project number');
  }

  function projectName(row: Row | Record<string, unknown>): string {
    return value(row, 'projectName', 'project_name', 'name') || translate('Unnamed project');
  }

  function projectId(row: Row | Record<string, unknown>): string {
    return value(row, 'projectId', 'project_id', 'id');
  }

  function projectHref(row: Row | Record<string, unknown>): string {
    return `${base}/app/projects/${encodeURIComponent(projectId(row))}`;
  }

  function financeHref(view: 'economic' | 'commercial', source?: SourceTab, hash = ''): string {
    const query = new URLSearchParams({ view });
    if (data.selectedProjectId) query.set('project', data.selectedProjectId);
    if (source) query.set('source', source);
    return `${base}/app/finance?${query.toString()}${hash}`;
  }

  function expenseClassificationAction(expenseId: string): string {
    const query = new URLSearchParams($page.url.searchParams);
    for (const key of [...query.keys()]) {
      if (key.startsWith('/')) query.delete(key);
    }
    query.set('view', 'commercial');
    query.set('expense', expenseId);
    query.set('lang', locale);
    if (data.selectedProjectId) query.set('project', String(data.selectedProjectId));
    return `?/classifyExpenseCommercially&${query.toString()}#expense-classification`;
  }

  function projectWorkflowHref(section: 'billing' | 'time' | 'expenses'): string {
    const query = new URLSearchParams();
    if (data.selectedProjectId) query.set('project', data.selectedProjectId);
    const serialized = query.toString();
    return `${base}/app/${section}${serialized ? `?${serialized}` : ''}`;
  }

  function projectCalculationHref(): string {
    const projectId = String(data.selectedProjectId ?? '').trim();
    if (!projectId) return `${base}/app/finance?view=economic`;
    // Finance overview is an all-history projection. The explanation is
    // deliberately period-specific, so link to the exact recent lookback it
    // will display instead of implying that all-history totals were carried.
    const today = /^\d{4}-\d{2}-\d{2}$/u.test(String(data.financeToday ?? ''))
      ? String(data.financeToday)
      : new Date().toISOString().slice(0, 10);
    const date = new Date(`${today}T00:00:00.000Z`);
    const previousMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
    const periodStart = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const query = new URLSearchParams({ periodStart, periodEnd: today });
    const serialized = query.toString();
    return `${base}/app/projects/${encodeURIComponent(projectId)}/calculation${serialized ? `?${serialized}` : ''}`;
  }

  function sourceRecordHref(row: Row | Record<string, unknown>, kind: 'time' | 'expenses'): string {
    const id = value(row, 'id');
    return id ? `${base}/app/${kind}/${encodeURIComponent(id)}` : projectWorkflowHref(kind);
  }

  function portfolioWorkerSourceHref(row: Row | Record<string, unknown>): string {
    const query = new URLSearchParams({ lang: locale });
    const workerId = value(row, 'workerId', 'worker_id', 'id');
    if (workerId) query.set('worker', workerId);
    return `${base}/app/time?${query.toString()}`;
  }

  function ledgerHref(status: string): string {
    const query = new URLSearchParams();
    if (data.selectedProjectId) query.set('project', data.selectedProjectId);
    if (status) query.set('status', status);
    return `${base}/app/ledger?${query.toString()}`;
  }

  const projectionReasonMessages: Record<string, string> = {
    missing_client_rate: 'Client rate is missing for a source record.',
    missing_internal_cost: 'Internal cost is missing for a source record.',
    missing_compensation_rule: 'Worker compensation rule is missing for a source record.',
    missing_expense_finance_projection:
      'Expense finance projection is missing for a source record.',
    missing_expense_currency_conversion:
      'Expense currency conversion is missing for a source record.',
    missing_person_forecast_rate:
      'Applicable forecast rates could not be resolved for planned remaining hours.',
  };

  const financeAlertMessages: Record<string, string> = {
    PO_OR_REVENUE_BUDGET_AT_70_PERCENT: 'Purchase order or revenue budget at 70%',
    PO_OR_REVENUE_BUDGET_AT_85_PERCENT: 'Purchase order or revenue budget at 85%',
    PO_OR_REVENUE_BUDGET_AT_95_PERCENT: 'Purchase order or revenue budget at 95%',
    LABOR_HOURS_BUDGET_AT_95_PERCENT: 'Labor hours budget at 95%',
    TRAVEL_BUDGET_AT_95_PERCENT: 'Travel budget at 95%',
    NEGATIVE_PROJECTED_MARGIN: 'Projected margin is negative',
    MISSING_RATE: 'Time finance rules incomplete',
    MISSING_EXPENSE_FINANCE_PROJECTION: 'Expense finance projection incomplete',
  };

  function financeAlertText(alert: unknown): string {
    const code = String(alert ?? '').trim();
    const known = financeAlertMessages[code];
    if (known) return translate(known);
    const words = code.replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').toLowerCase();
    return words
      ? `${translate('Finance alert')}: ${words.charAt(0).toUpperCase()}${words.slice(1)}`
      : translate('Finance alert');
  }

  function projectionReasonText(reason: FinanceProjectionReason): string {
    const message =
      projectionReasonMessages[String(reason.code ?? '').trim()] ??
      'A finance source record needs projection review.';
    const sourceId = String(reason.sourceId ?? '').trim();
    if (reason.code === 'missing_person_forecast_rate') {
      const person = (data.commercialTermsSummary ?? []).find(
        (row) => value(row, 'workerId', 'worker_id') === sourceId,
      );
      const personName = person ? value(person, 'workerName', 'worker_name') : '';
      const project = availableProjects.find(
        (item) => String(item.id) === String(data.selectedProjectId),
      );
      const context = [
        project ? `${translate('Project')}: ${projectName(project)}` : '',
        sourceId
          ? `${translate('Worker')}: ${personName ? `${personName} · ` : ''}${sourceId}`
          : '',
      ].filter(Boolean);
      return `${translate(message)}${context.length ? ` · ${context.join(' · ')}` : ''}`;
    }
    const timeSource = projectionTimeSource(sourceId);
    const expenseSource = projectionExpenseSource(sourceId);
    const source = timeSource ?? expenseSource;
    const selectedProject = availableProjects.find(
      (project) => String(project.id) === String(data.selectedProjectId),
    );
    const project = selectedProject ? projectName(selectedProject) : '';
    const worker = source ? value(source, 'workerName', 'worker_name') : '';
    const workDate = timeSource
      ? value(timeSource, 'workDate', 'work_date')
      : expenseSource
        ? value(expenseSource, 'spentOn', 'spent_on')
        : '';
    const description = expenseSource ? value(expenseSource, 'description') : '';
    const timeCategory = timeSource ? categoryLabel(timeSource.category) : '';
    const context = [
      project ? `${translate('Project')}: ${project}` : '',
      description ? `${translate('Expense')}: ${description}` : '',
      worker ? `${translate('Worker')}: ${worker}` : '',
      workDate ? `${translate('Work date')}: ${workDate}` : '',
      timeCategory ? `${translate('Category')}: ${timeCategory}` : '',
    ].filter(Boolean);
    return `${translate(message)}${context.length ? ` · ${context.join(' · ')}` : ''}`;
  }

  function projectionTimeSource(sourceId: string): Record<string, unknown> | null {
    if (!sourceId) return null;
    return finance?.timeEconomics?.find((row) => value(row, 'id') === sourceId) ?? null;
  }

  function projectionExpenseSource(sourceId: string): Record<string, unknown> | null {
    if (!sourceId) return null;
    return finance?.expenseEconomics?.find((row) => value(row, 'id') === sourceId) ?? null;
  }

  function projectionRuleHref(
    task: 'Internal loaded cost' | 'Worker compensation' | 'Client labor rate',
    reason: FinanceProjectionReason,
  ): string {
    const query = new URLSearchParams({ view: 'commercial', task, lang: locale });
    if (data.selectedProjectId) query.set('project', data.selectedProjectId);
    if (projectionTimeSource(String(reason.sourceId ?? '').trim()))
      query.set('sourceRecord', String(reason.sourceId));
    return `${base}/app/finance?${query.toString()}#finance-configuration-task`;
  }

  function projectionExpenseSourceHref(reason: FinanceProjectionReason): string {
    const source = projectionExpenseSource(String(reason.sourceId ?? '').trim());
    return source ? sourceRecordHref(source, 'expenses') : projectWorkflowHref('expenses');
  }

  function rowStatusVariant(
    status: unknown,
  ): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(status ?? '')) {
      case 'approved':
      case 'settled':
      case 'reimbursed':
      case 'paid':
        return 'success';
      case 'rejected':
      case 'failed':
      case 'void':
        return 'danger';
      case 'submitted':
      case 'pending':
      case 'scheduled':
      case 'needs_changes':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function timeline(
    row: Row | Record<string, unknown>,
    expectedKeys: string[],
    actualKeys: string[],
  ): string {
    const expected = value(row, ...expectedKeys) || '—';
    const actual = value(row, ...actualKeys) || '—';
    return `${translate('Expected')}: ${expected} · ${translate('Actual')}: ${actual}`;
  }

  function compensationTimeline(row: Row | Record<string, unknown>): string {
    return `${translate('Expected payment')}: ${value(row, 'expectedPaymentOn', 'expected_payment_on') || '—'} · ${translate('Compensation finalized')}: ${value(row, 'settledAt', 'settled_at') || '—'}`;
  }

  const actualMetrics = $derived.by((): Metric[] => {
    if (!finance) return [];
    return [
      {
        key: 'direct-project-result',
        label: translate('Direct Project Result'),
        value: displayMoney(finance.contributionMarginMinor, finance.currency),
        note: translate('Contribution after approved direct cost'),
      },
      {
        key: 'contribution',
        label: translate('Contribution'),
        value: displayMoney(finance.contributionMarginMinor, finance.currency),
        note: translate('Project contribution'),
      },
      {
        key: 'contribution-margin-percent',
        label: translate('Contribution Margin %'),
        value: displayContributionMarginBps(finance.contributionMarginBps),
        note: translate('Calculated from approved project records'),
      },
      {
        key: 'direct-cost',
        label: translate('Direct cost'),
        value: displayMoney(finance.approvedCostMinor, finance.currency),
        note: translate('Approved source records'),
      },
      {
        key: 'revenue-candidate',
        label: translate('Revenue candidate'),
        value: displayMoney(finance.revenueCandidateMinor, finance.currency),
        note: translate('Candidate revenue from approved sources'),
      },
      {
        key: 'invoiced',
        label: translate('Invoiced (actual)'),
        value: displayMoney(finance.invoicedMinor, finance.currency),
      },
      {
        key: 'collected',
        label: translate('Collected (actual)'),
        value: displayMoney(finance.paidMinor, finance.currency),
        note: translate('Only append-only payment events count as collected'),
      },
      {
        key: 'outstanding',
        label: translate('Net receivable / credit'),
        value: displayMoney(finance.receivableMinor, finance.currency),
      },
      {
        key: 'approved-wip',
        label: translate('Approved unbilled WIP'),
        value: displayMoney(finance.approvedUnbilledWipMinor, finance.currency),
      },
      {
        key: 'unapproved-wip',
        label: translate('Unapproved WIP'),
        value: displayMoney(finance.unapprovedWipMinor, finance.currency),
      },
    ];
  });

  const expectedMetrics = $derived.by((): Metric[] => {
    if (!finance) return [];
    return [
      {
        key: 'planned-minutes',
        label: translate('Planned reference minutes'),
        value: displayHours(finance.plannedMinutes),
        note: translate('Planning input only; it never creates actual time'),
      },
      {
        key: 'planned-remaining',
        label: translate('Planned remaining'),
        value: displayHours(finance.plannedRemainingMinutes),
      },
      {
        key: 'etc-direct-cost',
        label: translate('ETC direct cost (expected)'),
        value: displayMoney(finance.estimateToCompleteMinor, finance.currency),
      },
      {
        key: 'eac-direct-cost',
        label: translate('EAC direct cost (expected)'),
        value: displayMoney(finance.estimateAtCompletionCostMinor, finance.currency),
      },
      {
        key: 'expected-final-margin',
        label: translate('Expected final Contribution Margin'),
        value: displayMoney(finance.expectedFinalMarginMinor, finance.currency),
      },
      {
        key: 'hours-consumed',
        label: translate('Hours consumed'),
        value: displayBps(finance.hoursConsumedBps),
      },
      {
        key: 'expense-budget-used',
        label: translate('Expense budget used'),
        value: displayBps(finance.expenseBudgetConsumedBps),
      },
      {
        key: 'travel-budget-used',
        label: translate('Travel budget used'),
        value: displayBps(finance.travelBudgetConsumedBps),
      },
    ];
  });

  const portfolioCardRows = $derived.by((): TableCardRow[] =>
    sourceRowsPage.map((row) => {
      const id = projectId(row);
      const label = `${projectNumber(row)} · ${projectName(row)}`;
      return {
        id,
        cells: [
          { label: translate('Project'), value: label },
          { label: translate('Client'), value: value(row, 'clientName', 'client_name') || '—' },
          { label: translate('Currency'), value: value(row, 'currency') || '—' },
          {
            label: translate('Approved hours'),
            value: displayHours(value(row, 'approvedMinutes', 'approved_minutes')),
          },
          {
            label: translate('Contribution'),
            value: displayMoney(
              value(row, 'contributionMarginMinor', 'contribution'),
              value(row, 'currency'),
            ),
          },
          {
            label: translate('Source'),
            value: id ? translate('Available') : translate('Source unavailable'),
          },
        ],
        ...(id
          ? {
              href: projectHref(row),
              linkLabel: translate('Open source'),
              linkAriaLabel: `${translate('Open source')}: ${label}`,
            }
          : {}),
      };
    }),
  );

  const workerCardRows = $derived.by((): TableCardRow[] =>
    sourceRowsPage.map((row) => ({
      id: value(row, 'workerId', 'worker_id', 'id'),
      href: portfolioWorkerSourceHref(row),
      linkLabel: translate('Open details'),
      linkAriaLabel: `${translate('Open details')}: ${value(row, 'workerName', 'worker_name') || '—'}`,
      cells: [
        { label: translate('Worker'), value: value(row, 'workerName', 'worker_name') || '—' },
        { label: translate('Currency'), value: value(row, 'currency') || '—' },
        {
          label: translate('Approved hours'),
          value: displayHours(value(row, 'actualMinutes', 'actual_minutes')),
        },
        {
          label: translate('Billable hours'),
          value: displayHours(value(row, 'billableMinutes', 'billable_minutes')),
        },
        {
          label: translate('Revenue attributed'),
          value: displayMoney(value(row, 'revenue'), value(row, 'currency')),
        },
        {
          label: translate('Loaded labor cost'),
          value: displayMoney(value(row, 'internalCost', 'internal_cost'), value(row, 'currency')),
        },
        {
          label: translate('Travel / expense'),
          value: displayMoney(value(row, 'expenseCost', 'expense_cost'), value(row, 'currency')),
        },
        {
          label: translate('Contribution'),
          value: displayMoney(
            value(row, 'contribution', 'contributionMinor'),
            value(row, 'currency'),
          ),
        },
      ],
    })),
  );

  const timeCardRows = $derived.by((): TableCardRow[] =>
    sourceRowsPage.map((row) => ({
      id: value(row, 'id'),
      href: sourceRecordHref(row, 'time'),
      linkLabel: translate('Open details'),
      cells: [
        { label: translate('Date'), value: value(row, 'workDate', 'work_date') || '—' },
        { label: translate('Category'), value: categoryLabel(row.category) },
        {
          label: translate('Hours'),
          value: displayHours(value(row, 'actualMinutes', 'actual_minutes')),
        },
        {
          label: translate('Billable hours'),
          value: displayHours(value(row, 'clientBillableMinutes', 'client_billable_minutes')),
        },
        { label: translate('State'), value: statusLabel(row.approvalState) },
        { label: translate('Billing'), value: statusLabel(row.billingStatus ?? 'unlocked') },
        {
          label: translate('Client revenue'),
          value: displayMoney(row.clientRevenueMinor, finance?.currency),
        },
        {
          label: translate('Loaded cost'),
          value: displayMoney(row.internalCostMinor, finance?.currency),
        },
        {
          label: translate('Worker compensation'),
          value: displayMoney(row.workerCompensationMinor, finance?.currency),
        },
        {
          label: translate('Configuration'),
          value:
            row.clientRateConfigured && row.internalCostConfigured
              ? translate('Complete')
              : translate('Rate review'),
        },
      ],
    })),
  );

  const expenseCardRows = $derived.by((): TableCardRow[] =>
    sourceRowsPage.map((row) => ({
      id: value(row, 'id'),
      href: sourceRecordHref(row, 'expenses'),
      linkLabel: translate('Open details'),
      linkAriaLabel: expenseLinkLabel(row),
      cells: [
        { label: translate('Date'), value: value(row, 'spentOn', 'spent_on') || '—' },
        { label: translate('Description'), value: value(row, 'description') || '—' },
        { label: translate('Reference'), value: expenseReference(row) },
        { label: translate('Category'), value: categoryLabel(row.category) },
        {
          label: translate('Recorded amount'),
          value: displayMoney(row.recordedAmountMinor, row.recordedCurrency),
        },
        {
          label: translate('Treatment'),
          value: expenseTreatmentLabel(row),
        },
        { label: translate('Direct cost'), value: displayMoney(row.costMinor, finance?.currency) },
        {
          label: translate('Client revenue'),
          value: displayMoney(row.revenueMinor, finance?.currency),
        },
      ],
    })),
  );

  const attentionSettlements = $derived(
    settlements.filter((row) => !['settled', 'paid'].includes(value(row, 'state', 'status')))
      .length,
  );
  const attentionReimbursements = $derived(
    reimbursements.filter(
      (row) => value(row, 'reimbursementState', 'reimbursement_state') !== 'reimbursed',
    ).length,
  );
  const pendingReimbursementView = $derived(
    $page.url.searchParams.get('reimbursement') === 'pending',
  );
  const visibleReimbursements = $derived(
    pendingReimbursementView
      ? reimbursements.filter(
          (row) => value(row, 'reimbursementState', 'reimbursement_state') !== 'reimbursed',
        )
      : reimbursements,
  );

  const workspaceTitle = $derived(
    activeView === 'commercial'
      ? translate('Commercial Configuration')
      : activeView === 'economic'
        ? translate('Economic Review')
        : translate('Finance overview'),
  );
  const workspaceEyebrow = $derived(
    activeView === 'commercial'
      ? translate('Commercial operations')
      : activeView === 'economic'
        ? translate('Project economics')
        : translate('Finance control'),
  );

  const filteredFinanceExpenses = $derived.by(() => {
    return financeExpenses.filter((expense) => {
      if (linkedExpenseId) return value(expense, 'id') === linkedExpenseId;
      const preset = expensePreset(expense);
      const classification = expenseClassificationState(expense);
      if (expenseInboxFilter === 'needs') return classification !== 'classified';
      if (expenseInboxFilter === 'reimbursable')
        return classification === 'classified' && preset === 'reimbursable_at_cost';
      if (expenseInboxFilter === 'non_billable')
        return classification === 'classified' && preset === 'non_billable';
      return true;
    });
  });
  const needsClassificationCount = $derived(
    financeExpenses.filter((expense) => expenseClassificationState(expense) !== 'classified')
      .length,
  );
  const reimbursableCount = $derived(
    financeExpenses.filter(
      (expense) =>
        expenseClassificationState(expense) === 'classified' &&
        expensePreset(expense) === 'reimbursable_at_cost',
    ).length,
  );
  const nonBillableCount = $derived(
    financeExpenses.filter(
      (expense) =>
        expenseClassificationState(expense) === 'classified' &&
        expensePreset(expense) === 'non_billable',
    ).length,
  );

  const sourceRows = $derived(
    sourceTab === 'workers'
      ? portfolioWorkers
      : sourceTab === 'time'
        ? timeEconomics
        : sourceTab === 'expenses'
          ? expenseEconomics
          : sourceTab === 'settlements'
            ? settlements
            : portfolioProjects,
  );
  let sourceRowsPage = $state<Row[]>([]);
  const failedReversalVisible = $derived(
    canWriteFinance &&
      sourceTab === 'settlements' &&
      sourceRowsPage.some((settlement) =>
        paymentsForSettlement(value(settlement, 'id')).some((payment) =>
          failedReversalFor(value(payment, 'id')),
        ),
      ),
  );
  let classificationPage = $state<Row[]>([]);
  let reimbursementPage = $state<Row[]>([]);
</script>

{#if !authorizedFinance}
  <section class="finance-overview finance-overview--denied" data-ui="finance-overview-denied">
    <p class="finance-overview__eyebrow">{translate('Restricted surface')}</p>
    <h2>{translate('Finance overview')}</h2>
    <p>
      {translate('Finance data is available only to authorized Finance, Owner, or Auditor roles.')}
    </p>
  </section>
{:else}
  <div class="finance-overview" data-ui="finance-overview" onsubmit={rememberFinanceForm}>
    {#if canWriteFinance}<p>
        <a class="secondary-button" href={`${base}/app/finance/cash`}
          >{translate('Cash calendar')}</a
        >
      </p>{/if}
    <header class="finance-overview__context">
      <div>
        <p class="finance-overview__eyebrow">{workspaceEyebrow}</p>
        <h2>{workspaceTitle}</h2>
        <p>
          {#if activeView === 'commercial'}
            {translate(
              'Classify expenses and set commercial policies. Operational hours and project metrics stay on Economic Review.',
            )}
          {:else if activeView === 'economic'}
            {translate(
              'Review profitability, budget consumption, and source records for the selected project.',
            )}
          {:else}
            {translate(
              'Review project finances, work records, upcoming obligations and reimbursements.',
            )}
          {/if}
        </p>
      </div>
      <StatusBadge
        variant={finance ? (financeProjectionIncomplete ? 'warning' : 'success') : 'neutral'}
        text={finance
          ? financeProjectionIncomplete
            ? translate('Finance records need review')
            : translate('Finance records loaded')
          : translate('No project selected')}
      />
    </header>

    {#if financeProblem && !failedReversalVisible && !reimbursementProblemInForm && !policyProblemInForm && !commercialAssignmentProblemInForm}
      <div data-finance-problem tabindex="-1">
        <ProblemNotice
          problem={financeProblem}
          status={commercialAssignmentMissingAtDate
            ? translate('problem.finance.assignmentCommercialMissingAtDate')
            : undefined}
          remedyLinks={financeRemedyLinks}
        />
        {#if commercialAssignmentMissingAtDate || expensePlanningRecordUnavailable}
          <div class="finance-overview__attempted-recap">
            <strong id={`${componentId}-attempted-recap-heading`}
              >{translate(
                commercialAssignmentMissingAtDate
                  ? 'problem.finance.assignmentCommercialYourChoices'
                  : 'problem.finance.expensePlanningAttemptedDates',
              )}</strong
            >
            <dl aria-labelledby={`${componentId}-attempted-recap-heading`}>
              {#if commercialAssignmentMissingAtDate}
                {#each attemptedCommercialChoices as choice}
                  <div>
                    <dt>{choice.label}</dt>
                    <dd>{choice.value}</dd>
                  </div>
                {/each}
              {:else}
                <div>
                  <dt>{translate('Expected reimbursement')}</dt>
                  <dd>{attemptedPlanningDate('expectedReimbursementOn')}</dd>
                </div>
                <div>
                  <dt>{translate('Expected client recovery')}</dt>
                  <dd>{attemptedPlanningDate('expectedRecoveryOn')}</dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}
      </div>
    {/if}

    {#if finance && data.selectedProjectId}
      <p class="finance-overview__calculation-link">
        <a class="secondary-button" data-project-calculation-link href={projectCalculationHref()}
          >{translate('Open recent-period calculation explanation')}</a
        >
      </p>
    {/if}

    {#if finance && financeProjectionIncomplete}
      <section
        class="finance-overview__projection-warning"
        data-finance-projection-warning
        role="alert"
        aria-labelledby={`finance-projection-warning-${componentId}`}
      >
        <strong id={`finance-projection-warning-${componentId}`}>
          {translate('Finance records need review')}
        </strong>
        <p>
          {translate(
            'Some source records still need finance projection data. Totals remain visible for traceability but are not complete for final review.',
          )}
        </p>
        {#if financeProjectionReasons.length}
          <ul aria-label={translate('Projection completeness reasons')}>
            {#each financeProjectionReasons as reason}
              <li data-source-record-id={reason.sourceId || undefined}>
                {projectionReasonText(reason)}
                {#if canWriteFinance && reason.code === 'missing_client_rate'}
                  <a href={projectionRuleHref('Client labor rate', reason)}
                    >{translate('Open finance configuration')}: {translate('Client labor rate')}</a
                  >
                {:else if canWriteFinance && reason.code === 'missing_internal_cost'}
                  <a href={projectionRuleHref('Internal loaded cost', reason)}
                    >{translate('Open finance configuration')}: {translate(
                      'Internal loaded cost',
                    )}</a
                  >
                {:else if canWriteFinance && reason.code === 'missing_compensation_rule'}
                  <a href={projectionRuleHref('Worker compensation', reason)}
                    >{translate('Open finance configuration')}: {translate(
                      'Worker compensation',
                    )}</a
                  >
                {:else if canWriteFinance && reason.code === 'missing_expense_finance_projection'}
                  <a href={financeHref('economic', 'expenses', '#expense-classification')}
                    >{translate('Review expense classification')}</a
                  >
                {:else if canWriteFinance && reason.code === 'missing_expense_currency_conversion'}
                  <a href={projectionExpenseSourceHref(reason)}
                    >{translate('Review source expense')}</a
                  >
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if !canWriteFinance && financeProjectionReasons.length}
          <p>{translate('Contact Finance or an owner')}</p>
        {/if}
      </section>
    {/if}

    {#if provisionalRules.length}
      <section
        class="finance-overview__projection-warning"
        data-provisional-finance-warning
        role="status"
        aria-labelledby={`provisional-finance-warning-${componentId}`}
      >
        <strong id={`provisional-finance-warning-${componentId}`}
          >{provisionalCopy[locale].title}</strong
        >
        <p>{provisionalCopy[locale].explanation}</p>
        <ul>
          {#each provisionalRules as { kind, rule } (value(rule, 'id'))}
            <li>
              {translate(kind === 'internal' ? 'Internal loaded cost' : 'Worker compensation')} ·
              {value(rule, 'workerName', 'worker_name') || translate('Assigned person')} ·
              {translate('Effective from')}: {value(rule, 'effectiveFrom', 'effective_from')} →
              {value(rule, 'effectiveTo', 'effective_to') || translate('open-ended')}
            </li>
          {/each}
        </ul>
        {#if canWriteFinance && data.selectedProjectId}
          <nav aria-label={translate('Open finance configuration')}>
            {#if provisionalRules.some(({ kind }) => kind === 'internal')}
              <a
                href={financeProjectReviewHref(base, data.selectedProjectId, 'commercial', {
                  task: 'Assignment budget context / internal loaded cost',
                  lang: locale,
                  hash: '#finance-rule-registers',
                })}>{translate('Internal loaded cost')}</a
              >
            {/if}
            {#if provisionalRules.some(({ kind }) => kind === 'compensation')}
              <a
                href={financeProjectReviewHref(base, data.selectedProjectId, 'commercial', {
                  task: 'Compensation statement rules',
                  lang: locale,
                  hash: '#finance-rule-registers',
                })}>{translate('Worker compensation')}</a
              >
            {/if}
          </nav>
        {:else}
          <p>{translate('Contact Finance or an owner')}</p>
        {/if}
      </section>
    {/if}

    {#if showEconomics}
      <div class="finance-overview__attention" aria-label={translate('Finance attention summary')}>
        <a
          class="finance-overview__attention-card"
          href={financeHref('economic', 'portfolio', '#finance-source-records')}
        >
          <span>{translate('Projects')}</span>
          <strong>{portfolioProjects.length}</strong>
          <small>{translate('Authorized project sources')}</small>
        </a>
        <a
          class="finance-overview__attention-card finance-overview__attention-card--notice"
          href={financeHref('economic', 'settlements', '#worker-payments')}
        >
          <span>{translate('Settlement review')}</span>
          <strong>{attentionSettlements}</strong>
          <small>{translate('Expected or actual payment follow-up')}</small>
        </a>
        <a
          class="finance-overview__attention-card finance-overview__attention-card--notice"
          href={`${financeHref('economic', 'settlements')}&reimbursement=pending#finance-reimbursements`}
        >
          <span>{translate('Reimbursement review')}</span>
          <strong>{attentionReimbursements}</strong>
          <small>{translate('Expected or actual reimbursement follow-up')}</small>
        </a>
        {#if finance?.alerts?.length}
          <a
            class="finance-overview__attention-card"
            href={financeHref('economic', undefined, '#finance-alert-chips')}
          >
            <span>{translate('Alerts')}</span>
            <strong>{finance?.alerts?.length ?? 0}</strong>
            <small>{translate('Project alert types')}</small>
          </a>
        {:else}
          <div class="finance-overview__attention-card">
            <span>{translate('Alerts')}</span>
            <strong>0</strong>
            <small>{translate('Project alert types')}</small>
          </div>
        {/if}
      </div>
    {/if}

    <form
      class="finance-overview__filters"
      method="GET"
      aria-label={translate('Filter finance by project')}
    >
      <input type="hidden" name="view" value={activeView} />
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="source" value={sourceTab} />
      {#if data.commercialAsOf}
        <input type="hidden" name="asOf" value={data.commercialAsOf} />
      {/if}
      {#if data.commercialCategory}
        <input type="hidden" name="category" value={data.commercialCategory} />
      {/if}
      {#if $page.url.searchParams.get('task')?.trim()}
        <input type="hidden" name="task" value={$page.url.searchParams.get('task')!.trim()} />
      {/if}
      <Field id={`finance-project-${componentId}`} label={translate('Project')}>
        <select
          id={`finance-project-${componentId}`}
          name="project"
          onchange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {#each availableProjects as project}
            <option
              value={String(project.id)}
              selected={String(project.id) === data.selectedProjectId}
            >
              {project.project_number} — {project.name}
            </option>
          {:else}
            <option value="">{translate('No authorized projects')}</option>
          {/each}
        </select>
      </Field>
    </form>

    {#if finance}
      {#if showEconomics}
        <div class="finance-overview__hero" data-finance-actual>
          <a
            class="finance-overview__hero-card finance-overview__hero-card--accent"
            data-metric="direct-project-result"
            href={financeHref('economic', 'portfolio', '#finance-source-records')}
          >
            <span>{translate('Direct Project Result')}</span>
            <strong>{displayMoney(finance.contributionMarginMinor, finance.currency)}</strong>
            <span class="finance-overview__margin-tag" data-metric="contribution-margin-percent">
              {translate('Contribution margin')}: {displayContributionMarginBps(
                finance.contributionMarginBps,
              )}
            </span>
            <small
              >{translate('Contribution')} · {translate(
                'Contribution after approved direct cost',
              )}</small
            >
          </a>
          <a
            class="finance-overview__hero-card"
            data-metric="invoiced"
            href={projectWorkflowHref('billing')}
          >
            <span>{translate('Invoiced (actual)')}</span>
            <strong>{displayMoney(finance.invoicedMinor, finance.currency)}</strong>
            <small>
              {translate('Revenue candidate')}:
              {displayMoney(finance.revenueCandidateMinor, finance.currency)}
            </small>
          </a>
          <a
            class="finance-overview__hero-card"
            data-metric="direct-cost"
            href={financeHref('economic', 'portfolio', '#finance-source-records')}
          >
            <span>{translate('Direct cost')}</span>
            <strong>{displayMoney(finance.approvedCostMinor, finance.currency)}</strong>
            <small>
              {translate('Loaded labor')}:
              {displayMoney(finance.directLaborCostMinor, finance.currency)}
              · {translate('Expenses')}:
              {displayMoney(finance.expenseCostMinor, finance.currency)}
            </small>
          </a>
          <a
            class="finance-overview__hero-card"
            data-metric="hours-consumed"
            href={projectWorkflowHref('time')}
          >
            <span>{translate('Hours')}</span>
            <strong>
              {displayHours(finance.actualMinutes ?? finance.approvedMinutes)}
              /
              {displayHours(finance.plannedMinutes)}
            </strong>
            <progress
              class="finance-overview__progress"
              data-tone={consumptionTone(finance.hoursConsumedBps)}
              aria-label={translate('Hours consumed')}
              aria-valuetext={`${displayBps(finance.hoursConsumedBps)} ${translate('Hours consumed')}`}
              max={100}
              value={progressValue(finance.hoursConsumedBps)}
            ></progress>
            <small>{displayBps(finance.hoursConsumedBps)} {translate('Hours consumed')}</small>
          </a>
        </div>

        <div class="finance-overview__cash" aria-label={translate('Cash and liquidity')}>
          <a
            class="finance-overview__cash-link"
            href={ledgerHref('collected')}
            data-metric="collected"
            >{translate('Collected (actual)')}:
            <strong>{displayMoney(finance.paidMinor, finance.currency)}</strong></a
          >
          <a
            class="finance-overview__cash-link"
            href={ledgerHref('outstanding')}
            data-metric="outstanding"
            >{translate('Net receivable / credit')}:
            <strong>{displayMoney(finance.receivableMinor, finance.currency)}</strong></a
          >
          <span data-metric="approved-wip"
            >{translate('Approved unbilled WIP')}:
            <strong>{displayMoney(finance.approvedUnbilledWipMinor, finance.currency)}</strong
            ></span
          >
          <span data-metric="revenue-candidate"
            >{translate('Revenue candidate')}:
            <strong>{displayMoney(finance.revenueCandidateMinor, finance.currency)}</strong></span
          >
        </div>

        <SectionCard
          id="finance-alerts"
          title={translate('Planned / Expected')}
          class="finance-overview__surface"
          data-finance-expected
        >
          <p class="finance-overview__surface-note">
            {translate(
              'Planning and expected values are directional controls. They never count as actual time, paid cash, or collected revenue.',
            )}
          </p>
          <div class="finance-overview__forecast-status" role="status">
            <StatusBadge
              variant={finance.forecastAvailable ? 'info' : 'neutral'}
              text={finance.forecastAvailable
                ? translate('Planning basis available')
                : translate('No detailed plan')}
            />
          </div>
          <div class="finance-overview__budget-row">
            <article class="finance-overview__metric" data-metric="planned-minutes">
              <span>{translate('Planned reference minutes')}</span>
              <strong>{displayHours(finance.plannedMinutes)}</strong>
              <small>{translate('Planning input only; it never creates actual time')}</small>
            </article>
            {#if finance.expenseBudgetMinor != null}
              <article class="finance-overview__metric" data-metric="expense-budget-used">
                <span>{translate('Expense budget used')}</span>
                <strong>{displayBps(finance.expenseBudgetConsumedBps)}</strong>
                <progress
                  class="finance-overview__progress"
                  data-tone={consumptionTone(finance.expenseBudgetConsumedBps)}
                  aria-label={translate('Expense budget used')}
                  max={100}
                  value={progressValue(finance.expenseBudgetConsumedBps)}
                ></progress>
              </article>
            {/if}
            <article class="finance-overview__metric" data-metric="travel-budget-used">
              <span>{translate('Travel budget used')}</span>
              <strong>{displayBps(finance.travelBudgetConsumedBps)}</strong>
              <progress
                class="finance-overview__progress"
                data-tone={consumptionTone(finance.travelBudgetConsumedBps)}
                aria-label={translate('Travel budget used')}
                max={100}
                value={progressValue(finance.travelBudgetConsumedBps)}
              ></progress>
            </article>
          </div>
          <details class="finance-overview__projection-details">
            <summary>{translate('Estimate to complete')}</summary>
            <div
              class="finance-overview__metrics"
              aria-label={translate('Planned and expected finance metrics')}
            >
              {#each expectedMetrics as metric}
                <article class="finance-overview__metric" data-metric={metric.key}>
                  <span>{metric.label}</span>
                  <strong
                    >{metric.key === 'planned-minutes'
                      ? displayHours(finance.plannedMinutes)
                      : metric.key === 'planned-remaining'
                        ? displayHours(finance.plannedRemainingMinutes)
                        : metric.value}</strong
                  >
                  {#if metric.note}<small>{metric.note}</small>{/if}
                </article>
              {/each}
              {#each actualMetrics as metric}
                {#if !['direct-project-result', 'invoiced', 'direct-cost', 'collected', 'outstanding', 'approved-wip', 'revenue-candidate', 'contribution-margin-percent'].includes(metric.key)}
                  <article class="finance-overview__metric" data-metric={metric.key}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    {#if metric.note}<small>{metric.note}</small>{/if}
                  </article>
                {/if}
              {/each}
            </div>
          </details>
          {#if finance.alerts?.length}
            <div
              id="finance-alert-chips"
              class="finance-overview__alerts"
              role="status"
              aria-label={translate('Finance alerts')}
            >
              {#each finance.alerts as alert}
                <span>{financeAlertText(alert)}</span>
              {/each}
            </div>
          {/if}
        </SectionCard>
      {/if}

      {#if showSourceTabs}
        <SectionCard
          id="finance-source-records"
          title={translate('Source records')}
          class="finance-overview__surface"
        >
          {#if sourceTab !== 'settlements' || settlements.length}
            {#key sourceTab}
              <RecordBrowser
                rows={sourceRows}
                bind:visible={sourceRowsPage}
                contextKey={sourceTab}
                {translate}
                label="Source records"
                showEmpty={sourceTab !== 'settlements'}
              />
            {/key}
          {/if}
          <div
            class="finance-overview__source-tabs"
            role="tablist"
            aria-label={translate('Source records')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={sourceTab === 'portfolio'}
              class:finance-overview__source-tab--active={sourceTab === 'portfolio'}
              class="finance-overview__source-tab"
              onclick={() => setSourceTab('portfolio')}>{translate('Portfolio')}</button
            >
            <button
              type="button"
              role="tab"
              aria-selected={sourceTab === 'workers'}
              class:finance-overview__source-tab--active={sourceTab === 'workers'}
              class="finance-overview__source-tab"
              onclick={() => setSourceTab('workers')}>{translate('Worker economics')}</button
            >
            <button
              type="button"
              role="tab"
              aria-selected={sourceTab === 'time'}
              class:finance-overview__source-tab--active={sourceTab === 'time'}
              class="finance-overview__source-tab"
              onclick={() => setSourceTab('time')}>{translate('Time entries')}</button
            >
            <button
              type="button"
              role="tab"
              aria-selected={sourceTab === 'expenses'}
              class:finance-overview__source-tab--active={sourceTab === 'expenses'}
              class="finance-overview__source-tab"
              onclick={() => setSourceTab('expenses')}>{translate('Expense ledger')}</button
            >
            <button
              type="button"
              role="tab"
              aria-selected={sourceTab === 'settlements'}
              class:finance-overview__source-tab--active={sourceTab === 'settlements'}
              class="finance-overview__source-tab"
              onclick={() => setSourceTab('settlements')}>{translate('Settlements')}</button
            >
          </div>
          <p class="finance-overview__surface-note">
            {translate(
              'Open the project source for the underlying operational and commercial records. Portfolio values remain grouped by currency.',
            )}
          </p>
          {#if sourceTab === 'portfolio'}
            <TableRegion
              class="finance-overview__table-region"
              ariaLabel={translate('Portfolio finance source table')}
              mobileMode="cards"
              cardRows={portfolioCardRows}
            >
              <table class="finance-overview__table">
                <caption class="sr-only">{translate('Portfolio finance source drill-down')}</caption
                >
                <thead>
                  <tr>
                    <th scope="col">{translate('Project')}</th>
                    <th scope="col">{translate('Client')}</th>
                    <th scope="col">{translate('Currency')}</th>
                    <th scope="col">{translate('Approved hours')}</th>
                    <th scope="col">{translate('Revenue candidate')}</th>
                    <th scope="col">{translate('Direct cost')}</th>
                    <th scope="col">{translate('Contribution')}</th>
                    <th scope="col">{translate('WIP')}</th>
                    <th scope="col">{translate('Source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sourceRowsPage as row}
                    <tr data-finance-project-row={projectId(row)}>
                      <td>
                        {#if projectId(row)}
                          <a class="finance-overview__source-link" href={projectHref(row)}>
                            <strong>{projectNumber(row)}</strong>
                            <span>{projectName(row)}</span>
                          </a>
                        {:else}
                          <strong>{projectNumber(row)}</strong>
                        {/if}
                      </td>
                      <td>{value(row, 'clientName', 'client_name') || '—'}</td>
                      <td>{value(row, 'currency') || '—'}</td>
                      <td>{displayHours(value(row, 'approvedMinutes', 'approved_minutes'))}</td>
                      <td
                        >{displayMoney(
                          value(row, 'revenueCandidateMinor', 'revenue_candidate_minor'),
                          value(row, 'currency'),
                        )}</td
                      >
                      <td
                        >{displayMoney(
                          value(row, 'approvedCostMinor', 'approved_cost_minor'),
                          value(row, 'currency'),
                        )}</td
                      >
                      <td
                        >{displayMoney(
                          value(row, 'contributionMarginMinor', 'contribution'),
                          value(row, 'currency'),
                        )}</td
                      >
                      <td
                        >{displayMoney(
                          value(row, 'approvedUnbilledWipMinor', 'approved_unbilled_wip_minor'),
                          value(row, 'currency'),
                        )}</td
                      >
                      <td>
                        {projectId(row) ? translate('Available') : translate('Unavailable')}
                      </td>
                    </tr>
                  {:else}
                    <tr><td colspan="9">{translate('No finance projects are available.')}</td></tr>
                  {/each}
                </tbody>
              </table>
            </TableRegion>
          {/if}

          {#if sourceTab === 'workers'}
            <div class="finance-overview__subsurface">
              <div class="finance-overview__subsurface-heading">
                <div>
                  <h3>{translate('Worker economics by source')}</h3>
                  <p>
                    {translate(
                      'All authorized projects. The project selector above does not filter these worker totals.',
                    )}
                  </p>
                </div>
                <span>{portfolioWorkers.length} {translate('records')}</span>
              </div>
              <TableRegion
                class="finance-overview__table-region"
                ariaLabel={translate('Worker economics source table')}
                mobileMode="cards"
                cardRows={workerCardRows}
              >
                <table class="finance-overview__table">
                  <caption class="sr-only">{translate('Worker economics by source')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{translate('Worker')}</th>
                      <th scope="col">{translate('Currency')}</th>
                      <th scope="col">{translate('Approved hours')}</th>
                      <th scope="col">{translate('Billable hours')}</th>
                      <th scope="col">{translate('Revenue attributed')}</th>
                      <th scope="col">{translate('Loaded labor cost')}</th>
                      <th scope="col">{translate('Travel / expense')}</th>
                      <th scope="col">{translate('Contribution')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each sourceRowsPage as row}
                      <tr>
                        <td>
                          <a
                            class="finance-overview__source-link"
                            href={portfolioWorkerSourceHref(row)}
                          >
                            {value(row, 'workerName', 'worker_name') || '—'}
                          </a>
                        </td>
                        <td>{value(row, 'currency') || '—'}</td>
                        <td>{displayHours(value(row, 'actualMinutes', 'actual_minutes'))}</td>
                        <td>{displayHours(value(row, 'billableMinutes', 'billable_minutes'))}</td>
                        <td>{displayMoney(value(row, 'revenue'), value(row, 'currency'))}</td>
                        <td
                          >{displayMoney(
                            value(row, 'internalCost', 'internal_cost'),
                            value(row, 'currency'),
                          )}</td
                        >
                        <td
                          >{displayMoney(
                            value(row, 'expenseCost', 'expense_cost'),
                            value(row, 'currency'),
                          )}</td
                        >
                        <td
                          >{displayMoney(
                            value(row, 'contribution', 'contributionMinor'),
                            value(row, 'currency'),
                          )}</td
                        >
                      </tr>
                    {:else}
                      <tr
                        ><td colspan="8"
                          >{translate('No approved worker economics are available.')}</td
                        ></tr
                      >
                    {/each}
                  </tbody>
                </table>
              </TableRegion>
            </div>
          {/if}

          {#if sourceTab === 'time'}
            <div class="finance-overview__subsurface-heading">
              <div>
                <h3>{translate('Time source records')}</h3>
                <p>
                  {translate(
                    'Review recorded minutes, billing status, effective rates and direct cost.',
                  )}
                </p>
              </div>
              <span>{timeEconomics.length} {translate('records')}</span>
            </div>
            <TableRegion
              class="finance-overview__table-region"
              ariaLabel={translate('Time economics source table')}
              mobileMode="cards"
              cardRows={timeCardRows}
            >
              <table class="finance-overview__table">
                <caption class="sr-only">{translate('Time economics review')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{translate('Date')}</th>
                    <th scope="col">{translate('Category')}</th>
                    <th scope="col">{translate('Hours')}</th>
                    <th scope="col">{translate('Billable hours')}</th>
                    <th scope="col">{translate('State')}</th>
                    <th scope="col">{translate('Billing')}</th>
                    <th scope="col">{translate('Client revenue')}</th>
                    <th scope="col">{translate('Loaded cost')}</th>
                    <th scope="col">{translate('Worker compensation')}</th>
                    <th scope="col">{translate('Configuration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sourceRowsPage as row}
                    <tr>
                      <td>
                        <a
                          class="finance-overview__source-link"
                          href={sourceRecordHref(row, 'time')}
                          >{value(row, 'workDate', 'work_date') || '—'}</a
                        >
                      </td>
                      <td>{categoryLabel(row.category)}</td>
                      <td>{displayHours(value(row, 'actualMinutes', 'actual_minutes'))}</td>
                      <td
                        >{displayHours(
                          value(row, 'clientBillableMinutes', 'client_billable_minutes'),
                        )}</td
                      >
                      <td
                        ><StatusBadge
                          variant={rowStatusVariant(row.approvalState)}
                          text={statusLabel(row.approvalState)}
                        /></td
                      >
                      <td>{statusLabel(row.billingStatus ?? 'unlocked')}</td>
                      <td>{displayMoney(row.clientRevenueMinor, finance.currency)}</td>
                      <td>{displayMoney(row.internalCostMinor, finance.currency)}</td>
                      <td>{displayMoney(row.workerCompensationMinor, finance.currency)}</td>
                      <td
                        >{row.clientRateConfigured && row.internalCostConfigured
                          ? translate('Complete')
                          : translate('Rate review')}</td
                      >
                    </tr>
                  {:else}
                    <tr
                      ><td colspan="10"
                        >{translate('No time economics are available for this project.')}</td
                      ></tr
                    >
                  {/each}
                </tbody>
              </table>
            </TableRegion>
          {/if}

          {#if sourceTab === 'expenses'}
            <div class="finance-overview__subsurface-heading">
              <div>
                <h3>{translate('Expense source records')}</h3>
                <p>
                  {translate(
                    'Operational expense truth and Finance classification remain separate workflows.',
                  )}
                </p>
              </div>
              <span>{expenseEconomics.length} {translate('records')}</span>
            </div>
            <TableRegion
              class="finance-overview__table-region"
              ariaLabel={translate('Expense economics source table')}
              mobileMode="cards"
              cardRows={expenseCardRows}
            >
              <table class="finance-overview__table">
                <caption class="sr-only">{translate('Expense economics')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{translate('Date')}</th>
                    <th scope="col">{translate('Expense')}</th>
                    <th scope="col">{translate('Category')}</th>
                    <th scope="col">{translate('Recorded amount')}</th>
                    <th scope="col">{translate('Treatment')}</th>
                    <th scope="col">{translate('Direct cost')}</th>
                    <th scope="col">{translate('Client revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sourceRowsPage as row}
                    <tr>
                      <td>{value(row, 'spentOn', 'spent_on') || '—'}</td>
                      <td>
                        <a
                          class="finance-overview__source-link"
                          href={sourceRecordHref(row, 'expenses')}
                          aria-label={expenseLinkLabel(row)}
                        >
                          <strong>{value(row, 'description') || expenseReference(row)}</strong>
                          {#if value(row, 'description')}
                            <span>{expenseReference(row)}</span>
                          {/if}
                        </a>
                      </td>
                      <td>{categoryLabel(row.category)}</td>
                      <td>{displayMoney(row.recordedAmountMinor, row.recordedCurrency)}</td>
                      <td>{expenseTreatmentLabel(row)}</td>
                      <td>{displayMoney(row.costMinor, finance.currency)}</td>
                      <td>{displayMoney(row.revenueMinor, finance.currency)}</td>
                    </tr>
                  {:else}
                    <tr
                      ><td colspan="7"
                        >{translate('No approved expenses are available for this project.')}</td
                      ></tr
                    >
                  {/each}
                </tbody>
              </table>
            </TableRegion>
          {/if}
        </SectionCard>
      {/if}

      {#if showCommercial}
        {#if financeExpenses.length}
          <div
            id="expense-classification"
            class="finance-overview__expense-controls"
            data-finance-expense-controls
            aria-label={translate('Finance expense classification and planning')}
          >
            <div class="finance-overview__subsurface-heading">
              <div>
                <h3>{translate('Expense treatment and planning')}</h3>
                <p>
                  {translate(
                    'Choose whether J&A charges this expense to the client, absorbs the cost, or excludes it from billing. Separately, schedule or record repayment to the worker who advanced the money.',
                  )}
                </p>
              </div>
              <span>{financeExpenses.length} {translate('source records')}</span>
            </div>

            <div
              class="finance-overview__inbox-filters"
              role="group"
              aria-label={translate('Expense classification inbox')}
            >
              <button
                type="button"
                class:finance-overview__inbox-filter--active={expenseInboxFilter === 'all'}
                class="finance-overview__inbox-filter"
                onclick={() => setExpenseInboxFilter('all')}
                >{translate('All')} ({financeExpenses.length})</button
              >
              <button
                type="button"
                class:finance-overview__inbox-filter--active={expenseInboxFilter === 'needs'}
                class="finance-overview__inbox-filter"
                onclick={() => setExpenseInboxFilter('needs')}
                >{translate('Needs classification')} ({needsClassificationCount})</button
              >
              <button
                type="button"
                class:finance-overview__inbox-filter--active={expenseInboxFilter === 'reimbursable'}
                class="finance-overview__inbox-filter"
                onclick={() => setExpenseInboxFilter('reimbursable')}
                >{translate('Reimbursable at cost')} ({reimbursableCount})</button
              >
              <button
                type="button"
                class:finance-overview__inbox-filter--active={expenseInboxFilter === 'non_billable'}
                class="finance-overview__inbox-filter"
                onclick={() => setExpenseInboxFilter('non_billable')}
                >{translate('Non-billable')} ({nonBillableCount})</button
              >
            </div>
            <p class="muted" data-expense-billability-help>
              {translate(
                'Non-billable means the expense is not charged to the customer. Worker reimbursement is separate: J&A can reimburse a worker for a $100 expense while charging the customer $0.',
              )}
            </p>

            <RecordBrowser
              beforeChange={clearExpenseEditor}
              rows={filteredFinanceExpenses}
              bind:visible={classificationPage}
              focusId={linkedExpenseId}
              {translate}
              label="Expense treatment and planning"
            />
            {#each classificationPage as expense}
              {@const expenseId = value(expense, 'id')}
              {@const expenseVersion = value(expense, 'version') || '1'}
              {@const classificationState = expenseClassificationState(expense)}
              {@const locked = expenseIsLocked(expense)}
              {@const policyRequired = requiresExpensePolicy(expense)}
              {@const policyPreview = expensePolicyPreview(expense)}
              {@const policyReady = Boolean(policyPreview?.policy && !policyPreview.issues?.length)}
              {@const issuerReady = hasExpenseIssuingAuthority(expense)}
              {@const reimbursementState =
                value(expense, 'reimbursementState', 'reimbursement_state') || 'pending'}
              <article
                class="finance-overview__expense-control"
                data-finance-expense-id={expenseId}
              >
                <header class="finance-overview__expense-control-heading">
                  <div>
                    <strong
                      >{value(expense, 'spentOn', 'spent_on') || '—'} · {categoryLabel(
                        expense.category,
                      )}</strong
                    >
                    <small
                      >{value(expense, 'vendor') || translate('Expense')} ·
                      {displayMoney(
                        value(expense, 'amountMinor', 'amount_minor'),
                        value(expense, 'currency'),
                      )}</small
                    >
                    <small
                      >{value(expense, 'workerName', 'worker_name') || translate('Worker')}</small
                    >
                    {#if expense.description}<p>{String(expense.description)}</p>{/if}
                    <a
                      href={`${base}/app/expenses/${encodeURIComponent(expenseId)}?lang=${encodeURIComponent(locale)}`}
                      >{translate('Open expense')}</a
                    >
                  </div>
                  <StatusBadge
                    variant={classificationState === 'classified' ? 'success' : 'warning'}
                    text={classificationState === 'classified'
                      ? translate('Classified')
                      : translate('Needs Finance classification')}
                  />
                  {#if canWriteFinance && !locked}
                    <button type="button" onclick={() => selectExpense(expenseId)}>
                      {classificationState === 'classified'
                        ? translate('Review')
                        : translate('Classify')}
                    </button>
                  {/if}
                </header>

                <div class="finance-overview__expense-timeline" data-expense-timeline>
                  <span
                    ><strong>{translate('Expected reimbursement')}</strong>
                    {value(expense, 'expectedReimbursementOn', 'expected_reimbursement_on') ||
                      '—'}</span
                  >
                  <span
                    ><strong>{translate('Actual reimbursement')}</strong>
                    {value(expense, 'reimbursedAt', 'reimbursed_at') ||
                      statusLabel(reimbursementState)}</span
                  >
                  <span
                    ><strong>{translate('Expected client recovery')}</strong>
                    {value(expense, 'expectedRecoveryOn', 'expected_recovery_on') || '—'}</span
                  >
                  <span
                    ><strong>{translate('Billing state')}</strong>
                    {statusLabel(expenseBillingState(expense))}</span
                  >
                </div>

                {#if canWriteFinance && !locked && selectedExpenseId === expenseId}
                  <div class="finance-overview__expense-form-grid" bind:this={expenseEditor}>
                    <form
                      method="POST"
                      action={expenseClassificationAction(expenseId)}
                      class="finance-overview__expense-form"
                      data-finance-expense-classification
                      use:dirtyFormGuard
                      use:formValidation
                      onsubmit={prepareExpenseClassification}
                    >
                      <ProblemNotice
                        kind="warning"
                        problem={{
                          code: 'WARNING_FINANCE_CLASSIFICATION_BILLING_ONLY',
                          messageKey: 'problem.warning.financeClassificationBillingOnly',
                          params: {},
                          fieldErrors: {},
                          remedies: [{ id: 'review_expense_classification' }],
                          correlationId: '',
                        }}
                        remedyLinks={{
                          review_expense_classification: {
                            label: translate('Review expense classification'),
                          },
                        }}
                      />
                      <input type="hidden" name="expenseId" value={expenseId} />
                      <input type="hidden" name="expectedVersion" value={expenseVersion} />
                      <input
                        type="hidden"
                        name="clientTreatment"
                        data-policy-value={policyPreview?.clientTreatment ?? ''}
                        value={policyRequired
                          ? (policyPreview?.clientTreatment ?? '')
                          : expensePresets[expensePreset(expense)].clientTreatment}
                      />
                      <input
                        type="hidden"
                        name="billingTreatment"
                        data-policy-value={policyPreview?.billingTreatment ?? ''}
                        value={policyRequired
                          ? (policyPreview?.billingTreatment ?? '')
                          : expensePresets[expensePreset(expense)].billingTreatment}
                      />
                      <input
                        type="hidden"
                        name="markupBps"
                        data-policy-value={policyPreview?.markupBps ?? 0}
                        value={policyRequired ? (policyPreview?.markupBps ?? 0) : 0}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={expenseIdempotencyKey(expense)}
                      />
                      <div class="finance-overview__form-title">
                        <strong>{translate('Finance classification')}</strong>
                        <span>{translate('Commercial configuration only')}</span>
                      </div>
                      {#if !issuerReady}
                        <p class="muted" data-expense-issuer-blocker>
                          {translate(
                            'Set a project issuing authority covering this expense date before classification.',
                          )}
                          <a href={issuingAuthorityHref()}
                            >{translate('Configure project issuing authority')} <DirectionIcon /></a
                          >
                        </p>
                      {:else}
                        <a href={issuingAuthorityHref()}
                          >{translate('Review project issuing authority')} <DirectionIcon /></a
                        >
                      {/if}
                      {#if policyRequired}
                        {#if policyReady}
                          <div class="finance-overview__form-title" data-expense-policy-preview>
                            <strong>{translate('Configured person expense policy')}</strong>
                            <span>
                              {translate('Worker reimbursement')}: {workerReimbursementLabel(
                                policyPreview?.policy?.workerReimbursement ?? '',
                              )} · {translate('Customer expense recovery')}: {expenseRecoveryLabel(
                                policyPreview?.policy?.clientRecovery ?? '',
                              )}
                            </span>
                            {#if policyPreview?.policy?.clientRecovery === 'non_billable'}
                              <small data-expense-billability-help>
                                {translate(
                                  'Non-billable means the expense is not charged to the customer. Worker reimbursement is separate: J&A can reimburse a worker for a $100 expense while charging the customer $0.',
                                )}
                              </small>
                            {/if}
                            <small>
                              {translate('Worker amount')}: {displayMoney(
                                policyPreview?.workerReimbursementMinor,
                                value(expense, 'currency'),
                              )} · {translate('Customer amount')}: {displayMoney(
                                policyPreview?.clientRecoveryMinor,
                                value(expense, 'currency'),
                              )}
                            </small>
                          </div>
                          <label>
                            <input
                              type="checkbox"
                              name="overrideExpensePolicy"
                              value="true"
                              onchange={syncExpenseOverride}
                            />
                            <span>{translate('Override this expense policy')}</span>
                          </label>
                          <label>
                            <span>{translate('One-time customer treatment')}</span>
                            <select
                              name="expenseOverridePreset"
                              onchange={syncExpensePreset}
                              disabled
                            >
                              <option value="reimbursable_at_cost"
                                >{translate('Bill at cost')}</option
                              >
                              <option value="reimbursable_plus_markup">
                                {translate('Bill with markup')}
                              </option>
                              <option value="all_in">{translate('Included in labor price')}</option>
                              <option value="non_billable"
                                >{translate('Do not bill customer')}</option
                              >
                              <option value="client_direct"
                                >{translate('Customer paid directly')}</option
                              >
                              <option value="allowance_per_diem"
                                >{translate('Allowance per diem')}</option
                              >
                              <option value="informational"
                                >{translate('Informational only')}</option
                              >
                            </select>
                          </label>
                          <label>
                            <span>{translate('One-time markup (basis points)')}</span>
                            <input
                              name="expenseOverrideMarkup"
                              type="number"
                              min="1"
                              max="10000"
                              step="1"
                              disabled
                              oninput={(event) => {
                                const form = event.currentTarget.form;
                                const target = form?.elements.namedItem(
                                  'markupBps',
                                ) as HTMLInputElement | null;
                                if (target) target.value = event.currentTarget.value;
                              }}
                            />
                          </label>
                        {:else}
                          <p class="muted" data-expense-policy-blocker>
                            {translate('Expense policy configuration required')}: {expensePolicyIssueLabels(
                              policyPreview?.issues,
                              translate,
                            ).join(', ')}.
                            <a href={personExpensePolicyHref(expense)}
                              >{translate('Configure person expense policy')}</a
                            >
                          </p>
                        {/if}
                      {:else}
                        <label>
                          <span>{translate('Expense treatment preset')}</span>
                          <select
                            name="expensePreset"
                            value={expensePreset(expense)}
                            onchange={syncExpensePreset}
                            required
                          >
                            <option value="reimbursable_at_cost">
                              {translate('Reimbursable at cost')}
                            </option>
                            <option value="all_in">{translate('All-in')}</option>
                            <option value="non_billable">{translate('Non-billable')}</option>
                          </select>
                        </label>
                      {/if}
                      <p class="muted" data-expense-billability-help>
                        {translate(
                          'Non-billable means the expense is not charged to the customer. Worker reimbursement is separate: J&A can reimburse a worker for a $100 expense while charging the customer $0.',
                        )}
                      </p>
                      <label>
                        <span>{translate('Tax rate')}</span>
                        <select
                          name="taxPercent"
                          value={expenseTaxBps(expense)}
                          onchange={syncTaxBps}
                        >
                          {#each taxPercentOptions() as option}
                            <option value={option.bps}>{option.label}</option>
                          {/each}
                        </select>
                        <input name="taxBps" type="hidden" value={expenseTaxBps(expense)} />
                        <small>{translate('0% allowed')}</small>
                      </label>
                      <label>
                        <span>{translate('Reason')}</span>
                        <textarea
                          name="reason"
                          rows="2"
                          minlength={policyRequired ? 10 : 1}
                          maxlength="2000"
                          required
                        ></textarea>
                      </label>
                      <button
                        type="submit"
                        disabled={!issuerReady || (policyRequired && !policyReady)}
                        >{translate('Save Finance classification')}</button
                      >
                    </form>

                    <form
                      method="POST"
                      action={`?/setExpensePlanningDates&view=commercial&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}&lang=${encodeURIComponent(locale)}`}
                      class="finance-overview__expense-form"
                      data-finance-expense-planning
                      use:dirtyFormGuard
                      use:formValidation
                    >
                      <input type="hidden" name="expenseId" value={expenseId} />
                      <input type="hidden" name="expectedVersion" value={expenseVersion} />
                      <div class="finance-overview__form-title">
                        <strong>{translate('Expense planning dates')}</strong>
                        <span>{translate('Planning only; actual states remain authoritative')}</span
                        >
                      </div>
                      <label>
                        <span>{translate('Expected reimbursement')}</span>
                        <input
                          name="expectedReimbursementOn"
                          type="date"
                          value={value(
                            expense,
                            'expectedReimbursementOn',
                            'expected_reimbursement_on',
                          )}
                        />
                      </label>
                      <label>
                        <span>{translate('Expected client recovery')}</span>
                        <input
                          name="expectedRecoveryOn"
                          type="date"
                          value={value(expense, 'expectedRecoveryOn', 'expected_recovery_on')}
                        />
                      </label>
                      <button type="submit">{translate('Save planning dates')}</button>
                    </form>
                  </div>
                {:else if locked}
                  <p class="finance-overview__immutable-note">
                    {translate(
                      'Historical or billed expense state; planning and classification are locked.',
                    )}
                  </p>
                {:else if isAuditor}
                  <p class="finance-overview__immutable-note">
                    {translate(
                      'Auditor view is read-only; Finance/Admin changes require authorized access.',
                    )}
                  </p>
                {/if}
              </article>
            {/each}
          </div>
        {:else}
          <p class="finance-overview__empty" data-finance-expense-controls-empty>
            {translate(
              'No expense source records are available for Finance classification or planning.',
            )}
          </p>
        {/if}

        <div class="finance-overview__configuration">
          <FinanceConfigurationSection
            {locale}
            {data}
            {availableProjects}
            {isAuditor}
            {translate}
            {controlledValue}
            reimbursementProblem={reimbursementProblemInForm ? financeProblem : null}
            reimbursementRemedyLinks={financeRemedyLinks}
            policyProblem={policyProblemInForm ? financeProblem : null}
            policyRemedyLinks={financeRemedyLinks}
            commercialAssignmentProblem={commercialAssignmentProblemInForm ? financeProblem : null}
            commercialAssignmentRemedyLinks={financeRemedyLinks}
          />
        </div>
      {/if}

      {#if showSourceTabs && sourceTab === 'settlements'}
        <SectionCard
          title={translate('Compensation settlements')}
          class="finance-overview__surface"
          id="worker-payments"
        >
          <p class="finance-overview__surface-note">
            {translate(
              'Finalize freezes the reviewed compensation snapshot; it does not mean money was transferred. Record each actual payment separately so partial payments, remaining balance and reversals stay traceable.',
            )}
          </p>
          {#if canWriteFinance}
            <p class="finance-overview__surface-note">
              {#if selectedSettlementProject}
                <strong
                  >{translate('Project')}: {value(selectedSettlementProject, 'project_number')} — {value(
                    selectedSettlementProject,
                    'name',
                  )}</strong
                >
                <br />
              {/if}
              {translate(
                'Worker choices belong to the selected project, including past assignments. Choose dates to show only people whose assignment covers the full period.',
              )}
            </p>
            <form method="POST" action="?/settleCompensation" class="finance-overview__action-form">
              <input type="hidden" name="projectId" value={data.selectedProjectId} />
              <label>
                <span>{translate('Worker')}</span>
                <select name="workerId" bind:value={settlementWorkerId} required>
                  <option value="">{translate('Select worker')}</option>
                  {#each settlementWorkerChoices as worker}
                    <option value={String(worker.id)}
                      >{worker.name} · {translate(String(worker.assignmentRelation))}</option
                    >
                  {/each}
                </select>
              </label>
              <label
                ><span>{translate('Period start')}</span><input
                  name="periodStart"
                  type="date"
                  bind:value={settlementPeriodStart}
                  required
                /></label
              >
              <label
                ><span>{translate('Period end')}</span><input
                  name="periodEnd"
                  type="date"
                  bind:value={settlementPeriodEnd}
                  required
                /></label
              >
              <button
                type="submit"
                disabled={!data.selectedProjectId || !settlementWorkerChoices.length}
                >{translate('Finalize compensation')}</button
              >
            </form>
            {#if !settlementWorkerChoices.length}
              <p class="finance-overview__surface-note">
                {!data.selectedProjectId
                  ? translate('Select a project before finalizing compensation.')
                  : settlementPeriodStart && settlementPeriodEnd
                    ? translate('No assigned worker covers the selected settlement period.')
                    : translate(
                        'No active worker or project manager assignment exists for this project.',
                      )}
              </p>
            {/if}
          {/if}
          {#if settlements.length}
            <TableRegion
              class="finance-overview__table-region"
              ariaLabel={translate('Compensation settlements table')}
              mobileMode="cards"
              cardRows={sourceRowsPage.map((row) => ({
                id: value(row, 'id'),
                cells: [
                  {
                    label: translate('Worker'),
                    value: value(row, 'workerName', 'worker_name') || '—',
                  },
                  {
                    label: translate('Period'),
                    value: `${value(row, 'periodStart', 'period_start')} → ${value(row, 'periodEnd', 'period_end')}`,
                  },
                  {
                    label: translate('Amount'),
                    value: displayMoney(row.amountMinor, row.currency),
                  },
                  {
                    label: translate('Actual paid'),
                    value: displayMoney(row.paidAmountMinor, row.currency),
                  },
                  {
                    label: translate('Remaining'),
                    value: displayMoney(row.remainingAmountMinor, row.currency),
                  },
                  { label: translate('Payment state'), value: statusLabel(row.paymentState) },
                  {
                    label: translate('Timeline'),
                    value: compensationTimeline(row),
                  },
                ],
              }))}
            >
              <table class="finance-overview__table">
                <caption class="sr-only">{translate('Compensation settlements')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{translate('Worker')}</th>
                    <th scope="col">{translate('Period')}</th>
                    <th scope="col">{translate('Basis')}</th>
                    <th scope="col">{translate('Source')}</th>
                    <th scope="col">{translate('Reviewed settlement')}</th>
                    <th scope="col">{translate('Actual paid')}</th>
                    <th scope="col">{translate('Remaining')}</th>
                    <th scope="col">{translate('Payment state')}</th>
                    <th scope="col">{translate('Timeline')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sourceRowsPage as settlement}
                    <tr>
                      <td>
                        <a
                          class="finance-overview__source-link"
                          href={`#compensation-settlement-${encodeURIComponent(value(settlement, 'id'))}`}
                        >
                          {value(settlement, 'workerName', 'worker_name') || '—'}
                        </a>
                      </td>
                      <td
                        >{value(settlement, 'periodStart', 'period_start')} → {value(
                          settlement,
                          'periodEnd',
                          'period_end',
                        )}</td
                      >
                      <td>{value(settlement, 'sourceBasis', 'source_basis') || '—'}</td>
                      <td
                        >{displayMoney(
                          value(settlement, 'sourceAmountMinor', 'source_amount_minor'),
                          settlement.currency,
                        )}</td
                      >
                      <td>{displayMoney(settlement.amountMinor, settlement.currency)}</td>
                      <td
                        >{displayMoney(
                          value(settlement, 'paidAmountMinor', 'paid_amount_minor'),
                          settlement.currency,
                        )}</td
                      >
                      <td
                        >{displayMoney(
                          value(settlement, 'remainingAmountMinor', 'remaining_amount_minor'),
                          settlement.currency,
                        )}</td
                      >
                      <td
                        ><StatusBadge
                          variant={rowStatusVariant(settlement.paymentState)}
                          text={statusLabel(settlement.paymentState)}
                        /></td
                      >
                      <td>{compensationTimeline(settlement)}</td>
                    </tr>
                  {:else}
                    <tr
                      ><td colspan="9">{translate('No settlements match the current filters.')}</td
                      ></tr
                    >
                  {/each}
                </tbody>
              </table>
            </TableRegion>
          {:else}
            <div class="finance-overview__empty" role="status">
              {translate('No settlements recorded for this project.')}
            </div>
          {/if}
          {#if settlements.length && canWriteFinance}
            <div
              class="finance-overview__settlement-planning"
              data-settlement-planning
              aria-label={translate('Expected worker payment planning')}
            >
              <h3>{translate('Expected worker payment')}</h3>
              <p class="finance-overview__surface-note">
                {translate(
                  'Set an expected payment date while preserving the actual settled timestamp.',
                )}
              </p>
              {#each sourceRowsPage as settlement}
                {@const settlementState = value(settlement, 'state', 'status')}
                {@const settlementId = value(settlement, 'id')}
                {@const planningConflict = settlementPlanningConflictFor(settlementId)}
                <form
                  method="POST"
                  action={`?/setCompensationSettlementExpectedPaymentOn&view=economic&source=settlements&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}&lang=${encodeURIComponent(locale)}`}
                  class="finance-overview__settlement-form"
                  data-settlement-planning-form
                  use:formValidation
                >
                  <input type="hidden" name="settlementId" value={settlementId} />
                  <input
                    type="hidden"
                    name="expectedPreviousPaymentOn"
                    value={value(settlement, 'expectedPaymentOn', 'expected_payment_on')}
                  />
                  {#if planningConflict}
                    <div
                      class="finance-overview__settlement-conflict"
                      data-settlement-planning-conflict
                    >
                      <p>{translate('problem.finance.settlementReviewBeforeRetry')}</p>
                      <dl>
                        <div>
                          <dt>{translate('problem.finance.settlementCurrentExpectedDate')}</dt>
                          <dd>
                            {currentSettlementPlanningDate(settlement) ||
                              translate('problem.finance.noExpectedDate')}
                          </dd>
                        </div>
                        <div>
                          <dt>{translate('problem.finance.settlementAttemptedExpectedDate')}</dt>
                          <dd>
                            {retainedFinanceValue(
                              'setCompensationSettlementExpectedPaymentOn',
                              settlementId,
                              'expectedPaymentOn',
                              '',
                            ) || translate('problem.finance.noExpectedDate')}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  {/if}
                  <label>
                    <span
                      >{value(settlement, 'workerName', 'worker_name') || translate('Worker')}</span
                    >
                    <small
                      >{translate('Actual settled')}: {value(
                        settlement,
                        'settledAt',
                        'settled_at',
                      ) ||
                        statusLabel(settlementState) ||
                        '—'}</small
                    >
                    <input
                      name="expectedPaymentOn"
                      type="date"
                      value={retainedFinanceValue(
                        'setCompensationSettlementExpectedPaymentOn',
                        settlementId,
                        'expectedPaymentOn',
                        value(settlement, 'expectedPaymentOn', 'expected_payment_on'),
                      )}
                      disabled={planningConflict}
                      aria-label={translate('Expected worker payment date')}
                    />
                  </label>
                  {#if !planningConflict}
                    <button type="submit">{translate('Save expected date')}</button>
                  {/if}
                </form>
              {/each}
            </div>
          {/if}
          {#if settlements.length && canWriteFinance}
            <div class="finance-overview__settlement-payments" data-compensation-payments>
              <h3>{translate('Actual worker or supplier payments')}</h3>
              <p class="finance-overview__surface-note">
                {translate(
                  'Use this register only after the bank transfer or other real payment occurred. A planned date and a finalized settlement are not payment evidence.',
                )}
              </p>
              {#each sourceRowsPage as settlement}
                {@const settlementId = value(settlement, 'id')}
                {@const remainingMinor = value(
                  settlement,
                  'remainingAmountMinor',
                  'remaining_amount_minor',
                )}
                {@const settlementPayments = paymentsForSettlement(settlementId)}
                <article
                  class="finance-overview__payment-register"
                  id={`compensation-settlement-${settlementId}`}
                >
                  <div class="finance-overview__payment-register-heading">
                    <div>
                      <strong>{value(settlement, 'workerName', 'worker_name')}</strong>
                      <small
                        >{value(settlement, 'periodStart', 'period_start')} → {value(
                          settlement,
                          'periodEnd',
                          'period_end',
                        )}</small
                      >
                    </div>
                    <StatusBadge
                      variant={rowStatusVariant(settlement.paymentState)}
                      text={statusLabel(settlement.paymentState)}
                    />
                  </div>
                  {#if value(settlement, 'state', 'status') === 'settled' && BigInt(remainingMinor || '0') > 0n}
                    <form
                      method="POST"
                      action="?/recordCompensationPayment&view=economic&source=settlements"
                      class="finance-overview__payment-form"
                      data-finance-action="recordCompensationPayment"
                      use:formValidation
                      use:enhance={submitFinance}
                      onsubmit={rememberFinanceScroll}
                    >
                      <input type="hidden" name="settlementId" value={settlementId} />
                      <input type="hidden" name="currency" value={settlement.currency} />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={retainedFinanceValue(
                          'recordCompensationPayment',
                          settlementId,
                          'idempotencyKey',
                          `compensation-payment:${settlementId}:${value(settlement, 'paidAmountMinor', 'paid_amount_minor') || '0'}`,
                        )}
                      />
                      <label>
                        <span>{translate('Payee')}</span>
                        <select
                          name="payeeSelection"
                          value={retainedFinanceValue(
                            'recordCompensationPayment',
                            settlementId,
                            'payeeSelection',
                            `person:${value(settlement, 'workerId', 'worker_id')}`,
                          )}
                          required
                        >
                          <option value={`person:${value(settlement, 'workerId', 'worker_id')}`}>
                            {translate('Person')}: {value(settlement, 'workerName', 'worker_name')}
                          </option>
                          {#if value(settlement, 'supplierId', 'supplier_id')}
                            <option
                              value={`supplier:${value(settlement, 'supplierId', 'supplier_id')}`}
                            >
                              {translate('Supplier company')}: {value(
                                settlement,
                                'supplierName',
                                'supplier_name',
                              )}
                            </option>
                          {/if}
                        </select>
                      </label>
                      <label>
                        <span>{translate('Actual payment amount')}</span>
                        <input
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={retainedFinanceValue(
                            'recordCompensationPayment',
                            settlementId,
                            'amount',
                            minorAsDecimal(remainingMinor),
                          )}
                          required
                        />
                      </label>
                      <label>
                        <span>{translate('Actual payment date')}</span>
                        <input
                          name="paidOn"
                          type="date"
                          value={retainedFinanceValue(
                            'recordCompensationPayment',
                            settlementId,
                            'paidOn',
                            String(data.financeToday ?? ''),
                          )}
                          required
                        />
                      </label>
                      <label>
                        <span>{translate('Payment reference')}</span>
                        <input
                          name="reference"
                          maxlength="200"
                          value={retainedFinanceValue(
                            'recordCompensationPayment',
                            settlementId,
                            'reference',
                            '',
                          )}
                          required
                        />
                      </label>
                      <label class="finance-overview__payment-note">
                        <span>{translate('Note')}</span>
                        <input
                          name="note"
                          maxlength="2000"
                          value={retainedFinanceValue(
                            'recordCompensationPayment',
                            settlementId,
                            'note',
                            '',
                          )}
                        />
                      </label>
                      <ProblemNotice
                        kind="warning"
                        problem={{
                          code: 'WARNING_WORKER_PAYMENT_ACTUAL_EVENT',
                          messageKey: 'problem.warning.workerPaymentActualEvent',
                          params: {},
                          fieldErrors: {},
                          remedies: [{ id: 'review_settlement' }],
                          correlationId: '',
                        }}
                        remedyLinks={{
                          review_settlement: {
                            label: translate('Review worker compensation settlement'),
                          },
                        }}
                      />
                      <button type="submit">{translate('Register actual payment')}</button>
                    </form>
                  {:else if value(settlement, 'state', 'status') !== 'settled'}
                    <p class="finance-overview__immutable-note">
                      {translate(
                        'Review and finalize this compensation before recording a real payment.',
                      )}
                    </p>
                  {:else}
                    <p class="finance-overview__paid-note">
                      {translate('This compensation balance is fully paid.')}
                    </p>
                  {/if}
                  {#if settlementPayments.length}
                    <div class="finance-overview__payment-events">
                      {#each settlementPayments as payment}
                        {@const paymentId = value(payment, 'id')}
                        {@const eventType = value(payment, 'eventType', 'event_type')}
                        <div class="finance-overview__payment-event">
                          <div>
                            <strong
                              >{eventType === 'reversal'
                                ? translate('Payment reversal')
                                : translate('Actual payment')}</strong
                            >
                            <small
                              >{value(payment, 'paidOn', 'paid_on')} · {displayMoney(
                                value(payment, 'amountMinor', 'amount_minor'),
                                payment.currency,
                              )} · {value(payment, 'reference')}</small
                            >
                            <small
                              >{translate('Payee')}: {value(
                                payment,
                                'payeeUserName',
                                'payee_user_name',
                                'payeeSupplierName',
                                'payee_supplier_name',
                              )}</small
                            >
                          </div>
                          {#if eventType === 'payment' && (!paymentIsReversed(paymentId) || failedReversalFor(paymentId))}
                            <form
                              method="POST"
                              action={`?/reverseCompensationPayment&view=economic&source=settlements&project=${encodeURIComponent(String(data.selectedProjectId ?? ''))}&lang=${encodeURIComponent(locale)}`}
                              class="finance-overview__reversal-form"
                              data-finance-action="reverseCompensationPayment"
                              use:formValidation
                              use:enhance={submitFinance}
                            >
                              <input type="hidden" name="paymentEventId" value={paymentId} />
                              <input
                                type="hidden"
                                name="idempotencyKey"
                                value={retainedFinanceValue(
                                  'reverseCompensationPayment',
                                  paymentId,
                                  'idempotencyKey',
                                  `compensation-payment-reversal:${paymentId}`,
                                )}
                              />
                              <input
                                name="reversedOn"
                                type="date"
                                value={retainedFinanceValue(
                                  'reverseCompensationPayment',
                                  paymentId,
                                  'reversedOn',
                                  data.financeToday,
                                )}
                                aria-label={translate('Reversal date')}
                                required
                              />
                              <input
                                name="reason"
                                minlength="3"
                                maxlength="2000"
                                placeholder={translate('Reason for reversal')}
                                aria-label={translate('Reason for reversal')}
                                value={retainedFinanceValue(
                                  'reverseCompensationPayment',
                                  paymentId,
                                  'reason',
                                  '',
                                )}
                                required
                              />
                              {#if financeProblem && failedReversalFor(paymentId)}
                                <div data-finance-problem tabindex="-1">
                                  <ProblemNotice
                                    problem={financeProblem}
                                    remedyLinks={financeRemedyLinks}
                                  />
                                </div>
                              {/if}
                              <button
                                type="submit"
                                class="secondary-button"
                                disabled={paymentIsReversed(paymentId)}
                              >
                                {translate('Reverse payment')}
                              </button>
                            </form>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </SectionCard>

        <SectionCard
          title={translate('Worker reimbursement queue')}
          class="finance-overview__surface"
          id="finance-reimbursements"
        >
          <p class="finance-overview__surface-note">
            {translate(
              'Worker reimbursement and client expense recovery are separate from customer billing and invoice collection.',
            )}
          </p>
          {#if pendingReimbursementView}
            <a
              class="secondary-button"
              href={financeHref('economic', 'settlements', '#finance-reimbursements')}
              >{translate('All')}</a
            >
          {/if}
          <div class="finance-overview__reimbursement-list">
            {#if reimbursements.length}
              <RecordBrowser
                rows={visibleReimbursements}
                bind:visible={reimbursementPage}
                {translate}
                label="Worker reimbursement queue"
                showEmpty={false}
              />
            {/if}
            {#each reimbursements.length ? reimbursementPage : [] as reimbursement}
              {@const reimbursementState = value(
                reimbursement,
                'reimbursementState',
                'reimbursement_state',
              )}
              <article
                class="finance-overview__reimbursement"
                data-reimbursement-id={value(reimbursement, 'id')}
              >
                <div>
                  <strong>
                    <a
                      class="finance-overview__source-link"
                      href={`${base}/app/expenses/${encodeURIComponent(value(reimbursement, 'id'))}`}
                    >
                      {value(reimbursement, 'workerName', 'worker_name')} · {value(
                        reimbursement,
                        'vendor',
                      ) || translate('Expense')}
                    </a>
                  </strong>
                  <small>
                    {value(reimbursement, 'spentOn', 'spent_on')} · {categoryLabel(
                      reimbursement.category,
                    )} ·
                    <StatusBadge
                      variant={rowStatusVariant(reimbursementState)}
                      text={statusLabel(reimbursementState)}
                    />
                  </small>
                  <small
                    >{timeline(
                      reimbursement,
                      ['expectedReimbursementDate', 'expected_reimbursement_date'],
                      ['reimbursedAt', 'reimbursed_at'],
                    )}</small
                  >
                </div>
                {#if canWriteFinance && reimbursementState !== 'reimbursed'}
                  <form
                    method="POST"
                    action="?/recordReimbursement&view=economic&source=expenses"
                    class="finance-overview__reimbursement-form"
                    data-finance-action="recordReimbursement"
                    use:formValidation
                    use:enhance={submitFinance}
                    onsubmit={rememberFinanceScroll}
                  >
                    <input type="hidden" name="expenseId" value={reimbursement.id} />
                    <input
                      type="hidden"
                      name="amountMinor"
                      value={retainedFinanceValue(
                        'recordReimbursement',
                        String(reimbursement.id),
                        'amountMinor',
                        String(reimbursement.reimbursementAmountMinor ?? ''),
                      )}
                    />
                    <label>
                      <span>{translate('Payment reference')}</span>
                      <input
                        name="reference"
                        value={retainedFinanceValue(
                          'recordReimbursement',
                          String(reimbursement.id),
                          'reference',
                          '',
                        )}
                        required
                      />
                    </label>
                    <button type="submit">{translate('Mark reimbursed')}</button>
                  </form>
                {:else}
                  <strong
                    >{displayMoney(
                      reimbursement.reimbursementAmountMinor,
                      reimbursement.currency,
                    )}</strong
                  >
                {/if}
              </article>
            {:else}
              <div class="finance-overview__empty" role="status">
                {reimbursements.length
                  ? translate('No reimbursements match the current filters.')
                  : translate(
                      'No approved worker-paid expenses are in this project’s reimbursement queue.',
                    )}
              </div>
            {/each}
          </div>
        </SectionCard>
      {/if}
    {:else}
      <SectionCard title={translate('Select a project')} class="finance-overview__surface">
        <p>
          {translate('Choose a project to review its finances.')}
        </p>
      </SectionCard>
    {/if}
  </div>
{/if}

<style>
  .finance-overview__hero {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .finance-overview__hero-card {
    display: grid;
    gap: 0.4rem;
    min-height: 8.5rem;
    padding: 1.05rem 1.1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.9rem;
    background: var(--portal-surface, #fff);
    box-shadow: 0 0.45rem 1.4rem rgb(16 32 42 / 0.05);
    color: inherit;
    text-decoration: none;
  }

  .finance-overview__hero-card:hover,
  .finance-overview__hero-card:focus-visible,
  a.finance-overview__attention-card:hover,
  a.finance-overview__attention-card:focus-visible {
    border-color: var(--portal-accent, #53524c);
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 26%, transparent);
    outline-offset: 2px;
  }

  .finance-overview__hero-card--accent {
    border-color: color-mix(in srgb, #64625b 42%, var(--portal-border, #dfdedc));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #64625b 10%, #fff) 0%,
      var(--portal-surface, #fff) 55%
    );
  }

  .finance-overview__hero-card span {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 750;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .finance-overview__hero-card strong {
    color: var(--portal-ink, #20201d);
    font-size: clamp(1.45rem, 2vw, 1.85rem);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
  }

  .finance-overview__hero-card .finance-overview__margin-tag {
    display: inline-flex;
    width: fit-content;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: #d7f4e4;
    color: #14532d;
    font-size: 0.8125rem;
    font-weight: 800;
    text-transform: none;
    letter-spacing: 0;
  }

  .finance-overview__cash {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 88%, var(--portal-wash, #f2f2f1));
  }

  .finance-overview__cash span,
  .finance-overview__cash-link {
    display: grid;
    gap: 0.2rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__cash-link {
    min-height: 2.75rem;
    align-content: center;
    border-radius: 0.45rem;
    text-decoration: none;
  }

  .finance-overview__cash-link:hover,
  .finance-overview__cash-link:focus-visible {
    color: var(--portal-link, #53524c);
    outline: 2px solid color-mix(in srgb, var(--portal-link, #53524c) 35%, transparent);
    outline-offset: 0.2rem;
  }

  .finance-overview__cash strong {
    color: var(--portal-ink, #20201d);
    font-variant-numeric: tabular-nums;
  }

  .finance-overview__progress {
    display: block;
    width: 100%;
    height: 0.45rem;
    appearance: none;
    overflow: hidden;
    border: 0;
    border-radius: 999px;
    background: var(--portal-wash, #f2f2f1);
  }

  .finance-overview__progress::-webkit-progress-bar {
    background: var(--portal-wash, #f2f2f1);
  }

  .finance-overview__progress::-webkit-progress-value {
    border-radius: inherit;
    background: #64625b;
  }

  .finance-overview__progress::-moz-progress-bar {
    border-radius: inherit;
    background: #64625b;
  }

  .finance-overview__progress[data-tone='warning']::-webkit-progress-value {
    background: #b7791f;
  }

  .finance-overview__progress[data-tone='warning']::-moz-progress-bar {
    background: #b7791f;
  }

  .finance-overview__progress[data-tone='danger']::-webkit-progress-value {
    background: #b42318;
  }

  .finance-overview__progress[data-tone='danger']::-moz-progress-bar {
    background: #b42318;
  }

  .finance-overview__budget-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .finance-overview__source-tabs,
  .finance-overview__inbox-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 0.85rem;
  }

  .finance-overview__source-tab,
  .finance-overview__inbox-filter {
    min-height: 2.75rem;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 999px;
    background: #fff;
    color: var(--portal-ink, #20201d);
    font: inherit;
    font-weight: 650;
  }

  .finance-overview__source-tab--active,
  .finance-overview__inbox-filter--active,
  .finance-overview__source-tab[aria-selected='true'] {
    background: var(--portal-ink, #20201d);
    border-color: var(--portal-ink, #20201d);
    color: #fff;
  }

  .finance-overview__projection-details {
    margin-top: 0.75rem;
  }

  .finance-overview__projection-details summary {
    min-height: 2.75rem;
    cursor: pointer;
    font-weight: 750;
  }

  .finance-overview__table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--portal-surface, #fff);
  }

  .finance-overview {
    display: grid;
    gap: 1rem;
    color: var(--portal-ink, #20201d);
  }

  .finance-overview__context {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.25rem 0 0.35rem;
  }

  .finance-overview__context h2,
  .finance-overview--denied h2 {
    margin: 0;
    font-size: clamp(1.45rem, 2.5vw, 2rem);
    letter-spacing: -0.025em;
  }

  .finance-overview__context p:last-child,
  .finance-overview--denied p:last-child {
    max-width: 52rem;
    margin: 0.45rem 0 0;
    color: var(--portal-muted, #67675f);
  }

  .finance-overview__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-accent, #53524c);
    font-size: 0.8125rem;
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .finance-overview--denied {
    padding: 1.25rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.8rem;
    background: var(--portal-surface, #fff);
  }

  .finance-overview__projection-warning {
    display: grid;
    gap: 0.45rem;
    padding: 0.85rem 1rem;
    border: 1px solid
      color-mix(in srgb, var(--portal-warning, #b7791f) 58%, var(--portal-border, #dfdedc));
    border-left-width: 0.3rem;
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--portal-warning, #b7791f) 10%, var(--portal-surface, #fff));
    color: var(--portal-ink, #20201d);
  }

  .finance-overview__projection-warning strong {
    color: var(--portal-ink, #20201d);
  }

  .finance-overview__projection-warning p {
    max-width: 70rem;
    margin: 0;
    line-height: 1.45;
  }

  .finance-overview__projection-warning ul {
    display: grid;
    gap: 0.25rem;
    margin: 0.1rem 0 0;
    padding-left: 1.2rem;
  }

  .finance-overview__projection-warning li {
    overflow-wrap: anywhere;
  }

  .finance-overview__projection-warning li a {
    display: block;
    width: fit-content;
    margin-top: 0.2rem;
  }

  .finance-overview__projection-reference {
    display: block;
    color: var(--portal-muted, #67675f);
    overflow-wrap: anywhere;
  }

  .finance-overview__projection-warning nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.85rem;
  }

  .finance-overview__attention {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .finance-overview__attention-card {
    display: grid;
    gap: 0.22rem;
    min-height: 5.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
    color: inherit;
    text-decoration: none;
  }

  .finance-overview__attention-card--notice {
    border-color: color-mix(
      in srgb,
      var(--portal-warning, #b7791f) 42%,
      var(--portal-border, #dfdedc)
    );
  }

  .finance-overview__attention-card span,
  .finance-overview__attention-card small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__attention-card strong,
  .finance-overview__metric strong {
    font-variant-numeric: tabular-nums;
  }

  .finance-overview__attention-card strong {
    font-size: 1.4rem;
  }

  .finance-overview__filters {
    display: grid;
    grid-template-columns: minmax(15rem, 30rem);
    gap: 0.5rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #f2f2f1));
  }

  .finance-overview__action-form label,
  .finance-overview__reimbursement-form label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .finance-overview__filters select,
  .finance-overview__action-form input,
  .finance-overview__action-form select,
  .finance-overview__reimbursement-form input {
    min-height: 44px;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }

  .finance-overview__surface-note {
    margin: 0 0 0.9rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .finance-overview__metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .finance-overview__metric {
    display: grid;
    gap: 0.25rem;
    min-height: 5.6rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 90%, var(--portal-wash, #f2f2f1));
  }

  .finance-overview__metric span {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    line-height: 1.25;
  }

  .finance-overview__metric strong {
    color: var(--portal-ink, #20201d);
    font-size: 1.15rem;
    overflow-wrap: anywhere;
  }

  .finance-overview__metric small,
  .finance-overview__subsurface-heading p {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    line-height: 1.35;
  }

  .finance-overview__forecast-status {
    margin: 0 0 0.75rem;
  }

  .finance-overview__alerts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.75rem;
  }

  .finance-overview__alerts span {
    padding: 0.35rem 0.55rem;
    border: 1px solid
      color-mix(in srgb, var(--portal-warning, #b7791f) 38%, var(--portal-border, #dfdedc));
    border-radius: 999px;
    color: var(--portal-ink, #20201d);
    font-size: 0.8125rem;
  }

  .finance-overview__table {
    width: 100%;
    border-collapse: collapse;
  }

  .finance-overview__table th,
  .finance-overview__table td {
    padding: 0.72rem 0.65rem;
    border-bottom: 1px solid var(--portal-border, #dfdedc);
    text-align: left;
    vertical-align: top;
  }

  .finance-overview__table th {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .finance-overview__table td {
    color: var(--portal-ink, #20201d);
    font-size: 0.84rem;
    font-variant-numeric: tabular-nums;
  }

  .finance-overview__source-link {
    display: grid;
    gap: 0.18rem;
    color: var(--portal-accent, #53524c);
    text-decoration: none;
  }

  .finance-overview__source-link span {
    color: var(--portal-ink, #20201d);
  }

  .finance-overview__source-link:hover {
    text-decoration: underline;
  }

  .finance-overview__subsurface {
    display: grid;
    gap: 0.65rem;
    margin-top: 1.1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .finance-overview__subsurface-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .finance-overview__subsurface-heading h3 {
    margin: 0;
    font-size: 1rem;
  }

  .finance-overview__subsurface-heading p {
    margin: 0.3rem 0 0;
  }

  .finance-overview__subsurface-heading > span {
    flex: 0 0 auto;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__expense-controls,
  .finance-overview__settlement-planning,
  .finance-overview__settlement-payments {
    display: grid;
    gap: 0.8rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .finance-overview__expense-control {
    display: grid;
    gap: 0.8rem;
    padding: 0.9rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 94%, var(--portal-wash, #f2f2f1));
  }

  .finance-overview__expense-control-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .finance-overview__expense-control-heading > div,
  .finance-overview__form-title {
    display: grid;
    gap: 0.22rem;
  }

  .finance-overview__expense-control-heading small,
  .finance-overview__form-title span,
  .finance-overview__settlement-form small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__expense-timeline {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .finance-overview__expense-timeline span {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.6rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
    color: var(--portal-ink, #20201d);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .finance-overview__expense-timeline strong {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .finance-overview__expense-control-heading p {
    overflow-wrap: anywhere;
    margin-block: 0.4rem;
  }
  .finance-overview__expense-control-heading a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .finance-overview__expense-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .finance-overview__expense-form,
  .finance-overview__settlement-form {
    display: grid;
    align-content: start;
    gap: 0.65rem;
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.55rem;
    background: var(--portal-surface, #fff);
  }

  .finance-overview__settlement-conflict {
    padding: 0.7rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
    background: var(--portal-wash, #f9f9f8);
  }

  .finance-overview__settlement-conflict p {
    margin: 0 0 0.6rem;
  }

  .finance-overview__settlement-conflict dl {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }

  .finance-overview__settlement-conflict dt {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__settlement-conflict dd {
    margin: 0.15rem 0 0;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .finance-overview__expense-form label,
  .finance-overview__settlement-form label {
    display: grid;
    gap: 0.3rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .finance-overview__expense-form input,
  .finance-overview__expense-form select,
  .finance-overview__expense-form textarea,
  .finance-overview__settlement-form input {
    width: 100%;
    min-height: 44px;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }

  .finance-overview__expense-form textarea {
    min-height: 4.25rem;
    resize: vertical;
  }

  .finance-overview__expense-form small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .finance-overview__expense-form button,
  .finance-overview__settlement-form button {
    min-height: 44px;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--portal-accent, #53524c);
    border-radius: 0.5rem;
    background: var(--portal-accent, #53524c);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .finance-overview__settlement-planning h3 {
    margin: 0;
    font-size: 1rem;
  }

  .finance-overview__settlement-form {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .finance-overview__settlement-payments h3 {
    margin: 0;
    font-size: 1rem;
  }

  .finance-overview__payment-register {
    display: grid;
    gap: 0.75rem;
    padding: 0.9rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 96%, var(--portal-wash, #f2f2f1));
  }

  .finance-overview__payment-register-heading,
  .finance-overview__payment-event {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .finance-overview__payment-register-heading > div,
  .finance-overview__payment-event > div {
    display: grid;
    gap: 0.2rem;
  }

  .finance-overview__payment-register small,
  .finance-overview__payment-event small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__payment-form {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: end;
    gap: 0.65rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--portal-border, #dfdedc);
  }

  .finance-overview__payment-form label {
    display: grid;
    gap: 0.3rem;
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .finance-overview__payment-form input,
  .finance-overview__payment-form select,
  .finance-overview__reversal-form input {
    width: 100%;
    min-height: 42px;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--portal-border-strong, #c4c4bf);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #20201d);
    font: inherit;
  }

  .finance-overview__payment-note {
    grid-column: span 2;
  }

  .finance-overview__payment-form button,
  .finance-overview__reversal-form button {
    min-height: 42px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--portal-accent, #53524c);
    border-radius: 0.5rem;
    background: var(--portal-accent, #53524c);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .finance-overview__payment-events {
    display: grid;
    gap: 0.55rem;
  }

  .finance-overview__payment-event {
    padding: 0.65rem;
    border-radius: 0.5rem;
    background: var(--portal-wash, #f2f2f1);
  }

  .finance-overview__reversal-form {
    display: grid;
    grid-template-columns: minmax(8rem, 0.75fr) minmax(12rem, 1.4fr) auto;
    gap: 0.5rem;
    align-items: center;
  }

  .finance-overview__paid-note {
    margin: 0;
    color: var(--portal-success, #166534);
    font-weight: 700;
  }

  .finance-overview__immutable-note {
    margin: 0;
    padding: 0.7rem;
    border-left: 3px solid var(--portal-border-strong, #c4c4bf);
    color: var(--portal-muted, #67675f);
    font-size: 0.82rem;
  }

  .finance-overview__action-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 0.7rem;
    margin-bottom: 1rem;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #f2f2f1));
  }

  .finance-overview__action-form button,
  .finance-overview__reimbursement-form button {
    min-height: 44px;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--portal-accent, #53524c);
    border-radius: 0.5rem;
    background: var(--portal-accent, #53524c);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .finance-overview__reimbursement-list {
    display: grid;
    gap: 0.65rem;
  }

  .finance-overview__reimbursement {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.65rem;
  }

  .finance-overview__reimbursement > div:first-child {
    display: grid;
    gap: 0.3rem;
  }

  .finance-overview__reimbursement small {
    color: var(--portal-muted, #67675f);
    font-size: 0.8125rem;
  }

  .finance-overview__reimbursement-form {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) auto;
    align-items: end;
    gap: 0.55rem;
    min-width: min(27rem, 100%);
  }

  .finance-overview__empty {
    padding: 1rem;
    color: var(--portal-muted, #67675f);
    text-align: center;
  }

  .finance-overview__attempted-recap {
    margin: 0.6rem 0 1rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--portal-border, #dfdedc);
    border-radius: 0.5rem;
    min-width: 0;
  }

  .finance-overview__attempted-recap dl {
    display: grid;
    gap: 0.45rem;
    margin: 0.5rem 0 0;
  }

  .finance-overview__attempted-recap dl > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
    gap: 0.4rem 1rem;
  }

  .finance-overview__attempted-recap dt {
    font-weight: 600;
  }

  .finance-overview__attempted-recap dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .finance-overview__filters select:focus-visible,
  .finance-overview__action-form input:focus-visible,
  .finance-overview__action-form select:focus-visible,
  .finance-overview__reimbursement-form input:focus-visible,
  .finance-overview__expense-form input:focus-visible,
  .finance-overview__expense-form select:focus-visible,
  .finance-overview__expense-form textarea:focus-visible,
  .finance-overview__settlement-form input:focus-visible,
  .finance-overview__payment-form input:focus-visible,
  .finance-overview__payment-form select:focus-visible,
  .finance-overview__payment-form button:focus-visible,
  .finance-overview__reversal-form input:focus-visible,
  .finance-overview__reversal-form button:focus-visible,
  .finance-overview__action-form button:focus-visible,
  .finance-overview__reimbursement-form button:focus-visible,
  .finance-overview__expense-form button:focus-visible,
  .finance-overview__settlement-form button:focus-visible,
  .finance-overview__source-link:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #53524c) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 62rem) {
    .finance-overview__attention {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__action-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__expense-timeline {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__payment-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .finance-overview__action-form button {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 48rem) {
    .finance-overview__context,
    .finance-overview__reimbursement,
    .finance-overview__subsurface-heading {
      flex-direction: column;
    }

    .finance-overview__context :global(.ui-status-badge),
    .finance-overview__reimbursement-form {
      width: 100%;
    }

    .finance-overview__reimbursement-form {
      min-width: 0;
    }

    .finance-overview__payment-event {
      display: grid;
    }

    .finance-overview__reversal-form {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 36rem) {
    .finance-overview__attempted-recap dl > div {
      grid-template-columns: 1fr;
    }

    .finance-overview__attention,
    .finance-overview__hero,
    .finance-overview__cash,
    .finance-overview__budget-row,
    .finance-overview__metrics,
    .finance-overview__action-form,
    .finance-overview__expense-form-grid,
    .finance-overview__payment-form,
    .finance-overview__reimbursement-form {
      grid-template-columns: 1fr;
    }

    .finance-overview__expense-control-heading {
      flex-direction: column;
    }

    .finance-overview__expense-timeline,
    .finance-overview__settlement-form {
      grid-template-columns: 1fr;
    }

    .finance-overview__payment-note {
      grid-column: auto;
    }

    .finance-overview__filters {
      grid-template-columns: 1fr;
    }

    .finance-overview__action-form button {
      grid-column: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .finance-overview * {
      scroll-behavior: auto;
    }
  }
</style>
