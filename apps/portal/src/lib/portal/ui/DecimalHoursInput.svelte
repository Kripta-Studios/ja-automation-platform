<script lang="ts">
  import { decimalHoursFromMinutes } from '../minute-hours';
  import { projectHoursToMinutes } from '../sections/project-budget-input';

  let {
    name,
    value = $bindable(''),
    id,
    label,
    required = false,
    disabled = false,
    minMinutes = 0,
    maxMinutes,
    invalidMessage = 'Enter valid decimal hours within the allowed range.',
    'data-field': dataField,
  }: {
    name: string;
    value?: string | number | null;
    id?: string;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    minMinutes?: number;
    maxMinutes?: number;
    invalidMessage?: string;
    'data-field'?: string;
  } = $props();

  let edited = $state<string | null>(null);
  let lastEmitted: string | undefined;
  let input = $state<HTMLInputElement>();
  let hidden = $state<HTMLInputElement>();
  const initialDisplay = $derived(decimalHoursFromMinutes(value));
  const display = $derived(edited ?? (initialDisplay === '—' ? '' : initialDisplay));
  const parsed = $derived(projectHoursToMinutes(display));
  const valid = $derived(
    parsed !== '' &&
      Number(parsed) >= minMinutes &&
      (maxMinutes === undefined || Number(parsed) <= maxMinutes),
  );
  const canonical = $derived(valid ? parsed : '');

  $effect(() => {
    // External restoration uses canonical minutes. Do not rewrite a user's decimal
    // text (including comma or a trailing separator) after our own bound update.
    const incoming = String(value ?? '');
    if (incoming !== lastEmitted) edited = null;
  });
  $effect(() => {
    input?.setCustomValidity(display.trim() !== '' && !valid ? invalidMessage : '');
  });

  function changed(event: Event): void {
    const text = (event.currentTarget as HTMLInputElement).value;
    edited = text;
    const minutes = projectHoursToMinutes(text);
    const withinRange =
      minutes !== '' &&
      Number(minutes) >= minMinutes &&
      (maxMinutes === undefined || Number(minutes) <= maxMinutes);
    const next = withinRange ? minutes : '';
    lastEmitted = next;
    value = next;
    // Form-level autosave handlers may read FormData during this same input event.
    if (hidden) hidden.value = next;
  }
</script>

<input
  bind:this={input}
  {id}
  name={`${name}Hours`}
  type="text"
  inputmode="decimal"
  pattern={'[0-9]+([.,][0-9]{1,4})?'}
  aria-label={label}
  data-field={dataField}
  {required}
  {disabled}
  value={display}
  oninput={changed}
/>
<input bind:this={hidden} type="hidden" {name} value={canonical} {disabled} />

<style>
  input[type='text'] {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid var(--ja-border, #c9c6bf);
    border-radius: 0.45rem;
    padding: 0.65rem 0.75rem;
    color: inherit;
    background: var(--ja-input-bg, #fff);
    font: inherit;
  }
  input:focus-visible {
    outline: 3px solid #f59e0b;
    outline-offset: 2px;
  }
</style>
