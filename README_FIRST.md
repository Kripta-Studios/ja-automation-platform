# J&A Automation — Codex Multi-Agent Completion Pack

> **Current authority (2026-08-23):** Use `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md` and its checklist for client delivery. This older V3 completion pack is historical orchestration evidence; industrial/ERP/integration/ML expansion, all P0/P1/P2 items, 207-row completion and the old 42-step gate are deferred roadmap, not release blockers.

**Target repository:** `Kripta-Studios/ja-automation-platform`  
**Target baseline branch:** `codex/v3-completion-20260819`  
**Primary product spec:** `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`  
**Pack date:** 2026-08-19

This package turns the current J&A V3 codebase into a controlled multi-agent engineering program for Codex. It is intentionally designed for a **final production application**, not an MVP, demo, mock, prototype, or one-pass cosmetic patch.

## What is included

- Root and scoped `AGENTS.md` files.
- Project-scoped Codex custom subagents under `.codex/agents/`.
- Project-scoped reusable skills under `.agents/skills/`.
- Multi-agent global project configuration under `.codex/config.toml`.
- A model/MCP/agent responsibility matrix.
- A requirements traceability matrix.
- The remediation and completion program.
- A large feature backlog covering the current defects and the proposed industrial/business/data-intelligence additions.
- Work-packet and handoff contracts.
- PowerShell/Python quality-gate helpers.
- Three prompts for Codex: **Goal**, **Plan**, and **Master Implementation Prompt**.

## Important path correction

Current Codex repo skills are placed under `.agents/skills/`. Custom project subagents are placed under `.codex/agents/`. Do not move the supplied skills to `.codex/skills/`.

## Install into the repository

From the repository root in PowerShell 7:

```powershell
# Make a safety branch first.
git switch codex/v3-completion-20260819
git pull --ff-only

git switch -c codex/v3-production-completion-orchestrated-20260819

# Copy the CONTENTS of this pack into the repo root.
# Example if this directory was extracted next to the repository:
Copy-Item -Recurse -Force "..\ja_codex_orchestration_pack_2026-08-19\*" "."

git status --short
```

Do **not** blindly overwrite an existing local `.codex/config.toml` if you already created project-specific settings after this pack was generated. Merge the `[agents]` block instead.

## MCP prerequisites

The orchestration assumes these MCPs are available to the parent Codex session when useful:

1. `github`
2. `context7`
3. `playwright`
4. `chrome-devtools` (or your local equivalent MCP id)
5. `sentry` when a staging/production Sentry project is connected

Other MCPs such as DeepWiki, Exa, Hugging Face and W&B are intentionally not central to the V3 completion work. They may be used only when a work packet genuinely needs them.

Run your normal MCP status/list command before the long run and verify that the names match your local configuration.

## Model routing

- **Master architect/orchestrator:** GPT-5.6 Sol, `high`.
- **Implementation workers:** GPT-5.6 Sol, `medium`.
- **Independent reviewers/QA:** GPT-5.6 Luna, `max`.
- **Final integration reviewer:** GPT-5.6 Sol, `high`.

If a specific Codex build exposes slightly different model identifiers, preserve the routing roles and change only the `model = ...` values in `.codex/agents/*.toml`.

## Before the real run: routing smoke test

Ask the parent agent to spawn exactly three trivial read-only subagents and report the runtime model/effort shown by Codex:

- `architect` → expected Sol / high
- `frontend_lead` → expected Sol / medium
- `spec_auditor` → expected Luna / max

Do not begin a long multi-agent implementation if the runtime is ignoring the intended role/model configuration.

## Recommended Codex workflow

1. Start a fresh Codex session at the **repo root**.
2. Select **GPT-5.6 Sol** with **high** for the parent session.
3. Give Codex the contents of `CODEX_MASTER_GOAL.md` as the Goal.
4. In Plan mode, give it `CODEX_PLAN_MODE_PROMPT.md`.
5. Review only for catastrophic misunderstandings; do not reduce scope into an MVP.
6. Switch to implementation/code mode and give it `CODEX_MASTER_IMPLEMENTATION_PROMPT.md`.
7. Let the parent orchestrator delegate work. It must use independent reviewers before declaring gates passed.
8. At completion, require `scripts/run-quality-gates.ps1 -IncludeE2E -IncludeOps` and a generated completion report.

## Definition of completion

The work is not complete because a subagent says “done”. Completion requires:

- the authoritative V3 spec reconciled requirement-by-requirement;
- the audit defects fixed;
- all P0 and P1 backlog items implemented or explicitly blocked by a real external prerequisite;
- tests and browser evidence for the relevant acceptance criteria;
- no known P0/P1 defects;
- docs and runbooks updated;
- `REQUIREMENTS_TRACEABILITY_MATRIX.md` contains no `FAIL`, `PARTIAL`, `OPEN`, or unjustified `BLOCKED` items in the mandatory scope;
- the final Sol/high integration reviewer signs off with evidence.

## ML / Project Intelligence boundary

Build the **data-readiness and inference plumbing** now: point-in-time snapshots, immutable business events, feature schema/versioning, export, model registry, prediction history, shadow-mode support, and rule/baseline intelligence. Do not invent a production-quality GBT or JEPA model without real historical data and held-out validation. The UI must make experimental/unvalidated models impossible to mistake for trusted production predictions.

## Luna-first implementation update

This package is configured to use Luna Max aggressively for bounded production implementation. Unprofiled/default subagents also default to Luna Max; Sol Medium/High are selected explicitly by the domain-lead/architect profiles. The parent/architect/integration authority stays Sol High; Sol Medium domain leads are reserved for non-local invariants and must delegate stable implementation leaves to Luna Max. See `AGENTS.md`, `MCP_AGENT_MATRIX.md`, and the custom Luna write agents under `.codex/agents/`.
