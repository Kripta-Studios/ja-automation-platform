<script lang="ts">
  import { tick, type Snippet } from 'svelte';

  type ResponsiveSheetProps = {
    open: boolean;
    title: string;
    description?: string;
    closeLabel?: string;
    class?: string;
    children?: Snippet;
    onclose: () => void;
  };

  let {
    open,
    title,
    description,
    closeLabel = 'Close',
    class: className = '',
    children,
    onclose,
  }: ResponsiveSheetProps = $props();

  const componentId = $props.id();
  const titleId = `responsive-sheet-${componentId}-title`;
  const descriptionId = `responsive-sheet-${componentId}-description`;
  let panel: HTMLElement | undefined = $state();
  let previouslyFocused: HTMLElement | null = null;

  function focusableElements(): HTMLElement[] {
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('hidden'));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      panel?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  $effect(() => {
    if (!open || typeof document === 'undefined') return;

    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('responsive-sheet-open');
    document.addEventListener('keydown', handleKeydown);

    void tick().then(() => {
      if (!open) return;
      const first = focusableElements()[0];
      (first ?? panel)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.classList.remove('responsive-sheet-open');
      previouslyFocused?.focus();
      previouslyFocused = null;
    };
  });
</script>

{#if open}
  <div class="responsive-sheet-backdrop" aria-hidden="true"></div>
  <div
    bind:this={panel}
    class={`responsive-sheet ${className}`.trim()}
    data-ui="responsive-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    tabindex="-1"
  >
    <header class="responsive-sheet-header">
      <div>
        <p class="responsive-sheet-eyebrow">J&A Automation</p>
        <h2 id={titleId}>{title}</h2>
        {#if description}<p id={descriptionId}>{description}</p>{/if}
      </div>
      <button
        type="button"
        class="responsive-sheet-close"
        aria-label={closeLabel}
        onclick={onclose}
      >
        <span aria-hidden="true">×</span>
        <span class="sr-only">{closeLabel}</span>
      </button>
    </header>
    <div class="responsive-sheet-body">
      {@render children?.()}
    </div>
  </div>
{/if}
