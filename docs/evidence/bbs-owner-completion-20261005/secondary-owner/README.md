# Supplemental Owner browser QA packet

This packet records bounded browser observations from the isolated Owner training runtime at `http://127.0.0.1:5179/j-aautomation/app`. The browser used the private Owner cookie profile and the copied training database at `/home/kripta/bbs-manual-demo-20261005-side/owner-training-runtime/training.sqlite`. No production write was made. Only clearly fictional `BBS LAB` planning, skill, and availability records were changed. The browser context is closed.

## Actions and verified outcomes

At desktop width 1440, Planning was opened, then narrowed to the fictional `C-0050-P-20261006 — BBS · Owner onboarding lab` project and its fictional `BBS LAB · New technician` worker. The page identifies displayed planning times as UTC and explains that planning does not create actual hours.

I created the fictional expertise `BBS LAB Instrumentation QA` (code `BBSLAB-QA-20261005`) and assigned it to that lab worker at proficiency 3/5. The rendered skill matrix showed the saved association. I then published a planning assignment for 2026-10-06, 09:00–11:00 UTC (120 planned minutes) at `BBS LAB training bench`, with the new expertise required. I edited that same assignment to 10:00–12:00 UTC and changed the site to `BBS LAB training bench updated`; the duration remained 120 minutes. I then cancelled the assignment. The calendar showed no event for the selected day and the schedule count returned to zero.

After closing the browser, read-only queries against the isolated training database verified one matching planning row with status `cancelled`, zero actual time entries for the fictional worker on 2026-10-06, and one `tentative` availability row for 2026-10-06 with the final note `BBS LAB QA availability modified`. These checks were limited to the named lab worker, date, and training records; no identifiers or broad record dumps are included here. This confirms that publishing, editing, and cancelling the plan left actual hours unchanged.

In the fictional worker's Profile/availability section I added a 2026-10-06 12:00–15:00 UTC `Tentative` availability window with note `BBS LAB QA availability validation`, then edited its note to `BBS LAB QA availability modified`. The saved calendar/table view reflected the tentative window and edited note. No copied worker availability was changed.

The Audit page was opened after these actions and read without using any mutation controls. Its rows displayed the action labels `skill.create`, `worker skill.set`, `planning.create`, `planning.update`, `planning.cancel`, `worker availability.create`, and `worker availability.update`. A separate narrow, read-only audit query confirmed the skill creation and planning create/update/cancel entries; it did not independently match the availability audit entries by project/worker key, so those two labels are recorded as browser observations only. No event was edited or removed.

Help rendered its `Help and field guides` page. The role-assigned guide catalog was visible, including the Owner/Finance material; guide languages shown were EN, ES, and PT-BR. Profile rendered `Profile and security`; I inspected the page for my own Owner session but did not change language, preferences, passkeys, MFA, recovery codes, or session controls. Notifications rendered its inbox and showed 50 total / 49 unread. I did not open a notification or mark one read. Inbox read/unread status is not evidence of business approval.

The Help, Audit, Profile, and Notifications captures are deliberately scoped to their page headings. They document route rendering, not every row or control. The audit action-label list above is a session observation; no row-level audit screenshot is retained. Planning and availability captures show only the fictional lab workflow. The 390-pixel phone captures were scoped to those same lab records. At 390 pixels, the assignment card sat below the sticky bottom navigation in the initial calendar frame; after scrolling to the agenda, its label and time were readable. I did not observe a confirmed responsive defect.

## Reference and limits

The Owner manual was read at `docs/manuals/Owner_User_Guide.md`: language selection (line 22), Help and Activity Inbox (lines 38–51), project/worker/assignment context (lines 53–59), Planning and availability (lines 85–87), document handling and scan status (line 115), and Audit/Profile procedure (lines 199–205). Existing baseline status was also checked in `docs/evidence/bbs-owner-completion-20261005/owner/workflow-matrix.md` (line 25 and line 26 marked the broader areas NOT RUN before this supplemental packet). Those instructions are reference procedures; only the actions and outcomes described above were browser-tested here.

Documents upload, audience selection, finding a document, private download, lifecycle closure/archive, supplier setup, account-role/status transitions, and account-security changes were **NOT RUN in this packet**. No document was uploaded and no notification email was sent. Other workers own separate bounded checks for the lifecycle, supplier, and account flows. The copied browser helper had no file-upload action, and this packet was closed before any Documents phase; there is no upload result to infer. Refer to the separate editorial reference at `docs/evidence/bbs-owner-completion-20261005/editorial/cost-model-and-reference-procedures.md` for source-read document and cost procedures.

## Captures

`capture-manifest.json` lists each retained PNG with its SHA-256 and byte size. Screenshots with an account identity or broader copied data in frame were removed from this packet. The retained images are supplementary evidence, not product screenshots for publication.
