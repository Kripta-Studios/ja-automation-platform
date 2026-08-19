# V3 implementation progress

Last updated: 2026-08-19 (Europe/Madrid)

The revised specification, `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`, is the
authority for this implementation. The repository now contains the production application path:
browser-safe public Next.js site, private SvelteKit portal, reviewed SQLite migrations, exact-money
domain/repository logic, durable jobs, private artifacts, PWA worker workflows, deployment
artifacts, and the verification evidence recorded below.

## Runtime and safety baseline

- Required runtime: Node 24.19.0 and pnpm 11.22.0. The host used for this run has Node 25.8.1 and
  pnpm 11.22.0; the repository engine, `.nvmrc`, container images, and deployment documentation
  remain pinned to Node 24.19.0.
- Public site source is isolated in `website/`; it imports no SQLite, server repositories, private
  files, authentication secrets, or finance code.
- Money uses bigint minor units in domain/repository code and decimal strings at JSON boundaries;
  time uses integer minutes and percentages use basis points.
- Production migrations are reviewed SQL files and the runtime uses foreign keys, WAL,
  `busy_timeout`, explicit transactions, constraints, and indexes. No `drizzle-kit push` path is
  used.
- Demo seed records and uploaded test receipts are test fixtures only. They are not production
  records and are ignored by Git.
- No VPS, production database, service, credential, or remote deployment was changed in this run.

## Delivered implementation by phase

### Public website and content

- EN/PT/ES public routes, localized metadata, canonicals, hreflang, sitemap, robots, structured
  organization data, legal pages, careers, contact/support/Aquarex inquiries, responsive navigation,
  keyboard focus, reduced motion, and accessible form states.
- The public header, mobile menu, footer, and CTA surfaces include the portal entry link. The
  visible label is localized (`Employee Portal login`, `Entrar no portal da equipe`, or
  `Entrar al portal del equipo`) and points to `/j-aautomation/app/login` by default.
- Official imagery and client marks are preserved with SHA-256 provenance in
  `docs/ASSET_MANIFEST.sha256` and `website/docs/content-provenance.md`; no unverified customer,
  certification, performance, address, vacancy, or testimonial claim was added.

### Identity, authorization, and privacy

- Better Auth password sessions, invite-only activation, secure cookies, TOTP/2FA, passkeys,
  MFA-enrollment enforcement, step-up authentication, session revocation, origin checks, rate
  limiting, security headers, and private no-store responses.
- Protected server reads and writes re-check active status, role, project membership, ownership,
  and finance visibility. Route hiding is supplementary only.
- Workers receive only their own pay, time, reimbursement, budget/progress, and settlement data;
  client rates, internal costs, margin, and other workers' compensation are excluded at the
  repository/API boundary.
- The portal has a server-filtered global search/command surface for projects, clients, workers,
  invoices, PO references, reports, expenses and receipt IDs; auditors and workers receive only
  results in their authorization scope.
- Owner Admin and read-only auditors have a real append-only Audit Log view; auditors do not see
  mutation navigation or finance actions that would be rejected by the server.

### Commercial setup and operations

- Client/project numbering, contacts, assignments, schedules, skills, planning, budgets, purchase
  orders, commercial rules, effective dates, per-worker/per-project/per-category rate overrides,
  and deterministic rate precedence.
- Actual time remains independent from expected, planned, minimum, or guaranteed time. Categories
  include regular, commissioning, overtime, weekend/holiday, travel, standby, remote support,
  training, and internal work.
- Worker compensation, internal loaded cost, and client bill rate are separate streams. Overtime
  behavior is independently configurable for each stream. `PercentageOfEligibleClientLabor` uses
  explicit eligible/excluded components and settlement triggers.

### Time, reports, PLC, and expenses

- Time lifecycle: draft, submitted, approved, needs changes, locked, and billed, with optimistic
  versions, approval history, billing locks, and source traceability.
- Daily project reports, period/consolidated reports, PLC/technical reports, technical changes,
  safety/production impact, validation, open issues, artifact registers, hashes, private storage,
  and separate internal/customer-facing report outputs.
- Safety-impacting technical changes require validation/rollback detail and human review; no AI
  path can approve them automatically.
- Mobile/desktop expenses cover configured travel, meals, tolls, parking, materials, and other
  categories; worker-paid, company card/direct, client-paid, and third-party sources; reimbursable,
  marked-up, all-in, internal, direct, allowance/per-diem, and informational treatments. Private
  receipt photos/PDFs are size-, MIME-, signature-, hash-, ownership-, and path-validated.
- All-in expense affects direct cost/margin without entering the expense billing stream. Approved
  reimbursable expenses become independent billing candidates.

### Billing, invoices, finance, and accounting

- Independent labor/expense billing streams with their own cadence, tax profile, template,
  grouping, recipient, terms, currency, PO reference, and draft behavior.
- Weekly, every 14 days, semi-monthly, monthly, custom, milestone, and manual cadences are kept
  distinct. Auto-issue and auto-send remain disabled by default.
- Period-close readiness, automatic draft generation, invoice review/approval/issue/send, immutable
  issued snapshots, transaction-scoped numbering, source locks, PDF idempotency, payments,
  partial payments, overdue, void, credit, debit, and correction workflows are implemented.
- Project finance and portfolio views reconcile direct worker cost, travel/expense cost, revenue,
  approved/unapproved WIP, invoiced, collected, outstanding AR, budgets, ETC/EAC, and contribution
  margin with source drill-down. Labels use Contribution Margin / Direct Project Result rather than
  statutory Net Profit.
- Finance time-economics review and the Master Invoice / Cost / Collection Ledger connect actual
  time → approval → billability → compensation → internal cost → client revenue → billing status.
- Monthly Accounting Pack produces the invoice register, collections, worker/direct costs, expense
  register, AR, contribution, source reconciliation, and PDF/XLSX/CSV exports.

### Documents, jobs, and offline behavior

- UUID document metadata, sensitivity, safe filenames, MIME/size validation, SHA-256, private
  storage, and authorization/audit on every download for receipts, reports, invoices, PLC artifacts,
  and Accounting Pack exports.
- Leased scheduled jobs, job runs, outbox delivery leases, idempotency keys, retries/backoff,
  terminal failures, period close, reminders, report/PDF work, automatic drafts, and Accounting
  Pack generation are durable and duplicate-safe. The production runner schedules core jobs on
  each timer pass, creates missing-time notifications with privacy-safe email outbox payloads,
  and fails unknown job kinds for retry rather than marking them successful.
- Service-worker scope is exactly `/j-aautomation/app/`. It caches only static assets and the
  worker-safe shell routes for assigned project/time/report/expense work; API, finance, audit,
  payment, export, and other-worker compensation data are excluded. IndexedDB stores permitted
  worker mutations, assigned-project metadata, and receipt bytes only until successful sync.
- Offline time, daily-report, technical-report, and expense drafts are validated and created on the
  server with ownership/membership checks. Version conflicts never overwrite silently and show the
  required server-change message. Receipt upload is private, hash-addressed, and retried before
  mutation sync.

### Database, backup, and deployment

- Online SQLite backup uses Node's SQLite backup API so WAL contents are included. Restore stages
  database/files, validates integrity, foreign keys, manifest paths, and SHA-256s, then swaps into
  place.
- Ubuntu 24.04 + Caddy + Docker Compose + systemd service/timers, non-root/read-only containers,
  loopback-only app ports, health checks, disk/backup operations, job runner, rollback guidance, and
  environment templates are in `deployment/` and `docs/`. The installer targets
  `/opt/jaautomation/current`, installs/enables the jobs and backup timers, and requires host Node
  24.19.0 for the online backup service.
- The public image has no database, private-file, finance, or auth-secret mount. The portal/jobs
  images receive only the configured private volumes and environment.

## Verification log

Commands are run from the repository root. Host engine warnings are expected because the available
host is Node 25.8.1 rather than the required 24.19.0.

| Command                 | Result                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | Pass across 10 checked workspace projects                                                                                       |
| `pnpm format:check`     | Pass                                                                                                                            |
| `pnpm lint`             | Pass, zero findings                                                                                                             |
| `pnpm test:unit`        | Pass: 6 files, 12 tests                                                                                                         |
| `pnpm test:integration` | Pass: 3 files, 5 tests                                                                                                          |
| `pnpm test:invariants`  | Pass: 1 file, 1 test                                                                                                            |
| `pnpm test:security`    | Pass: 2 files, 4 tests                                                                                                          |
| `pnpm test:offline`     | Pass: 1 file, 2 tests                                                                                                           |
| `pnpm build`            | Pass: Next.js 219 generated routes and portal Vite production build                                                             |
| `pnpm jobs:build`       | Pass: bundled `deployment/jobs-build/jobs-run.mjs`                                                                              |
| `pnpm db:migrate:fresh` | Pass: fresh SQLite, WAL, foreign keys, integrity ok                                                                             |
| `pnpm db:integrity`     | Pass: integrity ok                                                                                                              |
| `pnpm db:check`         | Pass: WAL, foreign keys, and integrity ok                                                                                       |
| `pnpm ops:backup:test`  | Pass: online backup and restore test                                                                                            |
| `pnpm ops:restore-test` | Pass: safe SQLite restore verification                                                                                          |
| configured jobs smoke   | Pass: 3 durable jobs and 6 outbox deliveries, 0 failures                                                                        |
| compose config          | Pass: production Compose configuration validates                                                                                |
| `pnpm test:e2e`         | Pass: 7, skipped by design: 3 (offline desktop-only, normal worker phone-only, viewport desktop-only); public and portal checks |

The production-style Playwright server builds the site and portal before launch. The portal test
environment pins `ORIGIN=http://127.0.0.1:4174` so the same-origin CSRF/origin check is exercised
against the actual local origin. The site runner still emits Next's informational warning that
`next start` is not the standalone launcher; the production Dockerfile uses the standalone server
layout and copies `public`/`.next/static` explicitly.

## Current blockers and external inputs

The implementation is not blocked by these inputs, because each is configurable and documented:

- Production `JA_AUTH_SECRET`, WebAuthn origin/RP ID, SMTP/form recipient, signed outbox/CRM
  adapter and secret, malware-scanner integration, encrypted off-site backup target, alert
  destination, and customer recipient values.
- Accountant-approved legal entity, tax profiles, invoice numbering policy, and final currency/PO
  configuration.
- An authorized operator must apply the reviewed migrations and perform the VPS release/rollback
  procedure. This session intentionally did not access or modify a real VPS.

`docs/MVP_DEMO_STATUS.md` is retained as an archived historical note only. It is not an active
scope or completion checklist.
