import type { ProblemData } from '$lib/problem/contract';

export type RecoveryRequest = {
  problem: ProblemData & { actionName?: string; values?: Readonly<Record<string, unknown>> };
  source?: HTMLElement;
  form?: HTMLFormElement;
  links?: readonly { label: string; href?: string; reload?: boolean }[];
};
const listeners = new Set<(request: RecoveryRequest) => void>();
let pending: RecoveryRequest | undefined;

/** Client-only, in-memory handoff. No submitted values are persisted or logged. */
export function requestGuidedRecovery(request: RecoveryRequest): void {
  if (typeof window === 'undefined') return;
  if (!listeners.size) {
    pending = request;
    return;
  }
  for (const listener of listeners) listener(request);
}
export function subscribeGuidedRecovery(listener: (request: RecoveryRequest) => void): () => void {
  listeners.add(listener);
  if (pending) {
    const request = pending;
    pending = undefined;
    queueMicrotask(() => listener(request));
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Existing localized auth/service feedback can open the same explanatory dialog. */
export function requestRecoveryMessage(message: string, source?: HTMLElement): void {
  requestGuidedRecovery({
    source,
    problem: {
      code: 'ACTION_FEEDBACK',
      messageKey: 'problem.recovery.detail',
      message,
      params: {},
      fieldErrors: {},
      remedies: [],
      correlationId: '',
    },
  });
}
