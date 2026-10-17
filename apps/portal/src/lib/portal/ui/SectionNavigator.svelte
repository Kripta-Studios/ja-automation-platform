<script lang="ts">
  import DirectionIcon from './DirectionIcon.svelte';
  import { onMount, tick } from 'svelte';
  import type { NavItem, NavShortcut } from '../../portal-navigation';
  import type { PortalLocale } from '../../portal-i18n';
  import { navigationUxText } from '../navigation-ux-copy';
  import { assistantCopy } from '../assistant/copy';
  import { searchSectionDestinations, type SectionSearchEntry } from './section-search';
  import type { AssistantContext } from '../assistant/types';
  let {
    items,
    shortcuts = [],
    context,
    itemHref,
    recordSearchHref,
    canSearchRecords = false,
    translate,
    currentSection = '',
    locale = 'en',
  }: {
    items: readonly NavItem[];
    shortcuts?: readonly NavShortcut[];
    context: AssistantContext;
    itemHref: (item: NavItem) => string;
    recordSearchHref?: (query: string) => string;
    canSearchRecords?: boolean;
    translate: (key: string) => string;
    currentSection?: string;
    locale?: PortalLocale;
  } = $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let trigger: HTMLButtonElement;
  let query = $state('');
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
  const frequentSettings = $derived(
    shortcuts.filter((item) =>
      [
        'Configure billing',
        'Project commercial and time policy',
        'Worker compensation',
        'Profile & security',
      ].includes(item.label),
    ),
  );
  const resultCount = $derived(
    navigationUxText(locale, 'sectionNavigator', 'resultCount', {
      count: query.trim() ? results.count : items.length + frequentSettings.length,
    }),
  );
  const triggerLabel = $derived(
    currentSection
      ? `${translate('Go to section')} · ${navigationUxText(locale, 'sectionNavigator', 'currentSection', { section: currentSection })}`
      : translate('Go to section'),
  );
  async function open() {
    if (
      document.querySelector(
        'dialog[open], [aria-modal="true"]:not([aria-hidden="true"]):not([inert])',
      )
    )
      return;
    query = '';
    dialog.showModal();
    await tick();
    input.focus();
  }
  async function openTaskAssistant() {
    dialog.close();
    await tick();
    requestAnimationFrame(() => window.dispatchEvent(new Event('ja:open-task-assistant')));
  }
  function selectTask(entry: SectionSearchEntry) {
    if (!entry.task) return;
    const taskId = entry.task.id;
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
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        event.shiftKey &&
        !event.defaultPrevented &&
        !event.altKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        void open();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  });
</script>

<button
  bind:this={trigger}
  class="section-trigger"
  type="button"
  onclick={open}
  aria-label={triggerLabel}
  aria-haspopup="dialog"
  aria-keyshortcuts="Control+Shift+k Meta+Shift+k"
  title={`${triggerLabel} (Ctrl/⌘ Shift K)`}
>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    ><rect x="3" y="3" width="7" height="7" rx="1" /><rect
      x="14"
      y="3"
      width="7"
      height="7"
      rx="1"
    /><rect x="3" y="14" width="7" height="7" rx="1" /><rect
      x="14"
      y="14"
      width="7"
      height="7"
      rx="1"
    /></svg
  >
  <span class="section-trigger-label">{translate('Go to section')}</span>
  {#if currentSection}<small class="section-trigger-context">{currentSection}</small>{/if}
  <kbd>⌘/Ctrl Shift K</kbd>
</button>
<dialog
  bind:this={dialog}
  data-section-search-dialog
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-description`}
  onkeydown={navigateResults}
  onclose={() => trigger?.focus({ preventScroll: true })}
>
  <div class="section-dialog-heading">
    <h2 id={`${id}-title`}>{translate('Go to section')}</h2>
    <button
      type="button"
      class="section-close"
      onclick={() => dialog.close()}
      aria-label={translate('Close')}>×</button
    >
  </div>
  <p id={`${id}-description`}>
    {navigationUxText(locale, 'sectionNavigator', 'searchHint')}
    {#if currentSection}
      {navigationUxText(locale, 'sectionNavigator', 'currentSection', { section: currentSection })}
    {/if}
  </p>
  <button type="button" class="section-task-action" onclick={openTaskAssistant}>
    {assistantCopy[locale].launcher}<DirectionIcon />
  </button>
  <label for={`${id}-search`}>{translate('Find a section')}</label>
  <input
    id={`${id}-search`}
    data-section-search-input
    bind:this={input}
    type="search"
    bind:value={query}
    autocomplete="off"
  />
  <p class="section-result-count" role="status" aria-live="polite">{resultCount}</p>
  {#if !query.trim() && frequentSettings.length}
    <div class="section-settings" aria-labelledby={`${id}-settings`}>
      <h3 id={`${id}-settings`}>
        {navigationUxText(locale, 'sectionNavigator', 'frequentSettings')}
      </h3>
      <div class="section-settings-links">
        {#each frequentSettings as item}
          <a
            class="section-result section-setting"
            href={itemHref(item)}
            onclick={() => dialog.close()}
          >
            <span>{translate(item.label)}</span><DirectionIcon />
          </a>
        {/each}
      </div>
    </div>
  {/if}
  <nav aria-label={translate('Go to section')}>
    {#if query.trim()}
      {#each resultGroups as group (group.kind)}
        {#if group.entries.length}
          <section class="section-result-group" aria-label={group.label}>
            <h3>{group.label}</h3>
            {#each group.entries as entry (entry.id)}
              {#if entry.task}
                <button
                  class="section-result section-result-action"
                  type="button"
                  data-section-result-kind={entry.kind}
                  data-assistant-task={entry.task.id}
                  aria-label={`${group.label}: ${entry.label}`}
                  onclick={() => selectTask(entry)}
                >
                  <span>{entry.label}</span><DirectionIcon />
                </button>
              {:else if entry.href}
                <a
                  class="section-result"
                  class:section-result-current={entry.kind === 'section' &&
                    entry.label === currentSection}
                  data-section-result-kind={entry.kind}
                  aria-current={entry.kind === 'section' && entry.label === currentSection
                    ? 'page'
                    : undefined}
                  href={entry.href}
                  aria-label={`${group.label}: ${entry.label}`}
                  onclick={() => dialog.close()}
                >
                  <span
                    >{entry.label}{#if entry.parentLabel}<small>{entry.parentLabel}</small
                      >{/if}</span
                  ><DirectionIcon />
                </a>
              {/if}
            {/each}
          </section>
        {/if}
      {/each}
      {#if !results.count}
        <p class="section-no-matches" role="status">
          {navigationUxText(locale, 'sectionNavigator', 'noMatches')}
        </p>
      {/if}
      {#if canSearchRecords && recordSearchHref && query.trim().length >= 2}
        <section
          class="section-result-group section-record-search"
          aria-label={navigationUxText(locale, 'sectionNavigator', 'records')}
        >
          <h3>{navigationUxText(locale, 'sectionNavigator', 'records')}</h3>
          <a
            class="section-result"
            data-section-result-kind="record-search"
            href={recordSearchHref(query.trim())}
            aria-label={navigationUxText(locale, 'sectionNavigator', 'recordSearch', {
              query: query.trim(),
            })}
            onclick={() => dialog.close()}
          >
            <span>
              {navigationUxText(locale, 'sectionNavigator', 'recordSearch', {
                query: query.trim(),
              })}
              <small>{navigationUxText(locale, 'sectionNavigator', 'recordSearchHint')}</small>
            </span>
            <DirectionIcon />
          </a>
        </section>
      {/if}
    {:else}
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
    {/if}
  </nav>
  {#if !query.trim() && canSearchRecords}
    <p class="section-record-note">
      {navigationUxText(locale, 'sectionNavigator', 'recordSearchHint')}
    </p>
  {/if}
</dialog>

<style>
  .section-settings {
    margin-top: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--ja-line, #d6d5d2);
  }
  .section-settings h3 {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
  }
  .section-settings-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .section-setting {
    background: #edf5fc;
    border: 1px solid #d3e2ee;
  }
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
  .section-no-matches,
  .section-record-note {
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
  .section-task-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    margin: 0 0 1rem;
    padding: 0.7rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 0.65rem;
    background: #edf5fc;
    color: #145b91;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
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
  .section-trigger-context {
    max-width: 10rem;
    overflow: hidden;
    color: #626359;
    font-size: 0.6875rem;
    font-weight: 600;
    text-overflow: ellipsis;
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
  @media (max-width: 900px) {
    .section-trigger-context,
    kbd {
      display: none;
    }
    .section-trigger {
      gap: 0.3rem;
      min-width: 7rem;
      padding: 0.45rem 0.55rem;
      font-size: 0.75rem;
    }
  }
  @media print {
    .section-trigger,
    dialog {
      display: none;
    }
  }
  @media (max-width: 480px) {
    .section-settings-links {
      grid-template-columns: 1fr;
    }
  }
</style>
