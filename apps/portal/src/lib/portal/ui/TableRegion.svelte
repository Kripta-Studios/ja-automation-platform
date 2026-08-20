<script lang="ts">
  import type { Snippet } from 'svelte';

  export type TableMobileMode = 'cards' | 'scroll';
  export type TableCardCell = { label: string; value: string };
  export type TableCardRow = { id?: string; cells: TableCardCell[] };

  type RegionNameProps =
    | { label: string; ariaLabel?: never }
    | { label?: never; ariaLabel: string };

  type SharedProps = {
    id?: string;
    headingId?: string;
    scrollInstructionId?: string;
    class?: string;
    children?: Snippet;
  } & Record<string, unknown>;

  type ScrollProps = {
    mobileMode: 'scroll';
    cardRows?: never;
  };

  type CardsProps = {
    mobileMode: 'cards';
    cardRows: TableCardRow[];
  };

  type PrimitiveProps = RegionNameProps & SharedProps & (ScrollProps | CardsProps);

  let {
    label,
    ariaLabel,
    id: regionId,
    headingId: _headingId,
    scrollInstructionId,
    mobileMode,
    cardRows,
    class: className = '',
    children,
    ...rest
  }: PrimitiveProps = $props();

  // Svelte's component id is stable across SSR and hydration, unlike a module
  // counter. A caller-provided id remains authoritative when supplied.
  const componentId = $props.id();

  const accessibleName = $derived.by(() => {
    const normalizedLabel = label?.trim() ?? '';
    const normalizedAriaLabel = ariaLabel?.trim() ?? '';
    if (!normalizedLabel && !normalizedAriaLabel) {
      throw new Error('TableRegion requires a non-empty label or ariaLabel.');
    }
    return normalizedLabel || normalizedAriaLabel;
  });

  const stableRegionId = $derived.by(() => {
    const suppliedId = regionId?.trim() ?? '';
    return suppliedId || `table-region-${slug(accessibleName)}-${componentId}`;
  });

  const instructionId = $derived.by(() => {
    const suppliedId = scrollInstructionId?.trim() ?? '';
    const heading = _headingId?.trim() ?? '';
    if (suppliedId && suppliedId !== heading && suppliedId !== stableRegionId) return suppliedId;
    return `${stableRegionId}-scroll-instruction`;
  });

  const normalizedCardRows = $derived.by(() => {
    if (mobileMode !== 'cards') return [] as TableCardRow[];
    if (!Array.isArray(cardRows)) {
      throw new Error(
        'TableRegion cards mode requires structured cardRows with visible label and value text.',
      );
    }

    return cardRows.map((row, rowIndex) => {
      if (!row || !Array.isArray(row.cells)) {
        throw new Error(`TableRegion card row ${rowIndex + 1} must provide a cells array.`);
      }

      return {
        id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `${rowIndex + 1}`,
        cells: row.cells.map((cell, cellIndex) => {
          if (!cell || typeof cell !== 'object') {
            throw new Error(
              `TableRegion card row ${rowIndex + 1}, cell ${cellIndex + 1} must provide label and value text.`,
            );
          }
          const normalizedLabel = typeof cell?.label === 'string' ? cell.label.trim() : '';
          if (!normalizedLabel) {
            throw new Error(
              `TableRegion card row ${rowIndex + 1}, cell ${cellIndex + 1} requires a non-empty label.`,
            );
          }
          return {
            label: normalizedLabel,
            value: typeof cell.value === 'string' ? cell.value : String(cell.value ?? ''),
          };
        }),
      };
    });
  });

  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          ![
            'data-ui',
            'data-table-region',
            'data-mobile-representation',
            'data-card-label-contract',
            'aria-label',
            'aria-labelledby',
            'aria-describedby',
            'role',
            'tabindex',
            'id',
          ].includes(name) &&
          (name.startsWith('data-') || name.startsWith('aria-') || name === 'hidden'),
      ),
    ),
  );

  function slug(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'data'
    );
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (mobileMode !== 'scroll') return;
    const region = event.currentTarget as HTMLElement;
    const distance = Math.max(region.clientWidth * 0.8, 160);
    if (event.key === 'ArrowRight') {
      region.scrollBy({ left: distance, behavior: 'auto' });
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      region.scrollBy({ left: -distance, behavior: 'auto' });
      event.preventDefault();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  {...forwarded}
  id={stableRegionId}
  data-ui="table-region"
  data-table-region
  data-mobile-representation={mobileMode}
  data-card-label-contract={mobileMode === 'cards' ? 'cardRows' : undefined}
  class={`ui-table-region ${className}`.trim()}
  role="region"
  aria-label={accessibleName}
  aria-describedby={mobileMode === 'scroll' ? instructionId : undefined}
  tabindex={mobileMode === 'scroll' ? '0' : undefined}
  onkeydown={handleKeydown}
>
  {#if mobileMode === 'scroll'}
    <p class="ui-table-region-instruction" id={instructionId}>
      Scroll horizontally to review all columns.
    </p>
    {@render children?.()}
  {:else}
    {#if children}
      <div class="ui-table-region-desktop" data-table-region-desktop>
        {@render children()}
      </div>
    {/if}
    <div class="ui-table-region-cards" data-table-region-cards>
      {#each normalizedCardRows as row, rowIndex}
        <article data-row={row.id ?? `${rowIndex + 1}`}>
          {#each row.cells as cell, cellIndex}
            {@const labelId = `${stableRegionId}-row-${rowIndex + 1}-cell-${cellIndex + 1}-label`}
            <div data-label={cell.label} aria-labelledby={labelId}>
              <span id={labelId} class="ui-table-region-card-label" data-card-semantic-label>
                {cell.label}
              </span>
              <span class="ui-table-region-card-value">{cell.value}</span>
            </div>
          {/each}
        </article>
      {/each}
    </div>
  {/if}
</div>
