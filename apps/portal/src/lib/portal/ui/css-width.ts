/**
 * Set an element's width through the CSSOM. The portal CSP forbids inline
 * `style` attributes (which server-rendered `style:` directives emit), while
 * script-applied styles are allowed.
 */
export function cssWidth(node: HTMLElement, percent: number) {
  const apply = (value: number) => {
    node.style.width = `${Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))}%`;
  };
  apply(percent);
  return { update: apply };
}
