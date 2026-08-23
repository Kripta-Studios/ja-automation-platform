import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'apps/portal/src');
const ownedComponentPaths = [
  'lib/PortalShell.svelte',
  'lib/PortalChrome.svelte',
  'lib/portal/sections/TodaySection.svelte',
  'lib/portal/sections/TimesheetPanel.svelte',
  'lib/portal/sections/ExpenseSection.svelte',
  'lib/portal/sections/ReportSection.svelte',
  'lib/portal/sections/FinanceConfigurationSection.svelte',
];

function source(path: string): string {
  return readFileSync(resolve(sourceRoot, path), 'utf8');
}

describe('authenticated shell i18n coverage', () => {
  it('keeps owned component copy behind explicit translation helpers', () => {
    for (const path of ownedComponentPaths) {
      const contents = source(path);
      expect(contents, path).toMatch(/\btranslate(?:ControlledValue)?\s*\(/);
      expect(contents, path).not.toContain('{form.message}');
    }

    const shell = source('lib/PortalShell.svelte');
    expect(shell).toContain('messageKey');
    expect(shell).toContain('messageParams');
    expect(shell).toContain('data-portal-live-text');
  });

  it('renders record-link copy in the DOM instead of CSS pseudo-content', () => {
    const css = [
      resolve(sourceRoot, 'styles/portal/surfaces.css'),
      resolve(sourceRoot, 'styles/portal/details-invoices.css'),
    ]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(css).not.toMatch(/content\s*:\s*['"][^'"]*(?:Open|OPEN)\b/);
    expect(source('lib/portal/sections/ReportSection.svelte')).toContain('record-card-open');
    expect(source('lib/portal/sections/ExpenseSection.svelte')).toContain('record-card-open');
  });
});
