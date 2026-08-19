---
name: release-gate
description: Run the final J&A production release gate after integrated changes. Use before claiming V3 production completion or merging the completion branch; not for early exploratory work.
---

# Release Gate

1. Confirm clean/understood working tree and intended diff.
2. Run `scripts/audit-spec-coverage.py --strict`.
3. Run `scripts/run-quality-gates.ps1 -IncludeE2E -IncludeOps` when the environment supports operational tests.
4. Review migrations on fresh and representative-upgrade paths.
5. Require independent `spec_auditor`, `finance_integrity_reviewer`, `security_reviewer`, and responsive/browser QA results for affected areas.
6. Search for TODO/FIXME/placeholders/dead actions introduced in mandatory scope.
7. Confirm docs/runbooks/env examples are current.
8. Confirm no manual admin job action is required for normal product functionality.
9. Confirm no mandatory `FAIL`, `PARTIAL`, or `OPEN` remains in traceability.
10. Ask `integration_reviewer` (Sol high) for final read-only sign-off.

Output a release verdict: `READY`, `NOT READY`, or `BLOCKED BY EXTERNAL PREREQUISITE`, with evidence.
