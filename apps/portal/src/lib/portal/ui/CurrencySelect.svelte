<script lang="ts">
  /**
   * Curated currency picker (USD, EUR, MXN, BRL, CAD, GBP, CHF, ARS, CNY, JPY).
   * Native <select> so it works without JavaScript and on phones; labels carry
   * the localized currency name. A saved value outside the list stays selectable.
   */
  import { currencyChoices, currencyOptionLabel } from '$lib/portal/currencies';

  const generatedId = $props.id();
  let {
    name = 'currency',
    value = $bindable('USD'),
    locale = 'en',
    id = `currency-${generatedId}`,
    required = true,
    disabled = false,
    compact = false,
    ariaLabel,
    onchange,
    testId,
  }: {
    name?: string;
    value?: string;
    locale?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    /** Show only the ISO code in options (narrow filters). */
    compact?: boolean;
    ariaLabel?: string;
    onchange?: (code: string) => void;
    testId?: string;
  } = $props();

  const choices = $derived(currencyChoices(value));
</script>

<select
  {name}
  {id}
  {required}
  {disabled}
  aria-label={ariaLabel}
  data-testid={testId}
  data-currency-select
  bind:value
  onchange={(event) => onchange?.(event.currentTarget.value)}
>
  {#each choices as code (code)}
    <option value={code}>{compact ? code : currencyOptionLabel(code, locale)}</option>
  {/each}
</select>
