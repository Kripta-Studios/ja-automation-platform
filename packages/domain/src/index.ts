import { v7 as uuidv7 } from 'uuid';

export const roles = [
  'owner_admin',
  'finance_admin',
  'project_manager',
  'worker',
  'auditor_read_only',
] as const;
export type Role = (typeof roles)[number];
export const approvalStates = [
  'draft',
  'submitted',
  'needs_changes',
  'approved',
  'locked',
  'rejected',
] as const;
export type ApprovalState = (typeof approvalStates)[number];
export const syncOutcomes = ['accepted', 'conflict', 'rejected'] as const;

export type Principal = Readonly<{ userId: string; role: Role; projectIds: ReadonlySet<string> }>;
export type OwnedRecord = Readonly<{ ownerId: string; projectId: string }>;

export const newId = (): string => uuidv7();

export function canReadRecord(principal: Principal, record: OwnedRecord): boolean {
  if (
    principal.role === 'owner_admin' ||
    principal.role === 'finance_admin' ||
    principal.role === 'auditor_read_only'
  )
    return true;
  if (!principal.projectIds.has(record.projectId)) return false;
  return principal.role === 'project_manager' || principal.userId === record.ownerId;
}

export const canManageClients = (principal: Principal): boolean =>
  principal.role === 'owner_admin' || principal.role === 'finance_admin';

export const canManageBilling = (principal: Principal): boolean =>
  principal.role === 'owner_admin' || principal.role === 'finance_admin';

export const canReviewProject = (principal: Principal, projectId: string): boolean =>
  principal.role === 'owner_admin' ||
  (principal.role === 'project_manager' && principal.projectIds.has(projectId));

export const canManageAssignments = (principal: Principal, projectId: string): boolean =>
  principal.role === 'owner_admin' ||
  (principal.role === 'project_manager' && principal.projectIds.has(projectId));

const transitions: Record<ApprovalState, readonly ApprovalState[]> = {
  draft: ['submitted'],
  submitted: ['needs_changes', 'approved', 'rejected'],
  needs_changes: ['submitted'],
  approved: ['locked'],
  locked: [],
  rejected: ['draft'],
};

export function transitionApproval(from: ApprovalState, to: ApprovalState): ApprovalState {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid approval transition: ${from} -> ${to}`);
  return to;
}

export type OfflineMutation<T = unknown> = Readonly<{
  mutationId: string;
  entityType: string;
  entityId: string;
  baseVersion: number;
  createdAt: string;
  payload: T;
  attachments: readonly string[];
}>;

export type SyncResult =
  | { outcome: 'accepted'; version: number }
  | { outcome: 'conflict'; authoritativeVersion: number; fields: readonly string[] }
  | { outcome: 'rejected'; reason: string };
