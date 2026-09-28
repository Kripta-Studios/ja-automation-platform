# Production supplier-role browser audit — 2026-09-26

This pass used isolated headless Chromium sessions against the deployed portal, with the test credentials already documented in `docs/manuals/Portal_Test_Accounts.private.md`. It visited each available role at 1440 × 900 and 390 × 844. The redacted [survey](survey-redacted.json) records HTTP status, heading, visible form operations, and page error types. It contains no credentials, cookies, request bodies, record identifiers, or screenshots of private data. No business POST or record mutation was made.

| Account                     | Login                                              | Supplier page at both widths   | Current actionable forms                                                                                                                                                         |
| --------------------------- | -------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy Supplier Coordinator | Succeeded; landed on Supplier team                 | HTTP 200, “My supplier team”   | GET filters only. The Personnel, Record team hours, and Operational report tabs appear, but no create, assignment, or batch form is rendered without an authorized installation. |
| Legacy External Technician  | Succeeded; landed on Time                          | HTTP 200, “Operational report” | GET filters only. No supplier POST form is rendered. Time and Reports also returned HTTP 200 but had no assigned installation to submit against.                                 |
| Recommended Worker 8        | Production rate limit after the two sign-ins above | Not visited                    | No further sign-in attempts were made.                                                                                                                                           |

The supplier account guide says the supplier catalog, profiles, and project grants were cleared. The deployed browser behavior is consistent with this: the two legacy accounts authenticate but cannot reach a supplier creation or grant form. The current source restricts **Add supplier**, **Save account access**, and **Authorize installation** to Owner (`apps/portal/src/routes/app/supplier/+page.svelte`). The private account guide deliberately excludes the canonical Owner login. This is an access prerequisite, not a failure that either supplier role can repair itself.

## Owner bootstrap needed for an end-to-end pass

Using the normal Owner browser UI and a clearly `QA-20260926-` prefixed set of records, without modifying the existing BBS projects or IMPC client:

1. Create a new reversible QA client and an operational QA project, if no dedicated QA project exists. Keep it separate from existing customer work.
2. In **Suppliers and technicians → Setup**, create a QA supplier.
3. Link the legacy coordinator account to that supplier with the **Supplier coordinator** access profile. Link the legacy technician account to the same supplier as **External technician**. Do not create or alter mailbox identities.
4. In **Authorize installation**, grant the QA project to the coordinator for a current, bounded date interval.
5. In **Personnel**, create a QA technician or assign the existing test technician to the QA project for the applicable dates. The coordinator can then exercise personnel, team-hour draft, batch submit, and operational report paths. The technician can exercise their own time, expense, and report drafts only when their own assignment is effective.
6. Revisit the same browser cases at 390 and 1440 px: successful draft save, invalid field, duplicate/overlap, stale or revoked grant after opening the form, role denial, retry, retained values/focus/tab/scroll, visible code/remedy, network response, and console. Do not approve hours or alter existing records merely to manufacture an error; use QA records and normal reversal paths.

The current supplier empty state says “No authorized installations or records for this selection.” That wording is visible in current source; this pass did not capture the deployed body copy. It does not tell the coordinator or technician to request an Owner grant. That is a candidate for the warning overhaul after a later live check.

## Initial-pass coverage limit

No supplier success, invalid supplier POST, grant conflict, batch retry, or stale-grant response was exercised because these test accounts have no Owner-created grant. The recommended Worker 8 session was blocked by the live login rate limit, so this pass makes no claim about its page wording. There were no JavaScript page exceptions during the successfully loaded supplier, time, or report pages.

## Follow-up after Owner QA bootstrap

The Owner created an isolated `QA ERROR AUDIT 20260926` supplier and project, linked both legacy accounts to that supplier, granted the coordinator the QA installation, and assigned the external technician to it. A second browser pass used one fresh login for each account, then kept both contexts open for the full flow. The [post-bootstrap case log](post-bootstrap-redacted.json) records response statuses, problem codes, wording, retained inputs, focus, and role scope. The cropped [coordinator phone form](coordinator-team-hours-390-redacted.png) masks technician names; the [technician desktop form](technician-time-1440-redacted.png) masks the project picker. Neither image shows credentials, customer records, or response bodies.

The coordinator successfully created one QA personnel record and a 7.5-hour QA team draft. The technician saved one 1.25-hour QA own time draft. These three records remain as unsubmitted QA data for further testing; no approval, customer billing, payment, or existing business record was touched. An invalid email and an invalid duration were blocked in the browser without POST and retained the entered values. The technician duration error focused the affected field.

Two server-side business conflicts gave specific code/message/remedy pairs:

| Case                                            | Network                                | Visible result                                                                                                                           | Recovery behavior                                                                                                           |
| ----------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Duplicate QA technician assignment              | HTTP 409, `SUPPLIER_ASSIGNMENT_EXISTS` | “Technician assignment already exists” and “Review technician assignments” linking to Personnel                                          | Technician, start date, and tab survived; focus was on `BODY` after the response.                                           |
| Second same-day QA batch totaling over 24 hours | HTTP 400, `SUPPLIER_DAILY_LIMIT`       | “This worker already has time on the selected day. Total time cannot exceed 24 hours. No time entry was saved.” and “Review time drafts” | Technician, summary, and tab survived, but entered `20` hours became empty; focus was on `BODY`. No second batch was saved. |

The latter production wording still says “This worker”; the current candidate source has more specific supplier wording, but it is not deployed. Lost hours and focus are production defects for this error/warning overhaul. The coordinator's direct Finance GET returned HTTP 403 with only “Operational account: access denied,” lacking a permitted next step. The technician's direct supplier setup deep link safely landed on Operational report with no supplier POST forms.

At 390 px for coordinator and 1440 px for technician, the QA project was available and page horizontal overflow was zero. Reloading both active contexts produced zero console errors and zero JavaScript page exceptions. This pass did not test a grant revoked while a form was open, every supplier action, or Worker 8 after its earlier login rate limit.
