import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSessionItem,
  removeSessionItem,
  saveSessionItem,
} from '$lib/portal/ui/safe-session-storage';

afterEach(() => vi.unstubAllGlobals());

describe('optional session storage', () => {
  it('keeps forms usable when the browser blocks storage access', () => {
    vi.stubGlobal('window', {
      get sessionStorage() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });

    expect(readSessionItem('draft')).toBeNull();
    expect(() => saveSessionItem('draft', 'value')).not.toThrow();
    expect(() => removeSessionItem('draft')).not.toThrow();
  });

  it('keeps forms usable when storage runs out of space', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => 'saved',
        setItem: () => {
          throw new DOMException('Storage full', 'QuotaExceededError');
        },
        removeItem: () => undefined,
      },
    });

    expect(readSessionItem('draft')).toBe('saved');
    expect(() => saveSessionItem('draft', 'new value')).not.toThrow();
    expect(() => removeSessionItem('draft')).not.toThrow();
  });
});
