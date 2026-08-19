# Security model

- Production users are invite-only. Sessions are cookie-based, secure in production, revocable and
  checked against active user status on protected requests.
- Password, TOTP and passkey authentication are available. Production MFA enrollment and step-up
  checks protect sensitive finance, invoice, payment, numbering and accounting actions.
- Every protected server query applies role, project membership and ownership checks. Route/UI hiding
  is not used as authorization. Workers are restricted to their own time, expenses, reports,
  documents and compensation; finance fields are removed at the repository boundary.
- IDs are UUIDs. Business numbers, invoice numbers and storage paths are never authorization IDs.
- Origin checks, rate limits, request-size limits, CSRF-relevant method/origin checks, secure headers,
  no-store finance responses and scoped service-worker caching are enabled.
- Receipt/document uploads validate MIME, size, filename, SHA-256, storage-key containment and
  private sensitivity. Downloads authorize the record and recheck path containment, byte length and
  hash before returning `private, no-store` content.
- SQLite uses foreign keys, WAL, busy timeout and explicit transactions. Jobs and outbox events use
  leases, idempotency keys, retries and auditable terminal failures.

Known deployment inputs are intentionally external: the production auth secret, WebAuthn origin/RP,
SMTP/CRM adapter, malware scanner and encrypted off-site backup credentials. Empty example values do
not bypass the server checks.

The showcase template is intentionally different: `JA_DEMO_MODE=true` exposes role buttons that
create short-lived signed demo cookies for synthetic users. It is not password authentication and it
must never be enabled for customer or production data. See [SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md)
for the safe access sheet.
