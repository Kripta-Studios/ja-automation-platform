import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Worker time UI vertical slice', () => {
  it('extracts the time route into the contextual section surface', () => {
    const shell = readSource('apps/portal/src/lib/PortalShell.svelte');
    const timeBranchStart = shell.indexOf("{:else if data.section === 'time'}");
    const expensesBranchStart = shell.indexOf("{:else if data.section === 'expenses'}");
    const timeBranch = shell.slice(timeBranchStart, expensesBranchStart);

    expect(timeBranch).toContain('<TimeSection');
    expect(timeBranch).not.toContain('worker-form');
    expect(timeBranch).not.toContain('action="?/createTime"');
  });

  // Owner decision 2026-11-16: Log hours is one week timesheet with a single
  // Save and a single "Submit week for approval"; the activity summary, start/end
  // times, meal expense, calendar and per-day forms were removed. 2026-11-17:
  // start/end/break/note came back only as an optional collapsed "+ detail"
  // sent inside the week cells (no separate form fields).
  it('is one week timesheet with one save and one submit action', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source).toContain('action="?/saveTimeWeek"');
    // Owner decision 2026-11-17: plus one optional "signed activity sheet" upload,
    // and (audit T38) removing a sheet attached by mistake to an unsent week.
    expect([...source.matchAll(/action="\?\/(\w+)"/g)].map((match) => match[1])).toEqual([
      'saveTimeWeek',
      'removeWeekSheet',
      'attachWeekSheet',
    ]);
    expect((source.match(/data-testid="time-week-submit"/g) ?? []).length).toBe(1);
    expect(source).toContain('data-testid="time-week-confirm"');
    expect(source).not.toMatch(/name="summary"|name="startTime"|name="withExpense"/u);
    expect(source).not.toContain('Activity summary');
  });

  it('keeps Worker entry operational and never asks for commercial treatment', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    const categories = readSource('apps/portal/src/lib/portal/time-categories.ts');
    // Owner bug C10 (2026-11-19): all four types inline, no "More types" for a single option.
    expect(source).toContain('const dayCategoryChoices: readonly string[] = captureTimeCategories;');
    expect(source).not.toContain('time-more-types');
    expect(categories).toContain("export const quickTimeCategories = ['regular', 'travel', 'overtime'] as const;");
    expect(source).not.toMatch(/name="(?:clientRate|tax|markup|multiplier|billable)"/i);
  });

  it('shows read-only reviewed cells and the reviewer note for returned time', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source).toContain("else kind = 'locked';");
    expect(source).toContain("kind = 'fix'");
    expect(source).toContain('entry.review_reason');
    expect(source).toContain('data-testid="time-needs-changes"');
  });

  it('stacks days vertically on phones', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source).toContain('data-testid="time-week-days"');
    expect(source).toMatch(/@media \(max-width: 760px\)[\s\S]*\.sheet-table-wrap \{\s*display: none;/u);
  });

  it('separates capture (one day / whole week) from the review overview', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    const overview = readSource('apps/portal/src/lib/portal/sections/TimeOverview.svelte');
    const load = readSource('apps/portal/src/routes/app/[section]/section-load.ts');
    expect(source).toContain('data-testid="time-mode-day"');
    expect(source).toContain('data-testid="time-mode-week"');
    expect(source).toContain('{#if data.canReviewTime && !isAuditor}');
    expect(source).not.toContain('time-history');
    expect(overview).toContain('data-testid="ov-matrix"');
    // Review rows are operational only: no money or rate fields reach the overview.
    expect(load).toMatch(/const canReview = \['owner_admin', 'project_manager', 'finance_admin', 'auditor_read_only'\]/u);
    expect(overview).not.toMatch(/rate|amount_minor|compensation|cost/iu);
  });
});
