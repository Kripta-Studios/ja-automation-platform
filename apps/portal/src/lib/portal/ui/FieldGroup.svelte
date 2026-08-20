<script lang="ts">
  import type { Snippet } from 'svelte';

  export type FieldGroupColumns = '1' | '2' | '3' | 'auto';

  type PrimitiveProps = {
    columns?: FieldGroupColumns;
    class?: string;
    children?: Snippet;
    [attribute: string]: unknown;
  };

  let { columns = '1', class: className = '', children, ...rest }: PrimitiveProps = $props();

  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          !['data-ui', 'data-columns'].includes(name) &&
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

<div
  {...forwarded}
  data-ui="field-group"
  data-columns={columns}
  class={`ui-field-group ${className}`.trim()}
>
  {@render children?.()}
</div>
