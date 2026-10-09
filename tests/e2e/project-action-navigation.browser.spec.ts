import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

async function centered(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const heading = element.querySelector<HTMLElement>('h2, h3, legend');
        const destination =
          element.getBoundingClientRect().height > innerHeight * 0.7
            ? (heading ?? element)
            : element;
        const bounds = destination.getBoundingClientRect();
        const ideal = scrollY + bounds.top + bounds.height / 2 - innerHeight / 2;
        const attainable = Math.max(
          0,
          Math.min(ideal, document.documentElement.scrollHeight - innerHeight),
        );
        return Math.abs(scrollY - attainable);
      }),
    )
    .toBeLessThan(24);
}

test('project actions bring their destination into view and retain project scope', async ({
  page,
}) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath, { readOnly: true });
  const project = db.prepare("SELECT id FROM project WHERE status='active' LIMIT 1").get() as {
    id: string;
  };
  db.close();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'owner');
  const workUrl = portal(`/projects/${project.id}?tab=work&lang=en`);

  for (const [name, id] of [
    ['Add people', 'project-assignment'],
    ['Team and conditions', 'project-person-conditions'],
    ['Reports and supporting documents', 'project-reports'],
  ]) {
    await page.goto(workUrl);
    await page.getByRole('link', { name, exact: true }).click();
    const target = page.locator(`#${id}`);
    await centered(target);
    await expect(target).toBeFocused();
    expect(
      new URL(page.url()).searchParams.get('project') ??
        new URL(page.url()).pathname.split('/').at(-1),
    ).toBe(project.id);
  }

  for (const [name, title] of [
    ['Log hours', 'Log time'],
    ['Add expense', 'Record expense'],
  ]) {
    await page.goto(workUrl);
    await page.getByRole('link', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('select[name="projectId"]')).toHaveValue(project.id);
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(page.viewportSize()!.height);
    await dialog
      .getByRole('button', {
        name: title === 'Log time' ? 'Close time form' : 'Close expense form',
        exact: true,
      })
      .click();
  }

  // Reuse the dynamic PortalShell route: the original onMount-only scroll missed this case.
  await page.goto(portal('/time?lang=en'));
  await page.evaluate(() => {
    (window as unknown as { navigationMarker: string }).navigationMarker = 'spa';
  });
  await page.evaluate(
    (href) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = 'Assignment shortcut';
      document.body.append(link);
      link.click();
    },
    portal(`/projects?action=assign-worker&project=${project.id}&lang=en`),
  );
  await centered(page.locator('#project-assignment'));
  expect(
    await page.evaluate(() => (window as unknown as { navigationMarker: string }).navigationMarker),
  ).toBe('spa');
  await page.evaluate(() => window.scrollTo({ top: 250, behavior: 'instant' }));
  const previousScroll = await page.evaluate(() => scrollY);
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    document.body.append(link);
    link.click();
  }, workUrl);
  await expect(page.locator('#project-panel-work')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#project-assignment')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(previousScroll);
  expect(errors).toEqual([]);
});
