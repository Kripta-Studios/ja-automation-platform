import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = join(import.meta.dirname, 'postfix-7b12479');
const problemCode = 'ACCESS_WORKFORCE_SUPPLIER_INACTIVE';

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

function profile(db: DatabaseSync, workerId: string) {
  return db
    .prepare('SELECT supplier_id,profile FROM supplier_user_profile WHERE user_id=?')
    .get(workerId) as { supplier_id: string; profile: string } | undefined;
}

function workerAuditCount(db: DatabaseSync, workerId: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(workerId) as {
      count: number;
    }
  ).count;
}

async function createSupplier(owner: Page, db: DatabaseSync, name: string) {
  await owner.goto(portal('/supplier?workspaceAction=setup&lang=en'));
  const form = owner.locator('form[data-supplier-operation="createSupplier"]');
  await expect(form).toBeVisible();
  await form.locator('[name="name"]').fill(name);
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createSupplier'),
  );
  await form.locator('button[type="submit"], button:not([type])').last().click();
  expect((await pending).status()).toBeLessThan(400);
  await expect
    .poll(() => db.prepare('SELECT id FROM supplier WHERE name=?').get(name))
    .toBeTruthy();
  return (db.prepare('SELECT id FROM supplier WHERE name=?').get(name) as { id: string }).id;
}

async function deactivateSupplier(owner: Page, db: DatabaseSync, supplierId: string, name: string) {
  await owner.goto(portal('/supplier?workspaceAction=directory&lang=en'));
  await owner.locator('.directory-filters input[type="search"]').fill(name);
  const record = owner.locator(`[data-supplier-id="${supplierId}"]`);
  await expect(record).toBeVisible();
  await record.getByRole('button', { name: 'Remove', exact: true }).click();
  const dialog = owner.getByRole('dialog', { name: 'Remove', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="confirmed"]').check();
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/setSupplierStatus'),
  );
  await dialog
    .locator('form[data-supplier-operation="setSupplierStatus"] .form-actions button')
    .last()
    .click();
  expect((await pending).status()).toBeLessThan(400);
  await expect
    .poll(
      () =>
        (db.prepare('SELECT status FROM supplier WHERE id=?').get(supplierId) as { status: string })
          .status,
    )
    .toBe('inactive');
}

async function formState(page: Page, workerId: string, supplierId: string) {
  return page.evaluate(
    ({ workerId, supplierId }) => {
      const card = document.querySelector<HTMLElement>(`[data-worker-id="${workerId}"]`);
      const form = card?.querySelector<HTMLFormElement>('form[action*="/setWorkforceProfile"]');
      const notice =
        card?.querySelector<HTMLElement>(
          '[data-workforce-supplier-problem] [data-ui="problem-notice"]',
        ) ??
        document.querySelector<HTMLElement>('[data-team-directory] > [data-ui="problem-notice"]');
      const bounds = notice?.getBoundingClientRect();
      const toast = document.querySelector<HTMLElement>('[data-ui="toast"]');
      const toastBounds = toast?.getBoundingClientRect();
      const header = document.querySelector<HTMLElement>('.portal-layout > header');
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      const safeTop =
        (header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
          ? header.getBoundingClientRect().bottom
          : 0) + 8;
      const safeBottom =
        nav && getComputedStyle(nav).position === 'fixed'
          ? nav.getBoundingClientRect().top - 16
          : innerHeight - 16;
      const supplier = form?.querySelector<HTMLSelectElement>('[name="supplierId"]');
      const staleOption = supplier?.querySelector<HTMLOptionElement>(
        `option[value="${supplierId}"]`,
      );
      const fieldError = supplier?.id
        ? form?.querySelector<HTMLElement>(`[data-field-error-for="${supplier.id}"]`)
        : null;
      const remedy = [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].find((link) =>
        /supplier|proveedor|fornecedor/i.test(link.textContent ?? ''),
      );
      const selectedTab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const active = document.activeElement;
      return {
        code: notice?.getAttribute('data-problem-code') ?? null,
        noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        fieldError: fieldError?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        focused:
          active === notice ||
          active?.matches('[data-validation-summary], [data-ui="validation-summary"]') === true ||
          active === supplier,
        active: {
          tag: active?.tagName.toLowerCase() ?? null,
          name: active?.getAttribute('name') ?? null,
          dataUi: active?.getAttribute('data-ui') ?? null,
          className: active instanceof HTMLElement ? active.className : null,
        },
        top: bounds ? Math.round(bounds.top) : null,
        bottom: bounds ? Math.round(bounds.bottom) : null,
        noticeRect: bounds
          ? {
              left: Math.round(bounds.left),
              top: Math.round(bounds.top),
              right: Math.round(bounds.right),
              bottom: Math.round(bounds.bottom),
            }
          : null,
        toastRect: toastBounds
          ? {
              left: Math.round(toastBounds.left),
              top: Math.round(toastBounds.top),
              right: Math.round(toastBounds.right),
              bottom: Math.round(toastBounds.bottom),
            }
          : null,
        toastOverlap:
          bounds && toastBounds
            ? {
                width: Math.max(
                  0,
                  Math.round(
                    Math.min(bounds.right, toastBounds.right) -
                      Math.max(bounds.left, toastBounds.left),
                  ),
                ),
                height: Math.max(
                  0,
                  Math.round(
                    Math.min(bounds.bottom, toastBounds.bottom) -
                      Math.max(bounds.top, toastBounds.top),
                  ),
                ),
              }
            : { width: 0, height: 0 },
        safeTop: Math.round(safeTop),
        safeBottom: Math.round(safeBottom),
        scrollY: Math.round(scrollY),
        viewportWidth: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        selectedTab: selectedTab?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        editorOpen: Boolean(card?.querySelector('.team-directory__editor')),
        workerQueryRetained: new URL(location.href).searchParams.get('worker') === workerId,
        profileValue: form?.querySelector<HTMLSelectElement>('[name="profile"]')?.value ?? null,
        supplierValue: supplier?.value ?? null,
        inactiveOption: staleOption
          ? { label: staleOption.textContent?.trim() ?? '', disabled: staleOption.disabled }
          : null,
        remedy: remedy
          ? {
              text: remedy.textContent?.trim() ?? '',
              path: new URL(remedy.href).pathname,
              query: new URL(remedy.href).search,
            }
          : null,
        language: document.documentElement.lang,
      };
    },
    { workerId, supplierId },
  );
}

function save(name: string, data: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      data,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[qa-id]')
          : value,
      2,
    ) + '\n',
  );
}

test('inactive supplier during Owner workforce edit produces typed 409 and safe recovery', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const height = width === 390 ? 844 : width === 430 ? 932 : 900;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const context = await browser.newContext({ viewport: { width, height } });
  const ownerA = await context.newPage();
  const ownerB = await context.newPage();
  const logs = { ownerA: diagnostics(ownerA), ownerB: diagnostics(ownerB) };
  try {
    await signIn(ownerA, 'owner');
    const workerId = (
      db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
        id: string;
      }
    ).id;
    const marker = randomUUID();
    const staleName = `QA workforce stale supplier ${marker}`;
    const activeName = `QA workforce active supplier ${marker}`;
    const staleId = await createSupplier(ownerB, db, staleName);
    const activeId = await createSupplier(ownerB, db, activeName);
    await ownerA.goto(portal(`/projects?view=team&worker=${workerId}&lang=${locale}`));
    const card = ownerA.locator(`[data-worker-id="${workerId}"]`);
    const form = card.locator('form[action*="/setWorkforceProfile"]');
    await expect(form).toBeVisible();
    await form.locator('[name="profile"]').selectOption('external_technician');
    await form.locator('[name="supplierId"]').selectOption(staleId);
    await form.scrollIntoViewIfNeeded();
    const before = {
      profile: profile(db, workerId) ?? null,
      workerAuditCount: workerAuditCount(db, workerId),
      selectedSupplier: await form.locator('[name="supplierId"]').inputValue(),
      scrollY: await ownerA.evaluate(() => Math.round(scrollY)),
    };
    await deactivateSupplier(ownerB, db, staleId, staleName);
    const pending = ownerA.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/setWorkforceProfile'),
    );
    await form.locator('button[type="submit"]').click();
    const response = await pending;
    const body = await response.text();
    const network = {
      status: response.status(),
      codeInResponse: body.includes(problemCode),
      genericInResponse: body.includes('Check the submitted values'),
      valuesInResponse: body.includes(staleId) && body.includes('external_technician'),
    };
    expect(network).toEqual({
      status: 409,
      codeInResponse: true,
      genericInResponse: false,
      valuesInResponse: true,
    });
    await expect.poll(async () => (await formState(ownerA, workerId, staleId)).focused).toBe(true);
    const visible = await formState(ownerA, workerId, staleId);
    expect(visible.code).toBe(problemCode);
    expect(visible.noticeText).toMatch(/supplier|proveedor|fornecedor/i);
    expect(visible.fieldError).toMatch(/supplier|proveedor|fornecedor/i);
    expect(visible).toMatchObject({
      workerQueryRetained: true,
      profileValue: 'external_technician',
      supplierValue: staleId,
      editorOpen: true,
      overflow: false,
    });
    expect(visible.selectedTab).toMatch(/Specialists|Especialistas/i);
    expect(visible.inactiveOption?.disabled).toBe(true);
    expect(visible.inactiveOption?.label).toMatch(/inactive|inactivo|inativo/i);
    expect(visible.remedy?.path).toContain('/supplier');
    expect(visible.remedy?.text).toMatch(/supplier|proveedor|fornecedor/i);
    expect(visible.top).toBeGreaterThanOrEqual((visible.safeTop ?? 0) - 2);
    expect(visible.bottom).toBeLessThanOrEqual((visible.safeBottom ?? height) + 2);
    expect(visible.scrollY).toBeGreaterThan(0);
    expect(visible.toastRect).not.toBeNull();
    expect(visible.toastOverlap.height).toBe(0);
    expect(profile(db, workerId) ?? null).toEqual(before.profile);
    expect(workerAuditCount(db, workerId)).toBe(before.workerAuditCount);
    await card.locator('[data-workforce-supplier-problem]').screenshot({
      path: join(evidenceRoot, `${info.project.name}-${locale}-notice.png`),
    });
    await ownerA.waitForTimeout(2_000);
    const afterTwoSeconds = await formState(ownerA, workerId, staleId);
    expect(afterTwoSeconds.toastRect).not.toBeNull();
    expect(afterTwoSeconds.toastOverlap.height).toBe(0);
    await ownerA.waitForTimeout(7_000);
    const afterNineSeconds = await formState(ownerA, workerId, staleId);
    const review = await context.newPage();
    const reviewLogs = diagnostics(review);
    await review.goto(
      new URL(`${visible.remedy?.path ?? ''}${visible.remedy?.query ?? ''}`, portal('')).toString(),
    );
    await expect(review.locator('#supplier-directory')).toBeVisible();
    await review.locator('.directory-filters input[type="search"]').fill(staleName);
    const inactiveRecord = review.locator(`[data-supplier-id="${staleId}"]`);
    await expect(inactiveRecord).toBeVisible();
    await expect(inactiveRecord).toContainText(/Inactive|Inactivo|Inativo/i);
    expect(await review.locator('html').getAttribute('lang')).toBe(
      locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'pt-BR',
    );
    await review.close();
    expect(reviewLogs).toEqual([]);
    const recoveredForm = ownerA.locator(
      `[data-worker-id="${workerId}"] form[action*="/setWorkforceProfile"]`,
    );
    await recoveredForm.locator('[name="supplierId"]').selectOption(activeId);
    const recovering = ownerA.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/setWorkforceProfile'),
    );
    await recoveredForm.locator('button[type="submit"]').click();
    const recoveryStatus = (await recovering).status();
    expect(recoveryStatus).toBeLessThan(400);
    await expect.poll(() => profile(db, workerId)?.supplier_id).toBe(activeId);
    expect(profile(db, workerId)?.profile).toBe('external_technician');
    expect(workerAuditCount(db, workerId)).toBe(before.workerAuditCount + 1);
    expect(logs).toEqual({ ownerA: [], ownerB: [] });
    save(`${info.project.name}-${locale}-results.json`, {
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
      viewport: { width, height },
      locale,
      role: 'owner in two tabs',
      fixture:
        'Two QA suppliers created through UI; selected supplier deactivated through UI while Worker profile form stayed open',
      before: {
        profile: before.profile,
        workerAuditCount: before.workerAuditCount,
        scrollY: before.scrollY,
      },
      network,
      visible,
      toastTiming: {
        shortlyAfterFailure: visible.toastOverlap,
        afterTwoSeconds: {
          noticeRect: afterTwoSeconds.noticeRect,
          toastRect: afterTwoSeconds.toastRect,
          overlap: afterTwoSeconds.toastOverlap,
        },
        afterNineSeconds: {
          noticeRect: afterNineSeconds.noticeRect,
          toastRect: afterNineSeconds.toastRect,
          overlap: afterNineSeconds.toastOverlap,
        },
      },
      review: { inactiveSupplierVisible: true, localePreserved: true },
      noWriteOnConflict: true,
      recovery: {
        activeSupplierSaveStatus: recoveryStatus,
        profileSaved: true,
        oneAuditWrite: true,
      },
      diagnostics: logs,
    });
  } finally {
    await Promise.all([ownerA.close().catch(() => {}), ownerB.close().catch(() => {})]);
    await context.close().catch(() => {});
    db.close();
  }
});
