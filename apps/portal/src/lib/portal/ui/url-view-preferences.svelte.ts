import { afterNavigate, goto } from '$app/navigation';

/** Server-backed GET viewers retain their applied criteria on a normal revisit. */
export function rememberUrlView(user: () => string, appBase: string): void {
  const routes: Record<string, string[]> = {
    time: ['project', 'worker', 'from', 'to', 'category', 'status', 'client', 'q', 'order', 'week'],
    projects: ['q', 'status'],
    'finance/cash': ['currency', 'filter', 'from', 'to', 'dated', 'group', 'project'],
    finance: ['view'],
    team: ['directory'],
    notifications: ['read'],
  };
  afterNavigate(({ to, type }) => {
    queueMicrotask(() => {
      if (!to || !user()) return;
      const url = new URL(window.location.href);
      const route = url.pathname.slice(`${appBase}/app/`.length);
      const fields = routes[route];
      if (
        !fields ||
        url.searchParams.has('action') ||
        url.searchParams.has('edit') ||
        [...url.searchParams.keys()].some((key) => key.startsWith('/'))
      )
        return;
      const key = `ja-url-view:v1:${user()}:${route}`;
      try {
        if (url.searchParams.has('reset') || fields.some((field) => url.searchParams.has(field))) {
          const saved: Record<string, string> = {};
          if (!url.searchParams.has('reset')) {
            for (const field of fields) {
              const value = url.searchParams.get(field);
              if (value !== null) saved[field] = value;
            }
          }
          localStorage.setItem(key, JSON.stringify(saved));
          return;
        }
        // Native back/forward represents an exact historical view, including a blank one.
        if (type === 'popstate' || url.hash) return;
        const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
        const next = new URL(url);
        for (const field of fields) {
          const value = (saved as Record<string, unknown>)[field];
          if (typeof value === 'string' && value.length <= 1000)
            next.searchParams.set(field, value);
        }
        if (next.search !== url.search) void goto(next, { replaceState: true, noScroll: true });
      } catch {
        /* Storage unavailable: retain normal GET navigation. */
      }
    });
  });
}
