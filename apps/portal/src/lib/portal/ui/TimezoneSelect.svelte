<script lang="ts">
  /**
   * Valid IANA time zones only (Intl.supportedValuesOf), common business zones
   * first. The portal-wide searchable-select enhancer adds type-to-search
   * inside the dropdown because the list is long.
   */
  import { onMount } from 'svelte';
  import {
    allTimeZones,
    commonProjectTimeZones,
    timeZoneLabel,
  } from '$lib/portal/project-timezones';
  import { projectCopy } from '$lib/portal/project-ux-round3-copy';

  const generatedId = $props.id();
  let {
    name = 'timezone',
    value = '',
    label,
    locale = 'en',
    hint = '',
    required = true,
    id = `timezone-${generatedId}`,
    onchange,
  }: {
    name?: string;
    value?: string;
    label: string;
    locale?: string;
    hint?: string;
    required?: boolean;
    id?: string;
    onchange?: (zone: string) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let selected = $state(value);
  // svelte-ignore state_referenced_locally
  let lastValue = value;
  $effect(() => {
    if (value !== lastValue) {
      lastValue = value;
      selected = value;
    }
  });

  // Server and browser ICU data can differ, so the first render (SSR and
  // hydration) lists only the common zones; the full list loads on mount.
  const common: readonly string[] = commonProjectTimeZones;
  let zones = $state<readonly string[]>(commonProjectTimeZones);
  onMount(() => {
    zones = allTimeZones();
  });
  const others = $derived(zones.filter((zone) => !common.includes(zone)));
  const selectedIsListed = $derived(!selected || zones.includes(selected));
</script>

<div class="timezone-select">
  <label for={id}>{label}</label>
  <select
    {id}
    {name}
    {required}
    bind:value={selected}
    onchange={() => onchange?.(selected)}
    aria-describedby={hint ? `${id}-hint` : undefined}
    data-timezone-select
  >
    {#if !selected}<option value="" disabled>{projectCopy(locale, 'timezoneChoose')}</option>{/if}
    {#if selected && !selectedIsListed}<option value={selected}>{selected}</option>{/if}
    <optgroup label={projectCopy(locale, 'timezoneCommon')}>
      {#each common as zone (zone)}<option value={zone}>{timeZoneLabel(zone)}</option>{/each}
    </optgroup>
    {#if others.length > 0}
      <optgroup label={projectCopy(locale, 'timezoneAll')}>
        {#each others as zone (zone)}<option value={zone}>{timeZoneLabel(zone)}</option>{/each}
      </optgroup>
    {/if}
  </select>
  {#if hint}<small id={`${id}-hint`}>{hint}</small>{/if}
</div>

<style>
  .timezone-select {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .timezone-select > label {
    font-weight: 600;
  }
  .timezone-select select {
    width: 100%;
    min-width: 0;
  }
  .timezone-select small {
    font-weight: 400;
    color: var(--ja-text-muted, #5f5b55);
  }
</style>
