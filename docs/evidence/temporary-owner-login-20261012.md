# Temporary Owner login — 2026-10-12

User-authorized, 30-day operational exception: an additional `hans` username maps only to
Antonny Nascimento's existing `antonny.luty@j-aautomation.com` Owner account. The password
hash, immutable user ID and expiration are supplied through protected runtime configuration;
no credential value is committed. Existing local and delegated mailbox passwords are unchanged.

The standard Better Auth sign-in handler, CSRF checks, rate limiting, session creation and
live authorization remain in use. AsyncLocalStorage scopes the extra verifier to the alias
request and canonical credential hash. The alias fails closed without complete, unexpired
configuration or if the canonical active, verified Owner identity does not match. If the
Owner enables MFA, the alias is unavailable; normal MFA sign-in continues to work.

Alias sessions carry a server-appended expiration marker in their persisted user agent.
Every portal request removes expired marked sessions before any session lookup. This
preserves expiration across ordinary session renewal and removal of the runtime configuration.
The final anchored marker prevents a supplied user-agent prefix from extending access.
No database schema or existing credentials are changed.

Validation:

- 18 focused tests pass: temporary alias integration (10), existing delegated mailbox
  integration (5), existing authentication boundary checks (3).
- Includes actual Better Auth renewal, expiry after configuration removal, concurrent
  normal/alias logins, incorrect passwords, exact identity binding, spoofed marker,
  MFA handling and untrusted origin rejection.
- Portal TypeScript check and scoped ESLint pass.
- Independent read-only security review: no remaining blockers after expiry fixes.
- Existing production local Owner login and logout verified before rollout.

Runtime configuration: `JA_TEMP_OWNER_USER_ID`, `JA_TEMP_OWNER_PASSWORD_HASH`,
`JA_TEMP_OWNER_EXPIRES_AT` in `/etc/jaautomation/jaautomation.env`. Remove these three
settings and recreate the portal container to stop new alias logins early. To revoke existing
alias sessions early, delete only session rows with the server-appended `ja-temp-owner`
marker; do not revoke ordinary Owner sessions unnecessarily. Final image and rollout receipts
are retained in the VPS task workspace.
