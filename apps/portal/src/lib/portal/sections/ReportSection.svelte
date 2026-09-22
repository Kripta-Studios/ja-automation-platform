<script lang="ts">
  import { SectionCard } from '../ui';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ResponsiveSheet, StatusBadge } from '../ui';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import FilterSummary from '../ui/FilterSummary.svelte';
  import { normalizePortalLocale } from '../../portal-i18n';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { reportGuidanceFor } from '../report-guidance';
  import {
    operationalMatches,
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

  const tabs = [
    { id: 'daily', label: 'Daily' },
    { id: 'technical', label: 'Technical / PLC' },
    { id: 'signoff', label: 'Client Sign-off' },
  ] as const;

  type ReportTab = (typeof tabs)[number]['id'];
  type Surface = 'daily' | 'technical' | 'generate' | null;
  type SignoffState = 'needs_report' | 'ready_for_signature' | 'signed' | 'invalid';

  function resolveReportTab(value: string | null): ReportTab {
    const candidate = value?.trim() ?? '';
    return tabs.some((tab) => tab.id === candidate) ? (candidate as ReportTab) : 'daily';
  }

  // Keep direct links such as /app/reports?view=signoff useful on first paint
  // (including SSR), while retaining an in-page tab selection after a button
  // click.  The URL key is part of the override so a subsequent navigation to
  // another allowlisted/invalid view cannot leave the old panel selected.
  let tabOverride = $state<{ url: string; tab: ReportTab } | null>(null);
  let activeTab = $derived(
    tabOverride?.url === $page.url.href
      ? tabOverride.tab
      : resolveReportTab($page.url.searchParams.get('view')),
  );
  let surface = $state<Surface>(null);
  let search = $state('');
  let projectFilter = $state('');
  let workerFilter = $state('');
  let clientFilter = $state('');
  let fromFilter = $state('');
  let toFilter = $state('');
  let statusFilter = $state('');
  let order = $state<OperationalOrder>('newest');
  let dailyPage = $state(1);
  let technicalPage = $state(1);
  let signoffPage = $state<Row[]>([]);
  let periodReportPage = $state<Row[]>([]);
  let periodProjectId = $state('');
  let periodFrom = $state('');
  let periodTo = $state('');
  let periodContentMode = $state<
    'hours_only' | 'hours_activity' | 'hours_activity_selected_technical'
  >('hours_activity');
  let selectedTechnicalReportIds = $state<string[]>([]);
  let registerStateHydrated = $state(false);
  const registerStateKey = (): string => `ja-operational-register:reports:${data.user.id}`;

  onMount(() => {
    const saved = readOperationalRegisterState<{
      search?: string;
      order?: OperationalOrder;
      dailyPage?: number;
      technicalPage?: number;
    }>(registerStateKey());
    if (typeof saved?.search === 'string') search = saved.search;
    if (saved?.order && ['newest', 'oldest', 'name', 'status'].includes(saved.order)) {
      order = saved.order;
    }
    if (typeof saved?.dailyPage === 'number') dailyPage = saved.dailyPage;
    if (typeof saved?.technicalPage === 'number') technicalPage = saved.technicalPage;
    registerStateHydrated = true;
  });
  $effect(() => {
    if (registerStateHydrated)
      writeOperationalRegisterState(registerStateKey(), {
        search,
        order,
        dailyPage,
        technicalPage,
      });
  });

  const records = $derived(data.records ?? []);
  const periodReports = $derived(data.periodReports ?? []);
  const dailyReports = $derived(
    records.filter((row) => String(row.type ?? '').toLowerCase() !== 'technical'),
  );
  const technicalReports = $derived(
    records.filter((row) => String(row.type ?? '').toLowerCase() === 'technical'),
  );
  const selectablePeriodTechnicalReports = $derived(
    technicalReports.filter(
      (row) =>
        Boolean(periodProjectId) &&
        rowText(row, 'project_id') === periodProjectId &&
        (!periodFrom || rowText(row, 'date') >= periodFrom) &&
        (!periodTo || rowText(row, 'date') <= periodTo) &&
        ['approved', 'locked'].includes(rowText(row, 'approval_state').trim().toLowerCase()),
    ),
  );
  const reportGuidance = $derived(
    reportGuidanceFor(
      normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
      String(data.user.role ?? ''),
      data.user.workforceProfile,
    ),
  );
  const workerOptions = $derived(
    Array.from(
      new Map(
        records
          .filter((row) => rowText(row, 'worker_id'))
          .map((row) => [rowText(row, 'worker_id'), rowText(row, 'author_name')]),
      ).entries(),
    ),
  );
  const clientOptions = $derived(
    [
      ...new Set(
        [...records, ...periodReports].map((row) => rowText(row, 'client_name')).filter(Boolean),
      ),
    ].sort(),
  );
  const activeFieldTab = $derived(activeTab === 'technical' ? 'technical' : 'daily');
  const fieldReportsForActiveTab = $derived(
    activeFieldTab === 'technical' ? technicalReports : dailyReports,
  );
  const customerPeriodReports = $derived(
    periodReports.filter((report) => String(report.audience ?? '').toLowerCase() === 'customer'),
  );
  const signoffScopeRows = $derived(
    customerPeriodReports
      .filter(
        (report) =>
          (!projectFilter || rowText(report, 'project_id') === projectFilter) &&
          (!clientFilter || rowText(report, 'client_name') === clientFilter) &&
          (!fromFilter || rowText(report, 'period_end') >= fromFilter) &&
          (!toFilter || rowText(report, 'period_start') <= toFilter),
      )
      .map((report) => ({ ...report, browser_status: signoffState(report) })),
  );
  const generatedScopeRows = $derived(
    periodReports
      .filter(
        (report) =>
          (!projectFilter || rowText(report, 'project_id') === projectFilter) &&
          (!clientFilter || rowText(report, 'client_name') === clientFilter) &&
          (!fromFilter || rowText(report, 'period_end') >= fromFilter) &&
          (!toFilter || rowText(report, 'period_start') <= toFilter),
      )
      .map((report) => ({ ...report, browser_status: String(report.state ?? '') })),
  );
  const signoffRows = $derived.by(() =>
    operationalSort(
      signoffScopeRows.filter(
        (report) =>
          operationalStatusMatches(report.browser_status, statusFilter, [
            'needs_report',
            'ready_for_signature',
          ]) &&
          operationalMatches(report, search, [
            'project_number',
            'project_name',
            'client_name',
            'report_type',
            'period_start',
            'period_end',
            'browser_status',
          ]),
      ),
      order,
      ['period_start', 'period_end'],
      ['project_number', 'project_name', 'client_name', 'report_type'],
      ['browser_status'],
    ),
  );
  const generatedRows = $derived.by(() =>
    workerFilter
      ? []
      : operationalSort(
          generatedScopeRows.filter(
            (report) =>
              operationalStatusMatches(report.browser_status, statusFilter, [
                'draft',
                'queued',
                'running',
                'review',
                'failed',
              ]) &&
              operationalMatches(report, search, [
                'project_number',
                'project_name',
                'client_name',
                'report_type',
                'audience',
                'period_start',
                'period_end',
                'browser_status',
              ]),
          ),
          order,
          ['period_start', 'period_end'],
          ['project_number', 'project_name', 'client_name', 'report_type'],
          ['browser_status'],
        ),
  );
  const canGeneratePeriodReports = $derived(
    !isAuditor && ['owner_admin', 'finance_admin'].includes(String(data.user.role ?? '')),
  );
  const generatedStatusOptions = $derived(
    canGeneratePeriodReports
      ? [...new Set(periodReports.map((report) => rowText(report, 'state')).filter(Boolean))].sort()
      : [],
  );
  const statusOptions = $derived([
    ...new Set(
      activeTab === 'signoff'
        ? ['needs_report', 'ready_for_signature', 'signed', 'invalid', ...generatedStatusOptions]
        : [
            'attention',
            'draft',
            'submitted',
            'approved',
            'needs_changes',
            ...generatedStatusOptions,
          ],
    ),
  ]);
  const pendingReportCount = $derived(
    fieldReportsForActiveTab.filter((row) =>
      ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const readySignoffCount = $derived(
    signoffScopeRows.filter((report) => signoffState(report) === 'ready_for_signature').length,
  );
  const controlledBrowserResetKey = $derived(
    JSON.stringify([
      search,
      projectFilter,
      workerFilter,
      clientFilter,
      fromFilter,
      toFilter,
      statusFilter,
      order,
    ]),
  );
  $effect(() => {
    const querySearch = $page.url.searchParams.get('q');
    if (querySearch !== null) search = querySearch.trim();
    projectFilter = $page.url.searchParams.get('project')?.trim() ?? '';
    workerFilter = $page.url.searchParams.get('worker')?.trim() ?? '';
    clientFilter = $page.url.searchParams.get('client')?.trim() ?? '';
    fromFilter = $page.url.searchParams.get('from')?.trim() ?? '';
    toFilter = $page.url.searchParams.get('to')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    dailyPage = 1;
    technicalPage = 1;
  });
  $effect(() => {
    if (activeTab === 'signoff' && workerFilter) workerFilter = '';
  });
  const filteredDailyReports = $derived.by(() =>
    operationalSort(
      dailyReports.filter(
        (row) =>
          (!projectFilter || rowText(row, 'project_id') === projectFilter) &&
          (!workerFilter || rowText(row, 'worker_id') === workerFilter) &&
          (!clientFilter || rowText(row, 'client_name') === clientFilter) &&
          (!fromFilter || rowText(row, 'date') >= fromFilter) &&
          (!toFilter || rowText(row, 'date') <= toFilter) &&
          operationalStatusMatches(row.approval_state, statusFilter, [
            'draft',
            'submitted',
            'needs_changes',
          ]) &&
          operationalMatches(row, search, [
            'title',
            'project_number',
            'project_name',
            'client_name',
            'author_name',
            'created_by_name',
            'reviewed_by_name',
            'date',
          ]),
      ),
      order,
      ['date'],
      ['author_name', 'project_name', 'title'],
      ['approval_state'],
    ),
  );
  const filteredTechnicalReports = $derived.by(() =>
    operationalSort(
      technicalReports.filter(
        (row) =>
          (!projectFilter || rowText(row, 'project_id') === projectFilter) &&
          (!workerFilter || rowText(row, 'worker_id') === workerFilter) &&
          (!clientFilter || rowText(row, 'client_name') === clientFilter) &&
          (!fromFilter || rowText(row, 'date') >= fromFilter) &&
          (!toFilter || rowText(row, 'date') <= toFilter) &&
          operationalStatusMatches(row.approval_state, statusFilter, [
            'draft',
            'submitted',
            'needs_changes',
          ]) &&
          operationalMatches(row, search, [
            'title',
            'project_number',
            'project_name',
            'client_name',
            'author_name',
            'created_by_name',
            'reviewed_by_name',
            'date',
          ]),
      ),
      order,
      ['date'],
      ['author_name', 'project_name', 'title'],
      ['approval_state'],
    ),
  );
  const pagedDailyReports = $derived(operationalPage(filteredDailyReports, dailyPage));
  const pagedTechnicalReports = $derived(operationalPage(filteredTechnicalReports, technicalPage));
  const activeTabResultCount = $derived(
    activeTab === 'signoff'
      ? signoffRows.length
      : activeTab === 'technical'
        ? filteredTechnicalReports.length
        : filteredDailyReports.length,
  );
  const visibleResultCount = $derived(
    activeTabResultCount + (canGeneratePeriodReports ? generatedRows.length : 0),
  );
  const activeFilterItems = $derived(
    [
      search ? { label: translate('Search register'), value: search } : null,
      projectFilter
        ? {
            label: translate('Project'),
            value:
              availableProjects.find((project) => String(project.id) === projectFilter)?.name ??
              projectFilter,
          }
        : null,
      statusFilter
        ? { label: translate('Status'), value: reportFilterStatusLabel(statusFilter) }
        : null,
      workerFilter
        ? {
            label: translate('Worker'),
            value: workerOptions.find(([id]) => id === workerFilter)?.[1] ?? workerFilter,
          }
        : null,
      clientFilter ? { label: translate('Client'), value: clientFilter } : null,
      fromFilter ? { label: translate('From'), value: fromFilter } : null,
      toFilter ? { label: translate('To'), value: toFilter } : null,
      order !== 'newest' ? { label: translate('Sort by'), value: reportOrderLabel(order) } : null,
    ].filter((item): item is { label: string; value: string } => item !== null),
  );

  function rowText(row: Row, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  function reportTypeLabel(row: Row): string {
    return String(row.type ?? '').toLowerCase() === 'technical'
      ? translate('Technical / PLC')
      : translate('Daily');
  }

  function reportStatus(row: Row): string {
    const value = controlledValue('status', row.approval_state);
    return value || translate(String(row.approval_state ?? 'Draft'));
  }

  function signoffState(report: Row): SignoffState {
    switch (String(report.conformity_state ?? '').toLowerCase()) {
      case 'signed':
        return 'signed';
      case 'ready_for_signature':
        return 'ready_for_signature';
      case 'invalid':
      case 'superseded':
        return 'invalid';
      default:
        return 'needs_report';
    }
  }

  function signoffLabel(state: SignoffState): string {
    switch (state) {
      case 'ready_for_signature':
        return translate('Ready for signature');
      case 'signed':
        return translate('Signed');
      case 'invalid':
        return translate('Invalid / superseded');
      default:
        return translate('Needs report');
    }
  }

  function reportFilterStatusLabel(value: string): string {
    if (['needs_report', 'ready_for_signature', 'signed', 'invalid'].includes(value))
      return signoffLabel(value as SignoffState);
    if (value === 'attention') return translate('Needs attention');
    return (
      controlledValue('status', value) ||
      controlledValue('artifactState', value) ||
      translate(value)
    );
  }

  function reportOrderLabel(value: OperationalOrder): string {
    if (value === 'oldest') return translate('Oldest first');
    if (value === 'name') return translate('Name');
    if (value === 'status') return translate('Status');
    if (value === 'priority') return translate('Needs attention first');
    return translate('Newest first');
  }

  function signoffVariant(state: SignoffState): 'success' | 'warning' | 'danger' | 'info' {
    switch (state) {
      case 'signed':
        return 'success';
      case 'ready_for_signature':
        return 'info';
      case 'invalid':
        return 'danger';
      default:
        return 'warning';
    }
  }

  function signoffSymbol(state: SignoffState): string {
    switch (state) {
      case 'signed':
        return '✓';
      case 'ready_for_signature':
        return '!';
      case 'invalid':
        return '×';
      default:
        return '•';
    }
  }

  // A period row can exist before the renderer has produced a canonical,
  // immutable snapshot (for example, a freshly closed draft).  The detail
  // route intentionally rejects those rows instead of rendering unverified
  // data, so never expose a navigable link until the same binding required by
  // the detail/approval contract is present.
  function hasPeriodSnapshot(report: Row): boolean {
    const version = Number(report.snapshot_version);
    const hash = String(report.snapshot_sha256 ?? '').trim();
    return Number.isSafeInteger(version) && version > 0 && /^[a-f0-9]{64}$/u.test(hash);
  }

  function hasReadyPeriodPdf(report: Row): boolean {
    const state = String(report.state ?? '')
      .trim()
      .toLowerCase();
    const storageKey = String(report.pdf_storage_key ?? '').trim();
    const sha256 = String(report.pdf_sha256 ?? '').trim();
    const byteLength = Number(report.pdf_byte_length);
    return (
      ['review', 'approved', 'final'].includes(state) &&
      storageKey.length > 0 &&
      /^[a-f0-9]{64}$/u.test(sha256) &&
      Number.isSafeInteger(byteLength) &&
      byteLength > 0
    );
  }

  function setTab(tab: ReportTab): void {
    const signoffOnly = ['needs_report', 'ready_for_signature', 'signed', 'invalid'];
    const fieldOnly = ['attention', 'submitted', 'needs_changes'];
    if (
      (tab === 'signoff' && fieldOnly.includes(statusFilter)) ||
      (tab !== 'signoff' && signoffOnly.includes(statusFilter))
    )
      statusFilter = '';
    if (tab === 'signoff') workerFilter = '';
    tabOverride = { url: $page.url.href, tab };
    surface = null;
  }

  function clearReportFilters(): void {
    search = '';
    projectFilter = '';
    workerFilter = '';
    clientFilter = '';
    fromFilter = '';
    toFilter = '';
    statusFilter = '';
    order = 'newest';
    dailyPage = 1;
    technicalPage = 1;
    writeOperationalRegisterState(registerStateKey(), {
      search: '',
      order: 'newest',
      dailyPage: 1,
      technicalPage: 1,
    });
  }

  function handleTabKey(event: KeyboardEvent, current: ReportTab): void {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const currentIndex = tabs.findIndex((tab) => tab.id === current);
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex]?.id;
    if (!nextTab) return;
    setTab(nextTab);
    document.getElementById(`report-tab-${nextTab}`)?.focus();
  }

  function openCreate(type: 'daily' | 'technical'): void {
    surface = type;
  }

  function openGenerator(): void {
    if (canGeneratePeriodReports) surface = 'generate';
  }

  function closeSurface(): void {
    surface = null;
  }

  function clearTechnicalReportSelection(): void {
    selectedTechnicalReportIds = [];
  }

  function registerHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const view = overrides.view ?? activeTab;
    const project = overrides.project ?? projectFilter;
    const status = overrides.status ?? statusFilter;
    const worker = overrides.worker ?? workerFilter;
    const client = overrides.client ?? clientFilter;
    const from = overrides.from ?? fromFilter;
    const to = overrides.to ?? toFilter;
    const queryText = overrides.q ?? search;
    if (view) params.set('view', view);
    if (project) params.set('project', project);
    if (status) params.set('status', status);
    if (worker) params.set('worker', worker);
    if (client) params.set('client', client);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (queryText) params.set('q', queryText);
    return `${base}/app/reports?${params.toString()}`;
  }
</script>

<section class="report-page" data-report-page>
  {#if ['owner_admin', 'finance_admin', 'project_manager'].includes(String(data.user.role))}
    <p>
      <a class="secondary-button" href={`${base}/app/reports/review`}
        >{translate('Period review and customer follow-up')}</a
      >
    </p>
  {/if}
  <header class="report-page-context">
    <div>
      <p class="report-page-eyebrow">{translate('Operations / reports')}</p>
      <h2>{translate('Reports')}</h2>
      <p>
        {translate(
          'Capture field activity, technical changes and customer confirmation in one register.',
        )}
      </p>
    </div>
    <span class="report-page-count" aria-label={translate('Report count')}>{records.length}</span>
  </header>

  <aside class="report-audience-guidance" aria-label={reportGuidance.title}>
    <strong>{reportGuidance.title}</strong>
    <span>{reportGuidance.operational}</span>
    <small>{reportGuidance.audiences}</small>
  </aside>

  {#if !isAuditor}
    <div
      class="report-primary-action-wrap report-primary-action-top"
      aria-label={translate('Create report')}
    >
      <button
        type="button"
        class="report-primary-action"
        data-report-primary-cta
        onclick={() => openCreate('daily')}>{translate('New daily report')}</button
      >
      <button
        type="button"
        class="report-primary-action report-primary-action-secondary"
        onclick={() => openCreate('technical')}>{translate('New technical report')}</button
      >
    </div>
  {/if}

  <div class="report-attention" aria-label={translate('Report attention summary')}>
    <a
      class="report-attention-card"
      href={registerHref({ view: activeFieldTab, status: 'attention' })}
    >
      <span>{translate('Needs attention')}</span>
      <strong>{pendingReportCount}</strong>
      <small>{translate('Draft or returned field reports')}</small>
    </a>
    <a class="report-attention-card" href={registerHref({ view: 'signoff', status: '' })}>
      <span>{translate('Ready for signature')}</span>
      <strong>{readySignoffCount}</strong>
      <small>{translate('Customer confirmations awaiting signature')}</small>
    </a>
    <a class="report-attention-card" href={registerHref({ view: 'signoff', status: '' })}>
      <span>{translate('Customer sign-off')}</span>
      <strong>{signoffScopeRows.length}</strong>
      <small>{translate('Period confirmations in scope')}</small>
    </a>
  </div>

  <form
    class="report-register-filters"
    method="GET"
    action={`${base}/app/reports`}
    aria-label={translate('Filter reports')}
  >
    <input type="hidden" name="view" value={activeTab} />
    <label
      ><span>{translate('Search register')}</span><input
        name="q"
        bind:value={search}
        oninput={() => {
          dailyPage = 1;
          technicalPage = 1;
        }}
        type="search"
        placeholder={translate('Project, worker or report')}
      /></label
    >
    <label
      ><span>{translate('Project')}</span><select
        name="project"
        bind:value={projectFilter}
        onchange={() => {
          dailyPage = 1;
          technicalPage = 1;
        }}
        ><option value="">{translate('All projects')}</option
        >{#each availableProjects as project}<option value={String(project.id)}
            >{project.project_number} — {project.name}</option
          >{/each}</select
      ></label
    >
    <label
      ><span>{translate('Status')}</span><select
        name="status"
        bind:value={statusFilter}
        onchange={() => {
          dailyPage = 1;
          technicalPage = 1;
        }}
        ><option value="">{translate('All statuses')}</option>{#each statusOptions as item}<option
            value={item}>{reportFilterStatusLabel(item)}</option
          >{/each}</select
      ></label
    >
    <SectionCard
      title={translate('Filter reports')}
      collapsible
      expanded={Boolean(
        workerFilter || clientFilter || fromFilter || toFilter || order !== 'newest',
      )}
      class="register-filter-disclosure"
    >
      <div class="secondary-filter-fields report-register-filters-secondary">
        {#if activeTab !== 'signoff' && ['owner_admin', 'project_manager', 'finance_admin'].includes(String(data.user.role))}
          <label
            ><span>{translate('Worker')}</span><select
              name="worker"
              bind:value={workerFilter}
              onchange={() => {
                dailyPage = 1;
                technicalPage = 1;
              }}
              ><option value="">{translate('All workers')}</option
              >{#each workerOptions as [id, label]}<option value={id}>{label}</option
                >{/each}</select
            ></label
          >
        {/if}
        <label
          ><span>{translate('Client')}</span><select
            name="client"
            bind:value={clientFilter}
            onchange={() => {
              dailyPage = 1;
              technicalPage = 1;
            }}
            ><option value="">{translate('All clients')}</option
            >{#each clientOptions as client}<option value={client}>{client}</option>{/each}</select
          ></label
        >
        <label
          ><span>{translate('From')}</span><input
            name="from"
            type="date"
            bind:value={fromFilter}
            onchange={() => {
              dailyPage = 1;
              technicalPage = 1;
            }}
          /></label
        >
        <label
          ><span>{translate('To')}</span><input
            name="to"
            type="date"
            bind:value={toFilter}
            onchange={() => {
              dailyPage = 1;
              technicalPage = 1;
            }}
          /></label
        >

        <label>
          <span>{translate('Sort by')}</span>
          <select
            name="order"
            bind:value={order}
            onchange={() => {
              dailyPage = 1;
              technicalPage = 1;
            }}
          >
            <option value="newest">{translate('Newest first')}</option>
            <option value="oldest">{translate('Oldest first')}</option>
            <option value="name">{translate('Name')}</option>
            <option value="status">{translate('Status')}</option>
          </select>
        </label>
      </div>
    </SectionCard>
    <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
    <FilterSummary
      items={activeFilterItems}
      resultCount={visibleResultCount}
      clearHref={`${base}/app/reports?view=${activeTab}&q=`}
      onclear={clearReportFilters}
      {translate}
    />
  </form>

  <div class="report-tab-list" aria-label={translate('Report types')} role="tablist">
    {#each tabs as tab}
      <button
        id={`report-tab-${tab.id}`}
        type="button"
        role="tab"
        class:active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        aria-controls={`report-panel-${tab.id}`}
        tabindex={activeTab === tab.id ? 0 : -1}
        onclick={() => setTab(tab.id)}
        onkeydown={(event) => handleTabKey(event, tab.id)}
      >
        {translate(tab.label)}
      </button>
    {/each}
  </div>

  {#if activeTab === 'daily'}
    <div
      id="report-panel-daily"
      class="report-tab-panel"
      data-report-tab="daily"
      role="tabpanel"
      aria-labelledby="report-tab-daily"
      tabindex="0"
    >
      <header class="report-panel-header">
        <div>
          <p class="report-panel-kicker">{translate('Operational record')}</p>
          <h3>{translate('Daily')}</h3>
          <p>{translate('Shift summary, completed work, blockers and next-day plan.')}</p>
        </div>
        {#if !isAuditor}<button
            type="button"
            class="report-primary-action"
            onclick={() => openCreate('daily')}>{translate('New daily report')}</button
          >{/if}
      </header>

      <div class="report-register" aria-label={translate('Daily report register')}>
        {#each pagedDailyReports.rows as row}
          <article class="report-register-card">
            <a class="report-register-link" href={`${base}/app/reports/${String(row.id)}`}>
              <span class="report-register-type">{reportTypeLabel(row)}</span>
              <strong>{rowText(row, 'title') || translate('Daily field report')}</strong>
              <small
                >{rowText(row, 'date')} · {rowText(row, 'project_number')} · {reportStatus(
                  row,
                )}</small
              >
              <small>
                {translate('Work performed by')}: {rowText(row, 'author_name')} · {translate(
                  'Report created by',
                )}: {rowText(row, 'created_by_name') || rowText(row, 'author_name')}
                {#if rowText(row, 'reviewed_by_name')}
                  · {translate('Reviewed by')}: {rowText(row, 'reviewed_by_name')}
                {/if}
              </small>
              <span class="report-register-open">{translate('Open report →')}</span>
              {#if row.approval_state === 'needs_changes'}
                <span class="report-register-notice"
                  >{translate('Changes requested before resubmission')}</span
                >
              {/if}
            </a>
            {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}
              <form method="POST" action="?/submitReport" class="report-register-action">
                <input type="hidden" name="type" value={row.type} />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            {/if}
            {#if data.user.role === 'owner_admin'}
              <a href={`${base}/app/manage?type=daily_report#${String(row.id)}`}
                >{translate('Manage record')} →</a
              >
            {/if}
          </article>
        {:else}
          <div class="report-empty" role="status">
            {#if activeFilterItems.length}
              <strong>{translate('No matching records.')}</strong>
              <span>{translate('Clear filters to see more records.')}</span>
            {:else}
              <strong>{translate('No daily reports recorded.')}</strong>
              <span>{translate('Your field summaries will appear here after you save them.')}</span>
            {/if}
          </div>
        {/each}
      </div>
      {#if pagedDailyReports.totalPages > 1}<nav
          class="operational-pagination"
          aria-label={translate('Daily report pages')}
        >
          <button
            type="button"
            class="secondary-button"
            disabled={pagedDailyReports.current === 1}
            onclick={() => (dailyPage -= 1)}>{translate('Previous')}</button
          ><span
            >{translate('Page')}
            {pagedDailyReports.current}
            {translate('of')}
            {pagedDailyReports.totalPages}</span
          ><button
            type="button"
            class="secondary-button"
            disabled={pagedDailyReports.current === pagedDailyReports.totalPages}
            onclick={() => (dailyPage += 1)}>{translate('Next')}</button
          >
        </nav>{/if}
    </div>
  {:else if activeTab === 'technical'}
    <div
      id="report-panel-technical"
      class="report-tab-panel"
      data-report-tab="technical"
      role="tabpanel"
      aria-labelledby="report-tab-technical"
      tabindex="0"
    >
      <header class="report-panel-header">
        <div>
          <p class="report-panel-kicker">{translate('Engineering record')}</p>
          <h3>{translate('Technical / PLC')}</h3>
          <p>
            {translate(
              'Controls changes, validation performed, production impact and rollback detail.',
            )}
          </p>
        </div>
        {#if !isAuditor}<button
            type="button"
            class="report-primary-action report-primary-action-secondary"
            onclick={() => openCreate('technical')}>{translate('New technical report')}</button
          >{/if}
      </header>

      <div class="report-register" aria-label={translate('Technical report register')}>
        {#each pagedTechnicalReports.rows as row}
          <article class="report-register-card">
            <a class="report-register-link" href={`${base}/app/reports/${String(row.id)}`}>
              <span class="report-register-type report-register-type-technical"
                >{reportTypeLabel(row)}</span
              >
              <strong>{rowText(row, 'title') || translate('Technical report')}</strong>
              <small
                >{rowText(row, 'date')} · {rowText(row, 'project_number')} · {reportStatus(
                  row,
                )}</small
              >
              <small>
                {translate('Work performed by')}: {rowText(row, 'author_name')} · {translate(
                  'Report created by',
                )}: {rowText(row, 'created_by_name') || rowText(row, 'author_name')}
                {#if rowText(row, 'reviewed_by_name')}
                  · {translate('Reviewed by')}: {rowText(row, 'reviewed_by_name')}
                {/if}
              </small>
              <span class="report-register-open">{translate('Open report →')}</span>
              {#if row.approval_state === 'needs_changes'}
                <span class="report-register-notice"
                  >{translate('Changes requested before resubmission')}</span
                >
              {/if}
            </a>
            {#if row.approval_state === 'draft' || row.approval_state === 'needs_changes'}
              <form method="POST" action="?/submitReport" class="report-register-action">
                <input type="hidden" name="type" value={row.type} />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            {/if}
            {#if data.user.role === 'owner_admin'}
              <a href={`${base}/app/manage?type=technical_report#${String(row.id)}`}
                >{translate('Manage record')} →</a
              >
            {/if}
          </article>
        {:else}
          <div class="report-empty" role="status">
            {#if activeFilterItems.length}
              <strong>{translate('No matching records.')}</strong>
              <span>{translate('Clear filters to see more records.')}</span>
            {:else}
              <strong>{translate('No technical reports recorded.')}</strong>
              <span
                >{translate('PLC and controls records will appear here after you save them.')}</span
              >
            {/if}
          </div>
        {/each}
      </div>
      {#if pagedTechnicalReports.totalPages > 1}<nav
          class="operational-pagination"
          aria-label={translate('Technical report pages')}
        >
          <button
            type="button"
            class="secondary-button"
            disabled={pagedTechnicalReports.current === 1}
            onclick={() => (technicalPage -= 1)}>{translate('Previous')}</button
          ><span
            >{translate('Page')}
            {pagedTechnicalReports.current}
            {translate('of')}
            {pagedTechnicalReports.totalPages}</span
          ><button
            type="button"
            class="secondary-button"
            disabled={pagedTechnicalReports.current === pagedTechnicalReports.totalPages}
            onclick={() => (technicalPage += 1)}>{translate('Next')}</button
          >
        </nav>{/if}
    </div>
  {:else}
    <div
      id="report-panel-signoff"
      class="report-tab-panel report-signoff-panel"
      data-report-tab="signoff"
      role="tabpanel"
      aria-labelledby="report-tab-signoff"
      tabindex="0"
    >
      <header class="report-panel-header">
        <div>
          <p class="report-panel-kicker">{translate('Customer confirmation')}</p>
          <h3>{translate('Client Sign-off')}</h3>
          <p>{translate('Confirm approved hours and activities for the selected period.')}</p>
          <p class="report-action-explanation">
            {translate(
              'Open a ready record to review its exact version and record client sign-off. A signed record remains bound to that immutable report version; a source change requires a replacement report.',
            )}
          </p>
          <p class="report-action-explanation">
            {translate(
              'Workers submit Daily or Technical reports, the Project Manager or Owner reviews the operational facts, Finance or Owner generates the customer-safe period file, and an authorized Owner or Finance user records the customer signed copy.',
            )}
          </p>
        </div>
      </header>

      <div class="report-signoff-register" aria-label={translate('Client sign-off register')}>
        <RecordBrowser
          rows={signoffRows}
          bind:visible={signoffPage}
          {translate}
          label="Client sign-off register"
          contextKey="client-signoff"
          controlled
          resetKey={controlledBrowserResetKey}
          showEmpty={false}
        />
        {#each signoffPage as report}
          {@const state = signoffState(report)}
          <article class="report-signoff-card" data-conformity-state={state}>
            {#if hasPeriodSnapshot(report)}
              <a
                class="report-register-link"
                data-period-report-id={String(report.id)}
                href={`${base}/app/reports/period/${String(report.id)}`}
              >
                <span class="report-register-type">{translate('Client sign-off')}</span>
                <strong>{rowText(report, 'project_number') || translate('Project')}</strong>
                <small>{rowText(report, 'period_start')} → {rowText(report, 'period_end')}</small>
                <span class="report-signoff-status">
                  <span class="report-signoff-symbol" aria-hidden="true"
                    >{signoffSymbol(state)}</span
                  >
                  <StatusBadge variant={signoffVariant(state)} text={signoffLabel(state)} />
                </span>
                <span class="report-register-open">{translate('Open sign-off record →')}</span>
              </a>
            {:else}
              <div
                class="report-register-link report-register-link-disabled"
                data-period-report-id={String(report.id)}
                aria-disabled="true"
              >
                <span class="report-register-type">{translate('Client sign-off')}</span>
                <strong>{rowText(report, 'project_number') || translate('Project')}</strong>
                <small>{rowText(report, 'period_start')} → {rowText(report, 'period_end')}</small>
                <span class="report-signoff-status">
                  <span class="report-signoff-symbol" aria-hidden="true"
                    >{signoffSymbol(state)}</span
                  >
                  <StatusBadge variant={signoffVariant(state)} text={signoffLabel(state)} />
                </span>
                <span class="report-register-open">{translate('Report queued')}</span>
              </div>
              {#if canGeneratePeriodReports}
                <button type="button" class="secondary-button" onclick={openGenerator}
                  >{translate('Refresh period reports')}</button
                >
              {:else if !isAuditor}
                <a
                  class="secondary-button"
                  href={`${base}/app/reports?view=daily&project=${encodeURIComponent(rowText(report, 'project_id'))}`}
                  >{translate('Create source report')}</a
                >
              {/if}
            {/if}
          </article>
        {:else}
          <div class="report-empty" role="status">
            {#if activeFilterItems.length}
              <strong>{translate('No matching records.')}</strong>
              <span>{translate('Clear filters to see more records.')}</span>
            {:else}
              <strong>{translate('No client sign-off records yet.')}</strong>
              <span
                >{translate(
                  'Customer confirmation records will appear here when the period is ready.',
                )}</span
              >
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if canGeneratePeriodReports}
    <details class="report-generator">
      <summary>
        <span>
          <strong>{translate('Refresh period reports')}</strong>
          <small>{translate('Finance / Owner action · creates reviewed period files')}</small>
        </span>
      </summary>
      <div class="report-generator-copy">
        <p>
          {translate(
            'Refresh customer and internal period summaries from reviewed source records. This does not issue or send an invoice.',
          )}
        </p>
        <button
          type="button"
          class="secondary-button"
          data-report-generator-cta
          onclick={openGenerator}
        >
          {translate('Open period refresh')}
        </button>
      </div>
    </details>
  {/if}

  {#if canGeneratePeriodReports}
    <section
      class="report-period-register"
      aria-label={translate('Generated period report register')}
    >
      <header class="report-period-register-header">
        <div>
          <h3>{translate('Generated period files')}</h3>
          <p>
            {translate('Internal and customer period records available to authorized reviewers.')}
          </p>
          <p class="report-action-explanation">
            {translate(
              'Files appear here only after generation is ready. Open a period record to review its traceable status; PDF is available only when its stored artifact is verified.',
            )}
          </p>
        </div>
        <span>{generatedRows.length}</span>
      </header>
      <RecordBrowser
        rows={generatedRows}
        bind:visible={periodReportPage}
        {translate}
        label="Generated period report register"
        contextKey="generated-period-files"
        controlled
        resetKey={controlledBrowserResetKey}
        showEmpty={false}
      />
      {#each periodReportPage as report}
        <article class="report-period-card" data-period-state={rowText(report, 'state')}>
          {#if hasPeriodSnapshot(report)}
            <a
              class="report-register-link"
              data-period-report-id={String(report.id)}
              href={`${base}/app/reports/period/${String(report.id)}`}
            >
              <strong
                >{rowText(report, 'project_number')} · {translate(
                  String(report.report_type ?? 'Period summary'),
                )}</strong
              >
              <small
                >{rowText(report, 'period_start')} → {rowText(report, 'period_end')} · {controlledValue(
                  'artifactState',
                  report.state,
                ) || translate(String(report.state ?? 'Unknown'))}</small
              >
              <span class="report-register-open">{translate('Open period record →')}</span>
            </a>
          {:else}
            <div
              class="report-register-link report-register-link-disabled"
              data-period-report-id={String(report.id)}
              aria-disabled="true"
            >
              <strong
                >{rowText(report, 'project_number')} · {translate(
                  String(report.report_type ?? 'Period summary'),
                )}</strong
              >
              <small
                >{rowText(report, 'period_start')} → {rowText(report, 'period_end')} · {controlledValue(
                  'artifactState',
                  report.state,
                ) || translate(String(report.state ?? 'Unknown'))}</small
              >
              <span class="report-register-open">{translate('Report queued')}</span>
            </div>
          {/if}
          {#if hasReadyPeriodPdf(report)}
            <a
              class="report-period-pdf"
              href={`${base}/app/api/reports/${String(report.id)}/pdf`}
              target="_blank"
              rel="noreferrer">{translate('PDF')}</a
            >
          {/if}
        </article>
      {:else}
        <div class="report-empty" role="status">
          {#if activeFilterItems.length}
            <strong>{translate('No matching records.')}</strong>
            <span>{translate('Clear filters to see more records.')}</span>
          {:else}
            {translate('No generated period files yet.')}
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</section>

<ResponsiveSheet
  open={surface !== null}
  title={surface === 'technical'
    ? translate('New technical report')
    : surface === 'generate'
      ? translate('Refresh period reports')
      : translate('New daily report')}
  description={surface === 'generate'
    ? translate('Authorized Finance / Owner action for reviewed period records.')
    : translate('Operational report entry. Record what happened in the field.')}
  closeLabel={translate('Close report form')}
  class="report-entry-sheet"
  onclose={closeSurface}
>
  {#if surface === 'daily'}
    <form
      method="POST"
      action="?/createDailyReport"
      class="report-entry-form report-form"
      data-report-entry-surface="daily"
      onsubmit={(event) => saveOfflineDraft(event, 'daily_report')}
    >
      {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
        <label
          ><span>{translate('Worker')}</span><select name="workerId" required
            ><option value="">{translate('Select worker')}</option
            >{#each data.workers ?? [] as worker}<option value={String(worker.id)}
                >{worker.name} — {worker.email}</option
              >{/each}</select
          ></label
        >
      {/if}

      <div class="report-entry-intro">
        <strong>{translate('Capture the shift')}</strong>
        <span
          >{translate(
            'Keep this record operational: summary, completed work, blockers and next steps.',
          )}</span
        >
      </div>
      <label>
        <span>{translate('Project')}</span>
        <select name="projectId" required>
          <option value="">{translate('Select assignment')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Work date')}</span><input
            name="workDate"
            type="date"
            required
          /></label
        >
        <label
          ><span>{translate('Site / shift')}</span><input
            name="siteShift"
            placeholder={translate('Line 4 · first shift')}
          /></label
        >
      </div>
      <label
        ><span>{translate('Shift summary')}</span><textarea name="summary" required
        ></textarea></label
      >
      <label
        ><span>{translate('Tasks completed')}</span><textarea name="tasksCompleted" required
        ></textarea></label
      >
      <div class="report-entry-grid">
        <label
          ><span>{translate('Problems found')}</span><textarea name="problemsFound"
          ></textarea></label
        >
        <label
          ><span>{translate('Corrective actions')}</span><textarea name="correctiveActions"
          ></textarea></label
        >
      </div>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Downtime minutes')}</span><input
            name="downtimeMinutes"
            type="number"
            min="0"
            max="1440"
            value="0"
          /></label
        >
        <label><span>{translate('Standby reason')}</span><input name="standbyReason" /></label>
      </div>
      <label><span>{translate('Open items')}</span><textarea name="openItems"></textarea></label>
      <label
        ><span>{translate('Next-day plan')}</span><textarea name="nextDayPlan"></textarea></label
      >
      <label class="report-check"
        ><input name="safetyRelated" type="checkbox" />
        <span>{translate('Safety-related change')}</span></label
      >
      <div class="report-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Save daily report')}</button>
      </div>
    </form>
  {:else if surface === 'technical'}
    <form
      method="POST"
      action="?/createTechnicalReport"
      class="report-entry-form report-form"
      data-report-entry-surface="technical"
      onsubmit={(event) => saveOfflineDraft(event, 'technical_report')}
    >
      {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
        <label
          ><span>{translate('Worker')}</span><select name="workerId" required
            ><option value="">{translate('Select worker')}</option
            >{#each data.workers ?? [] as worker}<option value={String(worker.id)}
                >{worker.name} — {worker.email}</option
              >{/each}</select
          ></label
        >
      {/if}

      <div class="report-entry-intro">
        <strong>{translate('Document the technical change')}</strong>
        <span
          >{translate(
            'Describe the system, validation result, production impact and rollback detail.',
          )}</span
        >
      </div>
      <label>
        <span>{translate('Project')}</span>
        <select name="projectId" required>
          <option value="">{translate('Select assignment')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Work date')}</span><input
            name="reportDate"
            type="date"
            required
          /></label
        >
        <label
          ><span>{translate('System / machine')}</span><input
            name="systemName"
            placeholder={translate('Line 4 main conveyor')}
            required
          /></label
        >
        <label><span>{translate('Plant / site')}</span><input name="plantSite" /></label>
      </div>
      <div class="report-entry-grid report-entry-grid-three">
        <label><span>{translate('Area / line')}</span><input name="areaLine" /></label>
        <label><span>{translate('Station / machine')}</span><input name="stationMachine" /></label>
        <label><span>{translate('System type')}</span><input name="systemType" /></label>
      </div>
      <div class="report-entry-grid report-entry-grid-three">
        <label
          ><span>{translate('PLC platform')}</span><input
            name="plcPlatform"
            placeholder={translate('Rockwell Automation')}
          /></label
        >
        <label
          ><span>{translate('Controller')}</span><input
            name="controller"
            placeholder={translate('ControlLogix 5580')}
          /></label
        >
        <label><span>{translate('HMI / SCADA')}</span><input name="hmiScada" /></label>
      </div>
      <div class="report-entry-grid">
        <label><span>{translate('Network / protocol')}</span><input name="networkProtocol" /></label
        >
        <label><span>{translate('Software version')}</span><input name="softwareVersion" /></label>
      </div>
      <label
        ><span>{translate('Program / project reference')}</span><input
          name="programReference"
        /></label
      >
      <label
        ><span>{translate('Problem / symptom')}</span><textarea name="problemSymptom" required
        ></textarea></label
      >
      <label
        ><span>{translate('Diagnosis / root cause')}</span><textarea
          name="diagnosisRootCause"
          required
        ></textarea></label
      >
      <label
        ><span>{translate('Change performed')}</span><textarea name="changePerformed" required
        ></textarea></label
      >
      <label
        ><span>{translate('Production impact')}</span><textarea name="productionImpact"
        ></textarea></label
      >
      <div class="report-entry-grid">
        <label
          ><span>{translate('Validation performed')}</span><textarea name="validation"
          ></textarea></label
        >
        <label
          ><span>{translate('Validation result')}</span><textarea name="validationResult"
          ></textarea></label
        >
      </div>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Open risk / issue')}</span><textarea name="openRisk"></textarea></label
        >
        <label
          ><span>{translate('Rollback plan')}</span><textarea name="rollbackPlan"></textarea></label
        >
      </div>
      <label class="report-check report-check-warning">
        <input name="safetyRelated" type="checkbox" />
        <span
          >{translate(
            'Safety impact: technical lead review, validation and rollback detail required',
          )}</span
        >
      </label>
      <div class="report-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Save PLC report')}</button>
      </div>
    </form>
  {:else if surface === 'generate' && canGeneratePeriodReports}
    <form
      method="POST"
      action="?/generatePeriodReports"
      class="report-entry-form report-generator-form"
    >
      <div class="report-entry-intro">
        <strong>{translate('Refresh reviewed period records')}</strong>
        <span
          >{translate(
            'Generate customer and internal summaries from the canonical reviewed source records.',
          )}</span
        >
      </div>
      <label>
        <span>{translate('Project')}</span>
        <select
          name="projectId"
          bind:value={periodProjectId}
          onchange={clearTechnicalReportSelection}
          required
        >
          <option value="">{translate('Select project')}</option>
          {#each availableProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="report-entry-grid">
        <label
          ><span>{translate('Period start')}</span><input
            name="periodStart"
            bind:value={periodFrom}
            max={periodTo || undefined}
            oninput={clearTechnicalReportSelection}
            type="date"
            required
          /></label
        >
        <label
          ><span>{translate('Period end')}</span><input
            name="periodEnd"
            bind:value={periodTo}
            min={periodFrom || undefined}
            oninput={clearTechnicalReportSelection}
            type="date"
            required
          /></label
        >
      </div>
      <label>
        <span>{translate('Report language')}</span>
        <select name="reportLocale">
          <option value="en">{translate('English')}</option>
          <option value="es">{translate('Spanish')}</option>
          <option value="pt">{translate('Portuguese')}</option>
        </select>
      </label>
      <label>
        <span>{translate('Customer report content')}</span>
        <select
          name="contentMode"
          bind:value={periodContentMode}
          onchange={clearTechnicalReportSelection}
          required
        >
          <option value="hours_only">{translate('Hours only')}</option>
          <option value="hours_activity">{translate('Hours and activity summary')}</option>
          <option value="hours_activity_selected_technical"
            >{translate('Hours, activity and selected technical reports')}</option
          >
        </select>
        <small>
          {translate(
            'Technical / PLC details are excluded unless you explicitly select the technical-report option and the records below.',
          )}
        </small>
      </label>
      {#if periodContentMode === 'hours_activity_selected_technical'}
        <fieldset class="report-generator-technical">
          <legend>{translate('Technical reports to include')}</legend>
          {#each selectablePeriodTechnicalReports as report}
            <label class="report-generator-technical__option">
              <input
                name="technicalReportIds"
                type="checkbox"
                value={rowText(report, 'id')}
                bind:group={selectedTechnicalReportIds}
                data-approval-state={rowText(report, 'approval_state')}
                data-project-id={rowText(report, 'project_id')}
                data-report-date={rowText(report, 'date')}
              />
              <span>
                {rowText(report, 'date')} · {rowText(report, 'project_number')} · {rowText(
                  report,
                  'title',
                ) || rowText(report, 'author_name')}
              </span>
            </label>
          {:else}
            <p class="muted">
              {periodProjectId
                ? translate('No technical reports are available for the selected project.')
                : translate('Select a project to choose technical reports.')}
            </p>
          {/each}
        </fieldset>
      {/if}
      <div class="report-entry-actions">
        <button type="button" class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit">{translate('Refresh reports')}</button>
      </div>
    </form>
  {/if}
</ResponsiveSheet>

<style>
  .report-primary-action-top {
    justify-content: flex-start;
    gap: 0.65rem;
    flex-wrap: wrap;
  }
  .report-action-explanation {
    max-width: 65ch;
  }
  .report-audience-guidance {
    display: grid;
    gap: 0.3rem;
    padding: 0.8rem 0.9rem;
    border: 1px solid var(--ja-border, #e1e1de);
    border-left: 0.25rem solid var(--ja-teal, #706e66);
    border-radius: 0.55rem;
    background: var(--ja-surface-subtle, #f8f8f7);
  }
  .report-audience-guidance span,
  .report-audience-guidance small {
    max-width: 82ch;
  }
  .report-generator-technical {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0.85rem;
    border: 1px solid var(--ja-border, #e1e1de);
    border-radius: 0.65rem;
  }
  .report-generator-technical__option {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.6rem;
    align-items: start;
  }
  .report-primary-action-secondary {
    border-color: var(--ja-teal, #706e66);
    background: var(--ja-teal, #706e66);
  }
  .report-panel-header {
    align-items: flex-start;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .report-attention-card {
    color: inherit;
    text-decoration: none;
  }
  .report-attention-card:hover,
  .report-attention-card:focus-visible {
    border-color: var(--ja-teal, #706e66);
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 25%, transparent);
    outline-offset: 2px;
  }
  .report-register-filters {
    align-items: end;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .report-register-filters label {
    display: grid;
    flex: 1 1 12rem;
    gap: 0.35rem;
    font-size: 0.82rem;
    font-weight: 700;
  }
  .report-register-filters input,
  .report-register-filters select {
    box-sizing: border-box;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--ja-control-border, #adaca5);
    border-radius: 0.45rem;
    background: var(--ja-white, #fff);
    font: inherit;
  }
  .operational-pagination {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
    margin-top: 0.9rem;
  }
  .operational-pagination span {
    color: var(--ja-steel, #77756d);
    font-size: 0.85rem;
  }
  @media (max-width: 480px) {
    .report-panel-header {
      display: grid;
    }
    .report-register-filters label,
    .report-register-filters button {
      flex: 1 1 100%;
    }
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
