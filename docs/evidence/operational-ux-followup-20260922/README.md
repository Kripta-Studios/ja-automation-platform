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

## Production activation

Activated on **2026-09-23 08:51:52 Europe/Madrid** at
https://j-aautomation.com/j-aautomation/app.

- Release archive SHA-256: `97502e4a6676a5a7c91435e42522c3b3fecc10132d0edc4846f2101f6fdfced4`.
  The installed manifest contains 2,365 verified files; all 604 runtime source files match the
  reviewed worktree snapshot `24527d941ea27fc8f806132c932107fd6930abf5`.
- Public Chromium checks passed 12/12 for site/login, EN/ES/PT and 390/1440 px. Both web
  containers are healthy. The worker is running; 3,288 successful cycles were available to the
  post-deployment verifier, with zero cycle or outbox errors.
- SQLite integrity is OK with zero foreign-key violations. Hashes for all eight financial tables
  and all 59 private files are unchanged from the original pre-release snapshot.
- The deployer's pre-activation backup was verified in an isolated copy with 59 documents.
  Historical backup coverage is now 15/30 days; the older coverage gap remains documented.
- Caddy kept the same PID, all five checked units are active, and the IDs/running state of all 12
  unrelated containers were preserved.

After activation, exactly 50 unused and unshared BuildKit records created by this build were
enumerated and removed. The operation reclaimed 6.941 GB and left 14.41 GB free. Images,
containers, volumes, releases, the active symlink and persistent data were compared before/after
and remained unchanged. No image, volume or global system prune ran.

Production receipts: `release-package.json`, `deployment.log`, `production-receipt.json`,
`production-before.json`, `production-after.json`, `backup-after.json`,
`production/browser.json` and `cache-after-deploy.json`.
