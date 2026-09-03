import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: vi.fn(async ({ resolve }: { resolve: (event: unknown) => Response }) =>
    resolve(undefined),
  ),
}));

const { handle } = await import('../../apps/portal/src/hooks.server.js');

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('UI_PLAN foundation contracts', () => {
  it('returns a safe 307 alias for the legacy login URL without touching the API handler', async () => {
    const url = new URL(
      'http://localhost/j-aautomation/login?next=%2Fj-aautomation%2Fapp%2Fprojects&tag=a&tag=b',
    );
    const resolve = vi.fn(async () => new Response('should not resolve'));
    const event = {
      url,
      request: new Request(url),
      locals: {},
      cookies: { get: () => undefined },
      getClientAddress: () => '127.0.0.1',
    } as unknown as Parameters<typeof handle>[0]['event'];

    const response = await handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/j-aautomation/app/login?next=%2Fj-aautomation%2Fapp%2Fprojects&tag=a&tag=b',
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('redirects only the legacy public login path and preserves its encoded query', () => {
    const hooks = read('apps/portal/src/hooks.server.ts');

    expect(hooks).toContain('function legacyLoginRedirect');
    expect(hooks).toMatch(/event\.url\.pathname\s*!==\s*legacyPath/);
    expect(hooks).toMatch(
      /event\.url\.pathname\s*!==\s*legacyPath[\s\S]*?legacyPath\s*===\s*canonicalPath/,
    );
    expect(hooks).toContain('target.search = event.url.search');
    expect(hooks).toContain('status: 307');
    expect(hooks).toContain('const legacyLogin = legacyLoginRedirect(event)');
    expect(hooks).toContain('process.env.JA_PUBLIC_BASE_PATH');
    expect(hooks).toContain('process.env.JA_PORTAL_BASE_PATH');
  });

  it.each([
    ['/j-aautomation/app/invoices?lang=es', '/j-aautomation/app/billing?lang=es'],
    ['/j-aautomation/app/settings', '/j-aautomation/app/audit'],
    [
      '/j-aautomation/app/team?lang=pt&focus=worker-1',
      '/j-aautomation/app/projects?lang=pt&focus=worker-1&view=team',
    ],
    [
      '/j-aautomation/app/clients?focus=client-1',
      '/j-aautomation/app/projects?focus=client-1&view=clients',
    ],
  ])('redirects the intuitive portal alias %s to %s', async (source, expected) => {
    const url = new URL(source, 'http://localhost');
    const resolve = vi.fn(async () => new Response('should not resolve'));
    const event = {
      url,
      request: new Request(url),
      locals: {},
      cookies: { get: () => undefined },
      getClientAddress: () => '127.0.0.1',
    } as unknown as Parameters<typeof handle>[0]['event'];

    const response = await handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(new URL(expected, url.origin).toString());
    expect(resolve).not.toHaveBeenCalled();
  });

  it('keeps the production authentication limit strict while allowing bounded evidence runs', () => {
    const hooks = read('apps/portal/src/hooks.server.ts');
    const playwright = read('playwright.config.ts');

    expect(hooks).toContain('process.env.JA_AUTH_RATE_LIMIT_MAX');
    expect(hooks).toMatch(/configuredMaximum[\s\S]*?configuredMaximum <= 10_000/);
    expect(hooks).toMatch(/:\s*10;/);
    expect(playwright).toContain("JA_AUTH_RATE_LIMIT_MAX: '500'");
  });

  it('defines a neutral, high-contrast Industrial Tech token layer', () => {
    const foundation = read('apps/portal/src/styles/portal/foundation.css');

    for (const token of [
      '--ja-canvas',
      '--ja-surface',
      '--ja-surface-raised',
      '--ja-border-subdued',
      '--ja-border-focus',
      '--ja-text-primary',
      '--ja-text-secondary',
      '--ja-primary',
      '--ja-status-success',
      '--ja-status-warning',
      '--ja-status-danger',
    ]) {
      expect(foundation, `${token} should be defined`).toContain(token);
    }

    expect(foundation).toContain('background-image: url("data:image/svg+xml');
    expect(foundation).toContain('select:not([multiple])');
    expect(foundation).toContain('min-height: var(--ja-target-min)');
    expect(foundation).toContain('outline: 2px solid color-mix');
    expect(foundation).toContain('--ja-status-success: #047857');
  });

  it('restores visible button chrome after Tailwind Preflight so action controls are not body text', () => {
    const foundation = read('apps/portal/src/styles/portal/foundation.css');
    expect(foundation).toContain("button:not([role='tab'])");
    expect(foundation).toContain('background: var(--ja-primary, #0f766e)');
    expect(foundation).toContain('min-height: var(--ja-target-min, 2.75rem)');
    expect(foundation).toContain('button.danger');
    expect(foundation).toContain('background: var(--ja-status-danger, #dc2626)');
  });

  it('keeps pending metrics and management disclosures calm and readable', () => {
    const polish = read('apps/portal/src/styles/portal/polish.css');
    const management = read('apps/portal/src/styles/portal/forms-management.css');

    expect(polish).toMatch(
      /\.dashboard-metrics \.attention\s*\{[\s\S]*?background:\s*var\(--ja-surface/,
    );
    expect(polish).toMatch(
      /\.dashboard-metrics \.attention\s*\{[\s\S]*?border-inline-start:[^;]*var\(--ja-status-warning/,
    );
    expect(polish).toMatch(/\.admin-details > summary[\s\S]*?color:\s*var\(--ja-text-primary/);
    expect(polish).toMatch(
      /details > summary::after[\s\S]*?background-image:\s*url\("data:image\/svg\+xml/,
    );
    expect(management).toMatch(/\.admin-details summary[\s\S]*?min-height:\s*var\(--ja-target-min/);
    expect(management).toContain('background: var(--ja-surface');
  });

  it('provides touch-safe tablet sheets and a standalone accessible toast primitive', () => {
    const responsive = read('apps/portal/src/styles/portal/responsive.css');
    const toast = read('apps/portal/src/lib/portal/ui/Toast.svelte');
    const toastRegion = read('apps/portal/src/lib/portal/ui/ToastRegion.svelte');
    const primitives = read('apps/portal/src/styles/portal/primitives.css');
    const index = read('apps/portal/src/lib/portal/ui/index.ts');

    expect(responsive).toMatch(/@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)/);
    expect(responsive).toMatch(/\.responsive-sheet[\s\S]*?width:\s*min\(60vw/);
    expect(responsive).toMatch(
      /@media \(max-width:\s*47\.99rem\)[\s\S]*?\.responsive-sheet[\s\S]*?width:\s*100vw/,
    );
    expect(responsive).toContain('min-height: max(44px, var(--ja-target-min');
    expect(toast).toContain('data-ui="toast"');
    expect(toast).toContain('aria-live={live}');
    expect(toast).toMatch(/(?:role=\{role\}|\{role\})/);
    expect(toastRegion).toContain('data-ui="toast-region"');
    expect(primitives).toMatch(/\[data-ui='toast'\][\s\S]*?pointer-events:\s*none/);
    expect(primitives).toMatch(/\.ui-toast-dismiss[\s\S]*?pointer-events:\s*auto/);
    expect(index).toContain('export { default as Toast }');
    expect(index).toContain('export { default as ToastRegion }');
  });
});
