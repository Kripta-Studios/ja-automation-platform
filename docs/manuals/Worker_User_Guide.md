# Worker user guide

**External accounts:** Supplier coordinators and external technicians have operational access only. My Pay, expenses and financial procedures below apply to standard Worker accounts. See “Supplier teams and accounts without financial access” for your workflow.

## Purpose and your private workspace

This English guide explains a Worker's own authorized portal work: assigned projects, actual time, reports, expenses, permitted documents, profile and My Pay. Figures are synthetic examples from the current validated build. Use Help and admin@j-aautomation.com for access help; never share a password, MFA or recovery code, receipt, customer document, or session.

Use the language selector on the sign-in page or in the portal to choose English, Spanish or Portuguese. English is the default when no preference has been saved. Your choice is retained in this browser after navigation, reload and sign-out; the next sign-in page uses the same language.

Your access is limited to your own assigned data and permitted project records. You cannot use Finance, Billing, Collections, Accounting, Audit, staff period follow-up, Closeout, or Approvals. A denial such as 403 is the current access boundary; it is not an incident to work around. You cannot see customer billing rates, revenue budgets, PO caps, internal margins, or another worker's compensation.

## Sign-in, Help and optional MFA

:::figure worker /app/help Help lists the guides available to the signed-in role.

Use the invitation linked to your mailbox. There is no public sign-up. From **Help**, download the field guide or detailed worker guide available to your role. The owner/finance guide is not assigned to Workers.

MFA is optional. If you choose it in Profile, register the authenticator, verify the current code and store recovery codes privately when they are shown. Normal work does not require a step-up prompt. Sign out after using a shared device.

## Today, assignments and the correct project

:::figure worker /app Today shows only work that is scoped to your account.

Start on Today and open only the assigned project and task. A person can have different assignments, roles, dates and expected schedules across projects. Before adding work, confirm the project and service date. If a project is missing, or an assignment date is wrong, contact the responsible manager; do not enter work under another project.

Expected schedule hours and customer minimums do not create actual time. They may matter to planning or commercial calculation, but you must record only factual work.

## Time, travel, offline capture and corrections

:::figure worker /app/time#time-form Time records factual actuals under the selected assignment and date.

1. Open **Time**, choose the assigned project and the actual service date.
2. Record the activity and actual duration. Record travel separately only when the project workflow permits it.
3. Check the date, duration and factual description, then save or submit through the displayed workflow.
4. If a reviewer returns an item, read the reason and submit the requested correction. Approved history stays visible; use the correction path with a real reason instead of deleting, duplicating or overwriting it.

Offline capture is conditional. Use it only while the portal says it is enabled and the authenticated offline identity is valid. Keep the device secure. Reconnect and confirm the saved/synced result; a sync conflict means the server changed since the offline edit and needs review. If offline is unavailable, wait for connection and retry the same draft rather than creating a duplicate.

### Time fields and state

Use the Time form’s **Project**, **Work date**, **Category**, **Minutes** and **Summary** fields. Select **Save draft** when the record is incomplete or needs checking; select **Submit** only after the factual entry is ready for review. Open your own returned record, correct the named field or summary, and submit it again. You cannot approve your own item. If the project, category or date is unavailable, do not guess a substitute; ask the manager to correct the assignment.

## Daily and Technical / PLC reports

:::figure worker /app/reports#reports-form Reports capture factual work; a Worker never creates customer acceptance.

Use **Daily** for a factual field summary. Use **Technical / PLC** for the system, work performed, validation, remaining risks and permitted attachments. State what occurred and what remains unresolved. Never claim a test passed when it did not.

Submit a report for review through the displayed workflow. Internal approval does not equal customer acceptance. Do not sign for a customer, upload a signature for a customer, record period follow-up, or reuse an attachment from another report or version.

### Daily, PLC and attachment procedure

For **New daily report**, choose the project and complete **Work date**, **Site / shift**, **Summary**, completed work, problems found, evidence, open items and next-day plan. Select **Save daily report**, reopen it, then select **Submit** when factual and complete.

For **Technical / PLC**, choose **New technical report** and enter the report date, system/site/area/station, platform/controller/HMI/network/software/program reference, work and validation evidence, result, open risk and recovery or next action. Save the PLC report, then submit it when ready for review. The generated PDF identifies you from the persisted author account, showing your name and account email when available; you do not need to retype identity data into the report. To attach permitted evidence, use **Attachment kind**, select the file, give the factual description and choose **Upload private evidence**. If a report is approved or finalized, attachments are immutable: create the audited correction draft rather than replacing evidence.

## Expenses, receipts and private files

:::figure worker /app/expenses#expenses-form Expenses use the actual payer and supporting receipt.

Choose the correct project, service date, category, exact amount/currency, actual payer and business reason. Select yourself only if you actually paid the expense. Attach only a readable permitted JPEG, PNG or PDF receipt, then retain the original until the portal confirms the upload.

An uploaded file is still private and status-controlled. If it is pending scan/quarantine, rejected, unavailable or the upload reports an error, read the message, correct the file or connection issue and retry from the same authorized record. Do not create duplicates, alter evidence, upload credentials or unrelated customer data, or submit a company-paid purchase as a personal advance.

The same receipt content cannot be uploaded again, even under another filename. A duplicate is rejected without changing the original; the failed upload is removed. Review the existing expense or contact authorized support instead of renaming or altering the receipt.

### Expense fields and correction

In **Expenses**, use the visible Project, Date, Category, Amount, Currency, Payer, receipt and reason fields. Check that the Payer is the person who actually paid. Save the draft before leaving a partially complete record; submit only after the receipt and factual fields match. When an item is returned, correct the stated issue and resubmit that item. A reimbursement state is not customer billing and an expected reimbursement date is not proof of payment.

## Project documents and attachments

:::figure worker /app/documents Documents are private project artifacts with object-level authorization.

Use **Documents** only for a permitted project artifact. Confirm project, intended audience and access scope before upload or download. The portal checks authorization and file integrity; possession of a link does not grant access. A clean/available status is required before a file can be used where the workflow requires it.

Use report attachments only through the relevant report workflow and permitted attachment kind. If you cannot open a document, it may be outside your project or role scope. Do not ask another worker to download it for you.

## My Pay: own-data privacy and truthful status

:::figure worker /app/pay My Pay is private to the signed-in worker.

**My Pay** shows only your own approved activity, compensation/reimbursement detail and allowed statement artifacts. It is not a customer invoice, tax document or proof of a bank transfer. Never infer a customer rate, internal margin or another person's pay from it.

- **Estimated** is a working calculation.
- **Approved** means authorized review accepted the record or amount.
- **Scheduled** means a payment is planned for the displayed expected date.
- **Finalized** means the compensation record's calculated truth is closed; it does not confirm a transfer.
- **Partially paid** means Finance recorded a real payment smaller than the reviewed settlement and the remaining balance is still due.
- **Paid** requires recorded actual payment evidence for the full balance. A scheduled or finalized item is not proof of payment.

Download only your own ready statement artifact. If an artifact is queued or running, wait for the service. If it failed, use the shown error/support process; you do not run jobs manually. Report a discrepancy through the verified support route with the relevant record reference, never with another person's data.

### Statement, settlement and reimbursement detail

Use the Worker statement controls to choose the available period and request the supported statement artifact for your own record. A ready artifact can be downloaded only through the displayed download control. The statement separates activity, compensation, settlement and reimbursement data. Review the project/period, expected payment date and actual settled/paid date separately. A missing actual date means the portal has not recorded a confirmed payment.

## Profile, Activity Inbox and support

:::figure worker /app/profile Profile controls your own language, availability and optional security settings.

Keep your own skills, availability and language accurate. This does not change project permissions or grant commercial access. Activity Inbox notifications may link to a permitted source record; opening or marking one read is not approval.

### Profile and security procedure

Use Profile to update only your own language, skills and availability. Select **Register passkey** only on a device you control. If you choose **Enable MFA**, complete the setup and select **Verify MFA** with the current authenticator code; store one-time recovery codes privately when shown. Do not register someone else’s device or share codes. These settings do not change your Worker permissions.

Stop and contact verified support when access is denied, an assignment is missing, a record conflicts with factual evidence, an upload fails after the safe retry, or a payment status is unclear. Do not bypass a role, create a duplicate record, run a background job, or use email as the system of record.

## Supplier teams and accounts without financial access

The Owner chooses the supplier coordinator. A supplier account cannot appoint itself or grant finance, administration or approval permissions. An installation is a project in the app. The Owner must authorize each installation and its effective dates before the coordinator can record team work.

For the Owner: open **Suppliers**, add the supplier, select an existing Worker account and save **Supplier coordinator** or **External technician**. Then authorize the installation for the chosen coordinator. Changing the access profile signs that account out; the person must sign in again. Revoking an installation blocks that coordinator on the next request, including their personal time and reports for that installation. Technician assignments and other coordinators’ permissions are managed separately by the Owner.

For the coordinator: open **Supplier team**, select an authorized installation, and use **Add technician**. Enter the technician's name, optional email and assignment dates. This creates a personnel record without login credentials or an invitation email. Use **Assign existing technician** for someone already in your supplier team. Ask the Owner to configure any existing account that needs to sign in.

In **Record team hours**, select the technician and enter the real work date, category, minutes and work description. Save the draft, check it and select **Submit to J&A**. The named technician is the subject of the hours; the coordinator remains the recorded actor. J&A approves the hours through the normal review workflow. A supplier cannot approve its team's hours. Returned **needs_changes** hours use **Create correction draft**; edit and submit the replacement while the original remains in history. Rejected work requires a new draft.

Use **Operational report** to filter by installation and dates, read approval states, download CSV, or print/save a PDF in the browser. History remains visible; rejected, void and superseded records do not increase the effective total. This report does not certify payment or customer acceptance.

An External technician sees only their own operational hours and reports. Supplier coordinator and External technician accounts have no My Pay, rates, expenses, financial documents or financial exports. The compensation and expense procedures elsewhere in this guide apply to standard Worker accounts. Supplier reports never include money. Contact the Owner when your installation or technician is missing; do not record work against a substitute person or project.

:::figure worker /app/supplier The supplier coordinator adds technicians and records team hours.

:::figure worker /app/supplier/report Operational reports show work and approval state without money.
