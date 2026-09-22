# Time intervals and clearer portal controls — 2026-09-22

Runtime source commit: `2c677137322ac9d60422dddcd08d97d04d892c01`, pushed to the working GitHub branch. Runtime source digest: `04ea21bf50ad14b97fc1b76c1388cccca8fc1497a240c133aa86e9728780fdcc`. Manual packaging and the production receipt follow below.

## Result

- Log time defaults to today's local browser date. Worker/Owner and supplier forms accept same-day start/end clocks and an optional break, calculate net duration and retain form values on validation failure. Clocks use the project's local time; no UTC conversion or overnight inference is introduced.
- Existing duration-only entries retain their meaning and acquire no fabricated clocks. Historical valid zero-net intervals remain reportable; newly entered intervals require positive net time. Canonical overlap/day limits also apply to offline writes.
- New period/customer/internal and own-worker statement snapshots, PDFs and applicable CSV exports include recorded clocks and breaks. Supplier web/CSV/print views show the same interval. Legacy snapshots remain readable. Finalized snapshots and existing private artifacts are not rewritten. Narrative Daily/Technical reports are not assigned invented time-entry associations.
- Projects, workers and other entity selectors contain their search inside the dropdown. Selection supports keyboard/touch, accents, disabled options and cancel without changing values. Native labels, validation, FormData and unsupported-browser fallback remain intact.
- Time/Expense filters show wrapping active criteria, counts and a conditional clear action. Reset clears saved search/order/page state. Reports use one authoritative filter/sort model; role-specific options target only visible registers. Empty results and empty datasets have distinct messages. Single-page lists omit unusable pagination buttons.
- Manual sources retain their prior information and document the new time/picker behavior. Six EN/PT-BR functional manuals and three EN/ES/PT-BR quick guides receive fresh screenshots.

Inspiration: [Bits UI combobox](https://www.bits-ui.com/docs/components/combobox), [Radix popover](https://www.radix-ui.com/primitives/docs/components/popover), and [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). No new UI dependency was added.

## Validation

- Focused Vitest selections: [63 tests](time-tests.txt) and [20 tests](time-extra-tests.txt) passed. Selections can overlap and are not presented as one unique aggregate. Independent reviewer executed 71 backend/report tests and issued [SHIP](review.md), with no remaining P0/P1/P2 findings.
- [Time browser matrix](time-browser.txt): eight Worker/Owner journeys at 360/390/768/1440 px passed. The later combined run also passed all time, supplier interval/export/PDF, filter-summary, picker and density-regression cases at these widths.
- [Combined run](browser-first-pass.txt): 53 passed, eight failed, three intentional fallback exclusions. Failures were two outdated test locators/setup steps repeated at four widths, subsequently corrected.
- [Fresh-build UI rerun](browser-ui-rerun.txt): 29 passed, four Owner test pagination failures, three intentional fallback exclusions. All new role/report/picker cases passed at four widths. The Owner test then correctly found the edited old record via search but its final generic status locator matched both the feedback and pagination status; [intermediate log](browser-owner-intermediate.txt) preserves this attempt.
- [Final Owner/browser capture run](browser-final.txt): **13 passed**, three intentional exclusions of the manual capture on non-desktop projects. All 12 Owner lifecycle, unauthorized-role and picker cases passed across four widths. The desktop manual test itself includes phone captures. No assertions were removed or weakened.
- [Workspace typecheck](typecheck.txt), [scoped ESLint](eslint.txt), and `git diff --check` passed. [Svelte-check](svelte-check.txt): zero errors and zero warnings.
- All authenticated browser writes use disposable synthetic fixtures. Production browser verification is limited to public pages/login; no production user credentials or mailbox data are used.

## Visual and preservation evidence

Representative captures: [360 px picker](integrated-picker-phone-360.png), [1440 px picker](integrated-picker-desktop.png), [360 px active filters](expenses-active-filters-phone-360.png), [Worker clock form](worker-clock-form-phone-360.png), [supplier report](supplier-report-desktop.png). The earlier `time-interval-*.png` images are retained as historical test evidence. [Example period PDF](example-period.pdf) uses synthetic data.

[Production baseline](production-before.json) records integrity/FK checks and eight historical financial-table hashes. Private-artifact hashes were captured privately and will be compared after deployment. No schema migration is required. Exact-money rules, authorization, audit and issued-history semantics are preserved.

## Manuals and release

Final clean-fixture capture passed: **116 screenshots, 202 checks** for seven personas in EN/PT-BR, including phone views. All **nine PDFs** passed hash/source-digest, embedded-font, image, page and extracted-text validation. New clock-form and picker captures and the rendered clock-form PDF page were visually inspected. See [capture log](manual-capture-final.txt) and [PDF quality manifest](../../manuals/validation/pdf-quality.json). A separate clean fixture excludes names altered by regression tests. Production deployment receipt is pending.

This focused packet does not claim to rerun the complete 32-step acceptance journey or resolve historical external/human acceptance items. Production jobs/backups and mail limits are recorded in the release receipt.
