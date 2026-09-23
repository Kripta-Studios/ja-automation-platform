# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-resilience.spec.ts >> expense validation retains the receipt and values, then creation and editing succeed
- Location: tests/e2e/form-resilience.spec.ts:39:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-ui="responsive-sheet"]')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('[data-ui="responsive-sheet"]')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=f3e2]:
  - link "Skip to main content":
    - /url: "#portal-main"
  - generic [ref=f3e3]:
    - complementary "Portal navigation" [ref=f3e4]:
      - link [ref=f3e5] [cursor=pointer]:
        - /url: /j-aautomation/app/
        - img "J&A Automation" [ref=f3e6]
      - navigation "Primary navigation" [ref=f3e7]:
        - link "Today" [ref=f3e8] [cursor=pointer]:
          - /url: /j-aautomation/app/
        - link "Time" [ref=f3e13] [cursor=pointer]:
          - /url: /j-aautomation/app/time
        - link "Expenses" [ref=f3e18] [cursor=pointer]:
          - /url: /j-aautomation/app/expenses
        - link "Reports" [ref=f3e23] [cursor=pointer]:
          - /url: /j-aautomation/app/reports
        - generic [ref=f3e28]: SECONDARY
        - link "My Pay" [ref=f3e29] [cursor=pointer]:
          - /url: /j-aautomation/app/pay
        - link "Profile" [ref=f3e34] [cursor=pointer]:
          - /url: /j-aautomation/app/profile
      - link "Company Webmail" [ref=f3e39] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f3e45]: ↗
      - button "Sign out" [ref=f3e46]
    - banner [ref=f3e47]:
      - generic [ref=f3e48]: Online
      - button "Go to section" [ref=f3e51] [cursor=pointer]:
        - generic [ref=f3e58]: ⌘/Ctrl K
      - link "Notifications" [ref=f3e59] [cursor=pointer]:
        - /url: /j-aautomation/app/notifications
      - link "Company Webmail" [ref=f3e62] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f3e66]: Webmail
      - generic [ref=f3e67]:
        - generic [ref=f3e68]: Language
        - combobox "Language" [ref=f3e69]:
          - option "EN" [selected]
          - option "ES"
          - option "PT-BR"
      - button "Account options" [ref=f3e71] [cursor=pointer]:
        - generic [ref=f3e72]: AR
        - generic [ref=f3e73]:
          - generic [ref=f3e74]: Alex Rivera
          - generic [ref=f3e75]: Worker
    - main [ref=f3e79]:
      - generic [ref=f3e80]:
        - generic [ref=f3e81]:
          - paragraph [ref=f3e82]: J&A / Expenses and receipts
          - heading "Expenses and receipts" [level=1] [ref=f3e83]
        - generic [ref=f3e84]:
          - button "Print report" [ref=f3e85]
          - search [ref=f3e89]:
            - generic [ref=f3e90]: Search workspace
            - combobox "Search workspace" [ref=f3e91]
            - button "Search" [ref=f3e92] [cursor=pointer]
      - generic [ref=f3e93]:
        - generic [ref=f3e94]:
          - generic [ref=f3e95]:
            - paragraph [ref=f3e96]: Worker operations
            - heading "Expenses and reimbursements" [level=2] [ref=f3e97]
            - paragraph [ref=f3e98]: Record the receipt and operational facts. Finance handles later classification.
          - generic "Expense count" [ref=f3e99]: "10"
        - button "Record expense" [ref=f3e101] [cursor=pointer]:
          - generic [ref=f3e102]: ＋
          - text: Record expense
        - generic "Expense attention summary" [ref=f3e103]:
          - link "Needs attention 1 Draft or review state" [ref=f3e104] [cursor=pointer]:
            - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&q=&lang=en&status=attention
            - generic [ref=f3e105]: Needs attention
            - strong [ref=f3e106]: "1"
            - generic [ref=f3e107]: Draft or review state
          - link "Reimbursement 5 Pending or scheduled" [ref=f3e108] [cursor=pointer]:
            - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&q=&lang=en&reimbursement=pending
            - generic [ref=f3e109]: Reimbursement
            - strong [ref=f3e110]: "5"
            - generic [ref=f3e111]: Pending or scheduled
          - link "Required receipt missing 0 Review supporting evidence before approval" [ref=f3e112] [cursor=pointer]:
            - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&q=&lang=en&receipt=missing
            - generic [ref=f3e113]: Required receipt missing
            - strong [ref=f3e114]: "0"
            - generic [ref=f3e115]: Review supporting evidence before approval
        - form "Filter expenses" [ref=f3e116]:
          - generic [ref=f3e117]:
            - generic [ref=f3e118]: Search expenses
            - searchbox "Search expenses" [ref=f3e119]
          - generic [ref=f3e120]:
            - generic [ref=f3e121]: Project
            - combobox "Project" [ref=f3e122]:
              - option "All projects"
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [selected]
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
          - generic [ref=f3e123]:
            - generic [ref=f3e124]: Status
            - combobox "Status" [ref=f3e125]:
              - option "All statuses" [selected]
              - option "Needs attention"
              - option "Draft"
              - option "Submitted"
              - option "Approved"
              - option "Needs changes"
          - region [ref=f3e126]:
            - group [ref=f3e127]:
              - heading "Filter expenses" [level=2] [ref=f3e130] [cursor=pointer]
              - option "All clients" [selected]
              - option "BlueRiver Process · Demo"
              - option "Northline Mobility · Demo"
              - option "All categories" [selected]
              - option "Hotel"
              - option "Rental car"
              - option "Fuel"
              - option "Tolls"
              - option "Parking"
              - option "Airfare"
              - option "Train / bus / taxi / rideshare"
              - option "Meals"
              - option "Per diem"
              - option "Project materials"
              - option "Tools / consumables"
              - option "Shipping"
              - option "Phone / data"
              - option "Visa / permit"
              - option "Other"
              - option "All currencies" [selected]
              - option "USD"
              - option "EUR"
              - option "BRL"
              - option "All receipts" [selected]
              - option "Required receipt missing"
              - option "Receipt attached"
              - option "Receipt not required"
              - option "All statuses" [selected]
              - option "Pending or scheduled"
              - option "Reimbursed"
              - option "Newest first" [selected]
              - option "Oldest first"
              - option "Name"
              - option "Status"
          - button "Apply filters" [ref=f3e133] [cursor=pointer]
          - navigation "Quick date filters" [ref=f3e134]:
            - generic [ref=f3e135]: Period
            - link "Today" [ref=f3e136] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-09-22&to=2026-09-22&q=&lang=en
            - link "This week" [ref=f3e137] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-09-21&to=2026-09-27&q=&lang=en
            - link "This month" [ref=f3e138] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-09-01&to=2026-09-30&q=&lang=en
            - link "Last month" [ref=f3e139] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-08-01&to=2026-08-31&q=&lang=en
          - generic [ref=f3e140]:
            - generic [ref=f3e141]:
              - status [ref=f3e142]:
                - strong [ref=f3e143]: "Active filters: 1"
                - generic [ref=f3e144]: 3 matching records
              - link "Clear filters" [ref=f3e145] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses?q=
            - list "Active filters" [ref=f3e146]:
              - listitem [ref=f3e147]:
                - 'link "Remove filter: Project: C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [ref=f3e148] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses?q=&lang=en
                  - generic [ref=f3e149]: "Project:"
                  - text: C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo
                  - generic [ref=f3e150]: ×
        - region [ref=f3e151]:
          - generic [ref=f3e152]:
            - heading "Export filtered results" [level=3] [ref=f3e153]
            - paragraph [ref=f3e154]: Download exactly the expenses currently selected by the register filters.
          - generic [ref=f3e155]:
            - link "Download PDF" [ref=f3e156] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses/export?from=2026-08-11&to=2026-09-22&format=pdf&project=01a0cb07-70c7-72de-b34a-78ebf7cdb311
            - link "Download Excel" [ref=f3e157] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses/export?from=2026-08-11&to=2026-09-22&format=xlsx&project=01a0cb07-70c7-72de-b34a-78ebf7cdb311
            - link "Download CSV" [ref=f3e158] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses/export?from=2026-08-11&to=2026-09-22&format=csv&project=01a0cb07-70c7-72de-b34a-78ebf7cdb311
        - region [ref=f3e159]:
          - group [ref=f3e160]:
            - heading "Create report with another scope" [level=2] [ref=f3e163] [cursor=pointer]
            - option "All projects" [selected]
            - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo"
            - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
            - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
            - option "All clients" [selected]
            - option "BlueRiver Process · Demo"
            - option "Northline Mobility · Demo"
            - option "All categories" [selected]
            - option "Hotel"
            - option "Rental car"
            - option "Fuel"
            - option "Tolls"
            - option "Parking"
            - option "Airfare"
            - option "Train / bus / taxi / rideshare"
            - option "Meals"
            - option "Per diem"
            - option "Project materials"
            - option "Tools / consumables"
            - option "Shipping"
            - option "Phone / data"
            - option "Visa / permit"
            - option "Other"
            - option "All currencies" [selected]
            - option "USD"
            - option "EUR"
            - option "BRL"
            - option "All statuses" [selected]
            - option "Draft"
            - option "Submitted"
            - option "Approved"
            - option "Needs changes"
            - option "All statuses" [selected]
            - option "Pending or scheduled"
            - option "Reimbursed"
        - region [ref=f3e166]:
          - heading "Recent expenses" [level=2] [ref=f3e167]
          - generic [ref=f3e168]:
            - article [ref=f3e169]:
              - link "Resilient receipt cb375e66-4508-40ac-8718-0503f5586d4b corrected $15.25 2026-09-22 · C-0001-P-001 · Hotel Open record →" [ref=f3e170] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses/01a0cb07-a64e-7713-b79b-05537f87238b
                - generic [ref=f3e171]:
                  - strong [ref=f3e172]: Resilient receipt cb375e66-4508-40ac-8718-0503f5586d4b corrected
                  - generic [ref=f3e173]: $15.25
                - generic [ref=f3e174]: 2026-09-22 · C-0001-P-001 · Hotel
                - generic [ref=f3e175]: Open record →
              - generic [ref=f3e176]:
                - generic [ref=f3e177]: Receipt attached
                - 'link "Open record: Draft" [ref=f3e178] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses?edit=01a0cb07-a64e-7713-b79b-05537f87238b
                  - generic [ref=f3e179]: Draft
                - 'link "Reimbursement: Pending" [ref=f3e180] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-a64e-7713-b79b-05537f87238b
              - generic [ref=f3e182]:
                - button "Edit" [ref=f3e183] [cursor=pointer]
                - button "Submit" [ref=f3e185] [cursor=pointer]
                - button "Delete" [ref=f3e187] [cursor=pointer]
            - article [ref=f3e188]:
              - link "Demo Calibration Supplies $350.00 2026-08-12 · C-0001-P-001 · Project materials Open record →" [ref=f3e189] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses/01a0cb07-71eb-7030-a005-1ac5a4326e45
                - generic [ref=f3e190]:
                  - strong [ref=f3e191]: Demo Calibration Supplies
                  - generic [ref=f3e192]: $350.00
                - generic [ref=f3e193]: 2026-08-12 · C-0001-P-001 · Project materials
                - generic [ref=f3e194]: Open record →
              - generic [ref=f3e195]:
                - generic [ref=f3e196]: Receipt attached
                - 'link "Open record: Approved" [ref=f3e197] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-71eb-7030-a005-1ac5a4326e45
                  - generic [ref=f3e198]: Approved
                - 'link "Reimbursement: Pending" [ref=f3e199] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-71eb-7030-a005-1ac5a4326e45
              - generic [ref=f3e202]:
                - generic [ref=f3e203]:
                  - text: Correction reason
                  - textbox "Correction reason" [ref=f3e204]
                - button "Create corrected draft" [ref=f3e205] [cursor=pointer]
            - article [ref=f3e206]:
              - link "Demo Airport Hotel $189.00 2026-08-11 · C-0001-P-001 · Hotel Open record →" [ref=f3e207] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses/01a0cb07-7190-7180-865c-18ce225bb00d
                - generic [ref=f3e208]:
                  - strong [ref=f3e209]: Demo Airport Hotel
                  - generic [ref=f3e210]: $189.00
                - generic [ref=f3e211]: 2026-08-11 · C-0001-P-001 · Hotel
                - generic [ref=f3e212]: Open record →
              - generic [ref=f3e213]:
                - generic [ref=f3e214]: Receipt attached
                - 'link "Open record: Approved" [ref=f3e215] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-7190-7180-865c-18ce225bb00d
                  - generic [ref=f3e216]: Approved
                - 'link "Reimbursement: Pending" [ref=f3e217] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-7190-7180-865c-18ce225bb00d
              - generic [ref=f3e220]:
                - generic [ref=f3e221]:
                  - text: Correction reason
                  - textbox "Correction reason" [ref=f3e222]
                - button "Create corrected draft" [ref=f3e223] [cursor=pointer]
        - dialog [ref=f3e225]:
          - generic [ref=f3e226]:
            - generic [ref=f3e227]:
              - paragraph [ref=f3e228]: J&A Automation
              - heading "Record expense" [level=2] [ref=f3e229]
              - paragraph [ref=f3e230]: Operational entry only. Commercial treatment is handled separately.
            - button "Close expense form" [ref=f3e231] [cursor=pointer]:
              - generic [ref=f3e232]: ×
          - generic [ref=f3e234]:
            - alert [active] [ref=f3e235]: This action conflicts with the current record state.
            - generic [ref=f3e236]:
              - alert [ref=f3e237]: "Please correct the following fields: Review this field."
              - generic [ref=f3e238]:
                - strong [ref=f3e239]: Capture what happened
                - generic [ref=f3e240]: Use the receipt and operational details you know on site.
              - generic [ref=f3e241]:
                - generic [ref=f3e242]: Receipt image or PDF
                - button "Receipt image or PDF JPG, PNG, HEIC or PDF up to 10 MB" [ref=f3e243]
                - generic [ref=f3e244]: JPG, PNG, HEIC or PDF up to 10 MB
              - generic [ref=f3e245]:
                - strong [ref=f3e246]: Receipt preview
                - img "receipt.png" [ref=f3e247]
              - generic [ref=f3e248]:
                - generic [ref=f3e249]: Project
                - combobox "Project" [ref=f3e250]:
                  - option "Select assignment"
                  - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [selected]
                  - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
                  - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
              - generic [ref=f3e251]:
                - generic [ref=f3e252]:
                  - generic [ref=f3e253]: Date
                  - textbox "Date" [ref=f3e254]: 2026-09-22
                - generic [ref=f3e255]:
                  - generic [ref=f3e256]: Category
                  - combobox "Category" [ref=f3e257]:
                    - option "Hotel" [selected]
                    - option "Rental car"
                    - option "Fuel"
                    - option "Tolls"
                    - option "Parking"
                    - option "Airfare"
                    - option "Train / bus / taxi / rideshare"
                    - option "Meals"
                    - option "Per diem"
                    - option "Project materials"
                    - option "Tools / consumables"
                    - option "Shipping"
                    - option "Phone / data"
                    - option "Visa / permit"
                    - option "Other"
              - generic [ref=f3e258]:
                - generic [ref=f3e259]: Vendor
                - textbox "Vendor" [ref=f3e260]: Resilient receipt 199da7af-5e1e-444a-baa4-3e3ab9a47d45
              - generic [ref=f3e261]:
                - generic [ref=f3e262]:
                  - generic [ref=f3e263]: Amount
                  - textbox "Amount" [ref=f3e264]: "12.50"
                - generic [ref=f3e265]:
                  - generic [ref=f3e266]: Currency
                  - combobox "Currency" [ref=f3e267]:
                    - option "USD" [selected]
                    - option "BRL"
                    - option "EUR"
              - generic [ref=f3e268]:
                - generic [ref=f3e269]: Who paid
                - combobox "Who paid" [ref=f3e270]:
                  - option "Worker" [selected]
                  - option "Company card"
                  - option "Company direct"
                  - option "Client paid directly"
                  - option "Third party"
              - generic [ref=f3e271]:
                - generic [ref=f3e272]: Description
                - textbox "Description" [ref=f3e273]: Travel receipt retained through a failed save.
              - generic [ref=f3e274]:
                - generic [ref=f3e275]: Payment method
                - textbox "Payment method" [ref=f3e276]:
                  - /placeholder: Card, transfer or cash
              - generic [ref=f3e277]:
                - button "Cancel" [ref=f3e278] [cursor=pointer]
                - button "Save draft" [ref=f3e279] [cursor=pointer]
```

# Test source

```ts
  1   | import { randomUUID } from 'node:crypto';
  2   | import AxeBuilder from '@axe-core/playwright';
  3   | import sharp from 'sharp';
  4   | import { expect, test, type Locator, type Page } from '@playwright/test';
  5   | import { portal, signIn } from './auth.js';
  6   | 
  7   | const viewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);
  8   | 
  9   | async function contextualProject(page: Page, section: 'expenses' | 'reports'): Promise<string> {
  10  |   await page.goto(portal(`/${section}?lang=en&q=`), { waitUntil: 'networkidle' });
  11  |   const projectId = await page
  12  |     .locator(`form select[name="project"]`)
  13  |     .first()
  14  |     .evaluate(
  15  |       (select: HTMLSelectElement) =>
  16  |         Array.from(select.options).find((option) => option.value)?.value,
  17  |     );
  18  |   if (!projectId) throw new Error('The operational fixture must have an authorized project.');
  19  |   await page.goto(portal(`/${section}?lang=en&q=&project=${encodeURIComponent(projectId)}`), {
  20  |     waitUntil: 'networkidle',
  21  |   });
  22  |   return projectId;
  23  | }
  24  | 
  25  | async function expectContext(form: Locator, projectId: string, dateField: string): Promise<void> {
  26  |   await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
  27  |   const today = await form.evaluate(() => {
  28  |     const date = new Date();
  29  |     return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  30  |   });
  31  |   await expect(form.locator(`[name="${dateField}"]`)).toHaveValue(today);
  32  | }
  33  | 
  34  | async function fillExpense(form: Locator, vendor: string): Promise<void> {
  35  |   await form.locator('[name="vendor"]').fill(vendor);
  36  |   await form.locator('[name="amount"]').fill('12.50');
  37  |   await form.locator('[name="description"]').fill('Travel receipt retained through a failed save.');
  38  | }
  39  | 
  40  | test('expense validation retains the receipt and values, then creation and editing succeed', async ({
  41  |   page,
  42  | }, info) => {
  43  |   test.skip(!viewports.has(info.project.name));
  44  |   await signIn(page, 'worker');
  45  |   const projectId = await contextualProject(page, 'expenses');
  46  |   await page.locator('[data-expense-primary-cta]').click();
  47  |   const sheet = page.locator('[data-ui="responsive-sheet"]');
  48  |   const form = sheet.locator('[data-expense-entry-surface]');
  49  |   await expectContext(form, projectId, 'spentOn');
  50  |   const vendor = `Resilient receipt ${randomUUID()}`;
  51  |   await fillExpense(form, vendor);
  52  |   await form.locator('[name="receipt"]').setInputFiles({
  53  |     name: 'invalid-receipt.pdf',
  54  |     mimeType: 'application/pdf',
  55  |     buffer: Buffer.from('invalid PDF bytes'),
  56  |   });
  57  |   // Native format checking is deliberately removed in this isolated DOM to exercise the
  58  |   // server's amountMinor field contract and its mapping back to the visible amount input.
  59  |   await form.locator('[name="amount"]').evaluate((input) => input.removeAttribute('pattern'));
  60  |   await form.locator('[name="amount"]').fill('12,50');
  61  |   await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  62  |   await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  63  |   await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
  64  |   await expect(form.locator('[name="vendor"]')).toHaveValue(vendor);
  65  |   await expect(form.locator('[name="amount"]')).toHaveValue('12,50');
  66  |   expect(
  67  |     await form
  68  |       .locator('[name="receipt"]')
  69  |       .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  70  |   ).toBe('invalid-receipt.pdf');
  71  |   await form.locator('[name="amount"]').fill('12.50');
  72  |   await expect(form.locator('[name="amount"]')).not.toHaveAttribute('aria-invalid', 'true');
  73  |   await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  74  |   await expect(sheet.locator('[data-operational-form-error]')).toContainText('Receipt');
  75  |   await expect(form.locator('[name="vendor"]')).toHaveValue(vendor);
  76  |   expect(
  77  |     await form
  78  |       .locator('[name="receipt"]')
  79  |       .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  80  |   ).toBe('invalid-receipt.pdf');
  81  |   await form.locator('[name="receipt"]').setInputFiles({
  82  |     name: 'receipt.png',
  83  |     mimeType: 'image/png',
  84  |     // Each viewport/retry needs its own valid content: the repository correctly rejects
  85  |     // a receipt hash already registered by another fixture record.
  86  |     buffer: await sharp(Buffer.from(randomUUID().replaceAll('-', ''), 'hex'), {
  87  |       raw: { width: 2, height: 2, channels: 4 },
  88  |     })
> 89  |       .png()
      |                       ^ Error: expect(locator).toHaveCount(expected) failed
  90  |       .toBuffer(),
  91  |   });
  92  |   await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  93  |   await expect(sheet).toHaveCount(0);
  94  |   await page.locator('.expense-filters [name="q"]').fill(vendor);
  95  |   const row = page.locator('[data-expense-record]').filter({ hasText: vendor });
  96  |   await expect(row).toHaveCount(1);
  97  |   await row.getByRole('button', { name: 'Edit', exact: true }).click();
  98  |   await expect(form).toBeVisible();
  99  |   const newVendor = `${vendor} corrected`;
  100 |   await form.locator('[name="vendor"]').fill(newVendor);
  101 |   await form.locator('[name="amount"]').evaluate((input) => input.removeAttribute('pattern'));
  102 |   await form.locator('[name="amount"]').fill('bad amount');
  103 |   await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  104 |   await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
  105 |   await expect(form.locator('[name="vendor"]')).toHaveValue(newVendor);
  106 |   await form.locator('[name="amount"]').fill('15.25');
  107 |   await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  108 |   await expect(sheet).toHaveCount(0);
  109 |   await expect(row).toContainText(newVendor);
  110 | });
  111 | 
  112 | for (const kind of ['daily', 'technical'] as const) {
  113 |   test(`${kind} report retains all fields after server validation and saves after correction`, async ({
  114 |     page,
  115 |   }, info) => {
  116 |     test.skip(!viewports.has(info.project.name));
  117 |     await signIn(page, 'worker');
  118 |     const projectId = await contextualProject(page, 'reports');
  119 |     const title = kind === 'daily' ? 'New daily report' : 'New technical report';
  120 |     await page.getByRole('button', { name: title, exact: true }).first().click();
  121 |     const sheet = page.locator('[data-ui="responsive-sheet"]');
  122 |     const form = sheet.locator(`[data-report-entry-surface="${kind}"]`);
  123 |     await expectContext(form, projectId, kind === 'daily' ? 'workDate' : 'reportDate');
  124 |     const marker = `Resilient ${kind} ${randomUUID()}`;
  125 |     if (kind === 'daily') {
  126 |       await form.locator('[name="summary"]').fill('   ');
  127 |       await form.locator('[name="tasksCompleted"]').fill(marker);
  128 |       await form.locator('[name="openItems"]').fill('Preserve this pending task.');
  129 |     } else {
  130 |       await form.locator('[name="systemName"]').fill(marker);
  131 |       await form.locator('[name="problemSymptom"]').fill('Intermittent sensor input.');
  132 |       await form.locator('[name="diagnosisRootCause"]').fill('Loose connection.');
  133 |       await form.locator('[name="changePerformed"]').fill('Replaced the connector.');
  134 |       await form.locator('[name="safetyRelated"]').check();
  135 |     }
  136 |     await form.locator('button[type="submit"]').click();
  137 |     await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  138 |     await expect(form).toHaveAttribute('aria-busy', 'false');
  139 |     const validationAccessibility = await new AxeBuilder({ page })
  140 |       .include('[data-ui="responsive-sheet"]')
  141 |       .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  142 |       .analyze();
  143 |     expect(validationAccessibility.violations).toEqual([]);
  144 |     if (kind === 'daily') {
  145 |       await expect(form.locator('[name="summary"]')).toHaveAttribute('aria-invalid', 'true');
  146 |       await expect(form.locator('[name="tasksCompleted"]')).toHaveValue(marker);
  147 |       await expect(form.locator('[name="openItems"]')).toHaveValue('Preserve this pending task.');
  148 |       await form.locator('[name="summary"]').fill('Completed operational validation.');
  149 |     } else {
  150 |       await expect(form.locator('[name="validation"]')).toHaveAttribute('aria-invalid', 'true');
  151 |       await expect(form.locator('[name="rollbackPlan"]')).toHaveAttribute('aria-invalid', 'true');
  152 |       await expect(form.locator('[name="systemName"]')).toHaveValue(marker);
  153 |       await expect(form.locator('[name="safetyRelated"]')).toBeChecked();
  154 |       await form.locator('[name="validation"]').fill('Validated stop and restart with the lead.');
  155 |       await form
  156 |         .locator('[name="rollbackPlan"]')
  157 |         .fill('Restore the previous connector and configuration.');
  158 |     }
  159 |     await form.locator('button[type="submit"]').click();
  160 |     await expect(sheet).toHaveCount(0);
  161 |   });
  162 | }
  163 | 
  164 | test('owner expense save blocks duplicate submits and retains the form after network and server errors', async ({
  165 |   page,
  166 | }, info) => {
  167 |   test.skip(!viewports.has(info.project.name));
  168 |   await signIn(page, 'owner');
  169 |   const projectId = await contextualProject(page, 'expenses');
  170 |   await page.locator('[data-expense-primary-cta]').click();
  171 |   const sheet = page.locator('[data-ui="responsive-sheet"]');
  172 |   const form = sheet.locator('[data-expense-entry-surface]');
  173 |   await expectContext(form, projectId, 'spentOn');
  174 |   const worker = form.locator('[name="workerId"]');
  175 |   const workerId = await worker.evaluate((select: HTMLSelectElement) => select.options[1]?.value);
  176 |   if (!workerId) throw new Error('Owner fixture needs an available worker.');
  177 |   await worker.selectOption(workerId);
  178 |   await fillExpense(form, 'Preserved during network failure');
  179 |   await form.locator('[name="receipt"]').setInputFiles({
  180 |     name: 'retained-network-receipt.pdf',
  181 |     mimeType: 'application/pdf',
  182 |     buffer: Buffer.from('network fixture'),
  183 |   });
  184 |   let requests = 0;
  185 |   let release: (() => void) | undefined;
  186 |   await page.route('**/app/expenses?*/createExpense', async (route) => {
  187 |     requests += 1;
  188 |     await new Promise<void>((resolve) => {
  189 |       release = resolve;
```