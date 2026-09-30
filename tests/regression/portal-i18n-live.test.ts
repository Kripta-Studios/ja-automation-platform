import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isPortalLiveText, translatePortalDom } from '../../apps/portal/src/lib/portal-i18n';

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

  it('preserves live accessible labels across ES/PT changes while static attributes still translate', () => {
    class ElementStub {
      attributes = new Map<string, string>();
      children: ElementStub[] = [];
      constructor(private live = false) {}
      closest(selector: string) {
        return this.live && selector === '[data-portal-live-text]' ? this : null;
      }
      getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
      }
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }
      querySelectorAll() {
        return this.children;
      }
    }
    const root = new ElementStub();
    const liveClose = new ElementStub(true);
    const defaultClose = new ElementStub();
    liveClose.setAttribute('aria-label', 'Cerrar');
    defaultClose.setAttribute('aria-label', 'Close');
    root.children = [liveClose, defaultClose];
    vi.stubGlobal('Element', ElementStub);
    vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 });
    vi.stubGlobal('document', { createTreeWalker: () => ({ nextNode: () => null }) });
    try {
      translatePortalDom(root as unknown as Element, 'es');
      expect(liveClose.getAttribute('aria-label')).toBe('Cerrar');
      expect(defaultClose.getAttribute('aria-label')).toBe('Cerrar');
      // Svelte updates its localized prop; the static translator must not
      // restore an earlier translated accessible name from its WeakMap.
      liveClose.setAttribute('aria-label', 'Fechar');
      translatePortalDom(root as unknown as Element, 'pt');
      expect(liveClose.getAttribute('aria-label')).toBe('Fechar');
      expect(defaultClose.getAttribute('aria-label')).toBe('Fechar');
      liveClose.setAttribute('aria-label', 'Close');
      translatePortalDom(root as unknown as Element, 'en');
      expect(liveClose.getAttribute('aria-label')).toBe('Close');
      expect(defaultClose.getAttribute('aria-label')).toBe('Close');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
