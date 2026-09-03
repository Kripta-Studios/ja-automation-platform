import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@ja/domain';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  vi.unstubAllEnvs();
});

type ProjectCommercialPolicyInput = Readonly<{
  projectId: string;
  effectiveFrom: string;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
  customerSignoffRequired: boolean;
}>;

type ProjectCommercialPolicy = Readonly<{
  id: string;
  projectId: string;
  supersedesPolicyId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
  customerSignoffRequired: boolean;
  createdBy: string;
  version: number;
}>;

type CommercialPolicyRepository = B5LifecycleSecurityFixture['repository'] & {
  createProjectCommercialPolicy(
    principal: B5LifecycleSecurityFixture['owner'],
    input: ProjectCommercialPolicyInput,
  ): ProjectCommercialPolicy;
  listProjectCommercialPolicies(
    principal: B5LifecycleSecurityFixture['owner'],
    projectId: string,
  ): readonly ProjectCommercialPolicy[];
  resolveProjectCommercialPolicy(
    principal: B5LifecycleSecurityFixture['owner'],
    projectId: string,
    onDate: string,
  ): ProjectCommercialPolicy;
};

function fixture(): B5LifecycleSecurityFixture {
  const base = createB5LifecycleSecurityFixture();
  const value = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'commercial-policy-owner'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'commercial-policy-finance-default'),
  };
  fixtures.push(value);
  return value;
}

function withoutSession(principal: Principal): Principal {
  const { sessionId: _sessionId, ...rest } = principal;
  return rest;
}

function repository(value: B5LifecycleSecurityFixture): CommercialPolicyRepository {
  // The contract is intentionally written before its production service exists.
  // Keep the test's expected seam explicit so a missing implementation fails at
  // the named method rather than weakening the contract to direct SQL access.
  return value.repository as CommercialPolicyRepository;
}

function policyInput(
  projectId: string,
  effectiveFrom: string,
  overrides: Partial<Omit<ProjectCommercialPolicyInput, 'projectId' | 'effectiveFrom'>> = {},
): ProjectCommercialPolicyInput {
  return {
    projectId,
    effectiveFrom,
    overtimeEnabled: true,
    overtimeThresholdMinutes: 600,
    travelClientBillable: true,
    customerSignoffRequired: true,
    ...overrides,
  };
}

describe('Client Essential CORE-03/09 project commercial policy contracts', () => {
  it('allows only Finance/Admin and Owner to create, list and resolve project policy', () => {
    const value = fixture();
    const policies = repository(value);
    const input = policyInput(value.project.id, '2026-01-01');

    const createdByOwner = policies.createProjectCommercialPolicy(value.owner, input);
    expect(createdByOwner).toMatchObject({
      projectId: value.project.id,
      effectiveFrom: '2026-01-01',
      version: 1,
      supersedesPolicyId: null,
    });
    expect(
      policies.createProjectCommercialPolicy(value.finance, {
        ...input,
        effectiveFrom: '2026-02-01',
      }),
    ).toMatchObject({
      projectId: value.project.id,
      version: 2,
      supersedesPolicyId: createdByOwner.id,
    });

    for (const principal of [value.manager, value.worker]) {
      expect(() => policies.createProjectCommercialPolicy(principal, input)).toThrow(
        AccessDeniedError,
      );
      expect(() => policies.listProjectCommercialPolicies(principal, value.project.id)).toThrow(
        AccessDeniedError,
      );
      expect(() =>
        policies.resolveProjectCommercialPolicy(principal, value.project.id, '2026-01-15'),
      ).toThrow(AccessDeniedError);
    }

    expect(policies.listProjectCommercialPolicies(value.owner, value.project.id)).toHaveLength(2);
    expect(policies.listProjectCommercialPolicies(value.finance, value.project.id)).toHaveLength(2);
    expect(
      policies.resolveProjectCommercialPolicy(value.owner, value.project.id, '2026-01-15'),
    ).toMatchObject({ id: createdByOwner.id, version: 1 });
    expect(
      policies.resolveProjectCommercialPolicy(value.finance, value.project.id, '2026-02-01'),
    ).toMatchObject({ version: 2, effectiveFrom: '2026-02-01' });

    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'b5-policy-auditor',
        'Policy auditor',
        'policy-auditor@example.test',
        'auditor_read_only',
        'active',
        timestamp,
        timestamp,
      );
    const auditor: Principal = {
      userId: 'b5-policy-auditor',
      role: 'auditor_read_only',
      projectIds: new Set(),
    };
    expect(policies.listProjectCommercialPolicies(auditor, value.project.id)).toHaveLength(2);
    expect(
      policies.resolveProjectCommercialPolicy(auditor, value.project.id, '2026-02-01'),
    ).toMatchObject({ version: 2 });
    expect(() => policies.createProjectCommercialPolicy(auditor, input)).toThrow(AccessDeniedError);
  });

  it('requires a live session before the public write facade mutates policy', () => {
    const value = fixture();
    const policies = repository(value);
    vi.stubEnv('NODE_ENV', 'production');

    expect(() =>
      policies.createProjectCommercialPolicy(
        withoutSession(value.finance),
        policyInput(value.project.id, '2026-01-01'),
      ),
    ).toThrow(/Recent step-up authentication is required/u);
    expect(policies.listProjectCommercialPolicies(value.finance, value.project.id)).toHaveLength(0);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    value.sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'commercial-policy-finance-session',
        'commercial-policy-finance-token',
        value.finance.userId,
        expiresAt,
        now,
        now,
        null,
      );
    const liveFinance: Principal = {
      ...value.finance,
      sessionId: 'commercial-policy-finance-session',
    };
    expect(
      policies.createProjectCommercialPolicy(
        liveFinance,
        policyInput(value.project.id, '2026-01-01'),
      ),
    ).toMatchObject({ version: 1 });

    expect(
      policies.createProjectCommercialPolicy(
        liveFinance,
        policyInput(value.project.id, '2026-02-01'),
      ),
    ).toMatchObject({ version: 2 });
    expect(policies.listProjectCommercialPolicies(value.finance, value.project.id)).toHaveLength(2);
  });

  it('creates a genesis plus strictly ordered successor chain and rejects stale or overlapping dates', () => {
    const value = fixture();
    const policies = repository(value);
    const genesis = policies.createProjectCommercialPolicy(
      value.owner,
      policyInput(value.project.id, '2026-01-01'),
    );
    const successor = policies.createProjectCommercialPolicy(
      value.finance,
      policyInput(value.project.id, '2026-07-01', {
        overtimeThresholdMinutes: 720,
        travelClientBillable: false,
        customerSignoffRequired: false,
      }),
    );

    expect(genesis).toMatchObject({ version: 1, supersedesPolicyId: null });
    expect(successor).toMatchObject({
      version: 2,
      supersedesPolicyId: genesis.id,
      effectiveFrom: '2026-07-01',
      travelClientBillable: false,
      customerSignoffRequired: false,
    });
    expect(
      policies
        .listProjectCommercialPolicies(value.finance, value.project.id)
        .map((row) => row.version),
    ).toEqual([1, 2]);

    expect(() =>
      policies.createProjectCommercialPolicy(
        value.finance,
        policyInput(value.project.id, '2026-06-15'),
      ),
    ).toThrow(ConflictError);
    expect(() =>
      policies.createProjectCommercialPolicy(
        value.finance,
        policyInput(value.project.id, '2026-07-01'),
      ),
    ).toThrow(ConflictError);

    expect(
      policies.resolveProjectCommercialPolicy(value.finance, value.project.id, '2026-06-30'),
    ).toMatchObject({ id: genesis.id, version: 1 });
    expect(
      policies.resolveProjectCommercialPolicy(value.finance, value.project.id, '2026-07-01'),
    ).toMatchObject({ id: successor.id, version: 2 });
  });

  it('keeps overtime threshold semantics configurable for 10/12/14/other hours without fabricating time', () => {
    const value = fixture();
    const policies = repository(value);
    const referenceHours = [10, 12, 14, 15];

    for (const [index, hours] of referenceHours.entries()) {
      const created = policies.createProjectCommercialPolicy(
        value.finance,
        policyInput(value.project.id, `2026-0${index + 1}-01`, {
          overtimeThresholdMinutes: hours * 60,
        }),
      );
      expect(created.overtimeEnabled).toBe(true);
      expect(created.overtimeThresholdMinutes).toBe(hours * 60);
    }

    const resolved = policies.resolveProjectCommercialPolicy(
      value.owner,
      value.project.id,
      '2026-04-01',
    );
    expect(resolved.overtimeThresholdMinutes).toBe(900);
    expect(resolved).not.toHaveProperty('actualMinutes');
    expect(resolved).not.toHaveProperty('workedMinutes');
  });

  it('requires a threshold only when overtime is enabled and preserves an explicit disabled state', () => {
    const value = fixture();
    const policies = repository(value);

    const disabled = policies.createProjectCommercialPolicy(
      value.owner,
      policyInput(value.project.id, '2026-01-01', {
        overtimeEnabled: false,
        overtimeThresholdMinutes: null,
      }),
    );
    expect(disabled).toMatchObject({ overtimeEnabled: false, overtimeThresholdMinutes: null });

    expect(() =>
      policies.createProjectCommercialPolicy(
        value.finance,
        policyInput(value.project.id, '2026-02-01', {
          overtimeEnabled: false,
          overtimeThresholdMinutes: 600,
        }),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      policies.createProjectCommercialPolicy(
        value.finance,
        policyInput(value.project.id, '2026-02-01', {
          overtimeEnabled: true,
          overtimeThresholdMinutes: null,
        }),
      ),
    ).toThrow(ValidationError);
  });
});
