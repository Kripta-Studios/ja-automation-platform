import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'apps/portal/src');

const read = (path: string): string => readFileSync(resolve(sourceRoot, path), 'utf8');

describe('Client Essential reports UI', () => {
  it('organizes Reports into three accessible first-level tabs', () => {
    const source = read('lib/portal/sections/ReportSection.svelte');

    expect(source).toContain("{ id: 'daily', label: 'Daily' }");
    expect(source).toContain("{ id: 'technical', label: 'Technical / PLC' }");
    expect(source).toContain("{ id: 'signoff', label: 'Client Sign-off' }");
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('aria-selected={activeTab === tab.id}');
    expect(source).toContain('onkeydown={(event) => handleTabKey(event, tab.id)}');
    expect(source).toMatch(/ArrowRight|ArrowLeft/);
  });

  it('keeps each field register ahead of its single primary create action', () => {
    const source = read('lib/portal/sections/ReportSection.svelte');
    const dailyList = source.indexOf('data-report-tab="daily"');
    const technicalList = source.indexOf('data-report-tab="technical"');
    const primaryIndices = [...source.matchAll(/data-report-primary-cta/g)].map(
      (match) => match.index ?? -1,
    );

    expect(dailyList).toBeGreaterThanOrEqual(0);
    expect(technicalList).toBeGreaterThan(dailyList);
    expect(primaryIndices).toHaveLength(2);
    expect(primaryIndices[0]).toBeGreaterThan(dailyList);
    expect(primaryIndices[1]).toBeGreaterThan(technicalList);
    expect(source).toContain('data-report-generator-cta');
  });

  it('places Daily and Technical forms in the existing responsive sheet', () => {
    const source = read('lib/portal/sections/ReportSection.svelte');
    const responsive = read('styles/portal/responsive.css');
    const primitives = read('styles/portal/primitives.css');

    expect(source.indexOf('<ResponsiveSheet')).toBeLessThan(
      source.indexOf('data-report-entry-surface="daily"'),
    );
    expect(source.indexOf('<ResponsiveSheet')).toBeLessThan(
      source.indexOf('data-report-entry-surface="technical"'),
    );
    expect(source).toContain('action="?/createDailyReport"');
    expect(source).toContain('action="?/createTechnicalReport"');
    expect(source).toContain("saveOfflineDraft(event, 'daily_report')");
    expect(source).toContain("saveOfflineDraft(event, 'technical_report')");
    expect(source).toContain('class="report-entry-sheet"');
    expect(responsive).toContain('.report-entry-sheet');
    expect(responsive).toContain('max-height: 100svh');
    expect(responsive).toContain('@media (prefers-reduced-motion: reduce)');
    expect(primitives).toContain('.report-entry-form');
    expect(primitives).not.toMatch(/transition\s*:\s*all/);
  });

  it('keeps Client Sign-off operational and exposes explicit text plus shape states', () => {
    const source = read('lib/portal/sections/ReportSection.svelte');
    const start = source.indexOf('data-report-tab="signoff"');
    const end = source.indexOf('{#if canGeneratePeriodReports}', start);
    const signoff = source.slice(start, end < 0 ? source.length : end);

    expect(signoff).toContain('customerPeriodReports');
    expect(source).toContain('Needs report');
    expect(source).toContain('Ready for signature');
    expect(source).toContain('Signed');
    expect(source).toContain('Invalid / superseded');
    expect(signoff).toContain('report-signoff-symbol');
    expect(source).toContain('conformity_state');
    expect(signoff).not.toMatch(
      /money|invoice|margin|tax|internal|commercial|client rate|internal cost/i,
    );
  });

  it('keeps period generation behind the Finance/Owner role gate', () => {
    const source = read('lib/portal/sections/ReportSection.svelte');

    expect(source).toContain(
      "['owner_admin', 'finance_admin'].includes(String(data.user.role ?? ''))",
    );
    expect(source).toContain("surface === 'generate' && canGeneratePeriodReports");
    expect(source).toContain('action="?/generatePeriodReports"');
    expect(source).toContain('Finance / Owner action');
  });
});
