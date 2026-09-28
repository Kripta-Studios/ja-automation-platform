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
    - button
    - dialog [ref=f2e4]:
      - link [ref=f2e5] [cursor=pointer]:
        - /url: /j-aautomation/app/
      - navigation [ref=f2e7]:
        - link [ref=f2e8] [cursor=pointer]:
          - /url: /j-aautomation/app/
          - generic [ref=f2e12]: Today
        - link [ref=f2e13] [cursor=pointer]:
          - /url: /j-aautomation/app/time
          - generic [ref=f2e17]: Time
        - link [ref=f2e18] [cursor=pointer]:
          - /url: /j-aautomation/app/expenses
          - generic [ref=f2e22]: Expenses
        - link [ref=f2e23] [cursor=pointer]:
          - /url: /j-aautomation/app/reports
          - generic [ref=f2e27]: Reports
        - generic [ref=f2e28]: SECONDARY
        - link [ref=f2e29] [cursor=pointer]:
          - /url: /j-aautomation/app/pay
          - generic [ref=f2e33]: My Pay
        - link [ref=f2e34] [cursor=pointer]:
          - /url: /j-aautomation/app/profile
          - generic [ref=f2e38]: Profile
      - link [ref=f2e39] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f2e44]: Company Webmail
        - generic [ref=f2e45]: ↗
      - button [ref=f2e46]: Sign out
    - banner [ref=f2e47]:
      - generic [ref=f2e48]:
        - button "Toggle navigation" [ref=f2e49]
        - generic [ref=f2e52]: Online
      - button "Go to section" [ref=f2e54] [cursor=pointer]
      - generic [ref=f2e60]:
        - generic [ref=f2e61]: Language
        - combobox "Language" [ref=f2e62]:
          - option "EN" [selected]
          - option "ES"
          - option "PT-BR"
      - button "Account options" [ref=f2e64] [cursor=pointer]:
        - generic [ref=f2e65]: AR
    - main [ref=f2e66]:
      - generic [ref=f2e67]:
        - generic [ref=f2e68]:
          - paragraph [ref=f2e69]: J&A / Time entries
          - heading "Time entries" [level=1] [ref=f2e70]
        - generic [ref=f2e71]:
          - button "Print report" [ref=f2e72]
          - search [ref=f2e76]:
            - generic [ref=f2e77]: Search workspace
            - combobox "Search workspace" [ref=f2e78]
            - button "Search" [ref=f2e79] [cursor=pointer]
      - generic [ref=f2e80]:
        - generic [ref=f2e82]:
          - paragraph [ref=f2e83]: Worker operations
          - heading "Time" [level=2] [ref=f2e84]
          - paragraph [ref=f2e85]: Record actual operational time. Commercial interpretation is applied from configured project rules.
        - button "Log time" [ref=f2e87] [cursor=pointer]
        - paragraph [ref=f2e88]: Save a draft while details are still changing. Submit time only after the recorded date, duration and activity are accurate; submitted time is reviewed and cannot be silently overwritten.
        - generic "Time attention summary" [ref=f2e89]:
          - link "Actual recorded 0 min Minutes you really recorded." [ref=f2e90] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22&q=&lang=en
            - generic [ref=f2e91]: Actual recorded
            - strong [ref=f2e92]: 0 min
            - generic [ref=f2e93]: Minutes you really recorded.
          - link "Needs attention 0 Draft or review state" [ref=f2e94] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&status=attention&from=2026-09-22&to=2026-09-22&q=&lang=en
            - generic [ref=f2e95]: Needs attention
            - strong [ref=f2e96]: "0"
            - generic [ref=f2e97]: Draft or review state
          - link "Approved 0 Rows approved by the workflow" [ref=f2e98] [cursor=pointer]:
            - /url: /j-aautomation/app/time?week=2026-09-21&status=approved&from=2026-09-22&to=2026-09-22&q=&lang=en
            - generic [ref=f2e99]: Approved
            - strong [ref=f2e100]: "0"
            - generic [ref=f2e101]: Rows approved by the workflow
        - region [ref=f2e102]:
          - generic [ref=f2e103]:
            - generic [ref=f2e104]:
              - text: WEEKLY TIMESHEET
              - heading "Actual time, one week at a glance" [level=2] [ref=f2e105]
              - paragraph [ref=f2e106]: 2026-09-21 → 2026-09-27. Planning target only; it never creates time.
            - generic [ref=f2e107]:
              - generic [ref=f2e108]:
                - text: Week of
                - textbox "Week of" [ref=f2e109]: 2026-09-21
              - button "Open week" [ref=f2e110] [cursor=pointer]
          - navigation "Week of" [ref=f2e111]:
            - link "← Previous week" [ref=f2e112] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-14&from=2026-09-14&to=2026-09-20&q=&lang=en
            - link "This week" [ref=f2e113] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-27&q=&lang=en
            - link "Next week →" [ref=f2e114] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-28&from=2026-09-28&to=2026-10-04&q=&lang=en
          - generic "How to read this timesheet" [ref=f2e115]:
            - generic [ref=f2e116]:
              - strong [ref=f2e117]: Actual
              - generic [ref=f2e118]: Minutes you really recorded.
            - generic [ref=f2e119]:
              - strong [ref=f2e120]: Expected
              - generic [ref=f2e121]: Planning target only; it never creates time.
            - generic [ref=f2e122]:
              - strong [ref=f2e123]: Difference
              - generic [ref=f2e124]: Actual minus expected for the day.
            - generic [ref=f2e125]:
              - strong [ref=f2e126]: Status
              - generic [ref=f2e127]: Draft, submitted, approved or needs changes.
          - region "Timesheet table" [ref=f2e128]:
            - generic [ref=f2e129]:
              - article [ref=f2e130]:
                - generic "Day" [ref=f2e131]: Mon · 2026-09-21
                - generic "Actual" [ref=f2e134]: 0.0h
                - generic "Expected" [ref=f2e137]: —
                - generic "Difference" [ref=f2e140]: —
                - generic "Categories" [ref=f2e143]: —
                - generic "Status" [ref=f2e146]: —
                - link "Open time entries for Mon 2026-09-21" [ref=f2e149] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-21
                  - text: Open day entries
              - article [ref=f2e150]:
                - generic "Day" [ref=f2e151]: Tue · 2026-09-22
                - generic "Actual" [ref=f2e154]: 0.0h
                - generic "Expected" [ref=f2e157]: —
                - generic "Difference" [ref=f2e160]: —
                - generic "Categories" [ref=f2e163]: —
                - generic "Status" [ref=f2e166]: —
                - link "Open time entries for Tue 2026-09-22" [ref=f2e169] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22
                  - text: Open day entries
              - article [ref=f2e170]:
                - generic "Day" [ref=f2e171]: Wed · 2026-09-23
                - generic "Actual" [ref=f2e174]: 0.0h
                - generic "Expected" [ref=f2e177]: —
                - generic "Difference" [ref=f2e180]: —
                - generic "Categories" [ref=f2e183]: —
                - generic "Status" [ref=f2e186]: —
                - link "Open time entries for Wed 2026-09-23" [ref=f2e189] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-23&to=2026-09-23
                  - text: Open day entries
              - article [ref=f2e190]:
                - generic "Day" [ref=f2e191]: Thu · 2026-09-24
                - generic "Actual" [ref=f2e194]: 0.0h
                - generic "Expected" [ref=f2e197]: —
                - generic "Difference" [ref=f2e200]: —
                - generic "Categories" [ref=f2e203]: —
                - generic "Status" [ref=f2e206]: —
                - link "Open time entries for Thu 2026-09-24" [ref=f2e209] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-24&to=2026-09-24
                  - text: Open day entries
              - article [ref=f2e210]:
                - generic "Day" [ref=f2e211]: Fri · 2026-09-25
                - generic "Actual" [ref=f2e214]: 0.0h
                - generic "Expected" [ref=f2e217]: —
                - generic "Difference" [ref=f2e220]: —
                - generic "Categories" [ref=f2e223]: —
                - generic "Status" [ref=f2e226]: —
                - link "Open time entries for Fri 2026-09-25" [ref=f2e229] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-25&to=2026-09-25
                  - text: Open day entries
              - article [ref=f2e230]:
                - generic "Day" [ref=f2e231]: Sat · 2026-09-26
                - generic "Actual" [ref=f2e234]: 0.0h
                - generic "Expected" [ref=f2e237]: —
                - generic "Difference" [ref=f2e240]: —
                - generic "Categories" [ref=f2e243]: —
                - generic "Status" [ref=f2e246]: —
                - link "Open time entries for Sat 2026-09-26" [ref=f2e249] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-26&to=2026-09-26
                  - text: Open day entries
              - article [ref=f2e250]:
                - generic "Day" [ref=f2e251]: Sun · 2026-09-27
                - generic "Actual" [ref=f2e254]: 0.0h
                - generic "Expected" [ref=f2e257]: —
                - generic "Difference" [ref=f2e260]: —
                - generic "Categories" [ref=f2e263]: —
                - generic "Status" [ref=f2e266]: —
                - link "Open time entries for Sun 2026-09-27" [ref=f2e269] [cursor=pointer]:
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-27&to=2026-09-27
                  - text: Open day entries
          - group [ref=f2e270]:
            - generic "Copy previous week layout" [ref=f2e271] [cursor=pointer]
        - form "Filter time entries" [ref=f2e272]:
          - generic [ref=f2e273]:
            - generic [ref=f2e274]: Search register
            - searchbox "Search register" [ref=f2e275]
          - generic [ref=f2e276]:
            - generic [ref=f2e277]: Project
            - combobox "Project" [ref=f2e278]:
              - option "All projects" [selected]
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo"
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
          - generic [ref=f2e279]:
            - generic [ref=f2e280]: Status
            - combobox "Status" [ref=f2e281]:
              - option "All statuses" [selected]
              - option "Needs attention"
              - option "Draft"
              - option "Submitted"
              - option "Approved"
              - option "Needs changes"
          - region [ref=f2e282]:
            - group [ref=f2e283]:
              - 'generic "Filter time entries Active filters: 2" [ref=f2e284] [cursor=pointer]':
                - generic [ref=f2e285]:
                  - heading "Filter time entries" [level=2] [ref=f2e286]
                  - generic [ref=f2e287]: "Active filters: 2"
              - generic [ref=f2e291]:
                - generic [ref=f2e292]:
                  - generic [ref=f2e293]: Client
                  - combobox "Client" [ref=f2e294]:
                    - option "All clients" [selected]
                - generic [ref=f2e295]:
                  - generic [ref=f2e296]: From
                  - textbox "From" [ref=f2e297]: 2026-09-22
                - generic [ref=f2e298]:
                  - generic [ref=f2e299]: To
                  - textbox "To" [ref=f2e300]: 2026-09-22
                - generic [ref=f2e301]:
                  - generic [ref=f2e302]: Sort by
                  - combobox "Sort by" [ref=f2e303]:
                    - option "Newest first" [selected]
                    - option "Oldest first"
                    - option "Name"
                    - option "Status"
                - generic [ref=f2e304]:
                  - generic [ref=f2e305]: Category
                  - combobox "Category" [ref=f2e306]:
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
          - button "Apply filters" [ref=f2e308] [cursor=pointer]
          - navigation "Quick date filters" [ref=f2e309]:
            - generic [ref=f2e310]: Period
            - link "Today" [ref=f2e311] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&to=2026-09-22&q=&lang=en
            - link "This week" [ref=f2e312] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-21&to=2026-09-27&q=&lang=en
            - link "This month" [ref=f2e313] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-01&to=2026-09-30&q=&lang=en
            - link "Last month" [ref=f2e314] [cursor=pointer]:
              - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-08-01&to=2026-08-31&q=&lang=en
          - generic [ref=f2e315]:
            - generic [ref=f2e316]:
              - status [ref=f2e317]:
                - strong [ref=f2e318]: "Active filters: 2"
                - generic [ref=f2e319]: 0 matching records
              - link "Clear filters" [ref=f2e320] [cursor=pointer]:
                - /url: /j-aautomation/app/time?week=2026-09-21&q=
            - list "Active filters" [ref=f2e321]:
              - listitem [ref=f2e322]:
                - 'link "Remove filter: From: 2026-09-22" [ref=f2e323] [cursor=pointer]':
                  - /url: /j-aautomation/app/time?week=2026-09-21&to=2026-09-22&q=&lang=en
                  - generic [ref=f2e324]: "From:"
                  - text: 2026-09-22
                  - generic [ref=f2e325]: ×
              - listitem [ref=f2e326]:
                - 'link "Remove filter: To: 2026-09-22" [ref=f2e327] [cursor=pointer]':
                  - /url: /j-aautomation/app/time?week=2026-09-21&from=2026-09-22&q=&lang=en
                  - generic [ref=f2e328]: "To:"
                  - text: 2026-09-22
                  - generic [ref=f2e329]: ×
        - region [ref=f2e330]:
          - generic [ref=f2e331]:
            - generic [ref=f2e332]:
              - text: ACTIVITY REGISTER
              - heading "Recent time entries" [level=3] [ref=f2e333]
            - generic [ref=f2e334]: "0"
          - status [ref=f2e336]:
            - strong [ref=f2e337]: No matching records.
            - generic [ref=f2e338]: Clear filters to see more records.
      - dialog [ref=f2e340]:
        - generic [ref=f2e341]:
          - generic [ref=f2e342]:
            - paragraph [ref=f2e343]: J&A Automation
            - heading "Log time" [level=2] [ref=f2e344]
            - paragraph [ref=f2e345]: Operational entry only. Commercial rules are applied separately.
          - button "Close time form" [active] [ref=f2e346] [cursor=pointer]:
            - generic [ref=f2e347]: ×
        - generic [ref=f2e350]:
          - generic [ref=f2e351]:
            - strong [ref=f2e352]: Capture actual work
            - generic [ref=f2e353]: Enter what happened on site, not its commercial interpretation.
          - generic [ref=f2e354]:
            - generic [ref=f2e355]: Assigned project
            - combobox "Assigned project" [ref=f2e356]:
              - option "Select assignment" [selected]
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo"
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
          - generic [ref=f2e357]:
            - generic [ref=f2e358]: Date
            - textbox "Date" [ref=f2e359]: 2026-09-22
          - generic [ref=f2e360]:
            - generic [ref=f2e361]: Operational category
            - combobox "Operational category" [ref=f2e362]:
              - option "Work" [selected]
              - option "Overtime"
              - option "Travel"
              - option "Standby"
              - option "Commissioning"
              - option "Weekend / holiday"
              - option "Remote support"
              - option "Training"
              - option "Internal"
          - group "Time range" [ref=f2e363]:
            - generic [ref=f2e365]:
              - generic [ref=f2e366]: Start time
              - textbox "Start time" [ref=f2e367]
            - generic [ref=f2e368]:
              - generic [ref=f2e369]: End time
              - textbox "End time" [ref=f2e370]
            - generic [ref=f2e371]:
              - generic [ref=f2e372]: Break (minutes)
              - spinbutton "Break (minutes)" [ref=f2e373]: "0"
            - generic [ref=f2e374]:
              - generic [ref=f2e375]: Calculated duration
              - status [ref=f2e376]: —
            - paragraph [ref=f2e377]: The duration is calculated from the start and end times, less any break. Use the project's local time. Start and end must be on the selected date.
          - generic [ref=f2e378]:
            - generic [ref=f2e379]: Activity summary
            - textbox "Activity summary" [ref=f2e380]: Keep my field notes
          - generic [ref=f2e381]:
            - button "Cancel" [ref=f2e382] [cursor=pointer]
            - button "Save draft" [ref=f2e383] [cursor=pointer]
    - navigation "Mobile navigation" [ref=f2e384]:
      - link "Today" [ref=f2e385] [cursor=pointer]:
        - /url: /j-aautomation/app/
      - link "Time" [ref=f2e386] [cursor=pointer]:
        - /url: /j-aautomation/app/time
      - link "Expenses" [ref=f2e387] [cursor=pointer]:
        - /url: /j-aautomation/app/expenses
      - link "Reports" [ref=f2e388] [cursor=pointer]:
        - /url: /j-aautomation/app/reports
      - button "More" [ref=f2e389] [cursor=pointer]
  - generic [ref=f2e390]: Time entries | J&A Portal
```

# Test source

```ts
  21  |           'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
  22  |         )
  23  |         .run(id, worker.id, 'missing_time', `missing-time:inbox-${id}`, new Date().toISOString());
  24  |   } finally {
  25  |     sqlite.close();
  26  |   }
  27  |   await page.goto(portal('/notifications?lang=es&read=unread'));
  28  |   const row = page.locator(`[data-notification-id="${ids[0]}"]`);
  29  |   await expect(row).toBeVisible();
  30  |   const mark = row.getByRole('button', { name: 'Marcar como leído' });
  31  |   // Route action query also includes the selected language/filter; match the action by URL.
  32  |   await page.route(
  33  |     (url) => url.search.includes('/markNotificationRead'),
  34  |     (route) => route.abort(),
  35  |     { times: 1 },
  36  |   );
  37  |   await mark.click();
  38  |   await expect(page.locator('.inbox-feedback')).toContainText('No se pudo actualizar');
  39  |   await expect(row).toBeVisible();
  40  |   await page.unrouteAll({ behavior: 'wait' });
  41  |   await mark.click();
  42  |   await expect(row).toHaveCount(0);
  43  |   await expect(page.locator(`[data-notification-id="${ids[1]}"]`)).toBeVisible();
  44  |   await expect(page.locator('.inbox-feedback')).toBeFocused();
  45  |   const db = createDatabase(e2eDatabasePath);
  46  |   try {
  47  |     expect(
  48  |       (
  49  |         db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(ids[0]) as {
  50  |           read_at: string;
  51  |         }
  52  |       ).read_at,
  53  |     ).toBeTruthy();
  54  |     expect(
  55  |       (
  56  |         db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(ids[1]) as {
  57  |           read_at: string | null;
  58  |         }
  59  |       ).read_at,
  60  |     ).toBeNull();
  61  |   } finally {
  62  |     db.sqlite.close();
  63  |   }
  64  |   const nav = page.getByRole('navigation', { name: 'Filtros de notificaciones' });
  65  |   await nav.getByRole('link', { name: /^Todas/ }).click();
  66  |   await expect(page.locator(`[data-notification-id="${ids[0]}"]`)).toBeVisible();
  67  |   await expect(page.locator(`[data-notification-id="${ids[0]}"]`).getByRole('button')).toHaveCount(
  68  |     0,
  69  |   );
  70  |   expect(
  71  |     (await new AxeBuilder({ page }).include('.notification-inbox').analyze()).violations,
  72  |   ).toEqual([]);
  73  |   for (const button of await page.locator('.notification-inbox button').all())
  74  |     expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  75  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  76  |   await page.screenshot({ path: info.outputPath('notification-inbox.png'), fullPage: false });
  77  | });
  78  | 
  79  | test('operational sheets protect changed text on cancel, Escape and navigation', async ({
  80  |   page,
  81  | }, info) => {
  82  |   await signIn(page, 'worker');
  83  |   await page.goto(portal('/time?lang=en'));
  84  |   await page.getByRole('navigation', { name: 'Quick date filters' }).getByRole('link', { name: 'Today', exact: true }).click();
  85  |   await page.getByRole('button', { name: 'Log time', exact: true }).click();
  86  |   const sheet = page.getByRole('dialog', { name: 'Log time', exact: true });
  87  |   await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  88  |   await expect(sheet).not.toBeVisible();
  89  |   await page.getByRole('button', { name: 'Log time', exact: true }).click();
  90  |   const notes = sheet.locator('textarea').first();
  91  |   await notes.fill('Keep my field notes');
  92  |   for (const close of [
  93  |     () => sheet.getByRole('button', { name: 'Cancel', exact: true }).click(),
  94  |     () => page.keyboard.press('Escape'),
  95  |     () => sheet.getByRole('button', { name: 'Close time form' }).click(),
  96  |   ]) {
  97  |     const dialogPromise = page.waitForEvent('dialog');
  98  |     const click = close();
  99  |     const dialog = await dialogPromise;
  100 |     expect(dialog.message()).toContain('unsaved changes');
  101 |     await dialog.dismiss();
  102 |     await click;
  103 |     await expect(sheet).toBeVisible();
  104 |     await expect(notes).toHaveValue('Keep my field notes');
  105 |   }
  106 |   const originalUrl = page.url();
  107 |   const backDialog = page.waitForEvent('dialog');
  108 |   await page.evaluate(() => history.back());
  109 |   const confirmation = await backDialog;
  110 |   expect(confirmation.message()).toContain('unsaved changes');
  111 |   await confirmation.dismiss();
  112 |   await expect(page).toHaveURL(originalUrl);
  113 |   await expect(notes).toHaveValue('Keep my field notes');
  114 |   await expect(sheet).toBeVisible();
  115 |   const reloadDialog = page.waitForEvent('dialog');
  116 |   const reload = page.reload().catch(() => null);
  117 |   const unloadConfirmation = await reloadDialog;
  118 |   expect(unloadConfirmation.type()).toBe('beforeunload');
  119 |   await unloadConfirmation.dismiss();
  120 |   await reload;
> 121 |   await expect(notes).toHaveValue('Keep my field notes');
      |                       ^ Error: expect(locator).toHaveValue(expected) failed
  122 |   // A repeated navigation shortcut cannot steal focus from the modal.
  123 |   await notes.focus();
  124 |   await page.keyboard.press('Control+k');
  125 |   await expect(notes).toBeFocused();
  126 |   await expect(page.locator('dialog[open]')).toHaveCount(0);
  127 |   await page.screenshot({ path: info.outputPath('protected-time-form.png') });
  128 |   page.once('dialog', (dialog) => dialog.accept());
  129 |   await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  130 |   await expect(sheet).not.toBeVisible();
  131 | });
  132 | 
  133 | test('project register uses one search and status filter', async ({ page }) => {
  134 |   await signIn(page, 'manager');
  135 |   await page.goto(portal('/projects?lang=en'));
  136 |   const section = page.locator('[data-ui="project-section"]');
  137 |   await expect(section.getByRole('searchbox')).toHaveCount(1);
  138 |   await expect(section.getByRole('combobox', { name: 'Status', exact: true })).toHaveCount(1);
  139 |   await section.getByRole('searchbox').fill('NO_MATCH_PROJECT_000');
  140 |   await expect(section.getByText('No projects found', { exact: true })).toBeVisible();
  141 |   await section.getByRole('link', { name: 'Clear filters', exact: true }).click();
  142 |   await expect(section.getByRole('searchbox')).toHaveValue('');
  143 |   await expect(section.getByText('No projects found', { exact: true })).toHaveCount(0);
  144 | });
  145 | 
```