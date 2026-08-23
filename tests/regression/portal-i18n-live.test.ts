import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPortalLiveText } from '../../apps/portal/src/lib/portal-i18n';

describe('portal live-title translation boundary', () => {
  it('recognises dynamic text below the live-text opt-out marker', () => {
    const dynamicParent = {
      closest: (selector: string): object | null =>
        selector === '[data-portal-live-text]' ? dynamicParent : null,
    } as unknown as HTMLElement;
    const staticParent = {
      closest: (): null => null,
    } as unknown as HTMLElement;

    expect(isPortalLiveText({ parentElement: dynamicParent } as unknown as Text)).toBe(true);
    expect(isPortalLiveText({ parentElement: staticParent } as unknown as Text)).toBe(false);
  });

  it('marks the shell heading so route/view changes stay owned by Svelte', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/lib/PortalShell.svelte'),
      'utf8',
    );
    expect(source).toMatch(/<h1\s+data-portal-live-text>\{translate\(currentTitle\)\}<\/h1>/);
  });
});
