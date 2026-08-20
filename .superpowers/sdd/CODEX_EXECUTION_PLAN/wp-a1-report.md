# WP-A1 — Frontend mechanical decomposition handoff

## Status

Implemented the approved first frontend architecture-boundary tranche from starting HEAD `85256a16dee1f5f6661f1fe7fda53605f50a19ae` without changing public routes, form action names, server response shapes, repository APIs, offline storage/sync semantics, or the rendered Today data contract. No commit or index mutation was made.

WP-A1 materially advances `SPEC-ARCH-001` and `V31-015`, but those requirements remain program-level `PARTIAL`: `PortalShell.svelte` is smaller but still a large compatibility façade, and the database decomposition is owned by WP-B1.

## Implemented behavior

- Moved the portal page-data and action-result TypeScript contracts out of `PortalShell.svelte` into `portal-data.ts`.
- Moved pure money/hour/category/date/initial/form-normalization helpers into `portal-format.ts`; exact existing presentation and parsing behavior is covered by focused tests.
- Moved online/offline lifecycle orchestration into `offline-controller.ts`:
  - initial online, queue, conflict, and cached-assignment hydration;
  - queued mutation synchronization and the existing user-facing messages;
  - online/offline listeners;
  - service-worker message handling and registration with the same URL/scope;
  - cached assignment writes, conflict discard refresh, and logout cache purge.
- Extracted the cohesive Today/dashboard branch into `TodaySection.svelte` with the same markup, links, data fallbacks, money formatting callback, offline state, and project rows.
- Kept `PortalShell.svelte` as the public compatibility façade used by the existing SvelteKit routes. It fell from 3,189 to 2,912 lines.
- Replaced the 4,377-line `portal.css` body with ordered imports and split its rule stream at the already-present cohesive comment boundaries into:
  `legacy`, `foundation`, `login`, `shell`, `surfaces`, `dashboards`, `forms-management`, `details-invoices`, `responsive`, and `polish`.
- The split script verified an exact 76,296-character reconstruction before formatting. Prettier subsequently normalized only boundary whitespace; selector/declaration order and cascade order remain unchanged. The production build emits one 64.01 kB portal CSS asset.
- Added focused unit characterization for extracted formatting/form helpers and offline-controller state behavior.
- Added an authenticated eight-viewport Today façade/navigation parity smoke inside the owned portal tree. It records layout dimensions as annotations and captures screenshots without pretending that the known P0 responsive defects are fixed.

## Exact changed files

Modified:

- `apps/portal/src/lib/PortalShell.svelte`
- `apps/portal/src/portal.css`

Added:

- `apps/portal/playwright.wp-a1.config.ts`
- `apps/portal/wp-a1-parity.spec.ts`
- `apps/portal/src/lib/portal/portal-data.ts`
- `apps/portal/src/lib/portal/portal-format.ts`
- `apps/portal/src/lib/portal/portal-format.test.ts`
- `apps/portal/src/lib/portal/offline-controller.ts`
- `apps/portal/src/lib/portal/offline-controller.test.ts`
- `apps/portal/src/lib/portal/sections/TodaySection.svelte`
- `apps/portal/src/styles/portal/legacy.css`
- `apps/portal/src/styles/portal/foundation.css`
- `apps/portal/src/styles/portal/login.css`
- `apps/portal/src/styles/portal/shell.css`
- `apps/portal/src/styles/portal/surfaces.css`
- `apps/portal/src/styles/portal/dashboards.css`
- `apps/portal/src/styles/portal/forms-management.css`
- `apps/portal/src/styles/portal/details-invoices.css`
- `apps/portal/src/styles/portal/responsive.css`
- `apps/portal/src/styles/portal/polish.css`
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a1-report.md` (required handoff only)

Inspected but unchanged: `apps/portal/src/lib/PortalChrome.svelte`.

No forbidden path was edited. The shared checkout contains unrelated pre-existing and concurrent changes outside this list; they were preserved.

## Migrations and data changes

None. No migration, schema, database, fixture, durable artifact, or production data change was made. Playwright used disposable seeded E2E databases and its global cleanup.

## Verification commands and results

### Characterization / TDD

- `pnpm --filter @ja/portal typecheck` before edits: PASS.
- `pnpm exec vitest run apps/portal/src/lib/portal/portal-format.test.ts apps/portal/src/lib/portal/offline-controller.test.ts --config apps/portal/vite.config.ts` from repository root: expected RED; both suites failed because the two extraction modules did not yet exist. The subsequent command was run from `apps/portal` so SvelteKit config resolved correctly.
- `pnpm exec vitest run src/lib/portal/portal-format.test.ts src/lib/portal/offline-controller.test.ts --config vite.config.ts` from `apps/portal`: GREEN, 2 files / 4 tests passed.
- After wiring the façade, `pnpm typecheck` from `apps/portal`: PASS.
- After the CSS split, focused tests + portal typecheck + portal build: PASS.

### Fresh handoff gates

- Scoped Prettier check over every changed portal source/test/style file: PASS, all matched files formatted.
- Scoped ESLint over every changed TS/Svelte source/test/config file: PASS, exit 0 with no diagnostics.
- `pnpm --dir apps/portal exec vitest run src/lib/portal/portal-format.test.ts src/lib/portal/offline-controller.test.ts --config vite.config.ts`: PASS, 2 files / 4 tests.
- `pnpm --filter @ja/portal typecheck`: PASS.
- `pnpm --filter @ja/portal build`: PASS. Existing warnings remain for current Node `v25.8.1` versus required `24.19.0`, a Rollup annotation in generated auth code, and externalized `node:sqlite`.
- `pnpm test:unit` earlier in the packet, before a concurrent writer added another test: PASS, 10 files / 23 tests.
- Fresh `pnpm test:unit` at handoff: 10 files / 23 tests passed and one concurrently added, out-of-packet test failed: `tests/offline/cross-user-isolation.test.ts` raised Windows `spawn EINVAL` while starting `pnpm.cmd`. WP-A1 did not edit that forbidden `tests/**` path or its process harness. This is an integration concern for the parent/owner of that concurrent packet, not a WP-A1 behavior failure.
- `git diff --check` on tracked owned edits: PASS (only Git's CRLF checkout warning).

### Browser / Playwright evidence

Stock repository smoke:

- `pnpm exec playwright test tests/e2e/mvp-demo.spec.ts --grep "critical portal surfaces render without runtime errors"`
- Result: 5 passed / 3 failed across the eight configured projects.
- Pass: 390×844 worker, 1024×768 owner, 1280×800 owner, 1440×900 owner, 1920×1080 owner.
- Fail: 360×800, 430×932, and 768×1024 because the existing test expects the owner-only `Dashboard` link to be visible without accounting for the compact navigation contract. Phone snapshots show the admin navigation is omitted; 768 uses the old icon/first-letter mode. The Today heading and authenticated data rendered before each failure.

Packet-owned parity smoke:

- `pnpm exec playwright test --config apps/portal/playwright.wp-a1.config.ts`
- Final result: PASS, 8/8 projects in 29.4 seconds.
- Verified seeded owner login, Today façade heading/data, compact primary navigation after opening the drawer when present, desktop admin navigation, no captured console/page/request errors, and screenshot generation.
- Viewports: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080.

Screenshot references (generated evidence, not source changes):

- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-phone-360/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-phone-390/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-phone-430/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-tablet-768/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-tablet-1024/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-laptop-1280/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-desktop/today-parity.png`
- `apps/portal/test-results/wp-a1-parity-Today-façade--ee19f--usable-after-decomposition-wide-1920/today-parity.png`

Representative captures at 360, 768, and 1440 were manually inspected. They show the Today dashboard/project data and expected source-order styling. They also confirm the preserved baseline responsive debt described below.

## Preserved contracts

- `PortalShell.svelte` remains the import used by `/app` and `/app/[section]`; no caller or route migration is required.
- No public route, query parameter, URL, form action, action name, server response, repository call, permission/RBAC behavior, or security endpoint changed.
- Portal data field names remain byte-for-byte equivalent as TypeScript properties; they were moved, not reinterpreted.
- Today links and headings remain unchanged.
- Offline IndexedDB implementation and storage names remain in `offline.ts`; the controller delegates to the same functions.
- Sync result wording, cached assignment row mapping, service-worker URL/scope, conflict refresh, and logout purge semantics remain unchanged and are now focused/testable.
- CSS import order is exactly: Tailwind, UI tokens, legacy, foundation, login, shell, surfaces, dashboards, forms-management, details-invoices, responsive, polish.
- Import direction is acyclic: `PortalShell` → controller/data/format/Today; `Today` → data; controller → offline/data; neither extracted module imports `PortalShell`.

## Unresolved risks / blockers

- Known P0 responsive defects were intentionally preserved because WP-A1 forbids redesign:
  - at 360/390/430 the drawer displays clipped/first-letter-style primary labels and omits administration/security links;
  - at 768 the legacy icon/first-letter layout remains and measured `bodyScrollWidth` was 784 for `innerWidth` 768;
  - representative screenshots make these issues visually explicit.
  These belong to `FIX-011`, `FIX-015`, `V31-011`, and `V31-016` / WP-T0 or its responsive implementation follow-up.
- `PortalShell.svelte` remains 2,912 lines. More domain sections can be extracted in later ownership-safe tranches after their contracts are frozen.
- `legacy.css` remains 1,728 lines by design: this tranche preserved source order mechanically instead of mixing decomposition with responsive redesign. Later CSS cleanup must preserve cascade evidence.
- Final release evidence still needs Node `24.19.0`; current environment is Node `25.8.1`.
- Fresh root unit gate is not fully green because of the concurrent `tests/offline/cross-user-isolation.test.ts` Windows `spawn EINVAL` described above.

## Requirement mapping

- `SPEC-ARCH-001`: advanced — cohesive frontend contracts/components/styles extracted while preserving the modular monolith and route façade; program row remains `PARTIAL` pending remaining frontend/database tranches.
- `V31-015`: advanced — `PortalShell.svelte` and `portal.css` decomposed along approved boundaries; program row remains `PARTIAL` pending further façade/domain extraction and WP-B1 database decomposition.
- Prerequisite support for `V31-011`–`V31-014` and `V31-016`: boundaries now make later responsive/design-system work safer, but WP-A1 does not claim those behavior requirements pass.

## Interface coordination

No other agent must change an interface for WP-A1. Existing consumers continue importing `PortalShell.svelte`; all new modules are internal portal implementation details. The parent should route the unrelated cross-user isolation process-spawn failure to the owner of that concurrent test packet and route the preserved responsive debt to WP-T0/responsive remediation.

## Fix round 1/5 — offline Save draft queue refresh

### Independent review finding and root cause

Independent mobile review correctly identified a Critical runtime regression in the extracted offline path. `PortalShell.svelte` still called `queuedCount()` after `queueMutation()`, but the low-level count import had moved into `offline-controller.ts`. The Svelte/Vite build and the repository's `tsc`-only portal typecheck did not diagnose the undeclared identifier inside the Svelte script. At runtime, the mutation persisted first, then the missing function threw into the catch branch. The UI falsely reported `Offline draft could not be saved on this device.`, retained the form values, and a user retry could enqueue a duplicate mutation.

The fix keeps the extraction boundary cohesive rather than reintroducing the low-level import: `offline-controller.ts` now exposes `refreshQueue()`, uses it for start/sync/discard, and `PortalShell.svelte` calls it immediately after `queueMutation()`. Success messaging and form reset occur only after the persisted queue count is refreshed.

### Changed coverage

- Extended `apps/portal/src/lib/portal/offline-controller.test.ts` with a focused queue-refresh state regression.
- Extended `apps/portal/wp-a1-parity.spec.ts` with an authenticated worker offline Save draft flow that verifies:
  - success message is visible and the false failure message is absent;
  - visible queue count becomes exactly one;
  - the form resets;
  - IndexedDB contains exactly one queued mutation, preventing a hidden duplicate;
  - reconnect synchronizes exactly one mutation.

### Exact RED evidence

- Unit RED command:
  `pnpm --dir apps/portal exec vitest run src/lib/portal/offline-controller.test.ts --config vite.config.ts`
  Result: FAIL as intended, 1 failed / 2 passed. Failure was `TypeError: controller.refreshQueue is not a function` at `offline-controller.test.ts:58`.
- Authenticated browser RED command:
  `pnpm exec playwright test --config apps/portal/playwright.wp-a1.config.ts --project desktop --grep "worker offline Save draft persists once"`
  Result: FAIL as intended. The worker authenticated, went offline, populated the real time form, and clicked Save draft; Playwright timed out waiting for `Offline — saved on this device`, reproducing the user-visible regression at `wp-a1-parity.spec.ts:84`.

### Exact GREEN evidence

- Focused controller GREEN command:
  `pnpm --dir apps/portal exec vitest run src/lib/portal/offline-controller.test.ts --config vite.config.ts`
  Result: PASS, 1 file / 3 tests.
- Focused authenticated browser GREEN command:
  `pnpm exec playwright test --config apps/portal/playwright.wp-a1.config.ts --project desktop --grep "worker offline Save draft persists once"`
  Result: PASS, 1/1 in 25.9 seconds; browser test body completed in 2.0 seconds.
- Fresh amended portal tests:
  `pnpm --dir apps/portal exec vitest run src/lib/portal/portal-format.test.ts src/lib/portal/offline-controller.test.ts --config vite.config.ts`
  Result: PASS, 2 files / 5 tests.
- Scoped Prettier check over the four fix-round files: PASS.
- Scoped ESLint over the four fix-round TS/Svelte files: PASS, no diagnostics.
- `pnpm --filter @ja/portal typecheck`: PASS; existing Node engine warning remains (`25.8.1` running versus required `24.19.0`).
- `pnpm --filter @ja/portal build`: PASS; existing generated-auth Rollup annotation and externalized `node:sqlite` warnings remain.
- Existing full affected offline flow:
  `pnpm exec playwright test tests/e2e/mvp-demo.spec.ts --project desktop --grep "worker can create an offline time draft and sync it once online"`
  Result: PASS, 1/1 in 27.6 seconds; the flow covered offline time, daily report, technical report, and expense drafts plus reconnect synchronization.
- `git diff --check` over fix-round owned files: PASS, aside from Git's informational CRLF checkout warning.

### Fix-round interface/data impact

No route, server action, response, IndexedDB schema/name, sync payload, database migration, or external interface changed. `refreshQueue()` is an internal controller operation. No other agent must change an interface for this fix.
