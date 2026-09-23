# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: time-interval.spec.ts >> owner: current local date, clock interval, pause and edit
- Location: tests/e2e/time-interval.spec.ts:9:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('article.time-record').filter({ hasText: 'Clock interval owner phone-360' }).getByRole('button', { name: 'Edit draft', exact: true })
    - locator resolved to <button type="button" class="secondary-button">Edit draft</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <input type="date" required="" name="workDate"/> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="expense-entry-actions time-entry-actions">…</div> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <input type="date" required="" name="workDate"/> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    12 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <input type="date" required="" name="workDate"/> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="expense-entry-actions time-entry-actions">…</div> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <input type="date" required="" name="workDate"/> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <input type="date" required="" name="workDate"/> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <input type="date" required="" name="workDate"/> from <div role="dialog" tabindex="-1" aria-modal="true" data-ui="responsive-sheet" class="responsive-sheet time-entry-sheet" aria-labelledby="responsive-sheet-s3-title" aria-describedby="responsive-sheet-s3-description">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=f3e2]:
  - link "Skip to main content":
    - /url: "#portal-main"
  - generic [ref=f3e3]:
    - button
    - dialog [ref=f3e4]:
      - link [ref=f3e5] [cursor=pointer]:
        - /url: /j-aautomation/app/
      - navigation [ref=f3e7]:
        - link [ref=f3e8] [cursor=pointer]:
          - /url: /j-aautomation/app/
          - generic [ref=f3e12]: Dashboard
        - link [ref=f3e13] [cursor=pointer]:
          - /url: /j-aautomation/app/projects
          - generic [ref=f3e17]: Projects
        - link [ref=f3e18] [cursor=pointer]:
          - /url: /j-aautomation/app/approvals
          - generic [ref=f3e22]: Approvals
        - link [ref=f3e23] [cursor=pointer]:
          - /url: /j-aautomation/app/reports
          - generic [ref=f3e27]: Reports
        - generic [ref=f3e28]: SECONDARY
        - link [ref=f3e29] [cursor=pointer]:
          - /url: /j-aautomation/app/projects?view=clients
          - generic [ref=f3e33]: Clients
        - link [ref=f3e34] [cursor=pointer]:
          - /url: /j-aautomation/app/projects?view=team
          - generic [ref=f3e38]: Team
        - link [ref=f3e39] [cursor=pointer]:
          - /url: /j-aautomation/app/supplier
          - generic [ref=f3e43]: Suppliers
        - link [ref=f3e44] [cursor=pointer]:
          - /url: /j-aautomation/app/time
          - generic [ref=f3e48]: Time
        - link [ref=f3e49] [cursor=pointer]:
          - /url: /j-aautomation/app/expenses
          - generic [ref=f3e53]: Expenses
        - link [ref=f3e54] [cursor=pointer]:
          - /url: /j-aautomation/app/planning
          - generic [ref=f3e58]: Planning
        - link [ref=f3e59] [cursor=pointer]:
          - /url: /j-aautomation/app/documents
          - generic [ref=f3e63]: Documents
        - link [ref=f3e64] [cursor=pointer]:
          - /url: /j-aautomation/app/finance?view=overview
          - generic [ref=f3e68]: Finance Overview
        - link [ref=f3e69] [cursor=pointer]:
          - /url: /j-aautomation/app/finance?view=economic
          - generic [ref=f3e73]: Economic Review
        - link [ref=f3e74] [cursor=pointer]:
          - /url: /j-aautomation/app/billing
          - generic [ref=f3e78]: Billing
        - link [ref=f3e79] [cursor=pointer]:
          - /url: /j-aautomation/app/ledger
          - generic [ref=f3e83]: Collections / Ledger
        - link [ref=f3e84] [cursor=pointer]:
          - /url: /j-aautomation/app/accounting
          - generic [ref=f3e88]: Accounting
        - link [ref=f3e89] [cursor=pointer]:
          - /url: /j-aautomation/app/finance?view=commercial
          - generic [ref=f3e93]: Commercial Configuration
        - link [ref=f3e94] [cursor=pointer]:
          - /url: /j-aautomation/app/profile
          - generic [ref=f3e98]: Profile
      - generic [ref=f3e99]:
        - generic [ref=f3e100]: ADMINISTRATION
        - link [ref=f3e101] [cursor=pointer]:
          - /url: /j-aautomation/app/manage
          - generic [ref=f3e105]: Data management
        - generic [ref=f3e106]: SECURITY
        - link [ref=f3e107] [cursor=pointer]:
          - /url: /j-aautomation/app/audit
          - generic [ref=f3e111]: Audit
      - link [ref=f3e112] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f3e117]: Company Webmail
        - generic [ref=f3e118]: ↗
      - button [ref=f3e119]: Sign out
    - banner [ref=f3e120]:
      - generic [ref=f3e121]:
        - button "Toggle navigation" [ref=f3e122]
        - generic [ref=f3e125]: Online
      - button "Go to section" [ref=f3e127] [cursor=pointer]
      - generic [ref=f3e133]:
        - generic [ref=f3e134]: Language
        - combobox "Language" [ref=f3e135]:
          - option "EN" [selected]
          - option "ES"
          - option "PT-BR"
      - button "Account options" [ref=f3e137] [cursor=pointer]:
        - generic [ref=f3e138]: DO
    - main [ref=f3e139]:
      - generic [ref=f3e140]:
        - generic [ref=f3e141]:
          - paragraph [ref=f3e142]: J&A / Time entries
          - heading "Time entries" [level=1] [ref=f3e143]
        - generic [ref=f3e144]:
          - button "Print report" [ref=f3e145]
          - search [ref=f3e149]:
            - generic [ref=f3e150]: Search workspace
            - combobox "Search workspace" [ref=f3e151]
            - button "Search" [ref=f3e152] [cursor=pointer]
      - generic [ref=f3e153]:
        - generic [ref=f3e155]:
          - paragraph [ref=f3e156]: Worker operations
          - heading "Time" [level=2] [ref=f3e157]
          - paragraph [ref=f3e158]: Record actual operational time. Commercial interpretation is applied from configured project rules.
        - button "Log time" [ref=f3e160] [cursor=pointer]
        - paragraph [ref=f3e161]: Save a draft while details are still changing. Submit time only after the recorded date, duration and activity are accurate; submitted time is reviewed and cannot be silently overwritten.
        - generic "Time attention summary" [ref=f3e162]:
          - link "Actual recorded 225 min Minutes you really recorded." [ref=f3e163] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-11&to=2026-09-11&q=
            - generic [ref=f3e164]: Actual recorded
            - strong [ref=f3e165]: 225 min
            - generic [ref=f3e166]: Minutes you really recorded.
          - link "Needs attention 1 Draft or review state" [ref=f3e167] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&status=attention&from=2026-09-11&to=2026-09-11&q=
            - generic [ref=f3e168]: Needs attention
            - strong [ref=f3e169]: "1"
            - generic [ref=f3e170]: Draft or review state
          - link "Approved 0 Rows approved by the workflow" [ref=f3e171] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&status=approved&from=2026-09-11&to=2026-09-11&q=
            - generic [ref=f3e172]: Approved
            - strong [ref=f3e173]: "0"
            - generic [ref=f3e174]: Rows approved by the workflow
        - region [ref=f3e175]:
          - generic [ref=f3e176]:
            - generic [ref=f3e177]:
              - text: WEEKLY TIMESHEET
              - heading "Actual time, one week at a glance" [level=2] [ref=f3e178]
              - paragraph [ref=f3e179]: 2026-09-21 → 2026-09-27. Planning target only; it never creates time.
            - generic [ref=f3e180]:
              - generic [ref=f3e181]:
                - text: Week of
                - textbox "Week of" [ref=f3e182]: 2026-09-21
              - button "Open week" [ref=f3e183] [cursor=pointer]
          - navigation "Week of" [ref=f3e184]:
            - link "← Previous week" [ref=f3e185] [cursor=pointer]:
              - /url: /j-aautomation/app/time?from=2026-09-14&to=2026-09-20&week=2026-09-14
            - link "This week" [ref=f3e186] [cursor=pointer]:
              - /url: /j-aautomation/app/time?from=2026-09-21&to=2026-09-27&week=2026-09-21
            - link "Next week →" [ref=f3e187] [cursor=pointer]:
              - /url: /j-aautomation/app/time?from=2026-09-28&to=2026-10-04&week=2026-09-28
          - generic "How to read this timesheet" [ref=f3e188]:
            - generic [ref=f3e189]:
              - strong [ref=f3e190]: Actual
              - generic [ref=f3e191]: Minutes you really recorded.
            - generic [ref=f3e192]:
              - strong [ref=f3e193]: Expected
              - generic [ref=f3e194]: Planning target only; it never creates time.
            - generic [ref=f3e195]:
              - strong [ref=f3e196]: Difference
              - generic [ref=f3e197]: Actual minus expected for the day.
            - generic [ref=f3e198]:
              - strong [ref=f3e199]: Status
              - generic [ref=f3e200]: Draft, submitted, approved or needs changes.
          - region "Timesheet table" [ref=f3e201]:
            - generic [ref=f3e202]:
              - article [ref=f3e203]:
                - generic "Day" [ref=f3e204]: Mon · 2026-09-21
                - generic "Actual" [ref=f3e207]: 0.0h
                - generic "Expected" [ref=f3e210]: —
                - generic "Difference" [ref=f3e213]: —
                - generic "Categories" [ref=f3e216]: —
                - generic "Status" [ref=f3e219]: —
                - link "Open time entries for Mon 2026-09-21" [ref=f3e222] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-21
                  - text: Open day entries
              - article [ref=f3e223]:
                - generic "Day" [ref=f3e224]: Tue · 2026-09-22
                - generic "Actual" [ref=f3e227]: 0.0h
                - generic "Expected" [ref=f3e230]: —
                - generic "Difference" [ref=f3e233]: —
                - generic "Categories" [ref=f3e236]: —
                - generic "Status" [ref=f3e239]: —
                - link "Open time entries for Tue 2026-09-22" [ref=f3e242] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22
                  - text: Open day entries
              - article [ref=f3e243]:
                - generic "Day" [ref=f3e244]: Wed · 2026-09-23
                - generic "Actual" [ref=f3e247]: 0.0h
                - generic "Expected" [ref=f3e250]: —
                - generic "Difference" [ref=f3e253]: —
                - generic "Categories" [ref=f3e256]: —
                - generic "Status" [ref=f3e259]: —
                - link "Open time entries for Wed 2026-09-23" [ref=f3e262] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-23&to=2026-09-23
                  - text: Open day entries
              - article [ref=f3e263]:
                - generic "Day" [ref=f3e264]: Thu · 2026-09-24
                - generic "Actual" [ref=f3e267]: 0.0h
                - generic "Expected" [ref=f3e270]: —
                - generic "Difference" [ref=f3e273]: —
                - generic "Categories" [ref=f3e276]: —
                - generic "Status" [ref=f3e279]: —
                - link "Open time entries for Thu 2026-09-24" [ref=f3e282] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-24&to=2026-09-24
                  - text: Open day entries
              - article [ref=f3e283]:
                - generic "Day" [ref=f3e284]: Fri · 2026-09-25
                - generic "Actual" [ref=f3e287]: 0.0h
                - generic "Expected" [ref=f3e290]: —
                - generic "Difference" [ref=f3e293]: —
                - generic "Categories" [ref=f3e296]: —
                - generic "Status" [ref=f3e299]: —
                - link "Open time entries for Fri 2026-09-25" [ref=f3e302] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-25&to=2026-09-25
                  - text: Open day entries
              - article [ref=f3e303]:
                - generic "Day" [ref=f3e304]: Sat · 2026-09-26
                - generic "Actual" [ref=f3e307]: 0.0h
                - generic "Expected" [ref=f3e310]: —
                - generic "Difference" [ref=f3e313]: —
                - generic "Categories" [ref=f3e316]: —
                - generic "Status" [ref=f3e319]: —
                - link "Open time entries for Sat 2026-09-26" [ref=f3e322] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-26&to=2026-09-26
                  - text: Open day entries
              - article [ref=f3e323]:
                - generic "Day" [ref=f3e324]: Sun · 2026-09-27
                - generic "Actual" [ref=f3e327]: 0.0h
                - generic "Expected" [ref=f3e330]: —
                - generic "Difference" [ref=f3e333]: —
                - generic "Categories" [ref=f3e336]: —
                - generic "Status" [ref=f3e339]: —
                - link "Open time entries for Sun 2026-09-27" [ref=f3e342] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-27&to=2026-09-27
                  - text: Open day entries
          - group [ref=f3e343]:
            - generic "Copy previous week layout" [ref=f3e344] [cursor=pointer]
        - form "Filter time entries" [ref=f3e345]:
          - generic [ref=f3e346]:
            - generic [ref=f3e347]: Search register
            - searchbox "Search register" [ref=f3e348]
          - generic [ref=f3e349]:
            - generic [ref=f3e350]: Project
            - combobox "Project" [ref=f3e351]:
              - option "All projects" [selected]
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo"
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0002-P-001 — High-Speed Palletizer Commissioning · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
              - option "C-9901-P-01 — Lifecycle Project · phone-360"
              - option "C-9902-P-02 — Lifecycle Project · phone-390"
              - option "C-9903-P-03 — Lifecycle Project · phone-430"
              - option "C-9904-P-04 — Lifecycle Project · tablet-768"
              - option "C-9905-P-05 — Lifecycle Project · tablet-1024"
              - option "C-9906-P-06 — Lifecycle Project · laptop-1280"
              - option "C-9907-P-07 — Lifecycle Project · desktop"
              - option "C-9908-P-08 — Lifecycle Project · wide-1920"
              - option "CP005 — Valiant"
              - option "CP006 — RAM"
              - option "CP007 — Mino Automation"
              - option "CP008 — Ascension"
              - option "CP009 — KHS"
              - option "CP010 — WWC"
              - option "CP011 — InPro"
              - option "CP012 — Niagara"
              - option "CP013 — Forerunner"
              - option "CP014 — Empack"
              - option "CP015 — CAP Automation Gmbh"
              - option "CP016 — Castor Engineering"
              - option "CP017 — Joiner"
              - option "CP018 — Socaps"
              - option "CP019 — Peninsula Recycling"
              - option "CP020 — BBS Mexico"
              - option "CP020-DFW — Junkers DFW"
              - option "CP021 — Bastian Solutions"
              - option "CP022 — Zeppelin Systems"
              - option "CP023 — Oxford"
              - option "CP024 — Damon"
          - generic [ref=f3e352]:
            - generic [ref=f3e353]: Status
            - combobox "Status" [ref=f3e354]:
              - option "All statuses" [selected]
              - option "Needs attention"
              - option "Draft"
              - option "Submitted"
              - option "Approved"
              - option "Needs changes"
          - region [ref=f3e355]:
            - group [ref=f3e356]:
              - 'generic "Filter time entries Active filters: 2" [ref=f3e357] [cursor=pointer]':
                - generic [ref=f3e358]:
                  - heading "Filter time entries" [level=2] [ref=f3e359]
                  - generic [ref=f3e360]: "Active filters: 2"
              - generic [ref=f3e364]:
                - generic [ref=f3e365]:
                  - generic [ref=f3e366]: Worker
                  - combobox "Worker" [ref=f3e367]:
                    - option "All workers" [selected]
                    - option "Alex Rivera"
                    - option "Archive Target"
                    - option "Daniel Brooks"
                    - option "Maya Chen"
                    - option "Rafael Santos"
                - generic [ref=f3e368]:
                  - generic [ref=f3e369]: Client
                  - combobox "Client" [ref=f3e370]:
                    - option "All clients" [selected]
                    - option "Northline Mobility · Demo"
                - generic [ref=f3e371]:
                  - generic [ref=f3e372]: From
                  - textbox "From" [ref=f3e373]: 2026-09-11
                - generic [ref=f3e374]:
                  - generic [ref=f3e375]: To
                  - textbox "To" [ref=f3e376]: 2026-09-11
                - generic [ref=f3e377]:
                  - generic [ref=f3e378]: Sort by
                  - combobox "Sort by" [ref=f3e379]:
                    - option "Newest first" [selected]
                    - option "Oldest first"
                    - option "Name"
                    - option "Status"
                - generic [ref=f3e380]:
                  - generic [ref=f3e381]: Category
                  - combobox "Category" [ref=f3e382]:
                    - option "All categories" [selected]
                    - option "Work"
                    - option "Overtime"
                    - option "Travel"
                    - option "Standby"
                    - option "Commissioning"
                    - option "Weekend / holiday"
                    - option "Remote support"
                    - option "Training"
                    - option "Internal"
          - button "Apply filters" [ref=f3e384] [cursor=pointer]
          - navigation "Quick date filters" [ref=f3e385]:
            - generic [ref=f3e386]: Period
            - link "Today" [ref=f3e387] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-21&q=
            - link "This week" [ref=f3e388] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-27&q=
            - link "This month" [ref=f3e389] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-01&to=2026-09-30&q=
            - link "Last month" [ref=f3e390] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-08-01&to=2026-08-31&q=
          - generic [ref=f3e391]:
            - generic [ref=f3e392]:
              - status [ref=f3e393]:
                - strong [ref=f3e394]: "Active filters: 2"
                - generic [ref=f3e395]: 1 matching records
              - link "Clear filters" [ref=f3e396] [cursor=pointer]:
                - /url: /j-aautomation/app/time?week=2026-09-21&q=
            - list "Active filters" [ref=f3e397]:
              - listitem [ref=f3e398]:
                - 'link "Remove filter: From: 2026-09-11" [ref=f3e399] [cursor=pointer]':
                  - /url: /j-aautomation/app/time?week=2026-09-21&to=2026-09-11&q=
                  - generic [ref=f3e400]: "From:"
                  - text: 2026-09-11
                  - generic [ref=f3e401]: ×
              - listitem [ref=f3e402]:
                - 'link "Remove filter: To: 2026-09-11" [ref=f3e403] [cursor=pointer]':
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-11&q=
                  - generic [ref=f3e404]: "To:"
                  - text: 2026-09-11
                  - generic [ref=f3e405]: ×
        - region [ref=f3e406]:
          - generic [ref=f3e407]:
            - generic [ref=f3e408]:
              - text: ACTIVITY REGISTER
              - heading "Recent time entries" [level=3] [ref=f3e409]
            - generic [ref=f3e410]: "1"
          - article [ref=f3e412]:
            - link "2026-09-11 · C-0001-P-001 Regular time · 09:00 – 13:00 ·225 min · Draft Clock interval owner phone-360 Open record →" [ref=f3e413] [cursor=pointer]:
              - /url: /j-aautomation/app/time/01a0ccfa-b719-778d-bf82-63ca1bb55084
              - strong [ref=f3e414]: 2026-09-11 · C-0001-P-001
              - generic [ref=f3e415]: Regular time · 09:00 – 13:00 ·225 min · Draft
              - generic [ref=f3e416]: Clock interval owner phone-360
              - generic [ref=f3e417]: Open record →
            - generic [ref=f3e418]:
              - button "Edit draft" [ref=f3e419] [cursor=pointer]
              - button "Submit" [ref=f3e421] [cursor=pointer]
            - link "Manage record →" [ref=f3e422] [cursor=pointer]:
              - /url: /j-aautomation/app/manage?type=time_entry#01a0ccfa-b719-778d-bf82-63ca1bb55084
      - dialog [ref=f3e424]:
        - generic [ref=f3e425]:
          - generic [ref=f3e426]:
            - paragraph [ref=f3e427]: J&A Automation
            - heading "Log time" [level=2] [ref=f3e428]
            - paragraph [ref=f3e429]: Operational entry only. Commercial rules are applied separately.
          - button "Close time form" [ref=f3e430] [cursor=pointer]:
            - generic [ref=f3e431]: ×
        - generic [ref=f3e433]:
          - alert [ref=f3e434]: Check the submitted values and try again.
          - generic [ref=f3e435]:
            - generic [ref=f3e436]:
              - generic [ref=f3e437]: Worker
              - combobox "Worker" [ref=f3e438]:
                - option "Select worker"
                - option "Alex Rivera — worker@demo.jaautomation.test" [selected]
                - option "Archive Target — archive-target@demo.jaautomation.test"
                - option "Daniel Brooks — pm@demo.jaautomation.test"
                - option "Maya Chen — maya@demo.jaautomation.test"
                - option "Rafael Santos — rafael@demo.jaautomation.test"
            - generic [ref=f3e439]:
              - strong [ref=f3e440]: Capture actual work
              - generic [ref=f3e441]: Enter what happened on site, not its commercial interpretation.
            - generic [ref=f3e442]:
              - generic [ref=f3e443]: Assigned project
              - combobox "Assigned project" [ref=f3e444]:
                - option "Select assignment"
                - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [selected]
                - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
                - option "C-0002-P-001 — High-Speed Palletizer Commissioning · Demo"
                - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
                - option "C-9901-P-01 — Lifecycle Project · phone-360"
                - option "C-9902-P-02 — Lifecycle Project · phone-390"
                - option "C-9903-P-03 — Lifecycle Project · phone-430"
                - option "C-9904-P-04 — Lifecycle Project · tablet-768"
                - option "C-9905-P-05 — Lifecycle Project · tablet-1024"
                - option "C-9906-P-06 — Lifecycle Project · laptop-1280"
                - option "C-9907-P-07 — Lifecycle Project · desktop"
                - option "C-9908-P-08 — Lifecycle Project · wide-1920"
                - option "CP005 — Valiant"
                - option "CP006 — RAM"
                - option "CP007 — Mino Automation"
                - option "CP008 — Ascension"
                - option "CP009 — KHS"
                - option "CP010 — WWC"
                - option "CP011 — InPro"
                - option "CP012 — Niagara"
                - option "CP013 — Forerunner"
                - option "CP014 — Empack"
                - option "CP015 — CAP Automation Gmbh"
                - option "CP016 — Castor Engineering"
                - option "CP017 — Joiner"
                - option "CP018 — Socaps"
                - option "CP019 — Peninsula Recycling"
                - option "CP020 — BBS Mexico"
                - option "CP020-DFW — Junkers DFW"
                - option "CP021 — Bastian Solutions"
                - option "CP022 — Zeppelin Systems"
                - option "CP023 — Oxford"
                - option "CP024 — Damon"
            - generic [ref=f3e445]:
              - generic [ref=f3e446]: Date
              - textbox "Date" [ref=f3e447]: 2026-09-11
            - generic [ref=f3e448]:
              - generic [ref=f3e449]: Operational category
              - combobox "Operational category" [ref=f3e450]:
                - option "Work" [selected]
                - option "Overtime"
                - option "Travel"
                - option "Standby"
                - option "Commissioning"
                - option "Weekend / holiday"
                - option "Remote support"
                - option "Training"
                - option "Internal"
            - group "Time range" [ref=f3e451]:
              - generic [ref=f3e453]:
                - generic [ref=f3e454]: Start time
                - textbox "Start time" [ref=f3e455]: 09:00
              - generic [ref=f3e456]:
                - generic [ref=f3e457]: End time
                - textbox "End time" [ref=f3e458]: 13:00
              - generic [ref=f3e459]:
                - generic [ref=f3e460]: Break (minutes)
                - spinbutton "Break (minutes)" [ref=f3e461]: "15"
              - generic [ref=f3e462]:
                - generic [ref=f3e463]: Calculated duration
                - status [ref=f3e464]: 3 h 45 min
              - paragraph [ref=f3e465]: The duration is calculated from the start and end times, less any break. Use the project's local time. Start and end must be on the selected date.
            - generic [ref=f3e466]:
              - generic [ref=f3e467]: Activity summary
              - textbox "Activity summary" [ref=f3e468]: Clock interval owner phone-360 overlap
            - generic [ref=f3e469]:
              - button "Cancel" [active] [ref=f3e470] [cursor=pointer]
              - button "Save draft" [ref=f3e471] [cursor=pointer]
    - navigation "Mobile navigation" [ref=f3e472]:
      - link "Dashboard" [ref=f3e473] [cursor=pointer]:
        - /url: /j-aautomation/app/
      - link "Projects" [ref=f3e474] [cursor=pointer]:
        - /url: /j-aautomation/app/projects
      - link "Approvals" [ref=f3e475] [cursor=pointer]:
        - /url: /j-aautomation/app/approvals
      - link "Reports" [ref=f3e476] [cursor=pointer]:
        - /url: /j-aautomation/app/reports
      - button "More" [ref=f3e477] [cursor=pointer]
```

# Test source

```ts
  3   | import { portal, signIn } from './auth.js';
  4   | import { readE2EFixturePointer } from './environment.js';
  5   | 
  6   | test.use({ timezoneId: 'America/Los_Angeles' });
  7   | 
  8   | for (const role of ['worker', 'owner'] as const) {
  9   |   test(`${role}: current local date, clock interval, pause and edit`, async ({
  10  |     page,
  11  |   }, testInfo) => {
  12  |     const widths = ['phone-360', 'phone-390', 'tablet-768', 'desktop'];
  13  |     test.skip(!widths.includes(testInfo.project.name));
  14  |     const index = widths.indexOf(testInfo.project.name) * 2 + Number(role === 'owner');
  15  |     const workDate = `2026-09-${10 + index}`;
  16  |     const summary = `Clock interval ${role} ${testInfo.project.name}`;
  17  |     const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  18  |     try {
  19  |       await signIn(page, role);
  20  |       await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
  21  |       await page.clock.setFixedTime(new Date('2026-09-22T00:30:00Z'));
  22  |       await page.locator('[data-time-primary-cta]').click();
  23  |       let form = page.locator('form[data-time-entry-surface]');
  24  |       const today = await page.evaluate(() => {
  25  |         const now = new Date();
  26  |         return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  27  |       });
  28  |       expect(today).toBe('2026-09-21');
  29  |       await expect(form.locator('[name="workDate"]')).toHaveValue(today);
  30  |       const worker = db
  31  |         .prepare('SELECT id FROM user WHERE email=?')
  32  |         .get('worker@demo.jaautomation.test') as { id: string };
  33  |       if (role === 'owner') await form.locator('[name="workerId"]').selectOption(worker.id);
  34  |       const project = db
  35  |         .prepare(
  36  |           'SELECT project_id FROM project_member WHERE user_id=? ORDER BY project_id LIMIT 1',
  37  |         )
  38  |         .get(worker.id) as { project_id: string };
  39  |       await form.locator('[name="projectId"]').selectOption(project.project_id);
  40  |       await form.locator('[name="workDate"]').fill(workDate);
  41  |       await form.locator('[name="startTime"]').fill('09:00');
  42  |       await form.locator('[name="endTime"]').fill('08:00');
  43  |       await expect
  44  |         .poll(() =>
  45  |           form
  46  |             .locator('[name="endTime"]')
  47  |             .evaluate((el: HTMLInputElement) => el.validity.customError),
  48  |         )
  49  |         .toBe(true);
  50  |       await form.locator('[name="endTime"]').fill('13:00');
  51  |       await form.locator('[name="breakMinutes"]').fill('15');
  52  |       await expect(form.locator('output')).toHaveText('3 h 45 min');
  53  |       await form.locator('[name="summary"]').fill(summary);
  54  |       for (const label of ['Start time', 'End time', 'Break (minutes)']) {
  55  |         const control = form.getByLabel(label, { exact: true });
  56  |         await expect(control).toBeVisible();
  57  |         const box = await control.boundingBox();
  58  |         expect(box?.width).toBeGreaterThan(100);
  59  |         expect(box?.height).toBeGreaterThanOrEqual(40);
  60  |       }
  61  |       if (testInfo.project.name.startsWith('phone')) {
  62  |         const start = await form.getByLabel('Start time', { exact: true }).boundingBox();
  63  |         const end = await form.getByLabel('End time', { exact: true }).boundingBox();
  64  |         expect(end!.y).toBeGreaterThanOrEqual(start!.y + start!.height);
  65  |       }
  66  |       await page.screenshot({ path: testInfo.outputPath('clock-form.png'), fullPage: true });
  67  |       await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  68  |       await expect
  69  |         .poll(
  70  |           () =>
  71  |             db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
  72  |               ?.minutes,
  73  |         )
  74  |         .toBe(225);
  75  |       const stored = db
  76  |         .prepare(
  77  |           'SELECT id,start_time,end_time,break_minutes FROM time_entry WHERE activity_summary=?',
  78  |         )
  79  |         .get(summary);
  80  |       expect(stored).toMatchObject({ start_time: '09:00', end_time: '13:00', break_minutes: 15 });
  81  |       await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
  82  |       const row = page.locator('article.time-record').filter({ hasText: summary });
  83  |       await expect(row).toContainText('09:00');
  84  |       await expect(row).toContainText('13:00');
  85  |       // A server-side overlap rejection must keep the sheet and all entered values.
  86  |       await page.locator('[data-time-primary-cta]').click();
  87  |       form = page.locator('form[data-time-entry-surface]');
  88  |       if (role === 'owner') await form.locator('[name="workerId"]').selectOption(worker.id);
  89  |       await form.locator('[name="projectId"]').selectOption(project.project_id);
  90  |       await form.locator('[name="workDate"]').fill(workDate);
  91  |       await form.locator('[name="startTime"]').fill('09:00');
  92  |       await form.locator('[name="endTime"]').fill('13:00');
  93  |       await form.locator('[name="breakMinutes"]').fill('15');
  94  |       await form.locator('[name="summary"]').fill(`${summary} overlap`);
  95  |       await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  96  |       await expect(page.locator('.time-form-error')).toBeVisible();
  97  |       await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
  98  |       await expect(form.locator('[name="summary"]')).toHaveValue(`${summary} overlap`);
  99  |       expect(
  100 |         db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(`${summary} overlap`),
  101 |       ).toBeUndefined();
  102 |       await form.getByRole('button', { name: 'Cancel', exact: true }).click();
> 103 |       await row.getByRole('button', { name: 'Edit draft', exact: true }).click();
      |                                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  104 |       form = page.locator('form[data-time-entry-surface]');
  105 |       await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
  106 |       await expect(form.locator('[name="breakMinutes"]')).toHaveValue('15');
  107 |       await form.locator('[name="endTime"]').fill('14:00');
  108 |       await expect(form.locator('output')).toHaveText('4 h 45 min');
  109 |       await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  110 |       await expect
  111 |         .poll(
  112 |           () =>
  113 |             db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
  114 |               ?.minutes,
  115 |         )
  116 |         .toBe(285);
  117 |       await page.goto(portal(`/time/${stored!.id}`));
  118 |       await expect(page.locator('main')).toContainText('09:00');
  119 |       await expect(page.locator('main')).toContainText('14:00');
  120 |       // Model an existing duration-only record in this disposable fixture only.
  121 |       db.prepare(
  122 |         'UPDATE time_entry SET start_time=NULL,end_time=NULL,break_minutes=0 WHERE id=?',
  123 |       ).run(String(stored!.id));
  124 |       await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
  125 |       await row.getByRole('button', { name: 'Edit draft', exact: true }).click();
  126 |       form = page.locator('form[data-time-entry-surface]');
  127 |       await expect(form.locator('input[name="minutes"]')).toHaveValue('285');
  128 |       await expect(form.locator('[name="startTime"]')).toHaveCount(0);
  129 |       await form.getByRole('checkbox', { name: 'Add start and end times' }).check();
  130 |       await form.locator('[name="startTime"]').fill('10:00');
  131 |       await form.locator('[name="endTime"]').fill('11:00');
  132 |       await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  133 |       await expect
  134 |         .poll(
  135 |           () =>
  136 |             db.prepare('SELECT minutes FROM time_entry WHERE id=?').get(String(stored!.id))
  137 |               ?.minutes,
  138 |         )
  139 |         .toBe(60);
  140 |     } finally {
  141 |       db.close();
  142 |     }
  143 |   });
  144 | }
  145 | 
```