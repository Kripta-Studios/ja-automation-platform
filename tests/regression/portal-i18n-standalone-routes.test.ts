import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const standaloneRoutes = [
  'apps/portal/src/routes/app/login/+page.svelte',
  'apps/portal/src/routes/app/login/two-factor/+page.svelte',
  'apps/portal/src/routes/app/invite/[token]/+page.svelte',
  'apps/portal/src/routes/app/projects/[id]/+page.svelte',
  'apps/portal/src/routes/app/reports/[id]/+page.svelte',
  'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
  'apps/portal/src/routes/app/time/[id]/+page.svelte',
  'apps/portal/src/routes/app/expenses/[id]/+page.svelte',
  'apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte',
  'apps/portal/src/routes/app/notifications/[id]/+page.svelte',
];

const actionFeedbackRoutes = [
  'apps/portal/src/routes/app/projects/[id]/+page.svelte',
  'apps/portal/src/routes/app/reports/[id]/+page.svelte',
  'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
  'apps/portal/src/routes/app/notifications/[id]/+page.svelte',
];

const detailEnumRoutes = [
  'apps/portal/src/routes/app/projects/[id]/+page.svelte',
  'apps/portal/src/routes/app/reports/[id]/+page.svelte',
  'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
  'apps/portal/src/routes/app/time/[id]/+page.svelte',
  'apps/portal/src/routes/app/expenses/[id]/+page.svelte',
  'apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte',
  'apps/portal/src/routes/app/notifications/[id]/+page.svelte',
];

const detailActionServers = [
  'apps/portal/src/routes/app/projects/[id]/+page.server.ts',
  'apps/portal/src/routes/app/reports/[id]/+page.server.ts',
  'apps/portal/src/routes/app/reports/period/[id]/+page.server.ts',
  'apps/portal/src/routes/app/notifications/[id]/+page.server.ts',
];

const detailLoaders = [
  'apps/portal/src/routes/app/projects/[id]/+page.server.ts',
  'apps/portal/src/routes/app/reports/[id]/+page.server.ts',
  'apps/portal/src/routes/app/reports/period/[id]/+page.server.ts',
  'apps/portal/src/routes/app/time/[id]/+page.server.ts',
  'apps/portal/src/routes/app/expenses/[id]/+page.server.ts',
  'apps/portal/src/routes/app/billing/invoices/[id]/+page.server.ts',
  'apps/portal/src/routes/app/notifications/[id]/+page.server.ts',
];

describe('standalone portal route locale boundary', () => {
  it.each(standaloneRoutes)('%s resolves and applies the persisted/query locale', (path) => {
    const source = read(path);
    expect(source).toContain('standalone-locale');
    expect(source).toContain('resolveStandaloneLocale');
    expect(source).toContain('applyStandaloneDocumentLocale');
    expect(source).toContain('standaloneText');
    expect(source, `${path} must seed its SSR locale from layout data`).toContain('data.locale');
    expect(source, `${path} must keep SSR locale stable during hydration`).toMatch(
      /localeOverride\s*\?\?\s*data\.locale/,
    );
  });

  it('keeps source-record print controls outside printed pages', () => {
    for (const path of [
      standaloneRoutes[3],
      standaloneRoutes[4],
      standaloneRoutes[5],
      standaloneRoutes[6],
      standaloneRoutes[7],
      standaloneRoutes[8],
    ]) {
      const source = read(path);
      expect(source).toMatch(/Print Report|Print report/);
      expect(source).toContain('window.print(');
      expect(source).toContain('no-print');
    }
  });

  it('uses the locale-aware currency formatter on financial standalone pages', () => {
    for (const path of [
      standaloneRoutes[3],
      standaloneRoutes[5],
      standaloneRoutes[7],
      standaloneRoutes[8],
    ]) {
      const source = read(path);
      expect(source).toMatch(/new Intl\.NumberFormat\(locale === 'pt' \? 'pt-BR' : locale/);
    }
  });

  it('consumes keyed action feedback and never renders the legacy message field directly', () => {
    for (const path of actionFeedbackRoutes) {
      const source = read(path);
      expect(source, `${path} must use the keyed action feedback helper`).toContain(
        'standaloneActionMessage',
      );
      expect(source, `${path} must not render form.message directly`).not.toMatch(
        /form\??\.message/,
      );
    }
    const helper = read('apps/portal/src/routes/app/standalone-locale.ts');
    expect(helper).toContain('messageKey');
    expect(helper).toContain('messageParams');
    expect(helper).toContain('result.message');
    expect(helper).toContain("locale === 'en'");
    expect(helper).toContain('translated !== result.message');
    expect(helper).toContain("'action.error.unavailable'");
  });

  it('uses stable non-user-facing codes for missing detail records', () => {
    for (const path of detailLoaders) {
      const source = read(path);
      expect(source, `${path} must return a stable detail error code`).toMatch(
        /error\(404,\s*['"]detail\.[A-Za-z0-9.]+['"]\)/,
      );
      expect(source, `${path} must not expose an English not-found sentence`).not.toMatch(
        /error\(404,\s*['"][^'"]*(?:not found|does not exist)[^'"]*['"]\)/i,
      );
    }
  });

  it('renders localized standalone error UX without leaking loader diagnostics', () => {
    const boundary = read('apps/portal/src/routes/app/+error.svelte');
    expect(boundary).toContain('standaloneText');
    expect(boundary).toContain('$page.status');
    expect(boundary).toContain('$page.data');
    expect(boundary).toContain('applyStandaloneDocumentLocale');
    expect(boundary).toContain("standaloneText(locale, 'No results')");
    expect(boundary).not.toMatch(/\{\s*\$page\.error\??\.message\s*\}/);
    const report = read('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    expect(report).toContain("t('VERSION')");
    expect(report).toContain('eventAction(event.action)');
    expect(report).toContain("t('System / machine')");
  });

  it('translates persisted detail enums through the controlled-value boundary', () => {
    for (const path of detailEnumRoutes) {
      const source = read(path);
      expect(source, `${path} must use the shared controlled-value translator`).toContain(
        'translateControlledValue',
      );
      for (const rawBinding of [
        '>{record.approval_state}</',
        '>{record.billability_state}</',
        '>{String(invoice.stream_type).toUpperCase()}</',
        '>{worker.assignment_role}</',
      ])
        expect(source, `${path} must not print ${rawBinding} directly`).not.toContain(rawBinding);
    }
  });

  it('returns keyed action payloads from standalone detail actions', () => {
    for (const path of detailActionServers) {
      const source = read(path);
      expect(source, `${path} must import the centralized action helpers`).toContain(
        "from '$lib/server/actions/action-message'",
      );
      expect(source, `${path} must expose a keyed success or validation result`).toMatch(
        /action(?:Success|Fail)\(/,
      );
      expect(source, `${path} must not return an English-only message field`).not.toMatch(
        /message\s*:\s*['"`]/,
      );
    }
  });

  it('defines the SSR locale contract before hydration', () => {
    const layout = read('apps/portal/src/routes/+layout.server.ts');
    const hooks = read('apps/portal/src/hooks.server.ts');
    const appHtml = read('apps/portal/src/app.html');
    expect(layout).toContain('accept-language');
    expect(layout).toContain('ja.portal.locale');
    expect(layout).toContain('normalizePortalLocale');
    expect(hooks).toContain('applyServerDocumentLocale');
    expect(hooks).toContain('documentLanguage');
    expect(hooks).toContain("headers.delete('content-length')");
    expect(hooks).not.toContain('if (html === body) return response');
    expect(appHtml).toContain('<html lang="en-US">');
    const standaloneLocale = read('apps/portal/src/routes/app/standalone-locale.ts');
    expect(standaloneLocale).toContain('serverLocale');
    expect(standaloneLocale).toContain('document.cookie');
    expect(standaloneLocale).toContain('canonicalDocumentLanguage');
  });
});
