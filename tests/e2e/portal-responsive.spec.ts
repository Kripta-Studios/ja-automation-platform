import { expect, test } from '@playwright/test';
import {
  portalNavigationForRole,
  type PortalRole as NavigationRole,
} from '../../apps/portal/src/lib/portal-navigation.ts';
import { portal, signIn } from './auth.js';

const requiredProjects = [
  'phone-360',
  'phone-390',
  'phone-430',
  'tablet-768',
  'tablet-1024',
  'laptop-1280',
  'desktop',
  'wide-1920',
] as const;

const allRoles = ['worker', 'manager', 'finance', 'owner'] as const;
type PortalRole = (typeof allRoles)[number];

const productionRoleByTestRole: Record<PortalRole, NavigationRole> = {
  worker: 'worker',
  manager: 'project_manager',
  finance: 'finance_admin',
  owner: 'owner_admin',
};

function expectRequiredProject(projectName: string): void {
  expect(requiredProjects, 'A5 evidence must execute in every named Playwright project').toContain(
    projectName as (typeof requiredProjects)[number],
  );
}

function roleNavigationLabels(role: PortalRole): {
  primary: string[];
  secondary: string[];
  admin: string[];
  security: string[];
} {
  const navigation = portalNavigationForRole('/j-aautomation', productionRoleByTestRole[role]);
  return {
    primary: navigation.primary.map((item) => item.label),
    secondary: navigation.secondary.map((item) => item.label),
    admin: navigation.admin.map((item) => item.label),
    security: navigation.security.map((item) => item.label),
  };
}

function runtimeErrorProbe(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  const intentionalResponses: Array<{
    path: string;
    statuses: readonly number[];
    method?: string;
  }> = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) =>
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (response) => {
    const url = new URL(response.url());
    const isApplicationPath =
      url.pathname.startsWith('/j-aautomation/app') || url.pathname.startsWith('/api/');
    if (!isApplicationPath || response.status() < 400) return;
    const allowed = intentionalResponses.some(
      (entry) =>
        url.pathname === entry.path &&
        entry.statuses.includes(response.status()) &&
        (!entry.method || entry.method === response.request().method()),
    );
    if (!allowed) errors.push(`response: ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function expectNoPageClipping(page: import('@playwright/test').Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: innerWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: element.className,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter((element) => element.right > innerWidth + 1 || element.left < -1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 8),
  }));
  expect(dimensions.documentWidth, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1,
  );
  expect(dimensions.bodyWidth, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1,
  );
}

function roleForViewport(width: number): 'owner' | 'finance' | 'worker' {
  if (width <= 430) return 'worker';
  if (width <= 1024) return 'finance';
  return 'owner';
}

async function textMetrics(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const label = element.querySelector(':scope > span:last-child');
      const box = label?.getBoundingClientRect();
      const style = label ? getComputedStyle(label) : undefined;
      return {
        text: label?.textContent?.trim() ?? '',
        width: Math.round(box?.width ?? 0),
        fontSize: style?.fontSize ?? '',
      };
    }),
  );
}

test('authenticated role navigation keeps every permitted label readable at the required widths', async ({
  page,
}) => {
  const width = page.viewportSize()?.width ?? 0;
  const role = roleForViewport(width);
  await signIn(page, role);

  const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
  const drawer = page.locator('#portal-navigation');
  const expected = roleNavigationLabels(role);
  if (width < 1024) {
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toHaveClass(/(?:^|\s)open(?:\s|$)/);
  } else {
    await expect(drawer).toBeVisible();
  }

  const sidebar = await textMetrics(
    page,
    '#portal-navigation nav[aria-label="Primary navigation"] a',
  );
  expect(sidebar.map((item) => item.text)).toEqual([...expected.primary, ...expected.secondary]);
  expect(sidebar, 'sidebar text must have a rendered label, not an icon/first letter only').toEqual(
    expect.arrayContaining(
      [...expected.primary, ...expected.secondary].map((text) =>
        expect.objectContaining({ text, fontSize: expect.not.stringMatching(/^0px$/) }),
      ),
    ),
  );
  expect(sidebar.filter((item) => item.width < 16)).toEqual([]);

  if (expected.admin.length > 0 || expected.security.length > 0) {
    await expect(page.locator('.admin-nav')).toBeVisible();
    const admin = await textMetrics(page, '#portal-navigation .admin-nav a');
    expect(admin.map((item) => item.text)).toEqual([...expected.admin, ...expected.security]);
    expect(admin.filter((item) => item.width < 16)).toEqual([]);
  } else {
    await expect(page.locator('.admin-nav')).toHaveCount(0);
  }

  if (width <= 760) {
    const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(mobile).toBeVisible();
    await expect(mobile.getByRole('link').allTextContents()).resolves.toEqual(
      expected.primary.slice(0, 4),
    );
    await expect(mobile.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  }
});

for (const role of allRoles) {
  test(`${role} has complete role-correct navigation labels in every evidence project`, async ({
    page,
  }, testInfo) => {
    expectRequiredProject(testInfo.project.name);
    const errors = runtimeErrorProbe(page);
    await signIn(page, role);

    const expected = roleNavigationLabels(role);
    const navigation = page.locator('#portal-navigation');
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    if ((page.viewportSize()?.width ?? 0) < 1024) {
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await menuButton.click();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      await expect(navigation).toHaveClass(/(?:^|\s)open(?:\s|$)/);
    } else {
      await expect(navigation).toBeVisible();
    }

    const primaryLinks = navigation.locator('nav[aria-label="Primary navigation"] a');
    const primaryAndSecondary = await primaryLinks.locator('.nav-label').allTextContents();
    expect(primaryAndSecondary.slice(0, expected.primary.length)).toEqual(expected.primary);
    expect(primaryAndSecondary.slice(expected.primary.length)).toEqual(expected.secondary);

    const adminLinks = navigation.locator('.admin-nav a .nav-label');
    const adminLabels = (await adminLinks.allTextContents()).map((label) => label.trim());
    expect(adminLabels).toEqual([...expected.admin, ...expected.security]);
    if (expected.admin.length > 0 || expected.security.length > 0) {
      await expect(navigation.locator('.admin-nav')).toBeVisible();
    } else {
      await expect(navigation.locator('.admin-nav')).toHaveCount(0);
    }
    if (expected.admin.length > 0) {
      await expect(navigation.getByText('ADMINISTRATION', { exact: true })).toBeVisible();
    } else {
      await expect(navigation.getByText('ADMINISTRATION', { exact: true })).toHaveCount(0);
    }
    if (expected.security.length > 0) {
      await expect(navigation.getByText('SECURITY', { exact: true })).toBeVisible();
    } else {
      await expect(navigation.getByText('SECURITY', { exact: true })).toHaveCount(0);
    }

    const renderedLabels = await navigation
      .locator('nav[aria-label="Primary navigation"] .nav-label, .admin-nav .nav-label')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.trim() ?? '',
            width: box.width,
            fontSize: style.fontSize,
            display: style.display,
          };
        }),
      );
    expect(renderedLabels.map((label) => label.text)).toEqual([
      ...expected.primary,
      ...expected.secondary,
      ...expected.admin,
      ...expected.security,
    ]);
    expect(renderedLabels).toEqual(
      expect.arrayContaining(
        renderedLabels.map(() =>
          expect.objectContaining({
            width: expect.any(Number),
            fontSize: expect.not.stringMatching(/^0px$/),
            display: expect.not.stringMatching(/^none$/),
          }),
        ),
      ),
    );
    expect(renderedLabels.filter((label) => label.width < 16)).toEqual([]);
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
    await expectNoPageClipping(page);
    await page.screenshot({
      path: testInfo.outputPath(`navigation-open-${role}-${testInfo.project.name}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

for (const role of ['finance', 'owner'] as const) {
  test(`${role} finance configuration uses shared labeled fields and phone-safe targets`, async ({
    page,
  }, testInfo) => {
    expectRequiredProject(testInfo.project.name);
    const errors = runtimeErrorProbe(page);
    const width = page.viewportSize()?.width ?? 0;
    await signIn(page, role);
    await page.goto(portal('/finance'));
    await expect(page.getByRole('heading', { name: 'Project finance' })).toBeVisible();

    const cards = page
      .locator('[data-ui="form-card"]')
      .filter({ hasText: 'Finance configuration' });
    await expect(cards.first()).toBeVisible();
    const metrics = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const card = element.getBoundingClientRect();
        const fields = [...element.querySelectorAll<HTMLElement>('[data-ui="field"]')].map(
          (field) => {
            const label = field.querySelector('label');
            const labelBox = label?.getBoundingClientRect();
            const controls = [
              ...field.querySelectorAll<HTMLElement>(
                'input:not([type="hidden"]), select, textarea',
              ),
            ].map((control) => {
              const box = control.getBoundingClientRect();
              const type = control.getAttribute('type')?.toLowerCase() ?? '';
              const field = control.closest<HTMLElement>('[data-ui="field"]');
              const parent = field?.parentElement;
              return {
                id: control.id,
                type,
                left: box.left,
                right: box.right,
                width: box.width,
                height: box.height,
                fieldWidth: field?.getBoundingClientRect().width ?? 0,
                fieldLeft: field?.getBoundingClientRect().left ?? 0,
                fieldRight: field?.getBoundingClientRect().right ?? 0,
                parentClass: parent?.className ?? '',
                parentColumns: parent ? getComputedStyle(parent).gridTemplateColumns : '',
                parentLeft: parent?.getBoundingClientRect().left ?? 0,
                parentWidth: parent?.getBoundingClientRect().width ?? 0,
                financePanel: Boolean(control.closest('.finance-config-panel')),
              };
            });
            return {
              label: label?.textContent?.trim() ?? '',
              labelVisible: Boolean(labelBox && labelBox.width > 0 && labelBox.height > 0),
              labelLeft: labelBox?.left ?? 0,
              labelRight: labelBox?.right ?? 0,
              labelWidth: labelBox?.width ?? 0,
              labelHeight: labelBox?.height ?? 0,
              controls,
            };
          },
        );
        const groups = [...element.querySelectorAll<HTMLElement>('[data-ui="field-group"]')].map(
          (group) => {
            const fieldRects = [...group.children]
              .filter((child) => {
                const style = getComputedStyle(child);
                return (
                  child.getAttribute('data-ui') === 'field' &&
                  style.display !== 'none' &&
                  style.visibility !== 'hidden'
                );
              })
              .map((child) => {
                const field = child as HTMLElement;
                const box = field.getBoundingClientRect();
                return {
                  left: box.left,
                  top: box.top,
                  right: box.right,
                  bottom: box.bottom,
                  width: box.width,
                  height: box.height,
                  controlCount: field.querySelectorAll<HTMLElement>(
                    'input:not([type="hidden"]), select, textarea',
                  ).length,
                };
              });
            return { fieldRects };
          },
        );
        return { cardLeft: card.left, cardRight: card.right, fields, groups };
      }),
    );
    expect(metrics.length, 'at least one finance FormCard is required').toBeGreaterThan(0);
    expect(
      metrics.every((metric) => metric.fields.length > 0),
      'each finance FormCard must expose at least one Field',
    ).toBe(true);
    const allFields = metrics.flatMap((metric) => metric.fields);
    expect(allFields.length).toBeGreaterThan(0);
    expect(
      allFields.every(
        (field) => field.label !== '' && field.labelVisible && field.controls.length > 0,
      ),
      'every finance Field needs a visible label and at least one relevant control',
    ).toBe(true);
    const allControls = allFields.flatMap((field) => field.controls);
    expect(allControls.length, 'finance Fields must expose measurable controls').toBeGreaterThan(0);
    expect(
      allControls.every((control) => control.width > 0 && control.height > 0),
      'finance controls must have measurable geometry',
    ).toBe(true);
    const standardControls = allControls.filter(
      (control) => !['checkbox', 'radio'].includes(control.type),
    );
    expect(
      standardControls.length,
      'finance forms need measurable non-glyph controls',
    ).toBeGreaterThan(0);
    expect(
      metrics
        .flatMap((metric) =>
          metric.fields.map((field) => ({
            ...field,
            labelLeftInset: field.labelLeft - metric.cardLeft,
            labelRightInset: metric.cardRight - field.labelRight,
            controlInsets: field.controls.map((control) => ({
              left: control.left - metric.cardLeft,
              right: metric.cardRight - control.right,
            })),
          })),
        )
        .flatMap((field) => [
          field.labelLeftInset,
          field.labelRightInset,
          ...field.controlInsets.flatMap((control) => [control.left, control.right]),
        ])
        .filter((inset) => inset < 16),
    ).toEqual([]);
    expect(
      standardControls
        .map((control) => Math.min(control.width, control.height))
        .filter((size) => size < 44),
    ).toEqual([]);
    if (width <= 430) {
      const groups = metrics.flatMap((metric) => metric.groups);
      expect(groups.length).toBeGreaterThan(0);
      expect(
        groups.every((group) => group.fieldRects.length > 0),
        'each phone FieldGroup must expose direct Field geometry',
      ).toBe(true);
      const groupFields = groups.flatMap((group) => group.fieldRects);
      expect(groupFields.length).toBeGreaterThan(0);
      expect(
        groupFields.every((field) => field.controlCount > 0),
        'each phone FieldGroup Field needs a relevant control',
      ).toBe(true);
      expect(
        groupFields.every((field) => field.width > 0 && field.height > 0),
        'each phone FieldGroup Field must have measurable geometry',
      ).toBe(true);
      const overlappingFields = groups.flatMap((group) =>
        group.fieldRects.flatMap((field, index, fields) =>
          fields.slice(index + 1).filter((other) => {
            const verticalOverlap = field.top < other.bottom - 1 && other.top < field.bottom - 1;
            return verticalOverlap;
          }),
        ),
      );
      expect(overlappingFields, 'phone Field controls must occupy distinct vertical rows').toEqual(
        [],
      );
      expect(standardControls.filter((control) => control.width < 240)).toEqual([]);
      expect(
        allFields
          .filter((field) =>
            field.controls.some((control) => ['checkbox', 'radio'].includes(control.type)),
          )
          .map((field) => Math.min(field.labelWidth, field.labelHeight))
          .filter((size) => size < 44),
      ).toEqual([]);
    }
    await expectNoPageClipping(page);
    await page.screenshot({
      path: testInfo.outputPath(`finance-form-${role}-${testInfo.project.name}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test('editable report invalid submission exposes linked errors and preserves valid values', async ({
  page,
}, testInfo) => {
  expectRequiredProject(testInfo.project.name);
  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
  const errors = runtimeErrorProbe(page);
  await signIn(page, 'owner');
  await page.goto(portal('/reports'));
  // The seeded showcase records are intentionally submitted/approved so the
  // correction-draft lifecycle can never be bypassed by an edit test. Create
  // a real draft through the same report-entry surface, then exercise the
  // editable form against that draft. This preserves the backend 409 for
  // submitted/approved records while keeping this browser contract truthful.
  const draftSummary = `A5 editable draft · ${testInfo.project.name}`;
  await page.getByRole('button', { name: 'New daily report', exact: true }).click();
  const draftForm = page.locator('form[data-report-entry-surface="daily"]');
  await expect(draftForm).toBeVisible();
  await draftForm.locator('select[name="projectId"]').selectOption({ index: 1 });
  await draftForm.locator('input[name="workDate"]').fill('2026-08-24');
  await draftForm.locator('input[name="siteShift"]').fill('A5 editability shift');
  await draftForm.locator('textarea[name="summary"]').fill(draftSummary);
  await draftForm
    .locator('textarea[name="tasksCompleted"]')
    .fill('A5 draft created for the accessible edit-form contract.');
  await draftForm.getByRole('button', { name: 'Save daily report', exact: true }).click();
  await expect(page.getByText('Daily report draft saved')).toBeVisible();

  const reportLink = page.locator('main a[href*="/reports/"]').filter({
    hasText: draftSummary,
  });
  await expect(reportLink).toHaveCount(1);
  await reportLink.click();
  const form = page.locator('form[action*="updateReport"]');
  await expect(form).toBeVisible();

  const invalidControl = form.locator('textarea[name="summary"]');
  await expect(invalidControl).toBeVisible();
  const invalidId = await invalidControl.getAttribute('id');
  expect(invalidId, 'required controls need stable ids for error association').toBeTruthy();
  await expect(invalidControl).toHaveAttribute('required', '');
  const preserveTarget = form.locator('input[name="siteShift"]');
  await expect(preserveTarget).toBeVisible();
  const originalInvalidValue = await invalidControl.inputValue();
  const originalPreservedValue = await preserveTarget.inputValue();
  const preservedValue = 'A5 preserved valid value';
  await preserveTarget.fill(preservedValue);
  const beforeSubmit = await form.evaluate((element) => ({
    method: element.getAttribute('method'),
    action: element.getAttribute('action'),
  }));
  const beforeValues = await form.locator('input, textarea, select').evaluateAll((elements) =>
    elements.map((element) => ({
      name: element.getAttribute('name'),
      value: (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value,
    })),
  );
  let postRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/reports/')) postRequests += 1;
  });
  await invalidControl.fill('');
  await form.getByRole('button', { name: /Save changes and notify reviewers/i }).click();

  await expect.poll(() => postRequests).toBe(0);
  const summary = page.locator('[data-validation-summary]');
  await expect(summary).toHaveCount(1);
  await expect(summary).toHaveAttribute('role', 'alert');
  await expect(summary).toBeVisible();
  await expect(summary).not.toBeEmpty();
  await expect(invalidControl).toHaveAttribute('aria-invalid', 'true');
  const fieldError = page.locator(`[data-field-error-for="${invalidId}"]`);
  await expect(fieldError).toHaveCount(1);
  await expect(fieldError).toBeVisible();
  const errorId = await fieldError.getAttribute('id');
  expect(errorId).toBeTruthy();
  await expect(invalidControl).toHaveAttribute(
    'aria-describedby',
    expect.stringContaining(errorId!),
  );
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('id')))
    .toBe(invalidId);
  await expect(preserveTarget).toHaveValue(preservedValue);
  const afterInvalidValues = await form.locator('input, textarea, select').evaluateAll((elements) =>
    elements.map((element) => ({
      name: element.getAttribute('name'),
      value: (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value,
    })),
  );
  expect(
    afterInvalidValues.filter((entry) => entry.name !== 'summary' && entry.name !== 'siteShift'),
  ).toEqual(beforeValues.filter((entry) => entry.name !== 'summary' && entry.name !== 'siteShift'));
  expect(
    await form.evaluate((element) => ({
      method: element.getAttribute('method'),
      action: element.getAttribute('action'),
    })),
  ).toEqual(beforeSubmit);
  await expectNoPageClipping(page);
  await page.screenshot({
    path: testInfo.outputPath(`report-invalid-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await invalidControl.fill(originalInvalidValue);
  await preserveTarget.fill(originalPreservedValue);
  await expect(invalidControl).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`[data-field-error-for="${invalidId}"]`)).toHaveCount(0);
  const postResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('/reports/'),
  );
  await form.getByRole('button', { name: /Save changes and notify reviewers/i }).click();
  const response = await postResponse;
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState('networkidle');
  expect(postRequests).toBe(1);
  expect(errors).toEqual([]);
});

test('worker timesheet exposes a deliberate readable mobile representation', async ({
  page,
}, testInfo) => {
  expectRequiredProject(testInfo.project.name);
  const errors = runtimeErrorProbe(page);
  const width = page.viewportSize()?.width ?? 0;
  await signIn(page, 'worker');
  await page.goto(portal('/time'));
  await expect(page.getByRole('heading', { name: 'Time entries', exact: true })).toBeVisible();
  const timesheet = page.locator('section[aria-labelledby="weekly-timesheet-title"]');
  await expect(timesheet).toBeVisible();
  const representation = timesheet.locator('[data-mobile-representation]');
  await expect(representation).toHaveCount(1);
  await expect(representation).toBeVisible();
  const mode = await representation.getAttribute('data-mobile-representation');
  expect(mode).toMatch(/^(cards|scroll)$/);
  const expectedLabels = ['Day', 'Actual', 'Expected', 'Difference', 'Categories', 'Status'];
  if (width <= 430) {
    if (mode === 'cards') {
      const cards = representation.locator('[data-row]');
      const rowCount = await cards.count();
      expect(rowCount).toBeGreaterThan(0);
      const rows = await cards.evaluateAll((elements) =>
        elements.map((row) => ({
          labels: [...row.querySelectorAll<HTMLElement>('[data-label]')].map(
            (element) => element.getAttribute('data-label')?.trim() ?? '',
          ),
          values: [...row.querySelectorAll<HTMLElement>('[data-label]')].map(
            (element) => element.textContent?.trim() ?? '',
          ),
        })),
      );
      expect(rows).toHaveLength(rowCount);
      for (const row of rows) {
        expect(new Set(row.labels)).toEqual(new Set(expectedLabels));
        expect(row.values).not.toContain('');
      }
    } else {
      const tableRegion = (await representation.getAttribute('data-table-region'))
        ? representation
        : representation.locator('[data-table-region]').first();
      await expect(tableRegion).toHaveAttribute('tabindex', '0');
      const accessibleName = await tableRegion.evaluate(
        (element) =>
          element.getAttribute('aria-label') ?? element.getAttribute('aria-labelledby') ?? '',
      );
      expect(accessibleName.trim()).not.toBe('');
      const describedBy = await tableRegion.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).toBeVisible();
      await expect(tableRegion).toContainText(/scroll|swipe|view/i);
      await expect(tableRegion).toHaveCSS('overflow-x', /auto|scroll/);
      const cells = await tableRegion.locator('tbody td, tbody th').allTextContents();
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.map((cell) => cell.trim())).not.toContain('');
    }
  }
  const textSizes = await representation
    .locator('td, th, [data-label]')
    .evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
  expect(textSizes.length).toBeGreaterThan(0);
  expect(textSizes.every((size) => Number.isFinite(size) && size >= 12)).toBe(true);
  await expectNoPageClipping(page);
  await page.screenshot({
    path: testInfo.outputPath(`worker-timesheet-${testInfo.project.name}.png`),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('owner invoice preview keeps semantic headers and a named mobile card mode', async ({
  page,
}, testInfo) => {
  expectRequiredProject(testInfo.project.name);
  const errors = runtimeErrorProbe(page);
  const width = page.viewportSize()?.width ?? 0;
  await signIn(page, 'owner');
  await page.goto(portal('/billing'));
  await expect(page.getByRole('heading', { name: 'Invoice register' })).toBeVisible();
  await page.getByRole('link', { name: 'Preview' }).first().click();
  await expect(page.getByText('Separate billing treatment')).toBeVisible();
  const paper = page.locator('.invoice-paper');
  const table = paper.locator('table');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(5);
  const representation = paper.locator('[data-mobile-representation="cards"]');
  await expect(representation).toHaveCount(1);
  if (width <= 430) await expect(representation).toBeVisible();
  const cellLabels = await table
    .locator('tbody td[data-label]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-label')?.trim() ?? ''),
    );
  expect(cellLabels.length).toBeGreaterThan(0);
  expect(cellLabels).not.toContain('');
  const previewMetrics = await table.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const cells = [...element.querySelectorAll('th, td')];
    return {
      right: box.right,
      viewport: innerWidth,
      minimumFontSize: Math.min(
        ...cells.map((cell) => Number.parseFloat(getComputedStyle(cell).fontSize)),
      ),
    };
  });
  expect(previewMetrics.minimumFontSize).toBeGreaterThanOrEqual(12);
  if (width <= 430) expect(previewMetrics.right).toBeLessThanOrEqual(previewMetrics.viewport + 1);
  await expectNoPageClipping(page);
  await page.screenshot({
    path: testInfo.outputPath(`invoice-preview-${testInfo.project.name}.png`),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
