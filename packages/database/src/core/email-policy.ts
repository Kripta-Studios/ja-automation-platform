import type { DatabaseSync } from 'node:sqlite';

/** Consent belongs to this specific user action, never to a notification or a global default. */
export function hasEmailConsent(topic: string, payload: unknown): boolean {
  if (!['invitation.created', 'invoice.email.requested', 'public-inquiry.received'].includes(topic))
    return false;
  return (
    !!payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).emailConfirmed === true
  );
}

/** Preserve historical rows and SMTP uncertainty; stop unconfirmed backlog before claiming work. */
export function quarantineUnconfirmedEmail(sqlite: DatabaseSync, now = new Date().toISOString()) {
  return sqlite
    .prepare(
      `UPDATE outbox_event SET failed_at=?,lease_until=NULL,last_error='EMAIL_NOT_CONFIRMED'
    WHERE delivered_at IS NULL AND failed_at IS NULL
      AND COALESCE(last_error,'') NOT LIKE 'DELIVERY_IN_PROGRESS:%'
      AND (topic IN ('notification.email.requested','invoice.issued')
        OR (topic IN ('invitation.created','invoice.email.requested','public-inquiry.received')
          AND CASE WHEN json_valid(payload_json) THEN COALESCE(json_type(payload_json,'$.emailConfirmed'),'') != 'true' ELSE 1 END))`,
    )
    .run(now);
}
