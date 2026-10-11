import { describe, expect, it } from 'vitest';
import { localDraftKey } from '../../apps/portal/src/lib/portal/field-capture/local-draft.js';

describe('field capture local draft scope', () => {
  it('separates users, projects and days without ambiguous delimiters', () => {
    const key = localDraftKey('alice', 'project:a', '2026-10-11');
    expect(key).not.toBe(localDraftKey('bob', 'project:a', '2026-10-11'));
    expect(key).not.toBe(localDraftKey('alice', 'project:b', '2026-10-11'));
    expect(key).not.toBe(localDraftKey('alice', 'project:a', '2026-10-12'));
    expect(localDraftKey('a,b', 'c', 'd')).not.toBe(localDraftKey('a', 'b,c', 'd'));
  });
});
