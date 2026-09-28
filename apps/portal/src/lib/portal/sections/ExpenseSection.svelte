<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, replaceState } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { normalizePortalLocale, portalText } from '../../portal-i18n';
  import { localToday } from '../ui/time-entry-clock';
  import { createOperationalSubmit, operationalFieldValidation } from '../ui/operational-submit';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { base } from '$app/paths';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { ResponsiveSheet, SectionCard, StatusBadge } from '../ui';
  import FilterSummary from '../ui/FilterSummary.svelte';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import type { ProblemData } from '../../problem/contract';
  import { reportFormFieldErrors } from '../ui/form-validation';
  import DatePresets from '../ui/DatePresets.svelte';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';
  import {
    expenseReceiptState,
    expenseSearchMatches,
    receiptStateLabels,
  } from '../expense-evidence';
  import {
    operationalPage,
    operationalSort,
    operationalStatusMatches,
    readOperationalRegisterState,
    type OperationalOrder,
    writeOperationalRegisterState,
  } from './operational-register';

  let {
    data,
    isAuditor,
    availableProjects,
    saveOfflineDraft,
    translate,
    controlledValue,
  }: {
    data: PortalData;
    isAuditor: boolean;
    availableProjects: Row[];
    saveOfflineDraft: (
      event: SubmitEvent,
      entityType: 'time' | 'daily_report' | 'technical_report' | 'expense',
    ) => Promise<{ saved: boolean; error?: string }>;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();
  const warningLocale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
  );

  type Surface = 'create' | 'edit';

  const nativeExpenseForm = $page.form as
    | (ProblemData & { values?: Record<string, unknown> })
    | null;
  const nativeExpenseValues =
    nativeExpenseForm?.code &&
    nativeExpenseForm.values &&
    typeof nativeExpenseForm.values === 'object'
      ? nativeExpenseForm.values
      : {};
  const nativeExpenseValue = (field: string): string =>
    typeof nativeExpenseValues[field] === 'string' ? String(nativeExpenseValues[field]) : '';
  const nativeExpenseSurface: Surface | null =
    nativeExpenseForm?.code &&
    (nativeExpenseValue('spentOn') ||
      nativeExpenseValue('projectId') ||
      nativeExpenseValue('amount') ||
      nativeExpenseForm.messageKey === 'action.validation.expenseFields')
      ? nativeExpenseValue('id')
        ? 'edit'
        : 'create'
      : null;
  let nativeRecoveryActive = $state(Boolean(nativeExpenseSurface));
  const restoredExpenseValue = (field: string): string =>
    nativeRecoveryActive ? nativeExpenseValue(field) : '';

  let surface = $state<Surface | null>(nativeExpenseSurface);
  let surfaceError = $state('');
  let surfaceProblem = $state<ProblemData | null>(nativeExpenseSurface ? nativeExpenseForm : null);
  const problemExpenseId = $derived.by(() => {
    const values = (surfaceProblem as (ProblemData & { values?: Record<string, unknown> }) | null)
      ?.values;
    return typeof values?.id === 'string' ? values.id : '';
  });
  let saving = $state(false);
  let createDate = $state(nativeExpenseValue('spentOn'));
  let createProject = $state(nativeExpenseValue('projectId'));
  let createWhoPaid = $state(nativeExpenseValue('whoPaid') || 'worker');
  const payerTreatmentWarning: ProblemData = {
    code: 'WARNING_EXPENSE_PAYER_SEPARATE_TREATMENT',
    messageKey: 'problem.warning.expensePayerSeparateTreatment',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_expense_payer' }],
    correlationId: '',
  };
  const missingDraftReceiptWarning: ProblemData = {
    code: 'WARNING_EXPENSE_DRAFT_RECEIPT_MISSING',
    messageKey: 'problem.warning.expenseDraftReceiptMissing',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'attach_receipt_or_save_draft' }],
    correlationId: '',
  };
  const selectedTimeLinkWarning: ProblemData = {
    code: 'WARNING_EXPENSE_TIME_LINK_REVIEW',
    messageKey: 'problem.warning.expenseTimeLinkReview',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_selected_time_entry' }],
    correlationId: '',
  };
  const emptyWorkerProblem = $derived<ProblemData | null>(
    ['owner_admin', 'project_manager'].includes(String(data.user.role)) &&
      (data.workers ?? []).length === 0
      ? {
          code: 'OPERATIONAL_WORKER_OPTIONS_EMPTY',
          messageKey: 'problem.operational.workerOptionsEmpty',
          params: {},
          fieldErrors: {},
          remedies:
            data.user.role === 'owner_admin'
              ? [{ id: 'review_workers' }]
              : [{ id: 'contact_project_owner' }],
          correlationId: '',
        }
      : null,
  );
  const emptyProjectProblem = $derived<ProblemData | null>(
    availableProjects.length === 0
      ? {
          code: 'OPERATIONAL_PROJECT_OPTIONS_EMPTY',
          messageKey: 'problem.operational.projectOptionsEmpty',
          params: {},
          fieldErrors: {},
          remedies:
            data.user.role === 'owner_admin'
              ? [{ id: 'review_projects' }]
              : [{ id: 'contact_project_owner' }],
          correlationId: '',
        }
      : null,
  );
  const projectSelectionUnavailable = $derived(
    Boolean(createProject) &&
      !availableProjects.some((project) => String(project.id) === createProject),
  );
  const selectedProjectUnavailableProblem = $derived<ProblemData | null>(
    availableProjects.length > 0 && projectSelectionUnavailable
      ? {
          code: 'OPERATIONAL_SELECTED_PROJECT_UNAVAILABLE',
          messageKey: 'problem.operational.selectedProjectUnavailable',
          params: {},
          fieldErrors: {},
          remedies:
            data.user.role === 'owner_admin'
              ? [{ id: 'review_projects' }]
              : [{ id: 'contact_project_owner' }],
          correlationId: '',
        }
      : null,
  );
  let createCurrency = $state(nativeExpenseValue('currency') || 'USD');
  let createDescription = $state(nativeExpenseValue('description'));
  let createDescriptionEdited = $state(Boolean(nativeExpenseValue('description')));
  let suggestedDescriptionScope = '';
  const createProjectCurrency = $derived(
    String(
      availableProjects.find((project) => String(project.id) === createProject)?.currency ?? 'USD',
    ),
  );
  let createWorker = $state(nativeExpenseValue('workerId'));
  let createRequestId = $state(nativeExpenseValue('requestId'));
  let crewWorkerOptions = $state<Array<{ id: string; name: string }>>([]);
  let crewWorkersLoading = $state(false);
  let crewLookupProblem = $state<ProblemData | null>(null);
  let crewLookupRetry = $state(0);
  let crewLookupScope = '';
  const crewSelectionUnavailable = $derived(
    data.user.role === 'worker' &&
      Boolean(createWorker) &&
      createWorker !== data.user.id &&
      !crewWorkersLoading &&
      !crewLookupProblem &&
      !crewWorkerOptions.some((worker) => worker.id === createWorker),
  );
  let createTimeEntryId = $state(nativeExpenseValue('timeEntryId'));
  let handledTimeLink = $state('');
  let editDate = $state(nativeExpenseValue('spentOn'));
  let editTimeEntryId = $state(
    nativeExpenseSurface === 'edit' ? nativeExpenseValue('timeEntryId') : '',
  );
  let linkedTimeOptions = $state<
    Array<{
      id: string;
      workerId: string;
      workerName: string;
      minutes: number;
      category: string;
      summary: string;
      approvalState: string;
      correctionLinked: number;
    }>
  >([]);
  let linkedTimeLoading = $state(false);
  let linkedTimeLookupSucceeded = $state(false);
  let editOriginalLinkValid = $state<boolean | null>(null);
  let timeLookupProblem = $state<ProblemData | null>(null);
  let timeLookupRetry = $state(0);
  let timeLookupScope = '';
  const timeSelectionUnavailable = $derived(
    surface === 'create' &&
      Boolean(createTimeEntryId) &&
      !linkedTimeLoading &&
      !timeLookupProblem &&
      !linkedTimeOptions.some((time) => time.id === createTimeEntryId),
  );
  const editOriginalLinkDateMismatch = $derived(
    surface === 'edit' &&
      Boolean(editTimeEntryId) &&
      editTimeEntryId === rowText(editRow, 'time_entry_id') &&
      editDate !== rowText(editRow, 'spent_on'),
  );
  const editOriginalLinkUnverified = $derived(
    surface === 'edit' &&
      Boolean(editTimeEntryId) &&
      editTimeEntryId === rowText(editRow, 'time_entry_id') &&
      editDate === rowText(editRow, 'spent_on') &&
      editOriginalLinkValid === null &&
      !timeLookupProblem,
  );
  const editTimeSelectionUnavailable = $derived(
    editOriginalLinkDateMismatch ||
      (surface === 'edit' &&
        Boolean(editTimeEntryId) &&
        linkedTimeLookupSucceeded &&
        !linkedTimeLoading &&
        !timeLookupProblem &&
        !linkedTimeOptions.some((time) => time.id === editTimeEntryId) &&
        !(
          editTimeEntryId === rowText(editRow, 'time_entry_id') &&
          editDate === rowText(editRow, 'spent_on') &&
          editOriginalLinkValid === true
        )),
  );
  let descriptionLookupProblem = $state<ProblemData | null>(null);
  let descriptionLookupRetry = $state(0);
  const lookupUnavailable = (): ProblemData => ({
    code: 'EXPENSE_LOOKUP_UNAVAILABLE',
    messageKey: 'problem.expenseLookup.unavailable',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'retry_expense_options' }],
    correlationId: '',
  });
  const lookupProblem = (payload: unknown): ProblemData => {
    if (!payload || typeof payload !== 'object') return lookupUnavailable();
    const candidate = payload as Partial<ProblemData>;
    if (typeof candidate.code !== 'string' || typeof candidate.messageKey !== 'string')
      return lookupUnavailable();
    return {
      code: candidate.code,
      messageKey: candidate.messageKey as ProblemData['messageKey'],
      params: candidate.params ?? {},
      fieldErrors: candidate.fieldErrors ?? {},
      remedies: Array.isArray(candidate.remedies) ? candidate.remedies : [],
      correlationId: candidate.correlationId ?? '',
    };
  };
  const caughtLookupProblem = (caught: unknown): ProblemData =>
    caught &&
    typeof caught === 'object' &&
    typeof (caught as Partial<ProblemData>).code === 'string' &&
    typeof (caught as Partial<ProblemData>).messageKey === 'string'
      ? (caught as ProblemData)
      : lookupUnavailable();
  function focusLookupNotice(kind: 'crew' | 'time' | 'description'): void {
    void tick().then(() => {
      const notice = document.querySelector<HTMLElement>(`.expense-${kind}-lookup-notice`);
      notice?.focus({ preventScroll: true });
      // On phones the form actions stick to the sheet bottom. Align the notice
      // with the scrollable body's top so its cause and remedy clear that bar.
      notice?.scrollIntoView({ block: 'start' });
    });
  }
  const canRetryLookup = (problem: ProblemData | null): boolean =>
    Boolean(problem?.remedies.some((remedy) => remedy.id === 'retry_expense_options'));
  const lookupRemedyLinks = $derived({
    sign_in_again: {
      label: portalText(warningLocale, 'problem.remedy.signInAgain'),
      href: `${base}/app/login`,
    },
    contact_owner: { label: portalText(warningLocale, 'problem.remedy.contactAccessOwner') },
    review_expense_form: {
      label: portalText(warningLocale, 'problem.expenseLookup.reviewExpenseForm'),
    },
  });
  const decimalHours = (minutes: number): string => String(Number((minutes / 60).toFixed(4)));
  const submitExpense = createOperationalSubmit({
    locale: () => normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
    translate: (value) => translate(value),
    setSaving: (value) => {
      saving = value;
    },
    setError: (value) => {
      surfaceError = value;
    },
    setProblem: (value) => {
      surfaceProblem = value;
    },
    onSuccess: closeSurface,
    offlineHandled: () => surface === 'create' && data.offlineEnabled !== false,
  });
  let editExpenseId = $state<string | null>(
    nativeExpenseSurface === 'edit' ? nativeExpenseValue('id') : null,
  );
  $effect(() => {
    const timeEntryId = $page.url.searchParams.get('timeEntry')?.trim() ?? '';
    if (!nativeRecoveryActive && timeEntryId && timeEntryId !== handledTimeLink) {
      handledTimeLink = timeEntryId;
      openCreate();
    }
  });
  $effect(() => {
    const id = $page.url.searchParams.get('edit');
    const row = records.find(
      (item) =>
        String(item.id) === id &&
        item.approval_state === 'draft' &&
        !item.shared_receipt_allocated &&
        Number(item.correction_linked ?? 0) !== 1,
    );
    if (!nativeRecoveryActive && id && row) {
      editExpenseId = id;
      editDate = String(row.spent_on ?? '');
      editTimeEntryId = String(row.time_entry_id ?? '');
      surface = 'edit';
    }
  });
  let search = $state('');
  let projectFilter = $state('');
  let workerFilter = $state('');
  let clientFilter = $state('');
  let categoryFilter = $state('');
  let currencyFilter = $state('');
  let fromFilter = $state('');
  let toFilter = $state('');
  let statusFilter = $state('');
  let reimbursementFilter = $state('');
  let receiptFilter = $state('');
  let order = $state<OperationalOrder>('newest');
  let receiptPreviewUrl = $state<string | null>(null);
  let receiptPreviewName = $state('');
  let receiptPreviewMime = $state('');
  let registerPage = $state(1);
  let registerStateHydrated = $state(false);
  let exportFrom = $state(`${new Date().toISOString().slice(0, 8)}01`);
  let exportTo = $state(new Date().toISOString().slice(0, 10));
  let exportProject = $state('');
  let exportWorker = $state('');
  let exportClient = $state('');
  let exportCategory = $state('');
  let exportCurrency = $state('');
  let exportStatus = $state('');
  let exportReimbursement = $state('');
  type ExportScope = 'filtered' | 'custom';
  type ExportFormat = 'csv' | 'xlsx' | 'pdf';
  let exportProblem = $state<ProblemData | null>(null);
  let exportProblemScope = $state<ExportScope | null>(null);
  let exportBusy = $state(false);
  let lastExport = $state<{ scope: ExportScope; format: ExportFormat } | null>(null);
  let exportController: AbortController | null = null;
  let exportDisposed = false;
  let exportObjectUrls: Array<{ url: string; timer: number }> = [];
  function releaseExportObjectUrls(): void {
    for (const { url, timer } of exportObjectUrls) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    exportObjectUrls = [];
  }
  function cancelExpenseExport(): void {
    exportController?.abort();
    exportController = null;
    exportBusy = false;
    releaseExportObjectUrls();
  }
  beforeNavigate(cancelExpenseExport);
  onDestroy(() => {
    exportDisposed = true;
    cancelExpenseExport();
  });
  const filteredExportProblem = $derived(exportProblemScope === 'filtered' ? exportProblem : null);
  const customExportProblem = $derived(exportProblemScope === 'custom' ? exportProblem : null);
  const exportRemedyLinks = $derived({
    sign_in_again: {
      label: portalText(warningLocale, 'problem.remedy.signInAgain'),
      href: `${base}/app/login`,
    },
    contact_owner: { label: portalText(warningLocale, 'problem.remedy.contactAccessOwner') },
    review_own_expenses: {
      label: portalText(warningLocale, 'problem.expenseExport.reviewOwnExpenses'),
      href: '#expense-register-filters',
    },
    review_expense_filters: {
      label: portalText(warningLocale, 'problem.expenseExport.reviewFilters'),
      href:
        exportProblemScope === 'custom' ? '#expense-export-fields' : '#expense-register-filters',
    },
  });
  const exportFieldNames: Readonly<Record<string, string>> = {
    from: 'From',
    to: 'To',
    project: 'Project',
    worker: 'Worker',
    client: 'Client',
    category: 'Category',
    currency: 'Currency',
    status: 'Status',
    reimbursement: 'Reimbursement status',
    receipt: 'Receipt evidence',
    q: 'Search expenses',
  };
  function exportFieldTarget(scope: ExportScope, field: string): string | null {
    if (scope === 'custom' && ['receipt', 'q'].includes(field)) return null;
    if (
      field === 'worker' &&
      !['owner_admin', 'project_manager', 'finance_admin'].includes(String(data.user.role))
    )
      return null;
    if (field === 'reimbursement' && !canViewReimbursement) return null;
    const target = scope === 'custom' ? 'expense-export-field-' : 'expense-register-field-';
    return exportFieldNames[field] ? `${target}${field}` : null;
  }
  function exportFieldIssues(
    problem: ProblemData | null,
  ): Array<{ field: string; target: string }> {
    if (!problem) return [];
    return Object.keys(problem.fieldErrors)
      .map((field) => ({ field, target: exportFieldTarget(exportProblemScope ?? 'custom', field) }))
      .filter((item): item is { field: string; target: string } => Boolean(item.target));
  }
  function focusExportField(event: MouseEvent, target: string): void {
    event.preventDefault();
    const control = document.getElementById(target);
    const details = control?.closest('details');
    if (details) details.open = true;
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: 'nearest' });
  }
  const exportNetworkProblem = (): ProblemData => ({
    code: 'EXPENSE_EXPORT_NETWORK_UNAVAILABLE',
    messageKey: 'problem.expenseExport.networkUnavailable',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'retry_expense_export' }],
    correlationId: '',
  });
  const exportSignInProblem = (): ProblemData => ({
    code: 'EXPENSE_EXPORT_SIGN_IN_REQUIRED',
    messageKey: 'problem.expenseExport.signInRequired',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'sign_in_again' }],
    correlationId: '',
  });
  function exportRedirectedToSignIn(response: Response): boolean {
    if (!response.redirected) return false;
    const destination = new URL(response.url);
    return destination.origin === location.origin && destination.pathname.endsWith('/app/login');
  }
  function responseExportProblem(payload: unknown): ProblemData {
    if (!payload || typeof payload !== 'object') return exportNetworkProblem();
    const candidate = payload as Partial<ProblemData>;
    if (
      typeof candidate.code !== 'string' ||
      !candidate.code.startsWith('EXPENSE_EXPORT_') ||
      typeof candidate.messageKey !== 'string' ||
      !candidate.messageKey.startsWith('problem.expenseExport.')
    )
      return exportNetworkProblem();
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
  function exportFilename(disposition: string | null, format: ExportFormat): string {
    const match = disposition?.match(/filename=(?:"([^"]+)"|([^;]+))/iu);
    const suggested = (match?.[1] ?? match?.[2] ?? '').trim();
    const safe = suggested
      .replace(/[<>:"/\\|?*]/gu, '_')
      .replace(/\p{Cc}/gu, '_')
      .slice(0, 160);
    return safe && safe.toLowerCase().endsWith(`.${format}`) ? safe : `Expenses.${format}`;
  }
  function showExportProblem(problem: ProblemData, scope: ExportScope): void {
    if (exportDisposed) return;
    exportProblem = problem;
    exportProblemScope = scope;
    void tick().then(() => {
      if (exportDisposed) return;
      const notice = document.querySelector<HTMLElement>(
        scope === 'custom' ? '.expense-custom-export-problem' : '.expense-filtered-export-problem',
      );
      const details = notice?.closest('details');
      if (details) details.open = true;
      notice?.focus({ preventScroll: true });
      if (!notice) return;
      const bounds = notice.getBoundingClientRect();
      const clearOfHeader = 88;
      if (bounds.top < clearOfHeader) {
        window.scrollBy(0, bounds.top - clearOfHeader);
      } else if (bounds.bottom > window.innerHeight - 24) {
        window.scrollBy(
          0,
          Math.min(bounds.bottom - (window.innerHeight - 24), bounds.top - clearOfHeader),
        );
      }
    });
  }
  async function downloadExpenseExport(
    scope: ExportScope,
    format: ExportFormat,
    href: string,
  ): Promise<void> {
    if (exportBusy || exportDisposed || href === '#') return;
    const controller = new AbortController();
    exportController = controller;
    const stillCurrent = (): boolean =>
      !exportDisposed && exportController === controller && !controller.signal.aborted;
    exportBusy = true;
    exportProblem = null;
    exportProblemScope = null;
    lastExport = { scope, format };
    try {
      const response = await fetch(href, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!stillCurrent()) return;
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (exportRedirectedToSignIn(response)) {
        showExportProblem(exportSignInProblem(), scope);
        return;
      }
      if (!response.ok) {
        const payload = contentType.includes('json')
          ? await response.json().catch(() => null)
          : null;
        if (!stillCurrent()) return;
        showExportProblem(responseExportProblem(payload), scope);
        return;
      }
      const expectedType = {
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      }[format];
      if (!contentType.startsWith(expectedType)) {
        showExportProblem(exportNetworkProblem(), scope);
        return;
      }
      const file = await response.blob();
      if (!stillCurrent()) return;
      if (file.size === 0) {
        showExportProblem(exportNetworkProblem(), scope);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = exportFilename(response.headers.get('content-disposition'), format);
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          exportObjectUrls = exportObjectUrls.filter((item) => item.url !== objectUrl);
        }, 60_000);
        exportObjectUrls.push({ url: objectUrl, timer });
      }
    } catch {
      if (stillCurrent()) showExportProblem(exportNetworkProblem(), scope);
    } finally {
      if (exportController === controller) {
        exportController = null;
        exportBusy = false;
      }
    }
  }
  function handleExportClick(event: MouseEvent, scope: ExportScope, format: ExportFormat): void {
    event.preventDefault();
    const link = event.currentTarget as HTMLAnchorElement;
    void downloadExpenseExport(scope, format, link.href);
  }
  function retryExpenseExport(): void {
    if (!lastExport) return;
    const { scope, format } = lastExport;
    void downloadExpenseExport(
      scope,
      format,
      scope === 'custom' ? exportHref(format) : filteredExportHref(format),
    );
  }
  const registerStateKey = (): string => `ja-operational-register:expenses:${data.user.id}`;

  onMount(() => {
    const saved = readOperationalRegisterState<{
      search?: string;
      order?: OperationalOrder;
      page?: number;
    }>(registerStateKey());
    if (!$page.url.searchParams.has('q') && typeof saved?.search === 'string')
      search = saved.search;
    if (saved?.order && ['newest', 'oldest', 'name', 'status'].includes(saved.order)) {
      order = saved.order;
    }
    if (typeof saved?.page === 'number') registerPage = saved.page;
    registerStateHydrated = true;
    if (
      !nativeRecoveryActive &&
      !isAuditor &&
      $page.url.searchParams.get('action') === 'record-expense'
    )
      openCreate();
    if (nativeExpenseSurface)
      void tick().then(() => {
        const form = document.querySelector<HTMLFormElement>('[data-expense-entry-surface]');
        if (form && nativeExpenseForm?.fieldErrors)
          reportFormFieldErrors(form, nativeExpenseForm.fieldErrors);
        document
          .querySelector<HTMLElement>('[data-operational-form-error]')
          ?.focus({ preventScroll: true });
      });
  });
  $effect(() => {
    if (registerStateHydrated)
      writeOperationalRegisterState(registerStateKey(), {
        search,
        order,
        page: registerPage,
      });
  });

  const expenseCategories = [
    ['hotel', 'Hotel'],
    ['rental_car', 'Rental car'],
    ['fuel', 'Fuel'],
    ['tolls', 'Tolls'],
    ['parking', 'Parking'],
    ['airfare', 'Airfare'],
    ['ground_transport', 'Train / bus / taxi / rideshare'],
    ['meals', 'Meals'],
    ['per_diem', 'Per diem'],
    ['materials', 'Project materials'],
    ['tools', 'Tools / consumables'],
    ['shipping', 'Shipping'],
    ['phone_data', 'Phone / data'],
    ['visa_permit', 'Visa / permit'],
    ['other', 'Other'],
  ] as const;

  const records = $derived(data.records ?? []);
  const restrictedOperational = $derived(Boolean(data.user.workforceProfile));
  const canViewReimbursement = $derived(
    !restrictedOperational && data.user.role !== 'project_manager',
  );
  const missingReceiptCount = $derived(
    records.filter((row) => expenseReceiptState(row) === 'missing').length,
  );
  const clientOptions = $derived(
    [...new Set(records.map((row) => String(row.client_name ?? '')).filter(Boolean))].sort(),
  );
  $effect(() => {
    const query = $page.url.searchParams.get('q');
    if (query !== null) search = query.trim();
    projectFilter = $page.url.searchParams.get('project')?.trim() ?? '';
    workerFilter = $page.url.searchParams.get('worker')?.trim() ?? '';
    clientFilter = $page.url.searchParams.get('client')?.trim() ?? '';
    categoryFilter = $page.url.searchParams.get('category')?.trim() ?? '';
    currencyFilter = $page.url.searchParams.get('currency')?.trim() ?? '';
    fromFilter = $page.url.searchParams.get('from')?.trim() ?? '';
    toFilter = $page.url.searchParams.get('to')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    reimbursementFilter = canViewReimbursement
      ? ($page.url.searchParams.get('reimbursement')?.trim() ?? '')
      : '';
    receiptFilter = $page.url.searchParams.get('receipt')?.trim() ?? '';
    registerPage = 1;
  });
  const editRow = $derived.by(
    () => records.find((row) => String(row.id) === editExpenseId) as Row | undefined,
  );
  const selectedTimeLinkVerified = $derived.by(() => {
    if (!linkedTimeLookupSucceeded || linkedTimeLoading || timeLookupProblem) return false;
    if (surface === 'create')
      return Boolean(
        createTimeEntryId &&
        !timeSelectionUnavailable &&
        linkedTimeOptions.some((time) => time.id === createTimeEntryId),
      );
    if (surface !== 'edit' || !editRow || !editTimeEntryId || editTimeSelectionUnavailable)
      return false;
    return (
      linkedTimeOptions.some((time) => time.id === editTimeEntryId) ||
      (editTimeEntryId === rowText(editRow, 'time_entry_id') &&
        editDate === rowText(editRow, 'spent_on') &&
        editOriginalLinkValid === true)
    );
  });
  $effect(() => {
    crewLookupRetry;
    if (
      surface !== 'create' ||
      data.user.role !== 'worker' ||
      !createProject ||
      !createDate ||
      projectSelectionUnavailable
    ) {
      crewWorkerOptions = [];
      crewWorkersLoading = false;
      crewLookupProblem = null;
      crewLookupScope = '';
      return;
    }
    const controller = new AbortController();
    crewWorkersLoading = true;
    crewLookupProblem = null;
    const params = new URLSearchParams({ projectId: createProject, date: createDate });
    const scope = params.toString();
    if (scope !== crewLookupScope) {
      crewLookupScope = scope;
      crewWorkerOptions = [];
    }
    void fetch(`${base}/app/api/expenses/crew-workers?${params}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw lookupProblem(await response.json().catch(() => null));
        const payload = (await response.json()) as { workers?: typeof crewWorkerOptions };
        if (!controller.signal.aborted) crewWorkerOptions = payload.workers ?? [];
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          crewLookupProblem = caughtLookupProblem(caught);
          focusLookupNotice('crew');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) crewWorkersLoading = false;
      });
    return () => controller.abort();
  });
  $effect(() => {
    timeLookupRetry;
    const projectId = surface === 'edit' ? String(editRow?.project_id ?? '') : createProject;
    const date = surface === 'edit' ? editDate : createDate;
    const workerId =
      surface === 'edit' ? String(editRow?.worker_id ?? '') : createWorker || String(data.user.id);
    if (
      !surface ||
      !projectId ||
      !date ||
      !workerId ||
      (surface === 'create' && projectSelectionUnavailable)
    ) {
      linkedTimeOptions = [];
      linkedTimeLookupSucceeded = false;
      editOriginalLinkValid = null;
      timeLookupProblem = null;
      timeLookupScope = '';
      return;
    }
    const controller = new AbortController();
    linkedTimeLoading = true;
    linkedTimeLookupSucceeded = false;
    timeLookupProblem = null;
    editOriginalLinkValid = null;
    const params = new URLSearchParams({ projectId, date, workerId });
    if (surface === 'edit' && editExpenseId) params.set('originalExpenseId', editExpenseId);
    const scope = params.toString();
    if (scope !== timeLookupScope) {
      timeLookupScope = scope;
      linkedTimeOptions = [];
    }
    void fetch(`${base}/app/api/expenses/time-options?${params}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw lookupProblem(await response.json().catch(() => null));
        const payload = (await response.json()) as {
          rows?: typeof linkedTimeOptions;
          originalLinkValid?: boolean;
        };
        if (!controller.signal.aborted) {
          linkedTimeOptions = payload.rows ?? [];
          editOriginalLinkValid = payload.originalLinkValid === true;
          linkedTimeLookupSucceeded = true;
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          timeLookupProblem = caughtLookupProblem(caught);
          focusLookupNotice('time');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) linkedTimeLoading = false;
      });
    return () => controller.abort();
  });
  $effect(() => {
    descriptionLookupRetry;
    // A failed native POST restores the user's text. A late suggestion must not
    // replace it while the recovery form is open.
    if (
      nativeRecoveryActive ||
      surface !== 'create' ||
      !createProject ||
      !createDate ||
      !createWorker
    ) {
      descriptionLookupProblem = null;
      return;
    }
    if (projectSelectionUnavailable) {
      descriptionLookupProblem = null;
      suggestedDescriptionScope = '';
      if (!untrack(() => createDescriptionEdited)) createDescription = '';
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      projectId: createProject,
      workerId: createWorker,
      date: createDate,
    });
    const scope = params.toString();
    if (scope !== suggestedDescriptionScope) {
      suggestedDescriptionScope = scope;
      if (!untrack(() => createDescriptionEdited)) createDescription = '';
    }
    descriptionLookupProblem = null;
    void fetch(`${base}/app/api/expenses/description-default?${params}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw lookupProblem(await response.json().catch(() => null));
        return (await response.json()) as { description?: string };
      })
      .then((payload) => {
        if (!controller.signal.aborted && !createDescriptionEdited && !createDescription.trim())
          createDescription = translate(payload.description ?? '');
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          descriptionLookupProblem = caughtLookupProblem(caught);
          focusLookupNotice('description');
        }
      });
    return () => controller.abort();
  });
  const visibleRecords = $derived.by(() => {
    return operationalSort(
      records.filter((row) => {
        const matchesSearch = expenseSearchMatches(row, search);
        const matchesProject = !projectFilter || String(row.project_id ?? '') === projectFilter;
        const matchesWorker = !workerFilter || String(row.worker_id ?? '') === workerFilter;
        const matchesClient = !clientFilter || String(row.client_name ?? '') === clientFilter;
        const matchesCategory = !categoryFilter || String(row.category ?? '') === categoryFilter;
        const matchesCurrency = !currencyFilter || String(row.currency ?? '') === currencyFilter;
        const spentOn = String(row.spent_on ?? '');
        const matchesDate =
          (!fromFilter || spentOn >= fromFilter) && (!toFilter || spentOn <= toFilter);
        const matchesStatus = operationalStatusMatches(row.approval_state, statusFilter, [
          'draft',
          'submitted',
          'needs_changes',
        ]);
        const reimbursementState = String(row.reimbursement_state ?? '');
        const matchesReimbursement =
          !canViewReimbursement ||
          !reimbursementFilter ||
          (reimbursementFilter === 'pending'
            ? ['approved', 'locked'].includes(String(row.approval_state)) &&
              ['pending', 'scheduled'].includes(reimbursementState)
            : reimbursementState === reimbursementFilter);
        return (
          matchesSearch &&
          matchesProject &&
          matchesWorker &&
          matchesClient &&
          matchesCategory &&
          matchesCurrency &&
          matchesDate &&
          matchesStatus &&
          (!receiptFilter || expenseReceiptState(row) === receiptFilter) &&
          matchesReimbursement
        );
      }),
      order,
      ['spent_on'],
      ['worker_name', 'project_name', 'vendor', 'description'],
      ['approval_state', 'reimbursement_state'],
    );
  });
  const pagedRecords = $derived(operationalPage(visibleRecords, registerPage));
  const advancedFilters = $derived.by(() =>
    [
      {
        removeHref: registerHref({ worker: '' }),
        label: translate('Worker'),
        value: workerFilter
          ? String(
              data.workers?.find((row) => String(row.id) === workerFilter)?.name ??
                (workerFilter === data.user.id ? data.user.name : workerFilter),
            )
          : '',
      },
      { removeHref: registerHref({ client: '' }), label: translate('Client'), value: clientFilter },
      { removeHref: registerHref({ from: '' }), label: translate('From'), value: fromFilter },
      { removeHref: registerHref({ to: '' }), label: translate('To'), value: toFilter },
      {
        removeHref: registerHref({ category: '' }),
        label: translate('Category'),
        value: categoryFilter
          ? translate(
              expenseCategories.find(([value]) => value === categoryFilter)?.[1] ?? categoryFilter,
            )
          : '',
      },
      {
        removeHref: registerHref({ currency: '' }),
        label: translate('Currency'),
        value: currencyFilter,
      },
      {
        removeHref: registerHref({ receipt: '' }),
        label: translate('Receipt evidence'),
        value: receiptFilter
          ? translate(
              receiptStateLabels[receiptFilter as keyof typeof receiptStateLabels] ?? receiptFilter,
            )
          : '',
      },
      {
        removeHref: registerHref({ reimbursement: '' }),
        label: translate('Reimbursement status'),
        value:
          reimbursementFilter === 'pending'
            ? translate('Pending or scheduled')
            : reimbursementFilter
              ? controlledValue('status', reimbursementFilter)
              : '',
      },
    ].filter((item) => item.value),
  );
  const activeFilters = $derived.by(() => {
    const project = availableProjects.find((row) => String(row.id) === projectFilter);
    return [
      { removeHref: registerHref({ q: '' }), label: translate('Search'), value: search.trim() },
      {
        removeHref: registerHref({ project: '' }),
        label: translate('Project'),
        value: projectFilter
          ? project
            ? `${project.project_number} — ${project.name}`
            : projectFilter
          : '',
      },
      {
        removeHref: registerHref({ status: '' }),
        label: translate('Status'),
        value:
          statusFilter === 'attention'
            ? translate('Needs attention')
            : statusFilter
              ? controlledValue('status', statusFilter)
              : '',
      },
      ...advancedFilters,
    ].filter((item) => item.value);
  });
  const clearFiltersHref = `${base}/app/expenses?q=`;

  function clearFilters(): void {
    search = '';
    projectFilter = '';
    workerFilter = '';
    clientFilter = '';
    categoryFilter = '';
    currencyFilter = '';
    fromFilter = '';
    toFilter = '';
    statusFilter = '';
    reimbursementFilter = '';
    receiptFilter = '';
    order = 'newest';
    registerPage = 1;
    writeOperationalRegisterState(registerStateKey(), { search: '', order: 'newest', page: 1 });
  }

  const pendingReviewCount = $derived(
    records.filter((row) =>
      ['draft', 'needs_changes', 'submitted'].includes(String(row.approval_state)),
    ).length,
  );
  const reimbursementCount = $derived(
    records.filter(
      (row) =>
        ['approved', 'locked'].includes(String(row.approval_state)) &&
        ['pending', 'scheduled'].includes(String(row.reimbursement_state)),
    ).length,
  );

  function rowText(row: Row, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  // Keep minor-unit formatting string based so edit forms never round through
  // binary floating point.
  function minorToDecimal(value: unknown): string {
    const raw = String(value ?? '');
    if (!/^\d+$/.test(raw)) return '';
    const padded = raw.padStart(3, '0');
    return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
  }

  function statusVariant(value: unknown): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(value ?? '')) {
      case 'approved':
      case 'paid':
        return 'success';
      case 'rejected':
      case 'void':
        return 'danger';
      case 'submitted':
      case 'needs_changes':
      case 'pending':
      case 'scheduled':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  function correctionBlocker(row: Row): 'shared_receipt' | 'reimbursed' | 'finalized' | null {
    if (row.shared_receipt_allocated) return 'shared_receipt';
    if (['paid', 'reimbursed'].includes(String(row.reimbursement_state ?? '')) || row.reimbursed_at)
      return 'reimbursed';
    if (
      row.correction_financially_finalized ||
      row.invoice_id ||
      row.billing_lock_id ||
      ['locked', 'invoiced'].includes(String(row.billing_state ?? ''))
    )
      return 'finalized';
    return null;
  }

  function openCreate(): void {
    surfaceError = '';
    surfaceProblem = null;
    nativeRecoveryActive = false;
    const requestedDate = $page.url.searchParams.get('date')?.trim() ?? '';
    const requestedProject = $page.url.searchParams.get('project')?.trim() || projectFilter;
    const requestedWorker = $page.url.searchParams.get('worker')?.trim() ?? '';
    createDate = /^\d{4}-\d{2}-\d{2}$/u.test(requestedDate) ? requestedDate : localToday();
    createProject = requestedProject;
    createWorker =
      data.user.role === 'worker'
        ? requestedWorker || data.user.id
        : (data.workers ?? []).some((worker) => String(worker.id) === requestedWorker)
          ? requestedWorker
          : '';
    createRequestId = crypto.randomUUID();
    createCurrency = 'USD';
    createWhoPaid = 'worker';
    createDescription = '';
    createDescriptionEdited = false;
    suggestedDescriptionScope = '';
    createTimeEntryId = $page.url.searchParams.get('timeEntry')?.trim() ?? '';
    surface = 'create';
    editExpenseId = null;
  }

  function handleReceiptChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (receiptPreviewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(receiptPreviewUrl);
    const file = input.files?.[0];
    receiptPreviewName = file?.name ?? '';
    receiptPreviewMime = file?.type ?? '';
    receiptPreviewUrl = file && typeof URL !== 'undefined' ? URL.createObjectURL(file) : null;
  }

  function clearReceiptPreview(): void {
    if (receiptPreviewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(receiptPreviewUrl);
    receiptPreviewUrl = null;
    receiptPreviewName = '';
    receiptPreviewMime = '';
  }

  function openEdit(row: Row): void {
    if (row.shared_receipt_allocated || Number(row.correction_linked ?? 0) === 1) return;
    surfaceError = '';
    surfaceProblem = null;
    nativeRecoveryActive = false;
    editDate = String(row.spent_on ?? '');
    editTimeEntryId = String(row.time_entry_id ?? '');
    surface = 'edit';
    editExpenseId = String(row.id);
  }

  function closeSurface(): void {
    surface = null;
    surfaceProblem = null;
    nativeRecoveryActive = false;
    editExpenseId = null;
    createTimeEntryId = '';
    if (typeof window !== 'undefined' && $page.url.searchParams.has('timeEntry')) {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete('timeEntry');
      cleaned.searchParams.delete('date');
      replaceState(cleaned, $page.state);
    }
    clearReceiptPreview();
  }

  async function handleOfflineDraft(event: SubmitEvent): Promise<void> {
    const form = event.currentTarget as HTMLFormElement;
    const result = await saveOfflineDraft(event, 'expense');
    if (!form.isConnected) return;
    if (result.saved) {
      closeSurface();
      return;
    }
    if (!result.error) return;
    surfaceProblem = null;
    surfaceError = translate(result.error);
    await tick();
    const notice = form
      .closest('[data-ui="responsive-sheet"]')
      ?.querySelector<HTMLElement>('[data-operational-form-error]');
    notice?.focus({ preventScroll: true });
    notice?.scrollIntoView({ block: 'start' });
  }

  function registerHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const project = overrides.project ?? projectFilter;
    const status = overrides.status ?? statusFilter;
    const reimbursement = overrides.reimbursement ?? reimbursementFilter;
    const receipt = overrides.receipt ?? receiptFilter;
    const worker = overrides.worker ?? workerFilter;
    const client = overrides.client ?? clientFilter;
    const category = overrides.category ?? categoryFilter;
    const currency = overrides.currency ?? currencyFilter;
    const from = overrides.from ?? fromFilter;
    const to = overrides.to ?? toFilter;
    const queryText = overrides.q ?? search;
    if (project) params.set('project', project);
    if (worker) params.set('worker', worker);
    if (client) params.set('client', client);
    if (category) params.set('category', category);
    if (currency) params.set('currency', currency);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('q', queryText);
    if ($page.url.searchParams.has('lang')) params.set('lang', $page.url.searchParams.get('lang')!);
    if (status) params.set('status', status);
    if (reimbursement && canViewReimbursement) params.set('reimbursement', reimbursement);
    if (receipt) params.set('receipt', receipt);
    const query = params.toString();
    return `${base}/app/expenses${query ? `?${query}` : ''}`;
  }

  function exportHref(format: 'csv' | 'xlsx' | 'pdf'): string {
    const params = new URLSearchParams({ from: exportFrom, to: exportTo, format });
    if (exportProject) params.set('project', exportProject);
    if (exportWorker) params.set('worker', exportWorker);
    if (exportClient) params.set('client', exportClient);
    if (exportCategory) params.set('category', exportCategory);
    if (exportCurrency) params.set('currency', exportCurrency);
    if (exportStatus) params.set('status', exportStatus);
    if (exportReimbursement && canViewReimbursement)
      params.set('reimbursement', exportReimbursement);
    return `${base}/app/expenses/export?${params.toString()}`;
  }

  const filteredExportPeriod = $derived.by(() => {
    const dates = visibleRecords
      .map((row) => String(row.spent_on ?? ''))
      .filter(Boolean)
      .sort();
    return dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null;
  });

  function filteredExportHref(format: 'csv' | 'xlsx' | 'pdf'): string {
    if (!filteredExportPeriod) return '#';
    const params = new URLSearchParams({
      from: filteredExportPeriod.from,
      to: filteredExportPeriod.to,
      format,
    });
    if (search) params.set('q', search);
    if (projectFilter) params.set('project', projectFilter);
    if (workerFilter) params.set('worker', workerFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (currencyFilter) params.set('currency', currencyFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (reimbursementFilter && canViewReimbursement)
      params.set('reimbursement', reimbursementFilter);
    if (receiptFilter) params.set('receipt', receiptFilter);
    return `${base}/app/expenses/export?${params.toString()}`;
  }

  function approvalStatusHref(row: Row): string {
    if (
      ['owner_admin', 'project_manager'].includes(String(data.user.role)) &&
      String(row.approval_state) === 'submitted'
    )
      return `${base}/app/approvals?tab=expenses&project=${encodeURIComponent(String(row.project_id))}&worker=${encodeURIComponent(String(row.worker_id))}&status=submitted`;
    if (
      String(row.approval_state) === 'draft' &&
      (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')
    )
      return `${base}/app/expenses?edit=${encodeURIComponent(String(row.id))}`;
    return `${base}/app/expenses/${encodeURIComponent(String(row.id))}`;
  }

  function reimbursementStatusHref(row: Row): string {
    return ['owner_admin', 'finance_admin'].includes(String(data.user.role))
      ? `${base}/app/finance?view=economic&project=${encodeURIComponent(String(row.project_id))}&source=settlements#finance-reimbursements`
      : `${base}/app/expenses/${encodeURIComponent(String(row.id))}`;
  }
</script>

<div class="expense-page">
  <header class="expense-page-context">
    <div>
      <p class="expense-eyebrow">{translate('Worker operations')}</p>
      <h2>{translate('Expenses and reimbursements')}</h2>
      <p>
        {translate(
          'Record the receipt and operational facts. Finance handles later classification.',
        )}
      </p>
    </div>
    <span class="expense-record-count" aria-label={translate('Expense count')}
      >{records.length}</span
    >
  </header>

  {#if !isAuditor}
    <div class="expense-primary-action expense-primary-action-top">
      <button type="button" data-expense-primary-cta onclick={openCreate}>
        <span aria-hidden="true">＋</span>
        {translate('Record expense')}
      </button>
    </div>
  {/if}

  <div class="expense-status-strip" aria-label={translate('Expense attention summary')}>
    <a
      class="expense-status-card"
      href={`${registerHref({ status: 'attention', reimbursement: '' })}#expense-records`}
    >
      <span>{translate('Needs attention')}</span>
      <strong>{pendingReviewCount}</strong>
      <small>{translate('Draft or review state')}</small>
    </a>
    {#if canViewReimbursement}
      <a
        class="expense-status-card"
        href={`${registerHref({ status: '', reimbursement: 'pending' })}#expense-records`}
      >
        <span>{translate('Reimbursement')}</span>
        <strong>{reimbursementCount}</strong>
        <small>{translate('Pending or scheduled')}</small>
      </a>
    {/if}
    <a
      class="expense-status-card"
      href={`${registerHref({ status: '', reimbursement: '', receipt: 'missing' })}#expense-records`}
    >
      <span>{translate('Required receipt missing')}</span>
      <strong>{missingReceiptCount}</strong>
      <small>{translate('Review supporting evidence before approval')}</small>
    </a>
  </div>

  <form
    id="expense-register-filters"
    class="expense-filters"
    method="GET"
    action={`${base}/app/expenses`}
    aria-label={translate('Filter expenses')}
  >
    <label>
      <span>{translate('Search expenses')}</span>
      <input
        id="expense-register-field-q"
        name="q"
        bind:value={search}
        oninput={() => (registerPage = 1)}
        type="search"
        placeholder={translate('Vendor, project or date')}
      />
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select
        id="expense-register-field-project"
        name="project"
        bind:value={projectFilter}
        onchange={() => (registerPage = 1)}
      >
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option value={String(project.id)}>{project.project_number} — {project.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Status')}</span>
      <select
        id="expense-register-field-status"
        name="status"
        bind:value={statusFilter}
        onchange={() => (registerPage = 1)}
      >
        <option value="">{translate('All statuses')}</option>
        <option value="attention">{translate('Needs attention')}</option>
        <option value="draft">{translate('Draft')}</option>
        <option value="submitted">{translate('Submitted')}</option>
        <option value="approved">{translate('Approved')}</option>
        <option value="needs_changes">{translate('Needs changes')}</option>
      </select>
    </label>
    <SectionCard
      title={translate('Filter expenses')}
      description={advancedFilters.length
        ? `${translate('Active filters')}: ${advancedFilters.length}`
        : undefined}
      collapsible
      expanded={Boolean(
        workerFilter ||
        clientFilter ||
        fromFilter ||
        toFilter ||
        categoryFilter ||
        currencyFilter ||
        receiptFilter ||
        reimbursementFilter ||
        order !== 'newest',
      )}
      class="register-filter-disclosure"
    >
      <div class="expense-filter-fields">
        {#if ['owner_admin', 'project_manager', 'finance_admin'].includes(String(data.user.role))}
          <label>
            <span>{translate('Worker')}</span>
            <select
              id="expense-register-field-worker"
              name="worker"
              bind:value={workerFilter}
              onchange={() => (registerPage = 1)}
            >
              <option value="">{translate('All workers')}</option>
              {#each data.workers ?? [] as worker}
                <option value={String(worker.id)}>{worker.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label>
          <span>{translate('Client')}</span>
          <select
            id="expense-register-field-client"
            name="client"
            bind:value={clientFilter}
            onchange={() => (registerPage = 1)}
          >
            <option value="">{translate('All clients')}</option>
            {#each clientOptions as client}<option value={client}>{client}</option>{/each}
          </select>
        </label>
        <label>
          <span>{translate('From')}</span>
          <input
            id="expense-register-field-from"
            name="from"
            type="date"
            bind:value={fromFilter}
            onchange={() => (registerPage = 1)}
          />
        </label>
        <label>
          <span>{translate('To')}</span>
          <input
            id="expense-register-field-to"
            name="to"
            type="date"
            bind:value={toFilter}
            onchange={() => (registerPage = 1)}
          />
        </label>

        <label>
          <span>{translate('Category')}</span>
          <select
            id="expense-register-field-category"
            name="category"
            bind:value={categoryFilter}
            onchange={() => (registerPage = 1)}
          >
            <option value="">{translate('All categories')}</option>
            {#each expenseCategories as [value, label]}<option {value}>{translate(label)}</option
              >{/each}
          </select>
        </label>
        <label>
          <span>{translate('Currency')}</span>
          <select
            id="expense-register-field-currency"
            name="currency"
            bind:value={currencyFilter}
            onchange={() => (registerPage = 1)}
          >
            <option value="">{translate('All currencies')}</option>
            <option value="USD">USD</option><option value="EUR">EUR</option><option value="BRL"
              >BRL</option
            >
          </select>
        </label>

        <label>
          <span>{translate('Receipt evidence')}</span>
          <select
            id="expense-register-field-receipt"
            name="receipt"
            bind:value={receiptFilter}
            onchange={() => (registerPage = 1)}
          >
            <option value="">{translate('All receipts')}</option>
            <option value="missing">{translate('Required receipt missing')}</option>
            <option value="attached">{translate('Receipt attached')}</option>
            <option value="not_required">{translate('Receipt not required')}</option>
          </select>
        </label>
        {#if canViewReimbursement}
          <label>
            <span>{translate('Reimbursement status')}</span>
            <select
              id="expense-register-field-reimbursement"
              name="reimbursement"
              bind:value={reimbursementFilter}
              onchange={() => (registerPage = 1)}
            >
              <option value="">{translate('All statuses')}</option>
              <option value="pending">{translate('Pending or scheduled')}</option>
              <option value="reimbursed">{translate('Reimbursed')}</option>
            </select>
          </label>
        {/if}
        <label>
          <span>{translate('Sort by')}</span>
          <select name="order" bind:value={order} onchange={() => (registerPage = 1)}>
            <option value="newest">{translate('Newest first')}</option>
            <option value="oldest">{translate('Oldest first')}</option>
            <option value="name">{translate('Name')}</option>
            <option value="status">{translate('Status')}</option>
          </select>
        </label>
      </div>
    </SectionCard>
    <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
    <DatePresets
      from={fromFilter}
      to={toFilter}
      href={(range) => registerHref(range)}
      {translate}
    />
    <FilterSummary
      items={activeFilters}
      resultCount={visibleRecords.length}
      clearHref={clearFiltersHref}
      onclear={clearFilters}
      {translate}
    />
  </form>

  {#snippet customExportFieldError(field: string)}
    {#if customExportProblem?.fieldErrors[field]?.[0]}
      <small id={`expense-export-error-${field}`} class="expense-export-field-error">
        {portalText(warningLocale, customExportProblem.fieldErrors[field][0])}
      </small>
    {/if}
  {/snippet}

  {#if !restrictedOperational}
    <section class="expense-export-panel" aria-labelledby="expense-filtered-export-title">
      <div>
        <h3 id="expense-filtered-export-title">{translate('Export filtered results')}</h3>
        <p>
          {translate('Download exactly the expenses currently selected by the register filters.')}
        </p>
      </div>
      {#if filteredExportProblem}
        <ProblemNotice
          problem={filteredExportProblem}
          remedyLinks={exportRemedyLinks}
          class="expense-filtered-export-problem"
        />
        {#if exportFieldIssues(filteredExportProblem).length}
          <ul class="expense-export-field-summary">
            {#each exportFieldIssues(filteredExportProblem) as { field, target }}
              <li>
                <a href={`#${target}`} onclick={(event) => focusExportField(event, target)}
                  >{translate(exportFieldNames[field] ?? field)}: {portalText(
                    warningLocale,
                    filteredExportProblem.fieldErrors[field]?.[0] ?? '',
                  )}</a
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if filteredExportProblem.remedies.some((remedy) => remedy.id === 'retry_expense_export')}
          <button
            type="button"
            class="secondary-button"
            disabled={exportBusy}
            onclick={retryExpenseExport}
            >{portalText(warningLocale, 'problem.expenseExport.retryDownload')}</button
          >
        {/if}
      {/if}
      <div class="expense-export-actions">
        {#if filteredExportPeriod}
          <a
            class="secondary-button"
            href={filteredExportHref('pdf')}
            data-sveltekit-reload
            aria-disabled={exportBusy}
            onclick={(event) => handleExportClick(event, 'filtered', 'pdf')}
            >{translate('Download PDF')}</a
          >
          <a
            class="secondary-button"
            href={filteredExportHref('xlsx')}
            data-sveltekit-reload
            aria-disabled={exportBusy}
            onclick={(event) => handleExportClick(event, 'filtered', 'xlsx')}
            >{translate('Download Excel')}</a
          >
          <a
            class="secondary-button"
            href={filteredExportHref('csv')}
            data-sveltekit-reload
            aria-disabled={exportBusy}
            onclick={(event) => handleExportClick(event, 'filtered', 'csv')}
            >{translate('Download CSV')}</a
          >
        {:else}
          <span>{translate('No matching records.')}</span>
        {/if}
      </div>
    </section>

    <SectionCard
      title={translate('Create report with another scope')}
      collapsible
      class="expense-export-disclosure"
    >
      <div>
        <p>
          {translate('Choose a separate period and scope without changing the register above.')}
        </p>
      </div>
      {#if customExportProblem}
        <ProblemNotice
          problem={customExportProblem}
          remedyLinks={exportRemedyLinks}
          class="expense-custom-export-problem"
        />
        {#if exportFieldIssues(customExportProblem).length}
          <ul class="expense-export-field-summary">
            {#each exportFieldIssues(customExportProblem) as { field, target }}
              <li>
                <a href={`#${target}`} onclick={(event) => focusExportField(event, target)}
                  >{translate(exportFieldNames[field] ?? field)}: {portalText(
                    warningLocale,
                    customExportProblem.fieldErrors[field]?.[0] ?? '',
                  )}</a
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if customExportProblem.remedies.some((remedy) => remedy.id === 'retry_expense_export')}
          <button
            type="button"
            class="secondary-button"
            disabled={exportBusy}
            onclick={retryExpenseExport}
            >{portalText(warningLocale, 'problem.expenseExport.retryDownload')}</button
          >
        {/if}
      {/if}
      <div id="expense-export-fields" class="expense-export-fields">
        <label
          ><span>{translate('From')}</span><input
            id="expense-export-field-from"
            type="date"
            bind:value={exportFrom}
            aria-invalid={customExportProblem?.fieldErrors.from?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.from?.length
              ? 'expense-export-error-from'
              : undefined}
          />{@render customExportFieldError('from')}</label
        >
        <label
          ><span>{translate('To')}</span><input
            id="expense-export-field-to"
            type="date"
            bind:value={exportTo}
            aria-invalid={customExportProblem?.fieldErrors.to?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.to?.length
              ? 'expense-export-error-to'
              : undefined}
          />{@render customExportFieldError('to')}</label
        >
        <label
          ><span>{translate('Project')}</span><select
            id="expense-export-field-project"
            bind:value={exportProject}
            aria-invalid={customExportProblem?.fieldErrors.project?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.project?.length
              ? 'expense-export-error-project'
              : undefined}
            ><option value="">{translate('All projects')}</option
            >{#each availableProjects as project}<option value={String(project.id)}
                >{project.project_number} — {project.name}</option
              >{/each}</select
          >{@render customExportFieldError('project')}</label
        >
        {#if ['owner_admin', 'project_manager', 'finance_admin'].includes(String(data.user.role))}
          <label
            ><span>{translate('Worker')}</span><select
              id="expense-export-field-worker"
              bind:value={exportWorker}
              aria-invalid={customExportProblem?.fieldErrors.worker?.length ? 'true' : undefined}
              aria-describedby={customExportProblem?.fieldErrors.worker?.length
                ? 'expense-export-error-worker'
                : undefined}
              ><option value="">{translate('All workers')}</option
              >{#each data.workers ?? [] as worker}<option value={String(worker.id)}
                  >{worker.name}</option
                >{/each}</select
            >{@render customExportFieldError('worker')}</label
          >
        {/if}
        <label
          ><span>{translate('Client')}</span><select
            id="expense-export-field-client"
            bind:value={exportClient}
            aria-invalid={customExportProblem?.fieldErrors.client?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.client?.length
              ? 'expense-export-error-client'
              : undefined}
            ><option value="">{translate('All clients')}</option
            >{#each clientOptions as client}<option value={client}>{client}</option>{/each}</select
          >{@render customExportFieldError('client')}</label
        >
        <label
          ><span>{translate('Category')}</span><select
            id="expense-export-field-category"
            bind:value={exportCategory}
            aria-invalid={customExportProblem?.fieldErrors.category?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.category?.length
              ? 'expense-export-error-category'
              : undefined}
            ><option value="">{translate('All categories')}</option
            >{#each expenseCategories as [value, label]}<option {value}>{translate(label)}</option
              >{/each}</select
          >{@render customExportFieldError('category')}</label
        >
        <label
          ><span>{translate('Currency')}</span><select
            id="expense-export-field-currency"
            bind:value={exportCurrency}
            aria-invalid={customExportProblem?.fieldErrors.currency?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.currency?.length
              ? 'expense-export-error-currency'
              : undefined}
            ><option value="">{translate('All currencies')}</option><option value="USD">USD</option
            ><option value="EUR">EUR</option><option value="BRL">BRL</option></select
          >{@render customExportFieldError('currency')}</label
        >
        <label
          ><span>{translate('Status')}</span><select
            id="expense-export-field-status"
            bind:value={exportStatus}
            aria-invalid={customExportProblem?.fieldErrors.status?.length ? 'true' : undefined}
            aria-describedby={customExportProblem?.fieldErrors.status?.length
              ? 'expense-export-error-status'
              : undefined}
            ><option value="">{translate('All statuses')}</option><option value="draft"
              >{translate('Draft')}</option
            ><option value="submitted">{translate('Submitted')}</option><option value="approved"
              >{translate('Approved')}</option
            ><option value="needs_changes">{translate('Needs changes')}</option></select
          >{@render customExportFieldError('status')}</label
        >
        {#if canViewReimbursement}<label
            ><span>{translate('Reimbursement status')}</span><select
              id="expense-export-field-reimbursement"
              aria-invalid={customExportProblem?.fieldErrors.reimbursement?.length
                ? 'true'
                : undefined}
              aria-describedby={customExportProblem?.fieldErrors.reimbursement?.length
                ? 'expense-export-error-reimbursement'
                : undefined}
              bind:value={exportReimbursement}
              ><option value="">{translate('All statuses')}</option><option value="pending"
                >{translate('Pending or scheduled')}</option
              ><option value="reimbursed">{translate('Reimbursed')}</option></select
            >{@render customExportFieldError('reimbursement')}</label
          >{/if}
      </div>
      <div class="expense-export-actions">
        <a
          class="secondary-button"
          href={exportHref('pdf')}
          data-sveltekit-reload
          aria-disabled={exportBusy}
          onclick={(event) => handleExportClick(event, 'custom', 'pdf')}
          >{translate('Download PDF')}</a
        >
        <a
          class="secondary-button"
          href={exportHref('xlsx')}
          data-sveltekit-reload
          aria-disabled={exportBusy}
          onclick={(event) => handleExportClick(event, 'custom', 'xlsx')}
          >{translate('Download Excel')}</a
        >
        <a
          class="secondary-button"
          href={exportHref('csv')}
          data-sveltekit-reload
          aria-disabled={exportBusy}
          onclick={(event) => handleExportClick(event, 'custom', 'csv')}
          >{translate('Download CSV')}</a
        >
      </div>
    </SectionCard>
  {/if}

  <SectionCard
    id="expense-records"
    title={translate('Recent expenses')}
    class="expense-list-surface"
  >
    {#if visibleRecords.length > 0}
      <div class="expense-list" aria-live="polite">
        {#each pagedRecords.rows as row}
          <article class="expense-record" data-expense-record={String(row.id)}>
            <a class="record-card-link" href={`${base}/app/expenses/${String(row.id)}`}>
              <div class="expense-record-main">
                <strong>{row.vendor || row.description || translate('Expense')}</strong>
                <span class="expense-record-amount"
                  >{money(row.amount_minor, String(row.currency))}</span
                >
              </div>
              <small>
                {row.spent_on} · {row.project_number} · {controlledValue(
                  'expenseCategory',
                  row.category,
                ) || translate(String(row.category ?? ''))}
              </small>
              <span class="record-card-open">{translate('Open record →')}</span>
            </a>
            <div class="expense-record-statuses">
              <StatusBadge
                variant={expenseReceiptState(row) === 'missing' ? 'warning' : 'neutral'}
                text={translate(receiptStateLabels[expenseReceiptState(row)])}
              />
              <a
                href={approvalStatusHref(row)}
                aria-label={`${translate('Open record')}: ${controlledValue('status', row.approval_state) || translate(String(row.approval_state ?? ''))}`}
              >
                <StatusBadge
                  variant={statusVariant(row.approval_state)}
                  text={controlledValue('status', row.approval_state) ||
                    translate(String(row.approval_state ?? ''))}
                />
              </a>
              {#if canViewReimbursement && row.reimbursement_state && ['approved', 'locked'].includes(String(row.approval_state))}
                <a
                  href={reimbursementStatusHref(row)}
                  aria-label={`${translate('Reimbursement')}: ${controlledValue('status', row.reimbursement_state) || translate(String(row.reimbursement_state))}`}
                >
                  <StatusBadge
                    variant={statusVariant(row.reimbursement_state)}
                    text={`${translate('Reimbursement')}: ${controlledValue('status', row.reimbursement_state) || translate(String(row.reimbursement_state))}`}
                  />
                </a>
              {/if}
              {#if row.shared_receipt_allocated}
                <StatusBadge variant="neutral" text="Shared crew receipt · allocation locked" />
              {/if}
            </div>
            {#if data.user.role === 'worker' || data.user.role === 'owner_admin'}
              <div class="expense-record-actions">
                {#if row.approval_state === 'draft'}
                  {#if !row.shared_receipt_allocated && Number(row.correction_linked ?? 0) !== 1}
                    <button type="button" class="secondary-button" onclick={() => openEdit(row)}>
                      {translate('Edit')}
                    </button>
                  {/if}
                  <form method="POST" action="?/submitExpense">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button type="submit">{translate('Submit')}</button>
                  </form>
                {/if}
                {#if row.approval_state === 'draft' && !row.shared_receipt_allocated && Number(row.correction_linked ?? 0) !== 1 && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
                  <form
                    method="POST"
                    action="?/deleteDraft"
                    data-action="deleteDraft"
                    data-record-type="expense"
                    data-record-id={String(row.id)}
                  >
                    <input type="hidden" name="recordType" value="expense" />
                    <input type="hidden" name="recordId" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <button type="submit" class="destructive-button">{translate('Delete')}</button>
                  </form>
                {/if}
                {#if row.active_correction_id && (row.approval_state === 'needs_changes' || row.approval_state === 'approved')}
                  <a
                    class="secondary-button"
                    href={`${base}/app/expenses/${String(row.active_correction_id)}`}
                    >{translate('Open existing correction')} →</a
                  >
                {:else if (row.approval_state === 'approved' || row.approval_state === 'needs_changes') && correctionBlocker(row) === 'shared_receipt'}
                  <p class="expense-record-actions__note">
                    {translate('Shared crew receipt · allocation locked')}
                  </p>
                {:else if (row.approval_state === 'approved' || row.approval_state === 'needs_changes') && correctionBlocker(row) === 'reimbursed'}
                  <p class="expense-record-actions__note">
                    {translate(
                      'This expense has a reimbursement. Reverse or adjust the payment first.',
                    )}
                  </p>
                  {#if data.user.role === 'owner_admin'}
                    <a class="secondary-button" href={reimbursementStatusHref(row)}
                      >{translate('Reimbursement')} →</a
                    >
                  {/if}
                {:else if (row.approval_state === 'approved' || row.approval_state === 'needs_changes') && correctionBlocker(row) === 'finalized'}
                  <p class="expense-record-actions__note">
                    {translate('This record has financial history. Use a financial correction.')}
                  </p>
                {:else if (row.approval_state === 'needs_changes' || row.approval_state === 'approved') && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
                  <a
                    class="secondary-button"
                    href={`${base}/app/expenses/${String(row.id)}#expense-correction-title`}
                    >{translate('Create corrected draft')} →</a
                  >
                {/if}
              </div>
            {/if}
            {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
              <a href={`${base}/app/manage?type=expense#${String(row.id)}`}
                >{translate('Manage record')} →</a
              >
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="expense-empty" role="status">
        {#if activeFilters.length || records.length}
          <strong>{translate('No matching records.')}</strong>
          <span>{translate('Clear filters to see more records.')}</span>
        {:else}
          <strong>{translate('No expenses recorded.')}</strong>
          <span>{translate('Your submitted expenses will appear here.')}</span>
        {/if}
      </div>
    {/if}
    {#if pagedRecords.totalPages > 1}
      <nav class="operational-pagination" aria-label={translate('Expense register pages')}>
        <button
          type="button"
          class="secondary-button"
          disabled={pagedRecords.current === 1}
          onclick={() => (registerPage -= 1)}>{translate('Previous')}</button
        >
        <span
          >{translate('Page')}
          {pagedRecords.current}
          {translate('of')}
          {pagedRecords.totalPages}</span
        >
        <button
          type="button"
          class="secondary-button"
          disabled={pagedRecords.current === pagedRecords.totalPages}
          onclick={() => (registerPage += 1)}>{translate('Next')}</button
        >
      </nav>
    {/if}
  </SectionCard>

  <ResponsiveSheet
    open={surface !== null}
    title={surface === 'edit' ? translate('Edit expense') : translate('Record expense')}
    description={translate('Operational entry only. Commercial treatment is handled separately.')}
    closeLabel={translate('Close expense form')}
    class="expense-entry-sheet"
    onclose={closeSurface}
    protectChanges
  >
    {#if surfaceProblem}
      <div class="operational-form-error" tabindex="-1" data-operational-form-error>
        <ProblemNotice
          problem={surfaceProblem}
          kind={surfaceProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
          remedyLinks={{
            correct_field: {
              label: portalText(warningLocale, 'problem.remedy.correctField'),
            },
            correct_fields: {
              label: portalText(warningLocale, 'problem.remedy.correctFields'),
            },
            review_expense: {
              label: translate('Review updated record'),
              href: problemExpenseId
                ? `${base}/app/expenses/${encodeURIComponent(problemExpenseId)}`
                : `${base}/app/expenses#expense-records`,
            },
            review_expenses: {
              label: translate('problem.remedy.reviewExpenses'),
              href: `${base}/app/expenses#expense-records`,
            },
            review_time: {
              label: translate('Review logged hours'),
              href: `${base}/app/time`,
            },
            attach_receipt: {
              label: translate('Reattach the receipt before saving again.'),
            },
            contact_project_owner: {
              label: translate('Contact the project owner to review access.'),
            },
            contact_owner: {
              label: portalText(warningLocale, 'problem.remedy.contactAccessOwner'),
            },
            sign_in_again: {
              label: portalText(warningLocale, 'problem.remedy.signInAgain'),
              href: `${base}/app/login?lang=${warningLocale}`,
            },
            contact_finance: {
              label: translate('Contact Finance or an owner'),
            },
          }}
        />
        {#if (surfaceProblem as ProblemData & { values?: Record<string, unknown> }).values?.receiptNeedsReattach === true}
          <p>{translate('Reattach the receipt before saving again.')}</p>
        {/if}
      </div>
    {:else if surfaceError}
      <p class="operational-form-error" role="alert" tabindex="-1" data-operational-form-error>
        {surfaceError}
      </p>
    {/if}
    {#if surface === 'create'}
      <form
        method="POST"
        action="?/createExpense"
        enctype="multipart/form-data"
        class="expense-entry-form"
        data-expense-entry-surface
        aria-busy={saving}
        use:operationalFieldValidation
        use:enhance={submitExpense}
        onsubmit={(event) => {
          void handleOfflineDraft(event);
        }}
      >
        {#if emptyProjectProblem}
          <ProblemNotice
            problem={emptyProjectProblem}
            kind="error"
            remedyLinks={{
              review_projects: {
                label: translate('Review available projects'),
                href: `${base}/app/projects`,
              },
              contact_project_owner: {
                label: translate('Contact the project owner to review access.'),
              },
            }}
          />
        {/if}
        {#if emptyWorkerProblem}
          <ProblemNotice
            problem={emptyWorkerProblem}
            kind="error"
            remedyLinks={{
              review_workers: {
                label: translate('Review available workers'),
                href: `${base}/app/projects?view=team&lang=${encodeURIComponent(warningLocale)}#team-panel-specialists`,
              },
              contact_project_owner: {
                label: translate('Contact the project owner to review access.'),
              },
            }}
          />
        {/if}
        <input type="hidden" name="requestId" value={createRequestId} />
        {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
          <label
            ><span>{translate('Worker')}</span><select
              name="workerId"
              required
              bind:value={createWorker}
              ><option value="">{translate('Select worker')}</option
              >{#each data.workers ?? [] as worker}<option value={String(worker.id)}
                  >{worker.name} — {worker.email}</option
                >{/each}</select
            ></label
          >
        {/if}
        {#if data.user.role === 'worker' && (crewWorkerOptions.length > 0 || (createWorker && createWorker !== data.user.id))}
          <label>
            <span>{translate('Record expense for')}</span>
            <select
              name="workerId"
              required
              bind:value={createWorker}
              disabled={crewWorkersLoading}
            >
              <option value={data.user.id}>{data.user.name} — {translate('my own expense')}</option>
              {#if createWorker !== data.user.id && !crewWorkerOptions.some((worker) => worker.id === createWorker)}
                <option value={createWorker} disabled={!crewLookupProblem}
                  >{translate(
                    crewWorkersLoading
                      ? 'Loading crew member…'
                      : crewLookupProblem
                        ? portalText(warningLocale, 'problem.expenseLookup.selectedCrewUnverified')
                        : 'Crew member unavailable',
                  )}</option
                >
              {/if}
              {#each crewWorkerOptions as worker (worker.id)}
                <option value={worker.id}>{worker.name}</option>
              {/each}
            </select>
            <small>{translate('A separate expense is recorded for the selected person.')}</small>
          </label>
          {#if crewSelectionUnavailable}
            <p class="operational-form-error" role="alert">
              {translate(
                'This crew member is no longer available for this project and date. Review the selection before saving.',
              )}
            </p>
          {/if}
        {/if}
        {#if crewLookupProblem}
          <ProblemNotice
            problem={crewLookupProblem}
            kind="error"
            remedyLinks={lookupRemedyLinks}
            class="expense-crew-lookup-notice"
          />
          {#if crewLookupProblem.correlationId}
            <small
              >{portalText(warningLocale, 'problem.error.reference', {
                correlationId: crewLookupProblem.correlationId,
              })}</small
            >
          {/if}
          {#if canRetryLookup(crewLookupProblem)}
            <button type="button" class="secondary-button" onclick={() => (crewLookupRetry += 1)}
              >{portalText(warningLocale, 'problem.expenseLookup.retryOptions')}</button
            >
          {/if}
        {/if}

        <div class="expense-entry-intro">
          <strong>{translate('Capture what happened')}</strong>
          <span>{translate('Use the receipt and operational details you know on site.')}</span>
        </div>
        <label>
          <span>{translate('Receipt image or PDF')}</span>
          <input
            name="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onchange={handleReceiptChange}
          />
          <small>{translate('JPG, PNG, HEIC or PDF up to 10 MB')}</small>
        </label>
        {#if receiptPreviewName}
          <div class="expense-receipt-preview" aria-live="polite">
            <strong>{translate('Receipt preview')}</strong>
            {#if receiptPreviewUrl && receiptPreviewMime.startsWith('image/')}
              <img src={receiptPreviewUrl} alt={receiptPreviewName} />
            {:else if receiptPreviewUrl && receiptPreviewMime === 'application/pdf'}
              <a href={receiptPreviewUrl} download={receiptPreviewName}
                >{translate('Download PDF')}: {receiptPreviewName}</a
              >
            {:else}
              <span>{receiptPreviewName}</span>
            {/if}
          </div>
        {/if}
        <label>
          <span>{translate('Project')}</span>
          <select name="projectId" required bind:value={createProject}>
            <option value="">{translate('Select assignment')}</option>
            {#if projectSelectionUnavailable}
              <option value={createProject} disabled
                >{translate('Project no longer available')}</option
              >
            {/if}
            {#each availableProjects as project}
              <option value={String(project.id)}>{project.project_number} — {project.name}</option>
            {/each}
          </select>
        </label>
        {#if selectedProjectUnavailableProblem}
          <ProblemNotice
            problem={selectedProjectUnavailableProblem}
            kind="error"
            remedyLinks={{
              review_projects: {
                label: translate('Review available projects'),
                href: `${base}/app/projects`,
              },
              contact_project_owner: {
                label: translate('Contact the project owner to review access.'),
              },
            }}
          />
        {/if}
        <div class="expense-form-grid">
          <label>
            <span>{translate('Date')}</span>
            <input name="spentOn" type="date" required bind:value={createDate} />
          </label>
          <label>
            <span>{translate('Category')}</span>
            <select name="category" value={restoredExpenseValue('category') || 'hotel'} required>
              {#each expenseCategories as [value, label]}
                <option {value}>{translate(label)}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Time expense occurred (optional)')}</span>
            <input
              name="occurredTimeLocal"
              type="time"
              step="60"
              value={restoredExpenseValue('occurredTimeLocal')}
            />
            <small>{translate('Local time at the project site; leave blank if unknown.')}</small>
          </label>
          <label>
            <span>{translate('Related logged hours (optional)')}</span>
            <select name="timeEntryId" bind:value={createTimeEntryId}>
              <option value="">{translate('Expense only / no linked hours')}</option>
              {#if createTimeEntryId && !linkedTimeOptions.some((time) => time.id === createTimeEntryId)}
                <option value={createTimeEntryId} disabled={!timeLookupProblem}
                  >{translate(
                    linkedTimeLoading
                      ? 'Loading linked hours…'
                      : timeLookupProblem
                        ? 'Current linked hours'
                        : 'Linked hours unavailable',
                  )}</option
                >
              {/if}
              {#each linkedTimeOptions as time (time.id)}
                <option value={time.id}>
                  {time.workerName} · {decimalHours(time.minutes)} h · {controlledValue(
                    'status',
                    time.approvalState,
                  )}{time.correctionLinked ? ` · ${translate('Correction')}` : ''} · {time.summary}
                </option>
              {/each}
            </select>
            <small
              >{linkedTimeLoading
                ? translate('Loading logged hours…')
                : translate('Only hours for this worker, project and date are shown.')}</small
            >
          </label>
          {#if timeSelectionUnavailable}
            <p class="operational-form-error" role="alert">
              {translate(
                'The selected logged hours are no longer available. Review the link before saving.',
              )}
            </p>
          {/if}
        </div>
        {#if timeLookupProblem}
          <ProblemNotice
            problem={timeLookupProblem}
            kind="error"
            remedyLinks={lookupRemedyLinks}
            class="expense-time-lookup-notice"
          />
          {#if timeLookupProblem.correlationId}
            <small
              >{portalText(warningLocale, 'problem.error.reference', {
                correlationId: timeLookupProblem.correlationId,
              })}</small
            >
          {/if}
          {#if canRetryLookup(timeLookupProblem)}
            <button type="button" class="secondary-button" onclick={() => (timeLookupRetry += 1)}
              >{portalText(warningLocale, 'problem.expenseLookup.retryOptions')}</button
            >
          {/if}
        {/if}
        {#if selectedTimeLinkVerified}
          <ProblemNotice
            problem={selectedTimeLinkWarning}
            kind="warning"
            remedyLinks={{
              review_selected_time_entry: {
                label: portalText(warningLocale, 'problem.remedy.reviewSelectedTimeEntry'),
              },
            }}
          />
        {/if}
        <label>
          <span>{translate('Vendor (optional)')}</span>
          <input name="vendor" maxlength="200" value={restoredExpenseValue('vendor')} />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input
              name="amount"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9][0-9]?)?"
              data-pattern-message="Amount: enter a number such as 12.34, with no more than two decimal places."
              value={restoredExpenseValue('amount')}
              required
            />
          </label>
          <label>
            <span>{translate('Currency')}</span>
            <select name="currency" bind:value={createCurrency} required>
              {#if !['USD', 'BRL', 'EUR'].includes(createProjectCurrency)}
                <option value={createProjectCurrency}>{createProjectCurrency}</option>
              {/if}
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>
        <label>
          <span>{translate('Who paid')}</span>
          <select name="whoPaid" bind:value={createWhoPaid} required>
            <option value="worker">{translate('Worker')}</option>
            <option value="company_card">{translate('Company card')}</option>
            <option value="company_direct">{translate('Company direct')}</option>
            <option value="client">{translate('Client paid directly')}</option>
            <option value="third_party">{translate('Third party')}</option>
          </select>
        </label>
        <ProblemNotice
          problem={payerTreatmentWarning}
          kind="warning"
          remedyLinks={{
            review_expense_payer: {
              label: portalText(warningLocale, 'problem.remedy.reviewExpensePayer'),
            },
          }}
        />
        <label>
          <span>{translate('Description')}</span>
          <textarea
            name="description"
            minlength="3"
            maxlength="5000"
            required
            bind:value={createDescription}
            oninput={() => (createDescriptionEdited = true)}
          ></textarea>
        </label>
        {#if descriptionLookupProblem}
          <ProblemNotice
            problem={descriptionLookupProblem}
            kind="error"
            remedyLinks={lookupRemedyLinks}
            class="expense-description-lookup-notice"
          />
          {#if descriptionLookupProblem.correlationId}
            <small
              >{portalText(warningLocale, 'problem.error.reference', {
                correlationId: descriptionLookupProblem.correlationId,
              })}</small
            >
          {/if}
          {#if descriptionLookupProblem.code === 'EXPENSE_LOOKUP_UNAVAILABLE'}
            <p>{portalText(warningLocale, 'problem.expenseLookup.enterDescriptionManually')}</p>
          {/if}
          {#if canRetryLookup(descriptionLookupProblem)}
            <button
              type="button"
              class="secondary-button"
              onclick={() => (descriptionLookupRetry += 1)}
              >{portalText(warningLocale, 'problem.expenseLookup.retryOptions')}</button
            >
          {/if}
        {/if}
        <label>
          <span>{translate('Payment method')}</span>
          <input
            name="paymentMethod"
            maxlength="80"
            placeholder={translate('Card, transfer or cash')}
            value={restoredExpenseValue('paymentMethod')}
          />
        </label>
        {#if !receiptPreviewName}
          <ProblemNotice
            problem={missingDraftReceiptWarning}
            kind="warning"
            remedyLinks={{
              attach_receipt_or_save_draft: {
                label: portalText(warningLocale, 'problem.remedy.attachReceiptOrSaveDraft'),
              },
            }}
          />
        {/if}
        <div class="expense-entry-actions">
          <button type="button" class="secondary-button" data-sheet-close onclick={closeSurface}
            >{translate('Cancel')}</button
          >
          <button
            type="submit"
            disabled={saving ||
              crewWorkersLoading ||
              crewSelectionUnavailable ||
              projectSelectionUnavailable ||
              timeSelectionUnavailable ||
              (Boolean(createTimeEntryId) && linkedTimeLoading)}
            >{translate(saving ? 'Saving…' : 'Save draft')}</button
          >
        </div>
      </form>
    {:else if surface === 'edit' && editRow}
      <form
        method="POST"
        action="?/updateExpense"
        class="expense-entry-form"
        data-expense-entry-surface
        aria-busy={saving}
        use:operationalFieldValidation
        use:enhance={submitExpense}
      >
        <input type="hidden" name="id" value={editRow.id} />
        <input type="hidden" name="version" value={editRow.version} />
        <div class="expense-entry-intro">
          <strong>{translate('Update operational details')}</strong>
          <span
            >{translate(
              'Submitted or approved values stay protected by the record lifecycle.',
            )}</span
          >
        </div>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Date')}</span>
            <input name="spentOn" type="date" bind:value={editDate} required />
          </label>
          <label>
            <span>{translate('Category')}</span>
            <select
              name="category"
              value={nativeRecoveryActive
                ? nativeExpenseValue('category')
                : rowText(editRow, 'category')}
              required
            >
              {#each expenseCategories as [value, label]}
                <option {value}>{translate(label)}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Time expense occurred (optional)')}</span>
            <input
              name="occurredTimeLocal"
              type="time"
              step="60"
              value={nativeRecoveryActive
                ? nativeExpenseValue('occurredTimeLocal')
                : rowText(editRow, 'occurred_time_local')}
            />
          </label>
          <label>
            <span>{translate('Related logged hours (optional)')}</span>
            <select
              name="timeEntryId"
              bind:value={editTimeEntryId}
              aria-invalid={editTimeSelectionUnavailable}
            >
              <option value="">{translate('Expense only / no linked hours')}</option>
              {#if editTimeEntryId && !linkedTimeOptions.some((time) => time.id === editTimeEntryId)}
                <option value={editTimeEntryId}>
                  {translate(
                    editTimeEntryId === rowText(editRow, 'time_entry_id') &&
                      editDate === rowText(editRow, 'spent_on') &&
                      editOriginalLinkValid === true
                      ? 'Current linked hours'
                      : linkedTimeLoading
                        ? 'Loading linked hours…'
                        : timeLookupProblem
                          ? 'problem.expenseLookup.selectedTimeUnverified'
                          : 'Linked hours unavailable',
                  )}
                </option>
              {/if}
              {#each linkedTimeOptions as time (time.id)}
                <option value={time.id}>
                  {time.workerName} · {decimalHours(time.minutes)} h · {controlledValue(
                    'status',
                    time.approvalState,
                  )}{time.correctionLinked ? ` · ${translate('Correction')}` : ''} · {time.summary}
                </option>
              {/each}
            </select>
            <small
              >{linkedTimeLoading || editOriginalLinkUnverified
                ? translate('Loading logged hours…')
                : translate('Only hours for this worker, project and date are shown.')}</small
            >
          </label>
          {#if editTimeSelectionUnavailable}
            <p class="operational-form-error" role="alert">
              {translate(
                editOriginalLinkDateMismatch
                  ? 'problem.expenseLookup.originalTimeDateMismatch'
                  : 'The selected logged hours are no longer available. Review the link before saving.',
              )}
            </p>
          {/if}
          {#if timeLookupProblem}
            <ProblemNotice
              problem={timeLookupProblem}
              kind="error"
              remedyLinks={lookupRemedyLinks}
              class="expense-time-lookup-notice"
            />
            {#if timeLookupProblem.correlationId}
              <small
                >{portalText(warningLocale, 'problem.error.reference', {
                  correlationId: timeLookupProblem.correlationId,
                })}</small
              >
            {/if}
            {#if canRetryLookup(timeLookupProblem)}
              <button type="button" class="secondary-button" onclick={() => (timeLookupRetry += 1)}
                >{portalText(warningLocale, 'problem.expenseLookup.retryOptions')}</button
              >
            {/if}
          {/if}
        </div>
        {#if selectedTimeLinkVerified}
          <ProblemNotice
            problem={selectedTimeLinkWarning}
            kind="warning"
            remedyLinks={{
              review_selected_time_entry: {
                label: portalText(warningLocale, 'problem.remedy.reviewSelectedTimeEntry'),
              },
            }}
          />
        {/if}
        <label>
          <span>{translate('Vendor (optional)')}</span>
          <input
            name="vendor"
            value={nativeRecoveryActive ? nativeExpenseValue('vendor') : rowText(editRow, 'vendor')}
            maxlength="200"
          />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input
              name="amount"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9][0-9]?)?"
              data-pattern-message="Amount: enter a number such as 12.34, with no more than two decimal places."
              value={nativeRecoveryActive
                ? nativeExpenseValue('amount')
                : minorToDecimal(editRow.amount_minor)}
              required
            />
          </label>
          <label>
            <span>{translate('Payment method')}</span>
            <input
              name="paymentMethod"
              value={nativeRecoveryActive
                ? nativeExpenseValue('paymentMethod')
                : rowText(editRow, 'payment_method')}
              maxlength="80"
            />
          </label>
        </div>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="description" minlength="3" maxlength="5000"
            >{nativeRecoveryActive
              ? nativeExpenseValue('description')
              : rowText(editRow, 'description')}</textarea
          >
        </label>
        <div class="expense-entry-actions">
          <button type="button" class="secondary-button" data-sheet-close onclick={closeSurface}
            >{translate('Cancel')}</button
          >
          <button
            type="submit"
            disabled={saving ||
              linkedTimeLoading ||
              editOriginalLinkUnverified ||
              editTimeSelectionUnavailable}>{translate(saving ? 'Saving…' : 'Save changes')}</button
          >
        </div>
      </form>
    {/if}
  </ResponsiveSheet>
</div>

<style>
  .operational-form-error {
    color: var(--ja-red-dark, #8f1d14);
    padding: 0.75rem 0;
  }
  .expense-primary-action-top {
    justify-content: flex-start;
  }
  .expense-status-card {
    color: inherit;
    text-decoration: none;
  }
  .expense-status-card:hover,
  .expense-status-card:focus-visible {
    border-color: var(--ja-teal, #706e66);
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 25%, transparent);
    outline-offset: 2px;
  }
  .expense-record-statuses a {
    display: inline-flex;
    align-items: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    color: inherit;
    text-decoration: none;
  }
  .expense-record-statuses a:focus-visible {
    border-radius: 999px;
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 30%, transparent);
    outline-offset: 2px;
  }
  .expense-export-panel {
    display: grid;
    gap: 0.9rem;
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid var(--portal-border, #e2e1df);
    border-radius: 0.75rem;
    background: var(--portal-surface-soft, #fbfbfa);
  }
  .expense-export-panel h3,
  .expense-export-panel p {
    margin: 0;
  }
  .expense-export-panel p {
    color: var(--portal-muted, #67675f);
    font-size: 0.86rem;
  }
  .expense-export-fields {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .expense-export-fields label {
    display: grid;
    gap: 0.3rem;
  }
  .expense-export-fields span {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .expense-export-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .expense-export-actions a {
    text-decoration: none;
  }
  .expense-export-actions a[aria-disabled='true'] {
    cursor: progress;
    opacity: 0.65;
  }
  .expense-export-field-summary {
    display: grid;
    gap: 0.35rem;
    margin: 0 0 0.75rem;
    padding-left: 1.25rem;
  }
  .expense-export-field-summary a {
    color: var(--ja-status-danger, #a40f18);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  .expense-export-field-summary a:focus-visible {
    outline: 2px solid var(--ja-border-focus, #727068);
    outline-offset: 2px;
  }
  .expense-export-field-error {
    color: var(--ja-status-danger, #a40f18);
    font-size: 0.8125rem;
    line-height: 1.35;
  }
  @media (max-width: 52rem) {
    .expense-export-fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 34rem) {
    .expense-export-fields {
      grid-template-columns: 1fr;
    }
    .expense-export-actions a {
      flex: 1 1 100%;
      text-align: center;
    }
  }
  .operational-pagination {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .operational-pagination span {
    color: var(--ja-steel, #77756d);
    font-size: 0.85rem;
  }
  @media (max-width: 480px) {
    .operational-pagination {
      justify-content: stretch;
    }
    .operational-pagination button {
      flex: 1 1 7rem;
    }
    .operational-pagination span {
      order: -1;
      width: 100%;
      text-align: center;
    }
  }
</style>
