# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-resilience.spec.ts >> owner expense save blocks duplicate submits and retains the form after network and server errors
- Location: tests/e2e/form-resilience.spec.ts:164:1

# Error details

```
Error: frame.evaluate: Test ended.
```

# Test source

```ts
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
  190 |     });
  191 |     await route.fulfill({
  192 |       status: 500,
  193 |       contentType: 'application/json',
  194 |       body: JSON.stringify({ type: 'error', status: 500, error: { message: 'Synthetic error' } }),
  195 |     });
  196 |   });
  197 |   await form.locator('button[type="submit"]').click();
  198 |   await expect(form).toHaveAttribute('aria-busy', 'true');
  199 |   await expect(form.locator('button[type="submit"]')).toBeDisabled();
  200 |   await expect(form.locator('[name="vendor"]')).toBeDisabled();
  201 |   await expect(form.locator('[name="receipt"]')).toBeDisabled();
  202 |   await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
  203 |   await expect.poll(() => requests).toBe(1);
  204 |   await expect.poll(() => Boolean(release)).toBe(true);
  205 |   release!();
  206 |   await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  207 |   await expect(form).toHaveAttribute('aria-busy', 'false');
  208 |   await expect(form.locator('[name="vendor"]')).toBeEnabled();
  209 |   await expect(form.locator('[name="receipt"]')).toBeEnabled();
  210 |   await expect(form.locator('[name="vendor"]')).toHaveValue('Preserved during network failure');
  211 |   expect(
  212 |     await form
  213 |       .locator('[name="receipt"]')
  214 |       .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  215 |   ).toBe('retained-network-receipt.pdf');
  216 |   await page.unroute('**/app/expenses?*/createExpense');
  217 |   await page.route('**/app/expenses?*/createExpense', (route) => route.abort('failed'));
  218 |   await form.locator('button[type="submit"]').click();
  219 |   await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  220 |   await expect(form).toHaveAttribute('aria-busy', 'false');
  221 |   await expect(form.locator('[name="vendor"]')).toHaveValue('Preserved during network failure');
  222 |   await expect(page).toHaveURL((url) => url.pathname.endsWith('/expenses'));
> 223 |   const failureAccessibility = await new AxeBuilder({ page })
      |                                ^ Error: frame.evaluate: Test ended.
  224 |     .include('[data-ui="responsive-sheet"]')
  225 |     .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  226 |     .analyze();
  227 |   expect(failureAccessibility.violations).toEqual([]);
  228 |   await sheet.locator('[data-operational-form-error]').scrollIntoViewIfNeeded();
  229 |   await sheet.screenshot({ path: info.outputPath('expense-preserved-after-failure.png') });
  230 | });
  231 | 
  232 | test('disabled offline mode keeps expense values and receipt with explicit reconnect feedback', async ({
  233 |   page,
  234 |   context,
  235 | }, info) => {
  236 |   test.skip(!viewports.has(info.project.name));
  237 |   await signIn(page, 'worker');
  238 |   const projectId = await contextualProject(page, 'expenses');
  239 |   await page.locator('[data-expense-primary-cta]').click();
  240 |   const sheet = page.locator('[data-ui="responsive-sheet"]');
  241 |   const form = sheet.locator('[data-expense-entry-surface]');
  242 |   await expectContext(form, projectId, 'spentOn');
  243 |   await fillExpense(form, 'Keep this offline expense');
  244 |   await form.locator('[name="receipt"]').setInputFiles({
  245 |     name: 'offline-receipt.pdf',
  246 |     mimeType: 'application/pdf',
  247 |     buffer: Buffer.from('offline fixture'),
  248 |   });
  249 |   let posts = 0;
  250 |   page.on('request', (request) => {
  251 |     if (request.method() === 'POST' && request.url().includes('/createExpense')) posts++;
  252 |   });
  253 |   await context.setOffline(true);
  254 |   try {
  255 |     await form.locator('button[type="submit"]').click();
  256 |     await expect(sheet.locator('[data-operational-form-error]')).toHaveText(
  257 |       'Reconnect to save changes. Your entries are still here.',
  258 |     );
  259 |     await expect(form).toHaveAttribute('aria-busy', 'false');
  260 |     await expect(form.locator('[name="vendor"]')).toHaveValue('Keep this offline expense');
  261 |     expect(
  262 |       await form
  263 |         .locator('[name="receipt"]')
  264 |         .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  265 |     ).toBe('offline-receipt.pdf');
  266 |     expect(posts).toBe(0);
  267 |   } finally {
  268 |     await context.setOffline(false);
  269 |   }
  270 | });
  271 | 
```