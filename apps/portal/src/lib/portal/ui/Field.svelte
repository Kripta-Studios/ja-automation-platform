<script lang="ts">
  import type { Snippet } from 'svelte';

  type PrimitiveProps = {
    id: string;
    label: string;
    help?: string;
    error?: string;
    required?: boolean;
    class?: string;
    children?: Snippet;
    [attribute: string]: unknown;
  };

  let {
    id,
    label,
    help,
    error,
    required = false,
    class: className = '',
    children,
    ...rest
  }: PrimitiveProps = $props();

  const helpId = $derived(`${id}-help`);
  const errorId = $derived(`${id}-error`);
  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          ![
            'data-ui',
            'data-field-control-id',
            'data-field-help-id',
            'data-field-error-id',
          ].includes(name) &&
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
  data-ui="field"
  data-field-control-id={id}
  data-field-help-id={help ? helpId : undefined}
  data-field-error-id={error ? errorId : undefined}
  class={`ui-field ${className}`.trim()}
>
  <label for={id} required={required || undefined} aria-required={required ? 'true' : undefined}>
    <span>{label}</span>
    {#if required}<span class="ui-field-required" aria-hidden="true">Required</span>{/if}
  </label>
  {#if help}
    <p class="ui-field-help" id={helpId}>{help}</p>
  {/if}
  <div class="ui-field-control">
    {@render children?.()}
  </div>
  {#if error}
    <p class="ui-field-error" id={errorId} data-field-error-for={id} role="alert">{error}</p>
  {/if}
</div>
