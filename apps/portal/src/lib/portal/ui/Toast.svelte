<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

  type PrimitiveProps = {
    variant?: ToastVariant;
    title?: string;
    message?: string;
    closeLabel?: string;
    dismissible?: boolean;
    autoDismiss?: boolean;
    durationMs?: number;
    class?: string;
    children?: Snippet;
    ondismiss?: () => void;
    [attribute: string]: unknown;
  };

  let {
    variant = 'info',
    title,
    message,
    closeLabel = 'Dismiss notification',
    dismissible = true,
    autoDismiss,
    durationMs,
    class: className = '',
    children,
    ondismiss,
    ...rest
  }: PrimitiveProps = $props();

  const normalizedMessage = $derived(message?.trim() ?? '');
  const normalizedTitle = $derived(title?.trim() ?? '');
  const hasContent = $derived(Boolean(normalizedMessage || children));
  const role = $derived(variant === 'danger' ? 'alert' : 'status');
  const live = $derived(variant === 'danger' ? 'assertive' : 'polite');
  const canDismiss = $derived(Boolean(dismissible && ondismiss));
  const resolvedDuration = $derived(
    durationMs ??
      (variant === 'success'
        ? 5_000
        : variant === 'info'
          ? 7_000
          : variant === 'warning'
            ? 10_000
            : 0),
  );
  const canAutoDismiss = $derived(
    Boolean(ondismiss && (autoDismiss ?? variant !== 'danger') && resolvedDuration > 0),
  );
  let remainingMs = 0;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reducedMotion = $state(false);

  function clearDismissTimer(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function pauseAutoDismiss(): void {
    if (!timer) return;
    remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    clearDismissTimer();
  }

  function resumeAutoDismiss(): void {
    if (!canAutoDismiss || timer || remainingMs <= 0) return;
    startedAt = Date.now();
    timer = setTimeout(() => ondismiss?.(), remainingMs);
  }

  function handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(next)
    )
      return;
    resumeAutoDismiss();
  }

  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    remainingMs = resolvedDuration;
    resumeAutoDismiss();
    return clearDismissTimer;
  });
  const forwarded = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([name]) =>
          !['data-ui', 'data-variant', 'role', 'aria-live', 'aria-atomic'].includes(name) &&
          (name.startsWith('data-') ||
            name.startsWith('aria-') ||
            name === 'id' ||
            name === 'tabindex' ||
            name === 'hidden'),
      ),
    ),
  );
</script>

{#if !hasContent}
  {@const _invalid = (() => {
    throw new Error('Toast requires a non-empty message or children.');
  })()}
{/if}

<aside
  {...forwarded}
  data-ui="toast"
  data-variant={variant}
  class={`ui-toast ${className}`.trim()}
  {role}
  aria-live={live}
  aria-atomic="true"
  onpointerenter={pauseAutoDismiss}
  onpointerleave={resumeAutoDismiss}
  onfocusin={pauseAutoDismiss}
  onfocusout={handleFocusOut}
  out:fade={{ duration: reducedMotion ? 0 : 180 }}
>
  <div class="ui-toast-content">
    {#if normalizedTitle}<strong class="ui-toast-title">{normalizedTitle}</strong>{/if}
    {#if normalizedMessage}<p>{normalizedMessage}</p>{/if}
    {@render children?.()}
  </div>
  {#if canDismiss}
    <button type="button" class="ui-toast-dismiss" aria-label={closeLabel} onclick={ondismiss}>
      <span aria-hidden="true">×</span>
    </button>
  {/if}
</aside>
