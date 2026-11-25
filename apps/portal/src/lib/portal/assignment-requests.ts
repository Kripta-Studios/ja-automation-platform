/**
 * Client calls to the existing Projects assignment actions (the server
 * re-checks authorization, D5, dates and recorded work on every call).
 */
import { deserialize } from '$app/forms';
import { base } from '$app/paths';

export type RemovalPreview = {
  endsOn: string;
  cancelBeforeStart: boolean;
  resolvableLaterTime: number;
  blockedByRecords: boolean;
  hasRecords: boolean;
  /** Approved/invoiced records kept at the previous assignment terms. */
  keptApprovedRecords?: number;
};
export type DatesPreview = {
  resolvableTime: number;
  blockedByRecords: boolean;
  /** Approved/invoiced records kept at the previous assignment terms. */
  keptApprovedRecords?: number;
  reopens: boolean;
  overlap: { assignmentId: string; version: number; startsOn: string; endsOn: string | null } | null;
};
export type ActionOutcome = { ok: true; data: Record<string, unknown> } | { ok: false; data: unknown };

export async function assignmentAction(
  action:
    | 'removeAssignment'
    | 'previewRemoveAssignment'
    | 'deleteAssignment'
    | 'updateAssignment'
    | 'previewAssignmentDates',
  fields: Record<string, string>,
): Promise<ActionOutcome> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  try {
    const response = await fetch(`${base}/app/projects?/${action}`, {
      method: 'POST',
      body,
      headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
    });
    const result = deserialize(await response.text());
    if (result.type === 'success') return { ok: true, data: (result.data ?? {}) as Record<string, unknown> };
    return { ok: false, data: result.type === 'failure' ? result.data : null };
  } catch {
    return { ok: false, data: null };
  }
}

export async function previewRemoval(assignmentId: string, endsOn: string) {
  const result = await assignmentAction('previewRemoveAssignment', {
    assignmentId,
    ...(endsOn ? { endsOn } : {}),
  });
  return result.ok ? { preview: result.data.preview as RemovalPreview } : { failure: result.data };
}

export async function previewDates(assignmentId: string, startsOn: string, endsOn: string) {
  const result = await assignmentAction('previewAssignmentDates', { assignmentId, startsOn, endsOn });
  return result.ok ? { preview: result.data.preview as DatesPreview } : { failure: result.data };
}

export function shiftDay(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
