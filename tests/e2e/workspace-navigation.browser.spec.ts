import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import {
  e2eArchiveTarget,
  e2eCredentials,
  e2eLifecycleFixturesFor,
  portal,
  signIn,
} from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';
import { e2eCostCenter } from './project-cost-center.js';

async function centered(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  const viewport = target.page().viewportSize()!;
  let beginning = target;
  if (box!.height > viewport.height * 0.7) {
    const title = target
      .locator('h2:visible, h3:visible, h4:visible, legend:visible, summary:visible')
      .first();
    const firstField = target.locator('label:visible').first();
    beginning = (await title.count()) ? title : (await firstField.count()) ? firstField : target;
    // A long editor is useful only if its opening title or initial field is actually reachable.
    await expect(beginning).toBeInViewport();
  }
  await expect
    .poll(() =>
      beginning.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const ideal = scrollY + bounds.top + bounds.height / 2 - innerHeight / 2;
        const attainable = Math.max(
          0,
          Math.min(ideal, document.documentElement.scrollHeight - innerHeight),
        );
        return Math.abs(scrollY - attainable);
      }),
    )
    .toBeLessThan(28);
}

async function attachDiagnostics(page: Page, info: TestInfo, label: string): Promise<void> {
  if (page.isClosed() || !page.url().startsWith('http')) return;
  await info.attach(`workspace-navigation-${label}`, {
    contentType: 'application/json',
    body: JSON.stringify(
      await page.evaluate(() => ({
        url: location.href,
        scroll: scrollY,
        active: document.activeElement?.outerHTML.slice(0, 1500),
        dialogs: Array.from(document.querySelectorAll('[role="dialog"],dialog[open]')).map(
          (element) => element.outerHTML.slice(0, 2000),
        ),
        storage: Object.fromEntries(
          Object.entries(sessionStorage).filter(
            ([key]) => key.includes('workspace') || key.includes('navigation'),
          ),
        ),
        resources: performance.getEntriesByType('resource').map((entry) => ({
          url: entry.name,
          status: (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus,
        })),
      })),
      null,
      2,
    ),
  });
  await info.attach(`workspace-navigation-${label}-screenshot`, {
    contentType: 'image/png',
    body: await page.screenshot(),
  });
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  await attachDiagnostics(page, info, 'failure');
});

async function spaLink(page: Page, href: string): Promise<void> {
  await page.evaluate((destination) => {
    const link = document.createElement('a');
    link.href = destination;
    link.textContent = 'Workspace navigation regression shortcut';
    document.body.append(link);
    link.click();
    link.remove();
  }, href);
}

test('Owner and Finance native contact saves return to the same client and loaded editor', async ({
  browser,
}, info) => {
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    for (const role of ['owner', 'finance'] as const) {
      const context = await browser.newContext({ viewport: info.project.use.viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await signIn(page, role);
        await page.goto(portal(`/projects?view=clients&client=${fixture.client.id}&lang=en`));
        const card = page.locator(`#client-directory-client-${fixture.client.id}`);
        await card.getByRole('button', { name: 'Add contact', exact: true }).click();
        const create = page.locator(`#client-contact-new-${fixture.client.id}`);
        await centered(create);
        await expect(create.locator('[name="name"]')).toBeInViewport();
        const name = `Navigation ${role} ${info.project.name} ${randomUUID()}`;
        await create.locator('[name="name"]').fill(name);
        await create.locator('[name="role"]').fill('Site coordinator');
        await create.locator('[name="notes"]').fill('Keep this optional contact information.');
        await create.getByRole('button', { name: 'Save contact', exact: true }).click();
        await expect
          .poll(() => db.prepare('SELECT id FROM client_contact WHERE name=?').get(name)?.id)
          .toBeTruthy();
        const row = db.prepare('SELECT id FROM client_contact WHERE name=?').get(name) as {
          id: string;
        };
        await centered(page.locator(`#client-contacts-section-${fixture.client.id}`));
        const contact = page.locator(`#client-contact-${row.id}`);
        await expect(contact).toContainText(name);
        await contact.getByRole('button', { name: 'Edit contact', exact: true }).click();
        const editor = page.locator(`#client-contact-edit-${row.id}`);
        await centered(editor);
        await expect(editor.locator('[name="name"]')).toBeInViewport();
        const changed = `${name} updated`;
        await editor.locator('[name="name"]').fill(changed);
        await editor.locator('[name="role"]').fill('Installation supervisor');
        await editor.locator('[name="notes"]').fill('Saved notes after editing.');
        await editor.getByRole('button', { name: 'Update contact', exact: true }).click();
        await expect
          .poll(() => db.prepare('SELECT name FROM client_contact WHERE id=?').get(row.id)?.name)
          .toBe(changed);
        // A full native response must reopen the real editor, without replaying old input values.
        await centered(editor);
        await expect(editor.locator('[name="name"]')).toBeInViewport();
        await expect(editor.locator('[name="name"]')).toHaveValue(changed);
        await expect(editor.locator('[name="role"]')).toHaveValue('Installation supervisor');
        await expect(editor.locator('[name="notes"]')).toHaveValue('Saved notes after editing.');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.screenshot({ path: info.outputPath(`contact-${role}-saved.png`) });
        expect(errors).toEqual([]);
      } catch (error) {
        await attachDiagnostics(page, info, `contact-${role}`);
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    db.close();
  }
});

test('an off-page contact destination survives directory pagination and a retained search', async ({
  page,
}, info) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const contactId = randomUUID();
  const name = `ZZ navigation destination ${info.project.name}`;
  try {
    // All data belongs exclusively to the disposable browser database.
    for (let index = 0; index < 14; index += 1) {
      db.prepare(
        `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,
          billing_email,payment_terms_days,version,created_at,updated_at) VALUES(?,?,?,?, 'active','USD','UTC',?,30,1,?,?)`,
      ).run(
        index === 13 ? clientId : randomUUID(),
        `NAV-${info.project.name}-${index}-${randomUUID()}`,
        index === 13 ? name : `AA navigation row ${index} ${info.project.name}`,
        index === 13 ? name : `AA navigation row ${index} ${info.project.name}`,
        `navigation-${info.project.name}-${index}@demo.jaautomation.test`,
        now,
        now,
      );
    }
    db.prepare(
      `INSERT INTO client_contact(id,client_id,name,role,email,phone,is_primary,is_billing_contact,
        created_at,updated_at) VALUES(?,?,?,'Coordinator',NULL,NULL,0,0,?,?)`,
    ).run(contactId, clientId, 'Off-page contact', now, now);
    await signIn(page, 'owner');
    await page.goto(portal('/projects?view=clients&lang=en'));
    const search = page.locator('#client-directory-filters input');
    await search.fill('Lifecycle Client');
    await expect(page.locator(`#client-directory-client-${clientId}`)).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { workspaceNavigationMarker: string }).workspaceNavigationMarker =
        'spa';
    });
    await spaLink(page, portal(`/projects?view=clients&lang=en#client-contact-edit-${contactId}`));
    const editor = page.locator(`#client-contact-edit-${contactId}`);
    await centered(editor);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await spaLink(page, page.url());
    await centered(editor);
    await expect(search).toHaveValue('Lifecycle Client');
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { workspaceNavigationMarker: string }).workspaceNavigationMarker,
      ),
    ).toBe('spa');
    await editor.locator('[name="notes"]').fill('Edited through a paginated contact shortcut.');
    await editor.getByRole('button', { name: 'Update contact', exact: true }).click();
    await centered(editor);
    await expect(search).toHaveValue('Lifecycle Client');
    await expect(editor.locator('[name="notes"]')).toHaveValue(
      'Edited through a paginated contact shortcut.',
    );
    await page.screenshot({ path: info.outputPath('off-page-contact-restored.png') });
  } finally {
    db.close();
  }
});

test('role-scoped action and hash links center their destinations while Back restores reading position', async ({
  browser,
}, info) => {
  for (const role of ['owner', 'finance', 'manager', 'worker'] as const) {
    const context = await browser.newContext({ viewport: info.project.use.viewport });
    const page = await context.newPage();
    try {
      await signIn(page, role);
      const source = role === 'finance' ? '/projects?view=clients&lang=en' : '/time?lang=en';
      const destination =
        role === 'owner'
          ? '/projects?action=new-project&lang=en'
          : role === 'manager'
            ? '/reports?lang=en&view=daily#report-panel-daily'
            : role === 'finance'
              ? '/projects?view=clients&lang=en#client-directory'
              : '/expenses?lang=en#expense-records';
      const target =
        role === 'owner'
          ? '#new-project'
          : role === 'manager'
            ? '#report-panel-daily'
            : role === 'finance'
              ? '#client-directory'
              : '#expense-records';
      await page.goto(portal(source));
      await page.evaluate(() => {
        (window as unknown as { workspaceNavigationMarker: string }).workspaceNavigationMarker =
          'spa';
        window.scrollTo({ top: 280, behavior: 'instant' });
      });
      const initialScroll = await page.evaluate(() => scrollY);
      await spaLink(page, portal(destination));
      await centered(page.locator(target));
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { workspaceNavigationMarker: string }).workspaceNavigationMarker,
        ),
      ).toBe('spa');
      // Finance's shortcut is deliberately within one route; move away before Back.
      if (role === 'finance') {
        await page.evaluate(() => window.scrollTo({ top: 280, behavior: 'instant' }));
        const readingPosition = await page.evaluate(() => scrollY);
        await spaLink(page, portal('/billing?lang=en'));
        await expect(page).toHaveURL(/\/billing/);
        await page.goBack();
        await expect(page.locator(target)).toBeVisible();
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(readingPosition);
      } else {
        await page.goBack();
        await expect(page).toHaveURL(portal(source));
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(initialScroll);
      }
    } catch (error) {
      await attachDiagnostics(page, info, `role-${role}`);
      throw error;
    } finally {
      await context.close();
    }
  }
});

test('native validation keeps the contact form active and enhanced time saves keep sheet ownership', async ({
  page,
}, info) => {
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  await signIn(page, 'owner');
  await page.goto(portal(`/projects?view=clients&client=${fixture.client.id}&lang=en`));
  await page
    .locator(`#client-directory-client-${fixture.client.id}`)
    .getByRole('button', { name: 'Add contact', exact: true })
    .click();
  const contactForm = page.locator(`#client-contact-new-${fixture.client.id}`);
  let contactPosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('createClientContact'))
      contactPosts += 1;
  });
  await contactForm.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(contactForm.locator('[name="name"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(contactForm.locator('[data-validation-summary]')).toBeVisible();
  expect(contactPosts).toBe(0);
  // Start a separate real principal session; the canceled submit must not survive navigation.
  await page.context().clearCookies();
  await signIn(page, 'worker');
  await page.goto(portal('/time?lang=en&from=2026-08-01&to=2026-08-31'));
  await page.getByRole('button', { name: 'Log time', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Log time', exact: true });
  await expect(dialog).toBeVisible();
  const form = dialog.locator('form[data-time-entry-surface]');
  await form.locator('[name="workDate"]').fill('2026-08-25');
  const projectId = await form
    .locator('[name="projectId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  expect(projectId).toBeTruthy();
  await form.locator('[name="projectId"]').selectOption(projectId!);
  await form.locator('[name="durationHours"]').fill('1.25');
  const summary = `Enhanced save navigation ${info.project.name} ${randomUUID()}`;
  await form.locator('[name="summary"]').fill(summary);
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const record = page.locator('.time-record').filter({ hasText: summary });
  await expect(record).toBeVisible();
  await record.getByRole('button', { name: 'Edit draft', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit time entry', exact: true });
  await expect(editDialog).toBeVisible();
  const editForm = editDialog.locator('form[data-time-entry-surface]');
  await expect(editForm.locator('[name="durationHours"]')).toHaveValue('1.25');
  await editForm.locator('[name="summary"]').fill(`${summary} edited`);
  await editForm.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(page.locator('.time-record').filter({ hasText: `${summary} edited` })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a billing editor hash opens every enclosing disclosure before centering the editor', async ({
  page,
}) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath, { readOnly: true });
  const entity = db.prepare("SELECT id FROM legal_entity WHERE status='active' LIMIT 1").get() as {
    id: string;
  };
  db.close();
  await signIn(page, 'owner');
  await page.goto(portal(`/billing?view=setup&setup=entity&issuerSettings=${entity.id}&lang=en`));
  const editor = page.locator(`#issuer-settings-${entity.id}`);
  await expect(editor).toBeVisible();
  const closedCount = await editor.evaluate((element) => {
    let count = 0;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor instanceof HTMLDetailsElement) {
        ancestor.open = false;
        count += 1;
      }
    }
    return count;
  });
  expect(closedCount).toBeGreaterThanOrEqual(2);
  await expect(editor).not.toBeVisible();
  const destination = new URL(page.url());
  destination.hash = `issuer-settings-${entity.id}`;
  await spaLink(page, destination.href);
  await centered(editor);
  expect(
    await editor.evaluate((element) => {
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement && !ancestor.open) return false;
      }
      return true;
    }),
  ).toBe(true);
});

test('a native client edit returns to its scoped editor rather than the page edge', async ({
  page,
}, info) => {
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal(`/projects?action=update-client&client=${fixture.client.id}&lang=en`));
    const panel = page.locator('[data-project-workflow="update-client"]');
    await centered(panel);
    const editor = panel.locator('form[action="?/updateClient"]');
    const displayName = `${fixture.client.displayName} edited`;
    await editor.locator('[name="displayName"]').fill(displayName);
    await editor.locator('[name="billingAddress"]').fill('Disposable browser address, Ohio');
    await editor.locator('[name="notes"]').fill('Native save keeps the current editor.');
    await editor.getByRole('button', { name: 'Update client', exact: true }).click();
    await expect
      .poll(
        () =>
          db.prepare('SELECT display_name FROM client WHERE id=?').get(fixture.client.id)
            ?.display_name,
      )
      .toBe(displayName);
    await centered(editor);
    await expect(editor.locator('[name="displayName"]')).toHaveValue(displayName);
    await expect(editor.locator('[name="notes"]')).toHaveValue(
      'Native save keeps the current editor.',
    );
    expect(new URL(page.url()).searchParams.get('client')).toBe(fixture.client.id);
    await page.screenshot({ path: info.outputPath('client-native-saved.png') });
  } finally {
    db.close();
  }
});

test('auditor, external technician and supplier coordinator deep links retain their authorized context', async ({
  browser,
}, info) => {
  const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
  for (const account of ['auditor', 'worker2', 'supplierCoordinator'] as const) {
    const context = await browser.newContext({ viewport: info.project.use.viewport });
    const page = await context.newPage();
    const businessPosts: string[] = [];
    const runtime: string[] = [];
    page.on('pageerror', (error) => runtime.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) runtime.push(message.text());
    });
    page.on('request', (request) => {
      if (request.method() === 'POST' && !request.url().includes('/api/auth/'))
        businessPosts.push(request.url());
    });
    try {
      await signInManualPersona(page, account);
      const source =
        account === 'supplierCoordinator'
          ? `/supplier?projectId=${projectId}&workspaceAction=personnel&lang=en`
          : '/time?lang=en';
      await page.goto(portal(source));
      if (account === 'supplierCoordinator') await centered(page.locator('#supplier-personnel'));
      await page.evaluate(() => window.scrollTo({ top: 240, behavior: 'instant' }));
      const previousScroll = await page.evaluate(() => scrollY);
      const destination =
        account === 'supplierCoordinator'
          ? `/supplier?projectId=${projectId}&workspaceAction=report&lang=en#supplier-report`
          : '/expenses?lang=en#expense-records';
      const target = account === 'supplierCoordinator' ? '#supplier-report' : '#expense-records';
      await spaLink(page, portal(destination));
      await centered(page.locator(target));
      if (account === 'supplierCoordinator')
        expect(new URL(page.url()).searchParams.get('projectId')).toBe(projectId);
      await page.goBack();
      await expect(page).toHaveURL(portal(source));
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(previousScroll);
      expect(businessPosts).toEqual([]);
      expect(runtime).toEqual([]);
    } catch (error) {
      await attachDiagnostics(page, info, `persona-${account}`);
      throw error;
    } finally {
      await context.close();
    }
  }
});

test('Team native profile saves reopen their editor and Supplier local buttons center the selected action', async ({
  page,
}, info) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    const previousName = db.prepare('SELECT name FROM user WHERE id=?').get(e2eArchiveTarget.id)
      ?.name as string;
    await page.goto(portal('/projects?view=team&lang=en'));
    const search = page.locator('#team-search');
    await search.fill(previousName);
    const card = page.locator(`[data-worker-id="${e2eArchiveTarget.id}"]`);
    await card.getByRole('button', { name: 'Edit team member', exact: true }).click();
    const editor = page.locator(`#team-editor-${e2eArchiveTarget.id}`);
    const profileForm = editor.locator('form[action*="/updateWorkerProfile"]');
    await centered(editor);
    await expect(editor.locator('[name="name"]')).toBeInViewport();
    const name = `Navigation profile ${info.project.name}`;
    await editor.locator('[name="name"]').fill(name);
    await profileForm.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect
      .poll(() => db.prepare('SELECT name FROM user WHERE id=?').get(e2eArchiveTarget.id)?.name)
      .toBe(name);
    await centered(profileForm);
    await expect(editor.locator('[name="name"]')).toHaveValue(name);
    await expect(editor.locator('[name="name"]')).toBeInViewport();
    await expect(editor.locator('[name="role"]')).toHaveValue('worker');
    await expect(search).toHaveValue(previousName);
    expect(new URL(page.url()).searchParams.get('worker')).toBe(e2eArchiveTarget.id);
    await page.screenshot({ path: info.outputPath('team-native-profile-saved.png') });
    const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
    await page.context().clearCookies();
    await signInManualPersona(page, 'supplierCoordinator');
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=report&lang=en`));
    const localActions = page.locator('.supplier-jump-links');
    await localActions.getByRole('button', { name: 'Personnel', exact: true }).click();
    await centered(page.locator('#supplier-personnel'));
    expect(new URL(page.url()).hash).toBe('#supplier-personnel');
    await page.screenshot({ path: info.outputPath('supplier-personnel-centered.png') });
    await localActions.getByRole('button', { name: 'Record team hours', exact: true }).click();
    await centered(page.locator('#supplier-time-batch'));
    expect(new URL(page.url()).hash).toBe('#supplier-time-batch');
    expect(new URL(page.url()).searchParams.get('projectId')).toBe(projectId);
    await page.screenshot({ path: info.outputPath('supplier-team-time-centered.png') });
  } finally {
    db.close();
  }
});

test('native Finance save centers the exact second person policy among repeated forms', async ({
  page,
}, info) => {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const db = database.sqlite;
  try {
    const repository = new PortalRepository(db);
    const userId = (email: string) =>
      (db.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    // Canonical setup stays inside the disposable fixture and gives every viewport its own history.
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(info.project.name).client.id,
      name: `Navigation repeated person policy ${info.project.name}`,
      costCenterCode: e2eCostCenter('QA-NAV-PERSON', 92, info.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-01-01',
    }).id;
    if (db.prepare('SELECT status FROM project WHERE id=?').get(projectId)?.status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable repeated person policy navigation fixture',
      });
    for (const worker of ['worker', 'worker2'] as const)
      repository.assignWorker(owner, {
        projectId,
        workerId: userId(e2eCredentials[worker].email),
        startsOn: '2026-01-01',
      });
    await signIn(page, 'owner');
    const effectiveFrom = new Date().toISOString().slice(0, 10);
    const query = new URLSearchParams({
      view: 'commercial',
      task: 'Person expense policies',
      project: projectId,
      asOf: effectiveFrom,
      lang: 'en',
    });
    await page.goto(portal(`/finance?${query}#person-expense-policies`));
    const forms = page.locator('form[data-worker-reimbursement-form]');
    await expect(forms).toHaveCount(2);
    const firstId = await forms.nth(0).locator('[name="projectMemberId"]').inputValue();
    const secondId = await forms.nth(1).locator('[name="projectMemberId"]').inputValue();
    const version = (id: string) =>
      db.prepare('SELECT version FROM project_member WHERE id=?').get(id)?.version as number;
    const firstVersion = version(firstId);
    const secondVersion = version(secondId);
    const second = page.locator(
      `form[data-worker-reimbursement-form]:has(input[name="projectMemberId"][value="${secondId}"])`,
    );
    await second.locator('[name="mode"]').selectOption('none');
    await second.locator('[name="effectiveFrom"]').fill(effectiveFrom);
    const reason = `Navigation fixture ${info.project.name}`;
    await second.locator('[name="reason"]').fill(reason);
    await second.getByRole('button', { name: 'Save worker override', exact: true }).click();
    await expect.poll(() => version(secondId)).toBe(secondVersion + 1);
    expect(
      db
        .prepare(
          'SELECT mode,reason FROM reimbursement_preference_revision WHERE project_member_id=? AND effective_from=?',
        )
        .get(secondId, effectiveFrom),
    ).toMatchObject({ mode: 'none', reason });
    expect(version(firstId)).toBe(firstVersion);
    expect(
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM reimbursement_preference_revision WHERE project_member_id=?',
        )
        .get(firstId)?.count,
    ).toBe(0);
    await centered(second);
    await expect(second.locator('[name="mode"]')).toHaveValue('none');
    await expect(second.locator('[name="mode"]')).toBeInViewport();
    await expect(second).toBeFocused();
    expect(new URL(page.url()).searchParams.get('project')).toBe(projectId);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('finance-second-person-policy-saved.png') });
  } finally {
    db.close();
  }
});
