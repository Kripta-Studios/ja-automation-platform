import { untrack } from 'svelte';
import { afterNavigate, replaceState } from '$app/navigation';
import { page } from '$app/stores';
import { get } from 'svelte/store';

type Preference = string | number | boolean;
type Snapshot = Record<string, Preference>;

/** Only explicitly opted-in viewer state belongs here; never edit form values. */
export function useViewPreferences<T extends Snapshot>(options: {
  scope: string;
  user: () => string;
  url: () => URL;
  defaults: T;
  query?: Partial<Record<keyof T, string>>;
  get: () => T;
  set: (value: T) => void;
  validate?: (value: T) => T;
}) {
  let mounted = $state(false);
  let restoredContext = '';
  // Initial afterNavigate runs just before the router marks itself started.
  afterNavigate(() => {
    queueMicrotask(() => {
      mounted = true;
    });
  });
  $effect(() => {
    if (!mounted || !options.user()) return;
    const loadedUrl = options.url();
    // Shallow replaceState updates history/state, not SvelteKit's loaded page URL.
    const url = new URL(loadedUrl);
    url.search = window.location.search;
    const key = `ja-view-preferences:v1:${options.user()}:${options.scope}`;
    const context = `${key}:${url.pathname}${url.search}`;
    const snapshot = options.get();
    if (restoredContext !== context) {
      const restored = { ...options.defaults };
      const reset = url.searchParams.get('reset') === '1';
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (!reset && saved && typeof saved === 'object' && !Array.isArray(saved)) {
          for (const name of Object.keys(restored) as Array<keyof T>) {
            const value = (saved as Snapshot)[String(name)];
            if (
              typeof value === typeof restored[name] &&
              (typeof value !== 'number' || Number.isFinite(value))
            )
              restored[name] = value as T[keyof T];
          }
        }
      } catch {
        /* Storage is optional; the viewer remains usable. */
      }
      for (const [name, parameter] of Object.entries(options.query ?? {})) {
        if (parameter && url.searchParams.has(parameter))
          restored[name as keyof T] = url.searchParams.get(parameter)!.trim() as T[keyof T];
      }
      // Explicit scoped filter links describe their complete criteria. Saved
      // omitted filters must not hide a remedy or a newly created source row.
      const hasCriteria = Object.values(options.query ?? {}).some(
        (parameter) =>
          parameter &&
          !['view', 'tab', 'setup', 'source'].includes(parameter) &&
          url.searchParams.has(parameter),
      );
      if (hasCriteria) {
        for (const [name, parameter] of Object.entries(options.query ?? {})) {
          if (
            parameter &&
            !['view', 'tab', 'setup', 'source'].includes(parameter) &&
            !url.searchParams.has(parameter)
          )
            restored[name as keyof T] = options.defaults[name as keyof T];
        }
      }
      // A record-targeting link must not be hidden by unrelated remembered filters.
      if (
        ['focus', 'expense', 'invoice', 'edit', 'action'].some((name) => url.searchParams.has(name))
      ) {
        for (const [name, parameter] of Object.entries(options.query ?? {})) {
          if (parameter && !url.searchParams.has(parameter))
            restored[name as keyof T] = options.defaults[name as keyof T];
        }
      }
      const validated = options.validate ? options.validate(restored) : restored;
      restoredContext = context;
      untrack(() => options.set(validated));
      // A copied link can carry a value that is invalid for the selected view.
      // Clear that URL key as well as the restored control value, so reloads,
      // copied links and filter chips all describe the same register state.
      if (options.validate) {
        const canonical = new URL(url);
        for (const [name, parameter] of Object.entries(options.query ?? {})) {
          if (!parameter || !url.searchParams.has(parameter)) continue;
          const key = name as keyof T;
          if (validated[key] === restored[key]) continue;
          const value = validated[key];
          if (value === '' || value === options.defaults[key]) canonical.searchParams.delete(parameter);
          else canonical.searchParams.set(parameter, String(value));
        }
        if (canonical.search !== url.search) {
          restoredContext = `${key}:${canonical.pathname}${canonical.search}`;
          replaceState(canonical, get(page).state);
        }
      }
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      /* Optional. */
    }
    // Keep explicit links and subsequent reloads aligned with local filter changes.
    const next = new URL(url);
    next.searchParams.delete('reset');
    for (const [name, parameter] of Object.entries(options.query ?? {})) {
      if (!parameter) continue;
      const value = snapshot[name];
      if (value === '' || value === options.defaults[name]) next.searchParams.delete(parameter);
      else next.searchParams.set(parameter, String(value));
    }
    if (next.search !== url.search) {
      restoredContext = `${key}:${next.pathname}${next.search}`;
      replaceState(next, get(page).state);
    }
  });
}
