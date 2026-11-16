<script lang="ts">
  /*
   * Review view for owner / finance / PM (owner request 2026-11-16): one period,
   * totals by worker or project with per-currency sums and status breakdown,
   * a category breakdown, drill-down to each expense with its receipt, and the
   * existing exports. Rows come from the already authorized, role-projected
   * expense load; nothing here widens what a role can see.
   */
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { StatusBadge } from '../ui';
  import type { PortalRow as Row } from '../portal-data';
  import { money } from '../portal-format';
  import { expenseCategories, primaryExpenseCategories } from '../expense-categories';
  import { expenseReceiptState } from '../expense-evidence';
  import type { PortalLocale } from '../../portal-i18n';
  import { expenseCopy, expenseLocaleTag, type ExpenseCopyKey } from './expense-copy';
  import {
    expenseStatusOf,
    expenseStatusLabel,
    expenseStatusVariant,
    type ExpenseStatus,
  } from './expense-status';

  let {
    records,
    projects,
    people,
    locale,
    translate,
  }: {
    records: Row[];
    projects: Row[];
    people: Array<{ id: string; name: string }>;
    locale: PortalLocale;
    translate: (value: string) => string;
  } = $props();

  const c = (key: ExpenseCopyKey, params: Record<string, string | number> = {}): string =>
    expenseCopy(locale, key, params);
  const tag = $derived(expenseLocaleTag[locale]);
  const text = (row: Row | undefined, key: string): string => {
    const value = row?.[key];
    return value === null || value === undefined ? '' : String(value);
  };

  /* ------------------------------------------------------------ period */
  type Period = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';
  const iso = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function range(period: Period): { from: string; to: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    if (period === 'thisWeek') {
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: iso(monday), to: iso(sunday) };
    }
    if (period === 'lastWeek') {
      const start = new Date(monday);
      start.setDate(monday.getDate() - 7);
      const end = new Date(monday);
      end.setDate(monday.getDate() - 1);
      return { from: iso(start), to: iso(end) };
    }
    if (period === 'lastMonth')
      return {
        from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    return {
      from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  const query = $page.url.searchParams;
  const initialFrom = query.get('from') ?? '';
  const initialTo = query.get('to') ?? '';
  let period = $state<Period>(initialFrom || initialTo ? 'custom' : 'thisMonth');
  let customFrom = $state(initialFrom || range('thisMonth').from);
  let customTo = $state(initialTo || range('thisMonth').to);
  const window_ = $derived(
    period === 'custom' ? { from: customFrom, to: customTo } : range(period),
  );
  function choosePeriod(next: Period): void {
    if (next === 'custom') {
      customFrom = window_.from;
      customTo = window_.to;
    }
    period = next;
  }

  /* ----------------------------------------------------------- filters */
  let projectFilter = $state(query.get('project') ?? '');
  let workerFilter = $state(query.get('worker') ?? '');
  let statusFilter = $state(query.get('status') ?? '');
  let categoryFilter = $state(query.get('category') ?? '');
  let groupBy = $state<'worker' | 'project'>(
    query.get('group') === 'project' ? 'project' : 'worker',
  );

  const inPeriod = $derived(
    records.filter((row) => {
      const date = text(row, 'spent_on');
      return (
        (!window_.from || date >= window_.from) &&
        (!window_.to || date <= window_.to) &&
        (!projectFilter || text(row, 'project_id') === projectFilter) &&
        (!workerFilter || text(row, 'worker_id') === workerFilter) &&
        (!categoryFilter || text(row, 'category') === categoryFilter) &&
        (!statusFilter || expenseStatusOf(row) === statusFilter)
      );
    }),
  );

  /** Rows that count toward money totals: replaced originals and rejected claims do not. */
  const counts = (row: Row): boolean =>
    !text(row, 'active_correction_id') && row.approval_state !== 'rejected';
  function sums(rows: Row[]): Map<string, bigint> {
    const result = new Map<string, bigint>();
    for (const row of rows) {
      if (!counts(row)) continue;
      const minor = text(row, 'amount_minor');
      if (!/^-?\d+$/u.test(minor)) continue;
      const currency = text(row, 'currency') || 'USD';
      result.set(currency, (result.get(currency) ?? 0n) + BigInt(minor));
    }
    return result;
  }
  const format = (totals: Map<string, bigint>): string =>
    [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, minor]) => money(minor.toString(), currency, tag))
      .join(' + ') || '—';
  const statusOrder: ExpenseStatus[] = [
    'draft',
    'submitted',
    'needs_changes',
    'approved',
    'reimbursed',
    'rejected',
  ];
  function breakdown(rows: Row[]): Array<{ status: ExpenseStatus; count: number }> {
    return statusOrder
      .map((status) => ({
        status,
        count: rows.filter((row) => expenseStatusOf(row) === status).length,
      }))
      .filter((item) => item.count > 0);
  }

  type Group = { id: string; name: string; rows: Row[] };
  const groups = $derived.by((): Group[] => {
    const map = new Map<string, Group>();
    for (const row of inPeriod) {
      const id = groupBy === 'worker' ? text(row, 'worker_id') : text(row, 'project_id');
      const name =
        groupBy === 'worker'
          ? text(row, 'worker_name')
          : `${text(row, 'project_number')} · ${text(row, 'project_name')}`;
      const group = map.get(id) ?? { id, name, rows: [] };
      group.rows.push(row);
      map.set(id, group);
    }
    return [...map.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => text(b, 'spent_on').localeCompare(text(a, 'spent_on'))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  function categoryLabel(value: string): string {
    const primary = primaryExpenseCategories.find((item) => item.value === value);
    if (primary) return c(primary.copy as ExpenseCopyKey);
    return translate(expenseCategories.find(([key]) => key === value)?.[1] ?? value);
  }
  const categories = $derived.by(() => {
    const map = new Map<string, Row[]>();
    for (const row of inPeriod) {
      const key = text(row, 'category');
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    const list = [...map.entries()].map(([category, rows]) => ({
      category,
      rows,
      totals: sums(rows),
    }));
    // Bar length compares categories within the period's main currency only.
    const all = sums(inPeriod);
    const main = [...all.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1))[0]?.[0] ?? '';
    const max = list.reduce((top, item) => {
      const value = item.totals.get(main) ?? 0n;
      return value > top ? value : top;
    }, 0n);
    return list
      .map((item) => ({
        ...item,
        share: max > 0n ? Number(((item.totals.get(main) ?? 0n) * 1000n) / max) / 10 : 0,
      }))
      .sort((a, b) => b.share - a.share || b.rows.length - a.rows.length);
  });

  const dateLabel = (date: string): string => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.valueOf())
      ? new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
          parsed,
        )
      : date;
  };

  const exportHref = (format: 'csv' | 'xlsx' | 'pdf'): string => {
    const params = new URLSearchParams({ from: window_.from, to: window_.to, format });
    if (projectFilter) params.set('project', projectFilter);
    if (workerFilter) params.set('worker', workerFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (statusFilter && !['reimbursed', 'withdrawn'].includes(statusFilter))
      params.set('status', statusFilter);
    if ($page.url.searchParams.get('includeArchived') === '1') params.set('includeArchived', '1');
    return `${base}/app/expenses/export?${params}`;
  };
  const receiptHref = (row: Row): string =>
    `${base}/app/api/documents/${encodeURIComponent(text(row, 'receipt_document_id'))}?view=1`;
  const detailHref = (row: Row): string =>
    `${base}/app/expenses/${encodeURIComponent(text(row, 'id'))}`;
  const periods: Period[] = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'custom'];
</script>

<section class="ov" aria-labelledby="expense-overview-title">
  <header>
    <h2 id="expense-overview-title">{c('ovTitle')}</h2>
    <p class="ov-muted">{c('ovIntro')}</p>
  </header>

  <div class="ov-periods" role="group" aria-label={c('period')}>
    {#each periods as item (item)}
      <button
        type="button"
        class="ov-chip"
        aria-pressed={period === item}
        onclick={() => choosePeriod(item)}>{c(item)}</button
      >
    {/each}
  </div>
  {#if period === 'custom'}
    <div class="ov-custom">
      <label><span>{c('from')}</span><input type="date" bind:value={customFrom} /></label>
      <label
        ><span>{c('to')}</span><input type="date" bind:value={customTo} min={customFrom} /></label
      >
    </div>
  {/if}

  <div class="ov-filters">
    <label>
      <span>{c('project')}</span>
      <select bind:value={projectFilter}>
        <option value="">{c('allProjects')}</option>
        {#each projects as project (text(project, 'id'))}
          <option value={text(project, 'id')}
            >{text(project, 'project_number')} · {text(project, 'name')}</option
          >
        {/each}
      </select>
    </label>
    <label>
      <span>{c('person')}</span>
      <select bind:value={workerFilter}>
        <option value="">{c('allPeople')}</option>
        {#each people as person (person.id)}
          <option value={person.id}>{person.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Status')}</span>
      <select bind:value={statusFilter}>
        <option value="">{c('allStatuses')}</option>
        {#each statusOrder as status (status)}
          <option value={status}>{c(expenseStatusLabel[status])}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{c('category')}</span>
      <select bind:value={categoryFilter}>
        <option value="">{c('allCategories')}</option>
        {#each expenseCategories as [value] (value)}
          <option {value}>{categoryLabel(value)}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="ov-summary">
    <div>
      <span class="ov-muted"
        >{c('periodTotal')} · {dateLabel(window_.from)} – {dateLabel(window_.to)}</span
      >
      <strong class="ov-big">{format(sums(inPeriod))}</strong>
      <span class="ov-muted">{c('items', { n: inPeriod.length })}</span>
    </div>
    <div class="ov-badges">
      {#each breakdown(inPeriod) as item (item.status)}
        <StatusBadge
          variant={expenseStatusVariant[item.status]}
          text={`${c(expenseStatusLabel[item.status])} · ${item.count}`}
        />
      {/each}
    </div>
    <p class="ov-exports">
      <span class="ov-muted">{c('download')}:</span>
      <a href={exportHref('csv')} download>CSV</a>
      <a href={exportHref('xlsx')} download>Excel</a>
      <a href={exportHref('pdf')} download>PDF</a>
    </p>
  </div>

  {#if inPeriod.length === 0}
    <p class="ov-empty" role="status">{c('noData')}</p>
  {:else}
    <div class="ov-layout">
      <div class="ov-groups">
        <div class="ov-groupby" role="group" aria-label={c('groupBy')}>
          <button
            type="button"
            class="ov-chip"
            aria-pressed={groupBy === 'worker'}
            onclick={() => (groupBy = 'worker')}>{c('byWorker')}</button
          >
          <button
            type="button"
            class="ov-chip"
            aria-pressed={groupBy === 'project'}
            onclick={() => (groupBy = 'project')}>{c('byProject')}</button
          >
        </div>
        {#each groups as group (group.id)}
          <details class="ov-group" data-expense-overview-group>
            <summary>
              <span class="ov-group-name">{group.name}</span>
              <strong class="ov-amount">{format(sums(group.rows))}</strong>
              <span class="ov-group-meta">
                {c('items', { n: group.rows.length })}
                {#each breakdown(group.rows) as item (item.status)}
                  · {c(expenseStatusLabel[item.status])} {item.count}
                {/each}
              </span>
            </summary>
            <ul class="ov-items">
              {#each group.rows as row (text(row, 'id'))}
                {@const status = expenseStatusOf(row)}
                <li class:ov-replaced={!counts(row)}>
                  <span class="ov-item-main">
                    <a href={detailHref(row)}>{categoryLabel(text(row, 'category'))}</a>
                    <span class="ov-muted">
                      {dateLabel(text(row, 'spent_on'))} ·
                      {groupBy === 'worker'
                        ? text(row, 'project_number')
                        : text(row, 'worker_name')}
                      {#if text(row, 'vendor')}· {text(row, 'vendor')}{/if}
                    </span>
                  </span>
                  <span class="ov-item-side">
                    <strong class="ov-amount"
                      >{money(
                        text(row, 'amount_minor'),
                        text(row, 'currency') || 'USD',
                        tag,
                      )}</strong
                    >
                    <StatusBadge
                      variant={expenseStatusVariant[status]}
                      text={c(expenseStatusLabel[status])}
                    />
                    {#if expenseReceiptState(row) === 'attached'}
                      <a href={receiptHref(row)} target="_blank" rel="noopener"
                        >{c('receiptLink')}</a
                      >
                    {:else}
                      <span class="ov-warn">{c('noReceiptShort')}</span>
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          </details>
        {/each}
      </div>

      <aside class="ov-categories" aria-labelledby="expense-overview-categories">
        <h3 id="expense-overview-categories">{c('byCategory')}</h3>
        <ul>
          {#each categories as item (item.category)}
            <li>
              <button
                type="button"
                class="ov-cat"
                aria-pressed={categoryFilter === item.category}
                onclick={() =>
                  (categoryFilter = categoryFilter === item.category ? '' : item.category)}
              >
                <span class="ov-cat-row">
                  <span
                    >{categoryLabel(item.category)}
                    <span class="ov-muted">({item.rows.length})</span></span
                  >
                  <strong class="ov-amount">{format(item.totals)}</strong>
                </span>
                <span class="ov-bar" aria-hidden="true"
                  ><span style:width={`${item.share}%`}></span></span
                >
              </button>
            </li>
          {/each}
        </ul>
      </aside>
    </div>
  {/if}
</section>

<style>
  .ov {
    display: grid;
    gap: 1rem;
  }
  .ov h2 {
    margin: 0;
    font-size: 1.35rem;
  }
  .ov header p {
    margin: 0.25rem 0 0;
  }
  .ov-muted {
    color: var(--ja-text-muted);
    font-size: 0.85rem;
  }
  .ov-warn {
    color: var(--ja-status-warning-foreground);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .ov-periods,
  .ov-groupby {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .ov-chip {
    min-height: 2.6rem;
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--ja-control-border-strong);
    border-radius: 999px;
    background: var(--ja-surface);
    color: var(--ja-text-primary);
    box-shadow: none;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .ov-chip:hover:not(:disabled) {
    background: var(--ja-surface-raised);
    color: var(--ja-text-primary);
    border-color: var(--ja-primary);
  }
  .ov-chip[aria-pressed='true'],
  .ov-chip[aria-pressed='true']:hover:not(:disabled) {
    background: var(--ja-primary);
    border-color: var(--ja-primary);
    color: #fff;
  }
  .ov-custom,
  .ov-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
    gap: 0.6rem;
  }
  .ov-custom label,
  .ov-filters label {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }
  .ov-custom span,
  .ov-filters span {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ja-text-secondary);
  }
  .ov-custom input,
  .ov-filters select {
    width: 100%;
    min-height: 2.75rem;
  }
  .ov-summary {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--ja-border-subdued);
    border-radius: var(--ja-radius);
    background: var(--ja-surface);
  }
  .ov-summary > div:first-child {
    display: grid;
    gap: 0.15rem;
  }
  .ov-big {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .ov-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .ov-exports {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.9rem;
    margin: 0;
    font-weight: 700;
  }
  .ov-empty {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--ja-border-strong);
    border-radius: var(--ja-radius);
    color: var(--ja-text-secondary);
  }
  .ov-layout {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .ov-groups {
    display: grid;
    gap: 0.6rem;
  }
  .ov-group {
    border: 1px solid var(--ja-border-subdued);
    border-radius: 0.8rem;
    background: var(--ja-surface);
  }
  .ov-group summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.15rem 0.8rem;
    padding: 0.8rem 1rem;
    cursor: pointer;
    list-style: none;
  }
  .ov-group summary::-webkit-details-marker {
    display: none;
  }
  .ov-group[open] summary {
    border-bottom: 1px solid var(--ja-border-subdued);
    background: var(--ja-surface-raised);
    border-radius: 0.8rem 0.8rem 0 0;
  }
  .ov-group-name {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .ov-group-meta {
    grid-column: 1 / -1;
    color: var(--ja-text-muted);
    font-size: 0.8rem;
  }
  .ov-amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ov-items {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ov-items li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.35rem 0.8rem;
    padding: 0.6rem 1rem;
  }
  .ov-items li + li {
    border-top: 1px solid var(--ja-border-subdued);
  }
  .ov-replaced {
    opacity: 0.6;
  }
  .ov-item-main {
    display: grid;
    min-width: 0;
  }
  .ov-item-main a {
    font-weight: 700;
    color: inherit;
  }
  .ov-item-side {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }
  .ov-item-side a {
    font-weight: 700;
  }
  .ov-categories {
    padding: 1rem;
    border: 1px solid var(--ja-border-subdued);
    border-radius: var(--ja-radius);
    background: var(--ja-surface);
  }
  .ov-categories h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .ov-categories ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .ov-cat {
    display: grid;
    justify-content: stretch;
    justify-items: stretch;
    align-items: stretch;
    gap: 0.3rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.45rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.6rem;
    background: transparent;
    color: var(--ja-text-primary);
    box-shadow: none;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
  }
  .ov-cat:hover:not(:disabled),
  .ov-cat[aria-pressed='true'] {
    background: var(--ja-surface-raised);
    color: var(--ja-text-primary);
    border-color: var(--ja-border-strong);
  }
  .ov-cat-row {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .ov-bar {
    display: block;
    height: 0.35rem;
    border-radius: 999px;
    background: var(--ja-border-subdued);
    overflow: hidden;
  }
  .ov-bar span {
    display: block;
    height: 100%;
    background: var(--ja-primary);
  }
  @media (max-width: 56rem) {
    .ov-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .ov-categories {
      order: -1;
    }
  }
</style>
