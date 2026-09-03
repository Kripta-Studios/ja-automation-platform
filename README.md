# J&A Automation — Client Essential Production Platform

This repository contains the production-oriented J&A Automation V3 product: a browser-safe multilingual
Next.js public site and a private SvelteKit PWA portal backed by SQLite, exact-money finance and
durable billing workflows. The Client Essential specification and checklist are the primary release
authority, followed by the validated local contract (`ANEXO A` and `ANEXO D`), `UI_PLAN.md` for UX
only, and the repository instructions. The unified V3 specification is subordinate domain reference;
V3.1–V3.4 expansion is deferred roadmap.

## Current release checkpoint

As of 2026-08-28, the current worktree contains the Client Essential implementation through the
Worker statement, report/sign-off, PM projection, finance, service-actor and continuity foundations.
The release verdict remains **NOT READY**. The latest checkpoint proves the local authenticated
browser journey through steps 1–29 and the deployed public-routing assertions in step 32; the
deliberate operations gates for two successful automatic jobs-timer runs (step 30) and an encrypted
remote-copy restore drill (step 31) remain open. Formatting/lint and independent release reviews
also remain release-gate dependencies. A passing focused test, a deployable ZIP, or a live Caddy
smoke check does not by itself establish `CLIENT READY`.

The pinned Node `24.19.0` / pnpm `11.22.0` evidence recorded in the checklist includes unit
(`522`), integration (`238`), security (`98`), invariant (`1`), reporting (`4`), offline (`8`),
continuity-contract (`14`) and migration (`77`) tests, plus production builds, local backup/restore
and the 2026-08-28 browser checkpoint. These are repository/local or endpoint checks, not proof of
healthy live jobs or remote continuity. The checklist records the current evidence, open dependencies
and final DoD status:

- [Client Essential specification](J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md)
- [Client Essential checklist](J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md)
- [Project contract and UAT](J_A_Automation_Contrato_Proyecto_EVOCON_ES.html)
- [Approved UX plan](UI_PLAN.md)
- [Current execution DAG](CODEX_EXECUTION_PLAN.md)

## Applications

- `website`: public Next.js website in English, Portuguese, and Spanish.
- `apps/portal`: private SvelteKit portal for workers, project managers, finance, and owner/admin.
- `packages/database`: reviewed SQLite migrations, repositories, and disposable fixture tooling.
- `packages/money` and `packages/billing-engine`: exact money, tax, and billing-period logic.
- `deployment`: Docker, Compose, Caddy, and systemd files for Ubuntu.

## Local development

Use Node 24.19.0 and pnpm 11.22.0.

```powershell
pnpm install --frozen-lockfile
$env:JA_AUTH_SECRET = (node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
$env:JA_TENANT_ID = "local-demo-tenant"
$env:JA_DEPLOYMENT_ID = "local-development"
$env:JA_DATABASE_PATH="$PWD\packages\database\data\demo.db"
$env:JA_MIGRATIONS_PATH="$PWD\migrations"
$env:JA_DOCUMENT_ROOT="$PWD\data\documents"
pnpm demo:seed
pnpm dev:portal -- --host 127.0.0.1 --port 5174
```

The portal opens at `http://localhost:5174/j-aautomation/app/login`. The public website includes an
Employee Portal login button in the header, mobile menu and footer. The portal always uses the
Better Auth credential/passkey session flow; there is no passwordless role switch or public
registration.

A production-mode local preview keeps the jobs worker looping with the built portal, so queued PDFs
and exports do not sit in `queued` until a manual cycle:

```powershell
pnpm preview:release
```

`JA_AUTH_SECRET`, `JA_TENANT_ID` and `JA_DEPLOYMENT_ID` are required runtime configuration for the
portal's authenticated offline identity. The values above are suitable only for a disposable local
process; use unique deployment values and a separately generated secret elsewhere. If the offline
identity is not configured, the portal deliberately refuses to issue an offline identity rather than
falling back to an insecure default.

The portal exposes the three supported locale tags `en-US`, `es-ES` and `pt-BR`. Report PDF
generation uses the same three languages (the API normalizes them to `en`, `es` and `pt` internally),
so a report can be generated in a language different from the current portal language. The rendered
PDF contains the selected language's labels, dates and money formatting; the selected source snapshot
and template version remain immutable for the request.

For this disposable local database, `pnpm demo:seed` also provisions real Better Auth credential
accounts for every seeded active user. The local password is the email local-part (for example,
`antonny.luty@j-aautomation.com` uses `antonny.luty`). These credentials are development-only and
must never be reused in production.

For a fresh non-fixture database, provision the first owner account once with
`pnpm portal:bootstrap-owner`. Supply `JA_BOOTSTRAP_EMAIL` and `JA_BOOTSTRAP_NAME`; the command
prompts for the password without echoing it, requires MFA enrollment on first access, and lets the
owner invite the rest of the team from the portal.

Start the public website in another terminal:

```powershell
pnpm dev:site
```

Open `http://127.0.0.1:5173/j-aautomation/en`.

## Disposable fixture data

`pnpm demo:seed` deletes and recreates a disposable synthetic database for automated workflow,
artifact validation and local browser review. It provisions only the local Better Auth accounts
described above; it is not a production deployment mode. The seed marks synthetic clients, projects,
users, time, expenses, and invoice previews as fixture records. Planned time remains separate from
actual time. Labor and expense billing use separate streams.

Automated browser tests provision disposable credential hashes in their isolated database and sign in
through the same Better Auth endpoint as a real invited account. Fixture identities and passwords are
never production credentials.

Period reports and financial details are recalculated from the current database inputs: actual
approved minutes, effective rates, compensation/internal costs, expense treatments, milestones,
invoice/payment state, WIP, budgets and forecast data. Customer reports exclude internal economics;
finance/owner reports include the detailed calculation basis. Projects support start, optional planned
end and actual close dates; assignments support an optional end date; worker offboarding records the
optional account end date. Draft invoices are refreshable previews, while approved and issued
invoices remain immutable. Finance users can download a project XLSX with project totals, margin,
employee cost detail and expenses. Accounting Packs publish PDF, XLSX, invoice CSV and expense CSV
artifacts independently; printing a report never silently issues an invoice or bill.

The portal navigation keeps the section/view in the page heading (including Clients, Team, PLC /
Technical and Invoices). Projects shows Authorized projects before administrative edit panels. Client
contacts and other record registers use the selected record ID for add/edit/deactivate actions; finance
rules are corrected by superseding or deactivating an effective-dated rule, never by hard-deleting
financial history. Compensation statements and settlements are read-only snapshots outside Finance.
Owner/admin users can select a worker when managing the skill catalog, worker skills and availability.
Daily, technical, time and expense source records expose Print Report, and the report register reflows
when the compose panels are collapsed.

The disposable seed currently contains 18 skills, 12 enabled billing rules, 6 invoices (including an
issued invoice) and 2 compensation settlements. These are synthetic fixture records, not production
data; the focused fixture contract is `tests/integration/requested-demo-fixtures-implementation.test.ts`.

## Localized report PDFs

Invoice, period-report, Accounting Pack, Daily Field Report and PLC / Technical Report detail pages
share the localized PDF panel. Each language is an independent durable artifact with the lifecycle
`queued` → `running` → `ready` or `failed`; a failed language does not hide a ready sibling language.
Only a `ready` artifact is downloadable. Retry is offered only when the stored failure is retryable.
Accounting Pack exports keep their own per-format status, so a PDF renderer failure does not mark the
XLSX, invoice CSV, expense CSV or JSON artifact as failed.

The authenticated API is rooted at `${JA_PORTAL_BASE_PATH}/api/localized-pdf`:

| Method | Endpoint                                  | Contract                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/localized-pdf?ownerType=&ownerId=`  | Lists authorized variants (`200`, private/no-store). The query is optional; when present both values are required.                                                                                                                                                            |
| `POST` | `/api/localized-pdf`                      | Requests one owner (`invoice`, `period_report_revision`, `accounting_pack_revision`, `daily_report` or `technical_report`) and locale (`en`, `es`, `pt-BR`). Returns `202` with `Location` and `Retry-After: 2` while queued/running, or `200` for an existing ready variant. |
| `POST` | `/api/localized-pdf/{variantId}/retry`    | Creates the next fenced attempt for a retryable failure and returns `202`.                                                                                                                                                                                                    |
| `GET`  | `/api/localized-pdf/{variantId}/download` | Streams a verified private PDF with a semantic filename only after authorization, status and hash/path checks. Returns `404` for missing/unauthorized variants and `409` for not-ready, unavailable or integrity-failed artifacts.                                            |

Validation failures return `400` and an unauthenticated request returns `401`. The request body cannot
provide a snapshot, storage key or hash; those values are derived from the authorized immutable
source. The durable worker binds each render to job kind `localized_pdf_variant_render` and capability
`artifact.localized_pdf.render`, and stores attempt/fence/error metadata for recovery and audit.

Run the worker locally with the same identity and document-root variables used by the portal:

```powershell
pnpm jobs:build
node deployment/jobs-build/jobs-run.mjs --loop
# equivalent wrappers:
pnpm ops:jobs:loop
# one-shot cycle, including the build:
pnpm ops:jobs
```

The worker resolves the active deployment singleton service-actor binding, verifies the private
document root, rejects symlink/path escapes, writes atomically, and rechecks PDF magic bytes, byte
length and SHA-256 before publishing or serving a file. Provision or rotate the binding with the
production service-actor CLI; missing, disabled or drifted capability state fails closed.

## Disposable database rebuild and recovery

The local seed is intentionally destructive for the configured disposable database path. Before a
rebuild, stop the portal and jobs process and either use the tested backup tool or copy only the
explicit fixture paths to a dated recovery directory:

```powershell
$env:JA_DEMO_SEED_PRESERVE_DB = "false"
$env:JA_FIXTURE_RESET_DOCUMENTS = "true" # only for the disposable fixture document root
pnpm demo:seed
```

Set `JA_DEMO_SEED_PRESERVE_DB=true` to keep an existing fixture database. Do not run the seed against
production. For a recoverable database/files snapshot, configure `JA_BACKUP_ROOT` and run
`pnpm ops:backup`; restore only into an isolated target with `pnpm ops:restore-test` or the staged
restore procedure in [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md). The 0024 Accounting Pack
snapshot bridge is additive and deliberately performs no global backfill: historical runs remain
untouched until an explicitly scoped, command- and audit-anchored bridge is created.

## Release status

The localized portal/PDF implementation, additive migrations and the latest steps 1–29/32 browser
checkpoint are documented with focused evidence, but this file is not a production-release
certificate. The known remaining blockers are the static-quality gate, independent security/finance/
responsive/spec reviews, two successful automatic jobs-timer runs, and a separate-host encrypted
continuity upload plus isolated restore of the database and private artifacts. Do not claim `READY`
until the same reviewed snapshot satisfies the Client Essential checklist and its evidence gates.

## Quality gates

Run these from a pinned Node `24.19.0` / pnpm `11.22.0` shell. The offline suite is conditional on
the go-live connectivity decision; the browser and operations commands are release evidence, not
substitutes for the focused domain/security suites.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:reporting
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm test:offline
pnpm test:continuity
pnpm db:check
pnpm db:integrity
pnpm build
pnpm test:e2e
pnpm ops:backup:test
pnpm ops:restore-test
pnpm ops:continuity-readiness
pnpm ops:continuity-restore-drill
```

The current Client Essential browser checkpoint can be reproduced against a disposable local preview
while checking the deployed Caddy boundary (it does not change DNS, Caddy or VPS state):

```powershell
$env:JA_E2E_CADDY_BASE_URL = "https://j-aautomation.com"
pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop
```

This checkpoint currently records steps 1–29 and 32; steps 30–31 intentionally remain blocked until
the operator attaches two automatic timer runs and a real encrypted remote-restore drill. The
external `/health/live` liveness check is distinct from the public `/j-aautomation/health/ready`
readiness path, which is expected to return `404` through Caddy.

For the complete release candidate, also run the applicable migration fresh/upgrade/integrity
checks, the Client Essential browser journey, the automatic jobs timer twice, and the realistic
issued-invoice/private-artifact recovery drill. `ops:continuity-readiness` and
`ops:continuity-restore-drill` require real operator-supplied remote values outside the repository;
they must return a real `READY`/`PASS`, not a local fixture result, before CORE-17 can pass. Record
exact commands, timestamps, SHA/schema identity and artifacts in the Client Essential checklist.
Do not mark a requirement `PASS` from source inspection alone.

## Deployment

Follow [deployment/README_VPS.md](deployment/README_VPS.md). Caddy proxies the Next.js website to
`127.0.0.1:5101` and the SvelteKit portal to `127.0.0.1:5100`.

For production access, use [docs/SHOWCASE_ACCESS.md](docs/SHOWCASE_ACCESS.md) as the portal access
and first-owner runbook. It contains no passwordless or shared account procedure.

Public-site-only releases contain the `website/` source, exact workspace manifests, the site
Dockerfile and a verified standalone build. The site Dockerfile prepares a production dependency
tree with `pnpm deploy --prod --legacy` and copies it into the final image; `@swc/helpers` is direct
and is checked during the Linux container smoke test. Deploying one rebuilds and replaces only the
`site` container. It does not seed the database, migrate the portal or change Caddy.

[J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md](J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md)
for subordinate, non-conflicting domain reference only. Historical fixture notes are retained in
[docs/MVP_DEMO_STATUS.md](docs/MVP_DEMO_STATUS.md) and are not an active product access path.
