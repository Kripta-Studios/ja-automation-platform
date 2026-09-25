<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { normalizePortalLocale } from '../../portal-i18n';
  import { localToday } from '../ui/time-entry-clock';
  import { createOperationalSubmit, operationalFieldValidation } from '../ui/operational-submit';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { ResponsiveSheet, SectionCard, StatusBadge } from '../ui';
  import FilterSummary from '../ui/FilterSummary.svelte';
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
    ) => Promise<void>;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  type Surface = 'create' | 'edit';

  let surface = $state<Surface | null>(null);
  let surfaceError = $state('');
  let saving = $state(false);
  let createDate = $state('');
  let createProject = $state('');
  const createProjectCurrency = $derived(
    String(
      availableProjects.find((project) => String(project.id) === createProject)?.currency ?? 'USD',
    ),
  );
  let createWorker = $state('');
  let createRequestId = $state('');
  let crewWorkerOptions = $state<Array<{ id: string; name: string }>>([]);
  let crewWorkersLoading = $state(false);
  let createTimeEntryId = $state('');
  let handledTimeLink = $state('');
  let editDate = $state('');
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
  const submitExpense = createOperationalSubmit({
    locale: () => normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
    translate: (value) => translate(value),
    setSaving: (value) => {
      saving = value;
    },
    setError: (value) => {
      surfaceError = value;
    },
    onSuccess: closeSurface,
    offlineHandled: () => surface === 'create' && data.offlineEnabled !== false,
  });
  let editExpenseId = $state<string | null>(null);
  $effect(() => {
    const timeEntryId = $page.url.searchParams.get('timeEntry')?.trim() ?? '';
    if (timeEntryId && timeEntryId !== handledTimeLink) {
      handledTimeLink = timeEntryId;
      openCreate();
    }
  });
  $effect(() => {
    const id = $page.url.searchParams.get('edit');
    if (
      id &&
      records.some(
        (row) =>
          String(row.id) === id &&
          row.approval_state === 'draft' &&
          !row.shared_receipt_allocated &&
          Number(row.correction_linked ?? 0) !== 1,
      )
    ) {
      editExpenseId = id;
      editDate = String(records.find((row) => String(row.id) === id)?.spent_on ?? '');
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
    if (!isAuditor && $page.url.searchParams.get('action') === 'record-expense') openCreate();
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
  $effect(() => {
    if (surface !== 'create' || data.user.role !== 'worker' || !createProject || !createDate) {
      crewWorkerOptions = [];
      crewWorkersLoading = false;
      return;
    }
    const controller = new AbortController();
    crewWorkersLoading = true;
    const params = new URLSearchParams({ projectId: createProject, date: createDate });
    void fetch(`${base}/app/api/expenses/crew-workers?${params}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Crew workers could not be loaded');
        const payload = (await response.json()) as { workers?: typeof crewWorkerOptions };
        crewWorkerOptions = payload.workers ?? [];
        if (
          createWorker &&
          createWorker !== data.user.id &&
          !crewWorkerOptions.some((worker) => worker.id === createWorker)
        ) {
          createWorker = data.user.id;
          createTimeEntryId = '';
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          crewWorkerOptions = [];
          createWorker = data.user.id;
          createTimeEntryId = '';
          surfaceError = translate(
            'Crew workers could not be loaded. Try again or record your own expense.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) crewWorkersLoading = false;
      });
    return () => controller.abort();
  });
  $effect(() => {
    const projectId = surface === 'edit' ? String(editRow?.project_id ?? '') : createProject;
    const date = surface === 'edit' ? editDate : createDate;
    const workerId =
      surface === 'edit' ? String(editRow?.worker_id ?? '') : createWorker || String(data.user.id);
    linkedTimeOptions = [];
    if (!surface || !projectId || !date || !workerId) return;
    const controller = new AbortController();
    linkedTimeLoading = true;
    const params = new URLSearchParams({ projectId, date, workerId });
    void fetch(`${base}/app/api/expenses/time-options?${params}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load time records');
        const payload = (await response.json()) as { rows?: typeof linkedTimeOptions };
        linkedTimeOptions = payload.rows ?? [];
        if (
          surface === 'create' &&
          createTimeEntryId &&
          !linkedTimeOptions.some((time) => time.id === createTimeEntryId)
        )
          createTimeEntryId = '';
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          if (surface === 'create') createTimeEntryId = '';
          surfaceError = translate(
            'Logged hours could not be loaded. You can still save an expense without a link.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) linkedTimeLoading = false;
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
    const requestedDate = $page.url.searchParams.get('date')?.trim() ?? '';
    const requestedProject = $page.url.searchParams.get('project')?.trim() || projectFilter;
    const requestedWorker = $page.url.searchParams.get('worker')?.trim() ?? '';
    createDate = /^\d{4}-\d{2}-\d{2}$/u.test(requestedDate) ? requestedDate : localToday();
    createProject = availableProjects.some((project) => String(project.id) === requestedProject)
      ? requestedProject
      : '';
    createWorker =
      data.user.role === 'worker'
        ? requestedWorker || data.user.id
        : (data.workers ?? []).some((worker) => String(worker.id) === requestedWorker)
          ? requestedWorker
          : '';
    createRequestId = crypto.randomUUID();
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
    editDate = String(row.spent_on ?? '');
    surface = 'edit';
    editExpenseId = String(row.id);
  }

  function closeSurface(): void {
    surface = null;
    editExpenseId = null;
    createTimeEntryId = '';
    if (typeof window !== 'undefined' && $page.url.searchParams.has('timeEntry')) {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete('timeEntry');
      cleaned.searchParams.delete('date');
      window.history.replaceState(window.history.state, '', cleaned);
    }
    clearReceiptPreview();
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
    class="expense-filters"
    method="GET"
    action={`${base}/app/expenses`}
    aria-label={translate('Filter expenses')}
  >
    <label>
      <span>{translate('Search expenses')}</span>
      <input
        name="q"
        bind:value={search}
        oninput={() => (registerPage = 1)}
        type="search"
        placeholder={translate('Vendor, project or date')}
      />
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select name="project" bind:value={projectFilter} onchange={() => (registerPage = 1)}>
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option value={String(project.id)}>{project.project_number} — {project.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Status')}</span>
      <select name="status" bind:value={statusFilter} onchange={() => (registerPage = 1)}>
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
            <select name="worker" bind:value={workerFilter} onchange={() => (registerPage = 1)}>
              <option value="">{translate('All workers')}</option>
              {#each data.workers ?? [] as worker}
                <option value={String(worker.id)}>{worker.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label>
          <span>{translate('Client')}</span>
          <select name="client" bind:value={clientFilter} onchange={() => (registerPage = 1)}>
            <option value="">{translate('All clients')}</option>
            {#each clientOptions as client}<option value={client}>{client}</option>{/each}
          </select>
        </label>
        <label>
          <span>{translate('From')}</span>
          <input
            name="from"
            type="date"
            bind:value={fromFilter}
            onchange={() => (registerPage = 1)}
          />
        </label>
        <label>
          <span>{translate('To')}</span>
          <input name="to" type="date" bind:value={toFilter} onchange={() => (registerPage = 1)} />
        </label>

        <label>
          <span>{translate('Category')}</span>
          <select name="category" bind:value={categoryFilter} onchange={() => (registerPage = 1)}>
            <option value="">{translate('All categories')}</option>
            {#each expenseCategories as [value, label]}<option {value}>{translate(label)}</option
              >{/each}
          </select>
        </label>
        <label>
          <span>{translate('Currency')}</span>
          <select name="currency" bind:value={currencyFilter} onchange={() => (registerPage = 1)}>
            <option value="">{translate('All currencies')}</option>
            <option value="USD">USD</option><option value="EUR">EUR</option><option value="BRL"
              >BRL</option
            >
          </select>
        </label>

        <label>
          <span>{translate('Receipt evidence')}</span>
          <select name="receipt" bind:value={receiptFilter} onchange={() => (registerPage = 1)}>
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

  {#if !restrictedOperational}
    <section class="expense-export-panel" aria-labelledby="expense-filtered-export-title">
      <div>
        <h3 id="expense-filtered-export-title">{translate('Export filtered results')}</h3>
        <p>
          {translate('Download exactly the expenses currently selected by the register filters.')}
        </p>
      </div>
      <div class="expense-export-actions">
        {#if filteredExportPeriod}
          <a class="secondary-button" href={filteredExportHref('pdf')} data-sveltekit-reload
            >{translate('Download PDF')}</a
          >
          <a class="secondary-button" href={filteredExportHref('xlsx')} data-sveltekit-reload
            >{translate('Download Excel')}</a
          >
          <a class="secondary-button" href={filteredExportHref('csv')} data-sveltekit-reload
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
      <div class="expense-export-fields">
        <label><span>{translate('From')}</span><input type="date" bind:value={exportFrom} /></label>
        <label><span>{translate('To')}</span><input type="date" bind:value={exportTo} /></label>
        <label
          ><span>{translate('Project')}</span><select bind:value={exportProject}
            ><option value="">{translate('All projects')}</option
            >{#each availableProjects as project}<option value={String(project.id)}
                >{project.project_number} — {project.name}</option
              >{/each}</select
          ></label
        >
        {#if ['owner_admin', 'project_manager', 'finance_admin'].includes(String(data.user.role))}
          <label
            ><span>{translate('Worker')}</span><select bind:value={exportWorker}
              ><option value="">{translate('All workers')}</option
              >{#each data.workers ?? [] as worker}<option value={String(worker.id)}
                  >{worker.name}</option
                >{/each}</select
            ></label
          >
        {/if}
        <label
          ><span>{translate('Client')}</span><select bind:value={exportClient}
            ><option value="">{translate('All clients')}</option
            >{#each clientOptions as client}<option value={client}>{client}</option>{/each}</select
          ></label
        >
        <label
          ><span>{translate('Category')}</span><select bind:value={exportCategory}
            ><option value="">{translate('All categories')}</option
            >{#each expenseCategories as [value, label]}<option {value}>{translate(label)}</option
              >{/each}</select
          ></label
        >
        <label
          ><span>{translate('Currency')}</span><select bind:value={exportCurrency}
            ><option value="">{translate('All currencies')}</option><option value="USD">USD</option
            ><option value="EUR">EUR</option><option value="BRL">BRL</option></select
          ></label
        >
        <label
          ><span>{translate('Status')}</span><select bind:value={exportStatus}
            ><option value="">{translate('All statuses')}</option><option value="draft"
              >{translate('Draft')}</option
            ><option value="submitted">{translate('Submitted')}</option><option value="approved"
              >{translate('Approved')}</option
            ><option value="needs_changes">{translate('Needs changes')}</option></select
          ></label
        >
        {#if canViewReimbursement}<label
            ><span>{translate('Reimbursement status')}</span><select
              bind:value={exportReimbursement}
              ><option value="">{translate('All statuses')}</option><option value="pending"
                >{translate('Pending or scheduled')}</option
              ><option value="reimbursed">{translate('Reimbursed')}</option></select
            ></label
          >{/if}
      </div>
      <div class="expense-export-actions">
        <a class="secondary-button" href={exportHref('pdf')} data-sveltekit-reload
          >{translate('Download PDF')}</a
        >
        <a class="secondary-button" href={exportHref('xlsx')} data-sveltekit-reload
          >{translate('Download Excel')}</a
        >
        <a class="secondary-button" href={exportHref('csv')} data-sveltekit-reload
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
                <strong>{row.vendor || translate('Expense')}</strong>
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
    {#if surfaceError}
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
        onsubmit={(event) => saveOfflineDraft(event, 'expense')}
      >
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
                <option value={createWorker} disabled>{translate('Loading crew member…')}</option>
              {/if}
              {#each crewWorkerOptions as worker (worker.id)}
                <option value={worker.id}>{worker.name}</option>
              {/each}
            </select>
            <small>{translate('A separate expense is recorded for the selected person.')}</small>
          </label>
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
              <object
                data={receiptPreviewUrl}
                type="application/pdf"
                aria-label={receiptPreviewName}
              >
                <a href={receiptPreviewUrl} target="_blank" rel="noreferrer">{receiptPreviewName}</a
                >
              </object>
            {:else}
              <span>{receiptPreviewName}</span>
            {/if}
          </div>
        {/if}
        <label>
          <span>{translate('Project')}</span>
          <select name="projectId" required bind:value={createProject}>
            <option value="">{translate('Select assignment')}</option>
            {#each availableProjects as project}
              <option value={String(project.id)}>{project.project_number} — {project.name}</option>
            {/each}
          </select>
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Date')}</span>
            <input name="spentOn" type="date" required bind:value={createDate} />
          </label>
          <label>
            <span>{translate('Category')}</span>
            <select name="category" required>
              {#each expenseCategories as [value, label]}
                <option {value}>{translate(label)}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Time expense occurred (optional)')}</span>
            <input name="occurredTimeLocal" type="time" step="60" />
            <small>{translate('Local time at the project site; leave blank if unknown.')}</small>
          </label>
          <label>
            <span>{translate('Related logged hours (optional)')}</span>
            <select name="timeEntryId" bind:value={createTimeEntryId}>
              <option value="">{translate('Expense only / no linked hours')}</option>
              {#if createTimeEntryId && !linkedTimeOptions.some((time) => time.id === createTimeEntryId)}
                <option value={createTimeEntryId} disabled
                  >{translate('Loading linked hours…')}</option
                >
              {/if}
              {#each linkedTimeOptions as time (time.id)}
                <option value={time.id}>
                  {time.workerName} · {Math.floor(time.minutes / 60)} h {time.minutes % 60} min · {controlledValue(
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
        </div>
        <label>
          <span>{translate('Vendor')}</span>
          <input name="vendor" required maxlength="200" />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input
              name="amount"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9][0-9]?)?"
              data-pattern-message="Amount: enter a number such as 12.34, with no more than two decimal places."
              required
            />
          </label>
          <label>
            <span>{translate('Currency')}</span>
            <select name="currency" value={createProjectCurrency} required>
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
          <select name="whoPaid" required>
            <option value="worker">{translate('Worker')}</option>
            <option value="company_card">{translate('Company card')}</option>
            <option value="company_direct">{translate('Company direct')}</option>
            <option value="client">{translate('Client paid directly')}</option>
            <option value="third_party">{translate('Third party')}</option>
          </select>
        </label>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="description" minlength="3" maxlength="5000" required></textarea>
        </label>
        <label>
          <span>{translate('Payment method')}</span>
          <input
            name="paymentMethod"
            maxlength="80"
            placeholder={translate('Card, transfer or cash')}
          />
        </label>
        <div class="expense-entry-actions">
          <button type="button" class="secondary-button" data-sheet-close onclick={closeSurface}
            >{translate('Cancel')}</button
          >
          <button
            type="submit"
            disabled={saving ||
              crewWorkersLoading ||
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
            <select name="category" value={rowText(editRow, 'category')} required>
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
              value={rowText(editRow, 'occurred_time_local')}
            />
          </label>
          <label>
            <span>{translate('Related logged hours (optional)')}</span>
            <select name="timeEntryId" value={rowText(editRow, 'time_entry_id')}>
              <option value="">{translate('Expense only / no linked hours')}</option>
              {#if editRow.time_entry_id && !linkedTimeOptions.some((time) => time.id === editRow?.time_entry_id)}
                <option value={String(editRow.time_entry_id)}
                  >{translate('Current linked hours')}</option
                >
              {/if}
              {#each linkedTimeOptions as time (time.id)}
                <option value={time.id}>
                  {time.workerName} · {Math.floor(time.minutes / 60)} h {time.minutes % 60} min · {controlledValue(
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
        </div>
        <label>
          <span>{translate('Vendor')}</span>
          <input name="vendor" value={rowText(editRow, 'vendor')} required maxlength="200" />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input
              name="amount"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9][0-9]?)?"
              data-pattern-message="Amount: enter a number such as 12.34, with no more than two decimal places."
              value={minorToDecimal(editRow.amount_minor)}
              required
            />
          </label>
          <label>
            <span>{translate('Payment method')}</span>
            <input name="paymentMethod" value={rowText(editRow, 'payment_method')} maxlength="80" />
          </label>
        </div>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="description" minlength="3" maxlength="5000"
            >{rowText(editRow, 'description')}</textarea
          >
        </label>
        <div class="expense-entry-actions">
          <button type="button" class="secondary-button" data-sheet-close onclick={closeSurface}
            >{translate('Cancel')}</button
          >
          <button type="submit" disabled={saving}
            >{translate(saving ? 'Saving…' : 'Save changes')}</button
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
