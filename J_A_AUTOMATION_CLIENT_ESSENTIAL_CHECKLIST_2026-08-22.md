# J&A Automation — Client Essential Production Checklist

**Date:** 2026-08-22  
**Scope:** Only release blockers for the client-complete production system.

**Client validation update:** 2026-08-24
The requirements clarified directly with J&A on 2026-08-24 are release-authoritative. Existing PASS/PARTIAL evidence must be revalidated where these clarifications materially change the behavior; no prior PASS may be assumed to prove a newly clarified rule.

## Current candidate policy update — 2026-09-06

The Owner/requester's formal implementation decision supersedes the older internal step-up design
and the older mandatory-MFA clause for this delivery:
MFA is optional for every user and operation, and the application has no step-up authentication.
Authorization continues to rely on an active session, role and object scope, CSRF/session controls,
idempotency and append-only audit. Historical schema columns and older evidence prose are retained
only for additive migration/history compatibility and are not active authentication gates. This
decision was explicitly confirmed on 2026-09-06 and is no longer an acceptance blocker.

**Frozen and deployed application candidate:** `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`.
Format, lint, 10 project typechecks, unit 128/848, security 32/189, integration 52/390,
migrations 11/85, reporting 1/7, invariants 1/1, offline 3/8, local continuity 1/16, all
workspace builds, the 24-case role/viewport accessibility matrix, the 10-pass cross-role journey
and the manual capture pass all pass. The strict 32-step journey now passes 32/32 using fresh,
identity-bound production evidence: two automatic cycles, verified local pre-deploy backup and
rollback with the Owner's separate-host waiver, and the deployed Caddy boundary. The exact candidate
is live and healthy. Authorized authenticated production smoke also passes for the designated Owner
and Worker, including confidential-route denial and an audited TEST/SYNTHETIC workflow cleanup. The
supplied issuer/currency/rounding/series/remittance/RBAC decisions are recorded. The honest state is
`TECHNICALLY_VERIFIED_AWAITING_OWNER` because verified tax identity/profiles, express DPA/retention
approval and formal signer/human acceptance remain pending.
Read-only production inventory identifies Hetzner/Falkenstein, Germany (EEE), local database/private
storage/backups and self-hosted Stalwart on the same VPS; remote backup is disabled and no external
analytics/monitoring/object-storage/payment/mail SDK was found. This narrows the DPA inventory but
does not fabricate legal approval or authorized US/BR transfer decisions.
See `docs/evidence/client-ready-20260906/RUN_REPORT.md`.

## Legend

- ✅ Implemented/proven enough for this reduced release scope.
- 🟨 Substantially present but needs integration/QA or a bounded fix.
- ⬜ Essential release blocker still to complete.
- ⏭ Deferred from client-essential release.
- ❓ Conditional: required only if J&A confirms the operational need.

Audit classifications used below: `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `CONDITIONAL`, `DEFERRED`. `PASS` requires executable evidence, not code presence.

## Candidate qualification update — 2026-09-04

**Verdict: BLOCKED — not `CLIENT READY`, solely pending the remaining human/external ANEXO D
acceptance: authoritative DKIM/PTR and external send/receive validation, localized content approval,
the Owner role/project-assignment smoke, and responsible approver signatures.** The
application-to-Stalwart path is proven in production: a real contact submission returned HTTP `202`,
Stalwart accepted the message through authenticated STARTTLS Submission on port `587`, the durable
inquiry/outbox state became `delivered`, and the designated operator confirmed that the acceptance
message reached the agreed `migration-test@j-aautomation.com` mailbox in **Inbox**, not Junk. The
reviewed application release was committed, published and deployed on 2026-09-04 from branch
`codex/v3-production-completion-orchestrated-20260819` at commit
`8d02bd5e32032e26895d3f5a5260620e3935ba6d`; migration
`0035_stalwart_mail_integration.sql` remains latest. The active immutable release, Caddy routing,
production database, Stalwart integration and automatic jobs were verified on the VPS. The subsequent
acceptance-contract correction records the Owner's explicit separate-host continuity waiver without
weakening the mandatory local backup and rollback safeguards.

Pinned Node was `v24.19.0`, Corepack pnpm `11.22.0`; every repository gate used the pinned runtime and
`corepack pnpm --config.verify-deps-before-run=warn`. The reviewed deployer performed the authorized
production backup, image build, additive migration, atomic activation, unit installation and health
checks. It did not alter Stalwart data, accounts, passwords, hashes or DNS. The final release also
reconciles durable localized-PDF jobs that exhausted all retries so their UI state becomes truthfully
`failed` and retryable instead of remaining `running`; two historical production variants were recovered
with immutable attempt evidence. Post-cleanup free disk was 42 GiB while the active images and immediate
rollback pair remained retained.

| Gate                           | Result                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Format, lint, typecheck        | **PASS** — final post-remediation rerun; 10 workspace typechecks.                                                     |
| Unit                           | **PASS** — final post-remediation rerun; 122 files / 725 tests.                                                       |
| Integration                    | **PASS** — final post-remediation rerun; 52 files / 370 tests.                                                        |
| Security                       | **PASS** — final post-remediation rerun; 29 files / 177 tests.                                                        |
| Migrations                     | **PASS** — 11 files / 84 tests.                                                                                       |
| Reporting, invariants, offline | **PASS** — 1/5, 1/1, and 3/8 respectively.                                                                            |
| Continuity local drill         | **PASS** — 1 file / 16 tests; does not prove remote restore.                                                          |
| Site, Portal, jobs builds      | **PASS** — Site generated 255 pages; Portal used disposable environment paths; jobs bundle built.                     |
| Client Essential 32-step       | **PASS** — 32/32 with fresh, identity-bound production evidence; Owner waiver is explicit and fail-closed.            |
| 360/390/768/1440 matrix        | **PASS** — 20/20 role/viewport combinations.                                                                          |
| Production form/mail adapter   | **PASS** — authenticated STARTTLS Submission, durable delivery and human-confirmed Inbox placement; 11 focused tests. |

The journey now consumes the protected production evidence file and passes all 32 steps. Step 30 is
backed by two distinct automatic `jobs.cycle` records with zero failures. Step 31 accepts either complete
separate-host continuity or a strict Owner waiver that also proves a successful local backup and retained
rollback images; missing or informal waiver data still fails closed. The protected redacted evidence
is `/var/log/jaautomation-client-ready-mail-evidence.json` (`root:root`, mode `0600`). End-recipient
mailbox confirmation is now proven; the remaining external DNS/mail checks and customer/ANEXO D UAT
remain unproven, so the overall verdict cannot be marked `PASS`. See
`docs/CLIENT_READY_EVIDENCE_20260903.md` for commands and redacted details.
The current redacted acceptance evidence is
`/var/log/jaautomation-client-ready-mail-acceptance-20260904.json` (`root:root`, mode `0600`). The
post-deployment localized-PDF recovery and container-cleanup evidence is
`/var/log/jaautomation-client-ready-pdf-recovery-20260904.json` (`root:root`, mode `0600`).
redacted DKIM/DNS preflight is `/var/log/jaautomation-dkim-preflight-20260904.json` (`root:root`,
mode `0600`): Stalwart reports automatic DKIM management with RSA-SHA256 and Ed25519-SHA256 and the
configured selector template, while the least-privilege portal key correctly receives `forbidden`
when attempting to enumerate DKIM-signature objects. This proves the domain configuration without
expanding portal authority; it does not prove the generated selector TXT or an externally received
DKIM signature. The ready-to-sign human acceptance record is `docs/ANEXO_D_UAT_20260904.md`.

## Repository-grounded audit snapshot — 2026-09-01 (historical; not revalidated above)

**Current audit verdict: NOT READY pending final independent review and external acceptance.** The current
candidate closes the previously reproducible local product defects: the normal Finance flow assigns a
canonical legal-entity revision before invoice issue, the Accounting Pack HTTP action accepts the browser
payload without weakening its fail-closed step-up rules, and the Client Essential browser journey completes
steps **1–29** on a fresh disposable SQLite database. Steps **30–32** fail only with explicit missing-evidence
messages for two automatic production job cycles, a natural scheduled backup/isolated restore, and the
deployed Caddy origin. These are not replaced with mocks.

Fresh pinned Node `24.19.0` evidence for this candidate supersedes older counts in the historical checkpoints
below: format and lint PASS; all **10** workspace typechecks PASS; unit/regression **113 files / 660 tests**,
integration **48 / 329**, security **25 / 150**, migrations **11 / 84**, reporting **1 / 5**, invariants
**1 / 1**, offline regression **3 / 8** and continuity **1 / 16** all PASS. Local backup and restore drills,
database `foreign_keys=1`/`integrity=ok`, Site (**255 routes**), Portal and jobs production builds, Compose,
deployer and operations tests also PASS. The final 20-combination responsive matrix and independent finance,
security, browser and specification reviews are being frozen against this exact tree before the local statuses
below can be promoted.

**Offline/PWA decision (J&A, 2026-09-01):** offline capture is not a go-live requirement for Client
Essential. Existing offline code remains protected by regression tests, but implementation expansion is
deferred post-go-live and does not control the release verdict.

| Requirement                           | Status       | Current evidence and exact next dependency                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE-01 Authentication/users/roles    | PASS (local) | Generic WebAuthn failure responses, real P-256 valid/invalid assertions, active-user preflight before every MFA/passkey mutation, inactive-user no-session/no-cookie and mutation compensation pass the current **25/144** security gate; independent security review returned APPROVED. Final release rerun still applies after integration freeze.                                                                                   |
| CORE-02 Clients/projects/assignments  | PASS         | Identifiers, lifecycle, effective assignments and additive migration preservation pass; steps 2–3 and 6 plus artifact-lifecycle browser tests cover create/edit/archive/restore without fabricating legacy values.                                                                                                                                                                                                                     |
| CORE-03 Commercial rules              | PASS         | Exact effective rates, reference minutes, independent minimum billing, overtime, Travel and separate Labor/Expense tax streams pass integration and steps 4–10.                                                                                                                                                                                                                                                                        |
| CORE-04 Time/timesheets               | PASS         | Actual Work/Commissioning, Travel and Standby, submission/approval/locking and immutable correction pass transaction tests and browser step 12, including phone cards.                                                                                                                                                                                                                                                                 |
| CORE-05 Worker compensation/privacy   | PARTIAL      | The local authenticated Worker Statement lifecycle now proves PDF/CSV, truthful independent states, service-actor processing, private semantic downloads, persisted hash/length/bytes, other-Worker 404, PM/Finance/Owner denial under the current own-only policy, and per-format failure/retry. Automatic deployed execution remains dependent on CORE-16.                                                                           |
| CORE-06 Expenses/receipts             | PASS         | Operational-only Worker expense/receipt intake, separate reimbursement/recovery and Finance classification pass steps 16, 20 and 21 plus private-artifact security coverage.                                                                                                                                                                                                                                                           |
| CORE-07 Daily/PLC technical reports   | PASS (local) | The authenticated replacement-report journey now completes queued → running → ready, real PDF download, persisted hash/length/private storage key, locale/version refresh, failure/retry recovery and zero remaining failed jobs. Deployed automatic processing remains under CORE-16.                                                                                                                                                 |
| CORE-08 Approval workflow             | PASS (local) | The complete Customer Sign-off journey binds exact snapshot version/hash, records conformity, invalidates it after source change, generates and approves a replacement, records a new conformity and preserves cross-project/privacy denials. Final frozen-candidate rerun remains required.                                                                                                                                           |
| CORE-09 Project finance/profitability | PARTIAL      | Canonical source hashes, exact source identities, point-in-time entity checks, settlement linkage, exact-money reads and stronger producer/payment evidence pass **7/69** focused tests on Node 24. Independent finance-integrity review of this exact tree is still in progress.                                                                                                                                                      |
| CORE-10 Billing periods/drafts        | PASS (local) | The UI renders `[data-issue-blocker]`, reason and report-specific `Open sign-off`; the authenticated journey proves no partial writes before conformity, real issue after a valid signature, re-block after invalidation and real issue after replacement conformity. CORE-16 remains separate.                                                                                                                                        |
| CORE-11 Invoice rendering/corrections | PARTIAL      | Issued snapshot/PDF immutability, correction lifecycle and Accounting Pack rejection of draft/void/cross-scope sources are implemented and focused tests pass; final finance review and full integration rerun remain.                                                                                                                                                                                                                 |
| CORE-12 Payments/ledger               | PARTIAL      | Exact payment/reversal causality, ownership, provenance and mobile reconciliation pass focused tests; final finance review and a green frozen-candidate UI/integration matrix remain.                                                                                                                                                                                                                                                  |
| CORE-13 Essential reports/exports     | PARTIAL      | Customer Report and Worker Statement local lifecycles pass; Accounting Pack still awaits independent finance approval and all three artifact families require the frozen-candidate final gate.                                                                                                                                                                                                                                         |
| CORE-14 Responsive/accessibility      | PARTIAL      | Contrast/input/i18n/toast remediations compile and UI regressions pass **6/37**. The fresh 360/390/768/1440 browser matrix is **93 pass / 10 intentional skips / 9 fail** in three repeated contracts; fixes and an integrated axe/keyboard/overflow rerun are active.                                                                                                                                                                 |
| CORE-15 Private files/security/audit  | PASS (local) | Current private artifact, IDOR, origin, audit and inactive-user coverage passes **25/144**, including Worker/PM/Finance/Owner/inactive boundaries; independent security review returned APPROVED. Final release rerun remains mandatory after candidate freeze.                                                                                                                                                                        |
| CORE-16 Durable jobs                  | BLOCKED      | Durable queued/running/ready/failed/retry semantics, deployment-scoped service-actor code and no normal-user processing path have focused evidence. This worktree now starts an always-on looping Compose jobs worker with the portal (`--loop`, default stack, `restart: unless-stopped`); `jaautomation-jobs.timer` is only a watchdog. Privileged VPS diagnosis and two consecutive automatic `jobs.cycle` records remain required. |
| CORE-17 Deployment/health/backup      | BLOCKED      | Pinned Node 24 typecheck/build, continuity **16/16**, local backup/restore and issued/private-artifact drills pass. The Owner waived separate-host continuity as a nonblocking post-release improvement on 2026-09-04; local backup/rollback remain mandatory. Final deployment plus live Caddy/form/email evidence still require production verification.                                                                             |
| Offline/PWA                           | DEFERRED     | J&A confirmed on 2026-09-01 that offline capture is not required for Client Essential go-live. Existing code remains covered as a non-blocking regression; expansion moves post-go-live.                                                                                                                                                                                                                                               |
| V3.1–V3.4 expansion                   | DEFERRED     | Industrial platform, generic ERP/business, broad integrations and ML/data-readiness remain post-core roadmap and do not control `CLIENT READY`.                                                                                                                                                                                                                                                                                        |

### Integration checkpoint — 2026-08-31

- Current pinned-runtime gates: integration **41/272**, unit/regression **106/595**, security
  **24/123**, migrations **11/81**, supporting coverage **8/36**, lint, formatting, full workspace
  typecheck, local recovery and Site/Portal/jobs builds all pass.
- Durable Worker Statement request/job/artifact/download behavior and deployment-scoped service actor
  namespace migration `0033` are integrated. Source-cut and summary/detail reconciliation defects are
  remediated; authenticated download proof and independent review remain.
- UI_PLAN is closed for the local candidate: client/team directories, project drawer,
  mobile 4+More navigation, toast region, semantic invoice preview states, phone finance forms and
  tablet containment, phone timesheet cards, tablet drawer and Team actual-hour projection. Focused
  i18n/UI regression passes **5 files / 43 tests** plus the catalog residue guard **12/12**. After adding regressions
  for the shipped internal-cost schema and non-monetary source links, the seed creates its authoritative
  canonical Accounting Pack. The dedicated current-tree browser journey passes **8/8** across
  360/390/430/768/1024/1280/1440/1920 with axe, strict application-console, search/Enter, ES locale,
  Team privacy and no-overflow assertions; the required 360/390/768/1440 matrix is included.
- Finance remediation checkpoint: Accounting Pack revisions/artifacts, reversals, payments/ledger and
  Worker Statements pass **6 files / 45 tests**; migration `0034` and the full migration suite pass
  **11 files / 81 tests**. Overlapping source cuts now use period-scoped semantic evidence while
  preserving existing legacy evidence identities, and semantic collisions fail as domain conflicts
  before SQLite insertion.
- The two defects from the prior independent security review are remediated and the current security
  gate passes **24 files / 123 tests**; the prior independent security review approved the remediated
  origin/private-artifact boundary and the current authenticated browser journey passes.
- Updated UI remediation adds phone timesheet cards, the 768px drawer contract, Team planned/actual
  separation, explicit production origins and natural translations for newly exposed labels. Runtime
  search/toast/invoice-preview, role, axe, console, Team privacy and responsive evidence now pass.
  Required 360/390/768/1440 evidence remains the release matrix; extra widths are risk-based smoke
  checks, not separate release products.
- External/operational acceptance remains open: healthy jobs service with two consecutive automatic
  timer executions, encrypted copy and isolated restore on a separate host, real website/email/DNS
  evidence, and signed ANEXO D UAT acceptance.

### Wave 0 evidence

- Authority graph retargeted across root/nested instructions, prompts, orchestration gates, agent/skill routing, historical RTM semantics and release scripts.
- Migration contract repaired mechanically to bind the current shipped SQL bytes for `0019`–`0024`; `b5-migration-contract`, populated upgrade/rollback, adversarial migration, lifecycle and effective-membership suites: **4 files / 32 tests PASS**.
- Exact-money/billing smoke: **11 tests PASS**; reporting/i18n smoke: **14 tests PASS**; policy/offline isolation smoke: **9 tests PASS**; generic backup and restore tests PASS. These are partial evidence only, not release acceptance.
- Dedicated step-up throttling and finance-export HTTP boundary regression: **8 focused HTTP/session tests PASS**. Public website lint, typecheck and production build also PASS (host Node 25 warning remains; release evidence must be repeated on pinned Node 24.19.0).
- Accounting Pack artifact lifecycle: **5 integration tests PASS**, including five-attempt dead-letter behavior, linked job-run fencing, idempotent ready outputs and independent PDF failure without loss of XLSX/CSV/JSON outputs.
- Essential repository authorization/privacy: **2 files / 8 tests PASS** for worker/PM DTO redaction, current and object-date assignment enforcement, technical `reportDate` checks and same-project receipts in normal/offline creation. Database package typecheck PASS.
- Controlled invoice/domain and operational correction integration: **6 files / 16 tests PASS** for the five renderer families, exact controlled selectors, stream defaults, credit adjustment, expense editing projections and immutable approved reports with audited correction drafts.
- Scanner fencing/security: **6 files / 25 tests PASS** for exact job/run/fence/binding/capability proof, provider checks, quarantine/download behavior, audit redaction and a fail-closed human HTTP route. Full workspace typecheck PASS on the host runtime.
- Localized-PDF authorization: **4 focused suites / 33 tests PASS** for current and source-date assignment rechecks across request/list/retry/download, stale/forged principal denial, technical `report_date` enforcement and durable localized-artifact regressions.
- Client Essential projection firewall (2026-08-24): **4 files / 14 tests PASS** plus database/reporting/portal typechecks and packet-level security/privacy approval. Customer period-report snapshots/PDFs are allowlisted to hours and activity with zero money; legacy/localized variants require an exact current safe snapshot-hash binding; Worker and PM repository DTOs omit Finance-only project/expense fields server-side. The current worktree adds PM approval/document allowlists and requires a fresh independent review; this does not by itself complete CORE-05/07/13 browser and sign-off requirements.
- WP-03 canonical commercial-authority integration (2026-08-24): combined post-remediation selection **7 files / 45 tests PASS** plus database typecheck. Canonical project/legal-entity assignment, legacy Accounting Pack bridging, operational-only Worker/PM expense intake and Finance/Admin-only commercial classification are wired without duplicate authority. Classification now rejects invoiced or billing-locked expenses and invalidates stale billing/project-currency/tax/FX projections instead of presenting mismatched financial truth. Immutable Accounting Pack writes require a current human Finance/Owner step-up whose proof is persisted and bound into the idempotent command payload. Independent finance re-review remains the acceptance dependency.
- WP-04 customer conformity and billing gate (2026-08-24): packet-level security re-review **APPROVED** with the integrated conformity/private-artifact/UI selection **3 files / 19 tests PASS** plus database and portal typechecks. Customer snapshots are zero-money allowlists; sign-off binds signer/server timestamp to an immutable report version and exact PDF proof; record/invalidate require stepped-up human Finance/Owner authority; draft invoices remain possible while issue fails with `customer_signoff_required` and a report deep link. The current worktree still needs fresh independent security review, and role/browser evidence remains before CORE-07/10/13 can pass.
- WP-05/06 operational UX focused evidence (2026-08-24): role-specific navigation plus Worker Today, Time, Expense, Daily/Technical Reports and first-class Client Sign-off regression selection **6 files / 25 tests PASS**. Entry surfaces use progressive disclosure and responsive sheets; Worker operational forms contain no client billability, rate, tax, internal-cost or margin controls. Today no longer fabricates the former fixed 10-hour expectation. This is code-level integration evidence only; authenticated 360/390/768/1440, keyboard, focus and payload/DOM checks remain open.
- WP-07 PM serialization boundary (2026-08-24): focused PM projection plus repository privacy selection **2 files / 6 tests PASS** and portal typecheck. The section loader now applies closed-world server allowlists: PM search payloads exclude invoices and unknown finance-backed entities, approval rows drop expense minor units, document listings omit internal metadata, and PM milestone review DTOs exclude amount, currency, rate, tax, margin, internal-cost and billing-treatment fields. Project-detail/approval mounting and authenticated payload/DOM browser evidence remain open.
- Post-change focused rerun (2026-08-25): `pnpm exec vitest run tests/security/localized-pdf-variants-security.test.ts tests/security/portal-pm-projection.test.ts tests/security/repository-privacy.test.ts tests/integration/v3-finance.test.ts` passed **4 files / 18 tests**. This covers the `0030` legacy refresh fixture, PM approval/document projections and draft reimbursement synchronization; it is not the full pinned release gate.
- Pinned security rerun (2026-08-28): with Node `24.19.0` and pnpm `11.22.0`, `pnpm test:security` passed **19 files / 98 tests** after repairing stale step-up fixtures and the Vitest `$app/paths` alias, returning symlink/non-regular-file reads as audited integrity conflicts, and narrowing repeated download step-up to restricted invoice/Accounting Pack artifacts. The focused regression selection additionally passed **5 files / 35 tests**. Independent current-tree security approval remains unavailable because the Luna review lane exhausted its quota.
- Pinned integration rerun (2026-08-28): with Node `24.19.0` and pnpm `11.22.0`, `pnpm test:integration` passed **37 files / 238 tests** on schema `0032`. The rerun repaired stale step-up fixtures without weakening the protected commands, made customer-conformity fixtures supply client rate/internal cost/compensation truth before closing a period, and proved that service-actor IDs cannot collide with human user IDs. Current-schema remote continuity recovery remains open.
- Pinned unit/regression rerun (2026-08-28): with Node `24.19.0` and pnpm `11.22.0`, `pnpm test:unit` passed **95 files / 522 tests**, including browser-backed offline user partitioning **2/2**. Stale schema-30 assertions now track additive schema `0032`, finance mutation fixtures use real recent step-up, zero-source invoice tests use authoritative billable sources, and role landings no longer race navigation.
- Pinned supporting gates (2026-08-28): Node `24.19.0` reporting **1 file / 4 tests**, invariants **1/1**, offline **3 files / 8 tests**, continuity contracts **1 file / 14 tests**, isolated database check/integrity **2/2**, and `ops:backup:test` plus `ops:restore-test` **2/2** all passed with a valid disposable deployment identity. These prove local behavior and recovery only; they do not replace the separate-host encrypted restore or live jobs evidence.
- Client Essential 32-step browser checkpoint (2026-08-28): with the Node `24.19.0` binary directory first on `PATH` and `JA_E2E_CADDY_BASE_URL=https://j-aautomation.com`, `playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop` completed every local authenticated mutation and responsive assertion in steps **1–29** and the deployed public-routing contract in step **32** on a fresh disposable database. Step 32 proved public site and portal login HTTP `200`, public `/health/live` HTTP `200`, and public scoped readiness HTTP `404`, without mutating DNS, Caddy or the VPS. The aggregate failure contains only the deliberate operations gates **30–31**: two proven automatic timer runs and an encrypted remote-copy restore drill. Evidence trace: `test-results/client-essential-32-step-C-97fa0-d-fixture-covers-steps-1–32-desktop/trace.zip`. This checkpoint also proves truthful queued invoice-PDF presentation, canonical legal-entity-backed expense classification, PM approval, Finance review, issue/payment/ledger flow, and 360/390/768/1440 overflow/accessibility checks. The two external gates keep the verdict `NOT READY`.
- Current-tree production compilation (2026-08-28): pinned Node `24.19.0` `pnpm build` passed the Next.js public site (**255 generated pages/routes**) and the SvelteKit portal adapter-node production build with `JA_OFFLINE_ENABLED=false`; `pnpm jobs:build` also produced the bundled durable runner successfully. This is local build evidence, not proof that the current tree is deployed.
- Pinned migration rerun (2026-08-28): with Node `24.19.0`, `pnpm exec vitest run tests/migrations` passed **9 files / 77 tests**, including fresh and populated upgrade paths through additive migrations `0031` and `0032`, immutable prior metadata and schema-integrity guards. Remote continuity recovery evidence remains open.
- Release build artifact (2026-08-25): `pwsh -NoProfile -File scripts/build-release-and-upload.ps1 -ReleaseDate 20260825 -Force` passed the pinned Node `24.19.0` typecheck, `@ja/site`, `@ja/portal` and jobs builds, archive-entry/private-path validation, local SHA-256 generation and remote checksum verification. Uploaded as `kripta:/home/kripta/jaautomation-release-20260825-final.zip`; SHA-256 `894f315be30b923856f2a9cdb642dbf759b420771c2e1c1c4505724eb721f8c9`, source commit `fcfb596`. This proves a deployable archive, not `CLIENT READY`.
- VPS deployment evidence (2026-08-25): the user-run `sha256sum -c` returned `OK`; the automatic path watcher had already processed the same SHA, so the later explicit installer correctly returned `El ZIP ya fue desplegado`. VPS journal evidence records successful image builds, container recreation, local/public health checks and `DESPLIEGUE COMPLETADO` at `01:37:00` for `/opt/jaautomation/releases/ja-automation-894f315be30b923856f2a9cdb642dbf759b420771c2e1c1c4505724eb721f8c9`. Independent endpoint checks returned HTTP `200` for site local, portal readiness/API and both public URLs. Inspecting the root-only release path requires `sudo`/TTY; this deployment evidence does not change the `NOT READY` Essential verdict.
- Client Essential additive persistence contract (migration 0028): independent migration/data-integrity review **APPROVED** after the final inclusive-interval hardening; the final migration/contract selection is **2 files / 21 tests PASS** plus database typecheck. Direct-SQL adversarial evidence covers missing/mismatched project, revision and deployment scope, assignments outside revision bounds, inclusive same-day overlap, a valid adjacent interval, and `INSERT OR REPLACE`/update/delete immutability. Earlier focused migration review also covers byte-preserving legacy/schema-18 upgrades, optional identifiers/planned dates, append-only commercial policy, exact conformity snapshot/PDF binding, permanent signed-report identity and safe storage keys. Reachable services and browser workflows remain separate checklist evidence.
- Checkpoint verification rerun (2026-08-24): the WP-03 expense classification, Accounting Pack boundary, repository privacy and revision selection is **4 files / 24 tests PASS**, with database and portal typechecks PASS on the host runtime. Final independent finance approval, stale integration-fixture migration and pinned Node `24.19.0` evidence remain open; therefore this is not a CORE finance `PASS` claim.
- WP-07 Project Detail (2026-08-24): focused role-safe UI regression **5/5 PASS** plus portal typecheck. PM/Worker omit Commercial and Billing surfaces, authorized roles receive server-gated finance data, finance periods are validated and default truthfully to the current UTC month, tabs implement roving keyboard navigation, and money display avoids binary-number conversion. Project and Approval sections are now mounted; authenticated PM browser evidence remains open.
- CORE-08 approval/correction lifecycle: **5 files / 17 tests PASS** after independent review, including nonblank reasons, strict correction-field allowlists, cross-actor/override idempotency binding, Owner-only step-up override, immutable locked/invoiced guards, original preservation and native technical `report_date` projections.
- CORE-04 backend acceptance: independent final review PASS; focused validation **13/13** on host and pinned Node 24, related lifecycle selection **4 files / 18 tests PASS**, and pinned database typecheck PASS. Evidence includes current/object-date authorization inside each write transaction, authorization-before-validation, audit rollback, direct interval checks and real worker-thread contention preserving aggregate/overlap invariants. Portal clock fields and offline validation remain conditional/non-goals unless activated.
- Reviewed additive migration `0025`: migration contract **10/10 PASS**, adversarial migration **18/18 PASS**, and cross-migration hardening **10/10 PASS**. Existing client data remains unchanged with unknown new fields stored as `NULL`; migration metadata, finance cutover evidence and FK/integrity contracts are preserved.
- Realistic production backup/restore drill PASS: issued invoice snapshot unchanged; private receipt and PLC backup bytes/hashes/lengths preserved; SQLite integrity/FK checks pass; traversal manifest rejected.
- CORE-01 invitation/security acceptance: independent invitation re-review **3 files / 20 tests PASS** and lead full security gate **15 files / 66 tests PASS**. Evidence covers single-use CAS claims, stale no-identity and exact-credential recovery, wrong-role/identity denial, atomic activation/finalization/audit, secret redaction, Origin/Referer enforcement, cross-origin throttle isolation and same-origin attempt-11 `429`.
- CORE-09/12 backend finance-truth acceptance: independent final review PASS; finance/reversal/accounting-pack selection **4 files / 15 tests PASS** plus database typecheck. Evidence covers Finance-approved expense revenue, computed source-backed WIP, dangling/frozen-cost incompleteness, full-command idempotency, causal append-only payment reversals, transactional void/replay guards, reversal-aware compensation, rejected/void readiness exclusion in both billing paths, row-wise BigInt totals, independent as-of reconciliation and atomic pack/job/audit creation.
- CORE-07 attachment migration foundation: independent security re-review PASS; pinned Node 24 migration/contract/adversarial/cross suites **4 files / 44 tests PASS**. Migration `0026` preserves populated upgrades and unrelated documents; enforces report/project/type/creator/immutability guards; supports scanner-required `quarantined/pending -> committed/clean` and honestly scanner-disabled `committed/not_scanned`; rejects impossible state pairs; permits generic technical collections while preventing duplicate/branched PLC before/after history. Service, authorization, private-file and report-detail UI work remains before the requirement can pass.
- CORE-05 backend compensation truth: independent finance re-review PASS; focused compensation **3/3**, related finance/privacy **6 files / 18 tests**, finance-truth/accounting/privacy **3 files / 10 tests**, effective-membership/security **2 files / 10 tests**, and database typecheck PASS. Evidence covers per-source assignment dates, exact BigInt project/global reconciliation for hourly/daily/fixed/custom/percentage rules, daily top-up allocation, immutable settlements, identical-only reimbursement replay and worker-safe DTOs. A private, durable worker statement export remains before CORE-05/13 can pass.
- CORE-17 readiness/storage/recovery packet: independent deployment re-review PASS. Lead pinned-Node run: health/migration/backup/private-write/artifact suites **7 files / 35 tests PASS**; `ops:backup:test`, `ops:restore-test` and the migrated realistic drill PASS with `invoice=issued`, two private artifacts, integrity and FK checks. Reviewer additionally verified 20-way health single-flight/TTL, exact `0026`/manifest hashes, public-health static Caddy ordering, compose configuration, BigInt disk arithmetic, symlink/reparse rejection and current loopback runbooks. Live Caddy validation and VPS smoke remain environmental release evidence; production must rebuild the ignored jobs bundle as the Docker/deployment flow specifies.
- Pinned Node `24.19.0` portal production build PASS against an isolated migration-26 database and private document root. The prior build failure was deployment-identity configuration, not source compilation; required tenant/deployment/binding values were supplied without weakening runtime validation.
- Additive migration `0027` durable-cleanup contract: independent security re-review PASS. Fresh/upgrade **3/3**, contract/adversarial/cross **38/38**, attachment migration/service **16/16**, Accounting Pack **14/14**, readiness **2/2**, and pinned database typecheck PASS. It adds only `temporary_upload_cleanup -> storage.temporary.cleanup`, preserves every prior pair/legacy quarantine, enforces report-link creator=owner, and registers a user-only `accounting_pack.export_retry` audit action without broadening service or audit authority.

---

# A. Architecture and foundation

- ✅ Modular-monolith direction preserved.
- ✅ Initial frontend shell decomposition completed.
- ✅ Route loader/action extraction completed.
- ✅ Database repository decomposition completed to useful domain boundaries.
- ✅ Schema modularization completed.
- ✅ API/schema parity foundations preserved.
- ✅ Core test harness exists.
- ✅ Authority now stops further megafile decomposition unless a file materially blocks Essential correctness, security, testing or ownership.
- ⏭ “Every remaining megafile must be completely decomposed” is not a client-release requirement.
- ⏭ 207-row legacy RTM completeness is not the client-release definition of done.

# B. Responsive UI and accessibility

- ✅ Mobile drawer/full labels/focus/scroll-lock pass the current multi-width browser journey.
- ✅ Shared form/card primitives are implemented and tested.
- ✅ Invoice preview / Modify Report behavior is verified in the built portal.
- ✅ Worker, PM, Finance and Owner workflow surfaces pass authenticated role journeys.
- ✅ Finance forms, responsive tables, labels, focus and validation pass browser and regression coverage.
- ✅ Representative browser proof at 360/390, 768 and 1440 passes on the current worktree.
- ⏭ Separate blocking QA at 430/1024/1280/1920 if responsive behavior is already covered; smoke-check instead.
- ⏭ Migrating every existing screen to new primitives is not required if the screen is already usable.

# C. Authentication, users and RBAC

- ✅ Auth/security, cross-role and MFA/audit evidence pass the current gates.
- ✅ Invitation-only production user activation lifecycle works (independently security-reviewed; 20 focused tests PASS).
- ✅ Owner/Admin, Finance, PM and Worker permissions are enforced server-side; PM approval/queue scope is bound to active membership plus `can_review=1`.
- ✅ Assignment-effective access, Worker/PM commercial redaction, live-session validation, IDOR controls and service/background actor fencing have focused evidence; MFA is optional and no operation uses step-up authentication.
- ✅ The current security gate, independent remediation review and authenticated journeys pass.

# D. Clients, projects and assignments

- ✅ Client create/view/edit/archive/restore is implemented and browser-proven.
- ✅ Project create/view/edit/activate/close/archive/restore is implemented and browser-proven.
- ✅ Worker assignments retain start/end dates and history; migration `0028` preserves nullable legacy values without fabrication.
- ✅ Project-manager assignment/scope is server-gated; PM review permissions require active membership and `can_review=1`.
- ✅ Project commercial configuration covers currency, budget/PO, billing model, cadence, reference schedule, overtime, Travel and tax streams and passes the acceptance journey.
- ✅ Draft deletion and final/finance-bearing history use bounded lifecycle rules; no hard-delete of issued/finalized financial history.
- ⏭ Full rich client CRM metadata beyond billing/operational essentials.

# E. Time and worker pay

- ✅ Core time/timesheet foundations and Worker fast-entry surfaces pass authenticated browser proof.
- ✅ Worker draft create/edit/delete, submission, actual Work/Commissioning, Travel and Standby capture are implemented.
- ✅ PM approve/reject is implemented with active-membership plus `can_review=1` enforcement and browser evidence.
- ✅ Approved time locks and typed corrections preserve old value → new value → reason with audit history.
- ✅ Regular, standby, overtime and travel time use canonical domain rules without frontend financial reimplementation.
- ✅ Project reference hours (for example 10/12/14) are configurable planning/commercial settings,
  never fabricated actual time; minimum billable and worker-compensation rules remain independent.
- ✅ Hourly/daily/fixed and percentage-of-eligible-client-labor compensation rules are covered by exact-money focused evidence.
- ✅ Worker sees own pay/activity/state/dates only; internal loaded cost and client bill rate remain separate server-side.
- ✅ Phone/desktop correction and cross-role browser proof pass.
- ✅ Missing/overlap/impossible-duration validation catches obvious errors and survives real competing writers (independently reviewed; 13/13 focused PASS).
- ⏭ Copy-previous-day/repeat-week shortcuts can follow after go-live.

# F. Expenses and receipts

- ✅ Expense foundations and the operational-only Worker form pass browser proof.
- ✅ Worker creates/edits/submits expense with receipt, project, date, category, amount/currency, payer and description only.
- ✅ Receipt photo/PDF upload and private download are authorization-fenced and artifact-tested.
- ✅ PM may approve operational truth where authorized; Finance/Admin exclusively owns commercial classification and billability.
- ✅ All-in, reimbursable and non-billable classifications remain separate from Worker input and preserve reimbursement/client-recovery states.
- ✅ Who-paid, expected/actual reimbursement and recovery dates are persisted as distinct concepts.
- ✅ Approved expense correction is typed, reasoned, audited and non-destructive.
- ⏭ OCR.
- ⏭ Mileage subsystem unless the client specifically needs it.

# G. Daily and PLC/technical reports

- ✅ Report foundations and Modify Report UI pass the authenticated journey.
- ✅ Daily and PLC/technical Draft → Submit → review/approve state paths exist with immutable correction support.
- ✅ Problem/diagnosis/change/result/safety fields and immutable attachments are represented in the report contracts.
- ✅ Technical attachments/private downloads and PLC backup history pass migration, service and browser/artifact proof.
- ✅ Customer-visible reports use an explicit zero-money allowlist and exclude internal financial/private notes.
- ✅ Exact source-ID/version binding in migration `0030` and nested-value fail-closed validation pass migration/security and browser sign-off evidence.
- ⏭ Plant → Area → Line → Station hierarchy.
- ⏭ Full automation asset registry.
- ⏭ FAT/SAT/commissioning module.
- ⏭ Punch lists.
- ⏭ Closeout-package builder.
- ⏭ QR/photo-annotation/knowledge-base features.

# H. Approval workflow

- ✅ Time, expense, Daily and PLC/technical approval operations enforce active membership plus `can_review=1` and pass authenticated PM evidence.
- ✅ Finance billability/classification approval exists with Finance/Admin authority and passes the acceptance journey.
- ✅ Reject/reopen/correct requires typed fields/reason and preserves immutable original truth with audit.
- ✅ Owner override requires an active authorized Owner session and a nonblank audited reason; it does not use step-up authentication.
- ✅ Authenticated PM/Finance browser evidence and independent security approval pass.
- ⏭ Dedicated universal Approval Center if domain-level approval screens are sufficient.
- ⏭ Bulk approval framework until real volume justifies it.

# I. Finance and project profitability

- ✅ Exact-money and finance foundations pass the integrated finance gate.
- ✅ Exact monetary calculations persist safely using canonical integer/exact-money paths.
- ✅ Worker compensation, internal labor cost and client revenue remain separate.
- ✅ Effective rates, independent minimum/overtime/Travel treatment, direct project cost, WIP, invoiced, collected, outstanding, Contribution and margin foundations exist.
- ✅ Finance view/source drill-down and planned-versus-actual reconciliation pass browser and full-suite evidence.
- ✅ Signed-source binding and immutable finalized finance history pass focused and integrated evidence.
- ⏭ Full versioned forecast/EAC engine.
- ⏭ Change-order subsystem.
- ⏭ Travel-leakage analytics beyond correct expense/cost treatment.

# J. Billing and invoices

Los marcadores de esta sección describen implementación y evidencia focalizada; no convierten el
CORE ni el DoD final en `PASS` mientras falten las pruebas integradas y autenticadas.

- ✅ Invoice preview/presentation is implemented and browser-tested.
- ✅ Labor and expense streams can be configured independently.
- ✅ Weekly / 14-day / semi-monthly / monthly / custom / milestone/manual periods needed by J&A.
- ✅ Approved source rows are selected deterministically.
- ✅ Duplicate billing is prevented by source uniqueness and transactional guards.
- ✅ Invoice drafts generate automatically or from a normal Finance action.
- ✅ Finance explicitly issues invoices.
- ✅ Unique numbering.
- ✅ Issued invoice snapshot/PDF is immutable.
- ✅ Void/Credit/Adjustment correction path.
- ✅ Labor and expense tax profiles remain independent.
- ✅ Normal workflow does not require manual “process jobs”; two consecutive production cycles passed.
- ✅ One reusable renderer provides the five controlled business layouts.
- ⏭ Automatic invoice send by default.
- ⏭ Jurisdiction-specific statutory tax engine.

# K. Payments and ledger

- ✅ Record full payment.
- ✅ Record partial payment.
- ✅ Received date/reference with causal date-only normalization.
- ✅ Outstanding balance updates exactly.
- ✅ Invoice/Cost/Collection ledger shows invoice, cost, collected, outstanding and contribution.
- ✅ Payment/reversal behavior is auditable.
- ⏭ Bank payment execution.
- ⏭ Bank statement import/matching.
- ⏭ Full general ledger.

# L. Essential reports and Accounting/Finance exports

- ✅ Reporting catalog and artifact lifecycle are complete for the Essential report families.
- ✅ Daily/PLC operational report.
- ✅ Customer period report.
- ✅ Project internal finance/profitability report.
- ✅ Worker compensation/statement report as a durable private artifact.
- ✅ Invoice/collection ledger report.
- ✅ Monthly Accounting/Finance export.
- ✅ PDF for customer/official documents.
- ✅ XLSX or CSV for finance/accounting tables.
- ✅ Invoice and expense CSV registers.
- ✅ Monthly totals and detail values reconcile exactly to authoritative sources.
- ✅ Finalized export revision cannot be silently rewritten.
- ✅ Pending/failed output has explicit UI/API state, not HTTP 500.
- ✅ Retry is idempotent.
- ✅ PDF failure does not destroy/prevent independent CSV/XLSX output.
- ✅ Semantic filenames.
- ⏭ JSON export unless a real consumer needs it.
- ⏭ ZIP packs unless Accounting requests them.
- ⏭ Separate Artifact Center and incident-management UI.
- ⏭ Dozens of separately engineered reports that can instead be filters/views of the six core report families.

# M. Lifecycle and correction semantics

- ✅ Draft operational records can be safely edited/deleted.
- ✅ Submitted records can be rejected/reopened with audit.
- ✅ Approved records are locked.
- ✅ Post-approval corrections preserve prior truth.
- ✅ Issued invoices are immutable.
- ✅ Final accounting exports are versioned/frozen.
- ✅ No hard delete of financial history.
- ⏭ Complex autosave conflict/recovery/compare/discard framework unless real user testing shows it is needed.
- ✅ Long entry surfaces provide safe draft behavior; advanced autosave conflict UX remains deferred.

# N. Private files, uploads and downloads

- ✅ Storage-key/hash/security foundations exist.
- ✅ Authorize before final file write.
- ✅ MIME/extension/size validation.
- ✅ Safe filenames/storage paths.
- ✅ Receipt/report/invoice/PLC files are private.
- ✅ Every private download checks permission.
- ✅ Sensitive download/audit behavior where required.
- ✅ Production scanning fails safely or is explicitly disabled with bounded accepted risk; it never fakes success.
- ⏭ Full document-management platform.

# O. Background jobs

- ✅ Durable job/timer foundations exist.
- ✅ Production runner automatically advances normal report/invoice/export jobs.
- ✅ Money-related jobs are idempotent.
- ✅ Failed generation is visible and retryable.
- ✅ No hidden user dependency on manual processing; production runtime proof passed.
- ⏭ Generic Job Center.
- ⏭ Distributed scheduler/message broker/Redis.

# P. Offline/PWA

- ✅ Go-live decision recorded from J&A on 2026-09-01: plant offline capture is not a Client
  Essential release requirement.
- ⏭ Per-user isolated cache, offline time/report/PLC drafts, queued receipt/photo, sync/conflict UX
  and logout/offboard purge move to post-go-live.
- ✅ Existing offline code remains isolated and covered by the non-blocking **3 files / 8 tests**
  regression gate; it is neither expanded nor removed as part of this closure.
- ⏭ Multi-deployment offline infrastructure beyond the actual deployment topology unless needed.

# Q. Deployment, operations and recovery

- ✅ Existing Docker/Caddy/systemd/deployment foundations are preserved and production-verified.
- ✅ Node 24 pinned production build.
- ✅ Portal and website start automatically.
- ✅ Safe DB migration at deployment.
- ✅ Basic health endpoint without sensitive detail.
- ✅ Disk/storage sanity check.
- ✅ Scheduled local backup.
- ✅ Restore runbook.
- ✅ One successful restore drill including issued/private artifacts.
- ⏭ Ten-dimension Operations Health dashboard.
- ⏭ Alerting/outbox platform beyond the minimum needed for operational failures.

# R. Public website

- ✅ Existing multilingual Next.js website remains working without expanding marketing scope.
- ✅ Public website builds 255 routes locally; the exact-candidate deployed Caddy boundary validates and EN/ES/PT-BR plus portal login pass over verified TLS.
- ✅ Contact/support forms remain isolated from private portal data.
- ✅ Employee Portal entry works.
- ⏭ New marketing-site feature expansion unless separately requested.

# S. Explicitly deferred roadmap

- ⏭ Full industrial hierarchy and asset registry.
- ⏭ FAT/SAT/commissioning.
- ⏭ Punch lists and rich closeout.
- ⏭ Skills/certification management.
- ⏭ Global search and command palette.
- ⏭ Bulk operations framework.
- ⏭ General Import Center.
- ⏭ Configurable notification platform.
- ⏭ Client portal.
- ⏭ Accounting-provider adapters.
- ⏭ Bank import/payment execution.
- ⏭ Advanced FX/multicurrency ledger.
- ⏭ Feature flags product UI.
- ⏭ Project Intelligence.
- ⏭ Point-in-time ML snapshots.
- ⏭ Feature/training export registry.
- ⏭ Model registry.
- ⏭ Prediction history/shadow mode.
- ⏭ GBT/JEPA models.
- ⏭ ML leakage release gates for a product that is not yet using ML.

# T. Client Essential Definition of Done

The release can be called **CLIENT READY** only when all of these pass:

Las casillas técnicas y operativas se cierran con los gates, el despliegue real y la evidencia protegida
del VPS. La entrega aplicación → Stalwart ya está probada; la confirmación humana de recepción y la
aceptación contractual ANEXO D se mantienen como gates externos separados y no se sustituyen con mocks.

- [x] Owner can invite and manage users.
- [x] Admin can create/edit/archive/restore a client.
- [x] Admin can create/edit/close/archive/restore a project.
- [x] Admin can assign workers with effective dates.
- [x] Project commercial/rate/expense/billing rules can be configured.
- [x] Worker can record and submit actual time on phone.
- [x] Worker can see own compensation without confidential commercial data.
- [x] Worker can submit daily and PLC/technical reports.
- [x] Worker can submit expenses with receipts.
- [x] PM can approve/reject operational records.
- [x] Finance can approve billability and review project economics.
- [x] All-in vs reimbursable expense behavior is correct.
- [x] Project cost/revenue/WIP/invoiced/collected/margin reconcile.
- [x] Customer period report generates.
- [x] Labor/expense/fixed invoice drafts generate as required.
- [x] Finance can issue an immutable invoice.
- [x] Credit/void/adjustment correction path exists.
- [x] Full and partial payments can be recorded.
- [x] Invoice/Cost/Collection ledger is correct.
- [x] Monthly Accounting/Finance export reconciles.
- [x] Export pending/failure/retry semantics are truthful.
- [x] Normal jobs run automatically.
- [x] Core flows work on phone/tablet/desktop.
- [x] RBAC/privacy/IDOR tests pass.
- [x] Private uploads/downloads are safe.
- [x] Approved/finalized history is non-destructive.
- [x] Local backup/restore drill passes; separate-host continuity is a non-blocking post-release improvement by Owner waiver dated 2026-09-04.
- [x] Production build/deployment behind Caddy works.
- [x] A real production contact submission reaches the signed internal adapter and is accepted by
      Stalwart over validated STARTTLS, with durable `delivered` state and no replay of the legacy backlog.
- [x] The designated operator confirms receipt of the production acceptance message in the agreed
      `migration-test@j-aautomation.com` mailbox with Inbox placement.
- [x] Designated production Owner and Worker login without MFA; Owner protected routes pass, Worker
      confidential finance routes fail closed, and the authorized project-assignment workflow is
      archived with an audited TEST/SYNTHETIC cleanup. The literal Worker project → time → expense/
      receipt → report → expected-payment path and Owner planned/budget view also pass; Worker output
      contains no confidential budget/rate/cost keys.
- [ ] Authorized DNS/mail operators separately verify authoritative DKIM/PTR and external
      send/receive if still required. This campaign does not touch mail accounts, passwords, routing
      or server configuration.
- [ ] Authorized humans approve Accounting outputs, the Worker manual walkthrough and localized
      marketing/legal content; identify the signers and record ANEXO D acceptance. Fiscal/DPA and
      retention approvals remain itemized in the current client-ready decision.
- [x] No core business flow requires a spreadsheet as the system of record.
- [x] Project reference hours are configurable (for example 10/12/14), never become real worked
      hours, and remain independent from minimum billable hours and worker compensation.
- [x] Minimum billable hours/day/service are configurable independently from worker compensation.
- [x] Overtime is optional and supports a configurable threshold plus worker/client multiplier or rate (including cases such as 1.6x and 2x).
- [x] Travel time can be independently configured as client-billable or non-billable, with separate worker-pay treatment.
- [x] Authorized Admin/Finance can add/reduce/correct worker hours with reason, audit trail and preservation of prior approved/submitted truth.
- [x] Customer time/activity report contains no monetary values, can be signed/conformed by the client, and blocks final labor billing when the project requires signature.
- [x] Worker view/report shows own hours/activity, amount expected to receive, reimbursement/settlement state and expected/actual payment dates without Finance-only data.
- [x] Admin/Finance view/report shows hours/activity, money to pay, money to receive, billing/collection state and planned/actual cash-flow dates.
- [x] Expenses maintain separate worker-reimbursement and client-billing/collection states and dates.
- [x] Invoices expose the configured client code/acronym, client number, project number and project cost-center code/number, and Labor/Expenses tax treatment can independently be configured as applicable or no-tax/0%.
- [x] Project and worker active/inactive states prevent inappropriate new activity without deleting historical records.

When this section is fully checked, deferred roadmap items must not prevent the release verdict.

# U. Requested Stalwart identity extension — 2026-09-03

- [x] Live mailbox catalogue uses Stalwart 0.16.19 JMAP `/jmap`; the browser projection excludes
      `credentials` and the portal never reads RocksDB or the historical NDJSON import.
- [x] Idempotent reconciliation links every live corporate mailbox as an active verified `worker`,
      except `antonny.luty@j-aautomation.com`, which is the protected canonical `owner_admin`.
- [x] Better Auth retains Antonny's existing local demo credential and delegates fallback password
      verification to IMAPS; linked workers use IMAPS without storing or caching their Webmail
      passwords.
- [x] Mailbox create, role change, portal offboarding, password rotation and mailbox destruction are
      canonical-Owner-only, require an active authorized Owner session, revoke affected sessions and append
      redacted audit evidence. Portal offboarding preserves history and is separate from Stalwart
      mailbox destruction.
- [x] Reconciliation is non-destructive: a mailbox absent from a live Stalwart read does not
      archive/offboard its portal identity, revoke sessions, replace its stable account ID or undo
      an Owner-approved role/lifecycle decision. Delegated login still fails closed through live
      Stalwart revalidation, and only Antonny can invoke the explicit lifecycle actions.
- [x] Additive migration 0035 and its pinned migration contract pass fresh/populated upgrade tests;
      focused auth, JMAP, directory, UI and RBAC suite passes 62 tests, and the portal production
      build succeeds with an isolated deployment identity.
- [ ] VPS-only acceptance is partially complete: the restricted Stalwart token and authenticated SMTP
      Submission secret are installed, the release is deployed, initial reconciliation is complete,
      IMAPS/JMAP pass, and the production acceptance message reached Inbox. Antonny's
      role/project-assignment smoke from `docs/DEPLOYMENT_VPS.md` remains part of signed UAT; do not
      expose passwords, tokens or hashes while capturing it.

## ASTRA candidate implementation evidence — 2026-09-08 (not deployed)

This section records new local evidence against `ASTRA_PLAN.md`; earlier deployed handbacks do
not certify these uncommitted changes. Plan-only commit `a2604fc` was pushed. Candidate
implementation, final review, and representative browser completion remain in progress.

- [x] Parent commercial-preview, cash-calendar and Aquarex regression run: 5 files / 21 tests
      passed using disposable SQLite. Covers exact commercial examples, actual versus expected
      cash, original reimbursement currency, unconfirmed compensation finalization, real-session
      role denial, durable public-form retry and rate limiting.
- [x] Parent Help catalog and private-download regression run: 2 files / 8 tests passed.
      Persisted roles and live sessions protect private manuals. Generated EN/ES/PT-BR guides
      carry revision 2026-09-08; first-page visual inspection completed in all three languages.
- [x] Parent Finance UI and translation regression run: 2 files / 19 tests passed after task-copy
      changes and explicit compensation-finalization labels.
- [x] Parent frozen migration contract and operational-readiness run: 2 files / 15 tests passed
      with additive migrations 0040/0041, populated historical upgrades, rollback and preserved
      source projections. Original migration hashes and fixture evidence remain unchanged.
- [ ] Closeout: complete immutable audience packages, source/privacy/failure evidence and
      localized browser lifecycle before accepting the candidate.
- [ ] Period follow-up: complete version-bound staff workflow and exact source-readiness browser
      evidence, retaining the existing signed-evidence invoice gate.
- [x] Aquarex, commercial preview, cash calendar and Help representative browser matrix:
      28 passed across 360/390/768/1440, with both production builds completed.
- [ ] Closeout/follow-up browser matrix and fresh independent final review remain pending.
- [ ] Human agreement/accountant mapping, content rights, named-signatory authority and employee
      walkthrough remain explicit acceptance inputs in `docs/ASTRA_ACCEPTANCE_REGISTER.md`.

Exact commands, candidate limitations and subsequent outcomes are tracked in
`docs/ASTRA_IMPLEMENTATION_PROGRESS.md`. No production mail, deployment or production data
mutation is part of these checks.

### ASTRA final candidate verification — 2026-09-08

Owner explicitly authorized commit, push and production deployment. The completed ASTRA core browser matrix passes **44/44** at 360/390/768/1440 widths. Closeout/follow-up integration passes **25 tests**, with **12 closeout tests** rerun after final transaction source/role checks. Migration/readiness/localized-UI regression passes **52 tests**. Full workspace TypeScript passes; extended Svelte diagnostics show **zero errors**, seven existing unused-CSS warnings. Independent review corrections enforce exact confirmed snapshot hashes and atomic one-time latest-final reopen with next-draft creation and rollback.

Production online backup restored with **29 private documents** and integrity `ok`. Candidate migrations39→41 applied successfully to that isolated restored production copy: integrity `ok`, zero foreign-key violations. Detailed commands, logs, backup identity and remaining human/conditional inputs are recorded in `docs/ASTRA_IMPLEMENTATION_PROGRESS.md`. Deployment identity will be recorded separately after activation; this entry does not claim human UAT or accountant approval.

## Production evidence — 9 September 2026

### Migration regression correction — 9 September 2026

The broader functional run exposed six stale migration expectations across B5 legacy upgrades,
Client Essential schema/metadata preservation, localized PDF registries and report attachments.
A seventh occurred in issued-invoice upgrade coverage. Five test files still expected schema39
or metadata versions19–39 despite the existing closeout/follow-up migrations40–41.
Updated exact expectations to schema41 and metadata versions19–41; retained all data-preservation,
integrity, foreign-key, immutable-history, authorization and artifact lifecycle assertions.
Focused Vitest runs pass **45/45 plus 6/6 (51 total)**, with formatting and diff checks passing.
Commands: `pnpm exec vitest run tests/migrations/b5-cross-migration-hardening.test.ts tests/migrations/client-essential-20260824-migration.test.ts tests/integration/localized-pdf-variants.test.ts tests/migrations/report-attachments-migration.test.ts --no-file-parallelism --reporter=verbose`
and `pnpm exec vitest run tests/migrations/client-essential-invoice-immutability.test.ts --reporter=verbose`.
Local logs: `/tmp/astra-six-failures-fixed.log` and `/tmp/astra-invoice-migration-fixed.log`.
These are test-only corrections; no production schema or data was changed. Full application
functional verification remains in progress and is not certified by this focused result.

Core ASTRA implementation and reminder rollout correction were committed, pushed and deployed as `5a615d9` at 00:02:29 CEST. EN/ES/PT and login return HTTP200; local readiness and full SQLite integrity are `ok`, schema41 has zero foreign-key violations; production verifier passed. The first rollout's scheduler conflict and incompatible schema39 rollback, forward recovery, independent correction review, remaining non-corporate email delivery limitation and retained backups are recorded in [the implementation ledger](docs/ASTRA_IMPLEMENTATION_PROGRESS.md). This does not replace human UAT or conditional external approvals. Authorized cleanup recovered 14.37 GB net, with 35.64 GB available; see [storage evidence](docs/ASTRA_STORAGE_CLEANUP_2026-09-09.md).

## 2026-09-09 — Production audit corrections verified; deployment evidence pending

Confirmed assignment/contact editing, compensation configuration, conformity state, document access and classification, upload validation, restore integrity, mobile controls and PT-BR distribution corrections are implemented and independently reviewed. [The audit record](docs/PRODUCTION_AUDIT_2026-09-09.md) records 1,351 Vitest cases verified across the complete run and focused rerun, the resolved harness failures, all 72 executable role/viewport cases covered, 17 additional browser checks, clean dependency audit and successful production builds. All seven manuals were regenerated from 45 current synthetic captures.

The final Client Essential journey passes steps 1–29 and 32. Steps 30–31 remain `OPERATIONS_EVIDENCE_MISSING`; the unaltered result is `NOT_READY`. This worktree is a reviewed remediation candidate, not a deployed release. Exact-revision deployment/operational evidence and the existing human/fiscal/privacy acceptance boundaries remain outstanding. No production history was modified.

## 2026-09-09 — Revisión57dfb95 desplegada y limpieza verificada

Por autorización expresa del usuario, `57dfb95` quedó activo a las10:25:12 CEST. Web EN/ES/PT y login HTTP200, readiness e integridad correctas, esquema41 sin nuevas migraciones, dos ciclos automáticos de jobs y restauración aislada de29 archivos comprobados. Se eliminaron cachés y66 backups antiguos conservando tres copias verificadas y el release anterior compatible. Caché Docker0 B y37,74 GB disponibles. [Recibo de despliegue, recuperación y limpieza](docs/PRODUCTION_DEPLOYMENT_2026-09-09_57dfb95.md). La evidencia histórica local y los límites de aceptación humana se conservan.

## 2026-09-09 — Auditoría del despliegue frente a SPEC y PDF contractual

**Veredicto posterior: NO se acredita cumplimiento íntegro de ambos documentos.** Esta auditoría
no modifica la aplicación ni producción. Los1.178 archivos del manifiesto del release activo
`57dfb954c481d9107a18d89e3ee8fe7bad797374` coinciden y el código local de aplicación coincide con
ese release. Base productiva esquema41, integridad correcta, cero violaciones FK y13 documentos
committed con hash/tamaño correctos. Nueva restauración aislada de la copia del9/9 08:25 UTC: correcta.

El navegador autenticado local pasa13 casos, omite10 por distribución prevista entre viewports y
falla el recorrido compuesto de32 pasos. El paso16 reproduce HTTP500 al volver a subir bytes de un
recibo existente: `finalizeUpload` expone la colisión del índice global `document_content_idx`.
Prueba aislada adicional confirma `UNIQUE constraint failed: document.sha256, document.byte_length`;
el original se conserva. No se debilitaron assertions ni se corrigió el producto en esta auditoría.
Los pasos30–32 no recibieron parámetros de evidencia externa en esa ejecución; jobs/Caddy/restore
se verificaron por separado, sin transformar el resultado del comando en un PASS.

Otros límites confirmados: el adaptador de outbox solo acepta avisos/formularios, no los topics de
invoice/invitación emitidos por otros flujos; destinatarios no corporativos fallan. «Mark sent» es
registro manual, no confirmación SMTP. Solo quedan tres backups completos estructurados del9/9,
aunque retención configurada es30 días; continuidad remota está desactivada bajo dispensa previa.
MFA opcional/no step-up sigue siendo la decisión del Owner, pero difiere del texto literal del PDF
y de las frases no reconciliadas de la SPEC. Permanecen configuración fiscal, DPA/retención,
aceptación humana y evidencias de migración/correo. PTR actual ya apunta a `mx1.j-aautomation.com`.

Informe y matrices de enunciados con evidencia y límites:
`/home/kripta/auditoria-ja-2026-09-09/INFORME_AUDITORIA.md`, `MATRIZ_SPEC.csv`,
`MATRIZ_CONTRATO_ANEXO_A.csv`, `production-readonly.json`, `restore-drill.json`,
`e2e.json` y `duplicate-receipt.log`. Los resultados generales automatizados quedan detallados en
el informe final; los antiguos checks técnicos no resuelven el defecto reproducido ni equivalen
a aceptación contractual/humana.

Cierre de la batería actual: `vitest run --no-file-parallelism` termina con salida0, **199 archivos / 1.351 pruebas PASS**, duración1.233,41s. La prueba adicional del duplicado confirma el defecto fuera de esa batería; el veredicto global continúa NO CUMPLIMIENTO ÍNTEGRO. Log: `/home/kripta/auditoria-ja-2026-09-09/vitest-full.log`.

### Remediación técnica posterior a la auditoría — 2026-09-09

La auditoría anterior conserva su valor histórico. El registro actualizado es
[docs/AUDIT_REMEDIATION_2026-09-09.md](docs/AUDIT_REMEDIATION_2026-09-09.md).
Se han corregido los recibos duplicados, la integración de invitaciones/avisos y el envío explícito
de facturas con PDF, la diferenciación entre registro manual/cola/aceptación SMTP/entrega incierta,
y la verificación real de backups con retención mínima y acceso privado del worker.

Evidencia local: 78 pruebas en 11 archivos de regresión pasan sobre las correcciones estabilizadas;
los dos recorridos nuevos de navegador pasan a 360/390/768/1440 px. Typecheck y ESLint pasan.
La corrección posterior de normalización de mayúsculas del destinatario tiene su propia prueba
idempotente. La batería amplia ejecutada durante los cambios tuvo 202 archivos / 1.403 pruebas
correctas y ocho fallos en cuatro archivos; todos esos archivos están incluidos en la repetición
correcta, sin declarar que el primer comando fue un PASS.

El recorrido de 32 pasos supera los pasos funcionales 1–29. Los pasos 30–32 todavía requieren sus
parámetros de evidencia operacional, continuidad y Caddy. La verificación real de la última copia
retenida confirma integridad SQLite, cero errores de claves foráneas y 29 documentos; cinco copias
cubren un solo día de los treinta exigidos. El código no recupera el histórico eliminado.

No se declara cumplimiento contractual íntegro: destino externo de backups, alertas externas,
pruebas de entrega/migración/recuperación real de correo, datos fiscales verificados y aprobaciones
humanas siguen pendientes. La SPEC recoge la decisión existente del Owner sobre MFA opcional y
sin step-up; no se altera ni se firma retroactivamente el contrato original. La activación y las
comprobaciones de producción se acreditarán en el recibo de despliegue de esta remediación.

### Corrección de idiomas y preparación del despliegue — 2026-09-09

Inglés por defecto sin preferencia previa; selector EN/ES/PT compartido entre portal y login,
con migración de preferencias antiguas, cookies de un año y conservación tras navegación,
recarga y cierre/inicio de sesión. Se corrigen etiquetas visibles y accesibles, estados de
proveedores/CSV, mensajes de cierre, guardados financieros y mensajes de acciones en inglés.
No se traducen datos originales ni se modifican permisos o importes por cambiar de idioma.

La revisión final local supera 110 pruebas en 12 archivos, typecheck del workspace, ESLint y
formato. Las 12 pruebas reales de persistencia pasan a 360/390/768/1440 px; el recorrido de
78 páginas de Owner y Worker en ES/PT no encuentra textos conocidos del catálogo sin traducir.
Las capturas y los PDF se vinculan al código mediante el digest del manifiesto de manuales.
El recibo de producción separará las pruebas sintéticas de las verificaciones del VPS.

Estos resultados no cierran el histórico perdido de backups, la copia externa, la entrega y
recuperación real del correo, los datos fiscales ni la aceptación humana pendientes del registro
de remediación. No se crean ni reactivan agentes tras la prohibición expresa del solicitante.

### Activación verificada y limpieza — 2026-09-09, 22:09 CEST

Commit de aplicación y manuales `58403295db6c0ba585eaf2e873437044cb065e24` desplegado;
1.604 archivos y siete PDF coinciden con el paquete. Portal/site saludables, jobs activo,
schema 42, integridad correcta y cero errores de claves foráneas. Seis casos de idioma
EN/ES/PT en móvil/escritorio pasan contra el login productivo; dos ciclos automáticos de jobs
pasan y `backup.verified` acredita la copia real nueva con 29 documentos. Se conservan seis
backups, que cubren un solo día. Limpieza de Docker/cachés: aproximadamente 8,66 GB recuperados.

Recibo y límites: [despliegue de la remediación](docs/PRODUCTION_DEPLOYMENT_2026-09-09_AUDIT_REMEDIATION.md).
Los pendientes externos, fiscales y de aceptación humana de la auditoría siguen abiertos.

## 2026-09-10 — Proveedores y configuración comercial (CORE-02 / CORE-14 / CORE-15)

- [x] Navegación compartida en proveedores e informe; drawer móvil y enlaces por perfil.
- [x] Directorio con búsqueda, edición y baja/restauración confirmada para el propietario; historial y privacidad conservados.
- [x] Separación de bloques, títulos, descripciones y aviso de autoridad de emisión en Finance configuration.
- [x] Migración aditiva 43 para las acciones de auditoría: actualización poblada desde 42, metadatos previos e integridad verificados. Las pruebas de versiones actuales se actualizan de 42 a 43.
- [x] Evidencia: 41 pruebas de integración/seguridad; suites de migración comprobadas (91 pruebas entre pasada general y repetición dirigida); 16 escenarios de navegador y 4 repeticiones finales del directorio en 360/390/768/1440; compilaciones web/portal, Svelte sin errores y ESLint del alcance correctos.
- Evidencia y capturas: [supplier-ui-20260910](docs/evidence/supplier-ui-20260910/README.md).
- Estado: desplegado en producción el 2026-09-10 a las 09:39 UTC desde `f70c21c`; verificador de producción superado, esquema 43 íntegro y recuentos comprobados conservados. Limpieza Docker: aproximadamente 19,4 GB liberados, caché de compilación vacía y versión anterior conservada para reversión. Este alcance no cambia el veredicto global de entrega.

## 2026-09-10 — Gestión Owner y selectores con búsqueda

- [x] Gestión central de gastos, horas e informes: reapertura, edición delegada y eliminación con motivo y auditoría, con independencia del origen demo/mock.
- [x] CRUD Owner de planificación, disponibilidad, hitos y cambios técnicos; edición, archivado y restauración de documentos.
- [x] Descarte de facturas no emitidas y liberación transaccional de reservas; el historial emitido mantiene correcciones/anulaciones.
- [x] Búsqueda en selectores de entidades sin distinguir mayúsculas ni acentos, conservando selección y desplegable nativo.
- [x] Migración 44 probada desde base vacía y copia aislada de producción 43; integridad y referencias verificadas después de eliminar los tres borradores de factura y once gastos de esa copia.
- [x] Permisos, concurrencia, privacidad, finanzas, jobs y continuidad comprobados; navegación y operaciones en móvil/tablet/escritorio.
- Evidencia y límites: [owner-crud-20260910](docs/evidence/owner-crud-20260910/README.md). Esta ampliación no modifica las aceptaciones externas históricas pendientes.

- Estado de esta ampliación: commit `031077b` desplegado a las 10:49:09 UTC, esquema 44 íntegro y 19 recuentos de tablas conservados; verificador de producción superado. Caché Docker a cero tras liberar 6,828 GB. [Recibo de producción](docs/PRODUCTION_DEPLOYMENT_2026-09-10_OWNER_CRUD.md).

### 2026-09-10 — Owner financial landing and management UI

Explicit Owner follow-up implemented: currency-separated exact cash/receivable/payment overview, clickable monthly bars and status donuts with matching source filters, and explicit responsive Manage buttons/navigation. Evidence: `docs/evidence/owner-finance-20260910/README.md`. Eight financial tests, 235 security/invariant tests validated (including updated dependency mock rerun), 20 final browser scenarios across 360/390/768/1440, workspace typecheck, and Svelte check with zero errors. No migration or financial history mutation; existing contractual external acceptance items remain as recorded.
