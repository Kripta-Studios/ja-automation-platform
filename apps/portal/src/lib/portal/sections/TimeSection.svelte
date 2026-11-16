<script lang="ts">
  /**
   * Log hours: one week timesheet.
   * Rows = assigned projects (Work by default, optional Travel/Overtime rows),
   * columns = Mon–Sun of the selected week, cells = decimal hours.
   * Save keeps drafts; one "Submit week for approval" sends every draft of the
   * week after a confirmation that shows the totals. Submitted/approved cells
   * are read-only; reviewer-returned cells show the note and can be fixed.
   * Planned/scheduled hours are never shown as or turned into actual time.
   */
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';
  import { StatusBadge } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { decimalHoursFromMinutes } from '../minute-hours';
  import { localToday } from '../ui/time-entry-clock';
  import { weekDates, weekStartForDate } from './time-entry-actions';
  import { timeWeekText, type TimeWeekCopyKey } from './time-week-copy';

  let {
    locale = 'en',
    data,
    isAuditor,
    translate,
    controlledValue,
  }: {
    locale?: PortalLocale;
    data: PortalData;
    isAuditor: boolean;
    availableProjects?: Row[];
    saveOfflineDraft?: unknown;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  const t = (key: TimeWeekCopyKey, params: Record<string, string | number> = {}) =>
    timeWeekText(locale, key, params);

  type CellStatus = 'draft' | 'submitted' | 'approved' | 'needs_changes';
  type CellKind = 'new' | 'draft' | 'fix' | 'locked' | 'multi' | 'unassigned';
  type SheetRow = { key: string; projectId: string; category: string };

  const quickCategories = ['regular', 'travel', 'overtime'] as const;
  const categoryOrder = (category: string) => {
    const index = (quickCategories as readonly string[]).indexOf(category);
    return index < 0 ? 9 : index;
  };

  const today = localToday();
  const weekStart = $derived(String(data.weekStart ?? weekStartForDate(today) ?? today));
  const days = $derived(weekDates(weekStart));
  const workerId = $derived(String(data.timeWorkerId ?? data.user.id));
  const delegating = $derived(['owner_admin', 'project_manager'].includes(String(data.user.role)));
  const workers = $derived(data.timeWorkers ?? []);
  const canSubmit = $derived(
    !isAuditor && !(data.user.role === 'project_manager' && workerId !== data.user.id),
  );
  const entries = $derived((data.weekEntries ?? []) as Row[]);
  const assignments = $derived((data.timeAssignments ?? []) as Row[]);
  const projects = $derived((data.projects ?? []) as Row[]);

  const projectLabel = (projectId: string): string => {
    const project = projects.find((row) => String(row.id) === projectId);
    const entry = entries.find((row) => String(row.project_id) === projectId);
    const number = String(project?.project_number ?? entry?.project_number ?? '');
    const name = String(project?.name ?? entry?.project_name ?? '');
    return [number, name].filter(Boolean).join(' · ') || projectId.slice(0, 8);
  };
  const categoryLabel = (category: string): string =>
    category === 'regular'
      ? t('work')
      : category === 'travel'
        ? t('travel')
        : category === 'overtime'
          ? t('overtime')
          : controlledValue('timeCategory', category);

  const assigned = (projectId: string, date: string): boolean =>
    assignments.some(
      (row) =>
        String(row.project_id) === projectId &&
        String(row.starts_on ?? '') <= date &&
        (!row.ends_on || String(row.ends_on) >= date),
    );

  let extraRows = $state<SheetRow[]>([]);
  let edits = $state<Record<string, string>>({});
  let reason = $state('');
  let busy = $state<'' | 'save' | 'submit'>('');
  let intent = $state<'save' | 'submit'>('save');
  let addingRow = $state(false);
  let newRowProject = $state('');
  let newRowCategory = $state('travel');
  let confirmDialog = $state<HTMLDialogElement | null>(null);
  let sheetForm = $state<HTMLFormElement | null>(null);

  const rows = $derived.by((): SheetRow[] => {
    const map = new Map<string, SheetRow>();
    const add = (projectId: string, category: string) => {
      const key = `${projectId}|${category}`;
      if (!map.has(key)) map.set(key, { key, projectId, category });
    };
    for (const project of projects) {
      const id = String(project.id);
      if (days.some((date) => assigned(id, date))) add(id, 'regular');
    }
    for (const entry of entries) add(String(entry.project_id), String(entry.category));
    for (const row of extraRows) add(row.projectId, row.category);
    return [...map.values()].sort(
      (a, b) =>
        projectLabel(a.projectId).localeCompare(projectLabel(b.projectId)) ||
        categoryOrder(a.category) - categoryOrder(b.category),
    );
  });
  const rowProjects = $derived(
    projects.filter((project) => days.some((date) => assigned(String(project.id), date))),
  );

  const cellKey = (row: SheetRow, date: string) => `${row.key}|${date}`;
  const cellEntries = (row: SheetRow, date: string) =>
    entries.filter(
      (entry) =>
        String(entry.project_id) === row.projectId &&
        String(entry.category) === row.category &&
        String(entry.work_date) === date,
    );
  const entryStatus = (entry: Row): CellStatus => {
    const state = String(entry.approval_state);
    if (state === 'needs_changes') return 'needs_changes';
    if (state === 'submitted') return 'submitted';
    if (state === 'approved' || state === 'locked') return 'approved';
    return 'draft';
  };
  const editableDraft = (entry: Row) =>
    String(entry.approval_state) === 'draft' &&
    Number(entry.correction_linked ?? 0) !== 1 &&
    !entry.linked_pair_expense_id;

  type Cell = {
    key: string;
    kind: CellKind;
    entry?: Row;
    status?: CellStatus;
    originalMinutes: number;
    value: string;
    minutes: number | null | undefined;
    changed: boolean;
  };

  const parseHours = (value: string): number | null | undefined => {
    const raw = value.trim().replace(',', '.');
    if (!raw) return null;
    const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/u.exec(raw);
    if (!match) return undefined;
    const hundredths = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    if (hundredths > 2400) return undefined;
    return Math.round((hundredths * 3) / 5);
  };
  const hoursText = (minutes: number) => (minutes ? decimalHoursFromMinutes(minutes) : '');

  const cellFor = (row: SheetRow, date: string): Cell => {
    const key = cellKey(row, date);
    const list = cellEntries(row, date);
    const originalMinutes = list.reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0);
    let kind: CellKind;
    if (list.length === 0) kind = assigned(row.projectId, date) ? 'new' : 'unassigned';
    else if (list.length > 1) kind = 'multi';
    else if (editableDraft(list[0]!)) kind = 'draft';
    else if (String(list[0]!.approval_state) === 'needs_changes') kind = 'fix';
    else kind = 'locked';
    if (isAuditor && kind !== 'unassigned') kind = list.length ? 'locked' : 'unassigned';
    const editable = kind === 'new' || kind === 'draft' || kind === 'fix';
    const value = editable && key in edits ? edits[key]! : hoursText(originalMinutes);
    const minutes = parseHours(value);
    const statuses = [...new Set(list.map(entryStatus))];
    return {
      key,
      kind,
      entry: list.length === 1 ? list[0] : undefined,
      status: statuses.length === 1 ? statuses[0] : statuses.length ? 'submitted' : undefined,
      originalMinutes,
      value,
      minutes,
      changed: editable && minutes !== undefined && (minutes ?? 0) !== originalMinutes,
    };
  };

  const grid = $derived(
    rows.map((row) => ({ row, cells: days.map((date) => cellFor(row, date)) })),
  );
  const cellMinutes = (cell: Cell) =>
    cell.minutes === undefined ? cell.originalMinutes : (cell.minutes ?? 0);
  const dayTotals = $derived(
    days.map((_, index) => grid.reduce((sum, line) => sum + cellMinutes(line.cells[index]!), 0)),
  );
  const weekTotal = $derived(dayTotals.reduce((sum, value) => sum + value, 0));
  const changedCells = $derived(grid.flatMap((line) => line.cells.filter((cell) => cell.changed)));
  const invalidCells = $derived(
    grid.flatMap((line) => line.cells.filter((cell) => cell.minutes === undefined)),
  );
  const fixingCells = $derived(changedCells.filter((cell) => cell.kind === 'fix'));
  const dirty = $derived(changedCells.length > 0);

  const statusOf = (list: Row[]): CellStatus | 'empty' => {
    const states = list.map(entryStatus);
    if (states.includes('needs_changes')) return 'needs_changes';
    if (states.includes('draft')) return 'draft';
    if (states.includes('submitted')) return 'submitted';
    if (states.includes('approved')) return 'approved';
    return 'empty';
  };
  const weekStatus = $derived(statusOf(entries));
  const dayStatus = (date: string) =>
    statusOf(entries.filter((entry) => String(entry.work_date) === date));
  const returned = $derived(entries.filter((entry) => entryStatus(entry) === 'needs_changes'));

  /** Drafts that will be submitted: saved drafts not cleared, plus new hours and fixes. */
  const submitCount = $derived.by(() => {
    let count = 0;
    for (const line of grid)
      for (const cell of line.cells) {
        const list = cellEntries(line.row, days[line.cells.indexOf(cell)]!);
        const drafts = list.filter((entry) => String(entry.approval_state) === 'draft').length;
        if (cell.kind === 'draft' || cell.kind === 'multi' || cell.kind === 'locked')
          count += cell.kind === 'draft' && cell.changed && !cell.minutes ? 0 : drafts;
        else if (cell.kind === 'new' && cell.minutes) count += 1;
        else if (cell.kind === 'fix' && cell.changed) count += 1;
      }
    return count;
  });

  const statusLabel = (status: CellStatus | 'empty'): string =>
    status === 'draft'
      ? t('statusDraft')
      : status === 'submitted'
        ? t('statusSubmitted')
        : status === 'approved'
          ? t('statusApproved')
          : status === 'needs_changes'
            ? t('statusNeedsChanges')
            : '';
  const weekStatusLabel = $derived(
    weekStatus === 'needs_changes'
      ? t('weekStatusNeedsChanges')
      : weekStatus === 'draft'
        ? t('weekStatusDraft')
        : weekStatus === 'submitted'
          ? t('weekStatusSubmitted')
          : weekStatus === 'approved'
            ? t('weekStatusApproved')
            : t('weekStatusEmpty'),
  );
  const variant = (status: CellStatus | 'empty' | undefined) =>
    status === 'approved'
      ? 'success'
      : status === 'submitted'
        ? 'info'
        : status === 'needs_changes'
          ? 'warning'
          : 'neutral';

  const language = $derived(documentLanguage(locale));
  const dayName = (date: string, style: 'short' | 'long' = 'short') => {
    const value = new Date(`${date}T00:00:00.000Z`);
    if (style === 'long') {
      const text = new Intl.DateTimeFormat(language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(value);
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    const weekday = new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(value);
    return `${weekday} ${value.getUTCDate()}`;
  };
  const rangeLabel = $derived.by(() => {
    if (days.length !== 7) return weekStart;
    const format = new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const year = days[6]!.slice(0, 4);
    return `${format.format(new Date(`${days[0]}T00:00:00Z`))} – ${format.format(new Date(`${days[6]}T00:00:00Z`))} ${year}`;
  });
  const shiftWeek = (offset: number) => {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset * 7);
    return date.toISOString().slice(0, 10);
  };
  const currentWeek = weekStartForDate(today) ?? today;

  const sheetHref = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams($page.url.searchParams);
    for (const key of [...query.keys()]) if (key.startsWith('/')) query.delete(key);
    for (const [key, value] of Object.entries(changes))
      if (value === null) query.delete(key);
      else query.set(key, value);
    return `${base}/app/time?${query.toString()}`;
  };
  const leaveGuard = (event: MouseEvent) => {
    if (dirty && !confirm(translate('Discard unsaved changes?'))) event.preventDefault();
  };
  const pickWorker = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (dirty && !confirm(translate('Discard unsaved changes?'))) {
      (event.currentTarget as HTMLSelectElement).value = workerId;
      return;
    }
    edits = {};
    extraRows = [];
    void goto(sheetHref({ worker: value }), { noScroll: true, keepFocus: true });
  };

  $effect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  // Reset local edits when the sheet subject changes (week or worker).
  let sheetIdentity = '';
  $effect(() => {
    const identity = `${weekStart}|${workerId}`;
    if (sheetIdentity && sheetIdentity !== identity) {
      edits = {};
      extraRows = [];
      reason = '';
    }
    sheetIdentity = identity;
  });

  const setCell = (key: string, value: string) => {
    edits = { ...edits, [key]: value };
  };

  const payloadCells = $derived(
    grid.flatMap((line) =>
      line.cells.flatMap((cell, index) =>
        cell.changed
          ? [
              {
                projectId: line.row.projectId,
                category: line.row.category,
                workDate: days[index],
                hours: cell.value,
                ...(cell.entry ? { id: String(cell.entry.id), version: Number(cell.entry.version) } : {}),
              },
            ]
          : [],
      ),
    ),
  );
  const expectedDrafts = $derived(
    entries
      .filter((entry) => String(entry.approval_state) === 'draft')
      .map((entry) => ({ id: String(entry.id), version: Number(entry.version) })),
  );

  type SheetResult = {
    actionName?: string;
    success?: boolean;
    messageKey?: string;
    message?: string;
    cell?: { projectId: string; workDate: string; category: string };
  };
  const result = $derived($page.form as SheetResult | null);
  const problem = $derived(
    result?.actionName === 'saveTimeWeek' && result.success === false ? result : null,
  );
  const problemKey = $derived(
    problem?.cell ? `${problem.cell.projectId}|${problem.cell.category}|${problem.cell.workDate}` : '',
  );
  const problemText = $derived.by(() => {
    if (!problem) return '';
    const text = problem.messageKey ? translate(problem.messageKey) : '';
    return text && text !== problem.messageKey ? text : (problem.message ?? '');
  });

  const submitSheet: SubmitFunction = () => {
    busy = intent;
    return async ({ result: outcome, update }) => {
      busy = '';
      if (outcome.type === 'success') {
        edits = {};
        extraRows = [];
        reason = '';
      }
      await update({ reset: false, invalidateAll: true });
      intent = 'save';
    };
  };
  const save = () => {
    intent = 'save';
    sheetForm?.requestSubmit();
  };
  const openConfirm = () => {
    if (invalidCells.length) return;
    confirmDialog?.showModal();
  };
  const confirmSubmit = async () => {
    confirmDialog?.close();
    intent = 'submit';
    // Let Svelte write the hidden intent before submitting.
    await tick();
    sheetForm?.requestSubmit();
  };
  const addRow = () => {
    if (!newRowProject) return;
    extraRows = [
      ...extraRows,
      { key: `${newRowProject}|${newRowCategory}`, projectId: newRowProject, category: newRowCategory },
    ];
    addingRow = false;
  };

  const allHistoryRows = $derived((data.records ?? []) as Row[]);
  let historyLimit = $state(20);
  const historyRows = $derived(allHistoryRows.slice(0, historyLimit));
  const historyTotal = $derived(Number(data.recordsTotal ?? historyRows.length));
  const historyFiltered = $derived(
    Boolean(data.timeFilter?.projectId || data.timeFilter?.workerId || data.timeFilter?.status),
  );
  const workerName = (id: string) =>
    workers.find((worker) => worker.id === id)?.name ??
    String(historyRows.find((row) => String(row.worker_id) === id)?.worker_name ?? '');
  const cellTitle = (cell: Cell): string =>
    cell.kind === 'unassigned'
      ? t('noAssignment')
      : cell.kind === 'multi'
        ? t('multiple')
        : cell.kind === 'locked'
          ? t('readOnly', { status: statusLabel(cell.status ?? 'submitted') })
          : '';
</script>

{#snippet cellInput(line: { row: SheetRow; cells: Cell[] }, cell: Cell, index: number)}
  {@const date = days[index]!}
  {@const label = t('hoursFor', { project: `${projectLabel(line.row.projectId)} (${categoryLabel(line.row.category)})`, day: dayName(date, 'long') })}
  {#if cell.kind === 'new' || cell.kind === 'draft' || cell.kind === 'fix'}
    <input
      class="hours-input"
      class:is-changed={cell.changed}
      class:is-invalid={cell.minutes === undefined || problemKey === cell.key}
      data-status={cell.kind === 'new' ? 'empty' : cell.status}
      type="text"
      inputmode="decimal"
      autocomplete="off"
      maxlength="5"
      placeholder="–"
      aria-label={label}
      aria-invalid={cell.minutes === undefined || problemKey === cell.key}
      value={cell.value}
      oninput={(event) => setCell(cell.key, event.currentTarget.value)}
    />
  {:else}
    <span
      class="hours-locked"
      data-status={cell.kind === 'unassigned' ? 'unassigned' : cell.status}
      title={cellTitle(cell)}
      aria-label={`${label}: ${cell.kind === 'unassigned' ? t('noAssignment') : `${hoursText(cell.originalMinutes) || '0'} ${t('hoursUnit')} · ${statusLabel(cell.status ?? 'submitted')}`}`}
    >
      {#if cell.kind === 'unassigned'}
        ·
      {:else}
        {hoursText(cell.originalMinutes) || '0'}
        {#if cell.status === 'approved'}<span aria-hidden="true" class="mark">✓</span>{:else if cell.status === 'submitted'}<span
            aria-hidden="true"
            class="mark">⏳</span
          >{/if}
      {/if}
    </span>
  {/if}
{/snippet}

<section class="time-week" aria-labelledby="time-week-title" data-testid="time-week">
  <header class="time-week-head">
    <div>
      <h2 id="time-week-title" class="sr-only">{t('title')}</h2>
      <p class="muted">{delegating && workerId !== data.user.id ? t('workerHint') : t('intro')}</p>
    </div>
    {#if delegating}
      <label class="worker-pick">
        <span>{t('worker')}</span>
        {#if workers.length}
          <select value={workerId} onchange={pickWorker} data-testid="time-worker-select">
            {#each workers as worker (worker.id)}
              <option value={worker.id}>{worker.name || worker.id}</option>
            {/each}
          </select>
        {:else}
          <span class="muted">{t('noWorkers')}</span>
        {/if}
      </label>
    {/if}
  </header>

  <nav class="week-nav" aria-label={t('week')}>
    <a
      class="week-arrow"
      href={sheetHref({ week: shiftWeek(-1) })}
      onclick={leaveGuard}
      aria-label={t('previousWeek')}
      data-sveltekit-noscroll>‹</a
    >
    <div class="week-label">
      <strong>{rangeLabel}</strong>
      <StatusBadge variant={variant(weekStatus)} text={weekStatusLabel} data-testid="week-status" />
    </div>
    <a
      class="week-arrow"
      href={sheetHref({ week: shiftWeek(1) })}
      onclick={leaveGuard}
      aria-label={t('nextWeek')}
      data-sveltekit-noscroll>›</a
    >
    {#if weekStart !== currentWeek}
      <a class="this-week" href={sheetHref({ week: null })} onclick={leaveGuard} data-sveltekit-noscroll
        >{t('thisWeek')}</a
      >
    {/if}
  </nav>

  {#if returned.length}
    <div class="returned" role="status" data-testid="time-needs-changes">
      <p><strong>{t('statusNeedsChanges')}.</strong> {t('needsChangesHelp')}</p>
      <ul>
        {#each returned as entry (entry.id)}
          <li>
            <span>{dayName(String(entry.work_date))} · {projectLabel(String(entry.project_id))}</span>
            <span class="note"
              >{t('reviewerNote')}: {entry.review_reason ? String(entry.review_reason) : t('noNote')}</span
            >
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if problem}
    <div class="sheet-problem" role="alert" data-testid="time-week-problem">
      {#if problem.cell}
        <strong
          >{t('problemAt', {
            day: dayName(problem.cell.workDate, 'long'),
            project: projectLabel(problem.cell.projectId),
          })}</strong
        >
      {/if}
      <p>{problemText}</p>
    </div>
  {/if}

  {#if rows.length === 0}
    <p class="empty" data-testid="time-no-projects">{delegating && !workers.length ? t('noWorkers') : t('noProjects')}</p>
  {:else}
    <form
      method="POST"
      action="?/saveTimeWeek"
      bind:this={sheetForm}
      use:enhance={submitSheet}
      class="sheet-form"
    >
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="workerId" value={workerId} />
      <input type="hidden" name="cells" value={JSON.stringify(payloadCells)} />
      <input type="hidden" name="expected" value={JSON.stringify(expectedDrafts)} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="reason" value={reason} />

      <!-- Desktop/tablet: projects x days table -->
      <div class="sheet-table-wrap">
        <table class="sheet-table" data-testid="time-week-table">
          <thead>
            <tr>
              <th scope="col" class="col-project">{t('project')}</th>
              {#each days as date, index (date)}
                <th scope="col" class:is-today={date === today}>
                  <span class="day-head">{dayName(date)}</span>
                  {#if dayStatus(date) !== 'empty'}
                    <span class="dot" data-status={dayStatus(date)} title={statusLabel(dayStatus(date))}></span>
                  {/if}
                  <span class="sr-only">{dayTotals[index]}</span>
                </th>
              {/each}
              <th scope="col" class="col-total">{t('total')}</th>
            </tr>
          </thead>
          <tbody>
            {#each grid as line (line.row.key)}
              <tr>
                <th scope="row" class="col-project">
                  <span class="project-name">{projectLabel(line.row.projectId)}</span>
                  <span class="category" data-category={line.row.category}>{categoryLabel(line.row.category)}</span>
                </th>
                {#each line.cells as cell, index (cell.key)}
                  <td class:is-today={days[index] === today}>{@render cellInput(line, cell, index)}</td>
                {/each}
                <td class="col-total">
                  {decimalHoursFromMinutes(line.cells.reduce((sum, cell) => sum + cellMinutes(cell), 0))}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" class="col-project">{t('dayTotal')}</th>
              {#each dayTotals as total, index (days[index])}
                <td>{decimalHoursFromMinutes(total)}</td>
              {/each}
              <td class="col-total week-total" data-testid="week-total">{decimalHoursFromMinutes(weekTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Phone: one card per day -->
      <ol class="sheet-days" data-testid="time-week-days">
        {#each days as date, index (date)}
          <li class="day-card" class:is-today={date === today}>
            <div class="day-card-head">
              <strong>{dayName(date, 'long')}</strong>
              {#if dayStatus(date) !== 'empty'}
                <StatusBadge variant={variant(dayStatus(date))} text={statusLabel(dayStatus(date))} />
              {/if}
              <span class="day-card-total">{decimalHoursFromMinutes(dayTotals[index])} {t('hoursUnit')}</span>
            </div>
            <ul>
              {#each grid as line (line.row.key)}
                {@const cell = line.cells[index]!}
                {#if (cell.kind !== 'unassigned' || cell.originalMinutes) && (line.row.category === 'regular' || cell.originalMinutes || cell.key in edits || extraRows.some((row) => row.key === line.row.key))}
                  <li class="day-line">
                    <span class="day-line-label">
                      <span class="project-name">{projectLabel(line.row.projectId)}</span>
                      <span class="category" data-category={line.row.category}>{categoryLabel(line.row.category)}</span>
                    </span>
                    {@render cellInput(line, cell, index)}
                  </li>
                {/if}
              {/each}
            </ul>
          </li>
        {/each}
      </ol>

      <div class="sheet-tools">
        {#if !isAuditor && rowProjects.length}
          {#if addingRow}
            <fieldset class="add-row">
              <legend>{t('addRowTitle')}</legend>
              <label
                >{t('project')}
                <select bind:value={newRowProject}>
                  {#each rowProjects as project (project.id)}
                    <option value={String(project.id)}>{projectLabel(String(project.id))}</option>
                  {/each}
                </select>
              </label>
              <label
                >{t('type')}
                <select bind:value={newRowCategory}>
                  {#each quickCategories as category (category)}
                    <option value={category}>{categoryLabel(category)}</option>
                  {/each}
                </select>
              </label>
              <button type="button" class="secondary" onclick={addRow}>{t('add')}</button>
              <button type="button" class="link" onclick={() => (addingRow = false)}>{t('cancel')}</button>
            </fieldset>
          {:else}
            <button
              type="button"
              class="link"
              onclick={() => {
                newRowProject = String(rowProjects[0]?.id ?? '');
                addingRow = true;
              }}>+ {t('addRow')}</button
            >
          {/if}
        {/if}
        <p class="legend" aria-label={t('legend')}>
          <span class="dot" data-status="draft"></span>{t('statusDraft')}
          <span class="dot" data-status="submitted"></span>{t('statusSubmitted')}
          <span class="dot" data-status="approved"></span>{t('statusApproved')}
          <span class="dot" data-status="needs_changes"></span>{t('statusNeedsChanges')}
        </p>
      </div>

      {#if fixingCells.length}
        <label class="fix-reason">
          <span>{t('correctionReason')}</span>
          <input type="text" maxlength="500" bind:value={reason} />
          <small class="muted">{t('correctionReasonHint')}</small>
        </label>
      {/if}

      {#if invalidCells.length}
        <p class="invalid-hint" role="alert">{t('invalidHours')}</p>
      {/if}

      {#if !isAuditor}
        <div class="sheet-actions" data-testid="time-week-actions">
          <div class="sheet-actions-total">
            <span>{t('weekTotal')}</span>
            <strong>{decimalHoursFromMinutes(weekTotal)} {t('hoursUnit')}</strong>
            <small class:unsaved={dirty}>{dirty ? t('unsaved') : t('allSaved')}</small>
          </div>
          <div class="sheet-actions-buttons">
            <button
              type="button"
              class="secondary"
              disabled={!dirty || Boolean(busy) || invalidCells.length > 0}
              onclick={save}>{busy === 'save' ? t('saving') : t('save')}</button
            >
            {#if canSubmit}
              <button
                type="button"
                class="primary"
                disabled={submitCount === 0 || Boolean(busy) || invalidCells.length > 0}
                title={submitCount === 0 ? t('nothingToSubmit') : ''}
                onclick={openConfirm}
                data-testid="time-week-submit"
                >{busy === 'submit' ? t('submitting') : t('submitWeek')}</button
              >
            {/if}
          </div>
          {#if !canSubmit}
            <p class="muted small">{t('delegatedSubmitHint')}</p>
          {/if}
        </div>
      {/if}
    </form>

    <dialog bind:this={confirmDialog} class="confirm" aria-labelledby="time-confirm-title" data-testid="time-week-confirm">
      <h3 id="time-confirm-title">{t('confirmTitle')}</h3>
      <p class="muted">{rangeLabel}{delegating ? ` · ${workerName(workerId)}` : ''}</p>
      <table class="confirm-totals">
        <tbody>
          {#each days as date, index (date)}
            {#if dayTotals[index]}
              <tr><th scope="row">{dayName(date, 'long')}</th><td>{decimalHoursFromMinutes(dayTotals[index])} {t('hoursUnit')}</td></tr>
            {/if}
          {/each}
        </tbody>
        <tfoot>
          <tr><th scope="row">{t('weekTotal')}</th><td><strong>{decimalHoursFromMinutes(weekTotal)} {t('hoursUnit')}</strong></td></tr>
        </tfoot>
      </table>
      <p>{t('confirmEntries', { count: submitCount })}</p>
      <p class="muted">{t('confirmBody')}</p>
      <div class="confirm-actions">
        <button type="button" class="secondary" onclick={() => confirmDialog?.close()}>{t('cancel')}</button>
        <button type="button" class="primary" onclick={confirmSubmit} data-testid="time-week-confirm-submit"
          >{t('confirmSubmit')}</button
        >
      </div>
    </dialog>
  {/if}

  <details class="time-history" data-testid="time-history" open={historyFiltered}>
    <summary
      ><span>{t('history')}</span>
      <span class="muted history-count">{t('historyCount', { count: historyTotal })}</span></summary
    >
    <form method="GET" action={`${base}/app/time`} class="history-filters" data-sveltekit-noscroll>
      <input type="hidden" name="week" value={weekStart} />
      {#if delegating}<input type="hidden" name="worker" value={workerId} />{/if}
      {#if $page.url.searchParams.get('lang')}
        <input type="hidden" name="lang" value={$page.url.searchParams.get('lang')} />
      {/if}
      <label
        ><span class="sr-only">{t('project')}</span>
        <select name="project" value={data.timeFilter?.projectId ?? ''}>
          <option value="">{t('allProjects')}</option>
          {#each projects as project (project.id)}
            <option value={String(project.id)}>{projectLabel(String(project.id))}</option>
          {/each}
        </select>
      </label>
      {#if delegating}
        <label
          ><span class="sr-only">{t('worker')}</span>
          <select name="rworker" value={data.timeFilter?.workerId ?? ''}>
            <option value="">{t('allWorkers')}</option>
            {#each workers as worker (worker.id)}
              <option value={worker.id}>{worker.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <label
        ><span class="sr-only">{t('status')}</span>
        <select name="status" value={data.timeFilter?.status ?? ''}>
          <option value="">{t('allStatuses')}</option>
          <option value="draft">{t('statusDraft')}</option>
          <option value="submitted">{t('statusSubmitted')}</option>
          <option value="needs_changes">{t('statusNeedsChanges')}</option>
          <option value="approved">{t('statusApproved')}</option>
        </select>
      </label>
      <button type="submit" class="secondary">{t('apply')}</button>
      {#if historyFiltered}
        <a href={sheetHref({ project: null, rworker: null, status: null })}>{t('clear')}</a>
      {/if}
    </form>
    {#if historyRows.length === 0}
      <p class="muted">{t('noHistory')}</p>
    {:else}
      <ul class="history-list">
        {#each historyRows as row (row.id)}
          {@const status = entryStatus(row)}
          <li>
            <a href={`${base}/app/time/${String(row.id)}`}>
              <span class="history-date">{String(row.work_date)}</span>
              <span class="history-main">
                <span>{projectLabel(String(row.project_id))}</span>
                <span class="muted"
                  >{delegating ? `${String(row.worker_name ?? '')} · ` : ''}{categoryLabel(String(row.category))}</span
                >
              </span>
              <span class="history-hours">{decimalHoursFromMinutes(row.minutes)} {t('hoursUnit')}</span>
              <StatusBadge
                variant={String(row.approval_state) === 'rejected' ? 'danger' : variant(status)}
                text={String(row.approval_state) === 'rejected'
                  ? controlledValue('status', 'rejected')
                  : statusLabel(status)}
              />
            </a>
          </li>
        {/each}
      </ul>
      {#if allHistoryRows.length > historyRows.length}
        <button type="button" class="link" onclick={() => (historyLimit += 40)}>{t('showMore')}</button>
      {:else if historyTotal > historyRows.length}
        <p class="muted small">{t('historyShowing', { shown: historyRows.length, count: historyTotal })}</p>
      {/if}
    {/if}
  </details>
</section>

<style>
  .time-week {
    display: grid;
    gap: 1rem;
    max-width: 72rem;
  }
  .time-week-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
  }
  .time-week-head h2 {
    margin: 0;
  }
  .time-week-head p {
    margin: 0.25rem 0 0;
  }
  .muted {
    color: var(--ja-steel, #5b6573);
  }
  .small {
    font-size: 0.875rem;
  }
  .worker-pick {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
    min-width: min(100%, 16rem);
  }
  .worker-pick select,
  .history-filters select,
  .add-row select,
  .fix-reason input {
    min-height: var(--ja-target-min, 44px);
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: var(--ja-control-radius, 8px);
    padding: 0 0.6rem;
    background: var(--ja-white, #fff);
    font: inherit;
  }
  .week-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .week-arrow {
    display: inline-grid;
    place-items: center;
    width: var(--ja-target-min, 44px);
    height: var(--ja-target-min, 44px);
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: 999px;
    font-size: 1.5rem;
    line-height: 1;
    text-decoration: none;
    color: var(--ja-ink, #1c2430);
    background: var(--ja-white, #fff);
  }
  .week-label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 12rem;
    justify-content: center;
    flex: 0 1 auto;
  }
  .this-week {
    margin-left: 0.25rem;
  }
  .returned,
  .sheet-problem {
    border-radius: var(--ja-radius, 10px);
    padding: 0.75rem 1rem;
  }
  .returned {
    background: #fff7e6;
    border: 1px solid #f0c36d;
  }
  .returned p,
  .sheet-problem p {
    margin: 0;
  }
  .returned ul {
    margin: 0.5rem 0 0;
    padding-left: 1.1rem;
  }
  .returned li {
    display: grid;
  }
  .returned .note {
    font-style: italic;
  }
  .sheet-problem {
    background: #fdecec;
    border: 1px solid var(--ja-danger, #c62828);
  }
  .empty {
    padding: 1rem;
    border: 1px dashed var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
  }
  .sheet-form {
    display: grid;
    gap: 0.75rem;
  }
  .sheet-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
  }
  .sheet-table {
    width: 100%;
    border-collapse: collapse;
  }
  .sheet-table th,
  .sheet-table td {
    padding: 0.4rem;
    text-align: center;
    border-bottom: 1px solid var(--ja-line, #e3e7ec);
  }
  .sheet-table thead th {
    font-size: 0.875rem;
    white-space: nowrap;
  }
  .sheet-table .col-project {
    text-align: left;
    min-width: 12rem;
    padding-left: 0.75rem;
  }
  .sheet-table .col-total {
    font-weight: 700;
    min-width: 4rem;
  }
  .sheet-table tfoot td,
  .sheet-table tfoot th {
    font-weight: 700;
    border-bottom: 0;
    background: var(--ja-surface, #f6f8fa);
  }
  .is-today {
    background: #f1f7ff;
  }
  .project-name {
    display: block;
    font-weight: 600;
  }
  .category {
    display: inline-block;
    font-size: 0.8rem;
    color: var(--ja-steel, #5b6573);
  }
  .category[data-category='travel'],
  .category[data-category='overtime'] {
    font-weight: 700;
    color: #6a3fb5;
  }
  .hours-input,
  .hours-locked {
    box-sizing: border-box;
    width: 4.25rem;
    min-height: var(--ja-target-min, 44px);
    border-radius: 8px;
    text-align: center;
    font: inherit;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }
  .hours-input {
    border: 1px solid var(--ja-control-border, #b8c0cc);
    background: var(--ja-white, #fff);
    padding: 0 0.25rem;
  }
  .hours-input:focus-visible {
    outline: 3px solid var(--ja-focus-ring, #1f6feb);
    outline-offset: 1px;
  }
  .time-week .hours-input.is-changed {
    border-color: #1f6feb;
    background: #f3f8ff;
  }
  .time-week .hours-input.is-invalid {
    border: 2px solid var(--ja-danger, #c62828);
    background: #fdecec;
  }
  .time-week .hours-input[data-status='needs_changes'] {
    border: 2px solid #e09b00;
    background: #fff7e6;
  }
  .hours-locked {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    border: 1px solid transparent;
  }
  .hours-locked[data-status='submitted'] {
    background: #eaf2fd;
    border-color: #b7d0f5;
  }
  .hours-locked[data-status='approved'] {
    background: #e8f6ec;
    border-color: #a9dbb8;
  }
  .hours-locked[data-status='draft'] {
    background: var(--ja-surface, #f6f8fa);
    border-color: var(--ja-line, #d5dbe3);
  }
  .hours-locked[data-status='unassigned'] {
    color: #a0a8b3;
  }
  .mark {
    font-size: 0.8rem;
  }
  .dot {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    margin: 0 0.3rem 0 0.15rem;
    vertical-align: middle;
    border: 1px solid #8a94a3;
    background: #fff;
  }
  .dot[data-status='submitted'] {
    background: #3b82f6;
    border-color: #3b82f6;
  }
  .dot[data-status='approved'] {
    background: #2e9e5b;
    border-color: #2e9e5b;
  }
  .dot[data-status='needs_changes'] {
    background: #e09b00;
    border-color: #e09b00;
  }
  .sheet-days {
    display: none;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 0.6rem;
  }
  .day-card {
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
    padding: 0.6rem 0.75rem;
  }
  .day-card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .day-card-total {
    margin-left: auto;
    font-weight: 700;
  }
  .day-card ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }
  .day-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0;
    border-top: 1px solid var(--ja-line, #eef1f4);
  }
  .day-line-label {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sheet-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .legend {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ja-steel, #5b6573);
  }
  .add-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    padding: 0.5rem 0.75rem 0.75rem;
  }
  .add-row label {
    display: grid;
    gap: 0.2rem;
    font-size: 0.9rem;
  }
  .fix-reason {
    display: grid;
    gap: 0.25rem;
    max-width: 36rem;
    font-weight: 600;
  }
  .invalid-hint {
    color: var(--ja-danger, #c62828);
    margin: 0;
  }
  button.link {
    background: none;
    border: 0;
    padding: 0.5rem 0;
    min-height: var(--ja-target-min, 44px);
    color: var(--ja-teal, #0b6b78);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }
  button.primary,
  button.secondary {
    min-height: var(--ja-target-min, 44px);
    padding: 0 1.1rem;
    border-radius: var(--ja-control-radius, 8px);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  button.primary {
    background: var(--ja-red, #b3261e);
    color: #fff;
    border: 1px solid var(--ja-red, #b3261e);
  }
  button.secondary {
    background: var(--ja-white, #fff);
    color: var(--ja-ink, #1c2430);
    border: 1px solid var(--ja-control-border, #b8c0cc);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sheet-actions {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
    box-shadow: 0 -4px 14px rgb(0 0 0 / 6%);
  }
  .sheet-actions-total {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .sheet-actions-total strong {
    font-size: 1.25rem;
  }
  .sheet-actions-total small {
    color: var(--ja-steel, #5b6573);
  }
  .sheet-actions-total small.unsaved {
    color: #a15c00;
    font-weight: 700;
  }
  .sheet-actions-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .sheet-actions p {
    flex-basis: 100%;
    margin: 0;
  }
  .confirm {
    position: fixed;
    inset: 0;
    margin: auto;
    height: fit-content;
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    border: 0;
    border-radius: 12px;
    padding: 1.25rem;
    width: min(28rem, calc(100vw - 2rem));
    box-sizing: border-box;
  }
  .confirm::backdrop {
    background: rgb(0 0 0 / 40%);
  }
  .confirm h3 {
    margin: 0 0 0.25rem;
  }
  .confirm-totals {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
  }
  .confirm-totals th {
    text-align: left;
    font-weight: 400;
  }
  .confirm-totals td {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .confirm-totals th,
  .confirm-totals td {
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--ja-line, #eef1f4);
  }
  .confirm-totals tfoot th {
    font-weight: 700;
    text-transform: none;
  }
  .time-week :global([data-ui='status-badge'][data-variant='success']) {
    background: #e8f6ec;
    color: #17663a;
    border-color: #a9dbb8;
  }
  .time-week :global([data-ui='status-badge'][data-variant='warning']) {
    background: #fff3d6;
    color: #8a5300;
    border-color: #f0c36d;
  }
  .time-week :global([data-ui='status-badge'][data-variant='info']) {
    background: #eaf2fd;
    color: #1d4f91;
    border-color: #b7d0f5;
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .time-history {
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
    padding: 0 1rem;
  }
  .time-history summary {
    cursor: pointer;
    min-height: var(--ja-target-min, 44px);
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 700;
  }
  .history-count {
    font-weight: 400;
    margin-right: auto;
  }
  .history-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0 0.75rem;
  }
  .history-filters label {
    flex: 1 1 10rem;
    display: grid;
  }
  .history-list {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
  }
  .history-list a {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.55rem 0;
    border-top: 1px solid var(--ja-line, #eef1f4);
    color: inherit;
    text-decoration: none;
  }
  .history-list a:hover .history-main > span:first-child {
    text-decoration: underline;
  }
  .history-main {
    display: grid;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .history-hours {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (max-width: 620px) {
    /* Keep the action bar above the fixed phone bottom navigation. */
    .sheet-actions {
      bottom: calc(4.2rem + env(safe-area-inset-bottom, 0px));
    }
  }

  @media (max-width: 760px) {
    .sheet-table-wrap {
      display: none;
    }
    .sheet-days {
      display: grid;
    }
    .worker-pick {
      width: 100%;
    }
    .week-nav {
      justify-content: space-between;
    }
    .week-label {
      flex: 1 1 0;
      min-width: 0;
      text-align: center;
    }
    .this-week {
      flex-basis: 100%;
      text-align: center;
    }
    .sheet-actions {
      margin: 0 -0.25rem;
    }
    .sheet-actions {
      padding: 0.5rem 0.75rem;
      gap: 0.4rem;
    }
    .sheet-actions-total small {
      display: none;
    }
    .sheet-actions-total small.unsaved {
      display: inline;
    }
    .sheet-actions-buttons {
      width: 100%;
      flex-wrap: nowrap;
    }
    .sheet-actions-buttons button {
      flex: 0 0 auto;
      line-height: 1.2;
      padding: 0.35rem 0.8rem;
    }
    .sheet-actions-buttons button.primary {
      flex: 1 1 0;
      min-width: 0;
    }
    .history-list a {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .history-date {
      grid-column: 1 / -1;
      font-size: 0.85rem;
      color: var(--ja-steel, #5b6573);
    }
  }
</style>
