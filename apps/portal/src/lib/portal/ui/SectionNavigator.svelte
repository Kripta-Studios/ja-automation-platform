<script lang="ts">
  import DirectionIcon from './DirectionIcon.svelte';
  import { onMount, tick } from 'svelte';
  import type { NavItem } from '../../portal-navigation';
  import type { PortalLocale } from '../../portal-i18n';
  import { navigationUxText } from '../navigation-ux-copy';
  import { assistantCopy } from '../assistant/copy';
  let {
    items,
    itemHref,
    translate,
    currentSection = '',
    locale = 'en',
  }: {
    items: readonly NavItem[];
    itemHref: (item: NavItem) => string;
    translate: (key: string) => string;
    currentSection?: string;
    locale?: PortalLocale;
  } = $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let trigger: HTMLButtonElement;
  let query = $state('');
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const matches = $derived(
    items.filter((item) => normalize(translate(item.label)).includes(normalize(query.trim()))),
  );
  const resultCount = $derived(
    navigationUxText(locale, 'sectionNavigator', 'resultCount', { count: matches.length }),
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
  function navigateResults(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    const links = Array.from(dialog.querySelectorAll<HTMLAnchorElement>('.section-result'));
    if (event.key === 'Enter') {
      if (event.target === input && links[0]) {
        event.preventDefault();
        links[0].click();
      }
      return;
    }
    event.preventDefault();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
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
    {translate('Search the sections available to your profile.')}
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
    bind:this={input}
    type="search"
    bind:value={query}
    autocomplete="off"
  />
  <p class="section-result-count" role="status" aria-live="polite">{resultCount}</p>
  <nav aria-label={translate('Go to section')}>
    {#each matches as item}
      <a
        class="section-result"
        class:section-result-current={translate(item.label) === currentSection}
        aria-current={translate(item.label) === currentSection ? 'page' : undefined}
        href={itemHref(item)}
        aria-label={`${translate('Open section')}: ${translate(item.label)}`}
        onclick={() => dialog.close()}><span>{translate(item.label)}</span><DirectionIcon /></a
      >
    {/each}
    {#if !matches.length}<p role="status">{translate('No matching sections')}</p>{/if}
  </nav>
</dialog>

<style>
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
</style>
