import { describe, expect, it } from 'vitest';
import {
  OperationsEvidenceError,
  operationsEvidenceSha256,
  parseClientEssentialOperationsEvidence,
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

const without = (value: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key));

describe('Client Essential operations evidence', () => {
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

  it('rejects a stale Owner waiver inside a freshly captured evidence envelope', () => {
    const staleWaiver = { ...ownerWaiver, waivedAt: '2026-08-01T00:00:00.000Z' };

    expect(() =>
      parseClientEssentialOperationsEvidence(signedEvidence(staleWaiver), {
        now,
        ...expectedIdentity,
      }),
    ).toThrow(/freshness window/u);
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
    const continuity = {
      status: 'PASS',
      remoteCopy: true,
      encrypted: true,
      restoreDrill: { status: 'PASS', completedAt: '2026-09-04T00:15:00.000Z' },
    };

    const result = parseClientEssentialOperationsEvidence(signedEvidence(continuity), { now });

    expect(result.continuity).toEqual(continuity);
  });
});
