# J&A Automation — Client Essential Production Specification

**Date:** 2026-08-22  
**Client validation update:** 2026-08-24
**Status:** Proposed delivery authority for the client-complete production release  
**Purpose:** Reduce the current V3/V3.1–V3.4 completion program to the software J&A actually needs to operate the business end-to-end, without turning the project into a general ERP, CMMS, data platform, or ML product.

---

## 1. Product decision

This document defines the **Client Essential Production Release**.

It is **not an MVP, demo, prototype, mock, or temporary throwaway version**. It is a complete production system for the current J&A operating workflow.

The larger documents remain useful as a roadmap and engineering reference, but they must no longer make future product expansion block the first legitimate production release.

### 1.1 Release principle

A feature is a release blocker only when at least one of these is true:

1. J&A cannot complete its real operational workflow without it.
2. Money, invoices, worker compensation, project cost, or customer billing can be wrong without it.
3. A worker, manager, Finance, or Owner cannot perform a required task without reverting to spreadsheets/messages.
4. The absence creates a material security, privacy, data-loss, or audit risk.
5. The system cannot be safely deployed, backed up, restored, or operated in production without it.

Everything else belongs in a later roadmap.

---

## 2. What the product must solve

The production application must let J&A manage this business loop:

```text
Client
→ Project
→ Worker assignment
→ Actual time + standby/overtime/travel
→ Daily/technical activity reports
→ Expenses + receipts
→ Manager approval
→ Finance review
→ Worker compensation + internal direct cost
→ Client billable amount
→ Project contribution/margin
→ Customer time/activity report + signature where required
→ Labor/expense/fixed invoice
→ Invoice issue
→ Payment/partial payment
→ Accounting/financial export
```

The core product succeeds when J&A can execute that loop without rebuilding the truth in Excel.

---

# 3. Essential product scope

## CORE-01 — Authentication, users and roles

The portal must support invitation-only authenticated users.

Required roles:

- Owner/Admin;
- Finance;
- Project Manager;
- Worker.

Required behavior:

- secure login/session;
- invite, activate, suspend and offboard users;
- server-side authorization on every protected operation;
- workers only see assigned projects and their own private compensation information;
- Workers and PMs never receive client rates, other workers' pay, internal loaded costs, company margin, or Finance-only exports;
- sensitive Finance/Admin changes require re-authentication or equivalent step-up protection;
- no public registration.

A sophisticated identity platform is not required. Correct role isolation is.

---

## CORE-02 — Clients, projects and assignments

### Clients

Required:

- create;
- view;
- edit;
- archive;
- restore.

Minimum client data:

- client number;
- optional client code/acronym used on business documents (for example a J&A-defined code such as `CP-12`);
- legal/display name;
- billing contact;
- billing address;
- default currency;
- payment terms;
- optional PO/reference;
- notes.

### Projects

Required:

- create;
- view;
- edit;
- activate;
- close;
- archive;
- restore.

Minimum project data:

- project number;
- project/cost-center number or code;
- client;
- name;
- site/location;
- start date;
- optional planned end date;
- actual close date when closed;
- currency;
- budget/PO cap;
- commercial model;
- billing cadence;
- labor/expense billing configuration;
- project manager.

### Worker assignments

Required:

- assign/remove a worker while preserving history;
- explicit active/inactive/suspended state for workers and projects where operationally relevant;
- assignment start/end dates;
- project-specific worker compensation/rates where needed;
- permitted project scope enforced server-side.

No Plant → Area → Line → Station hierarchy is required for the core release.

---

## CORE-03 — Project commercial rules

Each project must be able to represent the J&A rules that materially affect money.

Required commercial models:

- Time & Materials;
- All-in;
- Capped T&M or equivalent budget cap;
- Fixed/Milestone where used.

Required configurable rules:

- configurable daily/reference-hours template by project and applicable days (for example 10h, 12h, 14h or another agreed value);
- actual time remains authoritative;
- configurable minimum billable hours/day/service independent from actual time and worker compensation;
- hourly labor as J&A's ordinary operating basis; any existing daily/fixed/percentage behavior is used only where J&A explicitly configures it;
- worker compensation rule;
- internal loaded/direct labor cost;
- client bill rate;
- per-worker/per-category overrides where required;
- standby/minimum-day behavior;
- optional overtime with configurable threshold (after N hours) and configurable worker/client multiplier or rate (for example 1.6x, 2x or another value);
- travel-time treatment with an explicit client-billable yes/no rule independent from the worker-pay treatment;
- reimbursable vs all-in expenses;
- labor and expense billing cadence;
- labor and expense tax profile, including an explicit no-tax/0% option when configured by J&A;
- currency;
- PO/budget cap.

The software must never turn the configured daily/reference-hours template or a minimum billable rule into fabricated actual hours.

---

## CORE-04 — Time entry and timesheets

Worker mobile flow must allow:

- choose assigned project;
- date;
- regular hours;
- standby/waiting;
- overtime;
- travel time where applicable;
- optional activity/technical-work summary linked to the same day/time report;
- notes;
- save draft;
- edit draft;
- submit.

Required lifecycle:

```text
Draft
→ Submitted
→ Approved / Rejected
→ Locked
```

Rules:

- actual time is the source of truth;
- submitted/approved records cannot be silently overwritten;
- an authorized Admin/Finance user may add, reduce or correct worker time, but corrections to submitted/approved records require a reason, audit evidence and preservation of the prior value/version;
- draft records may be deleted;
- approved records require an audited correction/void/superseding change;
- obvious overlaps and impossible durations are rejected or explicitly reviewed;
- missing or exceptional time can be surfaced to the PM.

Fast-entry helpers such as “copy previous day” are useful but not release blockers.

---

## CORE-05 — Worker compensation and privacy

The application must support the compensation models actually used by J&A:

- hourly;
- daily/fixed where configured;
- percentage of eligible client labor where configured.

The system must keep distinct:

```text
Worker compensation
Internal/direct labor cost
Client bill amount
Direct project cost
Contribution margin
Collected cash
```

Worker-facing view:

- own approved/estimated compensation and amount expected to be received;
- own reimbursable expenses;
- own settlement/payment status where used;
- expected payment date and actual payment date when those dates are managed by J&A.

Worker-facing view must never reveal:

- client rate;
- internal loaded cost;
- other workers' pay;
- company margin.

Percentage-based compensation must calculate from the explicitly eligible labor basis, not from total invoice value unless that is the configured rule.

---

## CORE-06 — Expenses and receipts

Worker/mobile flow must allow:

- project;
- date;
- category;
- vendor/description;
- amount/currency;
- who paid;
- receipt photo/PDF;
- client treatment;
- notes;
- draft/edit/submit.

Essential expense categories include:

- hotel;
- rental car;
- flight;
- meals/per diem;
- toll/transport;
- other project expense.

Required client treatment:

```text
Reimbursable
All-in / company cost
Non-billable
```

Rules:

- all-in expenses increase direct project cost but do not enter the customer expense invoice;
- reimbursable approved expenses can enter the expense billing stream;
- worker reimbursement state is tracked separately from client recovery/billing state;
- when applicable, expected/actual worker reimbursement dates and invoice/collection linkage are recorded;
- receipt attachment is private;
- duplicate or missing receipt warnings may be simple heuristics;
- approved expenses are locked and corrections are audited.

OCR is not required.

---

## CORE-07 — Daily report and PLC/technical report

The application must support the operational reporting J&A actually needs.

### Daily Project Report

Required:

- project/date;
- worker;
- work performed;
- progress/status;
- blockers/issues;
- next actions;
- optional attachments;
- draft/edit/submit/approve.

### PLC / Technical Report

Required:

- project/date;
- machine/station free-text or simple reference;
- PLC/HMI/robot/system identifier;
- problem/symptom;
- diagnosis/root cause;
- change performed;
- validation/result;
- safety-related flag;
- before/after backup or technical attachment when applicable;
- draft/edit/submit/approve.

### Customer time/activity sign-off report

Required:

- generate a customer-facing report by worker/project/period containing dates, approved hours and activities performed;
- optionally incorporate references/summaries from Daily/PLC/Technical Reports;
- contain **no worker compensation, client rate, internal cost, company margin or other confidential monetary values**;
- support customer signature/conformity with signer identity/name, signed timestamp and immutable document/version reference;
- when a project is configured as `customer sign-off required before billing`, the corresponding labor cannot be finally invoiced until the required signed/conformed report exists; invoice drafts may still be prepared but the blocking reason must be explicit.

### PLC backup history

For the core release it is sufficient to have:

- project/system reference;
- file;
- hash;
- uploaded by;
- timestamp;
- notes/version;
- immutable historical files.

A complete industrial asset registry, FAT/SAT module, punch-list system and plant hierarchy are not required for the first production release.

---

## CORE-08 — Approval workflow

Required approval targets:

- time;
- expense;
- daily report;
- PLC/technical report;
- Finance billability where needed.

Core flow:

```text
Worker submits
→ PM/technical review
→ Finance review when money is affected
→ Locked
```

Required:

- approve;
- reject with reason;
- audited correction/reopen mechanism;
- Owner override with reason and audit event.

A universal “Approval Center” is not required if the same approval actions are reachable cleanly from the relevant domain screens.

---

## CORE-09 — Project finance and profitability

Finance/Owner must see a coherent project financial view derived from approved source records.

Required metrics:

- actual approved hours;
- billable hours;
- worker compensation;
- direct/internal labor cost;
- travel/expense cost;
- labor billable candidate;
- expense billable candidate;
- invoiced amount;
- approved unbilled WIP;
- collected cash;
- outstanding accounts receivable;
- project budget/PO;
- direct project cost;
- contribution/direct project result;
- contribution margin %.

Use **Contribution Margin / Direct Project Result**, not statutory “Net Profit”.

Every total must drill back to source time, expense, rate, invoice, or payment records.

Finance/Owner review must also expose the dates that explain billing and cash flow, where applicable:

- service/work period;
- planned/actual invoice issue date;
- invoice due date / expected client receipt date;
- actual client receipt/collection date;
- expected worker payment date;
- actual worker payment date.

Planned dates must never be presented as actual paid/collected cash.

Advanced forecasting/EAC history is useful but not a release blocker. A simple budget-vs-actual view is sufficient initially.

---

## CORE-10 — Billing periods and invoice drafts

Required billing cadences:

- weekly;
- every 14 days;
- semi-monthly;
- monthly;
- custom period;
- milestone/manual where required.

Labor and expenses must be separate billing streams when configured.

The system must:

1. identify approved source records for a billing period;
2. apply any configured customer-signature prerequisite before final labor invoicing;
3. prevent duplicate inclusion;
4. calculate exact totals;
5. generate invoice draft(s);
6. let Finance review;
7. issue explicitly.

Default:

```text
AUTO-GENERATE DRAFT = allowed
AUTO-ISSUE = no
AUTO-SEND = no
```

An ordinary user must not need to press a hidden/admin “process jobs” button for normal billing to work.

---

## CORE-11 — Invoice templates, issuing and corrections

Do **not** build five unrelated template engines.

Use one versioned invoice rendering system with controlled layouts/variants for:

- Labor Detailed;
- Labor Summary;
- Expenses Detailed;
- Fixed/Milestone;
- Credit/Adjustment.

The renderer may share components and styling.

Required invoice data:

- issuing entity;
- invoice number;
- issue/due date;
- currency;
- client/bill-to;
- optional client code/acronym;
- client number;
- project number;
- project cost-center number/code;
- client/project/PO reference;
- service period;
- lines;
- subtotal;
- tax components;
- adjustments;
- total.

Issuing rules:

- unique invoice number;
- snapshot the issued values;
- generated PDF is traceable;
- issued invoice is immutable;
- later corrections use void/credit/adjustment/replacement workflow;
- never silently edit an issued invoice.

Tax values are configuration, not hard-coded legal advice. Labor and Expenses may independently use different tax profiles or an explicit no-tax/0% configuration supplied by J&A.

---

## CORE-12 — Payments and Invoice/Cost/Collection ledger

Finance must be able to record:

- full payment;
- partial payment;
- expected receipt date where used;
- received date;
- amount;
- reference/note;
- worker settlement/payment planned and actual dates where J&A manages those payments in the system.

Required ledger fields:

- invoice number;
- client;
- project;
- issue date;
- due date;
- invoiced amount;
- direct cost;
- collected amount;
- outstanding amount;
- contribution/direct result;
- payment state.

Do not build bank execution or a full general ledger.

---

## CORE-13 — Essential reports and exports

Do not make dozens of separately engineered report products block go-live.

The core release needs these **six report families**:

1. **Daily/PLC operational reports**, including optional activity linked to time
2. **Customer period / time-and-activity sign-off report** with no monetary values and customer signature when required
3. **Project internal financial/profitability report** for Admin/Finance, including hours/activity, money to pay, money to receive and relevant billing/payment dates
4. **Worker statement / own compensation report**, including hours/activity, own amount to receive, reimbursement/settlement state and expected/actual payment dates
5. **Invoice & collection ledger/report**
6. **Monthly Accounting/Finance export pack**

The reporting engine can expose filters to produce client/project/worker/month views instead of creating a new subsystem for every permutation.

### Required formats

At minimum:

- customer/official documents: PDF;
- finance/accounting tables: XLSX or CSV;
- invoice/expense registers: CSV;
- optional JSON only when a real accounting/integration consumer needs it.

### Accounting/Finance month pack

Required contents:

- invoice register;
- collections;
- worker/direct labor costs;
- expense register;
- monthly totals;
- reconciliation to underlying source rows.

A final pack must be frozen/versioned enough that later changes do not silently rewrite what was previously finalized.

### Artifact behavior

For normal production use:

- queued/generating/ready/failed state must be truthful;
- a missing/pending export must not return an unexplained HTTP 500;
- generation retries must be safe/idempotent;
- a PDF failure must not corrupt or prevent already-independent CSV/XLSX outputs;
- filenames must be meaningful to a business user.

A separate large “Artifact Center”, incident subsystem, and elaborate job-history UI are not required for the first release.

---

## CORE-14 — Responsive UX and accessibility

The portal must be genuinely usable on:

- phone;
- tablet;
- desktop.

Release evidence can focus on representative sizes:

- 360/390 phone;
- 768 tablet;
- 1440 desktop.

Additional widths should be smoke-checked, but eight distinct viewport projects are not themselves a client feature.

Required:

- full mobile navigation labels;
- no first-letter-only navigation hacks;
- finance forms stack readably;
- tables have deliberate mobile representation;
- invoice/report previews remain readable;
- visible keyboard focus;
- labels remain visible;
- error messages are understandable;
- critical touch controls are comfortably tappable.

The existing shared form/card primitives should be used where they improve consistency, but migrating every historical screen to a design system is not a release blocker if the screen is already usable.

---

## CORE-15 — Private files, security and audit

### Private files

Required:

- private filesystem storage;
- metadata in SQLite;
- normalized safe storage keys;
- MIME/extension/size validation;
- authorization before download;
- authorization before final storage;
- no public direct file URLs;
- hash where traceability matters.

### Security

Required:

- secure sessions;
- CSRF protection where applicable;
- login throttling/rate limiting;
- RBAC and object-level authorization;
- no IDOR across projects/workers;
- no worker access to Finance-only DTO fields;
- step-up for high-risk Finance/Admin actions;
- no forged “service actor” path that bypasses human permissions.

### Audit

Append-only audit for material actions:

- user/role changes;
- project/assignment changes;
- time/expense/report approval/correction;
- rate/pay changes;
- invoice issue/void/credit;
- payment;
- sensitive exports/downloads where appropriate.

Audit must not store secrets.

A generalized event platform or ML-ready business-event store is not required.

---

## CORE-16 — Background processing

Normal flows that need deferred work must execute automatically.

Required jobs:

- period/report generation;
- invoice PDF generation/retry;
- monthly finance/accounting exports;
- reminders only if already part of the workflow;
- cleanup of temporary files.

Required:

- durable state in SQLite;
- idempotency for money-related jobs;
- automatic runner through supervised process or systemd timer;
- visible failure on affected operation.

A ten-dimensional Operations Center, generic distributed scheduler, message broker, or Redis is not required.

---

## CORE-17 — Production deployment, health and backup

Required production architecture remains lightweight:

- Next.js public site;
- SvelteKit portal;
- Node 24 LTS;
- SQLite;
- local private file storage;
- Caddy;
- systemd/containers as already designed.

Required operational behavior:

- portal starts automatically;
- website starts automatically;
- DB migration runs safely;
- basic health endpoint;
- disk space can be checked;
- scheduled backup;
- documented restore;
- one restore drill proving DB + issued documents/private artifacts can be recovered.

A complete observability platform is not required.

---

# 4. Conditional requirement — Offline/PWA

Offline is operationally valuable for workers inside plants, but it should not automatically block the first deployment unless J&A confirms that workers must submit data while connectivity is unavailable.

If required for go-live, support only:

- assigned-project cache;
- time draft;
- daily report draft;
- PLC report draft;
- queued receipt/photo;
- sync status;
- per-user isolation;
- conflict detection.

Do not offline-cache Finance dashboards, rates, full exports, or payment data.

If reliable connectivity is acceptable for the first deployment, move this to the immediate post-go-live release.

---

# 5. Explicitly deferred from the production-core release

These capabilities may remain in the roadmap, but they must **not** block the client-complete release.

## 5.1 Industrial expansion

Defer:

- Plant → Area → Line → Station hierarchy;
- full PLC/HMI/SCADA/robot/drive/safety asset registry;
- full current-production-version asset semantics;
- FAT/SAT/commissioning subsystem;
- punch lists;
- closeout package builder;
- photo annotation;
- plant knowledge base;
- QR asset navigation.

Keep only the essential PLC/technical report and immutable backup attachment/history.

## 5.2 Business-ERP expansion

Defer:

- full change-order subsystem;
- versioned forecast/EAC engine beyond basic budget-vs-actual;
- skills matrix;
- certifications and expiry workflow;
- global search;
- bulk-action framework;
- generalized approval center;
- generalized notification preferences;
- import center;
- feature flags UI;
- document tagging/preview platform;
- retention/legal-hold workflow beyond safe financial retention;
- human-friendly universal activity timeline;
- command palette.

## 5.3 Accounting/integration expansion

Defer:

- bank import/matching;
- bank payment execution;
- accounting-provider integrations;
- webhooks/integration API unless a concrete integration already needs them;
- advanced multicurrency FX ledger;
- jurisdiction-specific tax validation engine;
- customer portal;
- email-delivery history platform.

## 5.4 Data/ML expansion

Defer entirely from production acceptance:

- immutable ML event vocabulary;
- point-in-time training snapshots;
- feature registry;
- dataset manifests;
- model registry;
- prediction history;
- shadow mode;
- GBT/JEPA inference;
- leakage research gates.

Normal audit/history needed by the business remains core. ML infrastructure does not.

## 5.5 Engineering-process expansion

Do not make these product blockers:

- decomposing every remaining large file after safe module boundaries already exist;
- 207-row exhaustive legacy RTM as the only definition of client readiness;
- eight viewport projects when representative responsive evidence proves the UI;
- multiple independent review layers for low-risk cosmetic changes;
- a separate Job Center/Artifact Center/Integrity Center when domain screens expose the necessary state;
- migration/cutover machinery for legacy production data that does not exist.

If real production data already exists, safe migration of that real data becomes mandatory.

---

# 6. Simplified lifecycle rules

## 6.1 Mutable operational data

For clients/projects/drafts:

```text
Active/Draft
→ Edit
→ Archive or Delete Draft when safe
→ Restore where relevant
```

## 6.2 Submitted operational records

For time/expenses/reports:

```text
Draft
→ Submitted
→ Approved
→ Locked
```

Correction after approval:

```text
Approved record
→ Audited correction / superseding version / void
```

No silent historical rewrite.

## 6.3 Financial documents

```text
Draft invoice
→ Reviewed
→ Issued
→ Paid / Partially Paid / Overdue
```

Issued documents are immutable.

Correction:

```text
Void / Credit / Adjustment / Replacement
```

No hard delete of issued financial history.

---

# 7. Simplified data model domains

The database only needs clean domain boundaries for:

1. identity/users/roles;
2. clients/projects/assignments;
3. time;
4. reports/technical reports;
5. expenses/documents;
6. rates/compensation/project finance;
7. billing/invoices/payments;
8. reports/accounting exports;
9. jobs;
10. audit.

Do not create additional domain tables merely because a future roadmap feature may need them.

---

# 8. Core release acceptance scenario

The Client Essential Production Release is complete when this scenario passes without spreadsheet intervention.

1. Owner invites Worker, PM and Finance users.
2. Admin creates a client.
3. Admin creates a project.
4. Admin configures the project's reference hours (for example 10/12/14) and minimum billable rule without creating fake actual hours.
5. Admin configures project budget/PO, commercial model, client/project/cost-center identifiers and active state.
6. Admin assigns active workers with start/end dates and can later inactivate them without losing history.
7. Admin configures hourly worker compensation, internal cost, client billing rules, optional overtime threshold/multiplier and Travel billable/non-billable treatment.
8. A percentage-based worker can be configured when required.
9. Admin configures reimbursable vs all-in travel/expenses.
10. Labor and expense billing streams/cadences/tax profiles can differ, including an explicit no-tax/0% configuration.
11. Worker opens the portal on a phone.
12. Worker records regular/standby/overtime/travel time and optional activity; Admin can make an audited time correction without silent history rewrite.
13. Worker sees own pay estimate, own expected/actual payment status/dates, but not client rate/internal cost/margin.
14. Worker submits a daily report and the system can generate a customer time/activity report with no monetary values.
15. Worker submits a PLC/technical report and backup attachment when relevant; technical activity can be referenced from the time/activity report.
16. Worker submits an expense with receipt.
17. PM approves/rejects operational records.
18. Finance reviews billability, compensation, direct cost, revenue, money to pay/receive and planned/actual invoice, collection and worker-payment dates.
19. Project finance shows budget, cost, revenue/WIP, invoiced, collected, outstanding and contribution with drill-down to source rows.
20. All-in expense affects project cost without entering the expense invoice.
21. Reimbursable expense enters the expense billing stream after approval.
22. Period close/generation creates the customer time/activity report, captures customer signature when required, and only then releases the applicable labor invoice draft(s) for final issue.
23. Finance issues an invoice with required client/project/cost-center identifiers; issued values/PDF are immutable.
24. Finance records partial/full client payments and worker/expense payment states and dates where applicable.
25. Invoice/collection ledger reconciles with invoices/payments.
26. Monthly finance/accounting export is generated and reconciles to source data.
27. Pending/failed artifact generation is represented truthfully and can be retried safely.
28. Worker/PM authorization tests prove private Finance data cannot be accessed.
29. Critical flows work on phone/tablet/desktop.
30. Automatic jobs work without an admin manually processing the queue.
31. Backup/restore reproduces the database and issued/private artifacts.
32. Production deployment starts correctly behind Caddy.

If these 32 steps pass, the software is legitimately client-complete even if deferred roadmap features are not implemented.

---

# 9. Required tests for release

Do not require every possible test permutation. Require evidence proportional to business risk.

## 9.1 Mandatory automated suites

- money/rate/compensation calculations, including configurable minimum billable hours, overtime threshold/multiplier and Travel billability;
- admin time correction preserves prior truth and audit evidence;
- all-in vs reimbursable expense behavior and separate worker-reimbursement/client-recovery states;
- billing period and duplicate-billing prevention;
- invoice issue immutability;
- partial payment/outstanding calculations;
- RBAC/IDOR/privacy;
- upload/download authorization;
- draft→submit→approve→correct lifecycle;
- customer time/activity sign-off report contains no monetary data and enforces the optional signature-before-billing gate;
- worker/Admin report privacy and planned-vs-actual payment/collection dates;
- invoice identifiers and independent optional Labor/Expenses tax configuration;
- report/invoice/accounting export generation;
- artifact pending/failure/retry;
- DB migration/integrity;
- backup/restore.

## 9.2 Mandatory browser journeys

At minimum:

- Worker phone journey;
- PM approval journey;
- Finance billing/invoice journey;
- Owner project/client configuration journey;
- 360/390 phone;
- 768 tablet;
- 1440 desktop.

## 9.3 Release gates

Required:

- formatting/lint/typecheck;
- unit/integration/security tests;
- DB integrity;
- production build;
- essential E2E journeys;
- backup/restore drill.

No known critical product RED may remain in the 32-step acceptance flow.

---

# 10. What “complete” means

The release is **CLIENT READY** when:

- all CORE requirements are implemented;
- the 32-step acceptance scenario passes;
- money reconciles;
- privacy/RBAC passes;
- issued financial history is immutable;
- automatic jobs work;
- mobile and desktop core workflows are usable;
- backup/restore is proven;
- no essential flow requires Excel as the source of truth.

The release is **not blocked** by deferred V3.2/V3.3/V3.4 roadmap capabilities.

---

# 11. Recommended repository authority after adopting this scope

If this scope is approved, repository instructions should be changed so Codex reads requirements in this order:

1. `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`
2. `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`
3. original V3 spec as domain/reference material;
4. remediation plan for known defects;
5. V3.1–V3.4 backlog as **post-core roadmap**, not release authority.

The old rule “all P0/P1/P2 + 207 rows + all 42 original DoD items must PASS before READY” should no longer be the release verdict for the client-essential branch.

---

# 12. Final scope summary

The application J&A needs now is fundamentally:

> **A secure mobile/desktop field-operations and project-finance system that manages clients/projects/workers, actual time, worker compensation, travel/expenses, daily/PLC reports, approvals, project profitability, invoicing, collections and accounting exports, with reliable background jobs, private files, audit and backup/restore.**

That is a complete software solution.

It does **not** need to become, before first production use:

- a CMMS;
- a full ERP;
- a full accounting package;
- a workforce certification suite;
- a client portal;
- a data warehouse;
- an ML platform;
- a JEPA product;
- or a generalized integration platform.
