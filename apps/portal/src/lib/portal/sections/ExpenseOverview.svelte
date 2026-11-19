<script lang="ts">
  import { cssWidth } from '../ui/css-width';
  /*
   * Review view for owner / finance / PM (owner request 2026-11-16): one period,
   * totals by worker or project with per-currency sums and status breakdown,
   * a category breakdown, drill-down to each expense with its receipt, and the
   * existing exports. At scale (2026-11-17) everything is computed on the
   * server: this page receives totals, the top groups and one page of the
   * opened group only; period, filters, search and the open group live in the
   * URL. Exports still download every matching expense from the server.
   */
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { StatusBadge } from '../ui';
  import type { PortalRow as Row } from '../portal-data';
  import type { ExpenseOverviewData, ExpenseSums } from '../expense-overview-types';
  import { money } from '../portal-format';
  import { expenseCategories, primaryExpenseCategories } from '../expense-categories';
  import { expenseReceiptState } from '../expense-evidence';
  import type { PortalLocale } from '../../portal-i18n';
  import { expenseCopy, expenseLocaleTag, type ExpenseCopyKey } from './expense-copy';
  import { personDisplayName } from '../display-name';
  import {
    expenseStatusOf,
    expenseStatusLabel,
    expenseStatusVariant,
    type ExpenseStatus,
  } from './expense-status';

  let {
    overview,
    projects,
    people,
    locale,
    translate,
  }: {
    overview: ExpenseOverviewData;
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

  const statusOrder: ExpenseStatus[] = [
    'draft',
    'submitted',
    'needs_changes',
    'approved',
    'reimbursed',
    'rejected',
  ];
  /** One line per currency; different currencies are never added together. */
  const format = (sums: ExpenseSums): string[] =>
    sums.length ? sums.map(([currency, minor]) => money(minor, currency, tag)) : ['—'];
  /** Replaced originals and rejected claims are listed but not counted. */
  const counts = (row: Row): boolean =>
    !text(row, 'active_correction_id') && row.approval_state !== 'rejected';

  function categoryLabel(value: string): string {
    const primary = primaryExpenseCategories.find((item) => item.value === value);
    if (primary) return c(primary.copy as ExpenseCopyKey);
    return translate(expenseCategories.find(([key]) => key === value)?.[1] ?? value);
  }
  const dateLabel = (date: string): string => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.valueOf())
      ? new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
          parsed,
        )
      : date;
  };

  /** Link that keeps the current filters and changes some of them. */
  const href = (changes: Record<string, string | null>): string => {
    const query = new URLSearchParams($page.url.searchParams);
    query.set('view', 'overview');
    for (const [key, value] of Object.entries(changes))
      if (value === null || value === '') query.delete(key);
      else query.set(key, value);
    return `${base}/app/expenses?${query.toString()}`;
  };
  /** A filter changed: back to the top groups, nothing opened. */
  const reset = { open: null, opage: null, show: null };

  const exportHref = (kind: 'csv' | 'xlsx' | 'pdf'): string => {
    const params = new URLSearchParams({ from: overview.from, to: overview.to, format: kind });
    if (overview.project) params.set('project', overview.project);
    if (overview.worker) params.set('worker', overview.worker);
    if (overview.category) params.set('category', overview.category);
    if (overview.receipt === 'missing') params.set('receipt', 'missing');
    if (overview.find) params.set('q', overview.find);
    if (overview.status && !['reimbursed', 'withdrawn'].includes(overview.status))
      params.set('status', overview.status);
    if ($page.url.searchParams.get('includeArchived') === '1') params.set('includeArchived', '1');
    return `${base}/app/expenses/export?${params}`;
  };
  const receiptHref = (row: Row): string =>
    `${base}/app/api/documents/${encodeURIComponent(text(row, 'receipt_document_id'))}?view=1`;
  const detailHref = (row: Row): string =>
    `${base}/app/expenses/${encodeURIComponent(text(row, 'id'))}`;
  const periods = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'custom'] as const;
  const open = $derived(overview.open);
  const openPages = $derived(open ? Math.ceil(open.count / open.pageSize) : 0);
  const nextShow = $derived(Math.min(overview.others?.count ?? 0, 15));
  const hasFilters = $derived(
    Boolean(
      overview.project ||
        overview.worker ||
        overview.status ||
        overview.category ||
        overview.receipt ||
        overview.find,
    ),
  );
  const submitOnChange = (event: Event) =>
    (event.currentTarget as HTMLSelectElement).form?.requestSubmit();
  let filtersOpen = $state(false);
  const reveal = (node: HTMLElement) => {
    node.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };
</script>

<section class="ov" aria-labelledby="expense-overview-title" data-expense-overview>
  <header>
    <h2 id="expense-overview-title">{c('ovTitle')}</h2>
    <p class="ov-muted">{c('ovIntro')}</p>
  </header>

  <div class="ov-periods" role="group" aria-label={c('period')}>
    {#each periods as item (item)}
      <a
        class="ov-chip"
        href={href({ ...reset, period: item, from: item === 'custom' ? overview.from : null, to: item === 'custom' ? overview.to : null })}
        aria-current={overview.period === item ? 'true' : undefined}
        data-sveltekit-noscroll>{c(item)}</a
      >
    {/each}
  </div>

  <form method="GET" action={`${base}/app/expenses`} class="ov-form" data-sveltekit-noscroll data-sveltekit-keepfocus>
    <input type="hidden" name="view" value="overview" />
    <input type="hidden" name="period" value={overview.period} />
    {#if overview.group === 'project'}<input type="hidden" name="group" value="project" />{/if}
    {#if overview.receipt}<input type="hidden" name="receipt" value="missing" />{/if}
    {#each ['lang', 'includeArchived'] as key (key)}
      {#if $page.url.searchParams.get(key)}
        <input type="hidden" name={key} value={$page.url.searchParams.get(key)} />
      {/if}
    {/each}
    <label class="ov-search">
      <span>{c('ovSearch')}</span>
      <input
        type="search"
        name="find"
        value={overview.find}
        placeholder={c('ovSearch')}
        autocomplete="off"
        data-expense-overview-search
      />
    </label>
    <button
      type="button"
      class="secondary-button ov-filter-toggle"
      aria-expanded={filtersOpen}
      onclick={() => (filtersOpen = !filtersOpen)}>{c('filters')}{hasFilters ? ' •' : ''}</button
    >
    <div class="ov-extra" class:is-open={filtersOpen}>
    {#if overview.period === 'custom'}
      <div class="ov-custom">
        <label><span>{c('from')}</span><input type="date" name="from" value={overview.from} /></label>
        <label
          ><span>{c('to')}</span><input type="date" name="to" value={overview.to} min={overview.from} /></label
        >
      </div>
    {/if}
    <div class="ov-filters">
      <label>
        <span>{c('project')}</span>
        <select name="project" value={overview.project} onchange={submitOnChange}>
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
        <select name="worker" value={overview.worker} onchange={submitOnChange}>
          <option value="">{c('allPeople')}</option>
          {#each overview.people ?? people as person (person.id)}
            <option value={person.id}>{personDisplayName(person.name)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{translate('Status')}</span>
        <select name="status" value={overview.status} onchange={submitOnChange}>
          <option value="">{c('allStatuses')}</option>
          {#each statusOrder as status (status)}
            <option value={status}>{c(expenseStatusLabel[status])}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{c('category')}</span>
        <select name="category" value={overview.category} onchange={submitOnChange}>
          <option value="">{c('allCategories')}</option>
          {#each expenseCategories as [value] (value)}
            <option {value}>{categoryLabel(value)}</option>
          {/each}
        </select>
      </label>
      <div class="ov-form-actions">
        <button type="submit" class="secondary-button">{c('ovSearchButton')}</button>
        {#if hasFilters}
          <a href={href({ ...reset, project: null, worker: null, status: null, category: null, receipt: null, find: null })}
            >{c('clear')}</a
          >
        {/if}
      </div>
    </div>
    </div>
  </form>

  <div class="ov-quick" role="group" aria-label={c('filters')}>
    <a
      class="ov-chip"
      href={href({ ...reset, receipt: overview.receipt ? null : 'missing' })}
      aria-current={overview.receipt === 'missing' ? 'true' : undefined}
      data-sveltekit-noscroll>{c('noReceiptShort')} ({overview.quick.missing})</a
    >
    <a
      class="ov-chip"
      href={href({ ...reset, status: overview.status === 'needs_changes' ? null : 'needs_changes' })}
      aria-current={overview.status === 'needs_changes' ? 'true' : undefined}
      data-sveltekit-noscroll>{c('statusNeedsChanges')} ({overview.quick.needsChanges})</a
    >
    <a
      class="ov-chip"
      href={href({ ...reset, status: overview.status === 'submitted' ? null : 'submitted' })}
      aria-current={overview.status === 'submitted' ? 'true' : undefined}
      data-sveltekit-noscroll>{c('statusSubmitted')} ({overview.quick.submitted})</a
    >
  </div>

  <div class="ov-summary">
    <div>
      <span class="ov-muted"
        >{c('periodTotal')} · {dateLabel(overview.from)} – {dateLabel(overview.to)}</span
      >
      <strong class="ov-big"
        >{#each format(overview.sums) as line (line)}<span>{line}</span>{/each}</strong
      >
      <span class="ov-muted" data-expense-overview-count>{c('items', { n: overview.count })}</span>
    </div>
    <div class="ov-badges">
      {#each overview.breakdown as item (item.status)}
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

  {#if overview.count === 0}
    <p class="ov-empty" role="status">{c('noData')}</p>
  {:else}
    <div class="ov-layout">
      <div class="ov-groups">
        <div class="ov-groupby" role="group" aria-label={c('groupBy')}>
          <a
            class="ov-chip"
            href={href({ ...reset, group: null })}
            aria-current={overview.group === 'worker' ? 'true' : undefined}
            data-sveltekit-noscroll>{c('byWorker')}</a
          >
          <a
            class="ov-chip"
            href={href({ ...reset, group: 'project' })}
            aria-current={overview.group === 'project' ? 'true' : undefined}
            data-sveltekit-noscroll>{c('byProject')}</a
          >
        </div>
        {#each overview.groups as group (group.id)}
          {@const isOpen = open?.id === group.id}
          <div class="ov-group" class:is-open={isOpen} data-expense-overview-group>
            <a
              class="ov-group-head"
              href={href({ open: isOpen ? null : group.id, opage: null })}
              aria-expanded={isOpen}
              data-sveltekit-noscroll
              data-sveltekit-replacestate
            >
              <span class="ov-group-name">{group.name}</span>
              <strong class="ov-amount"
                >{#each format(group.sums) as line (line)}<span>{line}</span>{/each}</strong
              >
              <span class="ov-group-meta">
                {c('items', { n: group.count })}
                {#each group.breakdown as item (item.status)}
                  · {c(expenseStatusLabel[item.status])} {item.count}
                {/each}
              </span>
            </a>
            {#if isOpen && open}
              <div use:reveal>
                <ul class="ov-items">
                  {#each open.items as row (text(row, 'id'))}
                    {@const status = expenseStatusOf(row)}
                    <li class:ov-replaced={!counts(row)}>
                      <span class="ov-item-main">
                        <a href={detailHref(row)}>{categoryLabel(text(row, 'category'))}</a>
                        <span class="ov-muted">
                          {dateLabel(text(row, 'spent_on'))} ·
                          {overview.group === 'worker'
                            ? text(row, 'project_number')
                            : personDisplayName(text(row, 'worker_name'))}
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
                <div class="ov-pager">
                  <span class="ov-muted" data-expense-overview-range
                    >{c('ovItemsRange', {
                      from: (open.page - 1) * open.pageSize + 1,
                      to: Math.min(open.count, open.page * open.pageSize),
                      total: open.count,
                    })}</span
                  >
                  {#if open.page > 1}
                    <a href={href({ opage: String(open.page - 1) })} data-sveltekit-noscroll data-sveltekit-replacestate
                      >← {c('ovPrevious')}</a
                    >
                  {/if}
                  {#if open.page < openPages}
                    <a href={href({ opage: String(open.page + 1) })} data-sveltekit-noscroll data-sveltekit-replacestate data-expense-overview-next
                      >{c('ovNext')} →</a
                    >
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
        {#if overview.others}
          <p class="ov-others ov-muted">
            {c('ovOthers', { n: overview.others.count, items: overview.others.items })} ·
            {format(overview.others.sums).join(' · ')}
          </p>
        {/if}
        <p class="ov-muted ov-count" data-expense-overview-showing>
          {c('ovShowing', { shown: overview.groups.length, total: overview.groupCount })}
          {#if overview.others}
            · <a href={href({ show: String(overview.show + 15), open: null, opage: null })} data-sveltekit-noscroll data-expense-overview-more
              >{c('ovShowMore', { n: nextShow })}</a
            >
          {/if}
        </p>
      </div>

      <aside class="ov-categories" aria-labelledby="expense-overview-categories">
        <h3 id="expense-overview-categories">{c('byCategory')}</h3>
        <ul>
          {#each overview.categories as item (item.category)}
            <li>
              <a
                class="ov-cat"
                href={href({ ...reset, category: overview.category === item.category ? null : item.category })}
                aria-current={overview.category === item.category ? 'true' : undefined}
                data-sveltekit-noscroll
              >
                <span class="ov-cat-row">
                  <span
                    >{categoryLabel(item.category)}
                    <span class="ov-muted">({item.count})</span></span
                  >
                  <strong class="ov-amount"
                    >{#each format(item.sums) as line (line)}<span>{line}</span>{/each}</strong
                  >
                </span>
                <span class="ov-bar" aria-hidden="true"
                  ><span use:cssWidth={item.share}></span></span
                >
              </a>
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
    display: inline-flex;
    align-items: center;
    text-decoration: none;
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
  .ov-chip[aria-current='true'],
  .ov-chip[aria-current='true']:hover {
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
  .ov-search,
  .ov-filters label {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }
  .ov-custom span,
  .ov-search span,
  .ov-filters span {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ja-text-secondary);
  }
  .ov-custom input,
  .ov-search input,
  .ov-filters select {
    width: 100%;
    min-height: 2.75rem;
  }
  .ov-form {
    display: grid;
    gap: 0.6rem;
  }
  .ov-form-actions {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }
  .ov-form-actions a {
    min-height: 2.75rem;
    display: inline-flex;
    align-items: center;
  }
  .ov-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.6rem 1rem;
  }
  .ov-pager a {
    min-height: 2.75rem;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
  }
  .ov-others,
  .ov-count {
    margin: 0;
    font-size: 0.85rem;
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
  .ov-quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .ov-big,
  .ov-amount {
    display: inline-grid;
    justify-items: start;
  }
  .ov-group-head .ov-amount,
  .ov-cat-row .ov-amount {
    justify-items: end;
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
  .ov-group-head {
    text-decoration: none;
    color: inherit;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.15rem 0.8rem;
    padding: 0.8rem 1rem;
    cursor: pointer;
    list-style: none;
  }
  .ov-group.is-open .ov-group-head {
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
    text-decoration: none;
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
  .ov-cat:hover,
  .ov-cat[aria-current='true'] {
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
  .ov-extra {
    display: grid;
    gap: 0.6rem;
  }
  .ov-form .ov-filter-toggle {
    display: none;
  }
  @media (max-width: 760px) {
    .ov-form .ov-filter-toggle {
      display: inline-flex;
      justify-self: start;
    }
    .ov-extra:not(.is-open) {
      display: none;
    }
  }
</style>
