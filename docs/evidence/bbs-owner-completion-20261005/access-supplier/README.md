# Owner supplier, access and project lifecycle QA

This packet records UI workflows against the isolated training clone at `127.0.0.1:5179`. All created records use the `BBS LAB` prefix and fictional `.invalid` email addresses. No production system was used. The helper reads the private cookie jar outside the repository; passwords were random local-only values and were never saved or reported.

## Supplier setup and authorization

In **Suppliers → Setup and access**, I created supplier **BBS LAB · Access supplier QA** with fictional contact details. The page reported **Changes saved**. A second fictional local account, **BBS LAB Supplier Coordinator QA**, was created because the authorization form requires a coordinator selected from the supplier's eligible users.

In **Suppliers → Authorize installation**, I selected that supplier, project **BBS LAB Access Supplier QA** (`C-0050-P-050901`), and coordinator **BBS LAB Supplier Coordinator QA**; set **Starts on** to `2026-10-06`; left **Ends on** blank. The form passed browser validity checks, reported **Changes saved**, and the authorization row showed **Active**.

In **Suppliers → Personnel → Assign existing technician**, I selected **BBS LAB Supplier Technician QA**, the same project, and **Starts on** `2026-10-06`, with **Ends on** blank. The form passed browser validity checks, reported **Changes saved**, and displayed the assignment as **Future**. The project then showed two assigned team members, `0.00h`, zero reports, and `USD 0.00` contribution.

## Account roles, profiles and access removal

The technician account was created in **Projects → Team access → Create user access** with a fictional email and local random password. Its base team **Role** was `Worker`; its access **profile** was `External technician`, with the BBS LAB supplier selected. These are separate controls. I changed base role `Worker → Project Manager → Worker`, verifying each saved value. The access-profile editor was not available while the base role was Project Manager. Back on Worker, I changed profile `External technician → Supplier coordinator → External technician`; both saves retained the supplier link.

After assignment cleanup and supplier authorization revocation, **Remove access** on the technician's Team row displayed a browser confirmation with exact text **“Remove this team member access?”**. I accepted it. The active filtered Team view dropped from one matching technician to zero. This test confirms removal from active access; it does not claim hard deletion of the account or its retained project history.

## Assignment cleanup and authorization revocation

Both assignments were future-dated and had no work or financial rows. **Remove Assignment** stated that removal ends the assignment and preserves its historical row; future assignments will be cancelled before they start. The assignment end-date control was disabled because its `min` was `2026-10-06` and `max` was `2026-10-05`, so I used the UI cancellation control rather than bypassing it. I supplied reason `BBS LAB QA cleanup before closeout; no work or financial records.` for each fictional assignment. The UI then reported **No active assignments to remove**.

On the supplier authorization row, **Revoke access** reported **Changes saved** and retained the row with status **Revoked**. Project assignment history remains preserved; the packet does not represent it as deleted.

## Empty project close, archive and restore affordance

The new project was created for client **BBS DEMO - Manual**, cost center `CP050901`, start date `2026-10-06`, timezone `America/New_York`, with description `Fictional empty project for isolated access QA; no work or financial records.` It had no rates, billing terms, reports, work, expenses or invoices. After the future assignments were cancelled, its detail view showed `0.00h`, zero current assignments, zero reports and `USD 0.00` contribution.

The project detail link **Project closeout** opened the package/document closeout flow, where **Prepare closeout draft** is a package action. It is separate from project status. On the Projects row's **Actions** disclosure, the status warning said new assignments are unavailable while a project is **Closing** or **Closed** and directed the Owner to **Review project status** and **Review assignments** before changing status.

With the row's required **Reason** field set to `BBS LAB QA: empty project; no work.`, **Begin close** saved successfully. The status filter **Closing** then showed exactly this project as **Closing**. With **Reason** `BBS LAB QA: close empty project; no work.`, **Close project** saved successfully; the **Closed** filter then showed this project as **Closed**. With **Reason** `BBS LAB QA.`, **Archive project** saved successfully. The project disappeared from the default non-archived list. **Include archived projects** plus Status **Archived** showed this same project as **Archived**. Its Actions menu exposed **Restore project**, so the archived record has a UI restore path; I left it archived to preserve the tested final state.

The source chapter [`owner-operating-chapters.py`](../../../../scripts/bbs-owner-manual/owner-operating-chapters.py#L186) instructs Owners to review schedules, assignment dates, status and open work before closing or archiving; verify source corrections, required reports/sign-off, invoice/receivable position, compensation and expense obligations; and notes that archiving is not payment. Those checks were satisfied for this deliberately empty fixture only. This packet did not test late-work entry, reopening a Closed project, or payment/period closure. Do not infer those behaviors from the archive Restore control.

## Evidence and verification

Screenshots are scoped to the fictional forms, profile, assignment and lifecycle controls. `04-access-profile-phone-390.png` is the 390 px responsive profile capture. Project transition outcomes were read from the project list after selecting the matching **Closing**, **Closed** and **Archived** status filters. The final Archived row offered **Restore project**; that action was observed but not submitted.

The final runtime checks reported no page errors, console errors or HTTP responses at or above 400. The three project transitions used the visible `Begin close`, `Close project` and `Archive project` forms; each completed with the expected filtered state. No source, product, test or manual files were changed for this packet.

Key captures: `01` supplier form; `02` technician-account form; `03–04` profile desktop/390 px; `06–08` supplier authorization, coordinator and personnel forms; `11–13` close controls and reasons; `14` archive option; `15` archive reason; `16` archived-row restore affordance. The broad screenshot accidentally taken while inspecting another project was deleted and is not part of this packet.
