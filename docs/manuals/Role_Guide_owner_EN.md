# Owner administrator: current project-to-invoice guide

**Deployed edition, 24 September 2026.** Use the [full current guide](Current_Deployed_Workflows_2026-09-24.md) and [role-flow diagram](Role_Workflows.pdf). The screenshots below come from the *Finance test account* on the deployed release because this documentation capture did not use the canonical Owner account; the Owner sequence is a workflow description, not a claim that Owner actions were replayed during capture.

1. In **Projects**, establish the client and create the project with a **required cost center**. Alias, budget and planned end may be omitted. Check project number, currency and timezone after saving.
2. In the project **Team** tab, assign workers with effective dates and expertise. Add a project-specific chief/crew delegation if one supervisor must enter actual hours or expenses for several people. Confirm the lead can see only the delegated crew.
3. In the project **Billing** tab, choose a saved template or configure from scratch. Decide one invoice with labor and expense sections or two invoices. Review each person's customer charge, worker pay and expense reimbursement/recovery independently; a template does not replace that review.
4. Establish a valid issuing legal entity, tax profile and genuine accountant-approved numbering policy. The deployed Finance test account's visible **New legal entity** form returned HTTP 403, so use the Owner-authorized setup path and verify the save. Do not enter a fabricated approval date.
5. Have workers or delegated chiefs record factual activity, then review time, expenses and reports. The plan is not actual time. Approvals are not customer sign-off.
6. Finance reviews the calculation and creates a draft from approved source rows. Review the document, approve, issue and send through the authorized lifecycle. Record payment only against real evidence. Issued history is corrected with void/credit/replacement, not by editing it.

![QA project overview captured with a Finance test account; zero actual hours and a required cost center are visible.](assets/deployed-2026-09-24/qa-project-finance-overview.png)

![Project-local billing arrangement captured with a Finance test account.](assets/deployed-2026-09-24/qa-project-invoice-arrangement.png)

The clean QA project had no worker activity or invoice at capture. Live issue, mail delivery, payment and physical Safari were not proven by these screenshots. The [capture manifest](assets/deployed-2026-09-24/capture-manifest.json) identifies the deployed artifact and browser context.
