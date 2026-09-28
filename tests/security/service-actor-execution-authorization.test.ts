import { describe, expect, it } from 'vitest';
import { canonicalJobJson, jobPayloadHash } from '@ja/database';

describe('service actor job contract', () => {
  it('canonicalizes payloads and hashes the canonical representation', () => {
    const left = canonicalJobJson({ b: 2, a: ['x', true] });
    const right = canonicalJobJson({ a: ['x', true], b: 2 });
    expect(left).toBe('{"a":["x",true],"b":2}');
    expect(jobPayloadHash('{"b":2,"a":["x",true]}')).toBe(jobPayloadHash(right));
  });
});
