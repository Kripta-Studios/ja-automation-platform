---
name: ja-v3-completion-orchestrator
description: Orchestrate J&A Client Essential production-completion work across subagents. Use for dependency planning, work-packet delegation, ownership, review loops, integration gates, or any task spanning multiple J&A domains. Do not use for a trivial single-file fix.
---

# J&A Client Essential Completion Orchestrator

## Inputs

Read the Client Essential specification and checklist first, then root `AGENTS.md`. Use the original V3 spec only as non-conflicting domain reference, the remediation plan only for Essential defects, and the feature backlog only as deferred post-core roadmap.

## Procedure

1. **Baseline first.** Record branch/HEAD, working-tree status and baseline test status. Never destroy unrelated local changes.
2. **Build a dependency DAG.** Separate prerequisite refactors from behavior changes and later product additions.
3. **Choose work packets.** Each packet must have non-overlapping write ownership where parallelized.
4. **Classify complexity before assigning a model.** Use the Luna-first A/B/C policy below. Do not automatically send production implementation to Sol medium.
5. **Prefer Luna/max for implementation whenever the contract can be bounded.** Sol leads should spend their budget defining invariants/interfaces and reviewing hard semantics, then delegate stable leaves back to Luna.
6. **Use worktrees when parallel writes would otherwise share a tree.** Keep hot-file ownership exclusive.
7. **Require implementer evidence.** Changed paths, tests, migrations, assumptions and remaining risks.
8. **Require independent verification.** Route frontend changes to browser QA, financial changes to finance-integrity review, sensitive changes to security review, and material Essential changes to spec audit. Use ML/data leakage review only for explicitly commissioned post-core ML work. A Luna implementer may never be its own Luna reviewer.
9. **Loop failures back.** A reviewer failure reopens the work packet. Do not paper over it in the matrix.
10. **Integrate in dependency order.** Re-run cross-domain gates after merges/refactors.
11. **Final gate.** Use `$release-gate`; no non-conditional Client Essential FAIL/PARTIAL/OPEN may remain.

## Luna-first A/B/C routing policy

### Complexity A — default to Luna Max
Use a Luna/max write agent when the task can be specified with stable inputs/outputs and bounded ownership. This includes, but is not limited to:

- Svelte components, pages, forms, tables, filters, dialogs, badges, empty/error/loading states;
- responsive/mobile remediation and migration to established design-system primitives;
- CRUD UI and straightforward server/action/API wiring against an already-defined service contract;
- repetitive decomposition/refactor after the target module boundary/API is defined;
- test implementation, fixtures, seeds, browser scenarios, accessibility checks and regression coverage;
- docs/runbooks/env examples/traceability maintenance;
- import/export adapters and admin tooling with deterministic validation contracts;
- report/industrial/business UI built on already-defined domain services;
- additive or mechanical migrations when a Sol lead has explicitly defined the schema semantics and rollback/compatibility rules;
- complete low-risk vertical slices when domain invariants are already encoded and the packet owns non-overlapping files.

**Bias toward A.** A task does not become B merely because it is large, production-facing, spans several files, or touches backend code. Split or contract it until Luna can own as much implementation as safely possible.

### Complexity B — Sol Medium
Use Sol/medium when implementation itself must reason about multiple non-local invariants or define ambiguous domain semantics, especially:

- finance/accounting/billing calculations and source-of-truth semantics;
- durable job/idempotency semantics whose contract is not yet stable;
- RBAC/auth policy decisions;
- cross-domain lifecycle/state-machine design;
- offline conflict/merge semantics;
- point-in-time history, feature provenance and leakage-sensitive data semantics;
- migrations that reinterpret, merge, destroy or backfill historical meaning.

A B-level Sol lead should delegate A-level child packets to Luna/max as soon as the contract is stable.

### Complexity C — Sol High
Use Sol/high for repository architecture, dependency DAGs, cross-domain contracts, irreducibly risky migration strategy, conflict resolution, integration design and final sign-off.

## Concurrency guidance

Keep at most 4–6 implementation/review streams active. More concurrency is harmful if streams share architecture or hot files.

## Output contract

Maintain/update:

- `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`
- `REQUIREMENTS_TRACEABILITY_MATRIX.md` as historical/roadmap traceability
- a work-packet ledger or equivalent progress section in `CODEX_EXECUTION_PLAN.md`
- test evidence under `artifacts/quality-gates/` when scripts are used
- final Client Essential completion report

Never declare `CLIENT READY` from implementer self-report alone. Deferred V3.1–V3.4 rows do not block the Client Essential verdict.
