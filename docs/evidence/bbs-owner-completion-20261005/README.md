# BBS Owner workflows and operating manual — October 5, 2026

This evidence separates application behavior, isolated training transactions and production deployment. The work was explicitly authorized to use parallel agents, publish to `main`, and deploy to production. Production invoice numbering still requires genuine accountant approval; test timestamps in the isolated fixture are not an assertion that an accountant approved a company policy.

## Work packets and dependencies

| Packet | Scope | Essential requirements | Dependencies |
| --- | --- | --- | --- |
| Finance verification | Worker settlement vs invoice cadence, source units, project context, final invoice lifecycle, collections/reimbursement/accounting | CORE-03, CORE-10, CORE-11, CORE-12; financial historical truth | Isolated runtime and copied fictional BBS sources |
| Owner browser verification | Team/access/assignments, reports, correction states, planning, suppliers, Owner navigation | CORE-01 through CORE-09; role/date access and report version truth | Isolated runtime; no outgoing mail or production business writes |
| Manual and artifacts | Exact procedures, screenshot corrections, final training invoices, landscape XLSX views, native downloadable assets | Owner operating documentation and existing Help authorization | Finance/Owner evidence; original application-produced PDFs/XLSX |
| Parent integration | Scope/privacy review, focused tests, typecheck/lint/build, independent review, GitHub fast-forward and deployment smoke | Repository release invariants | Verified code and rendered manual |

Agents use separate Chromium contexts and share the candidate source. Heavy builds are serialized and other checks use bounded concurrency/heap limits after the first parallel batch exceeded host memory. The production application remained available. Resource failures are not application workflow failures; interrupted checks must be rerun.

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
| Final manual integrity/layout | **PASS**, final 203 pages / 68 landscape / 101 figure assets including all 18 native-cell workbook range views, no missing images/overflow; unchanged six annex page streams and six attached originals. [Verification](../../manuals/bbs-manual-verification.json), [visual review](../../manuals/bbs-manual-visual-review.md). |

The earlier failed discovery runs are preserved with qualifications; they are not presented as passing complete suites. Corrective changes supplied real live Worker sessions, current migration/version and empty-phone expectations, per-invoice unique integrity fixtures, the pinned Node 24 transform flag for the Accounting worker, and current canonical/UI contracts. No money/security behavior assertion was removed to conceal a regression.

## Scope and remaining prerequisites

This is a scoped manual/UX/security release. Three canonical final documents are genuinely application-issued in the isolated training database, rather than PDFs with watermarks erased. Production invoices were not issued using a fabricated approval. Recommended future policy: prefix `JA-USA`, six digits, effective 2026-10-05, producing `JA-USA-2026-000001`; the approval timestamp must come from genuine accountant approval.

The saved October 1–5 Accounting Pack is blocked by the already-archived QA-W48-EUR issuer: its revision ends on October 5 (exclusive), so it does not cover the October 5 23:59:59.999 UTC period cut. Historical portfolio sources still refer to that issuer. JA-USA is covered and is not the cause. Pages 168–169 of the previous 178-page edition explain the distinction between retaining form dates and generating a pack. The observed failure retains scope and gives Contact support. Broader Owner reference chapters and external approval/signature/dispatch/bank processes are qualified individually in the manual and workflow matrices. This evidence does not certify every Owner lifecycle or universal independent-novice training success.

## Supplemental course and financial completion

The course now follows access/setup → actual work/review/corrections → reports/acceptance → invoice/collections/worker payments → exports/reconciliation → closure/administration. Every worked page identifies its environment and snapshot. Portal hyperlinks explicitly say **live**; consequential training chapters require an operator-provided isolated URL/account, visible identity, allowed scope and reset/support route. They are read-only demonstrations until that access exists.

Actual isolated browser packets added supplier creation/profile/authorization/personnel assignment and access removal, zero-work project close/archive, planning/expertise/availability modification and cancellation, financial-only document upload/download/Worker denial/archive, and explicitly synthetic acceptance/invalidation/replacement-report readiness. These are bounded tests, not universal novice or security-configuration acceptance. [Access/supplier](access-supplier/README.md), [secondary Owner](secondary-owner/README.md), [documents/cost references](editorial/cost-model-and-reference-procedures.md), [synthetic sign-off](signoff-completion/README.md).

The new all-synthetic October Accounting example successfully generated, downloaded all five native formats with authenticated hash/length checks, showed zero review advisories and finalized. It preserves August operational costs in August while including October-issued invoices and required immutable older child evidence; void-as-of documents are excluded from that cut while ledger/master history remains. [Native lifecycle and exact scope](financial-completion/README.md), [receipt](financial-completion/accounting-october-success-receipt.json). This does not repair the separate original clone's issuer-history gap. Existing non-UTC near-midnight producer/canonical cut differences remain an identified follow-up; the successful new example and boundary fixture use UTC.

Compatibility evidence covers all 82 cases across qualified runs: the discovery run passed 78; the failed native concurrency case, two action cases and historical-migration case passed their focused reruns. There was no claim that a later single full 82-case invocation passed. Current native TypeScript workers use the pinned Node 24 transform flag, the strictly guarded demo seed creates genuine Worker/manager sessions with unchanged roles/project scope, and schema-47 fixture creation uses a temporary identity view only, removed before upgrade. Financial/history/security assertions remain intact. [Discovery](financial-completion/accounting-compatibility-tests.log), [concurrency](financial-completion/accounting-concurrency-loader-rerun.log), [actions](financial-completion/accounting-action-native-session-rerun.log), [migration](gates/root-signed-credit-migration-final.log).

New cross-month/void/provenance boundary regressions passed **8/8** and Technical narrative/escaping/locale/immutable-input regressions passed **8/8**. Period pages display human-readable Technical fields; future PDF rendering uses the same known schema. Existing v2/v3 native report masters remain historical artifacts. Sign-off hashes and decorative signature fields wrap within the phone viewport: actual rebuilt UI at 1440/390, CSP enabled, zero page errors or business POSTs, zero phone overflow. [Runtime receipt](editorial/technical-readability-runtime.json).

The costing explanation retains all workbook values. USD 1,520 configured labor cost versus USD 2,100 compensation is a USD 580 basis mismatch to investigate, not an instruction to add compensation twice. The conditional replacement-cost contribution is explicitly separate from the displayed configured contribution and from cash/profit. Final PDF is 8,030,413 bytes / SHA256 `803dcab002f17ad09c618d836544625473a19c3498b551f3c4fb6c2d7ec32991`. Final manual integrity/layout, native annex and attachment hashes are in [verification](../../manuals/bbs-manual-verification.json) and [visual review](../../manuals/bbs-manual-visual-review.md).

Final workspace typecheck, scoped eleven-file ESLint/Prettier, production Portal build after the phone fix and production jobs build all passed. Exact supplemental source hashes and gate links are in [the final gate binding](gates/final-supplemental-gates.json).

## Deployment

**PASS.** Source commit `6e98f345cfaec87ffa55bc73e3b97f3093816d59` was fast-forwarded to GitHub `main` and deployed through the installed canonical ZIP entrypoint. Archive SHA256 is `af7733ebe5e33b9238f70c90d1d4554727d63ecffa7bd86122c9e37d9900d641`; activation completed 2026-10-05 22:11:02 UTC (6 October 00:11:02 Madrid). Rollback images were retained, the canonical online database/documents backup independently passed immutable read-only hash/quick-check/FK verification, and jobs service actor/local/public health gates passed. The temporarily paused ZIP watcher was restored; ZIP/jobs/backup timers are active.

Authenticated production Help/manual download matches the reviewed PDF exactly (`803dcab…32991`, 8,030,413 bytes). Finance preserves the selected BBS project/language; 390px page has no overflow or errors. All twenty protected financial/source/issuer tables retain their predeployment counts and hashes, SQLite quick check is `ok`, foreign-key errors zero, and issued production invoice count remains zero. No synthetic approval, issuance, collection, compensation payment or customer acceptance was written in production. This publishes the application changes and issued **training** annex, with genuine business approvals still required.

The first read-only smoke probe used the intentionally operator-only `/health/ready` through the public host and got its configured 404. The corrected check uses canonical loopback readiness plus public `/app/api/health`; both returned 200. Caddy's private-health boundary was retained. This was a harness URL correction, not a product routing change.

[Deployment receipt](production-deployment.json), [backup verification](production-backup-verification.json), [live browser receipt](production-browser-smoke.json), [financial preservation](production-after.json), [eleven reviewed source files and running images](production-release-check.json). The follow-up evidence-only Git commit records these completed operations; the deployed application/manual source remains the reviewed `6e98f345` candidate.
