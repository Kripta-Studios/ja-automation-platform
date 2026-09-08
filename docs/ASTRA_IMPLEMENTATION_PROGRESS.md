# ASTRA webapp implementation — 2026-09-08

Authority: `ASTRA_PLAN.md`, Client Essential specification/checklist and the current owner decisions in `AGENTS.md`. User authorized proceeding on 8 September and subsequently explicitly authorized commit, push and production deployment. Scope is core portal/public website improvements (Phases A–C); conditional ERP extensions retain their explicit real-example dependencies. This evidence does not replace human UAT approval.

Baseline: branch `codex/v3-production-completion-orchestrated-20260819`, HEAD `6ec7b8a7ba5b9eca00b88bc7062d2c8626bdde7e`. Initial working tree contained only untracked `ASTRA_PLAN.md`; preserve it. Use pinned Node 24.19.0 and pnpm 11.22.0. Dependencies installed with frozen lockfile. Production data, mail and services are outside test fixtures.

## Initial work ledger and dependencies (historical; current status below)

| Packet                                       | Findings | Dependencies / shared interfaces                                                                       | Status                                                                      |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| A1 acceptance/configuration register         | F01/F16  | Real agreement and accountant examples remain human inputs; existing commercial semantics control code | In progress                                                                 |
| B2 public intake and claim register          | F04/F05  | Existing public-inquiry endpoint; website-owned files only                                             | Implemented; parent 21-test combined run passed, 28-case integrated browser run passed |
| B3 effective reminders and business notices  | F03      | Existing schedules, approval states, durable jobs/outbox; integration before C1 follow-up              | In progress                                                                 |
| B4 versioned project closeout                | F02      | Additive immutable revisions, authorized artifacts, existing report sources                            | In progress                                                                 |
| B1 commercial explanation/preview            | F01      | Existing exact commercial engine; no reinterpretation of historical all_in                             | In progress                                                                 |
| B5 Help/manuals and task language            | F14/F15  | Existing role permissions, localized guides; refresh after UI changes                                  | In progress                                                                 |
| C1 period review and acceptance follow-up    | F07      | Existing exact source coverage and signed PDF lifecycle; B3                                            | In progress                                                                 |
| C2 cash/obligation view                      | F06      | Existing actual payments and approved obligations, currency/entity grouping; no bank balance invention | In progress                                                                 |
| Integrated verification and acceptance index | F16      | All changed packets, fresh tests/build/browser/artifacts                                               | In progress                                                                 |

All packets agree on preserving actual hours, independent pay/cost/sale, immutable issued history, optional MFA/no step-up, scoped DTOs, automatic jobs and truthful artifact states. Website B2 does not change portal or database interfaces without escalation. B3/B4/C1 share repository/job boundaries and must have exclusive write ownership. B1/B5/C1/C2 share portal navigation, translations and data loading and must integrate sequentially. Closeout's existing one-row snapshot cannot meet immutable final revisions: add revision history before exposing finalisation. No schema migration may repurpose historical values.

## Decisions and external inputs

- “All-in” in existing storage retains fixed-price semantics. Hourly work with included expenses uses existing hourly pricing and separate expense classifications.
- Preview uses explicit sample inputs/current configuration, never writes time or monetary records and never supplies missing production rates.
- Datasheet request means a durable request for team follow-up; no approved downloadable datasheet or automatic delivery is assumed.
- Expected cash movements remain separate from actual payments, grouped by currency and issuing entity. Unknown dates remain visible, not guessed.
- Customer handover must use an explicit safe allowlist and approved source documents; finance/private worker information cannot enter it.
- Original Excel, real commercial examples, tax/issuer approval, content/image approvals and human manual/UAT acceptance remain external inputs. Record limitations rather than claiming approval.
- No production deployment or external messages are part of local verification.

## Fresh evidence

- `corepack pnpm install --frozen-lockfile`: passed, 531 packages, lockfile unchanged.
- Baseline commercial/compensation/conformity run: 40 passed; one Chromium-dependent test initially blocked, passed after installing Chromium.
- Commercial preview: 7 exact-arithmetic unit cases and 2 real-session/security cases passed.
- Cash calendar: 5 disposable-database/source-reconciliation cases passed, including exact integers, currency separation, receipt dates, reimbursement evidence, unconfirmed compensation and role/session denial.
- Parent combined run after migration0040 registration: `vitest run tests/unit/astra-commercial-preview.test.ts tests/security/astra-commercial-preview.test.ts tests/integration/astra-cash-calendar.test.ts tests/unit/astra-aquarex.test.ts tests/integration/astra-public-intake.test.ts --no-file-parallelism`: **5 files, 21 tests passed** (8 September).
- Website implementer reported 14 focused tests, 255-page site build and isolated desktop browser success; parent reran the owned ASTRA tests above, integrated viewport validation remains pending.
- Portal TypeScript passed before closeout WIP. Full Svelte diagnostics exposed existing errors; affected FinanceOverview DTO omissions corrected. Do not claim full Svelte diagnostics pass yet.
- Added immutable closeout migration0040; fresh DB bootstrap succeeded after synchronizing its contract. Lifecycle/artifact tests remain in progress.
- New finance browser cases cover included/recoverable expenses, invalid-input retention, localized cash filters, touch/control bounds and Worker denial; execution pending integrated build.

## Review

Selected full route because changes cross finance/security/artifact/browser boundaries. Bounded implementation uses Luna Max; independent accumulated-diff review uses fresh Sol High. Parent validates actual changes and test evidence. Host filesystem permissions are unrestricted; any reviewer must remain behaviorally read-only and before/after state will be compared.

## Implementation decisions discovered in code

- Existing compensation `settled_at` records finalization, with no transfer reference. Cash therefore places finalized compensation without transfer evidence in a separate confirmation group excluded from actual and expected totals. Finance timeline now says compensation finalized, never implies a bank transfer.
- Invoice issuer uses its recorded canonical revision with a legacy billing-rule fallback. Expense reimbursements retain their original currency, never the FX project-cost estimate.
- Closeout and follow-up packet contracts are stored alongside this ledger; independent source/version/privacy checks remain required before candidate acceptance.

## Parent integration update — 8 September

- `playwright test tests/e2e/astra-finance.spec.ts tests/e2e/astra-help.spec.ts tests/e2e/astra-aquarex.spec.ts --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop`: **28 passed (2.4m)**. Real Finance/Worker/Owner sessions; all three Aquarex languages, failure retention/retry key, expense examples, cash filters, denied private routes and private manual downloads. Both application production builds completed in this run.
- Migration contract + operational readiness: **15 tests passed** including historical populated upgrades and transaction rollback. New reviewed versions40/41 added to test inventory; all previous literal migration hashes/legacy fixture projections retained.
- Shared controlled-value notification status and localized notification subjects integrated; standalone localization suite **18 passed**. Other UI/i18n suites from combined run passed39 tests; one stale notification translator assertion resolved and rerun as18pass.
- Earlier browser rounds were stopped on interrupted server processes, incomplete migration contract and Node strip-only unsupported constructor syntax. These were diagnosed and fixed; only the completed28-test run counts as matrix evidence.

## Additional parent verification — 8 September

- Notification lifecycle, localized copy, safe target paths and durable mail delivery: **4 files, 22 tests passed** (`/tmp/astra-notices-final3.log`). Regression cases cover persistent role demotion, assignment dates and the actual missing-time day. Browser verification is running separately.
- Commercial policy consumption, independent worker compensation, outbox delivery and customer-conformity billing gates: **4 files, 52 tests passed** (`/tmp/astra-core-regression.log`).
- Financial reversals and database/private-artifact backup/restore: **2 files, 8 tests passed** (`/tmp/astra-finance-backup-tests.log`).
- Portal translation coverage, standalone localized routes and safe notification targets: **3 files, 31 tests passed** (`/tmp/astra-current-ui-tests.log`).
- B4 and C1 remain under implementation and focused verification. The passing tests above do not certify those unfinished packets or deployment readiness.

## Production authorization and resumed verification

The owner explicitly authorized staging, committing, pushing and production deployment in this session. Deployment follows candidate verification, a verified production backup and preservation of the existing release for rollback. The earlier local-only scope is superseded for deployment; business approvals and conditional ERP inputs are still outstanding.

- Notification browser flow: **4 passed**, at 360/390/768/1440 widths (`/tmp/astra-notices-browser2.log`). The fixture reuses the unique reminder between viewports; application deduplication remains enforced.
- Security/privacy regression: seven files passed 44 tests; the remaining repository-privacy fixture needed an effective schedule and a project start before its historical reminder date. Its unchanged authorization assertions now pass: **2 tests** (`/tmp/astra-privacy-final.log`).
- Employee EN/ES/PT PDFs regenerated, five A4 pages each. Localized captions/footer and bilingual navigation labels inspected; parent inspected the Spanish contact sheet. Help catalog/download tests passed in the security run after regeneration.

## Current candidate status

| Packet | Current status |
| --- | --- |
| A1 | Configuration dictionary, synthetic examples and acceptance mapping complete; named real-agreement/accountant approvals remain external. |
| B1 | Exact commercial preview implemented; calculation/security/browser evidence passed. |
| B2 | Durable Aquarex request/retry and claim provenance implemented; EN/ES/PT browser evidence passed. |
| B3 | Effective-calendar reminders, business notices and private localized navigation implemented; 22 focused tests and four viewport journeys passed. |
| B4 | Revision/artifact workflow complete, including atomic next-draft reopen and exact confirmed snapshot verification; 12 lifecycle tests passed. |
| B5 | Private Help/manual distribution and localized five-page employee PDFs complete; authorized/denied download and browser evidence passed. |
| C1 | Scoped review and version-bound append-only follow-up implemented; 13 tests and four viewport follow-up journeys passed after corrections. |
| C2 | Source-backed cash calendar implemented; source/currency/role and browser evidence passed. Accountant workbook approval remains external. |

- Whole-workspace TypeScript passed. Extended Svelte validation: **0 errors**, seven pre-existing unused CSS warnings. Corrected type declarations/imports in invoice, project, Team Directory and MFA views; **30 relevant regression tests passed**.
- Parent security/notification/invoice-invariant regression: **7 files, 44 passed**. Production deployment helper regression: **7 passed**. Production database read-only quick check: `ok`, schema version39; current live readiness: `ok`.
- C1 HTTP tests exercise both review and period-detail rejection of returned/disputed events against effective signed conformity. Old conformity is invalidated before replacing the report in fixtures; SQL aliases match the scoped DTO. Follow-up preserves project/date/language filters, handles successful localized feedback, and withholds event submission for unversioned historical reports.
- Fresh Sol review returned `fix-first`: B4 must restrict reopen/create the next draft atomically and verify exact confirmed snapshot hashes at finalization. No additional B1/C2 finance or B2/B3/B5 security blockers were found. Final whole-candidate browser matrix and fresh review follow these corrections.

## Production backup and upgrade rehearsal

- Online production backup: `/var/backups/jaautomation/2026-09-08T214231695Z-c929bb6b-9374-4d88-9d6c-79b455488b2c`, 29 private documents. Database SHA-256 `dd283e0d8e49c99170291a38d48ac1ca3b70bac1562745ce4a10b2bb63c4dc19`. Retention disabled for this explicitly created backup.
- Restored and hash-verified in an isolated temporary directory: SQLite integrity `ok`, 29 documents, original schema39. Applied candidate migrations only to that restored copy: schema41, integrity `ok`, zero foreign-key violations (`/tmp/astra-production-upgrade-rehearsal.json`). Production was not migrated by this rehearsal.
- Existing live release retained for rollback: `/opt/jaautomation/releases/ja-automation-33a6a06ad271c63a9e335b2f594b4ec5dfcd2fbe156dff4831eb7b0f513f1c4d`.

## Final candidate verification

- Full ASTRA browser matrix: **44/44 passed (3.3m)** at 360/390/768/1440 widths, including Owner closeout/immutable downloads/reopen, Finance follow-up, Worker denial, finance calculation/cash, three-language Aquarex retry and private Help (`/tmp/astra-release-browser.log`).
- Closeout + follow-up integration/HTTP/UI: **25 passed** (`/tmp/astra-release-lifecycle.log`). Final transaction source/role recheck additionally verified with **12/12 closeout tests** (`/tmp/astra-closeout-final.log`).
- Migration/readiness and translated UI regression: **52 passed** (`/tmp/astra-final-migration-ui.log`). Full workspace types passed (`/tmp/astra-types-release-final.log`); Svelte has zero errors and seven pre-existing CSS warnings; changed-source ESLint and diff checks passed.
- Independent-review corrections: finalization recomputes both stored snapshot hashes, checks exact client confirmation, rechecks sources and live role in the final transaction; Owner reopen accepts only the latest closed unreopened final, creates the next draft atomically and rolls back if draft creation fails. Historical final bytes remain unchanged. UI shows Reopen only for the eligible latest final.
- Parent opened the customer ZIP and PDF with independent readers and verified all three manifest file hashes/lengths. Parent visually inspected commercial-preview and follow-up phone captures.
- The completed core implementation does not assert accountant workbook compatibility, public content rights approval, human UAT, or completion of conditional ERP phases D/E.
