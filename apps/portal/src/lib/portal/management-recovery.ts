import type { ProblemData } from '../problem/contract';

export type ManagementProblem = ProblemData & {
  actionName?: string;
  operation?: string;
  values?: Readonly<Record<string, unknown>>;
};

/** Native actions and enhanced actions carry the same safe failure payload. */
export function managementProblem(result: unknown): ManagementProblem | null {
  if (!result || typeof result !== 'object') return null;
  const outer = result as Record<string, unknown>;
  const payload =
    outer.data && typeof outer.data === 'object' ? (outer.data as Record<string, unknown>) : outer;
  if (
    payload.success === true ||
    typeof payload.code !== 'string' ||
    typeof payload.messageKey !== 'string' ||
    !payload.fieldErrors ||
    typeof payload.fieldErrors !== 'object' ||
    !Array.isArray(payload.remedies)
  )
    return null;
  return payload as ManagementProblem;
}

export function contactProblemMatches(
  problem: ManagementProblem | null,
  action: 'createClientContact' | 'updateClientContact' | 'deleteClientContact',
  recordId: string,
): boolean {
  const idField = action === 'createClientContact' ? 'clientId' : 'contactId';
  return problem?.actionName === action && problem.values?.[idField] === recordId;
}

/** Retain only the current contact's public form fields; never cross client boundaries. */
const contactTextFields = new Set([
  'name',
  'email',
  'phone',
  'role',
  'company',
  'location',
  'contactType',
  'notes',
]);

export function retainedContactValue(
  problem: ManagementProblem | null,
  action: 'createClientContact' | 'updateClientContact',
  recordId: string,
  field: string,
  fallback = '',
): string {
  if (!contactTextFields.has(field) || !contactProblemMatches(problem, action, recordId))
    return fallback;
  const value = problem?.values?.[field];
  return typeof value === 'string' ? value : fallback;
}

export function retainedContactCheck(
  problem: ManagementProblem | null,
  action: 'createClientContact' | 'updateClientContact',
  recordId: string,
  field: 'isPrimary' | 'isBillingContact',
  fallback = false,
): boolean {
  if (!contactProblemMatches(problem, action, recordId)) return fallback;
  const value = problem?.values?.[field];
  return value === true || value === 'on';
}
