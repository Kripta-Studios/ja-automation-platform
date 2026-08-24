import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('B5 report autosave contract (RED characterization)', () => {
  it('exposes the six frozen autosave/recovery selectors on the report edit surface', () => {
    const source = readSource('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    for (const selector of [
      'data-report-autosave-form',
      'data-autosave-status',
      'data-recovery-dialog',
      'data-recover-draft',
      'data-compare-draft',
      'data-discard-draft',
    ]) {
      expect(source, `${selector} is required by the B5/B10 handoff`).toContain(selector);
    }
  });

  it('uses the one absolute autosave action contract', () => {
    const page = readSource('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    const actions = readSource('apps/portal/src/lib/server/actions/operations-actions.ts');
    expect(page).toContain('/j-aautomation/app/reports?/autosaveReport');
    expect(actions).toMatch(/autosaveReport/);
  });
});
