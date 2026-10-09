/** Keep the beginning of long forms visible rather than scrolling into their middle. */
export function centerNavigationTarget(target: HTMLElement): void {
  for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  }
  const heading = target.querySelector<HTMLElement>('h2, h3, legend');
  const destination =
    target.getBoundingClientRect().height > window.innerHeight * 0.7 ? (heading ?? target) : target;
  destination.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  // Legends and scroll margins can make native alignment center the fieldset instead.
  const bounds = destination.getBoundingClientRect();
  window.scrollBy({
    top: bounds.top + bounds.height / 2 - window.innerHeight / 2,
    behavior: 'instant',
  });
  target.focus({ preventScroll: true });
}
