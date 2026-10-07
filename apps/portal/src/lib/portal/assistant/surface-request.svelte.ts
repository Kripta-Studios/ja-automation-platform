import { untrack } from 'svelte';
import { afterNavigate } from '$app/navigation';
import type { AssistantSurface } from './types';

/** React to cold links, same-route navigation and history without repeating a consumed request. */
export function useAssistantSurfaceRequest(options: {
  url: () => URL;
  surfaces: readonly AssistantSurface[];
  activate: (surface: AssistantSurface) => void;
  deactivate?: (surface: AssistantSurface) => void;
}): void {
  useAssistantRequest({ ...options, allowed: options.surfaces, parameter: 'assistantSurface' });
}

/** Small allowlisted view requests for existing controls outside creation surfaces. */
export function useAssistantPaneRequest<Pane extends string>(options: {
  url: () => URL;
  panes: readonly Pane[];
  activate: (pane: Pane) => void;
  deactivate?: (pane: Pane) => void;
}): void {
  useAssistantRequest({ ...options, allowed: options.panes, parameter: 'assistantPane' });
}

function useAssistantRequest<Request extends string>(options: {
  url: () => URL;
  allowed: readonly Request[];
  parameter: 'assistantSurface' | 'assistantPane';
  activate: (request: Request) => void;
  deactivate?: (request: Request) => void;
}): void {
  let mounted = $state(false);
  let previousRequest = '';
  let previousSurface: Request | null = null;
  afterNavigate(() => {
    // Cold pages run onMount before SvelteKit initializes replaceState. Activate
    // after its initial navigation callbacks and existing viewer restoration.
    queueMicrotask(() => {
      mounted = true;
    });
  });
  $effect(() => {
    const url = options.url();
    const surface = url.searchParams.get(options.parameter) as Request | null;
    const request = surface ? `${surface}:${url.searchParams.get('assistantRequest') ?? ''}` : '';
    if (!mounted) return;
    if (!surface || !options.allowed.includes(surface)) {
      const leavingSurface = previousSurface;
      if (leavingSurface) untrack(() => options.deactivate?.(leavingSurface));
      previousRequest = '';
      previousSurface = null;
      return;
    }
    if (request === previousRequest) return;
    previousRequest = request;
    previousSurface = surface;
    untrack(() => options.activate(surface));
  });
}
