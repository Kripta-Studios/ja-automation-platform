import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Ask before an enhanced form submits. SvelteKit's `use:enhance` ignores
 * `event.defaultPrevented`, so a confirm placed in `onsubmit` does not stop the POST:
 * the confirm has to run inside the SubmitFunction and call `cancel()`.
 */
export function confirmBeforeSubmit(
  message: string | (() => string),
  next?: SubmitFunction,
  ask: (text: string) => boolean = (text) => window.confirm(text),
): SubmitFunction {
  return (input) => {
    const text = typeof message === 'function' ? message() : message;
    if (!ask(text)) {
      input.cancel();
      return;
    }
    return next?.(input);
  };
}
