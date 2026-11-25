<script lang="ts">
  /**
   * Change the first and last day of any assignment, also an ended one (which
   * re-opens it when the last day is today or later, or empty). Before saving
   * it shows what the change does: unapproved hours left outside are resolved
   * in the same step; approved/invoiced records are never changed, so dates
   * that would leave them outside are refused; an overlap with the person's
   * other assignment on the project can be fixed in the same step.
   */
  import { assignmentText, type AssignmentEditCopyKey } from '$lib/portal/assignment-edit-copy';
  import {
    assignmentAction,
    previewDates,
    shiftDay,
    type DatesPreview,
  } from '$lib/portal/assignment-requests';

  let {
    assignment,
    name,
    locale,
    formatDate = (value: string) => value,
    describe,
    onDone,
    onCancel,
  }: {
    assignment: { id: string; version: number; startsOn: string; endsOn: string | null };
    name: string;
    locale: string;
    formatDate?: (value: string) => string;
    describe: (failure: unknown) => string;
    onDone: (message: string, variant: 'success' | 'danger') => void | Promise<void>;
    onCancel: () => void;
  } = $props();

  const a = (key: AssignmentEditCopyKey, params: Record<string, string | number> = {}) =>
    assignmentText(locale, key, params);

  // svelte-ignore state_referenced_locally
  let startsOn = $state(assignment.startsOn);
  // svelte-ignore state_referenced_locally
  let endsOn = $state(assignment.endsOn ?? '');
  let preview = $state<DatesPreview | null>(null);
  let previewError = $state('');
  let checking = $state(false);
  let busy = $state(false);
  let error = $state('');
  let fixOverlap = $state(true);
  const invalid = $derived(!startsOn || (Boolean(endsOn) && endsOn < startsOn));

  let sequence = 0;
  $effect(() => {
    const start = startsOn;
    const end = endsOn;
    const id = assignment.id;
    const mine = ++sequence;
    if (!start || (end && end < start)) {
      preview = null;
      checking = false;
      return;
    }
    checking = true;
    previewError = '';
    void previewDates(id, start, end).then((result) => {
      if (mine !== sequence) return;
      checking = false;
      preview = result.preview ?? null;
      previewError = result.preview ? '' : describe(result.failure);
    });
  });

  /** The other assignment moved just outside the new dates, or null if it cannot be. */
  const overlapFix = $derived.by(() => {
    const other = preview?.overlap;
    if (!other) return null;
    if (other.startsOn < startsOn) {
      const end = shiftDay(startsOn, -1);
      return end >= other.startsOn ? { startsOn: other.startsOn, endsOn: end } : null;
    }
    if (!endsOn) return null;
    const start = shiftDay(endsOn, 1);
    return !other.endsOn || other.endsOn >= start ? { startsOn: start, endsOn: other.endsOn ?? '' } : null;
  });

  async function save() {
    if (busy || invalid) return;
    busy = true;
    error = '';
    const other = preview?.overlap;
    if (other && overlapFix && fixOverlap) {
      const moved = await assignmentAction('updateAssignment', {
        assignmentId: other.assignmentId,
        version: String(other.version),
        startsOn: overlapFix.startsOn,
        endsOn: overlapFix.endsOn,
        resolveOutsideTime: 'yes',
      });
      if (!moved.ok) {
        busy = false;
        error = describe(moved.data);
        return;
      }
    }
    const result = await assignmentAction('updateAssignment', {
      assignmentId: assignment.id,
      version: String(assignment.version),
      startsOn,
      endsOn,
      ...(preview && preview.resolvableTime > 0 ? { resolveOutsideTime: 'yes' } : {}),
    });
    busy = false;
    if (result.ok) await onDone(a('datesSaved', { name }), 'success');
    else error = describe(result.data);
  }
</script>

<div class="dates-panel" role="group" aria-label={a('changeDatesTitle', { name })} data-dates-panel={assignment.id}>
  <strong>{a('changeDatesTitle', { name })}</strong>
  <div class="dates-fields">
    <label>{a('firstDay')}<input type="date" bind:value={startsOn} required data-dates-start /></label>
    <label
      >{a('lastDayOptional')}<input
        type="date"
        bind:value={endsOn}
        min={startsOn || undefined}
        data-dates-end
      /></label
    >
  </div>
  <div class="dates-status" role="status" data-dates-preview>
    {#if checking}
      <p>{a('checking')}</p>
    {:else if previewError}
      <p class="dates-warn">{previewError}</p>
    {:else if preview}
      {#if preview.reopens}<p data-dates-reopens>{a('reopens')}</p>{/if}
      {#if preview.blockedByRecords}
        <p class="dates-warn" data-dates-blocked>{a('outsideBlocked')}</p>
      {:else if preview.resolvableTime > 0}
        <p data-dates-outside={preview.resolvableTime}>
          {preview.resolvableTime === 1
            ? a('outsideOne')
            : a('outsideMany', { count: preview.resolvableTime })}
        </p>
      {/if}
      {#if preview.overlap}
        <p class="dates-warn" data-dates-overlap>
          {a('overlap', {
            starts: formatDate(preview.overlap.startsOn),
            ends: preview.overlap.endsOn ? formatDate(preview.overlap.endsOn) : a('open'),
          })}
        </p>
        {#if overlapFix}
          <label class="dates-check"
            ><input type="checkbox" bind:checked={fixOverlap} data-dates-fix-overlap />
            {a('overlapFix', {
              starts: formatDate(overlapFix.startsOn),
              ends: overlapFix.endsOn ? formatDate(overlapFix.endsOn) : a('open'),
            })}</label
          >
        {/if}
      {/if}
    {/if}
  </div>
  {#if error}<p class="dates-warn" role="alert">{error}</p>{/if}
  <div class="dates-actions">
    <button type="button" class="secondary-button" onclick={onCancel}>{a('cancel')}</button>
    <button
      type="button"
      class="primary-button"
      disabled={busy ||
        checking ||
        invalid ||
        Boolean(previewError) ||
        Boolean(preview?.blockedByRecords) ||
        Boolean(preview?.overlap && !(overlapFix && fixOverlap))}
      onclick={save}
      data-dates-save>{busy ? a('working') : a('saveDates')}</button
    >
  </div>
</div>

<style>
  .dates-panel {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.6rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--project-soft, #f8f8f7);
  }
  .dates-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .dates-fields label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
  }
  .dates-status p {
    margin: 0 0 0.25rem;
  }
  .dates-warn {
    margin: 0;
    color: #b42318;
    font-weight: 600;
  }
  .dates-check {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    min-height: var(--ja-target-min, 2.75rem);
  }
  .dates-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
