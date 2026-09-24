# Portal test accounts — public test credentials

URL: https://j-aautomation.com/j-aautomation/app/login

Published in the public GitHub repository at the owner's explicit request on 2026-09-24. These are live production portal test credentials, not mailbox passwords. The canonical real owner account is deliberately excluded. Access through these accounts is limited by each role's permissions; use them only for authorized testing.

## Recommended role test accounts

For every account in this section, the portal password is exactly the part of its email before `@`. They were created with **Create user access → Set email and password** in the deployed owner Team screen. The three administrative test accounts were created on 2026-09-24 after the clean-slate cutover. The worker accounts were preserved through that cutover.

| Access role | Email | Portal password | Effective access |
|---|---|---|---|
| Finance Administrator | finance-admin-test@j-aautomation.com | finance-admin-test | Finance Overview, commercial configuration, billing drafts and authorized finance reports. Cannot administer owner-only accounts. |
| Project Manager | project-manager-test@j-aautomation.com | project-manager-test | Project and operational review screens within assigned scope. Needs a project assignment before testing scoped edits. |
| Read-only Auditor | auditor-readonly-test@j-aautomation.com | auditor-readonly-test | Read-only Finance, Projects and Audit views. Cannot change records or open owner-only management. |
| Worker 1 | worker1-test@j-aautomation.com | worker1-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 2 | worker2-test@j-aautomation.com | worker2-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 3 | worker3-test@j-aautomation.com | worker3-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 4 | worker4-test@j-aautomation.com | worker4-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 5 | worker5-test@j-aautomation.com | worker5-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 6 | worker6-test@j-aautomation.com | worker6-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 7 | worker7-test@j-aautomation.com | worker7-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |
| Worker 8 | worker8-test@j-aautomation.com | worker8-test | Own time, expenses, reports and pay only when assigned. No current project membership after clean-slate cleanup. |

All recommended accounts are active portal `credential` accounts without a `mail_identity` row. Creating them did not enqueue a portal email. The owner can grant project membership and scope in Projects/Team; a base role alone does not confer access to a specific project.

## Existing legacy demo logins

These older portal-only accounts were preserved as users, but their passwords **do not** follow the email-local-part convention. Prefer the recommended accounts above for role testing. Their credentials remain listed for backward compatibility:

| Legacy role | Email | Existing portal password | Historical purpose |
|---|---|---|---|
| Finance Administrator | finance-test@j-aautomation.com | Demo!Finance2026 | Finance and billing configuration, invoice drafts and finance reports. No owner-only account administration. |
| Project Manager | manager-test@j-aautomation.com | Demo!Manager2026 | Assigned project work, schedules, team operations and approved delegated entries within project scope. |
| Worker | worker-test@j-aautomation.com | Demo!Worker2026 | Own assignments, time, expenses and operational reports only. |
| Read-only Auditor | auditor-test@j-aautomation.com | Demo!Auditor2026 | Read-only audit and reporting access; cannot edit business records. |
| Supplier Coordinator | supplier-test@j-aautomation.com | Demo!Supplier2026 | Delegated supplier installation team: personnel and technician time for granted projects; no financial rates or worker pay. |
| External Technician | technician-test@j-aautomation.com | Demo!Technician2026 | Own supplier time and operational reports for assigned installations. |

The legacy Supplier Coordinator and External Technician rows are only base worker logins after clean-slate cleanup: the supplier catalog, supplier profiles and supplier project grants are empty. To exercise those workflows, the owner must first create a supplier, assign each operational access type to it, and grant the relevant project. Their old supplier permissions should not be assumed to work. The older finance, manager and worker logins likewise need new project assignments for scoped workflows.

## Crew-chief test access

A crew chief is a worker account with an owner-granted, dated delegation for specific people on a specific project. After clean-slate cleanup there are no crew-chief grants or project memberships. To test: create a new project, assign the designated workers, then as owner open **Crew hours** and grant the chief authority for each worker. The chief can enter individual or shared hours and linked expenses for those delegated people, without access to their compensation or self-approval. Revoke test grants when finished.

## Safe test sequence

Use clearly named, reversible test clients/projects and the normal owner UI. For finance, create draft invoices only; do not issue, send or record a payment for a test invoice. Preserve the two BBS example projects and IMPC client. Do not change mailbox provisioning, mail passwords or mail service configuration.

Browser verification on 2026-09-24: the new finance, project-manager and auditor credentials, plus Worker 1, all signed in at the deployed origin at 390px. Their permitted routes returned HTTP 200; finance/auditor owner-only management, project-manager commercial finance and worker commercial finance returned HTTP 403. Mail identity and mailbox-command counts and row digests were identical before and after account creation; `outbox_event` remained empty.
