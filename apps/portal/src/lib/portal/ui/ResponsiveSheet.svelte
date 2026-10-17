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
    size?: 'default' | 'wide';
    class?: string;
    children?: Snippet;
    onclose: () => void;
  };

  let {
    open,
    title,
    description,
    closeLabel,
    protectChanges = false,
    size = 'default',
    class: className = '',
    children,
    onclose,
  }: ResponsiveSheetProps = $props();

  const componentId = $props.id();
  const titleId = `responsive-sheet-${componentId}-title`;
  const descriptionId = `responsive-sheet-${componentId}-description`;
  const displayedCloseLabel = $derived(closeLabel ?? 'Close');
  let panel: HTMLElement | undefined = $state();
  let scrollBody: HTMLElement | undefined = $state();
  let sheetNeedsFlow = $state(false);
  // Preserve the chosen layout mode after its natural-flow body expands.
  let flowModeActive = false;
  let scrollPaddingStart = $state(0);
  let scrollPaddingEnd = $state(0);
  let previouslyFocused: HTMLElement | null = null;
  let baseline = '';
  let clearanceFrame = 0;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  // This set only tracks ResizeObserver registrations and never drives template state.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let observedElements = new Set<Element>();

  function stickyClearance(excludedTarget?: Element): { start: number; end: number } {
    if (!scrollBody || typeof window === 'undefined') return { start: 0, end: 0 };
    const bodyBounds = scrollBody.getBoundingClientRect();
    const startEdge = Math.max(0, bodyBounds.top);
    const endEdge = Math.min(window.innerHeight, bodyBounds.bottom);
    let start = 0;
    let end = 0;

    for (const element of scrollBody.querySelectorAll<HTMLElement>('*')) {
      if (excludedTarget && element.contains(excludedTarget)) continue;
      const position = getComputedStyle(element).position;
      if (position !== 'sticky' && position !== 'fixed') continue;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;

      if (bounds.top <= startEdge + 1 && bounds.bottom > startEdge)
        start = Math.max(start, Math.min(endEdge, bounds.bottom) - startEdge);
      if (bounds.bottom >= endEdge - 1 && bounds.top < endEdge)
        end = Math.max(end, endEdge - Math.max(startEdge, bounds.top));
    }

    return { start: Math.ceil(start), end: Math.ceil(end) };
  }

  function updateScrollClearance(excludedTarget?: Element): void {
    const clearance = stickyClearance(excludedTarget);
    scrollPaddingStart = clearance.start;
    scrollPaddingEnd = clearance.end;
  }

  function updateSheetFlow(): void {
    if (!panel || !scrollBody) return;
    const actions = Array.from(panel.querySelectorAll<HTMLElement>('.sheet-form-actions'));
    const bodyHeight = scrollBody.getBoundingClientRect().height;
    const actionsHeight = Math.max(
      0,
      ...actions.map((element) => element.getBoundingClientRect().height),
    );
    // Compare the action area with the actual available body viewport. Latch the
    // fallback because the body grows after it switches to natural flow.
    const needsFlow = flowModeActive || (actionsHeight > 0 && actionsHeight >= bodyHeight);
    if (flowModeActive !== needsFlow) {
      flowModeActive = needsFlow;
      sheetNeedsFlow = needsFlow;
    }
  }

  function scheduleScrollClearance(): void {
    if (clearanceFrame) cancelAnimationFrame(clearanceFrame);
    clearanceFrame = requestAnimationFrame(() => {
      clearanceFrame = 0;
      updateScrollClearance();
    });
  }

  function stickyAncestorFor(target: HTMLElement): HTMLElement | undefined {
    let ancestor = target.parentElement;
    while (ancestor && ancestor !== scrollBody) {
      const position = getComputedStyle(ancestor).position;
      if (position === 'sticky' || position === 'fixed') return ancestor;
      ancestor = ancestor.parentElement;
    }
    return undefined;
  }

  function observeSheetLayout(): void {
    if (!panel || !scrollBody) return;
    // Keep observer bookkeeping non-reactive; these elements are consumed only by this effect.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const nextObserved = new Set<Element>([
      panel,
      scrollBody,
      ...Array.from(panel.querySelectorAll('.responsive-sheet-header, .sheet-form-actions')),
    ]);
    for (const element of scrollBody.querySelectorAll<HTMLElement>('*')) {
      const position = getComputedStyle(element).position;
      if (position === 'sticky' || position === 'fixed') nextObserved.add(element);
    }
    for (const element of observedElements)
      if (!nextObserved.has(element)) resizeObserver?.unobserve(element);
    for (const element of nextObserved)
      if (!observedElements.has(element)) resizeObserver?.observe(element);
    observedElements = nextObserved;
    updateSheetFlow();
    scheduleScrollClearance();
  }

  function keepFocusedContentClear(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !panel?.contains(target) || !scrollBody) return;
    requestAnimationFrame(() => {
      if (!panel?.contains(target) || !scrollBody) return;
      if (!scrollBody.contains(target)) return;
      const stickyAncestor = stickyAncestorFor(target);
      const clearance = stickyClearance(stickyAncestor ?? target);
      scrollPaddingStart = clearance.start;
      scrollPaddingEnd = clearance.end;

      if (stickyAncestor) return;
      const region = target.closest<HTMLElement>('label') ?? target;
      const regionBounds = region.getBoundingClientRect();
      const bodyBounds = scrollBody.getBoundingClientRect();
      const top = Math.max(0, bodyBounds.top) + clearance.start;
      const bottom = Math.min(window.innerHeight, bodyBounds.bottom) - clearance.end;
      let adjustment = 0;

      if (regionBounds.height > bottom - top) {
        const targetBounds = target.getBoundingClientRect();
        if (targetBounds.bottom > bottom) adjustment = targetBounds.bottom - bottom;
        else if (targetBounds.top < top) adjustment = targetBounds.top - top;
      } else if (regionBounds.bottom > bottom) adjustment = regionBounds.bottom - bottom;
      else if (regionBounds.top < top) adjustment = regionBounds.top - top;

      if (Math.abs(adjustment) > 1)
        (sheetNeedsFlow ? panel : scrollBody)?.scrollBy({ top: adjustment, behavior: 'instant' });
    });
  }

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
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.closest('[inert]') &&
        (!element.closest('details:not([open])') || element.matches('summary')),
    );
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

    flowModeActive = false;
    sheetNeedsFlow = false;
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
    panel?.addEventListener('focusin', keepFocusedContentClear);
    scrollBody?.addEventListener('scroll', scheduleScrollClearance, { passive: true });
    window.addEventListener('resize', scheduleScrollClearance, { passive: true });
    resizeObserver = new ResizeObserver(() => {
      updateSheetFlow();
      scheduleScrollClearance();
    });
    mutationObserver = new MutationObserver((records) => {
      if (records.length) observeSheetLayout();
    });
    if (panel && scrollBody) {
      mutationObserver.observe(scrollBody, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'style'],
      });
      observeSheetLayout();
    }

    void tick().then(() => {
      if (!open) return;
      baseline = formSnapshot();
      observeSheetLayout();
      const first = focusableElements()[0];
      const problem = panel?.querySelector<HTMLElement>(
        '[data-validation-summary], [data-ui="problem-notice"][data-kind="error"]',
      );
      (problem ?? first ?? panel)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('click', handleCancel, true);
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('reset', handleReset, true);
      panel?.removeEventListener('focusin', keepFocusedContentClear);
      scrollBody?.removeEventListener('scroll', scheduleScrollClearance);
      window.removeEventListener('resize', scheduleScrollClearance);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      mutationObserver = undefined;
      resizeObserver = undefined;
      observedElements.clear();
      if (clearanceFrame) cancelAnimationFrame(clearanceFrame);
      clearanceFrame = 0;
      baseline = '';
      flowModeActive = false;
      sheetNeedsFlow = false;
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
    class={`responsive-sheet ${size === 'wide' ? 'responsive-sheet--wide' : ''} ${sheetNeedsFlow ? 'responsive-sheet--flow' : ''} ${className}`.trim()}
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
        data-portal-live-text={closeLabel !== undefined ? true : undefined}
        aria-label={displayedCloseLabel}
        onclick={requestClose}
      >
        <span aria-hidden="true">×</span>
        <span class="sr-only">{displayedCloseLabel}</span>
      </button>
    </header>
    <div
      bind:this={scrollBody}
      class="responsive-sheet-body"
      style={`--responsive-sheet-scroll-padding-start:${scrollPaddingStart}px;--responsive-sheet-scroll-padding-end:${scrollPaddingEnd}px`}
    >
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .responsive-sheet.responsive-sheet--wide {
    width: min(68rem, 100vw);
    max-width: 100vw;
  }

  .responsive-sheet-body {
    scroll-padding-block-start: var(--responsive-sheet-scroll-padding-start, 0px);
    scroll-padding-block-end: var(--responsive-sheet-scroll-padding-end, 0px);
  }

  .responsive-sheet.responsive-sheet--flow {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .responsive-sheet--flow .responsive-sheet-header {
    flex: 0 0 auto;
  }

  .responsive-sheet--flow .responsive-sheet-body {
    min-height: auto;
    flex: 0 0 auto;
    overflow: visible;
  }

  .responsive-sheet--flow :global(.sheet-form-actions) {
    position: static !important;
    inset-block-end: auto !important;
    margin-block-end: 0 !important;
    backdrop-filter: none;
  }
</style>
