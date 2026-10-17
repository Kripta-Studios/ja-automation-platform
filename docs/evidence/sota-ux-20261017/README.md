# SOTA UX implementation · 17 October 2026

Status: scoped implementation, independent browser acceptance and manual refresh passed. This source snapshot records candidate acceptance; production publication, GitHub parity and storage cleanup are certified by the operational receipts listed below.

The eight high/medium priorities in the 17 October research map to CORE-01/10/14, with CORE-15/17 release invariants. The [packet ledger](work-packets.json) records dependencies and ownership.

| Priority | Implemented behavior |
| --- | --- |
| UX-01 · High | Sheet focus scrolling accounts for the measured header and footer; enlarged content can use a flowing footer. Labels and controls remain visible during keyboard navigation. |
| UX-02 · High | Worker, status and record-type filters stay visible, with visible/selected counts and explicit select-visible/clear actions. Filtering preserves precise selections. |
| UX-03 · High | The selected billing stream opens directly in the same sheet. Cancel/save returns to the mounted invoice composer with project, period, mode and source context retained; save revalidates eligibility and preview. |
| UX-04 · High | Section navigation coordinates role-authorized actions, configuration and record handoffs, with EN/ES/PT business synonyms and whole-word matching. |
| UX-05 · Medium | The invoice workspace uses a wider sheet and compact visible index. All twelve detail panels, three guided stages and nine named shortcuts remain available. |
| UX-06 · Medium | Stream editing has a dedicated region outside the comparison table, with explicit edit/archive/close-period entrypoints where authorized. |
| UX-07 · Medium | Invoice settings explain origin, optionality, edit location and future-draft impact. Commercial/tax changes retain effective-dated conditions and issued snapshots. |
| UX-08 · Medium | Validation preserves values and links errors to fields. Save feedback distinguishes refreshed previews, no selection, removed sources and refresh failures; pending preview work prevents conflicting edits. |

Financial APIs, schema, role authorization and issued history retain their meaning. Saving a draft does not issue, send or collect payment. The [field inventory](field-inventory.json) finds 53 literal named controls retained and none removed; that inventory supplements behavioral verification rather than proving every capability by itself.

[Browser acceptance](browser-acceptance.json) records four principal widths (360, 390, 768 and 1440), additional 320px focus/reflow and 1024px navigation checks, independent visual review, keyboard/text-spacing checks, EN/ES/PT cases and interrupted-run context. The final source passed all required core viewport and billing edge scenarios across completed runs. Tests that create records used only the isolated fixture. Forty [financial invariant checks](financial-checks.json) passed.

The independent production follow-up found and corrected landscape clipping that the original four-width matrix missed. The [landscape follow-up](landscape-followup.json) records all five primary widths, EN/ES/PT headings, local table scrolling, normal 320px settings and viewport-fixed sheet geometry. It also records a separate, pre-existing 320px root-font-size stress limitation reproduced on the previous production release; that stress result is not a browser-zoom or WCAG certification. Final production rechecks are kept in the external operational evidence.

The [workspace comparison](workspace-comparison.json) measures the first-control offset reduction at approximately 17–27% across the four widths. The tablet invoice sheet increased from 460.8px to 768px and the desktop sheet from 544px to 1088px. These are layout measurements with different data, not human task-time claims.

[Manual verification](manuals/README.md) covers the twelve current PDFs and refreshed historical entrypoints. Twenty Help/catalog/download checks pass; the current English role courses retain explicit language fallback. The 25 archive covers are refreshed while all 327 historical body page streams are preserved. [Quality checks](quality-checks.json) record the final production build, typecheck and changed-source checks.

Private sessions, credentials, business screenshots, database copies and backup contents remain outside Git. Operational receipts are written under `/home/kripta/ja-sota-implementation-20261017` after the source commit is frozen: `image-build.json`, `deployment.json`, `live-downloads.json`, `restore-drill.json`, `github-parity.json` and `cleanup.json`. Keeping those receipts external allows the production runtime source commit and GitHub main to stay identical.

This is scoped Chromium viewport acceptance, not physical iPad/Safari certification, a full WCAG audit, a human usability benchmark or a new whole-product CLIENT READY verdict. Existing unrelated build warnings remain outside this change.
