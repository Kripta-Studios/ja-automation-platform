import type { DatabaseSync } from 'node:sqlite';
import { newId } from '@ja/domain';

const auditSecretKey =
  /authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|password|passphrase|credential|token|secret|api[_-]?key|private[_-]?key/i;
const auditCredentialText =
  /\b(authorization|proxy[_-]?authorization|password|passphrase|credential|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const auditAuthorizationText = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const auditJwtText = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const auditPrivateKeyText =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g;
const B5_AUDIT_CONTRACT_VERSION = 'B5-R4';

export type AuditPrincipal = Readonly<{
  userId: string;
  correlationId?: string;
}>;

function redactAuditText(value: string): string {
  return value
    .replace(auditPrivateKeyText, '[REDACTED]')
    .replace(auditAuthorizationText, '$1 [REDACTED]')
    .replace(auditCredentialText, '$1=[REDACTED]')
    .replace(auditJwtText, '[REDACTED]');
}

export function redactAuditDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactAuditDetails(item));
  if (typeof value === 'string') return redactAuditText(value);
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
  const hasB5Contract = Boolean(
    sqlite
      .prepare("SELECT 1 FROM pragma_table_info('audit_event') WHERE name='audit_contract_version'")
      .get(),
  );
  if (hasB5Contract) {
    const actorKind = principal ? 'user' : 'system';
    // The migration owns a closed, reviewed action manifest. Runtime writers
    // may append only a row already present in that manifest; registering an
    // arbitrary action here would turn audit provenance into a caller-shaped
    // capability and is deliberately rejected.
    const registered = sqlite
      .prepare(
        `SELECT 1 FROM audit_action_registry
         WHERE contract_version=? AND action=? AND entity_type=? AND actor_kind=?`,
      )
      .get(B5_AUDIT_CONTRACT_VERSION, action, entityType, actorKind);
    if (!registered) throw new Error('AUDIT_ACTION_NOT_REVIEWED');
    const deployment = sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!deployment) throw new Error('Deployment identity is required for audit events');
    sqlite
      .prepare(
        `INSERT INTO audit_event(
           id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
           project_id,before_json,after_json,reason,correlation_id,metadata_json,
           audit_contract_version,actor_kind,service_actor_id,service_capability,job_id,job_run_id,
           tenant_id,deployment_id,provenance
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,?)`,
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
        B5_AUDIT_CONTRACT_VERSION,
        actorKind,
        deployment.tenant_id,
        deployment.deployment_id,
        'native',
      );
    return;
  }
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
