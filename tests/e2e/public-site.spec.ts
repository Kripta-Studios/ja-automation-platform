import { expect, test } from '@playwright/test';
test('localized public homepage has no horizontal overflow', async ({ page }) => {
  await page.goto('/j-aautomation/en/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Engineering');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const portalLogin = page.getByRole('link', { name: /Portal login/i }).first();
  await expect(portalLogin).toBeVisible();
  await expect(portalLogin).toHaveAttribute('href', '/j-aautomation/app/login');
});

test('desktop portal login CTA keeps a white surface and hover motion', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/j-aautomation/en/');

  const portalLogin = page.locator(
    'nav[aria-label="Main navigation"] a[aria-label="Employee Portal login"]',
  );
  await expect(portalLogin).toBeVisible();
  await expect(portalLogin).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(portalLogin).toHaveCSS('color', 'rgb(10, 12, 15)');

  await portalLogin.hover();
  await expect(portalLogin).toHaveCSS('background-color', 'rgb(245, 247, 248)');
  await expect
    .poll(() => portalLogin.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe('none');
});

test('locale switcher preserves route query and hash', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/j-aautomation/en/contact?intent=support&service=robotics#datasheet');

  const portuguese = page.locator(
    'nav[aria-label="Language selector"]:visible button[aria-label="Switch to Português"]',
  );
  await expect(portuguese).toBeVisible();
  await portuguese.click();

  await expect(page).toHaveURL(
    'http://127.0.0.1:4173/j-aautomation/pt/contact?intent=support&service=robotics#datasheet',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre em contato');
  await expect(
    page.locator('nav[aria-label="Seletor de idioma"]:visible button[aria-current="true"]'),
  ).toHaveText('PT-BR');
});

test('all public locales render translated route landmarks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');

  const routes = [
    {
      path: '',
      headings: {
        en: 'Engineering that keeps production moving.',
        es: 'Ingeniería que mantiene la producción en movimiento.',
        pt: 'Engenharia que mantém a produção em movimento.',
      },
    },
    {
      path: 'about',
      headings: {
        en: 'Automation engineers with field experience behind the code.',
        es: 'Ingenieros de automatización con experiencia de campo detrás del código.',
        pt: 'Engenheiros de automação com experiência de campo por trás do código.',
      },
    },
    {
      path: 'capabilities',
      headings: {
        en: 'Controls, robotics and engineering across the automation lifecycle.',
        es: 'Controles, robótica e ingeniería en todo el ciclo de vida de la automatización.',
        pt: 'Controles, robótica e engenharia em todo o ciclo de vida da automação.',
      },
    },
    {
      path: 'industries',
      headings: {
        en: 'Built for demanding industrial environments.',
        es: 'Diseñado para ambientes de producción donde el tiempo muerto es costoso.',
        pt: 'Projetado para ambientes de produção onde parada custa caro.',
      },
    },
    {
      path: 'projects',
      headings: {
        en: 'Engineering proven across machines, lines and plants.',
        es: 'Ingeniería comprobada en máquinas, líneas y plantas.',
        pt: 'Engenharia comprovada em máquinas, linhas e plantas.',
      },
    },
    {
      path: 'contact',
      headings: {
        en: 'Get in touch',
        es: 'Contáctenos',
        pt: 'Entre em contato',
      },
    },
    {
      path: 'careers',
      headings: {
        en: 'Build automation where it matters: on the factory floor.',
        es: 'Construya automatización donde importa: en el piso de producción.',
        pt: 'Construa automação onde importa: no chão de fábrica.',
      },
    },
    {
      path: 'privacy',
      headings: {
        en: 'Privacy policy',
        es: 'Política de privacidad',
        pt: 'Política de privacidade',
      },
    },
    {
      path: 'terms',
      headings: {
        en: 'Terms of service',
        es: 'Términos de servicio',
        pt: 'Termos de serviço',
      },
    },
    {
      path: 'solutions/aquarex',
      headings: {
        en: 'Aquarex',
        es: 'Aquarex',
        pt: 'Aquarex',
      },
    },
  ] as const;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const locale of ['en', 'es', 'pt'] as const) {
    for (const route of routes) {
      const response = await page.goto(
        `/j-aautomation/${locale}${route.path ? `/${route.path}` : '/'}`,
        { waitUntil: 'domcontentloaded' },
      );
      expect(response?.ok(), `${locale}/${route.path}`).toBe(true);
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        locale === 'pt' ? 'pt-BR' : locale,
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.headings[locale]);
      const metadata = await page.evaluate(() => {
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        const alternatePaths = Object.fromEntries(
          Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]'))
            .map((link) => {
              const language = link.getAttribute('hreflang');
              const href = link.getAttribute('href');
              return language && href
                ? [language, new URL(href, window.location.href).pathname]
                : null;
            })
            .filter((entry): entry is [string, string] => entry !== null),
        );
        return {
          canonicalPath: canonical ? new URL(canonical.href, window.location.href).pathname : null,
          alternatePaths,
        };
      });
      const routePath = route.path ? `/${route.path}` : '';
      expect(metadata.canonicalPath).toBe(`/j-aautomation/${locale}${routePath}`);
      expect(metadata.alternatePaths).toMatchObject({
        en: `/j-aautomation/en${routePath}`,
        'pt-BR': `/j-aautomation/pt${routePath}`,
        es: `/j-aautomation/es${routePath}`,
        'x-default': `/j-aautomation/en${routePath}`,
      });
      await expect(page.locator('nav[aria-label]:visible button[aria-current="true"]')).toHaveText(
        locale === 'pt' ? 'PT-BR' : locale.toUpperCase(),
      );
    }
  }

  expect(errors).toEqual([]);
});

test('public SEO routes include base path and localized sitemap links', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');

  const sitemap = await request.get('/j-aautomation/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain('https://www.j-aautomation.com/j-aautomation/en/privacy');
  expect(sitemapBody).toContain(
    'https://www.j-aautomation.com/j-aautomation/pt/projects/incobrasa-silo-expansion',
  );
  expect(sitemapBody).toContain('hreflang="pt-BR"');

  const robots = await request.get('/j-aautomation/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(
    'Sitemap: https://www.j-aautomation.com/j-aautomation/sitemap.xml',
  );
});

test('public image content is served from WebP assets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/j-aautomation/en/');

  const imageSources = await page
    .locator('img')
    .evaluateAll((images) => images.map((image) => image.currentSrc || image.src).filter(Boolean));

  expect(imageSources.length).toBeGreaterThan(0);
  expect(imageSources.every((source) => decodeURIComponent(source).includes('.webp'))).toBe(true);

  const imageResponses = await Promise.all(
    imageSources.map((source) => page.request.get(source, { headers: { accept: 'image/webp' } })),
  );
  expect(imageResponses.every((response) => response.ok())).toBe(true);
  expect(
    imageResponses.every((response) =>
      response.headers()['content-type']?.startsWith('image/webp'),
    ),
  ).toBe(true);
});

test('hero CTAs and industries spacing fit required viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const viewports = [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const;
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto('/j-aautomation/en/', { waitUntil: 'domcontentloaded' });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const bounds = await page.evaluate(() => {
      const getBounds = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const { top, bottom } = element.getBoundingClientRect();
        return { top, bottom };
      };
      return {
        hero: getBounds('#home'),
        cta: getBounds('#home .translate-y-6'),
        industries: getBounds('#industries'),
        industriesEyebrow: getBounds('#industries .eyebrow'),
      };
    });
    const numberedSectionOrder = await page
      .locator('section[id]')
      .evaluateAll((sections) =>
        sections
          .map((section) => section.id)
          .filter((id) =>
            ['services', 'works', 'technology', 'delivery', 'team', 'aquarex'].includes(id),
          ),
      );
    expect(bounds.hero).not.toBeNull();
    expect(bounds.cta).not.toBeNull();
    expect(bounds.industries).not.toBeNull();
    expect(bounds.industriesEyebrow).not.toBeNull();
    expect(bounds.cta!.bottom).toBeLessThanOrEqual(bounds.hero!.bottom + 1);
    expect(bounds.industries!.top).toBeGreaterThanOrEqual(bounds.hero!.bottom - 1);
    expect(bounds.industriesEyebrow!.top).toBeGreaterThan(bounds.industries!.top);
    expect(numberedSectionOrder).toEqual([
      'services',
      'works',
      'technology',
      'delivery',
      'team',
      'aquarex',
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`home-${width}x${height}.png`),
      fullPage: true,
    });
  }
});
