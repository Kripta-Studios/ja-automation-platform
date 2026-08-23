import { describe, expect, it } from 'vitest';
import { readSource } from '../fixtures/b5-lifecycle-security-fixture.js';

describe('B5 HTTP hardening (RED characterization)', () => {
  it('validates Referer by parsed origin rather than prefix matching', () => {
    const source = readSource('apps/portal/src/hooks.server.ts');
    expect(source).not.toContain('referer.startsWith(event.url.origin)');
    expect(source).toMatch(/new URL\([^)]*referer/);
  });

  it('uses a serialized/atomic authentication throttling mutation', () => {
    const source = readSource('apps/portal/src/hooks.server.ts');
    expect(
      /BEGIN IMMEDIATE|UPDATE[\s\S]+RETURNING|INSERT[\s\S]+ON CONFLICT[\s\S]+request_count=request_count\+1/.test(
        source,
      ),
      'rate limiting must not be a SELECT-then-UPDATE TOCTOU sequence',
    ).toBe(true);
  });

  it('keeps detailed portal health behind an explicit operator role check', () => {
    const source = readSource('apps/portal/src/routes/app/api/health/+server.ts');
    expect(source).toMatch(/owner_admin|auditor_read_only/);
    expect(source).toMatch(/scanner|pdf|job|storage/i);
  });

  it('does not let a human HTTP request finalize a document scan', () => {
    const source = readSource('apps/portal/src/routes/app/api/documents/[id]/scan/+server.ts');
    expect(source).toMatch(/service-only|scanner service/i);
    expect(source).not.toContain('recordDocumentScan(');
  });
});
