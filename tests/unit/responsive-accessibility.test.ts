import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { translateControlledValue } from '../../apps/portal/src/lib/i18n/controlled-values';
import { categorySummary } from '../../apps/portal/src/lib/portal/portal-format';

const source = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Client Essential responsive accessibility contract', () => {
  it('keeps global search and account controls visibly focusable', () => {
    const polish = source('apps/portal/src/styles/portal/polish.css');
    const shell = source('apps/portal/src/styles/portal/shell.css');

    expect(polish).toContain('.global-search input:focus-visible');
    expect(polish).toContain('.global-search button:focus-visible');
    expect(polish).toContain('.search-popover-item:focus-visible');
    expect(shell).toContain('.account-trigger:focus-visible');
    expect(shell).toContain('.account-menu a:focus-visible');
    expect(shell).not.toMatch(/\.account-menu[\s\S]{0,500}outline:\s*none/u);
  });

  it('keeps operational filters and actions at the 44px touch target', () => {
    const surfaces = source('apps/portal/src/styles/portal/surfaces.css');
    const projectSection = source('apps/portal/src/lib/portal/sections/ProjectSection.svelte');
    const polish = source('apps/portal/src/styles/portal/polish.css');

    expect(surfaces).toContain('.timesheet-period input');
    expect(surfaces).toContain('min-height: var(--ja-target-min, 2.75rem);');
    expect(surfaces).toContain('.timesheet-period button,');
    expect(surfaces).toContain('.record-list button,');
    expect(surfaces).toContain('.assignment button');
    expect(projectSection).toContain('.project-section__filters input');
    expect(projectSection).toContain('.project-section__actions summary');
    expect(projectSection).toContain('min-height: var(--ja-target-min, 2.75rem);');
    expect(surfaces).toContain('.quick-actions a,');
    expect(polish).toContain('.worker-pay-table:focus-visible');
  });

  it('uses named keyboard-focusable scroll regions for dense pay/profile tables', () => {
    const shell = source('apps/portal/src/lib/PortalShell.svelte');
    const reportPeriod = source('apps/portal/src/routes/app/reports/period/[id]/+page.svelte');
    const polish = source('apps/portal/src/styles/portal/polish.css');

    // Keep this assertion structural: Prettier may render the same import as
    // a single line or a multiline block as the shell grows. The shell still
    // needs the shared form primitive and six named scroll regions.
    expect(shell).toMatch(
      /import\s*\{[\s\S]*?FormCard,[\s\S]*?TableRegion,[\s\S]*?ToastRegion,[\s\S]*?\}\s*from\s*['"]\.\/portal\/ui['"]/u,
    );
    expect(shell.match(/<TableRegion[\s\S]*?mobileMode="scroll"/gu)?.length).toBe(6);
    expect(shell).toContain('class="table-wrap worker-pay-table"');
    expect(shell).toContain('class="table-wrap worker-profile-table"');
    expect(reportPeriod.match(/<TableRegion[\s\S]*?mobileMode="scroll"/gu)?.length).toBe(2);
    expect(reportPeriod).toContain('class="table-wrap report-period-table"');
    expect(polish).toContain('.report-period-table:focus-visible');
    expect(reportPeriod).not.toMatch(/<style>[\s\S]*\.report-period-table/u);
  });

  it('uses the shared labelled field primitive for the finance project filter', () => {
    const finance = source('apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte');

    expect(finance).toContain('import { Field,');
    expect(finance).toContain('<Field id={`finance-project-${componentId}`}');

    const responsive = source('apps/portal/src/styles/portal/responsive.css');
    expect(responsive).toMatch(
      /@media \(max-width: 47\.99rem\)[\s\S]*?\.finance-config-panel \.admin-form-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u,
    );
  });

  it('keeps report sign-off controls keyboard-visible and touch-sized', () => {
    const reportPeriod = source('apps/portal/src/routes/app/reports/period/[id]/+page.svelte');

    expect(reportPeriod).toContain('.customer-signoff__pdf:focus-visible');
    expect(reportPeriod).toContain('.customer-signoff__form button:focus-visible');
    expect(reportPeriod).toContain('.customer-signoff__invalidate summary:focus-visible');
    expect(reportPeriod).toContain('min-height: 2.75rem;');
  });

  it('keeps the shared sheet contextual on tablet and full-width on phones', () => {
    const responsive = source('apps/portal/src/styles/portal/responsive.css');

    expect(responsive).toMatch(
      /@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)[\s\S]*?\.responsive-sheet[\s\S]*?width:\s*min\(60vw/u,
    );
    expect(responsive).toMatch(
      /@media \(max-width:\s*47\.99rem\)[\s\S]*?\.responsive-sheet[\s\S]*?width:\s*100vw/u,
    );
  });

  it('keeps the compact header inside narrow phone viewports', () => {
    const responsive = source('apps/portal/src/styles/portal/responsive.css');

    expect(responsive).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.portal-layout > header\s*\{[\s\S]*?padding-inline: 0\.5rem/u,
    );
    expect(responsive).toMatch(/\.locale-switcher\s*\{[\s\S]*?margin-right: 0/u);
    expect(responsive).toMatch(
      /@media \(max-width: 400px\)[\s\S]*?\.portal-webmail-link\s*\{[\s\S]*?display: none/u,
    );
    expect(responsive).toMatch(
      /@media \(max-width: 400px\)[\s\S]*?\.account-trigger\s*\{[\s\S]*?width: 44px/u,
    );
    expect(responsive).toMatch(
      /@media \(max-width: 400px\)[\s\S]*?\.locale-switcher select\s*\{[\s\S]*?width: 4rem/u,
    );

    const chrome = source('apps/portal/src/lib/PortalChrome.svelte');
    expect(chrome).toContain('class="portal-external-nav-link"');
    expect(chrome).toContain("translate('Company Webmail')");
  });

  it('defines persistent field borders, focus rings and disclosure affordances', () => {
    const foundation = source('apps/portal/src/styles/portal/foundation.css');
    const polish = source('apps/portal/src/styles/portal/polish.css');

    expect(foundation).toContain('--ja-border-focus: #0284c7');
    expect(foundation).toContain('border: 1px solid var(--ja-control-border)');
    expect(foundation).toContain('box-shadow: 0 0 0 3px color-mix');
    expect(polish).toContain('.admin-details > summary::after');
    expect(polish).toContain('background-image: url("data:image/svg+xml');
  });

  it('contains card-mode desktop tables inside the named region at tablet and desktop widths', () => {
    const primitives = source('apps/portal/src/styles/portal/primitives.css');
    const tableRegion = source('apps/portal/src/lib/portal/ui/TableRegion.svelte');

    expect(primitives).toMatch(
      /\[data-ui='table-region'\]\[data-mobile-representation='cards'\] > \[data-table-region-desktop\][\s\S]*?overflow-x:\s*auto/u,
    );
    expect(primitives).toMatch(
      /\[data-ui='table-region'\]\[data-mobile-representation='cards'\] > \[data-table-region-desktop\] > table[\s\S]*?width:\s*max-content/u,
    );
    expect(primitives).toMatch(
      /@media \(min-width:\s*64rem\)[\s\S]*?\[data-table-region-desktop\][\s\S]*?display:\s*block/u,
    );
    expect(primitives).not.toMatch(
      /@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)[\s\S]*?\[data-table-region-desktop\][\s\S]*?display:\s*block/u,
    );
    expect(tableRegion).toContain('data-table-region-desktop');
    expect(tableRegion).toContain('tabindex="0"');
  });

  it('routes TableRegion helper copy through translated props for the live EN-to-ES boundary', () => {
    const tableRegion = source('apps/portal/src/lib/portal/ui/TableRegion.svelte');
    const timesheet = source('apps/portal/src/lib/portal/sections/TimesheetPanel.svelte');

    expect(tableRegion).toContain('scrollInstruction');
    expect(tableRegion).toContain('detailsLabel');
    expect(timesheet).toMatch(/scrollInstruction=\{translate\(['"]Scroll horizontally/u);
    expect(timesheet).toMatch(/detailsLabel=\{translate\(['"]Open details['"]\)\}/u);
    expect(translate('es', 'Scroll horizontally to review all columns.')).toBe(
      'Desplázate horizontalmente para revisar todas las columnas.',
    );
    expect(translate('es', 'Open details')).toBe('Abrir detalles');
  });

  it('localizes timesheet categories through the controlled formatter after an EN-to-ES rerender', () => {
    const timesheet = source('apps/portal/src/lib/portal/sections/TimesheetPanel.svelte');
    const categories = { regular: 60, travel_time: 30, standby: 45, overtime: 60 };
    const localizedSummary = (locale: 'en' | 'es'): string =>
      categorySummary(categories, (category) =>
        translateControlledValue(locale, 'timeCategory', category),
      );

    expect(timesheet).toMatch(/controlledValue\(\s*['"]timeCategory['"]/u);
    expect(timesheet).not.toMatch(/categorySummary\(day\.categories\)\s*\|\|/u);
    expect(localizedSummary('en')).toBe(
      'Regular time 1.0h · Travel time 0.5h · Standby / waiting 0.8h · Overtime 1.0h',
    );
    expect(localizedSummary('es')).toBe(
      'Tiempo ordinario 1.0h · Tiempo de viaje 0.5h · Disponibilidad / espera 0.8h · Horas extra 1.0h',
    );
  });

  it('renders the weekly timesheet as labelled cards below 640px while retaining the desktop table', () => {
    const timesheet = source('apps/portal/src/lib/portal/sections/TimesheetPanel.svelte');
    const responsive = source('apps/portal/src/styles/portal/responsive.css');

    expect(timesheet).toContain("import type { TableCardRow } from '../ui';");
    expect(timesheet).toContain('const timesheetCardRows = $derived.by((): TableCardRow[] =>');
    expect(timesheet).toContain('mobileMode="cards"');
    expect(timesheet).toContain('{timesheetCardRows}');
    for (const label of ['Day', 'Actual', 'Expected', 'Difference', 'Categories', 'Status']) {
      expect(timesheet).toContain(`translate('${label}')`);
    }

    expect(responsive).toMatch(
      /@media \(max-width:\s*39\.99rem\)[\s\S]*?\.timesheet-table-wrap\[data-mobile-representation='cards'\][\s\S]*?overflow:\s*visible/u,
    );
    expect(responsive).toMatch(
      /@media \(min-width:\s*48rem\)[\s\S]*?\.timesheet-table-wrap\[data-mobile-representation='cards'\][\s\S]*?overflow-x:\s*auto/u,
    );
  });

  it('collapses the textual sidebar into an accessible drawer at tablet portrait width', () => {
    const chrome = source('apps/portal/src/lib/PortalChrome.svelte');
    const responsive = source('apps/portal/src/styles/portal/responsive.css');

    expect(chrome).toContain("window.matchMedia('(max-width: 63.99rem)')");
    expect(chrome).toContain("role={mobileDrawer ? 'dialog' : undefined}");
    expect(chrome).toContain("aria-modal={mobileDrawer ? 'true' : undefined}");
    expect(responsive).toMatch(
      /@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)[\s\S]*?\.portal-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u,
    );
    expect(responsive).toMatch(
      /@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)[\s\S]*?\.portal-layout > aside\s*\{[\s\S]*?position:\s*fixed[\s\S]*?transform:\s*translateX/u,
    );
    expect(responsive).toMatch(
      /@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)[\s\S]*?\.menu-button\s*\{[\s\S]*?display:\s*grid/u,
    );
    expect(responsive).toMatch(
      /@media \(min-width:\s*48rem\) and \(max-width:\s*63\.99rem\)[\s\S]*?\.nav-backdrop\.visible\s*\{[\s\S]*?pointer-events:\s*auto/u,
    );
  });
});
