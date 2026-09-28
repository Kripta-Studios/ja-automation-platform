<script lang="ts">
  let {
    items,
    resultCount,
    clearHref,
    onclear,
    translate = (key: string) => key,
  }: {
    items: readonly Readonly<{
      label: string;
      value: string;
      removeHref?: string;
      onremove?: () => void;
    }>[];
    resultCount?: number;
    clearHref?: string;
    onclear?: () => void;
    translate?: (key: string) => string;
  } = $props();
</script>

<div class="filter-summary" data-filter-summary>
  <div class="filter-summary__heading">
    <p role="status">
      {#if items.length}<strong>{translate('Active filters')}: {items.length}</strong>{/if}
      {#if resultCount !== undefined}<span
          >{resultCount} {translate(items.length ? 'matching records' : 'Records')}</span
        >{/if}
    </p>
    {#if items.length && (clearHref || onclear)}
      {#if clearHref}<a href={clearHref} onclick={onclear}>{translate('Clear filters')}</a>
      {:else}<button type="button" onclick={onclear}>{translate('Clear filters')}</button>{/if}
    {/if}
  </div>
  {#if items.length}
    <ul aria-label={translate('Active filters')}>
      {#each items as item}
        <li>
          {#if item.removeHref || item.onremove}
            {#if item.removeHref}
              <a
                class="filter-chip"
                href={item.removeHref}
                onclick={item.onremove}
                aria-label={`${translate('Remove filter')}: ${item.label}: ${item.value}`}
              >
                <span>{item.label}:</span>
                {item.value}<b aria-hidden="true">×</b>
              </a>
            {:else}
              <button
                class="filter-chip"
                type="button"
                onclick={item.onremove}
                aria-label={`${translate('Remove filter')}: ${item.label}: ${item.value}`}
              >
                <span>{item.label}:</span>
                {item.value}<b aria-hidden="true">×</b>
              </button>
            {/if}
          {:else}<span>{item.label}:</span> {item.value}{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .filter-summary {
    grid-column: 1 / -1;
    min-width: 0;
    display: grid;
    gap: 0.625rem;
    color: var(--ja-ink, #24251f);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .filter-summary__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .filter-summary p {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0;
  }
  .filter-summary :is(a, button) {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ja-control-border, #86877b);
    border-radius: 0.5rem;
    background: white;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
  .filter-summary :is(a, button):focus-visible {
    outline: 2px solid var(--ja-accent, #2349b5);
    outline-offset: 3px;
  }
  .filter-summary ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .filter-summary li {
    max-width: 100%;
    min-width: 0;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--ja-line, #d6d5d2);
    border-radius: 0.5rem;
    background: var(--ja-canvas, #f6f6f1);
    overflow-wrap: anywhere;
  }
  .filter-summary li:has(.filter-chip) {
    padding: 0;
    border: 0;
  }
  .filter-summary .filter-chip {
    gap: 0.375rem;
    height: 100%;
    background: var(--ja-canvas, #f6f6f1);
    text-decoration: none;
    text-align: start;
    overflow-wrap: anywhere;
  }
  .filter-chip b {
    font-size: 1.25rem;
    margin-inline-start: 0.25rem;
  }
  .filter-summary li span {
    font-weight: 600;
  }
</style>
