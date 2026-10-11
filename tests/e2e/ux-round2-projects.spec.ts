import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test.describe('project and client workflows, round two', () => {
  test('owner can focus one client, search it without accents, exclude another, and return through history', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?view=clients&lang=en'), { waitUntil: 'networkidle' });

    const cards = page.locator('.client-directory__card');
    await expect(cards.first()).toBeVisible();
    const clientId = await cards.first().getAttribute('data-client-id');
    const clientName = (await cards.first().locator('h2').innerText()).trim();
    expect(clientId).toBeTruthy();

    await page.goto(
      portal(
        `/projects?view=clients&focus=${encodeURIComponent(clientId!)}&lang=en#client-directory-client-${encodeURIComponent(clientId!)}`,
      ),
      { waitUntil: 'networkidle' },
    );
    await expect(cards).toHaveCount(1);
    await expect(page.locator('.client-directory__focus')).toContainText(clientName);
    await page.getByRole('link', { name: 'Show all clients' }).click();
    await expect.poll(() => cards.count()).toBeGreaterThan(1);
    const otherClientId = await cards.nth(1).getAttribute('data-client-id');
    expect(otherClientId).toBeTruthy();
    expect(otherClientId).not.toBe(clientId);

    const search = page.locator('#client-directory-filters input[type="search"]');
    const unaccentedName = clientName.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
    await search.fill(unaccentedName);
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(unaccentedName);
    await expect(cards.filter({ hasText: clientName })).toHaveCount(1);
    await expect(
      page.locator(`.client-directory__card[data-client-id="${otherClientId}"]`),
    ).toHaveCount(0);
    await expect(page.locator('.client-directory__count')).toContainText('1 of 1');

    await page.goto(portal('/time?lang=en'), { waitUntil: 'networkidle' });
    await page.goBack({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/view=clients/u);
    await expect(search).toHaveValue(unaccentedName);
    await expect(cards.filter({ hasText: clientName })).toBeVisible();
  });

  test('client-to-project handoff preselects the client and retains the interface language', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?view=clients&lang=es'), { waitUntil: 'networkidle' });
    const cards = page.locator('.client-directory__card');
    const card = cards
      .filter({ has: page.locator('[data-ui="status-badge"][data-variant="success"]') })
      .first();
    await expect(card).toBeVisible();
    const clientId = await card.getAttribute('data-client-id');
    expect(clientId).toBeTruthy();

    const emptyProjects = card.locator('.client-directory__project-list .client-directory__empty');
    const createProject = (await emptyProjects.count())
      ? card.locator('[data-client-scoped-project-create]')
      : card.locator('.directory-actions a[href*="action=new-project"]');
    await expect(createProject).toHaveAttribute('href', /action=new-project/u);
    const createHref = new URL((await createProject.getAttribute('href'))!, page.url());
    expect(createHref.searchParams.get('client')).toBe(clientId);
    expect(createHref.searchParams.get('lang')).toBe('es');
    await createProject.click();

    const form = page.locator('form[action="?/createProject"]');
    await expect(form).toBeVisible();
    await expect(form.locator('[name="clientId"]')).toHaveValue(clientId!);
    await expect(page).toHaveURL(/lang=es/u);
  });

  test('client project register link filters the destination to that client', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?view=clients&lang=en'), { waitUntil: 'networkidle' });
    const registerLink = page.locator('[data-client-scoped-project-register]').first();
    await expect(registerLink).toBeVisible();
    const clientId = await registerLink.evaluate((link) =>
      new URL((link as HTMLAnchorElement).href).searchParams.get('client'),
    );
    const clientCard = registerLink.locator('xpath=ancestor::*[@data-client-id][1]');
    const clientName = (await clientCard.locator('h2').innerText()).trim();
    expect(clientId).toBeTruthy();
    expect(clientName).toBeTruthy();
    await registerLink.click();

    await expect(page.locator('[data-project-client-filter]')).toHaveValue(clientId!);
    await expect(page).toHaveURL((url) => url.searchParams.get('lang') === 'en');
    const projectRows = page.locator('.project-list-link[data-project-row]');
    await expect(projectRows.first()).toBeVisible();
    const rowCount = await projectRows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let index = 0; index < rowCount; index += 1) {
      await expect(projectRows.nth(index)).toHaveAttribute('data-project-client', clientId!);
    }
  });

  test('contact edits ask before discarding and keep the draft when cancel is declined', async ({
    page,
  }) => {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?view=clients&lang=en'), { waitUntil: 'networkidle' });
    const card = page.locator('.client-directory__card').first();
    const addContact = card.getByRole('button', { name: 'Add contact', exact: true });
    await addContact.click();
    const clientId = await card.getAttribute('data-client-id');
    const form = page.locator(`#client-contact-new-${clientId}`);
    await expect(form).toBeVisible();
    const draftName = `Discard guard draft ${Date.now()}`;
    await form.locator('[name="name"]').fill(draftName);

    let confirmations = 0;
    page.once('dialog', async (dialog) => {
      confirmations += 1;
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(form).toBeVisible();
    await expect(form.locator('[name="name"]')).toHaveValue(draftName);
    expect(confirmations).toBe(1);

    page.once('dialog', async (dialog) => {
      confirmations += 1;
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(form).toBeHidden();
    expect(confirmations).toBe(2);
  });

  test('project status counts stay scoped to the active search and client', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(portal('/projects?lang=en'), { waitUntil: 'networkidle' });

    const clientFilter = page.locator('[data-project-client-filter]');
    const clientId = await clientFilter
      .locator('option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    expect(clientId).toBeTruthy();
    await clientFilter.selectOption(clientId!);
    const firstProject = page
      .locator('.project-section__project-link:visible, .ui-table-region-card-action:visible')
      .first();
    await expect(firstProject).toBeVisible();
    const search = page.locator('.project-section__filters input[name="q"]');
    const projectNumber = (await firstProject.locator('strong').count())
      ? (await firstProject.locator('strong').innerText()).trim()
      : (((await firstProject.getAttribute('aria-label')) ?? '').split(': ')[1]?.split(' · ')[0] ??
        '');
    expect(projectNumber).toBeTruthy();
    await search.fill(projectNumber);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('.project-section__summary-help')).toContainText(
      'current search and client filters',
    );
    await page
      .getByRole('link', { name: /Needs attention/u })
      .first()
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('status') === 'attention' &&
        url.searchParams.get('q') === projectNumber &&
        (!clientId || url.searchParams.get('client') === clientId),
    );
  });

  test('manager can open one worker assignment with matching project and worker filters', async ({
    page,
  }) => {
    await signIn(page, 'manager');
    await page.goto(portal('/projects?lang=en'), { waitUntil: 'networkidle' });
    const projectLinks = page.locator(
      '.project-section__project-link:visible, .ui-table-region-card-action:visible',
    );
    await expect(projectLinks.first()).toBeVisible();

    let manageHref = '';
    for (let index = 0; index < (await projectLinks.count()); index += 1) {
      const projectUrl = new URL((await projectLinks.nth(index).getAttribute('href'))!, page.url());
      projectUrl.searchParams.set('tab', 'team');
      await page.goto(projectUrl.toString(), { waitUntil: 'networkidle' });
      const manageAssignment = page.getByRole('link', { name: /Manage assignment:/u }).first();
      if (await manageAssignment.count()) {
        manageHref = (await manageAssignment.getAttribute('href')) ?? '';
        break;
      }
      await page.goto(portal('/projects?lang=en'), { waitUntil: 'networkidle' });
    }
    expect(manageHref).toBeTruthy();

    const scoped = new URL(manageHref, page.url());
    const expectedProjectId = scoped.searchParams.get('project');
    const expectedWorkerId = scoped.searchParams.get('worker');
    expect(expectedProjectId).toBeTruthy();
    expect(expectedWorkerId).toBeTruthy();
    await page.goto(scoped.toString(), { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('action') === 'update-assignment' &&
        url.searchParams.get('project') === expectedProjectId &&
        url.searchParams.get('worker') === expectedWorkerId,
    );
    await expect(page.locator('[data-assignment-project-filter]')).toHaveValue(expectedProjectId!);
    await expect(page.locator('[data-assignment-worker-filter]')).toHaveValue(expectedWorkerId!);
    await expect(page.locator('.project-section__assignment-update[open]')).toHaveCount(1);
    await expect(page.locator('[data-assignment-id]')).toHaveCount(1);
    await expect(page.locator('[data-assignment-id]')).toHaveAttribute(
      'data-project-id',
      expectedProjectId!,
    );
    await expect(page.locator('[data-assignment-id]')).toHaveAttribute(
      'data-worker-id',
      expectedWorkerId!,
    );
  });
});
