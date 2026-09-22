<script lang="ts">
  import { onMount } from 'svelte';
  import { datePresetRange, type DatePreset } from './date-presets';
  let {
    from = '',
    to = '',
    href,
    translate,
  }: {
    from?: string;
    to?: string;
    href: (range: { from: string; to: string }) => string;
    translate: (key: string) => string;
  } = $props();
  let today = $state<Date | null>(null);
  const presets: readonly [DatePreset, string][] = [
    ['today', 'Today'],
    ['week', 'This week'],
    ['month', 'This month'],
    ['last-month', 'Last month'],
  ];
  onMount(() => {
    today = new Date();
  });
</script>

{#if today}
  <nav class="date-presets" aria-label={translate('Quick date filters')}>
    <span>{translate('Period')}</span>
    {#each presets as [key, label]}
      {@const range = datePresetRange(key, today)}
      <a
        href={href(range)}
        aria-current={from === range.from && to === range.to ? 'true' : undefined}
      >
        {translate(label)}
      </a>
    {/each}
  </nav>
{/if}

<style>
  .date-presets {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  span {
    font-size: 0.875rem;
    font-weight: 600;
    margin-inline-end: 0.25rem;
  }
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ja-control-border, #86877b);
    border-radius: 0.5rem;
    background: white;
    color: var(--ja-ink, #24251f);
    text-decoration: none;
    font-size: 0.875rem;
  }
  a[aria-current] {
    background: var(--ja-ink, #24251f);
    color: white;
  }
  a:focus-visible {
    outline: 2px solid var(--ja-accent, #2349b5);
    outline-offset: 3px;
  }
  @media print {
    .date-presets {
      display: none;
    }
  }
</style>
