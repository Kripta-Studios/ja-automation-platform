# WP-T0 — P0 regression-test expansion

## ID and objective

WP-T0. Add executable failing regression coverage for the confirmed artifact lifecycle, required responsive-role/viewports, archive/restore, and offline cross-user isolation defects. Production behavior must not be changed.

## Linked requirements

`AUDIT-TEST-001`, `V31-016`, `V31-017`, plus RED evidence supporting `AUDIT-ART-001`–`007`, `AUDIT-UI-001`–`004`, `AUDIT-LIFE-001`, and `SEC-OFFLINE-001`.

## Preconditions and dependencies

Gate R0 must return PROCEED. Read root and `tests/AGENTS.md`, TDD plus writing-good-tests, playwright-qa, responsive-regression, and relevant plan/packet sections.

## Complexity and routing

Complexity A: stable test-only ownership and known defective behavior. Owner: `test_worker` (Luna max). Do not spawn subagents.

## Exclusive owned write paths

- `playwright.config.ts`
- `tests/e2e/auth.ts`
- `tests/e2e/environment.ts`
- `tests/e2e/global-setup.ts`
- new `tests/e2e/portal-responsive.spec.ts`
- new `tests/e2e/artifact-lifecycle.spec.ts`
- new `tests/integration/accounting-pack-artifacts.test.ts`
- new `tests/offline/cross-user-isolation.test.ts`

## Forbidden write paths

All production/application/package implementation; migrations/schema; existing tests outside exact ownership; documentation/traceability; unrelated dirty files.

## Read-only interfaces

Current repository/job/download APIs, authenticated portal selectors and role fixtures, service worker/IndexedDB contracts, current lifecycle actions. Do not change them; record missing hooks as a blocker/interface need.

## Required test behavior

1. Tests must exercise real lifecycle behavior, not handler registration or source text.
2. Add forced per-format PDF failure coverage proving today that non-PDF collateral failure is caught.
3. Cover queued/running/ready/failed download semantics and missing-output non-500 expectation.
4. Configure/assert 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080 for authenticated owner/finance/worker flows as appropriate.
5. Assert full readable navigation labels, 44px targets, deliberate table/preview behavior, and readable stacked finance forms—not only overflow.
6. Add archive/restore coverage where reachable.
7. Add cross-user offline cache/queue isolation regression that fails for the verified global-key behavior.
8. No skips, weakened assertions, arbitrary sleeps, or production edits.

## Tests and acceptance

Every new regression names the production break it catches, uses hand-derived expectations, and is run to an expected RED failure caused by the verified defect (not setup/typo). Existing unrelated tests remain green where runnable. Record exact RED commands/output and any environment limitation.

## Handoff

Write full report to `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-t0-report.md`: exact tests, break each catches, RED evidence, commands/results, files, unresolved fixture/interface needs, and requirement IDs. Return short status only.

