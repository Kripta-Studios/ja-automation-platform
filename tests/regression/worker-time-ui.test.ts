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

  it('keeps the list and status context ahead of the one primary Log time CTA', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(source.indexOf('class="time-status-strip"')).toBeGreaterThan(-1);
    expect(source.indexOf('class="time-filters"')).toBeGreaterThan(-1);
    expect(source.indexOf('class="time-record-list"')).toBeLessThan(
      source.indexOf('data-time-primary-cta'),
    );
    expect((source.match(/data-time-primary-cta/g) ?? []).length).toBe(1);
  });

  it('keeps Worker entry operational and derives conditional detail from category', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');

    expect(source).toContain("{ value: 'regular', label: 'Work' }");
    expect(source).toContain("{ value: 'overtime', label: 'Overtime' }");
    expect(source).toContain("{ value: 'travel', label: 'Travel' }");
    expect(source).toContain("{ value: 'standby', label: 'Standby' }");
    expect(source).toContain("{ value: 'commissioning', label: 'Commissioning' }");
    expect(source).toContain('Travel operational detail');
    expect(source).toContain('Standby reason');
    expect(source).toContain("activeCategory === 'travel'");
    expect(source).toContain("activeCategory === 'standby'");
    expect(source).toContain('name="activityCode"');
    expect(source).toContain('data-entity-id={String(editRow.id)}');
    expect(source).toContain('data-version={String(editRow.version)}');
    expect(source).toContain('const filterCategories = [...primaryCategories, ...moreCategories]');
    expect(source).toContain('bind:value={createCategory}');
    expect(source).toContain('bind:value={editCategory}');
    expect(source).not.toMatch(/name="(?:clientRate|tax|markup|multiplier|billable)"/i);
  });

  it('uses the stable ResponsiveSheet and preserves the configured-target truth', () => {
    const time = readSource('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    const timesheet = readSource('apps/portal/src/lib/portal/sections/TimesheetPanel.svelte');

    expect(time).toContain('<ResponsiveSheet');
    expect(time).toContain('data-time-entry-surface');
    expect(timesheet).not.toContain('Expected availability is 10 hours');
    expect(timesheet).toContain('Planning target only; it never creates time.');
    expect(timesheet).toContain('day.expectedMinutes');
    expect(timesheet).toContain(
      'Copies projects, categories and activity labels into zero-minute drafts',
    );
  });
});
