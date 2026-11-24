import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

/** Source-level guards for 2026-11-22 audit G2 UI fixes (browser evidence in the fix report). */
describe('audit G2 form UI regressions', () => {
  it('T23: a fixed decimal-hours field clears its validity while typing, not on blur', () => {
    const input = read('apps/portal/src/lib/portal/ui/DecimalHoursInput.svelte');
    const changed = input.slice(input.indexOf('function changed('));
    expect(changed.slice(0, changed.indexOf('\n  }\n'))).toContain('setCustomValidity(');
    const validation = read('apps/portal/src/lib/portal/ui/form-validation.ts');
    const onEdit = validation.slice(validation.indexOf('const onEdit ='));
    expect(onEdit.slice(0, onEdit.indexOf('const onReset'))).toContain('requestAnimationFrame(');
    const report = read('apps/portal/src/lib/portal/sections/ReportSection.svelte');
    expect(report).toContain('Enter downtime between 0 and 24 hours, for example 1.5.');
  });

  it("T57: the approval report preview carries the worker's problems / open items", () => {
    const queue = read('apps/portal/src/lib/server/approval-queue.ts');
    expect(queue).toContain('open_items open_items');
    const section = read('apps/portal/src/lib/portal/sections/ApprovalSection.svelte');
    expect(section).toContain("open_items: 'reportOpenItems'");
    // Reports are never invoiced: no 'approved, not invoiced' link on the reports tab.
    expect(section).toContain("{#if !approvedView && activeTab !== 'reports'}");
  });

  it('T57: Needs attention counts daily and technical reports and opens the list that has them', () => {
    const report = read('apps/portal/src/lib/portal/sections/ReportSection.svelte');
    expect(report).toContain(
      'const pendingReportCount = $derived(pendingDailyCount + pendingTechnicalCount);',
    );
    expect(report).toContain("registerHref({ view: attentionTab, status: 'attention' })");
  });

  it('T57: one problems field on the quick daily sheet; a failed photo is named', () => {
    const report = read('apps/portal/src/lib/portal/sections/ReportSection.svelte');
    const quick = report.slice(report.indexOf('<details class="quick-more">'));
    expect(quick.slice(0, quick.indexOf('</details>'))).not.toContain('name="problemsFound"');
    expect(report).toContain("q('photoFailedNamed'");
  });

  it('T57: a validation problem with fields on the form is not repeated in a recovery card', () => {
    const report = read('apps/portal/src/lib/portal/sections/ReportSection.svelte');
    expect(report).toContain('{#if surfaceProblem && surfaceProblemInline}');
  });

  it('T54: Add several rows start without a category and the unread hint clears once typed', () => {
    const expense = read('apps/portal/src/lib/portal/sections/ExpenseSection.svelte');
    const blank = expense.slice(expense.indexOf('const blankRow = '));
    expect(blank.slice(0, blank.indexOf('});'))).toContain("category: '',");
    expect(expense).toContain('{:else if row.unread && !row.amount.trim()}');
  });

  it('T24: work capture starts on today and the only assignment when nothing is saved', () => {
    const capture = read('apps/portal/src/routes/app/workflow/capture/+page.svelte');
    expect(capture).toContain('if (!workDate) workDate = localToday();');
    expect(capture).toContain('data.projects.length === 1');
  });
});
