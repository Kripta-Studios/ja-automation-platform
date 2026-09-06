import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INVOICE_COMPANY_INFO } from '../../packages/invoice-templates/src/index.ts';

const read = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

const screenshotScripts = [
  'scripts/capture-manual-screenshots.ts',
  'scripts/test-full-user-flow.ts',
  'scripts/demo-report-detail.ts',
  'scripts/qa-live-portal-audit.ts',
] as const;

const guardSource = read('scripts/isolated-test-guards.ts');
const seedCredentialSource = read('scripts/seed-demo-credentials.ts');
const e2eAuthSource = read('tests/e2e/auth.ts');
const demoSeedSource = read('packages/database/src/demo-seed.ts');
const webmailAuthSource = read('tests/integration/webmail-auth.test.ts');

describe('credential and presentation hygiene', () => {
  it('requires synthetic credentials and does not embed or print production identities/secrets', () => {
    expect(guardSource).toMatch(/SYNTHETIC_EMAIL_PATTERN/u);
    expect(guardSource).toMatch(/requiredEnvironment\(/u);
    expect(guardSource).toMatch(/j-aautomation\.com/u);
    expect(seedCredentialSource).toMatch(/JA_DEMO_CREDENTIALS_(?:JSON|FILE)/u);
    expect(seedCredentialSource).toMatch(/passwords are never derived/u);
    expect(seedCredentialSource).not.toMatch(/email\.slice|derive a demo password|separator/u);
    expect(e2eAuthSource).not.toMatch(
      /password:\s*['"](?:antonny\.luty|finance|auditor|pm|worker|rafael)['"]/iu,
    );
    expect(e2eAuthSource).not.toMatch(/demo\.jaautomation\.local/iu);
    expect(e2eAuthSource).not.toMatch(/@j-aautomation\.com/iu);
    expect(demoSeedSource).not.toMatch(/antonny\.luty@j-aautomation\.com/iu);
    expect(demoSeedSource).toMatch(/canonicalFixtureDirectoryPath/u);
    expect(demoSeedSource).not.toMatch(/database:\s*path/u);
    expect(webmailAuthSource).not.toMatch(/ownerDemoPassword\s*=\s*['"]antonny\.luty['"]/iu);
    for (const relativePath of screenshotScripts) {
      const source = read(relativePath);
      expect(source, relativePath).toMatch(/isolated-test-guards/u);
      expect(source, relativePath).not.toMatch(/antonny\.luty@j-aautomation\.com/iu);
      expect(source, relativePath).not.toMatch(/antonny\.luty/iu);
      expect(source, relativePath).not.toMatch(/worker@demo\.jaautomation\.local/iu);
      expect(source, relativePath).not.toMatch(/password\s*:\s*['"][^'"]+['"]/iu);

      const logLines = source.match(/console\.(?:log|warn|error)\([^\n]*/gu) ?? [];
      expect(
        logLines.some((line) => /password|OWNER\.password|\.password/iu.test(line)),
        `${relativePath} must not print a secret-bearing value`,
      ).toBe(false);
    }
  });

  it('requires the screenshot flows to reject production hosts before browser work', () => {
    for (const relativePath of screenshotScripts) {
      const source = read(relativePath);
      expect(source, relativePath).toMatch(/localBaseUrl/u);
      expect(source, relativePath).toMatch(/requiredFixtureSentinel\(\)/u);
    }
    expect(guardSource).toMatch(/isLocalTestUrl/u);
    expect(guardSource).toMatch(/must point to an isolated local test server/u);
  });

  it('does not render the retired public company telephone or phone-dependent fallbacks', () => {
    const publicSources = [
      'website/content/company.ts',
      'website/content/types.ts',
      'website/app/[locale]/page.tsx',
      'website/app/[locale]/contact/page.tsx',
      'website/components/layout/Footer.tsx',
      'website/components/navigation/MobileMenu.tsx',
      'website/content/locales/en.json',
      'website/content/locales/es.json',
      'website/content/locales/pt.json',
    ];
    const source = publicSources.map(read).join('\n');
    expect(source).not.toContain('+1 (864) 208');
    expect(source).not.toContain('usPhone');
    expect(source).not.toMatch(/phone contacts|contact number shown|phone or email contact/iu);
    expect(source).not.toMatch(
      /use el teléfono|use los teléfonos|use o telefone|use os telefones/iu,
    );
  });

  it('keeps new invoice presentations phone-free unless a historical snapshot supplies one', () => {
    const templateSource = read('packages/invoice-templates/src/index.ts');
    const pageSource = read('apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte');
    expect(DEFAULT_INVOICE_COMPANY_INFO).not.toHaveProperty('phone');
    expect(templateSource).toMatch(/phone\?:\s*string/u);
    expect(templateSource).not.toContain('+1 (864) 208');
    expect(pageSource).toContain('const invoicePhone = $derived(');
    expect(pageSource).toContain('{#if invoicePhone}');
    expect(pageSource).not.toContain('+1 (864) 208');
  });

  it('does not offer worker void/delete actions for submitted or approved time', () => {
    const source = read('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source).toMatch(/canDeleteTimeDraft/u);
    expect(source).toContain('action="?/deleteDraft"');
    expect(source).not.toContain('action="?/deleteTime"');
    expect(source).not.toContain("translate('Void')");
  });
});
