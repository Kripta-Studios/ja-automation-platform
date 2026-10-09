Current status (2026-10-09): the findings below describe the initial audit, not current
unresolved defects. The final compiled app passed both complete-journey browser tests in 3.6 minutes;
the additional delayed-readiness case passed its meaningful SPA run in 6.3 seconds.
Dashboard creation and the complete actual project → invoice → PDF journey passed at
360, 390, 768 and 1440px. Every width issued an exact $299 invoice with a verified real
PDF; 360px additionally saved disjoint $50/$75 drafts in the same period. Assertions
found no unexpected console/page errors, UI401/500 responses or failed artifact jobs.
The existing five-file acceptance suite is reported in browser-validation.md. Raw traces
and snapshots remain private under /tmp/journey-audit and are excluded from repository
evidence. See final-browser-summary.json and final-\*.png for redacted current evidence.

# Project → invoice initial browser audit

2026-10-09 Europe/Madrid. App source HEAD 05301c381ce8afcaf8466a829e21425535aa58d4. Production inspected read-only with the existing authenticated Owner browser at https://j-aautomation.com/j-aautomation/app. Mutations used the compiled actual app on 127.0.0.1:4174 with disposable E2E users/client/database. One browser instance at a time; MCP browser was closed before local Chromium. No production business data was changed.

## Observed journey

Owner created **Journey Audit minimal** with only client, name and cost-center code. Optional start date remained blank; persisted project schedule starts 2026-10-08. Assigned Alex Rivera through UI with USD20 internal hourly cost and USD18 worker pay. Set customer labor USD50/h via Commercial Configuration. Recorded actual6h for Oct8, saved draft, submitted it and approved including financial review. Project displayed actual6h, one person and USD180 contribution. Configured combined invoice arrangement, monthly cadence, zero-tax profile, and person expense policy. No rows were injected into the audited project's time/expense/assignment/finance journey by SQL or domain APIs.

## Findings

1. **Dashboard entry does not open creation.** Production `New project` targets `/projects#new-project`; it loads the global directory, requiring another `New Project` click. The form requires only client/name/cost center beyond populated defaults, but displays all four sections and many optional fields simultaneously.
2. **Creation continues on the global directory.** Success offers People, Commercial terms and Review links while re-rendering an empty complete creation form. Clicking `Assign workers by expertise` changes the URL to `action=assign-worker&project=<id>` but leaves the creation form displayed. Reloading that URL opens assignment. Hypothesis: native action form state takes precedence over SPA URL action. A project workspace landing would remove this dead end.
3. **Assignment date recovery lacks the date boundary.** Entering Oct1 after blank-start creation returns `The assignment start must fall within the project dates. Review the project dates or choose another start.` Assignment form shows neither project date boundaries nor a direct link to edit those dates. Inputs are retained. After changing start to Oct8, Assign remained disabled until the form was reloaded; fresh Oct8 submission worked. Screenshot of validation and retained fields: private initial snapshots 6 and 7. Actual saved schedule visible in `015-goto.png`.
4. **Configuration spreads across multiple destinations.** Assignment configures internal cost/pay; customer sale rate lives in global Commercial Configuration, which shows eleven task options including both `Client labor rates` and `Client labor rate`. Project Billing separately exposes an open project-default form and four-step setup wizard. Wizard makes a person expense policy mandatory even when the project has no expenses. Existing finance choices are shown and retained; actual time remains6h.
5. **Saving billing restarts setup.** Wizard saves stream then returns to Step1. Warnings correctly say `Assign an issuing legal entity revision to this project` and `Approve an invoice numbering policy for the issuer`, but provide one broad `Open finance configuration` link. There is no per-prerequisite guided action. Evidence `039-roleclick.png` and `040-roleclick.png`.
6. **Draft selection lacks source control/preview.** Project's draft sheet contains only billing stream and two dates. No worker/time/expense selection, selected-source count, monetary preview, or pending-source review appears. Default dates are Sep1–Sep30 despite an Oct8-created project with only Oct8 work. Evidence `041-roleclick.png`.
7. **Draft request returned500 with no visible feedback in the sheet.** Entered Oct1–Oct31 and clicked Create draft. Sheet remained unchanged, retaining dates and submit button. Trace proves POST `/projects/<id>?/createInvoiceDraft&tab=billing` returned500 JSON `{"message":"Internal Error"}`; screenshot `045-snapshot.png`. **Harness limitation:** the local server was retained from an interrupted runner after a read-only field stalled the audit; no server exception log was recoverable. This500 must be reproduced in a fresh normally managed fixture before attributing it to application code. Later GET Expenses also returned500 Internal Error, ending the audit.
8. **Required width evidence is partial.** Captured the draft sheet at 360×800,390×844,768×1024 and1440×900 sequentially (`046-resize.png`, `047-resize.png`, `048-resize.png`, `045-snapshot.png`). Labels/actions visibly stack on phone; this is not a comprehensive accessibility/touch-target/layout pass.

## Limits and retained evidence

The attempt to change to Worker did not complete: clicking Sign out did not clear the Owner session; login redirected303 to the authenticated app. The trace contains **no sign-out request**, so a signout400 claim is incorrect. The observed400 is the intentional assignment-date validation response. Role switching, expenses, reports, issuer numbering approval, invoice issue and PDF jobs were not verified. No zero-console-error verdict is made. Assertions captured console errors and5xx responses; final audit runner ended on the Expenses500 page lacking `main`.

The initial trace and raw snapshots are retained privately under /tmp/journey-audit/private-initial-evidence. The checked-in test now covers UI creation, Worker submissions, Owner selection/approval/classification, exact preview/draft/issue and real PDF jobs across four widths. It closes the UI browser before the actual PDF renderer launches and reopens one UI browser afterward. All business commands use visible forms in the disposable E2E fixture. Current results are summarized separately from these historical observations.
