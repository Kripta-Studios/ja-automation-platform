# Goal for Codex

Transform `Kripta-Studios/ja-automation-platform`, starting from branch `codex/v3-completion-20260819`, into the **complete, production-ready J&A Automation V3 platform** defined by `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`, while also implementing the approved V3.1–V3.4 product extensions in this pack in a staged, testable way.

The outcome must be a maintainable modular monolith for real J&A Automation operations, not an MVP or demo. Correct the confirmed defects, close every mandatory SPEC gap, remove misleading/incomplete product states, refactor oversized hotspots safely, and add the industrial/business/data-readiness capabilities needed for long-term use.

## Non-negotiable outcomes

1. Accounting/report artifacts work reliably: PDF/XLSX/CSV/JSON are independently generated and independently fail/retry; XLSX/CSV cannot be collateral damage from a PDF renderer failure; download endpoints and UI represent pending/failed/ready correctly.
2. Required reports and real versioned invoice templates are implemented and selectable through a registry.
3. Responsive/mobile UX is genuinely usable at required widths, including full drawer labels, stacked finance forms and clearly structured edit forms.
4. CRUD/lifecycle is coherent across clients, projects, time, expenses and other mutable operational entities while preserving financial/audit history.
5. `PortalShell.svelte`, `portal.css`, `repository.ts` and `v3-repository.ts` stop being unbounded catch-all files; refactor into domain modules/components without changing the deployable modular-monolith architecture.
6. Normal product flows do not depend on an admin manually running durable jobs.
7. Security/RBAC/private-artifact/audit behavior remains or becomes stronger.
8. Industrial operations are first-class: plant/area/line/station/assets, PLC/HMI/robot version history, technical changes, FAT/SAT, punch list and closeout.
9. Business operations mature: presets/templates, budget baseline/forecast, scope/change orders, travel, planning, skills/certifications, approvals, notifications, imports/exports and integrity/operations centers.
10. Build the data-readiness layer now so future GBT/JEPA work can be scientifically valid: point-in-time snapshots, immutable events, versioned features/exports, model registry, prediction history and shadow mode. Do not fabricate a validated production model without real data.
11. Expand unit/integration/invariant/security/offline/E2E/responsive coverage so the observed failures would have been caught automatically.
12. Keep all documentation and traceability current.

## Completion condition

Do not stop because code compiles. Stop only when mandatory requirements are implemented, independently verified, the release gates are green, the traceability matrix is reconciled, and the final Sol/high integration reviewer returns `READY` or a narrowly documented external-prerequisite blocker rather than a code defect.
