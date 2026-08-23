---
name: release-gate
description: Run the final J&A production release gate after integrated changes. Use before claiming Client Essential production completion or merging the completion branch; not for early exploratory work.
---

# Release Gate

1. Confirm clean/understood working tree and intended diff.
2. Audit every non-conditional Client Essential checklist item and DoD step against current evidence. Historical strict-RTM scripts may run as diagnostics but deferred roadmap failures do not block this verdict.
3. Run the applicable repository quality gates, including Essential E2E and operational backup/restore checks.
4. Review migrations on fresh and representative-upgrade paths.
5. Require independent `spec_auditor`, `finance_integrity_reviewer`, `security_reviewer`, and responsive/browser QA results for affected Essential areas.
6. Search for TODO/FIXME/placeholders/dead actions introduced in mandatory scope.
7. Confirm docs/runbooks/env examples are current.
8. Confirm no manual admin job action is required for normal product functionality.
9. Confirm no non-conditional Client Essential `FAIL`, `PARTIAL`, or `OPEN` remains; conditional offline is resolved or explicitly deferred by the go-live decision.
10. Ask `integration_reviewer` (Sol high) for final read-only sign-off.

Output a release verdict: `CLIENT READY`, `NOT READY`, or `BLOCKED BY EXTERNAL PREREQUISITE`, with evidence.
