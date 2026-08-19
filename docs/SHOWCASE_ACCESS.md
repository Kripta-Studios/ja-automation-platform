# J&A Automation portal access

The portal is the finished private workspace described by the V3 product specification. The public
site links to `/j-aautomation/app/login`, and that page always uses the real Better Auth flow:
invite-only accounts, secure cookie sessions, password sign-in, passkeys where supported, TOTP MFA
and recovery codes.

There is no demo button, shared account, passwordless role switch or public registration. A browser
visitor who is not authenticated can see only the sign-in surface; every protected query still checks
the authenticated role, project membership and ownership on the server.

## Production access

1. An operator provisions the first owner once with `pnpm portal:bootstrap-owner`. The command uses
   the reviewed migrations, Better Auth's password hashing and an audited `owner_admin` record. It
   never prints or stores the password in the repository.
2. The owner signs in at `https://example.invalid/j-aautomation/app/login`, enrolls MFA on first
   access and verifies a passkey when available.
3. The owner opens Projects → Team and creates a single-use invitation for each team member. The
   invitee sets a password of 12–128 characters on the activation page, then signs in normally.
4. Suspended, offboarded and archived accounts are rejected before protected portal data is loaded.

Replace `example.invalid` with the configured production origin. The portal service worker remains
scoped to `/j-aautomation/app/`, and auth tokens are never placed in localStorage, sessionStorage,
IndexedDB or URLs.

## Local and automated validation

`packages/database/src/demo-seed.ts` is disposable fixture tooling only. It creates synthetic records
for repository, billing, reporting and browser tests; it is not a deployment access mode and it does
not create a passwordless session. The browser suite adds isolated Better Auth credential hashes to
its temporary database and signs in through the same endpoint used by a real invited account.

Do not copy fixture databases, uploads, credentials or generated financial artifacts into a release.
