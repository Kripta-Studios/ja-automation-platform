import type { DatabaseSync } from 'node:sqlite';
import { newId } from '@ja/domain';

const auditSecretKey = /password|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token/i;

export type AuditPrincipal = Readonly<{
  userId: string;
  correlationId?: string;
}>;

export function redactAuditDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactAuditDetails(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        auditSecretKey.test(key) ? '[REDACTED]' : redactAuditDetails(item),
      ]),
    );
  return value;
}

export function recordAuditEvent(
  sqlite: DatabaseSync,
  principal: AuditPrincipal | null,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown,
): void {
  const redacted = redactAuditDetails(details) as Record<string, unknown>;
  const projectId = typeof redacted.projectId === 'string' ? redacted.projectId : null;
  const before = redacted.before === undefined ? null : JSON.stringify(redacted.before);
  const after = redacted.after === undefined ? null : JSON.stringify(redacted.after);
  const reason = typeof redacted.reason === 'string' ? redacted.reason : null;
  const correlationId =
    typeof redacted.correlationId === 'string'
      ? redacted.correlationId
      : (principal?.correlationId ?? newId());
  const metadata = JSON.stringify(redacted);
  sqlite
    .prepare(
      'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,project_id,before_json,after_json,reason,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      newId(),
      principal?.userId ?? null,
      action,
      entityType,
      entityId,
      new Date().toISOString(),
      metadata,
      projectId,
      before,
      after,
      reason,
      correlationId,
      metadata,
    );
}
