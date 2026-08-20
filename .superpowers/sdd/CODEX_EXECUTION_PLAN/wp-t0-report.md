# WP-T0 handoff report

Date: 2026-08-20
Starting HEAD: `85256a16dee1f5f6661f1fe7fda53605f50a19ae`
Gate: R0 PROCEED

WP-T0 is test-only. No production, migration, schema, or existing-test files outside the exact packet ownership were changed. No commit or staging was performed.

## Regression coverage

### Accounting Pack integration lifecycle

`tests/integration/accounting-pack-artifacts.test.ts` exercises the real `V3Repository` and `runArtifactJobs` path with isolated SQLite/document fixtures.

- `keeps XLSX, both CSV registers and JSON available when the PDF renderer fails` forces `JA_CHROMIUM_PATH` to a missing executable. It catches the current `accountingPackArtifacts(snapshot)` all-or-nothing handler: the PDF failure aborts the job before XLSX/CSV/JSON registration. Expected collateral types are `expense_csv`, `invoice_csv`, `json`, and `xlsx`; current result is `[]`. This supports `AUDIT-ART-001`–`AUDIT-ART-007`, `V31-016`, and `V31-017`.
- `starts a pack in a queued state and does not expose a ready artifact before processing` catches `createAccountingPack` returning `draft` while queuing a pending job. Expected `queued`; current `draft`. It also asserts the pending job and zero export rows (`AUDIT-ART-001`).
- `persists each ready format idempotently and uses a period-bearing filename` verifies all five output bytes, hashes, idempotent rerun, and no duplicate rows. The lifecycle/output assertions pass; the filename assertion catches the UUID-only `accounting-pack-{id}.pdf` response (`AUDIT-ART-002`, `AUDIT-ART-003`, `AUDIT-ART-006`, `V31-016`).

### Browser artifact lifecycle and archive/restore

`tests/e2e/artifact-lifecycle.spec.ts` uses the real Finance/Owner portal flows.

- Pack creation asserts a queued/pending state and a pending PDF response that is intentionally non-500. Current product behavior reports `Accounting Pack <id> is ready`; the API returns HTTP 500 with `{"message":"Internal Error"}` for the missing export (`AUDIT-ART-001`, `AUDIT-ART-004`). Soft assertions preserve both failures in one run.
- Processed downloads request PDF, XLSX, invoice CSV, expense CSV, and JSON and assert non-empty bodies plus period-bearing business filenames. All formats reach HTTP 200 with bytes; the current filename is `accounting-pack-<uuid>.pdf`, not a name containing `YYYY-MM` (`AUDIT-ART-002`, `AUDIT-ART-003`, `AUDIT-ART-005`, `AUDIT-ART-006`, `AUDIT-ART-007`, `V31-016`, `V31-017`).
- Owner lifecycle journeys now bind deterministic valid-UUID Client and Project fixtures. Each requires edit → archive → restore with a visible `active` state → close. The current Client page has no user-visible Client record or lifecycle actions; the Project detail has an active fixture but no edit/archive/restore/close actions. The separate seeded-account archive test remains an account-status/RBAC smoke test and is not evidence for the Client/Project requirement (`AUDIT-LIFE-001`, `V31-008`, `V31-009`). Round 4 assigns a distinct UUID pair to each viewport project and resets the owning row (plus the Project test's Client anchor) before each journey.

### Responsive role/viewport coverage

`tests/e2e/portal-responsive.spec.ts` covers authenticated worker, finance, and owner flows. It asserts rendered navigation text/font metrics, mobile drawer labels, finance form label/control geometry, 44px targets, table overflow behavior, invoice preview bounds, table headers, and minimum readable font sizes. At 390×844 the current defects are observable as:

- sidebar label spans at `font-size: 0px` (icon/first-letter-only rendering),
- finance forms not reduced to one grid column, and
- invoice preview table cells at `9.92px`, below the required 12px.

`playwright.config.ts` explicitly defines all required projects: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, and 1920×1080. The suite now runs Worker, Finance, and Owner drawer assertions at every configured width; `--list` reports 88 tests across the two new browser specs (`AUDIT-TEST-001`, `AUDIT-UI-001`–`AUDIT-UI-004`).

### Offline cross-user isolation

`tests/offline/cross-user-isolation.test.ts` starts an isolated portal, primes Manager-owned `/time` and `/reports` responses (including the Manager-only Recovery assignment marker), then primes Worker responses and switches only the authenticated session back to Manager while offline. It positively requires the Manager identity, actionable forms, and Recovery marker, while excluding Worker-only assignment/report data. It then drives the real offline time-draft form and switches to Finance, requiring no Finance queue item or Worker-attributed sync request. Current global IndexedDB/service-worker state leaks Worker data (`SEC-OFFLINE-001`). The Windows harness uses `pnpm.cmd` with `shell: true`; the earlier `spawn EINVAL` is resolved and is no longer a blocker.

## RED evidence

Commands were run from the repository root. RED is intentional and is caused by the confirmed product defects above, not setup or assertion typos.

```text
pnpm exec vitest run tests/integration/accounting-pack-artifacts.test.ts --reporter=verbose
3 failed
  PDF failure collateral: expected [expense_csv, invoice_csv, json, xlsx], received []
  queued state: expected "queued", received "draft"
  period filename: expected /2112-02/, received "accounting-pack-<uuid>.pdf"
```

```text
pnpm exec vitest run tests/offline/cross-user-isolation.test.ts --reporter=dot
1 failed
  Expected: 0
  Received: 1
  at tests/offline/cross-user-isolation.test.ts:215
```

```text
$env:JA_CHROMIUM_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "queued and a pending"
1 failed
  action message: expected queued|generating|pending, received "Accounting Pack <id> is ready"
  pending API: expected 404/409, received 500
  body: expected pending/not-ready detail, received {"message":"Internal Error"}
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "processed Accounting"
1 failed
  expected filename containing 2105-02, received attachment; filename="accounting-pack-<uuid>.pdf"
  PDF/XLSX/CSV/JSON status and non-empty-byte assertions passed before filename failure.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "owner archive"
1 failed
  expected visible Restore button after archive, but no matching control was rendered
  cleanup action completed successfully.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "deterministic client fixture"
1 failed (fixture seed and management page loaded; product RED)
  expected visible Client record/edit/archive/restore/close controls for UUID
  00000000-0000-4000-8000-000000000002; the client option was present in the real
  Create project form, but the current UI exposed no Client lifecycle surface or actions.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "deterministic project fixture"
1 failed (fixture detail loaded with status active; product RED)
  expected updateProject/archiveProject/restoreProject/closeProject actions for UUID
  00000000-0000-4000-8000-000000000003; no lifecycle forms were rendered.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/portal-responsive.spec.ts --grep "(owner|finance) navigation drawer"
2 failed (both authenticated sessions reached the opened drawer; product RED)
  Owner and Finance primary labels rendered at font-size 0px with widths 7–12px;
  the permitted admin drawer was hidden and its labels had zero layout width.
  The assertions enumerate the complete role-specific admin/security label sets, not only
  accessibility names.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/portal-responsive.spec.ts
3 failed
  navigation: required labels had rendered font-size 0px
  finance: expected one-column grid at 390px, received multi-column layout
  invoice preview: expected minimum cell font >= 12px, received 9.92px
```

The full root TypeScript command remains non-zero because of pre-existing unrelated repository/A1/website errors. Filtering its output to all WP-T0-owned paths produced no owned semantic errors after changing new relative imports to explicit `.js` specifiers.

## Existing tests that remain green

```text
pnpm exec vitest run tests/artifact-jobs.test.ts tests/reporting-artifacts.test.ts --reporter=dot
2 test files passed; 4 tests passed
```

The new Playwright files parse and enumerate successfully:

```text
pnpm exec playwright test --config=playwright.config.ts --list tests/e2e/portal-responsive.spec.ts tests/e2e/artifact-lifecycle.spec.ts
Total: 88 tests in 2 files
```

## Changed files

- `playwright.config.ts` — required viewport projects and E2E reporting/browser fixture environment.
- `tests/e2e/auth.ts` — shared sign-in helper, valid account archive target, and deterministic Client/Project lifecycle fixtures.
- `tests/e2e/portal-responsive.spec.ts` — responsive role/viewport regression flows.
- `tests/e2e/artifact-lifecycle.spec.ts` — artifact pending/download and archive/restore browser flows.
- `tests/integration/accounting-pack-artifacts.test.ts` — forced-failure, queued, ready, idempotency, and filename integration regressions.
- `tests/offline/cross-user-isolation.test.ts` — browser IndexedDB cross-user isolation regression.
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-t0-report.md` — this handoff.

## Unresolved fixture/interface needs

- The integration suite now observes transient `running` with a deterministic test-owned Worker-thread barrier around the real durable runner. There is still no public production per-format status/error contract; the proposed follow-up shape is recorded in the fix-round section below.
- Portal preview runs from the package working directory, so the test config supplies the repository reporting logo path. On this Windows host the E2E command also needs `JA_CHROMIUM_PATH` set to the installed Playwright Chromium executable; this is a harness/environment requirement, not a production change.
- The root full typecheck/release matrix remains outside this bounded tranche and is affected by unrelated dirty A1 work. No production behavior was altered to make these tests pass.

## Requirement IDs

`AUDIT-TEST-001`, `V31-008`, `V31-009`, `V31-016`, `V31-017`, `AUDIT-ART-001`–`AUDIT-ART-007`, `AUDIT-UI-001`–`AUDIT-UI-004`, `AUDIT-LIFE-001`, `SEC-OFFLINE-001`.

## Fix round 1/5 — independent review remediation

This section is appended for the review round. The work remains test-only, inside the exact WP-T0
ownership list. No production file, migration, schema, unrelated test, index, or commit was
changed.

### Review findings addressed

- `tests/integration/accounting-pack-artifacts.test.ts` now has a test-owned Worker-thread barrier
  around the real `runArtifactJobs` contract. The worker pauses after the production `runDueJobs`
  claim; the main test connection observes `job.state='running'`, attempt 1, a live lease, and an
  unfinished `job_run`, then releases the barrier. The same forced-renderer test drives all five
  retry attempts by moving only its disposable fixture's retry timestamp into the past. It checks
  pending retry metadata, terminal `failed`/attempts=5, failure outcome/error code/timestamps, and
  the desired per-format result (`pdf=failed`, four collateral formats `ready`) with read-back
  byte-length and SHA-256 checks. Current product output is all five formats absent, so this stays
  RED for the verified all-or-nothing defect.
- `tests/e2e/artifact-lifecycle.spec.ts` derives pack IDs from the shared disposable SQLite fixture,
  never from an actionable pending PDF link. Pending asserts the row is non-ready and exposes no
  PDF link, then requests the pending format and requires an intentional 404/409-style response,
  never 500, with lifecycle detail. The processed flow calls the real `runArtifactJobs` worker
  contract directly against the E2E fixture and does not click the admin `Run due jobs` action.
- The browser artifact suite now includes a terminal failed-format flow. It forces Chromium failure
  in the test-owned worker, advances the fixture job through five deterministic attempts, verifies
  retry/error metadata, then downloads the failed PDF through the real portal endpoint and requires
  non-500 failed/pending semantics. Current API behavior is HTTP 500, so the test is intentionally
  RED.
- The existing account-status archive smoke test conditionally clicks a reachable Restore control
  and verifies the restored account with `status=active`; it is retained as separate RBAC evidence,
  while the Client/Project lifecycle requirement is covered by the dedicated deterministic journeys
  in fix round 3 below. Cleanup still uses the real same-origin action with the valid seeded UUID.
- `tests/offline/cross-user-isolation.test.ts` no longer opens or names an IndexedDB database or
  object store. It now also primes real Worker `/time` and `/reports` service-worker responses,
  restores only a Manager session offline, and asserts the Worker-only assignment/report are absent;
  the existing Finance visible queue and real `/api/sync` attribution assertions remain. The
  current global cache leaks Worker data, so the RED is independent of the eventual DB naming/
  partition implementation. The Windows child process now has an explicit startup error listener/
  race; `spawn EINVAL` is not an active blocker.
- E2E fixture paths are shared across Playwright global setup and test workers through a disposable
  pointer file owned by `tests/e2e/environment.ts`/`global-setup.ts`; this removes the prior
  process-ID path mismatch without touching application code. Deterministic role/format selectors,
  collateral file reads/hashes, and non-tautological ISO timestamp/error assertions were retained.

### Focused RED commands and outcomes

```text
pnpm exec vitest run tests/integration/accounting-pack-artifacts.test.ts --reporter=verbose
3 failed, 1 passed
  PDF isolation/per-format status: expected {pdf: failed, xlsx/invoice_csv/expense_csv/json: ready},
    received all five formats failed (no collateral exports)
  queued state: expected "queued", received "draft"
  period filename: expected /2112-02/, received "accounting-pack-<uuid>.pdf"
  running-barrier test passed; retry attempts/error_code/terminal failed metadata executed before
  the intentional per-format assertion.
```

```text
pnpm exec vitest run tests/offline/cross-user-isolation.test.ts --reporter=verbose
1 failed
  Finance visible queue: expected 0 `.queue` elements, received 1
  The child process reached the portal and cleanup completed; no spawn EINVAL/setup failure.
```

```text
$env:JA_CHROMIUM_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "queued and a pending"
1 failed (soft assertions report all confirmed defects)
  action state: expected queued/generating/pending, received "Accounting Pack <id> is ready"
  pending row: expected no PDF link, received one actionable PDF link
  pending API: expected intentional 404/409 non-500, received HTTP 500
  body: expected lifecycle detail, received {"message":"Internal Error"}
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "processed Accounting"
1 failed
  Direct real worker processed all five formats: HTTP 200 and non-empty bytes passed for PDF,
  XLSX, invoice CSV, expense CSV, and JSON; filename assertion received
  attachment; filename="accounting-pack-<uuid>.pdf" instead of a period-bearing name.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "terminal failed"
1 failed
  Five test-owned worker attempts reached job state failed/attempts=5 and recorded failure metadata;
  failed-format download then received HTTP 500 instead of intentional 404/409 retry/error semantics.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "owner archive"
1 failed
  Expected one Restore button after archive, received zero. The conditional click/active-state
  verification remains in the test body for the eventual fixed journey; cleanup passed.
```

```text
pnpm exec playwright test --config=playwright.config.ts --list tests/e2e/portal-responsive.spec.ts tests/e2e/artifact-lifecycle.spec.ts
Total: 88 tests in 2 files across phone-360/390/430, tablet-768/1024, laptop-1280, desktop-1440,
and wide-1920 projects.
```

### Existing green evidence and type/format checks

```text
pnpm exec vitest run tests/artifact-jobs.test.ts tests/reporting-artifacts.test.ts --reporter=dot
2 test files passed; 4 tests passed
```

`pnpm exec prettier --write` completed for all owned test/config files. The repository-wide
`pnpm exec tsc --noEmit` remains non-zero from pre-existing dirty A1/portal/website errors; filtering
its output to `tests/e2e/global-setup.ts`, `tests/e2e/environment.ts`,
`tests/e2e/artifact-lifecycle.spec.ts`, `tests/integration/accounting-pack-artifacts.test.ts`, and
`tests/offline/cross-user-isolation.test.ts` produced no owned semantic errors after explicit `.js`
imports and the fixture-path fix.

### Fix-round changed files

- `tests/e2e/artifact-lifecycle.spec.ts` — fixture-derived pending IDs, direct durable worker, running/failed download browser coverage, full archive/restore journey.
- `tests/e2e/environment.ts` — shared disposable global-setup/test-worker fixture pointer.
- `tests/e2e/global-setup.ts` — pointer lifecycle and explicit `.js` imports.
- `tests/integration/accounting-pack-artifacts.test.ts` — running barrier, retry/terminal metadata, per-format failure expectation, hash/read verification.
- `tests/offline/cross-user-isolation.test.ts` — UI queue/sync attribution oracle and child startup error listener.
- `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-t0-report.md` — this appended fix-round report.

### Remaining interface need / NEEDS_CONTEXT

The running state is covered deterministically through a test-owned barrier, so it does not block
this test tranche. The product still has no public per-format lifecycle/error interface: one
`accounting_pack` job owns all formats and `accounting_pack_export` stores only successful rows.
The exact proposed production contract for the follow-up implementation is a read API/service that
returns one row per `(packRevisionId, exportType)` with `queued|running|ready|failed`, `attempts`,
`retryAt`, `errorCode/message`, and (when ready) storage key/hash/size/semantic filename; pending
and failed downloads must map that row to an intentional non-500 response. Once that interface is
approved, replace the test projection with the authoritative per-format rows while retaining the
same forced PDF failure and non-500 download assertions. No test-only guess was promoted into
production behavior.

Requirement IDs exercised in this fix round: `AUDIT-ART-001`–`AUDIT-ART-007`, `AUDIT-TEST-001`,
`AUDIT-LIFE-001`, `V31-016`, `V31-017`, `V31-018`, and `SEC-OFFLINE-001`.

## Fix round 2/5 — fixture pointer ownership and report consolidation

The remaining review finding is resolved within the exact test/config ownership. Fixture identity is
now generated uniquely per Playwright invocation (`randomUUID` token), while a stable discovery
pointer is protected by a create-only lock. The lock rejects a fresh concurrent run and only
recovers after the two-hour stale threshold; the pointer is created with exclusive `wx` semantics
after the disposable database/document paths exist and is never overwritten. Pointer validation
requires the expected token, owner PID, fresh timestamp, confined token-derived filenames, and
existing database/document-root paths. A browser worker may discover its own fixture through the
validated current pointer even when global-setup environment mutations are not inherited.

`tests/integration/accounting-pack-artifacts.test.ts` now includes focused harness evidence for a
fresh valid pointer, stale pointer rejection, foreign/concurrent token rejection, and refusal to
overwrite an existing pointer. `tests/e2e/artifact-lifecycle.spec.ts` validates the active pointer
before reading the fixture and uses the pointer's validated paths for the direct durable worker.
Global setup acquires/releases the lock, removes only stale/malformed interrupted pointers after the
lock is owned, and retains normal teardown cleanup. No production code was changed.

```text
pnpm exec vitest run tests/integration/accounting-pack-artifacts.test.ts --reporter=verbose -t "E2E fixture pointer"
1 passed, 4 skipped
  rejects stale/foreign pointers and refuses concurrent overwrite — PASS
```

```text
$env:JA_CHROMIUM_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "queued and a pending"
1 failed (expected product RED; fixture handoff passed)
  no pointer/path/setup error; pending action still says ready, exposes PDF, and returns HTTP 500
  for the missing export.
```

```text
$owned = pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern "playwright.config.ts|tests/e2e/environment.ts|tests/e2e/global-setup.ts|tests/e2e/artifact-lifecycle.spec.ts|tests/integration/accounting-pack-artifacts.test.ts|tests/offline/cross-user-isolation.test.ts"
0 owned diagnostics (repository command remains non-zero on unrelated dirty paths)
```

The report's earlier first-round references are consolidated: the authenticated browser matrix is
`88 tests in 2 files` (not 48 or 56), and the `running` lifecycle is covered by the deterministic
test-owned Worker barrier. The remaining interface need is only the production per-format status/
error contract described above; no public running pause hook is required for this tranche.

## Fix round 3/5 — Gate 1 role, lifecycle, and offline cache evidence

Gate 1 identified three evidence gaps. They are closed in the exact owned test paths; no production
behavior, schema, migration, or unrelated test was changed.

### Role-specific mobile navigation

`tests/e2e/portal-responsive.spec.ts` retains Worker coverage and adds separate authenticated Owner
and Finance tests. Every role opens the real drawer at phone widths 360×800, 390×844, and 430×932;
at 768×1024 and the remaining matrix widths the same assertions inspect the visible sidebar. The
tests assert the rendered label spans' text, non-zero font size, and layout width for all primary
items. Owner additionally requires the full administration list plus `Audit`; Finance requires the
full administration list without `Audit`. The bottom mobile navigation is checked separately for
the five primary links. This is rendered UI evidence, not an accessibility-name-only assertion.

Current RED is the confirmed CSS defect: at phone-390 primary spans are `font-size: 0px` and 7–12px
wide, while `.admin-nav` is hidden and its links have zero layout width. The test body reaches both
role-specific label sets through soft assertions.

### Client and Project lifecycle

`tests/e2e/auth.ts` seeds a deterministic valid-UUID Client/Project pair for each of the eight
Playwright projects (`phone-360` through `wide-1920`). For example, the phone-390 pair is Client
`00000000-0000-4000-8000-000000000102` / `Lifecycle Client · phone-390` and Project
`00000000-0000-4000-8000-000000000202` / `Lifecycle Project · phone-390`; no viewport shares those
mutable rows with another viewport.

`tests/e2e/artifact-lifecycle.spec.ts` has separate Owner journeys for each fixture. Each test
resets its owning row to `active`, and the Project journey also resets its paired Client anchor so a
preceding Client journey cannot affect the project detail. The Client test first proves the real
management page contains the seeded Client in the project form; the Project test opens the exact
UUID route and proves its visible state is `active`. Both then keep the full eventual UI journey in
the test body: edit a user-visible name, archive, expose the UUID-bound archived entity, restore it
through the UI, verify that same entity is visible and `active`, then close it. No direct
database/action cleanup is used as restore evidence. The current Client page has no user-visible
Client record or lifecycle actions, and the Project page has no update/archive/restore/close forms,
so both focused tests fail for product gaps after fixture setup succeeds. The older seeded-account
archive test is explicitly separate account-status/RBAC evidence and is not counted as Client/Project
lifecycle coverage.

### Offline assignments and private service-worker responses

`tests/offline/cross-user-isolation.test.ts` now primes the real Manager `/time` and `/reports`
responses first, asserting an actionable form and the Manager-only `Caustic Recovery Skid
Integration · Demo` assignment marker before Worker cache priming. It then restores only the
Manager cookie and opens those routes offline in the same browser context. It positively asserts the
Manager identity, forms, and Recovery marker; it strictly excludes the Worker-only `Remote Controls
Support Retainer · Demo` assignment and private report title. It does not name the IndexedDB
database, object store, or service-worker cache key. The existing Worker offline draft → Finance
account switch remains and still asserts visible queue state plus real `/api/sync` attribution.
Current behavior serves the cached Worker identity (`Alex Rivera`) to the Manager, producing product
RED; the child process reaches the portal and cache preconditions before that failure, so it is not a
spawn/setup error.

### Focused RED/list commands and outcomes

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "deterministic client fixture"
1 failed (fixture seed and management page loaded; product RED)
  expected Client record/edit/archive/restore/close controls for UUID
  00000000-0000-4000-8000-000000000102; the Client option was present in the real
  Create project form, but no UUID-bound Client lifecycle scope/actions were rendered.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "deterministic project fixture"
1 failed (fixture detail loaded with status active; product RED)
  expected updateProject/archiveProject/restoreProject/closeProject for UUID
  00000000-0000-4000-8000-000000000202; no UUID-bound lifecycle forms were rendered.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/portal-responsive.spec.ts --grep "(owner|finance) navigation drawer"
2 failed (both authenticated sessions opened the real drawer; product RED)
  Owner and Finance primary labels were rendered at font-size 0px with widths 7–12px;
  the permitted admin drawer was hidden and its labels had zero layout width.
```

```text
pnpm exec vitest run tests/offline/cross-user-isolation.test.ts --reporter=verbose
1 failed (portal startup, Worker cache priming, and offline navigation reached product UI)
  Manager identity: expected "Daniel Brooks", received cached Worker "Alex Rivera".
  The same body also asserts Worker-only assignment/report absence before the existing
  Finance queue/sync attribution checks; no spawn EINVAL or fixture setup error occurred.
```

```text
pnpm exec playwright test --config=playwright.config.ts --list tests/e2e/portal-responsive.spec.ts tests/e2e/artifact-lifecycle.spec.ts
Total: 88 tests in 2 files across phone-360/390/430, tablet-768/1024, laptop-1280, desktop-1440,
and wide-1920 projects.
```

### Remaining lifecycle interface need / NEEDS_CONTEXT

The production Client/Project lifecycle interface is absent. The tests propose, without
implementing, user-visible forms/actions carrying the deterministic entity UUID and optimistic
version: `updateClient`, `archiveClient`, `restoreClient`, `closeClient`, and corresponding Project
actions. Each action must preserve history, expose `active|archived|closed` state, and make the
restore-to-active transition visible. Once the production contract is approved, bind the current
journey to its authoritative selectors while retaining the same IDs and state assertions. No
test-only production hook was added.

Requirement IDs exercised in this fix round: `AUDIT-TEST-001`, `AUDIT-UI-001`, `AUDIT-LIFE-001`,
`V31-008`, `V31-009`, and `SEC-OFFLINE-001`.

## Fix round 4/5 — Gate 1 fixture isolation and positive offline oracle

The two remaining Gate 1 quality findings are addressed only in the owned test/fixture paths.

### Lifecycle fixture isolation

`tests/e2e/auth.ts` now defines the eight configured Playwright project names and derives a distinct
valid UUID Client/Project pair for each project. For example, phone-390 owns Client
`00000000-0000-4000-8000-000000000102` and Project `00000000-0000-4000-8000-000000000202`;
phone-360 owns a different pair. Global setup seeds every pair active/version 1. Each Client test
resets its own Client row immediately before sign-in; each Project test resets both its Project and
paired Client anchor before sign-in. This prevents a prior Client journey's archived/closed state
from leaking into the Project journey while allowing parallel projects to write disjoint rows.
Reset updates require exactly one matching row, so a missing fixture is setup RED rather than a
false product failure.

`tests/e2e/artifact-lifecycle.spec.ts` keeps the complete edit → archive → restore → visible
`active` → close journey. Client state/name assertions are inside the UUID-bound
`data-entity-id` scope; Project state/name assertions are inside `.project-page` only after the
exact UUID route is asserted. Action forms remain bound by the hidden UUID input. No direct restore
or database cleanup substitutes for the UI journey. Current product RED remains intentional: the
phone-390 Client page has no UUID-bound Client surface/actions, and the Project detail has no
`updateProject`/`archiveProject`/`restoreProject`/`closeProject` forms.

### Offline Manager baseline and cache oracle

`tests/offline/cross-user-isolation.test.ts` now primes Manager `/time` and `/reports` first and
requires a real Manager-only Recovery assignment (`Caustic Recovery Skid Integration · Demo`) in
both forms before Worker cache priming. On the offline Manager switch it positively asserts the
Manager identity, actionable `/time` and `/reports` forms, and that Recovery marker; it also
strictly excludes the Worker-only `Remote Controls Support Retainer · Demo` assignment and private
report title. The assertions use visible UI/form data and do not name IndexedDB or service-worker
implementation details. The Worker offline draft → Finance visible queue and real `/api/sync`
attribution checks remain unchanged.

### Round-4 commands and outcomes

Node 24 was not available in PATH; `node --version` reported `v25.8.1` and the package emitted its
existing Node 24.19 engine warning. Focused commands still ran against the pinned Chromium binary:

```text
$env:JA_PLAYWRIGHT_EXECUTABLE_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
$env:JA_CHROMIUM_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "deterministic client fixture" --reporter=line
1 failed after fixture seed and real management page setup; product RED reported UUID-bound Client scope plus edit/archive/restore/close controls absent.
```

```text
pnpm exec playwright test --config=playwright.config.ts --project=phone-390 tests/e2e/artifact-lifecycle.spec.ts --grep "deterministic project fixture" --reporter=line
1 failed after the exact seeded Project UUID route loaded with visible `active`; product RED reported update/archive/restore/close forms absent.
```

```text
pnpm exec vitest run tests/offline/cross-user-isolation.test.ts --reporter=verbose
1 failed after isolated portal startup, Manager-first cache priming, Worker cache priming, and offline navigation; Manager expected `Daniel Brooks`, received cached Worker `Alex Rivera`.
The positive Recovery form/assignment assertions and Worker-only exclusions are in the same body; no spawn EINVAL or fixture/setup error occurred.
```

```text
pnpm exec playwright test --config=playwright.config.ts --list tests/e2e/portal-responsive.spec.ts tests/e2e/artifact-lifecycle.spec.ts
Total: 88 tests in 2 files across phone-360/390/430, tablet-768/1024, laptop-1280, desktop-1440, and wide-1920 projects.
```

```text
pnpm exec prettier --check tests/e2e/auth.ts tests/e2e/artifact-lifecycle.spec.ts tests/offline/cross-user-isolation.test.ts
All matched files use Prettier code style.
```

```text
$owned = pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern "tests/e2e/auth.ts|tests/e2e/artifact-lifecycle.spec.ts|tests/offline/cross-user-isolation.test.ts"
0 owned diagnostics (repository command remains non-zero only on unrelated dirty paths).
```

After teardown, no `127.0.0.1:4173`/`4174` listener and no `data/e2e-fixture-current.json` or lock
artifact remained. No production file, staging area, or commit was changed.

Round-4 requirements: `AUDIT-LIFE-001`, `V31-008`, `V31-009`, and `SEC-OFFLINE-001`.
