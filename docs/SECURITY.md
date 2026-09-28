# Security model

- Production users are invite-only. Sessions are cookie-based, secure in production, revocable and
  checked against active user status on protected requests.
- Password, TOTP and passkey authentication are available through Better Auth. MFA is optional for
  every role and operation: an MFA sign-in challenge is shown only to a user who voluntarily enrolled
  a factor. No finance, invoice, payment, numbering, accounting or destructive action uses step-up
  authentication.
- The local account MFA facade (`/j-aautomation/app/api/security/mfa`) owns optional enrollment,
  verification and transactional disable without a password field. Raw Better Auth MFA management
  endpoints (`enable`, `disable` and `generate-backup-codes`) are blocked so they cannot bypass the
  reviewed audit boundary; enrolled users still complete sign-in through Better Auth's native MFA
  challenge and TOTP/backup-code verification endpoints.
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

There is no passwordless showcase exception in the portal. Fixture data is used only by isolated
development and automated-test databases; those tests provision Better Auth credential hashes and
use the normal sign-in endpoint. Production starts with a one-time operator-provisioned owner account
(`pnpm portal:bootstrap-owner`), then uses single-use invitations for every additional user.
