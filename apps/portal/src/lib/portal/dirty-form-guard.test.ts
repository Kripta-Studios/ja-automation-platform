import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('B5 dirty-form guard (RED characterization)', () => {
  it('has one shared dirty-form implementation rather than page-local ad hoc prompts', () => {
    const implementation = resolve(
      process.cwd(),
      'apps/portal/src/lib/portal/dirty-form-guard.ts',
    );
    expect(existsSync(implementation)).toBe(true);
    if (!existsSync(implementation)) return;
    const source = readFileSync(implementation, 'utf8');
    expect(source).toMatch(/beforeunload/);
    expect(source).toMatch(/dirty/i);
    expect(source).toMatch(/destroy|cleanup/i);
  });

  it('wires the shared guard to the long report edit form', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/routes/app/reports/[id]/+page.svelte'),
      'utf8',
    );
    expect(source).toMatch(/dirty-form-guard|dirtyFormGuard/);
  });
});
