# Prompt to give Codex in PLAN MODE

Read `AGENTS.md` and every mandatory document it references. Read the authoritative `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md` in full and inspect the actual current branch/code/tests before proposing changes.

Your role is the **master orchestrator** running GPT-5.6 Sol at high. Use the custom subagents in `.codex/agents/` and the repo skills in `.agents/skills/` deliberately.

Produce a concrete execution plan for the full production completion program, **not an MVP**. Reconcile the current code against:

- the original V3 spec;
- `V3_COMPLETION_AUDIT_AND_REMEDIATION_PLAN_2026-08-19.md`;
- `PRODUCT_FEATURE_BACKLOG_V3_1_V3_4.md`;
- `REQUIREMENTS_TRACEABILITY_MATRIX.md`.

Before finalizing the plan:

1. Spawn `architect` (Sol high, read-only) to map architecture, dependencies and safe decomposition boundaries.
2. Spawn `spec_auditor` (Luna max, read-only) for an independent current-state requirement audit.
3. Spawn targeted read-only QA/review agents only where they can establish baseline evidence without modifying code.
4. Verify the configured agent routing/model effort through a small smoke test before relying on parallel agents.
5. Identify exact hot files and define write ownership so parallel workers will not edit the same catch-all files concurrently.
6. Decide which mechanical decompositions must precede functional work.
7. Define migration safety and rollback strategy.
8. Define required browser/test evidence and acceptance gates.

The plan must include a dependency DAG/work-packet order, assigned agent type/model, owned paths, acceptance tests, reviewer for each packet, integration order and release gates.

Do not ask me to reduce scope. Do not propose a demo. Do not say “future work” for P0/P1 just to shorten the task. P3 ML model training can remain experimental when real data is absent, but its data-readiness infrastructure must be implemented.

At the end, update `CODEX_EXECUTION_PLAN.md`, `work-packets/INITIAL_WORK_PACKETS.md` and `REQUIREMENTS_TRACEABILITY_MATRIX.md` if the repository inspection reveals more accurate dependencies/evidence. Then stop Plan mode with a clear statement of the first executable work packets. Do not modify application code while still in Plan mode.
