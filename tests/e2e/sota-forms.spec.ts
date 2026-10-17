import { randomUUID } from 'node:crypto';
import { createDatabase, PortalRepository } from '@ja/database';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';
import { stepUpB5Principal } from '../fixtures/b5-lifecycle-security-fixture.js';

const focusViewports = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

async function sheetFocusables(sheet: Locator): Promise<number> {
  return sheet.evaluate(
    (panel) =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          !element.closest('[inert]') &&
          (!element.closest('details:not([open])') || element.matches('summary')),
      ).length,
  );
}

async function focusedFieldGeometry(sheet: Locator) {
  return sheet.evaluate((panel) => {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement)) return null;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      )
    )
      return { isField: false, inSticky: false, name: '' };

    const body = panel.querySelector<HTMLElement>('.responsive-sheet-body');
    if (!body) return null;
    const bodyBounds = body.getBoundingClientRect();
    const startEdge = Math.max(0, bodyBounds.top);
    const endEdge = Math.min(window.innerHeight, bodyBounds.bottom);
    let startClearance = 0;
    let endClearance = 0;
    const inSticky = Boolean(target.closest('.sheet-form-actions'));
    const stickyGeometry: string[] = [];

    for (const element of body.querySelectorAll<HTMLElement>('*')) {
      if (element.contains(target)) continue;
      const position = getComputedStyle(element).position;
      if (position !== 'sticky' && position !== 'fixed') continue;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      stickyGeometry.push(
        `${element.tagName.toLowerCase()}.${element.className} ${bounds.top.toFixed(1)}..${bounds.bottom.toFixed(1)}`,
      );
      if (bounds.top <= startEdge + 1 && bounds.bottom > startEdge)
        startClearance = Math.max(startClearance, Math.min(endEdge, bounds.bottom) - startEdge);
      if (bounds.bottom >= endEdge - 1 && bounds.top < endEdge)
        endClearance = Math.max(endClearance, endEdge - Math.max(startEdge, bounds.top));
    }

    const label = Array.from(target.labels ?? []).find((item) => item.getClientRects().length > 0);
    const labelBounds = label?.getBoundingClientRect();
    const controlBounds = target.getBoundingClientRect();
    return {
      isField: true,
      inSticky,
      name: target.getAttribute('name') ?? '',
      safeTop: startEdge + startClearance,
      safeBottom: endEdge - endClearance,
      safeLeft: bodyBounds.left,
      safeRight: bodyBounds.right,
      bodyTop: bodyBounds.top,
      bodyBottom: bodyBounds.bottom,
      stickyGeometry,
      controlTop: controlBounds.top,
      controlBottom: controlBounds.bottom,
      controlLeft: controlBounds.left,
      controlRight: controlBounds.right,
      labelTop: labelBounds?.top ?? controlBounds.top,
      labelBottom: labelBounds?.bottom ?? controlBounds.bottom,
      labelLeft: labelBounds?.left ?? controlBounds.left,
      labelRight: labelBounds?.right ?? controlBounds.right,
      labelFound: Boolean(label),
    };
  });
}

async function traverseSheet(page: Page, sheet: Locator, direction: 'forward' | 'backward') {
  const total = await sheetFocusables(sheet);
  expect(total).toBeGreaterThan(0);
  await sheet.evaluate((panel) => {
    const first = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      ),
    ).find(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.closest('[inert]') &&
        (!element.closest('details:not([open])') || element.matches('summary')),
    );
    first?.focus();
  });
  let index = 0;
  const visitedFields: string[] = [];

  for (let step = 0; step < total; step += 1) {
    await expect
      .poll(() =>
        sheet.evaluate((panel) => {
          const elements = Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter(
            (element) =>
              element.getClientRects().length > 0 &&
              !element.closest('[inert]') &&
              (!element.closest('details:not([open])') || element.matches('summary')),
          );
          return elements.indexOf(document.activeElement as HTMLElement);
        }),
      )
      .toBe(index);

    const geometry = await focusedFieldGeometry(sheet);
    if (geometry?.isField && !geometry.inSticky) {
      const geometryDetails = JSON.stringify(geometry);
      expect(geometry.labelFound, `${geometry.name} should have its native label`).toBe(true);
      expect(
        geometry.controlTop,
        `${geometry.name} control is below sticky content: ${geometryDetails}`,
      ).toBeGreaterThanOrEqual(geometry.safeTop - 1);
      expect(
        geometry.controlBottom,
        `${geometry.name} control is under sticky content`,
      ).toBeLessThanOrEqual(geometry.safeBottom + 1);
      expect(
        geometry.labelTop,
        `${geometry.name} label is below sticky content`,
      ).toBeGreaterThanOrEqual(geometry.safeTop - 1);
      expect(
        geometry.labelBottom,
        `${geometry.name} label is under sticky content`,
      ).toBeLessThanOrEqual(geometry.safeBottom + 1);
      if (geometry.name === 'contractNumber' || geometry.name === 'country')
        visitedFields.push(geometry.name);
    }

    const nextIndex = (index + (direction === 'forward' ? 1 : total - 1)) % total;
    let reachedNext = false;
    for (let nativeStep = 0; nativeStep < 5; nativeStep += 1) {
      await page.keyboard.press(direction === 'forward' ? 'Tab' : 'Shift+Tab');
      const activeInfo = await sheet.evaluate((panel) => {
        const elements = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (element) =>
            element.getClientRects().length > 0 &&
            !element.closest('[inert]') &&
            (!element.closest('details:not([open])') || element.matches('summary')),
        );
        return {
          index: elements.indexOf(document.activeElement as HTMLElement),
        };
      });
      const activeIndex = activeInfo.index;
      if (activeIndex === nextIndex) {
        reachedNext = true;
        break;
      }
      // Chromium date inputs can consume Tab inside their native date segments before
      // moving to the next DOM focus target. The dialog must remain on the same field
      // during those native steps and then proceed in document order.
      expect(activeIndex, `${direction} step ${step} should stay in the dialog`).toBe(index);
    }
    expect(
      reachedNext,
      `${direction} step ${step} should advance to focus target ${nextIndex}`,
    ).toBe(true);
    index = nextIndex;
  }
  expect(visitedFields).toContain('contractNumber');
  expect(visitedFields).toContain('country');
}

async function focusAndCapture(
  page: Page,
  sheet: Locator,
  fieldName: 'contractNumber' | 'country',
  info: TestInfo,
  captureName: string,
) {
  const control = sheet.locator(`[name="${fieldName}"]`);
  await control.focus();
  await expect(control).toBeFocused();
  await expect
    .poll(async () => {
      const geometry = await focusedFieldGeometry(sheet);
      return Boolean(
        geometry?.isField &&
        !geometry.inSticky &&
        geometry.labelFound &&
        geometry.controlTop >= geometry.safeTop - 1 &&
        geometry.controlBottom <= geometry.safeBottom + 1 &&
        geometry.labelTop >= geometry.safeTop - 1 &&
        geometry.labelBottom <= geometry.safeBottom + 1 &&
        geometry.controlLeft >= geometry.safeLeft - 1 &&
        geometry.controlRight <= geometry.safeRight + 1 &&
        geometry.labelLeft >= geometry.safeLeft - 1 &&
        geometry.labelRight <= geometry.safeRight + 1,
      );
    })
    .toBe(true);
  await page.screenshot({ path: info.outputPath(captureName) });
}

function seedComposerProject() {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const repo = new PortalRepository(db.sqlite);
    const idFor = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const owner = repo.principalFor(idFor(e2eCredentials.owner.email));
    const workers = (['worker', 'worker2'] as const).map((role) => {
      const id = idFor(e2eCredentials[role].email);
      const user = db.sqlite.prepare('SELECT name FROM user WHERE id=?').get(id) as {
        name: string;
      };
      return {
        id,
        name: user.name,
        principal: stepUpB5Principal(
          db.sqlite,
          repo.principalFor(id),
          `sota-forms-${randomUUID()}`,
        ),
      };
    });
    const today = new Date().toISOString().slice(0, 10);
    const client = repo.createClient(owner, {
      legalName: `SOTA forms client ${randomUUID()}`,
      displayName: 'SOTA forms filter fixture',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'sota-forms@example.test',
      billingAddress: 'Disposable SOTA forms fixture',
    });
    const project = repo.createProject(owner, {
      clientId: client.id,
      name: `SOTA forms filters ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-FORMS', 76, 'desktop'),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    });
    if (
      (
        db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(project.id) as {
          status: string;
        }
      ).status !== 'active'
    )
      repo.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Activate disposable SOTA forms fixture',
      });

    for (const worker of workers)
      repo.assignWorker(owner, { projectId: project.id, workerId: worker.id, startsOn: today });
    const entity = repo.createLegalEntity(owner, {
      code: `SF-${randomUUID().slice(0, 10).toUpperCase()}`,
      legalName: 'SOTA forms fixture issuer',
      currency: 'USD',
      billingAddress: 'Disposable SOTA forms issuer',
      companyIdentifiers: `SOTA-FORMS-${randomUUID().slice(0, 8)}`,
    });
    repo.createBillingRule(owner, {
      projectId: project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      currency: 'USD',
      effectiveFrom: today,
    });
    const ids = workers.map((worker, index) => {
      const record = repo.createTimeEntry(worker.principal, {
        projectId: project.id,
        workDate: today,
        category: 'regular',
        minutes: 60,
        summary: `SOTA form filter row ${index + 1}`,
      });
      repo.submitTime(worker.principal, record.id, record.version);
      return record.id;
    });
    return { projectId: project.id, workers: workers.map(({ id, name }) => ({ id, name })), ids };
  } finally {
    db.sqlite.close();
  }
}

test('project edit focus remains clear of the sticky action bar at responsive sizes', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(180_000);
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  await signIn(page, 'owner');
  await page.goto(portal(`/projects/${fixture.project.id}?lang=en`));
  await page.waitForLoadState('networkidle');
  const trigger = page.locator('[data-project-edit-cta]').first();

  for (const viewport of focusViewports) {
    await page.setViewportSize(viewport);
    await trigger.click();
    const sheet = page.locator('.project-edit-sheet');
    await expect(sheet).toBeVisible();
    await traverseSheet(page, sheet, 'forward');
    await traverseSheet(page, sheet, 'backward');
    await focusAndCapture(
      page,
      sheet,
      'contractNumber',
      info,
      `focus-contract-${viewport.width}.png`,
    );
    await focusAndCapture(page, sheet, 'country', info, `focus-country-${viewport.width}.png`);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const zoomSheet = page.locator('.project-edit-sheet');
  // Use 200% root text sizing as a zoom/reflow equivalent while preserving
  // Playwright's CSS-pixel viewport and responsive breakpoints.
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await traverseSheet(page, zoomSheet, 'forward');
  await traverseSheet(page, zoomSheet, 'backward');
  await focusAndCapture(page, zoomSheet, 'country', info, 'focus-country-390-text-scale-200.png');
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  await page.keyboard.press('Escape');
  await expect(zoomSheet).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await trigger.click();
  const spacingSheet = page.locator('.project-edit-sheet');
  // Apply user spacing through CSSOM without bypassing the production CSP.
  // The sheet and these temporary styles are removed when it closes below.
  await spacingSheet.evaluate((sheet) => {
    for (const element of [sheet, ...sheet.querySelectorAll<HTMLElement>('*')]) {
      const style = (element as HTMLElement).style;
      style.setProperty('letter-spacing', '.12em', 'important');
      style.setProperty('word-spacing', '.16em', 'important');
      style.setProperty('line-height', '1.5', 'important');
      if (element.tagName === 'P') style.setProperty('margin-block-end', '2em', 'important');
    }
  });
  await traverseSheet(page, spacingSheet, 'forward');
  await traverseSheet(page, spacingSheet, 'backward');
  await focusAndCapture(page, spacingSheet, 'country', info, 'focus-country-1440-spacing.png');
  await page.keyboard.press('Escape');
  await expect(spacingSheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('worker, status and type filters preserve exact selection and never approve records', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(120_000);
  const fixture = seedComposerProject();
  await signIn(page, 'owner');
  const composerPosts: string[] = [];
  await page.goto(portal(`/projects/${fixture.projectId}?tab=work&lang=en`));
  await page.waitForLoadState('networkidle');
  const composer = page.locator('[data-invoice-composer]');
  await expect(composer.locator('.composer-records > .composer-record')).toHaveCount(2);
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/app/api/billing/composer'))
      composerPosts.push(request.url());
  });

  const locales = [
    {
      locale: 'en',
      labels: {
        worker: 'Worker',
        state: 'Show',
        type: 'Record type',
        select: 'Select visible records',
        clear: 'Clear selection',
      },
      oneVisible: '1 of 2 records visible',
      noneVisible: '0 of 2 records visible',
      selectedOne: 'Selected records: 1',
      selectedTwo: 'Selected records: 2',
    },
    {
      locale: 'es',
      labels: {
        worker: 'Trabajador',
        state: 'Mostrar',
        type: 'Tipo de registro',
        select: 'Seleccionar registros visibles',
        clear: 'Quitar selección',
      },
      oneVisible: '1 de 2 registros visibles',
      noneVisible: '0 de 2 registros visibles',
      selectedOne: 'Registros seleccionados: 1',
      selectedTwo: 'Registros seleccionados: 2',
    },
    {
      locale: 'pt',
      labels: {
        worker: 'Trabalhador',
        state: 'Mostrar',
        type: 'Tipo de registro',
        select: 'Selecionar registros visíveis',
        clear: 'Limpar seleção',
      },
      oneVisible: '1 de 2 registros visíveis',
      noneVisible: '0 de 2 registros visíveis',
      selectedOne: 'Registros selecionados: 1',
      selectedTwo: 'Registros selecionados: 2',
    },
  ] as const;

  for (const viewport of focusViewports) {
    for (const translation of locales) {
      await page.setViewportSize(viewport);
      await page.goto(portal(`/projects/${fixture.projectId}?tab=work&lang=${translation.locale}`));
      await page.waitForLoadState('networkidle');
      await expect(composer.locator('.composer-records > .composer-record')).toHaveCount(2);
      const worker = composer.getByRole('combobox', {
        name: translation.labels.worker,
        exact: true,
      });
      const state = composer.getByRole('combobox', { name: translation.labels.state, exact: true });
      const type = composer.getByRole('combobox', { name: translation.labels.type, exact: true });
      const count = composer.locator('.composer-filter-counts');
      const selectVisible = composer.getByRole('button', {
        name: translation.labels.select,
        exact: true,
      });
      const clearSelection = composer.getByRole('button', {
        name: translation.labels.clear,
        exact: true,
      });
      for (const control of [worker, state, type, selectVisible, clearSelection]) {
        await expect(control).toBeVisible();
        const bounds = await control.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      }
      expect(
        await composer.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);

      if (await clearSelection.isEnabled()) await clearSelection.click();
      await worker.selectOption(fixture.workers[0]!.id);
      await expect(count).toContainText(translation.oneVisible);
      await selectVisible.click();
      await expect(composer.locator('.composer-records input:checked')).toHaveCount(1);
      await expect(count).toContainText(translation.selectedOne);

      await worker.selectOption(fixture.workers[1]!.id);
      await expect(composer.locator('.composer-records > .composer-record')).toHaveCount(1);
      await expect(composer.locator('.composer-records input:checked')).toHaveCount(0);
      await expect(count).toContainText(translation.selectedOne);

      await state.selectOption('ready');
      await expect(count).toContainText(translation.noneVisible);
      await expect(count).toContainText(translation.selectedOne);
      await state.selectOption('all');
      await type.selectOption('expense');
      await expect(count).toContainText(translation.noneVisible);
      await expect(count).toContainText(translation.selectedOne);

      await worker.selectOption('');
      await type.selectOption('');
      await expect(composer.locator('.composer-records input:checked')).toHaveCount(1);
      await selectVisible.click();
      await expect(composer.locator('.composer-records input:checked')).toHaveCount(2);
      await expect(count).toContainText(translation.selectedTwo);
      await clearSelection.click();
      await expect(composer.locator('.composer-records input:checked')).toHaveCount(0);
    }
  }

  expect(composerPosts).toEqual([]);
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const rows = db.sqlite
      .prepare('SELECT id,approval_state FROM time_entry WHERE id IN (?,?) ORDER BY id')
      .all(...fixture.ids) as Array<{ id: string; approval_state: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.approval_state === 'submitted')).toBe(true);
  } finally {
    db.sqlite.close();
  }
});
