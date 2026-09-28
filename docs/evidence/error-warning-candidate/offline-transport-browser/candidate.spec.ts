import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eCredentials } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const candidateCommit = process.env.JA_CANDIDATE_COMMIT ?? 'unconfirmed';
const evidenceRoot = import.meta.dirname;
const app = (path: string) => `http://127.0.0.1:4177/j-aautomation/app${path}`;
const transportUrl = /\/j-aautomation\/app\/api\/sync$/;
const messages = {
  service: {
    en: 'The sync service is unavailable. Offline drafts remain on this device. Check saved records, then try again later.',
    es: 'El servicio de sincronización no está disponible. Los borradores sin conexión siguen en este dispositivo. Comprueba los registros guardados e inténtalo más tarde.',
    pt: 'O serviço de sincronização está indisponível. Os rascunhos sem ligação continuam neste dispositivo. Verifique os registos guardados e tente novamente mais tarde.',
  },
  session: {
    en: 'Your session ended. Offline drafts remain on this device. Sign in again and review saved records before retrying.',
    es: 'Tu sesión terminó. Los borradores sin conexión siguen en este dispositivo. Vuelve a iniciar sesión y revisa los registros guardados antes de volver a intentarlo.',
    pt: 'A sua sessão terminou. Os rascunhos sem ligação continuam neste dispositivo. Inicie sessão novamente e reveja os registos guardados antes de tentar novamente.',
  },
};

async function signIn(page: Page, role: 'owner' | 'worker') {
  const credentials = e2eCredentials[role];
  await page.goto(app('/login'));
  await expect(page.getByLabel('Work email')).toBeVisible();
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (target) =>
      (target.pathname === '/j-aautomation/app' ||
        target.pathname.startsWith('/j-aautomation/app/')) &&
      !target.pathname.endsWith('/login'),
  );
}

async function createAssignedProject(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(app('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  const worker = db
    .prepare('SELECT id FROM user WHERE email=?')
    .get(e2eCredentials.worker.email) as { id: string };
  expect(clientId).toBeTruthy();
  const name = `Offline transport QA ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId!);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-OFFLINE-${Date.now() % 100000000}`);
  await form.locator('input[name="startDate"]').fill('2026-09-01');
  await form.locator('input[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${worker.id}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  return (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string }).id;
}

async function localDrafts(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const storeName = databases
      .map((item) => item.name)
      .find((name) => name?.startsWith('ja-portal-') && !name.startsWith('ja-portal-private-'));
    if (!storeName) throw new Error('No partitioned offline draft database exists');
    const request = indexedDB.open(storeName);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('mutations', 'readonly');
    const read = transaction.objectStore('mutations').getAll();
    const records = await new Promise<
      Array<{
        mutationId: string;
        entityType: string;
        state?: string;
        reviewReason?: string;
        payload: { summary?: string };
      }>
    >((resolve, reject) => {
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    database.close();
    return records.map((record) => ({
      mutationId: record.mutationId,
      entityType: record.entityType,
      state: record.state ?? 'queued',
      reviewReason: record.reviewReason ?? null,
      summary: record.payload.summary ?? null,
    }));
  });
}

async function hitTest(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    const x = rectangle.left + rectangle.width / 2;
    const y = rectangle.top + rectangle.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      hit: Boolean(top && (top === element || element.contains(top))),
      center: { x: Math.round(x), y: Math.round(y) },
      topTag: top?.tagName.toLowerCase() ?? null,
    };
  });
}

async function prepareWorker(page: Page) {
  await signIn(page, 'worker');
  for (const route of ['/time?lang=en', '/reports?lang=en', '/expenses?lang=en', '/time?lang=en'])
    await page.goto(app(route));
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
}

async function queueTimeThroughUI(page: Page, projectId: string, summary: string) {
  await page.goto(app('/time?lang=en'));
  await page.locator('[data-time-primary-cta]').first().click();
  const form = page.locator('form[data-time-entry-surface]');
  await expect(form).toBeVisible();
  await page.context().setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="workDate"]').fill('2026-09-25');
  await form.getByRole('textbox', { name: 'Actual hours' }).fill('1.25');
  await form.locator('textarea[name="summary"]').fill(summary);
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('.sync-message')).toContainText('Offline — saved on this device');
  await expect
    .poll(async () => (await localDrafts(page)).filter((item) => item.summary === summary).length)
    .toBe(1);
}

test('offline transport failure preserves a UI-created draft and offers a reviewed manual retry', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerContext.newPage();
  const output: Record<string, unknown> = {
    candidateCommit,
    checks: [],
    network: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    actionPostRequests: [],
    limitations: [],
    defects: [],
  };
  let phase = 'fixture setup';
  const requests: Array<{ status: number; url: string; mutationId: string | null }> = [];
  page.on('response', (response) => {
    if (transportUrl.test(response.url())) {
      let mutationId: string | null = null;
      try {
        const body = response.request().postDataJSON() as { mutationId?: unknown };
        if (typeof body?.mutationId === 'string') mutationId = body.mutationId;
      } catch {
        // A malformed request will be reported by its response and status.
      }
      requests.push({ status: response.status(), url: '/app/api/sync', mutationId });
    }
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('createTime'))
      (output.actionPostRequests as unknown[]).push({
        phase,
        method: request.method(),
        path: `${new URL(request.url()).pathname}${new URL(request.url()).search}`,
      });
  });
  page.on('requestfailed', (request) =>
    (output.failedRequests as unknown[]).push({
      phase,
      method: request.method(),
      path: new URL(request.url()).pathname,
      failure: request.failure(),
    }),
  );
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:'))
      (output.consoleErrors as string[]).push(entry.text().slice(0, 160));
  });
  page.on('pageerror', (error) =>
    (output.pageErrors as unknown[]).push({
      phase,
      message: error.message.slice(0, 160),
      stack: error.stack?.slice(0, 600) ?? null,
      at: new Date().toISOString(),
    }),
  );
  const persist = () =>
    writeFileSync(
      join(evidenceRoot, 'results.json'),
      `${JSON.stringify(output, (_key, value) => (typeof value === 'string' ? value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]').replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[record]') : value), 2)}\n`,
    );
  try {
    const projectId = await createAssignedProject(owner, db);
    await prepareWorker(page);
    const summary = `Offline transport 503 ${randomUUID()}`;
    phase = 'offline save for 503';
    await queueTimeThroughUI(page, projectId, summary);
    const preReconnect = await page.evaluate(() => ({
      scrollY: Math.round(scrollY),
      path: location.pathname,
      focus: document.activeElement?.tagName.toLowerCase() ?? null,
    }));
    const before = await localDrafts(page);
    expect(before).toContainEqual(
      expect.objectContaining({ entityType: 'time', state: 'queued', summary }),
    );
    const mutationId = before.find((item) => item.summary === summary)?.mutationId;
    expect(mutationId).toBeTruthy();
    await page.route(transportUrl, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'temporary test outage' }),
      }),
    );
    phase = 'reconnect with 503 interception';
    await page.context().setOffline(false);
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await expect
      .poll(() => requests.filter((request) => request.status === 503).length)
      .toBeGreaterThan(0);
    await expect(page.locator('.sync-message')).toContainText(messages.service.en);
    const serviceToast = page.locator('[data-ui="toast"]').filter({ hasText: messages.service.en });
    await expect(serviceToast).toHaveAttribute('data-variant', 'danger');
    await expect(serviceToast).toHaveAttribute('role', 'alert');
    await expect(serviceToast).toContainText('Error');
    (output.checks as unknown[]).push({
      role: 'worker',
      locale: 'en',
      failure: 503,
      toast: { variant: 'danger', role: 'alert', title: 'Error' },
    });
    await expect(
      page.getByRole('heading', { name: 'Offline drafts need your review' }),
    ).toBeVisible();
    const review = page.getByRole('link', { name: 'Check saved records' });
    const retry = page.getByRole('button', { name: 'Retry this draft after review' });
    await expect(review).toBeVisible();
    await expect(retry).toBeVisible();
    await expect(page.locator('form[data-time-entry-surface]')).toHaveCount(0);
    const after503 = await localDrafts(page);
    expect(after503).toContainEqual(
      expect.objectContaining({
        mutationId,
        entityType: 'time',
        state: 'needs_review',
        reviewReason: 'service',
        summary,
      }),
    );
    const firstCount = requests.length;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await page.waitForTimeout(750); // Explicit absence window: no unattended second request.
    expect(requests.length).toBe(firstCount);
    const ui503 = await page.evaluate(() => ({
      language: document.documentElement.lang,
      width: innerWidth,
      focus: document.activeElement?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
      panel: Boolean(document.querySelector('.conflict-panel')),
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      overflowElements: Array.from(document.querySelectorAll<HTMLElement>('main *'))
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 2)
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className).slice(0, 60),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    }));
    (output.checks as unknown[]).push({
      role: 'worker',
      locale: 'en',
      width: 390,
      failure: 503,
      ui: ui503,
      preReconnect,
      local: after503,
      requestCount: firstCount,
    });
    if (ui503.horizontalOverflow)
      (output.defects as unknown[]).push({
        path: '390 px offline review',
        kind: 'horizontal overflow',
        scrollWidth: ui503.scrollWidth,
        offenders: ui503.overflowElements,
      });
    expect(ui503.horizontalOverflow).toBe(false);
    expect(ui503.scrollY).toBe(preReconnect.scrollY);
    expect(preReconnect.path).toBe('/j-aautomation/app/time');
    const mobileReviewHit = await hitTest(review);
    const mobileRetryHit = await hitTest(retry);
    expect(mobileReviewHit.hit).toBe(true);
    expect(mobileRetryHit.hit).toBe(true);
    await review.click({ trial: true });
    await retry.click({ trial: true });
    (output.checks as unknown[]).push({
      role: 'worker',
      locale: 'en',
      width: 390,
      action: 'review controls hit test',
      review: mobileReviewHit,
      retry: mobileRetryHit,
    });
    await page
      .locator('.conflict-panel')
      .screenshot({ path: join(evidenceRoot, 'worker-390-en-503-review.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    phase = 'locale changes and review of 503';
    await page.locator('select:has(option[value="pt"])').first().selectOption('es');
    await expect(page.locator('.sync-message')).toContainText(messages.service.es);
    await expect(page.getByRole('link', { name: 'Comprobar registros guardados' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reintentar este borrador después de revisarlo' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Comprobar registros guardados' }).click({ trial: true });
    await page
      .getByRole('button', { name: 'Reintentar este borrador después de revisarlo' })
      .click({ trial: true });
    const esRequests = requests.length;
    expect(esRequests).toBe(firstCount);
    (output.checks as unknown[]).push({
      role: 'worker',
      locale: 'es',
      width: 1440,
      failure: 503,
      ui: await page.evaluate(() => ({
        language: document.documentElement.lang,
        width: innerWidth,
        focus: document.activeElement?.tagName.toLowerCase() ?? null,
        scrollY: Math.round(scrollY),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      })),
      local: await localDrafts(page),
      requestCount: esRequests,
    });
    await page
      .locator('.conflict-panel')
      .screenshot({ path: join(evidenceRoot, 'worker-1440-es-503-review.png') });

    await page.locator('select:has(option[value="pt"])').first().selectOption('pt');
    await expect(page.locator('.sync-message')).toContainText(messages.service.pt);
    await expect(page.getByRole('link', { name: 'Verificar registos guardados' })).toBeVisible();
    await page.getByRole('link', { name: 'Verificar registos guardados' }).click({ trial: true });
    await page
      .getByRole('button', { name: 'Tentar novamente este rascunho após a revisão' })
      .click({ trial: true });
    (output.checks as unknown[]).push({
      role: 'worker',
      locale: 'pt',
      width: 1440,
      failure: 503,
      local: await localDrafts(page),
      requestCount: requests.length,
    });
    await page
      .locator('.conflict-panel')
      .screenshot({ path: join(evidenceRoot, 'worker-1440-pt-503-review.png') });

    const beforeReloadCount = requests.length;
    await page.reload({ waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', {
        name: 'Os rascunhos sem ligação precisam da sua revisão',
      }),
    ).toBeVisible();
    const reloadCheck = {
      role: 'worker',
      locale: 'pt',
      width: 1440,
      action: 'reload unresolved 503 review',
      local: await localDrafts(page),
      causeMessageVisible:
        (await page
          .locator('.conflict-panel')
          .getByText(messages.service.pt, { exact: true })
          .count()) > 0,
      reviewLinkVisible: await page
        .getByRole('link', { name: 'Verificar registos guardados' })
        .isVisible(),
      requestCount: requests.length,
    };
    (output.checks as unknown[]).push(reloadCheck);
    expect(reloadCheck.reviewLinkVisible).toBe(true);
    expect(reloadCheck.causeMessageVisible).toBe(true);
    expect(reloadCheck.requestCount).toBe(beforeReloadCount);

    await page.getByRole('link', { name: 'Verificar registos guardados' }).click();
    await expect(page).toHaveURL(/\/time\?lang=pt/);
    expect(
      db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary),
    ).toBeUndefined();
    await page.unroute(transportUrl);
    phase = 'manual retry to real sync endpoint';
    const retryResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST' && transportUrl.test(response.url()),
    );
    await page
      .getByRole('button', { name: 'Tentar novamente este rascunho após a revisão' })
      .click();
    const retryStatus = (await retryResponse).status();
    expect(requests.find((request) => request.status === 503)?.mutationId).toBe(mutationId);
    expect(
      requests.find((request) => request.status === retryStatus && request.status !== 503)
        ?.mutationId,
    ).toBe(mutationId);
    if (retryStatus === 200) {
      await expect
        .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary))
        .toBeTruthy();
      await expect
        .poll(
          async () => (await localDrafts(page)).filter((item) => item.summary === summary).length,
        )
        .toBe(0);
      expect(
        (
          db
            .prepare('SELECT count(*) AS count FROM time_entry WHERE activity_summary=?')
            .get(summary) as { count: number }
        ).count,
      ).toBe(1);
    } else {
      expect(
        db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary),
      ).toBeUndefined();
      expect((await localDrafts(page)).some((item) => item.summary === summary)).toBe(true);
      (output.defects as unknown[]).push({
        path: 'manual retry after 503 review',
        status: retryStatus,
        serverCause: 'legacy offline read only',
        draftRetained: true,
      });
    }
    (output.checks as unknown[]).push({
      role: 'worker',
      locale: 'pt',
      width: 1440,
      action: 'manual retry after record review',
      outcome: retryStatus === 200 ? 'saved exactly once' : 'server error; draft retained',
      retryStatus,
      requestStatuses: requests.map((request) => request.status),
      sameMutationId:
        requests.find((request) => request.status === retryStatus && request.status !== 503)
          ?.mutationId === mutationId,
    });
    expect(retryStatus).toBe(200);

    // A second UI-created draft isolates the 401 session path from the 503
    // recovery above. Record a clear diagnostic even if this optional path
    // still lacks a manual review control in the candidate.
    try {
      const sessionSummary = `Offline transport 401 ${randomUUID()}`;
      phase = 'offline save for 401';
      await queueTimeThroughUI(page, projectId, sessionSummary);
      await page.route(transportUrl, (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'test session expired' }),
        }),
      );
      phase = 'reconnect with 401 interception';
      await page.context().setOffline(false);
      await page.evaluate(() => dispatchEvent(new Event('online')));
      await expect
        .poll(() => requests.filter((request) => request.status === 401).length)
        .toBeGreaterThan(0);
      await expect(page.locator('.sync-message')).toContainText(messages.session.en);
      const sessionToast = page
        .locator('[data-ui="toast"]')
        .filter({ hasText: messages.session.en });
      await expect(sessionToast).toHaveAttribute('data-variant', 'danger');
      await expect(sessionToast).toHaveAttribute('role', 'alert');
      await expect(sessionToast).toContainText('Error');
      const firstSessionCount = requests.filter((request) => request.status === 401).length;
      const sessionDrafts = await localDrafts(page);
      const sessionReview = await page.getByRole('link', { name: 'Check saved records' }).count();
      await expect(page.locator('form[data-time-entry-surface]')).toHaveCount(0);
      await expect(page.locator('.conflict-panel')).toContainText(messages.session.en);
      await page.getByRole('link', { name: 'Check saved records' }).click({ trial: true });
      await page
        .getByRole('button', { name: 'Retry this draft after review' })
        .click({ trial: true });
      await page.evaluate(() => dispatchEvent(new Event('online')));
      await page.waitForTimeout(750); // Observe absence or presence of unattended resubmission.
      const nextSessionCount = requests.filter((request) => request.status === 401).length;
      const check = {
        role: 'worker',
        locale: 'en',
        width: 1440,
        failure: 401,
        local: sessionDrafts,
        reviewLinkCount: sessionReview,
        firstSessionCount,
        nextSessionCount,
        noUnattendedResubmit: nextSessionCount === firstSessionCount,
      };
      (output.checks as unknown[]).push(check);
      if (sessionReview === 0 || nextSessionCount > firstSessionCount)
        (output.defects as unknown[]).push({
          path: '401 session',
          missingReviewLink: sessionReview === 0,
          unattendedResubmit: nextSessionCount > firstSessionCount,
        });
      expect(sessionDrafts.some((item) => item.summary === sessionSummary)).toBe(true);
      expect(sessionDrafts).toContainEqual(
        expect.objectContaining({
          entityType: 'time',
          state: 'needs_review',
          reviewReason: 'session',
          summary: sessionSummary,
        }),
      );
      expect(sessionReview).toBe(1);
      expect(nextSessionCount).toBe(firstSessionCount);
      await page.locator('.conflict-panel').screenshot({
        path: join(evidenceRoot, 'worker-1440-en-401-review.png'),
      });
      await page.unroute(transportUrl);
    } catch (sessionError) {
      (output.limitations as string[]).push(
        `Optional 401 browser path: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`,
      );
      throw sessionError;
    }
    output.network = requests;
    expect(requests.map((request) => request.status)).toEqual([503, 200, 401]);
    expect(output.pageErrors).toEqual([]);
    expect(output.consoleErrors).toEqual([]);
    expect(output.defects).toEqual([]);
  } catch (error) {
    (output.limitations as string[]).push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    output.network = requests;
    persist();
    db.close();
    await ownerContext.close();
  }
});
