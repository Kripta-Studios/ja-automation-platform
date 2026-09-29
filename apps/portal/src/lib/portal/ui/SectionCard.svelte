<script lang="ts">
  import type { Snippet } from 'svelte';
  import DirectionIcon from './DirectionIcon.svelte';
  import { disclosure } from './disclosure.js';

  type SurfaceProps = { title: string; ariaLabel?: never } | { title?: never; ariaLabel: string };

  type PrimitiveProps = SurfaceProps & {
    headingId?: string;
    collapsible?: boolean;
    expanded?: boolean;
    description?: string;
    class?: string;
    children?: Snippet;
  } & Record<string, unknown>;

  let {
    title,
    ariaLabel,
    headingId,
    collapsible = false,
    expanded = false,
    description,
    class: className = '',
    children,
    ...rest
  }: PrimitiveProps = $props();

  const normalizedTitle = $derived(title?.trim() ?? '');
  const normalizedAriaLabel = $derived(ariaLabel?.trim() ?? '');
  const heading = $derived(
    normalizedTitle ? (headingId ?? `section-card-${slug(normalizedTitle)}-title`) : undefined,
  );
  const accessibleName = $derived.by(() => {
    if (normalizedTitle) return normalizedTitle;
    if (normalizedAriaLabel) return normalizedAriaLabel;
    throw new Error('SectionCard requires a non-empty title or ariaLabel.');
  });
  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          !['data-ui', 'aria-label', 'aria-labelledby'].includes(name) &&
          (name.startsWith('data-') ||
            name.startsWith('aria-') ||
            name === 'id' ||
            name === 'role' ||
            name === 'tabindex' ||
            name === 'hidden'),
      ),
    ),
  );

  function slug(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'surface'
    );
  }
</script>

<section
  {...forwarded}
  data-ui="section-card"
  class={`ui-card-surface ${className}`.trim()}
  aria-labelledby={heading}
  aria-label={heading ? undefined : accessibleName}
>
  {#if collapsible}
    <details class="ui-disclosure" open={expanded} use:disclosure>
      <summary class="ui-disclosure-summary">
        <span class="ui-disclosure-label">
          <h2 class="ui-card-heading" id={heading}>{accessibleName}</h2>
          {#if description}<span class="ui-disclosure-description">{description}</span>{/if}
        </span>
        <DirectionIcon class="ui-disclosure-chevron" direction="down" kind="chevron" size={20} />
      </summary>
      <div class="ui-disclosure-body">{@render children?.()}</div>
    </details>
  {:else}
    {#if normalizedTitle}
      <h2 class="ui-card-heading" id={heading}>{normalizedTitle}</h2>
    {/if}
    {#if description}<p class="ui-card-description">{description}</p>{/if}
    {@render children?.()}
  {/if}
</section>
