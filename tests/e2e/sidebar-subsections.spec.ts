import { expect, test } from '@playwright/test';
import {
  portalNavigationForRole,
  subsectionsForNavItem,
} from '../../apps/portal/src/lib/portal-navigation.ts';
import { signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';

const cases = {
  'phone-390': {
    role: 'worker' as const,
    section: 'Reports',
    subsection: 'Technical / PLC',
    target: 'report-panel-technical',
    view: 'technical',
  },
  'tablet-768': {
    role: 'finance' as const,
    section: 'Economic Review',
    subsection: 'Time',
    target: 'finance-source-records',
    view: 'economic',
  },
  desktop: {
    role: 'owner' as const,
    section: 'Time',
    subsection: 'Enter a week in a table',
    target: 'time-owner-batch-title',
    view: '',
  },
};

test('sidebar subsection links navigate, reveal content, and focus the destination', async ({
  page,
}, testInfo) => {
  test.skip(!(testInfo.project.name in cases), 'Three required layout widths');
  const scenario = cases[testInfo.project.name as keyof typeof cases];
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await signIn(page, scenario.role);
  const drawer = page.locator('#portal-navigation');
  const mobileDrawer = testInfo.project.name !== 'desktop';
  const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
  if (mobileDrawer) await menuButton.click();

  const navigationRow = drawer
    .locator('.nav-entry')
    .filter({
      has: page.locator('.nav-entry-main > a').filter({ hasText: scenario.section }),
    })
    .first();
  const pageLink = navigationRow.locator('.nav-entry-main > a');
  const toggle = navigationRow.getByRole('button', { name: `Sections: ${scenario.section}` });
  await expect(pageLink).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await pageLink.click();
  await expect(page).toHaveURL(new RegExp('/app/(reports|finance|time)', 'u'));
  if (mobileDrawer) await menuButton.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const submenu = navigationRow.locator('.nav-subsections');
  await expect(submenu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-controls', await submenu.getAttribute('id'));
  if (scenario.role === 'worker') {
    await expect(drawer.getByRole('button', { name: /Commercial Configuration/u })).toHaveCount(0);
    await expect(submenu).not.toContainText('Worker compensation');
  }

  const shortcut = submenu.getByRole('link', { name: scenario.subsection, exact: true });
  await expect(shortcut).toHaveAttribute('href', new RegExp(`#${scenario.target}$`, 'u'));
  await shortcut.click();
  await expect(page).toHaveURL(new RegExp(`#${scenario.target}$`, 'u'));
  if (scenario.view) {
    expect(new URL(page.url()).searchParams.get('view')).toBe(scenario.view);
  }
  await expect(page.locator(`#${scenario.target}`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(scenario.target);
  if (scenario.target === 'time-owner-batch-title')
    await expect(page.locator('details.time-owner-batch')).toHaveAttribute('open', '');
  if (mobileDrawer) {
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).not.toHaveClass(/(?:^|\s)open(?:\s|$)/u);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(runtimeErrors).toEqual([]);
});

test('Escape collapses a desktop subsection and restores toggle focus', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop keyboard contract');
  await signIn(page, 'owner');
  const row = page
    .locator('#portal-navigation .nav-entry')
    .filter({
      has: page.locator('.nav-entry-main > a').filter({ hasText: 'Time' }),
    })
    .first();
  const toggle = row.getByRole('button', { name: 'Sections: Time' });
  await toggle.click();
  const shortcut = row.getByRole('link', { name: 'Recent time entries' });
  await shortcut.focus();
  await shortcut.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('every role shortcut with a hash resolves to content in the disposable browser app', async ({
  page,
}, testInfo) => {
  test.skip(!(testInfo.project.name in cases), 'Three required layout widths');
  test.setTimeout(240_000);
  const scenario = cases[testInfo.project.name as keyof typeof cases];
  await signIn(page, scenario.role);
  const role =
    scenario.role === 'owner'
      ? 'owner_admin'
      : scenario.role === 'finance'
        ? 'finance_admin'
        : 'worker';
  const navigation = portalNavigationForRole('/j-aautomation', role);
  const items = [
    ...navigation.primary,
    ...navigation.secondary,
    ...navigation.admin,
    ...navigation.security,
  ];
  for (const item of items) {
    const destination =
      item.href ??
      (item.section === 'today' ? '/j-aautomation/app/' : `/j-aautomation/app/${item.section}`);
    for (const subsection of subsectionsForNavItem(item, destination, role)) {
      const target = new URL(subsection.href, 'http://127.0.0.1:4174');
      if (!target.hash) continue;
      await page.goto(target.toString());
      const id = decodeURIComponent(target.hash.slice(1));
      await expect(
        page.locator(`#${id}`),
        `${scenario.role}: ${item.label} → ${subsection.label} must resolve ${id}`,
      ).toHaveCount(1);
    }
  }
});

test('manager, auditor, and external workforce get permitted subsection links', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!['phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  test.setTimeout(240_000);
  const project = testInfo.project.name;
  if (project === 'phone-390') {
    await signIn(page, 'manager');
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const approvals = page.locator('#portal-navigation .nav-entry').filter({
      has: page.locator('.nav-entry-main > a').filter({ hasText: 'Approvals' }),
    });
    await approvals.getByRole('button', { name: 'Sections: Approvals' }).click();
    await approvals.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/approvals\?tab=reports#approval-queue$/u);
    await expect(page.locator('#approval-queue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(
      page.locator('#portal-navigation .nav-entry').filter({ hasText: 'Commercial Configuration' }),
    ).toHaveCount(0);
  } else if (project === 'tablet-768') {
    await signIn(page, 'auditor');
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const economic = page.locator('#portal-navigation .nav-entry').filter({
      has: page.locator('.nav-entry-main > a').filter({ hasText: 'Economic Review' }),
    });
    await economic.getByRole('button', { name: 'Sections: Economic Review' }).click();
    await economic.getByRole('link', { name: 'Time', exact: true }).click();
    await expect(page).toHaveURL(
      /\/app\/finance\?view=economic&source=time#finance-source-records$/u,
    );
    await expect(page.locator('#finance-source-records')).toBeVisible();
    await expect(
      page.locator('#portal-navigation .nav-entry').filter({ hasText: 'Commercial Configuration' }),
    ).toHaveCount(0);
  } else {
    seedSupplierPersonas(readE2EFixturePointer().databasePath);
    await signInManualPersona(page, 'supplierCoordinator');
    const supplier = page.locator('#portal-navigation .nav-entry').filter({
      has: page.locator('.nav-entry-main > a').filter({ hasText: 'Supplier team' }),
    });
    await supplier.getByRole('button', { name: 'Sections: Supplier team' }).click();
    await expect(supplier.getByRole('link', { name: 'Supplier setup' })).toHaveCount(0);
    await supplier.getByRole('link', { name: 'Supplier time' }).click();
    await expect(page).toHaveURL(/workspaceAction=time.*#supplier-workspace$/u);
    await expect(page.locator('#supplier-workspace')).toBeVisible();

    const technicianContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const technician = await technicianContext.newPage();
      await signIn(technician, 'worker2');
      const report = technician.locator('#portal-navigation .nav-entry').filter({
        has: technician.locator('.nav-entry-main > a').filter({ hasText: 'Operational report' }),
      });
      await report.getByRole('button', { name: 'Sections: Operational report' }).click();
      await report.getByRole('link', { name: 'Project', exact: true }).click();
      await expect(technician).toHaveURL(/\/app\/supplier\/report.*#supplier-report-project$/u);
      await expect(technician.locator('#supplier-report-project')).toBeVisible();
      await expect(
        technician.locator('#portal-navigation .nav-entry').filter({ hasText: 'Supplier setup' }),
      ).toHaveCount(0);
    } finally {
      await technicianContext.close();
    }
  }
});
