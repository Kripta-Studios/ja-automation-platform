<script lang="ts">
  /**
   * End one assignment in a single click (owner request 2026-11-25): last day
   * defaults to today, the reason is prefilled, and the unapproved later hours
   * that the end would resolve are counted before the confirm. An assignment
   * with no recorded work can be deleted ("added by mistake"); the server
   * refuses that while any hours, expenses or reports exist.
   */
  import { assignmentText, type AssignmentEditCopyKey } from '$lib/portal/assignment-edit-copy';
  import {
    assignmentAction,
    previewRemoval,
    type RemovalPreview,
  } from '$lib/portal/assignment-requests';

  let {
    assignment,
    name,
    title,
    locale,
    today,
    defaultReason,
    allowDelete = false,
    describe,
    onDone,
    onCancel,
  }: {
    assignment: { id: string; version: number; startsOn: string };
    name: string;
    title: string;
    locale: string;
    today: string;
    defaultReason: string;
    allowDelete?: boolean;
    describe: (failure: unknown) => string;
    onDone: (message: string, variant: 'success' | 'danger') => void | Promise<void>;
    onCancel: () => void;
  } = $props();

  const a = (key: AssignmentEditCopyKey, params: Record<string, string | number> = {}) =>
    assignmentText(locale, key, params);

  // svelte-ignore state_referenced_locally
  let endsOn = $state(today);
  // svelte-ignore state_referenced_locally
  let reason = $state(defaultReason);
  let preview = $state<RemovalPreview | null>(null);
  let previewError = $state('');
  let checking = $state(false);
  let busy = $state(false);
  let error = $state('');
  const started = $derived(assignment.startsOn <= today);

  let sequence = 0;
  $effect(() => {
    const day = started ? endsOn : '';
    const id = assignment.id;
    const mine = ++sequence;
    checking = true;
    previewError = '';
    void previewRemoval(id, day).then((result) => {
      if (mine !== sequence) return;
      checking = false;
      preview = result.preview ?? null;
      previewError = result.preview ? '' : describe(result.failure);
    });
  });

  async function confirmEnd() {
    if (busy) return;
    busy = true;
    error = '';
    const count = preview?.resolvableLaterTime ?? 0;
    const result = await assignmentAction('removeAssignment', {
      assignmentId: assignment.id,
      version: String(assignment.version),
      reason: reason.trim() || defaultReason,
      ...(started && endsOn ? { endsOn } : {}),
      ...(count > 0 ? { resolveLaterTime: 'yes' } : {}),
    });
    busy = false;
    if (result.ok) {
      const discarded = Number(result.data.discardedLaterTime ?? 0);
      const rejected = Number(result.data.rejectedLaterTime ?? 0);
      await onDone(
        discarded || rejected
          ? a('endedResolved', { name, discarded, rejected })
          : a('ended', { name }),
        'success',
      );
      return;
    }
    // New hours arrived after the preview: show the new count; the next click resolves them.
    const resolvable = Number(
      (result.data as { resolvableLaterTime?: unknown } | null)?.resolvableLaterTime ?? 0,
    );
    if (resolvable > 0 && preview && preview.resolvableLaterTime === 0) {
      preview = { ...preview, resolvableLaterTime: resolvable };
      return;
    }
    error = describe(result.data);
  }

  async function confirmDelete() {
    if (busy) return;
    busy = true;
    error = '';
    const result = await assignmentAction('deleteAssignment', {
      assignmentId: assignment.id,
      version: String(assignment.version),
      reason: a('mistakeReason'),
      requireNoRecords: 'yes',
    });
    busy = false;
    if (result.ok) await onDone(a('deleted', { name }), 'success');
    else error = describe(result.data);
  }
</script>

<div class="end-panel" role="group" aria-label={title} data-end-panel={assignment.id}>
  <strong>{title}</strong>
  <div class="end-fields">
    {#if started}
      <label
        >{a('lastDay')}<input
          type="date"
          bind:value={endsOn}
          min={assignment.startsOn}
          max={today}
          required
          data-end-date
        /><small>{a('lastDayHelp')}</small></label
      >
    {:else}
      <p class="end-note">{a('notStarted')}</p>
    {/if}
    <label
      >{a('reasonOptional')}<input
        bind:value={reason}
        maxlength="2000"
        placeholder={defaultReason}
        data-end-reason
      /></label
    >
  </div>
  <p class="end-status" role="status" data-end-preview>
    {#if checking}
      {a('checking')}
    {:else if previewError}
      <span class="end-warn">{previewError}</span>
    {:else if preview?.blockedByRecords}
      <span class="end-warn" data-end-blocked>{a('blocked')}</span>
    {:else if preview && preview.resolvableLaterTime > 0}
      <span data-end-later={preview.resolvableLaterTime}
        >{preview.resolvableLaterTime === 1
          ? a('laterOne')
          : a('laterMany', { count: preview.resolvableLaterTime })}</span
      >
    {:else if preview && !preview.cancelBeforeStart}
      {a('nothingLater')}
    {/if}
  </p>
  {#if allowDelete && preview && !preview.hasRecords}
    <p class="end-note" data-end-delete-help>{a('deleteMistakeHelp')}</p>
  {/if}
  {#if error}<p class="end-warn" role="alert">{error}</p>{/if}
  <div class="end-actions">
    <button type="button" class="secondary-button" onclick={onCancel}>{a('cancel')}</button>
    {#if allowDelete && preview && !preview.hasRecords}
      <button
        type="button"
        class="secondary-button end-delete"
        disabled={busy || checking}
        onclick={confirmDelete}
        data-end-delete>{a('deleteMistake')}</button
      >
    {/if}
    <button
      type="button"
      class="danger-button"
      disabled={busy || checking || Boolean(previewError) || Boolean(preview?.blockedByRecords) || (started && !endsOn)}
      onclick={confirmEnd}
      data-hub-end-confirm
      data-end-confirm>{busy ? a('working') : a('confirmEnd')}</button
    >
  </div>
</div>

<style>
  .end-panel {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.6rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--project-soft, #f8f8f7);
  }
  .end-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .end-fields label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
  }
  .end-fields small {
    font-weight: 400;
    color: var(--project-muted, #5f6368);
  }
  .end-status,
  .end-note {
    margin: 0;
  }
  .end-warn {
    color: #b42318;
    font-weight: 600;
  }
  .end-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .end-delete {
    border-color: #b42318;
    color: #b42318;
  }
  .danger-button {
    min-height: var(--ja-target-min, 2.75rem);
    border: 1px solid #b42318;
    background: #b42318;
    color: #fff;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .danger-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
