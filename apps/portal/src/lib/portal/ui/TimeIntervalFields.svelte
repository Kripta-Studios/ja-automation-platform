<script lang="ts">
  import { untrack } from 'svelte';
  import { durationMinutes, intervalMinutes } from './time-entry-clock';

  let {
    translate,
    initialStart = '',
    initialEnd = '',
    initialBreak = 0,
    legacyMinutes,
  }: {
    translate: (value: string) => string;
    initialStart?: string;
    initialEnd?: string;
    initialBreak?: number;
    legacyMinutes?: number;
  } = $props();
  const isLegacy = $derived(legacyMinutes !== undefined && !initialStart && !initialEnd);
  let useInterval = $state(untrack(() => !!initialStart || !!initialEnd));
  let hours = $state(
    untrack(() => (legacyMinutes === undefined ? '' : String(legacyMinutes / 60))),
  );
  let start = $state(untrack(() => initialStart));
  let end = $state(untrack(() => initialEnd));
  let pause = $state<number | undefined>(untrack(() => initialBreak));
  let endInput = $state<HTMLInputElement>();
  let hoursInput = $state<HTMLInputElement>();
  const minutes = $derived(intervalMinutes(start, end, pause ?? 0));
  const enteredMinutes = $derived(durationMinutes(hours));
  $effect(() => {
    endInput?.setCustomValidity(
      useInterval && start && end && minutes === null
        ? translate(
            'End time must be later on the same day, with a break shorter than the interval.',
          )
        : '',
    );
  });
  $effect(() => {
    hoursInput?.setCustomValidity(
      !useInterval && hours && enteredMinutes === null
        ? translate('Enter a valid number of hours from 0 to 24.')
        : '',
    );
  });
</script>

{#if isLegacy}
  <p class="time-range-help">
    {translate('This record has a duration but no recorded start and end times.')}
  </p>
{/if}
<label class="time-range-choice">
  <input type="checkbox" bind:checked={useInterval} />
  <span>{translate('Add start and end times')}</span>
</label>
{#if useInterval}
  <fieldset class="time-range-fields">
    <legend>{translate('Time range')}</legend>
    <label
      ><span>{translate('Start time')}</span><input
        name="startTime"
        type="time"
        step="60"
        required
        bind:value={start}
      /></label
    >
    <label
      ><span>{translate('End time')}</span><input
        name="endTime"
        type="time"
        step="60"
        required
        bind:value={end}
        bind:this={endInput}
      /></label
    >
    <label
      ><span>{translate('Break (minutes)')}</span><input
        name="breakMinutes"
        type="number"
        min="0"
        max="1439"
        step="1"
        inputmode="numeric"
        bind:value={pause}
      /></label
    >
    <div class="time-range-total">
      <span>{translate('Calculated duration')}</span><output aria-live="polite"
        >{minutes === null ? '—' : `${Math.floor(minutes / 60)} h ${minutes % 60} min`}</output
      >
    </div>
    <input name="minutes" type="hidden" value={minutes ?? ''} />
    <p class="time-range-help">
      {translate('The duration is calculated from the start and end times, less any break.')}
      {translate("Use the project's local time. Start and end must be on the selected date.")}
    </p>
  </fieldset>
{:else}
  <label
    ><span>{translate('Actual hours')}</span><input
      type="text"
      inputmode="decimal"
      required
      bind:value={hours}
      bind:this={hoursInput}
    /></label
  >
  <input name="minutes" type="hidden" value={enteredMinutes ?? ''} />
  <p class="time-range-help">
    {translate('Actual duration')}: {enteredMinutes === null
      ? '—'
      : `${Math.floor(enteredMinutes / 60)} h ${enteredMinutes % 60} min`}
  </p>
  <p class="time-range-help">
    {translate(
      'Enter decimal hours, for example 7.5 for 7 h 30 min. The amount is rounded to the nearest minute.',
    )}
  </p>
{/if}

<style>
  .time-range-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--ja-border, #d8d4cc);
    border-radius: 0.75rem;
  }
  .time-range-fields legend {
    padding: 0 0.35rem;
    font-weight: 600;
  }
  .time-range-fields label,
  .time-range-total {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }
  .time-range-fields input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .time-range-total output {
    padding: 0.7rem 0;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .time-range-help {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--ja-steel, #77756d);
  }
  .time-range-choice {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .time-range-choice input {
    width: auto;
  }
  @media (max-width: 420px) {
    .time-range-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
