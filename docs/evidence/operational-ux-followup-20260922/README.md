# Operational UX follow-up — 2026-09-23

User requested continuation after the 2026-09-22 b30ae7 deployment. This release improves
existing workflows without changing database schema, exact-money semantics, permissions or
financial lifecycle rules.

## Grounded findings and scope

- Time entry used a separate save handler, with silent offline cancellation and editable inputs
  during requests. Align it with the operational submission helper, retaining the existing
  offline queue and interval contract.
- The shared validation summary could outlive its corrected fields. Reconcile displayed errors
  after field changes and reset without moving focus away from the user.
- A selector's temporary search input was included in the sheet's unsaved-data snapshot. Track
  actual form values while excluding this UI-only search, preserving protection for real edits.
- RecordBrowser restored session state only on mount, leaking criteria between reused SPA
  contexts. Restore each context before persisting and reveal an explicitly requested authorized
  record even when a previous local search would hide it. Controlled registers retain their owner.
- Refresh the nine active manuals from synthetic captures to cover the current agenda, inbox,
  guard and recovery behavior, with exact source and PDF hashes.

## Ownership and verification plan

Parent: sheet tracking, manuals/captures, integration and release. Independent workers:
RecordBrowser state and tests; Time/validation and tests. A separate reviewer audits source,
manual behavior and deployment. Browser fixture use is sequential; role-specific regression
checks cover 360/390/768/1440. Final evidence includes static/type checks, negative browser paths,
manual source binding, independent review, reviewed ZIP activation, backup, data preservation,
public browser health and successful worker cycles. This bounded release does not claim a fresh
32-step contractual acceptance.

Cache from the preceding build was removed by exact cache IDs after checking unused/unshared
state; images, volumes, releases, data and unrelated services were preserved. Full receipt is in
`cache-cleanup.json`. Subsequent validation and activation results are appended after execution.

## Final verification run

Fresh static checks after the resumed session: 63/63 tests across eight files, portal typecheck,
Svelte check (zero errors/warnings), changed-file ESLint and formatting passed. Authenticated
browser operations continue to use disposable synthetic data only.

The first combined browser attempt exposed an older interval test that dismissed the now-required
unsaved-changes prompt implicitly. The form correctly stayed open, blocking its next background
click. The test now explicitly verifies and accepts the discard prompt before editing the stored
record. The interrupted attempt and traces are preserved; a fresh complete matrix is the gate.
The earlier five new desktop cases had already passed. No runtime workaround was made for this
older test. A new read-only preservation check after the interrupted session confirmed all eight
financial tables and 59 private files still match the original baseline.

## Release gates passed

The fresh combined run passed **65/65 applicable browser cases**: 64 workflow cases across
360/390/768/1440 and one full manual-capture journey. Three intentional non-desktop exclusions
belong only to that capture journey, which itself captures desktop and phone. No workflow is
skipped. Its prior interrupted attempt is separately retained.

All nine active PDFs were regenerated from **153 screenshots and 261 capture checks**, bound
to the final runtime digest. PDF/source/capture hashes, embedded fonts, images and extractable
text were verified. Representative final pages and the mobile failure form were visually
inspected. Unit/integration/security selection: 63 passed; types, Svelte (zero errors/warnings),
lint, formatting and diff check passed. No runtime edit followed the successful browser build.
The user's final instruction explicitly authorizes production activation, cache cleanup and
pushing the complete work to the existing GitHub branch.
