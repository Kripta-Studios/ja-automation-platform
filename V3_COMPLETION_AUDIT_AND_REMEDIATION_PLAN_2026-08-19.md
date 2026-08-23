# J&A Automation V3 — Completion Audit & Remediation Plan

> **Client Essential scope notice (2026-08-23):** This is a historical defect audit. Only defects that affect CORE-01..17, the Client Essential 32-step journey, or required production correctness/security remain release-blocking. Industrial-platform, generic business/ERP and ML/data-readiness expansion phases are **DEFERRED POST-CORE ROADMAP**.

## Verdict at the audited baseline

The branch `codex/v3-completion-20260819` is a substantial functional base with meaningful RBAC/audit/finance/reconciliation work, but it must **not** be represented as fully developed to the V3 spec or production-complete yet.

The priority is not a rewrite. Preserve the good backend/security/accounting foundations while correcting lifecycle, artifact generation, reporting, responsive UX, test coverage and modularity.

## Confirmed / code-backed defects to fix first

### FIX-001 — Accounting Pack “ready” state is misleading

The create action queues an Accounting Pack job but the user-facing success path can describe the pack as ready before export artifacts exist. Change the product state machine so the response/UI communicates queued/generating and transitions to ready only per generated artifact.

**Acceptance:** creating a pack cannot expose a ready download link until that format is actually registered and readable.

### FIX-002 — PDF generation can block XLSX/CSV/JSON

The current artifact generation path eagerly constructs the PDF before later output formats. Logo/Chromium/PDF failure can abort the entire artifact list, leaving XLSX/CSV absent and leading to download failures.

**Acceptance:** force the PDF renderer to fail; XLSX, invoice CSV, expense CSV and JSON still generate and download successfully.

### FIX-003 — Pending/absent exports can become HTTP 500

The export endpoint/repository path throws when an export row is absent. “Not generated yet” must be a deliberate domain condition, not an unhandled server error.

**Acceptance:** queued/pending format receives an intentional pending/not-ready response and UI; failed format exposes retry/error; ready format streams with integrity verification.

### FIX-004 — Manual finance job processing is too central

Normal business flows should not require a human to press “Process durable finance jobs” before downloads work.

**Acceptance:** production job runner/timer/worker path automatically processes queued jobs; manual action may remain as diagnostics/repair only.

### FIX-005 — Accounting Pack can become stale

Existing period packs may be returned from the stored snapshot instead of clearly refreshing/versioning after source corrections.

**Acceptance:** define immutable snapshot versions or explicit regenerate/refresh behavior. The UI identifies which source cut/version is being downloaded.

### FIX-006 — Export filenames are implementation-centric

Internal pack IDs should not be the sole filename semantics.

**Acceptance:** use deterministic business names such as period/report/client/project as required by the spec; uniqueness may include version/short-id without destroying semantics.

### FIX-007 — Invoice templates are not real templates

The template package is minimal and current PDF variants mainly alter titles while sharing a generic body. The billing form allows arbitrary free-text template ID.

**Acceptance:** versioned registry with at least Labor Detailed, Labor Summary, Expenses Detailed, Fixed/Milestone, Credit/Adjustment; selector uses valid registry IDs; each template has materially appropriate blocks/grouping/columns/totals and tests.

### FIX-008 — Required report catalog is incomplete

Source/period reports exist, but the V3-required catalog is broader.

**Mandatory baseline catalog:** Project Profitability, Worker Statement, Labor Cost, Client Labor, Expense, Technical, Missing Activity, Billing Run, Invoice Register, AR, Revenue, plus Accounting Pack outputs.

**Acceptance:** each required report is reachable, filterable as appropriate, authorization checked and exportable when required.

### FIX-009 — Client/project lifecycle is incomplete

Creation exists, but edit/archive/restore/close lifecycle is not uniformly exposed. Existing status/version fields should be used rather than dangerous history deletion.

**Acceptance:** edit/archive/restore/close operations with dependency/audit rules; financial/history-bearing objects remain preserved.

### FIX-010 — Time/expense/report lifecycle is inconsistent

Report drafts have some modify/delete semantics, while time/expense details are substantially read-only.

**Acceptance:** coherent draft→submitted→approved/final lifecycle; safe edit/delete eligibility for drafts; finalized records use correction/void/version workflow rather than destructive deletion.

### FIX-011 — Mobile sidebar intentionally hides labels

Responsive CSS uses a `font-size: 0` plus `::first-letter` technique, while later drawer rules create contradictory behavior.

**Acceptance:** phone drawer shows full labels. Tablet icon-only mode, if retained, uses explicit icons/tooltips/accessibility labels rather than first-letter text hacks.

### FIX-012 — Finance configuration collapses on narrow screens

Dense grids retain multiple columns at widths where fields become unusably narrow.

**Acceptance:** required phone widths use a readable single-column flow or container-aware grid with a safe minimum field width. No compressed side-by-side controls.

### FIX-013 — Form/card visual hierarchy is inconsistent

Sections such as private artifact registration and skills/availability do not consistently share card padding/border/label hierarchy. Modify Report labels exist semantically but lack strong section/field hierarchy.

**Acceptance:** shared form/card primitives; consistent padding/borders; clear section headings; persistent labels; helper/error state; visible focus; same standards applied to comparable forms.

### FIX-014 — Architecture megafiles violate modular-monolith intent

`PortalShell.svelte`, `portal.css`, `repository.ts`, and `v3-repository.ts` have become catch-all hotspots.

**Acceptance:** incremental domain/component extraction, stable contracts, no circular architecture, tests green, no change to single-deployable modular monolith.

### FIX-015 — E2E coverage misses the failing product surfaces

Existing browser coverage does not comprehensively exercise owner/finance mobile screens, drawer labels, report edit hierarchy or accounting artifact lifecycle/failures across all specified viewports.

**Acceptance:** explicit viewports 360, 390, 430, 768 and desktop; owner/finance/admin flows; forced partial artifact failure; usability assertions beyond no-horizontal-overflow.

### FIX-016 — Artifact job unit coverage is structural rather than behavioral

Tests that merely assert a handler is registered cannot prove lifecycle correctness.

**Acceptance:** execute handlers, inject failure by format, verify idempotency/status/persistence/download behavior.

### FIX-017 — Handcrafted XLSX/CSV path needs stronger safety tests

Custom spreadsheet generation is a risk area for column references, wide sheets, Unicode, escaping and formula injection.

**Acceptance:** round-trip/openability tests for wide/unicode content, spreadsheet/CSV injection prevention, and migration to a mature library if that materially reduces risk.

## Foundations worth preserving

Do not throw away:

- existing finance authorization and account status checks;
- step-up security where present;
- storage-key safety and artifact hash validation;
- audit redaction/foundation;
- SQLite transaction discipline;
- exact/minor-unit money patterns;
- Accounting Pack reconciliation checks;
- existing period report source traceability.

## Remediation order

1. Baseline + regression reproduction.
2. Mechanical architecture decomposition sufficient for safe ownership.
3. Artifact pipeline, mobile/forms, reports/templates, lifecycle.
4. Independent finance/mobile/security/spec review.
5. Client Essential operational/financial/reporting/security completion.
6. Responsive/accessibility, automatic jobs, deployment and recovery.
7. Industrial, generic business and data-readiness expansion: deferred post-core.
8. Hardening/release.

## Release-blocking principles

- No fake-ready async states.
- No known 500 on ordinary supported export flows.
- No hard-delete of finalized financial history.
- No invisible/first-letter mobile navigation.
- No mandatory report/template omitted.
- No unvalidated ML prediction represented as fact.
- No completion claim without independent evidence.
