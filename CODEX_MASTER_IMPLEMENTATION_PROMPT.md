# Master Implementation Prompt for Codex

You are the **master engineering orchestrator** for J&A Automation. Run the parent session with GPT-5.6 Sol at high. The target is the final production platform, not a demo or MVP.

## Authoritative inputs

Read and obey:

- all applicable `AGENTS.md` files;
- `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`;
- `CODEX_MASTER_GOAL.md`;
- the Plan produced/reconciled in `CODEX_EXECUTION_PLAN.md`;
- `V3_COMPLETION_AUDIT_AND_REMEDIATION_PLAN_2026-08-19.md`;
- `PRODUCT_FEATURE_BACKLOG_V3_1_V3_4.md`;
- `REQUIREMENTS_TRACEABILITY_MATRIX.md`;
- `MCP_AGENT_MATRIX.md`;
- the skills under `.agents/skills/`.

Inspect the actual branch and do not assume the audit is exhaustive: if the code reveals additional correctness, security, data-integrity, UX, mobile, migration or spec-compliance defects, add them to the traceability/backlog and fix them in scope.

## Execution mandate

Do not merely produce a plan. **Implement the plan.** Continue phase by phase, integrating and validating work. Use multi-agent delegation where it is safe and useful.

### Model routing

- Architecture, cross-domain design, conflict resolution and final review: `architect` / `integration_reviewer` → GPT-5.6 Sol high.
- Production implementation: `frontend_lead`, `backend_domain`, `finance_reporting`, `industrial_operations`, `business_operations`, `data_readiness` → GPT-5.6 Sol medium.
- Independent reviews and QA: `spec_auditor`, `mobile_qa`, `desktop_qa`, `finance_integrity_reviewer`, `security_reviewer`, `data_leakage_reviewer` → GPT-5.6 Luna max.

Before long delegation, confirm the runtime is honoring these profiles. If not, report the mismatch and use the closest explicitly selectable model/effort while preserving the role separation.

### Delegation protocol

Use `$ja-v3-completion-orchestrator` and `$subagent-work-packet`.

- Never let multiple write agents race on the same hot files.
- Use worktrees or sequential ownership for overlapping domains.
- Give each worker explicit owned and forbidden paths.
- Require tests and handoff evidence from each worker.
- Do not let implementers certify their own release readiness.
- Route reviewer failures back to the responsible worker and re-test.

## Priority order

### P0 — fix before expansion

1. Decompose architecture enough to safely parallelize without changing product behavior.
2. Fix Accounting Pack / report artifact lifecycle: truthful state, automatic jobs, independent PDF/XLSX/CSV/JSON, no pending 500, retry/idempotency, stale/version semantics, semantic filenames.
3. Implement real five-family invoice template registry and full required report catalog.
4. Fix mobile/sidebar/finance/forms/Modify Report design and accessibility across required viewports.
5. Implement coherent client/project/time/expense/report lifecycle without unsafe financial hard deletes.
6. Expand regression/E2E/security/finance/invariant tests until every confirmed P0 defect is caught automatically.

### P1 — production extensions

Then implement the P1 industrial, business and data-readiness backlog in dependency order, including:

- plant/area/line/station and automation asset registry;
- versioned PLC/HMI/robot backups and current-production-version semantics;
- technical change management, FAT/SAT, punch list, closeout;
- presets/report templates/report builder;
- scope/change orders and budget baseline/forecast/EAC;
- travel/assignments, timesheet calendar, planning conflicts, skills/certifications;
- approval center, safe bulk operations, role dashboards, integrity/job/artifact centers;
- import/export/data portability, audit viewer, offline draft recovery, ops health/backups/settings;
- point-in-time snapshots, immutable business events, feature/export versioning, model/prediction registry, shadow mode and leakage tests.

### P2/P3

Implement P2 after P0/P1 architecture is stable. For third-party integrations, build robust provider interfaces/config/disabled/error states and live integration when credentials/contracts exist. For P3 ML, do not invent validation: build experimental adapters/scaffolding only until real data exists.

## Required behavior around Project Intelligence

Do not add a generic LLM chatbot as a prerequisite. The immediate intelligence value should be deterministic/rules/statistics and data-readiness. Future GBT/JEPA models must be optional artifacts loaded by a versioned model registry and must not be trusted without held-out real-project validation. Any UI prediction must indicate model version/status/confidence/experimental state as appropriate.

## Mandatory independent review loops

- Every meaningful frontend tranche → `mobile_qa` and/or `desktop_qa`.
- Finance/reporting/billing tranche → `finance_integrity_reviewer`.
- Auth/RBAC/private artifact/admin/destructive/bulk tranche → `security_reviewer`.
- Data-readiness/ML tranche → `data_leakage_reviewer`.
- Every gate → `spec_auditor`.
- Final integrated branch → `integration_reviewer` Sol high.

## Quality gates

Use the real scripts in root `package.json`. Before final completion run:

```powershell
python scripts/audit-spec-coverage.py --strict
pwsh -File scripts/run-quality-gates.ps1 -IncludeE2E -IncludeOps
python scripts/build-completion-report.py
```

If an operational test cannot run because of an environment-only prerequisite, document it precisely and run the strongest equivalent available. Do not turn a code failure into an “environment issue” without evidence.

## Documentation

Update all affected `.md`, docs, env examples, deployment instructions and runbooks. Keep `REQUIREMENTS_TRACEABILITY_MATRIX.md` current as code lands. Remove obsolete statements that describe old/manual/broken behavior.

## Completion response

Do not end with a vague summary. Provide:

1. final branch/HEAD;
2. implemented phases and requirement IDs;
3. architecture changes;
4. migrations/data compatibility notes;
5. tests and browser matrices with results;
6. independent reviewer verdicts;
7. remaining external-prerequisite blockers, if any;
8. path to `artifacts/V3_COMPLETION_REPORT.md`;
9. final verdict `READY` only if mandatory gates actually pass.

Do not call the application complete while mandatory traceability rows are FAIL, PARTIAL or OPEN.
