---
name: ja-v3-completion-orchestrator
description: Orchestrate large J&A V3 production-completion work across subagents. Use for dependency planning, work-packet delegation, ownership, review loops, integration gates, or any task spanning multiple J&A domains. Do not use for a trivial single-file fix.
---

# J&A V3 Completion Orchestrator

## Inputs

Read the authoritative V3 spec, root `AGENTS.md`, remediation plan, execution plan, traceability matrix and feature backlog.

## Procedure

1. **Baseline first.** Record branch/HEAD, working-tree status and baseline test status. Never destroy unrelated local changes.
2. **Build a dependency DAG.** Separate prerequisite refactors from behavior changes and later product additions.
3. **Choose work packets.** Each packet must have non-overlapping write ownership where parallelized.
4. **Assign model tier deliberately.** Architecture/cross-domain/final review → Sol high. Production implementation → Sol medium. Independent read-only audits/QA → Luna max.
5. **Use worktrees when parallel writes would otherwise share a tree.** Keep hot-file ownership exclusive.
6. **Require implementer evidence.** Changed paths, tests, migrations, assumptions and remaining risks.
7. **Require independent verification.** Route frontend changes to browser QA, financial changes to finance-integrity review, sensitive changes to security review, ML/data changes to leakage review, and all material changes to spec audit.
8. **Loop failures back.** A reviewer failure reopens the work packet. Do not paper over it in the matrix.
9. **Integrate in dependency order.** Re-run cross-domain gates after merges/refactors.
10. **Final gate.** Use `$release-gate`; no mandatory FAIL/PARTIAL/OPEN may remain.

## Concurrency guidance

Keep at most 4–6 implementation/review streams active. More concurrency is harmful if streams share architecture or hot files.

## Output contract

Maintain/update:

- `REQUIREMENTS_TRACEABILITY_MATRIX.md`
- a work-packet ledger or equivalent progress section in `CODEX_EXECUTION_PLAN.md`
- test evidence under `artifacts/quality-gates/` when scripts are used
- final completion report

Never declare “V3 complete” from implementer self-report alone.
