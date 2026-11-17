<script lang="ts">
  import {
    HOURS_INPUT_PATTERN,
    minorToProjectAmount,
    projectAmountPattern,
    minutesToProjectHours,
    projectAmountToMinor,
    projectHoursToMinutes,
  } from './project-budget-input';

  let {
    name,
    label,
    value = '',
    currency = '',
    kind = 'money',
    required = false,
  }: {
    name: string;
    label: string;
    value?: string;
    currency?: string;
    kind?: 'money' | 'hours';
    required?: boolean;
  } = $props();

  const initialDisplay = $derived(
    kind === 'money' ? minorToProjectAmount(value, currency || 'USD') : minutesToProjectHours(value),
  );
  let editedDisplay = $state<string | null>(null);
  $effect(() => {
    // A failed server action can send corrected initial values back to this form.
    initialDisplay;
    editedDisplay = null;
  });
  const display = $derived(editedDisplay ?? initialDisplay);
  const storedValue = $derived(
    kind === 'money'
      ? projectAmountToMinor(display, currency || 'USD')
      : projectHoursToMinutes(display),
  );
</script>

<label>
  {label}{currency ? ` (${currency})` : ''}
  <input
    inputmode="decimal"
    pattern={kind === 'money' ? projectAmountPattern(currency || 'USD') : HOURS_INPUT_PATTERN}
    placeholder={kind === 'money' ? minorToProjectAmount('0', currency || 'USD') : '0'}
    aria-label={label}
    {required}
    value={display}
    oninput={(event) => (editedDisplay = event.currentTarget.value)}
  />
  <input type="hidden" {name} value={storedValue} />
</label>
