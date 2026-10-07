import { tick } from 'svelte';
import type { AssistantSurface, AssistantTask } from './types';

const surfaceRoutes: Record<AssistantSurface, string> = {
  'time-create': '/app/time',
  'expense-create': '/app/expenses',
  'report-daily': '/app/reports',
  'report-technical': '/app/reports',
  'report-generate': '/app/reports',
  'invoice-create': '/app/billing',
};

/** Only catalogue routes and an explicitly selected, opaque record ID become URLs. */
export function assistantTaskUrl(
  task: AssistantTask,
  options: { base: string; url: URL; recordId?: string },
): URL | null {
  const base = options.base.replace(/\/$/u, '');
  if (base && !/^\/[A-Za-z0-9_/-]+$/u.test(base)) return null;
  let href = task.href;
  if (options.recordId !== undefined) {
    if (!task.recordHref || !/^[A-Za-z0-9_-]{1,160}$/u.test(options.recordId)) return null;
    if (task.recordHref.split('{id}').length !== 2) return null;
    href = task.recordHref.replace('{id}', encodeURIComponent(options.recordId));
  }
  if (
    !/^\/app(?:\/|\?|#|$)/u.test(href) ||
    href.includes('\\') ||
    [...href].some((character) => character.charCodeAt(0) <= 32)
  )
    return null;
  const path = href.split(/[?#]/u)[0] ?? '';
  if (!/^\/app(?:\/[A-Za-z0-9_-]+)*\/?$/u.test(path)) return null;
  const target = new URL(`${base}${href}`, options.url.origin);
  if (target.origin !== options.url.origin || !target.pathname.startsWith(`${base}/app`))
    return null;
  // SvelteKit named actions are business mutations, never assistant destinations.
  if ([...target.searchParams.keys()].some((key) => key.startsWith('/'))) return null;
  const language = options.url.searchParams.get('lang');
  if (language && ['en', 'es', 'pt'].includes(language)) target.searchParams.set('lang', language);
  // Even a task for the already visible URL must be distinguishable from a canceled goto.
  target.searchParams.set('assistantRequest', globalThis.crypto.randomUUID());
  if (task.surface && options.recordId === undefined) {
    if (surfaceRoutes[task.surface] !== path) return null;
    target.searchParams.set('assistantSurface', task.surface);
  }
  return target;
}

/** Open only containing disclosures and focus a field or heading, never an action button. */
export function revealAssistantTarget(target: HTMLElement): void {
  let ancestor: HTMLElement | null = target;
  while (ancestor) {
    if (ancestor.tagName === 'DETAILS') (ancestor as HTMLDetailsElement).open = true;
    ancestor = ancestor.parentElement;
  }
  target.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
  const fieldSelector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';
  const visibleField = Array.from(target.querySelectorAll<HTMLElement>(fieldSelector)).find(
    (field) =>
      field.getClientRects().length > 0 &&
      !field.closest('[hidden], [aria-hidden="true"], [inert]'),
  );
  const focus =
    target.matches(fieldSelector) && target.getClientRects().length > 0
      ? target
      : (visibleField ??
        (target.matches('h1,h2,h3,h4,h5,h6,summary')
          ? target
          : target.querySelector<HTMLElement>('h1,h2,h3,h4,h5,h6,summary')) ??
        target);
  if (!focus.hasAttribute('tabindex') && !focus.matches('input,select,textarea,summary'))
    focus.setAttribute('tabindex', '-1');
  focus.focus({ preventScroll: true });
}

export async function navigateAssistantTask(
  task: AssistantTask,
  options: {
    base: string;
    url: URL;
    goto: (url: string, options?: { noScroll?: boolean; keepFocus?: boolean }) => Promise<unknown>;
    recordId?: string;
  },
): Promise<boolean> {
  const target = assistantTaskUrl(task, options);
  if (!target) return false;
  try {
    await options.goto(`${target.pathname}${target.search}${target.hash}`, {
      noScroll: true,
      keepFocus: true,
    });
    await tick();
    // A canceled same-route navigation must not reveal or reset the existing draft.
    const current = new URL(window.location.href);
    const isConfirmedDestination = (url: URL): boolean =>
      url.pathname === target.pathname &&
      url.searchParams.get('assistantRequest') === target.searchParams.get('assistantRequest') &&
      url.hash === target.hash;
    if (!isConfirmedDestination(current)) return false;
    let selector = task.focusSelector;
    if (options.recordId === undefined && task.surface)
      selector = `[data-assistant-target="${task.surface}"]`;
    if (!selector && target.hash) {
      const id = decodeURIComponent(target.hash.slice(1));
      const element = document.getElementById(id);
      if (!element) return false;
      revealAssistantTarget(element);
      return true;
    }
    if (!selector) return true;
    // Selectors are authored catalogue metadata; accept stable IDs and data targets only.
    if (!/^(?:#[A-Za-z][A-Za-z0-9_-]*|\[data-[a-z-]+(?:="[A-Za-z0-9_-]+")?\])$/u.test(selector))
      return false;
    // The component's request effect may need another render to expose a sheet.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) {
        revealAssistantTarget(element);
        return true;
      }
      await tick();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (!isConfirmedDestination(new URL(window.location.href))) return false;
    }
    return false;
  } catch {
    return false;
  }
}
