# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notification-inbox.spec.ts >> operational sheets protect changed text on cancel, Escape and navigation
- Location: tests/e2e/notification-inbox.spec.ts:79:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByRole('dialog', { name: 'Log time', exact: true }).locator('textarea').first()
Expected: "Keep my field notes"
Received: ""

```

# Page snapshot

```yaml
- generic [ref=f2e2]:
  - link "Skip to main content":
    - /url: "#portal-main"
  - generic [ref=f2e3]:
    - complementary "Portal navigation" [ref=f2e4]:
      - link [ref=f2e5] [cursor=pointer]:
        - /url: /j-aautomation/app/
        - img "J&A Automation" [ref=f2e6]
      - navigation "Primary navigation" [ref=f2e7]:
        - link "Today" [ref=f2e8] [cursor=pointer]:
          - /url: /j-aautomation/app/
        - link "Time" [ref=f2e13] [cursor=pointer]:
          - /url: /j-aautomation/app/time
        - link "Expenses" [ref=f2e18] [cursor=pointer]:
          - /url: /j-aautomation/app/expenses
        - link "Reports" [ref=f2e23] [cursor=pointer]:
          - /url: /j-aautomation/app/reports
        - generic [ref=f2e28]: SECONDARY
        - link "My Pay" [ref=f2e29] [cursor=pointer]:
          - /url: /j-aautomation/app/pay
        - link "Profile" [ref=f2e34] [cursor=pointer]:
          - /url: /j-aautomation/app/profile
      - link "Company Webmail" [ref=f2e39] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f2e45]: ↗
      - button "Sign out" [ref=f2e46]
    - banner [ref=f2e47]:
      - generic [ref=f2e48]: Online
      - button "Go to section" [ref=f2e51] [cursor=pointer]:
        - generic [ref=f2e58]: ⌘/Ctrl K
      - link "Notifications" [ref=f2e59] [cursor=pointer]:
        - /url: /j-aautomation/app/notifications
      - link "Company Webmail" [ref=f2e62] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f2e66]: Webmail
      - generic [ref=f2e67]:
        - generic [ref=f2e68]: Language
        - combobox "Language" [ref=f2e69]:
          - option "EN" [selected]
          - option "ES"
          - option "PT-BR"
      - button "Account options" [ref=f2e71] [cursor=pointer]:
        - generic [ref=f2e72]: AR
        - generic [ref=f2e73]:
          - generic [ref=f2e74]: Alex Rivera
          - generic [ref=f2e75]: Worker
    - main [ref=f2e79]:
      - generic [ref=f2e80]:
        - generic [ref=f2e81]:
          - paragraph [ref=f2e82]: J&A / Time entries
          - heading "Time entries" [level=1] [ref=f2e83]
        - generic [ref=f2e84]:
          - button "Print report" [ref=f2e85]
          - search [ref=f2e89]:
            - generic [ref=f2e90]: Search workspace
            - combobox "Search workspace" [ref=f2e91]
            - button "Search" [ref=f2e92] [cursor=pointer]
      - generic [ref=f2e93]:
        - generic [ref=f2e95]:
          - paragraph [ref=f2e96]: Worker operations
          - heading "Time" [level=2] [ref=f2e97]
          - paragraph [ref=f2e98]: Record actual operational time. Commercial interpretation is applied from configured project rules.
        - button "Log time" [ref=f2e100] [cursor=pointer]
        - paragraph [ref=f2e101]: Save a draft while details are still changing. Submit time only after the recorded date, duration and activity are accurate; submitted time is reviewed and cannot be silently overwritten.
        - generic "Time attention summary" [ref=f2e102]:
          - link "Actual recorded 0 min Minutes you really recorded." [ref=f2e103] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22&q=&lang=en
            - generic [ref=f2e104]: Actual recorded
            - strong [ref=f2e105]: 0 min
            - generic [ref=f2e106]: Minutes you really recorded.
          - link "Needs attention 0 Draft or review state" [ref=f2e107] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&status=attention&from=2026-09-22&to=2026-09-22&q=&lang=en
            - generic [ref=f2e108]: Needs attention
            - strong [ref=f2e109]: "0"
            - generic [ref=f2e110]: Draft or review state
          - link "Approved 0 Rows approved by the workflow" [ref=f2e111] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&status=approved&from=2026-09-22&to=2026-09-22&q=&lang=en
            - generic [ref=f2e112]: Approved
            - strong [ref=f2e113]: "0"
            - generic [ref=f2e114]: Rows approved by the workflow
        - region [ref=f2e115]:
          - generic [ref=f2e116]:
            - generic [ref=f2e117]:
              - text: WEEKLY TIMESHEET
              - heading "Actual time, one week at a glance" [level=2] [ref=f2e118]
              - paragraph [ref=f2e119]: 2026-09-21 → 2026-09-27. Planning target only; it never creates time.
            - generic [ref=f2e120]:
              - generic [ref=f2e121]:
                - text: Week of
                - textbox "Week of" [ref=f2e122]: 2026-09-21
              - button "Open week" [ref=f2e123] [cursor=pointer]
          - navigation "Week of" [ref=f2e124]:
            - link "← Previous week" [ref=f2e125] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-14&from=2026-09-14&to=2026-09-20&q=&lang=en
            - link "This week" [ref=f2e126] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-27&q=&lang=en
            - link "Next week →" [ref=f2e127] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-28&from=2026-09-28&to=2026-10-04&q=&lang=en
          - generic "How to read this timesheet" [ref=f2e128]:
            - generic [ref=f2e129]:
              - strong [ref=f2e130]: Actual
              - generic [ref=f2e131]: Minutes you really recorded.
            - generic [ref=f2e132]:
              - strong [ref=f2e133]: Expected
              - generic [ref=f2e134]: Planning target only; it never creates time.
            - generic [ref=f2e135]:
              - strong [ref=f2e136]: Difference
              - generic [ref=f2e137]: Actual minus expected for the day.
            - generic [ref=f2e138]:
              - strong [ref=f2e139]: Status
              - generic [ref=f2e140]: Draft, submitted, approved or needs changes.
          - region "Timesheet table" [ref=f2e141]:
            - group "Timesheet table" [ref=f2e142]:
              - paragraph [ref=f2e143]: Scroll horizontally to review all columns.
              - table [ref=f2e144]:
                - caption [ref=f2e145]: Weekly actual time and approval status
                - rowgroup [ref=f2e146]:
                  - row [ref=f2e147]:
                    - columnheader "Day" [ref=f2e148]
                    - columnheader "Actual" [ref=f2e149]
                    - columnheader "Expected" [ref=f2e150]
                    - columnheader "Difference" [ref=f2e151]
                    - columnheader "Categories" [ref=f2e152]
                    - columnheader "Status" [ref=f2e153]
                - rowgroup [ref=f2e154]:
                  - row [ref=f2e155]:
                    - rowheader [ref=f2e156]:
                      - link "Mon 2026-09-21" [ref=f2e157] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-21
                        - text: Mon
                        - generic [ref=f2e158]: 2026-09-21
                    - cell "0.0h" [ref=f2e159]
                    - cell "—" [ref=f2e160]
                    - cell "—" [ref=f2e161]
                    - cell "—" [ref=f2e162]
                    - cell "—" [ref=f2e163]
                  - row [ref=f2e164]:
                    - rowheader [ref=f2e165]:
                      - link "Tue 2026-09-22" [ref=f2e166] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22
                        - text: Tue
                        - generic [ref=f2e167]: 2026-09-22
                    - cell "0.0h" [ref=f2e168]
                    - cell "—" [ref=f2e169]
                    - cell "—" [ref=f2e170]
                    - cell "—" [ref=f2e171]
                    - cell "—" [ref=f2e172]
                  - row [ref=f2e173]:
                    - rowheader [ref=f2e174]:
                      - link "Wed 2026-09-23" [ref=f2e175] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-23&to=2026-09-23
                        - text: Wed
                        - generic [ref=f2e176]: 2026-09-23
                    - cell "0.0h" [ref=f2e177]
                    - cell "—" [ref=f2e178]
                    - cell "—" [ref=f2e179]
                    - cell "—" [ref=f2e180]
                    - cell "—" [ref=f2e181]
                  - row [ref=f2e182]:
                    - rowheader [ref=f2e183]:
                      - link "Thu 2026-09-24" [ref=f2e184] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-24&to=2026-09-24
                        - text: Thu
                        - generic [ref=f2e185]: 2026-09-24
                    - cell "0.0h" [ref=f2e186]
                    - cell "—" [ref=f2e187]
                    - cell "—" [ref=f2e188]
                    - cell "—" [ref=f2e189]
                    - cell "—" [ref=f2e190]
                  - row [ref=f2e191]:
                    - rowheader [ref=f2e192]:
                      - link "Fri 2026-09-25" [ref=f2e193] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-25&to=2026-09-25
                        - text: Fri
                        - generic [ref=f2e194]: 2026-09-25
                    - cell "0.0h" [ref=f2e195]
                    - cell "—" [ref=f2e196]
                    - cell "—" [ref=f2e197]
                    - cell "—" [ref=f2e198]
                    - cell "—" [ref=f2e199]
                  - row [ref=f2e200]:
                    - rowheader [ref=f2e201]:
                      - link "Sat 2026-09-26" [ref=f2e202] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-26&to=2026-09-26
                        - text: Sat
                        - generic [ref=f2e203]: 2026-09-26
                    - cell "0.0h" [ref=f2e204]
                    - cell "—" [ref=f2e205]
                    - cell "—" [ref=f2e206]
                    - cell "—" [ref=f2e207]
                    - cell "—" [ref=f2e208]
                  - row [ref=f2e209]:
                    - rowheader [ref=f2e210]:
                      - link "Sun 2026-09-27" [ref=f2e211] [cursor=pointer]:
                        - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-27&to=2026-09-27
                        - text: Sun
                        - generic [ref=f2e212]: 2026-09-27
                    - cell "0.0h" [ref=f2e213]
                    - cell "—" [ref=f2e214]
                    - cell "—" [ref=f2e215]
                    - cell "—" [ref=f2e216]
                    - cell "—" [ref=f2e217]
                - rowgroup [ref=f2e218]:
                  - row [ref=f2e219]:
                    - rowheader "Actual" [ref=f2e220]
                    - cell "0.0h" [ref=f2e221]
                    - cell "—" [ref=f2e222]
                    - cell "—" [ref=f2e223]
                    - cell "0.0h Approved · 0.0h Pending · $0.00 approved estimate" [ref=f2e224]
          - group [ref=f2e225]:
            - generic "Copy previous week layout" [ref=f2e226] [cursor=pointer]
        - form "Filter time entries" [ref=f2e227]:
          - generic [ref=f2e228]:
            - generic [ref=f2e229]: Search register
            - searchbox "Search register" [ref=f2e230]
          - generic [ref=f2e231]:
            - generic [ref=f2e232]: Project
            - combobox "Project" [ref=f2e233]:
              - option "All projects" [selected]
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo"
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
          - generic [ref=f2e234]:
            - generic [ref=f2e235]: Status
            - combobox "Status" [ref=f2e236]:
              - option "All statuses" [selected]
              - option "Needs attention"
              - option "Draft"
              - option "Submitted"
              - option "Approved"
              - option "Needs changes"
          - region [ref=f2e237]:
            - group [ref=f2e238]:
              - 'generic "Filter time entries Active filters: 2" [ref=f2e239] [cursor=pointer]':
                - generic [ref=f2e240]:
                  - heading "Filter time entries" [level=2] [ref=f2e241]
                  - generic [ref=f2e242]: "Active filters: 2"
              - generic [ref=f2e246]:
                - generic [ref=f2e247]:
                  - generic [ref=f2e248]: Client
                  - combobox "Client" [ref=f2e249]:
                    - option "All clients" [selected]
                - generic [ref=f2e250]:
                  - generic [ref=f2e251]: From
                  - textbox "From" [ref=f2e252]: 2026-09-22
                - generic [ref=f2e253]:
                  - generic [ref=f2e254]: To
                  - textbox "To" [ref=f2e255]: 2026-09-22
                - generic [ref=f2e256]:
                  - generic [ref=f2e257]: Sort by
                  - combobox "Sort by" [ref=f2e258]:
                    - option "Newest first" [selected]
                    - option "Oldest first"
                    - option "Name"
                    - option "Status"
                - generic [ref=f2e259]:
                  - generic [ref=f2e260]: Category
                  - combobox "Category" [ref=f2e261]:
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
          - button "Apply filters" [ref=f2e263] [cursor=pointer]
          - navigation "Quick date filters" [ref=f2e264]:
            - generic [ref=f2e265]: Period
            - link "Today" [ref=f2e266] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22&q=&lang=en
            - link "This week" [ref=f2e267] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-27&q=&lang=en
            - link "This month" [ref=f2e268] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-01&to=2026-09-30&q=&lang=en
            - link "Last month" [ref=f2e269] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-08-01&to=2026-08-31&q=&lang=en
          - generic [ref=f2e270]:
            - generic [ref=f2e271]:
              - status [ref=f2e272]:
                - strong [ref=f2e273]: "Active filters: 2"
                - generic [ref=f2e274]: 0 matching records
              - link "Clear filters" [ref=f2e275] [cursor=pointer]:
                - /url: /j-aautomation/app/time?week=2026-09-21&q=
            - list "Active filters" [ref=f2e276]:
              - listitem [ref=f2e277]:
                - 'link "Remove filter: From: 2026-09-22" [ref=f2e278] [cursor=pointer]':
                  - /url: /j-aautomation/app/time?week=2026-09-21&to=2026-09-22&q=&lang=en
                  - generic [ref=f2e279]: "From:"
                  - text: 2026-09-22
                  - generic [ref=f2e280]: ×
              - listitem [ref=f2e281]:
                - 'link "Remove filter: To: 2026-09-22" [ref=f2e282] [cursor=pointer]':
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&q=&lang=en
                  - generic [ref=f2e283]: "To:"
                  - text: 2026-09-22
                  - generic [ref=f2e284]: ×
        - region [ref=f2e285]:
          - generic [ref=f2e286]:
            - generic [ref=f2e287]:
              - text: ACTIVITY REGISTER
              - heading "Recent time entries" [level=3] [ref=f2e288]
            - generic [ref=f2e289]: "0"
          - status [ref=f2e291]:
            - strong [ref=f2e292]: No matching records.
            - generic [ref=f2e293]: Clear filters to see more records.
      - dialog [ref=f2e295]:
        - generic [ref=f2e296]:
          - generic [ref=f2e297]:
            - paragraph [ref=f2e298]: J&A Automation
            - heading "Log time" [level=2] [ref=f2e299]
            - paragraph [ref=f2e300]: Operational entry only. Commercial rules are applied separately.
          - button "Close time form" [active] [ref=f2e301] [cursor=pointer]:
            - generic [ref=f2e302]: ×
        - generic [ref=f2e305]:
          - generic [ref=f2e306]:
            - strong [ref=f2e307]: Capture actual work
            - generic [ref=f2e308]: Enter what happened on site, not its commercial interpretation.
          - generic [ref=f2e309]:
            - generic [ref=f2e310]: Assigned project
            - combobox "Assigned project" [ref=f2e311]:
              - option "Select assignment" [selected]
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo"
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
          - generic [ref=f2e312]:
            - generic [ref=f2e313]: Date
            - textbox "Date" [ref=f2e314]: 2026-09-22
          - generic [ref=f2e315]:
            - generic [ref=f2e316]: Operational category
            - combobox "Operational category" [ref=f2e317]:
              - option "Work" [selected]
              - option "Overtime"
              - option "Travel"
              - option "Standby"
              - option "Commissioning"
              - option "Weekend / holiday"
              - option "Remote support"
              - option "Training"
              - option "Internal"
          - group "Time range" [ref=f2e318]:
            - generic [ref=f2e320]:
              - generic [ref=f2e321]: Start time
              - textbox "Start time" [ref=f2e322]
            - generic [ref=f2e323]:
              - generic [ref=f2e324]: End time
              - textbox "End time" [ref=f2e325]
            - generic [ref=f2e326]:
              - generic [ref=f2e327]: Break (minutes)
              - spinbutton "Break (minutes)" [ref=f2e328]: "0"
            - generic [ref=f2e329]:
              - generic [ref=f2e330]: Calculated duration
              - status [ref=f2e331]: —
            - paragraph [ref=f2e332]: The duration is calculated from the start and end times, less any break. Use the project's local time. Start and end must be on the selected date.
          - generic [ref=f2e333]:
            - generic [ref=f2e334]: Activity summary
            - textbox "Activity summary" [ref=f2e335]: Keep my field notes
          - generic [ref=f2e336]:
            - button "Cancel" [ref=f2e337] [cursor=pointer]
            - button "Save draft" [ref=f2e338] [cursor=pointer]
  - generic [ref=f2e339]: Time entries | J&A Portal
```

# Test source

```ts
  21  |           'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
  22  |         )
  23  |         .run(id, worker.id, 'missing_time', `missing-time:inbox-${id}`, new Date().toISOString());
  24  |   } finally {
  25  |     sqlite.close();
  26  |   }
  27  |   try {
  28  |     await page.goto(portal('/notifications?lang=es&read=unread'));
  29  |     const row = page.locator(`[data-notification-id="${ids[0]}"]`);
  30  |     await expect(row).toBeVisible();
  31  |     const mark = row.getByRole('button', { name: 'Marcar como leído' });
  32  |     // Route action query also includes the selected language/filter; match the action by URL.
  33  |     await page.route(
  34  |       (url) => url.search.includes('/markNotificationRead'),
  35  |       (route) => route.abort(),
  36  |       { times: 1 },
  37  |     );
  38  |     await mark.click();
  39  |     await expect(page.locator('.inbox-feedback')).toContainText('No se pudo actualizar');
  40  |     await expect(row).toBeVisible();
  41  |     await page.unrouteAll({ behavior: 'wait' });
  42  |     await mark.click();
  43  |     await expect(row).toHaveCount(0);
  44  |     await expect(page.locator(`[data-notification-id="${ids[1]}"]`)).toBeVisible();
  45  |     await expect(page.locator('.inbox-feedback')).toBeFocused();
  46  |     const db = createDatabase(e2eDatabasePath);
  47  |     try {
  48  |       expect(
  49  |         (
  50  |           db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(ids[0]) as {
  51  |             read_at: string;
  52  |           }
  53  |         ).read_at,
  54  |       ).toBeTruthy();
  55  |       expect(
  56  |         (
  57  |           db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(ids[1]) as {
  58  |             read_at: string | null;
  59  |           }
  60  |         ).read_at,
  61  |       ).toBeNull();
  62  |     } finally {
  63  |       db.sqlite.close();
  64  |     }
  65  |     const nav = page.getByRole('navigation', { name: 'Filtros de notificaciones' });
  66  |     await nav.getByRole('link', { name: /^Todas/ }).click();
  67  |     await expect(page.locator(`[data-notification-id="${ids[0]}"]`)).toBeVisible();
  68  |     await expect(
  69  |       page.locator(`[data-notification-id="${ids[0]}"]`).getByRole('button'),
  70  |     ).toHaveCount(0);
  71  |     expect(
  72  |       (await new AxeBuilder({ page }).include('.notification-inbox').analyze()).violations,
  73  |     ).toEqual([]);
  74  |     for (const button of await page.locator('.notification-inbox button').all())
  75  |       expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  76  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  77  |       true,
  78  |     );
  79  |     await page.screenshot({ path: info.outputPath('notification-inbox.png'), fullPage: false });
  80  |   } finally {
  81  |     const cleanup = createDatabase(e2eDatabasePath);
  82  |     try {
  83  |       for (const id of ids) cleanup.sqlite.prepare('DELETE FROM notification WHERE id=?').run(id);
  84  |     } finally {
  85  |       cleanup.sqlite.close();
  86  |     }
  87  |   }
  88  | });
  89  | 
  90  | test('operational sheets protect changed text on cancel, Escape and navigation', async ({
  91  |   page,
  92  | }, info) => {
  93  |   await signIn(page, 'worker');
  94  |   await page.goto(portal('/time?lang=en'));
  95  |   await page
  96  |     .getByRole('navigation', { name: 'Quick date filters' })
  97  |     .getByRole('link', { name: 'Today', exact: true })
  98  |     .click();
  99  |   await page.getByRole('button', { name: 'Log time', exact: true }).click();
  100 |   const sheet = page.getByRole('dialog', { name: 'Log time', exact: true });
  101 |   await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  102 |   await expect(sheet).not.toBeVisible();
  103 |   await page.getByRole('button', { name: 'Log time', exact: true }).click();
  104 |   const notes = sheet.locator('textarea').first();
  105 |   await notes.fill('Keep my field notes');
  106 |   for (const close of [
  107 |     () => sheet.getByRole('button', { name: 'Cancel', exact: true }).click(),
  108 |     () => page.keyboard.press('Escape'),
  109 |     () => sheet.getByRole('button', { name: 'Close time form' }).click(),
  110 |   ]) {
  111 |     const dialogPromise = page.waitForEvent('dialog');
  112 |     const click = close();
  113 |     const dialog = await dialogPromise;
  114 |     expect(dialog.message()).toContain('unsaved changes');
  115 |     await dialog.dismiss();
  116 |     await click;
  117 |     await expect(sheet).toBeVisible();
  118 |     await expect(notes).toHaveValue('Keep my field notes');
  119 |   }
  120 |   const originalUrl = page.url();
> 121 |   const backDialog = page.waitForEvent('dialog');
      |                       ^ Error: expect(locator).toHaveValue(expected) failed
  122 |   await page.evaluate(() => history.back());
  123 |   const confirmation = await backDialog;
  124 |   expect(confirmation.message()).toContain('unsaved changes');
  125 |   await confirmation.dismiss();
  126 |   await expect(page).toHaveURL(originalUrl);
  127 |   await expect(notes).toHaveValue('Keep my field notes');
  128 |   await expect(sheet).toBeVisible();
  129 |   const reloadDialog = page.waitForEvent('dialog');
  130 |   const reload = page.evaluate(() => window.location.reload());
  131 |   const unloadConfirmation = await reloadDialog;
  132 |   expect(unloadConfirmation.type()).toBe('beforeunload');
  133 |   await unloadConfirmation.dismiss();
  134 |   await reload;
  135 |   await expect(notes).toHaveValue('Keep my field notes');
  136 |   // A repeated navigation shortcut cannot steal focus from the modal.
  137 |   await notes.focus();
  138 |   await page.keyboard.press('Control+k');
  139 |   await expect(notes).toBeFocused();
  140 |   await expect(page.locator('dialog[open]')).toHaveCount(0);
  141 |   await page.screenshot({ path: info.outputPath('protected-time-form.png') });
  142 |   page.once('dialog', (dialog) => dialog.accept());
  143 |   await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  144 |   await expect(sheet).not.toBeVisible();
  145 | });
  146 | 
  147 | test('project register uses one search and status filter', async ({ page }) => {
  148 |   await signIn(page, 'manager');
  149 |   await page.goto(portal('/projects?lang=en'));
  150 |   const section = page.locator('[data-ui="project-section"]');
  151 |   await expect(section.getByRole('searchbox')).toHaveCount(1);
  152 |   await expect(section.getByRole('combobox', { name: 'Status', exact: true })).toHaveCount(1);
  153 |   await section.getByRole('searchbox').fill('NO_MATCH_PROJECT_000');
  154 |   await expect(section.getByText('No projects found', { exact: true })).toBeVisible();
  155 |   await section.getByRole('link', { name: 'Clear filters', exact: true }).click();
  156 |   await expect(section.getByRole('searchbox')).toHaveValue('');
  157 |   await expect(section.getByText('No projects found', { exact: true })).toHaveCount(0);
  158 | });
  159 | 
```