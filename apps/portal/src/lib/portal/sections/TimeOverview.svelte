<script lang="ts">
  import { cssWidth } from '../ui/css-width';
  /**
   * Hours overview (review): registered hours by worker x project for a period.
   * The server sends totals, the top 15 rows (more on request), the top 10
   * columns plus "Other", and one page of drill-down entries; filters, search,
   * grouping and the selected cell live in the URL. Operational data only (no
   * money fields); rows are already scoped by the server for the viewer's role.
   */
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { StatusBadge } from '../ui';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import { documentLanguage, type PortalLocale } from '../../portal-i18n';
  import type { PortalData } from '../portal-data';
  import {
    OTHER_KEY,
    OTHERS_ROW,
    type OverviewBucket as Bucket,
    type OverviewEntry,
    type OverviewStatus as Status,
  } from '../time-overview-types';
  import { clockHoursFromMinutes } from '../minute-hours';
  import { weekStartForDate } from './time-entry-actions';
  import { timeDetailText } from './time-hours';
  import { timeWeekText, type TimeWeekCopyKey } from './time-week-copy';
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

  const statuses: Status[] = ['approved', 'submitted', 'needs_changes', 'draft'];
  const overview = $derived(data.overview!);
  const group = $derived(overview.group);
  const delegating = $derived(['owner_admin', 'project_manager'].includes(String(data.user.role)));
  const today = localToday();

  const statusOf = (state: string): Status => {
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
  const projectName = (entry: OverviewEntry) =>
    [entry.project_number, entry.project_name].filter(Boolean).join(' · ');
  // H:MM like the timesheet and Home (Z5); the CSV export keeps decimals.
  const hours = (minutes: number) => clockHoursFromMinutes(minutes);

  const language = $derived(documentLanguage(locale));
  const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
  const dayHead = (date: string) =>
    new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00.000Z`),
    );
  const columnLabel = (label: string) => (group === 'day' ? dayHead(label) : label);
  const periodDays = $derived(
    Math.round((Date.parse(`${overview.to}T00:00:00Z`) - Date.parse(`${overview.from}T00:00:00Z`)) / 86400000) + 1,
  );
  const missingDay = (row: string, date: string) =>
    group === 'day' && !overview.cells[`${row}|${date}`] && date <= today && !isWeekend(date);
  const over12 = (bucket: Bucket | undefined) => group === 'day' && (bucket?.minutes ?? 0) > 12 * 60;

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00.000Z`));
  const rangeLabel = $derived(
    `${formatDate(overview.from)} – ${formatDate(overview.to)} ${overview.to.slice(0, 4)}`,
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
  /** Filters changed: start again from the top rows and close the drill-down. */
  const reset = { cell: null, cpage: null, show: null };
  const selectedCell = $derived(overview.drill ? `${overview.drill.a}|${overview.drill.b}` : '');
  const cellHref = (a: string, b: string) =>
    selectedCell === `${a}|${b}` ? href({ cell: null, cpage: null }) : href({ cell: `${a}|${b}`, cpage: null });
  const exportHref = $derived.by(() => {
    const query = new URLSearchParams($page.url.searchParams);
    for (const key of ['view', 'cell', 'cpage', 'show', 'group']) query.delete(key);
    query.set('lang', locale);
    return `${base}/app/time/overview-export?${query.toString()}`;
  });
  const periods = [
    ['this_week', 'ovThisWeek'],
    ['last_week', 'ovLastWeek'],
    ['this_month', 'ovThisMonth'],
    ['last_month', 'ovLastMonth'],
    ['custom', 'ovCustom'],
  ] as const;

  const bar = (bucket: Bucket) =>
    statuses
      .filter((status) => bucket.by[status] > 0)
      .map((status) => ({ status, share: (bucket.by[status] / Math.max(bucket.minutes, 1)) * 100 }));
  const breakdownText = (bucket: Bucket) =>
    statuses
      .filter((status) => bucket.by[status] > 0)
      .map((status) => `${statusLabel(status)} ${hours(bucket.by[status])} h`)
      .join(' · ');

  const rowLabel = (key: string) =>
    key === '*'
      ? ''
      : key === OTHERS_ROW
        ? t('ovOthers', { n: overview.others?.count ?? 0 })
        : (overview.rows.find((row) => row.key === key)?.label ?? '');
  const colLabel = (key: string) =>
    key === '*'
      ? ''
      : key === OTHER_KEY
        ? t('ovOtherColumn', { n: overview.otherColumn?.count ?? 0 })
        : columnLabel(overview.columns.find((column) => column.key === key)?.label ?? '');
  const drill = $derived(overview.drill);
  const drillTitle = $derived(
    drill ? [rowLabel(drill.a), colLabel(drill.b)].filter(Boolean).join(' · ') || t('ovTotal') : '',
  );
  const drillPages = $derived(drill ? Math.ceil(drill.count / drill.pageSize) : 0);
  const nextShow = $derived(Math.min(overview.others?.count ?? 0, 15));
  let filtersOpen = $state(false);
  /** Bring the drill-down into view when it opens (paging keeps it mounted). */
  const reveal = (node: HTMLElement) => {
    node.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };
  const hasFilters = $derived(
    Boolean(data.timeFilter?.projectId || overview.workerId || overview.status || overview.find),
  );
</script>

{#snippet statusBar(bucket: Bucket)}
  <span class="mini-bar" aria-hidden="true">
    {#each bar(bucket) as part (part.status)}
      <span data-status={part.status} use:cssWidth={part.share}></span>
    {/each}
  </span>
{/snippet}

{#snippet cellLink(a: string, b: string, bucket: Bucket, label: string, strong = false)}
  <a
    class="ov-cell"
    class:is-selected={selectedCell === `${a}|${b}`}
    href={cellHref(a, b)}
    data-sveltekit-noscroll
    data-sveltekit-replacestate
    title={breakdownText(bucket)}
    aria-label={`${label}: ${hours(bucket.minutes)} h. ${breakdownText(bucket)}`}
  >
    {#if strong}<strong>{hours(bucket.minutes)}</strong>{:else}<span>{hours(bucket.minutes)}</span>{/if}
    {@render statusBar(bucket)}
  </a>
{/snippet}

<section class="time-overview" aria-labelledby="time-overview-title" data-testid="time-overview">
  <h2 id="time-overview-title" class="sr-only">{t('tabOverview')}</h2>

  <div class="ov-periods" role="group" aria-label={t('ovPeriod')}>
    {#each periods as [value, key] (value)}
      <a
        href={href({ ...reset, period: value, from: value === 'custom' ? overview.from : null, to: value === 'custom' ? overview.to : null })}
        aria-current={overview.period === value ? 'page' : undefined}
        data-sveltekit-noscroll
        data-testid={`ov-period-${value}`}>{t(key)}</a
      >
    {/each}
  </div>

  <form method="GET" action={`${base}/app/time`} class="ov-filters" data-sveltekit-noscroll data-testid="ov-filters">
    <input type="hidden" name="view" value="overview" />
    <input type="hidden" name="period" value={overview.period} />
    {#if group !== 'worker'}<input type="hidden" name="group" value={group} />{/if}
    {#if $page.url.searchParams.get('lang')}
      <input type="hidden" name="lang" value={$page.url.searchParams.get('lang')} />
    {/if}
    {#if $page.url.searchParams.get('includeArchived') === '1'}
      <input type="hidden" name="includeArchived" value="1" />
    {/if}
    <label class="ov-search"
      ><span>{t('ovSearch')}</span>
      <input
        type="search"
        name="find"
        value={overview.find}
        placeholder={t('ovSearch')}
        autocomplete="off"
        data-testid="ov-search"
      />
    </label>
    <button
      type="button"
      class="secondary ov-filter-toggle"
      aria-expanded={filtersOpen}
      onclick={() => (filtersOpen = !filtersOpen)}>{t('ovFilters')}{hasFilters ? ' •' : ''}</button
    >
    <div class="ov-extra" class:is-open={filtersOpen}>
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
        {#each overview.workers as [id, name] (id)}
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
    </div>
    <button type="submit" class="secondary">{t('apply')}</button>
    {#if hasFilters}
      <a class="clear" href={href({ ...reset, project: null, rworker: null, status: null, find: null })}>{t('clear')}</a>
    {/if}
  </form>

  <div class="ov-summary" data-testid="ov-summary">
    <div class="ov-total">
      <span class="muted" data-testid="ov-scope"
        >{t('ovScope', { range: rangeLabel, entries: overview.total.entries, groups: overview.rowCount })}</span
      >
      <strong data-testid="ov-grand-total">{hours(overview.total.minutes)} h</strong>
    </div>
    <ul class="ov-status-list">
      {#each statuses as status (status)}
        <li data-status={status}>
          <span class="dot" data-status={status}></span>{statusLabel(status)}
          <strong>{hours(overview.total.by[status])} h</strong>
        </li>
      {/each}
    </ul>
    <div class="ov-tools">
      <div class="seg" role="group" aria-label={t('ovGroupBy')}>
        <a
          href={href({ ...reset, group: null })}
          aria-current={group === 'worker' ? 'true' : undefined}
          data-sveltekit-noscroll
          data-testid="ov-by-worker">{t('ovByWorker')}</a
        >
        <a
          href={href({ ...reset, group: 'project' })}
          aria-current={group === 'project' ? 'true' : undefined}
          data-sveltekit-noscroll
          data-testid="ov-by-project">{t('ovByProject')}</a
        >
        {#if periodDays <= 42}
          <a
            href={href({ ...reset, group: 'day' })}
            aria-current={group === 'day' ? 'true' : undefined}
            data-sveltekit-noscroll
            data-testid="ov-by-day">{t('ovByDay')}</a
          >
        {/if}
      </div>
      {#if overview.total.entries}
        <a class="secondary button-link" href={exportHref} download data-testid="ov-export">{t('ovExport')}</a>
      {/if}
    </div>
  </div>

  {#if overview.anomalies.over12 || overview.anomalies.weekend || overview.anomalies.missing}
    {@const dayHref = periodDays <= 42 ? href({ ...reset, group: 'day' }) : undefined}
    <div class="ov-anomalies" role="status" data-testid="ov-anomalies">
      <strong>{t('ovCheck')}</strong>
      {#if overview.anomalies.over12}<a class="chip" data-flag="over12" href={dayHref} data-sveltekit-noscroll>{t('ovOver12', { n: overview.anomalies.over12 })}</a>{/if}
      {#if overview.anomalies.weekend}<a class="chip" data-flag="weekend" href={dayHref} data-sveltekit-noscroll>{t('ovWeekend', { n: overview.anomalies.weekend })}</a>{/if}
      {#if overview.anomalies.missing}<a class="chip" data-flag="missing" href={dayHref} data-sveltekit-noscroll>{t('ovMissing', { n: overview.anomalies.missing })}</a>{/if}
    </div>
  {/if}

  {#if overview.total.entries === 0}
    <p class="ov-empty" data-testid="ov-empty">{t('ovEmpty')}</p>
  {:else}
    <p class="muted small">{t('ovSelectCell')}</p>

    <div class="ov-matrix-wrap">
      <table class="ov-matrix" data-testid="ov-matrix">
        <thead>
          <tr>
            <th scope="col" class="ov-a">{group === 'project' ? t('project') : t('ovWorker')}</th>
            {#each overview.columns as b (b.key)}
              <th scope="col" class:is-weekend={group === 'day' && isWeekend(b.key)} title={group === 'worker' ? b.label : undefined}><span class="ov-b">{group === 'worker' ? b.label.split(' · ')[0] : columnLabel(b.label)}</span></th>
            {/each}
            {#if overview.otherColumn}
              <th scope="col"><span class="ov-b">{t('ovOtherColumn', { n: overview.otherColumn.count })}</span></th>
            {/if}
            <th scope="col" class="ov-sum">{t('ovTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {#each overview.rows as a (a.key)}
            <tr>
              <th scope="row" class="ov-a">{a.label}</th>
              {#each overview.columns as b (b.key)}
                {@const cell = overview.cells[`${a.key}|${b.key}`]}
                {@const missing = missingDay(a.key, b.key)}
                <td
                  class:is-weekend={group === 'day' && isWeekend(b.key)}
                  class:flag-over12={over12(cell)}
                  class:flag-missing={missing}
                  title={over12(cell) ? t('over12Short') : missing ? t('ovMissingDay') : undefined}
                >
                  {#if cell}
                    {@render cellLink(a.key, b.key, cell, `${a.label} · ${columnLabel(b.label)}`)}
                  {:else if missing}
                    <span class="ov-none ov-missing" aria-label={t('ovMissingDay')}>0</span>
                  {:else}
                    <span class="ov-none">·</span>
                  {/if}
                </td>
              {/each}
              {#if overview.otherColumn}
                {@const cell = overview.cells[`${a.key}|${OTHER_KEY}`]}
                <td>
                  {#if cell}
                    {@render cellLink(a.key, OTHER_KEY, cell, `${a.label} · ${t('ovOtherColumn', { n: overview.otherColumn.count })}`)}
                  {:else}
                    <span class="ov-none">·</span>
                  {/if}
                </td>
              {/if}
              <td class="ov-sum">{@render cellLink(a.key, '*', a.bucket, a.label)}</td>
            </tr>
          {/each}
          {#if overview.others}
            <tr class="ov-others-row">
              <th scope="row" class="ov-a">{t('ovOthers', { n: overview.others.count })}</th>
              <td colspan={overview.columns.length + (overview.otherColumn ? 1 : 0)}>
                <a class="ov-more" href={href({ show: String(overview.show + 15), cell: null, cpage: null })} data-sveltekit-noscroll data-testid="ov-show-more"
                  >{t('ovShowMore', { n: nextShow })}</a
                >
              </td>
              <td class="ov-sum">{@render cellLink(OTHERS_ROW, '*', overview.others.bucket, t('ovOthers', { n: overview.others.count }))}</td>
            </tr>
          {/if}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="ov-a">{t('ovTotal')}</th>
            {#each overview.columns as b (b.key)}
              <td class:is-weekend={group === 'day' && isWeekend(b.key)}>
                {#if b.bucket.entries}
                  {@render cellLink('*', b.key, b.bucket, columnLabel(b.label))}
                {:else}
                  <span class="ov-none">·</span>
                {/if}
              </td>
            {/each}
            {#if overview.otherColumn}
              <td>{@render cellLink('*', OTHER_KEY, overview.otherColumn.bucket, t('ovOtherColumn', { n: overview.otherColumn.count }))}</td>
            {/if}
            <td class="ov-sum">{@render cellLink('*', '*', overview.total, t('ovTotal'), true)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Phone: grouped cards -->
    <ol class="ov-groups" data-testid="ov-groups">
      {#each overview.rows as a (a.key)}
        <li class="ov-group">
          <a class="ov-group-head" href={cellHref(a.key, '*')} data-sveltekit-noscroll data-sveltekit-replacestate>
            <strong>{a.label}</strong>
            <span class="ov-group-total">{hours(a.bucket.minutes)} h</span>
            {@render statusBar(a.bucket)}
          </a>
          <ul>
            {#each [...overview.columns, ...(overview.otherColumn ? [{ key: OTHER_KEY, label: t('ovOtherColumn', { n: overview.otherColumn.count }) }] : [])] as b (b.key)}
              {@const cell = overview.cells[`${a.key}|${b.key}`]}
              {#if cell}
                <li>
                  <a
                    class="ov-line"
                    class:is-selected={selectedCell === `${a.key}|${b.key}`}
                    href={cellHref(a.key, b.key)}
                    data-sveltekit-noscroll
                    data-sveltekit-replacestate
                  >
                    <span class="ov-line-label">{b.key === OTHER_KEY ? b.label : columnLabel(b.label)}</span>
                    <span class="ov-line-hours">{hours(cell.minutes)} h</span>
                    {@render statusBar(cell)}
                  </a>
                </li>
              {/if}
            {/each}
          </ul>
        </li>
      {/each}
    </ol>

    <p class="ov-count muted small" data-testid="ov-count">
      {t('ovShowing', { shown: overview.rows.length, total: overview.rowCount })}
      {#if overview.others}
        · <a href={href({ show: String(overview.show + 15), cell: null, cpage: null })} data-sveltekit-noscroll
          >{t('ovShowMore', { n: nextShow })}</a
        >
      {/if}
    </p>

    {#if drill}
      <div class="ov-drill" data-testid="ov-drill" role="region" aria-label={t('ovEntries')} use:reveal>
        <div class="ov-drill-head">
          <h3>{drillTitle} · {hours(drill.bucket.minutes)} h</h3>
          <a class="secondary button-link" href={href({ cell: null, cpage: null })} data-sveltekit-noscroll data-sveltekit-replacestate
            >{t('ovClose')}</a
          >
        </div>
        <p class="muted small">{breakdownText(drill.bucket)}</p>
        <ul class="ov-entries">
          {#each drill.entries as row (row.id)}
            <li>
              <a href={`${base}/app/time/${row.id}`}>
                <span class="ov-entry-date">{formatDate(row.work_date)}</span>
                <span class="ov-entry-main">
                  <span>{group === 'project' ? row.worker_name : projectName(row)}</span>
                  <span class="muted"
                    >{group === 'project' ? projectName(row) : row.worker_name} · {categoryLabel(row.category)}</span
                  >
                  {#if row.start_time || row.note}
                    <span class="ov-entry-detail" data-testid="ov-entry-detail">{timeDetailText(row)}</span>
                  {/if}
                </span>
                <span class="ov-entry-hours">{hours(row.minutes)} h</span>
                <StatusBadge variant={variant(statusOf(row.approval_state))} text={statusLabel(statusOf(row.approval_state))} />
              </a>
            </li>
          {/each}
        </ul>
        <div class="ov-pager">
          <span class="muted small" data-testid="ov-drill-range"
            >{t('ovEntriesRange', {
              from: (drill.page - 1) * drill.pageSize + 1,
              to: Math.min(drill.count, drill.page * drill.pageSize),
              total: drill.count,
            })}</span
          >
          {#if drillPages > 1}
            {#if drill.page > 1}
              <a href={href({ cpage: String(drill.page - 1) })} data-sveltekit-noscroll data-sveltekit-replacestate>← {t('ovPrevious')}</a>
            {/if}
            {#if drill.page < drillPages}
              <a href={href({ cpage: String(drill.page + 1) })} data-sveltekit-noscroll data-sveltekit-replacestate data-testid="ov-drill-next"
                >{t('ovNext')} →</a
              >
            {/if}
          {/if}
        </div>
        {#if drill.sheets?.length}
          <div class="ov-sheets" data-testid="ov-drill-sheets">
            <strong>{t('ovSheets')}</strong>
            <ul>
              {#each drill.sheets as sheet (sheet.id)}
                <li>
                  <a href={`${base}/app/documents/${encodeURIComponent(sheet.id)}?view=1`} target="_blank" rel="noopener"
                    >📄 {sheet.filename}</a
                  >
                  <span class="muted small"
                    >{t('ovSheetFor', {
                      worker: drill.entries.find((entry) => entry.worker_id === sheet.workerId)?.worker_name ?? '',
                      week: formatDate(sheet.weekStart),
                    })}</span
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <div class="ov-drill-actions">
          {#if delegating && drill.workerId && data.user.role !== 'auditor_read_only'}
            <a
              href={`${base}/app/time?mode=week&worker=${encodeURIComponent(drill.workerId)}&week=${weekStartForDate(drill.firstDate) ?? ''}`}
              >{t('ovOpenWeek')} →</a
            >
          {/if}
          {#if delegating && drill.hasSubmitted}
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
  button.secondary,
  a.button-link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
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
  .time-overview .seg a {
    color: var(--ja-ink, #1c2430);
    box-shadow: none;
    border-radius: 0;
  }
  .time-overview .seg a[aria-current='true'] {
    color: #fff;
  }
  .seg a {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    min-height: var(--ja-target-min, 44px);
    padding: 0 0.9rem;
    border: 0;
    background: var(--ja-white, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .seg a[aria-current='true'] {
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
  .ov-entry-detail {
    font-size: 0.85rem;
    color: var(--ja-steel, #5b6573);
  }
  .ov-sheets ul {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .ov-sheets a {
    font-weight: 600;
    margin-right: 0.5rem;
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
  .ov-cell,
  .ov-group-head,
  .ov-line {
    text-decoration: none;
    color: inherit;
    box-sizing: border-box;
  }
  .ov-filters .ov-search {
    flex: 2 1 16rem;
  }
  .ov-others-row th,
  .ov-others-row td {
    color: var(--ja-steel, #5b6573);
    font-style: italic;
  }
  .ov-more {
    font-weight: 600;
  }
  .ov-count {
    margin: 0;
  }
  .ov-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 0.6rem;
  }
  .ov-pager a {
    min-height: var(--ja-target-min, 44px);
    display: inline-flex;
    align-items: center;
    font-weight: 600;
  }
  .ov-extra {
    display: contents;
  }
  .ov-filters .ov-filter-toggle {
    display: none;
  }
  @media (max-width: 760px) {
    .ov-filters .ov-filter-toggle {
      display: inline-flex;
      align-items: center;
    }
    .ov-extra {
      display: grid;
      gap: 0.5rem;
      width: 100%;
    }
    .ov-extra:not(.is-open) {
      display: none;
    }
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
