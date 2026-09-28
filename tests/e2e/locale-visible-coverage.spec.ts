import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { portalCatalog } from '../../apps/portal/src/lib/i18n/catalog.js';
import { e2eCredentials, portal, signIn } from './auth.js';
import { e2eDatabasePath } from './environment.js';

test('Owner and Worker route text changes to Spanish and Portuguese without known English UI leftovers', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  const { sqlite } = createDatabase(e2eDatabasePath);
  const project = sqlite
    .prepare(
      "SELECT p.id FROM project p JOIN project_member pm ON pm.project_id=p.id JOIN user u ON u.id=pm.user_id WHERE u.email=? AND pm.status='active' AND p.status='active' ORDER BY p.id LIMIT 1",
    )
    .get(e2eCredentials.worker.email) as { id: string };
  const period = sqlite
    .prepare(
      "SELECT id FROM period_report WHERE audience='customer' AND length(snapshot_sha256)=64 ORDER BY created_at,id LIMIT 1",
    )
    .get() as { id: string };
  const invoice = sqlite.prepare('SELECT id FROM invoice ORDER BY id LIMIT 1').get() as {
    id: string;
  };
  sqlite.close();
  const common = [
    '/projects',
    '/time',
    '/reports',
    '/expenses',
    '/documents',
    '/profile',
    '/help',
    '/notifications',
    `/projects/${project.id}`,
  ];
  const routes = {
    owner: [
      '',
      ...common,
      '/projects?view=clients',
      '/projects?view=team',
      '/planning',
      '/approvals',
      '/billing',
      '/finance',
      '/finance?view=economic',
      '/finance?view=commercial',
      '/ledger',
      '/accounting',
      '/audit',
      '/finance/preview',
      '/finance/cash',
      '/reports/review',
      `/reports/period/${period.id}`,
      `/billing/invoices/${invoice.id}`,
      `/projects/${project.id}/closeout`,
      '/supplier',
    ],
    worker: ['', ...common, '/pay'],
  };
  const findings: Array<{ role: string; locale: string; route: string; text: string[] }> = [];
  let visited = 0;
  for (const role of ['owner', 'worker'] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await signIn(page, role);
      for (const locale of ['es', 'pt'] as const) {
        const untranslated = [
          ...new Set(
            Object.entries(portalCatalog.en)
              .filter(
                ([key, value]) =>
                  value.length > 1 &&
                  portalCatalog[locale][key as keyof typeof portalCatalog.en] !== value,
              )
              .map(([, value]) => value.replace(/\s+/g, ' ').trim()),
          ),
        ];
        for (const route of routes[role]) {
          const url = new URL(portal(route));
          url.searchParams.set('lang', locale);
          const response = await page.goto(url.href, { waitUntil: 'networkidle' });
          expect(response?.status(), `${role} ${locale} ${route}`).toBe(200);
          await expect(page.locator('html')).toHaveAttribute(
            'lang',
            locale === 'es' ? 'es-ES' : 'pt-BR',
          );
          const remaining = await page.evaluate((english) => {
            const known = new Set(english);
            const found = new Set<string>();
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const parent = node.parentElement;
              if (!parent || parent.closest('script,style,noscript,code,pre,textarea,option'))
                continue;
              if (!parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
                continue;
              const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
              if (known.has(text)) found.add(text);
            }
            return [...found].sort();
          }, untranslated);
          if (remaining.length) findings.push({ role, locale, route, text: remaining });
          visited++;
        }
      }
    } finally {
      await context.close();
    }
  }
  await info.attach('locale-visible-coverage.json', {
    body: JSON.stringify({ visited, findings }, null, 2),
    contentType: 'application/json',
  });
  console.log(
    JSON.stringify({ event: 'locale.visible.coverage', visited, untranslated: findings.length }),
  );
  expect(findings).toEqual([]);
});
