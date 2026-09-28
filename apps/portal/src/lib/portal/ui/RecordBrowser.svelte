<script lang="ts" generics="T extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount, untrack } from 'svelte';
  import { page as route } from '$app/stores';
  import {
    readOperationalRegisterState,
    writeOperationalRegisterState,
  } from '../sections/operational-register';
  import {
    browseRecords,
    focusRecordBrowser,
    recordState,
    restoreRecordBrowserState,
    type RecordBrowserState,
  } from './record-browser';
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
    filtersEnabled = true,
    controlled = false,
    resetKey = '',
    showEmpty = true,
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
    filtersEnabled?: boolean;
    controlled?: boolean;
    resetKey?: string;
    showEmpty?: boolean;
  } = $props();
  let search = $state('');
  let order = $state('priority');
  let page = $state(0);
  const statuses = $derived(
    [...new Set([...rows.map(recordState), status].filter(Boolean))].sort(),
  );
  const filtered = $derived(
    controlled
      ? [...rows]
      : browseRecords(rows, filtersEnabled ? search : '', filtersEnabled ? status : '', order),
  );
  $effect(() => {
    visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  });
  const pages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
  const current = $derived(Math.min(page, pages - 1));
  const defaults: RecordBrowserState = untrack(() => ({
    search: '',
    status,
    order: 'priority',
    page: 0,
  }));
  let criteria = '';
  let mounted = $state(false);
  let restoredKey = $state<string | null>(null);
  let appliedFocus = '';
  const storageKey = $derived(
    `ja-record-browser:${$route.data.user?.id ?? $route.data.managementUser?.id ?? ''}:${$route.url.pathname}${$route.url.search}:${label}:${contextKey}`,
  );
  onMount(() => {
    mounted = true;
  });

  // A SvelteKit query/context navigation can reuse this component. Restore the
  // incoming context before any writer can copy the outgoing filters into it.
  $effect(() => {
    if (!mounted || controlled) return;
    const key = storageKey;
    const snapshot = { search, status, order, page };
    const nextCriteria = JSON.stringify([search, status, order, pageSize]);
    if (restoredKey !== key) {
      const saved = readOperationalRegisterState<Record<string, unknown>>(key);
      const restored = restoreRecordBrowserState(saved, defaults, filtersEnabled);
      criteria = JSON.stringify([restored.search, restored.status, restored.order, pageSize]);
      appliedFocus = '';
      restoredKey = key;
      search = restored.search;
      status = restored.status;
      order = restored.order;
      page = restored.page;
      return;
    }
    if (criteria !== nextCriteria) {
      criteria = nextCriteria;
      page = 0;
      snapshot.page = 0;
    }
    writeOperationalRegisterState(key, snapshot);
  });
  let appliedResetKey = $state('');
  $effect(() => {
    if (!controlled || appliedResetKey === resetKey) return;
    page = 0;
    appliedResetKey = resetKey;
  });
  // Focus is an explicit navigation request, not a permanent filter lock.
  // Retry when the row arrives, but never broaden the server/parent projection.
  $effect(() => {
    const key = storageKey;
    if (!mounted || (!controlled && restoredKey !== key)) return;
    const request = focusId ? JSON.stringify([key, focusId]) : '';
    if (!request) {
      appliedFocus = '';
      return;
    }
    if (appliedFocus === request) return;
    const focused = focusRecordBrowser(
      rows,
      { search, status, order, page },
      focusId,
      pageSize,
      filtersEnabled,
      controlled,
    );
    if (!focused) return;
    appliedFocus = request;
    criteria = JSON.stringify([focused.search, focused.status, focused.order, pageSize]);
    search = focused.search;
    status = focused.status;
    order = focused.order;
    page = focused.page;
  });
</script>

<div class="record-browser" aria-label={translate(label)}>
  {#if !controlled}<div class="record-browser__controls">
      {#if filtersEnabled}
        <label
          >{translate('Search')}<input
            type="search"
            bind:value={search}
            aria-label={`${translate('Search')}: ${translate(label)}`}
          /></label
        >
        <label
          >{translate('Status')}<select bind:value={status}
            ><option value="">{translate('All')}</option>{#each statuses as item}<option
                value={item}>{translate(item)}</option
              >{/each}</select
          ></label
        >
      {/if}
      <label
        >{translate('Sort by')}<select bind:value={order}
          ><option value="priority">{translate('Needs attention first')}</option><option
            value="oldest">{translate('Oldest first')}</option
          ><option value="newest">{translate('Newest first')}</option><option value="name"
            >{translate('Name')}</option
          ><option value="status">{translate('Status')}</option></select
        ></label
      >
    </div>{/if}
  <nav class="record-browser__pages" aria-label={`${translate(label)}: ${translate('Pages')}`}>
    {#if pages > 1}<button
        type="button"
        disabled={current === 0}
        onclick={() => (page = current - 1)}>← {translate('Previous')}</button
      >{/if}
    <span role="status"
      >{filtered.length ? current * pageSize + 1 : 0}–{Math.min(
        (current + 1) * pageSize,
        filtered.length,
      )} / {filtered.length}</span
    >
    {#if pages > 1}<button
        type="button"
        disabled={current + 1 >= pages}
        onclick={() => (page = current + 1)}>{translate('Next')} →</button
      >{/if}
  </nav>
  {@render children?.(filtered.slice(current * pageSize, (current + 1) * pageSize))}
  {#if showEmpty && !filtered.length}<p role="status">{translate('No matching records.')}</p>{/if}
</div>
