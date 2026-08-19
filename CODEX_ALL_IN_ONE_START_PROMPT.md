# All-in-one start prompt (when you do not want to paste Goal + Plan + Implementation separately)

Work from the repository root on the branch created for the J&A V3 production-completion effort.

My Goal is exactly `CODEX_MASTER_GOAL.md`.

First, in Plan mode, execute `CODEX_PLAN_MODE_PROMPT.md`: inspect the actual code and authoritative V3 spec, spawn the read-only architect/spec-auditor profiles, verify routing, reconcile dependencies, ownership and acceptance gates, and update the plan/traceability documents. Do not reduce the scope into an MVP.

After the plan is concrete, switch to implementation and execute `CODEX_MASTER_IMPLEMENTATION_PROMPT.md` in full. Do not stop at planning. Implement phase-by-phase, use the custom Sol/high, Sol/medium and Luna/max subagents defined in `.codex/agents/`, use project skills in `.agents/skills/`, enforce independent reviewers, run the real test/browser/security/finance/data-leakage gates, and keep docs/traceability synchronized.

The authoritative product baseline is `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`, extended by the remediation plan and P0/P1 product backlog in this pack. Preserve a modular monolith, SQLite, financial/audit history and existing good security/reconciliation foundations. Do not fake success, do not use placeholders as finished features, do not hard-delete finalized finance history, and do not represent unvalidated ML models as production intelligence.

At the end, require the Sol/high `integration_reviewer`, generate `artifacts/V3_COMPLETION_REPORT.md`, and only return `READY` if mandatory traceability and quality gates pass.
