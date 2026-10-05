# BBS Owner workflows and operating manual — October 5, 2026

This evidence separates application behavior, isolated training transactions and production deployment. The work was explicitly authorized to use parallel agents, publish to `main`, and deploy to production. Production invoice numbering still requires genuine accountant approval; test timestamps in the isolated fixture are not an assertion that an accountant approved a company policy.

## Work packets and dependencies

| Packet | Scope | Essential requirements | Dependencies |
| --- | --- | --- | --- |
| Finance verification | Worker settlement vs invoice cadence, source units, project context, final invoice lifecycle, collections/reimbursement/accounting | CORE-03, CORE-10, CORE-11, CORE-12; financial historical truth | Isolated runtime and copied fictional BBS sources |
| Owner browser verification | Team/access/assignments, reports, correction states, planning, suppliers, Owner navigation | CORE-01 through CORE-09; role/date access and report version truth | Isolated runtime; no outgoing mail or production business writes |
| Manual and artifacts | Exact procedures, screenshot corrections, final training invoices, landscape XLSX views, native downloadable assets | Owner operating documentation and existing Help authorization | Finance/Owner evidence; original application-produced PDFs/XLSX |
| Parent integration | Scope/privacy review, focused tests, typecheck/lint/build, independent review, GitHub fast-forward and deployment smoke | Repository release invariants | Verified code and rendered manual |

Agents use separate Chromium contexts and share the candidate source. Heavy checks are serialized after the first parallel batch exceeded host memory. The production application remained available. Resource failures are not application workflow failures; interrupted checks must be rerun.

## Evidence status

The core packet checks and independent whole-change review passed. The supplemental Owner browser pass and canonical production deployment are recorded separately below as they finish. Production baselines are read-only hashes rather than customer or worker financial rows.

| Final check | Result and evidence |
| --- | --- |
| Issued artifact / invoice preview / Worker compensation | **27/27 PASS**: `tests/security/issued-invoice-artifact-immutability.test.ts` (11), `tests/regression/invoice-preview-ui.test.ts` (13), `tests/integration/worker-compensation-essential.test.ts` (3). [Final log](gates/root-last-finance-gates.log). |
| Accounting artifact lifecycle | **13/13 PASS**, including asynchronous running lease, ready/failure paths and independent formats. [Final log](gates/root-accounting-artifact-final.log). This deterministic fixture result does not remove the saved clone's genuine issuer-date gap. |
| Owner time detail permissions | **12/12 PASS**, including wrong role/actor and protected states. [Log](gates/root-correction-gate.log). |
| Manual catalog / protected download / retry / report UI | **24/24 PASS**, comprising 15 manual cases and 9 report cases. [Final log](gates/root-manual-report-final.log). |
| Assignment commercial terms / finance reversal / invoice lifecycle | Passed in the earlier serialized lifecycle run; its three unauthenticated Worker-fixture failures were corrected and passed in the 27-case final run above. [Qualified discovery log](gates/root-lifecycle-gates.log). |
| Broader private artifact authorization/session/audit and affected Finance UI | Six files passed in the discovery run. Its new issued-PDF fixture and obsolete preview assertions were corrected and passed in the 27-case final run. [Qualified discovery log](gates/root-security-ui-gates.log). |
| Report/Accounting failure and finalization helpers | Five files passed in the discovery run; Accounting worker native-TypeScript flag and obsolete report UI assertions were corrected and passed in the 13/24-case final runs. [Qualified discovery log](gates/root-report-accounting-gates.log). |
| Workspace typecheck | **PASS**. Fresh worktree first needed Next route/image type generation; no website source change was required. [Final log](gates/root-workspace-typecheck-final.log). |
| Scoped lint and formatting | **PASS**, 31 changed TypeScript/Svelte files and all changed code formatting. [Lint](gates/root-lint-final.log), [format](gates/root-format-final.log). |
| Production portal build and jobs build | **PASS** with a separate build-only database/identity. [Portal](gates/root-build-final.log), [jobs](gates/root-jobs-build.log). |
| Actual invoice toolbar | **PASS**, desktop/phone, readable controls and Paid badge contrast 8.01:1. [Receipt](invoice-toolbar-check.json). |
| Fresh migrations and immutable invoice metadata | **6/6 PASS** against the checked-in migration set, including protected issued truth. [Final log](gates/root-migration-final.log). |
| Backup/restore and continuity | **20/20 PASS** in deterministic temporary fixtures. [Final log](gates/root-backup-restore-final.log). Canonical production predeployment backup remains separately required. |
| Independent whole-change review | **SHIP**, no blocking findings; independently checked native annex streams and all embedded asset bytes. [Review](integration-review.md). |
| Final manual integrity/layout | **PASS**, 178 pages, 59 landscape, 18 native-cell workbook views, no missing images/overflow; unchanged six annex page streams and six attached originals. [Verification](../../manuals/bbs-manual-verification.json), [visual review](../../manuals/bbs-manual-visual-review.md). |

The earlier failed discovery runs are preserved with qualifications; they are not presented as passing complete suites. Corrective changes supplied real live Worker sessions, current migration/version and empty-phone expectations, per-invoice unique integrity fixtures, the pinned Node 24 transform flag for the Accounting worker, and current canonical/UI contracts. No money/security behavior assertion was removed to conceal a regression.

## Scope and remaining prerequisites

This is a scoped manual/UX/security release. Three canonical final documents are genuinely application-issued in the isolated training database, rather than PDFs with watermarks erased. Production invoices were not issued using a fabricated approval. Recommended future policy: prefix `JA-USA`, six digits, effective 2026-10-05, producing `JA-USA-2026-000001`; the approval timestamp must come from genuine accountant approval.

The saved October 1–5 Accounting Pack is blocked by the already-archived QA-W48-EUR issuer: its revision ends on October 5 (exclusive), so it does not cover the October 5 23:59:59.999 UTC period cut. Historical portfolio sources still refer to that issuer. JA-USA is covered and is not the cause. Pages 168–169 explain the distinction between retaining form dates and generating a pack. The observed failure retains scope and gives Contact support. Broader Owner reference chapters and external approval/signature/dispatch/bank processes are qualified individually in the manual and workflow matrices. This evidence does not certify every Owner lifecycle or universal independent-novice training success.

## Deployment

Canonical backup/build/rollback deployment and read-only production smoke results will be appended after publication. No synthetic business transaction is authorized in production.
