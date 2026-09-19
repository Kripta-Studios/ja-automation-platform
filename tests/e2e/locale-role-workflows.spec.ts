import { expect, test } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import {
  seedSupplierPersonas,
  signInManualPersona,
  type ManualPersonaAccount,
} from './manual-persona-fixture.js';

type Locale = 'en' | 'es' | 'pt';
const documentLanguages: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
};
const helpHeadings: Record<Locale, string> = {
  en: 'Help and field guides',
  es: 'Ayuda y guías de campo',
  pt: 'Ajuda e guias de campo',
};
const availabilityCopy: Record<Locale, { unavailable: string; save: string }> = {
  en: { unavailable: 'Unavailable', save: 'Save availability' },
  es: { unavailable: 'No disponible', save: 'Guardar disponibilidad' },
  pt: { unavailable: 'Indisponível', save: 'Salvar disponibilidade' },
};

function localizedUrl(route: string, locale: Locale) {
  const url = new URL(portal(route));
  url.searchParams.set('lang', locale);
  return url.toString();
}

test('seven personas see real accessible routes in EN, ES, and PT-BR', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(360_000);
  const pointer = readE2EFixturePointer();
  const matrix: Array<{
    persona: string;
    account: ManualPersonaAccount;
    routes: string[];
    availability?: boolean;
  }> = [
    {
      persona: 'owner',
      account: 'owner',
      routes: ['', '/help', '/profile', '/planning', '/projects', '/finance', '/manage'],
      availability: true,
    },
    {
      persona: 'finance',
      account: 'finance',
      routes: ['', '/help', '/profile', '/planning', '/finance'],
      availability: true,
    },
    {
      persona: 'manager',
      account: 'manager',
      routes: ['', '/help', '/profile', '/planning', '/projects'],
      availability: true,
    },
    {
      persona: 'auditor',
      account: 'auditor',
      routes: ['', '/help', '/profile', '/planning', '/audit'],
    },
    {
      persona: 'worker',
      account: 'worker',
      routes: ['', '/help', '/profile', '/projects', '/time'],
      availability: true,
    },
  ];
  const checks: Array<{ persona: string; locale: Locale; route: string; status: number }> = [];
  for (const entry of matrix) {
    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      await signInManualPersona(page, entry.account);
      for (const locale of ['en', 'es', 'pt'] as const) {
        for (const route of entry.routes) {
          const response = await page.goto(localizedUrl(route, locale), {
            waitUntil: 'networkidle',
          });
          expect(response?.status(), `${entry.persona} ${locale} ${route}`).toBe(200);
          await expect(page.locator('html')).toHaveAttribute('lang', documentLanguages[locale]);
          await expect(page.locator('main').first()).toBeVisible();
          if (route === '/help')
            await expect(page.getByRole('heading', { name: helpHeadings[locale] })).toBeVisible();
          if (route === '/finance' && locale === 'pt' && entry.persona === 'finance') {
            const invoiced = page.locator('[data-finance-actual] [data-metric=invoiced] strong');
            await expect(invoiced).toBeVisible();
            expect((await invoiced.innerText()).trim()).toMatch(/,\d{2}\b/);
          }
          checks.push({ persona: entry.persona, locale, route, status: 200 });
        }
        if (entry.availability) {
          await page.goto(localizedUrl('/profile', locale));
          const calendar = page.locator('[data-availability-calendar]');
          await expect(calendar).toBeVisible();
          await calendar.locator('[aria-current=date]').click();
          const dialog = page.getByRole('dialog');
          await expect(
            dialog.locator('select[name=availability] option[value=unavailable]'),
          ).toHaveText(availabilityCopy[locale].unavailable);
          await expect(
            dialog.getByRole('button', { name: availabilityCopy[locale].save }),
          ).toBeVisible();
        }
      }
    } finally {
      await context.close();
    }
  }

  const supplierProjectId = seedSupplierPersonas(pointer.databasePath);
  for (const entry of [
    {
      persona: 'supplier-coordinator',
      account: 'supplierCoordinator',
      routes: ['', '/help', '/profile', `/supplier?projectId=${supplierProjectId}`],
    },
    {
      persona: 'external-technician',
      account: 'worker2',
      routes: ['', '/help', '/profile', '/time'],
    },
  ] as const) {
    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      await signInManualPersona(page, entry.account);
      for (const locale of ['en', 'es', 'pt'] as const) {
        for (const route of entry.routes) {
          const response = await page.goto(localizedUrl(route, locale), {
            waitUntil: 'networkidle',
          });
          expect(response?.status(), `${entry.persona} ${locale} ${route}`).toBe(200);
          await expect(page.locator('html')).toHaveAttribute('lang', documentLanguages[locale]);
          await expect(page.locator('main').first()).toBeVisible();
          if (route === '/help')
            await expect(page.getByRole('heading', { name: helpHeadings[locale] })).toBeVisible();
          checks.push({ persona: entry.persona, locale, route, status: 200 });
        }
      }
    } finally {
      await context.close();
    }
  }
  await info.attach('locale-persona-routes.json', {
    body: JSON.stringify({ checks }, null, 2),
    contentType: 'application/json',
  });
  expect(checks).toHaveLength(105);
});

test('the portal locale controls accessible browser validation, not the browser language', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const invitationPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/createInvitation'))
      invitationPosts.push(request.url());
  });
  try {
    await signIn(page, 'owner');
    for (const locale of ['es', 'pt'] as const) {
      await page.goto(localizedUrl('/projects?view=team', locale));
      await page.locator('button[aria-controls="team-create-user-form"]').click();
      await page.locator('select:has(option[value="false"])').selectOption('false');
      const form = page.locator('form#team-create-user-form');
      await expect(form).toBeVisible();
      await form.locator('select[name="emailChoice"]').selectOption('no');
      await expect(form.locator('option[value="no"]')).toContainText(
        locale === 'pt' ? 'Não' : 'No',
      );
      await form.locator('button[type="submit"]').click();
      const summary = form.locator('[data-validation-summary]');
      await expect(summary).toContainText(
        locale === 'pt' ? 'Corrija os seguintes campos:' : 'Corrige los siguientes campos:',
      );
      await expect(summary).toContainText(
        locale === 'pt' ? 'Preencha este campo.' : 'Completa este campo.',
      );
      const email = form.locator('input[name="email"]');
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await email.fill('bad-email');
      await form.locator('button[type="submit"]').click();
      await expect(summary).toContainText(
        locale === 'pt'
          ? 'Informe um endereço de e-mail válido.'
          : 'Introduce una dirección de correo válida.',
      );
      await expect(email).toHaveAttribute('aria-invalid', 'true');
    }
    expect(invitationPosts, 'invalid forms never submit a business mutation').toHaveLength(0);
  } finally {
    await context.close();
  }
});

test('seven personas keep Help navigation and profile breadcrumb localized in PT-BR', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(150_000);
  const pointer = readE2EFixturePointer();
  const personas: Array<{ persona: string; account: ManualPersonaAccount; standalone?: boolean }> =
    [
      { persona: 'owner', account: 'owner' },
      { persona: 'finance', account: 'finance' },
      { persona: 'manager', account: 'manager' },
      { persona: 'auditor', account: 'auditor' },
      { persona: 'worker', account: 'worker' },
      { persona: 'supplier-coordinator', account: 'supplierCoordinator', standalone: true },
      { persona: 'external-technician', account: 'worker2', standalone: true },
    ];
  for (const { persona, account, standalone } of personas) {
    if (persona === 'supplier-coordinator') seedSupplierPersonas(pointer.databasePath);
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    try {
      await signInManualPersona(page, account);
      const response = await page.goto(localizedUrl('/profile', 'pt'));
      expect(response?.status(), persona).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
      await page.locator('button[aria-controls="account-menu"]').click();
      await expect(page.locator('#account-menu a[href$="/app/help"]')).toContainText('Ajuda');
      await expect(page.locator('.portal-title .portal-kicker')).toContainText(/perfil/i);
      if (standalone)
        await expect(page.locator('#portal-navigation a[href$="/app/help"]')).toContainText(
          'Ajuda',
        );
    } finally {
      await context.close();
    }
  }
});

test('a stale Owner edit shows a localized conflict and preserves the correction without replaying it', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const pointer = readE2EFixturePointer();
  const id = randomUUID();
  const database = createDatabase(pointer.databasePath);
  const now = new Date().toISOString();
  try {
    const worker = database.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.worker.email) as { id: string };
    database.sqlite
      .prepare(
        `INSERT INTO worker_availability
          (id,worker_id,starts_at,ends_at,availability,note,version,created_at,updated_at)
         VALUES(?,?,?,?,?,?,1,?,?)`,
      )
      .run(
        id,
        worker.id,
        '2030-09-23T08:00:00.000Z',
        '2030-09-23T16:00:00.000Z',
        'available',
        'Initial availability',
        now,
        now,
      );
  } finally {
    database.sqlite.close();
  }
  const context = await browser.newContext({ locale: 'en-US' });
  const first = await context.newPage();
  const stale = await context.newPage();
  try {
    await signIn(first, 'owner');
    const route = `/manage?area=worker_availability&focus=${id}&lang=pt`;
    await first.goto(portal(route));
    await stale.goto(portal(route));
    const formSelector = `article:has(input[name="id"][value="${id}"]) form[action^="?/manageCatalog"]`;
    const firstForm = first.locator(formSelector);
    const staleForm = stale.locator(formSelector);
    await expect(firstForm).toBeVisible();
    await expect(staleForm).toBeVisible();
    await expect(firstForm.locator('option[value="available"]')).toHaveText('Disponível');
    await expect(firstForm.locator('option[value="unavailable"]')).toHaveText('Indisponível');

    await firstForm.locator('input[name="note"]').fill('Updated in first tab');
    await firstForm.locator('textarea[name="reason"]').fill('Correct first tab note');
    await firstForm.locator('input[name="confirmed"]').check();
    await firstForm.locator('button[value="update"]').click();
    await expect(first.locator('.management-feedback[role="status"]')).toBeVisible();

    const requestPosts: string[] = [];
    stale.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/manageCatalog'))
        requestPosts.push(request.url());
    });
    await staleForm.locator('input[name="note"]').fill('Stale note kept for correction');
    await staleForm.locator('textarea[name="reason"]').fill('Correct stale tab note');
    await staleForm.locator('input[name="confirmed"]').check();
    await staleForm.locator('button[value="update"]').click();
    await expect(stale.locator('.management-feedback[role="alert"]')).toHaveText(
      'Este registro mudou. Seus dados continuam neste formulário. Compare-os com o registro atual antes de aplicar suas alterações novamente.',
    );
    const retained = stale.locator(formSelector);
    await expect(retained.locator('input[name="note"]')).toHaveValue(
      'Stale note kept for correction',
    );
    await expect(retained.locator('textarea[name="reason"]')).toHaveValue('Correct stale tab note');
    expect(requestPosts, 'a conflicting mutation is never retried automatically').toHaveLength(1);
  } finally {
    await context.close();
    const cleanup = createDatabase(pointer.databasePath);
    try {
      cleanup.sqlite.prepare('DELETE FROM worker_availability WHERE id=?').run(id);
    } finally {
      cleanup.sqlite.close();
    }
  }
});
