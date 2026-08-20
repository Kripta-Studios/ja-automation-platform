<script lang="ts">
  import type { Snippet } from 'svelte';

  type PrimitiveProps = {
    title: string;
    description?: string;
    headingId?: string;
    class?: string;
    children?: Snippet;
    [attribute: string]: unknown;
  };

  let {
    title,
    description,
    headingId,
    class: className = '',
    children,
    ...rest
  }: PrimitiveProps = $props();

  const sectionTitle = $derived(title.trim() || 'Form section');
  const heading = $derived(headingId ?? `form-section-${slug(sectionTitle)}-title`);
  const descriptionId = $derived(description ? `${heading}-description` : undefined);
  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          !['data-ui', 'aria-labelledby', 'aria-describedby'].includes(name) &&
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
        .replace(/^-|-$/g, '') || 'section'
    );
  }
</script>

<section
  {...forwarded}
  data-ui="form-section"
  class={`ui-form-section ${className}`.trim()}
  aria-labelledby={heading}
  aria-describedby={descriptionId}
>
  <h3 class="ui-section-heading" id={heading}>{sectionTitle}</h3>
  {#if description}
    <p class="ui-section-description" id={descriptionId}>{description}</p>
  {/if}
  {@render children?.()}
</section>
