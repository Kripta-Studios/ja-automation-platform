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

## Repository-grounded audit snapshot — 2026-08-23

| Requirement | Status | Current evidence and exact next dependency |
| --- | --- | --- |
| CORE-01 Authentication/users/roles | PARTIAL | Invitation-only activation now has atomic single-use claims, bounded crash recovery, exact credential-identity proof, controlled-role validation, transactional activation/audit and CSRF-safe per-IP throttling. Step-up, DTO, IDOR and service-run foundations also pass focused tests; MFA enrollment/recovery audit and full role-journey browser evidence remain. |
| CORE-02 Clients/projects/assignments | PARTIAL | Effective membership and lifecycle repositories exist. Additive reviewed migration `0025` now persists honest nullable billing-address/PO-reference values without fabricating legacy data; reachable restore, historical assignment-end UI, direct-status bypass removal and required-field product flow are active work. |
| CORE-03 Commercial rules | PARTIAL | Exact billing engine, models, schedules, streams/cadences/tax/currency/PO exist; custom/manual/milestone validation, timezone boundaries, controlled template IDs and bigint-safe UI evidence remain. |
| CORE-04 Time/timesheets | PARTIAL | Draft/edit/submit/delete and regular/standby/overtime/travel exist. Independently accepted transactional validation rejects daily totals over 1,440 minutes, malformed/overnight intervals, elapsed/break mismatches and overlap; worker-thread contention proves conflicting writes cannot bypass the invariants. Current/object-date authorization and void/audit rollback pass. Explicit lock/correction browser UI remains. |
| CORE-05 Worker compensation/privacy | PARTIAL | Independently accepted backend compensation truth now enforces assignment-effective source dates, exact hourly/daily/fixed/custom/percentage totals, reconciled per-project approved/pending buckets, immutable settlements, conflict-safe reimbursement replay and worker/PM DTO privacy. The worker statement artifact/export and browser evidence remain. |
| CORE-06 Expenses/receipts | PARTIAL | Create/edit/submit now has exact-money parsing, optimistic versions and normal/offline same-project receipt enforcement; role-safe detail/list DTO tests pass. Receipt replacement, reasoned approved correction and Finance billability control remain. |
| CORE-07 Daily/PLC technical reports | PARTIAL | Draft/edit/submit/review and PDF foundations exist. Approved/submitted rows fail closed against in-place edits and audited correction drafts preserve originals. Independently accepted migration `0026` establishes immutable, project-bound daily/technical/PLC attachment links, valid scanner-enabled/disabled lifecycles and guarded version roots; reachable repository/file/UI history and `report_date` period corrections remain. |
| CORE-08 Approval workflow | PARTIAL | Time/expense/report decisions now require server-validated reasons where returned/rejected. PM/worker corrections and step-up Owner overrides create linked audited drafts while approved, locked, invoiced and finalized originals remain immutable; authenticated responsive browser evidence remains before PASS. |
| CORE-09 Project finance/profitability | PARTIAL | Independently accepted backend finance truth now separates operational/Finance approval, reconciles source-linked WIP, uses frozen historical direct cost with explicit incomplete evidence, applies reversal-aware collection/settlement and exact as-of Accounting Pack totals. Integrated finance UI/export/browser proof remains. |
| CORE-10 Billing periods/drafts | PARTIAL | Separate streams, cadences, exact drafts, source uniqueness and automatic runner exist; concurrency/readiness, custom/manual semantics and misleading manual job action remain. |
| CORE-11 Invoice rendering/corrections | PARTIAL | Issued snapshot/numbering/immutability and adjustment foundations exist. One typed `v1` registry now renders five materially distinct controlled families; billing rules reject free-text IDs and issuance freezes stream-appropriate/credit selectors. End-to-end browser/artifact inspection and broader correction UX remain. |
| CORE-12 Payments/ledger | FAIL | Backend full/partial payments, append-only exact reversals, idempotent replay/void guards, causal timestamps, reversal-aware settlements and master-ledger historical cost truth are independently accepted. The required reachable payment reference/reversal UI and final ledger browser proof remain active work. |
| CORE-13 Essential reports/exports | PARTIAL | Operational/customer/project finance/accounting outputs and independent artifact foundations exist; worker statement/ledger exports, canonical pack revision wiring, stale behavior and reconciliation gaps remain. |
| CORE-14 Responsive/accessibility | PARTIAL | Strong static drawer/focus/form/table implementation and tests exist; current authenticated Worker/PM/Finance/Owner browser proof at 360/390, 768 and 1440 remains after rebuilding current source. |
| CORE-15 Private files/security/audit | FAIL | Strong private-artifact helper and audit foundations exist. Step-up/header/DTO/IDOR/receipt checks pass; scanner finalization now requires the exact active fenced B5 run and current actor binding, and the human HTTP endpoint is fail-closed. Localized-PDF request/list/retry/download now recheck current and native-date assignment scope. MFA audit and a real scanner provider integration remain. |
| CORE-16 Durable jobs | PARTIAL | SQLite durability/fencing/systemd timer and independent artifacts exist. Accounting Pack lifecycle tests now match and prove queued/claimed/running/succeeded/dead-letter semantics, deterministic retries and independent-format failure; normal automatic runtime proof and the stale export-state adapter remain. |
| CORE-17 Deployment/health/backup | PARTIAL | Independently accepted readiness/storage/recovery code now has single-flight redacted health, exact migration contracts, BigInt disk thresholds, loopback-only Caddy health, symlink-safe private writes/artifact publication and rollback-safe backup/restore. Pinned Node 24 portal production build, focused tests and a realistic issued-invoice/private-artifact drill pass; live Caddy/VPS smoke remains. |
| Offline/PWA | CONDITIONAL | Await the go-live plant-connectivity decision. Existing offline work is preserved but does not block release until activated. |
| V3.1–V3.4 expansion | DEFERRED | Industrial platform, generic ERP/business, broad integrations and ML/data-readiness remain post-core roadmap and do not control `CLIENT READY`. |

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

- 🟨 Mobile drawer/full labels/focus/scroll-lock implementation exists; finish bounded QA.
- ✅ Shared form/card primitives are implemented and tested.
- 🟨 Invoice preview / Modify Report work exists; finish real mobile/desktop verification.
- ⬜ Core Worker, PM, Finance and Owner flows usable at phone/tablet/desktop.
- ⬜ No unreadable finance forms or compressed critical tables.
- ⬜ Visible focus, persistent labels and understandable validation on core forms.
- ⬜ Representative browser proof at 360/390, 768 and 1440.
- ⏭ Separate blocking QA at 430/1024/1280/1920 if responsive behavior is already covered; smoke-check instead.
- ⏭ Migrating every existing screen to new primitives is not required if the screen is already usable.

# C. Authentication, users and RBAC

- 🟨 Auth/security foundations exist.
- ✅ Invitation-only production user activation lifecycle works (independently security-reviewed; 20 focused tests PASS).
- ⬜ Owner/Admin, Finance, PM and Worker permissions are enforced server-side.
- ⬜ Assignment dates affect access.
- ⬜ Worker cannot access client rate/internal cost/margin/other-worker pay.
- ⬜ PM DTOs exclude Finance-only fields.
- ⬜ Sensitive Finance/Admin actions require step-up.
- ⬜ IDOR tests prove guessed IDs cannot cross worker/project boundaries.
- ⬜ Service/background actor path cannot be forged by a normal user.
- ⬜ Security review of these core paths passes.

# D. Clients, projects and assignments

- ⬜ Client create/view/edit/archive/restore.
- ⬜ Project create/view/edit/activate/close/archive/restore.
- ⬜ Worker assignments with start/end dates and history.
- ⬜ Project manager assignment/scope.
- ⬜ Project commercial configuration: currency, budget/PO, billing model and cadence.
- ⬜ Draft deletion only where safe.
- ⬜ Final/finance-bearing history never hard-deleted.
- ⏭ Full rich client CRM metadata beyond billing/operational essentials.

# E. Time and worker pay

- 🟨 Core time/timesheet foundations already exist.
- ⬜ Worker can create/edit/delete Draft time.
- ⬜ Worker can submit time.
- ⬜ PM can approve/reject.
- ⬜ Approved time locks and corrections are audited.
- ⬜ Regular, standby, overtime and travel time work.
- ⬜ 10h Mon–Sat is planning/commercial configuration, never fabricated actual time.
- ⬜ Hourly/daily/fixed compensation works where configured.
- ⬜ Percentage-of-eligible-client-labor compensation works where configured.
- ⬜ Worker sees own pay estimate only.
- ⬜ Internal loaded cost and client bill rate remain separate.
- ✅ Missing/overlap/impossible-duration validation catches obvious errors and survives real competing writers (independently reviewed; 13/13 focused PASS).
- ⏭ Copy-previous-day/repeat-week shortcuts can follow after go-live.

# F. Expenses and receipts

- 🟨 Expense foundations exist.
- ⬜ Worker creates/edits/submits expense.
- ⬜ Receipt photo/PDF upload works from phone.
- ⬜ PM/Finance approval works.
- ⬜ All-in expense increases project cost but does not become reimbursable invoice line.
- ⬜ Reimbursable approved expense enters expense billing stream.
- ⬜ Who-paid and reimbursement state are recorded.
- ⬜ Approved expense correction is audited/non-destructive.
- ⬜ Private receipt download is authorized.
- ⏭ OCR.
- ⏭ Mileage subsystem unless the client specifically needs it.

# G. Daily and PLC/technical reports

- 🟨 Report foundations and Modify Report UI exist.
- ⬜ Daily report Draft → Submit → Approve flow.
- ⬜ PLC/technical report Draft → Submit → Approve flow.
- ⬜ Problem/diagnosis/change/result/safety flag fields.
- ⬜ Technical attachments/private downloads.
- ⬜ PLC backup attachment/history with hash, author and timestamp.
- ⬜ Customer-visible reports exclude internal financial/private notes.
- ⏭ Plant → Area → Line → Station hierarchy.
- ⏭ Full automation asset registry.
- ⏭ FAT/SAT/commissioning module.
- ⏭ Punch lists.
- ⏭ Closeout-package builder.
- ⏭ QR/photo-annotation/knowledge-base features.

# H. Approval workflow

- ⬜ Time approval.
- ⬜ Expense approval.
- ⬜ Daily report approval.
- ⬜ PLC/technical report approval.
- ⬜ Finance billability approval where money is affected.
- ⬜ Reject/reopen/correct with reason and audit.
- ⬜ Owner override requires reason.
- ⏭ Dedicated universal Approval Center if domain-level approval screens are sufficient.
- ⏭ Bulk approval framework until real volume justifies it.

# I. Finance and project profitability

- 🟨 Exact-money and finance foundations exist; current R6.x contract work is broader than the client UI need.
- ⬜ Exact monetary calculations persisted safely.
- ⬜ Worker compensation, internal labor cost and client revenue remain separate.
- ⬜ Per-worker/per-category rate overrides work where required.
- ⬜ Standby/minimum-day and overtime rules work independently for worker/client.
- ⬜ Direct project cost includes relevant travel/expenses.
- ⬜ Project budget/PO vs actual.
- ⬜ Approved unbilled WIP.
- ⬜ Invoiced revenue.
- ⬜ Collected cash and outstanding AR.
- ⬜ Contribution / direct project result and margin %.
- ⬜ Finance view reconciles to approved source rows.
- ⬜ Finalized finance history cannot be silently reinterpreted.
- ⏭ Full versioned forecast/EAC engine.
- ⏭ Change-order subsystem.
- ⏭ Travel-leakage analytics beyond correct expense/cost treatment.

# J. Billing and invoices

- 🟨 Invoice preview/presentation exists.
- ⬜ Labor and expense streams can be configured independently.
- ⬜ Weekly / 14-day / semi-monthly / monthly / custom / milestone/manual periods needed by J&A.
- ⬜ Approved source rows are selected deterministically.
- ⬜ Duplicate billing is prevented.
- ⬜ Invoice drafts generate automatically or from a normal Finance action.
- ⬜ Finance explicitly issues invoice.
- ⬜ Unique numbering.
- ⬜ Issued invoice snapshot/PDF immutable.
- ⬜ Void/Credit/Adjustment correction path.
- ⬜ Labor and expense tax profiles remain independent.
- ⬜ Normal workflow does not require manual “process jobs”.
- 🟨 One reusable renderer can provide the five controlled business layouts; do not build five independent systems.
- ⏭ Automatic invoice send by default.
- ⏭ Jurisdiction-specific statutory tax engine.

# K. Payments and ledger

- ⬜ Record full payment.
- ⬜ Record partial payment.
- ⬜ Received date/reference.
- ⬜ Outstanding balance updates exactly.
- ⬜ Invoice/Cost/Collection ledger shows invoice, cost, collected, outstanding and contribution.
- ⬜ Payment/reversal behavior is auditable.
- ⏭ Bank payment execution.
- ⏭ Bank statement import/matching.
- ⏭ Full general ledger.

# L. Essential reports and Accounting/Finance exports

- 🟨 Reporting package exists but catalog/lifecycle is incomplete.
- ⬜ Daily/PLC operational report.
- ⬜ Customer period report.
- ⬜ Project internal finance/profitability report.
- ⬜ Worker compensation/statement report.
- ⬜ Invoice/collection ledger report.
- ⬜ Monthly Accounting/Finance export.
- ⬜ PDF for customer/official documents.
- ⬜ XLSX or CSV for finance/accounting tables.
- ⬜ Invoice and expense CSV registers.
- ⬜ Monthly totals reconcile exactly to underlying sources.
- ⬜ Finalized export revision cannot be silently rewritten.
- ⬜ Pending/failed output has explicit UI/API state, not HTTP 500.
- ⬜ Retry is idempotent.
- ⬜ PDF failure does not destroy/prevent independent CSV/XLSX output.
- ⬜ Semantic filenames.
- ⏭ JSON export unless a real consumer needs it.
- ⏭ ZIP packs unless Accounting requests them.
- ⏭ Separate Artifact Center and incident-management UI.
- ⏭ Dozens of separately engineered reports that can instead be filters/views of the six core report families.

# M. Lifecycle and correction semantics

- ⬜ Draft operational records can be safely edited/deleted.
- ⬜ Submitted records can be rejected/reopened with audit.
- ⬜ Approved records are locked.
- ⬜ Post-approval corrections preserve prior truth.
- ⬜ Issued invoices are immutable.
- ⬜ Final accounting exports are versioned/frozen.
- ⬜ No hard delete of financial history.
- ⏭ Complex autosave conflict/recovery/compare/discard framework unless real user testing shows it is needed.
- 🟨 Basic dirty-navigation warning for long forms is desirable but not a blocker if drafts save reliably.

# N. Private files, uploads and downloads

- 🟨 Storage-key/hash/security foundations exist.
- ⬜ Authorize before final file write.
- ⬜ MIME/extension/size validation.
- ⬜ Safe filenames/storage paths.
- ⬜ Receipt/report/invoice/PLC files are private.
- ⬜ Every private download checks permission.
- ⬜ Sensitive download/audit behavior where required.
- ⬜ Production scanning fails safely or the scanning adapter is explicitly disabled with bounded accepted risk; it must not fake success.
- ⏭ Full document-management platform.

# O. Background jobs

- 🟨 Durable job/timer foundations exist.
- ⬜ Production runner automatically advances normal report/invoice/export jobs.
- ⬜ Money-related jobs are idempotent.
- ⬜ Failed generation is visible and retryable.
- ⬜ No hidden user dependency on manual processing.
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
- [ ] Reference hours are configurable per project (for example 10/12/14) and remain independent from real worked hours.
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
