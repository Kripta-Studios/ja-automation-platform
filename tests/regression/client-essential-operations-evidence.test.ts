import { describe, expect, it } from 'vitest';
import {
  CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_MAX_AGE_MS,
  OperationsEvidenceError,
  operationsEvidenceSha256,
  parseClientEssentialOperationsEvidence,
  uatArtifactFile,
} from '../fixtures/client-essential-32-step-fixture.ts';

const now = Date.parse('2026-09-04T00:30:00.000Z');
const expectedIdentity = {
  expectedTenantId: 'tenant-production',
  expectedDeploymentId: 'deployment-production',
};

const signedEvidence = (continuity: Record<string, unknown>) => {
  const value = {
    schema: 'ja.client-essential.operations-evidence.v1',
    schemaVersion: 1,
    evidenceId: 'client-ready-2026-09-04',
    capturedAt: '2026-09-04T00:20:00.000Z',
    tenantId: 'tenant-production',
    deploymentId: 'deployment-production',
    jobs: {
      status: 'PASS',
      manualProcessing: false,
      runs: [
        {
          id: 'automatic-run-1',
          status: 'PASS',
          automatic: true,
          completedAt: '2026-09-04T00:18:00.000Z',
        },
        {
          id: 'automatic-run-2',
          status: 'PASS',
          automatic: true,
          completedAt: '2026-09-04T00:19:00.000Z',
        },
      ],
    },
    continuity,
    sha256: '',
  };
  value.sha256 = operationsEvidenceSha256(value);
  return value;
};

const ownerWaiver = {
  status: 'WAIVED',
  releaseBlocking: false,
  waivedBy: 'owner',
  waivedAt: '2026-09-04T00:00:00.000Z',
  reason: 'Owner accepted separate-host continuity as a post-release improvement.',
  localBackup: { status: 'PASS', completedAt: '2026-09-04T00:10:00.000Z' },
  rollback: { status: 'PASS', verifiedAt: '2026-09-04T00:15:00.000Z' },
};

const restoredContinuity = {
  status: 'PASS',
  remoteCopy: true,
  encrypted: true,
  restoreDrill: { status: 'PASS', completedAt: '2026-09-04T00:15:00.000Z' },
};

const without = (value: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key));

describe('Client Essential operations evidence', () => {
  it('uses byte-distinct fixture PDFs so content-addressed artifact types cannot collide', () => {
    const plc = uatArtifactFile('client-essential-uat-plc-backup.pdf');
    const receipt = uatArtifactFile('client-essential-uat-expense-receipt.pdf');

    expect(plc.buffer.equals(receipt.buffer)).toBe(false);
  });

  it('accepts an explicit Owner waiver only with local backup and rollback evidence', () => {
    const result = parseClientEssentialOperationsEvidence(signedEvidence(ownerWaiver), {
      now,
      ...expectedIdentity,
    });

    expect(result.continuity).toEqual(ownerWaiver);
  });

  it.each([
    ['release-blocking omission', without(ownerWaiver, 'releaseBlocking')],
    ['non-Owner authorization', { ...ownerWaiver, waivedBy: 'operator' }],
    ['missing reason', { ...ownerWaiver, reason: '' }],
    ['missing local backup', without(ownerWaiver, 'localBackup')],
    ['missing rollback', without(ownerWaiver, 'rollback')],
  ])('rejects a continuity waiver with %s', (_label, continuity) => {
    expect(() =>
      parseClientEssentialOperationsEvidence(signedEvidence(continuity), {
        now,
        ...expectedIdentity,
      }),
    ).toThrow(OperationsEvidenceError);
  });

  it('preserves a durable Owner decision date with fresh operational proof', () => {
    const originalWaiver = { ...ownerWaiver, waivedAt: '2026-08-01T00:00:00.000Z' };

    const result = parseClientEssentialOperationsEvidence(signedEvidence(originalWaiver), {
      now,
      ...expectedIdentity,
    });

    expect(result.continuity).toEqual(originalWaiver);
  });

  it.each(['invalid-date', '2026-09-04T00:36:00.000Z', ''])(
    'rejects an invalid or future Owner decision date: %s',
    (waivedAt) => {
      expect(() =>
        parseClientEssentialOperationsEvidence(signedEvidence({ ...ownerWaiver, waivedAt }), {
          now,
          ...expectedIdentity,
        }),
      ).toThrow(OperationsEvidenceError);
    },
  );

  const timestampCases = [
    'capturedAt',
    'first automatic run',
    'second automatic run',
    'local backup',
    'rollback',
    'remote restore drill',
  ] as const;

  function evidenceWithTimestamp(field: (typeof timestampCases)[number], timestamp: string) {
    const evidence = signedEvidence(
      field === 'remote restore drill'
        ? { ...restoredContinuity, restoreDrill: { status: 'PASS', completedAt: timestamp } }
        : {
            ...ownerWaiver,
            ...(field === 'local backup'
              ? { localBackup: { status: 'PASS', completedAt: timestamp } }
              : {}),
            ...(field === 'rollback'
              ? { rollback: { status: 'PASS', verifiedAt: timestamp } }
              : {}),
          },
    );
    if (field === 'capturedAt') evidence.capturedAt = timestamp;
    if (field === 'first automatic run') evidence.jobs.runs[0]!.completedAt = timestamp;
    if (field === 'second automatic run') evidence.jobs.runs[1]!.completedAt = timestamp;
    evidence.sha256 = operationsEvidenceSha256(evidence);
    return evidence;
  }

  it.each(timestampCases)('rejects stale %s even in freshly signed evidence', (field) => {
    const timestamp = new Date(
      now - CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_MAX_AGE_MS - 1,
    ).toISOString();

    expect(() =>
      parseClientEssentialOperationsEvidence(evidenceWithTimestamp(field, timestamp), {
        now,
        ...expectedIdentity,
      }),
    ).toThrow(/freshness window/u);
  });

  it.each(timestampCases)('accepts %s at the freshness boundary', (field) => {
    const timestamp = new Date(now - CLIENT_ESSENTIAL_OPERATIONS_EVIDENCE_MAX_AGE_MS).toISOString();

    expect(() =>
      parseClientEssentialOperationsEvidence(evidenceWithTimestamp(field, timestamp), {
        now,
        ...expectedIdentity,
      }),
    ).not.toThrow();
  });

  it.each(timestampCases)('rejects future %s', (field) => {
    const timestamp = new Date(now + 5 * 60 * 1000 + 1).toISOString();

    expect(() =>
      parseClientEssentialOperationsEvidence(evidenceWithTimestamp(field, timestamp), {
        now,
        ...expectedIdentity,
      }),
    ).toThrow(/non-future timestamp/u);
  });

  it('rejects an expired envelope even when all operations are fresh', () => {
    const evidence = { ...signedEvidence(ownerWaiver), expiresAt: new Date(now - 1).toISOString() };
    evidence.sha256 = operationsEvidenceSha256(evidence);

    expect(() =>
      parseClientEssentialOperationsEvidence(evidence, { now, ...expectedIdentity }),
    ).toThrow(/Evidence has expired/u);
  });

  it('requires externally supplied expected identity for an Owner waiver', () => {
    expect(() =>
      parseClientEssentialOperationsEvidence(signedEvidence(ownerWaiver), { now }),
    ).toThrow(/requires an expected tenant and deployment identity/u);
  });

  it('rejects an Owner waiver for a different deployment', () => {
    expect(() =>
      parseClientEssentialOperationsEvidence(signedEvidence(ownerWaiver), {
        now,
        expectedTenantId: expectedIdentity.expectedTenantId,
        expectedDeploymentId: 'another-deployment',
      }),
    ).toThrow(/does not match the expected deployment/u);
  });

  it('rejects an Owner waiver for a different tenant', () => {
    expect(() =>
      parseClientEssentialOperationsEvidence(signedEvidence(ownerWaiver), {
        now,
        ...expectedIdentity,
        expectedTenantId: 'another-tenant',
      }),
    ).toThrow(/does not match the expected deployment tenant/u);
  });

  it('requires the supplied detached digest to match the evidence', () => {
    const evidence = signedEvidence(ownerWaiver);
    expect(() =>
      parseClientEssentialOperationsEvidence(evidence, {
        now,
        ...expectedIdentity,
        expectedSha256: evidence.sha256,
      }),
    ).not.toThrow();
    expect(() =>
      parseClientEssentialOperationsEvidence(evidence, {
        now,
        ...expectedIdentity,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(/supplied detached SHA-256 digest/u);
  });

  it('rejects evidence mutated after its digest was computed', () => {
    const evidence = signedEvidence(ownerWaiver);
    evidence.jobs.runs[0]!.id = 'mutated-run';

    expect(() =>
      parseClientEssentialOperationsEvidence(evidence, { now, ...expectedIdentity }),
    ).toThrow(/SHA-256 does not match/u);
  });

  it('does not weaken the two-run automatic jobs contract for waived continuity', () => {
    const evidence = signedEvidence(ownerWaiver);
    evidence.jobs.runs = evidence.jobs.runs.slice(0, 1);
    evidence.sha256 = operationsEvidenceSha256(evidence);

    expect(() =>
      parseClientEssentialOperationsEvidence(evidence, { now, ...expectedIdentity }),
    ).toThrow(/at least two automatic successful timer runs/u);
  });

  it('preserves the original separate-host continuity PASS contract', () => {
    const result = parseClientEssentialOperationsEvidence(signedEvidence(restoredContinuity), {
      now,
    });

    expect(result.continuity).toEqual(restoredContinuity);
  });
});
