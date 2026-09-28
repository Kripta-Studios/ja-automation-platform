import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { visibleEnglishLeftovers } from './support/visible-locale-audit.js';

test('owner sees translated crew and calculation pages in ES and PT', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  let projectId = '';
  try {
    projectId = (
      db.prepare("SELECT id FROM project WHERE status IN ('active','planned') ORDER BY created_at,id LIMIT 1")
        .get() as { id: string }
    ).id;
  } finally {
    db.close();
  }
  await signIn(page, 'owner');
  await page.goto(portal(`/crew?project=${projectId}&date=2026-09-24&lang=es`));
  await expect(page.getByRole('heading', { name: 'Horas del equipo del proyecto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Designar un jefe de equipo' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES');
  expect(await visibleEnglishLeftovers(page, 'es')).toEqual([]);

  await page.goto(portal(`/projects/${projectId}/calculation?lang=pt`));
  await expect(page.getByRole('heading', { name: 'Como este projeto é calculado' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Totais do período' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(await visibleEnglishLeftovers(page, 'pt')).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Como este projeto é calculado' })).toBeVisible();
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
});
