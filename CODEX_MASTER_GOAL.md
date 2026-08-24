# Goal for Codex — Client Essential Release

Transform the current repository, branch, and worktree into the production-ready J&A Automation **Client Essential** platform defined by `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`, with release status tracked in `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`.

Preserve existing correct implementation. Do not restart, rewrite working subsystems unnecessarily, or reduce the result to an MVP/demo. Close the real workflow from client/project/assignment through time, reports, expenses, approvals, worker compensation, project finance, invoices, payments, accounting exports, security, automatic jobs, deployment, and recovery.

## Current authority and execution baseline — 2026-08-24

- Branch: `codex/v3-production-completion-orchestrated-20260819`.
- Current authoritative HEAD: `df31291e9c9ed111d20c8878ae0f68f3d41f8136`.
- Preserve the pre-existing public-site/release dirty work; it is outside the Client Essential
  packet ownership unless explicitly assigned.
- Authority precedence is: Client Essential SPEC → Client Essential checklist →
  `J_A_Automation_Contrato_Proyecto_EVOCON_ES.html` (`ANEXO A` scope and `ANEXO D` UAT) →
  `UI_PLAN.md` for UX/UI only → repository instructions → older V3 reference. V3.1–V3.4 remains
  **DEFERRED POST-CORE ROADMAP**.
- The approved dependency DAG is: `WP-00` docs → `WP-01` C/Sol projection privacy firewall
  (tests + production) → `WP-02` C/Sol additive domain contract → `WP-03` B sign-off/enforcement
  → `WP-04` B shell/nav/primitives → `WP-05A` Worker time and `WP-05B` Worker expenses/My Pay
  → `WP-06` Reports/sign-off → `WP-07` PM/projects/approvals → `WP-08`
  Finance/Billing/Collections → `WP-09` independent reviews → `WP-10` release. WP-00 and WP-01
  may run concurrently on their disjoint paths; each later packet requires its stated handoff.
- Current release audit: **NOT READY**. This documentation baseline does not promote any product
  requirement to PASS or provide implementation evidence.

## Non-negotiable outcomes

### Execution checkpoint — 2026-08-24

The implementation is proceeding on the preserved WP-00→WP-10 DAG. WP-01, WP-02 and WP-04 are
integrated; WP-03 is in independent finance review; Worker operational UX is focused-green with
browser evidence still open; WP-07 PM/project/approval surfaces and WP-08 finance/billing/collections
surfaces are mounted with focused tests green. WP-09 cross-role browser/review evidence and the
pinned-runtime WP-10 gate remain release dependencies. Current verdict: **NOT READY**.

1. CORE-01 through CORE-17 and every applicable Client Essential Definition-of-Done item have demonstrated evidence.
2. Exact money, financial reconciliation, duplicate-billing prevention, issued-invoice immutability, auditable corrections, transactional integrity, and idempotent jobs are preserved or strengthened.
3. RBAC, IDOR protection, worker compensation privacy, step-up security, private-file authorization, safe DTOs, and audit pass independent review.
4. Normal workflows expose truthful artifact/job state and do not depend on manual queue processing.
5. Worker, PM, Finance, and Owner journeys are usable at representative phone, tablet, and desktop widths.
6. Deployment, health, safe migrations where applicable, scheduled backup, and a restore drill are proven.
7. Documentation and the Client Essential checklist match observed behavior.

## Deferred roadmap

V3.1–V3.4 industrial expansion, generic business/ERP expansion, broad accounting/integration expansion, and ML/data-readiness work remain documented as **DEFERRED POST-CORE ROADMAP**. They are not deleted, but they do not block `CLIENT READY` unless an Essential requirement directly depends on a specific capability.

## Completion condition

Return `CLIENT READY` only when every non-conditional Essential requirement passes with appropriate evidence and every applicable Client Essential DoD step is demonstrated. Otherwise return `NOT READY` or a narrowly evidenced external prerequisite, with the exact next dependency. The historical 207-row RTM, all P0/P1/P2 backlog items, and old 42-step scenario are not the client-release verdict.
