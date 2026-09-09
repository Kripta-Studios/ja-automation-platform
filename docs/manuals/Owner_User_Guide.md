# Owner and Finance user guide

## Purpose and evidence boundary

This English reference explains the operational screens available to Owner and Finance administrators. It is written for the current portal build named in the validation record. Figures are synthetic captures of that build. They show controls and states, never production records. A capture supports orientation; it does not authorize an action or prove that a business event was completed.

Use the portal's Help page for the guides assigned to your account and the verified support route in your invitation for access problems. Do not send passwords, recovery codes, private receipts, or customer documents through email or chat.

## Role and data boundary

| Role                  | Typical access                                                                    | Limits that matter                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Owner administrator   | Full operational, commercial, finance, billing, closeout and audit administration | Protect commercial data and use controlled correction paths for history.                                                            |
| Finance administrator | Finance, billing, cash, accounting, reports and closeout as assigned              | Does not receive Audit merely because this guide describes its Owner procedure.                                                     |
| Project manager       | Assigned project coordination, review, period follow-up and planning              | Project scope and effective assignment dates limit access; commercial configuration and accounting are not general PM work.         |
| Auditor read-only     | Authorized read-only evidence and audit review                                    | Cannot issue, approve, edit, close, retry, record payment, or change security.                                                      |
| Worker                | Own assigned work, time, reports, expenses, documents, profile and My Pay         | Cannot use billing, finance, accounting, audit, staff follow-up or closeout. Worker compensation and customer rates remain private. |

The Help catalog deliberately distributes this detailed PDF only to Owner and Finance roles. This matrix makes procedures readable for PM and Auditor coordination; it does not grant them a download or an action.

## Navigation, sign-in and security

Sign in with your own account. Use search and the left navigation on desktop or the compact mobile navigation to reach an authorized area. Select Language before preparing user-facing material and sign out on a shared device. The Activity Inbox is at `/app/notifications`; opening a notification leads to its permitted source record and can mark it read.

Passkeys and MFA are available from Profile. MFA is optional for every role and operation. If you enable it, register the authenticator, verify its current code, and store one-time recovery codes privately when shown. Do not enrol a shared device or disclose recovery material.

## Help and Activity Inbox

:::figure owner /app/help Help shows the guides available to the signed-in role.

1. Open **Help** and select the guide language.
2. Download only a guide assigned to the current role. A denied guide is an authorization boundary, not a link to bypass.
3. Open **Activity Inbox** at `/app/notifications` and choose a notification to view its source context.
4. Confirm project, record and changed-field context before acting. Marking a notification read acknowledges the inbox item; it does not approve its business record.

Email notifications are corporate-recipient delivery only. The inbox remains the portal reference when an email is delayed, rejected, or unavailable.

## Projects, workers, assignments and effective calendars

:::figure owner /app/projects Projects and assignments are scoped records, not a source of compensation disclosure.

Use Projects to select the customer, project, milestones, contacts and assignment history. Before changing an assignment, verify the named worker, project, start and end dates, planned work, review permission and current version. Updating an assignment keeps its history; removal ends it and does not hard-delete the historical row.

Use Planning to publish a field assignment only after capacity and project approval. Skills and availability can guide planning, but do not disclose worker compensation. A worker may be assigned to several projects with different roles, dates and schedules; record actual work against the correct assignment and date.

Commercial rules, issuing authority, client rates and internal loaded cost are resolved by project, worker/category/activity and effective date in Finance. A later configuration must not rewrite the commercial treatment of earlier work. Verify the effective period before changing any rate, legal-entity assignment or rule.

### Clients and project setup

Open **Projects** and choose the Clients view to find the customer, contacts and sites. Before adding or changing a contact, confirm the customer, the intended operational purpose and whether it is a billing contact. A contact update does not retroactively alter an issued invoice snapshot.

To create a client, choose **New Client** and enter the required **Legal name**, **Display name**, **Currency**, **Timezone**, **Billing address** and **Payment terms (days)**. Add **Client code**, **Billing contact name**, **Billing contact email**, **PO / reference** and **Notes** only when they are known. Select **Create client**. To correct a current client record, use the update form shown for that client; it carries the displayed record version, so a stale submission is rejected rather than overwriting another administrator’s change.

Open the project record before changing milestones, schedule, team or customer-facing source documents. Confirm the project number, status and dates. Use **Create milestone** only for an approved deliverable. The project record supplies context; it is not authority to move work, rates or invoices from another project.

To create a project, choose **New Project**, select the **Client**, then set **Name**, **Cost center code**, Description, Currency, Project manager, **Billing model**, **Site timezone**, Start date, Planned end date, Expected hours / day and Client daily minimum hours. Set **Budget type** and only the approved budget/cap fields. Choose **Create project** and reopen it to confirm the displayed project number. Use **Save project** only to correct the current project fields. Archive only after the authorized close/retention decision; archiving is not a substitute for closing invoices, records or handover.

### Team assignments: several workers on one project

Use the Team view to search **Name, role or project** and open the worker's active assignment. For the same project, each worker can have different planned minutes, effective dates and commercial compensation configuration. **Assign Worker** creates a worker assignment; the project manager is configured separately on the project.

1. Confirm Worker A and Worker B each have an active assignment to the same project, with their own start/end dates. Do not reuse one worker's assignment identifier or dates for another.
2. Create the assignment with its **Starts on** and optional **Ends on** dates. Use **Update assignment** to change dates, **Planned minutes** and, where allowed, **Can review**. Save each worker separately.
3. Open Finance → Commercial and use **Create compensation rule** for that same project. For Worker A select **Worker**, **Project scope** (the same project, not Global default), **Currency**, **Rule type**, **Rate basis**, the visible **Hourly rate** or daily amount, and **Effective from**. Save the rule only after checking the decimal amount and date. Use the rule lifecycle controls to supersede or end an existing rule.
4. Create Worker B’s separate compensation rule with its own Worker, Project scope, Currency, Rule type, Rate basis and effective dates. Use the visible percentage field only for a percentage rule; do not put a percentage in the hourly/daily amount field.
5. Review the resulting policy history and assignment history. Client labour and internal loaded-cost rules use their own forms and must not be substituted for a Worker compensation rule. If a past actual is wrong, use its correction workflow; do not backdate a new configuration to silently alter historical truth.

Worked configuration example: one project has Worker A assigned as field technician from 1–30 September with a **25.00** hourly compensation rule and Worker B as controls specialist from 15–30 September with a **180.00** daily rule whose Rate basis is **daily**. Their actual time stays factual and separate. Client labour and internal loaded-cost rules are separate forms, and neither value may be copied into the compensation form. The Owner checks each rule's scope and effective dates before approval. This is a configuration pattern, not a promise that either worker has been paid or that an invoice has issued.

### Planning and availability

In **Planning**, select the project, worker, assignment date and planned duration before **Publish assignment**. Compare the worker's availability window and existing assignments first. Publishing planning does not create actual time. In the Team/Profile management area, save an availability change with its window; availability is operational data and never exposes compensation or customer rates.

## Time, expenses, approvals and corrections

:::figure owner /app/time Time records actual work; expected schedules and billable minimums do not create actuals.

Review Time by project and period. Check source evidence, dates, actual duration and the applicable assignment before approval. Expected schedule, customer minimum and travel treatment may affect later commercial calculations, but never change the worker's factual actual time.

Review Expenses with the actual payer, receipt, category, currency, project, business reason and commercial treatment. A reimbursement and a client charge can follow separate rules. Returned entries require a reasoned correction; approved history remains traceable rather than silently overwritten.

Use Approvals to open the relevant queue, inspect time/report/receipt evidence, and approve or return with a factual note. Operations approval is internal review. It is not customer acceptance, customer signature, proof of collection, or evidence that a transfer was made.

### Time procedure

In **Time**, select the project and period, open the entry and compare service date, activity, actual duration, assignment and supporting report. Choose the visible approve or return control only after the source is correct. For a return, give the factual reason that tells the Worker what to correct. For an approved history correction, retain the reason and refer to the original rather than creating an indistinguishable replacement.

### Approval queue procedure

In **Approvals**, choose the **Time**, **Project approvals** or **Finance review** queue that matches the record. Open the record, read its evidence and displayed state, then approve or return with a factual note. Do not use a queue action to test a screen. A successful internal action does not sign a customer report, issue an invoice, schedule compensation, or make a transfer.

### Expense procedure

In **Expenses**, open the submitted item and check **Project**, **Date**, **Category**, **Amount**, **Currency**, **Payer**, business reason and receipt. Confirm whether its commercial treatment and reimbursement treatment are appropriate before approval. For a returned item, state the correction needed. Do not change a source receipt merely to change a finance outcome.

## Private documents, report attachments and uploads

:::figure owner /app/documents Private document access is checked before storage and every download.

Use Documents only for authorized project artifacts. Confirm the project, audience, artifact classification and sensitivity before upload. For financial evidence, set **Document access** to **Finance, Owner and Auditor only**; the default **Project document** follows operational project access. This choice is available to Owner and Finance. The system registers safe storage metadata and integrity data. A file can be quarantined or pending scan before it is available; do not treat submission as a successful, shareable upload until its displayed status permits it.

For a rejected, unavailable, or failed upload, keep the original, read the displayed error, correct the file or connection issue, and retry only through the same authorized workflow. Do not create duplicate evidence or upload credentials, unrelated customer material, altered receipts, or a private file to make a screen look populated. Downloads remain role- and object-authorized.

Daily and Technical / PLC report attachments have their own permitted attachment kinds. Attach factual work evidence only. A report PDF or attached signature document must be the exact artifact and hash shown for the selected report version.

## Reports, customer conformity and period follow-up

:::figure owner /app/reports/review Period review groups customer-period records by project and date range.

Use **Reports** for daily and technical records. Use **Period review** at `/app/reports/review` to choose the authorized project and date range, inspect source coverage, report state, snapshot version and snapshot hash, then open the specific period report.

:::figure owner /app/reports/period/:id A customer period report identifies the exact snapshot before a signature or follow-up event is recorded.

The correct customer-conformity sequence is:

1. Review and approve the operational content under the permitted review path.
2. Generate or confirm the current customer PDF. Check that the PDF is ready and that its snapshot version and SHA-256 correspond to the report being sent.
3. Send or present that exact PDF through the approved business process. Recording an email or follow-up is not a customer signature.
4. Record customer conformity only from actual signed-copy evidence tied to that same snapshot/hash, with the real signatory and date. Never invent a signature or reuse evidence from a different version.
5. If the report is refreshed, its previous signature/follow-up becomes stale for the new snapshot. Obtain a new valid signed artifact where conformity is required.

Period follow-up records one of the displayed append-only event types: **Shared**, **Exported**, **Awaiting named signatory**, **Returned**, or **Disputed**. Enter the required dispatch method/date/reference for Shared or Exported, the named signatory for Awaiting named signatory, or the reason for Returned/Disputed; select the responsible staff member, next follow-up date and retry key. Shared/Exported is staff attestation of dispatch, not customer email sent by this feature and not signature evidence. Each event is tied to the exact snapshot. A PM may record follow-up only for an assigned project with review permission; Workers are denied this staff flow.

## Commercial configuration and preview

:::figure owner /app/finance?view=commercial Commercial configuration is effective-dated and owner/finance controlled.

Open Finance with the Commercial view. Select the correct project and inspect the commercial policy, billing streams, legal entity, tax profile, invoice-number policy and rates before changing anything. Effective-from and effective-to dates must describe the approved business decision. Previous legal-entity assignments and issued records remain historical evidence.

Use **Commercial agreement and example** at `/app/finance/preview` for a single-worker, single-workday editable calculation illustration. Its fields cover hourly worker compensation, loaded hourly cost including pay, actual/reference/minimum hours, the selected expense responsibility, optional overtime, fixed-price alternative and sample billing cadence. Its editable values are not saved project rates or project configuration. It does not model travel, percentage pay, caps, taxes or mixed-rate minimums; review those in the project’s effective commercial setup. The result is before tax and does not record a payment, invoice, customer acceptance or bank confirmation.

## Billing, issued invoices and corrections

:::figure owner /app/billing Billing begins with validated source records and a draft, not an issued invoice.

1. In **Billing**, select the stream and period. Resolve readiness messages: approved billable sources, period boundaries, legal entity/tax profile, currency, caps, rates, and any required customer signoff.
2. Create or review the draft. Confirm recipient, PO/reference, items, exact amounts, tax treatment and payment terms. Use the draft detail preview/PDF to check the intended document.
3. Issue only after the authorized review. Issuance consumes the controlled number and creates an immutable historical snapshot; later customer/contact/rate changes do not rewrite it.
4. Send only through the authorized delivery action and verify the resulting delivery state. Email may be limited to corporate recipients; an outbox event is not proof the customer received or accepted the invoice.
5. Record a payment only from authoritative payment evidence. Partial payment, overdue and paid are invoice/ledger states. A finance forecast or cash date is not a bank balance.

For a mistake after issue, use the provided void, credit, adjustment or replacement lifecycle with its reason and effective date. Do not edit or delete an issued snapshot. A payment reversal likewise requires the controlled reversal path and a real effective date; it does not erase the original payment event.

### Invoice control sequence

On the Billing register, use **Create invoice draft** only after the readiness messages are resolved. In the draft detail, use **Save details** for the draft-only fields such as purchase number, discount, bank details, beneficiary and past-due notice; reopen **Preview** and **Open PDF** to review the draft document. Use **Approve invoice**, **Issue invoice**, **Record payment**, **Reverse payment**, **Void invoice** and **Create adjustment** only for their named lifecycle state and with real evidence. **Send by email** requires an explicit recipient and a ready, verified PDF. Check the displayed Queued, Retrying, Failed, Delivery uncertain or Accepted by SMTP server status. If delivery is uncertain, ask the administrator to inspect the mail server before retrying; automatic resending is stopped to avoid duplicate invoices. Queueing does not mark the invoice sent; SMTP acceptance does, but does not confirm inbox delivery or customer acceptance. **Mark sent** records a manual sending action and sends no email.

### Compensation and reimbursement procedure

Worker compensation is configured and reviewed as internal finance data, separately from customer billing. In Finance → Commercial, select the project and check the worker/category/activity scope, exact rate and effective dates of each compensation rule. A Worker’s My Pay may show estimated, approved, scheduled, finalized or paid states only for that Worker. **Finalized** is final calculated compensation truth, not confirmation of a transfer; **Paid** needs a recorded actual payment date. Reimbursement is likewise distinct from an expense’s customer billing treatment. Never use one worker’s statement to assess another worker’s compensation.

## Finance, cash calendar and collections ledger

:::figure owner /app/finance/cash Cash calendar separates actual cash events from expected and unresolved items.

Finance overview and Economic review show internal project economics for the selected scope and period. Treat revenue, cost, margin, worker compensation and project budgets as confidential. Reconcile views to the underlying approved source rows before relying on an aggregate.

Use **Cash calendar** at `/app/finance/cash` to filter by date range, project and grouping. It presents dated cash-related items and links to their source. Forecast, scheduled settlement, expected collection and finalised compensation do not prove that a bank transfer occurred. Cash is not a bank balance; use confirmed bank/payment evidence for reconciliation.

Use **Collections / ledger** at `/app/ledger` to filter invoice, cost and collection rows, review partial payments and reversals, and export only for an authorized recipient. Reconcile the record to the authoritative banking evidence before calling a collection confirmed.

## Accounting Packs and background jobs

:::figure owner /app/accounting Accounting Packs expose each export state separately.

Create an Accounting Pack only for the selected authorized period after reconciliation. The request queues work for the service actor; normal users never run jobs manually. **Queued** means accepted for work, **running** means the service is processing it, **ready** means that artifact can be downloaded, and **failed** means no artifact was fabricated for that failed format.

Review formats independently. A ready PDF does not make an XLSX ready, and a failed export does not invalidate a ready sibling. Use the designated retry control only for a terminal failed format and only after correcting the cause; retain the error and audit context. Finalizing a pack requires required exports and reconciliation, and is not bank-transfer confirmation.

## Project closeout, client package and reopening

:::figure owner /app/projects/:id/closeout Closeout revisions preserve the selected audience and source evidence.

Open the project Closeout page. Select only eligible, clean/allowed customer documents and eligible accepted period references. The customer package excludes internal financial data and unauthorized/private artifacts. Prepare the draft, inspect its internal and client-facing package summaries, and refresh the draft if the authorized source selection changes.

Client confirmation is a controlled closeout statement, separate from operational approval and from a customer-period signed copy. Record it only when the actual business confirmation exists. Finalizing freezes an immutable revision and its download artifacts for the correct audience. A ZIP download is a revision artifact, not permission to distribute it outside its intended audience.

If later work is necessary, use **Reopen** with the required reason. Reopening creates a subsequent revision; it does not alter a finalized package. Review the new revision's source list, hashes and audience before finalizing it.

## Audit, support and safe recovery

Owners can use Audit to inspect append-only security and finance events. Auditors use only their authorized read-only views. An audit event helps explain a controlled action; it cannot be edited into acceptance or payment proof.

### Audit and Profile procedure

In **Audit**, filter or locate the relevant event and compare its action, entity, actor, timestamp and details with the record under review. Audit is append-only; do not attempt to edit, remove or recreate an event. In **Profile**, manage only your own language, passkeys and optional MFA. Register a passkey only on an appropriate personal device. When enabling MFA, complete **Verify MFA** with the authenticator code and store displayed recovery codes privately. Profile changes never grant a finance, billing or audit role.

If a required control is absent, a route returns an authorization error, an upload is blocked, a figure differs from the current screen, or an amount conflicts with approved evidence, stop and use the verified support route in the invitation. Do not bypass RBAC, fabricate customer acceptance, manually run a job, or make a financial mutation to test the portal.

## Supplier teams and accounts without financial access

The Owner chooses the supplier coordinator. A supplier account cannot appoint itself or grant finance, administration or approval permissions. An installation is a project in the app. The Owner must authorize each installation and its effective dates before the coordinator can record team work.

For the Owner: open **Suppliers**, add the supplier, select an existing Worker account and save **Supplier coordinator** or **External technician**. Then authorize the installation for the chosen coordinator. Changing the access profile signs that account out; the person must sign in again. Revoking an installation blocks that coordinator on the next request, including their personal time and reports for that installation. Technician assignments and other coordinators’ permissions are managed separately by the Owner.

For the coordinator: open **Supplier team**, select an authorized installation, and use **Add technician**. Enter the technician's name, optional email and assignment dates. This creates a personnel record without login credentials or an invitation email. Use **Assign existing technician** for someone already in your supplier team. Ask the Owner to configure any existing account that needs to sign in.

In **Record team hours**, select the technician and enter the real work date, category, minutes and work description. Save the draft, check it and select **Submit to J&A**. The named technician is the subject of the hours; the coordinator remains the recorded actor. J&A approves the hours through the normal review workflow. A supplier cannot approve its team's hours. Returned **needs_changes** hours use **Create correction draft**; edit and submit the replacement while the original remains in history. Rejected work requires a new draft.

Use **Operational report** to filter by installation and dates, read approval states, download CSV, or print/save a PDF in the browser. History remains visible; rejected, void and superseded records do not increase the effective total. This report does not certify payment or customer acceptance.

An External technician sees only their own operational hours and reports. Supplier coordinator and External technician accounts have no My Pay, rates, expenses, financial documents or financial exports. The compensation and expense procedures elsewhere in this guide apply to standard Worker accounts. Supplier reports never include money. Contact the Owner when your installation or technician is missing; do not record work against a substitute person or project.

:::figure owner /app/supplier The Owner appoints supplier coordinators and authorizes installations.


Repeated receipt content is rejected with a controlled conflict, including renamed copies. The original stays unchanged; the failed upload is cleaned up. Do not rename or alter a receipt merely to bypass this check.
