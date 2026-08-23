import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Requirement coverage: V31-011/013/014/016, V32-001 and V33-017.

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const shellSource = (): string => readSource('apps/portal/src/lib/PortalShell.svelte');

const sectionBlock = (source: string, section: string): string => {
  const start = source.indexOf(`{:else if data.section === '${section}'}`);
  if (start < 0) return '';
  const end = source.indexOf("{:else if data.section === '", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
};

function hasPeriodRegisterInComposeColumn(source: string): boolean {
  const periodIndex = source.indexOf('period-report-list');
  if (periodIndex < 0) return false;

  const before = source.slice(0, periodIndex);
  const stack: string[] = [];
  for (const match of before.matchAll(/<\/?div(?:\s[^>]*)?>/g)) {
    const token = match[0] ?? '';
    if (token.startsWith('</')) {
      stack.pop();
      continue;
    }
    const className = token.match(/class="([^"]*)"/)?.[1] ?? '';
    stack.push(className);
  }
  return stack.some((className) => className.split(/\s+/).includes('report-compose-column'));
}

describe('requested portal UI regressions (RED characterization)', () => {
  it('derives the page heading from section plus query view for Clients, Team, Invoices and PLC', () => {
    const source = shellSource();
    const titleBinding = source.match(/const currentTitle\s*=\s*\$derived\(([\s\S]*?)\);/);
    expect(titleBinding, 'PortalShell must expose one reactive current-title binding').toBeTruthy();
    expect(
      titleBinding?.[1],
      'the h1 binding must react to the current query view, not only data.section',
    ).toMatch(/view|url|searchParams|titleFor/i);

    const navigation = readSource('apps/portal/src/lib/portal-navigation.ts');
    const routeSource = `${source}\n${navigation}`;
    for (const view of ['Clients', 'Team', 'Invoices', 'PLC / Technical'])
      expect(routeSource, `${view} must have a title/view contract`).toContain(view);
    expect(routeSource).toMatch(/(?:viewTitle|viewTitles|titleFor|searchParams\.get\(['"]view)/i);
  });

  it('places Authorized projects before administrative edit panels', () => {
    const projects = sectionBlock(shellSource(), 'projects');
    const authorizedCandidates = [
      projects.indexOf('<h2>Authorized projects</h2>'),
      projects.indexOf("<h2>{translate('Authorized projects')}</h2>"),
    ].filter((index) => index >= 0);
    const authorized = authorizedCandidates.length > 0 ? Math.min(...authorizedCandidates) : -1;
    const firstAdminPanel = projects.indexOf('<details class="admin-details">');
    expect(authorized, 'Projects must render the authorized-projects surface').toBeGreaterThan(-1);
    expect(firstAdminPanel, 'Projects must retain its administrative panels').toBeGreaterThan(-1);
    expect(authorized, 'authorized projects should be the first Projects surface').toBeLessThan(
      firstAdminPanel,
    );
  });

  it('keeps the period report register in the collapsible report flow so it can reflow upward', () => {
    const report = readSource('apps/portal/src/lib/portal/sections/ReportSection.svelte');
    const css = readSource('apps/portal/src/styles/portal/legacy.css');
    const nested = hasPeriodRegisterInComposeColumn(report);
    const denseGrid = /\.report-workspace[\s\S]*?grid-auto-flow\s*:\s*dense/i.test(css);
    expect(
      nested || denseGrid,
      'collapsing both report details must not leave the period register stranded in a sparse grid row',
    ).toBe(true);
  });

  it('hides portal chrome in print media and exposes Print Report on source records', () => {
    const responsive = readSource('apps/portal/src/styles/portal/responsive.css');
    const printRule = responsive.match(/@media print[\s\S]*$/)?.[0] ?? '';
    expect(printRule).toMatch(/portal-layout\s*>\s*aside/);
    expect(printRule).toMatch(/portal-layout\s*>\s*header/);
    expect(printRule).toMatch(/portal-layout\s*>\s*main/);

    for (const route of [
      'apps/portal/src/routes/app/reports/[id]/+page.svelte',
      'apps/portal/src/routes/app/time/[id]/+page.svelte',
      'apps/portal/src/routes/app/expenses/[id]/+page.svelte',
    ]) {
      const source = readSource(route);
      expect(source, `${route} needs a real print action`).toMatch(/Print Report/i);
      expect(source, `${route} needs a window.print implementation`).toMatch(/window\.print\s*\(/);
      expect(source, `${route} print controls must be excluded from the document`).toMatch(
        /no-print/,
      );
    }
  });

  it('uses SVG chevrons and a centered settings-wheel hole instead of text glyphs', () => {
    const chrome = readSource('apps/portal/src/lib/PortalChrome.svelte');
    expect(chrome).not.toMatch(/class="account-chevron"[^>]*>[\s\S]*[⌄⌃]/);
    expect(chrome).toMatch(/class="account-chevron"[\s\S]*?<svg[\s\S]*?<path/);

    const settingsPath = chrome.match(/Settings:\s*['"]([^'"]+)['"]/)?.[1] ?? '';
    expect(settingsPath, 'Settings must use the centered gear path').toContain('M12 8a4');
    const navIcon = readSource('apps/portal/src/lib/PortalNavIcon.svelte');
    expect(navIcon).toMatch(/<circle\s+cx="12"\s+cy="12"/);
  });

  it('renders client-contact actions from record ids rather than asking users to type UUIDs', () => {
    const projects = sectionBlock(shellSource(), 'projects');
    expect(projects).toMatch(/Client contacts/);
    expect(projects).toMatch(/each data\.contacts as contact/);
    expect(projects).toMatch(/(?:Edit|Update) contact/i);
    expect(projects).toMatch(/Delete contact/i);
    expect(projects).not.toMatch(/Contact UUID/);
    expect(
      projects,
      'contact update/delete actions must carry the selected contact id from the rendered record',
    ).toMatch(/(?:data-contact-id|name="contactId"[^>]*value=\{[^}]*\.id\})/);
  });

  it('gives owner/admin the worker selector needed to manage skills and availability', () => {
    const load = readSource('apps/portal/src/routes/app/[section]/section-load.ts');
    const profile = sectionBlock(shellSource(), 'profile');
    const profileStart = load.indexOf("case 'profile':");
    const profileEnd = load.indexOf("case 'notifications':", profileStart + 1);
    const profileLoad = load.slice(profileStart, profileEnd < 0 ? load.length : profileEnd);
    expect(profileLoad).toMatch(/workers\s*:/);
    expect(profileLoad).toMatch(/listAllWorkers/);
    expect(profile).toMatch(/Skills and availability/);
    expect(profile).toMatch(/name="workerId"/);
    expect(profile).toMatch(/(?:each data\.workers|worker selector)/i);
  });
});
