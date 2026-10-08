import type { PortalActionEvent } from '$lib/server/action-utils';

/** Keep the original SvelteKit ActionFailure instance while identifying its source form. */
export function withOperationalActionNames<
  T extends Record<string, (event: PortalActionEvent) => Promise<unknown>>,
>(actions: T): T {
  return Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      async (event: PortalActionEvent) => {
        const result = await action(event);
        if (result && typeof result === 'object' && 'data' in result) {
          const data = result.data;
          if (data && typeof data === 'object' && 'success' in data && data.success === false) {
            // Do not recreate/spread the failure: SvelteKit relies on its class identity.
            const problem = data as Record<string, unknown>;
            problem.actionName ??= name;
          }
        }
        return result;
      },
    ]),
  ) as T;
}
