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
});
