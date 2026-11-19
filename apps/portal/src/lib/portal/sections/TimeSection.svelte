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
  import { afterNavigate, goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount, tick } from 'svelte';
  import { StatusBadge } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { localToday } from '../ui/time-entry-clock';
  import { weekDates, weekStartForDate } from './time-entry-actions';
  import { timeWeekText, type TimeWeekCopyKey } from './time-week-copy';
  import { captureTimeCategories, isCaptureTimeCategory } from '../time-categories';
  import {
    clockHoursText,
    DAY_MAX_MINUTES,
    DAY_WARN_MINUTES,
    hoursAndMinutesText,
    parseClockText,
    parseHoursText,
    personName,
    shiftMinutes,
  } from './time-hours';
  import TimeOverview from './TimeOverview.svelte';

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

  const categoryOrder = (category: string) => {
    const index = (captureTimeCategories as readonly string[]).indexOf(category);
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
          : category === 'standby'
            ? t('standby')
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
  /** Optional collapsed per-day detail (start, end, break, note), keyed like cells. */
  type DetailDraft = { start: string; end: string; breakMinutes: string; note: string };
  let detailEdits = $state<Record<string, DetailDraft>>({});
  /** Cell whose "+ detail" panel is open ('' = none). */
  let detailKey = $state('');
  let reason = $state('');
  type Intent = 'save' | 'submit' | 'submit_day' | 'submit_approve' | 'submit_day_approve';
  let busy = $state<'' | Intent>('');
  let intent = $state<Intent>('save');
  /** Inline "done" line for One day mode (kept until the next edit). */
  type DoneKind = 'saved' | 'sent' | 'approved' | 'deleted';
  type DayDone = { kind: DoneKind; minutes: number; day: string; category?: string };
  let dayDone = $state<DayDone | null>(null);
  let pendingDone: DayDone | null = null;
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
    /** Detail as it will be saved (stored or edited). */
    detail: DetailDraft;
    /** Minutes computed from start/end/break; null = no times; undefined = invalid times. */
    detailMinutes: number | null | undefined;
    detailChanged: boolean;
    /** Start or end typed without the other: saving waits, no error shown yet. */
    incomplete: boolean;
  };

  const parseHours = (value: string) => parseHoursText(value);
  /** Capture screens show hours as H:MM ("8:30"), never as decimals ("8.5"). */
  const hm = (minutes: unknown) => clockHoursText(Number(minutes ?? 0) || 0);
  const hoursText = (minutes: number) => (minutes ? hm(minutes) : '');
  const storedDetail = (entry?: Row): DetailDraft => ({
    start: entry?.start_time && entry?.end_time ? String(entry.start_time) : '',
    end: entry?.start_time && entry?.end_time ? String(entry.end_time) : '',
    breakMinutes:
      entry?.start_time && entry?.end_time && Number(entry.break_minutes ?? 0)
        ? String(Number(entry.break_minutes))
        : '',
    note: String(entry?.activity_summary ?? ''),
  });
  /** Only one of start/end typed so far: not an error yet, just not complete. */
  const detailIncomplete = (detail: DetailDraft): boolean => {
    const start = parseClockText(detail.start);
    const end = parseClockText(detail.end);
    return (start === null) !== (end === null) && start !== undefined && end !== undefined;
  };
  /** Worked minutes from a detail: null = no (complete) times, undefined = invalid. */
  const detailMinutesOf = (detail: DetailDraft): number | null | undefined => {
    const start = parseClockText(detail.start);
    const end = parseClockText(detail.end);
    if (start === null && end === null) return null;
    // Half-typed (start without end): validated only once both are given.
    if (detailIncomplete(detail)) return null;
    if (!start || !end) return undefined;
    const text = detail.breakMinutes.trim();
    if (!/^\d{0,4}$/u.test(text)) return undefined;
    return shiftMinutes(start, end, text ? Number(text) : 0);
  };
  const sameDetail = (a: DetailDraft, b: DetailDraft) =>
    (parseClockText(a.start) ?? '') === (parseClockText(b.start) ?? '') &&
    (parseClockText(a.end) ?? '') === (parseClockText(b.end) ?? '') &&
    (Number(a.breakMinutes || 0) || 0) === (Number(b.breakMinutes || 0) || 0) &&
    a.note.trim() === b.note.trim();
  const hasDetail = (detail: DetailDraft) =>
    Boolean(detail.start.trim() || detail.end.trim() || detail.note.trim());
  const overnight = (detail: DetailDraft) => {
    const start = parseClockText(detail.start);
    const end = parseClockText(detail.end);
    return Boolean(start && end && end <= start);
  };
  const detailSummary = (detail: DetailDraft) =>
    detail.start && detail.end
      ? `${parseClockText(detail.start) ?? detail.start}–${parseClockText(detail.end) ?? detail.end}${Number(detail.breakMinutes || 0) ? ` −${Number(detail.breakMinutes)} min` : ''}`
      : detail.start.trim() || detail.end.trim()
        ? `${parseClockText(detail.start) ?? '…'}–${parseClockText(detail.end) ?? '…'}`
        : detail.note.trim()
          ? '✎'
          : '';

  const cellFor = (row: SheetRow, date: string): Cell => {
    const key = cellKey(row, date);
    const list = cellEntries(row, date);
    const originalMinutes = list.reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0);
    let kind: CellKind;
    if (list.length === 0)
      kind = assigned(row.projectId, date) ? 'new' : 'unassigned';
    else if (list.length > 1) kind = 'multi';
    else if (editableDraft(list[0]!)) kind = 'draft';
    else if (String(list[0]!.approval_state) === 'needs_changes') kind = 'fix';
    else kind = 'locked';
    if (isAuditor && kind !== 'unassigned')
      kind = list.length ? 'locked' : 'unassigned';
    const editable = kind === 'new' || kind === 'draft' || kind === 'fix';
    const stored = storedDetail(list.length === 1 ? list[0] : undefined);
    const detail = editable && key in detailEdits ? detailEdits[key]! : stored;
    const detailMinutes = detailMinutesOf(detail);
    const detailChanged = editable && key in detailEdits && !sameDetail(detail, stored);
    // Start/end given: the hours are calculated (end - start - break).
    const value =
      editable && key in detailEdits && typeof detailMinutes === 'number'
        ? hoursText(detailMinutes) || '0:00'
        : editable && key in edits
          ? edits[key]!
          : hoursText(originalMinutes);
    const minutes =
      editable && key in detailEdits && detailMinutes === undefined ? undefined : parseHours(value);
    const statuses = [...new Set(list.map(entryStatus))];
    return {
      key,
      kind,
      entry: list.length === 1 ? list[0] : undefined,
      status: statuses.length === 1 ? statuses[0] : statuses.length ? 'submitted' : undefined,
      originalMinutes,
      value,
      minutes,
      changed:
        editable && minutes !== undefined && ((minutes ?? 0) !== originalMinutes || detailChanged),
      detail,
      detailMinutes,
      detailChanged,
      incomplete: editable && key in detailEdits && detailIncomplete(detail),
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
  /** Day totals across every row: warn above 12 h, block above 24 h. */
  const dayOver = (index: number) => (dayTotals[index] ?? 0) > DAY_MAX_MINUTES;
  const dayLong = (index: number) =>
    !dayOver(index) && (dayTotals[index] ?? 0) > DAY_WARN_MINUTES;
  const overDays = $derived(days.filter((_, index) => dayOver(index)));
  const longDays = $derived(days.filter((_, index) => dayLong(index)));
  const changedCells = $derived(grid.flatMap((line) => line.cells.filter((cell) => cell.changed)));
  const invalidCells = $derived(
    grid.flatMap((line) =>
      line.cells.filter((cell) => cell.minutes === undefined || cell.incomplete),
    ),
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
  /** Truthful week summary: one label only when every past day agrees. */
  const weekSummary = $derived.by(() => {
    const counts = { approved: 0, submitted: 0, needs_changes: 0, draft: 0, empty: 0 };
    for (const date of days) {
      const status = dayStatus(date);
      // Future days count only when they already have hours (never as missing).
      if (date > today && status === 'empty') continue;
      // Weekends without hours are normal and not counted as missing.
      if (status === 'empty' && [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay()))
        continue;
      counts[status === 'empty' ? 'empty' : status] += 1;
    }
    const parts: string[] = [];
    if (counts.needs_changes) parts.push(t('countNeedsChanges', { n: counts.needs_changes }));
    if (counts.draft) parts.push(t('countDraft', { n: counts.draft }));
    if (counts.submitted) parts.push(t('countSubmitted', { n: counts.submitted }));
    if (counts.approved) parts.push(t('countApproved', { n: counts.approved }));
    if (counts.empty) parts.push(t('countEmpty', { n: counts.empty }));
    const used = Object.entries(counts).filter(([key, value]) => key !== 'empty' && value > 0);
    if (used.length === 0) return { label: t('weekStatusEmpty'), status: 'empty' as const };
    if (used.length === 1 && counts.empty === 0)
      return {
        label:
          used[0]![0] === 'approved'
            ? t('weekStatusApproved')
            : used[0]![0] === 'submitted'
              ? t('weekStatusSubmitted')
              : used[0]![0] === 'needs_changes'
                ? t('weekStatusNeedsChanges')
                : t('weekStatusDraft'),
        status: used[0]![0] as CellStatus,
      };
    return { label: parts.join(' · '), status: weekStatus === 'approved' ? ('submitted' as const) : weekStatus };
  });
  const weekStatusLabel = $derived(weekSummary.label);
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
      return text;
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
    if (dirtyNow && !confirm(translate('Discard unsaved changes?'))) event.preventDefault();
  };
  const pickWorker = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (dirtyNow && !confirm(translate('Discard unsaved changes?'))) {
      (event.currentTarget as HTMLSelectElement).value = workerId;
      return;
    }
    edits = {};
    detailEdits = {};
    extraRows = [];
    void goto(sheetHref({ worker: value }), { noScroll: true, keepFocus: true });
  };

  $effect(() => {
    if (!dirtyNow) return;
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
      detailEdits = {};
      detailKey = '';
      extraRows = [];
      reason = '';
    }
    sheetIdentity = identity;
  });

  const setCell = (key: string, value: string) => {
    dayDone = null;
    edits = { ...edits, [key]: value };
  };

  const detailPayload = (detail: DetailDraft) => ({
    start: detail.start.trim(),
    end: detail.end.trim(),
    breakMinutes: detail.start.trim() && detail.end.trim() ? detail.breakMinutes.trim() : '',
    note: detail.note.trim(),
  });
  const setDetail = (key: string, field: keyof DetailDraft, value: string, base: DetailDraft) => {
    dayDone = null;
    detailEdits = { ...detailEdits, [key]: { ...(detailEdits[key] ?? base), [field]: value } };
  };
  const clearDetail = (key: string) => {
    detailEdits = { ...detailEdits, [key]: { start: '', end: '', breakMinutes: '', note: '' } };
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
                ...(cell.key in detailEdits ? { detail: detailPayload(cell.detail) } : {}),
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
    const deleting = deletingDay;
    pendingDone = deleting
      ? { kind: 'deleted', minutes: dayCell?.originalMinutes ?? 0, day: selectedDay }
      : mode === 'day' && (intent === 'save' || intent === 'submit_day' || intent === 'submit_day_approve')
        ? intent === 'save'
          ? // X2: "saved" names this entry only, not the whole day.
            { kind: 'saved', minutes: dayCell?.minutes ?? 0, day: selectedDay, category: dayCategory }
          : {
              kind: intent === 'submit_day_approve' ? 'approved' : 'sent',
              minutes: dayUnsentMinutes,
              day: selectedDay,
            }
        : null;
    return async ({ result: outcome, update }) => {
      busy = '';
      deletingDay = false;
      confirmingDelete = false;
      if (outcome.type !== 'success' && deleting) deleteError = t('deleteFailed');
      if (outcome.type === 'success') {
        edits = {};
        detailEdits = {};
        detailKey = '';
        extraRows = [];
        reason = '';
        rememberDayChoice();
      }
      await update({ reset: false, invalidateAll: true });
      dayDone = outcome.type === 'success' ? pendingDone : null;
      intent = 'save';
    };
  };
  const saveAndSend = (approve = false) => {
    intent = approve ? 'submit_day_approve' : 'submit_day';
    void tick().then(() => sheetForm?.requestSubmit());
  };
  const save = () => {
    intent = 'save';
    sheetForm?.requestSubmit();
  };
  const openConfirm = () => {
    if (invalidCells.length) return;
    confirmDialog?.showModal();
  };
  const confirmSubmit = async (approve = false) => {
    confirmDialog?.close();
    intent = approve ? 'submit_approve' : 'submit';
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

  const workerName = (id: string) => personName(workers.find((worker) => worker.id === id)?.name ?? '');
  // ---- Optional signed activity sheet for the week ----
  const weekSheets = $derived(data.weekSheets ?? []);
  let sheetBusy = $state(false);
  let sheetMessage = $state<string | null>(null);
  const attachSheet: SubmitFunction = () => {
    sheetBusy = true;
    sheetMessage = null;
    return async ({ result: outcome, update, formElement }) => {
      sheetBusy = false;
      if (outcome.type === 'success') {
        formElement.reset();
        await update({ reset: false, invalidateAll: true });
        sheetMessage = 'done';
        return;
      }
      const failure = outcome.type === 'failure' ? (outcome.data as SheetResult | undefined) : undefined;
      const text = failure?.messageKey ? translate(failure.messageKey) : '';
      sheetMessage = text && text !== failure?.messageKey ? text : t('sheetFailed');
    };
  };
  /** Owner logging for another person: "Save & approve" (same audited approval path). */
  const forOther = $derived(delegating && workerId !== data.user.id);
  const canApproveNow = $derived(forOther && data.user.role === 'owner_admin' && canSubmit);

  // ---- Capture modes: "One day" (fast) and "Whole week" (grid) ----
  const mode = $derived<'day' | 'week'>(
    $page.url.searchParams.get('mode') === 'week' ? 'week' : 'day',
  );
  const selectedDay = $derived(
    data.timeDay && days.includes(data.timeDay)
      ? data.timeDay
      : days.includes(today)
        ? today
        : (days[0] ?? today),
  );
  const shiftDay = (offset: number) => {
    const date = new Date(`${selectedDay}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const dayProjects = $derived(
    projects.filter((project) => assigned(String(project.id), selectedDay)),
  );
  let dayProjectChoice = $state('');
  let dayCategory = $state<string>('regular');
  // All four types are shown inline (only one was ever hidden behind "More types").
  const dayCategoryChoices: readonly string[] = captureTimeCategories;
  const dayProject = $derived(
    dayProjects.some((project) => String(project.id) === dayProjectChoice)
      ? dayProjectChoice
      : String(dayProjects[0]?.id ?? ''),
  );
  const dayRow = $derived<SheetRow>({
    key: `${dayProject}|${dayCategory}`,
    projectId: dayProject,
    category: dayCategory,
  });
  const dayCell = $derived(dayProject ? cellFor(dayRow, selectedDay) : null);
  /** Sent/approved/locked hours are read-only here: no Type choice, no Save buttons. */
  const dayEditable = $derived(
    !!dayCell && (dayCell.kind === 'new' || dayCell.kind === 'draft' || dayCell.kind === 'fix'),
  );
  /** "Log other hours this day" reveals the Type choice on a read-only day. */
  let dayOtherTypes = $state(false);
  $effect(() => {
    void selectedDay;
    dayOtherTypes = false;
  });
  const dayEntries = $derived(entries.filter((entry) => String(entry.work_date) === selectedDay));
  const dayTotal = $derived(
    dayEntries.reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0),
  );
  const weekDraftMinutes = $derived(
    entries
      .filter((entry) => String(entry.approval_state) === 'draft')
      .reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0),
  );
  /** X7: "Log other hours" jumps to the first type that can still take hours this day. */
  const openOtherTypes = () => {
    dayOtherTypes = true;
    const next = dayCategoryChoices.find((category) => {
      const kind = cellFor({ key: `${dayProject}|${category}`, projectId: dayProject, category }, selectedDay).kind;
      return kind === 'new' || kind === 'draft' || kind === 'fix';
    });
    if (next && next !== dayCategory) chooseDay(dayProject, next);
  };
  const chooseDay = (projectId: string, category: string) => {
    edits = {};
    detailEdits = {};
    detailKey = '';
    dayDone = null;
    if (projectId !== dayProjectChoice) dayOtherTypes = false;
    dayProjectChoice = projectId;
    dayCategory = category;
    confirmingDelete = false;
    deleteError = '';
  };
  // Remember the last project and type so the next "Log hours" is just hours -> Save.
  const lastChoiceKey = () => `ja.time.lastDay.${String(data.user.id)}`;
  const rememberDayChoice = () => {
    if (mode !== 'day' || delegating) return;
    try {
      localStorage.setItem(lastChoiceKey(), JSON.stringify({ projectId: dayProject, category: dayCategory }));
    } catch {
      /* Remembering is only a convenience. */
    }
  };
  onMount(() => {
    if (!delegating) {
      try {
        const saved = JSON.parse(localStorage.getItem(lastChoiceKey()) ?? 'null') as {
          projectId?: unknown;
          category?: unknown;
        } | null;
        if (saved && typeof saved.projectId === 'string') dayProjectChoice = saved.projectId;
        if (saved && isCaptureTimeCategory(saved.category)) dayCategory = saved.category;
      } catch {
        /* Ignore unreadable preferences. */
      }
    }
    // "Edit draft" links open the draft's own project and type (the day comes from ?day=).
    const linkedProject = $page.url.searchParams.get('project');
    const linkedCategory = $page.url.searchParams.get('category');
    if (linkedProject) dayProjectChoice = linkedProject;
    if (isCaptureTimeCategory(linkedCategory)) dayCategory = linkedCategory;
  });
  // Home "Log hours" opens One day for today with the cursor in Hours (after
  // navigation, so the router's focus reset does not steal it).
  afterNavigate(() => {
    if ($page.url.searchParams.get('focus') !== 'hours') return;
    void tick().then(() =>
      setTimeout(
        () => document.querySelector<HTMLInputElement>('[data-testid="time-day-hours"]')?.focus(),
        0,
      ),
    );
  });
  let deletingDay = $state(false);
  const submitCells = $derived(
    mode === 'day' && deletingDay && dayCell?.entry
      ? [
          {
            projectId: dayRow.projectId,
            category: dayRow.category,
            workDate: selectedDay,
            hours: '0',
            id: String(dayCell.entry.id),
            version: Number(dayCell.entry.version),
          },
        ]
      : mode === 'day'
      ? dayCell?.changed
        ? [
            {
              projectId: dayRow.projectId,
              category: dayRow.category,
              workDate: selectedDay,
              hours: dayCell.value,
              ...(dayCell.entry
                ? { id: String(dayCell.entry.id), version: Number(dayCell.entry.version) }
                : {}),
              ...(dayCell.key in detailEdits ? { detail: detailPayload(dayCell.detail) } : {}),
            },
          ]
        : []
      : payloadCells,
  );
  const dirtyNow = $derived(mode === 'day' ? Boolean(dayCell?.changed) : dirty);
  const dayDraftCount = $derived(
    dayEntries.filter((entry) => String(entry.approval_state) === 'draft').length,
  );
  // "Submit week" reminder only near the end of the week (Fri-Sun) or for past weeks.
  const weekEndNear = $derived(
    weekStart < String(weekStartForDate(today) ?? today) || new Date(`${today}T00:00:00Z`).getUTCDay() % 6 === 0 || new Date(`${today}T00:00:00Z`).getUTCDay() === 5,
  );
  const dayIndex = $derived(days.indexOf(selectedDay));
  const dayModeTotal = $derived(
    dayCell
      ? dayEntries.reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0) -
          dayCell.originalMinutes +
          (dayCell.minutes ?? 0)
      : 0,
  );
  /** Hours of this day that "Save & send" sends: drafts and returned entries (incl. this edit). */
  const dayUnsentMinutes = $derived(
    dayEntries
      .filter((entry) => ['draft', 'needs_changes'].includes(String(entry.approval_state)))
      .reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0) +
      (dayCell && (dayCell.kind === 'draft' || dayCell.kind === 'fix' || dayCell.kind === 'new')
        ? (dayCell.minutes ?? 0) - dayCell.originalMinutes
        : 0),
  );
  const invalidNow = $derived(
    mode === 'day'
      ? Boolean(dayCell) &&
          (dayCell!.minutes === undefined || dayCell!.incomplete || dayModeTotal > DAY_MAX_MINUTES)
      : invalidCells.length > 0 || overDays.length > 0,
  );
  /** Week mode only: One day shows each problem once, next to its field. */
  const blockReason = $derived(
    invalidNow
      ? overDays.length > 0
        ? t('dayOver24')
        : invalidCells.every((cell) => cell.incomplete)
          ? t('detailIncomplete')
          : invalidCells.some((cell) => cell.key in detailEdits && cell.detailMinutes === undefined)
            ? t('detailInvalid')
            : t('invalidHours')
      : '',
  );
  /** On leaving a cell, show the value in the same H:MM notation ("7.5" -> "7:30"). */
  const normalizeCell = (key: string) => {
    const raw = edits[key];
    if (raw === undefined) return;
    const minutes = parseHoursText(raw);
    if (typeof minutes === 'number') edits = { ...edits, [key]: hoursText(minutes) || '0:00' };
  };
  const minutesHint = (minutes: number | null | undefined) =>
    typeof minutes === 'number' && minutes % 30 !== 0
      ? `= ${hoursAndMinutesText(minutes)}`
      : '';
  // ---- One day: delete a draft entry (never a submitted/approved one) ----
  let confirmingDelete = $state(false);
  let deleteError = $state('');
  const canDeleteDay = $derived(
    !isAuditor &&
      Boolean(dayCell?.entry) &&
      dayCell?.kind === 'draft' &&
      !dayCell.entry?.submitted_at,
  );
  /**
   * Delete = save this never-submitted draft cell as 0 h through the same
   * saveTimeWeek command (server: deleteTime, which refuses anything that is
   * not an unlocked, never-submitted draft). Same audit and RBAC path.
   */
  const deleteDay = () => {
    if (!dayCell?.entry) return;
    deleteError = '';
    deletingDay = true;
    intent = 'save';
    void tick().then(() => sheetForm?.requestSubmit());
  };
  /** Why a sent entry cannot be changed here (the state machine has no "unsend"). */
  const lockedHelp = (cell: Cell): string =>
    cell.kind !== 'locked'
      ? ''
      : cell.status === 'submitted'
        ? t('submittedHelp')
        : cell.status === 'approved'
          ? t('approvedHelp')
          : '';
  const fixingNow = $derived(
    mode === 'day' ? Boolean(dayCell?.changed && dayCell.kind === 'fix') : fixingCells.length > 0,
  );
  let pickerOpen = $state(false);
  const showPicker = $derived(
    delegating && (pickerOpen || workerId !== data.user.id || dayProjects.length + rows.length === 0),
  );
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
      class:is-invalid={cell.minutes === undefined || cell.incomplete || problemKey === cell.key || dayOver(index)}
      data-status={cell.kind === 'new' ? 'empty' : cell.status}
      type="text"
      inputmode="decimal"
      autocomplete="off"
      maxlength="7"
      placeholder="–"
      readonly={typeof cell.detailMinutes === 'number'}
      aria-label={label}
      aria-invalid={cell.minutes === undefined || problemKey === cell.key || dayOver(index)}
      aria-describedby={cell.minutes === undefined || cell.incomplete ? `${cell.key}-error` : undefined}
      title={typeof cell.detailMinutes === 'number' ? t('detailFromTimes') : minutesHint(cell.minutes)}
      value={cell.value}
      oninput={(event) => setCell(cell.key, event.currentTarget.value)}
      onblur={() => normalizeCell(cell.key)}
    />
    {#if detailKey !== cell.key && (cell.minutes === undefined || cell.incomplete)}
      <small class="cell-error" id={`${cell.key}-error`}>{cell.incomplete ? t('detailIncompleteShort') : cell.detailMinutes === undefined && cell.key in detailEdits ? t('detailInvalid') : t('invalidHoursShort')}</small>
    {/if}
    <button
      type="button"
      class="detail-toggle"
      class:has-detail={hasDetail(cell.detail)}
      aria-expanded={detailKey === cell.key}
      aria-label={t('detailLabel', { project: `${projectLabel(line.row.projectId)} (${categoryLabel(line.row.category)})`, day: dayName(date, 'long') })}
      title={t('detailHint')}
      onclick={() => (detailKey = detailKey === cell.key ? '' : cell.key)}
      data-testid="time-detail-toggle">{hasDetail(cell.detail) ? detailSummary(cell.detail) : t('detailAdd')}</button
    >
  {:else}
    <span
      class="hours-locked"
      data-status={cell.kind === 'unassigned' ? 'unassigned' : cell.status}
      title={[cellTitle(cell), detailSummary(cell.detail) !== '✎' ? detailSummary(cell.detail) : '', cell.detail.note].filter(Boolean).join(' · ')}
      aria-label={`${label}: ${cell.kind === 'unassigned' ? cellTitle(cell) : `${hoursText(cell.originalMinutes) || '0:00'} ${t('hoursUnit')} · ${statusLabel(cell.status ?? 'submitted')}`}`}
    >
      {#if cell.kind === 'unassigned'}
        ·
      {:else}
        {hoursText(cell.originalMinutes) || '0:00'}
        {#if cell.status === 'approved'}<span aria-hidden="true" class="mark">✓</span>{:else if cell.status === 'submitted'}<span
            aria-hidden="true"
            class="mark">⏳</span
          >{/if}
      {/if}
    </span>
    {#if cell.kind !== 'unassigned' && hasDetail(cell.detail)}
      <small class="detail-ro" title={cell.detail.note}>{detailSummary(cell.detail)}</small>
    {/if}
  {/if}
{/snippet}

{#snippet detailPanel(cell: Cell, title: string)}
  {@const base = cell.detail}
  <div class="detail-panel" data-testid="time-detail-panel">
    <p class="detail-title"><strong>{title}</strong></p>
    <p class="muted small">{t('detailHint')}</p>
    <div class="detail-grid">
      <label>
        <span>{t('detailStart')}</span>
        <input
          type="time"
          value={cell.detail.start}
          oninput={(event) => setDetail(cell.key, 'start', event.currentTarget.value, base)}
          data-testid="time-detail-start"
        />
      </label>
      <label>
        <span>{t('detailEnd')}</span>
        <input
          type="time"
          value={cell.detail.end}
          oninput={(event) => setDetail(cell.key, 'end', event.currentTarget.value, base)}
          data-testid="time-detail-end"
        />
      </label>
      <label>
        <span>{t('detailBreak')}</span>
        <input
          type="text"
          inputmode="numeric"
          maxlength="4"
          placeholder="0"
          value={cell.detail.breakMinutes}
          oninput={(event) => setDetail(cell.key, 'breakMinutes', event.currentTarget.value, base)}
          data-testid="time-detail-break"
        />
      </label>
    </div>
    <label class="detail-note">
      <span>{t('detailNote')}</span>
      <input
        type="text"
        maxlength="500"
        placeholder={t('detailNotePlaceholder')}
        value={cell.detail.note}
        oninput={(event) => setDetail(cell.key, 'note', event.currentTarget.value, base)}
        data-testid="time-detail-note"
      />
    </label>
    {#if cell.incomplete}
      <small class="muted" data-testid="time-detail-incomplete">{t('detailIncomplete')}</small>
    {:else if cell.detailMinutes === undefined}
      <small class="cell-error" role="alert">{t('detailInvalid')}</small>
    {:else if typeof cell.detailMinutes === 'number'}
      <small class="detail-computed" data-testid="time-detail-computed"
        >{t('detailComputed', { hours: hm(cell.detailMinutes) })}{overnight(cell.detail) ? ` · ${t('detailOvernight')}` : ''}</small
      >
    {/if}
    <div class="detail-actions">
      <button type="button" class="secondary" onclick={() => (detailKey = '')} data-testid="time-detail-done">{t('detailDone')}</button>
      {#if hasDetail(cell.detail)}
        <button type="button" class="link" onclick={() => clearDetail(cell.key)}>{t('detailClear')}</button>
      {/if}
    </div>
  </div>
{/snippet}

{#if data.canReviewTime && !isAuditor}
  <nav class="view-tabs" aria-label={t('title')}>
    <a
      href={sheetHref({ view: 'capture' })}
      aria-current={data.timeView !== 'overview' ? 'page' : undefined}
      onclick={leaveGuard}
      data-testid="time-tab-capture">{t('tabCapture')}</a
    >
    <a
      href={sheetHref({ view: 'overview' })}
      aria-current={data.timeView === 'overview' ? 'page' : undefined}
      onclick={leaveGuard}
      data-testid="time-tab-overview">{t('tabOverview')}</a
    >
  </nav>
{/if}

{#if data.timeView === 'overview' && data.overview}
  <TimeOverview {locale} {data} {controlledValue} />
{:else}
<section class="time-week" aria-labelledby="time-week-title" data-testid="time-week">
  <h2 id="time-week-title" class="sr-only">{t('title')}</h2>
  <div class="mode-tabs" role="group" aria-label={t('title')}>
    <a
      href={sheetHref({ mode: null, day: mode === 'week' ? null : selectedDay, week: null })}
      aria-current={mode === 'day' ? 'page' : undefined}
      onclick={leaveGuard}
      data-sveltekit-noscroll
      data-testid="time-mode-day">{t('modeDay')}</a
    >
    <a
      href={sheetHref({ mode: 'week', day: null, week: weekStart })}
      aria-current={mode === 'week' ? 'page' : undefined}
      onclick={leaveGuard}
      data-sveltekit-noscroll
      data-testid="time-mode-week">{t('modeWeek')}</a
    >
  </div>

  {#if delegating}
    <div class="worker-line">
      {#if showPicker}
        <label class="worker-pick">
          <span>{t('loggingFor')}</span>
          {#if workers.length}
            <select value={workerId} onchange={pickWorker} data-testid="time-worker-select">
              {#if !workers.some((worker) => worker.id === data.user.id)}
                <option value={data.user.id}>{t('myself')}</option>
              {/if}
              {#each workers as worker (worker.id)}
                <option value={worker.id}>{worker.id === data.user.id ? t('myself') : personName(worker.name) || worker.id}</option>
              {/each}
            </select>
          {:else}
            <span class="muted">{t('noWorkers')}</span>
          {/if}
        </label>
      {:else}
        <button type="button" class="link small" onclick={() => (pickerOpen = true)} data-testid="time-log-for-other"
          >{t('logForSomeoneElse')}</button
        >
      {/if}
    </div>
  {/if}

  {#if mode === 'week'}
  <nav class="week-nav" aria-label={t('week')}>
    <a
      class="week-arrow"
      href={sheetHref({ mode: 'week', week: shiftWeek(-1), day: null })}
      onclick={leaveGuard}
      aria-label={t('previousWeek')}
      data-sveltekit-noscroll>‹</a
    >
    <div class="week-label">
      <strong>{rangeLabel}</strong>
      <StatusBadge variant={variant(weekSummary.status)} text={weekStatusLabel} data-testid="week-status" />
    </div>
    <a
      class="week-arrow"
      href={sheetHref({ mode: 'week', week: shiftWeek(1), day: null })}
      onclick={leaveGuard}
      aria-label={t('nextWeek')}
      data-sveltekit-noscroll>›</a
    >
    {#if weekStart !== currentWeek}
      <a class="this-week" href={sheetHref({ mode: 'week', week: null, day: null })} onclick={leaveGuard} data-sveltekit-noscroll
        >{t('thisWeek')}</a
      >
    {/if}
  </nav>
  {:else}
  <nav class="week-nav" aria-label={t('day')}>
    <a
      class="week-arrow"
      href={sheetHref({ day: shiftDay(-1), week: null })}
      onclick={leaveGuard}
      aria-label={t('previousDay')}
      data-sveltekit-noscroll>‹</a
    >
    <div class="week-label">
      <strong data-testid="time-day-label">{dayName(selectedDay, 'long')}</strong>
      {#if dayStatus(selectedDay) !== 'empty'}
        <StatusBadge variant={variant(dayStatus(selectedDay))} text={statusLabel(dayStatus(selectedDay))} />
      {/if}
    </div>
    <a
      class="week-arrow"
      href={sheetHref({ day: shiftDay(1), week: null })}
      onclick={leaveGuard}
      aria-label={t('nextDay')}
      data-sveltekit-noscroll>›</a
    >
    {#if selectedDay !== today}
      <a class="this-week" href={sheetHref({ day: null, week: null })} onclick={leaveGuard} data-sveltekit-noscroll
        >{t('today')}</a
      >
    {/if}
  </nav>
  {/if}

  {#if returned.length}
    <div class="returned" role="status" data-testid="time-needs-changes">
      <p><strong>{t('statusNeedsChanges')}.</strong> {mode === 'day' && canSubmit ? t('needsChangesHelpDay') : t('needsChangesHelp')}</p>
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

  {#if (mode === 'week' ? rows.length : dayProjects.length + dayEntries.length) === 0}
    <p class="sheet-empty" data-testid="time-no-projects">
      {delegating && !workers.length
        ? t('noWorkers')
        : delegating && workerId === data.user.id
          ? t('noProjectsPickWorker')
          : t('noProjects')}
    </p>
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
      <input type="hidden" name="cells" value={JSON.stringify(submitCells)} />
      <input type="hidden" name="expected" value={JSON.stringify(expectedDrafts)} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="reason" value={reason} />

      {#if mode === 'day'}
        <div class="day-form" data-testid="time-day-form">
          {#if dayProjects.length > 1 && dayProjects.length <= 4}
            <fieldset class="day-field segmented segmented-projects" data-testid="time-day-project-choices">
              <legend>{t('project')}</legend>
              {#each dayProjects as project (project.id)}
                <label class:is-selected={dayProject === String(project.id)}>
                  <input
                    type="radio"
                    name="dayProject"
                    value={String(project.id)}
                    checked={dayProject === String(project.id)}
                    onchange={() => chooseDay(String(project.id), dayCategory)}
                  />
                  {projectLabel(String(project.id))}
                </label>
              {/each}
            </fieldset>
          {:else if dayProjects.length > 1}
            <label class="day-field">
              <span>{t('project')}</span>
              <select value={dayProject} onchange={(event) => chooseDay(event.currentTarget.value, dayCategory)} data-testid="time-day-project">
                {#each dayProjects as project (project.id)}
                  <option value={String(project.id)}>{projectLabel(String(project.id))}</option>
                {/each}
              </select>
            </label>
          {:else if dayProject}
            <div class="day-field">
              <span>{t('project')}</span>
              <strong>{projectLabel(dayProject)}</strong>
            </div>
          {/if}
          {#if dayProject && !dayEditable && !dayOtherTypes}
            <div class="day-field" data-testid="time-day-type-readonly">
              <span>{t('type')}</span>
              <strong>{categoryLabel(dayCategory)}</strong>
            </div>
          {/if}
          {#if dayProject && (dayEditable || dayOtherTypes)}
            <fieldset class="day-field segmented">
              <legend>{t('type')}</legend>
              {#each dayCategoryChoices as category (category)}
                <label class:is-selected={dayCategory === category}>
                  <input
                    type="radio"
                    name="dayCategory"
                    value={category}
                    checked={dayCategory === category}
                    onchange={() => chooseDay(dayProject, category)}
                  />
                  {categoryLabel(category)}
                </label>
              {/each}
            </fieldset>
          {/if}
          {#if dayProject}
            <label class="day-field day-hours">
              <span>{t('hours')}</span>
              {#if dayCell && (dayCell.kind === 'new' || dayCell.kind === 'draft' || dayCell.kind === 'fix')}
                <input
                  class="hours-input big"
                  class:is-invalid={dayCell.minutes === undefined || problemKey === dayCell.key}
                  data-status={dayCell.kind === 'new' ? 'empty' : dayCell.status}
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  maxlength="7"
                  placeholder="0:00"
                  readonly={typeof dayCell.detailMinutes === 'number'}
                  title={typeof dayCell.detailMinutes === 'number' ? t('detailFromTimes') : undefined}
                  value={dayCell.value}
                  oninput={(event) => setCell(dayCell.key, event.currentTarget.value)}
                  onblur={() => normalizeCell(dayCell.key)}
                  aria-invalid={dayCell.minutes === undefined || dayModeTotal > DAY_MAX_MINUTES}
                  data-testid="time-day-hours"
                />
                {#if dayCell.key in detailEdits && (dayCell.incomplete || dayCell.detailMinutes === undefined)}
                  <!-- Start/end problems are explained once, inside the open detail panel. -->
                  {#if detailKey !== dayCell.key}<small class="cell-error" role="alert">{dayCell.incomplete ? t('detailIncomplete') : t('detailInvalid')}</small>{/if}
                {:else if dayCell.minutes === undefined}
                  <small class="cell-error" role="alert">{t('invalidHours')}</small>
                {:else if dayModeTotal > DAY_MAX_MINUTES}
                  <small class="cell-error" role="alert">{t('dayOver24')}</small>
                {:else if dayModeTotal > DAY_WARN_MINUTES}
                  <small class="cell-warn">{t('dayOver12', { hours: hm(dayModeTotal), day: dayName(selectedDay) })}</small>
                {:else if minutesHint(dayCell.minutes)}
                  <small class="muted">{minutesHint(dayCell.minutes)}</small>
                {/if}
                {#if dayCell.kind === 'draft'}<small class="muted">{t('dayDraftHint')}</small>{/if}
              {:else if dayCell}
                <span class="hours-locked big" data-status={dayCell.status}
                  >{hoursText(dayCell.originalMinutes) || '0:00'} {t('hoursUnit')}</span
                >
                <small class="muted">{cellTitle(dayCell)}</small>
                {#if lockedHelp(dayCell)}<small class="locked-help" data-testid="time-day-locked-help">{lockedHelp(dayCell)}</small>{/if}
                {#if hasDetail(dayCell.detail)}<small class="muted">{detailSummary(dayCell.detail)} {dayCell.detail.note}</small>{/if}
              {/if}
            </label>
            {#if dayCell && (dayCell.kind === 'new' || dayCell.kind === 'draft' || dayCell.kind === 'fix')}
              {#if detailKey === dayCell.key}
                {@render detailPanel(dayCell, t('detailTitle', { day: dayName(selectedDay, 'long'), project: projectLabel(dayRow.projectId) }))}
              {:else}
                <button
                  type="button"
                  class="detail-toggle day"
                  class:has-detail={hasDetail(dayCell.detail)}
                  aria-expanded="false"
                  onclick={() => (detailKey = dayCell.key)}
                  data-testid="time-detail-toggle"
                  >{hasDetail(dayCell.detail) ? `${t('ovDetail')}: ${detailSummary(dayCell.detail)}` : t('detailAdd')}</button
                >
              {/if}
            {/if}
          {/if}
          {#if dayProject && !isAuditor}
            <input type="hidden" name="day" value={selectedDay} />
            {#if !dayEditable && !dirtyNow}
              {#if !dayOtherTypes && dayCategoryChoices.length > 1}
                <button
                  type="button"
                  class="link day-other-types"
                  onclick={openOtherTypes}
                  data-testid="time-day-other-types">{t('dayOtherTypes')}</button
                >
              {/if}
            {:else}
            <div class="day-buttons">
              {#if canApproveNow}
                <button
                  type="button"
                  class="primary wide"
                  disabled={(!dirtyNow && dayDraftCount === 0) || Boolean(busy) || invalidNow}
                  onclick={() => saveAndSend(true)}
                  data-testid="time-day-approve"
                  >{busy === 'submit_day_approve' ? t('approving') : t('saveApprove')}</button
                >
              {/if}
              {#if canSubmit}
                <button
                  type="button"
                  class={canApproveNow ? 'secondary wide' : 'primary wide'}
                  disabled={(!dirtyNow && dayDraftCount === 0) || Boolean(busy) || invalidNow}
                  onclick={() => saveAndSend()}
                  data-testid="time-day-send"
                  >{busy === 'submit_day' ? t('sendingDay') : t('saveAndSend')}</button
                >
              {/if}
              <button
                type="button"
                class={canSubmit ? 'secondary wide' : 'primary wide'}
                disabled={!dirtyNow || Boolean(busy) || invalidNow}
                onclick={save}
                data-testid="time-day-save"
                >{busy === 'save' ? t('saving') : canSubmit ? t('saveDraftOnly') : t('save')}</button
              >
            </div>
            {/if}
            {#if canDeleteDay && dayCell}
              <div class="day-delete">
                {#if confirmingDelete}
                  <div class="day-delete-confirm" role="alertdialog" aria-label={t('deleteConfirm', { hours: hm(dayCell.originalMinutes), day: dayName(selectedDay, 'long') })} data-testid="time-day-delete-confirm">
                    <p>{t('deleteConfirm', { hours: hm(dayCell.originalMinutes), day: dayName(selectedDay, 'long') })}</p>
                    <button type="button" class="danger" disabled={Boolean(busy)} onclick={deleteDay} data-testid="time-day-delete-yes">{deletingDay ? t('deleting') : t('deleteYes')}</button>
                    <button type="button" class="secondary" onclick={() => (confirmingDelete = false)}>{t('deleteKeep')}</button>
                  </div>
                {:else}
                  <button type="button" class="link danger-link" disabled={Boolean(busy)} onclick={() => (confirmingDelete = true)} data-testid="time-day-delete">{t('deleteEntry')}</button>
                {/if}
              </div>
            {/if}
            {#if deleteError}<p class="cell-error" role="alert">{deleteError}</p>{/if}
            {#if dayDone && dayDone.day === selectedDay}
              <p class="day-done" role="status" data-testid="time-day-done">
                <span aria-hidden="true">✓</span>
                {t(dayDone.kind === 'approved' ? 'approvedDay' : dayDone.kind === 'sent' ? 'sentDay' : dayDone.kind === 'deleted' ? 'deletedDay' : 'savedEntry', {
                  hours: hm(dayDone.minutes),
                  day: dayName(dayDone.day, 'long'),
                  type: categoryLabel(dayDone.category ?? dayCategory),
                })}
              </p>
            {/if}
          {/if}
        </div>
        {#if dayEntries.length}
          <div class="day-logged">
            <h3>{t('loggedThisDay')} · {hm(dayTotal)} {t('hoursUnit')}</h3>
            <ul>
              {#each dayEntries as entry (entry.id)}
                <li>
                  <button
                    type="button"
                    class="link plain"
                    onclick={() => chooseDay(String(entry.project_id), String(entry.category))}
                  >
                    <span>{projectLabel(String(entry.project_id))} · {categoryLabel(String(entry.category))}</span>
                    <strong>{hm(entry.minutes)} {t('hoursUnit')}</strong>
                  </button>
                  <StatusBadge variant={variant(entryStatus(entry))} text={statusLabel(entryStatus(entry))} />
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {:else}
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
                  <span class="sr-only">{`${hm(dayTotals[index] ?? 0)} ${t('hoursUnit')}`}</span>
                </th>
              {/each}
              <th scope="col" class="col-total" data-portal-live-text>{t('total')}</th>
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
                  {hm(line.cells.reduce((sum, cell) => sum + cellMinutes(cell), 0))}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" class="col-project">{t('dayTotal')}</th>
              {#each dayTotals as total, index (days[index])}
                <td class:day-over={dayOver(index)} class:day-long={dayLong(index)}>
                  {hm(total)}
                  {#if dayOver(index)}<small class="cell-error">{t('over24Short')}</small>{/if}
                </td>
              {/each}
              <td class="col-total week-total" data-testid="week-total">{hm(weekTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {#each grid as line (line.row.key)}
        {#each line.cells as cell, index (cell.key)}
          {#if detailKey === cell.key}
            <div class="detail-desktop">
              {@render detailPanel(cell, t('detailTitle', { day: dayName(days[index]!, 'long'), project: `${projectLabel(line.row.projectId)} (${categoryLabel(line.row.category)})` }))}
            </div>
          {/if}
        {/each}
      {/each}

      <!-- Phone: one card per day -->
      <ol class="sheet-days" data-testid="time-week-days">
        {#each days as date, index (date)}
          <li class="day-card" class:is-today={date === today}>
            <!-- All 7 days start open (small rows): no extra tap per day, and typing never re-collapses a card. -->
            <details open>
            <summary class="day-card-head">
              <strong>{dayName(date, 'long')}</strong>
              {#if dayStatus(date) !== 'empty'}
                <StatusBadge variant={variant(dayStatus(date))} text={statusLabel(dayStatus(date))} />
              {/if}
              <span class="day-card-total" class:day-over={dayOver(index)}>{hm(dayTotals[index])} {t('hoursUnit')}</span>
            </summary>
            {#if dayOver(index)}<p class="cell-error">{t('dayOver24')}</p>{/if}
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
                    {#if detailKey === cell.key}
                      <div class="detail-phone">
                        {@render detailPanel(cell, t('detailTitle', { day: dayName(date, 'long'), project: projectLabel(line.row.projectId) }))}
                      </div>
                    {/if}
                  </li>
                {/if}
              {/each}
            </ul>
            </details>
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
                  {#each captureTimeCategories as category (category)}
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

      {/if}

      {#if fixingNow}
        <label class="fix-reason">
          <span>{t('correctionReason')}</span>
          <input type="text" maxlength="500" bind:value={reason} />
          <small class="muted">{t('correctionReasonHint')}</small>
        </label>
      {/if}

      {#if invalidNow && mode === 'week' && (overDays.length > 0 || !invalidCells.every((cell) => cell.key === detailKey))}
        <p class="invalid-hint" role="alert">{blockReason}</p>
      {:else if mode === 'week' && longDays.length}
        <p class="cell-warn" role="status" data-testid="time-long-days">
          {t('longDays', {
            days: longDays
              .map((date) => `${dayName(date)} (${hm(dayTotals[days.indexOf(date)])} ${t('hoursUnit')})`)
              .join(', '),
          })}
        </p>
      {/if}

      {#if !isAuditor}
        {#if mode === 'day'}
          <div class="sheet-actions day-actions" data-testid="time-day-actions">
            <p class="week-summary">
              {t('weekSoFar', { hours: hm(weekTotal) })}
              {#if weekDraftMinutes && !weekEndNear}
                · {t('notSubmittedHours', { hours: hm(weekDraftMinutes) })}
              {/if}
            </p>
            {#if weekDraftMinutes && weekEndNear && canSubmit}
              <div class="week-reminder" role="status" data-testid="time-week-reminder">
                <span>{t('weekEndReminder', { hours: hm(weekDraftMinutes) })}</span>
                <a href={sheetHref({ mode: 'week', day: null, week: weekStart })} onclick={leaveGuard} data-testid="time-day-to-week"
                  >{t('reviewSubmitWeek')} →</a
                >
              </div>
            {:else if weekDraftMinutes && !canSubmit}
              <!-- R5: someone else's week can only be sent by that worker or the owner. -->
              <p class="muted small" data-testid="time-delegated-hint">{t('delegatedSubmitHint')}</p>
            {:else if weekDraftMinutes}
              <a class="week-link" href={sheetHref({ mode: 'week', day: null, week: weekStart })} onclick={leaveGuard} data-testid="time-day-to-week"
                >{t('reviewSubmitWeek')} →</a
              >
            {/if}
          </div>
        {:else}
        <div class="sheet-actions" data-testid="time-week-actions">
          <div class="sheet-actions-total">
            <span>{t('weekTotal')}</span>
            <strong>{hm(weekTotal)} {t('hoursUnit')}</strong>
            <small class:unsaved={dirty}>{dirty ? t('unsaved') : t('allSaved')}</small>
          </div>
          <div class="sheet-actions-buttons">
            <button
              type="button"
              class="secondary"
              disabled={!dirtyNow || Boolean(busy) || invalidNow}
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
                >{busy === 'submit' ? t('submitting') : busy === 'submit_approve' ? t('approving') : t('submitWeek')}</button
              >
            {/if}
          </div>
          {#if !canSubmit}
            <p class="muted small">{t('delegatedSubmitHint')}</p>
          {:else if submitCount === 0 && !invalidNow}
            <p class="muted small" data-testid="time-submit-reason">{t('nothingToSubmit')}</p>
          {/if}
        </div>
              {/if}
      {/if}
    </form>

    {#if mode === 'week' && rowProjects.length && !isAuditor && (canSubmit || data.user.role === 'project_manager')}
      <details class="week-sheet" data-testid="time-week-sheet" open={weekSheets.length > 0 || sheetMessage !== null}>
        <summary>
          <strong>{t('sheetTitle')}</strong>
          {#if weekSheets.length}<span class="muted"> · {t('sheetCount', { n: weekSheets.length })}</span>{/if}
        </summary>
        <p class="muted small">{t('sheetHint')}</p>
        {#if weekSheets.length}
          <ul class="sheet-files">
            {#each weekSheets as sheet (sheet.id)}
              <li>
                <a href={`${base}/app/documents/${encodeURIComponent(sheet.id)}?view=1`} target="_blank" rel="noopener" data-testid="time-week-sheet-link"
                  >📄 {sheet.filename}</a
                >
                {#if rowProjects.length > 1}<span class="muted small">{projectLabel(sheet.projectId)}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        <form
          method="POST"
          action="?/attachWeekSheet"
          enctype="multipart/form-data"
          class="sheet-upload"
          use:enhance={attachSheet}
        >
          <input type="hidden" name="weekStart" value={weekStart} />
          <input type="hidden" name="workerId" value={workerId} />
          {#if rowProjects.length > 1}
            <label>
              <span>{t('project')}</span>
              <select name="projectId">
                {#each rowProjects as project (project.id)}
                  <option value={String(project.id)}>{projectLabel(String(project.id))}</option>
                {/each}
              </select>
            </label>
          {:else}
            <input type="hidden" name="projectId" value={String(rowProjects[0]!.id)} />
          {/if}
          <label class="sheet-file">
            <span>{t('sheetFile')}</span>
            <input type="file" name="sheet" accept="application/pdf,image/*" required data-testid="time-week-sheet-file" />
          </label>
          <button type="submit" class="secondary" disabled={sheetBusy} data-testid="time-week-sheet-attach"
            >{sheetBusy ? t('sheetAttaching') : t('sheetAttach')}</button
          >
        </form>
        {#if sheetMessage && sheetMessage !== 'done'}
          <p class="cell-error" role="alert">{sheetMessage}</p>
        {/if}
      </details>
    {/if}

    <dialog bind:this={confirmDialog} class="confirm" aria-labelledby="time-confirm-title" data-testid="time-week-confirm">
      <h3 id="time-confirm-title">{t('confirmTitle')}</h3>
      <p class="muted">{rangeLabel}{delegating ? ` · ${workerName(workerId)}` : ''}</p>
      <table class="confirm-totals">
        <tbody>
          {#each days as date, index (date)}
            {#if dayTotals[index]}
              <tr class:day-long={dayLong(index)}><th scope="row">{dayName(date, 'long')}</th><td>{hm(dayTotals[index])} {t('hoursUnit')}{dayLong(index) ? ' ⚠' : ''}</td></tr>
            {/if}
          {/each}
        </tbody>
        <tfoot>
          <tr><th scope="row">{t('weekTotal')}</th><td><strong>{hm(weekTotal)} {t('hoursUnit')}</strong></td></tr>
        </tfoot>
      </table>
      <p>{t('confirmEntries', { count: submitCount })}</p>
      <p class="muted">
        {forOther
          ? t('confirmBodyOther', { name: workerName(workerId) })
          : data.user.role === 'owner_admin'
            ? t('confirmBodyOwnerSelf')
            : t('confirmBody')}
      </p>
      <div class="confirm-actions">
        <button type="button" class="secondary" onclick={() => confirmDialog?.close()}>{t('cancel')}</button>
        {#if canApproveNow}
          <button type="button" class="secondary" onclick={() => confirmSubmit(false)} data-testid="time-week-confirm-submit"
            >{t('sendOnly')}</button
          >
          <button type="button" class="primary" onclick={() => confirmSubmit(true)} data-testid="time-week-confirm-approve"
            >{t('approveWeek')}</button
          >
        {:else}
          <button type="button" class="primary" onclick={() => confirmSubmit(false)} data-testid="time-week-confirm-submit"
            >{t('confirmSubmit')}</button
          >
        {/if}
      </div>
    </dialog>
  {/if}

</section>
{/if}

<style>
  .cell-error,
  .cell-warn {
    display: block;
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.2;
  }
  .cell-error {
    color: var(--ja-danger, #c62828);
  }
  .cell-warn {
    color: #8a5300;
  }
  td.day-over,
  .day-card-total.day-over {
    color: var(--ja-danger, #c62828);
  }
  td.day-long {
    color: #8a5300;
  }
  .day-card details > summary {
    list-style: none;
    cursor: pointer;
  }
  .day-card details > summary::-webkit-details-marker {
    display: none;
  }
  .time-week button.primary:disabled {
    background: #c9ced6;
    border-color: #c9ced6;
    color: #fff;
    opacity: 1;
  }
  .view-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--ja-line, #d5dbe3);
    margin-bottom: 1rem;
    overflow-x: auto;
  }
  .view-tabs a {
    padding: 0.7rem 1rem;
    min-height: var(--ja-target-min, 44px);
    box-sizing: border-box;
    color: var(--ja-steel, #5b6573);
    text-decoration: none;
    font-weight: 700;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
  }
  .view-tabs a[aria-current='page'] {
    color: var(--ja-ink, #1c2430);
    border-bottom-color: var(--ja-red, #b3261e);
  }
  .mode-tabs {
    display: inline-flex;
    padding: 0.25rem;
    gap: 0.25rem;
    border-radius: 999px;
    background: var(--ja-surface, #eef1f4);
    border: 1px solid var(--ja-line, #d5dbe3);
    justify-self: start;
  }
  .mode-tabs a {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 1.1rem;
    border-radius: 999px;
    text-decoration: none;
    color: var(--ja-ink, #1c2430);
    font-weight: 700;
  }
  .mode-tabs a[aria-current='page'] {
    background: var(--ja-white, #fff);
    box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  }
  .worker-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .day-form {
    display: grid;
    gap: 1rem;
    max-width: 32rem;
    padding: 1rem;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
  }
  .day-field {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .day-field select {
    min-height: var(--ja-target-min, 44px);
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: var(--ja-control-radius, 8px);
    padding: 0 0.6rem;
    background: var(--ja-white, #fff);
    font: inherit;
  }
  .segmented {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .segmented legend {
    margin-bottom: 0.35rem;
  }
  .segmented label {
    display: inline-flex;
    align-items: center;
    min-height: var(--ja-target-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    background: var(--ja-white, #fff);
  }
  .segmented label.is-selected {
    border-color: var(--ja-ink, #1c2430);
    background: var(--ja-ink, #1c2430);
    color: #fff;
  }
  .segmented input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .segmented-projects label {
    flex: 1 1 100%;
    border-radius: 0.75rem;
    padding: 0.5rem 1rem;
    overflow-wrap: anywhere;
  }
  .segmented label:focus-within {
    outline: 3px solid var(--ja-focus-ring, #1f6feb);
    outline-offset: 2px;
  }
  .time-week .hours-input.big,
  .hours-locked.big {
    width: 8rem;
    min-height: 3.25rem;
    font-size: 1.5rem;
    font-weight: 700;
  }
  .day-logged {
    max-width: 32rem;
  }
  .day-logged h3 {
    font-size: 1rem;
    margin: 0 0 0.25rem;
  }
  .day-logged ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .day-logged li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid var(--ja-line, #eef1f4);
  }
  button.link.plain {
    flex: 1 1 auto;
    border: 0;
    box-shadow: none;
    background: none;
    border-radius: 0;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    text-decoration: none;
    color: inherit;
    font-weight: 400;
    text-align: left;
  }
  .time-week .day-actions {
    position: static;
    max-width: 32rem;
    box-sizing: border-box;
    border: 0;
    box-shadow: none;
    padding: 0;
    background: none;
    margin: 0;
  }
  button.wide {
    flex: 1 1 100%;
    min-height: 3rem;
    font-size: 1.05rem;
  }
  .day-buttons {
    display: grid;
    gap: 0.5rem;
  }
  .day-delete {
    display: grid;
    justify-items: start;
  }
  .day-delete .danger-link {
    min-height: var(--ja-target-min, 44px);
    color: var(--ja-danger, #c62828);
    font-weight: 600;
  }
  .day-delete-confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--ja-danger, #c62828);
    border-radius: 0.6rem;
  }
  .day-delete-confirm p {
    flex: 1 1 100%;
    margin: 0;
    font-weight: 600;
  }
  .day-delete-confirm button {
    min-height: var(--ja-target-min, 44px);
  }
  .day-delete-confirm .danger {
    background: var(--ja-danger, #c62828);
    border-color: var(--ja-danger, #c62828);
    color: #fff;
  }
  .locked-help {
    display: block;
    max-width: 28rem;
    margin-top: 0.35rem;
    color: var(--ja-text, #1c2430);
    font-size: 0.9rem;
  }
  .day-done {
    margin: 0;
    padding: 0.65rem 0.8rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, #1d7a46 12%, transparent);
    color: #145a33;
    font-weight: 600;
  }
  .week-reminder {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem 0.9rem;
    border-radius: 0.6rem;
    border: 1px solid #d9a441;
    background: #fff7e6;
    color: #5c3d00;
  }
  .week-reminder a,
  .week-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
  }
  .week-summary {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ja-steel, #5b6573);
  }
  button.link.small {
    font-size: 0.9rem;
  }
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
  .sheet-empty {
    margin: 0;
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
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem 0.75rem;
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
  button.link.day-other-types {
    justify-self: start;
    text-align: left;
    box-shadow: none;
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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .detail-toggle {
    display: block;
    margin: 0.2rem auto 0;
    padding: 0.15rem 0.35rem;
    min-height: 28px;
    border: 0;
    background: transparent;
    color: var(--ja-steel, #5b6573);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    text-decoration: underline dotted;
  }
  .detail-toggle.has-detail {
    color: var(--ja-ink, #1c2430);
    font-weight: 700;
    text-decoration: none;
  }
  .detail-toggle.day {
    margin: 0;
    min-height: var(--ja-target-min, 44px);
    font-size: 0.95rem;
    text-align: left;
  }
  .detail-ro {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.75rem;
    color: var(--ja-steel, #5b6573);
    white-space: nowrap;
  }
  .week-sheet > summary {
    justify-content: flex-start;
  }
  .detail-panel {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-surface, #f6f8fa);
    text-align: left;
    white-space: normal;
  }
  .detail-panel p {
    margin: 0;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: 0.5rem;
  }
  .detail-panel label {
    display: grid;
    gap: 0.2rem;
    font-weight: 600;
    font-size: 0.875rem;
  }
  .detail-panel input {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--ja-target-min, 44px);
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: 8px;
    padding: 0 0.5rem;
    font: inherit;
    background: var(--ja-white, #fff);
  }
  .detail-computed {
    font-weight: 700;
    color: #1d6b38;
  }
  .detail-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .detail-desktop {
    max-width: 36rem;
    margin-top: 0.5rem;
  }
  .detail-phone {
    flex: 1 1 100%;
    min-width: 0;
    margin-top: 0.2rem;
  }
  .day-line-label {
    flex: 1 1 8rem;
  }
  .day-line .detail-toggle {
    margin: 0;
  }
  .week-sheet {
    border: 1px dashed var(--ja-control-border, #b8c0cc);
    border-radius: var(--ja-radius, 10px);
    padding: 0.6rem 0.9rem;
    background: var(--ja-white, #fff);
  }
  .week-sheet > summary {
    cursor: pointer;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .week-sheet p {
    margin: 0.4rem 0;
  }
  .sheet-files {
    list-style: none;
    margin: 0.25rem 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .sheet-files a {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sheet-upload {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem 0.75rem;
  }
  .sheet-upload label {
    display: grid;
    gap: 0.2rem;
    font-weight: 600;
    font-size: 0.875rem;
  }
  .sheet-upload select,
  .sheet-upload input[type='file'] {
    min-height: var(--ja-target-min, 44px);
    max-width: 100%;
  }
  .confirm-totals tr.day-long td {
    color: #8a5300;
    font-weight: 700;
  }
  /* Focused cells scroll above the sticky Save/Submit bar and phone nav. */
  .time-week input {
    scroll-margin-bottom: 11rem;
  }

  @media (max-width: 620px) {
    /* Keep the action bar above the fixed phone bottom navigation. */
    .sheet-actions {
      bottom: calc(4.2rem + env(safe-area-inset-bottom, 0px));
    }
  }

  @media (min-width: 761px) {
    .detail-phone {
      display: none;
    }
  }
  @media (max-width: 760px) {
    .sheet-table-wrap {
      display: none;
    }
    .detail-desktop {
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
      }
</style>
