/** Keep the beginning of long forms visible rather than scrolling into their middle. */
export function centerNavigationTarget(target: HTMLElement): void {
  if (target instanceof HTMLDetailsElement) target.open = true;
  for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  }
  const heading = target.querySelector<HTMLElement>('h2, h3, h4, legend, summary');
  const destination =
    target.getBoundingClientRect().height > window.innerHeight * 0.7
      ? (heading ??
        Array.from(
          target.querySelectorAll<HTMLElement>('label, input:not([type=hidden]), select, textarea'),
        ).find((node) => node.getClientRects().length > 0) ??
        target)
      : target;
  destination.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  // Legends and scroll margins can make native alignment center the fieldset instead.
  const bounds = destination.getBoundingClientRect();
  window.scrollBy({
    top: bounds.top + bounds.height / 2 - window.innerHeight / 2,
    behavior: 'instant',
  });
  if (
    !target.hasAttribute('tabindex') &&
    !target.matches('input, select, textarea, button, a[href]')
  )
    target.tabIndex = -1;
  target.focus({ preventScroll: true });
}
