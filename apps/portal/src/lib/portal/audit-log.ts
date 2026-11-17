/** Shared (browser-safe) types for the paged audit register. */
export const AUDIT_RANGES = ['7', '30', '90', 'all'] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number] | 'custom';

export type AuditFilter = {
  range: AuditRange;
  from: string;
  to: string;
  actor: string;
  type: string;
  find: string;
};
