import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantTaskUrl, navigateAssistantTask, revealAssistantTarget } from './navigate';
import type { AssistantTask } from './types';

vi.mock('svelte', () => ({ tick: async () => undefined }));

const task = {
  id: 'time-create',
  href: '/app/time',
  surface: 'time-create',
} as AssistantTask;
const current = new URL('https://app.example.test/portal/app/time?lang=pt');

afterEach(() => vi.unstubAllGlobals());

describe('assistant route construction', () => {
  it('adds the configured base once and preserves supported language', () => {
    const url = assistantTaskUrl(task, { base: '/portal/', url: current });
    expect(url?.pathname).toBe('/portal/app/time');
    expect(url?.searchParams.get('lang')).toBe('pt');
    expect(url?.searchParams.get('assistantSurface')).toBe('time-create');
    expect(url?.searchParams.get('assistantRequest')).toBeTruthy();
  });

  it.each([
    'https://evil.test/app/time',
    '//evil.test/app/time',
    '/app/../login',
    '/app/%2e%2e/login',
    '/app/time\\..\\login',
    '/app/time?/createTime',
    '/application/time',
  ])('rejects non-app or action routes: %s', (href) => {
    expect(assistantTaskUrl({ ...task, href }, { base: '', url: current })).toBeNull();
  });

  it('accepts an opaque selected record ID only within its authored template', () => {
    const recordTask = { ...task, surface: undefined, recordHref: '/app/time/{id}' };
    expect(
      assistantTaskUrl(recordTask, { base: '/portal', url: current, recordId: 'record_123-abc' })
        ?.pathname,
    ).toBe('/portal/app/time/record_123-abc');
    for (const recordId of ['../other', 'x/y', 'x%2fy', 'x?lang=es', ''])
      expect(assistantTaskUrl(recordTask, { base: '', url: current, recordId })).toBeNull();
  });

  it('rejects a mismatched surface and does not accept a base-prefixed route', () => {
    expect(
      assistantTaskUrl({ ...task, href: '/app/reports' }, { base: '', url: current }),
    ).toBeNull();
    expect(
      assistantTaskUrl({ ...task, href: '/portal/app/time' }, { base: '/portal', url: current }),
    ).toBeNull();
  });
});

describe('assistant navigation', () => {
  it('does not reveal an old form after a canceled same-route navigation', async () => {
    const querySelector = vi.fn();
    vi.stubGlobal('window', { location: { href: current.href } });
    vi.stubGlobal('document', { querySelector });
    expect(
      await navigateAssistantTask(task, {
        base: '/portal',
        url: current,
        goto: async () => undefined,
      }),
    ).toBe(false);
    expect(querySelector).not.toHaveBeenCalled();
  });

  it('does not reveal old targets after a redirected or rejected navigation', async () => {
    const querySelector = vi.fn();
    vi.stubGlobal('window', { location: { href: 'https://app.example.test/login' } });
    vi.stubGlobal('document', { querySelector });
    expect(
      await navigateAssistantTask(task, { base: '', url: current, goto: async () => undefined }),
    ).toBe(false);
    expect(
      await navigateAssistantTask(task, {
        base: '',
        url: current,
        goto: async () => {
          throw new Error('canceled');
        },
      }),
    ).toBe(false);
    expect(querySelector).not.toHaveBeenCalled();
  });

  it('reveals only the target after confirmed navigation', async () => {
    const field = {
      hasAttribute: () => true,
      matches: () => true,
      focus: vi.fn(),
      getClientRects: () => [{}],
      closest: () => null,
    };
    const target = {
      tagName: 'FORM',
      parentElement: null,
      scrollIntoView: vi.fn(),
      matches: () => false,
      querySelector: () => field,
      querySelectorAll: () => [field],
    };
    const location = { href: current.href };
    vi.stubGlobal('window', { location, matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('document', { querySelector: () => target });
    expect(
      await navigateAssistantTask(task, {
        base: '/portal',
        url: current,
        goto: async (href) => {
          location.href = new URL(href, current).href;
        },
      }),
    ).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(field.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('permits authored UI prerequisite changes after confirmed navigation', async () => {
    const field = {
      hasAttribute: () => true,
      matches: () => true,
      focus: vi.fn(),
      getClientRects: () => [{}],
      closest: () => null,
    };
    const target = {
      tagName: 'DETAILS',
      parentElement: null,
      open: false,
      scrollIntoView: vi.fn(),
      matches: () => false,
      querySelector: () => field,
      querySelectorAll: () => [field],
    };
    const location = { href: current.href };
    vi.stubGlobal('window', { location, matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('document', { querySelector: () => target });
    expect(
      await navigateAssistantTask(
        { ...task, href: '/app/billing', surface: 'invoice-create' },
        {
          base: '/portal',
          url: current,
          goto: async (href) => {
            const url = new URL(href, current);
            // Existing invoice UI leads to stream setup when no eligible stream exists.
            url.searchParams.set('view', 'setup');
            url.searchParams.set('setup', 'stream');
            location.href = url.href;
          },
        },
      ),
    ).toBe(true);
    expect(target.open).toBe(true);
    expect(field.focus).toHaveBeenCalledOnce();
  });

  it('opens all enclosing details and focuses a field without clicking buttons', () => {
    const outer = { tagName: 'DETAILS', open: false, parentElement: null };
    const inner = { tagName: 'DETAILS', open: false, parentElement: outer };
    const field = {
      hasAttribute: () => true,
      matches: () => true,
      focus: vi.fn(),
      click: vi.fn(),
      getClientRects: () => [{}],
      closest: () => null,
    };
    const target = {
      tagName: 'SECTION',
      parentElement: inner,
      matches: () => false,
      querySelector: () => field,
      querySelectorAll: () => [field],
      scrollIntoView: vi.fn(),
      click: vi.fn(),
    };
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    revealAssistantTarget(target as unknown as HTMLElement);
    expect(outer.open).toBe(true);
    expect(inner.open).toBe(true);
    expect(field.focus).toHaveBeenCalledOnce();
    expect(field.click).not.toHaveBeenCalled();
    expect(target.click).not.toHaveBeenCalled();
  });

  it('skips fields inside hidden or closed content when focusing a workspace target', () => {
    const hidden = { getClientRects: () => [], closest: () => null, focus: vi.fn() };
    const visible = {
      getClientRects: () => [{}],
      closest: () => null,
      hasAttribute: () => true,
      focus: vi.fn(),
    };
    const target = {
      tagName: 'SECTION',
      parentElement: null,
      matches: () => false,
      querySelectorAll: () => [hidden, visible],
      scrollIntoView: vi.fn(),
    };
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    revealAssistantTarget(target as unknown as HTMLElement);
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(visible.focus).toHaveBeenCalledOnce();
  });
});
