<script lang="ts" generics="T extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { page as route } from '$app/stores';
  import {
    readOperationalRegisterState,
    writeOperationalRegisterState,
  } from '../sections/operational-register';
  import { browseRecords, recordState } from './record-browser';
  let {
    rows,
    visible = $bindable<T[]>([]),
    status = $bindable(''),
    children,
    label = 'Records',
    translate = (text: string) => text,
    pageSize = 8,
    focusId = '',
    contextKey = '',
  }: {
    rows: T[];
    visible?: T[];
    status?: string;
    children?: Snippet<[T[]]>;
    label?: string;
    translate?: (text: string) => string;
    pageSize?: number;
    focusId?: string;
    contextKey?: string;
  } = $props();
  let search = $state('');
  let order = $state('priority');
  let page = $state(0);
  const statuses = $derived(
    [...new Set([...rows.map(recordState), status].filter(Boolean))].sort(),
  );
  const filtered = $derived(browseRecords(rows, search, status, order));
  $effect(() => {
    visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  });
  const pages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
  const current = $derived(Math.min(page, pages - 1));
  let criteria = '';
  let hydrated = $state(false);
  const storageKey = $derived(
    `ja-record-browser:${$route.data.user?.id ?? $route.data.managementUser?.id ?? ''}:${$route.url.pathname}${$route.url.search}:${label}:${contextKey}`,
  );
  onMount(() => {
    const saved = focusId
      ? null
      : readOperationalRegisterState<{
          search?: string;
          status?: string;
          order?: string;
          page?: number;
        }>(storageKey);
    if (typeof saved?.search === 'string') search = saved.search;
    if (typeof saved?.status === 'string') status = saved.status;
    if (typeof saved?.order === 'string') order = saved.order;
    if (Number.isInteger(saved?.page) && Number(saved?.page) >= 0) page = Number(saved?.page);
    criteria = JSON.stringify([search, status, order, pageSize]);
    hydrated = true;
  });
  $effect(() => {
    const next = JSON.stringify([search, status, order, pageSize]);
    if (criteria && criteria !== next) page = 0;
    criteria = next;
  });
  $effect(() => {
    if (hydrated) writeOperationalRegisterState(storageKey, { search, status, order, page });
  });
  // Detail links must reveal their target even when it lives beyond the first page.
  let appliedFocus = $state('');
  $effect(() => {
    if (!focusId || appliedFocus === focusId) return;
    const index = filtered.findIndex((row) => String(row.id) === focusId);
    if (index >= 0) {
      page = Math.floor(index / pageSize);
      appliedFocus = focusId;
    }
  });
</script>

<div class="record-browser" aria-label={translate(label)}>
  <div class="record-browser__controls">
    <label
      >{translate('Search')}<input
        type="search"
        bind:value={search}
        aria-label={`${translate('Search')}: ${translate(label)}`}
      /></label
    >
    <label
      >{translate('Status')}<select bind:value={status}
        ><option value="">{translate('All')}</option>{#each statuses as item}<option value={item}
            >{translate(item)}</option
          >{/each}</select
      ></label
    >
    <label
      >{translate('Sort by')}<select bind:value={order}
        ><option value="priority">{translate('Needs attention first')}</option><option
          value="oldest">{translate('Oldest first')}</option
        ><option value="newest">{translate('Newest first')}</option><option value="name"
          >{translate('Name')}</option
        ><option value="status">{translate('Status')}</option></select
      ></label
    >
  </div>
  <nav class="record-browser__pages" aria-label={`${translate(label)}: ${translate('Pages')}`}>
    <button type="button" disabled={current === 0} onclick={() => (page = current - 1)}
      >← {translate('Previous')}</button
    >
    <span role="status"
      >{filtered.length ? current * pageSize + 1 : 0}–{Math.min(
        (current + 1) * pageSize,
        filtered.length,
      )} / {filtered.length}</span
    >
    <button type="button" disabled={current + 1 >= pages} onclick={() => (page = current + 1)}
      >{translate('Next')} →</button
    >
  </nav>
  {@render children?.(filtered.slice(current * pageSize, (current + 1) * pageSize))}
  {#if !filtered.length}<p role="status">{translate('No matching records.')}</p>{/if}
</div>
