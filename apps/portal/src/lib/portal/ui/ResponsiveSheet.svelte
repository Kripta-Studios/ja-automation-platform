<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { normalizePortalLocale, translate } from '../../i18n/catalog';

  type ResponsiveSheetProps = {
    open: boolean;
    title: string;
    description?: string;
    closeLabel?: string;
    protectChanges?: boolean;
    class?: string;
    children?: Snippet;
    onclose: () => void;
  };

  let {
    open,
    title,
    description,
    closeLabel = 'Close',
    protectChanges = false,
    class: className = '',
    children,
    onclose,
  }: ResponsiveSheetProps = $props();

  const componentId = $props.id();
  const titleId = `responsive-sheet-${componentId}-title`;
  const descriptionId = `responsive-sheet-${componentId}-description`;
  let panel: HTMLElement | undefined = $state();
  let previouslyFocused: HTMLElement | null = null;
  let baseline = '';

  function formSnapshot(): string {
    if (!panel) return '';
    return JSON.stringify(
      Array.from(
        panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]), select, textarea',
        ),
      )
        .filter((control) => !control.closest('.searchable-select-popover'))
        .map((control) => {
          if (control instanceof HTMLInputElement && control.type === 'file')
            return [
              control.name,
              Array.from(control.files ?? []).map((file) => [
                file.name,
                file.size,
                file.lastModified,
              ]),
            ];
          if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type))
            return [control.name, control.value, control.checked];
          if (control instanceof HTMLSelectElement && control.multiple)
            return [
              control.name,
              Array.from(control.selectedOptions).map((option) => option.value),
            ];
          return [control.name, control.value];
        }),
    );
  }

  function hasChanges(): boolean {
    return open && protectChanges && Boolean(baseline) && baseline !== formSnapshot();
  }

  function canClose(): boolean {
    if (protectChanges && panel?.querySelector('form[aria-busy="true"]')) return false;
    return (
      !hasChanges() ||
      window.confirm(
        translate(
          normalizePortalLocale(document.documentElement.lang),
          'Discard your unsaved changes? Your entered information will be lost.',
        ),
      )
    );
  }

  function requestClose(): void {
    if (canClose()) onclose();
  }

  beforeNavigate((navigation) => {
    // Browser unloads use the native beforeunload prompt below. Internal navigation can stay
    // on the page without remounting the form, including its selected receipt.
    if (!open || !protectChanges || navigation.willUnload) return;
    if (!canClose()) navigation.cancel();
  });

  function focusableElements(): HTMLElement[] {
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
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
    const handleCancel = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        panel?.contains(event.target) &&
        event.target.closest('[data-sheet-close]') &&
        !canClose()
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const handleUnload = (event: BeforeUnloadEvent) => {
      if (hasChanges() || (protectChanges && panel?.querySelector('form[aria-busy="true"]'))) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const handleReset = (event: Event) => {
      if (event.target instanceof HTMLFormElement && panel?.contains(event.target))
        void tick().then(() => {
          baseline = formSnapshot();
        });
    };
    document.addEventListener('click', handleCancel, true);
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('reset', handleReset, true);

    void tick().then(() => {
      if (!open) return;
      baseline = formSnapshot();
      const first = focusableElements()[0];
      (first ?? panel)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('click', handleCancel, true);
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('reset', handleReset, true);
      baseline = '';
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
        onclick={requestClose}
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
