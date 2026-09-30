import { expect, test } from '@playwright/test';

const archivedId = '01a0f0ff-9389-72c2-a31b-5736e2c45e23';
const archivedProject = '01a0f0fd-32c7-756e-a7b5-7405d9af5bd2';
const activeId = '01a0f031-2186-7478-9a1d-01f5d6275e4a';
const activeProject = '01a0f00f-19ae-70a3-ba61-ce3e241fc39a';
const copy = {
  en: {
    archived: 'Archived',
    active: 'Active',
    create: 'Create invoice draft',
    cancel: 'Cancel',
    cadence: 'Monthly',
    configure: 'Configure person rates',
    viewRates: 'View person rates',
  },
  es: {
    archived: 'Archivado',
    active: 'Activo',
    create: 'Crear borrador de factura',
    cancel: 'Cancelar',
    cadence: 'Mensual',
    configure: 'Configurar tarifas por persona',
    viewRates: 'Ver tarifas por persona',
  },
  pt: {
    archived: 'Arquivado',
    active: 'Ativo',
    create: 'Criar rascunho de fatura',
    cancel: 'Cancelar',
    cadence: 'Mensal',
    configure: 'Configurar tarifas por pessoa',
    viewRates: 'Ver tarifas por pessoa',
  },
};

test.setTimeout(60000);

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`archived streams remain readable without active controls in ${locale}`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const observations: unknown[] = [];
    for (const role of ['owner', 'finance', 'auditor'] as const) {
      const state = process.env[`JA_PROD_QA_${role.toUpperCase()}_STATE`];
      if (!state) throw new Error(`Missing authenticated ${role} state`);
      const context = await browser.newContext({
        storageState: state,
        viewport: testInfo.project.use.viewport,
      });
      try {
        const page = await context.newPage();
        const posts: string[] = [],
          errors: string[] = [];
        page.on('request', (request) => {
          if (request.method() === 'POST') posts.push(request.url());
        });
        page.on('pageerror', (error) => errors.push(error.message));
        expect(
          (
            await page.goto(`${baseURL}/j-aautomation/app/profile?lang=en`, {
              waitUntil: 'networkidle',
            })
          )?.status(),
        ).toBe(200);
        expect(page.url()).not.toContain('/login');
        await expect(page.locator('.security-panel > p')).toContainText(
          { owner: 'Owner / Admin', finance: 'Finance Admin', auditor: 'Auditor' }[role],
        );
        const archiveURL = `${baseURL}/j-aautomation/app/billing?view=streams&project=${archivedProject}&focus=${archivedId}&lang=${locale}`;
        expect((await page.goto(archiveURL, { waitUntil: 'networkidle' }))?.status()).toBe(200);
        expect(page.url()).not.toContain('/login');
        const row = page.locator(`[data-billing-rule="${archivedId}"]`);
        await expect(row).toBeVisible();
        await expect(row.getByText(copy[locale].archived, { exact: true })).toBeVisible();
        await expect(row).toContainText(copy[locale].cadence);
        expect(await row.locator('form').count()).toBe(0);
        expect(await row.locator('.billing-section__rule-editor').count()).toBe(0);
        expect(await row.innerText()).toContain('2026-10-01');
        expect(await row.innerText()).toContain('2026-09-30');
        expect(await row.innerText()).not.toContain('2026-10-01 → 2026-09-30');
        const saved = row.locator('[data-saved-stream]');
        await saved.locator(':scope > summary').click();
        await expect(saved).toContainText('QA-SWARM-R5 unused stream control UI 20260930');
        await expect(saved).toContainText('30');
        await saved.evaluate((element) =>
          element.scrollIntoView({ block: 'center', behavior: 'instant' }),
        );
        await page.screenshot({
          path: testInfo.outputPath(`archived-stream-${role}-${locale}.png`),
        });
        const stateFilter = page.locator('.record-browser select').first();
        await stateFilter.selectOption('archived');
        await expect(row).toBeVisible();
        await page.reload({ waitUntil: 'networkidle' });
        await expect(row.getByText(copy[locale].archived, { exact: true })).toBeVisible();
        expect(await stateFilter.inputValue()).toBe('archived');

        expect(
          (
            await page.goto(
              `${baseURL}/j-aautomation/app/projects/${archivedProject}?tab=billing&lang=${locale}`,
              { waitUntil: 'networkidle' },
            )
          )?.status(),
        ).toBe(200);
        const projectPanel = page.locator('#project-panel-billing');
        await expect(projectPanel).toBeVisible();
        const streamLink = projectPanel.locator(`.billing-stream[href*="${archivedId}"]`);
        await expect(streamLink.getByText(copy[locale].archived, { exact: true })).toBeVisible();
        expect(
          await projectPanel
            .getByRole('button', { name: copy[locale].create, exact: true })
            .count(),
        ).toBe(0);
        expect(await page.locator('form[action*="?/createInvoiceDraft"]').count()).toBe(0);
        await streamLink.click();
        await expect(page.locator(`[data-billing-rule="${archivedId}"]`)).toBeVisible();
        expect(new URL(page.url()).searchParams.get('project')).toBe(archivedProject);
        expect(new URL(page.url()).searchParams.get('focus')).toBe(archivedId);
        await page.goBack({ waitUntil: 'networkidle' });
        expect(new URL(page.url()).searchParams.get('tab')).toBe('billing');

        expect(
          (
            await page.goto(
              `${baseURL}/j-aautomation/app/billing?view=streams&project=${activeProject}&focus=${activeId}&lang=${locale}`,
              { waitUntil: 'networkidle' },
            )
          )?.status(),
        ).toBe(200);
        const activeRow = page.locator(`[data-billing-rule="${activeId}"]`);
        await expect(activeRow.getByText(copy[locale].active, { exact: true })).toBeVisible();
        const editable = role !== 'auditor';
        for (const action of [
          'createDraft',
          'updateBillingRule',
          'archiveBillingRule',
          'closePeriod',
        ]) {
          expect(await activeRow.locator(`form[action="?/${action}"]`).count()).toBe(
            editable ? 1 : 0,
          );
        }
        expect(
          (
            await page.goto(
              `${baseURL}/j-aautomation/app/projects/${activeProject}?tab=billing&lang=${locale}`,
              { waitUntil: 'networkidle' },
            )
          )?.status(),
        ).toBe(200);
        const activePanel = page.locator('#project-panel-billing');
        if (editable) {
          await activePanel.getByRole('button', { name: copy[locale].create, exact: true }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          const options = await dialog
            .locator('select[name="billingRuleId"] option')
            .evaluateAll((elements) =>
              elements.map((element) => (element as HTMLOptionElement).value),
            );
          expect(options).toEqual([activeId]);
          await dialog.getByRole('button', { name: copy[locale].cancel, exact: true }).click();
          await expect(dialog).toBeHidden();
        } else {
          expect(
            await activePanel
              .getByRole('button', { name: copy[locale].create, exact: true })
              .count(),
          ).toBe(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
          false,
        );
        await page.goto(
          `${baseURL}/j-aautomation/app/projects/${activeProject}?tab=team&lang=${locale}`,
          {
            waitUntil: 'networkidle',
          },
        );
        await expect(
          page.locator('#project-panel-team').getByRole('link', {
            name: editable ? copy[locale].configure : copy[locale].viewRates,
            exact: true,
          }),
        ).toBeVisible();
        expect(posts).toEqual([]);
        expect(errors).toEqual([]);
        observations.push({
          role,
          locale,
          archivedId,
          activeId,
          archivedForms: 0,
          activeEditable: editable,
          posts,
          errors,
        });
      } finally {
        await context.close();
      }
    }
    await testInfo.attach('readonly-stream-observations', {
      body: JSON.stringify(observations, null, 2),
      contentType: 'application/json',
    });
  });

  test(`Auditor person rates link ${locale} stays read-only`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const state = process.env.JA_PROD_QA_AUDITOR_STATE;
    if (!state) throw new Error('Missing authenticated Auditor state');
    const context = await browser.newContext({
      storageState: state,
      viewport: testInfo.project.use.viewport,
    });
    try {
      const page = await context.newPage();
      const posts: string[] = [],
        errors: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      expect(
        (
          await page.goto(`${baseURL}/j-aautomation/app/profile?lang=en`, {
            waitUntil: 'networkidle',
          })
        )?.status(),
      ).toBe(200);
      expect(page.url()).not.toContain('/login');
      await expect(page.locator('.security-panel > p')).toContainText('Auditor');
      expect(
        (
          await page.goto(
            `${baseURL}/j-aautomation/app/projects/${activeProject}?tab=team&lang=${locale}`,
            { waitUntil: 'networkidle' },
          )
        )?.status(),
      ).toBe(200);
      const panel = page.locator('#project-panel-team');
      const link = panel.getByRole('link', { name: copy[locale].viewRates, exact: true });
      await expect(link).toBeVisible();
      expect(
        await panel.getByRole('link', { name: copy[locale].configure, exact: true }).count(),
      ).toBe(0);
      const href = new URL((await link.getAttribute('href'))!, baseURL);
      expect(href.searchParams.get('project')).toBe(activeProject);
      expect(href.searchParams.get('view')).toBe('commercial');
      await link.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`auditor-team-rates-${locale}.png`) });
      await link.click();
      await expect(page).toHaveURL((url) => url.pathname === '/j-aautomation/app/finance');
      await page.waitForLoadState('networkidle');
      expect(new URL(page.url()).pathname).toBe('/j-aautomation/app/finance');
      expect(new URL(page.url()).searchParams.get('project')).toBe(activeProject);
      expect(new URL(page.url()).searchParams.get('view')).toBe('commercial');
      expect(await page.locator('main form[method="POST" i]').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      expect(posts).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`auditor-rates-readonly-target-${locale}.png`),
      });
      await testInfo.attach('auditor-person-rates-readonly', {
        body: JSON.stringify({
          locale,
          project: activeProject,
          url: page.url(),
          posts,
          errors,
          postForms: 0,
        }),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
}
