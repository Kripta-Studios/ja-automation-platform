<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { tasksForContext } from './catalog';
  import { searchAssistantTasks } from './matcher';
  import { navigateAssistantTask } from './navigate';
  import { assistantCopy } from './copy';
  import { assistantRecordsFromPage } from './records';
  import type { AssistantContext, AssistantLocale, AssistantTask } from './types';

  let {
    context,
    locale = 'en',
    data,
  }: {
    context: AssistantContext;
    locale: AssistantLocale;
    data?: unknown;
  } = $props();

  const componentId = $props.id();
  const titleId = `assistant-${componentId}-title`;
  const queryId = `assistant-${componentId}-query`;
  const descriptionId = `assistant-${componentId}-description`;
  let dialog: HTMLDialogElement | undefined = $state();
  let queryInput: HTMLInputElement | undefined = $state();
  let open = $state(false);
  let query = $state('');
  let selectedTask: AssistantTask | undefined = $state();
  let busy = $state(false);
  let notice = $state('');
  let previouslyFocused: HTMLElement | null = null;
  const t = $derived(assistantCopy[locale]);
  const permittedTasks = $derived(tasksForContext(context));
  const search = $derived(searchAssistantTasks(query, context, locale));
  const tasks = $derived(
    query.trim() && search.kind === 'matches'
      ? search.matches.map((match) => match.task)
      : permittedTasks,
  );
  const recordOptions = $derived(
    selectedTask?.recordKind
      ? assistantRecordsFromPage(data, selectedTask.recordKind, $page.url.pathname)
      : [],
  );
  function normalized(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLocaleLowerCase();
  }
  const records = $derived(
    recordOptions.filter((record) => normalized(record.label).includes(normalized(query.trim()))),
  );

  function show(): void {
    if (busy) return;
    notice = '';
    if (!open) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      query = '';
      selectedTask = undefined;
      open = true;
    }
    void tick().then(() => queryInput?.focus());
  }

  function close(): void {
    open = false;
    query = '';
    selectedTask = undefined;
  }

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      void tick().then(() => queryInput?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  });

  onMount(() => {
    const escape = (event: KeyboardEvent) => {
      if (!open || event.key !== 'Escape') return;
      // An underlying ResponsiveSheet also listens on document. Escape must only
      // dismiss the top dialog, preserving any dirty form underneath it.
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        if (event.defaultPrevented) return;
        event.preventDefault();
        show();
      }
    };
    // The native dialog supplies a focus trap and makes the underlying page inert.
    // Existing form sheets stay mounted, retaining entered values and navigation guards.
    window.addEventListener('keydown', shortcut);
    document.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('keydown', shortcut);
      document.removeEventListener('keydown', escape, true);
      dialog?.close();
    };
  });

  function resultKeyboard(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      const controls = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(
      dialog?.querySelectorAll<HTMLButtonElement>('[data-assistant-result]') ?? [],
    );
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') buttons[(index + 1) % buttons.length]?.focus();
    else if (index === 0) queryInput?.focus();
    else buttons[index < 0 ? buttons.length - 1 : index - 1]?.focus();
  }

  function queryKeyboard(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.isComposing) {
      if (!selectedTask && query.trim() && search.kind !== 'matches') return;
      const first = dialog?.querySelector<HTMLButtonElement>('[data-assistant-result]');
      if (first && !first.disabled) {
        event.preventDefault();
        first.click();
      }
    }
  }

  async function navigate(
    task: AssistantTask,
    recordId?: string,
    registerFallback = false,
  ): Promise<void> {
    if (busy) return;
    // Recheck capabilities in case loaded identity changed while the dialog was open.
    if (!tasksForContext(context).some((available) => available.id === task.id)) {
      notice = t.failed;
      return;
    }
    busy = true;
    close();
    await tick();
    try {
      const succeeded = await navigateAssistantTask(task, { base, url: $page.url, goto, recordId });
      if (succeeded) {
        notice = registerFallback ? t.selectInWorkspace : '';
      } else {
        previouslyFocused =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        open = true;
        notice = t.failed;
      }
    } catch {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      open = true;
      notice = t.failed;
    } finally {
      busy = false;
    }
  }

  function choose(task: AssistantTask): void {
    if (task.recordKind && task.recordHref) {
      const options = assistantRecordsFromPage(data, task.recordKind, $page.url.pathname);
      if (options.length) {
        selectedTask = task;
        query = '';
        void tick().then(() => queryInput?.focus());
        return;
      }
      void navigate(task, undefined, true);
      return;
    }
    void navigate(task);
  }
</script>

<div data-navigation-assistant>
  <button
    type="button"
    class="assistant-launcher"
    data-assistant-launcher
    aria-haspopup="dialog"
    aria-label={t.launcher}
    aria-keyshortcuts="Control+k Meta+k"
    aria-expanded={open}
    disabled={busy}
    onclick={show}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24"
      ><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
    >
    <span>{t.launcher}</span>
    <kbd>Ctrl / ⌘ K</kbd>
  </button>
  {#if !open && (notice || busy)}
    <div class="assistant-notice" role="status" aria-live="polite">
      <span>{busy ? t.opening : notice}</span>
      {#if !busy}<button type="button" aria-label={t.dismiss} onclick={() => (notice = '')}
          >×</button
        >{/if}
    </div>
  {/if}
  <dialog
    bind:this={dialog}
    class="assistant-dialog"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    oncancel={(event) => {
      event.preventDefault();
      close();
    }}
    onclose={() => {
      if (open && !dialog?.open) close();
    }}
    onkeydown={resultKeyboard}
  >
    <header class="assistant-header">
      <div>
        <h2 id={titleId}>{selectedTask ? t.records : t.title}</h2>
        <p id={descriptionId}>{selectedTask ? t.recordDescription : t.description}</p>
      </div>
      <button class="assistant-close" type="button" onclick={close} aria-label={t.close}>×</button>
    </header>
    <div class="assistant-body">
      {#if selectedTask}
        <button
          type="button"
          class="assistant-back"
          onclick={() => {
            selectedTask = undefined;
            query = '';
            queryInput?.focus();
          }}>← {t.back}</button
        >
        <p class="assistant-selected">{selectedTask.title[locale]}</p>
      {/if}
      <label for={queryId}>{selectedTask ? t.recordQuery : t.query}</label>
      <input
        bind:this={queryInput}
        id={queryId}
        type="search"
        data-assistant-query
        bind:value={query}
        placeholder={selectedTask ? undefined : (permittedTasks[0]?.phrases[locale][0] ?? t.query)}
        autocomplete="off"
        spellcheck="false"
        onkeydown={queryKeyboard}
      />
      <div class="assistant-status" role="status" aria-live="polite">
        {#if notice}<p>{notice}</p>{/if}
        {#if !selectedTask && query.trim() && search.kind !== 'matches'}
          <p>{search.kind === 'unsupported' ? t.unsupported : t.empty}</p>
        {:else if !selectedTask && query.trim()}
          <span class="assistant-count">{t.matches}: {tasks.length}</span>
        {:else if selectedTask && records.length === 0}
          <p>{t.recordEmpty}</p>
        {/if}
      </div>
      {#if selectedTask}
        <ul class="assistant-results">
          {#each records as record (record.id)}
            <li>
              <button
                type="button"
                data-assistant-result
                data-assistant-record-id={record.id}
                onclick={() => selectedTask && navigate(selectedTask, record.id)}
                >{record.label}</button
              >
            </li>
          {/each}
        </ul>
        <button
          type="button"
          class="assistant-register"
          onclick={() => selectedTask && navigate(selectedTask, undefined, true)}
          >{t.register}</button
        >
      {:else}
        {#if !query.trim()}
          <p class="assistant-section-label">{t.examples}</p>
          <div class="assistant-examples">
            {#each permittedTasks.slice(0, 3) as task (task.id)}
              <button
                type="button"
                onclick={() => {
                  query = task.phrases[locale][0] ?? task.title[locale];
                  queryInput?.focus();
                }}>{task.phrases[locale][0] ?? task.title[locale]}</button
              >
            {/each}
          </div>
        {/if}
        <p class="assistant-section-label">
          {query.trim() && search.kind === 'matches' ? t.matches : t.available}
        </p>
        <ul class="assistant-results">
          {#each tasks as task (task.id)}
            <li>
              <button
                type="button"
                data-assistant-result
                data-assistant-task={task.id}
                onclick={() => choose(task)}
                ><strong>{task.title[locale]}</strong><span>{task.description[locale]}</span
                ></button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </dialog>
</div>

<style>
  .assistant-launcher {
    position: fixed;
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    /* ResponsiveSheet uses 49/50; task navigation remains tappable over a draft. */
    z-index: 51;
    display: flex;
    gap: 0.55rem;
    align-items: center;
    min-height: 44px;
    padding: 0.65rem 0.9rem;
    color: #fff;
    background: #145b91;
    border: 1px solid #104c79;
    border-radius: 999px;
    box-shadow: 0 4px 16px #0f24382b;
    font-weight: 600;
  }
  .assistant-launcher svg {
    width: 19px;
    height: 19px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    flex-shrink: 0;
  }
  kbd {
    font-size: 0.7rem;
    padding-left: 0.35rem;
    opacity: 0.9;
  }
  .assistant-dialog {
    width: min(640px, calc(100vw - 2rem));
    max-height: min(780px, calc(100dvh - 2rem));
    padding: 0;
    border: 1px solid #cbd8e4;
    border-radius: 18px;
    background: #fff;
    color: #183247;
    box-shadow: 0 20px 80px #0f24384d;
    overflow: auto;
  }
  .assistant-dialog::backdrop {
    background: #0f24387a;
  }
  .assistant-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1.25rem;
    border-bottom: 1px solid #e1e8ef;
  }
  .assistant-header > div {
    min-width: 0;
    flex: 1;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 1.25rem;
  }
  .assistant-header p {
    margin: 0;
    color: #526779;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .assistant-close {
    min-width: 44px;
    min-height: 44px;
    border: 1px solid #cbd8e4;
    border-radius: 10px;
    background: #fff;
    font-size: 1.5rem;
    color: #183247;
  }
  .assistant-body {
    padding: 1.25rem;
  }
  label {
    display: block;
    font-size: 0.9rem;
    font-weight: 650;
    margin-bottom: 0.45rem;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    min-height: 48px;
    border: 1px solid #b3c5d5;
    border-radius: 10px;
    padding: 0.75rem;
    color: #183247;
    background: #fff;
    font: inherit;
  }
  .assistant-section-label {
    font-size: 0.82rem;
    font-weight: 650;
    margin: 1rem 0 0.5rem;
    color: #526779;
  }
  .assistant-results {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }
  .assistant-results button {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    text-align: left;
    min-height: 48px;
    padding: 0.8rem;
    border: 1px solid #e0e8ef;
    border-radius: 10px;
    background: #fff;
    color: #183247;
    white-space: normal;
    overflow-wrap: anywhere;
    font: inherit;
  }
  .assistant-results button:hover {
    background: #edf5fc;
    border-color: #b3c5d5;
  }
  .assistant-results span {
    color: #526779;
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .assistant-examples {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .assistant-examples button,
  .assistant-back,
  .assistant-register {
    min-height: 44px;
    border: 1px solid #cbd8e4;
    border-radius: 10px;
    padding: 0.55rem 0.7rem;
    background: #f5f9fc;
    color: #145b91;
    text-align: left;
    font: inherit;
    overflow-wrap: anywhere;
  }
  .assistant-selected {
    font-weight: 650;
  }
  .assistant-register {
    margin-top: 0.75rem;
    width: 100%;
  }
  .assistant-status p {
    font-size: 0.9rem;
    line-height: 1.5;
    padding: 0.75rem;
    border-radius: 10px;
    background: #edf5fc;
    margin: 0.75rem 0;
  }
  .assistant-count {
    display: block;
    margin-top: 0.65rem;
    font-size: 0.85rem;
    color: #526779;
  }
  .assistant-notice {
    position: fixed;
    bottom: 4.8rem;
    right: 1rem;
    max-width: min(400px, calc(100vw - 2rem));
    z-index: 52;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border: 1px solid #b3c5d5;
    border-radius: 12px;
    padding: 0.75rem;
    color: #183247;
    background: #fff;
    box-shadow: 0 4px 16px #0f24382b;
    font-size: 0.9rem;
  }
  .assistant-notice button {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    font-size: 1.5rem;
    color: #183247;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 3px solid #318bcc;
    outline-offset: 2px;
  }
  @media (max-width: 767px) {
    .assistant-launcher {
      bottom: calc(5.5rem + env(safe-area-inset-bottom));
      right: 0.75rem;
    }
    kbd {
      display: none;
    }
    .assistant-dialog {
      width: calc(100vw - 1rem);
      max-height: calc(100dvh - 1rem);
      border-radius: 14px;
    }
    .assistant-header,
    .assistant-body {
      padding: 1rem;
    }
    .assistant-notice {
      right: 0.75rem;
      bottom: calc(9.5rem + env(safe-area-inset-bottom));
    }
  }
  @media print {
    [data-navigation-assistant] {
      display: none;
    }
  }
</style>
