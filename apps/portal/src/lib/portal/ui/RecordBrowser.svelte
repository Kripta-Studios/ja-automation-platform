<script lang="ts" generics="T extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { normalizeSelectSearch } from '../searchable-selects';
  type Row = Record<string, unknown>;
  let { rows, visible = $bindable<T[]>([]), children, label = 'Records', translate = (text: string) => text, pageSize = 8 }:
    { rows: T[]; visible?: T[]; children?: Snippet<[T[]]>; label?: string; translate?: (text: string) => string; pageSize?: number } = $props();
  let search = $state('');
  let status = $state('');
  let order = $state('priority');
  let page = $state(0);
  const stateOf = (row: Row) => String(row.approval_state ?? row.status ?? row.state ?? '');
  const dateOf = (row: Row) => String(row.date ?? row.work_date ?? row.spent_on ?? row.issue_date ?? row.period_start ?? row.starts_on ?? row.created_at ?? '');
  const nameOf = (row: Row) => String(row.name ?? row.display_name ?? row.worker_name ?? row.project_name ?? row.invoice_number ?? row.title ?? '');
  const priority = (row: Row) => ({submitted: 0, pending: 0, failed: 0, needs_changes: 1, draft: 2, queued: 3, running: 3, approved: 4, ready: 4, active: 4, paid: 5, final: 5, archived: 6}[stateOf(row)] ?? 4);
  const statuses = $derived([...new Set(rows.map(stateOf).filter(Boolean))].sort());
  const filtered = $derived(rows.filter(row => (!status || stateOf(row) === status) && normalizeSelectSearch(Object.values(row).filter(v => typeof v !== 'object').join(' ')).includes(normalizeSelectSearch(search))).sort((a, b) => {
    if (order === 'name') return nameOf(a).localeCompare(nameOf(b));
    if (order === 'status') return stateOf(a).localeCompare(stateOf(b)) || dateOf(a).localeCompare(dateOf(b));
    if (order === 'newest') return dateOf(b).localeCompare(dateOf(a));
    if (order === 'oldest') return dateOf(a).localeCompare(dateOf(b));
    return priority(a) - priority(b) || dateOf(a).localeCompare(dateOf(b)) || nameOf(a).localeCompare(nameOf(b));
  }));
  $effect(() => { visible = filtered.slice(current * pageSize, (current + 1) * pageSize); });
  const pages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
  const current = $derived(Math.min(page, pages - 1));
  $effect(() => { search; status; order; pageSize; page = 0; });
</script>
<div class="record-browser" aria-label={translate(label)}>
  <div class="record-browser__controls">
    <label>{translate('Search')}<input type="search" bind:value={search} aria-label={`${translate('Search')}: ${translate(label)}`} /></label>
    <label>{translate('Status')}<select bind:value={status}><option value="">{translate('All')}</option>{#each statuses as item}<option value={item}>{translate(item)}</option>{/each}</select></label>
    <label>{translate('Sort by')}<select bind:value={order}><option value="priority">{translate('Needs attention first')}</option><option value="oldest">{translate('Oldest first')}</option><option value="newest">{translate('Newest first')}</option><option value="name">{translate('Name')}</option><option value="status">{translate('Status')}</option></select></label>
  </div>
  <nav class="record-browser__pages" aria-label={`${translate(label)}: ${translate('Pages')}`}>
    <button type="button" disabled={current === 0} onclick={() => page = current - 1}>← {translate('Previous')}</button>
    <span role="status">{filtered.length ? current * pageSize + 1 : 0}–{Math.min((current + 1) * pageSize, filtered.length)} / {filtered.length}</span>
    <button type="button" disabled={current + 1 >= pages} onclick={() => page = current + 1}>{translate('Next')} →</button>
  </nav>
  {@render children?.(filtered.slice(current * pageSize, (current + 1) * pageSize))}
  {#if !filtered.length}<p role="status">{translate('No matching records.')}</p>{/if}
</div>
