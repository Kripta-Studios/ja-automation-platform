# Digital workers integrated release — 11 October 2026

This release combines the 200 UX improvements in main `413ad815` with digital-worker feature commit `969084d0`. The shared repository timezone projection and notification adapter are both preserved. The only cherry-pick conflict joined two documentation sections; neither was discarded.

The [combined validation](validation.json) records 22 digital-worker browser cases across 360/390/768/1440, eight desktop main-content accessibility scans, and three adjacent project-to-invoice scenarios (including an internal four-width issue journey). All passed without skipped, flaky or unexpected results. The [focused tests](focused-tests.log) pass 72/72, and assistant catalogue/matcher checks pass a further [44/44](assistant-tests.log). Portal and database package typechecks pass.

The [production-copy rehearsal](production-clone-migration.json) verifies a real database/private-file snapshot, migration 76→77, preserved issued invoice/history/audit metadata, and exact restoration of the original76 snapshot. Scratch data was removed; no production records were changed by the rehearsal. Independent finance/security integration review passed.

Production cutover requires a fresh stopped-writer backup and a temporary maintenance gate. Version76 code rejects a77 database, so the previous image alone is insufficient for rollback. Before the delivery worker starts, rollback restores database and private files together; after it starts, recovery must preserve any new business effects. Deployment and live verification will be recorded here after execution. Existing broader Svelte-check diagnostics and the prior global Client Essential verdict are unchanged.

The original [implementation guide](../../manuals/Digital_Workers.md) and [feature evidence](../digital-workers-20261011/README.md) describe behavior and limitations. No external model/API key is required.
