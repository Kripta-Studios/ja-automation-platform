# Operational UX improvements — 2026-09-22

Request: inspect and improve the deployed J&A web application on this VPS, using subagents.
Baseline source: `728e523`; deployed runtime: `d7fbd72`. A read-only comparison confirmed all
2,538 files of that release match the installed source; the later commit only records evidence.

## Findings and implementation

1. **Accurate worker agenda (CORE-04 / planning):** Today previously selected `records[0]` from
   all non-cancelled planning records sorted oldest first. It now lists every assignment
   intersecting the UTC day, including overnight work, and separates upcoming assignments with
   explicit counts and progressive reveal. Dates and UTC match the existing planning contract.
   Planning never creates actual work time; project links use the authorized project projection.
2. **Resilient operational forms (CORE-04/06/07):** Expense create/edit and Daily/Technical
   report creation preserve live controls and selected receipts after validation, HTTP or network
   failures. Field errors are localized and saving state prevents duplicate submissions. A lost
   response is distinguished from confirmed save/refresh failure. Dates and an explicitly
   filtered authorized project are editable defaults.
3. **Unsaved work protection:** Time, Expense and Daily/Technical entry sheets protect dirty
   forms on Cancel, close, Escape and navigation/unload. Unchanged forms close directly; successful
   saves and offline resets do not produce a discard prompt. In-flight saves cannot be closed.
4. **Usable notification inbox:** Internal profiles can reach Notifications through the section
   navigator/account menu (and desktop header). Inbox filters All/Unread, explains its latest-50
   scope, provides explicit mark-read actions and access to notification details. Failures do not
   fabricate a read state. Existing user-scoped server authorization remains authoritative.
5. **Coherent navigation and project filters:** Active navigation considers the view discriminator
   while ignoring search/date filters; mobile no longer highlights two finance destinations.
   Ctrl/Command K has one owner and respects open forms. Project lists have one search/status
   filter authority, with sorting and pagination retained.

## Work allocation and dependencies

Read-only audits ran in parallel for UI/agenda, operational forms, and VPS deployment.
Implementation ownership was non-overlapping: agenda component/helper; expense/report components
and submission helper; navigation/Chrome/helper; parent-owned shared sheet, inbox, Shell integration,
project filtering, catalog integration and production checks. Existing production authorization,
financial calculations, history, database schema and mail policy are not changed.

Dependency order: grounded audits → parallel components/helpers → Shell/catalog integration →
focused units/types/lint → real-browser workflows and responsive evidence → independent review →
reviewed archive/deployment → live health and preservation checks. Review findings and test failures
are fixed before deployment and recorded in the final validation receipt.

## Validation

Baseline: six existing desktop browser tests passed (workspace navigation/date filters/week jumps,
Owner/Finance destinations, loaded typography and public-site accessibility).
Focused initial tests: 118 passed across nine files, covering agenda edge cases, role navigation,
Worker Today invariants and all locale catalogs. Production baseline: SQLite integrity OK, zero
foreign-key violations, eight financial table snapshots and 59 private files fingerprinted.

Final browser/build/review and deployment results are recorded below after execution. Browser
mutations use disposable synthetic databases, never production customer records. This bounded UX
release does not claim complete Client Essential contractual acceptance.

## Initial checks and corrections

The first desktop integration run passed 13 cases and exposed two test-selector mistakes:
Spanish All is `Todas`, and project card Status labels are distinct from the filter combobox.
Selectors were corrected without changing their expectations. The responsive project empty
state was moved outside the desktop table so it remains visible with mobile cards.

Broader static checks found an incomplete literal-key inventory (translations already existed),
a legitimate UTC abbreviation missing from the scanner allowlist, and assertions tied to the old
shortcut owner. Two ReportSection assertions were already stale at HEAD: status options are
dynamic and derived collections use `$derived.by`. Equivalent current assertions were recorded.
The corrected 65-test regression selection passes. The 118 earlier focused checks and nine
notification authorization/integration tests pass; Svelte reports zero errors and warnings.

The initial responsive run exposed test-isolation issues: an identical receipt reused between
viewports correctly received a 409 duplicate response, and synthetic inbox records interfered
with an older first-row selection. Each test now uses a distinct valid PNG and cleans its own
notifications. A native-reload test initially waited for a `load` event after the user cancelled
beforeunload; trace inspection proved no request/navigation happened and the wait expired at
teardown. The corrected test triggers reload without awaiting a cancelled page load. These
initial failures are retained as preliminary evidence, not reported as passes.

## Final release gates

- Browser matrix: 92 cases across 360/390/768/1440 px. First run: 82 passed, ten failed
  because of the fixture and cancelled-load test issues described above. The corrected focused
  rerun passed all 16 cases, covering every earlier failure plus the final inbox styling and
  cross-viewport notification isolation. All 92 distinct matrix cases now have passing evidence;
  this is not a claim that the initial run passed.
- Coverage includes expense create/edit/validation/network errors and receipts, report failures,
  filtered project defaults, unsaved form cancel/Escape/back/reload, localized notification links
  and selected mark-read actions, current navigation, UTC agenda/overnight/future/empty states,
  project/date/week filters, and Axe/keyboard/overflow checks for worker/manager/finance/owner/auditor.
- Automated checks: 118 focused unit/regression checks, 65 additional regression checks and nine
  notification authorization/integration checks passed (192 in those selections). Portal types,
  Svelte check (zero errors/warnings), changed-file ESLint, final formatting and diffcheck passed.
- Independent implementation reviews and deployment-procedure review: SHIP. The deployment
  wrapper was corrected to quarantine a failed candidate before restarting automatic watchers.
- Latest mobile inbox screenshot visually inspected after the final styling changes. Existing
  historical workspace screenshots restored; fresh copies retained under `workspace-after`.
- Authenticated tests used disposable synthetic databases. Production will be verified read-only
  for data preservation and via public browser requests after activation.

## Production activation and verification

Activated **2026-09-22 23:51:05 Europe/Madrid** (21:51:05 UTC) at the requested URL:
https://j-aautomation.com/j-aautomation/app

- Release archive SHA-256: `b30ae7b55a3f8afbe25aeae50e627f0b2c717439a898326932406cc197536d02`.
- Reviewed worktree snapshot: `0721986d94ba8e4f2126fdade296fd1e23a8a820`; base commit `728e523`.
  This is a reviewed source snapshot, not a claim of a newly pushed Git commit.
- Installed manifest verified: **2266 files**. All **604
  source files** under apps/packages/migrations/deployment/website match the reviewed worktree.
  All three new runtime helper/component files are present in the active release.
- Public Chromium checks: **12/12**, EN/ES/PT, site/login at 390/1440 px. HTTP 200,
  Geist loaded, no overflow, page exceptions or failed requests. Authentication flows were
  tested against disposable fixtures rather than real production customer records.
- Database integrity: OK; foreign-key violations: zero. All eight financial-table hashes and
  all 59 private-file fingerprints are unchanged from the pre-release snapshot.
- Pre-activation backup verified in an isolated SQLite copy, including all 59 private documents.
  Existing historical coverage remains 14/30 days; this release does not close that older gap.
- Site and portal Docker health: healthy. Worker: running with **17 successful
  cycles** checked and zero cycle/outbox errors. Worker intentionally has no Docker healthcheck;
  its evidence is running state plus actual cycle logs.
- All five checked services/timers/path units active, Caddy PID unchanged, and all **12**
  unrelated containers preserve their IDs and running state. No global container pruning ran.
- The first deployment invocation refused to move the candidate while an existing watcher scan
  was running; activation began only after that scan finished. A first post-deploy probe observed
  portal health still starting, with one 5-second cold-readiness timeout. A subsequent request
  returned HTTP 200 in 2.01 seconds and Docker health became healthy. These observations are
  retained rather than described as an error-free startup.

Receipts: `release-package.json`, `deployment.log`, `production-receipt.json`,
`production-before.json`, `production-after.json`, `backup-after.json` and
`production/browser.json`. Existing manuals and private artifacts were preserved; manual
screenshots/PDFs were not regenerated for this bounded UX release.
