import { afterEach, describe, expect, it } from 'vitest';
import { isSafeStorageKey } from '../../packages/database/src/core/storage-key.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  readSource,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const originalEnvironment = {
  node: process.env.NODE_ENV,
  required: process.env.JA_MALWARE_SCANNER_REQUIRED,
  url: process.env.JA_MALWARE_SCANNER_URL,
};

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  if (originalEnvironment.node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.node;
  if (originalEnvironment.required === undefined) delete process.env.JA_MALWARE_SCANNER_REQUIRED;
  else process.env.JA_MALWARE_SCANNER_REQUIRED = originalEnvironment.required;
  if (originalEnvironment.url === undefined) delete process.env.JA_MALWARE_SCANNER_URL;
  else process.env.JA_MALWARE_SCANNER_URL = originalEnvironment.url;
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function method(target: object, name: string): unknown {
  return (target as Record<string, unknown>)[name];
}

describe('B5 upload reservation and storage boundary (RED characterization)', () => {
  it.each([
    ['expense action', 'apps/portal/src/lib/server/actions/expense-actions.ts'],
    ['private-document action', 'apps/portal/src/lib/server/actions/document-actions.ts'],
    ['offline attachment route', 'apps/portal/src/routes/app/api/sync/attachment/+server.ts'],
  ])('%s authorizes/reserves before any filesystem write', (_label, path) => {
    const source = readSource(path);
    const reservationAt = Math.min(
      ...['reserveUpload', 'reserveAttachment']
        .map((token) => source.indexOf(token))
        .filter((index) => index >= 0),
    );
    const writeAt = Math.min(
      ...['writeFile(', 'writeFile(', 'mkdir(']
        .map((token) => source.indexOf(token))
        .filter((index) => index >= 0),
    );
    expect(reservationAt, `${path} must call the reservation service`).toBeGreaterThanOrEqual(0);
    expect(writeAt, `${path} must stream only after reservation`).toBeGreaterThanOrEqual(0);
    expect(reservationAt, `${path} must reserve before filesystem writes`).toBeLessThan(writeAt);
  });

  it('exposes reserve/finalize upload methods with server-owned metadata', () => {
    const value = fixture();
    expect(typeof method(value.repository, 'reserveUpload'), 'reserveUpload is required').toBe(
      'function',
    );
    expect(typeof method(value.repository, 'finalizeUpload'), 'finalizeUpload is required').toBe(
      'function',
    );
  });

  it('rejects drive-qualified, URI-scheme and encoded traversal storage keys', () => {
    expect(isSafeStorageKey('C:/private/secret.pdf')).toBe(false);
    expect(isSafeStorageKey('https://example.test/private/secret.pdf')).toBe(false);
    expect(isSafeStorageKey('reports/%2e%2e/secret.pdf')).toBe(false);
  });

  it('requires a reservation-scoped server-owned final key rather than browser metadata', () => {
    const source = readSource('packages/database/src/v3-repository.ts');
    expect(source).toMatch(/finalizeUpload/);
    expect(source).toMatch(/reservationId/);
    expect(source).not.toMatch(/storageKey:\s*string/);
  });

  it('keeps production documents quarantined when the scanner is absent', () => {
    process.env.NODE_ENV = 'production';
    process.env.JA_MALWARE_SCANNER_REQUIRED = 'true';
    delete process.env.JA_MALWARE_SCANNER_URL;
    const value = fixture();
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: 'b'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/b5-scan.pdf',
      originalFilename: 'b5-scan.pdf',
      artifactType: 'report',
    });
    const row = value.sqlite
      .prepare('SELECT state,scan_status FROM document WHERE id=?')
      .get(document.id) as { state: string; scan_status: string };
    expect(row).toEqual({ state: 'quarantined', scan_status: 'pending' });
  });

  it('does not allow a human Owner-shaped principal to assert a clean scan', () => {
    process.env.NODE_ENV = 'production';
    const value = fixture();
    const document = value.repository.registerPrivateDocument(value.owner, {
      projectId: value.project.id,
      sha256: 'c'.repeat(64),
      mediaType: 'application/pdf',
      byteLength: 5,
      storageKey: 'reports/b5-human-scan.pdf',
      originalFilename: 'b5-human-scan.pdf',
      artifactType: 'report',
    });
    expect(() =>
      value.v3.recordDocumentScan(
        { ...value.owner, isServiceActor: true },
        document.id,
        'clean',
        'human-claimed-scanner',
      ),
    ).toThrow();
  });

  it('rejects the compatibility ZIP media alias and requires exact canonical media', () => {
    const source = readSource('apps/portal/src/lib/server/actions/document-actions.ts');
    expect(source).not.toContain('application/x-zip-compressed');
    expect(source).toContain("'application/zip'");
  });
});
