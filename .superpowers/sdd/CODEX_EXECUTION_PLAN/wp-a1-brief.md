# WP-A1 — Frontend mechanical decomposition

## ID and objective

WP-A1. Preserve the current portal façade and behavior while mechanically decomposing `PortalShell.svelte` and `portal.css` along the already-approved boundaries.

## Linked requirements

`SPEC-ARCH-001`, `V31-015`; prerequisite for `V31-011`–`V31-014` and `V31-016`.

## Preconditions and dependencies

Gate R0 must return PROCEED. Continue from existing `PortalChrome.svelte`, `billing-actions.ts`, and `operations-actions.ts`; do not restart architecture. Read root and `apps/portal/AGENTS.md`, the architecture-decomposition skill, and the relevant plan/packet sections.

## Complexity and routing

Complexity B because the lead must preserve non-local render/offline/CSS source-order contracts. Owner: `frontend_lead` (Sol medium). The lead may define stable A leaves but must not spawn subagents in this packet; parent controls any later Luna leaf dispatch.

## Exclusive owned write paths

- `apps/portal/src/lib/PortalShell.svelte`
- `apps/portal/src/lib/PortalChrome.svelte`
- `apps/portal/src/portal.css`
- new `apps/portal/src/lib/portal/portal-data.ts`
- new `apps/portal/src/lib/portal/portal-format.ts`
- new `apps/portal/src/lib/portal/offline-controller.ts`
- new `apps/portal/src/lib/portal/sections/TodaySection.svelte`
- new files under `apps/portal/src/styles/portal/`: `legacy.css`, `foundation.css`, `login.css`, `shell.css`, `surfaces.css`, `dashboards.css`, `forms-management.css`, `details-invoices.css`, `responsive.css`, `polish.css`
- narrowly scoped tests inside `apps/portal/**` only when required for extraction parity

## Forbidden write paths

All database/reporting/migration files; `apps/portal/src/routes/app/[section]/+page.server.ts`; root/shared E2E configuration and `tests/**`; documentation/traceability; any unrelated dirty file.

## Read-only interfaces

Public route/action names, server response shapes, repository APIs, CSS cascade/rendered behavior, offline storage/sync semantics. Escalate any required change rather than editing outside ownership.

## Required implementation behavior

1. Characterize hot dependencies and existing tests first.
2. Extract cohesive portal data/format helpers and offline controller without behavior changes.
3. Extract `TodaySection.svelte` only where contract is clear.
4. Split CSS mechanically in current source order into the ten named files and preserve import/cascade order.
5. Keep `PortalShell.svelte` as compatibility façade; avoid circular imports and duplicate logic.
6. Do not perform P0 responsive redesign in this packet beyond a parity fix essential to extraction.

## Tests and acceptance

Run the narrowest portal tests/typecheck after each tranche, then relevant unit/E2E smoke and build. Public routes/actions and rendered behavior remain stable; imports have no cycles; new files are cohesive; report exact commands/results. Browser screenshots at the eight authoritative viewports are evidence if the local authenticated runtime is available; inability must be explicitly evidenced, never represented as a pass.

## Handoff

Write full report to `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-a1-report.md`: summary, exact files, migrations (none expected), commands/results, browser evidence, preserved contracts, unresolved risks, requirement IDs, and interface changes needed. Return short status only.
