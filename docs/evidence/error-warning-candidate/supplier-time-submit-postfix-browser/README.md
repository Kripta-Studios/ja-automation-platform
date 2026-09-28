# Supplier time submission: independent post-fix Chromium QA

- Candidate HEAD: `d3b724e00795d2e94b07691ea33beafc9b9fc600`
- Tracked product diff SHA256: `d557b013d1813b3a1428402864aacfab86c447cf2cb4d9c4145271c502cf68cc`
- Run date: 2026-09-27. Disposable E2E database and local preview only; no production access.

## Result

**PASS: 390 px English and 1440 px Portuguese.** The Supplier Coordinator created each draft through the rendered Supplier form. A second authorized browser tab edited or submitted the same draft before the first tab submitted its stale version. Native submissions produced HTTP 409 with `SUPPLIER_TIME_SUBMISSION_CHANGED` for edited drafts and `SUPPLIER_TIME_SUBMISSION_STATE_BLOCKED` for already submitted entries. Read-only enhanced probes returned the same codes in SvelteKit's HTTP 200 wrapper with action status 409. Neither conflict wrote a second audit event or submitted a draft.

The visible notices explain the current situation in the selected language and offer **Review updated record** with a hard reload. The report tab remains open, its stale Submit button is disabled, and the current Draft or Submitted status and work date appear beside the attempted entry. DOM geometry was measured **before screenshots**: the focused notice sits fully below the sticky header and within the viewport in all observed cases. The app scrolled to the notice after the native response; the pre-submit scroll position and resulting position are recorded in the JSON evidence. Both tabs had no page or console errors.

Moving a draft from September 24 to October 1 in Tab B produced the changed code in stale Tab A. The main remedy targeted October 1, performed a new document load, and displayed the moved draft at version 2. At 390 px, a two-entry batch with one stale version returned the changed code, kept both drafts in Draft, preserved both selected checkboxes in the recovery view, and wrote no new audit event.

## Evidence

- [Browser reproduction spec](postfix.spec.ts) and [Playwright config](playwright.config.ts)
- [390 px results](results-phone-390.json) and [1440 px results](results-desktop.json)
- Cropped, synthetic-data notice screenshots: [English](changed-phone-390-en.png), [Portuguese](changed-desktop-pt.png)

The result files replace the synthetic worker and project identifier. The screenshots contain only the notice. Browser traces were not retained because they can include session cookies and complete form payloads.

## Scope limits

The enhanced parity checks were direct browser `fetch` requests using deliberately stale versions; the enhanced error was decoded from the network response, while the visible UI checks used native form submissions. The batch check used native submission. Revoked access and mixed-visibility batches were covered by product integration tests, not this browser run. The test did not exercise every Supplier role or every translated locale.

Port 4174 and the disposable fixture pointer/lock were released after Playwright exited.
