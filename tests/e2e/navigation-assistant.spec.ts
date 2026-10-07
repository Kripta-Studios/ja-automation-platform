import { expect, test, type Dialog, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';

const assistant = (page: Page) => page.locator('[data-navigation-assistant]');
const palette = (page: Page) => assistant(page).locator('dialog');
const task = (page: Page, id: string) => palette(page).locator(`[data-assistant-task="${id}"]`);
const target = (page: Page, surface: string) =>
  page.locator(`[data-assistant-target="${surface}"]`);

const businessMutations = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const requests: string[] = [];
  businessMutations.set(page, requests);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      request.method() !== 'GET' &&
      [...url.searchParams.keys()].some((key) => key.startsWith('/'))
    )
      requests.push(`${request.method()} ${url.pathname}${url.search}`);
  });
});
test.afterEach(({ page }) => {
  expect(businessMutations.get(page), 'navigation must never submit a business action').toEqual([]);
});

async function openPalette(page: Page, query?: string): Promise<void> {
  await assistant(page).locator('[data-assistant-launcher]').click();
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).locator('[data-assistant-query]')).toBeFocused();
  if (query !== undefined) await palette(page).locator('[data-assistant-query]').fill(query);
}

async function choose(page: Page, id: string, query?: string): Promise<void> {
  await openPalette(page, query);
  await task(page, id).click();
}

async function assertTouchControl(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

async function closeSheet(page: Page, surface: string, closeLabel: string): Promise<void> {
  const sheet = target(page, surface).locator('xpath=ancestor::*[@data-ui="responsive-sheet"]');
  await sheet.getByRole('button', { name: closeLabel, exact: true }).click();
  await expect(target(page, surface)).toHaveCount(0);
}

for (const scenario of [
  { locale: 'pt', query: 'quero registrar horas no projeto', task: 'time-create' },
  { locale: 'pt', query: 'quero lançar uma despesa no projeto', task: 'expense-create' },
  { locale: 'en', query: 'I wannt record hours on the project', task: 'time-create' },
  { locale: 'es', query: 'quiero registrar horas en el proyecto', task: 'time-create' },
]) {
  test(`worker matches contextual phrase: ${scenario.query}`, async ({ page }) => {
    await signIn(page, 'worker');
    await page.goto(portal(`/time?lang=${scenario.locale}`));
    await openPalette(page, scenario.query);
    await expect(palette(page).getByRole('status')).toContainText(
      scenario.locale === 'pt'
        ? 'Tarefas correspondentes'
        : scenario.locale === 'es'
          ? 'Tareas coincidentes'
          : 'Matching tasks',
    );
    await task(page, scenario.task).click();
    await expect(palette(page)).not.toBeVisible();
    await expect(target(page, scenario.task)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('lang')).toBe(scenario.locale);
    const focus = await target(page, scenario.task).evaluate((form) =>
      form.contains(document.activeElement),
    );
    expect(focus).toBe(true);
  });
}

test('owner typo command opens project form and explicit authorized project selection', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await expect(assistant(page)).toHaveCount(1);
  await assertTouchControl(page, assistant(page).locator('[data-assistant-launcher]'));
  await openPalette(page, 'I wannt create a new project');
  await assertTouchControl(page, palette(page).locator('[data-assistant-query]'));
  await assertTouchControl(page, task(page, 'project-create'));
  const accessibility = await new AxeBuilder({ page })
    .include('[data-navigation-assistant]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await palette(page).screenshot({ path: info.outputPath('owner-task-palette.png') });
  await task(page, 'project-create').click();
  await expect(palette(page)).not.toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith('/projects') &&
      url.searchParams.get('action') === 'new-project' &&
      url.hash === '#new-project',
  );
  const projectForm = page.locator('#new-project form[action="?/createProject"]');
  await expect(projectForm).toBeVisible();
  await expect(projectForm.locator('[name="name"]')).toBeVisible();
  await expect(projectForm.locator('[name="name"]')).toHaveValue('');
  await projectForm.screenshot({ path: info.outputPath('owner-new-project.png') });

  await choose(page, 'project-edit', 'edit a project');
  await expect(palette(page).getByRole('heading', { name: 'Choose a record' })).toBeVisible();
  const record = palette(page).locator('[data-assistant-record-id]').first();
  const id = await record.getAttribute('data-assistant-record-id');
  expect(id).toBeTruthy();
  await expect(record).toContainText(id!);
  await record.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith(`/projects/${id}`) &&
      url.searchParams.get('tab') === 'overview' &&
      url.searchParams.get('assistantPane') === 'project-edit',
  );
  await expect(page.locator('#assistant-project-edit')).toBeVisible();
  await expect(assistant(page)).toHaveCount(1);
});

test('owner can reopen time and expense forms repeatedly on the same route', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));
  for (const scenario of [
    { id: 'time-create', surface: 'time-create', query: 'log time', close: 'Close time form' },
    {
      id: 'expense-create',
      surface: 'expense-create',
      query: 'record an expense',
      close: 'Close expense form',
    },
  ]) {
    let lastRequest = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await choose(page, scenario.id, scenario.query);
      await expect(target(page, scenario.surface)).toBeVisible();
      await expect(palette(page)).not.toBeVisible();
      const url = new URL(page.url());
      expect(url.searchParams.get('assistantSurface')).toBe(scenario.surface);
      const request = url.searchParams.get('assistantRequest');
      expect(request).toBeTruthy();
      expect(request).not.toBe(lastRequest);
      lastRequest = request!;
      await closeSheet(page, scenario.surface, scenario.close);
    }
  }
});

test('daily and technical report tasks reveal forms and a cold assistant link opens directly', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/reports?lang=en'));
  for (const surface of ['report-daily', 'report-technical']) {
    await choose(page, surface);
    await expect(target(page, surface)).toBeVisible();
    await expect(target(page, surface).locator('[name="projectId"]')).toBeVisible();
    await closeSheet(page, surface, 'Close report form');
  }
  await page.goto(
    portal(
      '/reports?lang=en&view=daily&assistantSurface=report-daily&assistantRequest=cold-link#report-panel-daily',
    ),
  );
  await expect(target(page, 'report-daily')).toBeVisible();
  await expect(target(page, 'report-daily').locator('[name="projectId"]')).toBeVisible();
  await expect(assistant(page)).toHaveCount(1);
});

test('finance task selects the existing commercial configuration controls', async ({ page }) => {
  await signIn(page, 'finance');
  await page.goto(portal('/finance?lang=en'));
  await choose(page, 'finance-cost-create', 'create internal loaded cost rule');
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith('/finance') && url.searchParams.get('task') === 'Internal loaded cost',
  );
  await expect(page.locator('#finance-configuration-task')).toHaveValue('Internal loaded cost');
  await expect(page.locator('form[action*="/createInternalCostRule"]')).toBeVisible();
  await expect(page.locator('#finance-internal-project')).toBeVisible();
  await expect(palette(page)).not.toBeVisible();
});

for (const role of ['manager', 'worker'] as const) {
  test(`${role} receives operational tasks without finance or owner controls`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(portal('/time?lang=en'));
    await openPalette(page);
    await expect(task(page, 'time-create')).toBeVisible();
    for (const id of ['project-create', 'invoice-create', 'finance-cost-create', 'team-invite'])
      await expect(task(page, id)).toHaveCount(0);
    await palette(page).locator('[data-assistant-query]').fill('create invoice');
    await expect(task(page, 'invoice-create')).toHaveCount(0);
    const current = page.url();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(current);
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await choose(page, 'time-create', 'log time');
    await expect(target(page, 'time-create')).toBeVisible();
  });
}

test('auditor task list contains read-only navigation and omits mutations', async ({ page }) => {
  await signIn(page, 'auditor');
  await page.goto(portal('/finance?lang=en'));
  await openPalette(page);
  await expect(task(page, 'finance-overview')).toBeVisible();
  for (const id of [
    'project-create',
    'invoice-create',
    'time-create',
    'expense-create',
    'finance-cost-create',
  ])
    await expect(task(page, id)).toHaveCount(0);
  await task(page, 'finance-overview').click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith('/finance') &&
      url.searchParams.get('view') === 'overview' &&
      url.hash === '#finance-alerts',
  );
  await expect(page.locator('#finance-alerts')).toBeVisible();
  await expect(palette(page)).not.toBeVisible();
});

for (const localized of [
  {
    locale: 'es',
    launcher: 'Buscar una tarea',
    queryLabel: 'Describe tu tarea',
    query: 'quiero crear un proyecto',
    title: 'Crear un proyecto nuevo',
  },
  {
    locale: 'pt',
    launcher: 'Encontrar uma tarefa',
    queryLabel: 'Descreva sua tarefa',
    query: 'quero criar um projeto',
    title: 'Criar um novo projeto',
  },
]) {
  test(`${localized.locale} commands and labels stay localized after navigation`, async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(portal(`/projects?lang=${localized.locale}`));
    await expect(assistant(page).getByRole('button', { name: localized.launcher })).toBeVisible();
    await openPalette(page, localized.query);
    await expect(palette(page).getByLabel(localized.queryLabel)).toBeVisible();
    await expect(task(page, 'project-create')).toContainText(localized.title);
    await page.keyboard.press('Enter');
    await expect(page.locator('#new-project form')).toBeVisible();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('lang') === localized.locale &&
        url.searchParams.get('action') === 'new-project',
    );
    await expect(assistant(page).getByRole('button', { name: localized.launcher })).toBeVisible();
  });
}

test('unknown commands explain the limit and ambiguous invoice requests offer explicit choices', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  const original = page.url();
  await openPalette(page, 'please order me a pizza');
  await expect(palette(page).getByRole('status')).toContainText('find pages and forms');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(original);
  await expect(palette(page)).toBeVisible();
  await palette(page).locator('[data-assistant-query]').fill('invoice');
  await expect(task(page, 'invoice-create')).toBeVisible();
  await expect(task(page, 'invoice-list')).toBeVisible();
  expect(await palette(page).locator('[data-assistant-result]').count()).toBeGreaterThan(1);
  await expect(page).toHaveURL(original);
  await task(page, 'invoice-list').click();
  await expect(page).toHaveURL(
    (url) => url.pathname.endsWith('/billing') && url.searchParams.get('view') === 'invoices',
  );
  await expect(palette(page)).not.toBeVisible();
});

test('keyboard shortcut, result navigation, focus trap and Escape work with visible controls', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  const launcher = assistant(page).locator('[data-assistant-launcher]');
  await launcher.focus();
  await page.keyboard.press('Control+k');
  const input = palette(page).locator('[data-assistant-query]');
  await expect(input).toBeFocused();
  await input.fill('invoice');
  const results = palette(page).locator('[data-assistant-result]');
  await page.keyboard.press('ArrowDown');
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(results.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(results.nth(0)).toBeFocused();
  const close = palette(page).getByRole('button', { name: 'Close', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(results.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).not.toBeVisible();
  await expect(launcher).toBeFocused();
  await page.keyboard.press('Control+Shift+k');
  const sections = page.getByRole('dialog', { name: 'Go to section', exact: true });
  await expect(sections).toBeVisible();
  await expect(sections.getByRole('searchbox', { name: 'Find a section' })).toBeFocused();
  await expect(palette(page)).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sections).not.toBeVisible();
});

test('canceling assistant navigation retains a dirty time form and Escape only closes the palette', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));
  await choose(page, 'time-create', 'log time');
  const summary = target(page, 'time-create').locator('[name="summary"]');
  await expect(summary).toBeVisible();
  await summary.fill('Keep this unsaved operational activity');
  const current = page.url();
  const launcher = assistant(page).locator('[data-assistant-launcher]');
  await launcher.click();
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).not.toBeVisible();
  await expect(target(page, 'time-create')).toBeVisible();
  await expect(summary).toHaveValue('Keep this unsaved operational activity');
  await expect(launcher).toBeFocused();

  await page.keyboard.press('Control+k');
  await palette(page).locator('[data-assistant-query]').fill('record an expense');
  const confirmation = page.waitForEvent('dialog');
  const selection = task(page, 'expense-create').click();
  const prompt = await confirmation;
  expect(prompt.message()).toContain('unsaved changes');
  await prompt.dismiss();
  await selection;
  await expect(page).toHaveURL(current);
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('status')).toContainText('could not be opened');
  await page.keyboard.press('Escape');
  await expect(target(page, 'expense-create')).toHaveCount(0);
  await expect(target(page, 'time-create')).toBeVisible();
  await expect(summary).toHaveValue('Keep this unsaved operational activity');
});

test('owner contact, milestone and schedule tasks reveal forms with explicit project context', async ({
  page,
}, info) => {
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await choose(page, 'client-contacts');
  await expect(palette(page)).not.toBeVisible();
  const contact = page.locator('#client-contact-create');
  await expect(contact).toHaveAttribute('open', '');
  await expect(contact.locator('form[action="?/createClientContact"]')).toBeVisible();

  for (const scenario of [
    { task: 'project-milestones', id: 'project-milestone-create', action: 'createMilestone' },
    { task: 'project-schedule', id: 'project-schedule-update', action: 'updateSchedule' },
  ]) {
    await choose(page, scenario.task);
    await expect(palette(page).getByRole('heading', { name: 'Choose a record' })).toBeVisible();
    await palette(page).locator(`[data-assistant-record-id="${fixture.project.id}"]`).click();
    await expect(palette(page)).not.toBeVisible();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('project') === fixture.project.id && url.hash === `#${scenario.id}`,
    );
    const details = page.locator(`#${scenario.id}`);
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator(`form[action="?/${scenario.action}"]`)).toBeVisible();
    await expect(details.locator('[name="projectId"]')).toHaveValue(fixture.project.id);
  }
});

test('canonical owner team and mailbox tasks open the selected creation mode', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?view=team&directory=specialists&lang=en'));
  await choose(page, 'team-create');
  await expect(palette(page)).not.toBeVisible();
  await expect(page.locator('#assistant-team-create')).toBeVisible();
  await expect(page.locator('#assistant-team-create')).toHaveAttribute(
    'action',
    '?view=team&/createLocalPortalUser',
  );
  await expect(page.locator('#team-create-user-form')).toHaveCount(0);

  await choose(page, 'team-invite');
  await expect(palette(page)).not.toBeVisible();
  await expect(page.locator('#team-create-user-form')).toBeVisible();
  await expect(page.locator('#team-create-user-form')).toHaveAttribute(
    'action',
    '?view=team&/createInvitation',
  );
  await expect(page.locator('#assistant-team-create')).toHaveCount(0);

  await choose(page, 'mailbox-create');
  await expect(palette(page)).not.toBeVisible();
  await expect(page.locator('#create-mailbox-sheet-form')).toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get('assistantPane') === 'mailbox-create');
  await expect(page.locator('#create-mailbox-sheet-form [name="username"]')).toHaveValue('');
});

test('invoice navigation opens a wizard or the required stream setup without creating a draft', async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en&view=invoices&reset=1'));
  await choose(page, 'invoice-create');
  await expect(palette(page)).not.toBeVisible();
  await expect(page.locator('form[data-assistant-target="invoice-create"]')).toBeVisible();
  await expect(page.locator('form[data-assistant-target="invoice-create"]')).toHaveAttribute(
    'action',
    '?/createDraft',
  );
  await closeSheet(page, 'invoice-create', 'Close');

  // This existing lifecycle fixture has no billing stream. A cold link must expose prerequisites.
  await page.goto(
    portal(
      `/billing?lang=en&view=invoices&project=${fixture.project.id}&assistantSurface=invoice-create&assistantRequest=no-stream-${info.project.name}`,
    ),
  );
  await expect(
    page.locator('form[action="?/createDraft"][data-assistant-target="invoice-create"]'),
  ).toHaveCount(0);
  await expect(page.locator('#billing-setup-workspace')).toBeVisible();
  await expect(
    page.locator('[data-problem-code="WARNING_BILLING_INVOICE_NEEDS_ACTIVE_STREAM"]'),
  ).toBeVisible();
  await expect(page.locator('form[action="?/createBillingRule"] [name="projectId"]')).toHaveValue(
    fixture.project.id,
  );
  await expect(
    page.locator('form[action="?/createBillingRule"][data-assistant-target="invoice-create"]'),
  ).toBeVisible();
  expect(pageErrors, 'cold assistant links must wait until the app router is initialized').toEqual(
    [],
  );
});

test('manager assignment tasks focus the update field and nested removal reason', async ({
  page,
}) => {
  await signIn(page, 'manager');
  await page.goto(portal('/projects?lang=en'));
  await choose(page, 'project-pm-assignment-edit');
  await expect(palette(page)).not.toBeVisible();
  const update = page.locator('form[data-project-workflow="update-assignment"]').first();
  await expect(update).toBeVisible();
  await expect(update.locator('[name="startsOn"]')).toBeFocused();
  await expect(page.locator('#project-assignment-list')).toHaveAttribute('open', '');

  await choose(page, 'project-pm-assignment-remove');
  await expect(palette(page)).not.toBeVisible();
  const removal = page.locator('details[data-project-workflow="remove-assignment"]').first();
  await expect(removal).toHaveAttribute('open', '');
  await expect(removal.locator('[name="reason"]')).toBeFocused();
  await expect(removal.locator('[name="reason"]')).toHaveValue('');
});

test('dirty project cancellation preserves inputs and a report mode change asks once', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await choose(page, 'project-create');
  const name = page.locator('#new-project form [name="name"]');
  await name.fill('Unsaved project retained by assistant');
  const current = page.url();
  await openPalette(page);
  const pendingConfirmation = page.waitForEvent('dialog');
  const navigation = task(page, 'time-create').click();
  const confirmation = await pendingConfirmation;
  expect(confirmation.message()).toContain('unsaved changes');
  await confirmation.dismiss();
  await navigation;
  await expect(page).toHaveURL(current);
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(name).toHaveValue('Unsaved project retained by assistant');
  await name.fill('');

  await page.goto(portal('/reports?lang=en'));
  await choose(page, 'report-daily');
  await target(page, 'report-daily').locator('[name="summary"]').fill('Unsaved daily activity');
  let confirmations = 0;
  const acceptConfirmation = async (prompt: Dialog) => {
    confirmations += 1;
    expect(prompt.message()).toContain('unsaved changes');
    await prompt.accept();
  };
  page.on('dialog', acceptConfirmation);
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await task(page, 'report-technical').click();
  await expect(palette(page)).not.toBeVisible();
  await expect(target(page, 'report-technical')).toBeVisible();
  await expect(target(page, 'report-daily')).toHaveCount(0);
  expect(confirmations).toBe(1);
  page.off('dialog', acceptConfirmation);
});

test('accepting a project context change clears the previous milestone and schedule draft', async ({
  page,
}, info) => {
  const original = e2eLifecycleFixturesFor(info.project.name);
  const destination = e2eLifecycleFixturesFor(
    info.project.name === 'phone-360' ? 'phone-390' : 'phone-360',
  );
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  for (const scenario of [
    {
      task: 'project-milestones',
      id: 'project-milestone-create',
      fields: { name: 'Previous project milestone', amountMinor: '100', dueOn: '2026-11-12' },
    },
    {
      task: 'project-schedule',
      id: 'project-schedule-update',
      fields: { timezone: 'Europe/Madrid', mondayMinutes: '333', effectiveFrom: '2026-11-12' },
    },
  ]) {
    await choose(page, scenario.task);
    await palette(page).locator(`[data-assistant-record-id="${original.project.id}"]`).click();
    const form = page.locator(`#${scenario.id} form`);
    await expect(form.locator('[name="projectId"]')).toHaveValue(original.project.id);
    for (const [field, value] of Object.entries(scenario.fields))
      await form.locator(`[name="${field}"]`).fill(value);

    let confirmations = 0;
    const accept = async (prompt: Dialog) => {
      confirmations += 1;
      await prompt.accept();
    };
    page.on('dialog', accept);
    await choose(page, scenario.task);
    await palette(page).locator(`[data-assistant-record-id="${destination.project.id}"]`).click();
    await expect(palette(page)).not.toBeVisible();
    await expect(form.locator('[name="projectId"]')).toHaveValue(destination.project.id);
    for (const field of Object.keys(scenario.fields))
      await expect(form.locator(`[name="${field}"]`)).toHaveValue(
        field === 'timezone' ? destination.project.timezone : '',
      );
    expect(confirmations).toBe(1);
    page.off('dialog', accept);
  }
});
