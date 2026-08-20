<script lang="ts">
  import type { Snippet } from 'svelte';

  type PrimitiveProps = {
    class?: string;
    children?: Snippet;
    [attribute: string]: unknown;
  };

  let { class: className = '', children, ...rest }: PrimitiveProps = $props();

  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          name !== 'data-ui' &&
          (name.startsWith('data-') ||
            name.startsWith('aria-') ||
            name === 'id' ||
            name === 'role' ||
            name === 'tabindex' ||
            name === 'hidden'),
      ),
    ),
  );
</script>

<div {...forwarded} data-ui="action-bar" class={`ui-action-bar ${className}`.trim()}>
  {@render children?.()}
</div>
