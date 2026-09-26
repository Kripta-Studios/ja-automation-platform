import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const sectionPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/AccountingSection.svelte',
);
const rowPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte',
);

describe('Accounting Pack row recovery wiring', () => {
  it.each([sectionPath, rowPath])('compiles %s for the client', (filename) => {
    expect(() =>
      compile(readFileSync(filename, 'utf8'), { filename, generate: 'client' }),
    ).not.toThrow();
  });

  it('captures both row forms and retains the create viewport in submitted formdata', () => {
    const section = readFileSync(sectionPath, 'utf8');
    const row = readFileSync(rowPath, 'utf8');
    expect(row).toMatch(/action="\?\/createAccountingPack"[^>]*use:rememberPackScroll/u);
    expect(row).toMatch(/action="\?\/finalizeAccountingPack" use:rememberPackScroll/u);
    expect(row).toContain('data-pack-id={String(pack.id)}');
    expect(row.match(/name="viewportScrollY"/gu)).toHaveLength(2);
    expect(section).toContain("event.formData.set('viewportScrollY', String(viewport))");
    expect(section).toContain("form.addEventListener('formdata', captureFormData)");
    expect(section).toContain('if (!sessionStorage.getItem(packScrollKey())) remember(capture())');
  });

  it('restores matching create and finalize failures without overriding later user scroll', () => {
    const section = readFileSync(sectionPath, 'utf8');
    expect(section).toContain('const problem = createPackProblem ?? finalizePackProblem');
    expect(section).toContain('snapshot.operation === operation');
    expect(section).toContain('snapshot.packId === packId');
    expect(section).toContain('focusId={packRecoveryFocusId}');
    expect(section).toContain('Date.now() - snapshot.at < 300_000');
    expect(section).toContain('!packScrollIntent');
    expect(section).toContain('new ResizeObserver');
    expect(section).toContain('observer?.disconnect(), 1_500');
    expect(section).toContain('overflow-anchor: none');
  });
});
