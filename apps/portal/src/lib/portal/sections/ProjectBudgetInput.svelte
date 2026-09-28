<script lang="ts">
  import {
    minorToProjectAmount,
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
    kind === 'money' ? minorToProjectAmount(value) : minutesToProjectHours(value),
  );
  let editedDisplay = $state<string | null>(null);
  $effect(() => {
    // A failed server action can send corrected initial values back to this form.
    initialDisplay;
    editedDisplay = null;
  });
  const display = $derived(editedDisplay ?? initialDisplay);
  const storedValue = $derived(
    kind === 'money' ? projectAmountToMinor(display) : projectHoursToMinutes(display),
  );
</script>

<label>
  {label}{currency ? ` (${currency})` : ''}
  <input
    inputmode="decimal"
    pattern={kind === 'money' ? '[0-9]+([.,][0-9]{1,2})?' : '[0-9]+([.,][0-9]{1,4})?'}
    placeholder={kind === 'money' ? '0.00' : '0'}
    aria-label={label}
    {required}
    value={display}
    oninput={(event) => (editedDisplay = event.currentTarget.value)}
  />
  <input type="hidden" {name} value={storedValue} />
</label>
