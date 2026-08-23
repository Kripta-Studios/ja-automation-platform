# J&A Automation portal access

The portal is the private workspace described by the V3 product specification. The public site links
to `/j-aautomation/app/login`, and that page always uses the real Better Auth flow: invite-only
accounts, secure cookie sessions, password sign-in, passkeys where supported, TOTP MFA and recovery
codes. The scoped UI/fixture work is not a full production-release approval; see the release gate note
below.

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

`packages/database/src/demo-seed.ts` is disposable fixture tooling only. For local review, the root
`pnpm demo:seed` command follows it with `scripts/seed-demo-credentials.ts`, which creates ordinary
Better Auth credential hashes for the active synthetic users. Their passwords are their email
local-parts. This is a local-only convenience, not a production access mode; production still uses
operator provisioning and invitations. The browser suite adds isolated credential hashes to its
temporary database and signs in through the same endpoint used by a real invited account.

The local portal and its report renderers support `en-US`, `es-ES` and `pt-BR`. The portal language
selector controls the UI, while every invoice, period, Accounting Pack, Daily Field Report and PLC /
Technical Report can independently request a PDF in any of those three languages.

### Start the local portal

From the repository root, use Node `24.19.0` and pnpm `11.22.0`:

```powershell
$env:JA_AUTH_SECRET = (node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
$env:JA_TENANT_ID = "local-demo-tenant"
$env:JA_DEPLOYMENT_ID = "local-development"
$env:JA_DATABASE_PATH = "$PWD\packages\database\data\demo.db"
$env:JA_MIGRATIONS_PATH = "$PWD\migrations"
$env:JA_DOCUMENT_ROOT = "$PWD\data\documents"
pnpm demo:seed
pnpm dev:portal -- --host 127.0.0.1 --port 5174
```

Open `http://localhost:5174/j-aautomation/app/login`. The seed creates the local-only Better Auth
credentials documented above; use the existing seeded-credential output/documentation rather than
inventing a shared account. `JA_AUTH_SECRET`, `JA_TENANT_ID` and `JA_DEPLOYMENT_ID` are required for
offline identity partitioning. The offline identity endpoint returns an explicit configuration error
when they are missing and does not use insecure tenant, deployment or HMAC fallbacks.

The seeded portal includes 18 skills, 12 enabled billing rules, 6 invoices and 2 compensation
settlements. Finance rules use create/supersede/deactivate lifecycle controls, while compensation
settlements remain immutable snapshots outside Finance. Owner/admin profile controls can target a
worker for skills and availability. Section/view headings follow the selected navigation item;
Projects places Authorized projects first; source records expose Print Report; and the report register
reflows when the report compose panels collapse.

### Localized PDF lifecycle

The portal's authenticated `/j-aautomation/app/api/localized-pdf` API stores one durable variant per
owner revision and locale. A request is `queued` or `running` until the worker publishes a verified
`ready` PDF; a render may be `failed` with an explicit retryable flag. The UI offers Download only for
`ready`, and Retry only for a retryable failure. Accounting Pack PDF/XLSX/CSV/JSON formats retain
independent status and error results.

The API accepts the five owner types `invoice`, `period_report_revision`, `accounting_pack_revision`,
`daily_report` and `technical_report`. `POST /api/localized-pdf` returns `202` with a download
`Location` and `Retry-After: 2` while work is queued/running, or `200` for an existing ready variant;
`POST /api/localized-pdf/{variantId}/retry` returns `202`. A private download returns `200` only after
authorization and storage/hash/PDF verification, `404` for missing or unauthorized IDs, and `409`
when the artifact is unavailable, not ready or fails integrity checks. Invalid input is `400` and an
unauthenticated request is `401`.

The job runner uses kind `localized_pdf_variant_render` and capability
`artifact.localized_pdf.render`. For local execution run `pnpm ops:jobs`; for the VPS the five-minute
`jaautomation-jobs.timer` invokes the same leased worker. Set `JA_JOB_ACTOR_ID` to an active
`owner_admin` or `finance_admin` service actor. The worker keeps PDFs under the private document root,
rejects path/symlink escapes and verifies magic bytes, byte length and SHA-256 before publishing.

### Rebuild or recover the disposable fixture

Stop local portal/jobs processes before rebuilding. `pnpm demo:seed` removes and recreates the
configured fixture database unless `JA_DEMO_SEED_PRESERVE_DB=true`; `JA_FIXTURE_RESET_DOCUMENTS=true`
also resets the disposable fixture document tree. Never run this against production. For a recoverable
snapshot, configure `JA_BACKUP_ROOT` and run `pnpm ops:backup`, then use the isolated restore tests or
the staged procedure in [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Migration `0024` adds an Accounting
Pack snapshot/legacy bridge without inferring or globally backfilling old runs; a legacy row is linked
only by an explicit command- and audit-anchored bridge with a scoped legal entity.

## Release gate note

The focused portal/PDF and migration-contract work is documented here, but this file is not a
production-readiness certificate. A release still requires the pinned Node `24.19.0`/pnpm `11.22.0`
gate, fresh and realistic-upgrade migration evidence, backup/restore verification, authenticated
responsive browser coverage and independent security, finance and release reviews. Resolve any red
focused test or contract review before claiming `READY`.

Do not copy fixture databases, uploads, credentials or generated financial artifacts into a release.
