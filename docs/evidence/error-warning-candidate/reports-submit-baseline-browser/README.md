# Daily report stale submission: independent browser baseline

Actual headless Chromium on 27 September 2026 against clean commit `2d5c9eaa2dfd8f183268aaf4821c5e051c55e7c0`. A fresh disposable E2E database was created. Owner created an Active project and assigned a Worker through the rendered project form. Worker created a Daily report draft through the rendered report form and used two authenticated tabs at 390×844 in English. No production data or product files were changed.

Tab B saved an edit from version 1 to 2 while Tab A still held version 1. Tab A submitted the stale form. Its native POST returned HTTP 409 `text/html` containing `REPORT_SUBMISSION_CHANGED`; a read-only enhanced action probe returned HTTP 200 wrapper with action status 409, the same code, `problem.report.submissionChanged`, and `review_report`. The database remained Draft version 2 with Tab B's summary and no extra audit event or overwrite.

The focused notice was fully visible at y=285–436 within the 844 px viewport; scrollY stayed 803. The header showed Draft, but the notice said **“This report changed or is no longer a draft”**, which leaves a known Draft conflict ambiguous. It offered [Review updated report](worker-390-en-stale-edit-notice.png). The native response had already rendered a version 2 Submit control.

The remedy did not reliably refresh the record. While Tab A still displayed the notice, Tab B saved a second edit to database version 3. Clicking `Review updated report` on Tab A cleared the notice, but kept the same document (`performance.timeOrigin` unchanged) and version 2 Submit control. The link lacked `data-sveltekit-reload`. A further submission would therefore use stale version 2 again.

The [sanitized result trace](results.json) includes native and enhanced response metadata, visible wording and geometry, focus, scroll, remedy navigation, DB versions, audit delta, and network/console diagnostics. All three browser contexts had zero page exceptions and unexpected console errors. The disposable preview produced the known offline identity 503 on navigation. The screenshot contains only synthetic notice text; UUIDs are redacted from the trace.

The reproducible case is [`baseline.spec.ts`](baseline.spec.ts) with [`playwright.config.ts`](playwright.config.ts): Chromium **1/1 passed**. The fixture pointer and lock were removed, and ports 4173, 4174, and 4184 had no listeners. This focused baseline covers an edited Draft; it does not claim a Needs changes or already submitted result.
