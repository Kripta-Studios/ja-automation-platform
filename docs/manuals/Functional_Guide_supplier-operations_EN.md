# Supplier operations functional guide

## Start here: choose your role

This guide combines the Supplier Coordinator and External Technician paths. Both work only inside an Owner-granted supplier installation. Follow the path that matches your account; knowing a procedure does not grant permission to use it.

- [Shared installation scope, session and navigation](#shared-installation-scope-session-and-navigation)
- [Supplier Coordinator: manage people and team hours](#supplier-coordinator-manage-people-and-team-hours)
- [External Technician: record your own work](#external-technician-record-your-own-work)
- [UTC availability and planning states](#utc-availability-and-planning-states)
- [Operational reports and evidence](#operational-reports-and-evidence)
- [History, feedback and support](#history-feedback-and-support)
- [Permissions matrix](#permissions-matrix)

Access — Consult: Supplier Coordinator and External Technician only in their active supplier installation. Create: none in this orientation chapter. Approve: none. Modify: none.

## Public website and workspace navigation

The public website presents J&A services and projects. Select **Employee Portal login** to open the secure application. Choose your language in the header. On a phone, open the menu to see the complete navigation labels.

Inside the application, the light sidebar marks your current section. The account menu contains your profile and sign-out action. Search and the page actions appear beside the page title on desktop and stack on smaller screens. Only the sections authorized for your account are available. Status labels retain their meaning: a pending item is not approved or ready to download.

Secondary panels open when you select their heading and chevron. Time, Expenses and Reports keep search, project and status visible; expand the filter panel for additional criteria. Active secondary filters reopen the panel. Collapsing a panel keeps entered values. Team assignment lists and completed approval history open separately, while pending actions and warnings remain visible. In Finance configuration, choose one commercial policy from the task selector. In Projects, use More actions for client and assignment maintenance. Open the document-registration or Accounting Pack panel when you need to create an item.

Open a project, worker or client selector to search inside its dropdown. Type part of a name or identifier; matching ignores case and accents. Use the arrow keys and Enter to select, or Escape to close without changing the value. Active register filters appear in a compact summary even when additional filters are collapsed. **Clear filters** restores the unfiltered view. Reports use one set of search, status and sort controls for the selected tab.

Use **Go to section** in the header, or **Ctrl/⌘ K**, to find a destination available to your profile. Type part of its name, use the arrow keys and Enter, or Escape to return to your previous position. This searches section names; the workspace search still finds records.

In Time, Expenses and Reports, **Today**, **This week**, **This month** and **Last month** set date filters using your browser's local calendar. Weeks run Monday to Sunday. The other filters stay selected. Select the × on one active filter to remove only that criterion; **Clear filters** removes all criteria. In the weekly timesheet, **Previous week**, **This week** and **Next week** change the displayed week and the register dates together, retaining project, category and status filters.

<!-- screenshot:supplier-coordinator:section-navigator -->

<!-- screenshot:supplier-coordinator:public-home -->
<!-- screenshot:external-technician:register-filters -->

## Shared installation scope, session and navigation

Access — Consult: each supplier profile sees only its effective installation grant and permitted operational records. Create: the coordinator creates team records and team-hour drafts; the technician creates their own records. Approve: Owner reviews supplier-origin time and authorizes grants. Modify: the record author edits drafts or follows the correction workflow; neither supplier profile changes the grant.

Use your own invited account. The Owner links a supplier profile to an installation, which appears as a project, with effective dates. **Supplier team**, **Time**, **Expenses**, **Reports**, **Operational report** and **Profile** are shown only where the profile is allowed to use them. Supplier profiles do not receive **My Pay**, worker statements, compensation, customer rates, margins, finance, billing, accounting or approval authority.

Open **Help** for the guide assigned to your account. Use **Profile** for your own language and optional security settings. Sign out on a shared device and never share credentials, sessions or recovery codes. A link or exported operational row does not widen access to a project or customer document.

An installation grant can be revoked or expire. If the installation disappears, reload once and check the displayed assignment. Do not choose another project or technician as a workaround; ask the Owner or coordinator to confirm the effective grant with only the relevant reference.

<!-- screenshot:supplier-coordinator:home -->
<!-- screenshot:external-technician:home -->
<!-- screenshot:supplier-coordinator:help -->
<!-- screenshot:external-technician:help -->

## Supplier Coordinator: manage people and team hours

Access — Consult: Supplier Coordinator sees authorized installations, its own supplier team and operational records in that scope. Create: Supplier Coordinator may create personnel records and separate team-hour drafts. Approve: Supplier Coordinator cannot authorize installations, grant login access or approve hours. Modify: Supplier Coordinator may edit its own drafts or create correction drafts; the Owner changes access and reviews supplier-origin time.

In **Supplier team**, select the authorized installation and choose **Add technician**. Enter the technician’s real name, optional email and assignment dates. This creates a personnel record, not login credentials. Use **Assign existing technician** only for a person already in your supplier team. Check the installation, selected person and effective dates before saving. The Owner configures the login and authorization.

Under **Record team hours**, select one or more technicians. The work date defaults to today in your browser's local timezone and remains editable. Confirm the actual date, category and factual description, then enter start and end using the local clock in the installation project's timezone, without converting to UTC. The end must be later on the same day. An optional break in minutes is subtracted automatically to calculate net duration; leave it blank or zero for no break, and keep it shorter than the interval. Save the selected drafts, inspect every named subject and submit only the selected drafts to J&A. The technician is the subject; the coordinator account remains the recorded actor. A draft is not approved work.

An older duration-only draft keeps its duration and has no assumed clocks. To add known actual times in that editor, choose the start/end interval option under **Duration mode** and complete the interval and break. Use only the permitted draft or correction path; approved history is preserved.

For the `needs_changes` state, choose **Create correction draft**, correct the requested fact and resubmit while the original stays in history. A rejected entry needs a new draft. Do not approve your own team’s hours, submit a substitute technician or attempt finance exports.

<!-- screenshot:supplier-coordinator:supplier-team -->
<!-- screenshot:supplier-coordinator:profile -->
<!-- screenshot:supplier-coordinator:home-phone -->

## External Technician: record your own work

Access — Consult: External Technician sees the own invited profile and records in an authorized installation. Create: External Technician creates own time, expense and report drafts. Approve: no supplier profile approves its own work; Owner reviews supplier-origin operational time. Modify: External Technician edits a draft or uses the returned correction path; approved history is preserved.

In **Time**, choose **Log time** and the permitted installation. The work date defaults to today in your browser's local timezone; change it to the actual work date when necessary. Enter the category, factual description, **Start time** and **End time** using the local clock in the project's timezone, without converting to UTC. The end must be later on the same day. Enter an optional **Break (minutes)**, or leave it blank or zero for no break. The portal calculates net duration as end minus start minus break; the break must be shorter than the interval. For example, 08:15–16:15 with a 60-minute break records 7 hours. Older entries may contain only a duration. Their clocks remain empty until you choose **Add start and end times** in an editable draft or authorized correction and enter the actual times. Do not infer them from a planned shift or the duration. **Save draft** keeps an unfinished record; **Submit** sends it to J&A review. A planned date is not actual work. If an item is returned, read the reason and correct that record; do not duplicate or alter approved history.

In **Expenses**, enter the actual payer, amount, currency, date and work reason. Attach a readable permitted receipt and keep the original until the portal confirms storage. In **Reports**, use **Daily** for factual work, blockers and next steps, or **Technical / PLC** for the problem, diagnosis, change, validation and evidence. Do not state that a test passed when it did not. Internal review is not customer acceptance, payment or permission to disclose a file.

<!-- screenshot:external-technician:time -->
<!-- screenshot:external-technician:profile -->
<!-- screenshot:external-technician:home-phone -->

## UTC availability and planning states

Access — Consult: Supplier Coordinator and External Technician may consult their own permitted availability; the Owner or project team may consult authorized planning context. Create: each supplier user may add an availability window only when the calendar is shown for that account. Approve: no availability entry approves work or grants access. Modify: the owner of the permitted window edits it after a normal save or stale-version reload.

If **Profile** shows an **Availability calendar**, use previous/next month or **Today**. Select a day to open **Add availability**, or select an agenda window to open **Edit availability**. Choose Available, Unavailable or Tentative, enter the UTC start and end and add a factual note. The calendar shows up to the latest 200 windows. Save and reopen to verify the result; reload after an optimistic-version conflict.

Availability is planning information. It is not actual time, an installation grant, an approval or a compensation rule. A coordinator cannot make a technician authorized by adding availability, and a technician cannot make a new installation appear by editing a calendar.

UTC applies to these availability windows and planning shifts, not the actual work clocks entered above. Newly generated period reports for authorized reviewers show recorded start/end times alongside net hours and breaks in their web views and PDFs. Duration-only entries have no inferred clocks, and previously issued reports remain unchanged. This does not grant supplier profiles access to private worker statements.

## Operational reports and evidence

Access — Consult: Supplier Coordinator may consult the **Operational report** for authorized installations and dates; External Technician consults only operational views permitted by the account. Create: the coordinator submits team-hour drafts and operational records; the technician submits own records and reports. Approve: Owner reviews supplier-origin time; expenses and reports follow their authorized operational reviewer. Modify: correction drafts preserve the original; report filters and browser print/export do not alter source records.

In **Operational report**, filter by installation and dates, inspect approval states, and use CSV export or the browser’s print/save-PDF action where the profile permits it. Rejected, void and superseded entries do not increase effective totals. The operational report contains no money and proves neither customer acceptance nor payment. Keep the actual receipt and evidence until storage and review are confirmed.

## History, feedback and support

Access — Consult: both supplier profiles may consult their permitted status, feedback and record history. Create: the record author creates a correction draft or sends a support report with the source reference. Approve: Owner reviews supplier-origin hours and controls installation grants. Modify: only a draft or explicit correction path; approved records and their evidence are retained.

Use the displayed status and reason as actionable feedback. Record the installation, technician subject, actual date, identifier and exact correction requested. For a stale edit, reload and compare. For a missing person, grant, receipt or report, ask the Owner with the displayed reference. Do not backdate work, approve your own submission, use another technician’s identifier or bypass a denied document.

Use **Help** and the verified support route at **admin@j-aautomation.com** for persistent access, upload or status problems. Include the factual error and record reference, and do not send passwords, recovery codes or unrelated customer documents. The portal’s append-only history remains the source of record.

## Permissions matrix

Access — Consult: the account’s effective installation and permitted operational rows only. Create: the role-specific drafts below. Approve: Owner only for supplier-origin time; expenses and reports follow their authorized operational reviewer. Modify: drafts and explicit correction paths only; installation grants remain with the Owner.

- **Supplier Coordinator:** consult authorized installations, supplier team and operational report; create personnel records and team-hour drafts; approve nothing; modify own drafts through correction; no compensation, finance, billing, rates, margins or approval authority.
- **External Technician:** consult own profile and permitted installation records; create own time, expenses and reports; approve nothing; modify own draft or returned correction; no supplier team management, compensation, finance, billing or administrative export authority.
- **Owner:** consults supplier records and authorizes the supplier, coordinator, technicians and installation dates; creates or modifies the grants and performs supplier-origin review. That Owner authority is not inherited by supplier users.

Knowing how to submit or inspect a record does not authorize another installation, technician, financial view or approval action.
