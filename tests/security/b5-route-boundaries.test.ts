import { describe, expect, it } from 'vitest';
import { readSource } from '../fixtures/b5-lifecycle-security-fixture.js';

describe('B5 route/action ownership boundaries (RED characterization)', () => {
  it('maps the reviewed lifecycle/autosave action names exactly once', () => {
    const source = readSource('apps/portal/src/routes/app/[section]/section-actions.ts');
    for (const action of [
      'autosaveReport',
      'updateClient',
      'transitionClient',
      'updateProject',
      'transitionProject',
      'deleteDraft',
      'createCorrectionDraft',
    ]) {
      const matches = source.match(new RegExp(`\\b${action}\\b`, 'g')) ?? [];
      expect(matches.length, `${action} must be mapped exactly once`).toBe(1);
    }
    expect(source).not.toMatch(/\bdeleteReport\s*:/);
  });

  it('keeps report autosave implementation in the operations action registry', () => {
    const source = readSource('apps/portal/src/lib/server/actions/operations-actions.ts');
    expect(source).toMatch(/\bautosaveReport\b/);
    expect(source).toContain('reports');
  });
});
