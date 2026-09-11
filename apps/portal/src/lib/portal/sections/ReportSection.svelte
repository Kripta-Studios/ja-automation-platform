<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ResponsiveSheet, StatusBadge } from '../ui';
  import RecordBrowser from '../ui/RecordBrowser.svelte';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
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
  let statusFilter = $state('');
  let order = $state<OperationalOrder>('newest');
  let dailyPage = $state(1);
  let technicalPage = $state(1);
  let signoffPage = $state<Row[]>([]);
  let periodReportPage = $state<Row[]>([]);
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
  const activeFieldTab = $derived(activeTab === 'technical' ? 'technical' : 'daily');
  const fieldReportsForActiveTab = $derived(
    activeFieldTab === 'technical' ? technicalReports : dailyReports,
  );
  const customerPeriodReports = $derived(
    periodReports.filter((report) => String(report.audience ?? '').toLowerCase() === 'customer'),
  );
  const signoffRows = $derived(
    customerPeriodReports
      .filter((report) => !projectFilter || rowText(report, 'project_id') === projectFilter)
      .map((report) => ({ ...report, browser_status: signoffState(report) })),
  );
  const generatedRows = $derived(
    periodReports
      .filter((report) => !projectFilter || rowText(report, 'project_id') === projectFilter)
      .map((report) => ({ ...report, browser_status: String(report.state ?? '') })),
  );
  const pendingReportCount = $derived(
    fieldReportsForActiveTab.filter((row) =>
      ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const readySignoffCount = $derived(
    signoffRows.filter((report) => signoffState(report) === 'ready_for_signature').length,
  );
  const canGeneratePeriodReports = $derived(
    !isAuditor && ['owner_admin', 'finance_admin'].includes(String(data.user.role ?? '')),
  );
  $effect(() => {
    projectFilter = $page.url.searchParams.get('project')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    dailyPage = 1;
    technicalPage = 1;
  });
  const filteredDailyReports = $derived.by(() =>
    operationalSort(
      dailyReports.filter(
        (row) =>
          (!projectFilter || rowText(row, 'project_id') === projectFilter) &&
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
    tabOverride = { url: $page.url.href, tab };
    surface = null;
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

  function registerHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const view = overrides.view ?? activeTab;
    const project = overrides.project ?? projectFilter;
    const status = overrides.status ?? statusFilter;
    if (view) params.set('view', view);
    if (project) params.set('project', project);
    if (status) params.set('status', status);
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
      <strong>{signoffRows.length}</strong>
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
        ><option value="">{translate('All statuses')}</option><option value="attention"
          >{translate('Needs attention')}</option
        ><option value="draft">{translate('Draft')}</option><option value="submitted"
          >{translate('Submitted')}</option
        ><option value="approved">{translate('Approved')}</option><option value="needs_changes"
          >{translate('Needs changes')}</option
        ></select
      ></label
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
    <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
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
            <strong>{translate('No daily reports recorded.')}</strong>
            <span>{translate('Your field summaries will appear here after you save them.')}</span>
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
            <strong>{translate('No technical reports recorded.')}</strong>
            <span
              >{translate('PLC and controls records will appear here after you save them.')}</span
            >
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
        </div>
      </header>

      <div class="report-signoff-register" aria-label={translate('Client sign-off register')}>
        <RecordBrowser
          rows={signoffRows}
          bind:visible={signoffPage}
          {translate}
          label="Client sign-off register"
          contextKey="client-signoff"
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
            {/if}
          </article>
        {:else}
          <div class="report-empty" role="status">
            <strong>{translate('No client sign-off records yet.')}</strong>
            <span
              >{translate(
                'Customer confirmation records will appear here when the period is ready.',
              )}</span
            >
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
      />
      {#each periodReportPage as report}
        <article class="report-period-card">
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
        <div class="report-empty" role="status">{translate('No generated period files yet.')}</div>
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
        <select name="projectId" required>
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
            type="date"
            required
          /></label
        >
        <label
          ><span>{translate('Period end')}</span><input
            name="periodEnd"
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
  .report-primary-action-secondary {
    border-color: var(--ja-teal, #277e78);
    background: var(--ja-teal, #277e78);
  }
  .report-attention-card {
    color: inherit;
    text-decoration: none;
  }
  .report-attention-card:hover,
  .report-attention-card:focus-visible {
    border-color: var(--ja-teal, #277e78);
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #277e78) 25%, transparent);
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
    border: 1px solid var(--ja-control-border, #9eabb7);
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
    color: var(--ja-steel, #637486);
    font-size: 0.85rem;
  }
  @media (max-width: 480px) {
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
