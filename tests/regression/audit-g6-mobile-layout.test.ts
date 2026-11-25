import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const sections = 'apps/portal/src/lib/portal/sections';

/** Source-level guards for the 2026-11-22 audit G6 phone-layout fixes (browser evidence in the fix report). */
describe('audit G6 mobile layout regressions', () => {
  it('T34: supplier Record hours folds the period card and confirms the save above the drafts and Send', () => {
    const page = read('apps/portal/src/routes/app/supplier/+page.svelte');
    expect(page).toContain("collapsible={workspaceAction === 'time'}");
    expect(page).toContain("expanded={workspaceAction !== 'time' || Boolean(data.periodProblem)}");
    // The shared native-save restore aligns the card top, where the notice and drafts start.
    expect(page).toContain('id="supplier-time-card" data-navigation-align="start"');
    const card = page.slice(page.indexOf('id="supplier-time-card"'));
    expect(card.indexOf('class="supplier-batch-notice"')).toBeLessThan(
      card.indexOf('action={actionUrl(\'submitTimeBatch\')}'),
    );
    expect(page).toContain('{#if form?.success && !batchNoticeInCard}');
    // Phone drafts are cards with a label per value, never a 6-column table wider than the screen.
    expect(page).toContain('<td data-label={c.worker}>');
    expect(page).toMatch(/\.drafts-table td\[data-label\]::before\s*\{\s*content: attr\(data-label\)/);
    expect(page).toMatch(/\.crew-drafts-submit\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  });

  it('T37/T58: crew save confirmation is scrolled into view; phone empty states are short', () => {
    const crew = read('apps/portal/src/routes/app/crew/+page.svelte');
    expect(crew).toContain("$page.url.hash === '#crew-entries'");
    const entries = crew.slice(crew.indexOf('id="crew-entries">'));
    expect(entries.slice(0, 400)).toContain('{#if notice && noticeInEntries}');
    const responsive = read('apps/portal/src/styles/portal/responsive.css');
    expect(responsive).toMatch(/main \.empty\s*\{\s*min-height: 6rem;/);
  });

  it('T35/T91: phone invoice amounts never break inside the number', () => {
    const page = read('apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte');
    const phone = page.slice(page.indexOf('@media screen and (max-width: 600px)'));
    expect(phone).toContain('table.invoice-lines) {\n      table-layout: auto;');
    expect(phone).toContain('#ja-invoice-document.invoice-canonical td.amount)');
    expect(phone).toContain('white-space: nowrap;');
    // The PDF/print document keeps the shared reporting CSS untouched.
    expect(read('packages/reporting/src/invoice-document.ts')).toContain('table-layout:fixed');
  });

  it('T36: approval checkboxes have a 44 px target and open weeks survive Back', () => {
    const section = read(`${sections}/ApprovalSection.svelte`);
    expect(section).toContain('<label class="aq-check-hit">');
    expect(section).toMatch(/\.aq-check-hit\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
    expect(section).toContain("const EXPANDED_KEY = 'ja.approvals.expanded';");
    expect(section).toContain('sessionStorage.setItem(EXPANDED_KEY');
  });

  it('T85: expense amount comes before the category chips; phone toasts sit under the top bar', () => {
    const expense = read(`${sections}/ExpenseSection.svelte`);
    const single = expense.slice(expense.indexOf('class="xp-form"'));
    expect(single.indexOf('data-expense-amount')).toBeGreaterThan(0);
    expect(single.indexOf('data-expense-amount')).toBeLessThan(
      single.indexOf("<legend>{c('category')}</legend>"),
    );
    const responsive = read('apps/portal/src/styles/portal/responsive.css');
    const toast = responsive.slice(responsive.indexOf("[data-ui='toast-region'] {"));
    expect(toast.slice(0, 200)).toContain('inset-block-start: calc(4.6rem');
    expect(toast.slice(0, 200)).toContain('inset-block-end: auto;');
  });

  it('T85/T90/T91: week detail panel clears the sticky bar; Today and +detail are 44 px; hours never wrap', () => {
    const time = read(`${sections}/TimeSection.svelte`);
    expect(time).toContain('data-testid="time-detail-panel" use:revealAboveActions');
    expect(time).toContain('function revealAboveActions(node: HTMLElement)');
    expect(time).toMatch(/\.this-week\s*\{[^}]*min-height: var\(--ja-target-min, 44px\);/);
    expect(time).toMatch(/\.detail-toggle\s*\{\s*min-height: var\(--ja-target-min, 44px\);/);
    expect(time).toMatch(/\.day-logged button\.link\.plain > strong\s*\{\s*flex: none;\s*white-space: nowrap;/);
  });

  it('T86: phone Projects folds filters for few projects; Home actions keep their names', () => {
    const projects = read(`${sections}/ProjectSection.svelte`);
    expect(projects).toContain('class="project-section__filters-fold"');
    expect(projects).toContain('open={!fewProjects || Boolean(search || statusFilter || clientFilter)}');
    const today = read(`${sections}/TodaySection.svelte`);
    expect(today).not.toMatch(/\.home-inbox-action-label\s*\{\s*display: none;/);
  });

  it('T87: the folded "Filter reports" card always takes a full row', () => {
    const report = read(`${sections}/ReportSection.svelte`);
    expect(report).toMatch(
      /\.report-register-filters :global\(\.register-filter-disclosure\)\s*\{\s*flex: 1 1 100%;/,
    );
  });

  it('T89/T90: the account menu is opaque; Show passwords is a real touch target', () => {
    const shell = read('apps/portal/src/styles/portal/shell.css');
    const menu = shell.slice(shell.indexOf('.account-menu {'));
    expect(menu.slice(0, menu.indexOf('}'))).toContain('background: #fff;');
    const password = read(`${sections}/ProfilePasswordCard.svelte`);
    expect(password).toMatch(/\.profile-password__reveal\s*\{\s*min-height: 44px;/);
    expect(password).toMatch(/\.profile-password__reveal input\s*\{[^}]*width: 1\.5rem;/);
  });
});
