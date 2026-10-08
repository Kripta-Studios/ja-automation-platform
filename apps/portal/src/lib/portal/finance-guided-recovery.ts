import type { ProblemData } from '$lib/problem/contract';
import { requestGuidedRecovery } from './guided-recovery/events';

/** Bridge legacy financial summaries to the shared repair dialog using the
 * existing form, field errors, retained values and normal audited action.
 */
export function requestFinanceGuidedRecovery(
  failure: unknown,
  form: HTMLFormElement | undefined,
  actionName: string,
  fallback: ProblemData['messageKey'],
  reviewLabel?: string,
): void {
  if (!failure || typeof failure !== 'object') return;
  const raw = failure as Record<string, unknown>;
  const messageKey =
    typeof raw.messageKey === 'string' && /^(action|problem)\./.test(raw.messageKey)
      ? (raw.messageKey as ProblemData['messageKey'])
      : fallback;
  const fields = raw.fieldErrors ?? raw.fields;
  const fieldErrors =
    fields && typeof fields === 'object' && !Array.isArray(fields)
      ? Object.fromEntries(
          Object.entries(fields).flatMap(([name, messages]) => {
            const valid = Array.isArray(messages)
              ? messages.filter((message): message is string => typeof message === 'string')
              : [];
            return valid.length ? [[name, valid]] : [];
          }),
        )
      : {};
  const reviewUrl =
    !reviewLabel || typeof window === 'undefined' ? null : new URL(window.location.href);
  if (reviewUrl)
    for (const key of [...reviewUrl.searchParams.keys()])
      if (key.startsWith('/')) reviewUrl.searchParams.delete(key);
  requestGuidedRecovery({
    form,
    source: form,
    ...(reviewUrl && reviewLabel
      ? {
          links: [
            {
              label: reviewLabel,
              href: `${reviewUrl.pathname}${reviewUrl.search}${reviewUrl.hash}`,
              reload: true,
            },
          ],
        }
      : {}),
    problem: {
      code: typeof raw.code === 'string' ? raw.code : `FINANCE_${actionName.toUpperCase()}_INVALID`,
      messageKey,
      params: {},
      fieldErrors,
      remedies: [],
      correlationId: typeof raw.correlationId === 'string' ? raw.correlationId : '',
      actionName,
      values:
        raw.values && typeof raw.values === 'object' ? (raw.values as Record<string, unknown>) : {},
    },
  });
}
