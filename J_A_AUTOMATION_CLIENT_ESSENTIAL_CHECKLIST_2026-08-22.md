# J&A Automation — Client Essential Production Checklist

**Date:** 2026-08-22  
**Scope:** Only release blockers for the client-complete production system.

**Client validation update:** 2026-08-24
The requirements clarified directly with J&A on 2026-08-24 are release-authoritative. Existing PASS/PARTIAL evidence must be revalidated where these clarifications materially change the behavior; no prior PASS may be assumed to prove a newly clarified rule.

## Legend

- ✅ Implemented/proven enough for this reduced release scope.
- 🟨 Substantially present but needs integration/QA or a bounded fix.
- ⬜ Essential release blocker still to complete.
- ⏭ Deferred from client-essential release.
- ❓ Conditional: required only if J&A confirms the operational need.

Audit classifications used below: `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `CONDITIONAL`, `DEFERRED`. `PASS` requires executable evidence, not code presence.

## Repository-grounded audit snapshot — 2026-08-25

**Current audit verdict: NOT READY.** The final Essential gate currently has **0/17 CORE requirements
at `PASS`**, with **16 `PARTIAL` and 1 `FAIL`**. Focused implementation evidence is useful but does
not replace the missing authenticated browser, current-schema recovery, deployment and independent
review evidence.

The stable pinned-runtime counts recorded below are a prior checkpoint: Node `24.19.0`, unit
`466`, integration `203`, security `74`, invariants `1`, reporting `4`, migrations `72`, production
builds, backup/restore and an automatic-job run. Migrations `0028`, `0029` and `0030` now have a
focused post-change rerun, but the complete pinned final gate and current-schema recovery drill remain
open. Focused UI regression is currently `74/74`, but authenticated browser evidence remains open.

| Requirement                           | Status      | Current evidence and exact next dependency                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE-01 Authentication/users/roles    | PARTIAL     | Invitation activation, role validation, transactional claims, throttling, step-up foundations, DTO/IDOR controls and service-actor fencing have focused evidence. Complete MFA enrollment/recovery audit and full Owner/Finance/PM/Worker browser journeys remain.                                                                                                                              |
| CORE-02 Clients/projects/assignments  | PARTIAL     | Client/project identifiers, optional client code, project cost center, lifecycle history and effective assignments are implemented with additive migration `0028`. Final fresh/populated migration revalidation and role-specific create/edit/restore browser evidence remain; legacy nullable values must not be fabricated.                                                                   |
| CORE-03 Commercial rules              | PARTIAL     | Exact rates, effective schedules, configurable reference minutes, independent minimum billing, overtime policy, Travel billability and independent Labor/Expense tax streams including 0% are implemented. Final exact-money rerun, configuration journey and pinned-runtime evidence remain.                                                                                                   |
| CORE-04 Time/timesheets               | PARTIAL     | Actual Work/Commissioning, Travel and Standby capture, derived overtime, submission/approval, locking and immutable corrections are implemented and focused-tested. PM `can_review=1` review scope is enforced server-side; correction browser proof and the final cross-role journey remain.                                                                                                   |
| CORE-05 Worker compensation/privacy   | PARTIAL     | Own-only compensation, activity, settlement/reimbursement state and expected/actual dates are implemented; Worker/PM commercial redaction is server-side. Private worker-statement artifact/download and authenticated privacy/browser proof remain.                                                                                                                                            |
| CORE-06 Expenses/receipts             | PARTIAL     | Worker input is operational-only (receipt, project, date, category, amount/currency, payer and description); Finance/Admin owns commercial classification, with separate reimbursement/recovery states and planning dates. Phone receipt workflow, private download and Finance classification browser proof remain.                                                                            |
| CORE-07 Daily/PLC technical reports   | PARTIAL     | Daily/Technical reports, immutable attachments, zero-money customer projection and version-bound conformity/sign-off are implemented. Migration `0030` source binding and read-time safety have focused regression evidence; complete creation/attachment/signature/supersession browser proof remains.                                                                                         |
| CORE-08 Approval workflow             | PARTIAL     | Typed correction allowlists, reasons, immutable originals and Owner step-up override are implemented. PM approval and queue operations enforce active membership plus `can_review=1`; authenticated PM/Finance browser evidence and current-tree security review remain.                                                                                                                        |
| CORE-09 Project finance/profitability | PARTIAL     | Canonical WIP, direct cost, invoiced, collected, outstanding, Contribution and planned/actual dates exist with BigInt-safe presentation and source drill-down foundations. Signed-source reconciliation, Finance UI/browser proof and final full-suite rerun remain.                                                                                                                            |
| CORE-10 Billing periods/drafts        | PARTIAL     | Streams, cadences, source uniqueness, drafts, automatic jobs, sign-off blocker/deep link and issue transaction foundations exist. `0030` source/version binding and refreshed readiness have focused regression evidence; automatic runtime plus draft→block→sign→issue browser evidence remain.                                                                                                |
| CORE-11 Invoice rendering/corrections | PARTIAL     | Controlled template registry, identifiers, immutable issued snapshots and credit/adjustment/void/replacement foundations exist. Generated artifact inspection, locked issued-invoice UI and final correction journey remain.                                                                                                                                                                    |
| CORE-12 Payments/ledger               | PARTIAL     | Full/partial payments, append-only reversals, outstanding calculations, timeline fields and Collections/Ledger UI are implemented. Authenticated issue/payment/reversal/reconciliation browser proof remains.                                                                                                                                                                                   |
| CORE-13 Essential reports/exports     | PARTIAL     | Zero-money customer reports, Worker statement, project finance, ledger and Accounting Pack foundations exist with role-safe projections. Nested customer-value fail-closed validation and independent export failure tests are focused-green; artifact catalog/download, durable Worker statement and source reconciliation evidence remain.                                                    |
| CORE-14 Responsive/accessibility      | PARTIAL     | Role navigation, responsive sheets, focus/label/table primitives and static UI regressions (`74/74`) are green. The current authenticated matrix at 360/390/768/1440, keyboard/focus/error/touch/reduced-motion and CSP evidence remains open.                                                                                                                                                  |
| CORE-15 Private files/security/audit  | FAIL        | Authorization-before-download, storage-key, scanner fencing, audit redaction, CSRF, DTO and IDOR foundations have focused evidence. PM approval/queue, nested customer snapshot validation and PM document metadata are now allowlisted and regression-tested, but independent security review of the current worktree, MFA audit and real scanner-provider validation remain open/conditional. |
| CORE-16 Durable jobs                  | PARTIAL     | Durable queued/running/ready/failed/retry semantics, automatic runner code and independent artifact failure behavior exist. Re-run the final runner after `0030`, prove no normal-user processing path, and close stale export-state assertions.                                                                                                                                                |
| CORE-17 Deployment/health/backup      | PARTIAL     | Pinned Node 24 builds, health/migration checks, backup/restore and a realistic issued/private-artifact drill passed at an earlier checkpoint. Repeat on the final 0028–0030 worktree and complete live Caddy/VPS smoke.                                                                                                                                                                         |
| Offline/PWA                           | CONDITIONAL | Await the go-live plant-connectivity decision. Existing offline work is preserved but does not block release until activated.                                                                                                                                                                                                                                                                   |
| V3.1–V3.4 expansion                   | DEFERRED    | Industrial platform, generic ERP/business, broad integrations and ML/data-readiness remain post-core roadmap and do not control `CLIENT READY`.                                                                                                                                                                                                                                                 |

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
- Current host security rerun (2026-08-25): `pnpm test:security` passed **17 files / 78 tests**. The Node `24.19.0` pinned rerun, independent current-tree approval and authenticated artifact/IDOR browser evidence remain open.
- Current host integration rerun (2026-08-25): `pnpm test:integration` passed **34 files / 217 tests** after updating legacy schema assertions to migration `0030`. The pinned-runtime and current-schema backup/restore reruns remain open.
- Current host unit rerun (2026-08-25): `pnpm test:unit` passed **91 files / 476 tests** after setting the Vitest timeout to 30 seconds for the real PDF renderers. This remains host-runtime evidence until the pinned Node `24.19.0` gate is repeated.
- Current host supporting gates (2026-08-25): `pnpm test:reporting` **1/4**, `pnpm test:invariants` **1/1**, `pnpm test:offline` **3/8**, database check/integrity **2/2**, and `pnpm ops:backup:test` plus `pnpm ops:restore-test` **2/2** passed with the isolated release identity. These do not replace the pinned runtime, live VPS and full browser evidence.
- Current host migration rerun (2026-08-25): `pnpm exec vitest run tests/migrations` passed **9 files / 76 tests**, including the current `0028`–`0030` contract and upgrade paths. The pinned-runtime migration and recovery evidence remain open.
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

- 🟨 Mobile drawer/full labels/focus/scroll-lock implementation exists; finish bounded QA on the current build.
- ✅ Shared form/card primitives are implemented and tested.
- 🟨 Invoice preview / Modify Report work exists; finish real mobile/desktop verification.
- 🟨 Worker, PM, Finance and Owner workflow surfaces are implemented; current authenticated usability is not yet proven at every required viewport.
- 🟨 Finance forms, responsive tables, labels, focus and validation have static/regression coverage; browser confirmation remains.
- ⬜ Representative browser proof at 360/390, 768 and 1440 is not complete on the final worktree.
- ⏭ Separate blocking QA at 430/1024/1280/1920 if responsive behavior is already covered; smoke-check instead.
- ⏭ Migrating every existing screen to new primitives is not required if the screen is already usable.

# C. Authentication, users and RBAC

- 🟨 Auth/security foundations exist; final cross-role and MFA evidence remains.
- ✅ Invitation-only production user activation lifecycle works (independently security-reviewed; 20 focused tests PASS).
- 🟨 Owner/Admin, Finance, PM and Worker permissions are enforced server-side; PM approval/queue scope is now bound to active membership plus `can_review=1`, while independent review of the current worktree and final authenticated journeys remain.
- ✅ Assignment-effective access, Worker/PM commercial redaction, step-up foundations, IDOR controls and service/background actor fencing have focused evidence.
- ⬜ Security review is not yet approved for the current worktree; MFA enrollment/recovery and final authenticated journeys remain.

# D. Clients, projects and assignments

- 🟨 Client create/view/edit/archive/restore is implemented; final role-browser proof remains.
- 🟨 Project create/view/edit/activate/close/archive/restore is implemented; final role-browser proof remains.
- ✅ Worker assignments retain start/end dates and history; migration `0028` preserves nullable legacy values without fabrication.
- 🟨 Project-manager assignment/scope is server-gated; PM review permissions require active membership and `can_review=1`, with authenticated browser evidence still open.
- 🟨 Project commercial configuration covers currency, budget/PO, billing model, cadence, reference schedule, overtime, Travel and tax streams; final configuration journey remains.
- ✅ Draft deletion and final/finance-bearing history use bounded lifecycle rules; no hard-delete of issued/finalized financial history.
- ⏭ Full rich client CRM metadata beyond billing/operational essentials.

# E. Time and worker pay

- 🟨 Core time/timesheet foundations and Worker fast-entry surfaces exist; authenticated browser proof remains.
- ✅ Worker draft create/edit/delete, submission, actual Work/Commissioning, Travel and Standby capture are implemented.
- 🟨 PM approve/reject is implemented with active-membership plus `can_review=1` enforcement; authenticated PM browser evidence remains.
- ✅ Approved time locks and typed corrections preserve old value → new value → reason with audit history.
- ✅ Regular, standby, overtime and travel time use canonical domain rules without frontend financial reimplementation.
- ✅ Project reference hours (for example 10/12/14) are configurable planning/commercial settings,
  never fabricated actual time; minimum billable and worker-compensation rules remain independent.
- ✅ Hourly/daily/fixed and percentage-of-eligible-client-labor compensation rules are covered by exact-money focused evidence.
- ✅ Worker sees own pay/activity/state/dates only; internal loaded cost and client bill rate remain separate server-side.
- 🟨 Phone/desktop correction and full cross-role browser proof remain.
- ✅ Missing/overlap/impossible-duration validation catches obvious errors and survives real competing writers (independently reviewed; 13/13 focused PASS).
- ⏭ Copy-previous-day/repeat-week shortcuts can follow after go-live.

# F. Expenses and receipts

- 🟨 Expense foundations and operational-only Worker form exist; final browser proof remains.
- ✅ Worker creates/edits/submits expense with receipt, project, date, category, amount/currency, payer and description only.
- 🟨 Receipt photo/PDF upload and private download are authorization-fenced; phone execution and artifact proof remain.
- 🟨 PM may approve operational truth where authorized; Finance/Admin owns commercial classification and billability.
- ✅ All-in, reimbursable and non-billable classifications remain separate from Worker input and preserve reimbursement/client-recovery states.
- ✅ Who-paid, expected/actual reimbursement and recovery dates are persisted as distinct concepts.
- ✅ Approved expense correction is typed, reasoned, audited and non-destructive.
- ⏭ OCR.
- ⏭ Mileage subsystem unless the client specifically needs it.

# G. Daily and PLC/technical reports

- 🟨 Report foundations and Modify Report UI exist; authenticated journey remains.
- ✅ Daily and PLC/technical Draft → Submit → review/approve state paths exist with immutable correction support.
- ✅ Problem/diagnosis/change/result/safety fields and immutable attachments are represented in the report contracts.
- 🟨 Technical attachments/private downloads and PLC backup history have migration/service foundations; final browser/artifact proof remains.
- ✅ Customer-visible reports use an explicit zero-money allowlist and exclude internal financial/private notes.
- ✅ Exact source-ID/version binding in migration `0030` and nested-value fail-closed validation have focused migration/security regression evidence; independent current-tree review and browser sign-off evidence remain.
- ⏭ Plant → Area → Line → Station hierarchy.
- ⏭ Full automation asset registry.
- ⏭ FAT/SAT/commissioning module.
- ⏭ Punch lists.
- ⏭ Closeout-package builder.
- ⏭ QR/photo-annotation/knowledge-base features.

# H. Approval workflow

- 🟨 Time, expense, Daily and PLC/technical approval operations exist; every PM path enforces active membership plus `can_review=1`, with authenticated PM evidence still open.
- 🟨 Finance billability/classification approval exists with Finance/Admin authority; final finance review remains.
- ✅ Reject/reopen/correct requires typed fields/reason and preserves immutable original truth with audit.
- ✅ Owner override requires step-up and reason.
- 🟨 Authenticated PM/Finance browser evidence and independent security approval remain.
- ⏭ Dedicated universal Approval Center if domain-level approval screens are sufficient.
- ⏭ Bulk approval framework until real volume justifies it.

# I. Finance and project profitability

- 🟨 Exact-money and finance foundations exist; final integrated finance review remains.
- ✅ Exact monetary calculations persist safely using canonical integer/exact-money paths.
- ✅ Worker compensation, internal labor cost and client revenue remain separate.
- ✅ Effective rates, independent minimum/overtime/Travel treatment, direct project cost, WIP, invoiced, collected, outstanding, Contribution and margin foundations exist.
- 🟨 Finance view/source drill-down and planned-versus-actual reconciliation require final browser and full-suite evidence.
- 🟨 Signed-source binding and immutable finalized finance history are under final finance review.
- ⏭ Full versioned forecast/EAC engine.
- ⏭ Change-order subsystem.
- ⏭ Travel-leakage analytics beyond correct expense/cost treatment.

# J. Billing and invoices

Los marcadores de esta sección describen implementación y evidencia focalizada; no convierten el
CORE ni el DoD final en `PASS` mientras falten las pruebas integradas y autenticadas.

- 🟨 Invoice preview/presentation exists.
- 🟨 Labor and expense streams can be configured independently.
- 🟨 Weekly / 14-day / semi-monthly / monthly / custom / milestone/manual periods needed by J&A.
- 🟨 Approved source rows are selected deterministically.
- 🟨 Duplicate billing is prevented by source uniqueness and transactional guards.
- 🟨 Invoice drafts generate automatically or from a normal Finance action.
- 🟨 Finance explicitly issues invoice.
- 🟨 Unique numbering.
- 🟨 Issued invoice snapshot/PDF immutable.
- 🟨 Void/Credit/Adjustment correction path.
- 🟨 Labor and expense tax profiles remain independent.
- 🟨 Normal workflow does not require manual “process jobs”; automatic runner evidence remains open.
- 🟨 One reusable renderer can provide the five controlled business layouts; do not build five independent systems.
- ⏭ Automatic invoice send by default.
- ⏭ Jurisdiction-specific statutory tax engine.

# K. Payments and ledger

- 🟨 Record full payment.
- 🟨 Record partial payment.
- 🟨 Received date/reference.
- 🟨 Outstanding balance updates exactly.
- 🟨 Invoice/Cost/Collection ledger shows invoice, cost, collected, outstanding and contribution.
- 🟨 Payment/reversal behavior is auditable.
- ⏭ Bank payment execution.
- ⏭ Bank statement import/matching.
- ⏭ Full general ledger.

# L. Essential reports and Accounting/Finance exports

- 🟨 Reporting package exists but catalog/lifecycle is incomplete.
- 🟨 Daily/PLC operational report.
- 🟨 Customer period report.
- 🟨 Project internal finance/profitability report.
- 🟨 Worker compensation/statement report; the current statement endpoint is on-demand rather than a durable private artifact.
- 🟨 Invoice/collection ledger report.
- 🟨 Monthly Accounting/Finance export.
- 🟨 PDF for customer/official documents.
- 🟨 XLSX or CSV for finance/accounting tables.
- 🟨 Invoice and expense CSV registers.
- 🟨 Monthly totals reconcile exactly to underlying sources.
- 🟨 Finalized export revision cannot be silently rewritten.
- 🟨 Pending/failed output has explicit UI/API state, not HTTP 500.
- 🟨 Retry is idempotent.
- 🟨 PDF failure does not destroy/prevent independent CSV/XLSX output.
- 🟨 Semantic filenames.
- ⏭ JSON export unless a real consumer needs it.
- ⏭ ZIP packs unless Accounting requests them.
- ⏭ Separate Artifact Center and incident-management UI.
- ⏭ Dozens of separately engineered reports that can instead be filters/views of the six core report families.

# M. Lifecycle and correction semantics

- 🟨 Draft operational records can be safely edited/deleted.
- 🟨 Submitted records can be rejected/reopened with audit.
- 🟨 Approved records are locked.
- 🟨 Post-approval corrections preserve prior truth.
- 🟨 Issued invoices are immutable.
- 🟨 Final accounting exports are versioned/frozen.
- 🟨 No hard delete of financial history.
- ⏭ Complex autosave conflict/recovery/compare/discard framework unless real user testing shows it is needed.
- 🟨 Basic dirty-navigation warning for long forms is desirable but not a blocker if drafts save reliably.

# N. Private files, uploads and downloads

- 🟨 Storage-key/hash/security foundations exist.
- 🟨 Authorize before final file write.
- 🟨 MIME/extension/size validation.
- 🟨 Safe filenames/storage paths.
- 🟨 Receipt/report/invoice/PLC files are private.
- 🟨 Every private download checks permission.
- 🟨 Sensitive download/audit behavior where required.
- 🟨 Production scanning fails safely or the scanning adapter is explicitly disabled with bounded accepted risk; it must not fake success.
- ⏭ Full document-management platform.

# O. Background jobs

- 🟨 Durable job/timer foundations exist.
- 🟨 Production runner automatically advances normal report/invoice/export jobs.
- 🟨 Money-related jobs are idempotent.
- 🟨 Failed generation is visible and retryable.
- 🟨 No hidden user dependency on manual processing; final runtime proof remains open.
- ⏭ Generic Job Center.
- ⏭ Distributed scheduler/message broker/Redis.

# P. Offline/PWA

- ❓ Decide with J&A whether plant connectivity makes offline capture a go-live requirement.
- If **yes**:
  - ⬜ per-user isolated assigned-project cache;
  - ⬜ time/report/PLC drafts offline;
  - ⬜ queued receipt/photo;
  - ⬜ clear sync state;
  - ⬜ conflict detection;
  - ⬜ logout/offboard purge.
- If **no**:
  - ⏭ move all offline/PWA completion to immediate post-go-live.
- ⏭ Multi-deployment offline infrastructure beyond the actual deployment topology unless needed.

# Q. Deployment, operations and recovery

- 🟨 Existing Docker/Caddy/systemd/deployment foundations should be preserved.
- ✅ Node 24 pinned production build.
- ⬜ Portal and website start automatically.
- ✅ Safe DB migration at deployment.
- ✅ Basic health endpoint without sensitive detail.
- ✅ Disk/storage sanity check.
- ⬜ Scheduled backup.
- ✅ Restore runbook.
- ✅ One successful restore drill including issued/private artifacts.
- ⏭ Ten-dimension Operations Health dashboard.
- ⏭ Alerting/outbox platform beyond the minimum needed for operational failures.

# R. Public website

- 🟨 Existing multilingual Next.js website remains in scope only to keep it working.
- ⬜ Public website builds and routes correctly under the production base path.
- ⬜ Contact/support forms remain isolated from private portal data.
- ⬜ Employee Portal entry works.
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

Las casillas siguen sin marcarse en este snapshot: hay implementación y pruebas focalizadas para
varios puntos, pero no existe todavía evidencia integrada, autenticada y de despliegue suficiente
para cerrar el DoD.

- [ ] Owner can invite and manage users.
- [ ] Admin can create/edit/archive/restore a client.
- [ ] Admin can create/edit/close/archive/restore a project.
- [ ] Admin can assign workers with effective dates.
- [ ] Project commercial/rate/expense/billing rules can be configured.
- [ ] Worker can record and submit actual time on phone.
- [ ] Worker can see own compensation without confidential commercial data.
- [ ] Worker can submit daily and PLC/technical reports.
- [ ] Worker can submit expenses with receipts.
- [ ] PM can approve/reject operational records.
- [ ] Finance can approve billability and review project economics.
- [ ] All-in vs reimbursable expense behavior is correct.
- [ ] Project cost/revenue/WIP/invoiced/collected/margin reconcile.
- [ ] Customer period report generates.
- [ ] Labor/expense/fixed invoice drafts generate as required.
- [ ] Finance can issue an immutable invoice.
- [ ] Credit/void/adjustment correction path exists.
- [ ] Full and partial payments can be recorded.
- [ ] Invoice/Cost/Collection ledger is correct.
- [ ] Monthly Accounting/Finance export reconciles.
- [ ] Export pending/failure/retry semantics are truthful.
- [ ] Normal jobs run automatically.
- [ ] Core flows work on phone/tablet/desktop.
- [ ] RBAC/privacy/IDOR tests pass.
- [ ] Private uploads/downloads are safe.
- [ ] Approved/finalized history is non-destructive.
- [ ] Backup/restore drill passes.
- [ ] Production build/deployment behind Caddy works.
- [ ] No core business flow requires a spreadsheet as the system of record.
- [ ] Project reference hours are configurable (for example 10/12/14), never become real worked
      hours, and remain independent from minimum billable hours and worker compensation.
- [ ] Minimum billable hours/day/service are configurable independently from worker compensation.
- [ ] Overtime is optional and supports a configurable threshold plus worker/client multiplier or rate (including cases such as 1.6x and 2x).
- [ ] Travel time can be independently configured as client-billable or non-billable, with separate worker-pay treatment.
- [ ] Authorized Admin/Finance can add/reduce/correct worker hours with reason, audit trail and preservation of prior approved/submitted truth.
- [ ] Customer time/activity report contains no monetary values, can be signed/conformed by the client, and blocks final labor billing when the project requires signature.
- [ ] Worker view/report shows own hours/activity, amount expected to receive, reimbursement/settlement state and expected/actual payment dates without Finance-only data.
- [ ] Admin/Finance view/report shows hours/activity, money to pay, money to receive, billing/collection state and planned/actual cash-flow dates.
- [ ] Expenses maintain separate worker-reimbursement and client-billing/collection states and dates.
- [ ] Invoices expose the configured client code/acronym, client number, project number and project cost-center code/number, and Labor/Expenses tax treatment can independently be configured as applicable or no-tax/0%.
- [ ] Project and worker active/inactive states prevent inappropriate new activity without deleting historical records.

When this section is fully checked, deferred roadmap items must not prevent the release verdict.
