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
  // times, meal expense, calendar and per-day forms were removed.
  it('is one week timesheet with one save and one submit action', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source).toContain('action="?/saveTimeWeek"');
    expect((source.match(/action="\?\//g) ?? []).length).toBe(1);
    expect((source.match(/data-testid="time-week-submit"/g) ?? []).length).toBe(1);
    expect(source).toContain('data-testid="time-week-confirm"');
    expect(source).not.toMatch(/name="summary"|name="startTime"|name="withExpense"/u);
    expect(source).not.toContain('Activity summary');
  });

  it('keeps Worker entry operational and never asks for commercial treatment', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source).toContain("const quickCategories = ['regular', 'travel', 'overtime'] as const;");
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
});
