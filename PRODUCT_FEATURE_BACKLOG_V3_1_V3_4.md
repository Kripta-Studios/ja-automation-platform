# J&A Automation — Product Feature Backlog V3.1 → V3.4

This backlog captures the additional capabilities proposed after the V3 audit. It is intentionally broader than the original spec. Priority is staged so Codex fixes correctness before expanding scope.

Legend: **P0** release blocker/current defect, **P1** core production extension, **P2** valuable next capability, **P3** optional/later/experimental.

## V3.1 — Production completion and quality

1. **V31-001 P0** Independent PDF/XLSX/CSV/JSON artifact jobs/status/retry.
2. **V31-002 P0** Automatic durable job execution; admin manual processing only as diagnostics.
3. **V31-003 P0** Intentional pending/failed download semantics rather than 500.
4. **V31-004 P0** Accounting Pack regeneration/versioning to avoid stale snapshots.
5. **V31-005 P0** Semantic export filenames.
6. **V31-006 P0** Five real versioned invoice template families and template registry selector.
7. **V31-007 P0** Complete required report catalog and exports.
8. **V31-008 P0** Client edit/archive/restore/close lifecycle.
9. **V31-009 P0** Project edit/archive/restore/close lifecycle.
10. **V31-010 P0** Coherent draft edit/delete/correction lifecycle for time, expenses and reports.
11. **V31-011 P0** Mobile drawer with full text labels.
12. **V31-012 P0** Finance configuration responsive one-column phone layouts.
13. **V31-013 P0** Shared FormCard/SectionCard/Field design system and visual hierarchy.
14. **V31-014 P0** Clear Modify Report sections/labels/actions; apply to comparable forms.
15. **V31-015 P0** Decompose PortalShell/CSS/database megafiles into domain modules.
16. **V31-016 P0** Full responsive E2E matrix at 360/390/430/768/desktop.
17. **V31-017 P0** Forced partial artifact-failure tests and lifecycle integration tests.
18. **V31-018 P1** Job Center showing queued/running/ready/failed/retry/error metadata.
19. **V31-019 P1** Artifact Center showing type/version/hash/size/state/download/regenerate/superseded.
20. **V31-020 P1** Unified safe destructive-action UX: Archive/Restore/Delete Draft/Void/Offboard.
21. **V31-021 P1** Unsaved-changes warnings for important forms.
22. **V31-022 P1** Autosave and draft recovery for long reports.
23. **V31-023 P1** Role-specific dashboards for Worker, PM, Finance and Owner.
24. **V31-024 P1** Global search across project/client/worker/report/invoice/asset/document identifiers.
25. **V31-025 P2** Command palette for frequent desktop actions.

## V3.2 — Industrial operations

26. **V32-001 P1** Rich client metadata: billing/plant contacts, addresses, PO/payment settings, currency/language, notes/documents.
27. **V32-002 P1** Rich project state machine: Draft/Planned/Active/On Hold/Completed/Closed/Archived.
28. **V32-003 P1** Industrial hierarchy: Plant → Area → Line → Machine/Station.
29. **V32-004 P1** Automation Asset Registry: PLC/HMI/SCADA/Robot/Drive/Safety device.
30. **V32-005 P1** Asset technical metadata: manufacturer/model/firmware/software/network/version fields with permission-sensitive handling.
31. **V32-006 P1** Current-known-production-version semantics.
32. **V32-007 P1** Versioned PLC/HMI/robot backups with hash, author, timestamp, comments and supersession timeline.
33. **V32-008 P1** Technical Change Management: problem/diagnosis/root-cause/proposed change.
34. **V32-009 P1** Change evidence: backup before/after, screenshots/photos, validation and rollback.
35. **V32-010 P1** Safety-related technical changes with stricter approval workflow.
36. **V32-011 P1** FAT/SAT/Commissioning checklist templates and executions.
37. **V32-012 P1** Checklist item evidence/status/owner/date/customer sign-off fields.
38. **V32-013 P1** Punch List/Open Issues with severity, station/asset, owner, due date, root cause, resolution and evidence.
39. **V32-014 P1** Project Closeout checklist and generated closeout package/index.
40. **V32-015 P2** Report/issue attachments with project/asset relationship.
41. **V32-016 P2** Photo annotation / before-after evidence model and UI.
42. **V32-017 P3** QR identifiers/links for assets/stations to open the correct mobile record.
43. **V32-018 P1** Customer-facing vs internal technical/report visibility controls.
44. **V32-019 P1** Lessons Learned at project closeout.
45. **V32-020 P2** Client/plant knowledge base for standards, naming conventions, procedures and non-secret operational notes.

## V3.3 — Business operations

46. **V33-001 P1** Reusable project presets (commissioning 10h Mon-Sat, all-in, hourly, etc.) with versioning.
47. **V33-002 P1** Versioned Daily/PLC/period report templates/presets.
48. **V33-003 P1** Bounded Report Builder: configurable approved blocks/order/visibility/language/branding; not arbitrary executable HTML.
49. **V33-004 P2** Report scheduler/recurring generation through durable jobs.
50. **V33-005 P1** Scope/Change Orders tied to client requests, estimates, schedule impact, approvals and PO/billing treatment.
51. **V33-006 P1** Preserve original project budget baseline.
52. **V33-007 P1** Versioned current forecast with Actual/Committed/Remaining/EAC.
53. **V33-008 P1** Project health view for schedule, budget, technical risk and billing.
54. **V33-009 P1** Travel/Assignment records: hotel/rental/flight/per-diem and payer/treatment semantics.
55. **V33-010 P2** Mileage claims with rate, route, vehicle type, project and evidence.
56. **V33-011 P1** Expense mobile UX, receipt attachment and duplicate heuristics.
57. **V33-012 P3** Pluggable/local OCR for receipt field suggestions; user confirmation required.
58. **V33-013 P1** Timesheet copy previous day/repeat week/templates and fast weekly entry.
59. **V33-014 P1** Timesheet calendar with Draft/Submitted/Approved/Missing/Holiday/Travel/Standby states.
60. **V33-015 P1** Time overlap/impossible-duration/incomplete-day validation and deviation notes.
61. **V33-016 P1** Planning calendar/timeline and worker assignment conflict detection.
62. **V33-017 P1** Skill Matrix with levels, experience and availability.
63. **V33-018 P1** Certifications with expiry and warnings.
64. **V33-019 P1** Unified Approval Center for time, expense, reports, technical changes and milestones.
65. **V33-020 P1** Safe bulk operations with eligibility checks and audit.
66. **V33-021 P2** Configurable in-app/email notifications with noise control.
67. **V33-022 P1** Integrity Center: missing rates/receipts/reports, overlaps, invalid invoice/artifact states, reconciliation alerts.
68. **V33-023 P1** Import Center: CSV/XLSX preview → validation → error report → commit.
69. **V33-024 P1** Data portability/export for important entities and operational backups.
70. **V33-025 P2** Document preview, tags, project/asset links and search.
71. **V33-026 P2** Retention policy / legal-hold-capable metadata without accidental financial-history deletion.
72. **V33-027 P1** Human-readable activity/audit timeline with before/after values where safe.
73. **V33-028 P2** Undo for safe reversible non-final operations.
74. **V33-029 P1** Offline/PWA draft queue and understandable synchronization state for field workers.
75. **V33-030 P1** Operations health page: DB/jobs/storage/email/scanner/PDF renderer/backup health.
76. **V33-031 P1** Backup/restore status and documented restore drill/runbook.
77. **V33-032 P1** Admin business settings: branding, default currency/timezone, numbering, expense/approval rules.
78. **V33-033 P2** Feature flags for staged rollout.
79. **V33-034 P2** Multicurrency ledger semantics: transaction/project/legal-entity currencies and historical FX rate metadata.
80. **V33-035 P2** Tax profiles/config validation by jurisdiction without pretending to replace professional accounting advice.
81. **V33-036 P2** Payment/bank import and deterministic/suggested invoice matching.
82. **V33-037 P2** Accounting export adapters/profiles (provider interfaces first; live connectors when credentials/contracts exist).
83. **V33-038 P2** Stable integration API and webhooks for selected business events.
84. **V33-039 P2** Client portal with strict isolation of internal cost/margin/salary data.
85. **V33-040 P2** Customer acknowledgment/sign-off with version/time/actor traceability.
86. **V33-041 P2** Email send history, templates, message IDs, retry/error state.
87. **V33-042 P2** Operational KPIs: utilization, billable ratio, approval latency, days-to-invoice, DSO, WIP, contribution margin, budget/schedule variance, rework.

## V3.4 — Project Intelligence / data readiness

88. **V34-001 P1** Daily/weekly point-in-time project state snapshots with schema version.
89. **V34-002 P1** Immutable business events for meaningful project/finance/technical actions.
90. **V34-003 P1** Explicit action-event records (`ADD_WORKER`, `APPROVE_CHANGE_ORDER`, etc.) where useful for future temporal modeling.
91. **V34-004 P1** Feature definition/version registry.
92. **V34-005 P1** Reproducible training dataset export and manifest/hashes.
93. **V34-006 P1** Model registry: version/artifact hash/training window/features/metrics/status.
94. **V34-007 P1** Historical prediction registry with `prediction_at` and `as_of` semantics.
95. **V34-008 P1** Shadow-mode evaluation, activation, rollback and disable.
96. **V34-009 P1** Leakage/invariant tests for point-in-time correctness.
97. **V34-010 P1** Deterministic rules/statistical project health baseline.
98. **V34-011 P2** CPU inference adapter boundary (e.g. CatBoost/ONNX) with versioned model artifacts.
99. **V34-012 P3** First real GBT experiments for final cost/hours/delay/margin risk only after sufficient real historical data and proper held-out evaluation.
100. **V34-013 P3** Explainability for GBT predictions (feature contributions/SHAP where operationally appropriate).
101. **V34-014 P3** Temporal anomaly models only if they outperform robust rules/baselines.
102. **V34-015 P3** Experimental Project-JEPA / action-conditioned latent dynamics research behind a feature flag and separate scientific validation.
103. **V34-016 P3** Counterfactual/scenario UI only after causal limitations are explicitly addressed; observational action correlations must never be presented as causal effects.

## Scope policy for Codex

- P0: mandatory before production-completion claim.
- P1: implement as part of the staged completion program unless a concrete dependency makes it unsafe; if blocked, document the dependency and finish prerequisites/interfaces/tests.
- P2: implement after P0/P1 architecture is stable; live third-party calls may remain disabled pending credentials, but provider contracts/config/error UX should be production-quality.
- P3: build enabling infrastructure only unless real data/validation prerequisites exist. Never fake scientific validation.
