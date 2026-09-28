/** Keep secondary content reachable through validation, deep links and printing. */
export function disclosure(node: HTMLDetailsElement) {
  const reveal = () => {
    let element: HTMLElement | null = node;
    while (element) {
      if (element instanceof HTMLDetailsElement) element.open = true;
      element = element.parentElement;
    }
  };
  const revealHash = () => {
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const target = id ? document.getElementById(id) : null;
    if (target && (node.contains(target) || target === node.parentElement)) {
      reveal();
      requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    }
  };
  const revealErrors = () => {
    if (node.querySelector('[aria-invalid="true"], [role="alert"]:not(:empty)')) reveal();
  };
  let openBeforePrint = false;
  const beforePrint = () => {
    openBeforePrint = node.open;
    node.open = true;
  };
  const afterPrint = () => {
    node.open = openBeforePrint;
  };
  const observer = new MutationObserver(revealErrors);
  observer.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-invalid', 'role'],
  });
  node.addEventListener('invalid', reveal, true);
  window.addEventListener('hashchange', revealHash);
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  revealHash();
  revealErrors();
  return {
    destroy() {
      observer.disconnect();
      node.removeEventListener('invalid', reveal, true);
      window.removeEventListener('hashchange', revealHash);
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    },
  };
}
