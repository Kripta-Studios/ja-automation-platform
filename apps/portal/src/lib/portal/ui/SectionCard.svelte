<script lang="ts">
  import type { Snippet } from 'svelte';

  type SurfaceProps = { title: string; ariaLabel?: never } | { title?: never; ariaLabel: string };

  type PrimitiveProps = SurfaceProps & {
    headingId?: string;
    class?: string;
    children?: Snippet;
  } & Record<string, unknown>;

  let {
    title,
    ariaLabel,
    headingId,
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
  {#if normalizedTitle}
    <h2 class="ui-card-heading" id={heading}>{normalizedTitle}</h2>
  {/if}
  {@render children?.()}
</section>
