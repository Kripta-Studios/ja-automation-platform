import type { Page } from '@playwright/test';
import { portalCatalog } from '../../../apps/portal/src/lib/i18n/catalog';

/** Inspect rendered text and accessible controls, including options and tooltips. */
export async function visibleEnglishLeftovers(page: Page, locale: 'en' | 'es' | 'pt') {
  if (locale === 'en') return [];
  const english = [
    ...new Set(
      Object.entries(portalCatalog.en)
        .filter(
          ([key, value]) =>
            value.length > 1 &&
            portalCatalog[locale][key as keyof typeof portalCatalog.en] !== value,
        )
        .map(([, value]) => value.replace(/\s+/g, ' ').trim()),
    ),
  ];
  return page.evaluate((values) => {
    const known = new Set(values);
    const found = new Set<string>();
    const check = (value: string | null) => {
      const text = (value ?? '').replace(/\s+/g, ' ').trim();
      if (known.has(text)) found.add(text);
    };
    const visible = (element: Element) =>
      element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (
        parent &&
        !parent.closest('script,style,noscript,code,pre,textarea,option') &&
        visible(parent)
      )
        check(node.textContent);
    }
    for (const element of document.querySelectorAll(
      '[aria-label], [title], [placeholder], img[alt], select',
    )) {
      if (!visible(element)) continue;
      for (const attribute of ['aria-label', 'title', 'placeholder', 'alt'])
        check(element.getAttribute(attribute));
      if (element instanceof HTMLSelectElement)
        for (const option of element.options) check(option.textContent);
    }
    return [...found].sort();
  }, english);
}
