# Digital workers evidence ledger

**11 October 2026 · branch `codex/digital-workers-20261011` · base `27e57872` · not deployed**

This ledger records the implemented scope and local candidate validation. It is not a release verdict. The separate UX refresh worktree must be integrated and rechecked before deployment. The [English operating guide](../../manuals/Digital_Workers.md) is a working guide for this branch, not a claim that these screens are live.

## Implemented surfaces and authority boundaries

| Surface          | Source of truth and effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker capture   | [Capture service](../../../packages/database/src/domains/field-capture/index.ts) creates Time, Daily report and Expense **drafts** together after current assignment/session checks and factual confirmation. An actor-scoped durable receipt makes a matching retry idempotent. Existing record submission and approval remain separate.                                                                                                                                                                                |
| Local input aids | [Text draft store](../../../apps/portal/src/lib/portal/field-capture/local-draft.ts) keeps values per user/project/date in browser IndexedDB. [Local PDF/image text helper](../../../apps/portal/src/lib/server/local-document-text.ts) uses Poppler `pdftotext` for text PDFs and Tesseract for PNG/JPEG, with process and output limits; its result is a draft aid. [Dictation guard](../../../apps/portal/src/lib/portal/local-dictation/local-dictation.ts) requires browser `processLocally` and an installed pack. |
| Coordination     | [Case and work-item repository](../../../packages/database/src/domains/digital-workers/index.ts) records an exact project/stream/period/scope source manifest, current versions, dispositions, report/conformity/follow-up identity and immutable revisions/events. Work items track explicit owner, due date, evidence, classification and decisions.                                                                                                                                                                   |
| Finance handoff  | The case review is separate from source approval and invoice approval. A current reviewed, eligible labor/expense case rechecks sources inside an immediate transaction and calls the canonical selected-invoice composer. The result is an invoice **draft**. The case then becomes a historical handoff; invoice lifecycle authority remains in the existing workflow. Other billing streams use their existing path.                                                                                                  |
| Follow-up        | [Notification projection](../../../packages/database/src/domains/notifications/digital-work-followup.ts) emits one in-app due notice per item/owner/deadline, checking live membership and current state at read time. It does not send mail or make financial decisions.                                                                                                                                                                                                                                                |
| Persistence      | [Migration 0077](../../../migrations/0077_digital_work_coordination.sql) adds cases, immutable revisions/reviews/events, work-item events, audit actions, and idempotency receipts. [Migration contract](../../../migrations/contracts/ja-b5-migration-contract-v1.json) is updated. The database and private artifacts belong in the existing backup/restore unit.                                                                                                                                                      |

The code has no external AI/model call or required hosted key. The production [portal Dockerfile](../../../deployment/Dockerfile.portal) installs Poppler utilities, Tesseract with English/Spanish/Portuguese data, and `util-linux` for local process limits. [Tesseract's own command documentation](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage) identifies `-l` language selection; [Poppler](https://poppler.freedesktop.org/) is the PDF reader's upstream project. For dictation, MDN describes [`processLocally`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally) and on-device [`available()`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static) as experimental browser features. This implementation checks local availability and does not request a cloud fallback or download a pack.

## Local verification

**109 distinct focused tests pass across the completed runs.** The broad run covered
62 tests: 47 passed in ten unaffected suites; two suites were rerun after correction
and passed 15/15. Assistant catalogue/matcher tests add 44/44. The final localized error-copy checks add 3/3 ([agent command receipt](copy-validation-agent-receipt.json)); their raw console output was not saved. The initial five
failures are retained in the log: four came from an older notification fixture
without live sessions, and one from a process that had imported the repository
before the retry-key normalization fix. All five are covered by the final rerun.
The final finance-only policy-owner creation/reassignment guard was then checked by an additional [8/8 case rerun](logs/policy-owner-cases-final.log). No authorization assertions were removed. Receipts:
[broad run](logs/focused-final.log), [corrected suites](logs/case-notification-final.log),
[assistant tests](logs/assistant-final.log), [final migration checks](logs/migration-final.log),
[database types](logs/database-typecheck-final.log), [portal types](logs/portal-typecheck-final.log),
[scoped lint](logs/lint-final.log), [final layout lint](logs/layout-lint.log),
[job builds](logs/jobs-build-final.log), and [UX patch compatibility](logs/ux-apply-check.log).

| Check                               | Final evidence                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cases and notifications             | 15/15: exact selected-source invoice drafts, all-source review invalidation, immutable handoff, same-key retries including whitespace normalization, current assignments/roles, scope decisions, typed manual proposals assigned only to Owner/Finance, private evidence projections, and legacy notification behavior. |
| Capture                             | 4/4: atomic linked drafts, retry receipts, exact money and live assignment/session checks. Local draft unit: 1/1.                                                                                                                                                                                                       |
| Private evidence and recovery       | 3/3: actual file hashes, authorized metadata, current report/conformity binding, scanner restrictions, preservation of hidden evidence, rejected unauthorized evidence creation, and real database plus private-file backup/restore.                                                                                    |
| Migrations                          | 4/4: fresh schema77 and populated76→77, preserved historical metadata/financial rows, protected append-only records, foreign keys/integrity, repeat safety; historical75→76 test explicitly retains its original scope.                                                                                                 |
| Existing billing/report regressions | 29/29: canonical invoice composition and period follow-up.                                                                                                                                                                                                                                                              |
| Local input tools                   | 4/4 real Poppler/Tesseract/plain-text tests and 1/1 guarded local dictation test. English image OCR was exercised; Spanish/Portuguese packs are configured in Docker but not installed on the test host.                                                                                                                |
| In-app work reminders               | 1/1: due dates, deduplication, assignment withdrawal, completed/reassigned items and no email effects.                                                                                                                                                                                                                  |
| Discovery                           | 44/44 assistant catalogue/matcher tests.                                                                                                                                                                                                                                                                                |
| Static checks                       | Database and portal package typechecks and changed TypeScript/Svelte ESLint pass. Production portal build passes as part of the browser runner; both jobs bundles build successfully. Existing broader Svelte-check baseline diagnostics are not claimed resolved by this branch.                                       |
| Browser                             | 22 distinct current-candidate tests pass across 360/390/768/1440: 15 responsive flows, six desktop checks and the corrected multilingual desktop check. Eight desktop main-content axe scans cover five workspace roles, capture, and fresh/reviewed invoice cases; sampled keyboard interactions also pass.            |

The broader Svelte-check run reports **84 errors and 10 warnings**, with no errors in changed portal files; the [scope receipt](svelte-check-scope.json) lists the affected unmodified files. This branch does not claim that the global Svelte-check gate passes. The [source checksum receipt](candidate-source-sha256.json) identifies the reviewed implementation and test files.

The [Playwright suite](../../../tests/e2e/digital-workers.spec.ts) uses its own
5174 server and disposable generated accounts/database. It performs real OCR,
local-draft recovery, keyboard submission, exact draft creation and HTTP retry,
current/stale Finance review, source additions, one invoice draft, PM/Worker
handover, role denial, unchanged billing/pay after a policy proposal, Spanish
Owner and Portuguese Auditor views, viewport/card bounds and touch-target checks.
It captures screenshots and fails on new-page runtime errors or workflow HTTP500s.

The [browser summary](browser-summary.json) records the final 22 distinct outcomes across three runs, not a claim of one uninterrupted matrix. Receipts: [responsive 15/15](logs/swarm-browser-responsive-final.log), [desktop six passes](logs/swarm-browser-desktop-six.log), and [corrected multilingual desktop 1/1](logs/swarm-browser-desktop-language.log). Earlier failures remain available: [a missing accessible-name matcher argument](logs/swarm-browser-initial-harness-failure.log), [actual insufficient muted-text contrast](logs/swarm-browser-contrast-failure.log), and the desktop-six run’s incorrect expectation of HTTP400 transport instead of a Svelte enhanced-action failure status400 inside HTTP200. The matcher and protocol assertion were corrected; contrast was fixed in the application. No assertion or accessibility rule was disabled. Committed log copies normalize trailing whitespace only; original run files remain in local `artifacts/digital-workers-validation/`. The older `browser-matrix.log` records the preliminary 20-flow run before these expanded checks. Screenshots in [screenshots/](screenshots/) show the final enhanced forms. Axe coverage is limited to desktop main content and is not a certification of the whole application or a complete keyboard journey.

Independent review found and closed: misleading post-invoice case state,
selected-source reconciliation, evidence integrity/metadata privacy, local draft
scope overwrites, owner choices after changing projects, and nested desktop form fields overflowing their cards, incomplete capture review summaries, and inaccessible policy owners. Capture validation now uses localized allowlisted messages and preserves values; readiness failures give source-register recovery guidance without returning raw reason objects. The final accessibility run also caught insufficient muted-text contrast on the workspace; the workspace and case fallbacks were darkened. The review screen now lists every populated report/expense fact, validates required fields before advancing, and provides translated record links. An independent final review also approved the localized error mapping, preserved input and contrast changes. Final finance/security
and integration code review approved the scoped candidate. This is not a global
Client Essential release signoff.

The implementation's OCR input cap is **8 MiB**. It reads at most **20 PDF pages**, returns at most 20,000 characters from the server helper, and presents at most **10,000 characters** in the UI review field. Text can be wrong or incomplete and does not attach or authenticate the original. The local draft stores text/form values only; attachments have no offline queue. Real-device microphone use has not been tested. A case evidence reference marked `current` identifies a current authorized and eligible source record; it is not a statement of physical completion or customer signature. Customer conformity, report sign-off and invoice approval remain their respective canonical workflows.

## Integration and release

See [the integration handoff](INTEGRATION_HANDOFF.md). The separate UX tracked patch
passes a textual apply check against this worktree. Its shared `repository.ts`
change and our notification adapter are separate edits. Both branches still need
combined runtime validation and one coordinated release. Production remains
`workflow-06bdf74560f71ee0c488`; this work changed no production database, services
or deployment pointers. The Client Essential global verdict is unchanged.

Semantic interpretation of freeform reports, automatic report prose, and
interpreting emails/contracts were skipped under the no-model constraint. A hosted
key is one possible future implementation choice; a locally hosted model could
also supply those capabilities. Neither is needed for the features in this branch.
