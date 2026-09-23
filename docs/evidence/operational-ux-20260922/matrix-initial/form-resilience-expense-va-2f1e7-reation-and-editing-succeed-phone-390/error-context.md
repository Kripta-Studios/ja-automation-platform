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
    - button
    - dialog [ref=f3e4]:
      - link [ref=f3e5] [cursor=pointer]:
        - /url: /j-aautomation/app/
      - navigation [ref=f3e7]:
        - link [ref=f3e8] [cursor=pointer]:
          - /url: /j-aautomation/app/
          - generic [ref=f3e12]: Today
        - link [ref=f3e13] [cursor=pointer]:
          - /url: /j-aautomation/app/time
          - generic [ref=f3e17]: Time
        - link [ref=f3e18] [cursor=pointer]:
          - /url: /j-aautomation/app/expenses
          - generic [ref=f3e22]: Expenses
        - link [ref=f3e23] [cursor=pointer]:
          - /url: /j-aautomation/app/reports
          - generic [ref=f3e27]: Reports
        - generic [ref=f3e28]: SECONDARY
        - link [ref=f3e29] [cursor=pointer]:
          - /url: /j-aautomation/app/pay
          - generic [ref=f3e33]: My Pay
        - link [ref=f3e34] [cursor=pointer]:
          - /url: /j-aautomation/app/profile
          - generic [ref=f3e38]: Profile
      - link [ref=f3e39] [cursor=pointer]:
        - /url: https://webmail.j-aautomation.com/
        - generic [ref=f3e44]: Company Webmail
        - generic [ref=f3e45]: ↗
      - button [ref=f3e46]: Sign out
    - banner [ref=f3e47]:
      - generic [ref=f3e48]:
        - button "Toggle navigation" [ref=f3e49]
        - generic [ref=f3e52]: Online
      - button "Go to section" [ref=f3e54] [cursor=pointer]
      - generic [ref=f3e60]:
        - generic [ref=f3e61]: Language
        - combobox "Language" [ref=f3e62]:
          - option "EN" [selected]
          - option "ES"
          - option "PT-BR"
      - button "Account options" [ref=f3e64] [cursor=pointer]:
        - generic [ref=f3e65]: AR
    - main [ref=f3e66]:
      - generic [ref=f3e67]:
        - generic [ref=f3e68]:
          - paragraph [ref=f3e69]: J&A / Expenses and receipts
          - heading "Expenses and receipts" [level=1] [ref=f3e70]
        - generic [ref=f3e71]:
          - button "Print report" [ref=f3e72]
          - search [ref=f3e76]:
            - generic [ref=f3e77]: Search workspace
            - combobox "Search workspace" [ref=f3e78]
            - button "Search" [ref=f3e79] [cursor=pointer]
      - generic [ref=f3e80]:
        - generic [ref=f3e81]:
          - generic [ref=f3e82]:
            - paragraph [ref=f3e83]: Worker operations
            - heading "Expenses and reimbursements" [level=2] [ref=f3e84]
            - paragraph [ref=f3e85]: Record the receipt and operational facts. Finance handles later classification.
          - generic "Expense count" [ref=f3e86]: "10"
        - button "Record expense" [ref=f3e88] [cursor=pointer]:
          - generic [ref=f3e89]: ＋
          - text: Record expense
        - generic "Expense attention summary" [ref=f3e90]:
          - link "Needs attention 1 Draft or review state" [ref=f3e91] [cursor=pointer]:
            - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&q=&lang=en&status=attention
            - generic [ref=f3e92]: Needs attention
            - strong [ref=f3e93]: "1"
            - generic [ref=f3e94]: Draft or review state
          - link "Reimbursement 5 Pending or scheduled" [ref=f3e95] [cursor=pointer]:
            - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&q=&lang=en&reimbursement=pending
            - generic [ref=f3e96]: Reimbursement
            - strong [ref=f3e97]: "5"
            - generic [ref=f3e98]: Pending or scheduled
          - link "Required receipt missing 0 Review supporting evidence before approval" [ref=f3e99] [cursor=pointer]:
            - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&q=&lang=en&receipt=missing
            - generic [ref=f3e100]: Required receipt missing
            - strong [ref=f3e101]: "0"
            - generic [ref=f3e102]: Review supporting evidence before approval
        - form "Filter expenses" [ref=f3e103]:
          - generic [ref=f3e104]:
            - generic [ref=f3e105]: Search expenses
            - searchbox "Search expenses" [ref=f3e106]
          - generic [ref=f3e107]:
            - generic [ref=f3e108]: Project
            - combobox "Project" [ref=f3e109]:
              - option "All projects"
              - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [selected]
              - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
              - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
          - generic [ref=f3e110]:
            - generic [ref=f3e111]: Status
            - combobox "Status" [ref=f3e112]:
              - option "All statuses" [selected]
              - option "Needs attention"
              - option "Draft"
              - option "Submitted"
              - option "Approved"
              - option "Needs changes"
          - region [ref=f3e113]:
            - group [ref=f3e114]:
              - heading "Filter expenses" [level=2] [ref=f3e117] [cursor=pointer]
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
          - button "Apply filters" [ref=f3e120] [cursor=pointer]
          - navigation "Quick date filters" [ref=f3e121]:
            - generic [ref=f3e122]: Period
            - link "Today" [ref=f3e123] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-09-22&to=2026-09-22&q=&lang=en
            - link "This week" [ref=f3e124] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-09-21&to=2026-09-27&q=&lang=en
            - link "This month" [ref=f3e125] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-09-01&to=2026-09-30&q=&lang=en
            - link "Last month" [ref=f3e126] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses?project=01a0cb07-70c7-72de-b34a-78ebf7cdb311&from=2026-08-01&to=2026-08-31&q=&lang=en
          - generic [ref=f3e127]:
            - generic [ref=f3e128]:
              - status [ref=f3e129]:
                - strong [ref=f3e130]: "Active filters: 1"
                - generic [ref=f3e131]: 3 matching records
              - link "Clear filters" [ref=f3e132] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses?q=
            - list "Active filters" [ref=f3e133]:
              - listitem [ref=f3e134]:
                - 'link "Remove filter: Project: C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [ref=f3e135] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses?q=&lang=en
                  - generic [ref=f3e136]: "Project:"
                  - text: C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo
                  - generic [ref=f3e137]: ×
        - region [ref=f3e138]:
          - generic [ref=f3e139]:
            - heading "Export filtered results" [level=3] [ref=f3e140]
            - paragraph [ref=f3e141]: Download exactly the expenses currently selected by the register filters.
          - generic [ref=f3e142]:
            - link "Download PDF" [ref=f3e143] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses/export?from=2026-08-11&to=2026-09-22&format=pdf&project=01a0cb07-70c7-72de-b34a-78ebf7cdb311
            - link "Download Excel" [ref=f3e144] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses/export?from=2026-08-11&to=2026-09-22&format=xlsx&project=01a0cb07-70c7-72de-b34a-78ebf7cdb311
            - link "Download CSV" [ref=f3e145] [cursor=pointer]:
              - /url: /j-aautomation/app/expenses/export?from=2026-08-11&to=2026-09-22&format=csv&project=01a0cb07-70c7-72de-b34a-78ebf7cdb311
        - region [ref=f3e146]:
          - group [ref=f3e147]:
            - heading "Create report with another scope" [level=2] [ref=f3e150] [cursor=pointer]
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
        - region [ref=f3e153]:
          - heading "Recent expenses" [level=2] [ref=f3e154]
          - generic [ref=f3e155]:
            - article [ref=f3e156]:
              - link "Resilient receipt cb375e66-4508-40ac-8718-0503f5586d4b corrected $15.25 2026-09-22 · C-0001-P-001 · Hotel Open record →" [ref=f3e157] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses/01a0cb07-a64e-7713-b79b-05537f87238b
                - generic [ref=f3e158]:
                  - strong [ref=f3e159]: Resilient receipt cb375e66-4508-40ac-8718-0503f5586d4b corrected
                  - generic [ref=f3e160]: $15.25
                - generic [ref=f3e161]: 2026-09-22 · C-0001-P-001 · Hotel
                - generic [ref=f3e162]: Open record →
              - generic [ref=f3e163]:
                - generic [ref=f3e164]: Receipt attached
                - 'link "Open record: Draft" [ref=f3e165] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses?edit=01a0cb07-a64e-7713-b79b-05537f87238b
                  - generic [ref=f3e166]: Draft
                - 'link "Reimbursement: Pending" [ref=f3e167] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-a64e-7713-b79b-05537f87238b
              - generic [ref=f3e169]:
                - button "Edit" [ref=f3e170] [cursor=pointer]
                - button "Submit" [ref=f3e172] [cursor=pointer]
                - button "Delete" [ref=f3e174] [cursor=pointer]
            - article [ref=f3e175]:
              - link "Demo Calibration Supplies $350.00 2026-08-12 · C-0001-P-001 · Project materials Open record →" [ref=f3e176] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses/01a0cb07-71eb-7030-a005-1ac5a4326e45
                - generic [ref=f3e177]:
                  - strong [ref=f3e178]: Demo Calibration Supplies
                  - generic [ref=f3e179]: $350.00
                - generic [ref=f3e180]: 2026-08-12 · C-0001-P-001 · Project materials
                - generic [ref=f3e181]: Open record →
              - generic [ref=f3e182]:
                - generic [ref=f3e183]: Receipt attached
                - 'link "Open record: Approved" [ref=f3e184] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-71eb-7030-a005-1ac5a4326e45
                  - generic [ref=f3e185]: Approved
                - 'link "Reimbursement: Pending" [ref=f3e186] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-71eb-7030-a005-1ac5a4326e45
              - generic [ref=f3e189]:
                - generic [ref=f3e190]:
                  - text: Correction reason
                  - textbox "Correction reason" [ref=f3e191]
                - button "Create corrected draft" [ref=f3e192] [cursor=pointer]
            - article [ref=f3e193]:
              - link "Demo Airport Hotel $189.00 2026-08-11 · C-0001-P-001 · Hotel Open record →" [ref=f3e194] [cursor=pointer]:
                - /url: /j-aautomation/app/expenses/01a0cb07-7190-7180-865c-18ce225bb00d
                - generic [ref=f3e195]:
                  - strong [ref=f3e196]: Demo Airport Hotel
                  - generic [ref=f3e197]: $189.00
                - generic [ref=f3e198]: 2026-08-11 · C-0001-P-001 · Hotel
                - generic [ref=f3e199]: Open record →
              - generic [ref=f3e200]:
                - generic [ref=f3e201]: Receipt attached
                - 'link "Open record: Approved" [ref=f3e202] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-7190-7180-865c-18ce225bb00d
                  - generic [ref=f3e203]: Approved
                - 'link "Reimbursement: Pending" [ref=f3e204] [cursor=pointer]':
                  - /url: /j-aautomation/app/expenses/01a0cb07-7190-7180-865c-18ce225bb00d
              - generic [ref=f3e207]:
                - generic [ref=f3e208]:
                  - text: Correction reason
                  - textbox "Correction reason" [ref=f3e209]
                - button "Create corrected draft" [ref=f3e210] [cursor=pointer]
        - dialog [ref=f3e212]:
          - generic [ref=f3e213]:
            - generic [ref=f3e214]:
              - paragraph [ref=f3e215]: J&A Automation
              - heading "Record expense" [level=2] [ref=f3e216]
              - paragraph [ref=f3e217]: Operational entry only. Commercial treatment is handled separately.
            - button "Close expense form" [ref=f3e218] [cursor=pointer]:
              - generic [ref=f3e219]: ×
          - generic [ref=f3e221]:
            - alert [active] [ref=f3e222]: This action conflicts with the current record state.
            - generic [ref=f3e223]:
              - alert [ref=f3e224]: "Please correct the following fields: Review this field."
              - generic [ref=f3e225]:
                - strong [ref=f3e226]: Capture what happened
                - generic [ref=f3e227]: Use the receipt and operational details you know on site.
              - generic [ref=f3e228]:
                - generic [ref=f3e229]: Receipt image or PDF
                - button "Receipt image or PDF JPG, PNG, HEIC or PDF up to 10 MB" [ref=f3e230]
                - generic [ref=f3e231]: JPG, PNG, HEIC or PDF up to 10 MB
              - generic [ref=f3e232]:
                - strong [ref=f3e233]: Receipt preview
                - img "receipt.png" [ref=f3e234]
              - generic [ref=f3e235]:
                - generic [ref=f3e236]: Project
                - combobox "Project" [ref=f3e237]:
                  - option "Select assignment"
                  - option "C-0001-P-001 — Body Shop Line 4 Controls Upgrade · Demo" [selected]
                  - option "C-0001-P-002 — Remote Controls Support Retainer · Demo"
                  - option "C-0003-P-001 — Caustic Recovery Skid Integration · Demo"
              - generic [ref=f3e238]:
                - generic [ref=f3e239]:
                  - generic [ref=f3e240]: Date
                  - textbox "Date" [ref=f3e241]: 2026-09-22
                - generic [ref=f3e242]:
                  - generic [ref=f3e243]: Category
                  - combobox "Category" [ref=f3e244]:
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
              - generic [ref=f3e245]:
                - generic [ref=f3e246]: Vendor
                - textbox "Vendor" [ref=f3e247]: Resilient receipt f2a0af44-e326-4606-96c8-2dd343a57473
              - generic [ref=f3e248]:
                - generic [ref=f3e249]:
                  - generic [ref=f3e250]: Amount
                  - textbox "Amount" [ref=f3e251]: "12.50"
                - generic [ref=f3e252]:
                  - generic [ref=f3e253]: Currency
                  - combobox "Currency" [ref=f3e254]:
                    - option "USD" [selected]
                    - option "BRL"
                    - option "EUR"
              - generic [ref=f3e255]:
                - generic [ref=f3e256]: Who paid
                - combobox "Who paid" [ref=f3e257]:
                  - option "Worker" [selected]
                  - option "Company card"
                  - option "Company direct"
                  - option "Client paid directly"
                  - option "Third party"
              - generic [ref=f3e258]:
                - generic [ref=f3e259]: Description
                - textbox "Description" [ref=f3e260]: Travel receipt retained through a failed save.
              - generic [ref=f3e261]:
                - generic [ref=f3e262]: Payment method
                - textbox "Payment method" [ref=f3e263]:
                  - /placeholder: Card, transfer or cash
              - generic [ref=f3e264]:
                - button "Cancel" [ref=f3e265] [cursor=pointer]
                - button "Save draft" [ref=f3e266] [cursor=pointer]
    - navigation "Mobile navigation" [ref=f3e267]:
      - link "Today" [ref=f3e268] [cursor=pointer]:
        - /url: /j-aautomation/app/
      - link "Time" [ref=f3e269] [cursor=pointer]:
        - /url: /j-aautomation/app/time
      - link "Expenses" [ref=f3e270] [cursor=pointer]:
        - /url: /j-aautomation/app/expenses
      - link "Reports" [ref=f3e271] [cursor=pointer]:
        - /url: /j-aautomation/app/reports
      - button "More" [ref=f3e272] [cursor=pointer]
```

# Test source

```ts
  1   | import { randomUUID } from 'node:crypto';
  2   | import AxeBuilder from '@axe-core/playwright';
  3   | import { expect, test, type Locator, type Page } from '@playwright/test';
  4   | import { portal, signIn } from './auth.js';
  5   | 
  6   | const viewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);
  7   | 
  8   | async function contextualProject(page: Page, section: 'expenses' | 'reports'): Promise<string> {
  9   |   await page.goto(portal(`/${section}?lang=en&q=`), { waitUntil: 'networkidle' });
  10  |   const projectId = await page
  11  |     .locator(`form select[name="project"]`)
  12  |     .first()
  13  |     .evaluate(
  14  |       (select: HTMLSelectElement) =>
  15  |         Array.from(select.options).find((option) => option.value)?.value,
  16  |     );
  17  |   if (!projectId) throw new Error('The operational fixture must have an authorized project.');
  18  |   await page.goto(portal(`/${section}?lang=en&q=&project=${encodeURIComponent(projectId)}`), {
  19  |     waitUntil: 'networkidle',
  20  |   });
  21  |   return projectId;
  22  | }
  23  | 
  24  | async function expectContext(form: Locator, projectId: string, dateField: string): Promise<void> {
  25  |   await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
  26  |   const today = await form.evaluate(() => {
  27  |     const date = new Date();
  28  |     return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  29  |   });
  30  |   await expect(form.locator(`[name="${dateField}"]`)).toHaveValue(today);
  31  | }
  32  | 
  33  | async function fillExpense(form: Locator, vendor: string): Promise<void> {
  34  |   await form.locator('[name="vendor"]').fill(vendor);
  35  |   await form.locator('[name="amount"]').fill('12.50');
  36  |   await form.locator('[name="description"]').fill('Travel receipt retained through a failed save.');
  37  | }
  38  | 
  39  | test('expense validation retains the receipt and values, then creation and editing succeed', async ({
  40  |   page,
  41  | }, info) => {
  42  |   test.skip(!viewports.has(info.project.name));
  43  |   await signIn(page, 'worker');
  44  |   const projectId = await contextualProject(page, 'expenses');
  45  |   await page.locator('[data-expense-primary-cta]').click();
  46  |   const sheet = page.locator('[data-ui="responsive-sheet"]');
  47  |   const form = sheet.locator('[data-expense-entry-surface]');
  48  |   await expectContext(form, projectId, 'spentOn');
  49  |   const vendor = `Resilient receipt ${randomUUID()}`;
  50  |   await fillExpense(form, vendor);
  51  |   await form.locator('[name="receipt"]').setInputFiles({
  52  |     name: 'invalid-receipt.pdf',
  53  |     mimeType: 'application/pdf',
  54  |     buffer: Buffer.from('invalid PDF bytes'),
  55  |   });
  56  |   // Native format checking is deliberately removed in this isolated DOM to exercise the
  57  |   // server's amountMinor field contract and its mapping back to the visible amount input.
  58  |   await form.locator('[name="amount"]').evaluate((input) => input.removeAttribute('pattern'));
  59  |   await form.locator('[name="amount"]').fill('12,50');
  60  |   await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  61  |   await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  62  |   await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
  63  |   await expect(form.locator('[name="vendor"]')).toHaveValue(vendor);
  64  |   await expect(form.locator('[name="amount"]')).toHaveValue('12,50');
  65  |   expect(
  66  |     await form
  67  |       .locator('[name="receipt"]')
  68  |       .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  69  |   ).toBe('invalid-receipt.pdf');
  70  |   await form.locator('[name="amount"]').fill('12.50');
  71  |   await expect(form.locator('[name="amount"]')).not.toHaveAttribute('aria-invalid', 'true');
  72  |   await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  73  |   await expect(sheet.locator('[data-operational-form-error]')).toContainText('Receipt');
  74  |   await expect(form.locator('[name="vendor"]')).toHaveValue(vendor);
  75  |   expect(
  76  |     await form
  77  |       .locator('[name="receipt"]')
  78  |       .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  79  |   ).toBe('invalid-receipt.pdf');
  80  |   await form.locator('[name="receipt"]').setInputFiles({
  81  |     name: 'receipt.png',
  82  |     mimeType: 'image/png',
  83  |     buffer: Buffer.from(
  84  |       'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWqkAAAAASUVORK5CYII=',
  85  |       'base64',
  86  |     ),
  87  |   });
  88  |   await form.getByRole('button', { name: 'Save draft', exact: true }).click();
> 89  |   await expect(sheet).toHaveCount(0);
      |                       ^ Error: expect(locator).toHaveCount(expected) failed
  90  |   await page.locator('.expense-filters [name="q"]').fill(vendor);
  91  |   const row = page.locator('[data-expense-record]').filter({ hasText: vendor });
  92  |   await expect(row).toHaveCount(1);
  93  |   await row.getByRole('button', { name: 'Edit', exact: true }).click();
  94  |   await expect(form).toBeVisible();
  95  |   const newVendor = `${vendor} corrected`;
  96  |   await form.locator('[name="vendor"]').fill(newVendor);
  97  |   await form.locator('[name="amount"]').evaluate((input) => input.removeAttribute('pattern'));
  98  |   await form.locator('[name="amount"]').fill('bad amount');
  99  |   await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  100 |   await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
  101 |   await expect(form.locator('[name="vendor"]')).toHaveValue(newVendor);
  102 |   await form.locator('[name="amount"]').fill('15.25');
  103 |   await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  104 |   await expect(sheet).toHaveCount(0);
  105 |   await expect(row).toContainText(newVendor);
  106 | });
  107 | 
  108 | for (const kind of ['daily', 'technical'] as const) {
  109 |   test(`${kind} report retains all fields after server validation and saves after correction`, async ({
  110 |     page,
  111 |   }, info) => {
  112 |     test.skip(!viewports.has(info.project.name));
  113 |     await signIn(page, 'worker');
  114 |     const projectId = await contextualProject(page, 'reports');
  115 |     const title = kind === 'daily' ? 'New daily report' : 'New technical report';
  116 |     await page.getByRole('button', { name: title, exact: true }).first().click();
  117 |     const sheet = page.locator('[data-ui="responsive-sheet"]');
  118 |     const form = sheet.locator(`[data-report-entry-surface="${kind}"]`);
  119 |     await expectContext(form, projectId, kind === 'daily' ? 'workDate' : 'reportDate');
  120 |     const marker = `Resilient ${kind} ${randomUUID()}`;
  121 |     if (kind === 'daily') {
  122 |       await form.locator('[name="summary"]').fill('   ');
  123 |       await form.locator('[name="tasksCompleted"]').fill(marker);
  124 |       await form.locator('[name="openItems"]').fill('Preserve this pending task.');
  125 |     } else {
  126 |       await form.locator('[name="systemName"]').fill(marker);
  127 |       await form.locator('[name="problemSymptom"]').fill('Intermittent sensor input.');
  128 |       await form.locator('[name="diagnosisRootCause"]').fill('Loose connection.');
  129 |       await form.locator('[name="changePerformed"]').fill('Replaced the connector.');
  130 |       await form.locator('[name="safetyRelated"]').check();
  131 |     }
  132 |     await form.locator('button[type="submit"]').click();
  133 |     await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  134 |     await expect(form).toHaveAttribute('aria-busy', 'false');
  135 |     const validationAccessibility = await new AxeBuilder({ page })
  136 |       .include('[data-ui="responsive-sheet"]')
  137 |       .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  138 |       .analyze();
  139 |     expect(validationAccessibility.violations).toEqual([]);
  140 |     if (kind === 'daily') {
  141 |       await expect(form.locator('[name="summary"]')).toHaveAttribute('aria-invalid', 'true');
  142 |       await expect(form.locator('[name="tasksCompleted"]')).toHaveValue(marker);
  143 |       await expect(form.locator('[name="openItems"]')).toHaveValue('Preserve this pending task.');
  144 |       await form.locator('[name="summary"]').fill('Completed operational validation.');
  145 |     } else {
  146 |       await expect(form.locator('[name="validation"]')).toHaveAttribute('aria-invalid', 'true');
  147 |       await expect(form.locator('[name="rollbackPlan"]')).toHaveAttribute('aria-invalid', 'true');
  148 |       await expect(form.locator('[name="systemName"]')).toHaveValue(marker);
  149 |       await expect(form.locator('[name="safetyRelated"]')).toBeChecked();
  150 |       await form.locator('[name="validation"]').fill('Validated stop and restart with the lead.');
  151 |       await form
  152 |         .locator('[name="rollbackPlan"]')
  153 |         .fill('Restore the previous connector and configuration.');
  154 |     }
  155 |     await form.locator('button[type="submit"]').click();
  156 |     await expect(sheet).toHaveCount(0);
  157 |   });
  158 | }
  159 | 
  160 | test('owner expense save blocks duplicate submits and retains the form after network and server errors', async ({
  161 |   page,
  162 | }, info) => {
  163 |   test.skip(!viewports.has(info.project.name));
  164 |   await signIn(page, 'owner');
  165 |   const projectId = await contextualProject(page, 'expenses');
  166 |   await page.locator('[data-expense-primary-cta]').click();
  167 |   const sheet = page.locator('[data-ui="responsive-sheet"]');
  168 |   const form = sheet.locator('[data-expense-entry-surface]');
  169 |   await expectContext(form, projectId, 'spentOn');
  170 |   const worker = form.locator('[name="workerId"]');
  171 |   const workerId = await worker.evaluate((select: HTMLSelectElement) => select.options[1]?.value);
  172 |   if (!workerId) throw new Error('Owner fixture needs an available worker.');
  173 |   await worker.selectOption(workerId);
  174 |   await fillExpense(form, 'Preserved during network failure');
  175 |   await form.locator('[name="receipt"]').setInputFiles({
  176 |     name: 'retained-network-receipt.pdf',
  177 |     mimeType: 'application/pdf',
  178 |     buffer: Buffer.from('network fixture'),
  179 |   });
  180 |   let requests = 0;
  181 |   let release: (() => void) | undefined;
  182 |   await page.route('**/app/expenses?*/createExpense', async (route) => {
  183 |     requests += 1;
  184 |     await new Promise<void>((resolve) => {
  185 |       release = resolve;
  186 |     });
  187 |     await route.fulfill({
  188 |       status: 500,
  189 |       contentType: 'application/json',
```