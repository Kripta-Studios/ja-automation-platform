<script lang="ts">
  import type { Snippet } from 'svelte';

  export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

  type PrimitiveProps = {
    variant?: StatusVariant;
    text?: string;
    class?: string;
    children?: Snippet;
    [attribute: string]: unknown;
  };

  let {
    variant = 'neutral',
    text,
    class: className = '',
    children,
    ...rest
  }: PrimitiveProps = $props();

  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          !['data-ui', 'data-variant'].includes(name) &&
          (name.startsWith('data-') ||
            name.startsWith('aria-') ||
            name === 'id' ||
            name === 'role' ||
            name === 'tabindex' ||
            name === 'hidden'),
      ),
    ),
  );

  const fallbackText = $derived(variant.charAt(0).toUpperCase() + variant.slice(1));
</script>

<span
  {...forwarded}
  data-ui="status-badge"
  data-variant={variant}
  class={`ui-status-badge ${className}`.trim()}
>
  {#if children}{@render children()}{:else}{text ?? fallbackText}{/if}
</span>
