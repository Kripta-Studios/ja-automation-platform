/** Keep same-page filters and native saves at their working position. */
export function installWorkspaceNavigation(): () => void {
  const storageKey = 'ja:workspace-native-submit';
  const pending = new WeakSet<HTMLFormElement>();
  try {
    const raw = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (
        saved.path === location.pathname &&
        Date.now() - saved.at < 60_000 &&
        Number.isFinite(saved.y)
      ) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.scrollTo({ top: saved.y, behavior: 'instant' });
            if (saved.id) document.getElementById(saved.id)?.focus({ preventScroll: true });
          }),
        );
      }
    }
  } catch {
    /* Browser storage is optional. */
  }

  const submit = (event: SubmitEvent) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
    const button = event.submitter as HTMLButtonElement | HTMLInputElement | null;
    const target = button?.getAttribute('formtarget') ?? form.target;
    if (target && target !== '_self') return;
    const destination = new URL(button?.getAttribute('formaction') ?? form.action, location.href);
    if (destination.origin !== location.origin || destination.pathname !== location.pathname)
      return;
    const method = (button?.getAttribute('formmethod') ?? form.method).toLowerCase();
    if (method === 'get') {
      // Set router options before SvelteKit's container listener handles GET.
      // Form-owned handlers and native serialization remain authoritative.
      // Filter forms sometimes carry an old results anchor. That anchor would
      // move focus and scroll even when the router's no-scroll option is set.
      if (destination.hash) {
        destination.hash = '';
        if (button?.hasAttribute('formaction')) button.formAction = destination.href;
        else form.action = destination.href;
      }
      form.setAttribute('data-sveltekit-noscroll', '');
      form.setAttribute('data-sveltekit-keepfocus', '');
    } else if (method === 'post') {
      // Enhanced forms already handle their own pending/result state. Only remember
      // a native navigation after all form handlers have had the chance to run.
      if (pending.has(form)) {
        event.preventDefault();
        return;
      }
      pending.add(form);
      // Browsers may drain microtasks between capture and form-owned listeners.
      // Wait until dispatch ends before deciding whether this submit was canceled.
      setTimeout(() => {
        if (event.defaultPrevented) {
          pending.delete(form);
          return;
        }
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              path: destination.pathname,
              y: window.scrollY,
              id: (document.activeElement as HTMLElement | null)?.id ?? '',
              at: Date.now(),
            }),
          );
        } catch {
          /* Browser storage is optional. */
        }
      }, 0);
    }
  };
  const click = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self'))
      return;
    const destination = new URL(anchor.href, location.href);
    // Explicit section links still scroll to their named destination.
    if (
      destination.origin === location.origin &&
      destination.pathname === location.pathname &&
      !destination.hash
    )
      anchor.setAttribute('data-sveltekit-noscroll', '');
  };
  document.addEventListener('submit', submit, true);
  document.addEventListener('click', click, true);
  return () => {
    document.removeEventListener('submit', submit, true);
    document.removeEventListener('click', click, true);
  };
}
