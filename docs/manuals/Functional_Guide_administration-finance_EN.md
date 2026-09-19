# Administration and finance functional guide

## Start here: choose your role

This guide combines the Owner, Finance and Auditor paths. Use the role path that matches the signed-in account. Procedures explain how a workflow works; they do not expand the account’s permissions.

- [Shared identity, session and source-record rules](#shared-identity-session-and-source-record-rules)
- [Owner: administration, projects, planning and approvals](#owner-administration-projects-planning-and-approvals)
- [Finance: economic review, billing, cash and compensation](#finance-economic-review-billing-cash-and-compensation)
- [Accounting Packs: generate, follow and finalize](#accounting-packs-generate-follow-and-finalize)
- [Auditor: read-only evidence and global Audit](#auditor-read-only-evidence-and-global-audit)
- [Preserve history, act on feedback and get support](#preserve-history-act-on-feedback-and-get-support)
- [Permissions matrix](#permissions-matrix)

Access — Consult: Owner, Finance and Auditor in their separate authorized scopes. Create: none in this orientation chapter. Approve: none. Modify: none.

## Shared identity, session and source-record rules

Access — Consult: each role sees only the project, financial and evidence records permitted for that account. Create: Owner and Finance create records in their authorized workflow; Auditor creates no source record. Approve: the responsible Owner or Finance workflow, never from a read-only view. Modify: drafts or explicit correction paths only; finalized history stays traceable.

Use your own account and open **Help** for the current guide assigned to that profile. **Activity Inbox** links to a source record you are allowed to read; reading a notice is not approval. Sign out on shared devices and never share a password, session or recovery code. Optional passkeys and MFA are managed in **Profile** when available.

Confirm project, period, identifier, status and effective dates before acting. Financial summaries derive from approved source records and effective-dated rules. A forecast, expected collection or scheduled settlement is not a bank balance or proof of payment. Pending jobs, quarantined documents and unconfirmed bank events remain unresolved states.

<!-- screenshot:owner:home -->

## Owner: administration, projects, planning and approvals

Access — Consult: Owner may consult cross-project administration, operational and financial records within the Owner account. Create: Owner creates clients, projects, assignments, supplier grants and administrative records. Approve: Owner approves or requests changes on authorized operational records and reviews supplier-origin time; customer sign-off remains the customer’s act. Modify: Owner changes administration, planning and permitted drafts through dated, auditable actions; issued financial snapshots use controlled correction flows.

Create the client with its billing identity, then use **New Project** to set the name, site timezone, manager, billing model, start and planned end. Reopen the saved project to check its number and dates. In **Projects**, expand **Project calendar**, move between months, select a day and open its agenda event. The project end date is inclusive; a timed shift end is exclusive.

In **Planning**, filter the project and worker, select a date to prepare the assignment form, or select an existing shift to open its editor. Compare active team assignment, UTC availability and overlapping shifts before **Publish assignment**. Editing a published shift is an Owner action. Planning is expected work and never creates actual hours, compensation, invoice evidence or customer acceptance.

Use **Projects → Team** for dated assignments and role changes; ending access preserves history. In **Suppliers**, appoint a coordinator or external technician and authorize each installation by effective dates. A restricted supplier profile never acquires Finance or approval permissions merely because the Owner can inspect it.

In **Approvals**, inspect submitted time, expenses and Daily or Technical / PLC reports with their source evidence. Approve or request changes with a factual reason. Supplier-origin time requires Owner review. Preserve returned records through correction drafts. The Owner manages operational approval and administrative boundaries; Finance handles the economic treatment described below.

<!-- screenshot:owner:planning-month -->
<!-- screenshot:owner:planning-editor -->
<!-- screenshot:owner:help -->

## Finance: economic review, billing, cash and compensation

Access — Consult: Finance consults authorized Finance Overview, Projects, Billing, Expenses, Reports, Collections / Ledger, Accounting and Profile views. Create: Finance creates authorized financial drafts, receipts, compensation settlements and actual payment records. Approve: Finance approves or issues within the financial workflow where the action is available; operational approval and customer sign-off remain separate. Modify: Finance changes effective-dated rules and editable drafts with a reason; issued invoices and finalized packs require controlled correction or a new version.

Open **Projects** first and confirm the client, project and effective dates. In **Commercial Configuration**, inspect the legal entity, billing stream, tax profile, rates and effective dates. Change only the approved rule and period; later configuration must not silently rewrite older records. Availability in **Profile** is planning context in UTC, not a reason to publish a shift or calculate compensation.

In **Economic Review**, open **Source records** and reconcile invoiced revenue, direct labor, expenses and margin to the contributing rows. Review worker compensation and reimbursement separately from customer billing. **Finalize compensation** closes the reviewed calculation; it is not a bank transfer.

In **Billing**, resolve readiness messages against approved sources and customer sign-off before creating or issuing an invoice. Check entity, currency, numbering, tax and lines, and review the generated PDF. Edit only a draft. Once issued, use controlled void, credit/adjustment or replacement actions with a reason; never edit an issued snapshot in place.

In **Collections / Ledger**, link each issued invoice to full or partial receipts with their actual date and reference. In **Cash calendar**, distinguish expected collection and scheduled settlement from money actually received or paid. **Register actual payment** requires a real transfer with date, amount, currency and reference. A partial payment leaves a balance; **Reverse payment** appends an audited correction.

<!-- screenshot:finance:finance -->
<!-- screenshot:finance:profile -->

## Accounting Packs: generate, follow and finalize

Access — Consult: Owner and Finance only for Accounting Pack generation, artifacts, finalization and download. Create: Owner or Finance creates a pack for a permitted accounting period. Approve: Owner or Finance reviews and finalizes it. Modify: a finalized pack is not edited; a later correction requires a new version. Auditor: may not generate, finalize or download Accounting Pack artifacts under this boundary.

Choose the project and accounting period, then use **Generate pack** after checking source records. The pack assembles the reviewed invoice, collections, labor-cost and expense evidence for the period. Treat job states truthfully: **Queued** means automatic processing is pending, **Processing** is active, **Ready** enables the corresponding artifact download, and **Failed** requires the offered retry or support path. Independent artifact failures do not make an unavailable file ready.

Open each ready artifact and reconcile its period, source rows and totals before **Finalize**. Finalization freezes that reviewed version as historical evidence. Later source corrections require another Accounting Pack version; do not overwrite or silently replace the finalized one. Keep the pack identifier and artifact status when reporting a problem.

## Auditor: read-only evidence and global Audit

Access — Consult: Auditor may consult authorized audit, Finance Overview, billing, Collections / Ledger and evidence views, plus global **Audit**. Create: none of those business records; Auditor does not administer users or organizational security settings. Approve: none. Modify: none; even a correction request is reported to the responsible Owner or Finance user. The account’s own language or authentication controls remain subject to the **Profile** controls shown to it. Accounting Pack generation, finalization and artifact download remain Owner/Finance-only.

Start with the displayed project, period, identifier and state. Open the source record and compare dates, actor, version and attached evidence. In **Audit**, filter the append-only event list to inspect who changed what and when. Global Audit is available to Owner and Auditor; Finance does not receive that global Audit authority.

An approved time record, customer sign-off, issued invoice and confirmed payment are separate facts. Do not infer one from another. A generated or finalized financial snapshot is historical evidence; a later correction does not erase it. Calendars and planning dates provide context, not authority to publish or edit. Availability windows are not actual hours, and planned work is not proof of performance.

If a record, event or document is outside the account’s authorization, preserve that denial in the finding and request a scoped review from the Owner. Do not use an unavailable edit control, another person’s session or a test approval/payment to inspect behavior.

<!-- screenshot:auditor:audit -->
<!-- screenshot:auditor:help -->

## Preserve history, act on feedback and get support

Access — Consult: Owner, Finance and Auditor consult only the records allowed to their role. Create: Owner or Finance creates a correction, void, credit, replacement, reversal or new pack version where authorized; Auditor creates a finding, not a source mutation. Approve: the responsible Owner or Finance workflow; Auditor approves nothing. Modify: editable drafts and controlled correction paths only; append-only audit and issued/finalized history are retained.

When a control rejects an action, record the displayed code or reason, source identifier, project or period, current status and intended next step. Check scope, effective dates, source readiness and record version before retrying. A stale availability edit requires reload and reconciliation. Do not change the person, project, date or financial period to clear a warning, and do not backdate a payment or invoice.

Use **Help** and the verified support route at **admin@j-aautomation.com** for persistent access, source, artifact or payment-state problems. Auditors should include the event or source reference and the exact inconsistency. Owners and Finance users should include the accounting period, artifact status or invoice state. Do not send credentials or unrelated customer data. The portal’s audit and source history remain the record of truth.

## Permissions matrix

Access — Consult: the role’s effective scope and privacy boundary. Create: only role-authorized source records and drafts. Approve: only the explicit reviewer boundary. Modify: only drafts, dated configuration or controlled correction/new-version flows.

- **Owner:** consult, create and modify administration, clients, projects, assignments, supplier grants, planning and operational records; approve authorized operational submissions and supplier-origin time; administer users and security; access financial workflows and Accounting Packs; consult and use global Audit.
- **Finance:** consult, create and modify Economic Review, Commercial Configuration, Billing, Collections / Ledger, compensation, actual payments and Accounting Packs; approve or issue where the financial workflow permits; no Owner user administration, supplier appointment or global Audit.
- **Auditor:** consult authorized evidence and global Audit in read-only mode; create no project, assignment, availability, approval, invoice, payment or closeout, and do not administer users or organizational security settings; approve nothing; modify nothing in audited business records. The account’s own language or authentication controls remain subject to **Profile**. Accounting Pack actions and artifact downloads remain Owner/Finance-only.

Knowing a procedure, seeing a navigation label or opening a source link does not grant the corresponding permission.
