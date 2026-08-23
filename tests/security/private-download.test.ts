import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('B5 private download boundary', () => {
  it('keeps repository object-scope authorization non-disclosing', () => {
    const value = fixture();
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: 'd'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/b5-private.pdf',
      originalFilename: 'b5-private.pdf',
      artifactType: 'report',
      artifactClassification: 'standard',
      sensitivity: 'customer_private',
    });
    expect(() => value.v3.authorizeDocument(value.outsider, document.id)).toThrow();
  });

  it('provides the one server-owned private document download route', () => {
    expect(
      existsSync(
        resolve(process.cwd(), 'apps/portal/src/routes/app/api/documents/[id]/+server.ts'),
      ),
    ).toBe(true);
  });
});
