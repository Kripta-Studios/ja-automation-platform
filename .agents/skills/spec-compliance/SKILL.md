---
name: spec-compliance
description: Audit J&A code and tests against the V3 spec, remediation plan, traceability matrix and mandatory feature backlog. Use for PASS/PARTIAL/FAIL reconciliation and completion claims; do not use as a substitute for implementation.
---

# Spec Compliance Audit

For each requirement:

- `PASS`: behavior exists, is reachable, correctly authorized, handles key failure modes and has adequate evidence/tests.
- `PARTIAL`: meaningful implementation exists but one or more required behaviors/flows/evidence are missing.
- `FAIL`: absent, contradicted, broken, misleading, or only a placeholder.
- `BLOCKED`: impossible because of a documented external prerequisite that the code cannot supply; include the prerequisite and graceful fallback.
- `N/A`: only when the requirement genuinely does not apply, with rationale.

Do not mark PASS because a function, route, table or button merely exists.

Check cross-cutting requirements: mobile, accessibility, security, audit, lifecycle, money exactness, background-job state, failure semantics, migration safety and documentation.

Update `REQUIREMENTS_TRACEABILITY_MATRIX.md` with evidence paths/tests.
