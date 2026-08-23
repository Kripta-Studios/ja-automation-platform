import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const originalEnvironment = {
  node: process.env.NODE_ENV,
  required: process.env.JA_MALWARE_SCANNER_REQUIRED,
  provider: process.env.JA_MALWARE_SCANNER_PROVIDER,
};

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  if (originalEnvironment.node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.node;
  if (originalEnvironment.required === undefined) delete process.env.JA_MALWARE_SCANNER_REQUIRED;
  else process.env.JA_MALWARE_SCANNER_REQUIRED = originalEnvironment.required;
  if (originalEnvironment.provider === undefined) delete process.env.JA_MALWARE_SCANNER_PROVIDER;
  else process.env.JA_MALWARE_SCANNER_PROVIDER = originalEnvironment.provider;
});

function fixture(): B5LifecycleSecurityFixture {
  process.env.NODE_ENV = 'production';
  process.env.JA_MALWARE_SCANNER_REQUIRED = 'true';
  process.env.JA_MALWARE_SCANNER_PROVIDER = 'test-scanner';
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function quarantinedDocument(value: B5LifecycleSecurityFixture, suffix: string) {
  return value.repository.registerPrivateDocument(value.owner, {
    projectId: value.project.id,
    sha256: suffix.repeat(64),
    mediaType: 'application/pdf',
    byteLength: 5,
    storageKey: `reports/scan-${suffix}.pdf`,
    originalFilename: `scan-${suffix}.pdf`,
    artifactType: 'report',
    artifactClassification: 'standard',
    sensitivity: 'customer_private',
  });
}

function servicePrincipal(value: B5LifecycleSecurityFixture): Principal {
  return { ...value.owner, isServiceActor: true };
}

describe('document scan durable execution fencing', () => {
  it('rejects a forged service-actor boolean without a B5 running execution', () => {
    const value = fixture();
    const document = quarantinedDocument(value, 'a');

    expect(() =>
      value.v3.recordDocumentScan(
        servicePrincipal(value),
        document.id,
        'clean',
        'test-scanner',
        undefined as never,
      ),
    ).toThrow(/execution proof/i);
    expect(
      value.sqlite.prepare('SELECT state,scan_status FROM document WHERE id=?').get(document.id),
    ).toEqual({ state: 'quarantined', scan_status: 'pending' });
  });

  it('accepts the active document.scan job/run and releases a clean document', () => {
    const value = fixture();
    const document = quarantinedDocument(value, 'b');
    const principal = servicePrincipal(value);

    expect(
      value.v3.runDueJobs(1, {
        document_scan: (payload, execution) => {
          value.v3.recordDocumentScan(
            principal,
            (payload as { documentId: string }).documentId,
            'clean',
            'test-scanner',
            execution,
          );
          value.v3.recordDocumentScan(
            principal,
            (payload as { documentId: string }).documentId,
            'clean',
            'test-scanner',
            execution,
          );
        },
      }),
    ).toEqual({ processed: 1, failed: 0, overdueMarked: 0 });
    expect(value.v3.authorizeDocument(value.owner, document.id)).toEqual(
      expect.objectContaining({ sha256: 'b'.repeat(64), byteLength: 5 }),
    );
    const audit = value.sqlite
      .prepare("SELECT metadata_json FROM audit_event WHERE action='document.scan' AND entity_id=?")
      .get(document.id) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json)).toEqual(
      expect.objectContaining({
        result: 'clean',
        provider: 'test-scanner',
        serviceCapability: 'document.scan',
      }),
    );
    expect(
      value.sqlite
        .prepare(
          "SELECT count(*) count FROM audit_event WHERE action='document.scan' AND entity_id=?",
        )
        .get(document.id),
    ).toEqual({ count: 1 });
  });

  it('rejects a wrong fence and leaves the document quarantined', () => {
    const value = fixture();
    const document = quarantinedDocument(value, 'c');
    const principal = servicePrincipal(value);

    expect(
      value.v3.runDueJobs(1, {
        document_scan: (payload, execution) =>
          value.v3.recordDocumentScan(
            principal,
            (payload as { documentId: string }).documentId,
            'clean',
            'test-scanner',
            { ...execution, fenceVersion: execution.fenceVersion + 1 },
          ),
      }),
    ).toEqual({ processed: 0, failed: 1, overdueMarked: 0 });
    expect(
      value.sqlite.prepare('SELECT state,scan_status FROM document WHERE id=?').get(document.id),
    ).toEqual({ state: 'quarantined', scan_status: 'pending' });
  });

  it('rejects a wrong capability and an unconfigured provider', () => {
    const wrongCapability = fixture();
    const capabilityDocument = quarantinedDocument(wrongCapability, 'd');
    expect(
      wrongCapability.v3.runDueJobs(1, {
        document_scan: (payload, execution) =>
          wrongCapability.v3.recordDocumentScan(
            servicePrincipal(wrongCapability),
            (payload as { documentId: string }).documentId,
            'clean',
            'test-scanner',
            { ...execution, requiredCapability: 'artifact.invoice.render' },
          ),
      }),
    ).toEqual({ processed: 0, failed: 1, overdueMarked: 0 });
    expect(
      wrongCapability.sqlite
        .prepare('SELECT state,scan_status FROM document WHERE id=?')
        .get(capabilityDocument.id),
    ).toEqual({ state: 'quarantined', scan_status: 'pending' });

    const wrongProvider = fixture();
    const providerDocument = quarantinedDocument(wrongProvider, 'e');
    expect(
      wrongProvider.v3.runDueJobs(1, {
        document_scan: (payload, execution) =>
          wrongProvider.v3.recordDocumentScan(
            servicePrincipal(wrongProvider),
            (payload as { documentId: string }).documentId,
            'clean',
            'unconfigured-scanner',
            execution,
          ),
      }),
    ).toEqual({ processed: 0, failed: 1, overdueMarked: 0 });
    expect(
      wrongProvider.sqlite
        .prepare('SELECT state,scan_status FROM document WHERE id=?')
        .get(providerDocument.id),
    ).toEqual({ state: 'quarantined', scan_status: 'pending' });
  });

  it('rejects a run whose configured service-actor binding changes after claim', () => {
    const value = fixture();
    const document = quarantinedDocument(value, '0');
    const now = new Date().toISOString();

    expect(
      value.v3.runDueJobs(1, {
        document_scan: (payload, execution) => {
          value.sqlite
            .prepare(
              `INSERT INTO service_actor(
                 id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
               ) SELECT 'replacement-scan-actor',tenant_id,deployment_id,
                        'Replacement scanner','active',capabilities_json,?,?,1
                 FROM service_actor WHERE id='test-b5-service-actor'`,
            )
            .run(now, now);
          value.sqlite
            .prepare(
              `UPDATE deployment_service_actor_binding
               SET service_actor_id='replacement-scan-actor',bound_at=?,bound_by_user_id=?,version=version+1
               WHERE singleton=1`,
            )
            .run(now, value.owner.userId);
          value.v3.recordDocumentScan(
            servicePrincipal(value),
            (payload as { documentId: string }).documentId,
            'clean',
            'test-scanner',
            execution,
          );
        },
      }),
    ).toEqual({ processed: 0, failed: 1, overdueMarked: 0 });
    expect(
      value.sqlite.prepare('SELECT state,scan_status FROM document WHERE id=?').get(document.id),
    ).toEqual({ state: 'quarantined', scan_status: 'pending' });
  });

  it('keeps rejected documents unavailable for download', () => {
    const value = fixture();
    const document = quarantinedDocument(value, 'f');
    expect(
      value.v3.runDueJobs(1, {
        document_scan: (payload, execution) =>
          value.v3.recordDocumentScan(
            servicePrincipal(value),
            (payload as { documentId: string }).documentId,
            'rejected',
            'test-scanner',
            execution,
          ),
      }),
    ).toEqual({ processed: 1, failed: 0, overdueMarked: 0 });
    expect(() => value.v3.authorizeDocument(value.owner, document.id)).toThrow(
      /Document not found/,
    );
    expect(
      value.sqlite.prepare('SELECT state,scan_status FROM document WHERE id=?').get(document.id),
    ).toEqual({ state: 'rejected', scan_status: 'rejected' });
  });
});
