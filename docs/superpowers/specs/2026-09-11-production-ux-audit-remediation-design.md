# Production UX Audit and Remediation Design

**Date:** 2026-09-11

**Status:** Approved for inline execution by the request to make the safest product decisions, continue without questions, avoid subagents, verify the whole result, update manuals, push, deploy, and clear Docker build cache.

## Objective

Complete and independently re-audit the production UX remediation requested for J&A Automation without weakening financial history, object authorization, role privacy, or artifact integrity. The result must give every permitted record an understandable path from summary to filtered list to detail/action, keep primary work actions near the page heading, and prevent long registers from turning a workspace into an unbounded page.

## Product approach

The implementation will extend the existing portal patterns instead of replacing the modular monolith or adopting another ERP's code. The selected approach is progressive disclosure plus a shared record-browser contract:

1. Primary actions appear immediately after the relevant heading and explanatory copy.
2. Summary cards are controls, not decorative counters. Activating one applies a truthful filter or navigates to the exact authorized workflow.
3. Multi-record surfaces provide search, status/context filters, explicit ordering, eight-row pages, and Previous/Next navigation.
4. A record opens a detail or management surface. Drafts may be edited/deleted where domain rules permit; issued/finalized financial truth remains immutable and uses correction, void, reversal, or superseding versions.
5. Secondary creation/configuration forms stay collapsed until their named action is selected.
6. Detail Back behavior uses browser history when there is an in-app origin and retains list state; direct entry uses a safe section fallback.
7. All navigation is only a presentation of server-authorized data. It never substitutes for RBAC or object-level checks.

This follows the useful interaction principles documented by the products the requester named: Odoo form headers and smart buttons expose primary and related actions near the record; Odoo search views combine search fields and predefined filters; ERPNext list views provide filters, sorting and paging; QuickBooks treats invoice drafting, review/sending, status and payment as separate steps. No third-party source code is copied.

## Existing implementation retained

The current branch already contains the following production work and it will be preserved unless verification proves it incorrect:

- fixed Client creation fields and an authenticated creation journey;
- valid expense currency defaults without user reselection;
- top-positioned Log time, Record expense, Daily and Technical report actions;
- searchable/paged project, team, planning, document, accounting, billing and finance source registers through `RecordBrowser`;
- clickable project/team/planning/report/milestone/invoice detail paths;
- local credential provisioning with external email and optional supplier workforce profiles;
- supplier/technician authorization and synchronized workforce metadata;
- invoice draft customization, PDF lifecycle, draft deletion, issue/void/adjustment/payment flows;
- automatic Accounting Pack refresh while jobs are queued/running;
- role-aware Help workflows, protected PDF delivery and `admin@j-aautomation.com` support copy;
- in-app origin-aware Back behavior and shared sidebar chrome on standalone screens;
- server-side Worker/PM/Finance projections and private artifact authorization.

## Confirmed audit gaps

### Operational registers

Time, Expenses and Daily/Technical reports already search and paginate, but still hard-code newest-first and their attention links use a single literal status while their displayed count combines several statuses. Add an explicit ordering selector and composite filters whose result matches their displayed count. Persist search, order and page state per user. The default remains newest-first for personal operational history.

Approval Queue keeps submitted work separated from completed history and defaults to oldest submitted first. Add an explicit order selector that can order the active queue by oldest, newest, worker/name or status without mixing completed history above unresolved submitted work.

### Period reports

Client Sign-off and Generated period files still render all rows. Apply project/search/status/order criteria and eight-row pagination to both lists. A queued row remains non-clickable until its immutable snapshot binding exists; a ready verified PDF remains the only downloadable PDF.

### Finance and ledger drill-through

Finance attention cards and the four principal actual metrics are decorative. Convert them into links or buttons targeting the exact project-scoped source, settlement, reimbursement, billing or time surface. Add stable anchors to the target sections.

Collections/Ledger summary cards must apply their status filter, and each ledger row must link to the authorized invoice detail. The invoice detail owns mutation controls; the ledger does not make immutable invoice state editable.

### Billing progressive disclosure

The Billing setup workspace currently opens one large panel containing all setup forms. Present named action selectors for billing stream, legal entity, tax profile and numbering policy and render only the selected form. Existing directories remain visible for context. No new accounting semantics are introduced.

### Report authorship and rendering

Daily and PLC/Technical source PDFs must show the creating worker's name and available work email. The persisted source author ID is authoritative. Locale snapshot generation must enrich the immutable snapshot from that user at queue time, and PDF tests must prove both values are rendered. Reports must not accept browser-supplied author identity as authority.

### Visual defect

Remove the stray literal `>` currently rendered at the start of the Finance planned/expected card.

## Role and authorization matrix

- **Worker:** own assigned projects, own time/expenses/reports/documents and own compensation/reimbursement projection only.
- **Project Manager:** Worker-style entry for their own work and explicitly supported entry for effectively assigned workers on managed projects; operational review/planning for managed project scope; no finance rates, margins, other-worker private pay, or reimbursement truth.
- **Supplier coordinator:** only granted supplier installations/projects/date ranges and technicians in that supplier scope.
- **External technician:** own authorized supplier/project work and reports only.
- **Finance Admin:** finance configuration, billing, collections, reimbursements, settlements and accounting; no Owner-only identity or mailbox authority.
- **Owner Admin:** complete authorized administration while preserving immutable financial/reporting lifecycles.
- **Auditor:** read-only authorized projections and artifacts; no mutation controls.

Every deep link must be safe when copied or guessed: the destination loader/action rechecks a live session, role capability and object scope. Unauthorized and missing private records should remain non-disclosing where the existing contract requires it.

## Validation and release

Tests are layered from narrow to broad:

1. helper/unit regressions for ordering, composite filters, hrefs and rendered copy;
2. Svelte/type/lint/format gates;
3. integration and security suites for RBAC, IDOR, immutable artifacts and finance privacy;
4. reporting tests with Chromium for PDF author identity and artifact validity;
5. authenticated Playwright journeys for Owner, Finance, PM, Worker, supplier coordinator, external technician and auditor at representative desktop/phone widths;
6. production builds, database integrity, backup/readiness and deployed HTTPS smoke tests.

All Markdown manuals and every checked-in manual PDF under `docs/manuals/` are regenerated from the final UI. Deployment uses the repository's reviewed release/deployer path, preserves a rollback image and backup, verifies the exact revision, pushes the branch, and removes Docker builder cache without deleting active images, volumes, production data, or the tested rollback image.

## Non-goals

- importing or cloning Odoo, ERPNext or QuickBooks code;
- replacing SQLite or the modular monolith;
- turning operational entry into commercial classification;
- making issued invoices or finalized packs editable/deletable;
- exposing plaintext passwords after creation or storing password copies;
- widening any role's data visibility to make a link work.
