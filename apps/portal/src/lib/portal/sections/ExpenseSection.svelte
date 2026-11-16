<script lang="ts">
  /*
   * Simplified expense screen (owner request 2026-11-16: "simple as possible").
   * One "Add expense" form, one list grouped by week, one "Submit for approval"
   * action per week. Commercial treatment (who pays, reimbursement, client
   * recovery) comes from project/assignment policy on the server; only
   * owner/finance may override the payer in the collapsed Advanced area.
   */
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import { onMount, tick } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { useAssistantSurfaceRequest } from '../assistant/surface-request.svelte';
  import { dirtyFormGuard } from '../dirty-form-guard';
  import { normalizePortalLocale } from '../../portal-i18n';
  import { localToday } from '../ui/time-entry-clock';
  import { createOperationalSubmit, operationalFieldValidation } from '../ui/operational-submit';
  import { ResponsiveSheet, StatusBadge } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { ProblemData } from '../../problem/contract';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';
  import { expenseCategories, primaryExpenseCategories } from '../expense-categories';
  import { expenseReceiptState, expenseSearchMatches } from '../expense-evidence';
  import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
  import { expenseCopy, expenseLocaleTag, type ExpenseCopyKey } from './expense-copy';

  let {
    data,
    isAuditor,
    availableProjects,
    saveOfflineDraft,
    translate,
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

  const locale = $derived(normalizePortalLocale($page.url.searchParams.get('lang') ?? data.locale));
  const tag = $derived(expenseLocaleTag[locale]);
  const c = (key: ExpenseCopyKey, params: Record<string, string | number> = {}): string =>
    expenseCopy(locale, key, params);

  const role = $derived(String(data.user.role));
  const me = $derived(String(data.user.id));
  const isOwner = $derived(role === 'owner_admin');
  const canOverridePayer = $derived(['owner_admin', 'finance_admin'].includes(role));
  const reviewerView = $derived(role !== 'worker');
  const canRecord = $derived(!isAuditor);
  const text = (row: Row | undefined, key: string): string => {
    const value = row?.[key];
    return value === null || value === undefined ? '' : String(value);
  };

  /* ---------------------------------------------------------------- data */
  const projects = $derived(availableProjects.filter((p) => text(p, 'status') !== 'archived'));
  const archivedProjectIds = $derived(
    new Set(
      availableProjects.filter((p) => text(p, 'status') === 'archived').map((p) => text(p, 'id')),
    ),
  );
  const records = $derived((data.records ?? []).filter((row) => row.approval_state !== 'void'));
  const people = $derived(
    [...(data.workers ?? [])]
      .map((w) => ({ id: text(w, 'id'), name: text(w, 'name') }))
      .filter((w) => w.id && w.name)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  /* ------------------------------------------------------------- filters */
  const params = $page.url.searchParams;
  let personFilter = $state(params.get('worker') ?? '');
  let projectFilter = $state(params.get('project') ?? '');
  let statusFilter = $state(params.get('status') ?? '');
  let search = $state(params.get('q') ?? '');
  let fromFilter = $state(params.get('from') ?? '');
  let toFilter = $state(params.get('to') ?? '');
  const filtersActive = $derived(
    Boolean(personFilter || projectFilter || statusFilter || search || fromFilter || toFilter),
  );
  function clearFilters(): void {
    personFilter = projectFilter = statusFilter = search = fromFilter = toFilter = '';
  }

  type Status =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'needs_changes'
    | 'rejected'
    | 'reimbursed'
    | 'withdrawn';
  function statusOf(row: Row): Status {
    const state = text(row, 'approval_state');
    if (
      ['approved', 'locked'].includes(state) &&
      (text(row, 'reimbursement_state') === 'reimbursed' || text(row, 'reimbursed_at'))
    )
      return 'reimbursed';
    if (state === 'locked') return 'approved';
    if (['draft', 'submitted', 'approved', 'needs_changes', 'rejected'].includes(state))
      return state as Status;
    return 'withdrawn';
  }
  const statusLabel: Record<Status, ExpenseCopyKey> = {
    draft: 'statusDraft',
    submitted: 'statusSubmitted',
    approved: 'statusApproved',
    needs_changes: 'statusNeedsChanges',
    rejected: 'statusRejected',
    reimbursed: 'statusReimbursed',
    withdrawn: 'statusWithdrawn',
  };
  const statusVariant: Record<Status, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    draft: 'neutral',
    submitted: 'info',
    approved: 'success',
    needs_changes: 'warning',
    rejected: 'danger',
    reimbursed: 'success',
    withdrawn: 'neutral',
  };

  const visible = $derived(
    records.filter((row) => {
      const spentOn = text(row, 'spent_on');
      return (
        (!personFilter || text(row, 'worker_id') === personFilter) &&
        (!projectFilter || text(row, 'project_id') === projectFilter) &&
        (!statusFilter || statusOf(row) === statusFilter) &&
        (!fromFilter || spentOn >= fromFilter) &&
        (!toFilter || spentOn <= toFilter) &&
        expenseSearchMatches(row, search)
      );
    }),
  );

  /* --------------------------------------------------------------- weeks */
  function mondayOf(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.valueOf())) return date;
    parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
    return parsed.toISOString().slice(0, 10);
  }
  function addDays(date: string, days: number): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
  }
  function weekRange(start: string): string {
    const format = new Intl.DateTimeFormat(tag, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const from = new Date(`${start}T00:00:00Z`);
    const to = new Date(`${addDays(start, 6)}T00:00:00Z`);
    return typeof format.formatRange === 'function'
      ? format.formatRange(from, to)
      : `${format.format(from)} – ${format.format(to)}`;
  }
  function dayLabel(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.valueOf())) return date;
    return new Intl.DateTimeFormat(tag, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(parsed);
  }
  /** Exact per-currency totals using bigint minor units (never floats). */
  function totals(rows: Row[]): string {
    const sums = new Map<string, bigint>();
    for (const row of rows) {
      // A returned original that has a correction is replaced by it; rejected
      // claims are not owed. Neither counts toward the week total.
      if (text(row, 'active_correction_id') || row.approval_state === 'rejected') continue;
      const minor = text(row, 'amount_minor');
      if (!/^-?\d+$/u.test(minor)) continue;
      const currency = text(row, 'currency') || 'USD';
      sums.set(currency, (sums.get(currency) ?? 0n) + BigInt(minor));
    }
    return (
      [...sums.entries()]
        .map(([currency, minor]) => money(minor.toString(), currency, tag))
        .join(' + ') || '—'
    );
  }

  type PersonBlock = { workerId: string; workerName: string; rows: Row[]; drafts: Row[] };
  type Week = { start: string; rows: Row[]; people: PersonBlock[] };
  const weeks = $derived.by((): Week[] => {
    const byWeek = new Map<string, Row[]>();
    for (const row of visible) {
      const start = mondayOf(text(row, 'spent_on'));
      byWeek.set(start, [...(byWeek.get(start) ?? []), row]);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([start, rows]) => {
        const byPerson = new Map<string, Row[]>();
        for (const row of rows) {
          const id = text(row, 'worker_id');
          byPerson.set(id, [...(byPerson.get(id) ?? []), row]);
        }
        const blocks = [...byPerson.entries()]
          .map(([workerId, personRows]) => ({
            workerId,
            workerName: text(personRows[0], 'worker_name'),
            rows: [...personRows].sort((a, b) =>
              text(b, 'spent_on').localeCompare(text(a, 'spent_on')),
            ),
            drafts: personRows.filter(
              (row) =>
                row.approval_state === 'draft' && !archivedProjectIds.has(text(row, 'project_id')),
            ),
          }))
          .sort((a, b) =>
            a.workerId === me
              ? -1
              : b.workerId === me
                ? 1
                : a.workerName.localeCompare(b.workerName),
          );
        return { start, rows, people: blocks };
      });
  });
  let weekLimit = $state(6);
  const shownWeeks = $derived(weeks.slice(0, weekLimit));
  const showPersonHeaders = $derived(
    reviewerView || records.some((row) => text(row, 'worker_id') !== me),
  );
  const canSubmitBlock = (block: PersonBlock): boolean =>
    !isAuditor && block.drafts.length > 0 && (block.workerId === me || isOwner);

  function canEdit(row: Row): boolean {
    return (
      !isAuditor &&
      row.approval_state === 'draft' &&
      !row.shared_receipt_allocated &&
      !row.linked_pair_time_id &&
      Number(row.correction_linked ?? 0) !== 1 &&
      (text(row, 'worker_id') === me || text(row, 'crew_recorded_by_user_id') === me || isOwner)
    );
  }
  function categoryLabel(value: string): string {
    const primary = primaryExpenseCategories.find((item) => item.value === value);
    if (primary) return c(primary.copy as ExpenseCopyKey);
    return translate(expenseCategories.find(([key]) => key === value)?.[1] ?? value);
  }
  const detailHref = (row: Row): string =>
    `${base}/app/expenses/${encodeURIComponent(text(row, 'id'))}`;

  /* ---------------------------------------------------------- the form */
  type Mode = 'create' | 'edit';
  let mode = $state<Mode | null>(null);
  let formKey = $state(0);
  let editing = $state<Row | null>(null);
  let fDate = $state('');
  let fProject = $state('');
  let fWorker = $state('');
  let fCategory = $state('meals');
  let moreCategories = $state(false);
  let fAmount = $state('');
  let fCurrency = $state('USD');
  let fNote = $state('');
  let fVendor = $state('');
  let fWhoPaid = $state('');
  let fPaymentMethod = $state('');
  let fTimeEntryId = $state('');
  let requestId = $state('');
  let allowSeparate = $state(false);
  let addAnother = $state(false);
  let savedAnother = $state(false);
  let saving = $state(false);
  let formError = $state('');
  let formProblem = $state<ProblemData | null>(null);
  let receiptInput = $state<HTMLInputElement>();
  let receiptUrl = $state<string | null>(null);
  let receiptName = $state('');
  let receiptIsImage = $state(false);
  let crewOptions = $state<Array<{ id: string; name: string }>>([]);

  const projectCurrency = (id: string): string =>
    text(
      projects.find((p) => text(p, 'id') === id),
      'currency',
    ) || 'USD';
  const lastProjectKey = (): string => `ja-expense-last-project:${me}`;
  function rememberedProject(): string {
    try {
      const saved = localStorage.getItem(lastProjectKey()) ?? '';
      return projects.some((p) => text(p, 'id') === saved) ? saved : '';
    } catch {
      return '';
    }
  }

  function clearReceipt(): void {
    if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    receiptUrl = null;
    receiptName = '';
    receiptIsImage = false;
    if (receiptInput) receiptInput.value = '';
  }
  function onReceiptChange(event: Event): void {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    receiptName = file?.name ?? '';
    receiptIsImage = Boolean(file?.type.startsWith('image/'));
    receiptUrl = file ? URL.createObjectURL(file) : null;
  }

  function openCreate(): void {
    if (!canRecord) return;
    const url = typeof window === 'undefined' ? $page.url : new URL(window.location.href);
    const requestedDate = url.searchParams.get('date') ?? '';
    const requestedProject = url.searchParams.get('project') ?? '';
    const requestedWorker = url.searchParams.get('worker') ?? '';
    fDate = /^\d{4}-\d{2}-\d{2}$/u.test(requestedDate) ? requestedDate : localToday();
    fProject = projects.some((p) => text(p, 'id') === requestedProject)
      ? requestedProject
      : projects.length === 1
        ? text(projects[0], 'id')
        : rememberedProject();
    fWorker = isOwner
      ? people.some((p) => p.id === requestedWorker)
        ? requestedWorker
        : personFilter
      : '';
    fCategory = 'meals';
    moreCategories = false;
    fAmount = '';
    fCurrency = projectCurrency(fProject);
    fNote = fVendor = fWhoPaid = fPaymentMethod = '';
    fTimeEntryId = url.searchParams.get('timeEntry') ?? '';
    requestId = crypto.randomUUID();
    allowSeparate = false;
    savedAnother = false;
    formError = '';
    formProblem = null;
    editing = null;
    clearReceipt();
    formKey += 1;
    mode = 'create';
  }
  function openEdit(row: Row): void {
    if (!canEdit(row)) return;
    editing = row;
    fDate = text(row, 'spent_on');
    fProject = text(row, 'project_id');
    fCategory = text(row, 'category') || 'other';
    moreCategories = !primaryExpenseCategories.some((item) => item.value === fCategory);
    const minor = text(row, 'amount_minor');
    fAmount = /^\d+$/u.test(minor)
      ? `${minor.padStart(3, '0').slice(0, -2)}.${minor.padStart(3, '0').slice(-2)}`
      : '';
    fCurrency = text(row, 'currency');
    // The server fills "<Category> expense" when no note was typed; show it as empty.
    const englishLabel = expenseCategories.find(([key]) => key === fCategory)?.[1] ?? '';
    fNote = text(row, 'description') === `${englishLabel} expense` ? '' : text(row, 'description');
    fVendor = text(row, 'vendor');
    fPaymentMethod = text(row, 'payment_method');
    formError = '';
    formProblem = null;
    clearReceipt();
    formKey += 1;
    mode = 'edit';
  }
  function closeForm(): void {
    mode = null;
    editing = null;
    clearReceipt();
  }
  function selectProject(id: string): void {
    fProject = id;
    fCurrency = projectCurrency(id);
  }

  // A crew chief may record for delegated workers on a project/day; show the
  // picker only when the server says such workers exist.
  $effect(() => {
    if (mode !== 'create' || role !== 'worker' || !fProject || !fDate) {
      crewOptions = [];
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ projectId: fProject, date: fDate });
    void fetch(`${base}/app/api/expenses/crew-workers?${query}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          workers?: Array<{ id: string; name: string }>;
        };
        if (!controller.signal.aborted)
          crewOptions = (payload.workers ?? []).filter((worker) => worker.id !== me);
      })
      .catch(() => {
        /* Lookup failures leave the expense recorded for the signed-in worker. */
      });
    return () => controller.abort();
  });

  const submitForm = createOperationalSubmit({
    locale: () => locale,
    translate: (value) => translate(value),
    setSaving: (value) => {
      saving = value;
    },
    setError: (value) => {
      formError = value;
    },
    setProblem: (value) => {
      formProblem = value;
    },
    onSuccess: () => {
      if (mode === 'create') {
        try {
          localStorage.setItem(lastProjectKey(), fProject);
        } catch {
          /* Remembering the project is only a convenience. */
        }
      }
      if (mode === 'create' && addAnother) {
        fAmount = '';
        fNote = '';
        fVendor = '';
        fTimeEntryId = '';
        requestId = crypto.randomUUID();
        allowSeparate = false;
        formError = '';
        formProblem = null;
        clearReceipt();
        savedAnother = true;
        formKey += 1;
        void tick().then(() =>
          document.querySelector<HTMLInputElement>('[data-expense-amount]')?.focus(),
        );
        return;
      }
      closeForm();
    },
    offlineHandled: () => mode === 'create' && data.offlineEnabled !== false,
  });
  async function handleOffline(event: SubmitEvent): Promise<void> {
    const result = await saveOfflineDraft(event, 'expense');
    if (result.saved) closeForm();
    else if (result.error) formError = translate(result.error);
  }
  const possibleDuplicate = $derived(formProblem?.code === 'EXPENSE_POSSIBLE_CREW_DUPLICATE');

  /* ------------------------------------------------------ week submit */
  let confirmBlock = $state<{ week: string; block: PersonBlock } | null>(null);
  let confirmError = $state('');
  let confirmBusy = $state(false);
  const submitWeek: SubmitFunction = () => {
    confirmBusy = true;
    confirmError = '';
    return async ({ result, update }) => {
      await update({ reset: false });
      confirmBusy = false;
      if (result.type === 'success') confirmBlock = null;
      else
        confirmError =
          (result.type === 'failure' &&
            standaloneActionMessage(locale, result.data as Record<string, unknown>)) ||
          translate('We could not confirm the save. Check the register before submitting again.');
    };
  };

  /* ----------------------------------------------------- entry points */
  useAssistantSurfaceRequest({
    url: () => $page.url,
    surfaces: ['expense-create'],
    activate: () => {
      if (mode !== 'create') openCreate();
    },
    deactivate: () => {
      if (mode === 'create') closeForm();
    },
  });
  onMount(() => {
    const url = $page.url.searchParams;
    const editId = url.get('edit');
    const editRow = editId ? records.find((row) => text(row, 'id') === editId) : undefined;
    if (editRow && canEdit(editRow)) openEdit(editRow);
    else if (/^record/u.test(url.get('action') ?? '') || url.get('timeEntry')) openCreate();
  });

  /* ------------------------------------------------------------ export */
  const exportHref = (format: 'csv' | 'xlsx' | 'pdf'): string | null => {
    const dates = visible.map((row) => text(row, 'spent_on')).sort();
    if (!dates.length) return null;
    const query = new URLSearchParams({ from: dates[0]!, to: dates.at(-1)!, format });
    if (projectFilter) query.set('project', projectFilter);
    if (personFilter) query.set('worker', personFilter);
    if (statusFilter && !['reimbursed', 'withdrawn'].includes(statusFilter))
      query.set('status', statusFilter);
    if (search) query.set('q', search);
    if ($page.url.searchParams.get('includeArchived') === '1') query.set('includeArchived', '1');
    return `${base}/app/expenses/export?${query}`;
  };
</script>

{#snippet categoryIcon(value: string)}
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {#if value === 'meals'}
      <path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M5 3v8a2 2 0 0 0 2 2M17 3c-2 2-2 6 0 8v10" />
    {:else if value === 'hotel'}
      <path d="M3 20V6M3 14h18v6M3 11h7V9a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5" />
    {:else if value === 'fuel'}
      <path
        d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l4 3v7a1.5 1.5 0 0 0 3 0V9l-3-3"
      />
    {:else if value === 'ground_transport'}
      <path d="M5 16V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v9M5 12h14M5 16h14v2H5zM7 18v2M17 18v2" />
    {:else if value === 'materials'}
      <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" />
    {:else}
      <path d="M12 3v18M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7" />
    {/if}
  </svg>
{/snippet}

<div class="xp">
  <header class="xp-head">
    <div>
      <h2>{reviewerView ? c('all') : c('mine')}</h2>
      <p>{reviewerView ? c('ownerIntro') : c('intro')}</p>
    </div>
    {#if canRecord && projects.length > 0}
      <button
        type="button"
        class="xp-add"
        data-expense-primary-cta
        data-assistant-target="expense-create-open"
        onclick={openCreate}
      >
        <span aria-hidden="true">+</span>
        {c('add')}
      </button>
    {/if}
  </header>

  {#if canRecord && projects.length === 0}
    <p class="xp-notice" role="status">{c('noProjects')}</p>
  {/if}

  {#if reviewerView}
    <details class="xp-filters" open={filtersActive}>
      <summary>
        {c('filters')}{#if filtersActive}<span class="xp-dot" aria-hidden="true"></span>{/if}
      </summary>
      <div class="xp-filter-grid">
        <label>
          <span>{c('person')}</span>
          <select bind:value={personFilter}>
            <option value="">{c('allPeople')}</option>
            {#each people as person (person.id)}
              <option value={person.id}>{person.name}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{c('project')}</span>
          <select bind:value={projectFilter}>
            <option value="">{c('allProjects')}</option>
            {#each availableProjects as project (text(project, 'id'))}
              <option value={text(project, 'id')}
                >{text(project, 'project_number')} · {text(project, 'name')}</option
              >
            {/each}
          </select>
        </label>
        <label>
          <span>{translate('Status')}</span>
          <select bind:value={statusFilter}>
            <option value="">{c('allStatuses')}</option>
            {#each ['draft', 'submitted', 'needs_changes', 'approved', 'reimbursed', 'rejected'] as const as status (status)}
              <option value={status}>{c(statusLabel[status])}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{c('search')}</span>
          <input type="search" bind:value={search} autocomplete="off" />
        </label>
      </div>
      <div class="xp-filter-actions">
        {#if filtersActive}
          <button type="button" class="secondary-button" onclick={clearFilters}>{c('clear')}</button
          >
        {/if}
        {#if exportHref('csv')}
          <span class="xp-muted">{c('download')}:</span>
          <a href={exportHref('csv')} download>CSV</a>
          <a href={exportHref('xlsx')} download>Excel</a>
          <a href={exportHref('pdf')} download>PDF</a>
        {/if}
      </div>
    </details>
  {/if}

  {#if shownWeeks.length === 0}
    <div class="xp-empty" role="status">
      <p>{filtersActive ? c('emptyFiltered') : c('empty')}</p>
      {#if filtersActive}
        <button type="button" class="secondary-button" onclick={clearFilters}>{c('clear')}</button>
      {/if}
    </div>
  {/if}

  {#each shownWeeks as week (week.start)}
    <section class="xp-week" aria-labelledby={`xp-week-${week.start}`}>
      <header class="xp-week-head">
        <h3 id={`xp-week-${week.start}`}>{c('week', { range: weekRange(week.start) })}</h3>
        <strong class="xp-total">{totals(week.rows)}</strong>
      </header>
      {#each week.people as block (block.workerId)}
        <div class="xp-person">
          {#if showPersonHeaders}
            <p class="xp-person-name">
              {block.workerId === me ? c('me') : block.workerName}
              {#if week.people.length > 1}<span class="xp-muted">· {totals(block.rows)}</span>{/if}
            </p>
          {/if}
          <ul class="xp-rows">
            {#each block.rows as row (text(row, 'id'))}
              {@const status = statusOf(row)}
              <li class="xp-row" data-status={status}>
                <span class="xp-icon">{@render categoryIcon(text(row, 'category'))}</span>
                <div class="xp-row-main">
                  <p class="xp-row-title">
                    <a class="xp-open" href={detailHref(row)}
                      >{categoryLabel(text(row, 'category'))}</a
                    >
                    {#if text(row, 'vendor')}<span class="xp-muted">· {text(row, 'vendor')}</span
                      >{/if}
                  </p>
                  <p class="xp-row-meta">
                    {dayLabel(text(row, 'spent_on'))} · {text(row, 'project_number')}
                    {#if row.approval_state === 'draft' && expenseReceiptState(row) !== 'attached'}
                      · <span class="xp-warn">{c('noReceipt')}</span>
                    {/if}
                  </p>
                </div>
                <div class="xp-row-side">
                  <strong class="xp-amount"
                    >{money(text(row, 'amount_minor'), text(row, 'currency') || 'USD', tag)}</strong
                  >
                  <StatusBadge variant={statusVariant[status]} text={c(statusLabel[status])} />
                </div>
                {#if (status === 'needs_changes' || status === 'rejected') && text(row, 'review_note')}
                  <p class="xp-note">
                    <strong>{c('reviewerNote')}:</strong>
                    {text(row, 'review_note')}
                  </p>
                {/if}
                <div class="xp-row-actions">
                  {#if canEdit(row)}
                    <button type="button" class="secondary-button" onclick={() => openEdit(row)}
                      >{c('edit')}</button
                    >
                  {:else if row.approval_state === 'draft' && row.linked_pair_time_id}
                    <span class="xp-muted">{c('withTime')}</span>
                  {:else if row.approval_state === 'needs_changes' && (text(row, 'worker_id') === me || isOwner)}
                    {#if row.active_correction_id}
                      <a
                        class="secondary-button"
                        href={`${base}/app/expenses/${encodeURIComponent(text(row, 'active_correction_id'))}`}
                        >{c('openCorrection')}</a
                      >
                    {:else}
                      <a class="xp-fix" href={`${detailHref(row)}#expense-correction-title`}
                        >{c('fix')}</a
                      >
                    {/if}
                  {/if}
                  {#if row.approval_state === 'draft' && !isAuditor && text(row, 'worker_id') !== me && !isOwner && !row.linked_pair_time_id}
                    <form method="POST" action="?/submitExpense" use:enhance>
                      <input type="hidden" name="id" value={text(row, 'id')} />
                      <input type="hidden" name="version" value={text(row, 'version')} />
                      <button type="submit">{c('submit')}</button>
                    </form>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
          {#if canSubmitBlock(block)}
            <div class="xp-submit-bar">
              <span>{c('drafts', { n: block.drafts.length })} · {totals(block.drafts)}</span>
              <button
                type="button"
                data-expense-submit-week
                onclick={() => {
                  confirmError = '';
                  confirmBlock = { week: week.start, block };
                }}>{c('submitWeek')}</button
              >
            </div>
          {/if}
        </div>
      {/each}
    </section>
  {/each}

  {#if weeks.length > shownWeeks.length}
    <button type="button" class="secondary-button xp-older" onclick={() => (weekLimit += 6)}
      >{c('showOlder')}</button
    >
  {/if}
</div>

<ResponsiveSheet
  open={mode !== null}
  title={mode === 'edit' ? c('editTitle') : c('add')}
  closeLabel={c('cancel')}
  protectChanges
  class="expense-entry-sheet"
  onclose={closeForm}
>
  {#key formKey}
    <form
      method="POST"
      action={mode === 'edit' ? '?/updateExpense' : '?/createExpense'}
      enctype="multipart/form-data"
      class="xp-form"
      data-expense-entry-surface
      data-assistant-target="expense-create"
      aria-busy={saving}
      use:dirtyFormGuard
      use:operationalFieldValidation
      use:enhance={submitForm}
      onsubmit={(event) => {
        if (mode === 'create') void handleOffline(event);
      }}
    >
      {#if formError}
        <p class="xp-error" role="alert" tabindex="-1" data-operational-form-error>{formError}</p>
      {/if}
      {#if savedAnother && !formError}
        <p class="xp-ok" role="status">{c('savedAnother')}</p>
      {/if}

      {#if mode === 'edit' && editing}
        <input type="hidden" name="id" value={text(editing, 'id')} />
        <input type="hidden" name="version" value={text(editing, 'version')} />
        <p class="xp-fixed">
          <span>{c('project')}</span>
          <strong>{text(editing, 'project_number')} · {text(editing, 'project_name')}</strong>
        </p>
      {:else}
        <input type="hidden" name="requestId" value={requestId} />
        {#if fTimeEntryId}
          <input type="hidden" name="timeEntryId" value={fTimeEntryId} />
          <p class="xp-muted">{c('linkedTime')}</p>
        {/if}
        {#if isOwner}
          <label class="xp-field">
            <span>{c('person')}</span>
            <select name="workerId" bind:value={fWorker}>
              <option value="">{c('me')} ({data.user.name})</option>
              {#each people as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
        {:else if crewOptions.length > 0}
          <label class="xp-field">
            <span>{c('person')}</span>
            <select name="workerId" bind:value={fWorker}>
              <option value={me}>{c('me')}</option>
              {#each crewOptions as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if projects.length === 1}
          <input type="hidden" name="projectId" value={fProject} />
          <p class="xp-fixed">
            <span>{c('project')}</span>
            <strong>{text(projects[0], 'project_number')} · {text(projects[0], 'name')}</strong>
          </p>
        {:else}
          <label class="xp-field">
            <span>{c('project')}</span>
            <select
              name="projectId"
              required
              value={fProject}
              onchange={(event) => selectProject(event.currentTarget.value)}
            >
              <option value="" disabled>{c('chooseProject')}</option>
              {#each projects as project (text(project, 'id'))}
                <option value={text(project, 'id')}
                  >{text(project, 'project_number')} · {text(project, 'name')}</option
                >
              {/each}
            </select>
          </label>
        {/if}
      {/if}

      <label class="xp-field">
        <span>{c('date')}</span>
        <input type="date" name="spentOn" required bind:value={fDate} />
      </label>

      <fieldset class="xp-field">
        <legend>{c('category')}</legend>
        <input type="hidden" name="category" value={fCategory} />
        <div class="xp-chips">
          {#each primaryExpenseCategories as item (item.value)}
            <button
              type="button"
              class="xp-chip"
              aria-pressed={!moreCategories && fCategory === item.value}
              onclick={() => {
                moreCategories = false;
                fCategory = item.value;
              }}
            >
              {@render categoryIcon(item.value)}
              <span>{c(item.copy as ExpenseCopyKey)}</span>
            </button>
          {/each}
          <button
            type="button"
            class="xp-chip"
            aria-pressed={moreCategories}
            onclick={() => {
              moreCategories = true;
              if (primaryExpenseCategories.some((item) => item.value === fCategory))
                fCategory = 'parking';
            }}><span>{c('more')}</span></button
          >
        </div>
        {#if moreCategories}
          <label class="xp-field xp-sub">
            <span>{c('moreCategories')}</span>
            <select bind:value={fCategory}>
              {#each expenseCategories.filter(([value]) => !primaryExpenseCategories.some((item) => item.value === value)) as [value, label] (value)}
                <option {value}>{translate(label)}</option>
              {/each}
            </select>
          </label>
        {/if}
      </fieldset>

      <div class="xp-amount-row">
        <label class="xp-field">
          <span>{c('amount')}</span>
          <input
            name="amount"
            required
            inputmode="decimal"
            autocomplete="off"
            pattern={'^\\d+([.,]\\d{1,2})?$'}
            placeholder="0.00"
            data-expense-amount
            bind:value={fAmount}
          />
        </label>
        <label class="xp-field xp-currency">
          <span>{c('currency')}</span>
          {#if mode === 'edit'}
            <input value={fCurrency} readonly aria-readonly="true" />
          {:else}
            <select name="currency" bind:value={fCurrency} required>
              {#each ['USD', 'EUR', 'BRL'] as code (code)}
                <option value={code}>{code}</option>
              {/each}
            </select>
          {/if}
        </label>
      </div>

      <div class="xp-field">
        <span class="xp-label">{c('receipt')}</span>
        <label class="xp-receipt">
          <input
            bind:this={receiptInput}
            type="file"
            name="receipt"
            accept="image/*,.heic,.heif,application/pdf"
            onchange={onReceiptChange}
          />
          {#if receiptUrl}
            <span class="receipt-preview">
              {#if receiptIsImage}<img src={receiptUrl} alt="" />{/if}
              <span>{receiptName}</span>
            </span>
          {:else}
            <span class="xp-receipt-cta"
              >{mode === 'edit' && text(editing ?? undefined, 'receipt_document_id')
                ? c('receiptReplace')
                : c('receiptAction')}</span
            >
          {/if}
        </label>
        <small
          >{mode === 'edit' && text(editing ?? undefined, 'receipt_document_id') && !receiptUrl
            ? `${c('receiptOnFile')} · `
            : ''}{c('receiptHint')}</small
        >
        {#if receiptUrl}
          <button type="button" class="secondary-button xp-small" onclick={clearReceipt}
            >{c('receiptRemove')}</button
          >
        {/if}
      </div>

      <label class="xp-field">
        <span>{c('note')}</span>
        <textarea name="description" rows="2" maxlength="5000" bind:value={fNote}></textarea>
        <small>{c('noteHint')}</small>
      </label>

      {#if canOverridePayer}
        <details class="xp-advanced">
          <summary>{c('advanced')}</summary>
          <p class="xp-muted">{c('advancedHint')}</p>
          {#if mode === 'create'}
            <label class="xp-field">
              <span>{c('whoPaid')}</span>
              <select name="whoPaid" bind:value={fWhoPaid}>
                <option value="">{c('policyDefault')}</option>
                <option value="worker">{c('payerWorker')}</option>
                <option value="company_card">{c('payerCompanyCard')}</option>
                <option value="company_direct">{c('payerCompanyDirect')}</option>
                <option value="client">{c('payerClient')}</option>
                <option value="third_party">{c('payerThirdParty')}</option>
              </select>
            </label>
          {/if}
          <label class="xp-field">
            <span>{c('vendor')}</span>
            <input name="vendor" maxlength="200" bind:value={fVendor} />
          </label>
          <label class="xp-field">
            <span>{c('paymentMethod')}</span>
            <input name="paymentMethod" maxlength="80" bind:value={fPaymentMethod} />
          </label>
        </details>
      {:else}
        <p class="xp-muted">{c('policyHint')}</p>
      {/if}

      {#if possibleDuplicate}
        <label class="xp-check">
          <input type="checkbox" name="allowSeparateExpense" bind:checked={allowSeparate} />
          <span>{c('separateExpense')}</span>
        </label>
      {/if}

      <div class="xp-form-actions">
        {#if mode === 'create'}
          <label class="xp-check">
            <input type="checkbox" bind:checked={addAnother} />
            <span>{c('addAnother')}</span>
          </label>
        {/if}
        <button type="submit" disabled={saving}
          >{saving ? c('saving') : mode === 'edit' ? c('saveChanges') : c('save')}</button
        >
      </div>
    </form>
  {/key}
  {#if mode === 'edit' && editing}
    <form
      method="POST"
      action="?/deleteDraft"
      class="xp-delete"
      data-action="deleteDraft"
      data-record-type="expense"
      data-record-id={text(editing, 'id')}
      use:enhance={() =>
        async ({ result, update }) => {
          await update();
          if (result.type === 'success') closeForm();
        }}
    >
      <input type="hidden" name="recordType" value="expense" />
      <input type="hidden" name="recordId" value={text(editing, 'id')} />
      <input type="hidden" name="version" value={text(editing, 'version')} />
      <button type="submit" class="destructive-button">{c('deleteDraft')}</button>
    </form>
  {/if}
</ResponsiveSheet>

<ResponsiveSheet
  open={confirmBlock !== null}
  title={c('confirmTitle')}
  closeLabel={c('cancel')}
  onclose={() => (confirmBlock = null)}
>
  {#if confirmBlock}
    {@const block = confirmBlock.block}
    <p>{c('confirmBody', { n: block.drafts.length })}</p>
    {#if showPersonHeaders}
      <p><strong>{block.workerId === me ? c('me') : block.workerName}</strong></p>
    {/if}
    <ul class="xp-confirm-list">
      {#each block.drafts as row (text(row, 'id'))}
        <li>
          <span>{dayLabel(text(row, 'spent_on'))} · {categoryLabel(text(row, 'category'))}</span>
          <strong>{money(text(row, 'amount_minor'), text(row, 'currency') || 'USD', tag)}</strong>
        </li>
      {/each}
    </ul>
    <p class="xp-confirm-total">
      <span>{c('total')}</span><strong>{totals(block.drafts)}</strong>
    </p>
    {#if block.drafts.some((row) => expenseReceiptState(row) !== 'attached')}
      <p class="xp-warn">
        {c('noReceipt')}: {block.drafts.filter((row) => expenseReceiptState(row) !== 'attached')
          .length}
      </p>
    {/if}
    {#if confirmError}
      <p class="xp-error" role="alert">{confirmError}</p>
    {/if}
    <form method="POST" action="?/submitExpenseWeek" use:enhance={submitWeek} class="xp-confirm">
      <input type="hidden" name="weekStart" value={confirmBlock.week} />
      <input type="hidden" name="workerId" value={block.workerId} />
      <input
        type="hidden"
        name="entries"
        value={JSON.stringify(
          block.drafts.map((row) => ({ id: text(row, 'id'), version: Number(row.version) })),
        )}
      />
      <button type="button" class="secondary-button" onclick={() => (confirmBlock = null)}
        >{c('cancel')}</button
      >
      <button type="submit" disabled={confirmBusy}
        >{c('confirmSubmit', { n: block.drafts.length })}</button
      >
    </form>
  {/if}
</ResponsiveSheet>

<style>
  .xp {
    display: grid;
    gap: 1rem;
    max-width: 60rem;
  }
  .xp-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem 1rem;
  }
  .xp-head h2 {
    margin: 0;
    font-size: 1.35rem;
  }
  .xp-head p {
    margin: 0.25rem 0 0;
    color: var(--ja-text-secondary);
  }
  .xp-add {
    min-height: 3rem;
    padding-inline: 1.25rem;
    font-size: 0.95rem;
    background: var(--ja-red, #b42318);
    border-color: var(--ja-red, #b42318);
  }
  .xp-add:hover:not(:disabled) {
    background: var(--ja-red-dark, #8f1d14);
    border-color: var(--ja-red-dark, #8f1d14);
  }
  .xp-notice,
  .xp-empty {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--ja-border-strong);
    border-radius: var(--ja-radius);
    background: var(--ja-surface);
    color: var(--ja-text-secondary);
  }
  .xp-empty p {
    margin: 0 0 0.5rem;
  }
  .xp-filters {
    border: 1px solid var(--ja-border-subdued);
    border-radius: 0.75rem;
    background: var(--ja-surface);
    padding: 0.25rem 0.9rem;
  }
  .xp-filters summary {
    cursor: pointer;
    padding: 0.55rem 0;
    font-weight: 700;
  }
  .xp-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-left: 0.4rem;
    border-radius: 50%;
    background: var(--ja-red);
  }
  .xp-filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.6rem;
    padding-bottom: 0.6rem;
  }
  .xp-filter-grid label,
  .xp-field {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .xp-filter-grid span,
  .xp-field > span,
  .xp-field > legend,
  .xp-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ja-text-secondary);
  }
  .xp-filter-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.9rem;
    padding-bottom: 0.7rem;
  }
  .xp-muted {
    color: var(--ja-text-muted);
    font-size: 0.85rem;
  }
  .xp-warn {
    color: var(--ja-status-warning-foreground);
    font-weight: 600;
  }
  .xp-week {
    border: 1px solid var(--ja-border-subdued);
    border-radius: var(--ja-radius);
    background: var(--ja-surface);
    overflow: hidden;
  }
  .xp-week-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.25rem 1rem;
    padding: 0.8rem 1rem;
    background: var(--ja-surface-raised);
  }
  .xp-week-head h3 {
    margin: 0;
    font-size: 1rem;
  }
  .xp-total {
    font-variant-numeric: tabular-nums;
  }
  .xp-person + .xp-person {
    border-top: 1px solid var(--ja-border-strong);
  }
  .xp-person-name {
    margin: 0;
    padding: 0.6rem 1rem 0;
    font-weight: 700;
  }
  .xp-rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .xp-row {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
    gap: 0.25rem 0.75rem;
    align-items: start;
    padding: 0.75rem 1rem;
  }
  .xp-row + .xp-row {
    border-top: 1px solid var(--ja-border-subdued);
  }
  .xp-icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.6rem;
    background: var(--ja-surface-raised);
  }
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .xp-row-main p {
    margin: 0;
  }
  .xp-row-title {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .xp-row-meta {
    font-size: 0.85rem;
    color: var(--ja-text-secondary);
  }
  .xp-note {
    grid-column: 2 / -1;
    margin: 0.2rem 0 0;
    padding: 0.45rem 0.6rem;
    border-left: 3px solid var(--ja-status-warning);
    background: #fff7e6;
    font-size: 0.85rem;
  }
  .xp-row-side {
    display: flex;
    flex-wrap: wrap-reverse;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem 0.6rem;
  }
  .xp-row-title a {
    color: inherit;
    text-decoration: none;
  }
  .xp-row-title a:hover,
  .xp-row-title a:focus-visible {
    text-decoration: underline;
  }
  .xp-amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @media (min-width: 40.01rem) {
    .xp-row {
      grid-template-columns: 2.25rem minmax(0, 1fr) auto auto;
      align-items: center;
    }
    .xp-row-actions {
      grid-column: auto !important;
      min-width: 0;
    }
  }
  .xp-row-actions {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .xp-row-actions:empty {
    display: none;
  }
  .xp-row-actions form {
    margin: 0;
  }
  .xp-row-actions a {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .xp-row-actions .secondary-button {
    min-height: 2.5rem;
  }
  .xp-fix {
    color: var(--ja-status-warning-foreground);
  }
  .xp-submit-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--ja-border-subdued);
    background: #fbfbf9;
    font-size: 0.9rem;
  }
  .xp-submit-bar button {
    min-height: 2.9rem;
    font-size: 0.85rem;
  }
  .xp-older {
    justify-self: center;
  }

  /* form */
  .xp-form {
    display: grid;
    gap: 1rem;
  }
  .xp-form input:not([type='checkbox']):not([type='file']),
  .xp-form select,
  .xp-form textarea,
  .xp-filter-grid input,
  .xp-filter-grid select {
    width: 100%;
    min-height: 2.9rem;
    font-size: 1rem;
  }
  .xp-field small {
    color: var(--ja-text-muted);
    font-size: 0.8rem;
  }
  .xp-fixed {
    display: grid;
    gap: 0.15rem;
    margin: 0;
  }
  .xp-fixed span {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ja-text-secondary);
  }
  .xp-chips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
    gap: 0.5rem;
  }
  .xp-chip {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.45rem;
    min-height: 3rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--ja-control-border-strong);
    border-radius: 0.7rem;
    background: var(--ja-surface);
    color: var(--ja-text-primary);
    box-shadow: none;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
  }
  .xp-chip:hover:not(:disabled) {
    background: var(--ja-surface-raised);
    color: var(--ja-text-primary);
    border-color: var(--ja-primary);
  }
  .xp-chip[aria-pressed='true'],
  .xp-chip[aria-pressed='true']:hover:not(:disabled) {
    border-color: var(--ja-primary);
    background: var(--ja-primary);
    color: #fff;
  }
  .xp-sub {
    margin-top: 0.5rem;
  }
  .xp-amount-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6.5rem;
    gap: 0.6rem;
  }
  .xp-amount-row input[name='amount'] {
    font-size: 1.25rem !important;
    font-variant-numeric: tabular-nums;
  }
  .xp-receipt {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 4.5rem;
    padding: 0.75rem;
    border: 2px dashed var(--ja-control-border-strong);
    border-radius: 0.8rem;
    background: var(--ja-canvas);
    cursor: pointer;
    text-align: center;
  }
  .xp-receipt:focus-within {
    outline: 3px solid var(--ja-focus-ring);
    outline-offset: 2px;
  }
  .xp-receipt input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .xp-receipt-cta {
    font-weight: 700;
  }
  .receipt-preview {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    overflow-wrap: anywhere;
  }
  .receipt-preview img {
    width: 4rem;
    height: 4rem;
    object-fit: cover;
    border-radius: 0.4rem;
  }
  .xp-small {
    justify-self: start;
    min-height: 2.4rem;
  }
  .xp-advanced {
    border: 1px solid var(--ja-border-subdued);
    border-radius: 0.7rem;
    padding: 0.3rem 0.8rem 0.8rem;
    display: grid;
    gap: 0.6rem;
  }
  .xp-advanced summary {
    cursor: pointer;
    padding: 0.4rem 0;
    font-weight: 700;
  }
  .xp-advanced[open] {
    gap: 0.8rem;
  }
  .xp-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  .xp-form-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    position: sticky;
    bottom: 0;
    padding: 0.75rem 0;
    background: var(--ja-surface);
    border-top: 1px solid var(--ja-border-subdued);
  }
  .xp-form-actions button {
    min-height: 3rem;
    padding-inline: 1.4rem;
    font-size: 0.95rem;
    margin-left: auto;
  }
  .xp-delete {
    margin-top: 0.5rem;
  }
  .xp-delete button {
    border-color: var(--ja-red);
    background: var(--ja-surface);
    color: var(--ja-red-dark);
    box-shadow: none;
  }
  .xp-delete button:hover:not(:disabled) {
    background: #fdecea;
    color: var(--ja-red-dark);
    border-color: var(--ja-red-dark);
  }
  .xp-error {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    background: #fdecea;
    color: var(--ja-red-dark);
    font-weight: 600;
  }
  .xp-ok {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    background: #eaf6ec;
    font-weight: 600;
  }
  .xp-confirm-list {
    list-style: none;
    margin: 0.5rem 0;
    padding: 0;
  }
  .xp-confirm-list li,
  .xp-confirm-total {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--ja-border-subdued);
  }
  .xp-confirm-total {
    margin: 0 0 0.75rem;
    border-bottom: 0;
    font-size: 1.05rem;
  }
  .xp-confirm {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.75rem;
  }
  .xp-confirm button {
    min-height: 3rem;
  }

  @media (max-width: 40rem) {
    .xp-head {
      align-items: stretch;
    }
    .xp-add {
      width: 100%;
    }
    .xp-row {
      padding-inline: 0.8rem;
    }
    .xp-row-side {
      flex-direction: column;
      align-items: flex-end;
    }
    .xp-submit-bar button,
    .xp-confirm button {
      width: 100%;
    }
  }
</style>
