<script lang="ts">
  import { SectionCard } from '../ui';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { ResponsiveSheet } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import TimesheetPanel from './TimesheetPanel.svelte';
  import TimeIntervalFields from '../ui/TimeIntervalFields.svelte';
  import FilterSummary from '../ui/FilterSummary.svelte';
  import DatePresets from '../ui/DatePresets.svelte';
  import { localToday } from '../ui/time-entry-clock';
  import { normalizePortalLocale } from '../../portal-i18n';
  import { createOperationalSubmit, operationalFieldValidation } from '../ui/operational-submit';
  import { canDeleteTimeDraft } from './time-entry-actions';
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

  type Surface = 'create' | 'edit';
  type CategoryOption = Readonly<{ value: string; label: string }>;

  const primaryCategories: readonly CategoryOption[] = [
    { value: 'regular', label: 'Work' },
    { value: 'overtime', label: 'Overtime' },
    { value: 'travel', label: 'Travel' },
    { value: 'standby', label: 'Standby' },
    { value: 'commissioning', label: 'Commissioning' },
  ];
  const moreCategories: readonly CategoryOption[] = [
    { value: 'weekend_holiday', label: 'Weekend / holiday' },
    { value: 'remote_support', label: 'Remote support' },
    { value: 'training', label: 'Training' },
    { value: 'internal', label: 'Internal' },
  ];
  const filterCategories = [...primaryCategories, ...moreCategories];

  let surface = $state<Surface | null>(null);
  let surfaceError = $state('');
  let saving = $state(false);
  const submitTime = createOperationalSubmit({
    locale: () => normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
    translate: (value) => translate(value),
    setSaving: (value) => {
      saving = value;
    },
    setError: (value) => {
      surfaceError = value;
    },
    onSuccess: closeSurface,
    offlineHandled: () => data.offlineEnabled !== false,
  });
  let editTimeId = $state<string | null>(null);
  let createCategory = $state('regular');
  let createDate = $state('');
  let createProject = $state('');
  let createWorker = $state('');
  let createExpenseEnabled = $state(false);
  let createRequestId = $state('');
  let editCategory = $state('regular');
  let search = $state('');
  let clientFilter = $state('');
  let statusFilter = $state('');
  let order = $state<OperationalOrder>('newest');
  let registerPage = $state(1);
  let registerStateHydrated = $state(false);
  const registerStateKey = (): string => `ja-operational-register:time:${data.user.id}`;

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
  });
  $effect(() => {
    if (registerStateHydrated)
      writeOperationalRegisterState(registerStateKey(), {
        search,
        order,
        page: registerPage,
      });
  });

  const records = $derived(data.records ?? []);
  const selectedCreateWorker = $derived(
    ['owner_admin', 'project_manager'].includes(String(data.user.role))
      ? createWorker
      : String(data.user.id),
  );
  const assignedCreateProjects = $derived(
    availableProjects.filter((project) =>
      (data.timeAssignments ?? []).some(
        (assignment) =>
          String(assignment.project_id) === String(project.id) &&
          String(assignment.worker_id) === selectedCreateWorker &&
          Boolean(createDate) &&
          String(assignment.starts_on ?? '') <= createDate &&
          (!assignment.ends_on || String(assignment.ends_on) >= createDate),
      ),
    ),
  );
  $effect(() => {
    if (
      surface === 'create' &&
      createProject &&
      !assignedCreateProjects.some((project) => String(project.id) === createProject)
    ) {
      createProject = '';
    }
  });
  const clientOptions = $derived(
    [...new Set(records.map((row) => String(row.client_name ?? '')).filter(Boolean))].sort(),
  );
  $effect(() => {
    const querySearch = $page.url.searchParams.get('q');
    if (querySearch !== null) search = querySearch.trim();
    clientFilter = $page.url.searchParams.get('client')?.trim() ?? '';
    statusFilter = $page.url.searchParams.get('status')?.trim() ?? '';
    registerPage = 1;
  });
  $effect(() => {
    const id = $page.url.searchParams.get('edit');
    const row = records.find((row) => String(row.id) === id && row.approval_state === 'draft');
    if (row) openEdit(row);
  });
  const editRow = $derived.by(
    () => records.find((row) => String(row.id) === editTimeId) as Row | undefined,
  );
  const totalActualMinutes = $derived(
    records.reduce((total, row) => total + Number(row.minutes ?? 0), 0),
  );
  const pendingCount = $derived(
    records.filter((row) =>
      ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const approvedCount = $derived(
    records.filter((row) => String(row.approval_state) === 'approved').length,
  );
  const activeCategory = $derived(surface === 'edit' ? editCategory : createCategory);
  const showOperationalDetail = $derived(
    activeCategory === 'travel' || activeCategory === 'standby',
  );
  const operationalDetailLabel = $derived(
    activeCategory === 'travel' ? 'Travel operational detail' : 'Standby reason',
  );
  const filteredRecords = $derived.by(() =>
    operationalSort(
      records.filter(
        (row) =>
          operationalStatusMatches(row.approval_state, statusFilter, [
            'draft',
            'submitted',
            'needs_changes',
          ]) &&
          (!clientFilter || String(row.client_name ?? '') === clientFilter) &&
          operationalMatches(row, search, [
            'project_number',
            'project_name',
            'client_name',
            'worker_name',
            'activity_summary',
            'category',
            'work_date',
          ]),
      ),
      order,
      ['work_date'],
      ['worker_name', 'project_name', 'activity_summary'],
      ['approval_state'],
    ),
  );
  const pagedRecords = $derived(operationalPage(filteredRecords, registerPage));
  const advancedFilters = $derived.by(() => {
    const workerId = String(data.timeFilter?.workerId ?? '');
    const category = String(data.timeFilter?.category ?? '');
    return [
      {
        removeHref: filterHref({ worker: '' }),
        label: translate('Worker'),
        value: workerId
          ? String(data.workers?.find((row) => String(row.id) === workerId)?.name ?? workerId)
          : '',
      },
      { removeHref: filterHref({ client: '' }), label: translate('Client'), value: clientFilter },
      {
        removeHref: filterHref({ from: '' }),
        label: translate('From'),
        value: String(data.timeFilter?.from ?? ''),
      },
      {
        removeHref: filterHref({ to: '' }),
        label: translate('To'),
        value: String(data.timeFilter?.to ?? ''),
      },
      {
        removeHref: filterHref({ category: '' }),
        label: translate('Category'),
        value: category
          ? translate(filterCategories.find((item) => item.value === category)?.label ?? category)
          : '',
      },
    ].filter((item) => item.value);
  });
  const activeFilters = $derived.by(() => {
    const projectId = String(data.timeFilter?.projectId ?? '');
    const project = availableProjects.find((row) => String(row.id) === projectId);
    return [
      { removeHref: filterHref({ q: '' }), label: translate('Search'), value: search.trim() },
      {
        removeHref: filterHref({ project: '' }),
        label: translate('Project'),
        value: projectId
          ? project
            ? `${project.project_number} — ${project.name}`
            : projectId
          : '',
      },
      {
        removeHref: filterHref({ status: '' }),
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
  const clearFiltersHref = $derived(
    `${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}&q=`,
  );

  function clearFilters(): void {
    search = '';
    clientFilter = '';
    statusFilter = '';
    order = 'newest';
    registerPage = 1;
    writeOperationalRegisterState(registerStateKey(), { search: '', order: 'newest', page: 1 });
  }

  function filterHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const project = overrides.project ?? String(data.timeFilter?.projectId ?? '');
    const category = overrides.category ?? String(data.timeFilter?.category ?? '');
    const status = overrides.status ?? statusFilter;
    const worker = overrides.worker ?? String(data.timeFilter?.workerId ?? '');
    const client = overrides.client ?? clientFilter;
    const from = overrides.from ?? String(data.timeFilter?.from ?? '');
    const to = overrides.to ?? String(data.timeFilter?.to ?? '');
    const queryText = overrides.q ?? search;
    const week = data.weekStart ?? '';
    if (week) params.set('week', week);
    if (project) params.set('project', project);
    if (category) params.set('category', category);
    if (status) params.set('status', status);
    if (worker) params.set('worker', worker);
    if (client) params.set('client', client);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('q', queryText);
    if ($page.url.searchParams.has('lang')) params.set('lang', $page.url.searchParams.get('lang')!);
    const query = params.toString();
    return `${base}/app/time${query ? `?${query}` : ''}`;
  }

  function openCreate(): void {
    surfaceError = '';
    createDate = localToday();
    const filteredProjectId = String(data.timeFilter?.projectId ?? '');
    createWorker =
      data.user.role === 'project_manager' &&
      (data.workers ?? []).some((worker) => String(worker.id) === String(data.user.id))
        ? String(data.user.id)
        : '';
    createProject = (data.timeAssignments ?? []).some(
      (assignment) =>
        String(assignment.project_id) === filteredProjectId &&
        String(assignment.worker_id) === (createWorker || String(data.user.id)) &&
        String(assignment.starts_on ?? '') <= createDate &&
        (!assignment.ends_on || String(assignment.ends_on) >= createDate),
    )
      ? filteredProjectId
      : '';
    surface = 'create';
    editTimeId = null;
    createCategory = 'regular';
    createExpenseEnabled = false;
    createRequestId = crypto.randomUUID();
  }

  function openEdit(row: Row): void {
    surfaceError = '';
    surface = 'edit';
    editTimeId = String(row.id);
    editCategory = String(row.category ?? 'regular');
  }

  function closeSurface(): void {
    surface = null;
    editTimeId = null;
    createCategory = 'regular';
    editCategory = 'regular';
    createExpenseEnabled = false;
  }

  function canDelete(row: Row): boolean {
    return canDeleteTimeDraft(row, data.user.id);
  }
</script>

<div class="time-page">
  <header class="time-page-context">
    <div>
      <p class="time-eyebrow">{translate('Worker operations')}</p>
      <h2>{translate('Time')}</h2>
      <p>
        {translate(
          'Record actual operational time. Commercial interpretation is applied from configured project rules.',
        )}
      </p>
    </div>
  </header>

  {#if !isAuditor}
    <div class="time-primary-action-wrap time-primary-action-top">
      <button type="button" class="time-primary-action" data-time-primary-cta onclick={openCreate}>
        {translate('Log time')}
      </button>
    </div>
    <p class="operational-action-copy">
      {translate(
        'Save a draft while details are still changing. Submit time only after the recorded date, duration and activity are accurate; submitted time is reviewed and cannot be silently overwritten.',
      )}
    </p>
  {/if}

  <div class="time-status-strip" aria-label={translate('Time attention summary')}>
    <a class="time-status-card" href={`${filterHref({ status: '' })}#time-records`}>
      <span>{translate('Actual recorded')}</span>
      <strong>{totalActualMinutes} {translate('min')}</strong>
      <small>{translate('Minutes you really recorded.')}</small>
    </a>
    <a class="time-status-card" href={`${filterHref({ status: 'attention' })}#time-records`}>
      <span>{translate('Needs attention')}</span>
      <strong>{pendingCount}</strong>
      <small>{translate('Draft or review state')}</small>
    </a>
    <a class="time-status-card" href={`${filterHref({ status: 'approved' })}#time-records`}>
      <span>{translate('Approved')}</span>
      <strong>{approvedCount}</strong>
      <small>{translate('Rows approved by the workflow')}</small>
    </a>
  </div>

  {#if data.timesheet}
    <TimesheetPanel {data} {isAuditor} {translate} {controlledValue} />
  {/if}

  <form
    class="time-filters"
    method="GET"
    action={`${base}/app/time`}
    aria-label={translate('Filter time entries')}
  >
    <input type="hidden" name="week" value={data.weekStart ?? ''} />
    <label>
      <span>{translate('Search register')}</span>
      <input
        name="q"
        bind:value={search}
        oninput={() => (registerPage = 1)}
        type="search"
        placeholder={translate('Project, activity or date')}
      />
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select name="project">
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option
            value={String(project.id)}
            selected={String(data.timeFilter?.projectId ?? '') === String(project.id)}
            >{project.project_number} — {project.name}</option
          >
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
      title={translate('Filter time entries')}
      description={advancedFilters.length
        ? `${translate('Active filters')}: ${advancedFilters.length}`
        : undefined}
      collapsible
      expanded={Boolean(
        data.timeFilter?.workerId ||
        data.timeFilter?.from ||
        data.timeFilter?.to ||
        data.timeFilter?.category ||
        clientFilter ||
        order !== 'newest',
      )}
      class="register-filter-disclosure"
    >
      <div class="secondary-filter-fields time-filters-secondary">
        {#if ['owner_admin', 'project_manager', 'finance_admin'].includes(String(data.user.role))}
          <label>
            <span>{translate('Worker')}</span>
            <select name="worker">
              <option value="">{translate('All workers')}</option>
              {#each data.workers ?? [] as worker}
                <option
                  value={String(worker.id)}
                  selected={String(data.timeFilter?.workerId ?? '') === String(worker.id)}
                  >{worker.name}</option
                >
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
        <label
          ><span>{translate('From')}</span><input
            name="from"
            type="date"
            value={data.timeFilter?.from ?? ''}
          /></label
        >
        <label
          ><span>{translate('To')}</span><input
            name="to"
            type="date"
            value={data.timeFilter?.to ?? ''}
          /></label
        >

        <label>
          <span>{translate('Sort by')}</span>
          <select name="order" bind:value={order} onchange={() => (registerPage = 1)}>
            <option value="newest">{translate('Newest first')}</option>
            <option value="oldest">{translate('Oldest first')}</option>
            <option value="name">{translate('Name')}</option>
            <option value="status">{translate('Status')}</option>
          </select>
        </label>
        <label>
          <span>{translate('Category')}</span>
          <select name="category">
            <option value="">{translate('All categories')}</option>
            {#each filterCategories as category}
              <option value={category.value} selected={data.timeFilter?.category === category.value}
                >{translate(category.label)}</option
              >
            {/each}
          </select>
        </label>
      </div>
    </SectionCard>
    <div class="time-filter-actions">
      <button type="submit" class="secondary-button">{translate('Apply filters')}</button>
    </div>
    <DatePresets
      from={String(data.timeFilter?.from ?? '')}
      to={String(data.timeFilter?.to ?? '')}
      href={(range) => filterHref(range)}
      {translate}
    />
    <FilterSummary
      items={activeFilters}
      resultCount={filteredRecords.length}
      clearHref={clearFiltersHref}
      onclear={clearFilters}
      {translate}
    />
  </form>

  <section id="time-records" class="time-record-list" aria-labelledby="time-records-title">
    <div class="time-list-heading">
      <div>
        <span class="time-eyebrow">{translate('ACTIVITY REGISTER')}</span>
        <h3 id="time-records-title">{translate('Recent time entries')}</h3>
      </div>
      <span class="time-record-count">{filteredRecords.length}</span>
    </div>
    <div class="time-records">
      {#each pagedRecords.rows as row}
        <article
          class:time-record-needs-changes={row.approval_state === 'needs_changes'}
          class="time-record"
        >
          <a class="time-record-link" href={`${base}/app/time/${String(row.id)}`}>
            <strong>{row.work_date} · {row.project_number}</strong>
            <small
              >{controlledValue('category', row.category)} · {#if row.start_time && row.end_time}{row.start_time}
                – {row.end_time} ·
              {/if}{row.minutes} min · {controlledValue('status', row.approval_state)}</small
            >
            <span class="time-record-summary">{row.activity_summary}</span>
            <span>{translate('Open record →')}</span>
          </a>
          {#if row.approval_state === 'draft' && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
            <div class="time-record-actions">
              <button type="button" class="secondary-button" onclick={() => openEdit(row)}>
                {translate('Edit draft')}
              </button>
              <form method="POST" action="?/submitTime">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            </div>
          {/if}
          {#if row.approval_state === 'needs_changes' && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
            <form class="time-record-actions" method="POST" action="?/createCorrectionDraft">
              <input type="hidden" name="recordType" value="time_entry" />
              <input type="hidden" name="originalId" value={row.id} />
              <input
                type="hidden"
                name="requestId"
                value={`time-returned-correction-${String(row.id)}`}
              />
              <label>
                <span>{translate('Correction reason')}</span>
                <input name="reason" minlength="3" required />
              </label>
              <button type="submit">{translate('Create corrected draft')}</button>
            </form>
          {/if}
          {#if canDelete(row)}
            <div class="time-record-actions time-destructive-actions">
              <form
                method="POST"
                action="?/deleteDraft"
                data-action="deleteDraft"
                data-record-type="time_entry"
                data-record-id={String(row.id)}
              >
                <input type="hidden" name="recordType" value="time_entry" />
                <input type="hidden" name="recordId" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit" class="destructive-button">{translate('Delete')}</button>
              </form>
            </div>
          {/if}
          {#if ['owner_admin', 'project_manager'].includes(String(data.user.role))}
            <a href={`${base}/app/manage?type=time_entry#${String(row.id)}`}
              >{translate('Manage record')} →</a
            >
          {/if}
        </article>
      {:else}
        <div class="time-empty" role="status">
          {#if activeFilters.length || records.length}
            <strong>{translate('No matching records.')}</strong>
            <span>{translate('Clear filters to see more records.')}</span>
          {:else}
            <strong>{translate('No time recorded.')}</strong>
            <span>{translate('Your actual time entries will appear here.')}</span>
          {/if}
        </div>
      {/each}
    </div>
    {#if pagedRecords.totalPages > 1}
      <nav class="operational-pagination" aria-label={translate('Time register pages')}>
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
  </section>
</div>

<ResponsiveSheet
  protectChanges
  open={surface !== null}
  title={surface === 'edit' ? translate('Edit time entry') : translate('Log time')}
  description={translate('Operational entry only. Commercial rules are applied separately.')}
  closeLabel={translate('Close time form')}
  class="time-entry-sheet"
  onclose={closeSurface}
>
  {#if surfaceError}
    <p role="alert" class="time-form-error" tabindex="-1" data-operational-form-error>
      {surfaceError}
    </p>
  {/if}
  {#if surface === 'create'}
    <form
      method="POST"
      action="?/createTime"
      class="expense-entry-form time-entry-form"
      aria-busy={saving}
      data-time-entry-surface
      use:operationalFieldValidation
      use:enhance={submitTime}
      onsubmit={(event) => {
        if (createExpenseEnabled && !navigator.onLine) {
          event.preventDefault();
          surfaceError = translate(
            'Reconnect to save time and expense together. Your entries are still here.',
          );
          return;
        }
        void saveOfflineDraft(event, 'time');
      }}
    >
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

      <div class="expense-entry-intro time-entry-intro">
        <strong>{translate('Capture actual work')}</strong>
        <span>{translate('Enter what happened on site, not its commercial interpretation.')}</span>
      </div>
      <label>
        <span>{translate('Assigned project')}</span>
        <select name="projectId" required bind:value={createProject}>
          <option value="">{translate('Select assignment')}</option>
          {#each assignedCreateProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
        {#if selectedCreateWorker && assignedCreateProjects.length === 0}
          <small>{translate('No matching records.')}</small>
        {/if}
      </label>
      <label>
        <span>{translate('Date')}</span>
        <input name="workDate" type="date" required bind:value={createDate} />
      </label>
      <label>
        <span>{translate('Operational category')}</span>
        <select name="category" bind:value={createCategory} required>
          {#each primaryCategories as category}
            <option value={category.value}>{translate(category.label)}</option>
          {/each}
          <optgroup label={translate('More')}>
            {#each moreCategories as category}
              <option value={category.value}>{translate(category.label)}</option>
            {/each}
          </optgroup>
        </select>
      </label>
      {#if showOperationalDetail}
        <label>
          <span>{translate(operationalDetailLabel)}</span>
          <input
            name="activityCode"
            maxlength="100"
            placeholder={translate('Operational detail')}
          />
        </label>
      {/if}
      <TimeIntervalFields {translate} />
      <label>
        <span>{translate('Activity summary')}</span>
        <textarea name="summary" minlength="3" maxlength="5000" required></textarea>
      </label>
      <label class="time-expense-toggle">
        <input type="checkbox" name="withExpense" bind:checked={createExpenseEnabled} />
        <span>{translate('Add an expense with these hours')}</span>
      </label>
      {#if createExpenseEnabled}
        <input type="hidden" name="requestId" value={createRequestId} />
        <div class="expense-entry-intro">
          <strong>{translate('Expense for this shift')}</strong>
          <span
            >{translate(
              'The expense will use the same worker, project and date. Add a receipt from the expense detail after saving if needed.',
            )}</span
          >
        </div>
        <label>
          <span>{translate('Vendor')}</span>
          <input name="expenseVendor" required maxlength="200" />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Category')}</span>
            <select name="expenseCategory" required>
              <option value="parking">{translate('Parking')}</option>
              <option value="fuel">{translate('Fuel')}</option>
              <option value="tolls">{translate('Tolls')}</option>
              <option value="meals">{translate('Meals')}</option>
              <option value="hotel">{translate('Hotel')}</option>
              <option value="rental_car">{translate('Rental car')}</option>
              <option value="airfare">{translate('Airfare')}</option>
              <option value="ground_transport">{translate('Ground transport')}</option>
              <option value="per_diem">{translate('Per diem')}</option>
              <option value="materials">{translate('Materials')}</option>
              <option value="tools">{translate('Tools')}</option>
              <option value="shipping">{translate('Shipping')}</option>
              <option value="phone_data">{translate('Phone/data')}</option>
              <option value="visa_permit">{translate('Visa/permit')}</option>
              <option value="other">{translate('Other')}</option>
            </select>
          </label>
          <label>
            <span>{translate('Time expense occurred (optional)')}</span>
            <input name="expenseOccurredTimeLocal" type="time" step="60" />
          </label>
        </div>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Amount')}</span>
            <input
              name="expenseAmount"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9][0-9]?)?"
              required
            />
          </label>
          <label>
            <span>{translate('Currency')}</span>
            <select name="expenseCurrency" required>
              <option value="">{translate('Select currency')}</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
            </select>
          </label>
        </div>
        <label>
          <span>{translate('Who paid')}</span>
          <select name="expenseWhoPaid" required>
            <option value="worker">{translate('Worker')}</option>
            <option value="company_card">{translate('Company card')}</option>
            <option value="company_direct">{translate('Company direct')}</option>
            <option value="client">{translate('Client paid directly')}</option>
            <option value="third_party">{translate('Third party')}</option>
          </select>
        </label>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="expenseDescription" minlength="3" maxlength="5000" required></textarea>
        </label>
        <label>
          <span>{translate('Payment method (optional)')}</span>
          <input name="expensePaymentMethod" maxlength="80" />
        </label>
      {/if}
      <div class="expense-entry-actions time-entry-actions">
        <button type="button" data-sheet-close class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit" disabled={saving}
          >{translate(saving ? 'Saving…' : 'Save draft')}</button
        >
      </div>
    </form>
  {:else if surface === 'edit' && editRow}
    <form
      method="POST"
      action="?/updateTime"
      class="expense-entry-form time-entry-form"
      aria-busy={saving}
      data-entity-id={String(editRow.id)}
      data-version={String(editRow.version)}
      data-time-entry-surface
      use:operationalFieldValidation
      use:enhance={submitTime}
      onsubmit={(event) => saveOfflineDraft(event, 'time')}
    >
      <input type="hidden" name="id" value={editRow.id} />
      <input type="hidden" name="version" value={editRow.version} />
      <input type="hidden" name="projectId" value={editRow.project_id} />
      <input type="hidden" name="workDate" value={editRow.work_date} />
      <div class="expense-entry-intro time-entry-intro">
        <strong>{translate('Update actual work')}</strong>
        <span>{translate('The project and date remain bound to the original entry.')}</span>
      </div>
      <label>
        <span>{translate('Operational category')}</span>
        <select name="category" bind:value={editCategory} required>
          {#each primaryCategories as category}
            <option value={category.value}>{translate(category.label)}</option>
          {/each}
          <optgroup label={translate('More')}>
            {#each moreCategories as category}
              <option value={category.value}>{translate(category.label)}</option>
            {/each}
          </optgroup>
        </select>
      </label>
      {#if showOperationalDetail}
        <label>
          <span>{translate(operationalDetailLabel)}</span>
          <input
            name="activityCode"
            maxlength="100"
            value={String(editRow.activity_code ?? '')}
            placeholder={translate('Operational detail')}
          />
        </label>
      {/if}
      {#key editRow.id}
        <TimeIntervalFields
          {translate}
          initialStart={String(editRow.start_time ?? '')}
          initialEnd={String(editRow.end_time ?? '')}
          initialBreak={Number(editRow.break_minutes ?? 0)}
          legacyMinutes={Number(editRow.minutes ?? 0)}
        />
      {/key}
      <label>
        <span>{translate('Activity summary')}</span>
        <textarea name="summary" minlength="3" maxlength="5000" required
          >{editRow.activity_summary}</textarea
        >
      </label>
      <div class="expense-entry-actions time-entry-actions">
        <button type="button" data-sheet-close class="secondary-button" onclick={closeSurface}
          >{translate('Cancel')}</button
        >
        <button type="submit" disabled={saving}
          >{translate(saving ? 'Saving…' : 'Save changes')}</button
        >
      </div>
    </form>
  {/if}
</ResponsiveSheet>

<style>
  .time-form-error {
    color: var(--ja-red-dark, #8f1d14);
    padding: 0.75rem 0;
  }
  .time-primary-action-top {
    justify-content: flex-start;
  }
  .operational-action-copy {
    color: var(--ja-steel, #77756d);
    margin: -0.4rem 0 0;
    max-width: 72ch;
    font-size: 0.86rem;
  }
  .time-status-card {
    color: inherit;
    text-decoration: none;
  }
  .time-status-card:hover,
  .time-status-card:focus-visible {
    border-color: var(--ja-teal, #706e66);
    outline: 3px solid color-mix(in srgb, var(--ja-teal, #706e66) 25%, transparent);
    outline-offset: 2px;
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
