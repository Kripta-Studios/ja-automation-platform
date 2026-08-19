# Initial Multi-Agent Work Packets

The parent orchestrator should refine these after baseline inspection. Do not spawn overlapping write packets before Phase 1 establishes safe ownership.

## WP-00 — Baseline and dependency map

**Agent:** architect (Sol high, read-only) + spec_auditor (Luna max)
**Writes:** parent may update planning/docs only.  
**Output:** baseline failures, dependency DAG, exact file ownership map, migration risks.

## WP-01 — Frontend decomposition + design system

**Agent:** frontend_lead (Sol medium)  
**Primary ownership:** `apps/portal/src/lib/**`, scoped styles/components; route Svelte files assigned explicitly.  
**Goal:** mechanically decompose hot frontend files and establish reusable primitives before broad visual fixes.  
**Reviewer:** mobile_qa + desktop_qa.

## WP-02 — Backend/domain decomposition + lifecycle foundation

**Agent:** backend_domain (Sol medium)  
**Primary ownership:** `packages/database/**` excluding finance modules explicitly assigned to WP-03 after decomposition.  
**Goal:** extract domain repositories/services and implement safe client/project/time/expense lifecycle.  
**Reviewer:** security_reviewer + spec_auditor.

## WP-03 — Accounting/report artifact pipeline

**Agent:** finance_reporting (Sol medium)  
**Ownership:** `packages/reporting/**`, `packages/invoice-templates/**`, finance/report jobs/endpoints explicitly assigned by parent.  
**Goal:** independent artifact lifecycle, no XLSX/CSV collateral failure, truthful statuses, retries, semantic names.  
**Reviewer:** finance_integrity_reviewer + desktop_qa.

## WP-04 — Mobile/forms/report UX remediation

**Agent:** frontend_lead after/alongside WP-01 where ownership permits.  
**Goal:** sidebar, finance config, Modify Report, private artifact/forms/skills spacing, all required viewports.  
**Reviewer:** mobile_qa.

## WP-05 — Report catalog + template registry

**Agent:** finance_reporting; frontend selector UI coordinated with frontend_lead through a stable registry contract.  
**Goal:** all required reports and five invoice templates.  
**Reviewer:** spec_auditor + finance_integrity_reviewer.

## WP-06 — Industrial operations

**Agent:** industrial_operations after database boundaries are stable.  
**Goal:** hierarchy/assets/backups/technical changes/FAT-SAT/punch/closeout.  
**Reviewer:** security_reviewer + spec_auditor + mobile_qa for field flows.

## WP-07 — Business operations

**Agent:** business_operations after lifecycle/report foundations.  
**Goal:** presets, budgets/forecast, change orders, travel, planning, skills/certs, approvals, imports/ops centers.  
**Reviewer:** finance_integrity_reviewer + spec_auditor.

## WP-08 — Data readiness

**Agent:** data_readiness.  
**Goal:** point-in-time snapshots/events/export/model/prediction registry/shadow mode.  
**Reviewer:** data_leakage_reviewer.

## WP-09 — Final release integration

**Agent:** integration_reviewer (Sol high, read-only) after parent integrates.
**Prerequisite:** full quality gates and independent reviews.  
**Output:** READY / NOT READY with exact blockers.
