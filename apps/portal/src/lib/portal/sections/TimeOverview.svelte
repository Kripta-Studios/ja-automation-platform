<script lang="ts">
  /**
   * Hours overview (review): registered hours by worker x project for a period,
   * with totals per row/column, status breakdown, drill-down to entries and a
   * CSV of the entries on screen. Operational data only (no money fields);
   * rows are already scoped by the server for the viewer's role.
   */
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { StatusBadge } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { decimalHoursFromMinutes } from '../minute-hours';
  import { weekStartForDate } from './time-entry-actions';
  import { timeWeekText, type TimeWeekCopyKey } from './time-week-copy';
  import { DAY_WARN_MINUTES, personName } from './time-hours';
  import { localToday } from '../ui/time-entry-clock';

  let {
    locale = 'en',
    data,
    controlledValue,
  }: {
    locale?: PortalLocale;
    data: PortalData;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  } = $props();

  const t = (key: TimeWeekCopyKey, params: Record<string, string | number> = {}) =>
    timeWeekText(locale, key, params);

  type Status = 'draft' | 'submitted' | 'approved' | 'needs_changes';
  const statuses: Status[] = ['approved', 'submitted', 'needs_changes', 'draft'];
  type Bucket = { minutes: number; by: Record<Status, number>; rows: Row[] };
  const emptyBucket = (): Bucket => ({
    minutes: 0,
    by: { draft: 0, submitted: 0, approved: 0, needs_changes: 0 },
    rows: [],
  });

  const overview = $derived(data.overview!);
  const rows = $derived((overview?.rows ?? []) as Row[]);
  const delegating = $derived(['owner_admin', 'project_manager'].includes(String(data.user.role)));

  let groupBy = $state<'worker' | 'project' | 'day'>('worker');
  const today = localToday();
  let selected = $state<{ a: string; b: string } | null>(null);

  const statusOf = (row: Row): Status => {
    const state = String(row.approval_state);
    if (state === 'approved' || state === 'locked') return 'approved';
    if (state === 'submitted') return 'submitted';
    if (state === 'needs_changes') return 'needs_changes';
    return 'draft';
  };
  const statusLabel = (status: Status) =>
    status === 'approved'
      ? t('statusApproved')
      : status === 'submitted'
        ? t('statusSubmitted')
        : status === 'needs_changes'
          ? t('statusNeedsChanges')
          : t('statusDraft');
  const variant = (status: Status) =>
    status === 'approved'
      ? 'success'
      : status === 'submitted'
        ? 'info'
        : status === 'needs_changes'
          ? 'warning'
          : 'neutral';
  const categoryLabel = (category: string) =>
    category === 'regular'
      ? t('work')
      : category === 'travel'
        ? t('travel')
        : category === 'overtime'
          ? t('overtime')
          : controlledValue('timeCategory', category);
  const projectName = (row: Row) =>
    [row.project_number, row.project_name].filter(Boolean).map(String).join(' · ');
  const workerName = (row: Row) => personName(row.worker_name ?? row.worker_id ?? '');
  const hours = (minutes: number) => decimalHoursFromMinutes(minutes);

  const add = (bucket: Bucket, row: Row) => {
    const minutes = Number(row.minutes ?? 0);
    bucket.minutes += minutes;
    bucket.by[statusOf(row)] += minutes;
    bucket.rows.push(row);
  };

  const language = $derived(documentLanguage(locale));
  const periodDates = $derived.by(() => {
    const dates: string[] = [];
    if (!overview) return dates;
    const cursor = new Date(`${overview.from}T00:00:00.000Z`);
    while (dates.length < 62) {
      const iso = cursor.toISOString().slice(0, 10);
      if (iso > overview.to) break;
      dates.push(iso);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  });
  const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
  /** Per worker-day anomalies: >12 h, weekend work, future-dated hours, missing past weekdays. */
  const anomalies = $derived.by(() => {
    const perDay = new Map<string, number>();
    const workers = new Set<string>();
    for (const row of rows) {
      const key = `${row.worker_id}|${row.work_date}`;
      perDay.set(key, (perDay.get(key) ?? 0) + Number(row.minutes ?? 0));
      workers.add(String(row.worker_id));
    }
    let over12 = 0;
    let weekend = 0;
    let future = 0;
    let missing = 0;
    for (const [key, minutes] of perDay) {
      const date = key.split('|')[1]!;
      if (minutes > DAY_WARN_MINUTES) over12 += 1;
      if (minutes > 0 && isWeekend(date)) weekend += 1;
      if (minutes > 0 && date > today) future += 1;
    }
    for (const worker of workers)
      for (const date of periodDates)
        if (date <= today && !isWeekend(date) && !perDay.get(`${worker}|${date}`)) missing += 1;
    return { perDay, over12, weekend, future, missing };
  });
  const cellFlags = (worker: string, date: string) => {
    const minutes = anomalies.perDay.get(`${worker}|${date}`) ?? 0;
    return {
      over12: minutes > DAY_WARN_MINUTES,
      weekend: minutes > 0 && isWeekend(date),
      future: minutes > 0 && date > today,
      missing: minutes === 0 && date <= today && !isWeekend(date),
    };
  };
  const dayHead = (date: string) =>
    new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00.000Z`),
    );

  const matrix = $derived.by(() => {
    const byWorker = groupBy !== 'project';
    const keyA = (row: Row) => String(byWorker ? row.worker_id : row.project_id);
    const keyB = (row: Row) =>
      String(groupBy === 'day' ? row.work_date : byWorker ? row.project_id : row.worker_id);
    const labelA = (row: Row) => (byWorker ? workerName(row) : projectName(row));
    const labelB = (row: Row) =>
      groupBy === 'day' ? dayHead(String(row.work_date)) : byWorker ? projectName(row) : workerName(row);
    const aLabels = new Map<string, string>();
    const bLabels = new Map<string, string>();
    const cells = new Map<string, Bucket>();
    const aTotals = new Map<string, Bucket>();
    const bTotals = new Map<string, Bucket>();
    const total = emptyBucket();
    for (const row of rows) {
      const a = keyA(row);
      const b = keyB(row);
      aLabels.set(a, labelA(row));
      bLabels.set(b, labelB(row));
      const cellKey = `${a}|${b}`;
      if (!cells.has(cellKey)) cells.set(cellKey, emptyBucket());
      if (!aTotals.has(a)) aTotals.set(a, emptyBucket());
      if (!bTotals.has(b)) bTotals.set(b, emptyBucket());
      add(cells.get(cellKey)!, row);
      add(aTotals.get(a)!, row);
      add(bTotals.get(b)!, row);
      add(total, row);
    }
    const sortKeys = (labels: Map<string, string>) =>
      [...labels.keys()].sort((x, y) => labels.get(x)!.localeCompare(labels.get(y)!));
    if (groupBy === 'day') for (const date of periodDates) if (!bLabels.has(date)) bLabels.set(date, dayHead(date));
    return {
      as: sortKeys(aLabels).map((key) => ({ key, label: aLabels.get(key)! })),
      bs:
        groupBy === 'day'
          ? [...bLabels.keys()].sort().map((key) => ({ key, label: bLabels.get(key)! }))
          : sortKeys(bLabels).map((key) => ({ key, label: bLabels.get(key)! })),
      cells,
      aTotals,
      bTotals,
      total,
    };
  });

  const selectedBucket = $derived.by(() => {
    if (!selected) return null;
    const { a, b } = selected;
    if (a === '*' && b === '*') return matrix.total;
    if (b === '*') return matrix.aTotals.get(a) ?? null;
    if (a === '*') return matrix.bTotals.get(b) ?? null;
    return matrix.cells.get(`${a}|${b}`) ?? null;
  });
  const selectedTitle = $derived.by(() => {
    if (!selected) return '';
    const a = matrix.as.find((item) => item.key === selected!.a)?.label;
    const b = matrix.bs.find((item) => item.key === selected!.b)?.label;
    return [a, b].filter(Boolean).join(' · ') || t('ovTotal');
  });
  const selectedRows = $derived(
    [...(selectedBucket?.rows ?? [])].sort(
      (x, y) =>
        String(x.work_date).localeCompare(String(y.work_date)) ||
        workerName(x).localeCompare(workerName(y)),
    ),
  );
  const selectedWorker = $derived.by(() => {
    const ids = new Set(selectedRows.map((row) => String(row.worker_id)));
    return ids.size === 1 ? [...ids][0]! : '';
  });

  const pick = (a: string, b: string) => {
    selected = selected && selected.a === a && selected.b === b ? null : { a, b };
  };
  $effect(() => {
    // Selection is per grouping; reset when the grouping or data changes.
    void groupBy;
    void rows;
    selected = null;
  });

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00.000Z`));
  const rangeLabel = $derived(
    overview ? `${formatDate(overview.from)} – ${formatDate(overview.to)} ${overview.to.slice(0, 4)}` : '',
  );

  const href = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams($page.url.searchParams);
    for (const key of [...query.keys()]) if (key.startsWith('/')) query.delete(key);
    query.set('view', 'overview');
    for (const [key, value] of Object.entries(changes))
      if (value === null) query.delete(key);
      else query.set(key, value);
    return `${base}/app/time?${query.toString()}`;
  };
  const periods = [
    ['this_week', 'ovThisWeek'],
    ['last_week', 'ovLastWeek'],
    ['this_month', 'ovThisMonth'],
    ['last_month', 'ovLastMonth'],
    ['custom', 'ovCustom'],
  ] as const;

  const filterWorkers = $derived.by(() => {
    const map = new Map<string, string>();
    for (const worker of data.timeWorkers ?? []) map.set(worker.id, worker.name);
    for (const row of rows) map.set(String(row.worker_id), workerName(row));
    return [...map.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  });

  const bar = (bucket: Bucket) =>
    statuses
      .filter((status) => bucket.by[status] > 0)
      .map((status) => ({ status, share: (bucket.by[status] / Math.max(bucket.minutes, 1)) * 100 }));
  const breakdownText = (bucket: Bucket) =>
    statuses
      .filter((status) => bucket.by[status] > 0)
      .map((status) => `${statusLabel(status)} ${hours(bucket.by[status])} h`)
      .join(' · ');

  const csvCell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
    return /[",\n;]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  const download = () => {
    const header = [t('date'), t('ovWorker'), t('project'), t('type'), t('hours'), t('status')];
    const lines = [...rows]
      .sort((x, y) => String(x.work_date).localeCompare(String(y.work_date)))
      .map((row) =>
        [
          row.work_date,
          workerName(row),
          projectName(row),
          categoryLabel(String(row.category)),
          hours(Number(row.minutes ?? 0)),
          statusLabel(statusOf(row)),
        ]
          .map(csvCell)
          .join(','),
      );
    const blob = new Blob([`﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hours-${overview.from}-to-${overview.to}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
</script>

{#snippet statusBar(bucket: Bucket)}
  <span class="mini-bar" aria-hidden="true">
    {#each bar(bucket) as part (part.status)}
      <span data-status={part.status} style:width={`${part.share}%`}></span>
    {/each}
  </span>
{/snippet}

<section class="time-overview" aria-labelledby="time-overview-title" data-testid="time-overview">
  <h2 id="time-overview-title" class="sr-only">{t('tabOverview')}</h2>

  <div class="ov-periods" role="group" aria-label={t('ovPeriod')}>
    {#each periods as [value, key] (value)}
      <a
        href={href({ period: value, from: value === 'custom' ? overview.from : null, to: value === 'custom' ? overview.to : null })}
        aria-current={overview.period === value ? 'page' : undefined}
        data-sveltekit-noscroll
        data-testid={`ov-period-${value}`}>{t(key)}</a
      >
    {/each}
  </div>

  <form method="GET" action={`${base}/app/time`} class="ov-filters" data-sveltekit-noscroll>
    <input type="hidden" name="view" value="overview" />
    <input type="hidden" name="period" value={overview.period} />
    {#if $page.url.searchParams.get('lang')}
      <input type="hidden" name="lang" value={$page.url.searchParams.get('lang')} />
    {/if}
    {#if overview.period === 'custom'}
      <label><span>{t('ovFrom')}</span><input type="date" name="from" value={overview.from} /></label>
      <label><span>{t('ovTo')}</span><input type="date" name="to" value={overview.to} /></label>
    {/if}
    <label
      ><span>{t('project')}</span>
      <select name="project" value={data.timeFilter?.projectId ?? ''}>
        <option value="">{t('allProjects')}</option>
        {#each data.projects ?? [] as project (project.id)}
          <option value={String(project.id)}
            >{[project.project_number, project.name].filter(Boolean).join(' · ')}</option
          >
        {/each}
      </select>
    </label>
    <label
      ><span>{t('ovWorker')}</span>
      <select name="rworker" value={overview.workerId}>
        <option value="">{t('allWorkers')}</option>
        {#each filterWorkers as [id, name] (id)}
          <option value={id}>{name}</option>
        {/each}
      </select>
    </label>
    <label
      ><span>{t('status')}</span>
      <select name="status" value={overview.status}>
        <option value="">{t('allStatuses')}</option>
        {#each statuses as status (status)}
          <option value={status}>{statusLabel(status)}</option>
        {/each}
      </select>
    </label>
    <button type="submit" class="secondary">{t('apply')}</button>
    {#if data.timeFilter?.projectId || overview.workerId || overview.status}
      <a class="clear" href={href({ project: null, rworker: null, status: null })}>{t('clear')}</a>
    {/if}
  </form>

  <div class="ov-summary" data-testid="ov-summary">
    <div class="ov-total">
      <span class="muted">{rangeLabel}</span>
      <strong data-testid="ov-grand-total">{hours(matrix.total.minutes)} h</strong>
    </div>
    <ul class="ov-status-list">
      {#each statuses as status (status)}
        <li data-status={status}>
          <span class="dot" data-status={status}></span>{statusLabel(status)}
          <strong>{hours(matrix.total.by[status])} h</strong>
        </li>
      {/each}
    </ul>
    <div class="ov-tools">
      <div class="seg" role="group" aria-label={t('ovGroupBy')}>
        <button type="button" aria-pressed={groupBy === 'worker'} onclick={() => (groupBy = 'worker')}
          >{t('ovByWorker')}</button
        >
        <button type="button" aria-pressed={groupBy === 'project'} onclick={() => (groupBy = 'project')}
          >{t('ovByProject')}</button
        >
        <button
          type="button"
          aria-pressed={groupBy === 'day'}
          onclick={() => (groupBy = 'day')}
          disabled={periodDates.length > 42}
          data-testid="ov-by-day">{t('ovByDay')}</button
        >
      </div>
      {#if rows.length}
        <button type="button" class="secondary" onclick={download} data-testid="ov-export">{t('ovExport')}</button>
      {/if}
    </div>
  </div>

  {#if anomalies.over12 || anomalies.future || anomalies.weekend || anomalies.missing}
    <div class="ov-anomalies" role="status" data-testid="ov-anomalies">
      <strong>{t('ovCheck')}</strong>
      {#if anomalies.over12}<button type="button" class="chip" data-flag="over12" onclick={() => (groupBy = 'day')}>{t('ovOver12', { n: anomalies.over12 })}</button>{/if}
      {#if anomalies.future}<button type="button" class="chip" data-flag="future" onclick={() => (groupBy = 'day')}>{t('ovFuture', { n: anomalies.future })}</button>{/if}
      {#if anomalies.weekend}<button type="button" class="chip" data-flag="weekend" onclick={() => (groupBy = 'day')}>{t('ovWeekend', { n: anomalies.weekend })}</button>{/if}
      {#if anomalies.missing}<button type="button" class="chip" data-flag="missing" onclick={() => (groupBy = 'day')}>{t('ovMissing', { n: anomalies.missing })}</button>{/if}
    </div>
  {/if}

  {#if rows.length === 0}
    <p class="ov-empty" data-testid="ov-empty">{t('ovEmpty')}</p>
  {:else}
    {#if rows.length >= 5000}<p class="muted small">{t('ovTooMany')}</p>{/if}
    <p class="muted small">{t('ovSelectCell')}</p>

    <div class="ov-matrix-wrap">
      <table class="ov-matrix" data-testid="ov-matrix">
        <thead>
          <tr>
            <th scope="col" class="ov-a">{groupBy === 'project' ? t('project') : t('ovWorker')}</th>
            {#each matrix.bs as b (b.key)}
              <th scope="col" class:is-weekend={groupBy === 'day' && isWeekend(b.key)}><span class="ov-b">{b.label}</span></th>
            {/each}
            <th scope="col" class="ov-sum">{t('ovTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {#each matrix.as as a (a.key)}
            <tr>
              <th scope="row" class="ov-a">{a.label}</th>
              {#each matrix.bs as b (b.key)}
                {@const cell = matrix.cells.get(`${a.key}|${b.key}`)}
                {@const flags = groupBy === 'day' ? cellFlags(a.key, b.key) : null}
                <td
                  class:is-weekend={groupBy === 'day' && isWeekend(b.key)}
                  class:flag-over12={flags?.over12}
                  class:flag-future={flags?.future}
                  class:flag-missing={flags?.missing}
                  title={flags
                    ? [flags.over12 ? t('over12Short') : '', flags.future ? t('futureDay') : '', flags.missing ? t('ovMissingDay') : '']
                        .filter(Boolean)
                        .join(' · ')
                    : undefined}
                >
                  {#if cell}
                    <button
                      type="button"
                      class="ov-cell"
                      class:is-selected={selected?.a === a.key && selected?.b === b.key}
                      title={breakdownText(cell)}
                      aria-label={`${a.label} · ${b.label}: ${hours(cell.minutes)} h. ${breakdownText(cell)}`}
                      onclick={() => pick(a.key, b.key)}
                    >
                      <span>{hours(cell.minutes)}</span>
                      {@render statusBar(cell)}
                    </button>
                  {:else if flags?.missing}
                    <span class="ov-none ov-missing" aria-label={t('ovMissingDay')}>0</span>
                  {:else}
                    <span class="ov-none">·</span>
                  {/if}
                </td>
              {/each}
              <td class="ov-sum">
                <button
                  type="button"
                  class="ov-cell"
                  class:is-selected={selected?.a === a.key && selected?.b === '*'}
                  title={breakdownText(matrix.aTotals.get(a.key)!)}
                  onclick={() => pick(a.key, '*')}
                >
                  <span>{hours(matrix.aTotals.get(a.key)!.minutes)}</span>
                  {@render statusBar(matrix.aTotals.get(a.key)!)}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="ov-a">{t('ovTotal')}</th>
            {#each matrix.bs as b (b.key)}
              {@const column = matrix.bTotals.get(b.key)}
              <td class:is-weekend={groupBy === 'day' && isWeekend(b.key)}>
                {#if column}
                  <button
                    type="button"
                    class="ov-cell"
                    class:is-selected={selected?.a === '*' && selected?.b === b.key}
                    title={breakdownText(column)}
                    onclick={() => pick('*', b.key)}
                  >
                    <span>{hours(column.minutes)}</span>
                    {@render statusBar(column)}
                  </button>
                {:else}
                  <span class="ov-none">·</span>
                {/if}
              </td>
            {/each}
            <td class="ov-sum">
              <button type="button" class="ov-cell" onclick={() => pick('*', '*')}>
                <strong>{hours(matrix.total.minutes)}</strong>
                {@render statusBar(matrix.total)}
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Phone: grouped cards -->
    <ol class="ov-groups" data-testid="ov-groups">
      {#each matrix.as as a (a.key)}
        {@const totalA = matrix.aTotals.get(a.key)!}
        <li class="ov-group">
          <button type="button" class="ov-group-head" onclick={() => pick(a.key, '*')}>
            <strong>{a.label}</strong>
            <span class="ov-group-total">{hours(totalA.minutes)} h</span>
            {@render statusBar(totalA)}
          </button>
          <ul>
            {#each matrix.bs as b (b.key)}
              {@const cell = matrix.cells.get(`${a.key}|${b.key}`)}
              {#if cell}
                <li>
                  <button
                    type="button"
                    class="ov-line"
                    class:is-selected={selected?.a === a.key && selected?.b === b.key}
                    onclick={() => pick(a.key, b.key)}
                  >
                    <span class="ov-line-label">{b.label}</span>
                    <span class="ov-line-hours">{hours(cell.minutes)} h</span>
                    {@render statusBar(cell)}
                  </button>
                </li>
              {/if}
            {/each}
          </ul>
        </li>
      {/each}
    </ol>

    {#if selected && selectedBucket}
      <div class="ov-drill" data-testid="ov-drill" role="region" aria-label={t('ovEntries')}>
        <div class="ov-drill-head">
          <h3>{selectedTitle} · {hours(selectedBucket.minutes)} h</h3>
          <button type="button" class="secondary" onclick={() => (selected = null)}>{t('ovClose')}</button>
        </div>
        <p class="muted small">{breakdownText(selectedBucket)}</p>
        <ul class="ov-entries">
          {#each selectedRows as row (row.id)}
            <li>
              <a href={`${base}/app/time/${String(row.id)}`}>
                <span class="ov-entry-date">{formatDate(String(row.work_date))}</span>
                <span class="ov-entry-main">
                  <span>{groupBy === 'project' ? workerName(row) : projectName(row)}</span>
                  <span class="muted"
                    >{groupBy === 'project' ? projectName(row) : workerName(row)} · {categoryLabel(String(row.category))}</span
                  >
                </span>
                <span class="ov-entry-hours">{hours(Number(row.minutes ?? 0))} h</span>
                <StatusBadge variant={variant(statusOf(row))} text={statusLabel(statusOf(row))} />
              </a>
            </li>
          {/each}
        </ul>
        <div class="ov-drill-actions">
          {#if delegating && selectedWorker && data.user.role !== 'auditor_read_only'}
            <a
              href={`${base}/app/time?mode=week&worker=${encodeURIComponent(selectedWorker)}&week=${weekStartForDate(String(selectedRows[0]?.work_date ?? overview.from)) ?? ''}`}
              >{t('ovOpenWeek')} →</a
            >
          {/if}
          {#if delegating && selectedRows.some((row) => statusOf(row) === 'submitted')}
            <a href={`${base}/app/approvals`}>{t('ovApprovals')} →</a>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .time-overview {
    display: grid;
    gap: 1rem;
    max-width: 80rem;
  }
  .muted {
    color: var(--ja-steel, #5b6573);
  }
  .small {
    font-size: 0.875rem;
    margin: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .ov-periods {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .ov-periods a {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    text-decoration: none;
    color: var(--ja-ink, #1c2430);
    font-weight: 600;
    background: var(--ja-white, #fff);
  }
  .ov-periods a[aria-current='page'] {
    background: var(--ja-ink, #1c2430);
    border-color: var(--ja-ink, #1c2430);
    color: #fff;
  }
  .ov-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: flex-end;
  }
  .ov-filters label {
    display: grid;
    gap: 0.2rem;
    flex: 1 1 11rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .ov-filters select,
  .ov-filters input {
    min-height: var(--ja-target-min, 44px);
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: var(--ja-control-radius, 8px);
    padding: 0 0.6rem;
    background: var(--ja-white, #fff);
    font: inherit;
    font-weight: 400;
  }
  .ov-filters .clear {
    align-self: center;
  }
  button.secondary {
    min-height: var(--ja-target-min, 44px);
    padding: 0 1.1rem;
    border-radius: var(--ja-control-radius, 8px);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    background: var(--ja-white, #fff);
    color: var(--ja-ink, #1c2430);
    border: 1px solid var(--ja-control-border, #b8c0cc);
  }
  .ov-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
  }
  .ov-total {
    display: grid;
  }
  .ov-total strong {
    font-size: 1.6rem;
  }
  .ov-status-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ov-status-list li {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .ov-tools {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: var(--ja-control-radius, 8px);
    overflow: hidden;
  }
  .time-overview .seg button {
    color: var(--ja-ink, #1c2430);
    box-shadow: none;
    border-radius: 0;
  }
  .time-overview .seg button[aria-pressed='true'] {
    color: #fff;
  }
  .seg button {
    min-height: var(--ja-target-min, 44px);
    padding: 0 0.9rem;
    border: 0;
    background: var(--ja-white, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button[aria-pressed='true'] {
    background: var(--ja-ink, #1c2430);
    color: #fff;
  }
  .dot {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    border: 1px solid #8a94a3;
    background: #fff;
  }
  .dot[data-status='submitted'],
  .mini-bar [data-status='submitted'] {
    background: #3b82f6;
    border-color: #3b82f6;
  }
  .dot[data-status='approved'],
  .mini-bar [data-status='approved'] {
    background: #2e9e5b;
    border-color: #2e9e5b;
  }
  .dot[data-status='needs_changes'],
  .mini-bar [data-status='needs_changes'] {
    background: #e09b00;
    border-color: #e09b00;
  }
  .mini-bar [data-status='draft'] {
    background: #b8c0cc;
  }
  .mini-bar {
    display: flex;
    width: 100%;
    height: 5px;
    border-radius: 3px;
    overflow: hidden;
    background: #eef1f4;
  }
  .mini-bar span {
    display: block;
    height: 100%;
  }
  .ov-empty {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
  }
  .ov-matrix-wrap {
    overflow-x: auto;
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
  }
  .ov-matrix {
    border-collapse: collapse;
    width: 100%;
  }
  .ov-matrix th,
  .ov-matrix td {
    border-bottom: 1px solid var(--ja-line, #e3e7ec);
    padding: 0.3rem;
    text-align: center;
    vertical-align: middle;
  }
  .ov-matrix thead th {
    font-size: 0.82rem;
    font-weight: 700;
    max-width: 10rem;
  }
  .ov-b {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ov-matrix .ov-a {
    text-align: left;
    position: sticky;
    left: 0;
    background: var(--ja-white, #fff);
    min-width: 11rem;
    padding-left: 0.75rem;
    z-index: 1;
  }
  .ov-matrix .ov-sum,
  .ov-matrix tfoot td,
  .ov-matrix tfoot th {
    background: var(--ja-surface, #f6f8fa);
    font-weight: 700;
  }
  .time-overview .ov-cell,
  .time-overview .ov-line,
  .time-overview .ov-group-head {
    color: var(--ja-ink, #1c2430);
    background: transparent;
    box-shadow: none;
  }
  .time-overview .ov-cell.is-selected,
  .time-overview .ov-line.is-selected {
    background: #f1f7ff;
  }
  .ov-cell {
    display: grid;
    gap: 0.2rem;
    width: 100%;
    min-width: 4rem;
    min-height: var(--ja-target-min, 44px);
    padding: 0.3rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .ov-cell:hover,
  .ov-line:hover {
    border-color: var(--ja-control-border, #b8c0cc);
  }
  .ov-cell.is-selected,
  .ov-line.is-selected {
    border-color: var(--ja-ink, #1c2430);
    background: #f1f7ff;
  }
  .ov-anomalies {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    padding: 0.6rem 0.9rem;
    border-radius: var(--ja-radius, 10px);
    background: #fff7e6;
    border: 1px solid #f0c36d;
  }
  .time-overview .chip {
    min-height: 36px;
    padding: 0 0.8rem;
    border-radius: 999px;
    border: 1px solid #e0b25a;
    background: #fff;
    color: #6b4200;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    box-shadow: none;
  }
  .ov-matrix .is-weekend {
    background: #f6f3fb;
  }
  .ov-matrix td.flag-over12 {
    background: #fdecec;
    box-shadow: inset 0 0 0 2px #e57373;
  }
  .ov-matrix td.flag-future {
    background: #fff3d6;
    box-shadow: inset 0 0 0 2px #e09b00;
  }
  .ov-missing {
    color: #c62828;
    font-weight: 700;
  }
  .ov-none {
    color: #a0a8b3;
  }
  .ov-groups {
    display: none;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 0.6rem;
  }
  .ov-group {
    border: 1px solid var(--ja-line, #d5dbe3);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
    padding: 0.4rem 0.6rem;
  }
  .ov-group ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ov-group-head,
  .ov-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.25rem 0.75rem;
    width: 100%;
    min-height: var(--ja-target-min, 44px);
    padding: 0.35rem 0.25rem;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ov-group-head .mini-bar,
  .ov-line .mini-bar {
    grid-column: 1 / -1;
  }
  .ov-group-total {
    font-weight: 700;
  }
  .ov-line {
    border-top: 1px solid var(--ja-line, #eef1f4);
  }
  .ov-line-label {
    overflow-wrap: anywhere;
  }
  .ov-line-hours {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .ov-drill {
    border: 1px solid var(--ja-ink, #1c2430);
    border-radius: var(--ja-radius, 10px);
    background: var(--ja-white, #fff);
    padding: 0.75rem 1rem;
    display: grid;
    gap: 0.4rem;
  }
  .ov-drill-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .ov-drill-head h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .ov-entries {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ov-entries a {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr) auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0;
    border-top: 1px solid var(--ja-line, #eef1f4);
    color: inherit;
    text-decoration: none;
  }
  .ov-entry-main {
    display: grid;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ov-entry-hours {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ov-drill-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-weight: 600;
  }
  .time-overview :global([data-ui='status-badge'][data-variant='success']) {
    background: #e8f6ec;
    color: #17663a;
  }
  .time-overview :global([data-ui='status-badge'][data-variant='warning']) {
    background: #fff3d6;
    color: #8a5300;
  }
  .time-overview :global([data-ui='status-badge'][data-variant='info']) {
    background: #eaf2fd;
    color: #1d4f91;
  }
  @media (max-width: 760px) {
    .ov-matrix-wrap {
      display: none;
    }
    .ov-groups {
      display: grid;
    }
    .ov-tools {
      margin-left: 0;
      width: 100%;
    }
    .ov-entries a {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .ov-entries a > :global([data-ui='status-badge']) {
      justify-self: start;
      grid-column: 1 / -1;
    }
    .ov-entry-date {
      grid-column: 1 / -1;
      font-size: 0.85rem;
      color: var(--ja-steel, #5b6573);
    }
  }
</style>
