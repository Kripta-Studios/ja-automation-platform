# V3 implementation progress

Last verified: 2026-08-19 (Europe/Madrid). The revised
`J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md` is authoritative. All commands below
were run from the repository root in `node:24.19.0-bookworm-slim` with pnpm `11.22.0`; host Node
version was not used for the acceptance gates.

## Phase 0 — preservation and baseline

Status: complete.

- Branch: `codex/v3-completion-20260819`.
- Recoverable preservation checkpoint: `e75c83a chore: checkpoint current V3 implementation`.
- The complete pre-existing V3 diff and legitimate untracked migrations/tests/deployment work were
  preserved. No reset, clean, discard, push, or production-host mutation was performed; later VPS
  inspection was read-only until the release archive handoff.
- Untracked presentation/contract/budget artifacts (`Presentacion_Proyecto_JA_Automation.html`,
  `J_A_Automation_Contrato_Proyecto_EVOCON_ES.html`, `J_A_Automation_Presupuesto_Proyecto_EVOCON_ES.html`,
  the EVOCON image and PDF) remain outside the implementation checkpoint and are excluded from
  staging. No database, upload, build output, `.env` credential, or secret is staged.
- Baseline and final gates use the required Docker Node runtime. `git diff --check` reports only
  Git's CRLF conversion warnings and no whitespace errors.

## Phase 1 — financial invariants and migration safety

Status: complete.

Reused and extended `packages/billing-engine`, `packages/database/src/repository.ts`,
`packages/database/src/v3-repository.ts`, and the existing source-lock/invoice engine. Capped T&M,
fixed-price/all-in allocation, hybrid included-minute/overage billing, custom cutoffs, daily
minimum top-ups, separate labor/expense taxes, percentage compensation, overtime, settlements,
partial payments, negative adjustments, immutable snapshots, source locks, and transaction-scoped
numbering are implemented.

Reviewed migrations remain contiguous and unsquashed: `0001`–`0011` plus `0012_session_step_up`,
`0013_audit_detail_fields`, `0014_commercial_billing_controls`,
`0015_user_lifecycle_mfa_policy`, `0016_better_auth_two_factor_fields`, and
`0017_better_auth_account_issuer`, plus `0018_better_auth_passkey_aaguid`. `packages/database/src/schema.ts` declares the migrated
Better Auth, commercial, reporting, finance, document, job, and offline tables and columns.

Evidence: `tests/billing-engine.test.ts`, `tests/billing.test.ts`,
`tests/integration/commercial-billing.test.ts`, `tests/integration/invoice-lifecycle.test.ts`,
`tests/integration/v3-finance.test.ts`,
`tests/integration/database.test.ts`, and `tests/invariants/invoice.test.ts`. The integration suite
includes concurrent period close and concurrent issue attempts, plus declared-schema to migrated-
SQLite column parity; populated upgrade starts with a
pre-V3 business dataset and verifies its rows survive through migration 18.

## Phase 2 — identity, authorization, documents, and audit

Status: complete.

`apps/portal/src/lib/server/auth.ts`, `apps/portal/src/hooks.server.ts`, the security routes,
`packages/database/src/repository.ts`, and `packages/database/src/v3-repository.ts` provide
invite-only Better Auth sessions, active/suspended/offboarded/archived lifecycle checks, TOTP
enrollment/verification/recovery codes, passkey registration/revocation, session-bound step-up,
origin/rate-limit checks, role/project/ownership authorization, redacted audit detail, correlation
IDs, and explicit service actors. User-wide `last_step_up_at` is no longer consulted for protected
operations; the authoritative state is `session.step_up_at`.

Private document upload/download/scan routes validate MIME, filename, size, SHA-256, safe storage
keys, sensitivity, quota and scan state. Receipts, reports, PLC artifacts, invoice PDFs and
Accounting Pack exports are authorization-checked and emit download audit events. The actual
response CSP is nonce/hash based and contains no `unsafe-inline` or `unsafe-eval`; response header
checks were run against the production-like portal image.

Evidence: `tests/security/session-step-up.test.ts`, `tests/security/repository-privacy.test.ts`,
`tests/security/audit-redaction.test.ts`, the authorization branches in both repositories, and the
Docker Better Auth rehearsal (invitation acceptance → sign-in → TOTP setup → generated-code verify,
with migration version 17 and `two_factor.verified=1`).

## Phase 3 — worker operations and economics

Status: complete.

Actual minutes remain independent from planned/expected/minimum/guaranteed minutes. Regular,
commissioning, standby, travel, overtime, training and other configured categories are kept in the
time stream. Assignment-specific compensation, internal loaded cost and client bill rate resolve
through worker/category/activity overrides. Worker Pay, settlement triggers/bases and project
progress are privacy-filtered at the repository boundary.

Worker responses contain no client rate, internal cost, margin, revenue, or another worker's pay;
privacy tests assert this structurally and by serialized response inspection. Portal forms preserve
copy-layout behavior without copying time values, support exceptions and approval states, and now
provide a weekly Mon–Sat timesheet with period navigation, category totals, difference flags and
zero-minute prior-week layout drafts. The integration suite proves copied labels/categories never
copy source minutes. Finance time-economics remains traceable from actual → approved → billable →
contractual adjustment → worker compensation → internal cost → revenue candidate → invoice state.

## Phase 4 — reports, invoices, and Accounting Pack artifacts

Status: complete.

`packages/reporting/src/exports.ts` is the single Playwright/Chromium HTML/CSS renderer used by
interactive and scheduled paths, and `packages/reporting/src/artifact-jobs.ts` is the shared job
orchestrator used by both the portal Finance action and the durable production runner. The former
handcrafted `simplePdf` path is retired. Versioned
template `2026.08.19.3` output is generated from immutable snapshots, persisted under stable
idempotent keys, SHA-256 hashed, byte-counted, and traceable to the source/template version.
Labor detailed/summary, expense, fixed/milestone, credit/adjustment, daily/period, technical/PLC,
customer/internal, closeout, and Accounting Pack artifacts use the shared service. Report snapshots
carry the selected English, Brazilian Portuguese, or Spanish locale; Finance chooses it when closing
periods, issuing invoices, or creating an Accounting Pack, while structured domain values remain
language-neutral. Reporting tests verify long multipage invoices, overflow-safe descriptions,
tax/currency rendering, locale selection, and repeat generation. Accounting exports include
reconciled PDF/XLSX/CSV registers.

The portal production package declares Playwright as an explicit runtime dependency so the
`pnpm deploy --prod` image exposes the renderer to the bundled durable runner. A fresh UID-10001
image rehearsal confirmed scheduled invoice and Accounting Pack Chromium generation.

## Phase 5 — portal architecture, responsive UX, localization

Status: complete for behavior and acceptance; incremental maintainability extraction recorded.

`apps/portal/src/lib/portal-navigation.ts` owns primary/secondary/admin/security navigation and
`portal-i18n.ts` owns EN/PT-BR/ES dictionary/DOM translation. Existing behavior in
`PortalShell.svelte` was preserved while the chrome moved to `PortalChrome.svelte`. Server actions
are now split by domain: `action-utils.ts`, `actions/operations-actions.ts`, and
`actions/billing-actions.ts`; the route action module retains the operational/project/time/expense
and finance-economics surface without a parallel implementation. Navigation, offline, security,
artifact and localization concerns were extracted incrementally; no portal rewrite or duplicate
domain data model was introduced. Worker navigation is Today/Time/Reports/Expenses/Projects with
Documents secondary. Admin exposes the specified dashboard, project/client/team/planning/time/report/
PLC/expense/approval/billing/invoice/finance/document/notification/settings/audit surfaces without
duplicate Billing/Finance groups.

The frontend-design and stop-slop reviews were applied to the existing visual system. Automated Axe
WCAG 2.2 AA checks pass on public and worker surfaces at phone and desktop. Playwright target
viewport checks cover 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900 and
1920×1080; representative worker phone, admin desktop, invoice, and public screenshots were
visually inspected. The showcase pass based on `UI_PLAN.md` adds a system-font-first modern
typography stack, midnight/teal industrial surfaces, inline SVG navigation icons with collapsed
sidebar titles, a skip-to-content path, a textured operational grid, improved search controls,
focus/active states, and a final reduced-motion override. Responsive tables, focus restoration,
keyboard controls, reduced motion and 200% zoom styles remain in the portal CSS.

## Phase 6 — public website

Status: complete.

The existing Next.js site retains its approved design/assets and now includes technology ecosystem,
delivery process, remote support, team capability, Aquarex, Careers, URL-shareable project filters,
localized EN/PT/ES routes, legal pages, structured metadata, sitemap/robots, accessible forms and
the employee portal entry. No unverified client, certification, metric or company claim was added.
The standalone image has no database/private/auth mount.

## Phase 7 — offline and automation

Status: complete.

The service worker scope is exactly `/j-aautomation/app/`; only worker-safe shell routes and static
assets are cacheable. IndexedDB stores time, daily report, technical report and expense mutations,
assigned-project metadata and receipt bytes. Sync is idempotent, attachment uploads are hash/private,
conflicts never overwrite server changes, and logout purges the user cache. The browser E2E now
proves time, daily, technical and expense/receipt offline drafts, reconnect sync, and zero remaining
mutation/attachment records.

Leased jobs/outbox use bounded retries, idempotency, failure visibility, explicit finance service
actor selection, stable artifact keys, reminders, period close, draft generation, PDF work and
Accounting Pack work. Auto-issue and auto-send remain disabled.

## Phase 8 — observability, deployment, and acceptance

Status: complete in local/test topology; real VPS deliberately untouched.

Structured JSON request/job logs include correlation and actor context. Health checks cover migration
version, SQLite integrity/WAL/foreign keys, write readiness, required private directories and disk
free space. Upload quotas, backup/restore validation, job/PDF/email failure logging and signed alert
hooks are implemented. `deployment/` contains Caddy, Compose, non-root read-only site/portal images,
systemd service/timers, installer, verification and rollback runbooks.

Validation evidence:

- `docker compose -f deployment/compose.production.yml config --quiet`: pass.
- Caddy snippet adapted and validated with the Caddy 2 container: `Valid configuration`.
- The production portal image now defaults to same-origin assets (`JA_PORTAL_ASSETS_URL` unset),
  and Caddy explicitly proxies `/j-aautomation/_app/*` to the portal. This keeps the strict
  same-origin CSP compatible with the deployed bundle without a hard-coded GEX asset origin.
- Site image rehearsal: `/j-aautomation/en` HTTP 200.
- Portal image rehearsal after installer-equivalent UID 10001 directory provisioning: live 200,
  detailed API health 200, migration 18/18, writable directories true, write-ready true.
- Disposable staged-release rehearsal passed with `ja-automation-site:audit-final3` /
  `ja-automation-portal:audit-final3`, then rollback to the prior `audit-final2` images on the same
  fresh named volume: both site HTTP 200 and portal readiness passed in each stage; all containers
  and the test volume were removed afterward.
- Seeded jobs image rehearsal with explicit finance actor and synthetic HTTPS outbox receiver:
  6 jobs completed, 6 deliveries processed, 0 final failures.
- Corrected final-image artifact rehearsal (`ja-automation-portal:v3-final`): two invoice PDF jobs,
  one Accounting Pack job and scheduled core jobs completed with 6 queued jobs and 0 artifact
  failures; the subsequent synthetic HTTPS outbox receiver accepted all 8 pending deliveries with
  0 failures. Both invoice PDF hashes and all five Accounting Pack export hashes/byte lengths
  matched their SQLite metadata. The image contains a top-level Playwright runtime link supplied
  by `apps/portal/package.json`.
- Final-image read-only container smoke on a disposable SQLite volume passed after installer-style
  private-directory provisioning: `/j-aautomation/health/ready` returned 200, detailed health showed
  migration 18/18, WAL/integrity OK, writable directories and write readiness true, and the
  same-origin portal CSS asset returned 200.
- `pnpm ops:backup:test`: pass; `pnpm ops:restore-test`: pass.

## Acceptance command results

All commands were run under Node 24.19.0/pnpm 11.22.0 unless noted.

| Gate                                                               | Result                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                   | Pass; Node 24.19.0/pnpm 11.22.0, lockfile policy verified                   |
| `pnpm typecheck`                                                   | Pass; 10 workspace projects checked                                         |
| `pnpm format:check`                                                | Pass                                                                        |
| `pnpm lint`                                                        | Pass; zero findings                                                         |
| `pnpm test:unit`                                                   | Pass; 10 files, 23 tests                                                    |
| `pnpm test:integration`                                            | Pass; 5 files, 10 tests                                                     |
| `pnpm test:invariants`                                             | Pass; 1 file, 1 test                                                        |
| `pnpm test:security`                                               | Pass; 4 files, 8 tests                                                      |
| `pnpm test:offline`                                                | Pass; 1 file, 2 tests                                                       |
| `pnpm test:reporting` with `JA_CHROMIUM_PATH=/usr/bin/chromium`    | Pass; 1 file, 3 tests (EN/PT-BR/ES locale coverage)                         |
| `pnpm build`                                                       | Pass; Next.js 219 generated routes and portal production build              |
| `pnpm jobs:build`                                                  | Pass; durable runner bundle                                                 |
| `pnpm db:migrate:fresh && pnpm db:integrity && pnpm db:check`      | Pass; WAL, FK, integrity and migration 18                                   |
| populated migration upgrade (`tests/integration/database.test.ts`) | Pass; business rows preserved through 18                                    |
| full Playwright E2E with Chromium                                  | Pass; 16 tests, 13 passed, 3 intentional scope skips                        |
| Axe accessibility E2E                                              | Pass; 4 tests (phone/desktop public + portal)                               |
| final-image visual QA                                              | Pass; styled weekly timesheet at 390×844 and 1440×900; no document overflow |
| backup/restore drills                                              | Pass                                                                        |
| staged deploy/rollback rehearsal                                   | Pass; final3 release and final2 rollback both healthy                       |

The three E2E skips are intentional viewport/role scope guards (desktop-only offline flow,
phone-only worker mutation flow, and desktop-only public viewport matrix); no required behavior is
hidden behind a skip.

## Showcase seed and handoff — 2026-08-19

Status: showcase implementation complete; local validation complete; VPS service deployment remains
an operator/coding-agent action. The authority specification was not modified.

- `packages/database/src/demo-seed.ts` now creates Antonny Nascimento as the owner admin at
  `antonny.luty@j-aautomation.com`, six active users, three workers, three clients, six contacts,
  four projects, schedules, skills, availability and assignments.
- The seed exercises actual/pending time, daily and technical reports, approved/submitted technical
  changes, approved/submitted milestones, client/worker/internal rates, 11 approved expenses and 11
  valid synthetic PDF receipts covering hotel, airfare/ticket, rental car, fuel, ground transport,
  meals, per diem, tolls, tools and materials.
- The seed creates separate labor, expense and milestone draft invoice streams, closes labor and
  expense billing periods, creates period reports, an Accounting Pack draft and a project closeout
  draft. Auto-issue and auto-send remain disabled.
- `CI=true pnpm demo:seed` passed under Node `24.19.0` / pnpm `11.22.0`; the seed output reported
  3 clients, 4 projects, 6 users, 3 workers, 11 expenses, 11 documents, 3 invoice drafts, 4
  period reports and 1 Accounting Pack. `pdfinfo` validated the 11 one-page synthetic receipts.
- The supplied logo is preserved byte-for-byte at `packages/reporting/assets/logo-jaautomation.png`
  with SHA-256
  `26ede6564559b55c08f3f24fc061e58f18179085460428c9ef0205243cf91b57`. The shared PDF renderer
  embeds it in invoice, period-report and Accounting Pack headers. A rendered invoice PDF was
  visually inspected after `pdftoppm`; header, logo, totals and pagination were legible.
- UI/UX showcase polish was verified in the generated Playwright screenshots: desktop owner
  dashboard, phone worker workspace, and branded invoice preview render without clipping or
  horizontal overflow. The portal production build and full E2E suite passed after the owner
  button assertion was updated to require `Owner admin · Antonny`.
- `pnpm test:reporting`: pass; 1 file, 3 tests. `pnpm --filter @ja/database typecheck`: pass.
  `pnpm format:check`: pass after formatting the previously non-conforming portal stylesheet and
  document template whitespace; `.prettierignore` explicitly preserves the supplied UI plan and
  non-source checksum/environment example artifacts.
- An initial local seed attempt under host Node `25.8.1` failed the repository engine gate and
  pnpm's non-interactive module-purge prompt. It was corrected by using the required portable Node
  `24.19.0` runtime with `CI=true`; the correction and successful rerun are recorded here.
- Read-only VPS checks passed: `ssh kripta hostname` returned `options-greek-plotting-vm1` and the
  host was confirmed to have an existing legacy `/opt/j-aautomation` service path. The current
  user has no passwordless sudo, so no VPS service, database or Caddy configuration was changed in
  this session. Commit `85df390` was pushed to `origin/main`. `git archive` produced
  `.tmp/ja-automation-v3-showcase-20260819.zip` (13,467,236 bytes), SHA-256
  `6c418b9701e77702cc581d565422c54cac7cfcb4041d9bd92c6b4fb51872f833`; `scp` uploaded it to
  `/home/kripta/ja-automation-v3-showcase-20260819.zip`, and `ssh kripta sha256sum` returned the
  same hash. VPS service deployment remains pending the documented coding-agent run with sudo.

## Schema, legacy, and external prerequisites

- Declared Drizzle schema, repositories, documentation and reviewed SQL migrations agree through
  migration 18. No migration was squashed or renumbered.
- Report language selection is persisted in immutable invoice, period-report, and Accounting Pack
  snapshots, so no schema migration is needed for this language-neutral structured-data extension.
- `simplePdf` and the duplicate portal/job artifact implementation were retired/consolidated behind
  `packages/reporting/src/artifact-jobs.ts`; the shared handler contract has a focused unit test.
- `docs/MVP_DEMO_STATUS.md` is retained as a compatibility pointer to the disposable fixture boundary.
  Obsolete .NET/PostgreSQL code was not exhaustively traversed because the revised specification does
  not require it.
- Software-verifiable requirements have no known implementation blocker. External configuration still
  required before a real release is customer-specific: production `JA_AUTH_SECRET`, WebAuthn/DNS,
  SMTP/outbox/alert/malware-scanner endpoints, encrypted off-site backup target, accountant-approved
  legal entity/tax/numbering/retention values, final recipients and explicit VPS authorization.
  Synthetic/test configuration proves each mechanism; no VPS service, database or Caddy
  configuration was changed during this session.

## Definition-of-done evidence

The 42-step normative scenario is mapped in `docs/V3_DOD_EVIDENCE.md`; repository integration,
security, artifact, offline and E2E tests provide the executable evidence. Remaining external items
are configuration approvals only, not code-implementable TODOs.

## Finished portal access hardening — 2026-08-19

Status: the portal access surface is now production-only and invitation-based. The public website's
Employee Portal links resolve to the real Better Auth sign-in page; no demo button, shared account,
passwordless role switch or auth bypass remains in the runtime path.

- Replaced the showcase role/passwordless controls with a polished credential/passkey sign-in page
  that gives generic failure responses, rate-limit feedback, invitation-only guidance and a safe
  MFA redirect. Login sessions remain server-side cookie sessions; browser storage is not used for
  bearer credentials.
- Removed the demo session signer and `/app/demo-login` endpoint. Protected requests always resolve
  the Better Auth session and then load the active user before repository authorization runs.
- Added the operator-only `portal:bootstrap-owner` flow. It hashes a 12–128 character password with
  Better Auth, creates an audited `owner_admin` in one transaction, marks MFA enrollment required,
  and never prints or commits the password. Additional users enter through single-use invitations.
- Added reviewed migration `0018_better_auth_passkey_aaguid.sql` and explicit Better Auth passkey
  field mappings for the snake_case SQLite schema. This removed the passkey list 500s found during
  the first real credential smoke test and keeps passkey registration/management compatible with
  production data.
- Browser fixtures now create temporary Better Auth credential hashes in their isolated database;
  fixture seed data no longer enables any portal authentication mode. Documentation and Compose
  examples describe fixture tooling only as non-production validation.

## Verification — 2026-08-19

All commands below were run with Node `24.19.0` and pnpm `11.22.0`.

| Command                          | Result                                                 |
| -------------------------------- | ------------------------------------------------------ |
| `pnpm format:check`              | Pass                                                   |
| `pnpm typecheck`                 | Pass; 10 workspace projects                            |
| `pnpm test:integration`          | Pass; 5 files, 10 tests, including migration 18/parity |
| `pnpm --filter @ja/portal build` | Pass; production SvelteKit build                       |
| `pnpm test:e2e`                  | Pass; 13 passed, 3 intentional viewport/role skips     |

The first E2E run exposed `no such column: passkey.userId` from the unaligned adapter. That blocker
was resolved by the reviewed passkey mappings and migration above; the targeted smoke test then
passed on both 390px mobile and desktop with no browser 4xx/5xx errors. No VPS service, production
database or external credentials were changed in this session.

## Portal interaction and account-menu follow-up — 2026-08-19

Status: implemented locally against the lightweight V3 specification; no production data or VPS
service was changed.

- Restored the official red/black/white logo presentation by removing the white-only CSS filter,
  removed the unexplained login ambient red circle, improved login copy line separation, and made
  the left navigation independently scrollable. Form grids/selects now use zero-minimum tracks and
  ellipsis-safe controls so long selected options cannot overlap adjacent inputs.
- Replaced the header user link with an accessible account menu containing Profile & security,
  Notifications, My Pay, My documents and Log out. Added a focused E2E assertion for the menu.
- Added authorized search recommendations for empty and typed searches. Sensitive entities remain
  excluded for workers, and result links now open the relevant project, invoice, report or expense
  source record.
- Added complete time, expense, report and notification detail routes. Report records are now
  editable by the worker/authorized manager/owner roles subject to version and finalization checks;
  only the owner can delete an eligible report. Updates reset submitted/approved reports to
  `needs_changes`, write before/after audit data, notify active owner/admin/project-manager
  recipients, and display changed fields in the inbox and report detail history.
- Added project/report/expense/approval/period-register links, a reviewed-period report generator,
  and an explanatory weekly-timesheet legend. The fixture now contains a populated current week
  with approved, submitted and categorized actual time plus a modified daily report notification.
- Reporting remains backed by the existing shared company-logo PDF/XLSX/CSV artifact pipeline;
  invoice issue/send and other automatic financial actions remain disabled.

Validation in this follow-up (host Node `25.8.1`, pnpm `11.22.0`; the required Node `24.19.0`
runtime was not installed, so pnpm emitted the repository engine warning):

- `pnpm typecheck`: pass; all 10 checked workspace projects.
- `pnpm format:check`: pass.
- `pnpm --filter @ja/database typecheck`: pass.
- `pnpm --filter @ja/portal typecheck`: pass.
- `pnpm --filter @ja/portal build`: pass.
- `pnpm lint`: pass.
- `pnpm test:unit`: pass, 10 files / 23 tests.
- `pnpm test:integration`: pass, 5 files / 10 tests.
- `pnpm test:reporting`: pass, 1 file / 3 tests.
- Isolated `pnpm demo:seed` with a temporary database/document root: pass; 19 time entries,
  3 daily reports, 1 technical report, 4 period reports and 1 Accounting Pack.
- Initial full E2E exposed an 11px phone timesheet overflow; the mobile grid/scroll containment
  fix was applied. The post-fix full E2E passed with 14 tests and 4 intentional viewport/role
  skips, including the new desktop account-menu assertion.
- `git diff --check`: pass. Generated QA databases/documents were kept outside the repository.

## Dynamic financial reporting and lifecycle follow-up — 2026-08-19

Status: implemented and locally validated; the authority specification remains unchanged.

- Period-report snapshots now recalculate commercial and internal values from current source rows:
  actual/approved/billable minutes, effective client labor rates, worker compensation and internal
  cost rules, daily minimum adjustments, reimbursable expenses and markups, eligible milestones,
  invoice/payment totals, receivable, approved/unapproved WIP, budgets and forecast values.
  Customer snapshots remain free of internal costs, client rates and margin detail; internal snapshots
  retain the finance economics and source counts.
- Added a period-report detail route with calculation basis, drill-down links to source records,
  internal economics for authorized roles, PDF readiness and a finance-authorized recalculation action.
  Period-report PDFs now include calculated metrics, commercial lines, source counts and the company
  logo; template version is `2026.08.19.4`. Refreshing a snapshot clears stale PDF metadata before
  the replacement artifact is generated.
- Draft invoices are refreshable previews: a new draft build can rebuild a still-draft invoice from
  newly approved source data. Approved and issued invoices remain immutable. Labor, expense and
  milestone streams remain independent.
- Lifecycle UI and data semantics are explicit: projects expose start, optional planned end and
  actual close dates; project assignments expose required start and optional end dates; worker
  accounts expose the creation date as the start marker and offboarding as the optional end marker.
- Updated the architecture, README and VPS handoff documentation. Deployment packaging intentionally
  includes `website/`, `apps/portal/`, reviewed packages/migrations and demo-seed source, while
  excluding databases, uploads, generated output and secrets. The release ZIP is to be transferred
  to `/home/kripta/` and verified before extraction.

Validation on the available host (Node `25.8.1`, pnpm `11.22.0`; repository requires Node
`24.19.0`, so pnpm emitted the engine warning):

- `pnpm format:check`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass; all 10 workspace projects.
- Unit: 10 files / 23 tests passed.
- Integration: 5 files / 10 tests passed, including dynamic report totals and stale-PDF
  invalidation coverage.
- Invariants: 1 file / 1 test passed.
- Security: 4 files / 8 tests passed.
- Offline: 1 file / 2 tests passed.
- Reporting: 1 file / 3 tests passed.
- `pnpm build`: pass for the website and portal; `pnpm jobs:build`: pass.
- Full Playwright E2E: 18 tests, 14 passed and 4 intentional viewport/role skips.
- `git diff --check`: pass. The authority specification was not changed.
