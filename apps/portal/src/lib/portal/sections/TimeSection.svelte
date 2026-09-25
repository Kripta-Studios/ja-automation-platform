<script lang="ts">
  import { SectionCard } from '../ui';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import { ResponsiveSheet } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import TimesheetPanel from './TimesheetPanel.svelte';
  import TimeIntervalFields from '../ui/TimeIntervalFields.svelte';
  import ProblemNotice from '../ui/ProblemNotice.svelte';
  import type { ProblemData } from '../../problem/contract';
  import FilterSummary from '../ui/FilterSummary.svelte';
  import DatePresets from '../ui/DatePresets.svelte';
  import { localToday } from '../ui/time-entry-clock';
  import { normalizePortalLocale } from '../../portal-i18n';
  import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
  import { createOperationalSubmit, operationalFieldValidation } from '../ui/operational-submit';
  import { reportFormFieldErrors } from '../ui/form-validation';
  import { canDeleteTimeDraft } from './time-entry-actions';
  import {
    decimalHoursToMinutes,
    formatDecimalHours,
    monthCalendarDates,
    nextIsoDate,
    weekDates,
  } from './time-entry-actions';
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

  const nativeTimeForm = $page.form as (ProblemData & { values?: Record<string, unknown> }) | null;
  const nativeTimeValues =
    nativeTimeForm?.code && nativeTimeForm.values && typeof nativeTimeForm.values === 'object'
      ? nativeTimeForm.values
      : {};
  const nativeTimeValue = (field: string): string =>
    typeof nativeTimeValues[field] === 'string' ? String(nativeTimeValues[field]) : '';
  const nativeTimeSurface: 'create' | 'edit' | null =
    nativeTimeForm?.code &&
    !nativeTimeValue('recordType') &&
    !nativeTimeValue('originalId') &&
    !nativeTimeValue('entries')
      ? nativeTimeValue('id') && nativeTimeValue('workDate')
        ? 'edit'
        : nativeTimeValue('workDate') ||
            nativeTimeForm.messageKey === 'action.validation.timeFields' ||
            (nativeTimeForm.messageKey === 'action.validation.expenseFields' &&
              nativeTimeValue('withExpense') === 'on')
          ? 'create'
          : null
      : null;
  let nativeRecoveryActive = $state(Boolean(nativeTimeSurface));
  const restoredTimeValue = (field: string): string =>
    nativeRecoveryActive ? nativeTimeValue(field) : '';

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

  let surface = $state<Surface | null>(nativeTimeSurface);
  let surfaceError = $state('');
  let surfaceProblem = $state<ProblemData | null>(nativeTimeSurface ? nativeTimeForm : null);
  let weekProblem = $state<ProblemData | null>(
    nativeTimeForm?.code && nativeTimeValue('weekStart') ? nativeTimeForm : null,
  );
  let batchProblem = $state<ProblemData | null>(
    nativeTimeForm?.code && nativeTimeValue('entries') && !nativeTimeValue('weekStart')
      ? nativeTimeForm
      : null,
  );
  let deleteProblem = $state<ProblemData | null>(null);
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
    setProblem: (value) => {
      surfaceProblem = value;
    },
    onSuccess: () => {
      if (surface === 'create' && createDate) {
        try {
          localStorage.setItem(
            `ja-time-next-day:${data.user.id}`,
            JSON.stringify({ date: nextIsoDate(createDate), workerId: selectedCreateWorker }),
          );
        } catch {
          // A private browser may disable storage; the saved record remains authoritative.
        }
      }
      closeSurface();
    },
    offlineHandled: () => data.offlineEnabled !== false,
  });
  let editTimeId = $state<string | null>(
    nativeTimeSurface === 'edit' ? nativeTimeValue('id') : null,
  );
  let createCategory = $state(nativeTimeValue('category') || 'regular');
  let createDate = $state(nativeTimeValue('workDate'));
  let createProject = $state(nativeTimeValue('projectId'));
  let createWorker = $state(nativeTimeValue('workerId'));
  let createExpenseEnabled = $state(nativeTimeValue('withExpense') === 'on');
  let createRequestId = $state(nativeTimeValue('requestId'));
  let batchWorker = $state('');
  let batchProject = $state('');
  let batchError = $state('');
  let batchSaving = $state(false);
  let weekSubmitWorker = $state(nativeTimeValue('workerId'));
  let weekSubmitError = $state('');
  let weekSubmitting = $state(false);
  let deleteError = $state('');
  let calendarWorker = $state('');
  let calendarMonth = $state('');
  let calendarDay = $state('');
  let dateDeepLinkConsumed = false;
  let editCategory = $state(nativeTimeValue('category') || 'regular');
  let search = $state('');
  let clientFilter = $state('');
  let statusFilter = $state('');
  let order = $state<OperationalOrder>('newest');
  let registerPage = $state(1);
  let registerStateHydrated = $state(false);
  const registerStateKey = (): string => `ja-operational-register:time:${data.user.id}`;

  onMount(() => {
    calendarMonth = localToday().slice(0, 7);
    calendarDay = localToday();
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
    if (!nativeRecoveryActive && !isAuditor && $page.url.searchParams.get('action') === 'log-time')
      openCreate();
    if (nativeTimeSurface && nativeTimeForm?.fieldErrors)
      void tick().then(() => {
        const form = document.querySelector<HTMLFormElement>('[data-time-entry-surface]');
        if (!form) return;
        const fields = Object.fromEntries(
          Object.entries(nativeTimeForm.fieldErrors).map(([field, errors]) => [
            field === 'minutes'
              ? form.querySelector('[name="durationHours"]')
                ? 'durationHours'
                : 'endTime'
              : field === 'breakMinutes'
                ? 'breakHours'
                : field,
            errors,
          ]),
        );
        reportFormFieldErrors(form, fields);
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

  const records = $derived(data.records ?? []);
  const calendarRecords = $derived(data.calendarRecords ?? records);
  const ownerMode = $derived(data.user.role === 'owner_admin');
  const batchDates = $derived(weekDates(data.weekStart ?? ''));
  const calendarDates = $derived(monthCalendarDates(calendarMonth));
  const calendarDayRecords = $derived(
    calendarRecords.filter(
      (row) =>
        String(row.work_date) === calendarDay &&
        String(row.worker_id) === calendarWorker &&
        !['rejected', 'void'].includes(String(row.approval_state)),
    ),
  );
  const batchProjects = $derived(
    availableProjects.filter((project) =>
      (data.timeAssignments ?? []).some(
        (assignment) =>
          String(assignment.project_id) === String(project.id) &&
          String(assignment.worker_id) === batchWorker &&
          batchDates.some(
            (date) =>
              String(assignment.starts_on ?? '') <= date &&
              (!assignment.ends_on || String(assignment.ends_on) >= date),
          ),
      ),
    ),
  );
  $effect(() => {
    if (batchProject && !batchProjects.some((project) => String(project.id) === batchProject))
      batchProject = '';
  });
  const weekWorkerId = $derived(ownerMode ? weekSubmitWorker : String(data.user.id));
  const weekDrafts = $derived(
    (data.weekDraftRecords ?? records)
      .filter(
        (row) =>
          String(row.worker_id) === weekWorkerId &&
          String(row.approval_state) === 'draft' &&
          String(row.work_date) >= String(data.weekStart ?? '') &&
          String(row.work_date) <= String(data.weekEnd ?? ''),
      )
      .map((row) => ({ id: String(row.id), version: Number(row.version) })),
  );
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
    if (nativeRecoveryActive) return;
    const id = $page.url.searchParams.get('edit');
    const row = records.find(
      (row) =>
        String(row.id) === id &&
        row.approval_state === 'draft' &&
        Number(row.correction_linked ?? 0) !== 1,
    );
    if (row) openEdit(row);
  });
  const editRow = $derived.by(
    () => records.find((row) => String(row.id) === editTimeId) as Row | undefined,
  );
  const totalActualMinutes = $derived(
    records
      .filter(
        (row) =>
          !row.active_correction_id && !['rejected', 'void'].includes(String(row.approval_state)),
      )
      .reduce((total, row) => total + Number(row.minutes ?? 0), 0),
  );
  const pendingCount = $derived(
    records.filter(
      (row) =>
        !row.active_correction_id &&
        ['draft', 'submitted', 'needs_changes'].includes(String(row.approval_state)),
    ).length,
  );
  const approvedCount = $derived(
    records.filter((row) => !row.active_correction_id && String(row.approval_state) === 'approved')
      .length,
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
    `${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}&q=#time-records`,
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
    return `${base}/app/time${query ? `?${query}` : ''}#time-records`;
  }

  const submitBatch: SubmitFunction = ({ formData, cancel }) => {
    batchProblem = null;
    const workerId = String(formData.get('workerId') ?? '');
    const projectId = String(formData.get('projectId') ?? '');
    const entries: Array<Record<string, string | number>> = [];
    for (const [index, date] of batchDates.entries()) {
      const enteredHours = String(formData.get(`hours_${index}`) ?? '').trim();
      if (!enteredHours) continue;
      const minutes = decimalHoursToMinutes(enteredHours);
      const summary = String(formData.get(`summary_${index}`) ?? '').trim();
      if (minutes === null || !summary || !workerId || !projectId) {
        batchError = translate(
          'Enter a worker, assigned project, valid decimal hours and activity for every filled day.',
        );
        cancel();
        return;
      }
      entries.push({
        projectId,
        workDate: date,
        category: String(formData.get(`category_${index}`) ?? 'regular'),
        minutes,
        summary,
      });
    }
    if (entries.length === 0) {
      batchError = translate('Enter hours and activity for at least one day.');
      cancel();
      return;
    }
    formData.set('entries', JSON.stringify(entries));
    batchError = '';
    batchSaving = true;
    return async ({ result, update }) => {
      try {
        await update({ reset: false });
        if (result.type === 'success') {
          try {
            localStorage.setItem(
              `ja-time-next-day:${data.user.id}`,
              JSON.stringify({
                date: nextIsoDate(String(entries.at(-1)?.workDate ?? '')),
                workerId,
              }),
            );
          } catch {
            // The batch is already saved even if browser storage is unavailable.
          }
        } else if (result.type === 'failure') {
          batchProblem = result.data?.code ? (result.data as ProblemData) : null;
          batchError = standaloneActionMessage(
            normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
            result.data,
          );
          await tick();
          document
            .querySelector<HTMLElement>('[data-time-batch-problem]')
            ?.focus({ preventScroll: true });
        } else if (result.type === 'error')
          batchError = translate('The daily entries could not be saved. Try again.');
      } finally {
        batchSaving = false;
      }
    };
  };

  const submitWeek: SubmitFunction = () => {
    weekProblem = null;
    weekSubmitError = '';
    weekSubmitting = true;
    return async ({ result, update }) => {
      try {
        await update({ reset: false });
        if (result.type === 'failure') {
          weekProblem = result.data?.code ? (result.data as ProblemData) : null;
          weekSubmitError = standaloneActionMessage(
            normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
            result.data,
          );
          await tick();
          document
            .querySelector<HTMLElement>('[data-time-week-problem]')
            ?.focus({ preventScroll: true });
        } else if (result.type === 'error')
          weekSubmitError = translate('The week could not be submitted. Refresh and try again.');
      } finally {
        weekSubmitting = false;
      }
    };
  };

  const deleteDraft: SubmitFunction = () => {
    const scrollTop = window.scrollY;
    deleteProblem = null;
    deleteError = '';
    return async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'failure') {
        deleteProblem = result.data?.code ? (result.data as ProblemData) : null;
        deleteError = standaloneActionMessage(
          normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale),
          result.data,
        );
        await tick();
        document
          .querySelector<HTMLElement>('[data-time-delete-problem]')
          ?.focus({ preventScroll: true });
      } else if (result.type === 'error')
        deleteError = translate('The draft could not be deleted. Refresh and try again.');
      await tick();
      window.scrollTo({ top: scrollTop, behavior: 'instant' });
    };
  };

  function openCreate(dateOverride?: string, workerOverride?: string): void {
    nativeRecoveryActive = false;
    surfaceError = '';
    surfaceProblem = null;
    const requestedDate = $page.url.searchParams.get('date')?.trim() ?? '';
    const useDeepLinkDate = !dateDeepLinkConsumed && /^\d{4}-\d{2}-\d{2}$/u.test(requestedDate);
    if (useDeepLinkDate) dateDeepLinkConsumed = true;
    let remembered: { date?: string; workerId?: string } = {};
    try {
      remembered = JSON.parse(localStorage.getItem(`ja-time-next-day:${data.user.id}`) ?? '{}');
    } catch {
      // Browser storage is optional.
    }
    createDate =
      dateOverride ??
      (useDeepLinkDate
        ? requestedDate
        : /^\d{4}-\d{2}-\d{2}$/u.test(remembered.date ?? '')
          ? remembered.date!
          : localToday());
    const filteredProjectId = String(data.timeFilter?.projectId ?? '');
    createWorker =
      workerOverride ??
      ((data.workers ?? []).some((worker) => String(worker.id) === remembered.workerId)
        ? remembered.workerId!
        : data.user.role === 'project_manager' &&
            (data.workers ?? []).some((worker) => String(worker.id) === String(data.user.id))
          ? String(data.user.id)
          : '');
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
    if (Number(row.correction_linked ?? 0) === 1) return;
    nativeRecoveryActive = false;
    surfaceError = '';
    surfaceProblem = null;
    surface = 'edit';
    editTimeId = String(row.id);
    editCategory = String(row.category ?? 'regular');
  }

  function closeSurface(): void {
    nativeRecoveryActive = false;
    surface = null;
    surfaceProblem = null;
    editTimeId = null;
    createCategory = 'regular';
    editCategory = 'regular';
    createExpenseEnabled = false;
  }

  function canDelete(row: Row): boolean {
    if (data.user.role === 'owner_admin') return canDeleteTimeDraft(row, data.user.id, true);
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
      <button
        type="button"
        class="time-primary-action"
        data-time-primary-cta
        onclick={() => openCreate()}
      >
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
    <a class="time-status-card" href={filterHref({ status: '' })}>
      <span>{translate('Actual recorded')}</span>
      <strong>{formatDecimalHours(totalActualMinutes)}</strong>
      <small>{translate('Hours you really recorded.')}</small>
    </a>
    <a class="time-status-card" href={filterHref({ status: 'attention' })}>
      <span>{translate('Needs attention')}</span>
      <strong>{pendingCount}</strong>
      <small>{translate('Draft or review state')}</small>
    </a>
    <a class="time-status-card" href={filterHref({ status: 'approved' })}>
      <span>{translate('Approved')}</span>
      <strong>{approvedCount}</strong>
      <small>{translate('Rows approved by the workflow')}</small>
    </a>
  </div>

  {#if data.timesheet}
    <TimesheetPanel {data} {isAuditor} {translate} {controlledValue} />
  {/if}

  {#if !isAuditor}
    <section class="time-week-submit" aria-labelledby="time-week-submit-title">
      <div>
        <h3 id="time-week-submit-title">{translate('Submit this week')}</h3>
        <p>
          {translate(
            'Submit all draft hours for one worker in the displayed week, together with meals added in Log time. Submitted records enter review.',
          )}
        </p>
      </div>
      <form method="POST" action="?/submitTimeWeek" use:enhance={submitWeek}>
        {#if ownerMode}
          <label>
            <span>{translate('Worker')}</span>
            <select name="workerId" required bind:value={weekSubmitWorker}>
              <option value="">{translate('Select worker')}</option>
              {#each data.workers ?? [] as worker}
                <option value={String(worker.id)}>{worker.name}</option>
              {/each}
            </select>
          </label>
        {:else}
          <input type="hidden" name="workerId" value={data.user.id} />
        {/if}
        <input type="hidden" name="weekStart" value={data.weekStart ?? ''} />
        <input type="hidden" name="entries" value={JSON.stringify(weekDrafts)} />
        <p>
          {weekDrafts.length}
          {translate('draft entries ready')} · {data.weekStart} → {data.weekEnd}
        </p>
        {#if weekProblem}
          <div tabindex="-1" data-time-week-problem>
            <ProblemNotice
              problem={weekProblem}
              remedyLinks={{
                review_week: {
                  label: translate('Review updated week'),
                  href: `${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}#time-records`,
                },
                contact_project_owner: {
                  label: translate('Contact the project owner to review access.'),
                },
              }}
            />
          </div>
        {:else if weekSubmitError}<p role="alert">{weekSubmitError}</p>{/if}
        <button type="submit" disabled={weekSubmitting || weekDrafts.length === 0}>
          {translate(weekSubmitting ? 'Submitting…' : 'Submit all week drafts')}
        </button>
      </form>
    </section>
  {/if}

  {#if ownerMode && !isAuditor}
    <section class="time-owner-calendar" aria-labelledby="time-calendar-title">
      {#if deleteProblem}
        <div tabindex="-1" data-time-delete-problem>
          <ProblemNotice
            problem={deleteProblem}
            remedyLinks={{
              review_time: {
                label: translate('Review updated time entry'),
                href: `${base}/app/time#time-records`,
              },
              contact_finance: { label: translate('Contact Finance for an audited adjustment.') },
            }}
          />
        </div>
      {:else if deleteError}<p role="alert">{deleteError}</p>{/if}
      <div class="time-owner-heading">
        <div>
          <h3 id="time-calendar-title">{translate('Time calendar')}</h3>
          <p>{translate('Choose a worker and a day to add time or manage editable drafts.')}</p>
        </div>
        <div class="time-calendar-controls">
          <label
            ><span>{translate('Worker')}</span>
            <select bind:value={calendarWorker}>
              <option value="">{translate('Select worker')}</option>
              {#each data.workers ?? [] as worker}
                <option value={String(worker.id)}>{worker.name}</option>
              {/each}
            </select>
          </label>
          <label
            ><span>{translate('Month')}</span><input
              type="month"
              bind:value={calendarMonth}
              onchange={(event) => (calendarDay = `${event.currentTarget.value}-01`)}
            /></label
          >
        </div>
      </div>
      <div class="time-calendar-grid" aria-label={translate('Time calendar')}>
        {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as weekday}
          <strong class="time-calendar-weekday">{translate(weekday)}</strong>
        {/each}
        {#each calendarDates as date}
          {@const dayRows = calendarRecords.filter(
            (row) =>
              String(row.worker_id) === calendarWorker &&
              String(row.work_date) === date &&
              !['rejected', 'void'].includes(String(row.approval_state)),
          )}
          <button
            type="button"
            class:time-calendar-outside={date.slice(0, 7) !== calendarMonth}
            class:time-calendar-selected={date === calendarDay}
            aria-pressed={date === calendarDay}
            aria-label={`${date}: ${dayRows.length} ${translate('time entries')}`}
            onclick={() => {
              calendarDay = date;
              calendarMonth = date.slice(0, 7);
            }}
          >
            <span>{Number(date.slice(-2))}</span>
            {#if dayRows.length}<small
                >{formatDecimalHours(
                  dayRows.reduce((sum, row) => sum + Number(row.minutes ?? 0), 0),
                )}</small
              >{/if}
          </button>
        {/each}
      </div>
      <div class="time-calendar-day">
        <div class="time-owner-heading">
          <h4>{calendarDay}</h4>
          <button
            type="button"
            disabled={!calendarWorker}
            onclick={() => openCreate(calendarDay, calendarWorker)}
          >
            {translate('Log time on this day')}
          </button>
        </div>
        {#if !calendarWorker}
          <p>{translate('Select a worker to review this day.')}</p>
        {:else if calendarDayRecords.length === 0}
          <p>{translate('No time recorded for this day.')}</p>
        {:else}
          <ul>
            {#each calendarDayRecords as row}
              <li>
                <span
                  ><strong>{row.project_number}</strong> · {formatDecimalHours(row.minutes)} · {controlledValue(
                    'status',
                    row.approval_state,
                  )}</span
                >
                <span class="time-calendar-row-actions">
                  {#if row.approval_state === 'draft' && Number(row.correction_linked ?? 0) !== 1}
                    <button type="button" class="secondary-button" onclick={() => openEdit(row)}
                      >{translate('Edit draft')}</button
                    >
                    {#if canDelete(row)}
                      <form
                        method="POST"
                        action="?/deleteDraft"
                        use:enhance={deleteDraft}
                        data-action="deleteDraft"
                        data-record-type="time_entry"
                        data-record-id={String(row.id)}
                      >
                        <input type="hidden" name="recordType" value="time_entry" />
                        <input type="hidden" name="recordId" value={row.id} />
                        <input type="hidden" name="version" value={row.version} />
                        <button type="submit" class="destructive-button"
                          >{translate('Delete draft')}</button
                        >
                      </form>
                    {/if}
                  {:else}
                    <a href={`${base}/app/time/${String(row.id)}`}>{translate('Open record')}</a>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    <details class="time-owner-batch">
      <summary>{translate('Enter a week in a table')}</summary>
      <div class="time-owner-batch-body">
        <p>
          {translate(
            'Add daily hours for one assigned worker and project. Blank days are skipped. The whole batch saves as drafts or nothing saves.',
          )}
        </p>
        <form method="POST" action="?/createTimeBatch" use:enhance={submitBatch}>
          <div class="time-batch-top-controls">
            <label
              ><span>{translate('Worker')}</span>
              <select name="workerId" required bind:value={batchWorker}>
                <option value="">{translate('Select worker')}</option>
                {#each data.workers ?? [] as worker}
                  <option value={String(worker.id)}>{worker.name}</option>
                {/each}
              </select>
            </label>
            <label
              ><span>{translate('Assigned project')}</span>
              <select name="projectId" required bind:value={batchProject}>
                <option value="">{translate('Select assignment')}</option>
                {#each batchProjects as project}
                  <option value={String(project.id)}
                    >{project.project_number} — {project.name}</option
                  >
                {/each}
              </select>
            </label>
          </div>
          <div class="time-batch-rows">
            {#each batchDates as date, index}
              <div class="time-batch-row">
                <strong>{date}</strong>
                <label
                  ><span>{translate('Hours')}</span><input
                    name={`hours_${index}`}
                    type="number"
                    min="0.01"
                    max="24"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="7.5"
                  /></label
                >
                <label
                  ><span>{translate('Category')}</span>
                  <select name={`category_${index}`}>
                    {#each filterCategories as category}<option value={category.value}
                        >{translate(category.label)}</option
                      >{/each}
                  </select>
                </label>
                <label
                  ><span>{translate('Activity summary')}</span><input
                    name={`summary_${index}`}
                    maxlength="5000"
                    placeholder={translate('Work completed')}
                  /></label
                >
              </div>
            {/each}
          </div>
          {#if batchProblem}
            <div tabindex="-1" data-time-batch-problem>
              <ProblemNotice
                problem={batchProblem}
                remedyLinks={{
                  review_time: {
                    label: translate('Review time entries'),
                    href: `${base}/app/time#time-records`,
                  },
                  contact_project_owner: {
                    label: translate('Contact the project owner to review access.'),
                  },
                  review_worker_assignment: {
                    label: translate('Review worker assignment'),
                    href: `${base}/app/time#time-records`,
                  },
                }}
              />
            </div>
          {:else if batchError}<p role="alert">{batchError}</p>{/if}
          <button type="submit" disabled={batchSaving}
            >{translate(batchSaving ? 'Saving…' : 'Save daily drafts')}</button
          >
        </form>
      </div>
    </details>
  {/if}

  <form
    id="time-filters"
    class="time-filters"
    method="GET"
    action={`${base}/app/time#time-filters`}
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
              {/if}{formatDecimalHours(row.minutes)} · {controlledValue(
                'status',
                row.approval_state,
              )}</small
            >
            <span class="time-record-summary">{row.activity_summary}</span>
            <span>{translate('Open record →')}</span>
          </a>
          {#if row.approval_state === 'draft' && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
            <div class="time-record-actions">
              {#if Number(row.correction_linked ?? 0) !== 1}
                <button type="button" class="secondary-button" onclick={() => openEdit(row)}>
                  {translate('Edit draft')}
                </button>
              {/if}
              <form method="POST" action="?/submitTime">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <button type="submit">{translate('Submit')}</button>
              </form>
            </div>
          {/if}
          {#if row.active_correction_id && row.approval_state === 'needs_changes'}
            <a
              class="secondary-button"
              href={`${base}/app/time/${String(row.active_correction_id)}`}
              >{translate('Open existing correction')} →</a
            >
          {:else if row.approval_state === 'needs_changes' && (String(row.worker_id) === data.user.id || data.user.role === 'owner_admin')}
            <a
              class="secondary-button"
              href={`${base}/app/time/${String(row.id)}#time-correction-title`}
              >{translate('Create corrected draft')} →</a
            >
          {/if}
          {#if canDelete(row)}
            <div class="time-record-actions time-destructive-actions">
              <form
                method="POST"
                action="?/deleteDraft"
                use:enhance={deleteDraft}
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
  {#if surfaceProblem}
    <div class="time-form-error" tabindex="-1" data-operational-form-error>
      <ProblemNotice
        problem={surfaceProblem}
        kind={surfaceProblem.code === 'UNEXPECTED_ERROR' ? 'service' : 'error'}
        remedyLinks={{
          review_time: {
            label: translate('Review updated time entry'),
            href: `${base}/app/time#time-records`,
          },
          review_week: {
            label: translate('Review updated week'),
            href: `${base}/app/time?week=${encodeURIComponent(data.weekStart ?? '')}#time-records`,
          },
          contact_project_owner: {
            label: translate('Contact the project owner to review access.'),
          },
          contact_finance: { label: translate('Contact Finance for an audited adjustment.') },
          review_worker_assignment: {
            label: translate('Review worker assignment'),
            href: `${base}/app/time#time-records`,
          },
        }}
      />
    </div>
  {:else if surfaceError}
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
          {#if createProject && !assignedCreateProjects.some((project) => String(project.id) === createProject)}
            <option value={createProject} disabled
              >{translate('Previously selected project is no longer available')}</option
            >
          {/if}
          {#each assignedCreateProjects as project}
            <option value={String(project.id)}>{project.project_number} — {project.name}</option>
          {/each}
        </select>
        {#if ['owner_admin', 'project_manager'].includes(String(data.user.role)) && !createWorker}
          <small>{translate('Select worker')}</small>
        {:else if assignedCreateProjects.length === 0}
          <small>
            {translate('No matching records.')}
            {#if data.user.role === 'owner_admin' && data.timeFilter?.projectId}
              <a
                href={`${base}/app/projects?action=assign-worker&project=${encodeURIComponent(data.timeFilter.projectId)}`}
                >{translate('Assign workers by expertise')} →</a
              >
            {/if}
          </small>
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
            value={restoredTimeValue('activityCode')}
            placeholder={translate('Operational detail')}
          />
        </label>
      {/if}
      <TimeIntervalFields
        {translate}
        initialStart={restoredTimeValue('startTime')}
        initialEnd={restoredTimeValue('endTime')}
        initialBreak={Number(restoredTimeValue('breakMinutes') || 0)}
        legacyMinutes={restoredTimeValue('minutes')
          ? Number(restoredTimeValue('minutes'))
          : undefined}
      />
      <label>
        <span>{translate('Activity summary')}</span>
        <textarea name="summary" minlength="3" maxlength="5000" required
          >{restoredTimeValue('summary')}</textarea
        >
      </label>
      <label class="time-expense-toggle">
        <input type="checkbox" name="withExpense" bind:checked={createExpenseEnabled} />
        <span>{translate('Add a meal expense with these hours')}</span>
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
          <input name="expenseVendor" maxlength="200" value={restoredTimeValue('expenseVendor')} />
        </label>
        <div class="expense-form-grid">
          <label>
            <span>{translate('Category')}</span>
            <select name="expenseCategory" required>
              <option value="meals">{translate('Meals')}</option>
            </select>
          </label>
          <label>
            <span>{translate('Time expense occurred (optional)')}</span>
            <input
              name="expenseOccurredTimeLocal"
              type="time"
              step="60"
              value={restoredTimeValue('expenseOccurredTimeLocal')}
            />
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
              value={restoredTimeValue('expenseAmount')}
            />
          </label>
          <label>
            <span>{translate('Currency')}</span>
            <select
              name="expenseCurrency"
              required
              value={restoredTimeValue('expenseCurrency') || 'USD'}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
            </select>
          </label>
        </div>
        <label>
          <span>{translate('Who paid')}</span>
          <select
            name="expenseWhoPaid"
            required
            value={restoredTimeValue('expenseWhoPaid') || 'worker'}
          >
            <option value="worker">{translate('Worker')}</option>
            <option value="company_card">{translate('Company card')}</option>
            <option value="company_direct">{translate('Company direct')}</option>
            <option value="client">{translate('Client paid directly')}</option>
            <option value="third_party">{translate('Third party')}</option>
          </select>
        </label>
        <label>
          <span>{translate('Description')}</span>
          <textarea name="expenseDescription" minlength="3" maxlength="5000" required
            >{restoredTimeValue('expenseDescription')}</textarea
          >
        </label>
        <label>
          <span>{translate('Payment method (optional)')}</span>
          <input
            name="expensePaymentMethod"
            maxlength="80"
            value={restoredTimeValue('expensePaymentMethod')}
          />
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
      <input type="hidden" name="version" value={restoredTimeValue('version') || editRow.version} />
      <input type="hidden" name="projectId" value={editRow.project_id} />
      <input
        type="hidden"
        name="workDate"
        value={restoredTimeValue('workDate') || editRow.work_date}
      />
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
            value={restoredTimeValue('activityCode') || String(editRow.activity_code ?? '')}
            placeholder={translate('Operational detail')}
          />
        </label>
      {/if}
      {#key editRow.id}
        <TimeIntervalFields
          {translate}
          initialStart={restoredTimeValue('startTime') || String(editRow.start_time ?? '')}
          initialEnd={restoredTimeValue('endTime') || String(editRow.end_time ?? '')}
          initialBreak={Number(restoredTimeValue('breakMinutes') || editRow.break_minutes || 0)}
          legacyMinutes={Number(restoredTimeValue('minutes') || editRow.minutes || 0)}
        />
      {/key}
      <label>
        <span>{translate('Activity summary')}</span>
        <textarea name="summary" minlength="3" maxlength="5000" required
          >{restoredTimeValue('summary') || editRow.activity_summary}</textarea
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
  #time-filters,
  #time-records {
    scroll-margin-top: 5rem;
  }
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
  .time-week-submit,
  .time-owner-calendar,
  .time-owner-batch {
    margin-top: 1.25rem;
    border: 1px solid var(--ja-control-border, #d7d8d2);
    border-radius: 0.9rem;
    background: white;
    padding: 1.25rem;
  }
  .time-week-submit,
  .time-owner-heading,
  .time-batch-top-controls,
  .time-calendar-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 1rem;
    justify-content: space-between;
  }
  .time-week-submit h3,
  .time-owner-calendar h3,
  .time-owner-calendar h4 {
    margin: 0;
  }
  .time-week-submit p,
  .time-owner-calendar p,
  .time-owner-batch p {
    margin: 0.35rem 0 0.75rem;
    color: var(--ja-steel, #77756d);
  }
  .time-week-submit form,
  .time-owner-batch form {
    display: grid;
    gap: 0.75rem;
  }
  .time-week-submit label,
  .time-calendar-controls label,
  .time-batch-top-controls label,
  .time-batch-row label {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .time-week-submit form button {
    justify-self: start;
  }
  .time-calendar-controls label {
    min-width: 10rem;
  }
  .time-calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.3rem;
    margin-top: 1rem;
  }
  .time-calendar-weekday {
    text-align: center;
    font-size: 0.8rem;
  }
  .time-calendar-grid button {
    min-height: 4rem;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 0.15rem;
    padding: 0.4rem;
    border: 1px solid var(--ja-control-border, #d7d8d2);
    border-radius: 0.45rem;
    background: white;
    color: inherit;
  }
  .time-calendar-grid button small {
    font-size: 0.72rem;
    color: var(--ja-steel, #77756d);
  }
  .time-calendar-grid button.time-calendar-outside {
    opacity: 0.45;
  }
  .time-calendar-grid button.time-calendar-selected {
    border: 2px solid var(--ja-accent, #2349b5);
    background: var(--ja-canvas, #f6f6f1);
  }
  .time-calendar-grid button:focus-visible {
    outline: 3px solid var(--ja-accent, #2349b5);
  }
  .time-calendar-day {
    margin-top: 1rem;
    border-top: 1px solid var(--ja-control-border, #d7d8d2);
    padding-top: 1rem;
  }
  .time-calendar-day ul {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: grid;
    gap: 0.5rem;
  }
  .time-calendar-day li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border: 1px solid var(--ja-control-border, #d7d8d2);
    border-radius: 0.5rem;
    padding: 0.65rem;
  }
  .time-calendar-row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .time-owner-batch > summary {
    cursor: pointer;
    font-weight: 700;
  }
  .time-owner-batch-body {
    margin-top: 1rem;
  }
  .time-batch-top-controls {
    justify-content: flex-start;
  }
  .time-batch-top-controls label {
    flex: 1 1 15rem;
  }
  .time-batch-rows {
    display: grid;
    gap: 0.5rem;
  }
  .time-batch-row {
    display: grid;
    grid-template-columns: 8rem minmax(5rem, 0.6fr) minmax(8rem, 1fr) minmax(12rem, 2fr);
    align-items: end;
    gap: 0.5rem;
    border-top: 1px solid var(--ja-control-border, #d7d8d2);
    padding-top: 0.5rem;
  }
  .time-batch-row > strong {
    align-self: center;
  }
  .time-batch-row input,
  .time-batch-row select,
  .time-calendar-controls input,
  .time-calendar-controls select {
    width: 100%;
    min-height: 2.75rem;
  }
  @media (max-width: 650px) {
    .time-week-submit,
    .time-owner-calendar,
    .time-owner-batch {
      padding: 0.8rem;
    }
    .time-calendar-grid button {
      min-height: 3.1rem;
      padding: 0.2rem;
    }
    .time-calendar-grid button small {
      font-size: 0.62rem;
    }
    .time-batch-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .time-batch-row > strong {
      grid-column: 1 / -1;
    }
    .time-batch-row label:last-child {
      grid-column: 1 / -1;
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
