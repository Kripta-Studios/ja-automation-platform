# J&A Automation — Repository Instructions for Codex

## Mission

Develop this repository into the **final production J&A Automation platform**. The authoritative baseline is `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`, extended by `V3_COMPLETION_AUDIT_AND_REMEDIATION_PLAN_2026-08-19.md` and `PRODUCT_FEATURE_BACKLOG_V3_1_V3_4.md`.

This is **not an MVP, demo, prototype or mock**. Do not replace missing functionality with placeholders, fake success states, dead buttons, TODO-only implementations, or hard-coded demo data.

## Mandatory reading before implementation

Read, in this order:

1. `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`
2. `CODEX_MASTER_GOAL.md`
3. `V3_COMPLETION_AUDIT_AND_REMEDIATION_PLAN_2026-08-19.md`
4. `CODEX_EXECUTION_PLAN.md`
5. `REQUIREMENTS_TRACEABILITY_MATRIX.md`
6. `PRODUCT_FEATURE_BACKLOG_V3_1_V3_4.md`
7. `MCP_AGENT_MATRIX.md`
8. the closest nested `AGENTS.md` for every file you edit

## Architectural constraints

- Preserve a **modular monolith** unless the spec is explicitly changed. Do not introduce microservices merely to split code.
- Decompose the existing megafiles safely; do not continue growing `PortalShell.svelte`, `portal.css`, `repository.ts`, or `v3-repository.ts` as catch-all modules.
- Prefer domain services/repositories and reusable UI primitives with explicit boundaries.
- Keep SQLite as the production database unless a requirement explicitly changes it.
- Financial calculations must be deterministic and exact. Never use binary floating-point for money.
- Use transactions for multi-write invariants.
- Preserve auditability and historical truth.
- Never hard-delete issued/finalized financial history. Prefer archive/deactivate/void/supersede/versioned lifecycles.
- Do not silently overwrite PLC backups, reports, invoices, accounting snapshots, or other traceable artifacts.
- All private artifact access must be authorization checked and storage-key safe.

## Multi-agent operating model

The parent session is the orchestrator. It should delegate bounded work to custom agents in `.codex/agents/`.

Rules:

1. Build a dependency DAG before parallel implementation.
2. Never assign two write agents overlapping ownership of the same hot files at the same time.
3. Prefer worktrees for independent implementation streams.
4. Every work packet defines: objective, owned paths, forbidden paths, dependencies, tests, acceptance criteria, and handoff format.
5. Implementers do not self-certify completion. A read-only reviewer/QA agent must verify material changes.
6. If a reviewer returns a concrete failure, route it back to the responsible implementation worker before final integration.
7. Sol/high handles architecture, cross-domain decisions, risky migrations, conflict resolution and final sign-off.
8. Sol/medium handles the majority of production implementation.
9. Luna/max performs independent exhaustive audits, browser QA, security/integrity checks, and requirements reconciliation.

Use `$ja-v3-completion-orchestrator`, `$subagent-work-packet`, `$spec-compliance`, and `$release-gate` whenever their scope applies.

## Product behavior rules

- A user-facing state must reflect reality. Never say an export is “ready” merely because a generation job was queued.
- Async/durable artifacts must expose status (`queued`, `running`, `ready`, `failed`), error/retry semantics, and independent per-format lifecycle where formats can fail independently.
- A PDF renderer failure may not prevent XLSX, CSV, or JSON outputs from succeeding.
- Do not require an ordinary user to manually “process durable jobs” to make normal product flows function. Manual processing may remain an admin diagnostic action.
- Use semantic filenames for exported business artifacts.
- Form labels must remain obvious in all responsive layouts. Do not hide navigation text by `font-size: 0` hacks.
- Dense phone forms stack vertically unless a container is genuinely wide enough for multiple columns.
- All UI must be keyboard accessible and have visible focus states.
- Desktop tables need a deliberate mobile representation: responsive table, cards, scroll region, or prioritized columns. Accidental compression is not acceptable.

## Required responsive evidence

At minimum verify the relevant flows at:

- 360×800
- 390×844
- 430×932
- 768×1024
- 1440×900 or wider desktop

No horizontal overflow is necessary but not sufficient. Controls must remain usable and readable.

## Testing rules

For changed behavior run the narrowest relevant tests first, then broader gates before integration.

At release gate run, as applicable:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:reporting
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm test:offline
pnpm db:check
pnpm db:integrity
pnpm build
pnpm test:e2e
```

For deployment/backup changes also run the relevant operational backup/restore tests.

Do not weaken assertions, skip tests, remove security coverage or lower acceptance thresholds merely to obtain green CI.

## Database and migration safety

- Prefer additive migrations followed by backfill and cleanup in a later safe step.
- Preserve old data during refactors.
- Migrations must work on a copy of a realistic existing database, not only a blank DB.
- Never repurpose a historical field in place if its semantics change.
- Point-in-time ML/data-readiness records must contain only information known as of their `as_of` timestamp.

## Documentation contract

When behavior changes, update all affected documentation, runbooks, examples, env/config docs and the traceability matrix in the same change. Do not leave the repository documentation describing obsolete behavior.

## Stop conditions requiring escalation to the parent

Escalate instead of guessing when:

- a migration could destroy or reinterpret production history;
- a security/RBAC decision is ambiguous;
- two authoritative requirements conflict;
- a third-party integration requires unavailable credentials/contracts;
- the requested behavior would make financial records mutable in an unsafe way;
- a worker needs to edit paths owned by another active work packet.

For ordinary implementation ambiguity, choose the safest coherent interpretation, document it, and continue.
