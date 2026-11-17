<script lang="ts">
  import DirectionIcon from './DirectionIcon.svelte';
  import { onMount, tick } from 'svelte';
  import type { NavItem, NavShortcut } from '../../portal-navigation';
  import type { PortalLocale } from '../../portal-i18n';
  import { navigationUxText } from '../navigation-ux-copy';
  import { paletteCopy, paletteSuggestedTaskIds } from '../assistant/copy';
  import { tasksForContext } from '../assistant/catalog';
  import {
    searchPaletteRecords,
    searchSectionDestinations,
    type PaletteRecord,
    type SectionSearchEntry,
  } from './section-search';
  import type { AssistantContext, AssistantTask } from '../assistant/types';
  /**
   * The portal's one search (Ctrl/⌘ K): sections, actions (the role-gated task
   * catalogue) and records the server already scoped to this account.
   */
  let {
    items,
    shortcuts = [],
    context,
    itemHref,
    recordSearchHref,
    recordSuggestions = [],
    canSearchRecords = false,
    translate,
    currentSection = '',
    locale = 'en',
    recordEndpoint = '',
    mapRecord,
  }: {
    items: readonly NavItem[];
    shortcuts?: readonly NavShortcut[];
    context: AssistantContext;
    itemHref: (item: NavItem) => string;
    recordSearchHref?: (query: string) => string;
    recordSuggestions?: readonly PaletteRecord[];
    canSearchRecords?: boolean;
    translate: (key: string) => string;
    currentSection?: string;
    locale?: PortalLocale;
    /** On-demand record search (scale): queried as the person types. */
    recordEndpoint?: string;
    mapRecord?: (row: Record<string, unknown>, index: number) => PaletteRecord;
  } = $props();
  const id = $props.id();
  const copy = $derived(paletteCopy[locale] ?? paletteCopy.en);
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let trigger: HTMLButtonElement;
  let query = $state('');
  let mac = $state(false);
  // Results render only while the dialog is open, so every page does not
  // ship the whole destination list in its HTML.
  let isOpen = $state(false);
  const results = $derived(
    searchSectionDestinations(query, {
      items,
      shortcuts,
      context,
      locale,
      translate,
      itemHref,
    }),
  );
  let remote = $state<{ query: string; records: PaletteRecord[] }>({ query: '', records: [] });
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;
  let remoteAbort: AbortController | undefined;
  $effect(() => {
    const term = query.trim();
    clearTimeout(remoteTimer);
    remoteAbort?.abort();
    if (!canSearchRecords || !recordEndpoint || !mapRecord || term.length < 2) return;
    const mapper = mapRecord;
    remoteTimer = setTimeout(() => {
      const controller = new AbortController();
      remoteAbort = controller;
      const target = new URL(recordEndpoint, location.href);
      target.searchParams.set('q', term);
      fetch(target, { signal: controller.signal, headers: { accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : { records: [] }))
        .then((body: { records?: Array<Record<string, unknown>> }) => {
          if (controller.signal.aborted) return;
          remote = { query: term, records: (body.records ?? []).map(mapper) };
        })
        .catch(() => {
          // Offline or aborted: the local suggestions still answer.
        });
    }, 180);
  });
  const localRecords = $derived(canSearchRecords ? searchPaletteRecords(query, recordSuggestions) : []);
  const records = $derived.by(() => {
    if (!canSearchRecords) return [];
    const local = localRecords;
    if (remote.query !== query.trim() || !remote.records.length) return local;
    const seen = new Set(local.map((record) => record.id));
    return [...local, ...remote.records.filter((record) => !seen.has(record.id))].slice(0, 8);
  });
  const suggestedTasks = $derived.by((): AssistantTask[] => {
    const permitted = tasksForContext(context);
    return paletteSuggestedTaskIds
      .map((taskId) => permitted.find((task) => task.id === taskId))
      .filter((task): task is AssistantTask => Boolean(task))
      .slice(0, 4);
  });
  const resultCount = $derived(
    navigationUxText(locale, 'sectionNavigator', 'resultCount', {
      count: query.trim() ? results.count + records.length : items.length + suggestedTasks.length,
    }),
  );
  async function open() {
    if (dialog.open) {
      input.focus();
      return;
    }
    if (
      document.querySelector(
        'dialog[open], [aria-modal="true"]:not([aria-hidden="true"]):not([inert])',
      )
    )
      return;
    query = '';
    isOpen = true;
    dialog.showModal();
    await tick();
    input.focus();
  }
  function selectTask(task: AssistantTask | undefined) {
    if (!task) return;
    const taskId = task.id;
    dialog.close();
    requestAnimationFrame(() =>
      window.dispatchEvent(new CustomEvent('ja:select-task-assistant', { detail: { taskId } })),
    );
  }
  function groupLabel(kind: 'action' | 'configuration' | 'section'): string {
    const key =
      kind === 'action' ? 'actions' : kind === 'configuration' ? 'configurations' : 'sections';
    return navigationUxText(locale, 'sectionNavigator', key);
  }
  const resultGroups = $derived([
    { kind: 'action' as const, label: groupLabel('action'), entries: results.actions },
    {
      kind: 'configuration' as const,
      label: groupLabel('configuration'),
      entries: results.configurations,
    },
    { kind: 'section' as const, label: groupLabel('section'), entries: results.sections },
  ]);
  function navigateResults(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    const links = Array.from(dialog.querySelectorAll<HTMLElement>('.section-result'));
    if (event.key === 'Enter') {
      if (event.target === input && links[0]) {
        event.preventDefault();
        links[0].click();
      }
      return;
    }
    event.preventDefault();
    const index = links.indexOf(document.activeElement as HTMLElement);
    const next =
      index < 0
        ? event.key === 'ArrowDown'
          ? 0
          : links.length - 1
        : index + (event.key === 'ArrowDown' ? 1 : -1);
    if (next < 0 || next >= links.length) input.focus();
    else links[next]?.focus();
  }
  onMount(() => {
    mac = /Mac|iPhone|iPad/u.test(navigator.platform || navigator.userAgent);
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.defaultPrevented &&
        !event.altKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        void open();
      }
    };
    const openFromEvent = () => void open();
    document.addEventListener('keydown', shortcut);
    window.addEventListener('ja:open-search', openFromEvent);
    return () => {
      document.removeEventListener('keydown', shortcut);
      window.removeEventListener('ja:open-search', openFromEvent);
    };
  });
</script>

<button
  bind:this={trigger}
  class="section-trigger"
  type="button"
  onclick={open}
  aria-label={copy.label}
  aria-haspopup="dialog"
  aria-keyshortcuts="Control+k Meta+k"
  title={`${copy.label} (${mac ? '⌘' : 'Ctrl'} K)`}
  data-search-trigger
>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
  >
  <span class="section-trigger-label">{copy.trigger}</span>
  <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
</button>
<dialog
  bind:this={dialog}
  data-section-search-dialog
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-description`}
  onkeydown={navigateResults}
  onclose={() => {
    isOpen = false;
    trigger?.focus({ preventScroll: true });
  }}
>
  <div class="section-dialog-heading">
    <h2 id={`${id}-title`}>{copy.title}</h2>
    <button
      type="button"
      class="section-close"
      onclick={() => dialog.close()}
      aria-label={translate('Close')}>×</button
    >
  </div>
  <p id={`${id}-description`}>{copy.hint}</p>
  <label class="visually-hidden" for={`${id}-search`}>{copy.label}</label>
  <input
    id={`${id}-search`}
    data-section-search-input
    bind:this={input}
    type="search"
    bind:value={query}
    placeholder={copy.label}
    autocomplete="off"
    spellcheck="false"
    enterkeyhint="search"
  />
  <p class="section-result-count visually-hidden" role="status" aria-live="polite">
    {resultCount}
  </p>
  <nav aria-label={copy.title}>
    {#if !isOpen}
      <!-- Rendered on open. -->
    {:else if query.trim()}
      {#each resultGroups as group (group.kind)}
        {#if group.entries.length}
          <section class="section-result-group" aria-label={group.label}>
            <h3>{group.label}</h3>
            {#each group.entries as entry (entry.id)}
              {@render entryRow(entry, group.label)}
            {/each}
          </section>
        {/if}
      {/each}
      {#if records.length}
        <section class="section-result-group" aria-label={copy.records}>
          <h3>{copy.records}</h3>
          {#each records as record (record.id)}
            <a
              class="section-result"
              data-section-result-kind="record"
              href={record.href}
              onclick={() => dialog.close()}
            >
              <span
                >{record.label}{#if record.detail || record.group}<small
                    >{[record.group, record.detail].filter(Boolean).join(' · ')}</small
                  >{/if}</span
              ><DirectionIcon />
            </a>
          {/each}
        </section>
      {/if}
      {#if !results.count && !records.length}
        <p class="section-no-matches" role="status">{copy.noMatches}</p>
      {/if}
      {#if canSearchRecords && recordSearchHref && query.trim().length >= 2}
        <section class="section-result-group section-record-search" aria-label={copy.records}>
          <a
            class="section-result"
            data-section-result-kind="record-search"
            href={recordSearchHref(query.trim())}
            onclick={() => dialog.close()}
          >
            <span>{copy.allRecords.replace('{query}', query.trim())}</span>
            <DirectionIcon />
          </a>
        </section>
      {/if}
    {:else}
      {#if suggestedTasks.length}
        <section class="section-result-group" aria-label={copy.suggested}>
          <h3>{copy.suggested}</h3>
          {#each suggestedTasks as task (task.id)}
            <button
              class="section-result section-result-action"
              type="button"
              data-section-result-kind="action"
              data-assistant-task={task.id}
              onclick={() => selectTask(task)}
            >
              <span>{task.title[locale]}</span><DirectionIcon />
            </button>
          {/each}
        </section>
      {/if}
      <section class="section-result-group" aria-label={copy.sections}>
        <h3>{copy.sections}</h3>
        {#each items as item}
          <a
            class="section-result"
            class:section-result-current={translate(item.label) === currentSection}
            aria-current={translate(item.label) === currentSection ? 'page' : undefined}
            href={itemHref(item)}
            aria-label={`${translate('Open section')}: ${translate(item.label)}`}
            onclick={() => dialog.close()}><span>{translate(item.label)}</span><DirectionIcon /></a
          >
        {/each}
      </section>
    {/if}
  </nav>
</dialog>

{#snippet entryRow(entry: SectionSearchEntry, label: string)}
  {#if entry.task}
    <button
      class="section-result section-result-action"
      type="button"
      data-section-result-kind={entry.kind}
      data-assistant-task={entry.task.id}
      aria-label={`${label}: ${entry.label}`}
      onclick={() => selectTask(entry.task)}
    >
      <span>{entry.label}</span><DirectionIcon />
    </button>
  {:else if entry.href}
    <a
      class="section-result"
      class:section-result-current={entry.kind === 'section' && entry.label === currentSection}
      data-section-result-kind={entry.kind}
      aria-current={entry.kind === 'section' && entry.label === currentSection ? 'page' : undefined}
      href={entry.href}
      aria-label={`${label}: ${entry.label}`}
      onclick={() => dialog.close()}
    >
      <span
        >{entry.label}{#if entry.parentLabel}<small>{entry.parentLabel}</small>{/if}</span
      ><DirectionIcon />
    </a>
  {/if}
{/snippet}

<style>
  .section-result span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .section-result-group {
    display: grid;
    gap: 0.25rem;
    padding-top: 0.75rem;
  }
  .section-result-group h3 {
    margin: 0.2rem 0;
    font-size: 0.8125rem;
  }
  .section-no-matches {
    margin: 0.65rem 0 0;
    color: #626359;
    font-size: 0.8125rem;
  }
  .section-record-search {
    margin-top: 0.6rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--ja-line, #d6d5d2);
  }
  .section-result small {
    display: block;
    margin-top: 0.25rem;
    color: #626359;
    font-size: 0.75rem;
  }
  .section-result :global(svg) {
    flex-shrink: 0;
  }
  .section-result.section-result-current {
    background: var(--ja-canvas, #f3f3ef);
    border-color: var(--ja-ink, #24251f);
    font-weight: 700;
  }
  .section-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 0.75rem;
    color: var(--ja-ink, #24251f);
    background: white;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    box-shadow: none;
  }
  .section-trigger-label {
    white-space: nowrap;
  }
  kbd {
    font-size: 0.6875rem;
    color: #626359;
  }
  dialog {
    width: min(34rem, calc(100vw - 2rem));
    max-height: min(42rem, calc(100dvh - 2rem));
    margin: auto;
    padding: 1.25rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 1rem;
    color: var(--ja-ink, #24251f);
    background: white;
    box-shadow: 0 20px 80px #0003;
    overflow: auto;
  }
  dialog::backdrop {
    background: #17191480;
  }
  .section-dialog-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h2 {
    font-size: 1.25rem;
    margin: 0;
  }
  p {
    font-size: 0.875rem;
    line-height: 1.5;
    color: #56574f;
  }
  .section-result-count {
    margin: 0.65rem 0 0;
    color: #626359;
    font-size: 0.8125rem;
  }
  .section-close {
    min-width: 44px;
    min-height: 44px;
    background: white;
    color: inherit;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 0.5rem;
    font-size: 1.5rem;
    cursor: pointer;
    box-shadow: none;
  }
  label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  input {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--ja-control-border, #86877b);
    border-radius: 0.5rem;
    padding: 0.75rem;
    color: inherit;
    background: white;
    font: inherit;
  }
  nav {
    display: grid;
    gap: 0.25rem;
    margin-top: 0.75rem;
    max-height: 45dvh;
    overflow: auto;
  }
  .section-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    min-height: 48px;
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
    color: inherit;
    text-decoration: none;
    font-size: 0.9375rem;
  }
  button.section-result {
    width: 100%;
    border: 1px solid transparent;
    background: white;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .section-result:hover,
  .section-result:focus-visible {
    background: var(--ja-canvas, #f6f6f1);
  }
  :is(button, input, a):focus-visible {
    outline: 2px solid var(--ja-accent, #2349b5);
    outline-offset: -2px;
  }
  .section-trigger {
    width: min(26rem, 100%);
    min-width: 13rem;
    justify-content: flex-start;
    color: #56574f;
  }
  .section-trigger kbd {
    margin-left: auto;
    padding: 0.1rem 0.35rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 0.35rem;
    font-family: inherit;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 900px) {
    kbd {
      display: none;
    }
    .section-trigger {
      width: auto;
      gap: 0.3rem;
      min-width: 0;
      padding: 0.45rem 0.65rem;
      font-size: 0.8125rem;
    }
  }
  @media print {
    .section-trigger,
    dialog {
      display: none;
    }
  }
</style>
