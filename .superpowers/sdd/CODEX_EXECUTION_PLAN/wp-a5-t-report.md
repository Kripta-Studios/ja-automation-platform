# WP-A5-T independent review

Status: **BLOCKED**

Reviewed the four exclusive A5-T paths against `wp-a5-contract.md`, the accepted WP-T0
authentication/fixture conventions, the current portal markup and role predicates, and the
responsive-regression/playwright-qa requirements. This review was read-only for application and
test sources. The only file written is this requested report.

## Evidence run

- `pnpm exec playwright test --config=playwright.config.ts tests/e2e/portal-responsive.spec.ts tests/e2e/portal-keyboard.spec.ts --list`
  lists **184 tests** across `phone-360`, `phone-390`, `phone-430`, `tablet-768`,
  `tablet-1024`, `laptop-1280`, `desktop`, and `wide-1920`.
- Pinned-toolchain scoped Prettier check: **PASS**.
- Pinned-toolchain scoped ESLint check: **PASS**.
- `pnpm --dir apps/portal exec vitest run src/lib/portal/ui/form-validation.test.ts
src/lib/portal/ui/primitives.test.ts --config vite.config.ts`: **FAIL**, both suites fail during
  import and execute **0 tests** because the A5-P implementation modules do not exist yet
  (`./form-validation` and `./ActionBar.svelte`/the other primitives).
- `pnpm --filter @ja/portal typecheck`: **FAIL** with the same missing `form-validation` module.
- No web server or conflicting Playwright run was started during this review.

## What is sound

- The E2E tests use the real `signIn` helper and the existing per-run fixture configuration.
- The required eight-project guard is explicit, and discovery proves all eight projects are
  exercised.
- The four-role navigation test derives primary/secondary/admin labels from the existing
  navigation contract and correctly models Worker, Manager, Finance, and Owner predicates,
  including Finance-only filtering and Owner-only Audit.
- The named A5 selectors are used by the newer assertions (`#portal-navigation`, `.nav-label`,
  `[data-ui]`, `[data-validation-summary]`, `[data-field-error-for]`, and
  `[data-mobile-representation]`). Screenshots use role/route/project-specific output names.

## Blocking findings

### I-01 — Initial mobile focus assertion is unrelated to the contract

`tests/e2e/portal-keyboard.spec.ts:33-55` always polls the active element for
`aria-label="Toggle navigation"`. It is called immediately after `signIn` at line 76, before the
test focuses or activates the toggle. A fresh browser page normally has `body`/document focus, not
the menu button. The contract requires the closed drawer to be out of sequential focus initially;
it requires focus return to the toggle after Escape/backdrop/link close, not automatic focus on the
toggle after login. Consequently every mobile role lifecycle can fail before opening the drawer,
independent of A5 implementation.

Fix: split the helper into a closed-state assertion and an optional focus-return assertion. The
initial call must check `aria-expanded="false"` and no sequential drawer descendants without
requiring active focus. Calls after Escape, backdrop, and link close should pass
`expectFocusReturn: true`. Do not fix this by adding an unrequired auto-focus on page load.

### I-02 — Owner link test has a strict-mode locator collision

`tests/e2e/portal-keyboard.spec.ts:122-160` runs for Owner. The current and contracted Owner
navigation contains `Time` in both the primary navigation and the administration navigation.
`navigation.getByRole('link', { name: 'Time', exact: true })` therefore resolves two links and
`click()` throws a strict-mode violation. This is independent of responsive behavior.

Fix: scope the link to the primary navigation, for example
`navigation.locator('nav[aria-label="Primary navigation"] a').filter({ hasText: /^Time$/ })`,
and assert exactly one match before clicking.

### I-03 — The legacy finance test uses unstable selectors and rejects allowed checkbox targets

`tests/e2e/portal-responsive.spec.ts:256-310` depends on `.record-list`, `form.admin-form-grid`,
and the old grid CSS rather than the contract's stable `[data-ui]` selectors. A5-S is explicitly
allowed to extract the finance surface into `FinanceConfigurationSection` and adopt the primitives;
the contract does not promise those old classes. The same test's selector at lines 293-296 includes
all visible `input` elements, including the existing `eligibleForPercentage` checkbox. The contract
explicitly allows a checkbox/radio glyph smaller than 44px when its associated clickable label
provides the 44px hit area. Requiring the input rectangle itself to be at least 44px creates a
false failure for a compliant implementation.

Fix: remove this duplicate legacy assertion or rewrite it entirely around
`[data-ui="form-card"]`, `[data-ui="field"]`, and `[data-ui="field-group"]`. Exclude checkbox/radio
controls from the direct control-size list and measure their associated label's hit rectangle.
Keep the newer primitive-based finance test as the single responsive oracle.

### I-04 — The old timesheet test forbids the contract's permitted cards mode

`tests/e2e/portal-responsive.spec.ts:313-332` requires `.timesheet-table-wrap`, a descendant
`<table>`, and `overflow-x: auto|scroll` at every viewport. A5-S explicitly permits the weekly
timesheet to use either named `cards` or named `scroll` mode. A compliant cards implementation may
not have a table or a scroll wrapper, so this assertion can fail after a correct implementation.
The newer test at lines 612-663 already covers both modes using the stable selector.

Fix: delete the duplicate legacy test, or branch on
`[data-mobile-representation]`: require the named/focusable/signposted table region only for
`scroll`, and require repeated `[data-label]` row/cell labels for `cards`. Do not require
`overflow-x` or a table in cards mode.

### I-05 — Invoice card representation is required to be visible on desktop

`tests/e2e/portal-responsive.spec.ts:680-681` requires
`[data-mobile-representation="cards"]` to be visible at all eight widths. The contract requires
the card representation at 360/390/430 and says the desktop table layout remains at 768 and wider;
an implementation may keep a mobile card subtree present but hidden outside the mobile breakpoint.
This test would falsely fail a compliant desktop-preserving implementation.

Fix: at phone widths require the card representation to be visible and readable; at 768+ require
the semantic table and headers and only assert that the stable representation marker exists (or
allow a hidden mobile variant). Keep the table's `<thead><th>` assertions at every width.

### I-06 — Runtime error probes ignore failed application responses

`portal-responsive.spec.ts:50-63` records only portal responses with status `>=500`; 4xx same-origin
responses are ignored. `portal-keyboard.spec.ts:21-31` has no response listener at all, so all HTTP
failures are ignored there. The A5 contract says no failed same-origin application request is
ignored. The report POST also waits only for a request event at lines 602-607, so a response error
can arrive after the final `errors` assertion.

Fix: record same-origin application responses with status `>=400` in both probes (using an explicit
allowlist only for intentionally expected responses), then await the POST response or completed
navigation before checking errors. Preserve console/page-error/request-failed capture.

### I-07 — The keyboard-order test manually focuses controls instead of testing tab order

`tests/e2e/portal-keyboard.spec.ts:164-223` calls `.focus()` on the skip link, menu button, each
of the first four links, locale selector, account button, and a form action. It never presses Tab
through the document, never proves the skip link activates its target, and never reaches a field,
validation error, or action through actual sequential order. It also omits the A5-N requirements
for `aria-controls` on the toggle and background scroll locking while the modal drawer is open.
Visible-focus styling is checked for only a subset of manually focused elements.

Fix: use a deterministic Tab sequence (starting from a known focus point) and assert the required
landmarks/fields/errors/actions are reached in order, with focus indicators. Add explicit
`aria-controls="portal-navigation"` and open-drawer scroll-lock assertions. Keep the direct focus
checks only as supplemental style assertions.

### I-08 — The unit RED is an import failure with zero executed tests

The two unit suites currently fail before entering `describe` because their A5-P subject modules do
not exist. This is understandable before A5-P implementation, but it does not demonstrate the
required invalid-form or primitive behavior: the command reports **0 tests**, not assertion-level
REDs. It also means typecheck fails on the missing module. Under the packet requirement that REDs
come only from missing A5 implementation rather than syntax/import/fixture flaws, this evidence is
not yet a meaningful characterization result.

Fix: after the A5-P leases add the exact source modules, rerun these suites and retain assertion-level
RED/GREEN evidence. If the parent needs a pre-implementation RED, provide a contract-owned test
harness/stub that loads and exercises the public surface without making the suite fail merely due to
module resolution; do not claim the current 0-test result as behavioral evidence.

### I-09 — Form-validation tests omit required pass-through and cardinality behavior

`form-validation.test.ts:194-269` covers one invalid field and clearing one field. It does not
assert that invalid submission prevents the native request, that valid submission is not prevented,
that method/action/values and a server `form.message` are preserved, or that there is exactly one
summary and one field error per invalid control. The first test uses `querySelector` rather than
checking summary cardinality. These omissions allow an implementation to intercept valid SvelteKit
submissions or duplicate announcements while still passing.

Fix: add an invalid event test asserting `defaultPrevented`, no POST, exactly one summary, and one
error per invalid control; add a valid event test asserting `defaultPrevented === false`, unchanged
method/action/values, and the submission callback/request path. Add a server-message-preservation
fixture. Keep the fake DOM's API surface aligned with every DOM method the helper uses, or use a real
DOM test environment.

### I-10 — Primitive tests are brittle string snapshots and under-test public behavior

`primitives.test.ts:20-156` tests raw HTML substrings and attribute order (for example
`class="test-card` and a heading regex). A valid component that prepends its base class or nests
heading text differently can fail despite satisfying the contract. Conversely, the suite does not
verify Field `aria-describedby`/`aria-invalid` wiring, all primitive attribute forwarding, ActionBar
wrapping/target behavior, or TableRegion's actual row/cell reading labels and scroll affordance.

Fix: parse rendered output/query stable selectors instead of relying on attribute order, and assert
the stable `data-ui`/accessible-name/ARIA contracts for every primitive. Add Field association and
error-state checks, all safe `data-*` forwarding cases, and TableRegion cards/scroll semantics.

### I-11 — Finance one-column assertion is not universal

`portal-responsive.spec.ts:501-516` uses `expect.arrayContaining` with one object, so it passes if
only one FieldGroup is one column while another remains multi-column. The edge inset calculation at
lines 483-493 measures the label rectangle but not the control rectangle. This does not prove the
contract's all-fields phone stacking and no-edge-touch requirements.

Fix: require every finance FieldGroup to have one column and one left position at <=430px, and
measure both each label and each associated control against the FormCard bounds.

### I-12 — First responsive navigation test assumes an uncontracted `.open` class

`portal-responsive.spec.ts:146-152` requires `.portal-layout > aside.open` on phones. The A5-N
contract makes `#portal-navigation`, `.nav-backdrop`, `aria-expanded`, and `.nav-label` stable; it
does not require a class named `open`. A correct implementation using `data-state`, `aria-hidden`,
or another state class can fail this old test.

Fix: scope to `#portal-navigation`, assert visibility/hidden state and the toggle's
`aria-expanded`, and remove the `.open` implementation detail.

### I-13 — Worker representation is weakly scoped and can pass with incomplete cards

`portal-responsive.spec.ts:621-649` takes the first page-wide `[data-mobile-representation]`. If a
future surface appears earlier, it can validate the wrong component. In cards mode it only requires
one non-empty `data-label`; it does not prove each rendered row repeats every column label. In either
mode an empty representation makes the `Math.min(...[])` font-size assertion return `Infinity` and
pass.

Fix: scope the locator to the weekly timesheet section (for example the section labelled by
`weekly-timesheet-title`), require at least one rendered row/cell, assert the expected label set per
row in cards mode, and require non-empty cell text before applying the 12px threshold.

### I-14 — Report invalid journey lacks a deterministic no-request guard

`portal-responsive.spec.ts:564-606` clicks Save after clearing one required control but does not
install a request listener before the invalid click or assert that no POST occurred. A helper that
renders errors while still submitting invalid data could pass. The journey also selects the first
report link without binding to the deterministic editable fixture used by the accepted E2E harness,
so a changed report ordering or finalized first record can make the test fixture-dependent.

Fix: install a short `waitForRequest`/request counter before the invalid click and assert zero POSTs;
then wait for the successful corrected POST response. Select an explicit seeded editable report
fixture (or add a stable fixture data attribute/URL) and reset it per project if the journey mutates
it.

## Verdict

The role/viewport intent is strong and the discovery/format/lint plumbing is sound, but the current
suite cannot be released to A5-N/A5-P as an independent characterization gate. Fix I-01 through
I-04 at minimum before relying on mobile REDs; fix I-08 through I-10 before relying on the unit
tranche; then rerun the scoped checks and a serialized phone probe. Return this packet to the test
worker for a fresh review after the corrections. No application implementation should be changed by
this reviewer.

## Test-worker remediation round 1

Status remains **BLOCKED pending A5-P/A5-N/A5-S/A5-D product leases**. This section records the
test-only remediation requested by the independent review; it is not an independent approval.

Starting and ending HEAD: `85256a1` (`codex/v3-production-completion-orchestrated-20260819`).

Changed paths are exactly:

- `tests/e2e/portal-responsive.spec.ts`
- `tests/e2e/portal-keyboard.spec.ts`
- `apps/portal/src/lib/portal/ui/form-validation.test.ts`
- `apps/portal/src/lib/portal/ui/primitives.test.ts`
- this handoff report

No production implementation, shared Playwright config, auth/global setup/environment fixture, route
server, RTM or other forbidden path was changed.

Finding closure in the test harness:

| Finding | Remediation state                                                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-01    | Closed: initial mobile assertion checks closed/unfocusable state only; focus return is opt-in and used after close actions.                                                                                                                                                                  |
| I-02    | Closed: the Owner `Time` link is scoped to `Primary navigation` and its cardinality is asserted before click.                                                                                                                                                                                |
| I-03    | Closed: finance assertions use `[data-ui]` primitives, exclude checkbox/radio glyphs from direct sizing, and measure their associated label target.                                                                                                                                          |
| I-04    | Closed: the worker oracle accepts named `cards` or `scroll` modes and checks mode-specific evidence.                                                                                                                                                                                         |
| I-05    | Closed: invoice cards are required visible/readable on phones; desktop preserves semantic table checks without requiring cards visibility.                                                                                                                                                   |
| I-06    | Closed: both runtime probes capture failed `/j-aautomation/app` and `/api/` responses at `>=400`, while preserving console/page/request-failure capture; report POSTs are awaited by response.                                                                                               |
| I-07    | Closed: keyboard coverage uses deterministic Tab traversal, skip-target activation, field/error/action traversal, effective focus-ring checks, `aria-controls`, and mobile scroll-lock assertions. Conditional desktop cases execute a desktop assertion instead of being skipped.           |
| I-08    | Closed at harness level: both unit suites now load product subjects dynamically and fail at assertion level when A5-P modules are absent; current RED is 11 executed tests/11 product-module assertions, not an import-time 0-test suite failure.                                            |
| I-09    | Closed: invalid submission asserts `defaultPrevented`, zero native POST path, one summary and one field error per invalid control, focus, value/method/action preservation, and server-message preservation; valid submission asserts non-prevention/native callback and value pass-through. |
| I-10    | Closed: primitive tests parse SSR output into semantic nodes, avoid attribute-order snapshots, and cover labelled surfaces, data forwarding, Field ARIA wiring, ActionBar targets, StatusBadge meaning, and TableRegion scroll/cards row semantics.                                          |
| I-11    | Closed: every rendered finance FieldGroup is required to be one column at phone widths; both labels and controls are measured against the FormCard edges.                                                                                                                                    |
| I-12    | Closed: no `.open` implementation class is required; drawer visibility and `aria-expanded` are the stable assertions.                                                                                                                                                                        |
| I-13    | Closed: timesheet representation is scoped to the weekly-timesheet section, requires non-empty rows/cells, and checks the complete expected label set for every card row.                                                                                                                    |
| I-14    | Closed: the seeded editable report is selected by its deterministic summary, invalid click has a preinstalled zero-POST guard, and corrected submit awaits a successful POST response while restoring original values.                                                                       |

Verification evidence from this remediation round:

- Pinned Node `24.19.0` / pnpm `11.22.0`: scoped Prettier **PASS** and scoped ESLint **PASS** for all
  four owned test files.
- Pinned `pnpm --filter @ja/portal typecheck`: **PASS**; no test-harness diagnostics remain. The
  missing A5-P subjects are loaded dynamically so their absence is reported only by the unit
  assertions below.
- Playwright discovery: **152 tests** across `phone-360`, `phone-390`, `phone-430`, `tablet-768`,
  `tablet-1024`, `laptop-1280`, `desktop`, and `wide-1920`; no conditional `test.skip` remains in
  the owned files.
- The serialized `phone-390` probe reached the authenticated Worker drawer and failed at the
  intentional product RED: the current A5-N button is missing required `aria-controls="portal-navigation"`.
  This is a product implementation failure, not a harness/fixture failure. Trace and error context:
  `test-results/portal-keyboard-worker-mob-8739f--trapped-keyboard-lifecycle-phone-390/trace.zip` and
  `test-results/portal-keyboard-worker-mob-8739f--trapped-keyboard-lifecycle-phone-390/error-context.md`.
- Scoped Vitest currently executes **11 tests** (3 form-validation and 8 primitive tests) and reports
  intentional assertion-level RED because `form-validation.ts` and the eight A5-P primitive modules
  are not yet present. No production stubs were added.

Remaining interface need: release the A5-P source modules so the unit assertions can turn GREEN, then
rerun scoped Vitest and have fresh independent mobile and desktop reviewers rerun the all-eight
authenticated browser matrix. The current test worker does not self-certify those gates.

## Test-worker remediation round 2

Status remains **BLOCKED pending A5-P/A5-N/A5-S/A5-D product leases**. This is a bounded
test-quality correction requested by independent review, not a self-approval or a product gate
decision. Round 2 changed only the owned responsive test and this ignored handoff report.

The three review blockers are closed in the harness:

1. Finance FormCard assertions now require at least one rendered FormCard, at least one Field per
   card, a non-empty visible label and at least one relevant non-hidden control per Field, and
   non-empty control collections before applying edge-inset and target-size checks. Therefore the
   edge, control, and label geometry assertions cannot pass vacuously on empty arrays.
2. At phone widths, every FieldGroup is required to expose direct Field children, every Field must
   expose at least one relevant control, and every Field must have measurable geometry before
   stacking checks run.
3. The phone stacking oracle no longer inspects the computed `gridTemplateColumns` string. It uses
   implementation-agnostic field geometry and rejects any pair of fields in the same FieldGroup
   whose vertical bands overlap, proving that fields occupy distinct rows while accepting `1fr`,
   `minmax(...)`, flex, or equivalent one-column implementations.

Round 2 evidence (pinned Node `24.19.0` / pnpm `11.22.0`):

- Scoped Prettier **PASS** and ESLint **PASS** for all four owned test files.
- `pnpm --filter @ja/portal typecheck` **PASS**.
- Playwright discovery **PASS**: 152 tests across `phone-360`, `phone-390`, `phone-430`,
  `tablet-768`, `tablet-1024`, `laptop-1280`, `desktop`, and `wide-1920`; no conditional
  `test.skip` in the owned files.
- The serialized `phone-390` finance probe reached the authenticated route and failed at the
  intentional product RED because the current A5-P implementation does not render the required
  `[data-ui="form-card"]` Finance configuration surface. Trace and error context:
  `test-results/portal-responsive-finance--59863-elds-and-phone-safe-targets-phone-390/trace.zip`
  and
  `test-results/portal-responsive-finance--59863-elds-and-phone-safe-targets-phone-390/error-context.md`.
  This is not a harness pass or an assertion weakening; the test stopped at the missing product
  surface before its non-vacuous geometry assertions could execute.
- No production implementation, shared Playwright configuration, auth/global setup, route server,
  RTM, or other forbidden path was changed. No local test/server process from the probe remains
  active; persistent Node processes observed afterward are configured MCP processes only.

The A5-P FormCard/Field/FieldGroup implementation remains the unresolved interface needed to turn
this intentional RED into a product result. Parent orchestration must route the fresh independent
review; this worker does not self-certify the round.

## A5-P independent-review regression coverage — test-only remediation round 3

This section records a new bounded test tranche requested by the independent A5-P review. It is not
a product approval or a self-review. Exclusive changes in this round were limited to:

- `apps/portal/src/lib/portal/ui/form-validation.test.ts`
- `apps/portal/src/lib/portal/ui/primitives.test.ts`
- this handoff report

No E2E spec, production source, shared configuration, route, RTM or other forbidden path was edited
by this worker. The A5-P source subjects were present in the shared checkout during this validation;
their concurrent implementation lease remains outside this worker's ownership.

Regression coverage added:

- Forwarded `data-ui`, `data-mobile-representation`, and reserved ARIA attributes cannot replace
  primitive identity, mobile mode, accessible name, or scroll instructions.
- `SectionCard`, `FormCard`, and `TableRegion` cannot produce a nameless surface: the unit oracle
  accepts either a runtime rejection with the required-name contract or a rendered accessible name.
- Checkbox and radio controls retain persistent `<label for>` association. A 44×44 CSS-pixel hit
  area cannot be measured in SSR; browser geometry remains covered by the responsive E2E oracle and
  independent UI reviewer.
- A native `invalid` event renders exactly one summary and one field error and focuses the first
  invalid control, including repeated invalid events; the existing valid-submit test still proves
  native submission remains unprevented.
- Two forms with repeated field names receive unique control, summary and error IDs, with each
  control's `aria-describedby` pointing only to its own error.
- Cards supplied through the semantic `cardRows` contract expose label nodes referenced in the DOM /
  ARIA reading order; the test does not treat `data-label` or CSS pseudo-content as sufficient.

Pinned Node `24.19.0` / pnpm `11.22.0` evidence:

- Scoped Prettier **PASS**.
- Scoped ESLint **PASS**.
- `pnpm --filter @ja/portal typecheck` **PASS**.
- Scoped Vitest **PASS: 17/17 tests** (5 form-validation, 12 primitive tests).
- Vitest emitted existing Svelte compiler `state_referenced_locally` warnings from the concurrently
  implemented A5-P `SectionCard`, `FormCard`, `FormSection`, and `TableRegion` subjects; these are
  not test failures and were not changed under this test-only lease. Parent/A5-P review should decide
  whether to remediate them before integration.

This round closes the six requested test-quality gaps at the assertion level. Fresh independent
review remains required; the test worker does not self-certify A5-P production completion.

## A5-P independent-review regression coverage — test-only remediation round 4

This section records five additional review-blocker regressions. Ownership remained limited to the
two unit-test files and this handoff report; no production, E2E, configuration, route, RTM or other
forbidden path was edited by this worker. The A5-P subjects were concurrently present in the shared
checkout and were exercised only as test inputs.

Coverage added:

- A static primitive-CSS contract checks that checkbox/radio labels declare both minimum width and
  minimum height using a 44px-equivalent shared target token (`44px` or `2.75rem` / its variable).
  Browser geometry remains the authoritative runtime check.
- Whitespace-only `SectionCard` and `FormCard` titles may not leave `aria-labelledby` pointing to
  an empty heading; the rendered surface must expose a non-empty fallback accessible name.
- Supplying `ariaLabel` together with an external `headingId` cannot suppress the explicit accessible
  name when no visible heading with that ID is rendered.
- `TableRegion` scroll mode must keep its generated instruction ID distinct from a supplied heading
  ID and must reference real instruction text through `aria-describedby`.
- A cards-mode SSR fallback cannot rely solely on `data-label`, client actions, or CSS pseudo-content.
  It must render semantic/ARIA label text in SSR or reject the invalid fallback; the existing
  structured `cardRows` test remains in place.

Pinned Node `24.19.0` / pnpm `11.22.0` evidence:

- Scoped Prettier **PASS**.
- Scoped ESLint **PASS**.
- `pnpm --filter @ja/portal typecheck` **PASS**.
- Scoped Vitest **PASS: 22/22 tests** (5 form-validation, 17 primitive tests).

The 44px static check initially reproduced the missing-width defect during the first run; the shared
A5-P subject/CSS changed concurrently before the final rerun, which then passed. This is evidence of
test sensitivity, not independent product approval. Fresh independent review remains required and
the test worker does not self-certify the A5-P implementation.

## A5 keyboard harness correction — test-only remediation round 5

This round was limited to `tests/e2e/portal-keyboard.spec.ts` and this handoff report. No production,
other test, Playwright configuration/fixture, route, RTM or documentation path was edited.

The `tabUntil` helper now accepts a per-journey cumulative cursor and returns both the local search
count and an absolute tab index. The shell skip-link → navigation-toggle → desktop-navigation
comparisons and the finance field → action comparison use the absolute index, so consecutive focus
stops are accepted without manufacturing an intermediate stop. The test still presses real `Tab`
keys, checks the active snapshot predicate, and now explicitly asserts the toggle is focused after
the navigation-toggle search. Finance and report journeys reset their cursor after navigation.

Pinned Node `24.19.0` / pnpm `11.22.0` evidence:

- Scoped Prettier **PASS**.
- Scoped ESLint **PASS**.
- Keyboard discovery **PASS: 72 tests** in `portal-keyboard.spec.ts` across all eight configured
  projects; no skips were introduced.
- Isolated `phone-360` worker drawer case: **PASS (1 passed)**.
- Isolated `phone-360` keyboard-order case: the first attempt was blocked by a transient webserver
  build `ENOENT` for `.svelte-kit/output/server/chunks/internal.js`; after the server rebuilt
  successfully, the corrected harness reached the finance-field search and produced the expected
  product RED after 80 real Tab stops because the current shared A5-P/A5-S surface exposes no
  qualifying finance Field. It did not fail on the former local-counter comparison. Trace/error
  context: `test-results/portal-keyboard-keyboard-o-09b4c-n-fields-errors-and-actions-phone-360/`.
- No local Playwright/webserver process from this round remains active.

This is a harness correction handoff, not independent approval. The finance-field RED remains routed
to the product lease; a fresh independent keyboard review is still required.

## A5-P cards/SSR identity regression coverage — test-only remediation round 6

This round changed only `apps/portal/src/lib/portal/ui/primitives.test.ts` and this handoff report.
Production, E2E, configuration, form-validation tests, routes, RTM and other forbidden paths were
untouched. The existing 22 tests remain present; one additional primitive regression was added.

Corrections:

- Structured `cardRows` SSR coverage now requires every cell to contain a distinct real DOM/ARIA
  label node and a distinct non-empty value node, with the label preceding the value in DOM order.
- The data-label-only SSR fallback test applies the same rule while excluding the host element as a
  false semantic label. A raw `aria-label` rewrite, CSS pseudo-content, or client-only action cannot
  satisfy it; the fallback must render semantic label/value nodes or reject the input.
- Repeated same-label SSR renders must produce the same `aria-describedby` instruction reference and
  a matching local instruction node. Multiple same-label regions supplied distinct explicit
  instruction IDs must retain those distinct references and matching local nodes, proving collision
  avoidance without relying on a module-global render counter.

Pinned Node `24.19.0` / pnpm `11.22.0` evidence:

- Scoped Prettier **PASS**.
- Scoped ESLint **PASS**.
- `pnpm --filter @ja/portal typecheck` **PASS**.
- Scoped Vitest: **22 passed, 1 intentional product RED (23 total)**. The RED is
  `does not accept a cards SSR fallback whose labels exist only in data attributes or actions`:
  the current shared A5-P subject still exposes only the data-label host/aria-label rewrite for that
  fallback, without distinct SSR label and value nodes. This is the expected product failure, not a
  weakened oracle or test harness failure.

The test worker does not self-approve A5-P. The fallback implementation must be remediated and then
rerun under fresh independent review.

## A5-P stale assertion correction — test-only remediation round 7

This round changed only `apps/portal/src/lib/portal/ui/primitives.test.ts` and this handoff report.
No production, route, style, E2E, configuration, form-validation test, ledger, RTM or other
forbidden path was edited.

The three stale assertions identified by independent review were corrected without weakening their
contracts:

- The reserved-attribute `TableRegion` cards fixture now supplies valid structured `cardRows`, so
  the test proves reserved identity/mobile/ARIA attributes rather than failing on an invalid cards
  input shape.
- Whitespace-only `SectionCard` and `FormCard` titles now use `renderedOrRejected`: an explicit
  required-name rejection is accepted, otherwise the rendered result must have a genuinely non-empty
  accessible name and no empty `aria-labelledby` target.
- The named cards alternative now supplies structured `cardRows`, checks every row's real label and
  value nodes, and separately asserts that desktop child content is rendered in the desktop region.
  The later data-label-only SSR fallback rejection regression remains unchanged and continues to
  reject client-action/raw-proxy-only semantics.

Pinned Node `24.19.0` / pnpm `11.22.0` evidence:

- Scoped Prettier **PASS**.
- Scoped ESLint **PASS**.
- `pnpm --filter @ja/portal typecheck` **PASS**.
- Full form-validation + primitive Vitest suite **PASS: 23/23 tests** (5 form-validation, 18
  primitive tests).
- No local unit/browser process from this round remains active.

This is a test-only handoff; independent review remains required and the worker does not self-approve
the A5-P product lease.

## Graceful-stop checkpoint — A5-N and A5-D recovery evidence

Status remains **BLOCKED for WP-A5 overall**. A5-P alone is independently approved; A5-S has not
opened, A5-N has a concrete phone interaction defect, and A5-D requires a post-remediation browser
review.

### A5-N final recovery review

Pinned Node `24.19.0` and pnpm `11.22.0` were used with a fresh global setup per viewport. The exact
checked-in drawer lifecycle test passed **20/20** cases across Worker, Manager, Finance and Owner at
360, 390, 430, 768 and 1440. The review did not use the invalid custom initial-focus oracle and did
not enter the downstream A5-S Finance-field journey.

The scoped readable-label/no-overflow test remains RED:

- 360×800, 390×844 and 430×932: visible `.skip-link` intercepts the `Toggle navigation` click, so the
  drawer does not open within the timeout;
- 768×1024: PASS;
- 1440×900: product exposes the permitted `Audit` label, but the current expected-label oracle omits
  it. This is a test-oracle reconciliation item, separate from the phone skip-link product defect.

Static ownership checks passed: `legacy.css` and `shell.css` contain no media blocks,
`responsive.css` owns the shell/drawer breakpoints, forbidden label-hiding techniques are absent, and
the 44 px shell target token is applied. No test/server process, listener, fixture lock or pointer was
left active.

### A5-D remediation checkpoint

The report detail page now imports `formValidation` directly from the helper module and retains the
existing `use:formValidation` action. The remediation did not touch the invoice page/CSS, server
actions, field names, version/RBAC/history/delete semantics or valid POST behavior.

Under Node `24.19.0`, scoped Prettier/ESLint/build and the focused helper suite (**5/5**) passed. The
earlier independent review had already passed invoice mobile/desktop/print behavior at all five
required widths, but the report validation flow failed there. A fresh five-viewport browser review of
the direct-import remediation is still mandatory; no approval is inferred.
