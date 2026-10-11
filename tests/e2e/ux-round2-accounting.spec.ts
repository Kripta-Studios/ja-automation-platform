import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test.describe('accounting workflows, round two', () => {
  test('report language defaults to the portal locale and validation keeps submitted values', async ({
    page,
  }) => {
    await signIn(page, 'finance');
    for (const [locale, reportLocale] of [
      ['es', 'es'],
      ['pt', 'pt'],
      ['en', 'en'],
    ] as const) {
      await page.goto(portal(`/accounting?lang=${locale}`), { waitUntil: 'networkidle' });
      await page.locator('.accounting-section__create summary').click();
      await expect(page.locator('#accounting-pack-reportLocale')).toHaveValue(reportLocale);
    }

    const form = page.locator('#accounting-generate form[action="?/createAccountingPack"]');
    const submittedDate = '2026-08-12';
    await form.locator('[name="periodStart"]').fill(submittedDate);
    await form.locator('[name="periodEnd"]').fill(submittedDate);
    await form.locator('[name="reportLocale"]').selectOption('pt');
    await form.getByRole('button', { name: 'Generate pack' }).click();

    await expect(page.locator('#accounting-generate [data-ui="problem-notice"]')).toBeVisible();
    await expect(form.locator('[name="periodStart"]')).toHaveValue(submittedDate);
    await expect(form.locator('[name="periodEnd"]')).toHaveValue(submittedDate);
    await expect(form.locator('[name="reportLocale"]')).toHaveValue('pt');
  });

  test('pack periods are named and secondary controls collapse without hiding ready downloads', async ({
    page,
  }) => {
    await signIn(page, 'finance');
    await page.goto(portal('/accounting?lang=es'), { waitUntil: 'networkidle' });
    const stalePacks = page
      .locator('.accounting-pack-artifact-row')
      .filter({ has: page.locator('.accounting-pack-stale-badge') });
    await expect(stalePacks.first()).toBeVisible();
    let cleanStalePackFound = false;
    for (const stalePack of await stalePacks.all()) {
      const hasActiveIssue =
        (await stalePack.locator('[role="alert"], .accounting-pack-export-guidance').count()) > 0;
      if (hasActiveIssue) continue;
      await expect(stalePack.locator('[data-accounting-pack-secondary]')).toHaveJSProperty(
        'open',
        false,
      );
      cleanStalePackFound = true;
      break;
    }
    expect(cleanStalePackFound).toBe(true);

    const pack = page
      .locator('.accounting-pack-artifact-row')
      .filter({ has: page.locator('[data-accounting-pack-download]') })
      .first();
    await expect(pack).toBeVisible();
    const headingId = await pack.locator('h3').getAttribute('id');
    await expect(pack).toHaveAttribute('aria-labelledby', headingId!);
    await expect(pack.locator('.accounting-pack-downloads')).toHaveAttribute(
      'aria-label',
      'Estado y descarga de exportaciones',
    );

    const pendingBadges = page.locator(
      '.accounting-pack-artifact-row .accounting-pack-downloads .artifact-pending',
    );
    for (const badge of await pendingBadges.all()) {
      await expect(badge).toBeVisible();
      expect(await badge.evaluate((element) => element.closest('details'))).toBeNull();
    }

    const secondary = pack.locator('[data-accounting-pack-secondary]');
    if (await secondary.evaluate((element) => (element as HTMLDetailsElement).open))
      await secondary.locator('summary').click();
    await expect(secondary).toHaveJSProperty('open', false);
    const downloads = pack.locator('[data-accounting-pack-download]');
    await expect.poll(() => downloads.count()).toBeGreaterThan(0);
    const [periodStart, periodEnd] = (await pack.locator('h3').innerText()).split(' → ');
    expect(periodStart).toBeTruthy();
    expect(periodEnd).toBeTruthy();
    for (let index = 0; index < (await downloads.count()); index += 1) {
      const download = downloads.nth(index);
      await expect(download).toBeVisible();
      expect(await download.evaluate((element) => element.closest('details'))).toBeNull();
      const accessibleLabel = await download.getAttribute('aria-label');
      expect(accessibleLabel).toContain(periodStart);
      expect(accessibleLabel).toContain(periodEnd);
      const target = await download.boundingBox();
      expect(target?.height).toBeGreaterThanOrEqual(44);
    }
    const secondarySummary = secondary.locator('summary');
    const summaryTarget = await secondarySummary.boundingBox();
    expect(summaryTarget?.height).toBeGreaterThanOrEqual(44);

    await secondarySummary.click();
    await expect(secondary).toHaveJSProperty('open', true);
    const localizedPdf = pack.locator('[data-localized-pdf-panel]');
    if (await localizedPdf.count()) await expect(localizedPdf).toBeVisible();
    await secondarySummary.click();
    await expect(secondary).toHaveJSProperty('open', false);
    for (let index = 0; index < (await downloads.count()); index += 1)
      await expect(downloads.nth(index)).toBeVisible();
  });

  test('final and stale pack filters use localized labels while retaining their values', async ({
    page,
  }) => {
    await signIn(page, 'finance');
    await page.goto(portal('/accounting?lang=es'), { waitUntil: 'networkidle' });
    const status = page.locator('.record-browser__controls select').first();
    const finalOption = status.locator('option[value="final"]');
    await expect(finalOption).toHaveText('Finalizado');
    const staleOption = status.locator('option[value="stale"]');
    if (await staleOption.count()) await expect(staleOption).toHaveText('Desactualizado');

    await status.selectOption('final');
    await expect(status).toHaveValue('final');
    await expect(page.locator('[data-accounting-register-summary]')).toContainText('Finalizado');
    await expect
      .poll(() => page.locator('.accounting-pack-artifact-row').count())
      .toBeGreaterThan(0);
  });

  test('accounting remediation links keep the selected language', async ({ page }) => {
    await signIn(page, 'finance');
    await page.goto(portal('/accounting?lang=es'), { waitUntil: 'networkidle' });
    const packs = page.locator('.accounting-pack-artifact-row');
    await expect(packs.first()).toBeVisible();
    for (const secondary of await page.locator('[data-accounting-pack-secondary]').all()) {
      if (!(await secondary.evaluate((element) => (element as HTMLDetailsElement).open)))
        await secondary.locator('summary').click();
    }
    const remediationLinks = page.locator(
      '.accounting-pack-artifact-row a[href^="/j-aautomation/app/"]:not([data-accounting-pack-download]):not([href*="/artifacts/"])',
    );
    expect(await remediationLinks.count()).toBeGreaterThan(0);
    for (const link of await remediationLinks.all()) {
      const href = await link.getAttribute('href');
      expect(new URL(href!, page.url()).searchParams.get('lang')).toBe('es');
    }
  });

  test('read-only auditors see their access level and no pack write controls', async ({ page }) => {
    await signIn(page, 'auditor');
    await page.goto(portal('/accounting?lang=pt'), { waitUntil: 'networkidle' });
    await expect(page.locator('[data-accounting-auditor-note]')).toContainText(
      'Acesso de auditoria somente leitura',
    );
    await expect(page.locator('[data-accounting-auditor-note]')).toContainText(
      'desativadas para auditores',
    );
    await expect(page.locator('#accounting-generate')).toHaveCount(0);
    await expect(page.locator('form[action="?/finalizeAccountingPack"]')).toHaveCount(0);
  });
});
