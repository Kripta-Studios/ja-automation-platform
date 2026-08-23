import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('report autosave implementation contract', () => {
  it('keeps the autosave action in the section action registry', () => {
    const source = readSource('apps/portal/src/routes/app/[section]/section-actions.ts');
    expect(source.match(/\bautosaveReport\b/g) ?? []).toHaveLength(1);
    expect(source).toContain("['autosave' + 'Report']");
  });

  it('guards autosave by editable lifecycle state and optimistic version', () => {
    const source = readSource('apps/portal/src/lib/server/actions/operations-actions.ts');
    expect(source).toContain('report_not_editable');
    expect(source).toContain("state !== 'draft' && state !== 'needs_changes'");
    expect(source).toContain('updateDailyReport');
    expect(source).toContain('updateTechnicalReport');
  });

  it('exposes accessible recovery controls on the editable report form', () => {
    const source = readSource('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    for (const selector of [
      'data-report-autosave-form',
      'data-report-type',
      'data-report-id',
      'data-autosave-status',
      'data-recovery-dialog',
      'data-recover-draft',
      'data-compare-draft',
      'data-discard-draft',
      '/j-aautomation/app/reports?/autosaveReport',
    ])
      expect(source).toContain(selector);
  });

  it('partitions recovery drafts by authenticated user and report identity', () => {
    const source = readSource('apps/portal/src/lib/portal/report-autosave.ts');
    expect(source).toContain('encodeURIComponent(userId)');
    expect(source).toContain('encodeURIComponent(reportId)');
    expect(source).toContain('ja-report-autosave');
  });
});
